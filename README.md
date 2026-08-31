# Chainway — 服飾圖片特徵 × 銷售數據 交叉分析平台

把公司既有的四種資料串起來，回答設計師實際會問的問題：

> 歷年哪些**設計特徵**和暢銷／滯銷有關？（分品類看）
> 這款**為什麼**賣不好 —— 是設計問題，還是缺貨、陳列問題？
> 暢銷款的**版型比例**落在哪個區間？打版時該瞄準哪裡？
> 拿一張市調照片，能不能**反查**自家最像的款、貨號與價格？
> 下一週要開的 10–15 款，骨架能不能先排好？

---

## 這套系統吃什麼、吐什麼

| 輸入（公司既有） | 輸出 |
|---|---|
| 系統圖（去背商品照 + 貨號） | HTML 關聯分析報告 + Excel 明細 |
| 裁縫指示書（重點尺寸 + 線稿） | 版型甜蜜區間（可直接發給版師的打版目標值） |
| POS 歷年分季進銷存 | 逐款診斷：真滯銷 / 假滯銷 / 虛胖暢銷 |
| 服裝設計知識文件 | 以圖／以文反查貨號與價格 |
| ★ 業務市場調查回饋（你自己填） | 週度 10–15 款商品企劃與組套 |
| ★ 市調照片、流行線條 | 線稿 + 平塗彩現 + 色票 + 機械圖 prompt |

---

## 快速開始

```bash
pip install -r requirements.txt
python -m chainway.cli doctor      # 檢查環境、資料夾、套件，缺什麼直接告訴你
python -m chainway.cli scaffold    # 依設定建立來源資料夾（已有資料夾可略過）
```

資料夾位置設定在 `config/settings.yaml` 的 `paths`，目前指向
`C:/Users/USER/Desktop/商品設計Raw Data`。改 `root` 一行就能整套換位置，
也支援 `//NAS/...` 網路磁碟。

