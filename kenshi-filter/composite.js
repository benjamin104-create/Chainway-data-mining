import { frame } from './ar.js';

// Segmentation is copied before MediaPipe releases its result. Coordinates stay
// in video space; the same cover crop and mirror as the camera map it to screen.
export function copyPersonMask(mask, canvas) {
  if (!mask) return false;
  if (canvas.width !== mask.width || canvas.height !== mask.height) {
    canvas.width = mask.width; canvas.height = mask.height;
  }
  const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(mask.width, mask.height);
  const values = mask.getAsFloat32Array();
  for (let i = 0; i < values.length; i++) {
    const p = i * 4;
    pixels.data[p] = pixels.data[p + 1] = pixels.data[p + 2] = 255;
    // A soft edge preserves hair and avoids a rigid paper-cut silhouette.
    pixels.data[p + 3] = Math.round(Math.min(1, Math.max(0, (values[i] - .15) / .65)) * 255);
  }
  ctx.putImageData(pixels, 0, 0); return true;
}

export function drawMappedMask(ctx, mask, crop, mirror, W) {
  ctx.save();
  if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
  ctx.drawImage(mask, crop.dx, crop.dy, crop.dw, crop.dh);
  ctx.restore();
}

// Foreground head, neck and visible forearms cut holes in the garment layer.
// The original camera pixels then show through, preserving face and hand detail.
const handForeground = document.createElement('canvas');
export function cutForeground(layer, foreground, kp, personMask = null, cameraFrame = null) {
  const W = layer.width, H = layer.height, g = foreground.getContext('2d');
  g.clearRect(0, 0, W, H);
  const { sh, up, side, shoulderW: S } = frame(kp);
  const head = kp.n;
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round';
  g.save(); g.translate(head.x, head.y);
  g.rotate(Math.atan2(side.y, side.x));
  g.beginPath(); g.ellipse(0, -S * .08, S * .27, S * .39, 0, 0, Math.PI * 2); g.fill(); g.restore();
  g.lineWidth = S * .19;
  g.beginPath(); g.moveTo(head.x, head.y);
  g.lineTo(sh.x + up.x * S * .04, sh.y + up.y * S * .04); g.stroke();
  if (handForeground.width !== W || handForeground.height !== H) { handForeground.width = W; handForeground.height = H; }
  const hg = handForeground.getContext('2d', { willReadFrequently: true }); hg.clearRect(0, 0, W, H);
  hg.fillStyle = '#fff'; hg.strokeStyle = '#fff'; hg.lineCap = 'round';
  const bounds = { x0: W, y0: H, x1: 0, y1: 0 };
  const include = (p, radius = S * .28) => {
    bounds.x0 = Math.min(bounds.x0, p.x - radius); bounds.x1 = Math.max(bounds.x1, p.x + radius);
    bounds.y0 = Math.min(bounds.y0, p.y - radius); bounds.y1 = Math.max(bounds.y1, p.y + radius);
  };
  for (const s of ['l', 'r']) {
    const e = kp[s + 'e'], w = kp[s + 'w'];
    if (!e || !w || e.v < .55 || w.v < .55) continue;
    // A hand near the chest or closer than the shoulders belongs in front.
    const across = Math.abs((w.x - sh.x) * side.x + (w.y - sh.y) * side.y) < S * .63;
    const closer = Number.isFinite(w.z) && w.z > (kp[s + 's'].z || 0) + S * .04;
    if (across || closer) {
      include(e); include(w);
      hg.lineWidth = S * .16; hg.beginPath(); hg.moveTo(e.x, e.y); hg.lineTo(w.x, w.y); hg.stroke();
      hg.beginPath(); hg.arc(w.x, w.y, S * .1, 0, Math.PI * 2); hg.fill();
      for (const k of [s + 'i', s + 'p', s + 't']) if (kp[k]?.v > .5) {
        // Pose points sit near finger joints, not the fingertips. Extend their
        // direction so the garment doesn't turn an open hand into a closed fist.
        const p = kp[k], dx = p.x - w.x, dy = p.y - w.y, len = Math.hypot(dx, dy) || 1;
        const extension = k.endsWith('t') ? S * .045 : S * .14;
        const tip = { x: p.x + dx / len * extension, y: p.y + dy / len * extension }; include(tip);
        hg.lineWidth = S * .24; hg.beginPath(); hg.moveTo(w.x, w.y);
        hg.lineTo(tip.x, tip.y); hg.stroke();
      }
    }
  }
  if (cameraFrame && bounds.x0 < bounds.x1) {
    // Refine the broad joint region with the person's own skin chroma. This
    // keeps open fingers without cutting a large shirt-colored hole around them.
    const x = Math.max(0, Math.floor(bounds.x0)), y = Math.max(0, Math.floor(bounds.y0));
    const width = Math.min(W, Math.ceil(bounds.x1)) - x, height = Math.min(H, Math.ceil(bounds.y1)) - y;
    if (width > 0 && height > 0) {
      const cg = cameraFrame.getContext('2d');
      const sample = cg.getImageData(Math.max(0, Math.min(W - 1, Math.round(head.x))), Math.max(0, Math.min(H - 1, Math.round(head.y))), 1, 1).data;
      const cb = (r, g, b) => -.1687 * r - .3313 * g + .5 * b;
      const cr = (r, g, b) => .5 * r - .4187 * g - .0813 * b;
      const scb = cb(...sample), scr = cr(...sample);
      const source = cg.getImageData(x, y, width, height).data, region = hg.getImageData(x, y, width, height);
      for (let i = 0; i < source.length; i += 4) if (region.data[i + 3]) {
        const d = Math.hypot(cb(source[i], source[i + 1], source[i + 2]) - scb, cr(source[i], source[i + 1], source[i + 2]) - scr);
        region.data[i + 3] *= Math.max(0, Math.min(1, (25 - d) / 6));
      }
      hg.putImageData(region, x, y);
    }
  }
  g.drawImage(handForeground, 0, 0);
  if (personMask) {
    g.save(); g.globalCompositeOperation = 'destination-in'; g.drawImage(personMask, 0, 0); g.restore();
  }
  const ctx = layer.getContext('2d');
  ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(foreground, 0, 0); ctx.restore();
}
