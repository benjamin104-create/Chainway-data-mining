import * as THREE from './lib/three.module.min.js';
import {V} from './body-camera.js';
import {closurePose} from './haori-yoke.js';
export const CLOSURES=[['pompon','米白毛球'],['clasp','羽織扣'],['none','不加扣飾']];
const toThree=p=>new THREE.Vector3(p[0],-p[1],-p[2]);
export class HaoriClosure{
  constructor(parent){
    this.group=new THREE.Group();parent.add(this.group);this.materials=[];
    const cream=new THREE.MeshPhysicalMaterial({color:'#efe5d2',roughness:.98,metalness:0,sheen:1,sheenRoughness:1,sheenColor:new THREE.Color('#fff8ee')});
    const gold=new THREE.MeshStandardMaterial({color:'#ae9264',roughness:.52,metalness:.55});
    const fibers=new THREE.LineBasicMaterial({color:'#f6ead8',transparent:true,opacity:.6});this.materials.push(cream,gold,fibers);
    // Fixed topology rope; only positions change, no per-frame TubeGeometry GC.
    const cols=8,rows=20,p=new Float32Array((rows+1)*(cols+1)*3),idx=[];
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=y*(cols+1)+x;idx.push(a,a+cols+1,a+1,a+1,a+cols+1,a+cols+2);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(p,3));geo.setIndex(idx);
    this.rope=new THREE.Mesh(geo,cream);this.rope.frustumCulled=false;this.rope.castShadow=true;this.group.add(this.rope);
    this.pompon=new THREE.Group();this.group.add(this.pompon);
    const ball=new THREE.Mesh(new THREE.SphereGeometry(1,20,14),cream);ball.scale.set(1,.9,.9);ball.castShadow=true;this.pompon.add(ball);
    const tufts=[];
    for(let i=0;i<180;i++){const z=1-2*(i+.5)/180,a=i*2.39996323,r=Math.sqrt(1-z*z),x=Math.cos(a)*r,y=Math.sin(a)*r;
      tufts.push(x*.95,y*.86,z*.86,x*1.10,y*.99,z*.99);}
    const fg=new THREE.BufferGeometry();fg.setAttribute('position',new THREE.Float32BufferAttribute(tufts,3));this.pompon.add(new THREE.LineSegments(fg,fibers));
    this.clasp=new THREE.Group();this.group.add(this.clasp);
    for(const x of [-.036,.036]){const ring=new THREE.Mesh(new THREE.TorusGeometry(.031,.007,8,20),gold);ring.position.x=x;ring.castShadow=true;this.clasp.add(ring);}
    const bar=new THREE.Mesh(new THREE.BoxGeometry(.08,.013,.013),gold);bar.castShadow=true;this.clasp.add(bar);
  }
  update(f,patch,type='pompon'){
    this.group.visible=type!=='none';if(type==='none')return;
    const {left,right,mid}=closurePose(patch,f),a=this.rope.geometry.attributes.position.array;
    const control=V.add(mid,V.mul(f.front,f.S*.025));
    for(let y=0;y<=20;y++){
      const t=y/20,c=V.add(V.add(V.mul(left,(1-t)*(1-t)),V.mul(control,2*t*(1-t))),V.mul(right,t*t));
      const tangent=V.norm(V.add(V.mul(V.sub(control,left),1-t),V.mul(V.sub(right,control),t))),across=V.norm(V.cross(tangent,f.front));
      for(let x=0;x<=8;x++){const theta=x/8*Math.PI*2,p=V.add(V.add(c,V.mul(across,Math.sin(theta)*f.S*.008)),V.mul(f.front,Math.cos(theta)*f.S*.008)),i=(y*9+x)*3;a[i]=p[0];a[i+1]=-p[1];a[i+2]=-p[2];}
    }
    this.rope.geometry.attributes.position.needsUpdate=true;this.rope.geometry.computeVertexNormals();
    // At t=.5, the quadratic cord's midpoint is not its control point.
    const center=V.add(V.mix(V.mix(left,right,.5),control,.5),V.mul(f.front,f.S*.012));
    const basis=new THREE.Matrix4().makeBasis(toThree(f.side),toThree(V.mul(f.down,-1)),toThree(f.front));
    for(const g of [this.pompon,this.clasp]){g.position.copy(toThree(center));g.quaternion.setFromRotationMatrix(basis);}
    this.pompon.scale.setScalar(f.S*.047);this.clasp.scale.setScalar(f.S);
    this.pompon.visible=type==='pompon';this.clasp.visible=type==='clasp';
  }
  dispose(){this.group.removeFromParent();this.group.traverse(o=>o.geometry?.dispose());for(const m of this.materials)m.dispose();}
}
