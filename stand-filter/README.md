# 替身偵測器

手機網頁小遊戲：先做五題測驗找出自己的替身，再打開相機把它召喚到身後，拍完可以直接分享到 LINE。

## 玩法

五題選擇題 → 六種人格標籤之一（勇氣、智慧、守護、自由、創造、羈絆）→ 對應的原創替身出現在你身後。
題目、替身名字、能力值和說明文字都在 `quiz.js`。

## 替身圖

放在 `stands/`，檔名固定：

| 檔名 | 標籤 | 替身 | Canva 原圖 |
|---|---|---|---|
| courage | 勇氣 | 《MARS》戰神瑪爾斯 | https://www.canva.com/M/MAHXSfz7Aww |
| wisdom | 智慧 | 《ATHENA》智慧女神雅典娜 | https://www.canva.com/M/MAHXSXBww1o |
| guard | 守護 | 《ARTEMIS》月之女神阿提米絲 | https://www.canva.com/M/MAHXSVAAkGg |
| freedom | 自由 | 《HERMES》旅神赫密士 | https://www.canva.com/M/MAHXSR0DA6k |
| create | 創造 | 《VENUS》美神維納斯 | https://www.canva.com/M/MAHXSTTHhsA |
| bond | 羈絆 | 《CUPID》愛神丘比特 | https://www.canva.com/M/MAHXSVbv2Wk |

`.png` 或 `.jpg` 都可以（有 `.png` 會優先用）。白底的圖會自動去背，透明底也可以。
目前放的是縮圖（約 150×200），要換成高解析的原圖才會清楚：用相同檔名覆蓋即可。
替身以希臘羅馬神話的神祇為原型（神話本身沒有版權），造型是重新繪製的原創圖，沒有使用任何漫畫原作角色。
相機會偵測使用者的頭部位置，讓替身的臉站在頭的旁邊，不會被擋住。

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
