"""產生穿搭卡的插畫（SVG）。

為什麼自己畫而不用生成式繪圖：
  1. 它畫不好規則格紋 —— 格距會飄、剪接處對不上，而對格正是我們在意的事。
  2. 身形控制不了。這組內容的重點是「10 格 10 種身形」，用 prompt 求不來。
  3. 格子用的是 config/color_codes.yaml 的實際色號，不是它編的土黃色。
  4. 這個環境本來也沒有 text-to-image 工具可以呼叫。第 1～3 點成立，
     但不講第 4 點就是避重就輕。

畫風是平塗向量 + 輪廓線 + 單向受光，不是水彩厚塗。它到不了原圖那種質感，
但構圖、身形、格紋配置、姿勢全部可控，而且改一個數字就整組重畫。

**姿勢會指向該格在講的部位** —— 講領口就摸領口，講袖子就摸袖子。
原圖 12 格都是同一個站姿，這是它漏掉的。

純 stdlib，不呼叫任何模型或 API。

    python content/outfit-cards/make_figures.py

輸出：
    figures/*.svg      11 張獨立插畫
    preview.html       把插畫嵌回預覽頁
"""

from __future__ import annotations

import json
import math
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
FIGDIR = HERE / "figures"

W, H = 700, 600                      # 每一格的畫布，7:6

# ── 顏色 ──────────────────────────────────────────────────────
# 服裝色全部取自 config/color_codes.yaml；場景與膚色是插畫用的中性色。
GROUND, MAIN, SHADOW = "#E9DBA9", "#CBB465", "#8D7738"   # 37 / 38 / 39
FRAME_C, OVER, ACCENT = "#625239", "#EBECEA", "#AD4039"  # 73 / 80 / 15
CREAM, OAT, BROWN, GREEN = "#F0F0EB", "#D3D3C7", "#35312A", "#414C3B"  # 70/82/78/48

SKIN, SKIN_DK = "#E8CBB0", "#D2A98C"
HAIR, HAIR_HL = "#3E332B", "#5A4A3C"
INK = "#473C32"                      # 輪廓線
LIP, BROW = "#A8554C", "#4A3A2E"
WALL, FLOOR, SKIRTING = "#F3EEE3", "#E3D8C4", "#D5C7AD"
WOOD, WOOD_DK, GLASS = "#B48A5C", "#8E6B45", "#E8ECE8"
LEAF, POT = "#5C7350", "#C9AF93"

# sett 的分段（佔一個完整循環的百分比）—— 和 卡其格紋系統.md、preview.html 同一組
SETT = [(0.22, 0.28, MAIN, .60), (0.48, 0.57, SHADOW, .58),
        (0.57, 0.59, OVER, .72), (0.59, 0.68, SHADOW, .58),
        (0.88, 0.93, FRAME_C, .66), (0.93, 0.95, ACCENT, .78),
        (0.95, 1.00, FRAME_C, .66)]

SCALES = {"large": 92, "medium": 46, "small": 21}

Pt = tuple[float, float]


# ── 幾何小工具 ────────────────────────────────────────────────
def f(v: float) -> str:
    """數字轉字串，砍掉沒意義的小數位。"""
    return f"{v:.1f}".rstrip("0").rstrip(".")


def curve(pts: list[Pt], k: float = 0.42) -> str:
    """Catmull-Rom 轉三次貝茲。

    上一版用「控制點固定往垂直方向拉」，直立的輪廓沒問題，
    但手一彎（路徑往上折回來）就會打結。這個版本吃任何走向的點列。
    """
    if len(pts) < 2:
        return ""
    d = [f"M{f(pts[0][0])},{f(pts[0][1])}"]
    for i in range(len(pts) - 1):
        p0 = pts[i - 1] if i else pts[0]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < len(pts) else p2
        c1 = (p1[0] + (p2[0] - p0[0]) * k / 2, p1[1] + (p2[1] - p0[1]) * k / 2)
        c2 = (p2[0] - (p3[0] - p1[0]) * k / 2, p2[1] - (p3[1] - p1[1]) * k / 2)
        d.append(f"C{f(c1[0])},{f(c1[1])} {f(c2[0])},{f(c2[1])} {f(p2[0])},{f(p2[1])}")
    return " ".join(d)


