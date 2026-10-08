const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, t) => ({ x: a.x * t, y: a.y * t });
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const normalize = (a) => mul(a, 1 / (Math.hypot(a.x, a.y) || 1));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Source registration is per texture, not the image bounding box. Shoulder
// seams and hem are calibrated in UV space; width and torso length are separate.
export const BODY_UV = { shoulderL: .16, shoulderR: .84, shoulderY: .125, hemY: .97 };
export const SLEEVE_UV = { centerU: .56, rootY: .15, elbowY: .50, cuffY: .925 };

export function buildHaoriRig(kp, fit = {}) {
  if (!kp?.ls || !kp?.rs) return null;
  const sh = mix(kp.ls, kp.rs, .5), S = distance(kp.ls, kp.rs);
  if (!Number.isFinite(S) || S < 24) return null;
  const shoulder = normalize({ x: kp.rs.x - kp.ls.x, y: kp.rs.y - kp.ls.y });
  const hasWorld = Number.isFinite(kp.ls.wx) && Number.isFinite(kp.rs.wx);
  const dx = hasWorld ? kp.rs.wx - kp.ls.wx : kp.rs.x - kp.ls.x;
  const dz = hasWorld ? kp.rs.wz - kp.ls.wz : ((kp.rs.z || 0) - (kp.ls.z || 0)) * -.6;
  const yaw = Math.atan2(dz, Math.abs(dx) || .001);
  const unsupported = Math.abs(yaw) > Math.PI * .39;
  const frontWidth = S / Math.max(.52, Math.cos(yaw));
  let down = { x: -shoulder.y, y: shoulder.x };
  if (down.y < 0) down = mul(down, -1);
  const measuredHip = kp.lh && kp.rh ? mix(kp.lh, kp.rh, .5) : null;
  const measuredT = measuredHip ? distance(sh, measuredHip) : 0;
  const hipsReady = (kp.lh?.v || 0) > .35 && (kp.rh?.v || 0) > .35
    && measuredT > frontWidth * .48 && measuredT < frontWidth * 2.5;
  const T = hipsReady ? measuredT : frontWidth * 1.18;
  const hip = hipsReady ? measuredHip : add(sh, mul(down, T));
  const axis = normalize({ x: hip.x - sh.x, y: hip.y - sh.y });
  // Pose shoulders lie inside the body, not on the clothing surface. A small
  // upward/outward seam allowance prevents the original shirt shoulders from
  // peeking above a garment registered to skeletal joint centers.
  const garmentSh = add(sh, mul(axis, -T * .055)), garmentWidth = S * 1.12;
  const attachments = { l: add(garmentSh, mul(shoulder, -garmentWidth / 2)),
    r: add(garmentSh, mul(shoulder, garmentWidth / 2)) };
  const ease = clamp(fit.width || 1, .85, 1.2), length = clamp(fit.length || 1, .8, 1.2);
  const hipWidth = hipsReady ? clamp(distance(kp.lh, kp.rh) * 1.23, S * .62, S * 1.08) : S * .87;
  const hem = add(hip, mul(axis, T * (.50 * length + length - 1)));
  const asymmetry = Math.sin(yaw) * .24;

  function bodyPoint(u, v) {
    const t = (v - BODY_UV.shoulderY) / (BODY_UV.hemY - BODY_UV.shoulderY);
    const torsoFraction = 1 / (1.5 * length);
    const center = t <= torsoFraction
      ? mix(garmentSh, hip, t / torsoFraction)
      : mix(hip, hem, (t - torsoFraction) / (1 - torsoFraction));
    const q = clamp(t / torsoFraction, 0, 1);
    const lower = clamp((t - torsoFraction) / (1 - torsoFraction), 0, 1);
    const width = (garmentWidth * (1 - q) + hipWidth * q + lower * S * .14) * ease;
    let n = (u - .5) / ((BODY_UV.shoulderR - BODY_UV.shoulderL) / 2);
    // Shoulder seams stay fixed; the front opening shifts under body yaw.
    n += asymmetry * Math.max(0, 1 - n * n) * clamp(t * 5, 0, 1);
    return add(center, mul(shoulder, width * .5 * n));
  }

  function sleeve(side) {
    const s = attachments[side], sign = side === 'l' ? -1 : 1;
    const defaultE = add(add(s, mul(axis, T * .56)), mul(shoulder, sign * T * .06));
    const e0 = kp[side + 'e'];
    const e = e0?.v > .5 && distance(s, e0) < T * .98 && distance(s, e0) > T * .12 ? e0 : defaultE;
    const defaultW = add(e, mul(axis, T * .57));
    const w0 = kp[side + 'w'];
    const wrist = w0?.v > .5 && distance(e, w0) < T * .98 && distance(e, w0) > T * .1 ? w0 : defaultW;
    const cuff = mix(e, wrist, .93), z = ((kp[side+'s'].z || 0) + (e.z || 0) + (wrist.z || 0)) / 3;
    function point(u, v) {
      const before = v < SLEEVE_UV.elbowY;
      const a = before ? s : e, b = before ? e : cuff;
      const t = before ? (v - SLEEVE_UV.rootY) / (SLEEVE_UV.elbowY - SLEEVE_UV.rootY)
        : (v - SLEEVE_UV.elbowY) / (SLEEVE_UV.cuffY - SLEEVE_UV.elbowY);
      const upper = normalize({ x: e.x - s.x, y: e.y - s.y });
      const lower = normalize({ x: cuff.x - e.x, y: cuff.y - e.y });
      const elbowBlend = clamp((v - SLEEVE_UV.elbowY + .08) / .16, 0, 1);
      const tangent = normalize(mix(upper, lower, elbowBlend));
      let normal = { x: tangent.y, y: -tangent.x };
      if (normal.x * shoulder.x + normal.y * shoulder.y < 0) normal = mul(normal, -1);
      // Compress the cap above the seam instead of stretching a pointed PNG
      // tip into a tall shoulder. The wider cap must sit on the shoulder joint.
      const center = v < SLEEVE_UV.rootY
        ? add(s, mul(upper, (v - SLEEVE_UV.rootY) * T * .6)) : mix(a, b, t);
      const f = clamp((v - SLEEVE_UV.rootY) / (SLEEVE_UV.cuffY - SLEEVE_UV.rootY), 0, 1);
      // Texture contains transparent padding: calibrate cloth coverage rather
      // than treating the full PNG width as the physical sleeve diameter.
      const radius = T * (.34 * (1 - f) + .25 * f) * ease;
      const localU = side === 'r' ? 1 - u : u;
      return add(center, mul(normal, (localU - SLEEVE_UV.centerU) * 2 * radius));
    }
    return { side, shoulder: s, elbow: e, wrist, cuff, z, point };
  }
  const sleeves = [sleeve('l'), sleeve('r')];
  const bodyZ = ((kp.ls.z || 0) + (kp.rs.z || 0) + (kp.lh?.z || 0) + (kp.rh?.z || 0)) / 4;
  return { sh, garmentSh, attachments, hip, hem, T, shoulderW: S, frontWidth, yaw, hipsReady, unsupported, bodyPoint, sleeves, bodyZ };
}

