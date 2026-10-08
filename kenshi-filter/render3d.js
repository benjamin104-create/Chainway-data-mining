// 3D 渲染的劍士服裝與武器（three.js）：
// 羽織、內襯、寬袖、袴都是跟著骨架即時變形的立體布料（有布料光澤、皺褶、褶襉），
// 刀是金屬材質、會反射環境光。頭和手不蓋住，直接露出相機裡的本人。
//
// 座標：畫面像素。three 的 X = x、Y = -y、Z = 往鏡頭的深度（像素）。
import * as THREE from './lib/three.module.min.js';
import { RoomEnvironment } from './lib/RoomEnvironment.js';
import { tile, frame } from './ar.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const P = (k) => V3(k.x, -k.y, k.z || 0);              // 關鍵點 → 3D
const lerp = (a, b, t) => a + (b - a) * t;

// ── 可以每幀重算形狀的「掃掠管」：沿一條路徑，一圈圈橢圓截面接起來 ──────
class Sweep {
  constructor(rings, segs, material) {
    this.rings = rings; this.segs = segs;
    const n = rings * (segs + 1);
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2), idx = [];
    for (let i = 0; i < rings; i++) for (let j = 0; j <= segs; j++) {
      const k = i * (segs + 1) + j;
      uv[k * 2] = j / segs; uv[k * 2 + 1] = 1 - i / (rings - 1);
      if (i < rings - 1 && j < segs) { const a = k, b = k + segs + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
  }
  // ring(i, v) → { c, a, b, ra, rb, th0, th1, mod(θ) }：圓心、兩個截面軸、兩個半徑、角度範圍、半徑起伏（皺褶）
  update(ring) {
    const { rings, segs, pos } = this;
    for (let i = 0; i < rings; i++) {
      const r = ring(i, i / (rings - 1));
      const th0 = r.th0 ?? 0, th1 = r.th1 ?? Math.PI * 2;
      for (let j = 0; j <= segs; j++) {
        const th = th0 + (th1 - th0) * j / segs, m = r.mod ? r.mod(th) : 1;
        const ca = Math.cos(th) * r.ra * m, sb = Math.sin(th) * r.rb * m;
        const k = (i * (segs + 1) + j) * 3;
        pos[k] = r.c.x + r.a.x * ca + r.b.x * sb;
        pos[k + 1] = r.c.y + r.a.y * ca + r.b.y * sb;
        pos[k + 2] = r.c.z + r.a.z * ca + r.b.z * sb;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

// 沿著一串點取樣（折線，均勻分段）
function along(pts, n) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = L.at(-1) || 1, out = [];
  for (let s = 0; s < n; s++) {
    const d = total * s / (n - 1);
    let i = 1; while (i < pts.length - 1 && L[i] < d) i++;
    const t = (d - L[i - 1]) / ((L[i] - L[i - 1]) || 1);
    const p = pts[i - 1].clone().lerp(pts[i], Math.min(1, Math.max(0, t)));
    const tan = pts[i].clone().sub(pts[i - 1]).normalize();
    out.push({ p, tan, u: d / total });
  }
  // 轉角處的切線平滑一點
  for (let k = 1; k < out.length - 1; k++) out[k].tanS = out[k - 1].tan.clone().add(out[k].tan).add(out[k + 1].tan).normalize();
  out[0].tanS = out[0].tan; out.at(-1).tanS = out.at(-1).tan;
  return out;
}
// 跟切線垂直的兩個截面軸：prefer 盡量對齊 pref（例如往下垂）
function axes(tan, pref) {
  let a = pref.clone().sub(tan.clone().multiplyScalar(pref.dot(tan)));
  if (a.lengthSq() < 1e-4) a = V3(0, 0, 1).sub(tan.clone().multiplyScalar(tan.z));
  a.normalize();
  const b = new THREE.Vector3().crossVectors(tan, a).normalize();
  return [a, b];
}

// ── 布料貼圖：紋樣、斜紋織目的法線、袴的細條紋、刀柄纏繩 ──────────
function canvasTex(cv, rx, ry, srgb = true) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let weaveNormal = null;
function weave() {
  if (weaveNormal) return weaveNormal;
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), img = g.createImageData(S, S);
  // 斜紋布：高度場 = 斜向細紋 + 一點雜訊，再換成法線
  const h = (x, y) => Math.sin((x + y) * Math.PI / 4) * .5 + Math.sin(x * Math.PI / 2) * .2 + (((x * 73856093) ^ (y * 19349663)) % 97) / 97 * .3;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
    const nx = -dx, ny = -dy, nz = 2.2, l = Math.hypot(nx, ny, nz), k = (y * S + x) * 4;
    img.data[k] = (nx / l * .5 + .5) * 255; img.data[k + 1] = (ny / l * .5 + .5) * 255; img.data[k + 2] = (nz / l * .5 + .5) * 255; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  weaveNormal = canvasTex(cv, 18, 18, false);
  return weaveNormal;
}
function stripes(c) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 8;
  const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 64, 8);
  g.fillStyle = 'rgba(255,255,255,.07)'; for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 2, 8);
  g.fillStyle = 'rgba(0,0,0,.18)'; for (let x = 4; x < 64; x += 8) g.fillRect(x, 0, 1, 8);
  return canvasTex(cv, 6, 1);
}
function wrapTex(c) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d'); g.fillStyle = '#e9e1cf'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = c;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(32, 32); g.lineTo(0, 64); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(64, 0); g.lineTo(32, 32); g.lineTo(64, 64); g.closePath(); g.fill();
  return canvasTex(cv, 1, 6);
}

