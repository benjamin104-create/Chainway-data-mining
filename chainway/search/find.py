"""穿搭照 → 貨號。**先特徵，後顏色。**一支函式，命令列與網頁共用。

## 為什麼要獨立成一支

這條流程原本長在 CLI 裡。使用者要的是「網站上可以查詢的等級規格」，
而 CLI 裡的東西網頁叫不到。所以邏輯在這裡，`cli` 與 `apps/api` 都只是
它的兩張臉 —— 兩邊看到的名次永遠一樣，不會有一邊修好、另一邊沒修。

## 順序：特徵第一，顏色第二

使用者的原話：「先確認有甚麼特徵，所以第一是特徵，而不是顏色。」

**顏色會被光線改掉，特徵不會。** 同一件藏青針織，棚拍白底與室內黃光
量出的主色可以差十幾個 ΔE（實測一張未裁的穿搭照，整張主色差 15.9）。
「蝴蝶結」三個字不會因為換一盞燈就不見。

**淺色根本分不開。** 淺粉那題前 15 名的 ΔE 只跨 1.6–3.8，全在量測雜訊
裡，而且兩張完全不同的衣服撈到同一批候選。顏色排第一關，那題第一步
就錯了。

真實資料量到的（正解 KA1369013）：
    只用品名              2 / 3,183
    顏色先、品名後        1 / 15
    **特徵先、顏色後      1 / 40**   ← 現在這個

## 準確率是量出來的，不是估的

`search.selfeval` 用自家系統圖出題 —— 每張圖的檔名就是答案，把它弄成
「像是隨手拍的」再丟回來找。**完全不需要任何人標任何東西。**
換一套沒調校過的衣服與題目驗（150 款裡找 1 款）：

    3×3 逐格偏移（一開始）   Top-1  5.0%   Top-5 31.7%   中位名次 12
    現在（一般）             Top-1 76.2%   Top-5 93.8%   中位名次 1
    現在（嚴苛）             Top-1 68.8%   Top-5 93.8%   中位名次 1
    現在（鏡像自拍）         Top-1 77.5%   Top-5 95.0%   中位名次 1
    亂猜                     Top-1  0.7%   Top-5  3.3%   中位名次 75

這個數字是**上界**：它量的是對光線、構圖、縮放、壓縮的耐受度，量不到
真穿搭照的皺褶與遮擋。跑不好，真照片一定更差；跑得好，真照片還要另外看。

## 兩關都只加分，不當條件

拿一個真實錯誤換來的：照片上最顯眼的是胸前一大片剪接，我就要求品名
必須含「荷葉／領片／披領／披肩」，結果正解被**完全排除** —— 它的品名
根本沒提那一片。品名寫的是設計師認為的賣點，不是你看得到的一切。

所以顏色也守同一條：差太多的標「顏色對不上」降到最後，**仍然列出來**。

## 不要求使用者裁圖

使用者的原話：「不是叫使用者一直幫你修圖編圖的。」所以照片直接丟進來，
`vision.grid.photo_signatures` 會在人身上試二十幾段，讓比對自己挑衣服在
哪一段。裁不準不是問題，因為根本不需要裁準。
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Callable

import pandas as pd

SKU_RE = re.compile(r"KA\d{7}", re.I)
# 洗掉被連同答案複製進來的提示詞（「Features:  蝴蝶結 領口」）。真的發生了兩次。
LABEL_RE = re.compile(r"^\s*[A-Za-z][A-Za-z ]{1,19}:\s*")
# ΔE 大於這個就標「顏色對不上」降到最後。25 是判斷不是量測：
# 2–3 幾乎同色、10 明顯不同、25 以上不同色系。穿搭照的光線會把同一件
# 衣服拉開十幾個 ΔE，所以門檻要鬆。
COLOR_MAX = 25.0
# 顏色排完之後，前幾名要送去做關鍵點重排。
# 量過（150 款裡找 1 款，保留集）：前 60 名 Top-1 75.0%，前 100 名 76.2%。
RERANK_N = 100
# 內點數要多少才算「真的看到同一件東西」。
#
# 這幾個數字只能用**真照片**定。合成測試上內點是弱訊號（答對與答錯的
# 第一名中位數都是 7），因為我造的衣服沒什麼細節，多半靠顏色取勝。
# 真照片完全相反：
#
#     真的同一件      32、36、43、71、172、192、367、411、722、734
#     共用同一個配件  255（兩張共用同一個格紋蝴蝶結）
#
# ## 為什麼不用絕對門檻（先前這裡錯得很嚴重）
#
# 先前寫的是「30 以上＝真的對上了」，那是在 **150 款的合成測試庫**上量的，
# 那裡雜訊上限是 17。搬到真實的 3,320 款系統圖庫就完全不成立 —— 拿**純
# 亂數雜訊圖**去打全庫，量到的第一名是：
#
#     41、59、62、76、93（六次查詢，252 個樣本，第 99 百分位 61）
#
# 也就是說 30、50、72 這種分數在真實庫上跟亂猜沒有差別。真實的參考圖
# 紋理遠比我合成的豐富，隨便一張圖都能湊到幾十個內點。用絕對門檻等於
# 讓雜訊去推翻顏色那一關 —— 而顏色單獨就有 Top-1 88.7%。
#
# ## 改用「第一名比第二名高幾倍」
#
# 倍數是**跟庫大小無關**的量：每次查詢都自帶一份雜訊分布（前一百名裡
# 至多一個是對的，其餘保證是雜訊），第一名要能從自己這次的雜訊裡站出來。
# 量到的：
#
#     雜訊查詢      1.02、1.09、1.17、1.17、1.25、1.32、1.36、1.39、2.66 倍
#     真的同一件    26、29、51、80 倍（367/14、411/14、722/14、734/9）
#
# 兩群中間空得很乾淨。再拿一組**有標準答案**的資料校準倍數該取多少：
# 150 款合成庫、80 題退化查詢（見 /tmp 的 bench，邏輯同 selfeval），
# 答對的 79 題裡倍數是
#
#     中位 9.9 倍、第 10 百分位 4.5 倍、最低 1.8 倍
#
# 取 4 倍：涵蓋九成以上真的配對，又高於量到的雜訊上限 2.66 倍。
#
# 絕對下限只用來擋「分母是 0」那種假倍數 —— 真照片上量到 4 比 0（4 倍）、
# 6 比 0（6 倍），倍數很漂亮但絕對值根本沒有東西。合成庫上答對的第一名
# 中位數是 80，所以下限不能設高：設到 100 會把九成真配對一起擋掉
# （實測 Top-1 從 98.8% 掉到 85.0%）。25 剛好只擋掉那兩種假倍數。
#
# ## 代價（150 款合成庫、80 題，有標準答案）
#
#     舊門檻 20（絕對值）      Top-1 100.0%
#     只要有內點就重排          Top-1  98.8%
#     這裡的新規則             Top-1  92.5%   ← 少 7.5 個百分點
#     完全不用關鍵點            Top-1  81.2%
#
# 少掉的 7.5 個百分點是**買保險的錢**，而且這份保險是必要的：同一個
# 「門檻 20」搬到真實的 3,320 款庫上，會讓純亂數雜訊圖（41–93 分）
# 每一次都推翻顏色排好的名次。合成庫的衣服是我用隨機色塊畫的，紋理
# 比真系統圖單純得多，關鍵點在那裡才那麼可靠 —— 拿那個數字去代表
# 真實庫，正是先前犯的錯。所以兩邊都量，並且以真實庫那一側為準。
# 第一關（品名特徵詞）的第一名要比第二名高幾倍，才算「明顯領先」。
# 只影響顯示的把握度字樣，不參與排序 —— 校準依據見下面把握度那一段。
FEAT_DOMINANCE = 1.2
KP_DOMINANCE = 4.0
KP_FLOOR = 25
# 關鍵點「有話說但不夠強」的下緣，只影響顯示的判定字樣，不影響名次。
KP_MAYBE = 30


def master(cfg) -> tuple[dict[str, str], dict[str, dict]]:
    """主表 → `{貨號: 品名}` 與 `{貨號: {售罄, 定價}}`。讀不到就回空的。"""
    names: dict[str, str] = {}
    sales: dict[str, dict] = {}
    try:
        from ..merge.build_master import load_master

        mm = load_master(cfg)
        key = next((c for c in ("style_code", "sku", "款號")
                    if c in mm.columns), None)
        nm = next((c for c in ("product_name", "品名") if c in mm.columns), None)
        if key and nm:
            names = dict(zip(mm[key].astype(str),
                             mm[nm].fillna("").astype(str)))
        st = next((c for c in ("sell_through_rate", "銷售率", "售罄率")
                   if c in mm.columns), None)
        # 主表的定價欄一律叫 list_price（見 ingest/pos.py 的欄位對照）。
        # 先前只找 "price"／"定價"，兩個都不存在，所以每一次查詢的定價
        # 都是空的 —— 不會報錯，只是畫面上永遠少一格。
        pr = next((c for c in ("list_price", "price", "定價",
                               "avg_selling_price") if c in mm.columns), None)
        if key and st:
            for _, r in mm.iterrows():
                sales[str(r[key])] = {"售罄": r.get(st),
                                      "定價": r.get(pr) if pr else None}
    except Exception:
        pass
    return names, sales


def stock(cfg) -> dict[str, list[dict[str, Any]]]:
    """母款 → 各顏色尺寸的庫存。讀不到就回空的，查詢照樣能跑。

    這一層是「查到貨號之後真正要問的事」：這件有沒有貨、什麼顏色、
    什麼尺寸。資料來源是 POS 進銷存報表，不是新資料，只是先前彙總到
    「貨號×季別」時把顏色與尺寸丟掉了。

    **庫存是匯出當下的快照，不是即時的。** 報表什麼時候匯的，數字就是
    那一刻的。這件事一定要顯示在畫面上，否則賣場會拿舊數字去跟客人
    保證有貨。
    """
    path = cfg.path("interim") / "stock_by_variant.parquet"
    if not path.exists():
        return {}
    try:
        df = pd.read_parquet(path)
    except Exception:
        return {}
    key = "style_code" if "style_code" in df.columns else "sku"
    if key not in df.columns:
        return {}
    out: dict[str, list[dict[str, Any]]] = {}
    for sku, g in df.groupby(key, dropna=False):
        rows = []
        for _, r in g.iterrows():
            rows.append({
                "顏色": (str(r["color"]) if "color" in g.columns
                         and pd.notna(r.get("color")) else ""),
                "尺寸": (str(r["size"]) if "size" in g.columns
                         and pd.notna(r.get("size")) else ""),
                "庫存": (int(r["stock_on_hand"])
                         if "stock_on_hand" in g.columns
                         and pd.notna(r.get("stock_on_hand")) else None),
                "另一套庫存數": (int(r["stock_on_hand_alt"])
                               if "stock_on_hand_alt" in g.columns
                               and pd.notna(r.get("stock_on_hand_alt")) else None),
                "已售": (int(r["sales_qty"]) if "sales_qty" in g.columns
                         and pd.notna(r.get("sales_qty")) else None),
            })
        rows.sort(key=lambda x: (x["顏色"], x["尺寸"]))
        out[str(sku)] = rows
    return out


def _cached(cfg, name: str, paths, build, *, recolor=False, log=print,
            label: str = "") -> dict:
    """通用的「量過就存起來」。**以檔案路徑為鍵**，不是貨號。

    一個貨號現在有好幾張參考圖（系統圖、目錄圖、打樣照、布樣、繡花），
    用貨號當鍵會讓同款的第二張蓋掉第一張。鍵裡再帶檔案的時間與大小 ——
    系統圖換過一張就得重算，否則會安靜地用舊的那張（自我測驗撞到過，
    準確率從 55% 掉到 1.3%）。
    """
    import pickle

    path = cfg.path("interim") / name
    cache: dict = {}
    if path.exists() and not recolor:
        try:
            cache = pickle.loads(path.read_bytes())
        except Exception:
            cache = {}

    fresh, out = 0, {}
    for p_ in paths:
        key = f"{p_}|{_stamp(p_)}"
        hit = cache.get(key)
        if hit is None:
            try:
                hit = {"v": build(p_)}
            except Exception:
                hit = {"v": None}
            cache[key] = hit
            fresh += 1
            if fresh % 200 == 0:
                log(f"  {label}：量到第 {fresh} 張…")
        if hit.get("v") is not None:
            out[str(p_)] = hit["v"]
    if fresh:
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            path.write_bytes(pickle.dumps(cache))
        except Exception:
            pass
        log(f"  {label}：新量 {fresh} 張（快取 {path.name}）")
    return out


def _colors(cfg, paths, *, recolor=False, log=print) -> dict:
    """每張參考圖的衣服主色。"""
    from ..imageio import load_rgb
    from ..vision import grid as G

    return _cached(cfg, "color_v2.pkl", paths,
                   lambda p: G.garment_color(load_rgb(p)),
                   recolor=recolor, log=log, label="主色")


def _signatures(cfg, paths, *, recolor=False, log=print) -> dict:
    """每張參考圖的多尺度顏色簽名。"""
    from ..imageio import load_rgb
    from ..vision import grid as G

    return _cached(cfg, "sig_v3.pkl", paths,
                   lambda p: G.cell_signature(load_rgb(p)),
                   recolor=recolor, log=log, label="顏色簽名")


def _keypoints(cfg, paths, *, recolor=False, log=print) -> dict:
    """每張參考圖的關鍵點描述子。只對進入重排的候選做。"""
    from ..imageio import load_rgb
    from ..vision import keypoints as KPmod

    if not KPmod.available():
        return {}
    # **參考圖要用跟查詢照完全一樣的前處理。**
    #
    # 先前參考圖走 describe（整張圖、640px），查詢照走 describe_query
    # （遮罩到衣服、900px）。兩邊前處理不一樣，同一件衣服的細節就對不上
    # —— 實測同一條格紋荷葉裙，直接比是 61 處，進到管線裡只剩 5 處；
    # 同一件粉上衣 125 處變成 4 處。
    #
    # describe_query 自己會判斷：照片裡有人就遮罩、沒人（系統圖那種平拍
    # 去背）就退回裁到主體。所以兩邊都呼叫它，路徑自動一致。
    return _cached(cfg, "kp_v3.pkl", paths,
                   lambda p: KPmod.describe_query(load_rgb(p)),
                   recolor=recolor, log=log, label="細節特徵")


def _stamp(path) -> tuple:
    """檔案指紋。快取只用貨號當鍵是不夠的 —— 系統圖換過一張，比對就會
    安靜地用舊的那張。自我測驗撞到過，準確率從 55% 掉到 1.3%。"""
    try:
        st = Path(path).stat()
        return (int(st.st_mtime), int(st.st_size))
    except OSError:
        return (0, 0)


# 電商標題裡沒有資訊的字。品牌名到處都是、行銷形容詞人人可用，
# 它們在 IDF 上本來就接近 0，但留著會稀釋命中率的分母，也讓「命中」那
# 一欄看起來很滿其實沒說什麼。
TITLE_NOISE = [
    "Kinloch", "Anderson", "SCOTLAND", "金安德森", "女裝", "男裝", "童裝",
    "專櫃", "正品", "官方", "限時", "折後價", "promo", "新品", "現貨",
    "浪漫", "優雅", "百搭", "經典", "時尚", "修身", "顯瘦", "氣質", "甜美",
    "韓版", "日系", "英倫", "法式", "高級感", "質感", "輕奢", "舒適",
    "款", "件", "系列", "同款",
]
# 標題裡值得留下的結構詞 —— 這些在品名裡也會出現，是真正能對上的東西。
TITLE_SPLIT = ("　", " ", "/", "｜", "|", "、", "．", "·", "－", "-", "+")


def parse_title(text: str) -> dict[str, Any]:
    """電商商品標題 → 特徵詞 + 顏色。

    為什麼值得做成功能：在 momo／官網上看到一件，想知道自家貨號是多少，
    是每天會發生的事。標題本身就是最好的查詢條件 —— 貴司的品名寫得極
    精確，而電商標題多半是品名加上品牌名與行銷詞。使用者不該自己拆字。

    顏色從括號裡抓（「(紫藕)」「（藏青）」），那是電商放色名的慣例。
    """
    import re as _re

    raw = (text or "").strip()
    colour = ""
    m = _re.search(r"[（(]\s*([^（）()]{1,12})\s*[）)]\s*$", raw)
    if m:
        colour = m.group(1).strip()
        raw = raw[:m.start()]
    # 去掉價格、品號、純數字段
    raw = _re.sub(r"(品號|貨號|型號)\s*[:：]?\s*\w+", " ", raw)
    raw = _re.sub(r"[\$＄]\s*[\d,]+", " ", raw)
    for w in TITLE_NOISE:
        raw = _re.sub(_re.escape(w), " ", raw, flags=_re.I)
    for sep in TITLE_SPLIT:
        raw = raw.replace(sep, " ")
    raw = _re.sub(r"[^\w\u4e00-\u9fff ]+", " ", raw)
    terms: list[str] = []
    vocab = _garment_vocab()
    for chunk in raw.split():
        if chunk.isdigit():
            continue
        terms.extend(_segment(chunk, vocab))
    # 去重但保留順序
    seen: set[str] = set()
    terms = [t for t in terms if not (t in seen or seen.add(t))]
    return {"特徵詞": " ".join(terms), "顏色名": colour, "原標題": text}


# 品名裡常出現、但 taxonomy 沒收的工藝與細節詞。taxonomy 收的是「屬性」
# （領型、袖型、裙型），這些是「做了什麼」—— 兩者合起來才切得動品名。
DETAIL_WORDS = [
    "蝴蝶結", "荷葉", "抓皺", "網紗", "雪紡", "蕾絲", "拼接", "剪接", "繡花",
    "印花", "貼布", "燙鑽", "水鑽", "珠飾", "流蘇", "綁帶", "腰帶", "鬆緊",
    "羅紋", "織紋", "麻花", "縮口", "開襟", "排釦", "鈕釦", "口袋", "翻領",
    "假兩件", "百褶", "打褶", "壓褶", "不對稱", "層次", "格紋", "條紋",
    "素面", "刷毛", "針織", "梭織", "棉T", "丹寧", "牛仔", "緞面", "亮面",
    "防曬", "涼感", "彈性", "外套", "背心", "洋裝", "襯衫", "上衣", "帽T",
    "logo", "LOGO", "字母", "熊", "刺繡",
]


# 一個詞至少要出現在這麼多款的品名裡，才算得上「款式特徵」。
# 低於這個數的多半是規格表欄位名（褲長、肩寬、色系）誤入 taxonomy。
MIN_VOCAB_STYLES = 4


def vocab_stats(cfg, index: dict | None = None,
                limit: int = 90) -> list[dict[str, Any]]:
    """可以用的特徵詞，**依「能砍掉多少款」排序**。

    這一支存在的理由是八題真照片問出來的：同樣一張照片，不給詞的時候
    名次由顏色決定、幾乎全錯；給了「格紋 短裙 腰帶 打摺」之後，第一名
    就是「格布腰帶左右打摺短裙」。**差別不在照片，在有沒有詞。**

    但使用者不會知道該打哪些詞 —— 品名用的是公司自己的寫法（「格布」
    不是「格子布」，「假兩件」不是「假兩件式」）。打不中就等於沒打。
    所以把品名裡真正出現過的詞挑出來，讓人用點的，不要用猜的。

    排序用出現款數由少到多：**罕見的詞砍得最兇**。「上衣」中 562 款等於
    沒砍，「網紗」只中 47 款，一個詞就把 3,320 縮到 47。

    但只中 1～2 款的要濾掉。那些多半不是款式特徵，是規格表的欄位名混進
    taxonomy 的（「褲長」「肩寬」「色系」「裙型」）—— 排在最前面會讓整
    排標籤看起來像亂碼，使用者第一眼就不信這個功能。
    """
    names = (
        {k: v.get("品名", "") for k, v in (index.get("商品") or {}).items()}
        if index else master(cfg)[0])
    names = {k: v for k, v in names.items() if v}
    if not names:
        return []
    got: list[dict[str, Any]] = []
    for w in _garment_vocab():
        n = sum(1 for v in names.values() if w in v)
        if n >= MIN_VOCAB_STYLES:
            got.append({"詞": w, "款數": n,
                        "佔比": round(n / len(names), 4)})
    got.sort(key=lambda x: x["款數"])
    return got[:limit] if limit else got


def _garment_vocab() -> list[str]:
    """taxonomy 的屬性詞 + 工藝詞，長的排前面（最長匹配用）。"""
    words = set(DETAIL_WORDS)
    try:
        import yaml

        from ..config import REPO_ROOT

        data = yaml.safe_load(
            (REPO_ROOT / "config" / "taxonomy.yaml").read_text(encoding="utf-8"))
        def walk(o):
            if isinstance(o, dict):
                for k, v in o.items():
                    if k in ("zh", "name_zh") and isinstance(v, str):
                        for part in v.replace("/", " ").split():
                            if 1 < len(part) <= 6:
                                words.add(part)
                    else:
                        walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
        walk(data)
    except Exception:
        pass
    return sorted(words, key=len, reverse=True)


def _segment(chunk: str, vocab: list[str]) -> list[str]:
    """最長匹配斷詞。中文沒有空格，而比對是用「詞在品名裡嗎」——
    整串「蝴蝶結抓皺網紗袖」當一個詞，品名寫法只要差一個字就對不上。
    切成「蝴蝶結／抓皺／網紗／袖」之後，每一個都還有機會命中。
    """
    out: list[str] = []
    i = 0
    while i < len(chunk):
        hit = next((w for w in vocab
                    if chunk.startswith(w, i)), None)
        if hit:
            out.append(hit)
            i += len(hit)
        else:
            i += 1
    if not out:
        out = [chunk]
    return out


def _colour_by_name(name: str, warn: list[str]) -> str | None:
    """色名（電商標題括號裡那個）→ 色卡上的 hex。

    對不到就回 None 並記一句話 —— 特徵詞還在，不要因為一個色名對不上
    就把整個查詢擋掉。貴司色卡上沒有「紫藕」這種電商自創色名，但有
    「藕」「淺紫」「粉紫」，所以用包含比對而不是完全相等。
    """
    try:
        from .colorcode import load_table

        tab = load_table() or {}
    except Exception:
        return None
    best = None
    for code, info in tab.items():
        zh = str((info or {}).get("zh") or (info or {}).get("名稱") or "")
        hexv = (info or {}).get("hex")
        if not zh or not hexv:
            continue
        if zh == name:
            best = (code, zh, hexv)
            break
        if (zh in name or name in zh) and best is None:
            best = (code, zh, hexv)
    if best:
        warn.append(f"標題寫的顏色「{name}」對到色卡的 {best[0]} {best[1]}"
                    f"（{best[2]}）")
        return best[2]
    warn.append(f"色卡上找不到「{name}」這個色名，這次不用顏色篩選")
    return None


def parse_hex(text: str) -> str | None:
    """從任何一串字裡撈出六碼十六進位色。「Colour hex: #1E263E」也吃。"""
    m = re.search(r"(?<![0-9A-Fa-f])([0-9A-Fa-f]{6})(?![0-9A-Fa-f])", text or "")
    return m.group(1) if m else None


