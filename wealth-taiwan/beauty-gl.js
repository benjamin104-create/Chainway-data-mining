// 美顏（GPU 版）：用臉部 478 個定位點畫出皮膚／眼下／臉頰的範圍，
// 在手機 GPU 上做「保留輪廓的磨皮」、美白、遮黑眼圈、腮紅，最後再瘦臉、放大眼睛。
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

const VS = `#version 300 es
in vec2 p; out vec2 v; uniform float flipY;
void main() { v = vec2(p.x * .5 + .5, flipY > .5 ? .5 - p.y * .5 : p.y * .5 + .5); gl_Position = vec4(p, 0., 1.); }`;

// 第一步：磨皮、美白、遮黑眼圈、補光、氣色（輸出不預乘的顏色）
const FS_BEAUTY = `#version 300 es
precision highp float;
in vec2 v; out vec4 o;
uniform sampler2D src, mask;
uniform vec2 px, down;
uniform float rad, smoothK, whiteK, glowK, lightK, eyesK;
vec3 softLight(vec3 b, vec3 s) {
  return mix(2. * b * s + b * b * (1. - 2. * s), sqrt(b) * (2. * s - 1.) + 2. * b * (1. - s), step(.5, s));
}
void main() {
  vec4 c0 = texture(src, v);
  if (c0.a < .004) { o = vec4(0.); return; }
  vec3 col = c0.rgb;
  vec4 m = texture(mask, v);
  float skin = m.r;
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
    col = mix(col, acc / ws, clamp(smoothK * skin, 0., 1.));
  }
  if (m.g > .01 && eyesK > 0.) {
    // 遮黑眼圈：借眼睛下方一點的臉頰膚色
    vec3 cc = vec3(0.);
    for (int k = -2; k <= 2; k++) cc += texture(src, v + down * (1. + .12 * float(k)) + vec2(px.x * float(k) * 3., 0.)).rgb;
    cc /= 5.;
    col = mix(col, cc * 1.03 + .01, clamp(m.g * eyesK, 0., .95));
  }
  if (whiteK > 0.) {
    float beta = 1. + whiteK * 3.5;
    vec3 wc = log(col * (beta - 1.) + 1.) / log(beta);
    col = mix(col, wc, (.45 + .55 * skin) * min(1., whiteK * 1.2));
  }
  if (lightK > 0.) col += col * (1. - col) * lightK * .85;
  if (glowK > 0.) {
    col = mix(col, softLight(col, vec3(1., .62, .55)), glowK * .4 * clamp(skin + .4, 0., 1.));
    col = mix(col, softLight(col, vec3(1., .5, .55)), m.b * glowK * .5);
  }
  o = vec4(clamp(col, 0., 1.), c0.a);
}`;

