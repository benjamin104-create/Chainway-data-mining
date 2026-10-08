import assert from 'node:assert/strict';
import { buildHaoriRig, BODY_UV, SLEEVE_UV } from '../garment-rig.js';

const point = (x,y,z=0,v=1) => ({x,y,z,v});
const pose = () => ({ n:point(200,90), ls:point(140,150), rs:point(260,150),
  lh:point(160,320), rh:point(240,320), le:point(120,235), re:point(280,235),
  lw:point(125,325), rw:point(280,325) });
const near = (a,b) => assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-6,`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const kp = pose(), rig = buildHaoriRig(kp);
near(rig.bodyPoint(BODY_UV.shoulderL,BODY_UV.shoulderY),rig.attachments.l);
near(rig.bodyPoint(BODY_UV.shoulderR,BODY_UV.shoulderY),rig.attachments.r);
assert.ok(Math.hypot(rig.attachments.l.x-kp.ls.x,rig.attachments.l.y-kp.ls.y)<rig.T*.08, 'Surface seam allowance must stay bounded');
near(rig.bodyPoint(.5,BODY_UV.hemY),rig.hem);
const long = pose(); long.lh.y += 80; long.rh.y += 80;
assert.ok(buildHaoriRig(long).hem.y > rig.hem.y + 100, 'Torso length must be independent of shoulder width');
for(const s of rig.sleeves) {
  const u = s.side==='r' ? 1-SLEEVE_UV.centerU : SLEEVE_UV.centerU;
  near(s.point(u,SLEEVE_UV.rootY),rig.attachments[s.side]);
  near(s.point(u,SLEEVE_UV.elbowY),kp[s.side+'e']);
  near(s.point(u,SLEEVE_UV.cuffY),s.cuff);
}
const raised = pose(); raised.rw = point(215,180,100);
const raisedRig = buildHaoriRig(raised);
near(raisedRig.sleeves[0].cuff,rig.sleeves[0].cuff);
assert.ok(raisedRig.sleeves[1].cuff.y < rig.sleeves[1].cuff.y - 90, 'Arms must move independently');
const partial = pose(); for(const k of ['lh','rh','le','re','lw','rw']) partial[k].v=0;
const pr = buildHaoriRig(partial); assert.equal(pr.hipsReady,false);
assert.equal(pr.T,120*1.18);
for(const p of [pr.bodyPoint(0,0),pr.bodyPoint(1,1),...pr.sleeves.map(s=>s.point(0,1))]) assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
const yaw = pose(); yaw.ls.wx=-.15; yaw.rs.wx=.15; yaw.ls.wz=-.1; yaw.rs.wz=.1;
const yr = buildHaoriRig(yaw);
assert.equal(yr.unsupported,false);
near(yr.bodyPoint(BODY_UV.shoulderL,BODY_UV.shoulderY),yr.attachments.l);
near(yr.bodyPoint(BODY_UV.shoulderR,BODY_UV.shoulderY),yr.attachments.r);
assert.equal(yr.hem.y,rig.hem.y);
yaw.rs.wx=-.1; yaw.rs.wz=.5;
assert.equal(buildHaoriRig(yaw).unsupported,true,'Extreme side view must not fake a front garment');
console.log('PASS: shoulder registration, independent torso length, articulated sleeves, partial-body fallback, moderate yaw, extreme-yaw gate');
