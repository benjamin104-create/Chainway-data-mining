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
                self.paths[key].mkdir(parents=True, exist_ok=True)

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
