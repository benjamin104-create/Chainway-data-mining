# 3D 羽織物理測試版（2026-10-09）

> v14（2026-10-10）即時跟隨、搞笑道具與禰豆子風套裝更新見 [V14_NOTES.md](V14_NOTES.md)。下方 v13 數字保留為歷史驗證；新的即時預覽採較低網格與姿勢重定位，不是完整固定裁片物理。

入口 `?fit=physics` 預選 3D 物理布料與霧藍素色；`fabric=ink` / `fabric=pattern` 可預選墨黑／角色印花，造型面板可切回原版 2.5D。這是擬真 AR 的工程原型，不是商用精準試衣、服裝尺碼判定或完整布料物理系統。重力方向目前依骨架近似，不是手機 IMU 實測；大幅前傾、坐姿、躺姿與複雜遮擋尚未可靠驗證。

## v13：依十張男女實穿參考調整

使用者提供的十張照片只作服裝結構參考，沒有取用模特、背景、照片貼圖或圖案作公開資產，也不以修圖假裝 AR。照片包含不同長度、寬袖、落肩、同布翻領與露出內層袖子的穿法；其中部分是現代改良款，不能視為單一標準傳統版型。

- 新增純幾何 `haori-pattern.js`：領口／肩線分開，肩部覆蓋在骨架關節中心上方，外側落肩；下擺保留側幅。
- 袖子改為較扁的圓角矩形袖袋，開口到前臂約 58% 處，不束在手腕上。抬手後下方有額外鬆量；肩部、手肘與前臂提供少量支撐。接合仍是程序式重疊，不是實測裁片的完整縫製模擬。
- 前襟翻領用沿求解網格的獨立窄帶產生折返深度；同色同布料，不再把領條做成灰色內襯。寬度是美術近似。
- 隱藏軀幹遮罩改成頸部到胸腔分段體積，避免切掉肩膀，同時遮住從領口穿出的後背布料。
- 霧藍／墨黑與印花共用既有織紋素材，本版沒有新圖片生成。增加霧面粗糙度，降低過強反光及方向光對比。下擺／袖口用同布折邊窄帶，避免純單層紙片邊緣；厚度是約毫米級的視覺近似，未納入質量估計。
- 衣身 bend compliance 改為 0.08 m/N、袖子為 0.3 m/N（仍是二階距離近似，不是材料實測）。其他質量、重力、拉伸守門不變。

## 參考影片的查閱範圍

