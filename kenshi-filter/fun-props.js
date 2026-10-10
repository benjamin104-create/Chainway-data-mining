import * as THREE from './lib/three.module.min.js';
export const FUN_KINDS=new Set(['saya','flyswatter','duster','catwand']);
export function buildFunProp(kind){
  const group=new THREE.Group(),mat=(color,roughness=.75)=>new THREE.MeshStandardMaterial({color,roughness});
  const pink=mat('#ef72a7'),wood=mat('#b7874a'),dark=mat('#312932');
  const box=(x,y,z,w,h,d,m)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);group.add(o);return o;};
  const rod=(y,h,r,m)=>{const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,12),m);o.position.y=y;group.add(o);return o;};
  if(kind==='saya'){
    rod(.67,1.60,.055,dark);rod(-.15,.23,.065,wood);rod(1.48,.025,.06,wood);
    group.userData.reach=1.5;
  }else if(kind==='flyswatter'){
    rod(.30,.90,.018,pink);const y=.90,w=.30,h=.38;
    for(const x of [-w/2,w/2])box(x,y,0,.032,h,.025,pink);
    for(const yy of [y-h/2,y+h/2])box(0,yy,0,w,.032,.025,pink);
    for(let i=-3;i<=3;i++)box(i*w/8,y,0,.008,h,.012,pink);
    for(let i=-4;i<=4;i++)box(0,y+i*h/10,0,w,.008,.012,pink);
    group.userData.reach=y+h/2;
  }else if(kind==='duster'){
    rod(.30,.90,.038,wood);
    const colors=['#b58a68','#d9bb8f','#efe0c2','#895f49'];
    for(let i=0;i<40;i++){
      const t=i/40*Math.PI*2,r=.04+(i%4)*.026,L=.35+(i%5)*.05;
      const feather=new THREE.Mesh(new THREE.SphereGeometry(1,8,12),mat(colors[i%4]));
      feather.scale.set(.022,L/2,.008);feather.position.set(Math.cos(t)*r,.82+L/2,Math.sin(t)*r);
      feather.rotation.z=-Math.cos(t)*.35;feather.rotation.x=Math.sin(t)*.35;group.add(feather);
      const stem=new THREE.Mesh(new THREE.CylinderGeometry(.004,.004,L,5),wood);stem.position.copy(feather.position);stem.rotation.copy(feather.rotation);group.add(stem);
    }
    group.userData.reach=1.52;
  }else if(kind==='catwand'){
    rod(.49,1.20,.022,pink);
    const line=new THREE.CatmullRomCurve3([new THREE.Vector3(0,1.1,0),new THREE.Vector3(.20,1.07,0),new THREE.Vector3(.35,.79,.02),new THREE.Vector3(.34,.48,.02)]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(line,18,.005,5,false),dark));
    const toy=new THREE.Mesh(new THREE.SphereGeometry(.08,12,10),mat('#ffe082'));toy.position.set(.34,.44,.02);group.add(toy);
    for(let i=0;i<5;i++){const tail=new THREE.Mesh(new THREE.SphereGeometry(1,6,8),mat(i%2?'#71c7c9':'#da7eba'));tail.scale.set(.023,.13,.01);tail.position.set(.34+(i-2)*.03,.28,.02);tail.rotation.z=(i-2)*.20;group.add(tail);}
    group.userData.reach=1.1;
  }else throw new Error('Unknown novelty prop');
  group.userData.fun=true;group.userData.kind=kind;return group;
}
