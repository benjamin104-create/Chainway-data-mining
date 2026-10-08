# 寫實 AR 素材與實作

2026-10-08：真人 AR 使用透明服裝照片與肩線定位，取代 Canvas 幾何服裝。拍照在瀏覽器內重新合成原始相機畫面、服裝與特效；目前沒有上傳使用者照片或接入雲端 AI 換裝服務。

## 檔案

- `haori-real-base.png`：灰色織物基底，其他原創角色以保留亮度的套色與印花產生材質。
- `haori-real-thunder.png`：黄橙漸層與白三角的專用寫實服裝，紋樣、縫線與皺褶已在素材中融合。
- `haori-real-flame.png`：綠黑格紋專用寫實服裝。
- `preview-model.png`：AI 生成的虛構成年模特，僅 `?demo=photo` 驗證／示範使用；不是使用者照片。

以上圖片均由內建 ImageGen 產生，未使用 CLI 或 API 金鑰。服裝 PNG 保留原始 alpha。

## 最終提示詞

### 黃橙服裝（基底為 edit target）

Edit target: the attached transparent isolated garment. Preserve the front-facing position, canvas dimensions, silhouette, open center, folds, seams, natural fabric detail and alpha transparency. Make this a photorealistic cosplay haori upper-body cape: warm golden yellow at shoulders transitioning softly to burnt orange near lower outer hem, with evenly spaced medium-sized ivory white triangles printed on the cloth, around 5 triangles across each front panel, following folds with shadow and distortion. Preserve the inner folded lapels as dark charcoal; keep realistic thickness, stitching and natural lighting. Remove the horizontal dark cloth bridge behind the neck opening so the entire neck hole is transparent; no head, mannequin or person. Increase realistic satin-cotton fabric creases subtly. No illustration, black cartoon outlines, plastic, text, logos, floor or background. True alpha cutout. The garment will be placed over a real person's shoulders in a mobile AR camera.

### 綠黑格紋（基底為 edit target）

Edit the attached transparent garment into a photorealistic emerald green and near-black checkered cosplay haori shoulder cape. Preserve its canvas dimensions, position, open front, folds, seams, realistic textile surface, lighting and silhouette. Large alternating checkered squares printed directly into the woven cloth, approximately four squares across each front panel, with realistic distortion following fabric folds and seam stitching. Dark charcoal inner lapels. Preserve genuine alpha transparency; clear transparent neck opening. Garment only, no wearer, mannequin, head, arms, text, watermark or background. High end product photography, soft neutral light, real fabric texture and thickness. No illustration, cel shading, cartoon outlines or plastic.

### 示範模特（生成）

Use case: photorealistic-natural. Asset type: fictional model reference photograph for testing a mobile upper-body AR clothing overlay. A clearly adult male model with short dark hair, wearing a plain dark crew-neck cotton t-shirt, facing camera, framed from just above head to waist in vertical portrait 3:4. One forearm crosses his chest with open fingers resting on upper chest, other forearm down by his waist. BOTH shoulders, elbows and wrists visible. Normal human anatomy. Realistic smartphone photograph, warm neutral indoor wall, soft daylight from left, natural skin detail and fabric, neutral expression. No costume, jewelry, words, logos, sword, animation or illustration. Clearly centered, head near top 15%, shoulders at 35%, waist at bottom. This is a synthetic model for testing, not a real identifiable person.

## 相機行為與限制

- 首頁與測驗結果提供本機照片試穿。照片方向保持原樣，預覽顯示整張照片；匯出保持照片比例，最長邊至多 2048 px。超過 2560 px 的來源照片先在瀏覽器縮小，單檔上限 25 MB。
- 靜態照片只執行一次姿勢辨識，換圖才重新辨識；照片與遮罩都不傳至伺服器。無法辨識雙肩、沒有人的圖片或素材尚未完成載入時，不啟用產生試穿照按鈕。

- 預設自拍，不持武器；臉與肩膀足以定位，無須全身入鏡。
- MediaPipe 人體遮罩與頭／頸／前臂錨點維持基本前後遮擋。手部候選區域另用本人膚色色度縮小，減少原衣服在手周圍穿出。
- 雷系及綠黑格紋服裝保留照片原始布料光影；亮度依現場估計緩慢調整。
- 此版仍為正面服裝影像合成，沒有全角度 3D 布料、真實光源估測、語義手部遮罩或 AI 拍照後重新生成。大幅側身、遮擋及光線差異仍可能影響邊緣。
- 改寫實素材時，請修改 `ar.js` 的 `realPhotos` 與 `drawRealHaori`，不必再修改舊的 3D 羽織 `Outfit`。