> **Windows 路徑請用正斜線 `/`。** YAML 雙引號裡的 `\` 是跳脫字元，
> `"C:\Users\..."` 會直接解析失敗。詳見 [`docs/data_contract.md`](docs/data_contract.md)。

然後依序：

```bash
python -m chainway.cli ingest      # 讀 POS / 系統圖 / 裁縫指示書
python -m chainway.cli embed       # Fashion-CLIP 向量 + 屬性標註（最花時間，有快取）
python -m chainway.cli build       # 合併主表 + 暢銷/滯銷分級
python -m chainway.cli analyze     # 關聯分析 + 診斷 + 產出報告
python -m chainway.cli serve       # 開網頁後台 → http://127.0.0.1:8000
```

日常使用：

```bash
python -m chainway.cli feedback template          # ★ 產生給業務填的 Excel（含下拉選單）
python -m chainway.cli search --image 市調照.jpg   # 以圖反查貨號與價格
python -m chainway.cli search --text "高腰格紋百褶裙"
python -m chainway.cli sketch --image 街拍.jpg --auto  # ★ 市調圖 → 線稿 / 彩現 / 色票
python -m chainway.cli plan --week 3              # 第 3 週商品企劃
```

---

## ★ 你自行填寫「暢銷／滯銷理由」的地方

`data/feedback/sales_feedback.csv` —— 也可以用網頁後台的「回饋登錄」頁填。

**為什麼這一步不能省**：量化數據只能算出「賣得好不好」。
填了理由之後，系統才分得出這三種完全不同的狀況：

| 診斷 | 意思 | 該做什麼 |
|---|---|---|
| **假滯銷** | 其實賣很好，但 M 號第三週就斷碼 | 追單、檢討尺寸配比 —— **設計不用改** |
| **真滯銷** | 客人反映橫開領太寬、肩線滑落 | 修版重出 —— 設計要改，而且知道改哪裡 |
| **虛胖暢銷** | 銷量靠折扣換來 | 追單前先複查毛利 |

理由用**受控詞彙**（`config/feedback_tags.yaml`，六大類 50+ 個標籤）+ 自由文字說明。
受控詞彙可以統計、可以交叉；自由文字可以閱讀、可以佐證。兩者都要。

更進一步，系統會把「人填的理由」和「CLIP 標的設計特徵」交叉，例如：

> 被標記「開領太大」的款有 78% 是一字領，而全體只有 12%（集中度 6.5×）
> → 一字領的開領規格需要全面檢討

這就把零散的門市抱怨，變成能寫進設計規範的證據。

---

## ★ 市調圖轉線稿 —— 能做到什麼、不能做到什麼

```bash
python -m chainway.cli sketch --image "街拍_0312.jpg" --auto
```

輸出：重點裁切圖、線稿 PNG、**線稿 SVG（可開 Illustrator）**、平塗彩現圖、
色票 JSON、中文標註圖、三欄對照頁、繁中規格書、英文繪圖 prompt。

| | 本機做得到 | 需要外部工具 |
|---|---|---|
| 局部截取重點 | ✅ | |
| 照片 → 線稿（XDoG，接近手繪筆觸） | ✅ | |
| 線稿 → SVG 向量 | ✅ | |
| 平塗彩現 + 色票 | ✅ | |
| 中文標註 + 應用建議 | ✅ | |
| 乾淨對稱的向量機械圖 | ❌ | 生成式繪圖 或 版師描稿 |
| 寫實質感彩現圖 | ❌ | 生成式繪圖 |

**本機演算法產出的是「照片的線條化」，適合當描圖底稿與細節參考，
不要直接當成可入 Tech Pack 的機械圖交給版師。** 需要正式機械圖時，
系統產出的 `prompt.txt` + `spec.md` 可直接交給 Adobe Firefly / DALL·E / Midjourney，
或交給版師照描。

👉 **完整的「需要安裝／調用什麼」清單見 [`docs/skills_and_tools.md`](docs/skills_and_tools.md)**

---

## Claude Code 技能

`.claude/skills/` 下有五個技能，在這個 repo 開 Claude Code 會自動載入：

| 技能 | 觸發 | 用途 |
|---|---|---|
| `draw-flats` | `/draw-flats` | 機械圖規格書 + 英文繪圖 prompt |
| `weekly-plan` | `/weekly-plan` | 週度 10–15 款企劃與組套 |
| `fabric-check` | `/fabric-check` | 布性適配診斷 + 60/30/10 色彩計畫 |
| `design-workflow` | `/design-workflow` | AI 分工與季度節奏 |
| `sketch-from-photo` | `/sketch-from-photo` | 市調圖 → 線稿 → 應用建議 |

---

## 專案結構

```
config/          ★ 進公司後只需要改這裡
  settings.yaml      資料夾路徑、模型、門檻、波段
  taxonomy.yaml      品類 × 設計特徵詞彙表（分析的共同語言）
  feedback_tags.yaml ★ 暢銷/滯銷理由的受控詞彙
chainway/        核心套件（ingest / features / merge / analysis / search / planning / sketch / report）
apps/            網頁後台（FastAPI + 無建置流程的單頁前端）
knowledge/       品牌知識庫
docs/            架構、資料規格、工具清單
data/            資料（不進版控）
.claude/skills/  五個 Claude Code 技能
```

---

## 方法上的誠實說明

這套系統算的是**相關**，不是**因果**。「立領上衣暢銷提升度 +34%」的正確讀法是
「過去做的立領上衣裡，成功比例較高」，而不是「把領子改成立領就會賣」——
兩者可能都受第三個因素影響（例如立領款剛好都用了較好的布）。

所以報告裡每一條結論都附樣本數與 q 值，並且：

- **n < 20 的請視為假設，不是結論**
- 用 BH-FDR 校正多重檢定（跑幾百個組合時，不校正會有大量假發現）
- CLIP 標註信心不足的一律排除，不讓模型的猜測混進統計
- 資料涵蓋率放在報告第一節 —— 任何一環命中率低，後面就要打折扣看

詳見 [`docs/architecture.md`](docs/architecture.md)。