// ── 武器（以軀幹長 = 1 建模，之後依人放大） ─────────────────
function bladeGeo(len, width, curve, broad = false) {
  const s = new THREE.Shape(), n = 24;
  const back = [], edge = [];
  for (let i = 0; i <= n; i++) {
    const y = len * i / n, bend = curve * Math.pow(i / n, 2) * len;
    const w = broad ? width * (1 - .35 * Math.pow(i / n, 3)) : width * (1 - .15 * i / n);
    back.push([-w / 2 - bend, y]); edge.push([w / 2 - bend, y]);
  }
  const tip = [-curve * len - width * .1, len + width * (broad ? 1.6 : .9)];
  s.moveTo(...edge[0]); edge.forEach((p) => s.lineTo(...p)); s.lineTo(...tip);
  [...back].reverse().forEach((p) => s.lineTo(...p)); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: .012, bevelEnabled: true, bevelThickness: .008, bevelSize: .01, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -.006);
  return g;
}
function buildWeapon(ch, env) {
  const w = ch.weapon, grp = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: '#e6ebf0', metalness: 1, roughness: .16, envMapIntensity: 1.4, emissive: new THREE.Color(ch.tint), emissiveIntensity: .12 });
  const gold = new THREE.MeshStandardMaterial({ color: w.tsuba, metalness: .9, roughness: .3 });
  const grip = new THREE.MeshStandardMaterial({ map: wrapTex(w.grip), roughness: .8, normalMap: weave(), normalScale: new THREE.Vector2(.4, .4) });
  const wood = new THREE.MeshStandardMaterial({ color: w.grip, roughness: .45, metalness: .1 });
  if (w.kind === 'naginata') {
    const L = w.len;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.035, .04, L * .8, 16), wood);
    pole.position.y = L * .05; grp.add(pole);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .08, 16), gold); collar.position.y = L * .45; grp.add(collar);
    const blade = new THREE.Mesh(bladeGeo(L * .38, .12, -.12, true), steel); blade.position.y = L * .47; grp.add(blade);
    grp.userData.reach = L * .9;
  } else {
    const gl = w.kind === 'twin' ? .22 : w.kind === 'odachi' ? .55 : .38;
    const bw = w.kind === 'odachi' ? .11 : w.kind === 'long' ? .06 : .075;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(bw * .58, bw * .62, gl, 16), grip);
    handle.position.y = 0; grp.add(handle);
    const kashira = new THREE.Mesh(new THREE.CylinderGeometry(bw * .64, bw * .64, .03, 16), gold); kashira.position.y = -gl * .5; grp.add(kashira);
    const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(bw * 1.55, bw * 1.55, .028, 32), gold); tsuba.position.y = gl * .5 + .014; grp.add(tsuba);
    const habaki = new THREE.Mesh(new THREE.BoxGeometry(bw * 1.05, .05, .03), gold); habaki.position.y = gl * .5 + .05; grp.add(habaki);
    const blade = new THREE.Mesh(bladeGeo(w.len, bw, -.05), steel); blade.position.y = gl * .5 + .03; grp.add(blade);
    grp.userData.reach = gl * .5 + w.len;
  }
  return grp;
}