def closed(left: list[Pt], right: list[Pt]) -> str:
    """左右兩條邊（都由上往下）圍成的封閉塊。"""
    return (curve(left) + f" L{f(right[-1][0])},{f(right[-1][1])} "
            + curve(right[::-1])[1:].lstrip() + " Z")


def ribbon(mid: list[Pt], half: list[float]) -> str:
    """中線 + 逐點半寬 → 封閉塊。偏移取**法線**方向，所以彎起來也不會扁。"""
    norms = []
    for i, _ in enumerate(mid):
        x0, y0 = mid[max(i - 1, 0)]
        x1, y1 = mid[min(i + 1, len(mid) - 1)]
        dx, dy = x1 - x0, y1 - y0
        L = math.hypot(dx, dy) or 1.0
        norms.append((-dy / L, dx / L))
    left = [(x + nx * w, y + ny * w) for (x, y), (nx, ny), w in zip(mid, norms, half)]
    right = [(x - nx * w, y - ny * w) for (x, y), (nx, ny), w in zip(mid, norms, half)]
    return closed(left, right)


# ── 畫法 ──────────────────────────────────────────────────────
def piece(d: str, fill: str, *, shade: bool = True, line: float = 1.8) -> str:
    """一塊布：填色 + 輪廓線 + 單向受光的暗面。"""
    out = (f'<path d="{d}" fill="{fill}" stroke="{INK}" stroke-width="{line}" '
           f'stroke-linejoin="round"/>')
    if shade:
        out += f'<path d="{d}" fill="url(#shade)" stroke="none"/>'
    return out


def skinpiece(d: str) -> str:
    return (f'<path d="{d}" fill="{SKIN}" stroke="{INK}" stroke-width="1.6" '
            f'stroke-linejoin="round"/><path d="{d}" fill="url(#shade)" stroke="none"/>')


def folds(pts_pairs: list[tuple[Pt, Pt]], color: str = INK) -> str:
    """幾條布紋線。平塗要有布感，靠的就是這幾筆。"""
    return "".join(
        f'<path d="M{f(a[0])},{f(a[1])} Q{f((a[0]+b[0])/2 + 3)},'
        f'{f((a[1]+b[1])/2)} {f(b[0])},{f(b[1])}" stroke="{color}" '
        f'stroke-width="1.2" fill="none" opacity=".3" stroke-linecap="round"/>'
        for a, b in pts_pairs)


def defs() -> str:
    out = ['<linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">'
           f'<stop offset="0" stop-color="#2E2A24" stop-opacity=".17"/>'
           f'<stop offset=".42" stop-color="#2E2A24" stop-opacity="0"/>'
           '</linearGradient>']
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
               torso=145, leg=200)

