import assert from 'node:assert/strict';
import {ClothPatch,COTTON_PRESET} from '../cloth-physics.js';
const dt=1/120;
const free=new ClothPatch(1,1,(u,v)=>[u*.1,0,v*.1],[],{damping:0});
for(let i=0;i<24;i++)free.step([0,9.81,0]);
const analytic=.5*9.81*.2**2;
assert.ok(Math.abs(free.p[1]-analytic)<.009,'Free fall must match g t² / 2 within integration error');
const hanging=new ClothPatch(10,12,(u,v)=>[u*.5,v*.6,0],Array.from({length:11},(_,i)=>i));
assert.ok(Math.abs(hanging.totalMass-.054)<1e-10,'Mass must equal area × areal density');
for(let i=0;i<240;i++)hanging.step();
const hangAudit=hanging.audit();assert.ok(hangAudit.finite&&hangAudit.maxStretch<.03,'Hanging cotton must not stretch excessively');
assert.ok(hanging.p[(12*11+5)*3+1]>.59,'Unpinned hem must hang down, not float up');
const lifted=new ClothPatch(12,8,(u,v)=>[u*.6-.3,v*.4,.008*Math.sin(u*5*Math.PI)], [0,12]);
for(let i=0;i<120;i++){
  const t=Math.min(1,i/60);lifted.setTarget(12,[.3-.05*t,-.2*t,0]);lifted.step();
}
for(let i=0;i<240;i++)lifted.step();
const center=6*3,chordY=-.2*(lifted.p[center]+.3)/.55,sag=lifted.p[center+1]-chordY,liftAudit=lifted.audit();
assert.ok(sag>.01,`Nearly taut cloth must still sag below its anchor chord: ${sag}`);
assert.ok(liftAudit.finite&&liftAudit.maxStretch<.08,'Raised-anchor simulation must remain finite and bounded');
const loose=new ClothPatch(12,8,(u,v)=>[u*.6-.3,v*.4,.008*Math.sin(u*5*Math.PI)], [0,12]);
for(let i=0;i<360;i++){const t=Math.min(1,i/60);loose.setTarget(12,[.3-.15*t,-.2*t,0]);loose.step();}
const looseChord=-.2*(loose.p[center]+.3)/.45,looseSag=loose.p[center+1]-looseChord;
assert.ok(looseSag>sag+.025,'Closer raised anchors must leave more slack and produce more gravitational sag');
const zero=new ClothPatch(1,1,(u,v)=>[u*.1,0,v*.1],[],{damping:0});
for(let i=0;i<60;i++)zero.step([0,0,0]);assert.ok(Math.abs(zero.p[1])<1e-10,'Zero-gravity control must not drift');
const tube=new ClothPatch(12,8,(u,v)=>[Math.cos(u*2*Math.PI)*.06,v*.4,Math.sin(u*2*Math.PI)*.06],Array.from({length:13},(_,i)=>i),{seamClosed:true});
for(let i=0;i<120;i++)tube.step();
let seamGap=0;for(let y=0;y<=8;y++){const a=y*13*3,b=(y*13+12)*3;seamGap=Math.max(seamGap,Math.hypot(tube.p[a]-tube.p[b],tube.p[a+1]-tube.p[b+1],tube.p[a+2]-tube.p[b+2]));}
assert.ok(seamGap<1e-6,'Stitched sleeve seam must not split into disconnected patches');
console.log(JSON.stringify({preset:COTTON_PRESET,freeFall:{analyticM:analytic,simulatedM:free.p[1]},
  hanging:hangAudit,lifted:{...liftAudit,sagBelowAnchorChordM:sag},looseRaised:{...loose.audit(),sagBelowAnchorChordM:looseSag},seamGapM:seamGap,checks:'PASS: SI mass, free fall, upright hanging, raised-anchor sag, slack-dependent drape, stretch limit, zero-gravity control, stitched sleeve'},null,2));
