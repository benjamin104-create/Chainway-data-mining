import assert from 'node:assert/strict';
import {V,bodyFrame,fitBodyCamera} from '../body-camera.js';
import {haoriPattern,collarRibbon} from '../haori-pattern.js';
import {ClothPatch} from '../cloth-physics.js';
const rest={ls:[-.18,-.5,0],rs:[.18,-.5,0],lh:[-.13,0,0],rh:[.13,0,0],le:[-.21,-.22,0],re:[.21,-.22,0],lw:[-.21,.04,0],rw:[.21,.04,0],n:[0,-.7,0]};
function frame(points=rest,angle=0){
  const c=Math.cos(angle),s=Math.sin(angle),kp=Object.fromEntries(Object.entries(points).map(([k,[x,y,z]])=>{
    const wy=y*c-z*s,wz=y*s+z*c;return[k,{x:320+832*x/(1.8+wz),y:480+832*wy/(1.8+wz),wx:x,wy,wz,v:1}];
  }));
  return {...bodyFrame(kp,fitBodyCamera(kp,640,960)),kp};
}
for(const angle of [-.4,0,.4]){
  const f=frame(rest,angle),g=haoriPattern(f);
  const root=g.bodyAt(.25,0),neck=g.bodyAt(0,0);
  assert.ok(V.dot(V.sub(root,neck),f.down)>.03,'Dropped shoulder must be below neckline');
  assert.ok(V.dot(V.sub(root,f.sh),f.side)>.5*f.S,'Outer shoulder extends beyond skeleton');
  const waist=Math.abs(V.dot(V.sub(g.bodyAt(.25,.6),f.sh),f.side));
  const hem=Math.abs(V.dot(V.sub(g.bodyAt(.25,1),f.sh),f.side));
  assert.ok(hem>waist*.9,'Hem must not taper into a hip-width funnel');
  const sleeve=g.sleeves.r;
  assert.ok(V.len(V.sub(sleeve.cuff,f.point('rw')))>.08,'Cuff must expose lower inner sleeve, not track wrist');
  const cuffWidth=V.len(V.sub(sleeve.at(.25,1),sleeve.at(.75,1)));
  const cuffDepth=V.len(V.sub(sleeve.at(0,1),sleeve.at(.5,1)));
  assert.ok(cuffWidth>f.S*.5&&cuffWidth>cuffDepth*3,'Cuff must be broad and thin');
  for(const v of [0,.3,.55,1])assert.ok(V.len(V.sub(sleeve.at(0,v),sleeve.at(1,v)))<1e-7,'Sleeve seam endpoints must match, including folds');
  const C=36,R=20,p=new ClothPatch(C,R,g.bodyAt,Array.from({length:C+1},(_,i)=>i),{bendCompliance:.08});
  for(let i=0;i<180;i++)p.step(V.mul(f.gravity,9.81));
  assert.ok(p.audit().finite&&p.audit().maxStretch<.05,'Body drape must remain finite and below export gate');
  const collar=collarRibbon(p,f.S,f.front,0);assert.ok(collar.every(Number.isFinite));
  const a=collar.slice(0,3),middle=collar.slice(6,9);
  assert.ok(V.dot(V.sub(middle,a),f.front)>f.S*.008,'Collar must have actual roll depth');
}
const raised=frame({...rest,re:[.38,-.42,0],rw:[.64,-.45,-.02]}),sleeve=haoriPattern(raised).sleeves.r;
const hanging=Math.max(...[.25,.75].map(u=>V.dot(V.sub(sleeve.at(u,1),sleeve.cuff),raised.gravity)));
assert.ok(hanging>.05,'Raised-arm sleeve pocket has hanging cloth, not a wrist tube');
const C=20,R=12,pins=[...Array.from({length:C+1},(_,i)=>i),Math.round(R*.55)*(C+1),R*(C+1)];
const patch=new ClothPatch(C,R,sleeve.at,pins,{seamClosed:true,bendCompliance:.3});
for(let i=0;i<180;i++)patch.step(V.mul(raised.gravity,9.81));
assert.ok(patch.audit().finite&&patch.audit().maxStretch<.05,'Raised sleeve must stay numerically valid');
for(const yaw of [-.65,.65]){
  const turned=Object.fromEntries(Object.entries(rest).map(([k,[x,y,z]])=>[k,[x*Math.cos(yaw)+z*Math.sin(yaw),y,-x*Math.sin(yaw)+z*Math.cos(yaw)]]));
  const f=frame(turned),g=haoriPattern(f);
  assert.ok(g.bodyAt(.3,.7).every(Number.isFinite));
  assert.ok(Math.abs(g.height-haoriPattern(frame()).height)<1e-7,'Moderate yaw must not change physical garment length');
}
const child=frame(Object.fromEntries(Object.entries(rest).map(([k,p])=>[k,p.map(v=>v*.6)])));
const adultShape=haoriPattern(frame()),childShape=haoriPattern(child);
assert.ok(Math.abs(childShape.height/adultShape.height-.6)<1e-7,'Garment scales with body rather than fixed adult pixels');
console.log('PASS: dropped shoulders, broad open cuff, forearm length, straight hem, rolled same-cloth collar, perspective/yaw, child scale, raised sleeve physics');
