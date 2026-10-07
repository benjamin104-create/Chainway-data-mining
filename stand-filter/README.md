# 替身偵測器

手機網頁小遊戲：先做五題測驗找出自己的替身，再打開相機把它召喚到身後，拍完可以直接分享到 LINE。

## 玩法

五題選擇題 → 六種人格標籤之一（勇氣、智慧、守護、自由、創造、羈絆）→ 選女神／男神／交給命運 → 十二位希臘羅馬神祇之一出現在你身後，背後有一圈星座光環。
題目、替身名字、能力值和說明文字都在 `quiz.js`。

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
守護靈的另一側有人格標籤大字（例如直排的「守護」「創造」，英文是 PROTECTION、CREATION），開場時會「砸」進畫面。

- 人像分割用 Google MediaPipe 的 selfie segmenter，**在手機上計算**，照片不會上傳到任何伺服器。
- 程式庫與模型都放在 `lib/`、`models/`，不依賴外部 CDN。
- 第一次開啟後會存在手機裡（service worker），之後開更快、離線也能用。

## 怎麼放上網

整個資料夾是純靜態檔案，丟到任何支援 HTTPS 的靜態網站空間即可（相機只在 HTTPS 下能用）：

- Netlify：把資料夾拖進 app.netlify.com/drop
- GitHub Pages：放進一個 repo，Settings → Pages 開啟

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
