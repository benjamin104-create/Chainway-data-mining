// 3D 渲染的劍士服裝與武器（three.js）：
// 羽織、內襯、寬袖、袴都是跟著骨架即時變形的立體布料，用動畫風的賽璐璐著色＋描邊；
// 下擺、袖兜、袴腳有慣性（彈簧），動作一大會甩動；刀是金屬材質、會反射環境光。頭和手不蓋住，直接露出相機裡的本人。
//
// 座標：畫面像素。three 的 X = x、Y = -y、Z = 往鏡頭的深度（像素）。
import * as THREE from './lib/three.module.min.js';
import { RoomEnvironment } from './lib/RoomEnvironment.js';
import { GLTFLoader } from './lib/GLTFLoader.js';
import { tile, frame } from './ar.js';
import { FUN_KINDS,buildFunProp } from './fun-props.js';

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
// w：{ kind, len, tsuba, grip, model? }。有 model（.glb）時載入外部模型，載入前先用程式畫的刀頂著
function buildWeapon(ch, w = ch.weapon) {
  if(FUN_KINDS.has(w.kind))return buildFunProp(w.kind);
  const grp = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: '#d5dbe0', metalness: 1, roughness: .27, envMapIntensity: 1 });
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
    const gl = ['twin','kodachi','wakizashi'].includes(w.kind) ? .28 : w.kind === 'odachi' ? .55 : .44;
    const bw = w.kind === 'odachi' ? .095 : ['long','wakizashi','kodachi'].includes(w.kind) ? .055 : .065;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(bw * .58, bw * .62, gl, 16), grip);
    handle.position.y = 0; handle.scale.z=.72; grp.add(handle);
    const kashira = new THREE.Mesh(new THREE.CylinderGeometry(bw * .64, bw * .64, .03, 16), gold); kashira.position.y = -gl * .5; grp.add(kashira);
    const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(bw * 1.25, bw * 1.25, .020, 32), gold); tsuba.position.y = gl * .5 + .014; tsuba.scale.z=.88; grp.add(tsuba);
    const habaki = new THREE.Mesh(new THREE.BoxGeometry(bw * 1.05, .05, .03), gold); habaki.position.y = gl * .5 + .05; grp.add(habaki);
    const blade = new THREE.Mesh(bladeGeo(w.len, bw, -.025), steel); blade.position.y = gl * .5 + .03; blade.userData.blade=true;grp.add(blade);
    grp.userData.handleLen=gl;
    grp.userData.reach = gl * .5 + w.len;
  }
  const model = w.model || (w === ch.weapon ? ch.art?.weapon : null);
  if (model) loadModel(model, grp);
  return grp;
}

