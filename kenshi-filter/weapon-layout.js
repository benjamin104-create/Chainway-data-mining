import {V,fitBodyCamera,bodyFrame} from './body-camera.js';
export function scabbardPoses(kp,W,H,mirror=false,count=1,hung=false,focalRatio=null) {
  const camera=fitBodyCamera(kp,W,H,focalRatio),f=bodyFrame(kp,camera),sign=mirror?-1:1;
  const mouth=V.add(V.add(V.mix(f.sh,f.hip,.88),V.mul(f.side,sign*f.S*.31)),V.mul(f.front,f.S*.15));
  return Array.from({length:count},(_,i)=>{
    const root=V.add(mouth,V.mul(f.gravity,f.S*.10*i+(hung?f.T*.18:0)));
    const dir=V.norm(V.add(V.add(V.mul(f.side,sign*.68),V.mul(f.front,-.72)),V.mul(f.gravity,.10)));
    const a=camera.project(root),b=camera.project(V.add(root,V.mul(dir,f.T))),L=Math.hypot(b[0]-a[0],b[1]-a[1]);
    return {grip:{x:a[0],y:a[1]},dir:{x:(b[0]-a[0])/(L||1),y:(b[1]-a[1])/(L||1)},scale:L,z:-root[2]*camera.scale,T:f.T,roll:hung?Math.PI:0,focalRatio:camera.f/W};
  });
}
