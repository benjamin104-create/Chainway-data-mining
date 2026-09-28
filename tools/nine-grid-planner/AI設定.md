# 讓網站的 AI 動起來（約 5 分鐘）

網站內建的 AI（目標教練、AI 設計背景、拍照匯入…）需要一把 AI 金鑰。
金鑰只放在 Netlify，程式和網頁裡都看不到。**沒有設定之前，網站會直接說「AI 還沒接上」，不會假裝有回答。**

## 建議：Claude（最聰明，教練對話和計畫最具體）
1. 到 https://console.anthropic.com 註冊並儲值（按用量計費）。
2. 「API Keys」→「Create Key」，複製金鑰（`sk-ant-` 開頭）。
3. Netlify → jaminepa-ninegrid → Site configuration → Environment variables → Add a variable
   - Key：`ANTHROPIC_API_KEY`
   - Value：貼上金鑰，勾選「Contains secret values」
4. Deploys →「Trigger deploy」→「Deploy site」，完成後就能用。

預設用 Claude Opus 5。想省錢可以再加一個變數 `CLAUDE_MODEL` = `claude-sonnet-5`（比較便宜，品質仍然不錯）。

## 替代：Gemini（有免費額度，但回答比較淺）
同樣的步驟，Key 改成 `GEMINI_API_KEY`，金鑰到 https://aistudio.google.com/apikey 申請。
兩把都設的話，網站會用 Claude。

## 保護帳單
網站已經內建上限，可以用環境變數調整：
- `AI_PER_DAY`：同一個網路每天幾次（預設 150）
- `AI_PER_HOUR`：同一個網路每小時幾次（預設 30）
- `AI_DAILY_CAP`：整個網站每天幾次（預設 3000）
- 每位使用者在網站上還有自己的每日次數（免費 20 次）

另外建議在 Anthropic Console 的「Limits」設定每月花費上限。

**金鑰不要貼到聊天、GitHub 或任何網頁上。**
