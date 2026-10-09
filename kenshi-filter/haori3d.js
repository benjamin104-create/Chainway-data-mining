import * as THREE from './lib/three.module.min.js';
import { RoomEnvironment } from './lib/RoomEnvironment.js';
import { V, fitBodyCamera, bodyFrame } from './body-camera.js';
import { ClothPatch, COTTON_PRESET } from './cloth-physics.js';
import { tile } from './ar.js';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const fabric=new Image();fabric.src=new URL('assets/fabric-cotton-weave-v3.png',import.meta.url).href;
const textures=new Map();
export const fabricReady=()=>fabric.complete&&fabric.naturalWidth>0;
function clothTextures(ch) {
  const key=[ch.pattern,ch.haori,ch.haori2].join('|');if(textures.has(key))return textures.get(key);
  if(!fabricReady())return null;
  const cv=document.createElement('canvas');cv.width=cv.height=1024;const g=cv.getContext('2d',{willReadFrequently:true});
  g.fillStyle=g.createPattern(tile(ch.pattern,ch.haori,ch.haori2,180),'repeat');g.fillRect(0,0,1024,1024);
  const data=g.getImageData(0,0,1024,1024),scan=document.createElement('canvas');scan.width=scan.height=1024;
  const sg=scan.getContext('2d',{willReadFrequently:true});sg.drawImage(fabric,0,0,1024,1024);const grain=sg.getImageData(0,0,1024,1024).data;
  for(let i=0;i<data.data.length;i+=4){const shade=.85+(grain[i]+grain[i+1]+grain[i+2])/765*.18;
    for(let c=0;c<3;c++)data.data[i+c]*=shade;}
  g.putImageData(data,0,0);
  const map=new THREE.CanvasTexture(cv);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=4;
  const normalCv=document.createElement('canvas');normalCv.width=normalCv.height=128;const ng=normalCv.getContext('2d'),ni=ng.createImageData(128,128);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){const i=(y*128+x)*4;ni.data[i]=128+Math.sin(x*Math.PI/2)*13;ni.data[i+1]=128+Math.sin(y*Math.PI/2)*13;ni.data[i+2]=252;ni.data[i+3]=255;}
  ng.putImageData(ni,0,0);const normal=new THREE.CanvasTexture(normalCv);normal.wrapS=normal.wrapT=THREE.RepeatWrapping;normal.repeat.set(20,20);
  const result={map,normal};textures.set(key,result);return result;
}
function profile(v,rows) {
  for(let i=1;i<rows.length;i++)if(v<=rows[i][0]){const a=rows[i-1],b=rows[i],t=clamp((v-a[0])/(b[0]-a[0]),0,1);return a.slice(1).map((n,k)=>n+(b[k+1]-n)*t);}
  return rows.at(-1).slice(1);
}
function geometry(patch) {
  const g=new THREE.BufferGeometry(),uv=new Float32Array(patch.p.length/3*2);
  for(let y=0;y<=patch.rows;y++)for(let x=0;x<=patch.cols;x++){const i=y*(patch.cols+1)+x;uv[i*2]=x/patch.cols;uv[i*2+1]=1-y/patch.rows;}
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(patch.p.length),3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(patch.indices);return g;
}
// Scan a bounded torso ROI, not every person in the image. Skeleton joints are
// not a silhouette; loose original shirts need additional exterior ease.
export function silhouetteEase(mask,kp) {
  if(!mask)return 1.28;
  const S=Math.hypot(kp.rs.x-kp.ls.x,kp.rs.y-kp.ls.y),cx=(kp.rs.x+kp.ls.x)/2,sy=(kp.rs.y+kp.ls.y)/2;
  const hy=kp.lh?.v>.35&&kp.rh?.v>.35?(kp.lh.y+kp.rh.y)/2:sy+S*1.2;
  const g=mask.getContext('2d',{willReadFrequently:true});let widest=S;
  for(const t of [.22,.45,.7]){
    const y=clamp(Math.round(sy+(hy-sy)*t),0,mask.height-1),x0=clamp(Math.round(cx-S*.9),0,mask.width-1),x1=clamp(Math.round(cx+S*.9),x0+1,mask.width);
    const data=g.getImageData(x0,y,x1-x0,1).data,center=clamp(Math.round(cx-x0),0,x1-x0-1);let l=center,r=center;
    while(l>0&&data[l*4+3]>130)l--;while(r<x1-x0-1&&data[r*4+3]>130)r++;
    widest=Math.max(widest,r-l);
  }
  return clamp(widest/S+ .08,1.25,1.45);
}
export class Haori3D {
  constructor() {
    this.canvas=document.createElement('canvas');this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,alpha:true,antialias:true,preserveDrawingBuffer:true});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.scene=new THREE.Scene();const pm=new THREE.PMREMGenerator(this.renderer);this.scene.environment=pm.fromScene(new RoomEnvironment(this.renderer),.03).texture;
    this.camera=new THREE.PerspectiveCamera(50,1,.03,30);this.group=new THREE.Group();this.scene.add(this.group);
    this.hemi=new THREE.HemisphereLight('#fff8ed','#463d34',1);this.scene.add(this.hemi);
    this.key=new THREE.DirectionalLight('#fff5e8',2.2);this.key.castShadow=true;this.key.shadow.mapSize.set(1024,1024);
    Object.assign(this.key.shadow.camera,{left:-1.5,right:1.5,top:1.5,bottom:-1.5,near:.05,far:8});this.key.shadow.bias=-.0002;this.key.shadow.normalBias=.003;
    this.scene.add(this.key,this.key.target);this.fill=new THREE.DirectionalLight('#dbe6ff',.45);this.fill.position.set(2,1,2);this.scene.add(this.fill);
    this.lastTime=0;this.reset();
  }
  reset(){this.signature=null;this.patches=[];this.metrics=null;this.settled=false;this.settledSteps=0;this.focalRatio=null;}
  clearGeometry(){
    for(const o of [...this.group.children]){this.group.remove(o);o.geometry?.dispose();if(o.material&&!this.materials?.includes(o.material))o.material.dispose();}
    for(const m of this.materials||[])m.dispose();this.materials=[];
  }
  rebuild(f,ch,fit,ease) {
    this.clearGeometry();const tex=clothTextures(ch);if(!tex)return false;
    const mat=new THREE.MeshPhysicalMaterial({map:tex.map,normalMap:tex.normal,normalScale:new THREE.Vector2(.22,.22),
      roughness:.88,metalness:0,envMapIntensity:.25,sheen:.2,sheenRoughness:.8,sheenColor:new THREE.Color('#b8aaa0'),side:THREE.DoubleSide});
    this.materials.push(mat);const {S,T,sh,hip,side,down,front,gravity}=f,width=clamp(fit.width||1,.85,1.2)*ease;
    const length=clamp(fit.length||1,.8,1.2),height=T*1.62*length;
    const bodyAt=(u,v)=>{
      const [r,d]=profile(v,[[0,.28,.25],[.075,.51,.29],[.2,.5,.32],[.64,.52,.34],[1,.57,.35]]);
      const drop=height*v-T*.10,center=drop<T?V.mix(sh,hip,drop/T):V.add(hip,V.mul(gravity,drop-T));
      const gap=.30-(Math.min(1,v*4))*.10,theta=gap+(Math.PI*2-gap*2)*u;
      // Real geometric corrugation, not a dark painted line. The solver can
      // bend/compress these folds; amplitude grows below the supported shoulder.
      const fold=Math.sin(theta*12+v*.7)*S*.012*(.2+v);
      return V.add(V.add(center,V.mul(side,Math.sin(theta)*(S*r*width+fold))),V.mul(front,Math.cos(theta)*(S*d+fold)));
    };
    const C=36,R=16,pins=Array.from({length:(C+1)*2},(_,i)=>i),body=new ClothPatch(C,R,bodyAt,pins);
    const tieRow=Math.round(R*.36);body.addTie(tieRow*(C+1),tieRow*(C+1)+C);
    this.patches=[{patch:body,at:bodyAt,type:'body'}];
    for(const s of ['l','r']) {
      const shoulder=f.point(s+'s'),sign=s==='l'?-1:1;
      const e0=f.point(s+'e'),w0=f.point(s+'w');
      const elbow=f.kp[s+'e'].v>.5?e0:V.add(shoulder,V.mul(down,T*.55));
      const wrist=f.kp[s+'w'].v>.5?w0:V.add(elbow,V.mul(down,T*.55));
      const sleeveAt=(u,v)=>{
        const center=v<.5?V.mix(shoulder,elbow,v*2):V.mix(elbow,wrist,(v-.5)*1.86);
        const tangent=V.norm(V.sub(wrist,shoulder));
        // A kimono sleeve is a relatively thin hanging pocket, not an inflated
        // circular cuff. Its lower portion follows gravity even when raised.
        let lateral=V.norm(V.cross(tangent,front));
        if(Math.abs(V.dot(tangent,gravity))<.7){if(V.dot(lateral,gravity)<0)lateral=V.mul(lateral,-1);}
        else if(V.dot(lateral,V.mul(side,sign))<0)lateral=V.mul(lateral,-1);
        const theta=u*Math.PI*2,sn=Math.sin(theta),cs=Math.cos(theta);
        const radius=profile(v,[[0,.13,.08],[.2,.20,.085],[.7,.20,.09],[1,.19,.085]]);
        const hanging=S*(.04+.10*Math.sin(v*Math.PI*.7))*(1+sn);
        const fold=Math.sin(u*Math.PI*8+v)*S*.008;
        return V.add(V.add(V.add(center,V.mul(lateral,sn*S*radius[0])),V.mul(front,cs*(S*radius[1]+fold))),V.mul(gravity,hanging));
      };
      const sc=20,sr=10,sp=Array.from({length:sc+1},(_,i)=>i);
      // Only the top rim of the large cuff follows the wrist. The remainder
      // remains free to sag; this is not a fitted, closed wrist cylinder.
      if(f.kp[s+'w'].v>.55&&f.kp[s+'e'].v>.5)sp.push(sr*(sc+1)+15);
      const patch=new ClothPatch(sc,sr,sleeveAt,sp,{seamClosed:true});
      this.patches.push({patch,at:sleeveAt,type:s,elbow,wrist});
    }
    for(const item of this.patches){item.geo=geometry(item.patch);
      const uv=item.geo.attributes.uv.array;for(let i=0;i<uv.length;i+=2){uv[i]*=item.type==='body'?2.2:1.1;uv[i+1]*=item.type==='body'?1.5:1.1;}
      item.mesh=new THREE.Mesh(item.geo,mat);item.mesh.frustumCulled=false;item.mesh.castShadow=true;item.mesh.receiveShadow=true;this.group.add(item.mesh);}
    // Hidden mannequin volume writes depth only, hiding the back of the coat
    // through the front opening. It never replaces the camera person's pixels.
    const occMat=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true});this.materials.push(occMat);
    this.occluder=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,32),occMat);this.occluder.renderOrder=-10;this.occluder.castShadow=true;this.group.add(this.occluder);
    const cordMat=new THREE.MeshStandardMaterial({color:ch.haori2,roughness:.9});this.materials.push(cordMat);
    this.cord=new THREE.Mesh(new THREE.BufferGeometry(),cordMat);this.cord.castShadow=true;this.group.add(this.cord);
    this.knot=new THREE.Mesh(new THREE.SphereGeometry(S*.025,12,8),cordMat);this.group.add(this.knot);
    this.signature=[ch.pattern,ch.haori,ch.haori2,fit.width,fit.length,(Math.round(ease*10)/10).toFixed(1),...['l','r'].map(s=>f.kp[s+'w'].v>.55&&f.kp[s+'e'].v>.5)].join('|');this.baseT=T;this.baseFrame=f;this.bodyAt=bodyAt;this.settled=false;this.settledSteps=0;return true;
  }
  render(W,H,kp,ch,opts={}) {
    if(!fabricReady())return {ready:false};
    const camera=fitBodyCamera(kp,W,H,this.focalRatio),f=bodyFrame(kp,camera);f.kp=kp;
    if(camera.estimated&&!this.focalRatio)this.focalRatio=camera.f/W;
    const unsupported=Math.abs(f.yaw)>Math.PI*.41||camera.error>Math.hypot(kp.rs.x-kp.ls.x,kp.rs.y-kp.ls.y)*.25;
    if(unsupported)return {ready:false,unsupported:true,reason:Math.abs(f.yaw)>Math.PI*.41?'angle':'projection'};
    const ease=opts.ease||1.28,fit=opts.fit||{},sig=[ch.pattern,ch.haori,ch.haori2,fit.width,fit.length,(Math.round(ease*10)/10).toFixed(1),...['l','r'].map(s=>kp[s+'w'].v>.55&&kp[s+'e'].v>.5)].join('|');
    if(!this.signature||sig!==this.signature||Math.abs(f.T/this.baseT-1)>.18){if(!this.rebuild(f,ch,fit,ease))return {ready:false};}
    if(this.canvas.width!==W||this.canvas.height!==H)this.renderer.setSize(W,H,false);this.camera.aspect=W/H;this.camera.fov=2*Math.atan(H/(2*camera.f))*180/Math.PI;this.camera.updateProjectionMatrix();
    // Geometry stays in inferred metric camera space; the root translation is
    // calibrated against 2D landmarks, not a square shoulder-width overlay.
    this.group.position.set(camera.tx,-camera.ty,-camera.D);
    const toThree=p=>new THREE.Vector3(p[0],-p[1],-p[2]);
    const rotateToBody=p=>{
      const rel=V.sub(p,this.baseFrame.sh);
      return V.add(f.sh,V.add(V.add(V.mul(f.side,V.dot(rel,this.baseFrame.side)),V.mul(f.down,V.dot(rel,this.baseFrame.down))),V.mul(f.front,V.dot(rel,this.baseFrame.front))));
    };
    for(const item of this.patches){const {patch}=item;
      for(const i of patch.pins){const u=(i%(patch.cols+1))/patch.cols,v=Math.floor(i/(patch.cols+1))/patch.rows;
        let target=rotateToBody(item.at(u,v));
        if(item.type!=='body'&&v===1){const w=f.point(item.type+'w');if(kp[item.type+'w'].v>.5)target=V.add(target,V.sub(w,rotateToBody(item.wrist)));}
        patch.setTarget(i,target);
      }
    }
    const collide=(p,i,part)=>{
      if(part!=='body')return;
      const rx=p[i]-f.sh[0],ry=p[i+1]-f.sh[1],rz=p[i+2]-f.sh[2],h=rx*f.down[0]+ry*f.down[1]+rz*f.down[2];
      // An inferred torso is not reliable enough to push sleeve cuff anchors
      // out of the body. Sleeves use gravity + stretch/bend constraints and
      // depth occlusion; torso contact is solved only for the torso patch.
      if(h<0||h>f.T*1.12)return;
      const t=clamp(h/f.T,0,1),dx=p[i]-(f.sh[0]+(f.hip[0]-f.sh[0])*t),dy=p[i+1]-(f.sh[1]+(f.hip[1]-f.sh[1])*t),dz=p[i+2]-(f.sh[2]+(f.hip[2]-f.sh[2])*t);
      const x=dx*f.side[0]+dy*f.side[1]+dz*f.side[2],z=dx*f.front[0]+dy*f.front[1]+dz*f.front[2];
      const a=f.S*.47,b=f.S*.255,Q=Math.hypot(x/a,z/b);
      if(Q<1&&Q>1e-7){const ax=x*(1/Q-1),az=z*(1/Q-1);p[i]+=f.side[0]*ax+f.front[0]*az;p[i+1]+=f.side[1]*ax+f.front[1]*az;p[i+2]+=f.side[2]*ax+f.front[2]*az;}
    };
    // Spread photo relaxation across frames: controls remain responsive while
    // loading/dragging sliders instead of freezing for a 180-step burst.
    let steps=opts.capture?0:opts.photo?Math.min(6,180-this.settledSteps):clamp(Math.round((opts.now-(this.lastTime||opts.now-33))/1000/COTTON_PRESET.dt),1,3);
    const force=V.mul(f.gravity,COTTON_PRESET.gravity);
    for(let n=0;n<steps;n++)for(const item of this.patches)item.patch.step(force,(p,i)=>collide(p,i,item.type));
    this.settledSteps+=steps;this.settled=this.settledSteps>=180;this.lastTime=opts.now;
    for(const item of this.patches){const a=item.geo.attributes.position.array;
      for(let i=0;i<item.patch.p.length;i+=3){a[i]=item.patch.p[i];a[i+1]=-item.patch.p[i+1];a[i+2]=-item.patch.p[i+2];}
      item.geo.attributes.position.needsUpdate=true;item.geo.computeVertexNormals();}
    const oc=V.add(f.sh,V.mul(f.down,f.T*.84));this.occluder.position.copy(toThree(oc));
    this.occluder.scale.set(f.S*.46,f.T*1.9,f.S*.245);
    const basis=new THREE.Matrix4().makeBasis(toThree(f.side),toThree(V.mul(f.down,-1)),toThree(f.front));this.occluder.quaternion.setFromRotationMatrix(basis);
    // Haori-himo joins two front edges; never use gray decorative lapel strips.
    const b=this.patches[0].patch,row=Math.round(b.rows*.36),left=Array.from(b.p.subarray(row*(b.cols+1)*3,row*(b.cols+1)*3+3));
    const ri=(row*(b.cols+1)+b.cols)*3,right=Array.from(b.p.subarray(ri,ri+3));
    const mid=V.add(V.mix(left,right,.5),V.add(V.mul(f.gravity,f.S*.05),V.mul(f.front,f.S*.035)));
    this.cord.geometry.dispose();this.cord.geometry=new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(toThree(left),toThree(mid),toThree(right)),16,f.S*.008,6,false);this.knot.position.copy(toThree(mid));
    const light=opts.light||{brightness:1,x:-.7,color:[1,.97,.92]};this.hemi.intensity=.35+light.brightness*.25;this.key.intensity=1.5+light.brightness;
    this.key.color.setRGB(...light.color);const target=toThree(f.sh).add(this.group.position);this.key.target.position.copy(target);this.key.position.copy(target).add(new THREE.Vector3(light.x*2,2.4,2));
    this.renderer.toneMappingExposure=clamp(light.brightness,.72,1.15);
    const audits=this.patches.map(p=>p.patch.audit());
    this.metrics={density:COTTON_PRESET.density,gravity:COTTON_PRESET.gravity,massKg:audits.reduce((s,a)=>s+a.massKg,0),
      maxStretch:Math.max(...audits.map(a=>a.maxStretch)),finite:audits.every(a=>a.finite),pitch:f.pitch*180/Math.PI,yaw:f.yaw*180/Math.PI,
      reprojectionPx:camera.error,cameraEstimated:camera.estimated,parts:audits.map((a,i)=>({name:this.patches[i].type,maxStretch:a.maxStretch}))};
    if(!this.metrics.finite){this.reset();return {ready:false,invalid:true};}
    this.renderer.render(this.scene,this.camera);return {ready:true,valid:this.metrics.maxStretch<.05&&(!opts.photo||this.settled),settling:opts.photo&&!this.settled,progress:Math.min(1,this.settledSteps/180),canvas:this.canvas,metrics:this.metrics};
  }
}
