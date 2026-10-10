import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.min.js';
import {buildFunProp,FUN_KINDS} from '../fun-props.js';
import {WEAPONS,APP_TITLE} from '../data.js';
for(const kind of FUN_KINDS){
 const prop=buildFunProp(kind),box=new THREE.Box3().setFromObject(prop);assert.ok(!box.isEmpty());
 assert.ok([...box.min.toArray(),...box.max.toArray()].every(Number.isFinite));
 assert.ok(box.max.y>1&&box.min.y<.1,'Prop must be held at the grip origin');
 assert.ok(prop.userData.fun&&WEAPONS[kind].kind===kind);
 const materials=new Set();prop.traverse(o=>{assert.ok(!o.userData.blade,'Novelty props must not contain steel sword blades');if(o.material)materials.add(o.material);o.geometry?.dispose();});for(const m of materials)m.dispose();
}
assert.equal(APP_TITLE,'你心中住著哪一種劍士');
console.log('PASS: four finite grip-mounted props, no sword blades, valid catalog and exact theme title');