BODIES = {
    # 2 腿
    "legs_full":  dict(thigh=29, knee=19, ankle=10, hip=48, waist=33),
    "legs_short": dict(torso=163, leg=178, waist=30),
    # 3 肩
    "sh_narrow":  dict(shoulder=36, bust=36),
    "sh_broad":   dict(shoulder=54, bust=42, waist=34),
    # 4 頸
    "neck_short": dict(neck_len=9, neck_w=11, shoulder=46),
    "neck_long":  dict(neck_len=30, neck_w=8),
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
    b["head_ry"], b["head_rx"] = 26, 19
    b["head_cy"] = top + b["head_ry"]
    b["neck_top"] = top + b["head_ry"] * 2 - 3
    b["shoulder_y"] = b["neck_top"] + b["neck_len"]
    b["bust_y"] = b["shoulder_y"] + b["torso"] * 0.32
    b["waist_y"] = b["shoulder_y"] + b["torso"] * 0.66
    b["hip_y"] = b["shoulder_y"] + b["torso"]
    b["knee_y"] = b["hip_y"] + b["leg"] * 0.52
    b["ankle_y"] = b["hip_y"] + b["leg"]
    b["cx"] = cx
    return b


# ── 頭 ────────────────────────────────────────────────────────
def head(b: dict, back: bool = False) -> str:
    cx, cy, rx, ry = b["cx"], b["head_cy"], b["head_rx"], b["head_ry"]
    p = []
    # 後髮與低髮髻 —— 有量感，不是貼著頭皮的一層
    p.append(f'<ellipse cx="{f(cx)}" cy="{f(cy+3)}" rx="{f(rx+4)}" ry="{f(ry+4)}" '
             f'fill="{HAIR}" stroke="{INK}" stroke-width="1.6"/>')
    p.append(f'<ellipse cx="{f(cx + rx*0.78)}" cy="{f(cy + ry*0.70)}" rx="14" ry="12" '
             f'fill="{HAIR}" stroke="{INK}" stroke-width="1.6"/>')
    p.append(f'<path d="M{f(cx + rx*0.5)},{f(cy + ry*0.62)} q7,-4 14,2" '
             f'stroke="{HAIR_HL}" stroke-width="2" fill="none" stroke-linecap="round"/>')
    if back:
        return "".join(p)

    p.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{rx}" ry="{ry}" fill="{SKIN}" '
             f'stroke="{INK}" stroke-width="1.6"/>')
    # 前髮：從額頭包到兩鬢
    p.append(f'<path d="M{f(cx-rx-1)},{f(cy+4)} '
             f'C{f(cx-rx-2)},{f(cy-ry*1.08)} {f(cx+rx+2)},{f(cy-ry*1.08)} '
             f'{f(cx+rx+1)},{f(cy+4)} '
             f'C{f(cx+rx*0.62)},{f(cy-ry*0.42)} {f(cx-rx*0.62)},{f(cy-ry*0.42)} '
             f'{f(cx-rx-1)},{f(cy+4)} Z" fill="{HAIR}" stroke="{INK}" '
             f'stroke-width="1.5" stroke-linejoin="round"/>')
    p.append(f'<path d="M{f(cx-rx*0.55)},{f(cy-ry*0.62)} q{f(rx*0.5)},-5 {f(rx*0.95)},1" '
             f'stroke="{HAIR_HL}" stroke-width="2" fill="none" stroke-linecap="round"/>')
    for s in (-1, 1):
        p.append(f'<path d="M{f(cx + s*(rx+0.5))},{f(cy+2)} '
                 f'q{f(s*2)},{f(ry*0.55)} {f(-s*3)},{f(ry*0.8)}" '
                 f'stroke="{HAIR}" stroke-width="4" fill="none" stroke-linecap="round"/>')
    # 五官：克制。時裝插畫的傳統是臉輕、衣服重。
    ey = cy + 2
    for s in (-1, 1):
        p.append(f'<path d="M{f(cx + s*9 - 4)},{f(ey-6)} q4,-2.6 8,-0.4" '
                 f'stroke="{BROW}" stroke-width="1.6" fill="none" '
                 f'stroke-linecap="round"/>')                       # 眉
        p.append(f'<ellipse cx="{f(cx + s*8.6)}" cy="{f(ey)}" rx="2.5" ry="3" '
                 f'fill="{INK}"/>')                                  # 眼
        p.append(f'<circle cx="{f(cx + s*8.6 + 0.9)}" cy="{f(ey-1)}" r="0.9" '
                 f'fill="#FFFFFF"/>')                                # 眼神光
    p.append(f'<path d="M{f(cx-1)},{f(cy+7)} q2,2 -0.5,3" stroke="{SKIN_DK}" '
             f'stroke-width="1.4" fill="none" stroke-linecap="round"/>')   # 鼻
    p.append(f'<path d="M{f(cx-3)},{f(cy+13.5)} q3,3 6,0" stroke="{LIP}" '
             f'stroke-width="1.8" fill="none" stroke-linecap="round"/>')   # 唇
    for s in (-1, 1):
        p.append(f'<circle cx="{f(cx + s*(rx+2.5))}" cy="{f(cy+6)}" r="2.4" '
                 f'fill="{MAIN}" stroke="{INK}" stroke-width="0.9"/>')     # 耳環
    return "".join(p)


# ── 軀幹與四肢 ────────────────────────────────────────────────
def torso_edge(b: dict, s: int) -> list[Pt]:
    cx = b["cx"]
    return [(cx + s * b["shoulder"], b["shoulder_y"]),
            (cx + s * b["bust"], b["bust_y"]),
            (cx + s * b["waist"], b["waist_y"]),
            (cx + s * b["hip"], b["hip_y"])]


