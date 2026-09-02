"""判斷「圖騰到底在衣服的哪個位置」—— 只在品名真的講清楚時才下結論。

## 為什麼要重做

第一版的規則是「品名出現『肩』就算熊在肩」。設計師一看圖就知道不對：

    熊頭圖案針織披肩上衣   披肩是這件衣服的款式，熊在胸前
    繡熊斜露肩上衣         露肩是領口處理，熊在胸前
    熊頭燙鑽肩格布棉T      肩上的是格布，不是熊
    左肩綁格帶右下皇冠熊棉T  左肩綁的是格帶，熊在右下

把「品名提到某個部位」當成「圖騰在那個部位」，是兩件不同的事被混為一談。
數字算得再對，結論在視覺上站不住 —— 而報告是給看圖工作的人看的，
一條讀起來像硬凹的分類，會讓整份報告失去可信度。

## 兩層規則

**第一層：先把款式詞遮掉。**
披肩、露肩、挖肩、肩帶、連帽、帽T ——「肩」與「帽」在這些詞裡是
衣服的結構，不是一個可以擺東西的位置。遮掉之後剩下的才是裸露的位置詞。

**第二層：每個位置詞綁離它最近的特徵。**
中文品名是修飾語在前：「口袋熊電繡」的口袋綁熊，
「熊頭燙鑽肩格布」的肩綁格布（距離 0）而不是熊（距離 2）。
誰近綁誰，這正是人讀品名的方式。

## 講不清楚的就說講不清楚

多數品名只寫工法不寫位置（「大熊頭燙鑽針織上衣」）。那不是資料缺漏，
是設計端當時就沒有把位置寫進品名。這種款歸到「位置未言明」，
另外用「這件衣服有哪些結構」來描述它 —— 因為那是品名真的有講的東西。

「這款有披肩，而且有熊」是事實；「熊在披肩上」是推論，而且多半是錯的。
"""
from __future__ import annotations

import re
from typing import Any, Iterable

# 圖騰／裝飾類的特徵詞。位置詞會綁到離它最近的這些詞之一。
FEATURE_TOKENS: dict[str, str] = {
    "熊": r"小熊|熊頭|熊臉|熊掌|熊",
    "格紋": r"格紋|格布|格子|卡格|菱格|千鳥格|格",
    "蕾絲": r"蕾絲|雷絲",
    "荷葉": r"荷葉",
    "蝴蝶結": r"蝴蝶結|蝶結|緞帶",
    "愛心": r"愛心",
    "刺繡": r"刺繡|電繡|繡花",
    "燙鑽": r"燙鑽|水鑽|亮片",
    "網紗": r"網紗|網布",
    "字母": r"字母|文字|LOGO",
    "皇冠": r"皇冠",
}

# 位置詞：衣服上可以「擺東西」的地方
PLACEMENT_TOKENS: dict[str, str] = {
    "口袋": r"口袋",
    "領口": r"領口|領台|領片|領邊",
    "胸前": r"胸前|胸口|前胸",
    "下擺": r"下擺|下襬|裙擺|褲口",
    "袖口": r"袖口",
    "袖": r"袖",
    "肩": r"肩",
    "腰": r"腰",
    "門襟": r"門襟|前襟",
    "帽": r"帽",
    "背": r"後背|背面",
}

# 款式／結構詞 —— 這些詞裡的「肩」「帽」「領」是衣服本身的構造，
# 不是可以擺圖騰的位置。綁定之前一律遮掉。
GARMENT_STRUCTURE = [
    r"披肩", r"露肩", r"挖肩", r"斜肩", r"單肩", r"肩帶", r"連袖", r"落肩",
    # 袖型是款式，不是可以擺圖騰的位置：「寬袖」講的是袖子多寬，
    # 不是「東西放在袖子上」。「袖口」才是位置，所以不放進來。
    r"寬袖", r"窄袖", r"短袖", r"長袖", r"無袖", r"五分袖", r"七分袖", r"九分袖",
    r"泡泡袖", r"澎袖", r"燈籠袖", r"蝴蝶袖", r"羅紋袖", r"喇叭袖", r"蓋袖", r"半袖",
    r"連帽", r"帽T", r"有帽", r"活動帽", r"可拆帽",
    r"平口", r"一字領", r"高領", r"翻領", r"立領", r"V領", r"圓領", r"方領",
    r"船領", r"荷葉領", r"娃娃領", r"襯衫領", r"POLO領", r"羅紋領", r"螺紋領",
    r"假兩件", r"兩件式", r"背心", r"洋裝", r"外套", r"大衣", r"風衣",
    r"針織", r"棉T", r"帽T", r"上衣", r"襯衫", r"衛衣", r"T恤", r"長版",
    r"短裙", r"長裙", r"短褲", r"長褲", r"寬褲", r"褲裙", r"裙褲", r"吊帶",
]
_STRUCT_RE = re.compile("|".join(GARMENT_STRUCTURE))

