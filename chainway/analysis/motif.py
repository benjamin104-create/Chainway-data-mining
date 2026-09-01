"""圖騰與格紋的「位置・形式・比例」拆解。

reverse_design 回答的是「有沒有熊」這種是非題。設計師實際要下的決定
比那細一級：熊要放哪裡、多大、用繡的還是燙鑽的、格紋要整件做還是只做領子。
這個模組就是把那一級的決定拆出來。

## 資料從哪裡來 —— 這點必須講清楚

位置與形式**不是影像辨識出來的**，是從貴司自己寫的品名裡讀出來的。
品名寫得比想像中精確：「口袋上方熊頭棉T」「熊頭燙鑽肩格布棉T」
「領口格布蝴蝶結五分袖棉T」—— 位置、形式、部位全在裡面。那是設計端
下標時就寫進去的規格，比讓模型去猜圖案在第幾格可靠得多。

代價是覆蓋率：品名沒寫的就抓不到，所以每一組的款數都要一起看。
沒寫位置不代表沒有那個設計，只代表「這一組是有明講的那些款」。

## 分類規則怎麼定的

先掃過全部品名列出真實用詞，再依真實用詞建表 —— 跟 techpack_notes
同一套順序。上一次用猜的（把品類碼 5 推論成工法分類）整個推錯，
所以這裡每一條規則後面都附實際出現過的品名。

## 為什麼用「相對同部位」而不是原始完銷率

外套本來就比棉T好賣。熊多半做在針織與棉T上，格紋多半做在裙與外套上，
直接比完銷率比的是部位不是設計。所以每一款先減掉它所屬部位的全庫平均，
再取平均 —— 得到的是「同樣做外套，這樣處理比一般外套好幾個百分點」。

部位取品類碼末碼，讓格紋線的 51／52／53 還原成 1／2／3，
與同部位的一般款落在同一個基準上。

## 區間

每一組都附 bootstrap 95% 區間。位置與形式切下去款數很快就剩十幾件，
不附區間的話「+21.9pt」看起來會像結論，其實只是 6 件衣服的平均。
區間跨過 0 的，報告裡一律標成「只能當方向」。
"""
from __future__ import annotations

from typing import Any, Mapping, Sequence

import numpy as np
import pandas as pd

# 一組至少要這麼多款才列出來。再少下去，區間會寬到沒有資訊。
MIN_GROUP = 6
BOOTSTRAP = 3000

# 部位：品類碼末碼。格紋線的兩碼（51/52/…）取第二碼，
# 使格紋款與同部位的一般款可比。
BODY_PART = {"1": "梭織上衣", "2": "褲", "3": "棉T", "4": "裙",
             "6": "外套", "7": "洋裝", "9": "針織"}

UPPER = {"梭織上衣", "棉T", "針織", "外套"}
LOWER = {"褲", "裙"}


# ── 熊圖騰 ──────────────────────────────────────────────────────
# 以下每一條後面的品名都是實際存在的款，不是舉例。

BEAR_PATTERN = r"熊"

BEAR_PLACEMENT: dict[str, str] = {
    # 「口袋熊電繡休閒裙」「口袋上方熊頭棉T」「格口袋探頭小熊針織上衣」
    "口袋": r"口袋|貼口袋|袋",
    # 「剪接袖熊繡花針織短袖」「方領小熊長袖棉T」
    "袖": r"袖熊|熊.{0,2}袖|剪接袖",
    # 「連帽內毛裡熊頭織標外套」「ROCK熊格布帽T」「NICE熊帽針織上衣」
    "連帽": r"連帽|帽T|熊帽|格帽",
    # 「領口熊頭寬袖針織上衣」「領撞色熊頭電繡棉T」「荷葉領熊愛心針織上衣」
    "領口": r"領口熊|領.{0,2}熊頭|熊頭.{0,1}領|格領|披領|荷葉領熊|領撞色熊|"
            r"領綁帶小熊|領蕾絲大熊|領荷葉胸",
    # 「熊頭圖案針織披肩上衣」「熊頭燙鑽肩格布棉T」「繡熊斜露肩上衣」
    "肩／披肩": r"肩",
    # 「不對稱小熊繡花棉T」「側邊熊頭長板棉T」「羅紋V領左下趴熊長袖棉T」
    "側邊／不對稱": r"側邊|右邊|左|單邊|不對稱|左下|右下",
    # 「前胸熊繡花圓領長袖」「胸前半顆熊頭針織短袖」「羅紋領胸前電繡熊T恤」
    "胸前": r"胸前|胸口|前胸",
    # 「下擺小熊音符波浪裙」「下擺抓褶小熊棉T」
    "下擺": r"下擺|下版",
    # 「熊頭帶環格腰帶寬褲」「附熊腰包寬褲」
    "腰": r"腰",
}