// A triangulated texture mesh gives every source vertex its own target point.
// This cannot be replaced by drawImage(width,height): sleeves bend independently
// and torso height is independent of projected shoulder width.
export function drawTextureMesh(ctx, texture, pointAt, columns = 8, rows = 14) {
  const tw = texture.width || texture.naturalWidth, th = texture.height || texture.naturalHeight;
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const uv = [[x / columns, y / rows], [(x + 1) / columns, y / rows],
      [x / columns, (y + 1) / rows], [(x + 1) / columns, (y + 1) / rows]];
    const dst = uv.map(([u, v]) => pointAt(u, v));
    for (const indices of [[0, 1, 2], [1, 3, 2]]) {
      const [a, b, c] = indices.map((i) => ({ s: { x: uv[i][0] * tw, y: uv[i][1] * th }, d: dst[i] }));
      const determinant = (b.s.x - a.s.x) * (c.s.y - a.s.y) - (c.s.x - a.s.x) * (b.s.y - a.s.y);
      const A = ((b.d.x - a.d.x) * (c.s.y - a.s.y) - (c.d.x - a.d.x) * (b.s.y - a.s.y)) / determinant;
      const B = ((b.d.y - a.d.y) * (c.s.y - a.s.y) - (c.d.y - a.d.y) * (b.s.y - a.s.y)) / determinant;
      const C = ((c.d.x - a.d.x) * (b.s.x - a.s.x) - (b.d.x - a.d.x) * (c.s.x - a.s.x)) / determinant;
      const D = ((c.d.y - a.d.y) * (b.s.x - a.s.x) - (b.d.y - a.d.y) * (c.s.x - a.s.x)) / determinant;
      const centroid = { x: (a.d.x + b.d.x + c.d.x) / 3, y: (a.d.y + b.d.y + c.d.y) / 3 };
      // Slightly overlap edges to prevent antialias pinholes between triangles.
      const expand = (p) => {
        const dx = p.x - centroid.x, dy = p.y - centroid.y, length = Math.hypot(dx, dy) || 1;
        return { x: p.x + dx / length * .65, y: p.y + dy / length * .65 };
      };
      const triangle = [a.d, b.d, c.d].map(expand);
      ctx.save(); ctx.beginPath(); ctx.moveTo(triangle[0].x, triangle[0].y);
      ctx.lineTo(triangle[1].x, triangle[1].y); ctx.lineTo(triangle[2].x, triangle[2].y); ctx.closePath(); ctx.clip();
      ctx.transform(A, B, C, D, a.d.x - A * a.s.x - C * a.s.y, a.d.y - B * a.s.x - D * a.s.y);
      ctx.drawImage(texture, 0, 0, tw, th); ctx.restore();
    }
  }
}