# 位置詞與特徵詞之間最多隔幾個字還算綁在一起。
# 0 = 緊鄰（口袋熊）；2 容得下一個修飾詞（口袋上方熊頭）。
# 再放寬就會開始把不相干的東西綁在一起。
MAX_GAP = 2


def _mask_structure(name: str) -> str:
    """把款式詞換成同長度的填充字，位置不變、但不再被當成位置詞。

    用同長度替換而不是刪除 —— 距離計算靠字元位置，刪除會讓後面的詞
    全部左移，綁定關係就跟著跑掉。
    """
    return _STRUCT_RE.sub(lambda m: "　" * len(m.group(0)), name)


def analyse(name: str, *, max_gap: int = MAX_GAP) -> dict[str, Any]:
    """拆解一個品名：綁定的位置、未綁定的位置、款式結構。

    回傳
        綁定      {特徵: [位置, …]} —— 品名真的把兩者綁在一起的
        位置未綁  [位置, …]        —— 品名提到位置，但綁的是別的特徵
        結構      [款式詞, …]      —— 這件衣服的構造（不是圖騰位置）
        特徵      [特徵, …]        —— 品名提到的圖騰／裝飾
    """
    masked = _mask_structure(name)

    feats: list[tuple[str, int, int]] = []
    for fname, pat in FEATURE_TOKENS.items():
        for m in re.finditer(pat, masked):
            feats.append((fname, m.start(), m.end()))

    bound: dict[str, list[str]] = {}
    unbound: list[str] = []
    seen_spans: set[tuple[int, int]] = set()

    for pname, pat in PLACEMENT_TOKENS.items():
        for p in re.finditer(pat, masked):
            span = (p.start(), p.end())
            if any(s <= p.start() < e for s, e in seen_spans):
                continue                      # 已被更精確的位置詞吃掉（袖口 vs 袖）
            seen_spans.add(span)
            # 找離這個位置詞最近的特徵；誰近綁誰，這是人讀品名的方式
            best, best_d = None, 10 ** 6
            for fname, fs, fe in feats:
                d = fs - p.end() if fs >= p.end() else p.start() - fe
                if 0 <= d < best_d:
                    best, best_d = fname, d
            if best is not None and best_d <= max_gap:
                bound.setdefault(best, []).append(pname)
            else:
                unbound.append(pname)

    return {
        "綁定": {k: sorted(set(v)) for k, v in bound.items()},
        "位置未綁": sorted(set(unbound)),
        "結構": sorted(set(_STRUCT_RE.findall(name))),
        "特徵": sorted({f for f, _, _ in feats}),
    }


def placement_of(name: str, feature: str = "熊", *,
                 max_gap: int = MAX_GAP) -> list[str]:
    """某個特徵在這個品名裡綁到哪些位置。空清單代表品名沒說。"""
    return analyse(name, max_gap=max_gap)["綁定"].get(feature, [])


def label(name: str, feature: str = "熊", *, max_gap: int = MAX_GAP) -> str:
    """給報表用的單一分類標籤，措辭與證據強度一致。

    有綁定就寫「熊在口袋」；沒有就寫「位置未言明」，
    絕不用「這件有披肩」推成「熊在披肩」。
    """
    a = analyse(name, max_gap=max_gap)
    hit = a["綁定"].get(feature)
    if hit:
        return f"{feature}在{'、'.join(hit)}"
    return "位置未言明"


def explain(name: str, feature: str = "熊") -> str:
    """一句話說明這個品名為什麼被這樣歸類 —— 報表要能被人當場質疑並驗證。"""
    a = analyse(name)
    hit = a["綁定"].get(feature)
    if hit:
        return f"品名把「{feature}」與「{'、'.join(hit)}」寫在一起"
    if a["位置未綁"]:
        owner = [f"{k}在{'、'.join(v)}" for k, v in a["綁定"].items()]
        return ("品名提到" + "、".join(a["位置未綁"]) + "，但那是"
                + ("、".join(owner) if owner else "別的元素")
                + f"，不是{feature}")
    if a["結構"]:
        return ("品名只寫了款式（" + "、".join(a["結構"][:3])
                + f"），沒有說{feature}在哪裡")
    return f"品名沒有提到{feature}的位置"


def summarise(names: Iterable[str], feature: str = "熊") -> dict[str, int]:
    """一批品名的分類統計，用來檢查規則有沒有失控。"""
    from collections import Counter
    return dict(Counter(label(n, feature) for n in names).most_common())
