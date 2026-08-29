# 我需要你安裝／調用什麼，才能做到這些事

這份文件直接回答：「線稿、彩現、標註這些，需要準備什麼？」
分成三層 —— **本機一定要裝**、**選裝（品質更好）**、**雲端工具（產生式繪圖）**。

---

## 一、本機必裝（一行指令）

```bash
pip install -r requirements.txt
```

裝完跑一次自我檢查，缺什麼會直接告訴你：

```bash
python -m chainway.cli doctor
```

| 套件 | 做什麼 | 沒裝的後果 |
|---|---|---|
| pandas / numpy / pyyaml / openpyxl / pyarrow | 資料合併與 Excel 讀寫 | 完全不能跑 |
| torch + transformers | Fashion-CLIP 影像向量、屬性標註、以圖搜款 | 只能跑純統計，無法用圖片 |
| opencv-python-headless | **線稿、彩現、色票、裁切** | 線稿功能全數不可用 |
| Pillow | 標註文字、縮圖 | 標註與報告縮圖不可用 |
| scikit-learn / scipy | 特徵重要度、版群分析、精確 p 值 | 自動降級為較粗略的統計 |
| fastapi / uvicorn / python-multipart | 網頁後台 | 只能用 CLI |

**沒有顯卡也可以。** CPU 跑 3000 張系統圖約 10–20 分鐘，而且有快取，只跑一次。
有 NVIDIA 顯卡的話，去 https://pytorch.org/get-started/locally/ 裝 CUDA 版 torch，快 10 倍以上。

---

## 二、選裝（有裝品質更好，沒裝會自動降級）

| 套件 | 安裝 | 帶來什麼 |
|---|---|---|
| **中文字型** | Windows 通常已有 `C:/Windows/Fonts/msjh.ttc` | 線稿上的中文標註。找不到會顯示成方框，屆時在 `config/settings.yaml` 的 `sketch.annotation_font` 填字型路徑 |
| pdfplumber | `pip install pdfplumber` | 直接解析文字型 PDF 裁縫指示書的尺寸表 |
| pytesseract + Tesseract | `pip install pytesseract` 並另外安裝 [Tesseract](https://github.com/UB-Mannheim/tesseract/wiki) + 中文語言包 `chi_tra` | 掃描件／拍照的指示書 OCR |
| pypotrace | `pip install pypotrace`（需先有 libpotrace） | 線稿轉 SVG 的品質明顯較好。沒裝會用內建的輪廓描邊備援，線條較硬但可用 |
| faiss-cpu | `pip install faiss-cpu` | 商品超過 5 萬款時的檢索加速。5 萬以下用內建 numpy 就夠快 |

> **關於裁縫指示書**：最省事的做法其實不是 OCR，而是請版師把尺寸表另存一份
> Excel。抽取準確率從 OCR 的 60–80% 變成 100%，而且他們本來就在 Excel 裡打。
> 這件事值得花十分鐘去溝通。

---

## 三、雲端／生成式工具（產生「真正的機械圖」與「彩現圖」）

這是必須誠實說明的一段。**本機演算法能做到的是「照片線條化」**——
把市調照片的輪廓與細節提取成線稿，適合當描圖底稿與細節參考。
它做不到「乾淨、對稱、正背面齊全、可直接入 Tech Pack 的向量機械圖」，
也做不到「寫實質感的彩現圖」。那需要生成式繪圖。

系統的角色是：**幫你把指令寫到位**（`prompt.txt` + `spec.md`），再交給下列任一工具。

### 選項 A：Adobe（若你的 Claude 環境已連 Adobe MCP）

我這邊看得到的 Adobe 工具中，以下幾個直接可用：

| 工具 | 用途 |
|---|---|
| `image_remove_background` | 市調照先去背，線稿會乾淨非常多 |
| `image_crop_and_resize` | 重點區域裁切 |
| `image_vectorize` | **線稿轉高品質 SVG**，優於本機 potrace |
| `image_apply_*`（曝光/對比/色溫） | 轉線稿前先增強對比，出線品質提升 |
| `create_firefly_board` / `boards_add_items_to_board` | 把線稿、色票、參考圖組成情緒板 |

⚠️ 使用任何 Adobe 工具前，**必須先呼叫 `adobe_mandatory_init`**，這是該服務的硬性要求。

**你要做的事**：確認公司的 Adobe 帳號已連上（Creative Cloud 訂閱），
然後直接跟我說「用 Adobe 幫我把這張向量化」即可。

### 選項 B：生成式出圖（機械圖與彩現圖）

系統產出的 `prompt.txt` 是通用格式，可貼進：

- **Adobe Firefly**（商用授權最乾淨，公司用建議首選）
- **ChatGPT / DALL·E 3**（你已有的話最方便）
- **Midjourney**（風格最好但商用授權要自己確認）

流程固定為兩段：先出**黑白線稿**確認結構無誤，再用同一段 prompt
加上配色描述出**彩現圖**。一次要兩種通常兩種都不好。

**你要做的事**：告訴我你公司實際會用哪一個，我可以把 prompt 的措辭
針對那個工具再調一次（三者對 negative prompt 的支援程度不同）。

### 選項 C：不用 AI，直接給版師

`spec.md`（繁中規格書）+ `02_line.png`（線稿底稿）+ `palette.json`（色票）
這三個檔案交給版師，他照著描一版乾淨的向量圖。
以品質論這仍是最穩的路 —— AI 出的機械圖多少要人修。

---

## 四、Claude 這邊的技能（已經幫你建好，不用另外安裝）

`.claude/skills/` 底下已有五個技能，在這個 repo 開 Claude Code 就會自動載入：

| 技能 | 觸發 | 做什麼 |
|---|---|---|
| `draw-flats` | `/draw-flats`、「畫機械圖」 | 產出繁中規格書 + 英文繪圖 prompt |
| `weekly-plan` | `/weekly-plan`、「這週開幾款」 | 週度 10–15 款企劃與組套 |
| `fabric-check` | `/fabric-check`、「這塊布行不行」 | 布性適配診斷 + 60/30/10 色彩計畫 |
| `design-workflow` | `/design-workflow` | AI 分工與季度節奏 |
| `sketch-from-photo` | `/sketch-from-photo`、「這張圖轉線稿」 | 市調圖 → 線稿 → 應用建議 |

---

## 五、總結：你進公司後要做的三件事

1. **裝環境**：`pip install -r requirements.txt` → `python -m chainway.cli doctor`
2. **填路徑**：把公司四個資料夾的實際位置填進 `config/settings.yaml` 的 `paths`
   （支援 `//NAS/設計部/系統圖` 這種網路磁碟路徑）
3. **告訴我兩件事**：
   - 貨號的實際格式長什麼樣（給我三個範例就好），我調 `sku` 的解析規則
   - 公司會用哪個出圖工具（Firefly / DALL·E / Midjourney / 都不用），我調 prompt 措辭

其他的我這邊都已經備好了。
