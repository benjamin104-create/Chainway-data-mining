"""設定載入：把 config/*.yaml 讀成一個可用的物件，並解析所有路徑。

設計原則：全專案只有這裡知道檔案放在哪。其他模組一律透過 `get_config()` 取用，
所以進公司後改 config/settings.yaml 的 paths 就能整套接上公司資料夾。
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path, PureWindowsPath
from typing import Any

import pandas as pd
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = REPO_ROOT / "config"

# Windows 磁碟機路徑（C:\... 或 C:/...）與 UNC 網路路徑（\\NAS\... 或 //NAS/...）
_WIN_DRIVE_RE = re.compile(r"^[A-Za-z]:[\\/]")
_UNC_RE = re.compile(r"^[\\/]{2}[^\\/]")


def _read_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"找不到設定檔：{path}")
    with path.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def is_absolute_path(raw: str | os.PathLike[str]) -> bool:
    """跨平台判斷是否為絕對路徑。

    不能只用 `Path(x).is_absolute()`：在 Linux/macOS 上跑時，
    `Path("C:/Users/...").is_absolute()` 會回傳 False，導致 Windows 路徑
    被誤當成相對路徑接到 repo 底下。這在 CI、或設定檔被跨平台檢視時會踩到。
    """
    s = str(raw)
    return bool(_WIN_DRIVE_RE.match(s) or _UNC_RE.match(s)) or Path(s).is_absolute()


def _is_foreign_windows_path(p: Path) -> bool:
    """這是 Windows 磁碟機路徑，但目前不是在 Windows 上跑。

    Linux/macOS 無法把 "C:/Users/..." 表示成絕對路徑，直接拿去 mkdir 會在
    工作目錄底下生出一個名為 "C:" 的相對目錄，資料靜靜地寫到錯的地方。
    這種錯不會報例外，只會讓人以為程式跑過了。
    """
    return os.name != "nt" and bool(_WIN_DRIVE_RE.match(str(p)))


def _resolve(raw: str | os.PathLike[str], base: Path | None = None) -> Path:
    """把設定檔裡的一個路徑字串解析成 Path。

    絕對路徑（含 Windows 磁碟機與 UNC）原樣使用；
    相對路徑優先接在 `base`（paths.root）底下，沒有 root 時接在 repo 根目錄。
    """
    s = str(raw).strip()
    if is_absolute_path(s):
        # 反斜線在非 Windows 平台不是分隔符，先正規化再交給 Path，
        # 這樣同一份設定檔在 Windows 與 Linux 上解析結果一致。
        return Path(PureWindowsPath(s).as_posix() if "\\" in s else s).expanduser()
    p = Path(s).expanduser()
    return (base / p) if base is not None else (REPO_ROOT / p)


@dataclass
class Config:
    settings: dict[str, Any]
    taxonomy: dict[str, Any]
    feedback_tags: dict[str, Any]
    paths: dict[str, Path] = field(default_factory=dict)
    path_lists: dict[str, list[Path]] = field(default_factory=dict)

    # -- 便利存取 ------------------------------------------------
    def __getitem__(self, key: str) -> Any:
        return self.settings[key]

    def get(self, key: str, default: Any = None) -> Any:
        return self.settings.get(key, default)

    def path(self, key: str) -> Path:
        """該來源的主要資料夾（設定成多個時取第一個）。

        寫入用途（例如網頁上傳的市調圖）一律用這個，才不會不知道要寫進哪一個。
        """
        if key not in self.paths:
            raise KeyError(f"settings.yaml 的 paths 沒有定義 '{key}'")
        return self.paths[key]

    def path_list(self, key: str) -> list[Path]:
        """該來源的所有資料夾。

        一種資料散在多個資料夾是常態（例如市調圖同時放在「新格紋」和
        「02_行銷」底下），所以 settings.yaml 的每個來源都可以填成清單。
        讀取用途一律用這個，使用者才不必為了配合程式去搬檔案。
        """
        if key in self.path_lists:
            return self.path_lists[key]
        return [self.paths[key]] if key in self.paths else []

    def ensure_dirs(self) -> None:
        """輸出用目錄不存在就建立。

        輸入目錄刻意不自動建立 —— 路徑打錯時應該要報錯，
        而不是默默在錯的地方生出一個空資料夾讓人以為設定對了。
        """
        for key in OUTPUT_PATH_KEYS:
            if key in self.paths:
                p = self.paths[key]
                if _is_foreign_windows_path(p):
                    continue
                p.mkdir(parents=True, exist_ok=True)

    def platform_warnings(self) -> list[str]:
        """設定的路徑與目前作業系統不相容時的警告。"""
        out = []
        for key, p in self.paths.items():
            if _is_foreign_windows_path(p):
                out.append(
                    f"paths.{key} 是 Windows 磁碟機路徑（{p}），但目前不是在 Windows 上執行。"
                    "\n  這個路徑在此系統會被當成相對路徑，資料讀不到、產出也會落在錯的地方。"
                    "\n  若你是在 WSL 或 Mac 上跑，請改用該系統看得到的路徑"
                    "（WSL 為 /mnt/c/...）。")
                break
        return out

    @property
    def root(self) -> Path | None:
        """使用者的原始資料根目錄（settings.yaml 的 paths.root），沒設定則為 None。"""
        return self.paths.get("root")

    def describe_paths(self) -> list[dict[str, Any]]:
        """列出每個路徑的解析結果與存在狀態，供 doctor 與錯誤訊息使用。

        一個來源設定成多個資料夾時，每個資料夾各佔一列。
        """
        out: list[dict[str, Any]] = []
        for key in SOURCE_KEY_ORDER + sorted(OUTPUT_PATH_KEYS):
            if key not in self.paths:
                continue
            for p in self.path_list(key):
                exists = p.exists()
                n_files = sum(1 for f in p.rglob("*") if f.is_file()) if exists else 0
                out.append({
                    "key": key,
                    "kind": "來源" if key in SOURCE_PATH_KEYS else "產出",
                    "path": p,
                    "exists": exists,
                    "n_files": n_files,
                })
        return out

    # -- taxonomy 展開 -------------------------------------------
    def attributes_for(self, category: str) -> list[str]:
        cats = self.taxonomy.get("categories", {})
        entry = cats.get(category)
        if not entry:
            return []
        return list(entry.get("attributes", []))

    def attribute_options(self, attribute: str) -> list[dict[str, str]]:
        attrs = self.taxonomy.get("attributes", {})
        return list(attrs.get(attribute, {}).get("options", []))

    def attribute_label(self, attribute: str) -> str:
        return self.taxonomy.get("attributes", {}).get(attribute, {}).get("name_zh", attribute)

    def option_label(self, attribute: str, code: str) -> str:
        for opt in self.attribute_options(attribute):
            if opt["code"] == code:
                return opt.get("zh", code)
        return code

    def category_label(self, category: str) -> str:
        return self.taxonomy.get("categories", {}).get(category, {}).get("name_zh", category)

    @property
    def category_codes(self) -> list[str]:
        return list(self.taxonomy.get("categories", {}).keys())

    # -- KA 季號 --------------------------------------------------
    def season_terms(self) -> dict[str, dict[str, Any]]:
        """季別碼 → {name, sleeve, group, order}。7=早春長袖／8=夏短袖／
        5=秋短袖／6=冬長袖（貴司提供，可在 settings.yaml 調整）。"""
        return {str(k): v for k, v in (self.settings.get("season_terms") or {}).items()}

    def season_from_code(self, code: str) -> dict[str, Any] | None:
        """KA 季號 → 該季的完整標示。查無此碼回傳 None。

        例：KA135 → {'year': 2024, 'term': '秋', 'term_code': '5',
                     'sleeve': '短袖', 'group': 'AW', 'order': 3,
                     'label': '2024秋', 'full_label': '2024秋（KA135・5・短袖）'}

        季名與袖長一律由末碼查 season_terms，seasons 表裡的 term 只是
        給人看的備援 —— 兩邊若不一致，以 season_terms 為準，才不會出現
        同一個碼在不同表裡叫不同名字。
        """
        code = str(code).upper()
        entry = (self.settings.get("seasons") or {}).get(code)
        if not entry:
            return None
        term_code = code[-1]
        t = self.season_terms().get(term_code, {})
        term = t.get("name") or entry.get("term", "")
        out = {**entry, "code": code, "term": term, "term_code": term_code,
               "sleeve": t.get("sleeve"), "order": t.get("order", 9),
               "group": t.get("group", entry.get("group")),
               "label": f"{entry['year']}{term}"}
        bits = "・".join(x for x in (code, term_code, t.get("sleeve")) if x)
        out["full_label"] = f"{out['label']}（{bits}）"
        return out

    def find_season_code(self, text: str) -> str | None:
        """從路徑或檔名裡找出 KA 季號，且只認得對照表裡有的碼。

        不做「看到 KA + 三位數就當季號」的寬鬆比對 —— 貨號本身也含 KA，
        誤判會讓一堆商品被貼上不存在的季別。
        """
        import re as _re
        pattern = self.get("sku", {}).get("season_code_pattern", r"KA(\d{3})")
        table = self.settings.get("seasons") or {}
        for m in _re.finditer(pattern, str(text), _re.IGNORECASE):
            code = f"KA{m.group(1)}"
            if code in table:
                return code
        return None

    # -- 貨號解析 -------------------------------------------------
    def category_from_sku(self, sku: str, product_name: str = "") -> dict[str, Any]:
        """由貨號的品類碼判斷品類。

        貨號的品類碼是變動長度的：
            KA155 + 53 + 01   經典格紋線 → 兩碼品類（53=格紋T）+ 兩碼流水
            KA158 + 3  + 008  一般線     → 一碼品類（3=棉T）  + 三碼流水

        回傳 category / sub_category / product_line / is_gift / source。
        判不出來時 category 為 None，由呼叫端決定要不要用品名補。
        """
        import re as _re

        rules = self.get("sku", {})
        idx = rules.get("category_digit_index")
        base = {"category": None, "sub_category": None, "category_code": None,
                "product_line": "一般", "is_gift": False, "source": "未知"}
        if idx is None or not isinstance(sku, str) or len(sku) <= idx:
            return base

        d1 = sku[idx]
        plaid_prefix = rules.get("plaid_prefix", "5")

        # 經典格紋線：品類碼佔兩碼，第二碼才是身體部位
        if d1 == plaid_prefix and len(sku) > idx + 1:
            d2 = sku[idx + 1]
            entry = (rules.get("plaid_category_map") or {}).get(d2)
            if entry:
                return {**base, "category": entry["category"], "sub_category": entry.get("sub"),
                        "category_code": d1 + d2,
                        "product_line": rules.get("plaid_line_label", "經典格紋"),
                        "source": "SKU"}

        entry = (rules.get("category_map") or {}).get(d1)
        if entry and entry.get("category"):
            return {**base, "category": entry["category"], "sub_category": entry.get("sub"),
                    "category_code": d1,
                    "is_gift": bool(entry.get("exclude_from_performance")),
                    "source": "SKU"}

        # 品類碼認不得時退回品名關鍵字
        for rule in rules.get("name_category_rules") or []:
            if product_name and _re.search(rule["pattern"], str(product_name)):
                return {**base, "category": rule["category"], "sub_category": rule.get("sub"),
                        "category_code": d1, "source": "品名"}

        return {**base, "category_code": d1,
                "sub_category": entry.get("sub") if entry else None}

    def normalize_designer(self, raw: str) -> str:
        """把「E049 徐嘉欣」「e049 徐嘉欣」「M044 陳潔如」收斂成同一個人名。

        原始資料同一位設計師有多組代號且大小寫不一，不正規化會在分析裡
        被拆成好幾個人，設計師績效比較就完全失真。
        """
        import re as _re

        # 不能寫 `raw or ""`：pd.NA 的布林運算會直接拋 TypeError
        if raw is None or raw is pd.NA or (isinstance(raw, float) and raw != raw):
            return ""
        s = str(raw).strip()
        if not s or s.lower() in ("nan", "none", "<na>"):
            return ""
        aliases = self.get("sku", {}).get("designer_aliases") or {}
        m = _re.match(r"^([A-Za-z]{1,3}\d{2,3})\s*(.*)$", s)
        if m:
            code, name = m.group(1).upper(), m.group(2).strip()
            return aliases.get(code) or name or code
        return s

    # -- 回饋標籤 -------------------------------------------------
    def reason_tag_label(self, code: str) -> str:
        for group in self.feedback_tags.get("reason_tags", {}).values():
            for tag in group.get("tags", []):
                if tag["code"] == code:
                    return tag["zh"]
        return code

    def reason_tag_group(self, code: str) -> str:
        for gname, group in self.feedback_tags.get("reason_tags", {}).items():
            for tag in group.get("tags", []):
                if tag["code"] == code:
                    return gname
        return "UNKNOWN"

    def all_reason_tags(self) -> list[dict[str, str]]:
        out: list[dict[str, str]] = []
        for gname, group in self.feedback_tags.get("reason_tags", {}).items():
            for tag in group.get("tags", []):
                out.append({**tag, "group": gname, "group_zh": group.get("name_zh", gname)})
        return out


# 這幾個是「公司原始資料」，相對路徑會接在 paths.root 底下。
SOURCE_KEY_ORDER = ["system_images", "tech_packs", "pos", "market_research", "knowledge"]
SOURCE_PATH_KEYS = frozenset(SOURCE_KEY_ORDER)
# 其餘（中繼檔、產出、回饋表）一律留在專案內，不去汙染使用者的原始資料夾。
OUTPUT_PATH_KEYS = frozenset({"interim", "processed", "outputs", "feedback"})


@lru_cache(maxsize=1)
def get_config(config_dir: str | None = None) -> Config:
    cdir = Path(config_dir) if config_dir else CONFIG_DIR
    settings = _read_yaml(cdir / "settings.yaml")
    taxonomy = _read_yaml(cdir / "taxonomy.yaml")
    feedback_tags = _read_yaml(cdir / "feedback_tags.yaml")

    raw_paths = dict(settings.get("paths") or {})
    raw_root = raw_paths.pop("root", None)
    root = _resolve(raw_root) if raw_root else None

    paths: dict[str, Path] = {}
    path_lists: dict[str, list[Path]] = {}
    for key, value in raw_paths.items():
        if value is None:
            continue
        base = root if (key in SOURCE_PATH_KEYS and root is not None) else None
        # 每個來源都接受「單一字串」或「字串清單」兩種寫法
        items = value if isinstance(value, (list, tuple)) else [value]
        resolved = [_resolve(v, base) for v in items if str(v).strip()]
        if not resolved:
            continue
        path_lists[key] = resolved
        paths[key] = resolved[0]
    if root is not None:
        paths["root"] = root
        path_lists["root"] = [root]

    cfg = Config(settings=settings, taxonomy=taxonomy, feedback_tags=feedback_tags,
                 paths=paths, path_lists=path_lists)
    cfg.ensure_dirs()
    return cfg
