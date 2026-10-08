# 寫實 AR 素材與實作

2026-10-09：真人 AR 改為獨立長衣身與左右長袖的三角網格貼合，不再把短背心整張等比縮放。衣身寬度依肩／髖、衣長依肩至髖距離；袖子獨立依肩、肘、腕彎曲。拍照在瀏覽器內合成；沒有上傳使用者照片或接入雲端 AI 換裝服務。

## 檔案

- `haori-rig-body-v2.png`：目前使用的長衣身，1024×1536，透明開襟、真實布料光影與縫線。
- `haori-rig-sleeve-v2.png`：目前使用的單袖素材，1024×1536，同一素材鏡像套用於兩臂。
- `../garment-rig.js`：素材 UV 錨點、身體比例、手臂彎曲、三角網格與側身角度門檻。
- `../models/selfie_multiclass_256x256.tflite`：Google MediaPipe 官方語義分割模型；髮／臉／皮膚遮罩與骨架候選區組合。模型資料：[官方說明](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter)。
- 下列 `haori-real-*` 為保留的舊版短衣素材，真人相機不再載入它們。
- `haori-real-base.png`：灰色織物基底，其他原創角色以保留亮度的套色與印花產生材質。
- `haori-real-thunder.png`：黄橙漸層與白三角的專用寫實服裝，紋樣、縫線與皺褶已在素材中融合。
- `haori-real-flame.png`：綠黑格紋專用寫實服裝。
- `preview-model.png`：AI 生成的虛構成年模特，僅 `?demo=photo` 驗證／示範使用；不是使用者照片。

以上圖片均由內建 ImageGen 產生，未使用 CLI 或 API 金鑰。服裝 PNG 保留原始 alpha。

## 最終提示詞

### 長衣身 v2（生成）

Use case: product-mockup. Asset type: neutral grayscale cloth BODY texture for a rigged real-time virtual haori try-on, PNG with genuine alpha. Make ONE isolated photographic Japanese long open-front haori BODY ONLY, without any sleeves, wearer, mannequin, hands, hanger, background or floor shadow. Tall vertical 2:3 portrait canvas. Garment reaches mid-thigh rather than cropped waist. Real woven matte cotton/silk, detailed stitching, thick folded lapels, natural vertical wrinkles, soft neutral diffuse daylight, subtle gray highlights and darker folds. Light medium-gray main cloth for later digital tinting; dark charcoal lapel edging and back inner collar. Full garment fills canvas, symmetrically FRONT-facing. Approximate anchoring: left shoulder seam at 16% canvas width, right shoulder seam 84%, both at 16% canvas height; neck center at 50% width, 10% height; underarms around 29% height; waist 58%; wide long hem at 94%. Collar top entirely visible. Open central gap from neckline to hem must be transparent, including neck hole. Shoulder cap only (sleeves will be a separate texture). Side edges gently taper into waist and flare modestly toward hem. Garment body only, no arms, no sleeves, no trousers. Do not resemble tactical armor, vest, cropped cape, cardigan or suit. It is the long torso part of a traditional haori. Clean transparent silhouette with photographic fabric detail. No black cartoon contours, cel shading, drawing, glossy plastic, text, logo or watermark.

### 獨立長袖 v2（生成）

Use case: product-mockup. Asset type: ONE isolated photographic sleeve texture for a rigged Japanese haori try-on. Genuine transparent PNG, vertical 2:3 portrait. ONLY a single detached long haori kimono sleeve, front camera view, hanging naturally vertically downward: shoulder attachment center at x=50%, y=7%; elbow center at x=50%, y=50%; wrist cuff opening center at x=50%, y=91%. Sleeve attachment/cuff axis stays centered down the image. Broad, softly draped upper sleeve with realistic vertical silk-cotton folds, narrower wrist cuff, generous traditional hanging fabric along side but restrained proportions, no inflated balloon shape. Medium-light neutral gray main fabric for later digital tinting; narrow charcoal seam and cuff edging. Soft neutral diffuse daylight, natural thick textile, actual woven fibers, stitching, subtle light/shadow. Entire sleeve visible filling most canvas with transparent padding. No body, hand, wearer, mannequin, other garment parts, hanger, floor, background, text, logo or watermark. Genuine alpha transparency including hollow cuff when visible. Photorealistic clothing product image, no illustration, cartoon outlines, armor or plastic.

以上為生成時提示詞。產出後依實際素材重新校正 UV：衣身肩線 y=.125、下擺 y=.97；袖子中線 u=.56、袖山 y=.15、肘 y=.5、袖口 y=.925。不可直接把提示詞百分比當成最終錨點。兩個新 PNG 均已驗證透明背景與開口 alpha。

### 黃橙服裝（基底為 edit target）

