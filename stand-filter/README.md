# 守護神偵測器

「哪位希臘神祇是你的守護神？」手機網頁小遊戲：先做十題測驗找出自己的守護神，再打開相機把祂召喚到身後，拍完可以直接分享到 LINE。

## 玩法

十題選擇題 → 六種人格標籤之一（勇氣、智慧、守護、自由、創造、羈絆）→ 選女神／男神／交給命運 → 十二位希臘羅馬神祇之一出現在你身後，背後有一圈星座光環。
題目、守護神名字、能力值和說明文字都在 `quiz.js`。

結果頁還有「你適合怎麼經營自媒體」：主標籤決定定位（挑戰者、拆解者、陪伴者、探索者、創作者、連結者）、主題、內容形式和平台；十題裡次多的標籤是副標籤，給混搭建議；再依本人每一題實際選的選項，各給一句具體建議（擅長的段落、題材、說話風格、拍攝方式、要避開的事等）；最後給一個這週就能做的第一步。六角圖是守護神角色的能力，只用於分享，不影響分析。文字在 `quiz.js` 的 `MEDIA` 和 `ANSWER_MEDIA`。

## 替身圖

放在 `stands/`，檔名固定：

| 檔名 | 標籤 | 替身 | Canva 原圖 |
|---|---|---|---|
| courage | 勇氣・男 | 《MARS》戰神瑪爾斯 | https://www.canva.com/M/MAHXSfz7Aww |
| nike | 勇氣・女 | 《NIKE》勝利女神妮姬 | https://www.canva.com/M/MAHXSRrwAMc |
| wisdom | 智慧・女 | 《ATHENA》智慧女神雅典娜 | https://www.canva.com/M/MAHXSXBww1o |
| apollo | 智慧・男 | 《APOLLO》光明之神阿波羅 | https://www.canva.com/M/MAHXSUV2iPs |
| guard | 守護・女 | 《ARTEMIS》月之女神阿提米絲 | https://www.canva.com/M/MAHXSVAAkGg |
| zeus | 守護・男 | 《ZEUS》眾神之王宙斯 | https://www.canva.com/M/MAHXSbiYLvc |
| freedom | 自由・男 | 《HERMES》旅神赫密士 | https://www.canva.com/M/MAHXSR0DA6k |
| iris | 自由・女 | 《IRIS》彩虹女神伊麗絲 | https://www.canva.com/M/MAHXSal39ns |
| create | 創造・女 | 《VENUS》美神維納斯 | https://www.canva.com/M/MAHXSTTHhsA |
| hephaestus | 創造・男 | 《HEPHAESTUS》鍛造之神赫菲斯托斯 | https://www.canva.com/M/MAHXSQ4urCg |
| bond | 羈絆・男 | 《CUPID》愛神丘比特 | https://www.canva.com/M/MAHXSVbv2Wk |
| hera | 羈絆・女 | 《HERA》天后希拉 | https://www.canva.com/M/MAHXSXPL1OQ |

`.png` 或 `.jpg` 都可以（有 `.png` 會優先用）。白底的圖會自動去背，透明底也可以。
目前放的是縮圖（約 150×200），要換成高解析的原圖才會清楚：用相同檔名覆蓋即可。
替身以希臘羅馬神話的神祇為原型（神話本身沒有版權），造型是重新繪製的原創圖，沒有使用任何漫畫原作角色。宣傳時可以搭希臘神話話題，但不要用其他作品的名稱、標誌或角色名當標題。
相機會讀出人像每一欄的最上緣，在畫面上試不同位置和大小，挑守護靈的臉最不會被擋住的地方，並像 AR 角色一樣滑過去；移動時會傾身，每 4.5 秒擺一次 pose。
畫面最上方是守護靈名稱，守護靈旁邊有台詞對話框，都畫在最前面。名稱與台詞有中文、日文、英文，會依手機語言自動選，也可以在相機下方切換。台詞寫在 `quiz.js` 的 `LOCALE`。
守護靈的另一側有人格標籤大字（例如直排的「守護」「創造」，英文是 PROTECTION、CREATION），開場時會「砸」進畫面。畫面上不放擬聲字。

- 相機下方「✨ 美顏」：美肌、補光（頂光臉黑）、氣色、淡化黑眼圈四個滑桿，只套在人身上；黑眼圈用 MediaPipe 臉部偵測找眼睛位置。設定會記在手機裡。也可以用相簿裡的照片合成。
- 人像分割用 Google MediaPipe 的 selfie segmenter，**在手機上計算**，照片不會上傳到任何伺服器。
- 程式庫與模型都放在 `lib/`、`models/`，不依賴外部 CDN。
- 第一次開啟後會存在手機裡（service worker），之後開更快、離線也能用。

## 怎麼放上網（Netlify）

Netlify 上已經建好網站 `jaminepa-guardian`（網址 https://jaminepa-guardian.netlify.app ），還沒有內容。
把它接到 GitHub，之後每次推送都會自動更新：

1. 打開 https://app.netlify.com/projects/jaminepa-guardian
2. 「Project configuration」→「Build & deploy」→「Link repository」，選 GitHub 的 `benjamin104-create/chainway-data-mining`
3. Branch 選 `claude/fashion-sales-design-platform-vabg76`
4. Base directory 填 `stand-filter`，Build command 留空，Publish directory 填 `stand-filter`
5. 按 Deploy，等一兩分鐘就能用手機打開網址

（設定也寫在 `netlify.toml`，Netlify 會自動讀。）

## 怎麼讓朋友「安裝」

- iPhone（Safari）：分享按鈕 →「加入主畫面」
- Android（Chrome）：選單 →「安裝應用程式」或「加到主畫面」

## 在 LINE 裡分享連結

LINE 內建瀏覽器有時不給開相機。分享時在網址後面加 `?openExternalBrowser=1`，
LINE 會自動改用手機的 Safari／Chrome 開啟：

    https://你的網址/?openExternalBrowser=1

## 本機測試

    python3 -m http.server 8000
    # 電腦瀏覽器開 http://localhost:8000
