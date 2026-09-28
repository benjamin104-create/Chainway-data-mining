# 開啟 Google 登入（約 10 分鐘，只要做一次）

Google 登入只會在正式網址 https://jaminepa-ninegrid.netlify.app 運作。
claude.ai 的 Artifact 預覽頁是沙盒，Google 不允許在裡面登入。
還沒設定之前，網站上的按鈕會變淡，並寫「準備中」。

## 步驟
1. 打開 https://console.cloud.google.com ，建立一個專案（名字隨意，例如 jaminepa-ninegrid）。
2. 左側選單 →「API 和服務」→「程式庫」，啟用這兩個：
   - Google Drive API（備份用）
   - YouTube Data API v3（匯入播放清單用，可以晚點再開）
3. 「OAuth 同意畫面」：
   - 類型選「外部」，填應用程式名稱「九宮格週計畫」、你的聯絡 Email。
   - 範圍加入：`openid`、`email`、`profile`、`.../auth/drive.appdata`（之後要 YouTube 再加 `.../auth/youtube.readonly`）。
   - 測試階段先把自己和朋友的 Gmail 加進「測試使用者」；要公開給所有人時再按「發布應用程式」。
4. 「憑證」→「建立憑證」→「OAuth 用戶端 ID」：
   - 應用程式類型：網頁應用程式
   - 已授權的 JavaScript 來源：`https://jaminepa-ninegrid.netlify.app`
   - （不需要填重新導向 URI）
5. 複製產生的「用戶端 ID」（長得像 `1234567890-xxxx.apps.googleusercontent.com`）貼給 Claude，
   它會填進 `index.html` 的 `OWNER.googleClientId`，重新部署後按鈕就會亮起來。

用戶端 ID 本來就會出現在網頁裡，可以公開；「用戶端密鑰」（Client secret）用不到，**不要**貼出來。
