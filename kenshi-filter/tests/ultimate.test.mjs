import assert from 'node:assert/strict';
import {ultimateLayout,ultimateName,drawUltimate,fitPropScale,ULTIMATE_SECONDS} from '../ultimate.js';
import {CHARACTERS} from '../data.js';
const kp={n:{x:180,y:360},ls:{x:70,y:460},rs:{x:310,y:465}};
for(const [w,h] of [[390,844],[320,568],[1086,1448]]){
  const l=ultimateLayout(w,h,kp);assert.ok(l.cx>0&&l.cx<w&&l.cy>0&&l.cy<h&&l.radius<=w*.46);
}
assert.equal(ultimateName(CHARACTERS.harmony,'duster')[1],'塵世斷絕');
assert.equal(ultimateName(CHARACTERS.compete,'own')[1],'迅雷拔刀');
const b={grip:{x:90,y:420},dir:{x:0,y:-1}},scale=fitPropScale(b,500,390,844,1.52);
assert.ok(scale<500&&b.grip.y-scale*1.52>=70,'Novelty prop should not be cropped above the camera');
const calls=[],gradient={addColorStop(){}};
const ctx=new Proxy({measureText:s=>({width:s.length*55}),createRadialGradient:()=>gradient,createLinearGradient:()=>gradient},{get:(o,k)=>o[k]??((...args)=>{for(const a of args)if(typeof a==='number')assert.ok(Number.isFinite(a));calls.push(k);}),set:(o,k,v)=>{o[k]=v;return true;}});
for(const ch of Object.values(CHARACTERS))for(const t of [0,.72,2.7])drawUltimate(ctx,390,844,ch,kp,t,'duster');
assert.ok(calls.includes('fillText')&&calls.includes('strokeText')&&calls.includes('arc'));
const count=calls.length;drawUltimate(ctx,390,844,CHARACTERS.harmony,kp,ULTIMATE_SECONDS);assert.equal(calls.length,count);
console.log('PASS: viewport-bounded effects, element variants, large text, novelty names, expired effect and selfie prop fitting');
