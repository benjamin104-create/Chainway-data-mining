"""重複款偵測：這一季要開的，是不是三年前做過了。

## 重複本身不是錯的

一份只會說「這 200 款很像」的報表沒有用 —— 常青款本來就該重複，
那是刻意的延續（貴司的行動詞彙裡就有「列為常青款，下季延續」）。
把延續跟誤區混在一起報，設計師第一次看就會知道這份表不懂他們在做什麼。

所以這裡不報「重複」，報**三種不同的重複**：

    同季自己打自己   同一季裡兩款特徵一樣 —— 兩款分掉同一批客人的預算
    重複而且愈來愈差 跨季重複，售罄率一季比一季低 —— 早就該停了
    重複而且一直好   跨季重複，售罄率一直高 —— 這是對的，繼續做

前兩種是警告，第三種是確認。第三種一定要印出來，否則這份表看起來
就只是在挑毛病，而挑毛病的表不會有人第二次打開。

## 怎麼判斷「一樣」

用品名裡的特徵詞組成指紋，不用整串品名。「口袋一隻熊短褲裙」與
「一隻熊口袋短褲裙」是同一件事，但字串比對說它們不同。

指紋 = 品類 + 排序後的特徵詞集合。

### 詞彙是從資料學的，不是我寫的

第一版用手寫的特徵詞清單。拿 144 個真實品名一驗就知道不行：

    覆蓋率中位數只有 40%，而且有 7 個品名一個詞都抓不到 ——
    假門襟假兩件棉T、小香風蛋糕裙、愛心兔子領口剪接、貼袋緄邊長褲

問題不在清單寫得不夠長，在於**我不知道這個品牌怎麼命名**。我的清單是
繞著熊寫的，於是兔子、愛心、假兩件、小香風、連袖、貼袋、緄邊全部漏掉。
繼續補只是一直追著自己的無知跑。

改成從所有品名裡自己找：統計 2–5 字的連續片段，出現夠多次的就是這個品牌
真正在用的詞。同樣 144 個品名，覆蓋率中位數 40% → 70%，抓不到詞的從
7 個掉到 3 個，而且自動學到「假兩件」「愛心」「連袖」「格布」「拼接」。

碎片要丟掉：如果「袖」幾乎總是出現在「連袖」裡面，它就不是一個獨立的詞。
判斷方式是看較長的那個詞的次數有沒有接近它 —— 接近就代表它只是碎片。

不做中文斷詞。斷詞器在服飾品名上錯得很兇（「短褲裙」會被切成「短褲」＋
「裙」，一條褲裙變成兩個特徵），而且錯在哪裡看不出來。

### 覆蓋率不夠就不敢說它是重複

實測抓到一組假重複：

    圓領片透膚剪接棉T   vs   圓領前片格布拼接棉T

只因為兩者都有「圓領」就被判成同一款。所以再加一道：品名裡被認出來的字
佔不到一定比例時，這個指紋不可靠，那一款不進重複比對，另外列出來。
寧可漏報，也不要讓人打開報表第一眼就看到一組明顯不一樣的東西 ——
那會讓整份報表失去信任。

## 這份分析看不到的事

同一個指紋不代表衣服長得一樣：版型、布料、配色都不在品名裡。
所以輸出一律附上兩件的貨號與品名，讓人自己看圖確認 ——
這份表的工作是**把該比對的兩件放到一起**，不是替人做決定。
"""
from __future__ import annotations

import re
from typing import Any, Iterable

import pandas as pd

# 種子詞：一定要認得的，即使它在資料裡出現次數不多。
# 這三個系列是這套分析的主軸，漏掉任何一個整份報表就沒有意義。
SEED: list[str] = ["熊", "小熊", "格紋", "牛仔", "丹寧"]

# 學詞的參數
MIN_FREQ = 3        # 出現這麼多次才算是一個詞
MIN_LEN, MAX_LEN = 2, 5
FRAGMENT_RATIO = 0.8   # 較長的詞次數達到這個比例，短的就只是碎片

# 指紋可信的最低覆蓋率：品名裡至少要有這麼多字被認出來
MIN_COVERAGE = 0.45

