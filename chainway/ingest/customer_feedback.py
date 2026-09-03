"""把 LINE／Google 表單匯出的 CSV 收進系統。

## 為什麼不能直接讀

那些工具匯出的欄位名稱是**整句題目**，不是代碼：

    "有沒有試穿了、但最後沒買的？"          ← 欄名
    "沒買的原因是？(可複選)"                ← 欄名
    "今天在店裡的感覺 [店員的建議有幫上忙嗎]"  ← Google 表單的矩陣題長這樣

而且題目會被改。行銷改一個字、換一次工具，欄名就變了，
寫死欄名的程式會在某個月默默收到零筆 —— **零筆不會報錯**，
只會讓報表變成空的，而空報表看起來像「這個月沒人填」。

所以對應用比對的：欄名裡出現題目的關鍵詞就算數；選項用中文字面對回代碼，
對不上的原樣保留並列出來。**沒有一筆資料是默默被丟掉的。**

## 對不到貨號的回應要留著

「今天有想找、但沒找到的東西嗎」這一題本來就沒有貨號 ——
而那題正是這份調查最有價值的地方（POS 永遠看不到沒發生的交易）。
按貨號做內連結會把它整個刪掉。所以一律全收，貨號只是其中一欄。
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pandas as pd

# 收進來之後的欄位。順序固定，新欄位一律往後加 ——
# 插在中間會讓既有的 CSV 整排錯位，而錯位的資料看起來還是像資料。
COLUMNS = [
    "response_id", "invoice_no", "store", "purchase_date", "submitted_at",
    "sku", "tried_not_bought", "tried_what", "tried_reasons",
    "looking_for", "looking_text",
    "sv_greet", "sv_advice", "sv_space", "sv_checkout", "service_text",
    "return_intent", "return_text", "after_wear", "source_file",
]

# 欄名 → 我們的欄位。比對用「關鍵詞全部出現」，不是完全相等 ——
# 題目被改字、工具加前後綴，都還對得到。順序有意義：
# 先比對長的、明確的，避免「原因」把兩題都吃掉。
FIELD_HINTS: list[tuple[str, tuple[str, ...]]] = [
    ("invoice_no",       ("發票",)),
    ("store",            ("門市",)),
    ("purchase_date",    ("消費", "日期")),
    ("submitted_at",     ("時間戳記",)),
    ("submitted_at",     ("Timestamp",)),
    ("tried_reasons",    ("沒買", "原因")),
    ("tried_what",       ("哪一件",)),
    ("tried_not_bought", ("試穿",)),
    ("looking_text",     ("是什麼",)),
    ("looking_for",      ("沒找到",)),
    ("sv_greet",         ("招呼",)),
    ("sv_advice",        ("建議",)),
    ("sv_space",         ("試衣間",)),
    ("sv_checkout",      ("結帳",)),
    ("service_text",     ("發生了什麼",)),
    ("return_text",      ("願意說",)),
    ("return_intent",    ("再來",)),
    ("after_wear",       ("穿起來",)),
]


def _norm(s: Any) -> str:
    """比對前先攤平：去空白、去標點、全形轉半形、英文小寫。"""
    import unicodedata

    t = unicodedata.normalize("NFKC", str(s or "")).lower()
    return re.sub(r"[\s\[\]()（）「」：:,，。？?、/]+", "", t)


def map_columns(cols: list[str]) -> tuple[dict[str, str], list[str]]:
    """回傳 (原欄名 → 我們的欄位, 對不到的原欄名)。

    一個目標欄位只收第一個對到的來源欄 —— Google 表單的矩陣題會產生
    好幾個長得很像的欄名，全部收下去會互相覆蓋，而且是後面蓋前面，
    看起來像資料錯亂而不是對應錯誤。
    """
    taken: set[str] = set()
    out: dict[str, str] = {}
    for c in cols:
        n = _norm(c)
        for field, keys in FIELD_HINTS:
            if field in taken:
                continue
            if all(_norm(k) in n for k in keys):
                out[c] = field
                taken.add(field)
                break
    return out, [c for c in cols if c not in out]


def _code_lookup(cfg: dict[str, Any]) -> dict[str, str]:
    """中文選項 → 代碼。工具那端多半只存中文字面。"""
    out: dict[str, str] = {}
    for key in ("tried_not_bought", "looking_for", "return_intent", "after_wear"):
        block = cfg.get(key) or {}
        # 有的題目兩種都有（試穿那題有 options 也有 reasons），兩個都要收
        for group in ("options", "reasons"):
            for o in block.get(group) or []:
                out[_norm(o["zh"])] = o["code"]
    return out


def _to_codes(val: Any, table: dict[str, str]) -> str:
    """一格可能有多個複選答案，工具會用逗號或分號串起來。

    對不回代碼的原樣留著 —— 那多半是題目改過字，把它丟掉等於
    默默少一筆，而少掉的那筆不會有任何跡象。
    """
    # pd.isna 要先擋。空格 str(float('nan')) 會變成字串 "nan"，
    # 那個 "nan" 之後看起來就是一個正常的答案代碼，統計時會被當成一類，
    # 而且不會有任何錯誤 —— 只會多出一個誰也不認得的選項。
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    s = str(val).strip()
    if not s or s.lower() in ("nan", "nat", "none"):
        return ""
    parts = [p.strip() for p in re.split(r"[;,、|]", s) if p.strip()]
    return "|".join(table.get(_norm(p), p) for p in parts)


def read_export(path: str | Path, cfg: dict[str, Any] | None = None
                ) -> tuple[pd.DataFrame, dict[str, Any]]:
    """讀一份匯出檔，回傳 (整理好的資料, 稽核資訊)。"""
    p = Path(path)
    raw = (pd.read_excel(p) if p.suffix.lower() in (".xlsx", ".xls")
           else pd.read_csv(p))
    mapping, unmapped = map_columns(list(raw.columns))
    table = _code_lookup(cfg or {})

    df = raw.rename(columns=mapping)
    for c in COLUMNS:
        if c not in df.columns:
            df[c] = ""
    # 空格一律變成空字串，不要留 NaN —— 存成 CSV 之後 NaN 會寫成字面的
    # "nan"，下次讀回來就是一個看起來很正常、誰也不認得的答案。
    df = df.where(df.notna(), "")
    for c in ("tried_not_bought", "tried_reasons", "looking_for",
              "return_intent", "after_wear"):
        df[c] = df[c].map(lambda v: _to_codes(v, table))
    df["source_file"] = p.name
    if not str(df["response_id"].astype(str).str.strip().str.cat()):
        # 沒有回應編號就用檔名 + 列號補一個。之後要去重、要對回原始檔，
        # 沒有一個穩定的識別碼會很難查。
        df["response_id"] = [f"{p.stem}-{i + 1}" for i in range(len(df))]

    audit = {
        "檔案": p.name,
        "列數": int(len(raw)),
        "對到的欄位": mapping,
        "對不到的欄位": unmapped,
        "有發票號碼": int((df["invoice_no"].astype(str).str.strip() != "").sum()),
    }
    return df[COLUMNS], audit


def feedback_path(cfg=None) -> Path:
    from ..config import get_config

    cfg = cfg or get_config()
    return cfg.path("feedback") / "customer_survey.csv"


def append(df: pd.DataFrame, path: Path) -> tuple[int, int]:
    """併進累積檔，回傳 (新增, 重複略過)。

    用 response_id 去重。同一份匯出檔常常會被匯入兩次
    （行銷每月匯出時範圍抓重疊），不去重的話那幾筆會被算兩遍，
    而重複的意見會讓比例失真 —— 看起來只是數字變大，不像錯誤。
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        old = pd.read_csv(path, dtype=str).fillna("")
        seen = set(old["response_id"].astype(str))
        new = df[~df["response_id"].astype(str).isin(seen)]
        merged = pd.concat([old, new], ignore_index=True)
    else:
        new, merged = df, df
    merged.to_csv(path, index=False, encoding="utf-8-sig")
    return len(new), len(df) - len(new)


def load(cfg=None) -> pd.DataFrame:
    p = feedback_path(cfg)
    if not p.exists():
        return pd.DataFrame(columns=COLUMNS)
    return pd.read_csv(p, dtype=str).fillna("")