def neck_and_torso(b: dict) -> str:
    cx, nw = b["cx"], b["neck_w"]
    neck = (f'<path d="M{f(cx-nw)},{f(b["neck_top"]-6)} L{f(cx+nw)},{f(b["neck_top"]-6)} '
            f'L{f(cx+nw)},{f(b["shoulder_y"]+4)} L{f(cx-nw)},{f(b["shoulder_y"]+4)} Z"')
    return (f'{neck} fill="{SKIN}" stroke="{INK}" stroke-width="1.6"/>'
            + skinpiece(closed(torso_edge(b, -1), torso_edge(b, 1))))


# 姿勢 —— 手指向那一格在講的部位
def arm_points(b: dict, s: int, pose: str) -> list[Pt]:
    cx, sh, bu, wa, hp, ua = (b["cx"], b["shoulder"], b["bust"], b["waist"],
                              b["hip"], b["upper_arm"])
    sy, by, wy, hy = b["shoulder_y"], b["bust_y"], b["waist_y"], b["hip_y"]
    if pose == "hip":          # 手插腰 —— 腰頭／腰線那幾格
        return [(cx + s*(sh-2), sy+4), (cx + s*(sh+11), by+16),
                (cx + s*(sh+13), wy+6), (cx + s*(wa+8), wy-1)]
    if pose == "collar":       # 手摸領口 —— V 領、高領、馬甲
        return [(cx + s*(sh-2), sy+4), (cx + s*(sh+10), by+18),
                (cx + s*(bu+1), by-4), (cx + s*(b["neck_w"]+11), sy+15)]
    if pose == "sleeve":       # 手摸袖子 —— 泡泡袖、小飛袖
        return [(cx + s*(sh-2), sy+4), (cx + s*(sh+14), by+14),
                (cx + s*(sh+11), by-10), (cx + s*(sh-5), sy+13)]
    if pose == "strap":        # 手扶肩帶 —— 細肩帶
        return [(cx + s*(sh-2), sy+4), (cx + s*(sh+11), by+16),
                (cx + s*(bu+3), by-6), (cx + s*(b["neck_w"]+14), sy+5)]
    return [(cx + s*(sh-2), sy+4), (cx + s*(sh+4), by+10),      # 自然垂放
            (cx + s*(wa+ua+8), wy+20), (cx + s*(hp+3), hy+28)]


def arms(b: dict, poses: tuple[str, str]) -> str:
    """手臂連手掌一條畫完。

    上一版手掌是另外一個橢圓，接不上前臂，看起來像黏了一顆球。
    改成沿著前臂方向再延伸一小段，收成圓頭 —— 那就是手。
    """
    ua, wr = b["upper_arm"], b["wrist"]
    out = []
    for s, pose in zip((-1, 1), poses):
        pts = arm_points(b, s, pose)
        dx, dy = pts[-1][0] - pts[-2][0], pts[-1][1] - pts[-2][1]
        L = math.hypot(dx, dy) or 1.0
        pts = pts + [(pts[-1][0] + dx / L * 13, pts[-1][1] + dy / L * 13)]
        out.append(skinpiece(ribbon(pts, [ua, ua*0.92, ua*0.76, wr*1.15, wr*0.72])))
    return "".join(out)


def legs(b: dict) -> str:
    cx = b["cx"]
    out = []
    for s in (-1, 1):
        mid = [(cx + s*b["hip"]*0.46, b["hip_y"]-4), (cx + s*b["hip"]*0.44, b["knee_y"]),
               (cx + s*b["hip"]*0.40, b["ankle_y"])]
        out.append(skinpiece(ribbon(mid, [b["thigh"], b["knee"], b["ankle"]])))
        fx = cx + s*b["hip"]*0.4
        out.append(piece(f'M{f(fx-b["ankle"]-1)},{f(b["ankle_y"]+2)} '
                         f'L{f(fx+b["ankle"]+1)},{f(b["ankle_y"]+2)} '
                         f'L{f(fx+b["ankle"]+4.5)},{f(b["ankle_y"]+14)} '
                         f'L{f(fx-b["ankle"]-4.5)},{f(b["ankle_y"]+14)} Z', BROWN,
                         shade=False, line=1.5))
    return "".join(out)


