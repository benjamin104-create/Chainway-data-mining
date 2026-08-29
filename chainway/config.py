"""設定載入：把 config/*.yaml 讀成一個可用的物件，並解析所有路徑。

設計原則：全專案只有這裡知道檔案放在哪。其他模組一律透過 `get_config()` 取用，
所以進公司後改 config/settings.yaml 的 paths 就能整套接上公司資料夾。
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = REPO_ROOT / "config"


def _read_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"找不到設定檔：{path}")
    with path.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def _resolve(raw: str | os.PathLike[str]) -> Path:
    """相對路徑相對於 repo root；絕對路徑（含 UNC \\\\NAS\\...）原樣使用。"""
    p = Path(str(raw)).expanduser()
    return p if p.is_absolute() else (REPO_ROOT / p)


@dataclass
class Config:
    settings: dict[str, Any]
    taxonomy: dict[str, Any]
    feedback_tags: dict[str, Any]
    paths: dict[str, Path] = field(default_factory=dict)

    # -- 便利存取 ------------------------------------------------
    def __getitem__(self, key: str) -> Any:
        return self.settings[key]

    def get(self, key: str, default: Any = None) -> Any:
        return self.settings.get(key, default)

    def path(self, key: str) -> Path:
        if key not in self.paths:
            raise KeyError(f"settings.yaml 的 paths 沒有定義 '{key}'")
        return self.paths[key]

    def ensure_dirs(self) -> None:
        """輸出用目錄不存在就建立（輸入目錄不建，避免掩蓋路徑填錯的問題）。"""
        for key in ("interim", "processed", "outputs", "feedback"):
            if key in self.paths:
                self.paths[key].mkdir(parents=True, exist_ok=True)

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


@lru_cache(maxsize=1)
def get_config(config_dir: str | None = None) -> Config:
    cdir = Path(config_dir) if config_dir else CONFIG_DIR
    settings = _read_yaml(cdir / "settings.yaml")
    taxonomy = _read_yaml(cdir / "taxonomy.yaml")
    feedback_tags = _read_yaml(cdir / "feedback_tags.yaml")

    paths = {k: _resolve(v) for k, v in (settings.get("paths") or {}).items()}
    cfg = Config(settings=settings, taxonomy=taxonomy, feedback_tags=feedback_tags, paths=paths)
    cfg.ensure_dirs()
    return cfg