// 第二步：瘦臉（下巴兩側往內推）、大眼（以眼珠為中心放大），輸出預乘的顏色給畫布
const FS_WARP = `#version 300 es
precision highp float;
in vec2 v; out vec4 o;
uniform sampler2D img;
uniform vec2 size;
uniform vec4 slim[6];
uniform float slimR, bigK;
uniform vec3 eye[2];
void main() {
  vec2 p = v * size;
  for (int i = 0; i < 6; i++) {
    float d = distance(p, slim[i].xy);
    if (d < slimR) { float t = 1. - d * d / (slimR * slimR); p -= slim[i].zw * t * t; }
  }
  if (bigK > 0.) for (int i = 0; i < 2; i++) {
    vec2 c = eye[i].xy; float r = eye[i].z, d = distance(p, c);
    if (d < r) { float t = d / r; p = c + (p - c) * (1. - bigK * (1. - t * t)); }
  }
  vec4 s = texture(img, p / size);
  o = vec4(s.rgb * s.a, s.a);
}`;

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
  const tSrc = tex(), tMask = tex(), tMid = tex();
  const fbo = gl.createFramebuffer();
  let fw = 0, fh = 0;
  const U = (p, n) => gl.getUniformLocation(p, n);
  const maskC = document.createElement('canvas'), mc = maskC.getContext('2d');
  const layerC = document.createElement('canvas'), lc = layerC.getContext('2d');
  // 平滑後的定位點（避免抖動）
  let sm = null;

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
    blur(mc, fwid * .018); mc.fillStyle = '#0f0';
    for (const lid of [LID_R, LID_L]) {
      const [x0, y0] = Pt(lid[0]), [x1, y1] = Pt(lid[lid.length - 1]), ew = Math.hypot(x1 - x0, y1 - y0);
      const top = lid.map((i) => { const [x, y] = Pt(i); return [x + dx * ew * .1, y + dy * ew * .1]; });
      const bot = lid.map((i) => { const [x, y] = Pt(i); return [x + dx * ew * .48, y + dy * ew * .48]; }).reverse();
      mc.beginPath(); [...top, ...bot].forEach(([x, y], k) => k ? mc.lineTo(x, y) : mc.moveTo(x, y)); mc.closePath(); mc.fill();
    }
    // 藍：兩頰腮紅
    mc.filter = 'none';
    for (const i of [50, 280]) {
      const [x, y] = Pt(i), r = fwid * .21, g = mc.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,255,.75)'); g.addColorStop(.45, 'rgba(0,0,255,.45)'); g.addColorStop(1, 'rgba(0,0,255,0)');
      mc.fillStyle = g; mc.beginPath(); mc.arc(x, y, r, 0, 7); mc.fill();
    }
    mc.globalCompositeOperation = 'source-over';
    return { down: [dx, dy] };
  }

  function render(srcCanvas, lmRaw, b, W, H) {
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    // 定位點平滑
    if (!sm || sm.length !== lmRaw.length) sm = lmRaw.map((p) => ({ x: p.x, y: p.y }));
    else for (let i = 0; i < sm.length; i++) { sm[i].x += (lmRaw[i].x - sm[i].x) * .6; sm[i].y += (lmRaw[i].y - sm[i].y) * .6; }
    const L = sm, Px = (i) => [L[i].x * W, L[i].y * H];
    const fwid = Math.hypot(Px(454)[0] - Px(234)[0], Px(454)[1] - Px(234)[1]);
    const mw = Math.max(2, W >> 1), mh = Math.max(2, H >> 1);
    if (maskC.width !== mw || maskC.height !== mh) { maskC.width = layerC.width = mw; maskC.height = layerC.height = mh; }
    const { down } = drawMask(L, mw, mh, fwid / 2);
    const ewR = Math.hypot(Px(133)[0] - Px(33)[0], Px(133)[1] - Px(33)[1]);
    const ewL = Math.hypot(Px(362)[0] - Px(263)[0], Px(362)[1] - Px(263)[1]);
    const ew = (ewR + ewL) / 2;

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tSrc);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tMask);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskC);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tMid);
    if (fw !== W || fh !== H) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); fw = W; fh = H; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tMid, 0);

    const k = (n) => (b[n] || 0) / 100;
    // 第一步
    gl.useProgram(P1); gl.viewport(0, 0, W, H);
    const a1 = gl.getAttribLocation(P1, 'p'); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(a1); gl.vertexAttribPointer(a1, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(U(P1, 'flipY'), 0); gl.uniform1i(U(P1, 'src'), 0); gl.uniform1i(U(P1, 'mask'), 1);
    gl.uniform2f(U(P1, 'px'), 1 / W, 1 / H);
    gl.uniform2f(U(P1, 'down'), down[0] * ew * .55 / W, down[1] * ew * .55 / H);
    gl.uniform1f(U(P1, 'rad'), fwid * (.012 + k('smooth') * .03));
    gl.uniform1f(U(P1, 'smoothK'), Math.min(1, k('smooth') * 1.15));
    gl.uniform1f(U(P1, 'whiteK'), k('white')); gl.uniform1f(U(P1, 'glowK'), k('glow'));
    gl.uniform1f(U(P1, 'lightK'), k('light')); gl.uniform1f(U(P1, 'eyesK'), Math.min(1, k('eyes') * 1.1));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // 第二步：畫到畫布上
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(P2); gl.viewport(0, 0, W, H);
    const a2 = gl.getAttribLocation(P2, 'p'); gl.enableVertexAttribArray(a2); gl.vertexAttribPointer(a2, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(U(P2, 'flipY'), 1); gl.uniform1i(U(P2, 'img'), 2);
    gl.uniform2f(U(P2, 'size'), W, H);
    const [nx, ny] = Px(4), slim = new Float32Array(24), sk = k('slim');
    SLIM.forEach(([i, wgt], j) => {
      const [x, y] = Px(i), d = Math.hypot(nx - x, ny - y) || 1;
      slim.set([x, y, (nx - x) / d * sk * fwid * .06 * wgt, (ny - y) / d * sk * fwid * .06 * wgt], j * 4);
    });
    gl.uniform4fv(U(P2, 'slim'), slim); gl.uniform1f(U(P2, 'slimR'), fwid * .3);
    const iris = (a, c1, c2) => L.length > 473 ? Px(a) : [(Px(c1)[0] + Px(c2)[0]) / 2, (Px(c1)[1] + Px(c2)[1]) / 2];
    const [rx, ry] = iris(468, 33, 133), [lx, ly] = iris(473, 263, 362);
    gl.uniform3fv(U(P2, 'eye'), new Float32Array([rx, ry, ew * 1.05, lx, ly, ew * 1.05]));
    gl.uniform1f(U(P2, 'bigK'), k('big') * .16);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return canvas;
  }
  return { render, reset() { sm = null; } };
}