# ── 服裝 ──────────────────────────────────────────────────────
def top(b: dict, fill: str, hem: float, neckline: str = "round",
        ease: float = 5) -> str:
    cx = b["cx"]
    left = [(x - ease, y) for x, y in torso_edge(b, -1)]
    right = [(x + ease, y) for x, y in torso_edge(b, 1)]
    left = [(x, y) for x, y in left if y < hem] + [(left[-1][0], hem)]
    right = [(x, y) for x, y in right if y < hem] + [(right[-1][0], hem)]
    out = piece(closed(left, right), fill)

    sy, nw = b["shoulder_y"], b["neck_w"]
    if neckline == "v":
        out += skinpiece(f'M{f(cx-nw-5)},{f(sy-3)} L{f(cx)},{f(sy+48)} '
                         f'L{f(cx+nw+5)},{f(sy-3)} Z')
    elif neckline == "turtle":
        out += piece(f'M{f(cx-nw-5)},{f(b["neck_top"]-8)} '
                     f'L{f(cx+nw+5)},{f(b["neck_top"]-8)} '
                     f'L{f(cx+nw+5)},{f(sy+5)} L{f(cx-nw-5)},{f(sy+5)} Z', fill)
    elif neckline == "strap":
        out += skinpiece(f'M{f(cx-b["bust"]*0.74)},{f(sy+17)} '
                         f'L{f(cx+b["bust"]*0.74)},{f(sy+17)} '
                         f'L{f(cx+b["bust"]*0.74)},{f(sy-6)} '
                         f'L{f(cx-b["bust"]*0.74)},{f(sy-6)} Z')
    else:
        out += skinpiece(f'M{f(cx-nw-6)},{f(sy-2)} Q{f(cx)},{f(sy+15)} '
                         f'{f(cx+nw+6)},{f(sy-2)} Z')
    out += folds([((cx - b["waist"]*0.5, b["bust_y"]+14), (cx - b["waist"]*0.3, hem-6)),
                  ((cx + b["waist"]*0.45, b["bust_y"]+18), (cx + b["waist"]*0.3, hem-6))])
    return out


def sleeves(b: dict, kind: str, fill: str) -> str:
    cx, sy, sh = b["cx"], b["shoulder_y"], b["shoulder"]
    out = []
    for s in (-1, 1):
        x = cx + s * sh
        if kind == "puff":
            d = (f'M{f(x - s*10)},{f(sy-2)} '
                 f'C{f(x + s*30)},{f(sy-4)} {f(x + s*32)},{f(sy+40)} '
                 f'{f(x + s*14)},{f(sy+46)} '
                 f'C{f(x - s*6)},{f(sy+44)} {f(x - s*14)},{f(sy+18)} '
                 f'{f(x - s*10)},{f(sy-2)} Z')
        elif kind == "flutter":
            d = (f'M{f(x - s*7)},{f(sy+1)} Q{f(x + s*27)},{f(sy+13)} '
                 f'{f(x + s*17)},{f(sy+43)} Q{f(x + s*1)},{f(sy+31)} '
                 f'{f(x - s*7)},{f(sy+1)} Z')
        else:                                             # cap 短袖
            # 貼合肩線的圓袖。上一版外角拉太開，變成兩片翹在肩上的旗子。
            d = (f'M{f(x - s*11)},{f(sy-3)} Q{f(x + s*9)},{f(sy+1)} '
                 f'{f(x + s*4)},{f(sy+27)} Q{f(x - s*7)},{f(sy+23)} '
                 f'{f(x - s*11)},{f(sy-3)} Z')
        out.append(piece(d, fill))
    return "".join(out)


def straps(b: dict, fill: str) -> str:
    cx, sy = b["cx"], b["shoulder_y"]
    return "".join(
        piece(f'M{f(cx + s*(b["neck_w"]+5))},{f(sy-8)} '
              f'L{f(cx + s*(b["neck_w"]+12))},{f(sy-8)} '
              f'L{f(cx + s*b["bust"]*0.68)},{f(sy+20)} '
              f'L{f(cx + s*b["bust"]*0.52)},{f(sy+20)} Z', fill,
              shade=False, line=1.3) for s in (-1, 1))


