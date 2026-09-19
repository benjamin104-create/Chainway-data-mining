"""產生穿搭卡的插畫（SVG）。

為什麼自己畫而不用生成式繪圖：
  1. 它畫不好規則格紋 —— 格距會飄、剪接處對不上，而對格正是我們在意的事。
  2. 身形控制不了。這組內容的重點是「10 格 10 種身形」，用 prompt 求不來。
  3. 格子用的是 config/color_codes.yaml 的實際色號，不是它編的土黃色。

這裡畫的是**平塗向量打樣**，用途是確認構圖、身形與格紋配置。
最終畫風（水彩／gouache）還是要靠繪師或生成式工具，
但那時候人物與版型已經被這份打樣定死了，不會再跑掉。

純 stdlib，不呼叫任何模型或 API。

    python content/outfit-cards/make_figures.py

輸出：
    figures/*.svg      11 張獨立插畫
    preview.html       把插畫嵌回預覽頁（取代原本的格子佔位）
"""

from __future__ import annotations

import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
FIGDIR = HERE / "figures"

W, H = 700, 600                      # 每一格的畫布，7:6

# ── 顏色 ──────────────────────────────────────────────────────
# 服裝色全部取自 config/color_codes.yaml；場景色是插畫用的中性色。
GROUND, MAIN, SHADOW = "#E9DBA9", "#CBB465", "#8D7738"   # 37 / 38 / 39
FRAME_C, OVER, ACCENT = "#625239", "#EBECEA", "#AD4039"  # 73 / 80 / 15
CREAM, OAT, BROWN, GREEN = "#F0F0EB", "#D3D3C7", "#35312A", "#414C3B"  # 70/82/78/48

SKIN, SKIN_DK = "#E6C7AC", "#CFA98C"
HAIR, HAIR_HL = "#3A2F28", "#4C3E34"
LINE = "#2E2A24"
WALL, FLOOR, SKIRTING = "#F2EDE2", "#E2D7C2", "#D6C8AE"
WOOD, WOOD_DK, GLASS = "#B48A5C", "#8E6B45", "#E7EBE7"
LIP = "#A8554C"

# sett 的分段（佔一個完整循環的百分比）—— 和 卡其格紋系統.md、preview.html 同一組
SETT = [(0.22, 0.28, MAIN, .60), (0.48, 0.57, SHADOW, .58),
        (0.57, 0.59, OVER, .72), (0.59, 0.68, SHADOW, .58),
        (0.88, 0.93, FRAME_C, .66), (0.93, 0.95, ACCENT, .78),
        (0.95, 1.00, FRAME_C, .66)]

SCALES = {"large": 92, "medium": 46, "small": 21}


# ── 小工具 ────────────────────────────────────────────────────
def f(v: float) -> str:
    """數字轉字串，砍掉沒意義的小數位，讓 SVG 小一點也好讀。"""
    return f"{v:.1f}".rstrip("0").rstrip(".")


def smooth(pts: list[tuple[float, float]], tension: float = 2.6) -> str:
    """經過一串點的平滑曲線。控制點取垂直方向，適合大致直立的輪廓。"""
    d = [f"M{f(pts[0][0])},{f(pts[0][1])}"]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        dy = (y1 - y0) / tension
        d.append(f"C{f(x0)},{f(y0 + dy)} {f(x1)},{f(y1 - dy)} {f(x1)},{f(y1)}")
    return " ".join(d)


def shape(left: list[tuple[float, float]], right: list[tuple[float, float]]) -> str:
    """左右兩條邊（都由上往下）圍成的封閉塊。"""
    return smooth(left) + " L" + f(right[-1][0]) + "," + f(right[-1][1]) + \
           " " + smooth(right[::-1])[1:] + " Z"


def ribbon(mid: list[tuple[float, float]], half: list[float]) -> str:
    """給中線與逐點半寬 —— 手臂與腿用這個，可以自然收細。"""
    return shape([(x - w, y) for (x, y), w in zip(mid, half)],
                 [(x + w, y) for (x, y), w in zip(mid, half)])