// ── 一套衣服（真人用一套、招式框的淡影用一套） ──────────────
const TORSO = [ // [離肩線的高度（往上為正）, 寬半徑, 厚半徑]（軀幹長 = 1）
  [.15, .12, .11], [.09, .28, .16], [.03, .42, .22], [-.1, .45, .23], [-.5, .41, .22], [-1, .42, .27], [-1.4, .47, .31], [-1.72, .5, .33]];
function profile(h) {
  for (let i = 1; i < TORSO.length; i++) {
    const [h0, a0, b0] = TORSO[i - 1], [h1, a1, b1] = TORSO[i];
    if (h <= h0 && h >= h1) { const t = (h0 - h) / (h0 - h1); const s = t * t * (3 - 2 * t); return [lerp(a0, a1, s), lerp(b0, b1, s)]; }
  }
  return h > 0 ? TORSO[0].slice(1) : TORSO.at(-1).slice(1);
}

class Outfit {
  constructor(scene, ch, ghost) {
    this.group = new THREE.Group(); scene.add(this.group);
    this.ghost = ghost;
    const W = ghost ? null : weave(), ns = new THREE.Vector2(.35, .35);
    const silk = (opts) => ghost
      ? new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide })
      : new THREE.MeshPhysicalMaterial({ roughness: .6, sheen: 1, sheenRoughness: .4, envMapIntensity: .45, normalMap: W, normalScale: ns, side: THREE.DoubleSide, ...opts });
    const pat = (rx, ry) => canvasTex(tile(ch.pattern, ch.haori, ch.haori2, 256), rx, ry);
    this.mat = {
      haori: silk({ map: pat(7, 4.5), sheenColor: new THREE.Color(ch.haori2).lerp(new THREE.Color('#fff'), .4) }),
      sleeve: silk({ map: pat(4, 2.5), sheenColor: new THREE.Color(ch.haori2).lerp(new THREE.Color('#fff'), .4) }),
      inner: silk({ color: ch.inner, roughness: .75, sheen: .6, sheenColor: new THREE.Color('#888') }),
      trim: silk({ color: ch.trim, roughness: .45, sheenColor: new THREE.Color('#fff') }),
      hakama: silk({ map: stripes(ch.hakama), roughness: .85, sheen: .5, sheenColor: new THREE.Color(ch.hakama).lerp(new THREE.Color('#fff'), .5) }),
    };
    const add = (s) => { this.group.add(s.mesh); return s; };
    this.legs = [add(new Sweep(18, 36, this.mat.hakama)), add(new Sweep(18, 36, this.mat.hakama))];
    this.inner = add(new Sweep(20, 40, this.mat.inner));
    this.belt = add(new Sweep(4, 40, this.mat.trim));
    this.haori = add(new Sweep(30, 56, this.mat.haori));
    this.lapels = [add(new Sweep(30, 10, this.mat.trim)), add(new Sweep(30, 10, this.mat.trim))];
    this.arms = [add(new Sweep(26, 32, this.mat.sleeve)), add(new Sweep(26, 32, this.mat.sleeve))];
    this.cuffs = [add(new Sweep(3, 32, this.mat.trim)), add(new Sweep(3, 32, this.mat.trim))];
  }
  dispose() { this.group.parent?.remove(this.group); this.group.traverse((o) => { o.geometry?.dispose(); }); for (const m of Object.values(this.mat)) { m.map?.dispose(); m.dispose(); } }

  update(kp) {
    const { T } = frame(kp);
    const hip = P(kp.lh).add(P(kp.rh)).multiplyScalar(.5), sh = P(kp.ls).add(P(kp.rs)).multiplyScalar(.5);
    const U = sh.clone().sub(hip); U.z = 0; U.normalize();
    let S = V3(U.y, -U.x, 0);                                          // 畫面上與身體垂直、指向畫面右肩
    if (S.dot(P(kp.rs).sub(P(kp.ls))) < 0) S.negate();
    const F = V3(0, 0, 1);
    // 側身角度：肩膀在畫面上越窄，身體轉得越多；方向看兩肩的深度
    const wr = Math.min(1, Math.max(.12, Math.hypot(kp.rs.x - kp.ls.x, kp.rs.y - kp.ls.y) / T / .72));
    const yaw = Math.acos(wr) * ((kp.rs.z ?? 0) - (kp.ls.z ?? 0) > 0 ? -1 : 1);
    const A = S.clone().multiplyScalar(Math.cos(yaw)).add(F.clone().multiplyScalar(Math.sin(yaw)));   // 身體寬的方向
    const B = new THREE.Vector3().crossVectors(U, A).normalize();      // 身體正面（朝鏡頭）
    if (B.z < 0) B.negate();
    const at = (h) => sh.clone().add(U.clone().multiplyScalar(h * T));
    const fold = (v, k) => (th) => 1 + .045 * v * Math.sin(th * k + v * 3) + .02 * Math.sin(th * 3);

    // 羽織：正面敞開
    const gap = (v) => lerp(.5, .3, Math.min(1, v * 3)) + v * .12;
    const edgePts = [[], []];
    this.haori.update((i, v) => {
      const h = lerp(.15, -1.72, v), [ra, rb] = profile(h), g = gap(v);
      const r = { c: at(h), a: A, b: B, ra: ra * T, rb: rb * T, th0: Math.PI / 2 + g, th1: Math.PI / 2 + Math.PI * 2 - g, mod: fold(v, 9) };
      for (const [k, th] of [[0, r.th0], [1, r.th1]]) {
        const m = r.mod(th);
        edgePts[k].push(r.c.clone().add(A.clone().multiplyScalar(Math.cos(th) * r.ra * m)).add(B.clone().multiplyScalar(Math.sin(th) * r.rb * m)));
      }
      return r;
    });
    // 衣襟滾邊
    this.lapels.forEach((s, k) => {
      const pts = edgePts[k];
      s.update((i, v) => {
        const j = Math.min(pts.length - 1, i), tan = pts[Math.min(pts.length - 1, j + 1)].clone().sub(pts[Math.max(0, j - 1)]).normalize();
        const [a, b] = axes(tan, B);
        return { c: pts[j], a, b, ra: T * .022, rb: T * .045 };
      });
    });
    this.inner.update((i, v) => {
      const h = lerp(.2, -1.6, v), [ra, rb] = profile(h);
      return { c: at(h), a: A, b: B, ra: ra * T * (h > .1 ? .95 : .93), rb: rb * T * .93 };
    });
    this.belt.update((i, v) => {
      const h = lerp(-.8, -.95, v), [ra, rb] = profile(h);
      return { c: at(h), a: A, b: B, ra: ra * T * .955, rb: rb * T * .955 };
    });

    // 手肘、手腕在身體前面時，往鏡頭推，避免穿進身體
    const front = (p) => {
      const d = p.clone().sub(hip), across = Math.abs(d.dot(S)), hgt = d.dot(U) / T;
      if (across < .5 * T && hgt > -.9 && hgt < 1.2) p.z = Math.max(p.z, hip.z + .32 * T);
      return p;
    };
    // 袖子：上臂一段、前臂一段，前臂越水平袖兜越往下垂；袖口停在手腕前，手露出來
    ['l', 'r'].forEach((s, k) => {
      const sideSign = s === 'l' ? -1 : 1;
      const Sp = sh.clone().add(A.clone().multiplyScalar(sideSign * .3 * T)).add(U.clone().multiplyScalar(-.02 * T));
      if (kp[s + 's'].z != null) Sp.z = lerp(Sp.z, kp[s + 's'].z, .5);
      const E = front(P(kp[s + 'e'])), Wr = front(P(kp[s + 'w']));
      if (kp[s + 'e'].z == null) E.z = Sp.z * .6; if (kp[s + 'w'].z == null) Wr.z = Math.max(Wr.z, E.z);
      front(E); front(Wr);
      const fore = Wr.clone().sub(E), cuff = E.clone().add(fore.multiplyScalar(Math.max(.7, 1 - .05 * T / (fore.length() || 1))));
      const samples = along([Sp, E, cuff], this.arms[k].rings);
      const down = V3(0, -1, 0);
      const elbowU = Sp.distanceTo(E) / (Sp.distanceTo(E) + E.distanceTo(cuff));
      let last = null;
      this.arms[k].update((i) => {
        const { p, tanS, u } = samples[i];
        const fu = Math.max(0, (u - elbowU) / (1 - elbowU));             // 前臂上的位置 0～1
        const horiz = 1 - Math.abs(tanS.dot(down));
        const sag = T * (.04 + .34 * Math.pow(fu, .8) * (.35 + .65 * horiz));
        const r = T * lerp(.17, .21, Math.min(1, u / elbowU)) + T * .05 * fu;
        const [a, b] = axes(tanS, down);
        last = { c: p.clone().add(a.clone().multiplyScalar(sag * .5)), a, b, ra: r + sag * .5, rb: r * .85, mod: (th) => 1 + .03 * Math.sin(th * 7 + u * 5) };
        return last;
      });
      this.cuffs[k].update((i, v) => ({ ...last, ra: last.ra * (1.02 + v * .02), rb: last.rb * (1.04 + v * .02), c: last.c.clone().add(samples.at(-1).tanS.clone().multiplyScalar((v - 1) * T * .05)) }));
    });

    // 袴：從腰到腳踝往下張開，有褶襉；看不到腳就往下延伸
    ['l', 'r'].forEach((s, k) => {
      const sideSign = s === 'l' ? -1 : 1;
      const top = at(-.82).add(A.clone().multiplyScalar(sideSign * .13 * T));
      let K = kp[s + 'k'], An = kp[s + 'a'];
      const Hh = P(kp[s + 'h']).add(A.clone().multiplyScalar(sideSign * .04 * T));
      const Kp = K && K.v > .35 ? P(K) : Hh.clone().add(U.clone().multiplyScalar(-1.05 * T));
      const Ap = An && An.v > .35 ? P(An) : Kp.clone().add(Kp.clone().sub(Hh).normalize().multiplyScalar(T));
      for (const p of [Kp, Ap]) p.z = (p.z || 0) * .5;
      const samples = along([top, Hh, Kp, Ap], this.legs[k].rings);
      this.legs[k].update((i) => {
        const { p, tanS, u } = samples[i];
        const [a, b] = axes(tanS, A);
        const r = T * lerp(.19, .38, Math.pow(u, .9));
        return { c: p, a, b, ra: r, rb: r * .8, mod: (th) => 1 + .07 * Math.abs(Math.sin(th * 4 + .4)) * (.4 + u) };
      });
    });
  }
}

