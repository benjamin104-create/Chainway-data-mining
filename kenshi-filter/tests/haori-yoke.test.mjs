import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.min.js';
import {ClothPatch} from '../cloth-physics.js';
import {haoriPattern} from '../haori-pattern.js';
import {V} from '../body-camera.js';
import {yokePoints,foldedCollarPoints,neckCollarPoints,neckBoundaryPoint,closurePose,CLOSURE_ROW} from '../haori-yoke.js';
import {HaoriClosure} from '../haori-closure.js';
const f={S:.36,T:.5,sh:[0,0,0],hip:[0,.5,0],side:[1,0,0],down:[0,1,0],front:[0,0,-1],gravity:[0,1,0],kp:{le:{v:1},re:{v:1},lw:{v:1},rw:{v:1}},point:k=>({n:[0,-.20,-.05],ls:[-.18,0,0],rs:[.18,0,0],le:[-.23,.23,0],re:[.23,.23,0],lw:[-.23,.45,0],rw:[.23,.45,0]})[k]};
const C=36,R=20,p=new ClothPatch(C,R,haoriPattern(f).bodyAt,Array.from({length:C+1},(_,i)=>i));
const yoke=yokePoints(f,p);assert.equal(yoke.length,(C+1)*5*3);assert.ok(yoke.every(Number.isFinite));
for(let x=0;x<=C;x++){const i=(4*(C+1)+x)*3;assert.ok(V.len(V.sub(yoke.slice(i,i+3),Array.from(p.p.subarray(x*3,x*3+3))))<1e-8,'Outer yoke must sew exactly to solved upper body ring');}
const neck=neckBoundaryPoint(f,0);assert.ok(Math.abs(neck[0])<f.S*.18,'Neck hole, not full shoulder-width opening');assert.ok(neck[1]<-.07,'Collar starts at neck base above shoulder');
for(const edge of [0,1]){const band=foldedCollarPoints(f,p,edge);assert.equal(band.length,(R+4)*5*3);assert.ok(band.every(Number.isFinite));const a=band.slice(0,3),b=band.slice(6,9);assert.ok(V.dot(V.sub(b,a),f.front)>f.S*.012,'Folded band has real forward roll depth');}
assert.equal(neckCollarPoints(f,p).length,(C+1)*5*3);
const m=closurePose(p,f);assert.equal(m.row,Math.round(R*CLOSURE_ROW));assert.ok(m.mid.every(Number.isFinite));assert.ok(V.dot(V.sub(m.mid,V.mix(m.left,m.right,.5)),f.front)>f.S*.04,'Closure sits in front of the coat opening');
p.addTie(m.row*(C+1),m.row*(C+1)+C);
for(let i=0;i<180;i++)p.step(V.mul(f.gravity,9.81));
assert.ok(p.audit().finite&&p.audit().maxStretch<.05,'Upper-chest closure constraint must retain the existing export strain gate');
const parent=new THREE.Group(),clasp=new HaoriClosure(parent),rope=clasp.rope.geometry;
for(const type of ['pompon','clasp','none']){clasp.update(f,p,type);assert.equal(clasp.group.visible,type!=='none');assert.ok(clasp.rope.geometry.attributes.position.array.every(Number.isFinite));}
clasp.update(f,p,'pompon');assert.equal(clasp.rope.geometry,rope,'Rope topology must be reused, not allocated per frame');assert.equal(clasp.pompon.visible,true);assert.equal(clasp.clasp.visible,false);
clasp.dispose();assert.equal(parent.children.length,0);
console.log('PASS: closed shoulder surface with shared seam, neck-to-front folded collar, front closure placement, pompon/clasp/off, reused geometry and disposal');