// The saya is a separate, curved lacquered wooden housing. The long/short pair
// stays at the wearer's anatomical left waist instead of following a wrist.
function buildScabbard(ch,w=ch.weapon) {
  if(w.kind==='naginata'||FUN_KINDS.has(w.kind)){const g=new THREE.Group();g.userData.hilt=new THREE.Group();return g;}
  const g=new THREE.Group(),lacquer=new THREE.MeshStandardMaterial({color:w.saya||'#181715',roughness:.33,metalness:.03});
  const length=w.len+.09,width=['wakizashi','kodachi','twin'].includes(w.kind)?.088:.103;
  const shape=new THREE.Shape(),bend=t=>.025*length*t*t;
  shape.moveTo(width/2,0);for(let i=1;i<=24;i++)shape.lineTo(width/2+bend(i/24),length*i/24);
  shape.quadraticCurveTo(width/2+bend(1),length+width*.65,bend(1),length+width*.65);
  shape.quadraticCurveTo(-width/2+bend(1),length+width*.65,-width/2+bend(1),length);
  for(let i=23;i>=0;i--)shape.lineTo(-width/2+bend(i/24),length*i/24);shape.closePath();
  const shellGeo=new THREE.ExtrudeGeometry(shape,{depth:.04,bevelEnabled:true,bevelSize:.006,bevelThickness:.006,bevelSegments:2});shellGeo.translate(0,0,-.02);
  const shell=new THREE.Mesh(shellGeo,lacquer);g.add(shell);
  const mouth=new THREE.Mesh(new THREE.TorusGeometry(width*.49,.009,8,24),lacquer);mouth.rotation.x=Math.PI/2;mouth.scale.z=.6;g.add(mouth);
  const kurigata=new THREE.Mesh(new THREE.BoxGeometry(.045,.038,.045),lacquer);kurigata.position.set(width*.62,.20,0);g.add(kurigata);
  const cord=new THREE.MeshStandardMaterial({color:'#3b2920',roughness:.95});
  const curve=new THREE.CatmullRomCurve3([V3(width*.7,.19,0),V3(width*.8,.10,.03),V3(width*.9,-.10,.02),V3(width*.5,-.13,.02)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve,16,.008,6,false),cord));
  if(w.kind==='kodachi')for(const y of [.28,w.len*.72]){
    const mount=new THREE.Mesh(new THREE.TorusGeometry(width*.62,.009,6,16),lacquer);mount.rotation.x=Math.PI/2;mount.position.y=y;g.add(mount);
  }
  const hilt=buildWeapon(ch,w);hilt.traverse(o=>{if(o.userData?.blade)o.visible=false;});
  hilt.position.y=-(hilt.userData.handleLen*.5+.05);g.add(hilt);g.userData.hilt=hilt;g.userData.reach=length;
  return g;
}
// 外部武器模型：握柄中心在原點、刀尖朝 +Y、長度單位 = 軀幹長（約 50 公分）。說明見 ART_GUIDE.md
const gltfCache = new Map();
function loadModel(url, grp) {
  if (!gltfCache.has(url)) gltfCache.set(url, new GLTFLoader().loadAsync(url).catch((e) => { console.warn('武器模型載入失敗，改用內建刀', url, e); return null; }));
  gltfCache.get(url).then((g) => {
    if (!g) return;
    const opacity = grp.userData.ghostOpacity;
    grp.clear(); grp.userData.external=true;grp.add(g.scene.clone(true));
    if (opacity) setGhost(grp, opacity);
  });
}
function setGhost(grp, opacity) {
  grp.userData.ghostOpacity = opacity;
  grp.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = opacity; o.material.depthWrite = false; } });
}
// 外部布料貼圖（png/jpg）：載入後換掉程式產生的花紋
function loadTexture(url, mat) {
  new THREE.TextureLoader().load(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    mat.map?.dispose(); mat.map = t; mat.color?.set('#ffffff'); mat.needsUpdate = true;
  }, undefined, () => console.warn('貼圖載入失敗，改用內建花紋', url));
}

// ── 動畫風（賽璐璐）著色：三階明暗＋黑色描邊 ─────────────────
let ramp = null;
function toonRamp() {
  if (ramp) return ramp;
  ramp = new THREE.DataTexture(new Uint8Array([95, 170, 255]), 3, 1, THREE.RedFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
  return ramp;
}
// 描邊：把同一份形狀往外推一點、只畫遠側那一面（inverted hull）
function outlineMat() {
  return new THREE.ShaderMaterial({
    uniforms: { thick: { value: 2 }, color: { value: new THREE.Color('#140d0b') } },
    vertexShader: 'uniform float thick; void main(){ vec3 p = position - normalize(normal) * thick; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
    fragmentShader: 'uniform vec3 color; void main(){ gl_FragColor = vec4(color, 1.0); }',
    // 掃掠管的三角形繞向讓法線朝內，所以往「-法線」推＝往外，畫正面＝外殼的遠側
    side: THREE.FrontSide,
  });
}
// 鱗紋（散落的白色三角）＋由上往下的漸層，整件羽織一張貼圖
function gradTex(ch) {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
  const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, ch.grad[0]); gr.addColorStop(1, ch.grad[1]);
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
  // 規整的傳統鱗紋：比隨機散落更有動畫服裝的辨識度，仍維持通用傳統紋樣。
  g.fillStyle = ch.haori2;
  for (let row = 0, y = 28; y < 512; row++, y += 54) for (let x = (row % 2 ? 34 : 0); x < 1024; x += 72) {
    const r = 15, a = -Math.PI / 2;
    g.beginPath();
    for (let k = 0; k < 3; k++) { const t = a + k * Math.PI * 2 / 3; g.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r); }
    g.closePath(); g.fill();
  }
  const shine = g.createLinearGradient(0, 0, 1024, 0);
  shine.addColorStop(0, 'rgba(255,255,255,.08)'); shine.addColorStop(.5, 'rgba(255,255,255,0)'); shine.addColorStop(1, 'rgba(70,20,0,.1)');
  g.fillStyle = shine; g.fillRect(0, 0, 1024, 512);
  return canvasTex(cv, 1, 1);
}
function releaseProp(group){
  let external=false;group?.traverse(o=>{external||=!!o.userData.external;});if(external)return;
  const gs=new Set(),ms=new Set(),ts=new Set();group?.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of o.material?Array.isArray(o.material)?o.material:[o.material]:[]){ms.add(m);if(m.map)ts.add(m.map);}});
  for(const g of gs)g.dispose();for(const m of ms)m.dispose();for(const t of ts)t.dispose();
}