def tartan_defs() -> str:
    """三種格子尺寸 + 一個斜格，做成 SVG pattern。"""
    out = []
    for name, size in SCALES.items():
        bands = [f'<rect width="{size}" height="{size}" fill="{GROUND}"/>']
        for a, b, c, o in SETT:                       # 直向
            bands.append(f'<rect x="{f(a*size)}" width="{f((b-a)*size)}" '
                         f'height="{size}" fill="{c}" opacity="{o}"/>')
        for a, b, c, o in SETT:                       # 橫向
            bands.append(f'<rect y="{f(a*size)}" width="{size}" '
                         f'height="{f((b-a)*size)}" fill="{c}" opacity="{o}"/>')
        body = "".join(bands)
        out.append(f'<pattern id="t-{name}" width="{size}" height="{size}" '
                   f'patternUnits="userSpaceOnUse">{body}</pattern>')
        out.append(f'<pattern id="t-{name}-bias" width="{size}" height="{size}" '
                   f'patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
                   f'{body}</pattern>')
    return "".join(out)


def T(scale: str = "medium", bias: bool = False) -> str:
    return f"url(#t-{scale}{'-bias' if bias else ''})"


# ── 身形 ──────────────────────────────────────────────────────
# 每一個數字都對應到卡片上那句建議。改這裡，圖就跟著改。
CROQUIS = dict(shoulder=44, bust=38, waist=29, hip=44, neck_len=20, neck_w=9,
            thigh=21, knee=14, ankle=8, upper_arm=9.5, wrist=5,
            torso=145, leg=200, slope=6)

BODIES = {
    # 2 腿
    "legs_full":  dict(thigh=29, knee=19, ankle=10, hip=48, waist=33),
    "legs_short": dict(torso=163, leg=178, waist=30),
    # 3 肩
    "sh_narrow":  dict(shoulder=36, slope=12, bust=36),
    "sh_broad":   dict(shoulder=54, slope=1, bust=42, waist=34),
    # 4 頸
    "neck_short": dict(neck_len=9, neck_w=11, shoulder=46, slope=3),
    "neck_long":  dict(neck_len=30, neck_w=8, slope=11),
    # 5 腰
    "hourglass":  dict(bust=41, waist=24, hip=46),
    "straight":   dict(bust=35, waist=35, hip=37, thigh=22),
    # 6 臂
    "arms_full":  dict(upper_arm=15, wrist=7.5, shoulder=46),
    "arms_slim":  dict(upper_arm=7, wrist=4.5, shoulder=40),
    "neutral":    dict(),
}


def metrics(body: str, cx: float, top: float) -> dict:
    b = dict(CROQUIS, **BODIES[body])
    head_ry = 26
    b["head_cy"] = top + head_ry
    b["neck_top"] = top + head_ry * 2 - 3
    b["shoulder_y"] = b["neck_top"] + b["neck_len"]
    b["bust_y"] = b["shoulder_y"] + b["torso"] * 0.32
    b["waist_y"] = b["shoulder_y"] + b["torso"] * 0.66
    b["hip_y"] = b["shoulder_y"] + b["torso"]
    b["knee_y"] = b["hip_y"] + b["leg"] * 0.52
    b["ankle_y"] = b["hip_y"] + b["leg"]
    b["cx"], b["head_ry"], b["head_rx"] = cx, head_ry, 19
    return b


