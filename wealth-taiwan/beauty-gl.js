// 美顏（GPU 版）：用臉部 478 個定位點畫出皮膚／眼下／臉頰的範圍，
// 在手機 GPU 上做「保留輪廓的磨皮」、膚色均勻、粉嫩美白、遮黑眼圈、五官清晰、唇色、腮紅、柔光，最後再瘦臉、放大眼睛。
// 全部在手機上算，照片不會上傳。

// 臉部網格的點位編號（MediaPipe Face Mesh）
const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const EYE_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const EYE_L = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const BROW_R = [46, 53, 52, 65, 55, 107, 66, 105, 63, 70];
const BROW_L = [276, 283, 282, 295, 285, 336, 296, 334, 293, 300];
const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const LID_R = [33, 7, 163, 144, 145, 153, 154, 155, 133];
const LID_L = [263, 249, 390, 373, 374, 380, 381, 382, 362];
const NOSTRILS = [[48, 64, 98, 97, 2, 326, 327, 294, 278]];
const SLIM = [[58, .55], [172, 1], [136, .8], [288, .55], [397, 1], [365, .8]];
const CHIN = [[152, 1], [148, .7], [377, .7]];

const VS = `#version 300 es
in vec2 p; out vec2 v; uniform float flipY;
void main() { v = vec2(p.x * .5 + .5, flipY > .5 ? .5 - p.y * .5 : p.y * .5 + .5); gl_Position = vec4(p, 0., 1.); }`;