// ── 一套衣服（真人用一套、招式框的淡影用一套） ──────────────
const TORSO = [ // [離肩線的高度（往上為正）, 寬半徑, 厚半徑]（軀幹長 = 1）
  [.15, .12, .11], [.09, .3, .17], [.03, .45, .23], [-.1, .48, .25], [-.5, .44, .24], [-1, .45, .29], [-1.45, .52, .34], [-1.85, .58, .38]];
function profile(h) {
  for (let i = 1; i < TORSO.length; i++) {
    const [h0, a0, b0] = TORSO[i - 1], [h1, a1, b1] = TORSO[i];
    if (h <= h0 && h >= h1) { const t = (h0 - h) / (h0 - h1); const s = t * t * (3 - 2 * t); return [lerp(a0, a1, s), lerp(b0, b1, s)]; }
  }
  return h > 0 ? TORSO[0].slice(1) : TORSO.at(-1).slice(1);
}
// 動畫風皺褶：|sin| 做出尖銳的凹摺、圓潤的凸面
const crease = (x) => Math.abs(Math.sin(x)) - .62;

// 布料的慣性：彈簧＋阻尼。身體一動，下擺和袖子會慢半拍跟上、再晃回來
class Spring {
  constructor(k, d) { this.k = k; this.d = d; this.x = V3(0, 0, 0); this.v = V3(0, 0, 0); }
  step(target, dt) {
    const acc = target.clone().sub(this.x).multiplyScalar(this.k).sub(this.v.clone().multiplyScalar(this.d));
    this.v.add(acc.multiplyScalar(dt)); this.x.add(this.v.clone().multiplyScalar(dt));
    return this.x;
  }
}
const clampLen = (v, m) => (v.length() > m ? v.setLength(m) : v);