# ── 人 ────────────────────────────────────────────────────────
def head(b: dict, back: bool = False) -> str:
    cx, cy, rx, ry = b["cx"], b["head_cy"], b["head_rx"], b["head_ry"]
    p = []
    # 低髮髻，收在頸後
    p.append(f'<ellipse cx="{f(cx + rx*0.72)}" cy="{f(cy + ry*0.62)}" '
             f'rx="13" ry="11" fill="{HAIR}"/>')
    if back:
        p.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{rx}" ry="{ry}" fill="{HAIR}"/>')
        return "".join(p)
    p.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{rx}" ry="{ry}" fill="{SKIN}"/>')
    # 髮 —— 從額頭包到兩鬢，不是漫畫的碎髮亂翹
    p.append(f'<path d="M{f(cx-rx-1)},{f(cy+2)} '
             f'C{f(cx-rx-1)},{f(cy-ry*1.05)} {f(cx+rx+1)},{f(cy-ry*1.05)} '
             f'{f(cx+rx+1)},{f(cy+2)} '
             f'C{f(cx+rx*0.7)},{f(cy-ry*0.36)} {f(cx-rx*0.7)},{f(cy-ry*0.36)} '
             f'{f(cx-rx-1)},{f(cy+2)} Z" fill="{HAIR}"/>')
    p.append(f'<path d="M{f(cx-rx-1)},{f(cy+1)} q-1,{f(ry*0.5)} 3,{f(ry*0.72)}" '
             f'stroke="{HAIR}" stroke-width="3.5" fill="none" stroke-linecap="round"/>')
    p.append(f'<path d="M{f(cx+rx+1)},{f(cy+1)} q1,{f(ry*0.5)} -3,{f(ry*0.72)}" '
             f'stroke="{HAIR}" stroke-width="3.5" fill="none" stroke-linecap="round"/>')
    # 五官：克制。時裝插畫的傳統是臉輕、衣服重。
    ey = cy + 1
    for s in (-1, 1):
        p.append(f'<path d="M{f(cx + s*8.5 - 3.2)},{f(ey)} q3.2,-2.6 6.4,0" '
                 f'stroke="{LINE}" stroke-width="1.7" fill="none" stroke-linecap="round"/>')
    p.append(f'<path d="M{f(cx-2.6)},{f(cy+12.5)} q2.6,2.4 5.2,0" '
             f'stroke="{LIP}" stroke-width="1.7" fill="none" stroke-linecap="round"/>')
    p.append(f'<circle cx="{f(cx - rx - 2)}" cy="{f(cy + 5)}" r="2.2" fill="{MAIN}"/>')
    p.append(f'<circle cx="{f(cx + rx + 2)}" cy="{f(cy + 5)}" r="2.2" fill="{MAIN}"/>')
    return "".join(p)


def neck_and_torso(b: dict) -> str:
    cx, nw = b["cx"], b["neck_w"]
    return (f'<rect x="{f(cx-nw)}" y="{f(b["neck_top"]-4)}" width="{f(nw*2)}" '
            f'height="{f(b["neck_len"]+8)}" fill="{SKIN}"/>'
            + f'<path d="{shape(torso_edge(b, -1), torso_edge(b, 1))}" fill="{SKIN}"/>')


def torso_edge(b: dict, s: int) -> list[tuple[float, float]]:
    cx = b["cx"]
    return [(cx + s * b["shoulder"], b["shoulder_y"]),
            (cx + s * b["bust"], b["bust_y"]),
            (cx + s * b["waist"], b["waist_y"]),
            (cx + s * b["hip"], b["hip_y"])]


def arms(b: dict, sleeve_to: float | None = None) -> str:
    """手臂。sleeve_to 是袖子蓋到哪一個 y —— 那一段畫成布，不是皮膚。"""
    cx, ua, wr = b["cx"], b["upper_arm"], b["wrist"]
    out = []
    for s in (-1, 1):
        mid = [(cx + s * (b["shoulder"] - 2), b["shoulder_y"] + 4),
               (cx + s * (b["shoulder"] + 3), b["bust_y"] + 8),
               (cx + s * (b["waist"] + ua + 7), b["waist_y"] + 18),
               (cx + s * (b["hip"] + 2), b["hip_y"] + 26)]
        out.append(f'<path d="{ribbon(mid, [ua, ua*0.94, ua*0.74, wr])}" fill="{SKIN}"/>')
    return "".join(out)


def legs(b: dict) -> str:
    cx = b["cx"]
    out = []
    for s in (-1, 1):
        mid = [(cx + s * b["hip"] * 0.46, b["hip_y"] - 4),
               (cx + s * b["hip"] * 0.44, b["knee_y"]),
               (cx + s * b["hip"] * 0.40, b["ankle_y"])]
        out.append(f'<path d="{ribbon(mid, [b["thigh"], b["knee"], b["ankle"]])}" '
                   f'fill="{SKIN}"/>')
        fx = cx + s * b["hip"] * 0.4
        out.append(f'<path d="M{f(fx-b["ankle"]-1)},{f(b["ankle_y"]+2)} '
                   f'L{f(fx+b["ankle"]+1)},{f(b["ankle_y"]+2)} '
                   f'L{f(fx+b["ankle"]+4)},{f(b["ankle_y"]+13)} '
                   f'L{f(fx-b["ankle"]-4)},{f(b["ankle_y"]+13)} Z" fill="{BROWN}"/>')
    return "".join(out)