def _dominant(head: list[dict[str, Any]]) -> dict[str, Any] | None:
    """這次查詢的關鍵點證據夠不夠強？夠就回傳那一款，不夠回 None。

    前一百名裡至多一款是對的，所以**第二名就是這次查詢的雜訊水位**。
    第一名要同時做到兩件事才算站得住：

        比第二名高 KP_DOMINANCE 倍   ← 跟庫大小無關，量到的雜訊最高 2.66 倍
        自己過 KP_FLOOR              ← 蓋住量到的雜訊最高分 93

    為什麼不用固定門檻、兩組數字怎麼量出來的，見檔案上方的註解。
    """
    ranked = sorted((r.get("相同細節") or 0) for r in head)[::-1]
    if len(ranked) < 2 or ranked[0] < KP_FLOOR:
        return None
    if ranked[0] < KP_DOMINANCE * max(ranked[1], 1):
        return None
    return max(head, key=lambda r: r.get("相同細節") or 0)


def run(cfg, *, photo: str | Path | None = None, words: str = "",
        like: str | None = None, season: str | None = None,
        shortlist: int = 40, rerank: int = RERANK_N, top: int = 15,
        color_max: float = COLOR_MAX,
        recolor: bool = False, images: dict | None = None,
        refs: dict | None = None, ref_penalty: float = 0.0,
        try_mirror: bool = True, title: str = "",
        index: dict | None = None,
        truth: list[str] | None = None,
        log: Callable[[str], None] = print) -> dict[str, Any]:
    """跑完整條流程，回傳結構化結果。不印任何東西以外的副作用。

    回傳 `{"照片":…, "特徵":…, "候選":[…], "警告":[…]}`。
    `候選` 已排好序，每一筆都帶著名次、分數與為什麼。
    """
    from ..vision import grid as G
    from . import refs as R

    warn: list[str] = []
    # 一個貨號有好幾張參考圖：系統圖、目錄圖、打樣照、布樣、繡花圖稿。
    # 同一款五種拍法 = 五次認出它的機會。細節與公平性見 search/refs.py。
    if index:
        # 指紋模式：這台機器上沒有圖，只有算好的指紋。
        # 比對本來就只用得到指紋，圖只是拿來算指紋的中間產物。
        refs = {sku: [{"path": f"指紋:{sku}", "來源": index.get("來源", {}).get(sku, "指紋")}]
                for sku in index["貨號"]}
    if refs is None:
        refs = R.collect(cfg) if images is None else {
            k: [{"path": Path(v), "來源": "系統圖"}] for k, v in images.items()}
    if not refs and index is None and images is None:
        # 一張圖都找不到，但也許有指紋檔 —— 網站主機與帶著指紋走的電腦
        # 都是這個樣子。圖優先，所以這一步只在收不到參考圖時才走。
        from . import fingerprint as FP

        got = FP.auto(cfg)
        if got and got.get("錯誤"):
            warn.append(got["錯誤"])
        elif got:
            index = got
            refs = {sku: [{"path": f"指紋:{sku}",
                           "來源": index.get("來源", {}).get(sku, "指紋")}]
                    for sku in index["貨號"]}
            warn.append(f"這台機器上沒有系統圖，改用指紋檔比對（{len(refs):,} 款）")
    if not refs:
        return {"警告": ["沒有讀到任何參考圖，確認 settings.yaml 的 paths；"
                         "或在有圖的機器上跑 cli fingerprint，把指紋檔帶過來"],
                "候選": []}
    images = {} if index else R.primary(refs)

    pool = {k: v for k, v in refs.items()
            if not season or k.upper().startswith(season.upper())}
    if not pool:
        return {"警告": [f"沒有貨號以 {season} 開頭"], "候選": []}

    names, sales = master(cfg)
    inv = stock(cfg)
    # 指紋檔自己帶著品名與庫存。帶指紋走的機器上沒有主表、也沒有 POS
    # 報表，少了這一段就只答得出貨號 —— 而「有沒有貨」才是問完貨號之後
    # 真正要問的。本機讀得到的永遠優先，指紋只補它讀不到的。
    if index and index.get("商品"):
        info_ = index["商品"]
        if not names:
            names = {k: v["品名"] for k, v in info_.items() if v.get("品名")}
        if not sales:
            sales = {k: {"售罄": v.get("售罄"), "定價": v.get("定價")}
                     for k, v in info_.items()}
        if not inv:
            inv = {k: v["庫存明細"] for k, v in info_.items()
                   if v.get("庫存明細")}
    truth = [t.upper() for t in (truth or [])]

    # ---------------------------------------------------------- 讀照片
    photo_sig = None
    qlab = None
    info: dict[str, Any] = {}
    if photo:
        from ..imageio import load_rgb

        pp = Path(str(photo))
        if not pp.exists():
            return {"警告": [f"找不到照片：{pp}"], "候選": []}
        im = load_rgb(pp)
        ps = G.photo_signatures(im)
        # 顏色這一側**不做鏡像**，只有關鍵點那一側做。
        #
        # 衣服的顏色分布大致左右對稱，鏡像帶不進新資訊，多一倍視窗只是讓
        # 錯的候選多一次撿便宜的機會。量過：顏色也做鏡像之後，鏡像查詢的
        # Top-1 從 77.5% 掉到 75.0%。關鍵點不同 —— ORB 描述子不是鏡像
        # 不變的，同一件衣服鏡像之後內點從 868 掉到 6，非做不可。
        if ps["視窗"]:
            photo_sig = ps
            info = dict(ps["人"])
            info["試了幾段"] = len(ps["視窗"])
        else:
            warn.append("照片裡找不到夠大的主體，只能用主色比對")
        gc = G.garment_color(im)
        qlab = gc.get("LAB")
        info.update({"主色": gc.get("HEX"), "色號": gc.get("色號"),
                     "色名": gc.get("色名")})
    elif like:
        from ..search.palette import _srgb_to_lab
        import numpy as np

        h = parse_hex(like)
        if not h:
            return {"警告": [f"看不懂顏色「{like}」，要六碼十六進位，例如 1E263E"],
                    "候選": []}
        qlab = [float(v) for v in _srgb_to_lab(np.array(
            [[int(h[i:i + 2], 16) for i in (0, 2, 4)]], dtype=float))[0]]
        info = {"主色": "#" + h.upper()}

    # ---------------------------------------------------------- 第一關：特徵
    # 電商標題可以直接貼進來，程式自己拆成特徵詞與顏色。
    #
    # 為什麼值得做：在 momo／官網看到一件，想知道自家貨號是多少，是每天
    # 都會發生的事。標題本身就是最好的查詢條件 —— 貴司的品名寫得極精確，
    # 而電商標題多半就是品名加上品牌名與行銷詞。使用者不該自己拆字。
    if title:
        _t = parse_title(title)
        words = (f"{words} {_t['特徵詞']}").strip() if words else _t["特徵詞"]
        if _t["顏色名"] and not like:
            like = _colour_by_name(_t["顏色名"], warn)

    words = LABEL_RE.sub("", words or "").strip()
    while LABEL_RE.match(words):
        words = LABEL_RE.sub("", words).strip()
    terms = [t for t in words.replace(",", " ").replace("，", " ").split()
             if t and not t.startswith("-")]
    cand = sorted(pool)
    feat: dict[str, dict] = {}
    stage1: dict[str, Any] = {"詞": terms}
    if terms:
        if not names:
            warn.append("找不到主表的品名，特徵這關跳過（先建主表）")
        else:
            from . import by_description as BD

            sub = {k: names[k] for k in pool if names.get(k)}
            ranked = BD.rank_terms(sub, terms, top=10 ** 6)
            if ranked.empty:
                warn.append(f"{len(sub):,} 款品名裡沒有一款含這些詞")
            else:
                for _, r in ranked.iterrows():
                    feat[str(r["貨號"])] = {"特徵分": float(r["分數"]),
                                            "命中": r["命中"], "品名": r["品名"]}
                n = min(max(shortlist, 1), len(ranked))
                # 平手的中間不能切：只給一個詞時 274 款全部同分，切點取決於
                # 主表剛好怎麼排，跟像不像無關。切到平手群就整群帶進第二關。
                cut = float(ranked["分數"].iloc[n - 1])
                tied = int((ranked["分數"] >= cut - 1e-9).sum())
                asked, n = n, max(n, tied)
                cand = ranked["貨號"].astype(str).head(n).tolist()
                stage1.update({
                    "母數": len(sub), "命中": len(ranked), "進第二關": n,
                    "同分放寬": tied > asked,
                    "分數跨幅": round(float(ranked["分數"].iloc[0] - cut), 2),
                    "前十": ranked.head(10)[["排名", "分數", "貨號", "品名",
                                             "命中"]].to_dict("records"),
                    "正解名次": {t: (int(ranked[ranked["貨號"].astype(str) == t]
                                       ["排名"].iloc[0])
                                   if (ranked["貨號"].astype(str) == t).any()
                                   else None) for t in truth},
                })

    # ---------------------------------------------------------- 第二關：顏色
    cand_paths = [str(it["path"]) for sku in cand for it in refs.get(sku, [])]
    src_of = {str(it["path"]): it["來源"]
              for sku in cand for it in refs.get(sku, [])}
    if index:
        colors = {}
        sigs = {f"指紋:{s}": index["簽名"][s] for s in cand
                if s in index["簽名"]} if photo_sig else {}
    else:
        colors = _colors(cfg, cand_paths, recolor=recolor, log=log) if qlab else {}
        sigs = (_signatures(cfg, cand_paths, recolor=recolor, log=log)
                if photo_sig else {})

    # 九宮格一次算完所有參考圖（向量化）。逐張迴圈在幾千張上慢到不能用，
    # 而網頁查詢正是要面對那個數字。
    #
    # 每一款取自己所有參考圖裡最好的那一張。圖多的款因此天生佔一點便宜
    # （n 次抽樣的最小值本來就比 1 次小），`ref_penalty` 把那個便宜扣回去
    # —— 扣多少要量，不能猜，預設 0，量法見 selfeval。
    grid_d: dict[str, tuple[float, str, str]] = {}
    if photo_sig is not None and sigs:
        import numpy as np

        pk = G.pack(sigs)
        dist, which = G.score_all(photo_sig["視窗"], pk)
        per = {p_: (float(dist[i]), int(which[i]))
               for i, p_ in enumerate(pk["貨號"]) if np.isfinite(dist[i])}
        for sku in cand:
            got = [(per[str(it["path"])][0], per[str(it["path"])][1],
                    str(it["path"])) for it in refs.get(sku, [])
                   if str(it["path"]) in per]
            if not got:
                continue
            d_, w_, p_ = min(got)
            grid_d[sku] = (d_ + R.penalty(len(got), per_ref=ref_penalty),
                           photo_sig["視窗"][w_]["段"], src_of.get(p_, ""))

    rows: list[dict[str, Any]] = []
    for sku in cand:
        f = feat.get(sku, {})
        de, c = None, None
        if index and qlab is not None and sku in index["簽名"]:
            m_ = index["簽名"][sku].get("主色LAB")
            if m_:
                try:
                    de = round(G.color_distance(qlab, m_), 1)
                except Exception:
                    de = None
        elif qlab is not None:
            best = None
            for it in refs.get(sku, []):
                cc = colors.get(str(it["path"]))
                if not cc or not cc.get("LAB"):
                    continue
                try:
                    d_ = round(G.color_distance(qlab, cc["LAB"]), 1)
                except Exception:
                    continue
                if best is None or d_ < best[0]:
                    best = (d_, cc)
            if best:
                de, c = best
        g_abs = g_rel = None
        seg = src = ""
        if sku in grid_d:
            g_rel, seg, src = round(grid_d[sku][0], 1), grid_d[sku][1], grid_d[sku][2]
            g_abs = g_rel
        # 「顏色對不上」這個標記只在**沒有照片**、只給色碼時才有意義。
        # 有照片時整張主色會混到皮膚、頭髮、裙子（實測同一件衣服差 15.9），
        # 而九宮格距離是三項相加的複合值，拿它跟 ΔE 的門檻比是在比蘋果
        # 跟橘子。有照片就不標，改讓距離自己說話。
        judge = None if photo_sig is not None else de
        rows.append({
            "貨號": sku, "品名": f.get("品名") or names.get(sku, ""),
            "相同細節": None,
            "特徵分": round(f.get("特徵分", 0.0), 2), "命中": f.get("命中", ""),
            "主色ΔE": de, "九宮格": g_rel, "格絕對": g_abs, "段": seg,
            "比中來源": src, "參考圖數": len(refs.get(sku, [])),
            "HEX": (c or {}).get("HEX"), "色號": (c or {}).get("色號"),
            "色名": (c or {}).get("色名", ""),
            "顏色對不上": bool(judge is not None and judge > color_max),
            "售罄": (sales.get(sku) or {}).get("售罄"),
            "定價": (sales.get(sku) or {}).get("定價"),
            "庫存明細": inv.get(sku, []),
            "可售總數": sum(x["庫存"] or 0 for x in inv.get(sku, [])) or None,
            "圖": str(images.get(sku, "")),
        })

    # 排序用的數字只能有一種尺度。
    #
    # 先前這裡是「有九宮格就用九宮格，沒有就用主色 ΔE」—— 兩個完全不同
    # 量綱的數字混在同一個 sort 裡。主色 ΔE 大約 0–100，九宮格距離是三項
    # 相加、常常上百，結果「量不到簽名」的候選反而排到最前面。
    # 有照片時，量不到簽名就是量不到，排最後，不要拿別的數字頂上去。
    use_grid = photo_sig is not None and bool(grid_d)

    def tie(r):
        if use_grid:
            return r["九宮格"] if r["九宮格"] is not None else float("inf")
        return r["主色ΔE"] if r["主色ΔE"] is not None else float("inf")

    if terms and feat:
        # 「顏色對不上」只是標記，**不參與排序**。
        #
        # 它當過第一排序鍵，結果一題裡正解的特徵分 8.65（第一關第 1 名）
        # 被壓到第 28 名 —— 因為那張查詢照的整張主色被背景帶偏，正解被
        # 判成「顏色對不上」。這就是「顏色變成條件」的老毛病，換個名字
        # 又犯一次：先前是品名硬條件把正解排除，這次是顏色硬條件把它壓底。
        # 顏色是證據，只在同分時說話。
        rows.sort(key=lambda r: (-r["特徵分"], tie(r)))
        how = "特徵排序，顏色只做同分裁決"
    elif qlab is not None:
        rows.sort(key=tie)
        how = "只有顏色（沒給特徵詞）"
    else:
        return {"警告": ["特徵詞、照片、色碼至少要給一個"], "候選": []}

    # ------------------------------------------------ 第三關：關鍵點重排
    #
    # 顏色只能排到這裡。拿「神諭視窗」量過上界：就算每一題都選到最好的
    # 裁切段落，純顏色的 Top-1 也只有 54%。要再上去就得換一種資訊 ——
    # 印花、logo、鈕釦、口袋、織紋，那些顏色看不到。
    #
    # 只對前 RERANK_N 名做，因為對全庫做太慢也沒必要。內點數為主，
    # 同數（含全部 0 個，也就是素面款）時維持顏色的順序 —— 素面本來就
    # 只能靠顏色，這時候不要讓關鍵點的雜訊去打亂它。
    kp_hits = 0
    kp_winner: dict[str, Any] | None = None
    if photo_sig is not None and rows and rerank > 0:
        from ..vision import keypoints as KP

        if KP.available():
            head = rows[:rerank]
            if index:
                desc = {f"指紋:{r['貨號']}": index["細節"][r["貨號"]]
                        for r in head if r["貨號"] in index.get("細節", {})}
            else:
                head_paths = [str(it["path"]) for r in head
                              for it in refs.get(r["貨號"], [])]
                desc = _keypoints(cfg, head_paths, recolor=recolor, log=log)
            if desc:
                try:
                    from ..imageio import load_rgb

                    qim = load_rgb(Path(str(photo)))
                    qs = [KP.describe_query(qim)]
                    if try_mirror:
                        from PIL import ImageOps as _O

                        qs.append(KP.describe_query(_O.mirror(qim)))
                    qs = [x for x in qs if x is not None]
                    q = qs[0] if qs else None
                except Exception:
                    qs, q = [], None
                if q is not None:
                    for i, r in enumerate(head):
                        best = 0
                        for it in refs.get(r["貨號"], []):
                            d_ = desc.get(str(it["path"]))
                            if d_ is None:
                                continue
                            v = max(KP.inliers(x, d_) for x in qs)
                            if v > best:
                                best, r["比中來源"] = v, it["來源"]
                        r["相同細節"] = best
                        r["_序"] = i
                    kp_hits = sum(1 for r in head if r["相同細節"])
                    # **只在特徵分相同的群內重排。**
                    #
                    # 第一版直接依內點把前一百名整個重排，等於讓第三關
                    # 推翻第一關 —— 品名明確命中的款會被一個只是花色相近
                    # 的款擠掉。這正是「後面的關卡變成條件」，跟先前顏色
                    # 當條件、品名當條件是同一個錯，只是換了層。
                    # 順序永遠是：特徵 → 關鍵點 → 顏色。
                    # **證據不夠強就不要動顏色排好的順序。**
                    #
                    # 「夠不夠強」是**每次查詢各自判斷**的，不是比一個固定
                    # 的數字。前一百名裡至多一個是對的，其餘保證是雜訊，
                    # 所以第二名就是這次查詢的雜訊水位 —— 第一名要比它高
                    # KP_DOMINANCE 倍，而且自己要過 KP_FLOOR，才算站得住。
                    # 理由與量到的數字見檔案上方 KP_DOMINANCE 的註解。
                    kp_winner = kp_top = _dominant(head)
                    if kp_top is not None:
                        # 只把那一款提上來。其餘維持顏色排好的順序 ——
                        # 它們的內點分數已經證明是雜訊，不該拿來排序。
                        head.sort(key=lambda r: (-r["特徵分"],
                                                 0 if r is kp_top else 1,
                                                 r["_序"]))
                        how += "，關鍵點證據夠強，把它提到第一名"
                    else:
                        head.sort(key=lambda r: (-r["特徵分"], r["_序"]))
                        if kp_hits:
                            how += "，關鍵點證據不夠強（分不出雜訊），順序仍由顏色決定"
                    for r in head:
                        r.pop("_序", None)
                    rows = head + rows[rerank:]

    for i, r in enumerate(rows, 1):
        r["名次"] = i
        v = r.get("相同細節") or 0
        if r is kp_winner:
            r["判定"] = "確定看到同一件東西"
        elif v >= KP_MAYBE:
            r["判定"] = "有一點跡象，但這種分數雜訊也拿得到"
        elif kp_hits:
            r["判定"] = "關鍵點沒對上，只有顏色接近"
        else:
            r["判定"] = "只有顏色接近"
    # 整體把握度：第一名有沒有被關鍵點證實，以及它跟第二名差多少。
    #
    # 一個錯得很有自信的答案，比「我不確定」更糟 —— 這是內部查詢工具，
    # 使用者會照著它去翻商品。所以寧可說沒把握。
    # 先前這裡只看關鍵點，於是**第一關再怎麼明確都一律報「低」**。
    # 實測八題真照片：「格布腰帶左右打摺短裙」特徵分 10.63、第二名 7.34
    # （1.45 倍），品名跟照片一字不差，卻跟完全沒有證據的題目同樣被標成
    # 「低」。那等於把第一關的證據丟掉 —— 而三關裡第一關最強。
    #
    # 所以特徵分也用同一套「比第二名高幾倍」來看。門檻 1.2 是從那八題量
    # 的（領先的 1.45／1.24，並列的 1.00–1.02），樣本很小，**只拿來決定
    # 顯示的字樣，絕不參與排序**，改壞了也不會動到名次。要重新校準就多
    # 收幾題真照片，把倍數列出來看兩群分在哪。
    top_kp = (rows[0].get("相同細節") or 0) if rows else 0
    f1 = (rows[0].get("特徵分") or 0) if rows else 0
    f2 = (rows[1].get("特徵分") or 0) if len(rows) > 1 else 0
    feat_lead = f1 >= FEAT_DOMINANCE * max(f2, 1e-9) and f1 > 0
    if kp_winner is not None and rows and rows[0] is kp_winner:
        sure = "高"
    elif kp_winner is not None or feat_lead:
        # 關鍵點站出來了（但沒排第一），或第一關明顯領先：有證據，但不到
        # 「看到同一件東西」的程度。
        sure = "中"
    else:
        # 三關都沒有人站出來，名次純粹由顏色決定。真照片上純顏色的 Top-1
        # 大約一半，所以這種時候不要說自己有把握。
        sure = "低"
    return {"照片": info, "特徵": stage1, "排序依據": how, "警告": warn,
            "關鍵點命中": kp_hits, "把握度": sure, "第一名相同細節": top_kp,
            "總候選": len(rows), "候選": rows[:top],
            "正解": {t: next((r["名次"] for r in rows if r["貨號"] == t), None)
                     for t in truth}}