class Outfit {
  constructor(scene, ch, ghost) {
    this.group = new THREE.Group(); scene.add(this.group);
    this.ch = ch;
    this.ghost = ghost;
    const toon = (opts) => ghost
      ? new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide })
      : new THREE.MeshToonMaterial({ gradientMap: toonRamp(), side: THREE.DoubleSide, ...opts });
    const ps = ch.patternScale || 1;   // 花紋大小：數字越小，格子越大
    const pat = (rx, ry) => (ch.grad ? gradTex(ch) : canvasTex(tile(ch.pattern, ch.haori, ch.haori2, 256), rx * ps, ry * ps));
    this.mat = {
      haori: toon({ map: pat(7, 4.5) }),
      sleeve: toon({ map: pat(4, 2.5) }),
      inner: toon({ color: ch.inner }),
      trim: toon({ color: ch.trim }),
      hakama: toon({ map: stripes(ch.hakama) }),
    };
    // 設計師／GPT 畫好的貼圖：data.js 的 art 欄位（見 ART_GUIDE.md）
    if (!ghost) for (const k of ['haori', 'sleeve', 'inner', 'hakama']) if (ch.art?.[k]) loadTexture(ch.art[k], this.mat[k]);
    this.outline = ghost ? null : outlineMat();
    const add = (s, line = true) => {
      this.group.add(s.mesh);
      if (this.outline && line) { const o = new THREE.Mesh(s.geo, this.outline); o.frustumCulled = false; this.group.add(o); s.line = o; }
      return s;
    };
    this.legs = [add(new Sweep(20, 40, this.mat.hakama)), add(new Sweep(20, 40, this.mat.hakama))];
    this.inner = add(new Sweep(20, 40, this.mat.inner));
    this.belt = add(new Sweep(4, 40, this.mat.trim), false);
    this.haori = add(new Sweep(34, 72, this.mat.haori));
    this.lapels = [add(new Sweep(34, 10, this.mat.trim), false), add(new Sweep(34, 10, this.mat.trim), false)];
    this.arms = [add(new Sweep(30, 40, this.mat.sleeve)), add(new Sweep(30, 40, this.mat.sleeve))];
    this.cuffs = [add(new Sweep(3, 40, this.mat.trim), false), add(new Sweep(3, 40, this.mat.trim), false)];
    // 「只披羽織」時：看不見的身體（只寫深度），擋住羽織內側，讓使用者自己的衣服露出來
    this.occluder = new THREE.Mesh(this.inner.geo, new THREE.MeshBasicMaterial({ colorWrite: false }));
    this.occluder.frustumCulled = false; this.occluder.renderOrder = -1; this.group.add(this.occluder);
    this.setMode('full');
    // 布料慣性：下擺、兩個袖兜、兩條袴腳
    this.sp = { hem: new Spring(55, 7), sleeves: [new Spring(45, 6), new Spring(45, 6)], legs: [new Spring(60, 8), new Spring(60, 8)] };
    this.prev = null; this.t = 0;
  }
  // mode：'full' 全套（羽織＋內襯＋袴）／'haori' 只披羽織（其他是使用者自己的衣服）
  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    const full = mode === 'full';
    for (const s of [this.inner, this.belt, ...this.legs]) { s.mesh.visible = full; if (s.line) s.line.visible = full; }
    this.occluder.visible = !full;
  }
  dispose() { this.group.parent?.remove(this.group); this.group.traverse((o) => { o.geometry?.dispose(); }); for (const m of Object.values(this.mat)) { m.map?.dispose(); m.dispose(); } this.outline?.dispose(); }

  // opts：{ now（毫秒）, wind（像素向量，招式發動時的風） }
  update(kp, opts = {}) {
    const { T } = frame(kp);
    if (this.outline) this.outline.uniforms.thick.value = Math.max(1.5, T * .026);
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
    const down = V3(0, -1, 0);

    // ── 慣性：用關鍵點的速度推動彈簧（布料往動作的反方向甩） ──
    const now = opts.now ?? performance.now();
    const dt = this.prev ? Math.min(.05, Math.max(.001, (now - this.prev.now) / 1000)) : .016;
    this.t += dt;
    const vel = (k) => (this.prev ? P(kp[k]).sub(this.prev[k]).divideScalar(dt) : V3(0, 0, 0));
    const wind = opts.wind ? V3(opts.wind.x, -opts.wind.y, 0) : V3(0, 0, 0);
    const flutter = (ph) => V3(Math.sin(this.t * 2.1 + ph), Math.sin(this.t * 1.3 + ph * 2) * .3, 0).multiplyScalar(T * .02);
    const still = this.ghost;
    const hipV = vel('lh').add(vel('rh')).multiplyScalar(.5);
    const hemOff = still ? V3(0, 0, 0) : clampLen(this.sp.hem.step(clampLen(hipV.multiplyScalar(-.07).add(wind).add(flutter(0)), .7 * T), dt).clone(), .8 * T);
    const sleeveOff = ['lw', 'rw'].map((k, i) => (still ? V3(0, 0, 0)
      : clampLen(this.sp.sleeves[i].step(clampLen(vel(k).multiplyScalar(-.06).add(wind.clone().multiplyScalar(.8)).add(flutter(i + 1)), .6 * T), dt).clone(), .7 * T)));
    const legOff = ['la', 'ra'].map((k, i) => (still ? V3(0, 0, 0)
      : clampLen(this.sp.legs[i].step(clampLen(vel(k).multiplyScalar(-.04).add(wind.clone().multiplyScalar(.5)), .4 * T), dt).clone(), .45 * T)));
    this.prev = { now }; for (const k of ['lh', 'rh', 'lw', 'rw', 'la', 'ra']) this.prev[k] = P(kp[k]);
    const swing = hemOff.dot(A) / T;                                  // 下擺甩動時，皺褶也跟著偏移

    // 羽織：正面敞開，往下擺越來越寬、皺褶越來越深，下擺被慣性甩動
    const gap = (v) => lerp(.5, .3, Math.min(1, v * 3)) + v * .14;
    const hem = this.ch.silhouette?.hem ?? -1.85;
    const flare = this.ch.silhouette?.flare ?? 1;
    const edgePts = [[], []];
    this.haori.update((i, v) => {
      const h = lerp(.15, hem, v), [baseRa, rb] = profile(h), ra = baseRa * lerp(1, flare, Math.pow(v, 1.3)), g = gap(v);
      const w = Math.pow(Math.max(0, v - .25) / .75, 1.6);            // 腰以下才會被甩動
      const c = at(h).add(hemOff.clone().multiplyScalar(w));
      const depth = .1 * Math.pow(v, 1.4);
      const r = { c, a: A, b: B, ra: ra * T * (1 + .12 * w * Math.min(1, hemOff.length() / T * 2)), rb: rb * T, th0: Math.PI / 2 + g, th1: Math.PI / 2 + Math.PI * 2 - g,
        mod: (th) => 1 + depth * crease(th * 5.5 + swing * 2.5 + v * 1.2) + .03 * Math.sin(th * 2 + v * 4) };
      for (const [k, th] of [[0, r.th0], [1, r.th1]]) {
        const m = r.mod(th);
        edgePts[k].push(r.c.clone().add(A.clone().multiplyScalar(Math.cos(th) * r.ra * m)).add(B.clone().multiplyScalar(Math.sin(th) * r.rb * m)));
      }
      return r;
    });
    // 衣襟滾邊
    this.lapels.forEach((s, k) => {
      const pts = edgePts[k];
      s.update((i) => {
        const j = Math.min(pts.length - 1, i), tan = pts[Math.min(pts.length - 1, j + 1)].clone().sub(pts[Math.max(0, j - 1)]).normalize();
        const [a, b] = axes(tan, B);
        return { c: pts[j], a, b, ra: T * .024, rb: T * .05 };
      });
    });
    this.inner.update((i, v) => {
      const h = lerp(.2, -1.6, v), [ra, rb] = profile(h);
      return { c: at(h), a: A, b: B, ra: ra * T * (h > .1 ? .95 : .9), rb: rb * T * .9, mod: (th) => 1 + .03 * crease(th * 4 + v * 2) * v };
    });
    this.belt.update((i, v) => {
      const h = lerp(-.8, -.95, v), [ra, rb] = profile(h);
      return { c: at(h), a: A, b: B, ra: ra * T * .93, rb: rb * T * .93 };
    });

    // 手肘、手腕在身體前面時，往鏡頭推，避免穿進身體
    const front = (p) => {
      const d = p.clone().sub(hip), across = Math.abs(d.dot(S)), hgt = d.dot(U) / T;
      if (across < .5 * T && hgt > -.9 && hgt < 1.2) p.z = Math.max(p.z, hip.z + .36 * T);
      return p;
    };
    // 袖子：寬大有份量。前臂越水平袖兜越往下垂；手一甩，袖兜慢半拍跟上；手肘處有擠出來的橫向皺褶
    ['l', 'r'].forEach((s, k) => {
      const sideSign = s === 'l' ? -1 : 1;
      const Sp = sh.clone().add(A.clone().multiplyScalar(sideSign * .32 * T)).add(U.clone().multiplyScalar(-.02 * T));
      if (kp[s + 's'].z != null) Sp.z = lerp(Sp.z, kp[s + 's'].z, .5);
      const E = front(P(kp[s + 'e'])), Wr = front(P(kp[s + 'w']));
      if (kp[s + 'e'].z == null) E.z = Sp.z * .6; if (kp[s + 'w'].z == null) Wr.z = Math.max(Wr.z, E.z);
      front(E); front(Wr);
      const fore = Wr.clone().sub(E), up = Math.max(0, fore.clone().normalize().y);
      const cuff = E.clone().add(fore.multiplyScalar(Math.max(.4, 1 - .05 * T / (fore.length() || 1) - .45 * up)));
      const samples = along([Sp, E, cuff], this.arms[k].rings);
      const elbowU = Sp.distanceTo(E) / (Sp.distanceTo(E) + E.distanceTo(cuff));
      const off = sleeveOff[k];
      let last = null;
      this.arms[k].update((i) => {
        const { p, tanS, u } = samples[i];
        const fu = Math.max(0, (u - elbowU) / (1 - elbowU));             // 前臂上的位置 0～1
        const horiz = 1 - Math.abs(tanS.dot(down));
        const raised = Math.max(0, -tanS.dot(down));                     // 手往上舉：袖子滑落到手肘、不擋臉
        const sag = T * (.06 + .42 * Math.pow(fu, .75) * (.35 + .65 * horiz)) * (1 - .85 * raised);
        // 袖兜下垂的方向：重力＋慣性
        const pull = down.clone().multiplyScalar(sag).add(off.clone().multiplyScalar(Math.pow(fu, 1.3)));
        const sleeve = this.ch.silhouette?.sleeve ?? 1;
        const r = (T * lerp(.19, .24, Math.min(1, u / elbowU)) + T * .06 * fu) * sleeve;
        const [a, b] = axes(tanS, pull.lengthSq() > 1e-6 ? pull.clone().normalize() : down);
        const bunch = .09 * Math.exp(-Math.pow((u - elbowU) / .1, 2)) * Math.abs(Math.sin(u * 46));   // 手肘處的擠壓皺褶
        const L = pull.length();
        last = { c: p.clone().add(a.clone().multiplyScalar(L * .5)), a, b, ra: r + L * .5, rb: r * .82,
          mod: (th) => 1 - bunch + .06 * fu * crease(th * 4 + u * 3) };
        return last;
      });
      this.cuffs[k].update((i, v) => ({ ...last, mod: null, ra: last.ra * (1.0 + v * .02), rb: last.rb * (1.03 + v * .02), c: last.c.clone().add(samples.at(-1).tanS.clone().multiplyScalar((v - 1) * T * .05)) }));
    });

    // 袴：從腰到腳踝往下張開，有褶襉；腳一動，褲腳會晃
    ['l', 'r'].forEach((s, k) => {
      const sideSign = s === 'l' ? -1 : 1;
      const top = at(-.82).add(A.clone().multiplyScalar(sideSign * .13 * T));
      const K = kp[s + 'k'], An = kp[s + 'a'];
      const Hh = P(kp[s + 'h']).add(A.clone().multiplyScalar(sideSign * .04 * T));
      const Kp = K && K.v > .35 ? P(K) : Hh.clone().add(U.clone().multiplyScalar(-1.05 * T));
      const Ap = An && An.v > .35 ? P(An) : Kp.clone().add(Kp.clone().sub(Hh).normalize().multiplyScalar(T));
      for (const p of [Kp, Ap]) p.z = (p.z || 0) * .5;
      const samples = along([top, Hh, Kp, Ap], this.legs[k].rings);
      const off = legOff[k];
      this.legs[k].update((i) => {
        const { p, tanS, u } = samples[i];
        const [a, b] = axes(tanS, A);
        const r = T * lerp(.19, .4, Math.pow(u, .9));
        return { c: p.clone().add(off.clone().multiplyScalar(u * u)), a, b, ra: r, rb: r * .8,
          mod: (th) => 1 + .09 * crease(th * 4 + .4) * (.4 + u) };
      });
    });
  }
}