# 少於這麼多品名就不學詞，退回手寫清單。這個數字是量出來的不是猜的 ——
# 拿真實品名抽樣，比較「用 n 筆學出來的詞彙」與「手寫清單」在**全部**品名上
# 的覆蓋率（用全部評分才不會因為學詞自己貼合自己而虛高）：
#
#     樣本 20 筆   學詞 27%   手寫 40%   ← 學詞還輸
#     樣本 40 筆   學詞 45%   手寫 40%   ← 打平附近
#     樣本 60 筆   學詞 51%   手寫 40%   ← 穩定贏
#     樣本 144 筆  學詞 70%   手寫 40%
#
# 交叉點在 40 附近，取 60 留一點餘裕。第一版我寫 200，那是憑感覺猜的，
# 結果是實際會用到的資料量（單季 100 多款）全部走回那份我已經證明不好用的
# 手寫清單。
MIN_LEARN_SAMPLE = 60

# 舊的手寫清單。保留當種子的補充 —— 學詞需要樣本，
# 樣本少的時候（例如只跑單一季）這份清單還撐得住。
FALLBACK_FEATURES: list[str] = [
    # 圖案主題
    "熊", "小熊", "泰迪", "格紋", "千鳥", "條紋", "點點", "圓點", "花卉", "碎花",
    "刺繡", "電繡", "貼布", "印花", "燙鑽", "亮片", "緹花", "提花", "蕾絲",
    "字母", "LOGO", "標語",
    # 材質工藝
    "牛仔", "丹寧", "針織", "毛衣", "羅紋", "雪紡", "網紗", "皮革", "麂皮",
    "刷毛", "鋪棉", "羽絨", "亞麻", "純棉", "緞面", "燈芯絨",
    # 結構細節
    "口袋", "拉鍊", "排釦", "綁帶", "抽繩", "蝴蝶結", "荷葉", "百褶", "打褶",
    "開衩", "抽皺", "縮口", "翻領", "立領", "帽", "連帽", "斗篷", "披肩",
    "露肩", "削肩", "一字領", "V領", "圓領", "高領", "polo", "襯衫領",
    # 版型
    "寬鬆", "合身", "修身", "傘狀", "A字", "直筒", "窄版", "落肩", "長版", "短版",
    "高腰", "低腰", "五分", "七分", "九分", "及膝", "長裙", "短裙", "褲裙",
]


def learn_vocabulary(names: Iterable[str], *, min_freq: int = MIN_FREQ,
                     lo: int = MIN_LEN, hi: int = MAX_LEN) -> dict[str, int]:
    """從品名自己找出這個品牌在用的詞。回傳 {詞: 出現次數}。"""
    from collections import Counter

    cnt: Counter[str] = Counter()
    for n in names:
        s = re.sub(r"[\s\d]+", "", str(n or ""))
        for L in range(lo, hi + 1):
            for i in range(len(s) - L + 1):
                cnt[s[i:i + L]] += 1
    keep = {w: c for w, c in cnt.items() if c >= min_freq}

    # 丟碎片：長詞優先，短詞若幾乎總是出現在某個長詞裡就不算獨立的詞
    out: dict[str, int] = {}
    for w, c in sorted(keep.items(), key=lambda kv: (-len(kv[0]), -kv[1])):
        longer = [lw for lw in out if w in lw and lw != w]
        if longer and max(keep[lw] for lw in longer) >= c * FRAGMENT_RATIO:
            continue
        out[w] = c
    for s in SEED:
        out.setdefault(s, 0)
    return out


def _compile(vocab: Iterable[str]) -> re.Pattern:
    """長詞優先比對 —— 不然「領」會先把「一字領」吃掉。"""
    words = sorted({w for w in vocab if w}, key=len, reverse=True)
    return re.compile("|".join(re.escape(w) for w in words)) if words \
        else re.compile(r"(?!)")


_FEAT_RE = _compile(FALLBACK_FEATURES)

# 售罄率要差這麼多才算「愈來愈差」／「一直好」
DECLINE = 0.10
GOOD = 0.60
# 一組至少要有幾款才拿出來講
MIN_GROUP = 2