// 第一步：磨皮、膚色均勻、美白（粉嫩）、遮黑眼圈、五官清晰、唇色、補光、氣色、柔光（輸出不預乘的顏色）
const FS_BEAUTY = `#version 300 es
precision highp float;
in vec2 v; out vec4 o;
uniform sampler2D src, mask, feat;
uniform vec2 px;
uniform vec3 tone;
uniform float rad, ringR, smoothK, whiteK, glowK, lightK, eyesK, evenK, sharpK, softK, bloomR, appleK, autoExp, autoShadow;
uniform vec3 autoWB;
const vec3 LUM = vec3(.299, .587, .114);
vec3 softLight(vec3 b, vec3 s) {
  return mix(2. * b * s + b * b * (1. - 2. * s), sqrt(b) * (2. * s - 1.) + 2. * b * (1. - s), step(.5, s));
}
// 膚色可能性（YCbCr）：讓脖子、手也一起美顏，臉和脖子之間就不會有一條分界
float skinLike(vec3 c) {
  float y = dot(c, vec3(.299, .587, .114));
  float cb = .5 - .168736 * c.r - .331264 * c.g + .5 * c.b, cr = .5 + .5 * c.r - .418688 * c.g - .081312 * c.b;
  return clamp(1. - (abs(cr - .596) - .067) / .035, 0., 1.) * clamp(1. - (abs(cb - .416) - .086) / .035, 0., 1.) * clamp((y - .15) / .12, 0., 1.);
}
void main() {
  vec4 c0 = texture(src, v);
  if (c0.a < .004) { o = vec4(0.); return; }
  vec3 col = c0.rgb;
  vec4 m = texture(mask, v);
  float like = skinLike(col);
  float skin = max(m.r, .45 * like);              // 磨皮：臉全力，其他皮膚輕一點
  float toneW = max(m.r, like);                    // 美白、氣色：所有皮膚一樣，不留分界
  if (skin > .01 && smoothK > 0.) {
    // 雙邊濾波：只和「顏色相近」的鄰居平均，所以斑點和細紋被抹平，五官輪廓留著
    vec3 acc = col; float ws = 1.;
    for (int ring = 1; ring <= 4; ring++) {
      float r = rad * float(ring) / 4.;
      for (int k = 0; k < 10; k++) {
        float an = float(k) * .6283 + float(ring) * .37;
        vec4 s = texture(src, v + vec2(cos(an), sin(an)) * r * px);
        vec3 d = s.rgb - col;
        float w = exp(-dot(d, d) * 55.) * s.a;
        acc += s.rgb * w; ws += w;
      }
    }
    vec3 bil = acc / ws;
    col = mix(col, bil, clamp(smoothK * skin, 0., 1.));
    // 膚色均勻：只把泛紅、暗黃的「顏色」拉回臉頰膚色，明暗（臉的立體感）不動
    vec3 cd = tone - bil; cd -= dot(cd, LUM);
    col += cd * clamp(evenK * skin * like, 0., .85);              // 只動真的是膚色的地方（鏡框、頭髮不會被染色）
  }
  if (m.g > .01 && eyesK > 0.) {
    // 遮黑眼圈：把眼下的平均色調拉回臉頰的膚色，保留皮膚紋理
    vec3 avg = vec3(0.); float wa = 0.;
    for (int k = 0; k < 12; k++) {
      float an = float(k) * .5236;
      vec3 s = texture(src, v + vec2(cos(an), sin(an)) * ringR * px).rgb;
      float w = smoothstep(.12, .3, dot(s, vec3(.299, .587, .114)));   // 鏡框、睫毛這種很暗的不算
      avg += s * w; wa += w;
    }
    avg = wa > .01 ? avg / wa : col;
    float lc = dot(col, vec3(.299, .587, .114)), la = dot(avg, vec3(.299, .587, .114));
    // 只換「整體的暗沉和偏色」（低頻），原本的皮膚紋理（col - avg）完整保留，所以不會像塗上去的
    vec3 target = mix(avg, tone, .8);
    vec3 fixd = col + (target - avg);
    float keep = smoothstep(.45, .7, lc / max(la, .04));            // 比周圍暗很多的是鏡框／睫毛，不動
    col = mix(col, clamp(fixd, 0., 1.), clamp(m.g * eyesK * keep, 0., .9));
  }
  if (whiteK > 0.) {
    float beta = 1. + whiteK * 3.5;
    vec3 wc = log(col * (beta - 1.) + 1.) / log(beta);
    col = mix(col, wc, (.12 + .88 * toneW) * min(1., whiteK * 1.2));
    col = mix(col, softLight(col, vec3(1., .8, .83)), whiteK * .4 * toneW);   // 粉嫩透亮，不是死白
  }
  // 五官清晰：皮膚越光滑，眼睛、眉毛、睫毛越要清楚；眼白提亮；淡淡唇色
  vec4 f = texture(feat, v);
  float fe = max(max(f.r, f.g * .55), f.b * .5);
  if (fe > .01 && sharpK > 0.) {
    vec3 bl4 = (texture(src, v + vec2(px.x, 0.) * 1.5).rgb + texture(src, v - vec2(px.x, 0.) * 1.5).rgb
              + texture(src, v + vec2(0., px.y) * 1.5).rgb + texture(src, v - vec2(0., px.y) * 1.5).rgb) * .25;
    col += (c0.rgb - bl4) * sharpK * 1.1 * fe;
    col = mix(col, clamp((col - .45) * 1.1 + .48, 0., 1.), f.r * sharpK * .5);
  }
  if (f.b > .01 && glowK > 0.) {
    vec3 lip = softLight(col, vec3(1., .42, .52));
    col = mix(col, mix(vec3(dot(lip, LUM)), lip, 1.15), f.b * glowK * .55);
  }
  if (lightK > 0.) col += col * (1. - col) * lightK * .85;
  if (glowK > 0.) {
    col = mix(col, softLight(col, vec3(1., .62, .55)), glowK * .4 * (.4 + .6 * toneW));
    col = mix(col, softLight(col, vec3(1., .5, .55)), m.b * glowK * .3);
  }
  if (softK > 0.) {
    // 柔光：周圍亮部暈開成一層柔焦光暈，整體帶一點夢幻感
    vec3 bl = vec3(0.); float n = 0.;
    for (int k = 0; k < 12; k++) {
      float an = float(k) * .5236;
      for (int ring = 1; ring <= 2; ring++) {
        vec4 s = texture(src, v + vec2(cos(an + float(ring)), sin(an + float(ring))) * bloomR * float(ring) * .5 * px);
        bl += s.rgb * s.a; n += s.a;
      }
    }
    bl = n > .01 ? bl / n : col;
    vec3 hi = clamp((bl - .5) * 2., 0., 1.);
    col = 1. - (1. - col) * (1. - hi * softK * .45);
    col = mix(col, max(col, bl), softK * .22);
  }
  // 自動補光：依臉的亮度和顏色自動修正，不用使用者調整
  col *= autoWB;                                                   // 黃光、綠光、藍光偏色拉回好看的膚色
  if (autoExp > 0.) {
    // 太暗就提亮：只提「亮度」、顏色比例不變（不會變灰白）；皮膚提最多，頭髮衣服只提一點
    float l = max(dot(col, LUM), .01), e = autoExp * (.35 + .65 * toneW);
    float l2 = 1. - pow(1. - min(l, 1.), 1. + e);
    col *= l2 / l;
  }
  if (autoShadow > 0.) {
    float l = dot(col, LUM);
    col += (1. - smoothstep(.25, .75, l)) * autoShadow * .14 * toneW;   // 頂光造成的眼窩、鼻下、下巴陰影補亮
  }
  if (appleK > 0.) {
    // 蘋果肌（最後才上，不會被美白、柔光洗掉）：兩頰粉嫩紅暈，中間一點光澤看起來飽滿；整體膚色也暖一點，不會死白
    col = mix(col, softLight(col, vec3(1., .6, .54)), appleK * .2 * toneW);
    float a = m.b * appleK;
    col = mix(col, softLight(col, vec3(1., .38, .46)), min(.9, a * 1.1));
    col += vec3(1., .93, .9) * a * a * .05;
  }
  o = vec4(clamp(col, 0., 1.), c0.a);
}`;

