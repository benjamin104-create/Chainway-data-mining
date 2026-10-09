# 旅神偵測器・日本篇

「誰是守護你出門的神？」手機網頁小遊戲：一趟日本旅行的十題情境測驗 → 六種旅伴性格（領航、規劃、冒險、照顧、氣氛、結緣）→ 選「神獸／神明／交給緣分」→ 抽一支おみくじ → 日本十二位神獸與神明之一出現在你身邊，用 AR 相機合照、分享到 LINE。

網址：https://jaminepa-kami.netlify.app

## 十二位守護神

| 性格 | 神獸（a） | 神明（b） |
|---|---|---|
| 領航 | 八咫烏 yatagarasu | 天照大神 amaterasu |
| 規劃 | 稻荷神狐 inari | 毘沙門天 bishamonten |
| 冒險 | 龍神 ryujin | 大天狗 tengu |
| 照顧 | 大口真神（神狼）okami | 孔雀明王 kujaku |
| 氣氛 | 招財貓 manekineko | 弁財天 benzaiten |
| 結緣 | 因幡白兔 shirousagi | 大黑天 daikokuten |

圖放在 `stands/<id>.webp`（透明底）與 `stands/<id>.jpg`（備用）。左右構圖可另放 `<id>_left.webp`、`<id>_right.webp`，正中央與片頭可放 `<id>_front.webp`；沒有就用主圖。圖由 Canva AI 生成的原創插畫。

## 動漫姿勢彩蛋（`poses.js`）

用 MediaPipe 手部定位（`models/hand_landmarker.task`）判斷姿勢：

- 一隻手遮住半邊臉、停一下 → 那半邊臉浮現骨白半面具（原創設計：黑紅刀痕、裂痕、獠牙、金色眼光），放下手後留 10 秒
- 張開手掌舉高 → 手掌上燃起藍色狐火
- 雙手合十（結印）→ 集中線、神光與「顕現」大字

測驗文字、神明資料在 `quiz.js`。其餘相機、美顏與台灣篇相同。