def skirt(b: dict, fill: str, top_y: float, hem: float, flare: float = 1.0,
          rise: float = 0) -> str:
    cx = b["cx"]
    top_w = b["waist"] + 6 if rise else b["hip"] + 5
    top_y -= rise
    hem_w = top_w + (hem - top_y) * 0.30 * flare
    d = (f'M{f(cx-top_w)},{f(top_y)} L{f(cx+top_w)},{f(top_y)} '
         f'C{f(cx+top_w+hem_w*0.15)},{f(top_y+(hem-top_y)*0.6)} '
         f'{f(cx+hem_w)},{f(hem-14)} {f(cx+hem_w)},{f(hem)} '
         f'Q{f(cx)},{f(hem+13*flare)} {f(cx-hem_w)},{f(hem)} '
         f'C{f(cx-hem_w)},{f(hem-14)} {f(cx-top_w-hem_w*0.15)},'
         f'{f(top_y+(hem-top_y)*0.6)} {f(cx-top_w)},{f(top_y)} Z')
    lines = [((cx + i*top_w*0.5, top_y+10), (cx + i*hem_w*0.62, hem-10))
             for i in (-0.9, -0.3, 0.4, 0.9)]
    return piece(d, fill) + folds(lines)


def trousers(b: dict, fill: str, hem: float, width: float = 1.1,
             rise: float = 0) -> str:
    """褲。width 是褲口相對大腿的倍數：1.0 直筒、1.55 闊腿。rise 是腰頭上提。

    重點在褲襠：兩條腿一定要分得開。少了這個分岔，闊腿褲會變成一塊布，
    「腿型偏壯穿闊腿褲」那句話就完全看不出來。
    """
    cx, hipw = b["cx"], b["hip"] + 5
    top_y = b["hip_y"] - b["torso"] * 0.34 - rise
    crotch, gap = b["hip_y"] + 16, 5
    tw = (hipw - gap) / 2
    lw = tw * width
    out = [piece(f'M{f(cx-b["waist"]-6)},{f(top_y)} L{f(cx+b["waist"]+6)},{f(top_y)} '
                 f'C{f(cx+hipw)},{f(b["hip_y"]-26)} {f(cx+hipw)},{f(b["hip_y"])} '
                 f'{f(cx+hipw)},{f(crotch)} L{f(cx-hipw)},{f(crotch)} '
                 f'C{f(cx-hipw)},{f(b["hip_y"])} {f(cx-hipw)},{f(b["hip_y"]-26)} '
                 f'{f(cx-b["waist"]-6)},{f(top_y)} Z', fill)]
    for s in (-1, 1):
        tx, hx = cx + s*(tw + gap), cx + s*(lw + gap)
        out.append(piece(f'M{f(tx-tw)},{f(crotch-3)} L{f(tx+tw)},{f(crotch-3)} '
                         f'L{f(hx+lw)},{f(hem)} L{f(hx-lw)},{f(hem)} Z', fill))
        out.append(folds([((tx, crotch + 14), (hx, hem - 12))]))
    out.append(piece(f'M{f(cx-b["waist"]-7)},{f(top_y-3)} '
                     f'L{f(cx+b["waist"]+7)},{f(top_y-3)} '
                     f'L{f(cx+b["waist"]+7)},{f(top_y+9)} '
                     f'L{f(cx-b["waist"]-7)},{f(top_y+9)} Z', fill, shade=False))
    return "".join(out)


def band(b: dict, fill: str, y: float, h: float = 13, w: float | None = None) -> str:
    """腰頭／下擺的格紋橫帶。"""
    cx = b["cx"]
    w = w if w is not None else b["waist"] + 8
    return piece(f'M{f(cx-w)},{f(y)} L{f(cx+w)},{f(y)} L{f(cx+w)},{f(y+h)} '
                 f'L{f(cx-w)},{f(y+h)} Z', fill, shade=False, line=1.4)


