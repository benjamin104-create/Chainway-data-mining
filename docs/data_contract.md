# 資料規格（Data Contract）

進公司後把資料放進對應資料夾即可，**不需要改任何程式**。
唯一要動的是 `config/settings.yaml` 的 `paths` 區塊。

---

## 〇之一、實際資料夾對照（依 INDEX.md 2026-08-24）

原始資料庫約 28,000 檔、62 GB，涵蓋 2021–2026。**`00_核心資料` ~ `05_案例`
六個編號資料夾是「產出區」，不是原始證據來源**，不要拿去當資料來源掃描。

| 根目錄資料夾 | 規模 | 對應到本專案 |
|---|---|---|
| `系統圖/` | ~3,729 檔（JPG 為主，少量 PSD），依季號分類 | `system_images` |
| `裁縫指示書/` | ~3,489 檔（2,548 XLS + 741 XLSX） | `tech_packs` |
| `新格紋/` | 86 檔，2020–2024 命名格紋、PDF/AI/PSD | `market_research` |
| `Codex skill/` | 145 張《基礎服裝畫原理與構造》頁面照片 | `knowledge` |
| `00_核心資料/` | 品牌定位、核心原則、禁止事項（決策準則） | `knowledge` |
| `電子目錄/` | ~20,558 檔 / 58.9 GB | **刻意不掃**（見下） |

**電子目錄為何不納入**：INDEX 註明「許多攝影檔沒有產品貨號」，且 58.9 GB
全部跑 CLIP 成本極高而大部分無法對應到貨號。要用的話只適合做季別層級分析，
並需先補 `catalog_product_map.csv` 對照表。

**POS 銷售數據不在原始資料區**。INDEX 顯示銷售／庫存 Excel 是匯入
`04_企劃/商品逆向分析系統/data/`。這是唯一的必要資料，沒有它算不出暢銷／滯銷分級。

### ⚠️ 與既有系統的重疊

`04_企劃/商品逆向分析系統/` 已經在做：貨號交叉索引（系統圖 × 裁縫指示書 ×
電子目錄）、銷售／庫存匯入、設計特徵標籤（`data/product_tags.csv`）、本機 BI
介面（`start.ps1 serve`）。本專案與它有大幅重疊，**動工前應先決定兩者關係**，
不要平行維護兩套做同一件事的系統。

### KA 季號

季號寫在 `config/settings.yaml` 的 `seasons`，末碼 5=秋 6=冬 7=春 8=夏。
系統圖與裁縫指示書依季號分資料夾，程式會自動從資料夾名補上季別，
不必等 POS 報表有季別欄位。

> 注意：POS 檔名帶季號時（如 `KA135_進銷存.xlsx`），整份檔案會被標成該季。
> 若一個檔案混合多季，請確保報表本身有「季別」欄位——有欄位時一律以欄位為準。

---

## 〇、資料夾怎麼設定（Windows）

目前 `config/settings.yaml` 已指向：

```yaml
paths:
  root: "C:/Users/USER/Desktop/商品設計Raw Data"
  system_images: "系統圖"
  tech_packs: "裁縫指示書"
  pos: "POS銷售數據"
  market_research: "市場調研"
  knowledge: "設計知識"
```

`root` 底下這五個是**子資料夾名稱**，會自動接在 root 後面。
子資料夾名稱請改成你電腦上實際的名字；也可以填絕對路徑讓某一項獨立
（例如 POS 放在 `"D:/財務/進銷存"`，其餘留在桌面）。

### ⚠️ Windows 路徑一定要用正斜線 `/`

YAML 的**雙引號字串**裡反斜線是跳脫字元，`"C:\Users\..."` 的 `\U`
會被當成 Unicode 跳脫，直接解析失敗（實測會噴 `ScannerError`）。三種寫法：

| 寫法 | 結果 |
|---|---|
| `"C:/Users/USER/Desktop/商品設計Raw Data"` | ✅ 建議用這種 |
| `'C:\Users\USER\Desktop\商品設計Raw Data'` | ✅ 單引號也可以（單引號不做跳脫） |
| `"C:\Users\USER\Desktop\商品設計Raw Data"` | ❌ 解析錯誤 |

正斜線在 Windows 上完全正常 —— Python 的 `pathlib.Path` 和 Windows API
兩邊都接受。程式內部一律用 `pathlib.Path` 處理，不做任何字串拼接。

### 產出檔不會寫進你的資料夾

`feedback` / `interim` / `processed` / `outputs` 四項固定留在專案目錄內，
不受 `root` 影響。你的桌面原始資料夾只會被讀取，不會被寫入。

### 兩個好用的指令

```bash
python -m chainway.cli doctor     # 檢查路徑；子資料夾對不上時會列出你實際的資料夾名供對照
python -m chainway.cli scaffold   # 依設定自動建立那五個子資料夾（含放檔說明卡）
```

