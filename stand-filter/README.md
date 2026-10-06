# 替身相機

手機網頁濾鏡。打開網址就能開相機，在自己身後召喚一個「替身」，拍完可以直接分享到 LINE。

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