# ── 服裝 ──────────────────────────────────────────────────────
def top(b: dict, fill: str, hem: float, neckline: str = "round",
        ease: float = 5) -> str:
    """上身。neckline: round / v / turtle / strap。"""
    cx = b["cx"]
    left = [(x - ease, y) for x, y in torso_edge(b, -1)]
    right = [(x + ease, y) for x, y in torso_edge(b, 1)]
    left = [(x, y) for x, y in left if y < hem] + [(left[-1][0], hem)]
    right = [(x, y) for x, y in right if y < hem] + [(right[-1][0], hem)]
    body = f'<path d="{shape(left, right)}" fill="{fill}"/>'

    sy, nw = b["shoulder_y"], b["neck_w"]
    if neckline == "v":
        cut = (f'<path d="M{f(cx-nw-4)},{f(sy-2)} L{f(cx)},{f(sy+46)} '
               f'L{f(cx+nw+4)},{f(sy-2)} Z" fill="{SKIN}"/>')
    elif neckline == "turtle":
        cut = (f'<rect x="{f(cx-nw-4)}" y="{f(b["neck_top"]-2)}" width="{f((nw+4)*2)}" '
               f'height="{f(b["neck_len"]+8)}" rx="4" fill="{fill}"/>')
    elif neckline == "strap":
        cut = (f'<path d="M{f(cx-b["bust"]*0.72)},{f(sy+16)} '
               f'L{f(cx+b["bust"]*0.72)},{f(sy+16)} L{f(cx+b["bust"]*0.72)},{f(sy-4)} '
               f'L{f(cx-b["bust"]*0.72)},{f(sy-4)} Z" fill="{SKIN}"/>')
    else:
        cut = (f'<ellipse cx="{f(cx)}" cy="{f(sy-1)}" rx="{f(nw+5)}" ry="9" '
               f'fill="{SKIN}"/>')
    return body + cut


def sleeves(b: dict, kind: str, fill: str) -> str:
    """puff 泡泡袖 / flutter 小飛袖 / cap 短袖。"""
    cx, sy, sh = b["cx"], b["shoulder_y"], b["shoulder"]
    out = []
    for s in (-1, 1):
        x = cx + s * sh
        if kind == "puff":
            out.append(f'<ellipse cx="{f(x + s*2)}" cy="{f(sy+21)}" rx="24" ry="26" '
                       f'fill="{fill}"/>')
        elif kind == "flutter":
            out.append(f'<path d="M{f(x - s*6)},{f(sy+2)} '
                       f'Q{f(x + s*26)},{f(sy+14)} {f(x + s*17)},{f(sy+42)} '
                       f'Q{f(x + s*2)},{f(sy+30)} {f(x - s*6)},{f(sy+2)} Z" '
                       f'fill="{fill}"/>')
        elif kind == "cap":
            out.append(f'<path d="M{f(x - s*8)},{f(sy)} Q{f(x + s*12)},{f(sy+6)} '
                       f'{f(x + s*8)},{f(sy+30)} L{f(x - s*10)},{f(sy+26)} Z" '
                       f'fill="{fill}"/>')
    return "".join(out)


def straps(b: dict, fill: str) -> str:
    cx, sy = b["cx"], b["shoulder_y"]
    return "".join(
        f'<path d="M{f(cx + s*(b["neck_w"]+7))},{f(sy-6)} '
        f'L{f(cx + s*b["bust"]*0.62)},{f(sy+18)}" stroke="{fill}" stroke-width="7" '
        f'stroke-linecap="round" fill="none"/>' for s in (-1, 1))


