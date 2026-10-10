import assert from 'node:assert/strict';
import {kimonoPoint} from '../kimono-layer.js';
const f={S:.36,T:.5,sh:[0,0,0],hip:[0,.5,0],side:[1,0,0],down:[0,1,0],front:[0,0,-1],gravity:[0,1,0]};
for(const u of [0,.25,.5,.75,1])for(const v of [0,.2,.5,1])assert.ok(kimonoPoint(f,u,v).every(Number.isFinite));
const left=kimonoPoint(f,0,.5),right=kimonoPoint(f,1,.5);assert.ok(Math.abs(left[0]+right[0])<1e-8);
assert.ok(kimonoPoint(f,.5,0)[1]<f.T*.15,'Kimono V must close at upper chest, not expose a deep apron opening');
assert.ok(kimonoPoint(f,.5,1)[1]>f.T*2,'Inner garment extends beyond outer haori');
assert.ok(kimonoPoint(f,0,.1)[2]>kimonoPoint(f,.5,.1)[2],'Side panels must recede behind outer coat rather than float as pink fins');
console.log('PASS: finite body-driven kimono, symmetric width, upper-chest V, long inner hem and layered side depth');