// ── 示範人偶（沒有相機或結果頁立繪用）：頭、脖子、手 ───────────
class Doll {
  constructor(scene, ch) {
    this.group = new THREE.Group(); scene.add(this.group);
    const skin = new THREE.MeshToonMaterial({ color: '#f6d6bf', gradientMap: toonRamp() });
    const hair = new THREE.MeshToonMaterial({ color: ch.hair || '#2a2024', gradientMap: toonRamp() });
    const band = new THREE.MeshToonMaterial({ color: ch.trim, gradientMap: toonRamp() });
    const eye = new THREE.MeshStandardMaterial({ color: ch.eye || '#1d1617', roughness: .2 });
    this.head = new THREE.Group();
    const face = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), skin); face.scale.set(.82, 1, .9); this.head.add(face);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.06, 32, 16, 0, Math.PI * 2, 0, Math.PI * .5), hair); cap.scale.set(.86, 1, .95); cap.rotation.x = -.35; cap.position.y = .08; this.head.add(cap);
    const tail = new THREE.Mesh(new THREE.SphereGeometry(.42, 16, 12), hair); tail.position.set(0, .2, -.95); tail.scale.set(1, 1.6, .8); this.head.add(tail);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2, dir = V3(Math.cos(a), .35 + (i % 3) * .12, Math.sin(a)).normalize();
      const spike = new THREE.Mesh(new THREE.ConeGeometry(.2, .62, 7), hair);
      spike.position.set(Math.cos(a) * .64, .43 + (i % 2) * .14, Math.sin(a) * .62);
      spike.quaternion.setFromUnitVectors(V3(0, 1, 0), dir); this.head.add(spike);
    }
    if (ch.headband) { const hb = new THREE.Mesh(new THREE.TorusGeometry(.92, .06, 8, 40), band); hb.rotation.x = Math.PI / 2 - .35; hb.position.y = .38; hb.scale.set(.92, 1, 1); this.head.add(hb); }
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
    this.renderer.toneMapping = THREE.NoToneMapping;
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
  // ch：角色（data.js）；ch.weapon 可以是 { kind, ... }，ch.offhand 有值時左手再拿一把（二刀）
  setCharacter(ch,propsOnly=false) {
    if (this.ch === ch&&this.propsOnly===propsOnly) return;
    this.ch = ch;
    this.propsOnly=propsOnly;
    for (const o of [this.outfit, this.ghost, this.doll]) o?.dispose?.();
    if (this.doll) this.scene.remove(this.doll.group);
    for(const w of [...(this.weapons||[]),...(this.ghostWeapons||[]),...(this.sheaths||[])]){this.scene.remove(w);releaseProp(w);}
    this.outfit = propsOnly?null:new Outfit(this.scene, ch, false);
    this.ghost = propsOnly?null:new Outfit(this.scene, ch, true);
    this.doll = propsOnly?null:new Doll(this.scene, ch);
    const second = ch.offhand || ch.weapon;
    this.weapons = [buildWeapon(ch), buildWeapon(ch, second)];
    this.ghostWeapons = [buildWeapon(ch), buildWeapon(ch, second)];
    this.sheaths = [buildScabbard(ch),buildScabbard(ch,second)];
    for (const g of this.ghostWeapons) setGhost(g, .25);
    for (const w of [...this.weapons, ...this.ghostWeapons]) this.scene.add(w);
    for (const w of this.sheaths)this.scene.add(w);
    this.rim.color.set(ch.tint);
  }
  // 刀尖在畫面上的位置（給刀光殘影用）
  reach(T) { return (this.weapons?.[0].userData.reach || 2) * T; }
  // opts：{ kp, ghostKp, blades:[{grip,dir}], ghostBlades, doll, light, now, wind, outfit, showOutfit }
  render(W, H, opts) {
    const r = this.renderer;
    if (this.canvas.width !== W || this.canvas.height !== H) {
      r.setSize(W, H, false);
      Object.assign(this.camera, { left: 0, right: W, top: 0, bottom: -H }); this.camera.updateProjectionMatrix();
    }
    const light = opts.light ?? 1;
    r.toneMapping=opts.realism?THREE.ACESFilmicToneMapping:THREE.NoToneMapping;
    this.rim.color.set(opts.realism?'#ffffff':this.ch.tint);
    this.hemi.intensity = opts.realism ? .6+.3*light : .3+.2*light;
    this.key.intensity = opts.realism ? 1+.8*light : 2.2+1.2*light;this.rim.intensity=opts.realism ? .65 : 2.2;
    const place = (grp, b, kp) => {
      if (!b) { grp.visible = false; return; }
      const { T } = frame(kp);
      grp.visible = true;
      grp.position.set(b.grip.x, -b.grip.y, (b.z ?? 0) + T * .4);
      grp.quaternion.setFromUnitVectors(V3(0, 1, 0), V3(b.dir.x, -b.dir.y, 0).normalize());
      if(b.roll)grp.rotateY(b.roll);
      grp.scale.setScalar(b.scale||T);
      if(grp.userData.kind==='catwand'&&b.grip.x>W*.55)grp.scale.x*=-1;
    };
    const showOutfit = opts.showOutfit !== false&&!!this.outfit;
    this.outfit?.setMode(opts.outfit || 'full'); this.ghost?.setMode(opts.outfit || 'full');
    if(this.outfit)this.outfit.group.visible = showOutfit && !!opts.kp;
    if (showOutfit && opts.kp) this.outfit.update(opts.kp, { now: opts.now, wind: opts.wind });
    if(this.ghost)this.ghost.group.visible = showOutfit && !!opts.ghostKp;
    if (showOutfit && opts.ghostKp) { this.ghost.update(opts.ghostKp); this.ghost.group.position.z = -2000; }
    if(this.doll)this.doll.group.visible = !!(opts.doll && opts.kp);
    if (this.doll&&opts.doll && opts.kp) this.doll.update(opts.kp);
    this.weapons.forEach((g, i) => place(g, opts.kp && opts.blades?.[i], opts.kp));
    this.ghostWeapons.forEach((g, i) => place(g, opts.ghostKp && opts.ghostBlades?.[i], opts.ghostKp));
    this.sheaths.forEach((g,i)=>{place(g,opts.kp&&opts.sheaths?.[i],opts.kp);g.userData.hilt.visible=!opts.blades?.[i];});
    r.render(this.scene, this.camera);
    return this.canvas;
  }
}
