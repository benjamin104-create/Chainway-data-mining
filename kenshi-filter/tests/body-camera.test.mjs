import assert from 'node:assert/strict';
import {fitBodyCamera,bodyFrame} from '../body-camera.js';
const points={ls:[-.18,-.5,0],rs:[.18,-.5,0],lh:[-.13,0,0],rh:[.13,0,0],
 le:[-.25,-.2,-.05],re:[.25,-.2,-.02],lw:[-.25,.08,-.06],rw:[.25,.08,-.03],n:[0,-.68,-.05]};
for(const angle of [-30,0,30]){
 const p=angle*Math.PI/180,c=Math.cos(p),s=Math.sin(p),W=640,H=960,f=832,D=1.8;
 const kp=Object.fromEntries(Object.entries(points).map(([k,[x,y,z]])=>{
  const wy=y*c-z*s,wz=y*s+z*c;return [k,{x:W/2+f*(x+.07)/(D+wz),y:H/2+f*(wy+.1)/(D+wz),wx:x,wy,wz,z:-wz,v:1}];
 }));
 const camera=fitBodyCamera(kp,W,H),body=bodyFrame(kp,camera);
 assert.ok(camera.error<1e-6,`Perspective reprojection failed for ${angle}°`);
 assert.ok(Math.abs(body.T-.5)<1e-8,'Physical torso length must not shrink under camera pitch');
 assert.ok(Math.abs(body.pitch-angle*Math.PI/180)<1e-8,'Body-plane pitch must be preserved');
 console.log(`${angle}°: error=${camera.error.toFixed(6)} px, T=${body.T.toFixed(3)} m, pitch=${(body.pitch*180/Math.PI).toFixed(1)}°`);
}
console.log('PASS: front, high-angle, low-angle reprojection and invariant metric torso length');
