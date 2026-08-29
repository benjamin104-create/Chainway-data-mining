---
name: sketch-from-photo
description: 把市調照片、街拍、競品圖、流行線條參考圖，局部截取重點後轉成線稿、彩現參考圖與應用建議。當使用者說「幫我把這張圖畫成線稿」「截取這個細節」「這個領口怎麼應用」「市調圖轉機械圖」，或輸入 /sketch-from-photo 時使用。
---

# 市調圖 → 線稿 → 應用建議

## 觸發
`/sketch-from-photo`、「把這張街拍的領口畫成線稿」、「這個細節怎麼用在我們的版上」

## 能力邊界（先講清楚，避免誤會）

| 需求 | 本機能做到 | 需要什麼 |
|---|---|---|
| 局部截取重點區域 | ✅ 自動或手動框選 | opencv-python-headless |
| 照片 → 線稿 | ✅ XDoG 演算法，接近手繪筆觸 | 同上 |
| 線稿 → SVG 向量 | ✅ | pypotrace（有更佳品質）或內建備援 |
| 平塗彩現 + 色票 | ✅ 色彩量化後填回線稿 | 同上 |
| 中文標註與應用說明 | ✅ | Pillow + 中文字型 |
| **乾淨對稱的向量機械圖** | ❌ 本機做不到 | 生成式繪圖或版師描稿 |
| **寫實質感彩現圖** | ❌ 本機做不到 | 生成式繪圖 |

本機演算法給的是「照片的線條化」—— 適合當描圖底稿與細節參考，
**不要**直接當成可入 Tech Pack 的機械圖交給版師。這點務必對使用者說明白。

## 執行

```bash
# 快速：自動挑 4 個細節最豐富的區域
python -m chainway.cli sketch --image "data/raw/market_research/街拍_0312.jpg" --auto

# 正式：用工作單指定要框哪裡、標註什麼
cp config/sketch_jobs.example.yaml config/sketch_jobs.yaml   # 編輯後
python -m chainway.cli sketch --jobs config/sketch_jobs.yaml
```

輸出到 `data/outputs/sketches/<job_id>/`：
`01_crop.png`、`02_line.png`、`02_line.svg`、`03_render.png`、
`04_annotated.png`、`05_contact_sheet.png`、`palette.json`、`spec.md`、`prompt.txt`

## 標準工作流程

1. **先跑 `--auto` 看系統挑了哪些區域**，把結果的 box 座標抄進工作單再微調。
   自動挑的是「邊緣密度最高」的地方，通常會命中領口、口袋、釦組，但不保證。

2. **對每個重點寫應用建議**，格式固定為三句：
   - 觀察到什麼（具體到數字：領座 4cm、展開角大 8 度）
   - 和我們現行版的差異
   - 建議套用在哪個既有版型上、要改哪裡

   不要寫「很有設計感」這種話。版師無法據此動手。

3. **反查自家最相近的款當基礎**：
   ```bash
   python -m chainway.cli search --image "市調圖.jpg"
   ```
   拿到貨號後，用 `flats_prompt.from_search_hit()` 直接帶出既有規格，
   在既有版上改，比從零打版快得多。

4. **要正式機械圖時**，把 `prompt.txt` 交給生成式繪圖工具，
   或呼叫 `/draw-flats` 產生更完整的規格。

## 若環境有 Adobe MCP

`image_vectorize` 的向量化品質優於本機 potrace，`image_remove_background`
可先去背再轉線稿（去背後線稿乾淨很多）。有這些工具時優先用：

1. `adobe_mandatory_init` （每次使用 Adobe 工具前必須先呼叫）
2. `image_remove_background` → 去背
3. `image_crop_and_resize` → 裁重點
4. 本機 `to_lineart()` → 線稿
5. `image_vectorize` → 高品質 SVG

## 注意

- 市調照片可能有版權。產出的線稿是「參考與再設計的中間物」，
  不要把辨識得出來源品牌的圖樣、logo 直接搬進商品。發現這種情況要主動提醒。
- 標註文字需要中文字型。找不到時系統會提示，在
  `config/settings.yaml` 的 `sketch.annotation_font` 填入字型路徑即可。