Edit target: the attached transparent isolated garment. Preserve the front-facing position, canvas dimensions, silhouette, open center, folds, seams, natural fabric detail and alpha transparency. Make this a photorealistic cosplay haori upper-body cape: warm golden yellow at shoulders transitioning softly to burnt orange near lower outer hem, with evenly spaced medium-sized ivory white triangles printed on the cloth, around 5 triangles across each front panel, following folds with shadow and distortion. Preserve the inner folded lapels as dark charcoal; keep realistic thickness, stitching and natural lighting. Remove the horizontal dark cloth bridge behind the neck opening so the entire neck hole is transparent; no head, mannequin or person. Increase realistic satin-cotton fabric creases subtly. No illustration, black cartoon outlines, plastic, text, logos, floor or background. True alpha cutout. The garment will be placed over a real person's shoulders in a mobile AR camera.

### 綠黑格紋（基底為 edit target）

Edit the attached transparent garment into a photorealistic emerald green and near-black checkered cosplay haori shoulder cape. Preserve its canvas dimensions, position, open front, folds, seams, realistic textile surface, lighting and silhouette. Large alternating checkered squares printed directly into the woven cloth, approximately four squares across each front panel, with realistic distortion following fabric folds and seam stitching. Dark charcoal inner lapels. Preserve genuine alpha transparency; clear transparent neck opening. Garment only, no wearer, mannequin, head, arms, text, watermark or background. High end product photography, soft neutral light, real fabric texture and thickness. No illustration, cel shading, cartoon outlines or plastic.

### 示範模特（生成）

Use case: photorealistic-natural. Asset type: fictional model reference photograph for testing a mobile upper-body AR clothing overlay. A clearly adult male model with short dark hair, wearing a plain dark crew-neck cotton t-shirt, facing camera, framed from just above head to waist in vertical portrait 3:4. One forearm crosses his chest with open fingers resting on upper chest, other forearm down by his waist. BOTH shoulders, elbows and wrists visible. Normal human anatomy. Realistic smartphone photograph, warm neutral indoor wall, soft daylight from left, natural skin detail and fabric, neutral expression. No costume, jewelry, words, logos, sword, animation or illustration. Clearly centered, head near top 15%, shoulders at 35%, waist at bottom. This is a synthetic model for testing, not a real identifiable person.

## 相機行為與限制

- 首頁與測驗結果提供本機照片試穿。照片方向保持原樣，預覽顯示整張照片；匯出保持照片比例，最長邊至多 2048 px。超過 2560 px 的來源照片先在瀏覽器縮小，單檔上限 25 MB。
- 靜態照片只執行一次姿勢辨識及一次語義分割；換图才重新辨識。素材、模型或造型狀態改變才重畫。照片與遮罩都不傳至伺服器。無法辨識雙肩、沒有人的圖片、過大側身或素材尚未完成載入時，不啟用產生試穿照按鈕。

- 預設自拍，不持武器；臉與肩膀足以定位，無須全身入鏡。
- 頭髮／臉語義遮罩維持前景；手部骨架候選區與皮膚遮罩交集保留手指。語義模型失敗時使用頭／頸錨點與本人膚色色度回退。不是精確的逐指追蹤。
- 使用 MediaPipe worldLandmarks 估算軀幹 yaw；中度側身依投影肩寬及開襟偏移近似透視、袖子依深度排序。超過約 70 度不渲染正面服裝。半身／手腕離鏡時用有界比例回退，不要求全身。
- 材質印花保留中性布料亮度與暗色衣襟；現場亮度緩慢調整。不是物理布料模擬或精確光源重建。
- 造型面板提供寬鬆度 85–120%、衣長 80–120% 的微調；預設仍為自動骨架貼合。
- 即時渲染上限約 30 fps；語義遮罩最多每 600 ms 更新，850 ms 過期時回退。低階手機效能仍需實機驗證，無保證帧率。
- 此版是分區 2.5D 網格合成，沒有全角度 3D 布料或 AI 拍照後重新生成。背面、極端側身、寬大原衣服、嚴重遮擋仍有限制，不能靠重新縮放正面圖解決。
- 修改寫實素材時請檢查 `ar.js` 的 `rigPhotos`、`rigTexture`、`drawRealHaori` 與 `garment-rig.js` 的 UV 註冊；不必再修改旧的 3D 羽織 `Outfit`。

## 驗證

`node tests/garment-rig.test.mjs` 檢查肩線錨點、衣長獨立於肩寬、袖子關節、單臂獨立移動、半身回退、中度 yaw 與極端側身門檻。另用使用者提供的私人截圖在本機手機尺寸瀏覽器測試；該截圖已有舊衣服／刀合成，不能當成乾淨原圖。私人測試照片與驗證截圖不得放進 assets、Git 或部署 ZIP。