# ── 場景 ──────────────────────────────────────────────────────
def scene() -> str:
    p = [f'<rect width="{W}" height="{H}" fill="{WALL}"/>',
         f'<rect y="452" width="{W}" height="{H-452}" fill="{FLOOR}"/>',
         f'<rect y="446" width="{W}" height="7" fill="{SKIRTING}"/>',
         f'<path d="M96,0 L214,0 L172,446 L54,446 Z" fill="#FFFFFF" opacity=".34"/>',
         # 地毯
         f'<ellipse cx="350" cy="536" rx="168" ry="30" fill="#EDE6D6" '
         f'stroke="{SKIRTING}" stroke-width="1.5"/>']
    # 落地鏡：照出背面。原圖這個結構做得對，留著
    p += [f'<rect x="16" y="74" width="180" height="474" rx="5" fill="{WOOD}" '
          f'stroke="{WOOD_DK}" stroke-width="2"/>',
          f'<rect x="30" y="88" width="152" height="446" rx="3" fill="{GLASS}"/>',
          f'<path d="M30,88 L110,88 L30,310 Z" fill="#FFFFFF" opacity=".55"/>']
    # 掛畫
    p += [f'<rect x="248" y="70" width="74" height="92" rx="2" fill="#EFEADE" '
          f'stroke="{WOOD_DK}" stroke-width="3"/>',
          f'<path d="M264,140 q14,-46 24,-14 q10,-26 20,14 Z" fill="{LEAF}" '
          f'opacity=".55"/>']
    # 衣桿：實木、同色系衣架
    p += [f'<rect x="516" y="168" width="8" height="330" fill="{WOOD_DK}"/>',
          f'<rect x="662" y="168" width="8" height="330" fill="{WOOD_DK}"/>',
          f'<rect x="512" y="168" width="162" height="8" rx="4" fill="{WOOD_DK}"/>']
    for i, col in enumerate([CREAM, T("small"), OAT, GREEN]):
        x = 530 + i * 32
        p.append(f'<path d="M{x},181 l8,-8 l8,8" stroke="{WOOD_DK}" '
                 f'stroke-width="2.4" fill="none"/>')
        p.append(piece(f'M{x-4},186 L{x+20},186 L{x+26},300 L{x-10},300 Z', col,
                       shade=False, line=1.4))
    # 盆栽
    p += [f'<path d="M604,436 q-30,-54 -4,-78 q22,20 8,78 Z" fill="{LEAF}" '
          f'stroke="{INK}" stroke-width="1.5"/>',
          f'<path d="M606,436 q34,-44 10,-72 q-26,26 -6,72 Z" fill="{LEAF}" '
          f'stroke="{INK}" stroke-width="1.5" opacity=".82"/>',
          f'<path d="M584,432 L630,432 L624,482 L590,482 Z" fill="{POT}" '
          f'stroke="{INK}" stroke-width="1.8"/>']
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
    inner = [legs(b), neck_and_torso(b), arms(b, ("down", "down")),
             skirt(b, bottom_fill, b["hip_y"] - 4, b["ankle_y"] - 16),
             top(b, top_fill, b["hip_y"] - 6), head(b, back=True)]
    return f'<g opacity=".93">{"".join(inner)}</g>'


# ── 11 格 ─────────────────────────────────────────────────────
def figure(body: str, poses: tuple[str, str], draw) -> str:
    b = metrics(body, 350, 86)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
            f'width="{W}" height="{H}" role="img">'
            f'<defs>{defs()}</defs>{scene()}{back_view(CREAM, OAT)}'
            f'<g transform="translate(350,540) scale(1.12) translate(-350,-540)">'
            f'{legs(b)}{neck_and_torso(b)}{draw(b, poses)}'
            f'{head(b)}</g></svg>')


def c1(b, po):    # 封面：格紋裙 ＋ 素面針織
    return (skirt(b, T("medium"), b["hip_y"]-6, b["ankle_y"]-40, flare=.8)
            + top(b, CREAM, b["hip_y"]-12) + arms(b, po) + sleeves(b, "cap", CREAM))


def c2t(b, po):   # 闊腿褲，格紋收在腰頭
    return (trousers(b, OAT, b["ankle_y"]-4, width=1.55)
            + band(b, T("small"), b["hip_y"] - b["torso"]*0.34 - 4, 16)
            + top(b, CREAM, b["hip_y"] - b["torso"]*0.34) + arms(b, po)
            + sleeves(b, "cap", CREAM))


def c2b(b, po):   # 高腰褲，格子走直不走橫
    return (trousers(b, T("medium"), b["ankle_y"]-4, width=1.15, rise=26)
            + top(b, BROWN, b["waist_y"]-8) + arms(b, po) + sleeves(b, "cap", BROWN))