def skirt(b: dict, fill: str, top_y: float, hem: float, flare: float = 1.0,
          rise: float = 0) -> str:
    cx = b["cx"]
    top_w = b["waist"] + 6 if rise else b["hip"] + 5
    top_y = top_y - rise
    hem_w = top_w + (hem - top_y) * 0.30 * flare
    return (f'<path d="M{f(cx-top_w)},{f(top_y)} L{f(cx+top_w)},{f(top_y)} '
            f'C{f(cx+top_w+hem_w*0.15)},{f(top_y+(hem-top_y)*0.6)} '
            f'{f(cx+hem_w)},{f(hem-14)} {f(cx+hem_w)},{f(hem)} '
            f'Q{f(cx)},{f(hem+13*flare)} {f(cx-hem_w)},{f(hem)} '
            f'C{f(cx-hem_w)},{f(hem-14)} {f(cx-top_w-hem_w*0.15)},'
            f'{f(top_y+(hem-top_y)*0.6)} {f(cx-top_w)},{f(top_y)} Z" fill="{fill}"/>')


def trousers(b: dict, fill: str, hem: float, width: float = 1.1,
             rise: float = 0) -> str:
    """褲。width 是褲口相對大腿的倍數：1.0 直筒、1.55 闊腿。rise 是腰頭上提。

    重點在褲襠：兩條腿一定要分得開。少了這個分岔，闊腿褲會變成一塊布，
    「腿型偏壯穿闊腿褲」那句話就完全看不出來。
    """
    cx, hipw = b["cx"], b["hip"] + 5
    top_y = b["hip_y"] - b["torso"] * 0.34 - rise
    crotch, gap = b["hip_y"] + 16, 5
    tw = (hipw - gap) / 2                      # 大腿處半寬
    lw = tw * width                            # 褲口半寬
    out = [f'<path d="M{f(cx-b["waist"]-6)},{f(top_y)} '
           f'L{f(cx+b["waist"]+6)},{f(top_y)} '
           f'C{f(cx+hipw)},{f(b["hip_y"]-26)} {f(cx+hipw)},{f(b["hip_y"])} '
           f'{f(cx+hipw)},{f(crotch)} L{f(cx-hipw)},{f(crotch)} '
           f'C{f(cx-hipw)},{f(b["hip_y"])} {f(cx-hipw)},{f(b["hip_y"]-26)} '
           f'{f(cx-b["waist"]-6)},{f(top_y)} Z" fill="{fill}"/>']
    for s_ in (-1, 1):
        tx, hx = cx + s_ * (tw + gap), cx + s_ * (lw + gap)
        out.append(f'<path d="M{f(tx-tw)},{f(crotch-3)} L{f(tx+tw)},{f(crotch-3)} '
                   f'L{f(hx+lw)},{f(hem)} L{f(hx-lw)},{f(hem)} Z" fill="{fill}"/>')
    out.append(f'<rect x="{f(cx-b["waist"]-7)}" y="{f(top_y-2)}" '
               f'width="{f((b["waist"]+7)*2)}" height="11" fill="{fill}"/>')
    return "".join(out)


def band(b: dict, fill: str, y: float, h: float = 13, w: float | None = None) -> str:
    """腰頭／下擺的格紋橫帶。"""
    cx = b["cx"]
    w = w if w is not None else b["waist"] + 8
    return f'<rect x="{f(cx-w)}" y="{f(y)}" width="{f(w*2)}" height="{f(h)}" fill="{fill}"/>'


# ── 場景 ──────────────────────────────────────────────────────
def scene() -> str:
    p = [f'<rect width="{W}" height="{H}" fill="{WALL}"/>',
         f'<rect y="452" width="{W}" height="{H-452}" fill="{FLOOR}"/>',
         f'<rect y="446" width="{W}" height="7" fill="{SKIRTING}"/>',
         # 窗光
         f'<path d="M96,0 L214,0 L172,446 L54,446 Z" fill="#FFFFFF" opacity=".34"/>']
    # 落地鏡：照出背面，原圖這個結構做得對，留著
    p += [f'<rect x="16" y="74" width="180" height="474" rx="5" fill="{WOOD}"/>',
          f'<rect x="30" y="88" width="152" height="446" rx="3" fill="{GLASS}"/>',
          f'<path d="M30,88 L110,88 L30,310 Z" fill="#FFFFFF" opacity=".5"/>']
    # 衣桿：實木、同色系衣架，不是原圖的塑膠架與雜物
    p += [f'<rect x="516" y="168" width="8" height="330" fill="{WOOD_DK}"/>',
          f'<rect x="662" y="168" width="8" height="330" fill="{WOOD_DK}"/>',
          f'<rect x="512" y="168" width="162" height="8" rx="4" fill="{WOOD_DK}"/>']
    for i, col in enumerate([CREAM, T("small"), OAT, GREEN]):
        x = 530 + i * 32
        p.append(f'<path d="M{x},181 l8,-8 l8,8" stroke="{WOOD_DK}" stroke-width="2.4" '
                 f'fill="none"/>')
        p.append(f'<path d="M{x-4},186 L{x+20},186 L{x+26},300 L{x-10},300 Z" '
                 f'fill="{col}"/>')
    return "".join(p)