BEAR_FORM: dict[str, str] = {
    "刺繡（電繡・繡花）": r"刺繡|電繡|繡花|繡熊|熊.{0,2}繡|繡愛心熊|車熊",
    "燙鑽・水鑽・亮片": r"燙鑽|水鑽|亮片|鑽",
    "織標": r"織標|熊標",
    "貼布繡": r"貼布",
    "印花・圖案": r"圖案|印花|圖騰",
    # 「熊頭吊飾活褶短褲」「附熊腰包寬褲」「皮絆小熊頭短裙」「熊頭立體包包寬鬆棉T」
    "立體吊飾（吊掛・腰包・皮絆）": r"吊飾|掛飾|吊小熊|吊掛|熊腰包|立體|皮絆|掛小熊",
    "織紋提織": r"織紋|提織|菱格織",
}

# 比例：品名有明確區分「熊頭」（只有頭）與「小熊」（全身），
# 少數寫「大熊頭」。這是設計端自己下的分級，不是我判讀的。
BEAR_SCALE: dict[str, str] = {
    "熊頭（只有頭）": r"熊頭|熊臉|半顆熊頭",
    "小熊（全身小圖）": r"小熊",
    "大熊・大熊頭": r"大熊",
    "多隻熊": r"3隻|三隻|兩隻",
}

BEAR_COMPANION: dict[str, str] = {
    "配皇冠": r"皇冠",
    "有動作（探頭・趴・抱・打招呼）": r"探頭|趴|抱|打招呼|站姿|背包包|戴圍巾|圍巾|睡覺|賞|吊",
    "配蝴蝶結": r"蝴蝶結|蝶結",
    "配愛心": r"愛心",
    "配文字／字母": r"文字|字母|LUCKY|NICE|ROCK|good|KA|英國",
}


# ── 格紋 ────────────────────────────────────────────────────────
PLAID_PATTERN = r"格"

# 形式是格紋分析裡最關鍵的一刀：整件做、拼一塊、還是只做成配件，
# 三者的結果差到 18 個百分點。品名一律有寫。
PLAID_FORM: dict[str, str] = {
    # 「格紋寬褲」「紅格襯衫」「蝴蝶結全格洋裝」「雙面穿網紗全格長裙」
    "全格（整件格紋布）": (r"全格|格紋寬褲|格百褶|格摺裙|格裙|格襯衫|格紋襯衫|"
                     r"^[^拼配接附]{0,3}格紋(?!領|袖|口袋|腰|肩|蝴蝶|織帶|布拼|拼)"),
    # 「配格布剪接外套」「經典格布拼接短裙」「素面配藍格全開上衣」
    "拼接配格（格布接素面）": r"拼接|配格|接格|拚格|拼格|剪接",
    # 「附格腰帶開岔寬褲」「經典格紋領巾短袖T恤」「附格披肩燙鑽棉T」
    "格紋配件（腰帶・領巾・蝴蝶結・披肩）": r"附格|格腰帶|腰帶格|領巾|領帶|格帶|披肩|格披|飾帶|格標|織帶",
    # 「菱格花紋翻領針織上衣」「黑白千鳥格裙」「棋盤格摺裙」——
    # 這是織出來的花紋，不是格紋布。視覺與工序都是另一件事，要分開。
    "織花格（菱格・千鳥・棋盤）": r"菱格|千鳥|棋盤|織格|格織紋|織紋格|網格",
    "格紋滾邊／包釦": r"滾格|格布滾|包釦|滾邊",
}

PLAID_PLACEMENT: dict[str, str] = {
    "連帽・帽": r"連帽|帽",
    "領（領口・領片・襯衫領・翻領）": r"領",
    "口袋・袋蓋": r"口袋|袋蓋|貼袋|袋接|袋唇|飾袋",
    "袖（袖口・袖拼接）": r"袖",
    "肩・肩帶": r"肩",
    "下擺・裙擺・褲口": r"下擺|裙擺|下版|褲口",
    "門襟・開襟": r"門襟|前襟|開襟|全開|半開|排釦|顆釦",
    "腰・腰頭": r"腰",
}

PLAID_COLOR: dict[str, str] = {
    "紅格": r"紅格",
    "藍格": r"藍格|深藍格|藍白格",
    "紫格": r"紫格",
    "粉格": r"粉格|粉紅格|粉色格",
    "卡其格": r"卡格|卡其格",
    "灰格／黑白格": r"灰格|黑格|黑白|黑小格",
    "經典格（未指定色）": r"經典格|精典格",
}