`doctor` 在根目錄找不到時會提示三個最常見原因：路徑打錯（注意
「商品設計Raw Data」中間那個空格）、在 WSL/macOS 上看不到 `C:\`、
以及用了反斜線。

---

## 一、四個資料來源

### 1. 系統圖（去背商品照）→ `paths.system_images`

```
系統圖/
├── 2024AW/
│   ├── CW24AW-TP-0135-BLK.png      ← 檔名 = 貨號
│   ├── CW24AW-TP-0135-BLK_02.png   ← 同款第 2 視角
│   └── CW24AW-SK-0208-NVY.png
└── 2025SS/
```

- **檔名必須含貨號**，這是所有資料串接的鑰匙。
- 支援 png/jpg/webp/tif。透明去背 PNG 會自動補白底（重要，否則 CLIP 會把透明當黑色）。
- `_02`、`-03` 結尾視為同款的其他視角，只有第一張參與特徵萃取。
- 貨號格式若與預設不符，改 `settings.yaml` 的 `sku.filename_pattern`（正規式）。

### 2. 裁縫指示書 → `paths.tech_packs`

檔名同樣要含貨號。三種格式，準確率由高到低：

| 格式 | 準確率 | 說明 |
|---|---|---|
| Excel/CSV 尺寸表 | 100% | **強烈建議請版師改用這種** |
| 文字型 PDF | 80–95% | 需 `pdfplumber` |
| 掃描件/照片 | 60–80% | 需 OCR，會有錯字 |

系統會找這些欄位（別名可在 `taxonomy.yaml` 的 `measurements.fields` 增補）：
衣長、肩寬、胸圍、腰圍、臀圍、袖長、袖口、領寬、領深、下擺、股上、股下、褲口。

尺寸表兩種排法都支援：

```
直式：| 衣長 | 62 | 64 | 66 |        橫式：| 衣長 | 肩寬 | 胸圍 |
      | 肩寬 | 38 | 39 | 40 |              |  62  |  38  | 100  |
```

跑完 `ingest` 會產出 `data/interim/techpack_coverage.csv`，
告訴你哪個尺寸欄位抽到幾成 —— 涵蓋率低的欄位不要拿去做分析。

### 3. POS 進銷存 → `paths.pos`

每年每季一個 Excel 都可以，系統會全部掃進來並合併。
欄位名稱**不用統一**，系統用別名比對（見 `chainway/ingest/pos.py` 的 `COLUMN_ALIASES`）：

| 標準欄位 | 認得的名稱 | 必要性 |
|---|---|---|
| sku | 貨號、商品編號、品號、料號、SKU | **必要** |
| stock_in | 進貨量、進貨數、入庫量、採購數量 | **必要**（沒有就算不出售罄率） |
| sales_qty | 銷售量、銷貨數量、銷量、出貨數 | **必要** |
| list_price | 定價、售價、原價、牌價 | 建議 |
| sales_amount | 銷售金額、銷貨金額、營業額 | 建議 |
| cost | 成本、進價 | 建議（算毛利用） |
| season | 季別、年季、波段 | 建議（沒有會從檔名猜） |
| category | 品類、類別、大類 | 建議（沒有會用 CLIP 判斷） |
| first_sale_date | 上市日、首賣日、上架日 | 建議（算上市週數用） |
| return_qty / store / region / size / color | 退貨量 / 門市 / 區域 / 尺寸 / 顏色 | 選用 |

沒對到的欄位會列在 `data/interim/pos_import_audit.csv`，
看一眼就知道要不要在 `COLUMN_ALIASES` 補一筆。

### 4. 市調圖與設計知識 → `paths.market_research` / `paths.knowledge`

沒有格式要求。市調圖建議按主題分子資料夾（街拍／趨勢版／競品／布卡）。

---

## 二、★ 人工回饋表 → `data/feedback/sales_feedback.csv`

這是唯一需要「人填」的資料，也是整套系統最關鍵的一份。

| 欄位 | 必填 | 說明 |
|---|---|---|
| `sku` | ✅ | 貨號 |
| `verdict` | ✅ | STAR 暢銷 / OK 普通 / SLOW 滯銷 / MIXED 兩極 |
| `reason_tags` | ✅ | 理由代碼，多個用 `\|` 分隔。清單見 `config/feedback_tags.yaml` |
| `reason_text` | ✅ | 文字說明。**寫具體現象，不要寫「不好賣」** |
| `source` | ✅ | STORE 門市 / SALES 業務 / EC 電商 / CS 客服 / VIP / BUYER / INTERNAL |
| `season` `category` | | 沒填會從主表補 |
| `respondent` `store_or_region` `survey_date` | | 建議填，可做區域差異分析 |
| `confidence` | | HIGH / MEDIUM / LOW |
| `suggested_action` | | 填了會覆蓋系統推論 |
| `follow_up_note` | | 後續備註 |

**同一個貨號可以有多筆**。「台北說太貴、台中說很好賣」本身就是重要訊號，
系統會保留全部，不會互相覆蓋。

三種填寫方式：

```bash
python -m chainway.cli feedback init       # 建立空表，直接用 Excel 開來填
python -m chainway.cli feedback template   # 產生含下拉選單的 xlsx 發給業務
python -m chainway.cli serve               # 開網頁後台 → 「回饋登錄」頁
python -m chainway.cli feedback validate   # 檢查填寫格式
python -m chainway.cli feedback gaps       # 看哪些款最需要補回饋
```

---

## 三、輸出檔案

| 路徑 | 內容 |
|---|---|
| `data/interim/` | 中繼檔（影像清單、POS 彙總、指示書尺寸、匯入稽核） |
| `data/processed/master.parquet` | **主表**：影像特徵 × 版型尺寸 × 銷售績效 × 人工回饋 |
| `data/processed/join_audit.csv` | 串接命中率 —— 出問題先看這個 |
| `data/outputs/reports/` | HTML 分析報告 + Excel 明細 |
| `data/outputs/sketches/` | 線稿、彩現、色票、規格書 |
| `data/outputs/plans/` | 週度與年度企劃 |