def features_of(name: str, rx: re.Pattern | None = None) -> list[str]:
    """從品名抽出特徵詞。長的詞優先比對 —— 不然「一字領」會先被「領」吃掉。"""
    if not isinstance(name, str):
        return []
    found: list[str] = []
    for m in (rx or _FEAT_RE).finditer(name):
        w = m.group(0)
        if w not in found:
            found.append(w)
    return sorted(found)


def coverage_of(name: str, feats: list[str]) -> float:
    """品名裡有多少字被認出來。指紋可不可信就看這個。"""
    s = re.sub(r"[\s\d]+", "", str(name or ""))
    return sum(len(w) for w in feats) / max(len(s), 1)


def residual_of(name: str, feats: list[str]) -> str:
    """品名裡沒被認出來的字，排序後回傳。

    這是第二道把關，補覆蓋率補不到的洞。實測：

        連帽卡格外套     特徵 連帽+外套   覆蓋 67%   沒認出來：卡格
        麂皮連帽可拆外套  特徵 連帽+外套   覆蓋 50%   沒認出來：麂皮可拆

    兩者指紋一模一樣，覆蓋率也都過關，但一件是格紋一件是麂皮 —— 它們不是
    同一款。「卡格」「麂皮」在這批資料裡各只出現兩次，低於學詞門檻，於是
    整個消失。覆蓋率只能說「這個品名我看懂了多少」，不能說「我有沒有看懂
    讓它與眾不同的那部分」，而重複偵測要的正是後者。

    沒認出來的字就是還沒被解釋掉的差異，所以把它留著一起比。
    """
    s = re.sub(r"[\s\d]+", "", str(name or ""))
    for w in sorted(feats, key=len, reverse=True):
        s = s.replace(w, "", 1)
    return "".join(sorted(s))


def _residual_ok(a: str, b: str) -> bool:
    """兩款的殘字相容嗎 —— 其中一邊是另一邊的子集就算相容。

        腰間 / 腰 / （無）   互為子集 → 同一款的不同寫法，留在一組
        卡格 / 麂皮可拆      各有各的字 → 不同款，拆開

    用子集而不是相等，是因為同一款跨季常常被改名改長改短
    （連帽腰間抽繩外套 → 連帽腰抽繩外套 → 連帽抽繩外套），
    那是同一件衣服，不該因為少寫兩個字就被判成兩款。
    """
    sa, sb = set(a), set(b)
    return sa <= sb or sb <= sa


def _split_by_residual(g: pd.DataFrame) -> list[pd.DataFrame]:
    """把同指紋的一組，依殘字再切成幾組。組內任兩款都必須相容。

    相容不具遞移性（「無」跟「腰」相容、「無」跟「胸」相容，但「腰」跟
    「胸」不相容），所以要求整組兩兩相容，不能只跟第一個比。
    殘字少的先放，讓寫得最簡略的那款當各組的核心。
    """
    order = g.sort_values("殘字", key=lambda c: c.str.len())
    buckets: list[list[int]] = []
    res = dict(zip(order.index, order["殘字"]))
    for i in order.index:
        for b in buckets:
            if all(_residual_ok(res[i], res[j]) for j in b):
                b.append(i)
                break
        else:
            buckets.append([i])
    return [g.loc[b] for b in buckets]


def signature(name: str, category: str | None = None,
              rx: re.Pattern | None = None) -> str:
    """指紋 = 品類 + 排序後的特徵詞。順序不同的同一件事會得到同一個指紋。"""
    feats = features_of(name, rx)
    cat = str(category or "").strip()
    return f"{cat}|" + "+".join(feats) if feats else ""