# ── 計算 ────────────────────────────────────────────────────────
def add_body_part(df: pd.DataFrame, *, code_col: str = "category_code") -> pd.DataFrame:
    """加上「部位」與「半身」。部位取品類碼末碼，格紋線因此與一般款同基準。"""
    out = df.copy()
    out["部位"] = out[code_col].astype(str).str[-1].map(BODY_PART)
    out["半身"] = out["部位"].map(
        lambda p: "上半身" if p in UPPER else ("下半身" if p in LOWER else
                                            ("全身" if isinstance(p, str) else None)))
    return out


def part_baseline(df: pd.DataFrame, metric: str = "sell_through_rate") -> pd.Series:
    """各部位的全庫平均完銷率 —— 後面所有比較的基準線。"""
    return df.groupby("部位")[metric].mean()


def _relative(sub: pd.DataFrame, base: pd.Series, metric: str) -> np.ndarray:
    return (sub[metric] - sub["部位"].map(base)).to_numpy(dtype=float)


def relative_lift(sub: pd.DataFrame, base: pd.Series, *,
                  metric: str = "sell_through_rate",
                  bootstrap: int = BOOTSTRAP,
                  seed: int = 20260901) -> dict[str, float]:
    """這一組相對同部位平均高／低幾個百分點，附 bootstrap 95% 區間。

    重抽的是「款」。一組只有十幾件時，區間會誠實地寬 —— 那正是要看到的。
    """
    v = _relative(sub, base, metric)
    v = v[~np.isnan(v)]
    if len(v) < 2:
        return {"n": len(v), "效果pt": float("nan"), "低pt": float("nan"),
                "高pt": float("nan"), "可用": False}
    rng = np.random.default_rng(seed)
    draws = v[rng.integers(0, len(v), (bootstrap, len(v)))].mean(axis=1) * 100
    lo, hi = (float(x) for x in np.percentile(draws, [2.5, 97.5]))
    return {"n": int(len(v)), "效果pt": round(float(v.mean() * 100), 1),
            "低pt": round(lo, 1), "高pt": round(hi, 1),
            "可用": bool(lo > 0 or hi < 0)}


def breakdown(pool: pd.DataFrame, rules: Mapping[str, str], base: pd.Series, *,
              name_col: str = "product_name", metric: str = "sell_through_rate",
              min_group: int = MIN_GROUP, sku_col: str = "sku") -> pd.DataFrame:
    """把一個母體（熊款／格紋款）依規則切開，每組報效果、區間與上下半身分布。

    分組刻意允許重疊 —— 一件衣服可以同時「熊在口袋」與「用刺繡」，
    強迫單選會丟掉資訊。所以款數加總會超過母體。
    """
    names = pool[name_col].fillna("").astype(str)
    rows: list[dict[str, Any]] = []
    for label, pat in rules.items():
        sub = pool[names.str.contains(pat, regex=True)]
        if len(sub) < min_group:
            continue
        stat = relative_lift(sub, base, metric=metric)
        halves = sub["半身"].value_counts()
        rows.append({
            "分類": label, **stat,
            "完銷率": round(float(sub[metric].mean()), 4),
            "上半身": int(halves.get("上半身", 0)),
            "下半身": int(halves.get("下半身", 0)),
            "全身": int(halves.get("全身", 0)),
            "代表貨號": "、".join(sub.nlargest(2, metric)[sku_col].astype(str))
                    if sku_col in sub.columns else "",
            "代表品名": "、".join(sub.nlargest(2, metric)[name_col].astype(str))[:40],
        })
    out = pd.DataFrame(rows)
    return out.sort_values("效果pt", ascending=False).reset_index(drop=True) if len(out) else out


def breakdown_by_half(pool: pd.DataFrame, rules: Mapping[str, str], base: pd.Series, *,
                      name_col: str = "product_name",
                      metric: str = "sell_through_rate",
                      min_group: int = 5) -> pd.DataFrame:
    """同一套規則，再拆上半身／下半身。

    同一個設計放在上衣和放在裙子上不是同一回事 —— 熊在口袋這件事，
    做在下半身比做在上半身好一倍以上。不拆開就看不到。
    """
    names = pool[name_col].fillna("").astype(str)
    rows: list[dict[str, Any]] = []
    for label, pat in rules.items():
        m = names.str.contains(pat, regex=True)
        for half in ("上半身", "下半身", "全身"):
            sub = pool[m & (pool["半身"] == half)]
            if len(sub) < min_group:
                continue
            rows.append({"分類": label, "半身": half,
                         **relative_lift(sub, base, metric=metric),
                         "完銷率": round(float(sub[metric].mean()), 4)})
    out = pd.DataFrame(rows)
    return out.sort_values("效果pt", ascending=False).reset_index(drop=True) if len(out) else out