// ── 示範人偶（沒有相機或結果頁立繪用）：頭、脖子、手 ───────────
class Doll {
  constructor(scene, ch) {
    this.group = new THREE.Group(); scene.add(this.group);
    const skin = new THREE.MeshPhysicalMaterial({ color: '#f1cdb3', roughness: .55, sheen: .4, sheenColor: new THREE.Color('#ffdcc8') });
    const hair = new THREE.MeshPhysicalMaterial({ color: '#1d1617', roughness: .35, clearcoat: .6, clearcoatRoughness: .3 });
    const band = new THREE.MeshPhysicalMaterial({ color: ch.trim, roughness: .5, sheen: 1 });
    const eye = new THREE.MeshStandardMaterial({ color: '#1d1617', roughness: .2 });
    this.head = new THREE.Group();
    const face = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), skin); face.scale.set(.82, 1, .9); this.head.add(face);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.06, 32, 16, 0, Math.PI * 2, 0, Math.PI * .5), hair); cap.scale.set(.86, 1, .95); cap.rotation.x = -.35; cap.position.y = .08; this.head.add(cap);
    const tail = new THREE.Mesh(new THREE.SphereGeometry(.42, 16, 12), hair); tail.position.set(0, .2, -.95); tail.scale.set(1, 1.6, .8); this.head.add(tail);
    const hb = new THREE.Mesh(new THREE.TorusGeometry(.92, .06, 8, 40), band); hb.rotation.x = Math.PI / 2 - .35; hb.position.y = .38; hb.scale.set(.92, 1, 1); this.head.add(hb);
    for (const x of [-.3, .3]) { const e = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 8), eye); e.scale.set(1, 1.5, .5); e.position.set(x, .02, .82); this.head.add(e); }
    this.group.add(this.head);
    this.neck = new THREE.Mesh(new THREE.CylinderGeometry(.5, .55, 1, 16), skin); this.group.add(this.neck);
    this.hands = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), skin); m.scale.set(.8, 1, .7); this.group.add(m); return m; });
  }
  update(kp) {
    const { T } = frame(kp);
    const sh = P(kp.ls).add(P(kp.rs)).multiplyScalar(.5);
    const n = P(kp.n); n.y += T * .05; n.z = T * .05;
    this.head.position.copy(n); this.head.scale.setScalar(T * .24);
    this.neck.position.copy(sh.clone().lerp(n, .45)); this.neck.scale.set(T * .14, sh.distanceTo(n) * .9, T * .14);
    this.neck.lookAt(n); this.neck.rotateX(Math.PI / 2);
    ['l', 'r'].forEach((s, k) => {
      const w = P(kp[s + 'w']), e = P(kp[s + 'e']);
      const d = w.clone().sub(e).normalize();
      this.hands[k].position.copy(w.add(d.multiplyScalar(T * .06))); this.hands[k].position.z = T * .45;
      this.hands[k].scale.set(T * .085, T * .1, T * .075);
    });
  }
}