def back_view(top_fill: str, bottom_fill: str) -> str:
    """鏡中的背影。不畫臉，髮髻朝外。"""
    s, cx, top_y = 0.66, 106, 176
    b = {k: CROQUIS[k] * s for k in CROQUIS}
    b["cx"], b["head_rx"], b["head_ry"] = cx, 19 * s, 26 * s
    b["head_cy"] = top_y + b["head_ry"]
    b["neck_top"] = top_y + b["head_ry"] * 2 - 2
    b["shoulder_y"] = b["neck_top"] + b["neck_len"]
    b["bust_y"] = b["shoulder_y"] + b["torso"] * 0.32
    b["waist_y"] = b["shoulder_y"] + b["torso"] * 0.66
    b["hip_y"] = b["shoulder_y"] + b["torso"]
    b["knee_y"] = b["hip_y"] + b["leg"] * 0.52
    b["ankle_y"] = b["hip_y"] + b["leg"]
    inner = [legs(b)]
    inner.append(neck_and_torso(b))
    inner.append(head(b, back=True))
    inner.append(arms(b))
    inner.append(skirt(b, bottom_fill, b["hip_y"] - 4, b["ankle_y"] - 16))
    inner.append(top(b, top_fill, b["hip_y"] - 6))
    return f'<g opacity=".92">{"".join(inner)}</g>'


# ── 11 格 ─────────────────────────────────────────────────────
def figure(body: str, draw) -> str:
    b = metrics(body, 350, 86)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
            f'width="{W}" height="{H}" role="img">'
            f'<defs>{tartan_defs()}</defs>{scene()}'
            f'{back_view(CREAM, OAT)}'
            f'<g transform="translate(350,540) scale(1.12) translate(-350,-540)">'
            f'{legs(b)}{neck_and_torso(b)}{draw(b)}{head(b)}</g></svg>')


def c1(b):   # 封面：格紋裙 ＋ 素面針織
    return (skirt(b, T("medium"), b["hip_y"] - 6, b["ankle_y"] - 40, flare=.8)
            + top(b, CREAM, b["hip_y"] - 12) + arms(b) + sleeves(b, "cap", CREAM))


def c2t(b):  # 闊腿褲，格紋收在腰頭
    return (trousers(b, OAT, b["ankle_y"] - 4, width=1.55)
            + band(b, T("small"), b["hip_y"] - b["torso"] * 0.34 - 3, 15)
            + top(b, CREAM, b["hip_y"] - b["torso"] * 0.34) + arms(b)
            + sleeves(b, "cap", CREAM))


def c2b(b):  # 高腰褲，格子走直不走橫
    return (trousers(b, T("medium"), b["ankle_y"] - 4, width=1.15, rise=26)
            + top(b, BROWN, b["waist_y"] - 8) + arms(b) + sleeves(b, "cap", BROWN))


def c3t(b):  # 泡泡袖，格紋放在袖子上
    return (trousers(b, OAT, b["ankle_y"] - 4, width=1.35)
            + top(b, CREAM, b["hip_y"] - b["torso"] * 0.3) + arms(b)
            + sleeves(b, "puff", T("medium")))