def c3t(b, po):   # 泡泡袖，格紋放在袖子上
    return (trousers(b, OAT, b["ankle_y"]-4, width=1.35)
            + top(b, CREAM, b["hip_y"] - b["torso"]*0.3) + arms(b, po)
            + sleeves(b, "puff", T("medium")))


def c3b(b, po):   # 馬甲，格紋只留一條滾邊
    cx = b["cx"]
    piping = (f'<path d="M{f(cx-b["neck_w"]-12)},{f(b["shoulder_y"]-3)} '
              f'L{f(cx)},{f(b["shoulder_y"]+48)} '
              f'L{f(cx+b["neck_w"]+12)},{f(b["shoulder_y"]-3)}" '
              f'stroke="{T("small")}" stroke-width="9" fill="none" '
              f'stroke-linejoin="round"/>')
    return (trousers(b, OAT, b["ankle_y"]-4, width=1.35)
            + top(b, CREAM, b["hip_y"]-30) + arms(b, po)
            + top(b, BROWN, b["hip_y"]-24, neckline="v", ease=7) + piping)


def c4t(b, po):   # V 領，格紋往下擺走
    hem = b["hip_y"] - 16
    return (trousers(b, BROWN, b["ankle_y"]-4, width=1.0)
            + top(b, CREAM, hem, neckline="v")
            + band(b, T("medium"), hem-16, 17, b["hip"]+6)
            + arms(b, po) + sleeves(b, "cap", CREAM))


def c4b(b, po):   # 高領，格紋就該放在這裡
    return (trousers(b, OAT, b["ankle_y"]-4, width=1.1, rise=20)
            + top(b, T("small"), b["waist_y"]-6, neckline="turtle")
            + arms(b, po) + sleeves(b, "cap", T("small")))


def c5t(b, po):   # 收腰裙，腰線對準格子（斜格）
    tt = T("medium", bias=True)
    return (skirt(b, tt, b["waist_y"]+6, b["ankle_y"]-74, flare=1.5)
            + top(b, tt, b["waist_y"]+8, neckline="v")
            + band(b, SHADOW, b["waist_y"]-4, 10, b["waist"]+7)
            + arms(b, po) + sleeves(b, "cap", tt))


def c5b(b, po):   # 直筒裙，格子換小一號
    return (skirt(b, T("small"), b["hip_y"]-8, b["ankle_y"]-52, flare=.18)
            + top(b, BROWN, b["hip_y"]+4, ease=9) + arms(b, po)
            + sleeves(b, "cap", BROWN))


def c6t(b, po):   # 小飛袖，格紋做在袖片上
    return (skirt(b, OAT, b["hip_y"]-6, b["ankle_y"]-60, flare=.5)
            + top(b, CREAM, b["hip_y"]-10) + arms(b, po)
            + sleeves(b, "flutter", T("small")))


def c6b(b, po):   # 細肩帶，格紋收進肩帶裡
    return (trousers(b, BROWN, b["ankle_y"]-4, width=1.1, rise=22)
            + top(b, CREAM, b["waist_y"]-6, neckline="strap")
            + straps(b, T("small")) + arms(b, po))


# key, 身形, (左手, 右手), 畫法
PANELS = [
    ("c1",  "neutral",    ("down", "hip"),    c1),
    ("c2t", "legs_full",  ("down", "hip"),    c2t),
    ("c2b", "legs_short", ("down", "hip"),    c2b),
    ("c3t", "sh_narrow",  ("down", "sleeve"), c3t),
    ("c3b", "sh_broad",   ("down", "collar"), c3b),
    ("c4t", "neck_short", ("down", "collar"), c4t),
    ("c4b", "neck_long",  ("down", "collar"), c4b),
    ("c5t", "hourglass",  ("hip", "hip"),     c5t),
    ("c5b", "straight",   ("down", "down"),   c5b),
    ("c6t", "arms_full",  ("down", "sleeve"), c6t),
    ("c6b", "arms_slim",  ("down", "strap"),  c6b),
]


def main() -> None:
    FIGDIR.mkdir(exist_ok=True)
    figs = {}
    for key, body, poses, draw in PANELS:
        svg = figure(body, poses, draw)
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