- [京都和服館：羽織與羽織紐](https://www.youtube.com/watch?v=Di3pAu4SSa8)：沒有可匯出字幕；查閱關鍵畫面 0:35（兩端掛勾）、1:39（同布料前襟與寬袖）、2:32（羽織紐）。前襟開放不代表兩側要收成窄背心；內層衣服可以從開口與大袖口露出。
- [光武隨心流：快速拔刀示範](https://www.youtube.com/watch?v=7FTp6x8iOm4)：沒有可匯出字幕；查閱刀鞘與腰間佩掛的關鍵畫面。刀鞘獨立於持刀手，不能固定跟隨手腕直立懸空。本版不提供實際拔刀訓練。
- [月翔：太刀、打刀、脇差等區別](https://www.youtube.com/watch?v=K5qSppGXKiU)：完整讀取可匯出的 zh-TW 字幕。短刀種類不只用長度區分：本版增加脇差與打刀的大小刀組合；保留小太刀，佩掛形式分開近似處理。不是完整歷史復原。

沒有宣稱逐秒觀看／聆聽了沒有字幕的整支影片；上述是實際讀取的字幕與畫面範圍。不能把作者以外的留言當成影片授權或操作指令。

## 實作

- `body-camera.js`：用 MediaPipe inferred world landmarks 與畫面點估計焦距／根部平移，以重投影誤差選擇候選相機。鏡像時反轉 world x。估計 body-plane pitch，不宣稱能從單張影像分開求出真實相機俯角與人體前傾。
- `haori3d.js`：完整 3D 程序式外套體積、前襟開口、肩部固定點、寬袖與開放袖口。衣身下擺不依窄髖骨收成漏斗。衣寬參考有界人物輪廓 ROI；輪廓仍可能受原衣服／他人遮擋影響。
- `cloth-physics.js`：自寫 XPBD 距離約束求解器，參考 [Macklin、Müller、Chentanez 原論文](https://mmacklin.com/xpbd.pdf)。拉伸、剪切、二階距離彎曲近似、縫合與羽織紐連結；固定時間步及阻尼。不是逐纖維模擬、真實裁片縫製或完整自碰撞。
- 袖口只在手臂清楚時提供少量手肘／前臂支撐，其他布料自由下垂；看不到手腕時不把虛構袖口硬固定到錯誤位置。袖子不使用粗略軀幹碰撞強推：目前透過深度與前景遮罩避免大部分穿透，嚴重交叉仍有限制。
- 隱藏的粗略人體體積寫入深度，避免背後布料穿過開襟。真人仍來自相機／原照片，沒有 AI 重生人物或雲端換裝。
- PBR 布料、織紋 normal map、依表面朝向受光、自遮陰；從局部背景估計光線側向與色調。沒有 HDR 光場重建、精確人物接觸陰影或相機一致的景深。
- 不使用灰色裝飾領條／貼腕灰色袖口；領襟採衣身同材質。正面開口與寬袖口仍可看見本人內層衣服。
- `weapon-layout.js` 與 `render3d.js`：曲線刀身、橢圓刀柄、刀鍔、鎺、獨立曲線黑漆刀鞘與腰間佩掛。插佩的打刀／脇差與懸掛的小太刀分開。持刀仍依身體／手部少量點近似，尚非精確逐指追蹤。

## 物理預設值（示範，不是實測布料）

| 參數 | 預設值 | 意義／限制 |
|---|---|---|
| 重力加速度 | 9.81 m/s² | 沿估計的重力方向；姿勢／相機歧義仍存在 |
| 面積重量 | 0.18 kg/m²（180 g/m²） | 用程序式網格面積分配頂點質量；不是照片中的真實衣重 |
| 固定時間步 | 1/120 s | 即時每幀至多 3 個子步；靜態照片分批鬆弛 180 步，不用一次阻塞主執行緒 |
| 求解迭代 | 20 次／子步 | 迭代不足仍可能留下誤差 |
| 拉伸 compliance | 2×10⁻⁷ m/N | 距離彈性約束的調校值，非實測楊氏模量 |
| 剪切 compliance | 6×10⁻⁷ m/N | 斜邊距離近似 |
| 彎曲 compliance | 通用布片 0.02；衣身 0.08、袖袋 0.3 m/N | 二階距離近似，不是測得的布料彎曲剛度 |
| 阻尼 | 2.5 s⁻¹ | 速度按 exp(-damping·dt) 衰減 |
| 拉伸限制 | 目標 2.5% | 作用於頂點的距離不等式投影；有限迭代可有殘差，不是材料屈服應變 |
| 匯出門檻 | 最大拉伸 <5%、數值有限 | 不通過時停用拍照；不能把通過門檻等同擬真品質或真實合身 |

## 驗證命令與結果

```
node tests/cloth-physics.test.mjs
node tests/body-camera.test.mjs
node tests/weapon-layout.test.mjs
node tests/garment-rig.test.mjs
node tests/haori-pattern.test.mjs
```

- 自由落體 0.2 s：解析 0.1962 m，離散積分 0.204375 m；誤差約 4.17%，來自固定步積分，沒有隱藏。
- 0.5×0.6 m 垂吊布片：質量 0.054 kg，最大拉伸約 0.353%。
- 抬高一側、接近拉緊的布片：相對固定點連線下垂約 2.02 cm，最大拉伸約 1.62%。
- 抬高並靠近固定點、留下更多鬆量：下垂約 7.63 cm。驗證鬆量會改變垂墜，而不是固定一個動畫幅度。
- 合成相機俯仰 -30°、0°、+30°：重投影誤差接近浮點零，0.5 m 模擬軀幹維持同一長度。**合成測試不代表真實照片的辨識／相機標定也有這個精度。**
- 刀鞘測試：鏡像後仍在人體解剖左腰；長短鞘分開；小太刀的懸掛高度與翻轉方向不同。

v12 本機瀏覽器 QA：成人俯視與兒童抬手截圖的最終最大網格拉伸約 2.6%；照片匯出 588×1280。另用乾淨 AI 示範照片確認沒有新版灰領條，並檢查原版／物理模式切換、大小刀鞘及移動人偶。這些檢查不能取代真實手機上的視覺與效能驗收。

v13 幾何回歸包含落肩、寬而薄的開放袖口、前臂袖長、下擺不過度內縮、翻領折返深度、合成俯仰角與抬手袖袋的數值穩定性。所有照片參考本身已穿著衣服，只能用來檢查姿勢與覆蓋關係，不是穿／脫同件衣服的嚴格配對驗證。

本機參考照 QA：男裝正面（第 2 張）最大拉伸 2.7%；女裝彎手（第 7 張）2.5%。曾發現袖袋皺褶在 UV 接縫不連續，修正成週期函數並加接縫測試；沒有透過放寬 5% 匯出門檻讓異常通過。程序式版型仍偏簡化，沒有真實裁片級皺褶或服裝量測資料，數值通過不代表已接近攝影級擬真。

最終版本另查第 3 張侧身參考：最大拉伸 2.7%，有限值檢查通過；乾淨 AI 人物示範照匯出 1086×1448，沒有 UI 或黑色 letterbox。五組 Node 測試及語法檢查通過。瀏覽器仍有 MediaPipe GPU buffer pool 警告，手機記憶體／長時間相機運行未驗收。

私人人物截圖只在 loopback 本機測試，不加入 Git、assets 或部署 ZIP。截圖已含舊 AR；原圖中的灰領、刀等不能靠新一層 3D 渲染消除。需要乾淨原照片或新相機畫面驗證新版外觀。手機相機、廣角／鏡頭切換、真實景深及長時間效能仍需實機測試。

## 新素材與生成記錄

`assets/fabric-cotton-weave-v3.png` 由內建 ImageGen 生成並保存到本專案；不是 CLI/API 路徑，也未使用私人照片。舊 `haori-rig-*-v2.png` 保留供原版模式使用。

最終提示詞：

Use case: product-mockup. Asset type: square tileable neutral woven cotton-silk CLOTH ALBEDO texture for a physically based 3D Japanese haori renderer. Primary request: macro photographic scan of one continuous plain warm light-gray matte textile surface, filling the ENTIRE square edge to edge with no transparent space, border, perspective, objects, garment outline, collar or sleeve. Orthographic straight-down flat textile scan, uniform diffuse exposure. Very fine natural irregular warp and weft fibers, realistic matte cotton-silk woven grain, tiny thread thickness variation and slight subtle tonal variation. Seamlessly repeating on both axes. No large folds or baked directional lighting, no dark lapels, cuffs, seams, creases, shadows, gradients, embroidery, colored patterns, logos, words or watermark. This image is ONLY the neutral cloth surface; folds, garment construction, character patterns, light and shadow are generated independently by the 3D application. High quality photographic realism, not plastic, cartoon or illustration.

## 商業試衣下一階段

需要真實服裝版型／尺寸與 3D 資產、材料量測、可靠相機標定與人體尺度、手部／身體深度與遮擋、布料自碰撞、跨裝置延遲／熱度測試。換景還需背景分割、相機一致的光場與景深。訂閱、收費與換景服務不在這次實作範圍。