def add_signature(df: pd.DataFrame, *, name_col: str = "品名",
                  cat_col: str = "品類", learn: bool = True) -> pd.DataFrame:
    """加上特徵、指紋、覆蓋率三欄。

    `learn=True` 時先從這批品名學詞彙；樣本少於 MIN_LEARN_SAMPLE 就退回
    手寫清單 —— 學詞需要樣本，用 20 個品名學出來的詞彙比手寫的還糟。
    """
    out = df.copy()
    names = (out[name_col] if name_col in out.columns
             else pd.Series("", index=out.index))
    cats = (out[cat_col] if cat_col in out.columns
            else pd.Series("", index=out.index))

    if learn and len(names.dropna()) >= MIN_LEARN_SAMPLE:
        vocab = learn_vocabulary(names.dropna().astype(str))
        rx = _compile(vocab)
        out.attrs["詞彙數"] = len(vocab)
        out.attrs["詞彙來源"] = f"從這批 {len(names.dropna()):,} 個品名學的"
    else:
        rx = _compile(list(FALLBACK_FEATURES) + SEED)
        out.attrs["詞彙數"] = len(FALLBACK_FEATURES)
        out.attrs["詞彙來源"] = (
            f"手寫清單（品名只有 {len(names.dropna())} 筆，"
            f"不足 {MIN_LEARN_SAMPLE} 筆學不出詞）")

    feats = [features_of(n, rx) for n in names]
    out["特徵"] = [", ".join(f) for f in feats]
    out["特徵覆蓋"] = [coverage_of(n, f) for n, f in zip(names, feats)]
    out["殘字"] = [residual_of(n, f) for n, f in zip(names, feats)]
    out["指紋"] = [f"{str(c or '').strip()}|" + "+".join(f) if f else ""
                   for f, c in zip(feats, cats)]
    return out


def _verdict(g: pd.DataFrame, season_col: str, st_col: str) -> tuple[str, str]:
    """一組同指紋的款 → (判定, 一句話說明)。"""
    seasons = g[season_col].astype(str)
    st = pd.to_numeric(g[st_col], errors="coerce")

    if seasons.nunique() == 1 and len(g) >= 2:
        return ("同季自己打自己",
                f"同一季裡有 {len(g)} 款特徵完全一樣，"
                f"售罄 {st.min():.0%}–{st.max():.0%}。兩款分掉同一批客人的預算。")

    # 依季別排序看趨勢。季別是字串（2022早春），先照它排 ——
    # 不完美，但同一指紋的款通常橫跨數年，年份的字典序就是時間序。
    order = g.assign(_s=seasons, _t=st).sort_values("_s")
    first, last = order["_t"].iloc[0], order["_t"].iloc[-1]
    if pd.notna(first) and pd.notna(last):
        if last <= first - DECLINE:
            return ("重複而且愈來愈差",
                    f"跨 {seasons.nunique()} 季重複，售罄從 {first:.0%} 掉到 {last:.0%}。")
        if st.min() >= GOOD:
            return ("重複而且一直好",
                    f"跨 {seasons.nunique()} 季重複，售罄一直在 "
                    f"{st.min():.0%} 以上。這是對的，繼續做。")
    return ("重複但沒有明確趨勢",
            f"跨 {seasons.nunique()} 季重複 {len(g)} 款，售罄 "
            f"{st.min():.0%}–{st.max():.0%}。")


def find(df: pd.DataFrame, *, name_col: str = "品名", cat_col: str = "品類",
         season_col: str = "季別", st_col: str = "售罄率",
         sku_col: str = "款號", img_col: str = "圖",
         min_group: int = MIN_GROUP) -> dict[str, Any]:
    """回傳分組結果與三類判定。"""
    d = add_signature(df, name_col=name_col, cat_col=cat_col)
    meta = dict(d.attrs)
    weak = d[d["指紋"].eq("") | (d["特徵覆蓋"] < MIN_COVERAGE)]
    d = d[d["指紋"].ne("") & (d["特徵覆蓋"] >= MIN_COVERAGE)]
    if d.empty:
        return {"可分析": False,
                "說明": f"沒有一筆品名的特徵覆蓋率達到 {MIN_COVERAGE:.0%}",
                **meta}

    rows = []
    split_off = 0
    for sig, grp in d.groupby("指紋"):
        if len(grp) < min_group:
            continue
        parts = _split_by_residual(grp)
        if len(parts) > 1:
            split_off += 1
        for g in parts:
            if len(g) < min_group:
                continue
            verdict, note = _verdict(g, season_col, st_col)
            st = pd.to_numeric(g[st_col], errors="coerce")
            rows.append({
                "指紋": sig, "判定": verdict, "說明": note,
                "殘字": "／".join(sorted({r for r in g["殘字"] if r})) or "（無）",
                "款數": len(g), "季數": g[season_col].astype(str).nunique(),
                "售罄最低": float(st.min()) if st.notna().any() else None,
                "售罄最高": float(st.max()) if st.notna().any() else None,
                # 一律附上貨號與品名 —— 這份表的工作是把該比對的兩件放到
                # 一起，不是替人做決定。指紋一樣不代表衣服長得一樣（版型、
                # 布料、配色都不在品名裡），所以人一定要能點回去看圖。
                "明細": g[[c for c in (sku_col, name_col, season_col,
                                       st_col, img_col)
                           if c in g.columns]].to_dict("records"),
            })
    out = pd.DataFrame(rows)
    if out.empty:
        return {"可分析": True, "組數": 0, "分組": out, **meta,
                "指紋不可靠": weak[[c for c in (sku_col, name_col, "特徵覆蓋")
                                    if c in weak.columns]],
                "說明": f"沒有任何一組達到 {min_group} 款以上"}
    out = out.sort_values(["判定", "款數"], ascending=[True, False])
    return {
        "可分析": True, **meta,
        # 指紋不可靠的一定要單獨列出，不能默默丟掉 ——
        # 「沒被報成重複」和「沒辦法判斷」是兩件事。
        "指紋不可靠": weak[[c for c in (sku_col, name_col, "特徵覆蓋")
                            if c in weak.columns]],
        "款數": int(len(d)),
        "組數": int(len(out)),
        "殘字拆開的指紋": split_off,
        "涉及款數": int(out["款數"].sum()),
        "分組": out.reset_index(drop=True),
        "判定統計": out["判定"].value_counts().rename_axis("判定")
                    .reset_index(name="組數"),
    }