// 第二步：瘦臉（下巴兩側往內推）、下巴拉提（下巴往上收）、大眼（以眼珠為中心放大），輸出預乘的顏色給畫布
const FS_WARP = `#version 300 es
precision highp float;
in vec2 v; out vec4 o;
uniform sampler2D img;
uniform vec2 size;
uniform vec4 slim[9];
uniform float slimR[9];
uniform float bigK;
uniform vec3 eye[2];
void main() {
  vec2 p = v * size;
  for (int i = 0; i < 9; i++) {
    float r = slimR[i], d = distance(p, slim[i].xy);
    if (r > 0. && d < r) { float t = 1. - d * d / (r * r); p -= slim[i].zw * t * t; }
  }
  if (bigK > 0.) for (int i = 0; i < 2; i++) {
    vec2 c = eye[i].xy; float r = eye[i].z, d = distance(p, c);
    if (d < r) { float t = d / r; p = c + (p - c) * (1. - bigK * (1. - t * t)); }
  }
  vec4 s = texture(img, p / size);
  o = vec4(s.rgb * s.a, s.a);
}`;

// 自動補光：用兩頰的膚色估計這張照片的曝光和偏色，算出要補多少
// 目標：明亮、帶一點暖粉的膚色（台灣人喜歡的「狀態好」）
const IDEAL = [.93, .76, .66];
const lum = (c) => .299 * c[0] + .587 * c[1] + .114 * c[2];
let autoState = null;
function autoCorrect(tone, on) {
  if (!on) return { exp: 0, shadow: 0, wb: [1, 1, 1] };
  const y = lum(tone), iy = lum(IDEAL);
  const exp = Math.max(0, Math.min(1.3, (.7 - y) / .7 * 2.4));                // 越暗補越多
  const shadow = Math.max(.35, Math.min(1, (.75 - y) * 2.5));
  const wb = IDEAL.map((c, i) => {
    const want = (c / iy) / (tone[i] / Math.max(.05, y));                       // 理想色比 ÷ 目前色比
    return Math.max(.88, Math.min(1.12, 1 + (want - 1) * .4));                  // 只修一部分，保留現場氣氛
  });
  const next = { exp, shadow, wb };
  if (!autoState) autoState = next;
  else {                                                                         // 慢慢變，不會閃
    autoState.exp += (next.exp - autoState.exp) * .15; autoState.shadow += (next.shadow - autoState.shadow) * .15;
    autoState.wb = autoState.wb.map((c, i) => c + (next.wb[i] - c) * .15);
  }
  return autoState;
}