// ── 整個 3D 舞台 ───────────────────────────
export class Stage3D {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = .95;
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(this.renderer), .04).texture;
    this.camera = new THREE.OrthographicCamera(0, 1, 0, -1, 1, 40000); this.camera.position.set(0, 0, 20000);
    this.hemi = new THREE.HemisphereLight('#fff4e6', '#2a2020', .5); this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight('#fff3e2', 3); this.key.position.set(-1.1, .9, .8); this.scene.add(this.key);
    this.rim = new THREE.DirectionalLight('#ffffff', 2.2); this.rim.position.set(1.2, .5, -.4);
    this.fill = new THREE.DirectionalLight('#cfd8ff', .5); this.fill.position.set(1, -.2, 1); this.scene.add(this.fill); this.scene.add(this.rim);
    this.ch = null;
  }
  setCharacter(ch) {
    if (this.ch === ch) return;
    this.ch = ch;
    for (const o of [this.outfit, this.ghost, this.doll]) o?.dispose?.();
    if (this.doll) this.scene.remove(this.doll.group);
    for (const w of this.weapons || []) this.scene.remove(w);
    for (const w of this.ghostWeapons || []) this.scene.remove(w);
    this.outfit = new Outfit(this.scene, ch, false);
    this.ghost = new Outfit(this.scene, ch, true);
    this.doll = new Doll(this.scene, ch);
    this.weapons = [buildWeapon(ch), buildWeapon(ch)];
    this.ghostWeapons = [buildWeapon(ch), buildWeapon(ch)];
    for (const g of this.ghostWeapons) g.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = .25; o.material.depthWrite = false; } });
    for (const w of [...this.weapons, ...this.ghostWeapons]) this.scene.add(w);
    this.rim.color.set(ch.tint);
  }
  // 刀尖在畫面上的位置（給刀光殘影用）
  reach(T) { return (this.weapons?.[0].userData.reach || 2) * T; }
  // opts：{ kp, ghostKp, blades:[{grip,dir}], ghostBlades, doll, light }
  render(W, H, opts) {
    const r = this.renderer;
    if (this.canvas.width !== W || this.canvas.height !== H) {
      r.setSize(W, H, false);
      Object.assign(this.camera, { left: 0, right: W, top: 0, bottom: -H }); this.camera.updateProjectionMatrix();
    }
    const light = opts.light ?? 1;
    this.hemi.intensity = .25 + .35 * light; this.key.intensity = 1.6 + 1.6 * light;
    const place = (grp, b, kp) => {
      if (!b) { grp.visible = false; return; }
      const { T } = frame(kp);
      grp.visible = true;
      grp.position.set(b.grip.x, -b.grip.y, (b.z ?? 0) + T * .4);
      grp.quaternion.setFromUnitVectors(V3(0, 1, 0), V3(b.dir.x, -b.dir.y, 0).normalize());
      grp.scale.setScalar(T);
    };
    this.outfit.group.visible = !!opts.kp;
    if (opts.kp) this.outfit.update(opts.kp);
    this.ghost.group.visible = !!opts.ghostKp;
    if (opts.ghostKp) { this.ghost.update(opts.ghostKp); this.ghost.group.position.z = -2000; }
    this.doll.group.visible = !!(opts.doll && opts.kp);
    if (opts.doll && opts.kp) this.doll.update(opts.kp);
    this.weapons.forEach((g, i) => place(g, opts.kp && opts.blades?.[i], opts.kp));
    this.ghostWeapons.forEach((g, i) => place(g, opts.ghostKp && opts.ghostBlades?.[i], opts.ghostKp));
    r.render(this.scene, this.camera);
    return this.canvas;
  }
}