def stratified_bootstrap(df: pd.DataFrame, mask: Sequence[bool], *,
                         metric: str = "sell_through_rate",
                         strata: Sequence[str] = ("部位", "season_term_code"),
                         min_per_cell: int = 6, bootstrap: int = 2000,
                         seed: int = 20260901) -> dict[str, float]:
    """分層提升度的 bootstrap 區間 —— 回答「款數這麼少，這個數字撐得住嗎」。

    stratified_lift 給的是點估計。當一個特徵只有幾十款、每層八到十四件時，
    點估計看起來很漂亮但可能只是一兩件爆款撐起來的。重抽整份資料兩千次，
    看那個數字有多少次還站在同一邊，比任何主觀判斷可靠。

    做法上用 bincount 一次算完所有分層，避免每次重抽都 groupby ——
    兩千次 groupby 在幾千列上要跑好幾分鐘，bincount 只要幾秒。
    """
    d = df[[metric] + [s for s in strata if s in df.columns]].copy()
    d["x"] = np.asarray(mask, dtype=bool)
    d = d[d[metric].notna()].reset_index(drop=True)
    cell = d[[s for s in strata if s in d.columns]].astype(str).agg("|".join, axis=1)
    codes, _ = pd.factorize(cell)
    K = int(codes.max()) + 1
    x = d["x"].to_numpy()
    y = d[metric].to_numpy(dtype=float)

    def pooled(idx: np.ndarray) -> float:
        key = codes[idx] * 2 + x[idx]
        cnt = np.bincount(key, minlength=K * 2).reshape(K, 2)
        s = np.bincount(key, weights=y[idx], minlength=K * 2).reshape(K, 2)
        ok = (cnt[:, 0] >= min_per_cell) & (cnt[:, 1] >= min_per_cell)
        if not ok.any():
            return float("nan")
        diff = s[ok, 1] / cnt[ok, 1] - s[ok, 0] / cnt[ok, 0]
        w = cnt[ok, 1].astype(float)
        return float((diff * w).sum() / w.sum())

    n = len(d)
    point = pooled(np.arange(n))
    rng = np.random.default_rng(seed)
    draws = np.array([pooled(rng.integers(0, n, n)) for _ in range(bootstrap)])
    draws = draws[~np.isnan(draws)]
    if not len(draws):
        return {"效果pt": round(point * 100, 1), "低pt": float("nan"),
                "高pt": float("nan"), "翻向比例": float("nan"), "n": int(x.sum())}
    lo, hi = np.percentile(draws, [2.5, 97.5])
    flip = float((np.sign(draws) != np.sign(point)).mean())
    return {"效果pt": round(point * 100, 1), "低pt": round(float(lo) * 100, 1),
            "高pt": round(float(hi) * 100, 1), "翻向比例": round(flip, 3),
            "n": int(x.sum()), "重抽次數": int(len(draws))}


def motif_tables(df: pd.DataFrame, *, metric: str = "sell_through_rate",
                 name_col: str = "product_name") -> dict[str, pd.DataFrame]:
    """一次算完熊與格紋的全套拆解。回傳表名 → 表。"""
    d = add_body_part(df)
    d = d[d["部位"].notna() & d[metric].notna()].copy()
    base = part_baseline(d, metric)
    names = d[name_col].fillna("").astype(str)
    bear = d[names.str.contains(BEAR_PATTERN)]
    plaid = d[names.str.contains(PLAID_PATTERN)]

    kw = {"base": base, "name_col": name_col, "metric": metric}
    return {
        "部位基準": base.rename("完銷率").reset_index(),
        "熊_位置": breakdown(bear, BEAR_PLACEMENT, **kw),
        "熊_形式": breakdown(bear, BEAR_FORM, **kw),
        "熊_比例": breakdown(bear, BEAR_SCALE, **kw),
        "熊_搭配": breakdown(bear, BEAR_COMPANION, **kw),
        "熊_位置x半身": breakdown_by_half(bear, BEAR_PLACEMENT, base,
                                      name_col=name_col, metric=metric),
        "格紋_形式": breakdown(plaid, PLAID_FORM, **kw),
        "格紋_位置": breakdown(plaid, PLAID_PLACEMENT, **kw),
        "格紋_配色": breakdown(plaid, PLAID_COLOR, **kw),
        "格紋_形式x半身": breakdown_by_half(plaid, PLAID_FORM, base,
                                       name_col=name_col, metric=metric),
    }
