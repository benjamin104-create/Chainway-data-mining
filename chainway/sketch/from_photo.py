"""市調照片 → 分類代碼，讓規格書與繪圖 prompt 有東西可寫。

## 為什麼要有這一支

`sketch --image ... --auto` 原本會產出這樣的 prompt：

    A womenswear top with .

那個懸空的「with .」是因為 `--auto` 這條路從來沒有人餵屬性進去，
而 `build_prompt` 收到空字典還是照樣把句型拼出來。貼進 Firefly 會得到
一件跟市調照片毫無關係的普通上衣 —— **而且看起來很正常**，因為
它確實是一張機械圖。同一份 spec.md 只有兩行標題，內容整個是空的。

這一段從來沒有人跑過（跑之前 `data/outputs/sketches/` 是空的），
所以這個洞一直在那裡。

## 補的方式：用已經有的量測

`vision.attributes.describe()` 量得出領型、袖長、衣長。把它翻成
taxonomy 的代碼，規格書與 prompt 就有內容了。

## 兩件不肯猜的事

**一、量不到就寫「量不到」，不填一個看起來合理的預設值。**
市調圖是街拍、電商截圖、模特兒穿著的照片，不是白底正面平拍。
量測本來就會有一部分失敗。填預設值會讓規格書看起來完整 ——
而一份看起來完整、其實有一半是猜的規格書，比一份誠實留白的危險得多。

**二、對應不到唯一代碼的，標成 uncertain。**
量測的「五分～七分袖」對到 taxonomy 是 `elbow_sleeve`（五分）
或 `three_quarter`（七分）兩個，分不出來就不選。
`build_spec` 與 `build_prompt` 都會跳過 uncertain。

## 這支程式不做的事

不判斷版型（合身／寬鬆）、不判斷工法、不判斷面料 —— 那些從一張照片
量不出來，需要人看。規格書會把這幾項列成「待人工填寫」，
而不是靜靜地缺席。
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

# 量測標籤 → taxonomy 代碼。對不到唯一代碼的一律 uncertain，不猜。
NECK_TO_CODE = {
    "圓領": "round_neck",
    "寬圓領": "round_neck",          # taxonomy 沒有分寬窄，歸圓領
    "深 V／U 領": "v_neck",
    "高領/密合": "stand_collar",
    "一字／船型領": "boat_neck",
    "大開領": "uncertain",           # 可能是方領、大圓領或垂墜領，分不出來
}
SLEEVE_TO_CODE = {
    "無袖／背心": "sleeveless",
    "蓋袖": "cap_sleeve",
    "短袖": "short_sleeve",
    "五分～七分袖": "uncertain",      # 五分與七分是兩個代碼，量測分不出來
    "長袖": "long_sleeve",
}
LENGTH_TO_CODE = {
    "短版": "cropped",
    "正常身長": "regular",
    "長版": "longline",
    "長版／長罩衫": "longline",
}

# 衣服佔畫面的比例上限。超過就不當它是一件衣服，不管共用閘門怎麼說。
#
# 為什麼要在共用閘門之外再擋一道：閘門靠「邊緣是不是一片乾淨的背景」
# 判斷，而它有一個盲點 —— 一張**平整、均勻、滿版**的圖，邊緣那一圈
# 剛好也是乾淨的。實測一張人造的格紋布樣：edge_bg 0.73、ring_sd 0.0，
# 完全通過閘門，然後量出「立領＋無袖＋短版」，寫進規格書。
#
# 那張是我為了測試畫的，週期完美、沒有雜訊，比真實布料照乾淨得多，
# 所以這不代表共用閘門在真實圖上壞掉（它在 10 張真實圖上是 10/10）。
# 但市調圖裡確實有一整類長這樣：電商平拍、去背後滿版的截圖。
#
# 所以這裡加一道**獨立的**檢查，而不是去動那個已經驗過的閘門：
# 一件衣服不可能佔掉九成畫面還量得出領口和袖子 —— 領口與袖子是靠
# 「衣服外面的背景」找出來的，沒有背景就沒有輪廓。
# 實測：那張市調圖 0.37，布樣 0.92。0.80 落在兩者之間很寬的空檔裡。
FILL_MAX = 0.80

# 從照片量不出來、一定要人填的。列出來而不是省略 ——
# 規格書上少一項，看的人不會發現；寫著「待人工填寫」才會。
NEEDS_HUMAN = {
    "silhouette_top": "版型（合身／直筒／A字／寬鬆落肩）",
    "fabric_look": "面料屬性",
    "closure": "開合方式",
    "detail_top": "細節工藝",
}


def attributes_from_photo(image: str | Path, *, category: str = "TOP"
                          ) -> tuple[dict[str, str], dict[str, Any]]:
    """量一張照片，回傳 (taxonomy 屬性, 量測原始結果)。

    量不到的屬性**不會出現在回傳的字典裡** —— 不是給一個空字串或預設值。
    呼叫端因此分得出「量到但不確定」（uncertain）與「根本沒量到」（缺席）。
    """
    from ..imageio import load_rgb
    from ..vision.attributes import describe

    img = load_rgb(image)
    # describe() 回的是**平的**字典（領型／袖長／衣長 直接在最上層），
    # 不是巢狀的。閘門那一欄叫「可判讀」不叫「可用」。
    d = describe(img, category=None)
    out: dict[str, str] = {}
    if not d.get("可判讀", True) or d.get("非衣物"):
        return out, d

    # 共用閘門之外的第二道，理由見 FILL_MAX
    try:
        from ..ingest.image_kind import _stats

        fill = float(_stats(img).get("fill", 0.0))
    except Exception:
        fill = 0.0
    if fill > FILL_MAX:
        d = {**d, "可判讀": False,
             "不判讀原因": f"衣服佔了畫面 {fill:.0%}，幾乎沒有背景 —— "
                           f"看起來是布料或滿版的平拍圖，不是一件衣服。"
                           f"沒有背景就找不到輪廓，領口與袖長量不得。"}
        return {}, d

    for key, table, attr in (("領型", NECK_TO_CODE, "collar"),
                             ("袖長", SLEEVE_TO_CODE, "sleeve"),
                             ("衣長", LENGTH_TO_CODE, "length_top")):
        label = d.get(key)
        if label in (None, "", "量不到"):
            continue          # 沒量到就不寫這一項，不填預設值
        code = table.get(label, "uncertain")
        out[attr] = code
    return out, d


def unmeasured_note(attrs: dict[str, str], measured: dict[str, Any]) -> list[str]:
    """規格書要附的「這幾項是量的、這幾項要人填」說明。"""
    notes: list[str] = []
    got = [k for k, v in attrs.items() if v not in ("uncertain", None, "")]
    if got:
        notes.append("以上帶「量測」的項目是從市調照片量出來的，不是人判讀的；"
                     "量測在街拍與模特兒照上的準確率沒有驗證過，請當草稿看。")
    unsure = [k for k, v in attrs.items() if v == "uncertain"]
    if unsure:
        notes.append("量到但分不出唯一選項（例如五分袖與七分袖），"
                     "已略過，請人工補：" + "、".join(unsure))
    missing = [zh for k, zh in NEEDS_HUMAN.items() if k not in attrs]
    if missing:
        notes.append("從一張照片量不出來、一定要人填：" + "、".join(missing))
    if not measured.get("可判讀", True) or measured.get("非衣物"):
        why = (measured.get("不判讀原因") or measured.get("描述") or "")
        notes.append("★ 這張照片沒有通過「是不是一件完整衣服」的判斷："
                     + str(why) + " 所以整份規格沒有任何量測值，"
                     "全部要人工填寫。")
    return notes