export function createBeautyGL() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = (fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
  let P1, P2;
  try { P1 = prog(FS_BEAUTY); P2 = prog(FS_WARP); } catch (e) { console.warn('beauty gl', e); return null; }
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const tex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t; };
  const tSrc = tex(), tMask = tex(), tMid = tex(), tFeat = tex();
  const fbo = gl.createFramebuffer();
  let fw = 0, fh = 0;
  const U = (p, n) => gl.getUniformLocation(p, n);
  const maskC = document.createElement('canvas'), mc = maskC.getContext('2d');
  const layerC = document.createElement('canvas'), lc = layerC.getContext('2d');
  const featC = document.createElement('canvas'), fc = featC.getContext('2d');
  // 平滑後的定位點（避免抖動）
  let sm = null;
  // 臉頰膚色：在鏡框下面的兩頰取樣（隔幾格更新一次），遮黑眼圈時用這個顏色
  const toneC = document.createElement('canvas'); toneC.width = toneC.height = 8;
  const tc = toneC.getContext('2d', { willReadFrequently: true });
  let tone = null, toneFrame = 0;
  function sampleTone(src, Px, fwid) {
    if (tone && toneFrame++ % 4) return tone;
    const acc = [0, 0, 0]; let n = 0;
    for (const i of [205, 425, 50, 280]) {
      const [x, y] = Px(i), r = Math.max(2, fwid * .025);
      tc.clearRect(0, 0, 8, 8); tc.drawImage(src, x - r, y - r, r * 2, r * 2, 0, 0, 8, 8);
      const d = tc.getImageData(0, 0, 8, 8).data;
      for (let j = 0; j < d.length; j += 4) if (d[j + 3] > 200) { acc[0] += d[j]; acc[1] += d[j + 1]; acc[2] += d[j + 2]; n++; }
    }
    if (!n) return tone || [.8, .65, .58];
    const t = acc.map((c) => Math.min(1, c / n / 255 * 1.03));
    tone = tone ? tone.map((c, k) => c + (t[k] - c) * .5) : t;
    return tone;
  }

  function drawMask(L, mw, mh, fwid) {
    const Pt = (i) => [L[i].x * mw, L[i].y * mh];
    const poly = (c, idx) => { c.beginPath(); idx.forEach((i, k) => { const [x, y] = Pt(i); k ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); };
    const blur = (c, r) => { c.filter = `blur(${Math.max(.5, r)}px)`; };
    // 紅：皮膚（臉的輪廓，扣掉眼睛、眉毛、嘴唇、鼻孔）
    lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'source-over'; lc.filter = 'none'; lc.clearRect(0, 0, mw, mh);
    blur(lc, fwid * .07); lc.fillStyle = '#f00'; poly(lc, OVAL); lc.fill();
    lc.globalCompositeOperation = 'destination-out'; blur(lc, fwid * .012);
    lc.lineJoin = 'round'; lc.lineWidth = fwid * .035; lc.strokeStyle = lc.fillStyle = '#000';
    for (const idx of [EYE_R, EYE_L, BROW_R, BROW_L]) { poly(lc, idx); lc.fill(); lc.stroke(); }
    lc.lineWidth = fwid * .025; poly(lc, LIPS); lc.fill(); lc.stroke();
    for (const idx of NOSTRILS) { poly(lc, idx); lc.fill(); }
    lc.filter = 'none'; lc.globalCompositeOperation = 'source-over';
    mc.filter = 'none'; mc.globalCompositeOperation = 'source-over';
    mc.fillStyle = '#000'; mc.fillRect(0, 0, mw, mh);
    mc.globalCompositeOperation = 'lighter'; mc.drawImage(layerC, 0, 0);
    // 綠：眼睛下方（沿著下眼皮往下一段，跟著臉的角度）
    const [ax, ay] = Pt(168), [bx, by] = Pt(152), dl = Math.hypot(bx - ax, by - ay) || 1;
    const dx = (bx - ax) / dl, dy = (by - ay) / dl;
    blur(mc, fwid * .04); mc.fillStyle = '#0f0';
    for (const lid of [LID_R, LID_L]) {
      const [x0, y0] = Pt(lid[0]), [x1, y1] = Pt(lid[lid.length - 1]), ew = Math.hypot(x1 - x0, y1 - y0);
      const top = lid.map((i) => { const [x, y] = Pt(i); return [x + dx * ew * .12, y + dy * ew * .12]; });
      const bot = lid.map((i) => { const [x, y] = Pt(i); return [x + dx * ew * .55, y + dy * ew * .55]; }).reverse();
      mc.beginPath(); [...top, ...bot].forEach(([x, y], k) => k ? mc.lineTo(x, y) : mc.moveTo(x, y)); mc.closePath(); mc.fill();
    }
    // 藍：兩頰腮紅
    mc.filter = 'none';
    for (const i of [50, 280]) {
      const [x, y] = Pt(i), r = fwid * .19, g = mc.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,255,.9)'); g.addColorStop(.4, 'rgba(0,0,255,.6)'); g.addColorStop(1, 'rgba(0,0,255,0)');
      mc.fillStyle = g; mc.beginPath(); mc.arc(x, y, r, 0, 7); mc.fill();
    }
    mc.globalCompositeOperation = 'source-over';
    // 五官：紅＝眼睛、綠＝眉毛、藍＝嘴唇（清晰化與唇色用）
    fc.filter = 'none'; fc.globalCompositeOperation = 'source-over';
    fc.fillStyle = '#000'; fc.fillRect(0, 0, mw, mh);
    fc.globalCompositeOperation = 'lighter'; blur(fc, fwid * .01); fc.lineJoin = 'round';
    for (const [idx, c, w] of [[EYE_R, '#f00', .03], [EYE_L, '#f00', .03], [BROW_R, '#0f0', .02], [BROW_L, '#0f0', .02], [LIPS, '#00f', .01]]) {
      fc.fillStyle = fc.strokeStyle = c; fc.lineWidth = fwid * w; poly(fc, idx); fc.fill(); fc.stroke();
    }
    fc.filter = 'none'; fc.globalCompositeOperation = 'source-over';
  }

  function render(srcCanvas, lmRaw, b, W, H) {
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    // 定位點平滑
    if (!sm || sm.length !== lmRaw.length) sm = lmRaw.map((p) => ({ x: p.x, y: p.y }));
    else for (let i = 0; i < sm.length; i++) { sm[i].x += (lmRaw[i].x - sm[i].x) * .6; sm[i].y += (lmRaw[i].y - sm[i].y) * .6; }
    const L = sm, Px = (i) => [L[i].x * W, L[i].y * H];
    const fwid = Math.hypot(Px(454)[0] - Px(234)[0], Px(454)[1] - Px(234)[1]);
    const mw = Math.max(2, W >> 1), mh = Math.max(2, H >> 1);
    if (maskC.width !== mw || maskC.height !== mh) { maskC.width = layerC.width = featC.width = mw; maskC.height = layerC.height = featC.height = mh; }
    drawMask(L, mw, mh, fwid / 2);
    const ewR = Math.hypot(Px(133)[0] - Px(33)[0], Px(133)[1] - Px(33)[1]);
    const ewL = Math.hypot(Px(362)[0] - Px(263)[0], Px(362)[1] - Px(263)[1]);
    const ew = (ewR + ewL) / 2;

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tSrc);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tMask);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskC);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, tFeat);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, featC);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tMid);
    if (fw !== W || fh !== H) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); fw = W; fh = H; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tMid, 0);

    const k = (n) => (b[n] || 0) / 100;
    // 第一步
    gl.useProgram(P1); gl.viewport(0, 0, W, H);
    const a1 = gl.getAttribLocation(P1, 'p'); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(a1); gl.vertexAttribPointer(a1, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(U(P1, 'flipY'), 0); gl.uniform1i(U(P1, 'src'), 0); gl.uniform1i(U(P1, 'mask'), 1); gl.uniform1i(U(P1, 'feat'), 3);
    gl.uniform2f(U(P1, 'px'), 1 / W, 1 / H);
    gl.uniform3f(U(P1, 'tone'), ...sampleTone(srcCanvas, Px, fwid));
    gl.uniform1f(U(P1, 'ringR'), ew * .32);
    gl.uniform1f(U(P1, 'rad'), fwid * (.012 + k('smooth') * .03));
    gl.uniform1f(U(P1, 'smoothK'), Math.min(1, k('smooth') * 1.15));
    gl.uniform1f(U(P1, 'whiteK'), k('white')); gl.uniform1f(U(P1, 'glowK'), k('glow'));
    gl.uniform1f(U(P1, 'lightK'), k('light')); gl.uniform1f(U(P1, 'eyesK'), Math.min(1, k('eyes') * 1.1));
    gl.uniform1f(U(P1, 'evenK'), k('smooth') * .7);                 // 膚色均勻跟著磨皮
    gl.uniform1f(U(P1, 'sharpK'), k('smooth') > 0 ? .25 + k('smooth') * .4 : 0);   // 皮膚越光滑，五官越清楚
    gl.uniform1f(U(P1, 'softK'), k('soft')); gl.uniform1f(U(P1, 'appleK'), k('apple'));
    const auto = autoCorrect(tone || [.8, .65, .58], b.auto !== false);
    gl.uniform1f(U(P1, 'autoExp'), auto.exp); gl.uniform1f(U(P1, 'autoShadow'), auto.shadow);
    gl.uniform3f(U(P1, 'autoWB'), ...auto.wb); gl.uniform1f(U(P1, 'bloomR'), fwid * .09);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // 第二步：畫到畫布上
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(P2); gl.viewport(0, 0, W, H);
    const a2 = gl.getAttribLocation(P2, 'p'); gl.enableVertexAttribArray(a2); gl.vertexAttribPointer(a2, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(U(P2, 'flipY'), 1); gl.uniform1i(U(P2, 'img'), 2);
    gl.uniform2f(U(P2, 'size'), W, H);
    const [nx, ny] = Px(4), slim = new Float32Array(36), rads = new Float32Array(9), sk = k('slim'), ck = k('chin');
    SLIM.forEach(([i, wgt], j) => {
      const [x, y] = Px(i), d = Math.hypot(nx - x, ny - y) || 1;
      slim.set([x, y, (nx - x) / d * sk * fwid * .035 * wgt, (ny - y) / d * sk * fwid * .035 * wgt], j * 4);
      rads[j] = fwid * .3;
    });
    // 下巴拉提：下巴和下顎往臉的上方收，雙下巴與下巴線條更俐落
    const [tx, ty] = Px(168), [cx, cy] = Px(152), flen = Math.hypot(cx - tx, cy - ty) || 1, ux = (tx - cx) / flen, uy = (ty - cy) / flen;
    CHIN.forEach(([i, wgt], j) => {
      const [x, y] = Px(i);
      slim.set([x, y, ux * ck * flen * .04 * wgt, uy * ck * flen * .04 * wgt], (6 + j) * 4);
      rads[6 + j] = fwid * .34;
    });
    gl.uniform4fv(U(P2, 'slim'), slim); gl.uniform1fv(U(P2, 'slimR'), rads);
    const iris = (a, c1, c2) => L.length > 473 ? Px(a) : [(Px(c1)[0] + Px(c2)[0]) / 2, (Px(c1)[1] + Px(c2)[1]) / 2];
    const [rx, ry] = iris(468, 33, 133), [lx, ly] = iris(473, 263, 362);
    gl.uniform3fv(U(P2, 'eye'), new Float32Array([rx, ry, ew * .8, lx, ly, ew * .8]));
    gl.uniform1f(U(P2, 'bigK'), k('big') * .09);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return canvas;
  }
  return { render, reset() { sm = null; tone = null; autoState = null; } };
}
