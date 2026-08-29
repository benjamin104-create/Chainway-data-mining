---
name: draw-flats
description: 產出服裝平面機械圖（Flats / Tech Pack）的線稿規格與繪圖 prompt。當使用者要求「繪製機械圖」「畫線稿」「flat sketch」「tech pack」，或輸入 /draw-flats 時使用。輸出繁體中文款式規格書 + 英文圖像生成 prompt（正背面、明線、褶子、剪裁縫線）。
---

# 服裝平面機械圖 Prompting

## 觸發
`/draw-flats`、`[繪製機械圖]`、「畫這款的線稿」、「出 tech pack」

## 工作流程

1. **先確認結構**，缺一項就問一項，不要自行假設：
   品類 → 領型 → 袖型 → 廓形 → 閉合方式 → 口袋 → 面料 → 壓線規格。
   若使用者給的是照片或既有貨號，先跑
   `python -m chainway.cli search --image <圖>`，
   拿最相似的自家款當結構基礎，再問「要改哪裡」—— 這比從零描述快得多。

2. **套用布性限制**（見 `config/taxonomy.yaml` 與下方對照表）。
   布性決定線稿畫法，畫錯了版師會照著做出錯的東西。

3. **輸出三段**，缺一不可：
   - 繁體中文款式規格（可直接貼進 Tech Pack）
   - 英文繪圖 prompt
   - Negative prompt

## 標準 prompt 骨架

```
Clean pure white background, 2D technical vector fashion flat sketch,
black line art only, uniform line weight, no greyscale shading,
no human model, no mannequin, perfectly symmetrical, centered,
front view and back view side by side, precise visible stitch lines,
industry standard tech pack illustration.
A {品類} with {結構描述}. {布性線稿規則}. {對格規則(若為格紋)}.
```

Negative：
```
no photorealism, no fabric texture rendering, no shadows, no gradients,
no colour fill, no background props, no watermark, no text labels
```

## 布性 → 線稿畫法對照

| 面料 | 線稿要求 |
|---|---|
| 梭織挺括 | 清晰直線與結構線、明確褶線腳、公主線 |
| 梭織垂墜 | 自然垂墜線（drape lines），避免硬轉折 |
| 細針織 | 僅在領口/袖口/下擺標示羅紋 |
| 粗針織 | 以輕重複線標示麻花或羅紋方向 |
| 丹寧 | 雙針明線 0.6cm、口袋角打棗 |
| 毛呢/斜紋軟呢 | 邊緣用斷續線表示 boucle，標示流蘇 |
| 薄透 | 內層用淡虛線 |
| 緞面 | 極少的柔和垂墜線，不畫硬折痕 |

**格紋面料**一律加：前中對位基準線、胸/腰/擺三條水平對格線、側縫對格點。
斜裁角度超過 15 度要主動提醒對格困難與耗布率上升。

## 程式輔助

```bash
# 從屬性組合直接產生規格 + prompt
python -c "
from chainway.sketch.flats_prompt import build_spec, build_prompt
attrs = {'collar':'stand_collar','sleeve':'long_sleeve','closure':'buttons','pattern':'check'}
print(build_spec('TOP', attrs, 'woven_crisp'))
print(build_prompt('TOP', attrs, 'woven_crisp')['prompt'])
"
```

## 交付規格

- 一定要有**背面圖**。多數生成模型不下明確指令只畫正面。
- 壓線寬度一律寫明數字（0.6cm / 1.2cm），不要寫「topstitch」了事。
- 產出後自我檢查：肩線對稱？領座與領面分開畫了？口袋位置有標高度？