def summarise(res: dict[str, Any]) -> str:
    if not res.get("可分析"):
        return res.get("說明", "")
    if not res.get("組數"):
        return res.get("說明", "沒有重複")
    n = res["判定統計"]
    bits = "、".join(f"{r['判定']} {r['組數']} 組" for _, r in n.iterrows())
    weak = len(res.get("指紋不可靠", []))
    tail = (f"　另有 {weak:,} 款品名太特殊、認不出足夠的詞，沒有參與比對。"
            if weak else "")
    return (f"{res['款數']:,} 款裡有 {res['組數']} 組特徵重複"
            f"（涉及 {res['涉及款數']} 款）：{bits}{tail}")


# --------------------------------------------------------------- 自我檢查
# 每一組都是拿真實品名踩到的坑。留在這裡是因為這三道把關
# （學詞、覆蓋率、殘字）互相牽動 —— 調動任何一個門檻，
# 都可能讓另外兩個擋下來的東西重新漏出去。
CASES: list[tuple[str, list[str], bool]] = [
    # (說明, 品名們, 應該判成同一款嗎)
    ("同一季重複開款", ["口袋一隻熊短褲裙", "口袋一隻熊短褲裙"], True),
    ("同款跨季改名，寫得長短不同",
     ["連帽腰間抽繩外套", "連帽腰抽繩外套", "連帽抽繩外套"], True),
    # 以下三組都通過覆蓋率，是殘字擋下來的
    ("格紋外套 vs 麂皮外套", ["連帽卡格外套", "麂皮連帽可拆外套"], False),
    ("條紋 vs 格紋", ["條紋剪接片蝴蝶結", "附蝴蝶結格剪接T"], False),
    ("透膚剪接 vs 格布拼接", ["圓領片透膚剪接棉T", "圓領前片格布拼接棉T"], False),
]


def check(vocab: Iterable[str] | None = None) -> list[str]:
    """跑一遍已知案例，回傳失敗訊息（空的代表全過）。

    詞彙預設用案例自己的品名學不出來（樣本太小），所以要外部餵。
    正式跑的時候是拿全部品名學的，這裡用真實資料學出來的詞彙子集。
    """
    rx = _compile(vocab or (list(FALLBACK_FEATURES) + SEED))
    bad: list[str] = []
    for label, names, same in CASES:
        sigs, resid = [], []
        for n in names:
            f = features_of(n, rx)
            sigs.append("+".join(f))
            resid.append(residual_of(n, f))
        merged = (len(set(sigs)) == 1
                  and all(_residual_ok(resid[0], r) for r in resid[1:]))
        if merged != same:
            got = "判成同一款" if merged else "判成不同款"
            want = "應該是同一款" if same else "應該是不同款"
            bad.append(f"{label}：{got}，{want}　{names}")
    return bad
