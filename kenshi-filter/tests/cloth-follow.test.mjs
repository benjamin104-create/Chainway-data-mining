import assert from 'node:assert/strict';
import {ClothPatch} from '../cloth-physics.js';
import {followCloth,reconditionCloth,liveClock,LIVE_CLOTH,PHOTO_CLOTH} from '../cloth-follow.js';
import {haoriPattern} from '../haori-pattern.js';
const f={side:[1,0,0],down:[0,1,0],front:[0,0,-1]},at=(u,v)=>[u*.4,v*.5,0];
const patch=new ClothPatch(12,12,at,Array.from({length:13},(_,i)=>i),LIVE_CLOTH);
for(let i=0;i<120;i++)patch.step();const before=Array.from(patch.p),velocity=Array.from(patch.velocity);
const offset=[.25,-.08,.03],next=(u,v)=>at(u,v).map((x,k)=>x+offset[k]);
followCloth(patch,at,next,f,f);
for(let i=0;i<patch.p.length;i++)assert.ok(Math.abs(patch.p[i]-before[i]-offset[i%3])<1e-10,'All particles must follow translation immediately, not just pins');
for(let i=0;i<velocity.length;i++)assert.ok(Math.abs(patch.velocity[i]-velocity[i])<1e-12,'Pose translation must not inject artificial wind');
assert.ok(patch.audit().maxStretch<.05,'Rigid pose movement must preserve folds and edge lengths');
const c=liveClock(1000,950);assert.equal(c.steps*c.dt,.05,'Live integration covers elapsed 50 ms instead of old max 25 ms');
assert.equal(liveClock(2000,1000).elapsed,1/15,'Long stalls must drop backlog');
const count=q=>(q.bodyCols+1)*(q.bodyRows+1)+2*(q.sleeveCols+1)*(q.sleeveRows+1);
assert.ok(count(LIVE_CLOTH)<count(PHOTO_CLOTH)*.60);
function pose(angle){const kp={le:{v:1},lw:{v:1},re:{v:1},rw:{v:1}},points={ls:[-.18,0,0],rs:[.18,0,0],le:[-.19,.25,0],lw:[-.21,.50,0],re:[.18+.25*Math.sin(angle),.25*Math.cos(angle),0],rw:[.18+.48*Math.sin(angle),.48*Math.cos(angle),0]};return {...f,S:.36,T:.5,sh:[0,0,0],hip:[0,.5,0],gravity:[0,1,0],kp,point:k=>points[k]};}
let prevFrame=pose(0),shape=haoriPattern(prevFrame),atSleeve=shape.sleeves.r.at;
const C=LIVE_CLOTH.sleeveCols,R=LIVE_CLOTH.sleeveRows,pins=[...Array.from({length:C+1},(_,i)=>i),Math.round(R*.55)*(C+1),R*(C+1)];
let sleeve=new ClothPatch(C,R,atSleeve,pins,{...LIVE_CLOTH,seamClosed:true,bendCompliance:.3});
for(let n=0;n<120;n++)sleeve.step([0,9.81,0],null,1/60);
let worst=0,badFrames=0,recoveries=0;
for(let n=1;n<=60;n++){
 const nextFrame=pose(n/60*1.1),nextShape=haoriPattern(nextFrame),to=nextShape.sleeves.r.at;
 followCloth(sleeve,atSleeve,to,prevFrame,nextFrame);
 for(const i of pins)sleeve.setTarget(i,to((i%(C+1))/C,Math.floor(i/(C+1))/R));
 for(let s=0;s<2;s++)sleeve.step([0,9.81,0],null,1/60);
 const audit=sleeve.audit();assert.ok(audit.finite);worst=Math.max(worst,audit.maxStretch);
 badFrames=audit.maxStretch>=.05?badFrames+1:0;if(badFrames>=6){sleeve=reconditionCloth(sleeve,to);badFrames=0;recoveries++;}
 prevFrame=nextFrame;atSleeve=to;
}
assert.ok(worst<.12,'Moving sleeve must remain bounded; overstretched frames cannot be exported');
for(let i=0;i<60;i++){
 for(let s=0;s<2;s++)sleeve.step([0,9.81,0],null,1/60);
 badFrames=sleeve.audit().maxStretch>=.05?badFrames+1:0;
 if(badFrames>=6){sleeve=reconditionCloth(sleeve,atSleeve);badFrames=0;recoveries++;}
}
assert.ok(sleeve.audit().maxStretch<.05,'After holding the pose the cloth must pass the unchanged export gate');
console.log(`60-frame raised-arm sequence: transient maximum strain ${(worst*100).toFixed(2)}% (frames >=5% blocked), ${recoveries} pose recoveries, settled ${(sleeve.audit().maxStretch*100).toFixed(2)}%`);
console.log(`PASS: instant whole-cloth follow, preserved deformation/velocity, elapsed-time integration; live ${count(LIVE_CLOTH)} vs photo ${count(PHOTO_CLOTH)} vertices`);