def c3b(b):  # 馬甲，格紋只留一條滾邊
    cx = b["cx"]
    vest = top(b, BROWN, b["hip_y"] - 24, neckline="v", ease=7)
    piping = (f'<path d="M{f(cx-b["neck_w"]-11)},{f(b["shoulder_y"]-2)} '
              f'L{f(cx)},{f(b["shoulder_y"]+46)} '
              f'L{f(cx+b["neck_w"]+11)},{f(b["shoulder_y"]-2)}" '
              f'stroke="{T("small")}" stroke-width="7" fill="none" '
              f'stroke-linejoin="round"/>')
    return (trousers(b, OAT, b["ankle_y"] - 4, width=1.35)
            + top(b, CREAM, b["hip_y"] - 30) + arms(b) + vest + piping)


def c4t(b):  # V 領，格紋往下擺走
    hem = b["hip_y"] - 16
    return (trousers(b, BROWN, b["ankle_y"] - 4, width=1.0)
            + top(b, CREAM, hem, neckline="v")
            + band(b, T("medium"), hem - 15, 16, b["hip"] + 6)
            + arms(b) + sleeves(b, "cap", CREAM))


def c4b(b):  # 高領，格紋就該放在這裡
    return (trousers(b, OAT, b["ankle_y"] - 4, width=1.1, rise=20)
            + top(b, T("small"), b["waist_y"] - 6, neckline="turtle")
            + arms(b) + sleeves(b, "cap", T("small")))


def c5t(b):  # 收腰裙，腰線對準格子（斜格）
    return (skirt(b, T("medium", bias=True), b["waist_y"] + 6, b["ankle_y"] - 74,
                  flare=1.5)
            + top(b, T("medium", bias=True), b["waist_y"] + 8, neckline="v")
            + band(b, SHADOW, b["waist_y"] - 3, 9, b["waist"] + 7)
            + arms(b) + sleeves(b, "cap", T("medium", bias=True)))


def c5b(b):  # 直筒裙，格子換小一號
    return (skirt(b, T("small"), b["hip_y"] - 8, b["ankle_y"] - 52, flare=.18)
            + top(b, BROWN, b["hip_y"] + 4, ease=9) + arms(b)
            + sleeves(b, "cap", BROWN))


def c6t(b):  # 小飛袖，格紋做在袖片上
    return (skirt(b, OAT, b["hip_y"] - 6, b["ankle_y"] - 60, flare=.5)
            + top(b, CREAM, b["hip_y"] - 10) + arms(b)
            + sleeves(b, "flutter", T("small")))


def c6b(b):  # 細肩帶，格紋收進肩帶裡
    return (trousers(b, BROWN, b["ankle_y"] - 4, width=1.1, rise=22)
            + arms(b) + top(b, CREAM, b["waist_y"] - 6, neckline="strap")
            + straps(b, T("small")))


PANELS = [("c1", "neutral", c1), ("c2t", "legs_full", c2t), ("c2b", "legs_short", c2b),
          ("c3t", "sh_narrow", c3t), ("c3b", "sh_broad", c3b),
          ("c4t", "neck_short", c4t), ("c4b", "neck_long", c4b),
          ("c5t", "hourglass", c5t), ("c5b", "straight", c5b),
          ("c6t", "arms_full", c6t), ("c6b", "arms_slim", c6b)]


def main() -> None:
    FIGDIR.mkdir(exist_ok=True)
    figs = {}
    for key, body, draw in PANELS:
        svg = figure(body, draw)
        (FIGDIR / f"{key}.svg").write_text(svg, encoding="utf-8")
        figs[key] = svg
    print(f"寫出 {len(figs)} 張 → {FIGDIR}")

    html = HERE / "preview.html"
    s = html.read_text(encoding="utf-8")
    block = ("<!--FIGS-START--><script>window.FIGS=" +
             json.dumps(figs, ensure_ascii=False) + ";</script><!--FIGS-END-->")
    a, z = "<!--FIGS-START-->", "<!--FIGS-END-->"
    if a in s and z in s:
        s = s[:s.index(a)] + block + s[s.index(z) + len(z):]
    else:
        s = s.replace("</head>", block + "\n</head>", 1)
    html.write_text(s, encoding="utf-8")
    print(f"嵌回 {html.name}（{html.stat().st_size // 1024} KB）")


if __name__ == "__main__":
    main()
