import * as THREE from './lib/three.module.min.js';
import { RoomEnvironment } from './lib/RoomEnvironment.js';
import { V, fitBodyCamera, bodyFrame } from './body-camera.js';
import { ClothPatch, COTTON_PRESET } from './cloth-physics.js';
import { tile } from './ar.js';
import { haoriPattern, collarRibbon } from './haori-pattern.js';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const fabric=new Image();fabric.src=new URL('assets/fabric-cotton-weave-v3.png',import.meta.url).href;
const textures=new Map();
export const fabricReady=()=>fabric.complete&&fabric.naturalWidth>0;
function clothTextures(ch,style='indigo') {
  const key=[style,ch.pattern,ch.haori,ch.haori2].join('|');if(textures.has(key))return textures.get(key);
  if(!fabricReady())return null;
  const cv=document.createElement('canvas');cv.width=cv.height=1024;const g=cv.getContext('2d',{willReadFrequently:true});
  g.fillStyle=style==='pattern'?g.createPattern(tile(ch.pattern,ch.haori,ch.haori2,140),'repeat'):style==='ink'?'#282c33':'#57677e';g.fillRect(0,0,1024,1024);
  const data=g.getImageData(0,0,1024,1024),scan=document.createElement('canvas');scan.width=scan.height=1024;
  const sg=scan.getContext('2d',{willReadFrequently:true});sg.drawImage(fabric,0,0,1024,1024);const grain=sg.getImageData(0,0,1024,1024).data;
  for(let i=0;i<data.data.length;i+=4){const shade=.76+(grain[i]+grain[i+1]+grain[i+2])/765*.28;
    for(let c=0;c<3;c++)data.data[i+c]*=shade;}
  g.putImageData(data,0,0);
  const map=new THREE.CanvasTexture(cv);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=4;
  const normalCv=document.createElement('canvas');normalCv.width=normalCv.height=128;const ng=normalCv.getContext('2d'),ni=ng.createImageData(128,128);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){const i=(y*128+x)*4;ni.data[i]=128+Math.sin(x*Math.PI/2)*13;ni.data[i+1]=128+Math.sin(y*Math.PI/2)*13;ni.data[i+2]=252;ni.data[i+3]=255;}
  ng.putImageData(ni,0,0);const normal=new THREE.CanvasTexture(normalCv);normal.wrapS=normal.wrapT=THREE.RepeatWrapping;normal.repeat.set(20,20);
  const result={map,normal};textures.set(key,result);return result;
}
function geometry(patch) {
  const g=new THREE.BufferGeometry(),uv=new Float32Array(patch.p.length/3*2);
  for(let y=0;y<=patch.rows;y++)for(let x=0;x<=patch.cols;x++){const i=y*(patch.cols+1)+x;uv[i*2]=x/patch.cols;uv[i*2+1]=1-y/patch.rows;}
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(patch.p.length),3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(patch.indices);return g;
}
function torsoDepthGeometry(){
  const rows=[[-.35,.19,.10],[-.10,.42,.15],[.15,.46,.225],[.35,.46,.235],[1.15,.45,.24],[1.65,.42,.23]],cols=32,p=[],indices=[];
  for(const [h,x,z] of rows)for(let i=0;i<=cols;i++){const t=i/cols*Math.PI*2;p.push(Math.sin(t)*x,-h,Math.cos(t)*z);}
  for(let y=0;y<rows.length-1;y++)for(let x=0;x<cols;x++){const a=y*(cols+1)+x;indices.push(a,a+cols+1,a+1,a+1,a+cols+1,a+cols+2);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(indices);return g;
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
  rebuild(f,ch,fit,ease,style) {
    this.clearGeometry();const tex=clothTextures(ch,style);if(!tex)return false;
    const mat=new THREE.MeshPhysicalMaterial({map:tex.map,normalMap:tex.normal,normalScale:new THREE.Vector2(.22,.22),
      roughness:.96,metalness:0,envMapIntensity:.18,sheen:.12,sheenRoughness:.95,sheenColor:new THREE.Color('#aaa8a4'),side:THREE.DoubleSide});
    this.materials.push(mat);const {S,T}=f,pattern=haoriPattern(f,fit,ease),bodyAt=pattern.bodyAt;
    const C=36,R=20,pins=Array.from({length:C+1},(_,i)=>i),body=new ClothPatch(C,R,bodyAt,pins,{bendCompliance:.08});
    const tieRow=Math.round(R*.36);body.addTie(tieRow*(C+1),tieRow*(C+1)+C);
    this.patches=[{patch:body,at:bodyAt,type:'body'}];
    for(const s of ['l','r']) {
      const sleeve=pattern.sleeves[s],sleeveAt=sleeve.at;
      const sc=20,sr=12,sp=Array.from({length:sc+1},(_,i)=>i);
      // Support at the arm-facing edge of the elbow and forearm opening. The
      // large pocket remains free; never pull the whole cuff onto the wrist.
      if(sleeve.visible)sp.push(Math.round(sr*.55)*(sc+1),sr*(sc+1));
      const patch=new ClothPatch(sc,sr,sleeveAt,sp,{seamClosed:true,bendCompliance:.3});
      this.patches.push({patch,at:sleeveAt,type:s});
    }
    for(const item of this.patches){item.geo=geometry(item.patch);
      const uv=item.geo.attributes.uv.array;for(let i=0;i<uv.length;i+=2){uv[i]*=item.type==='body'?2.2:1.1;uv[i+1]*=item.type==='body'?1.5:1.1;}
      item.mesh=new THREE.Mesh(item.geo,mat);item.mesh.frustumCulled=false;item.mesh.castShadow=true;item.mesh.receiveShadow=true;this.group.add(item.mesh);}
    this.collars=[];
    for(const edge of [0,1]){
      const geo=geometry({cols:4,rows:R,p:new Float64Array((R+1)*5*3),indices:[]}),indices=[];
      for(let y=0;y<R;y++)for(let x=0;x<4;x++){const a=y*5+x;indices.push(a,a+5,a+1,a+1,a+5,a+6);}
      for(let y=0;y<=R;y++)for(let x=0;x<=4;x++){const i=(y*5+x)*2;geo.attributes.uv.array[i]=edge?2.2-.05*x/4:.05*x/4;geo.attributes.uv.array[i+1]=(1-y/R)*1.5;}
      geo.setIndex(indices);const mesh=new THREE.Mesh(geo,mat);mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;this.group.add(mesh);this.collars.push({edge,geo});
    }
    this.hems=this.patches.map(item=>{
      const cols=item.patch.cols,rows=3,indices=[];
      for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=y*(cols+1)+x;indices.push(a,a+cols+1,a+1,a+1,a+cols+1,a+cols+2);}
      const geo=geometry({cols,rows,p:new Float64Array((cols+1)*(rows+1)*3),indices});
      const mesh=new THREE.Mesh(geo,mat);mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;this.group.add(mesh);return {item,geo};
    });
    // Hidden mannequin volume writes depth only, hiding the back of the coat
    // through the front opening. It never replaces the camera person's pixels.
    const occMat=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true});this.materials.push(occMat);
    this.occluder=new THREE.Mesh(torsoDepthGeometry(),occMat);this.occluder.renderOrder=-10;this.occluder.castShadow=true;this.group.add(this.occluder);
    const cordMat=new THREE.MeshStandardMaterial({color:style==='pattern'?ch.haori2:style==='ink'?'#20242b':'#485a73',roughness:.98});this.materials.push(cordMat);
    this.cord=new THREE.Mesh(new THREE.BufferGeometry(),cordMat);this.cord.castShadow=true;this.group.add(this.cord);
    this.knot=new THREE.Mesh(new THREE.SphereGeometry(S*.025,12,8),cordMat);this.group.add(this.knot);
    this.signature=[style,ch.pattern,ch.haori,ch.haori2,fit.width,fit.length,(Math.round(ease*10)/10).toFixed(1),...['l','r'].map(s=>f.kp[s+'w'].v>.55&&f.kp[s+'e'].v>.5)].join('|');this.baseT=T;this.settled=false;this.settledSteps=0;return true;
  }
  render(W,H,kp,ch,opts={}) {
    if(!fabricReady())return {ready:false};
    const camera=fitBodyCamera(kp,W,H,this.focalRatio),f=bodyFrame(kp,camera);f.kp=kp;
    if(camera.estimated&&!this.focalRatio)this.focalRatio=camera.f/W;
    const unsupported=Math.abs(f.yaw)>Math.PI*.41||camera.error>Math.hypot(kp.rs.x-kp.ls.x,kp.rs.y-kp.ls.y)*.25;
    if(unsupported)return {ready:false,unsupported:true,reason:Math.abs(f.yaw)>Math.PI*.41?'angle':'projection'};
    const ease=opts.ease||1.28,fit=opts.fit||{},style=opts.fabric||'indigo',sig=[style,ch.pattern,ch.haori,ch.haori2,fit.width,fit.length,(Math.round(ease*10)/10).toFixed(1),...['l','r'].map(s=>kp[s+'w'].v>.55&&kp[s+'e'].v>.5)].join('|');
    if(!this.signature||sig!==this.signature||Math.abs(f.T/this.baseT-1)>.18){if(!this.rebuild(f,ch,fit,ease,style))return {ready:false};}
    if(this.canvas.width!==W||this.canvas.height!==H)this.renderer.setSize(W,H,false);this.camera.aspect=W/H;this.camera.fov=2*Math.atan(H/(2*camera.f))*180/Math.PI;this.camera.updateProjectionMatrix();
    // Geometry stays in inferred metric camera space; the root translation is
    // calibrated against 2D landmarks, not a square shoulder-width overlay.
    this.group.position.set(camera.tx,-camera.ty,-camera.D);
    const toThree=p=>new THREE.Vector3(p[0],-p[1],-p[2]);
    const current=haoriPattern(f,fit,ease);
    for(const item of this.patches){const {patch}=item;
      for(const i of patch.pins){const u=(i%(patch.cols+1))/patch.cols,v=Math.floor(i/(patch.cols+1))/patch.rows;
        const target=(item.type==='body'?current.bodyAt:current.sleeves[item.type].at)(u,v);
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
    for(const collar of this.collars){const p=collarRibbon(this.patches[0].patch,f.S,f.front,collar.edge),a=collar.geo.attributes.position.array;
      for(let i=0;i<p.length;i+=3){a[i]=p[i];a[i+1]=-p[i+1];a[i+2]=-p[i+2];}
      collar.geo.attributes.position.needsUpdate=true;collar.geo.computeVertexNormals();}
    for(const {item,geo} of this.hems){
      const {cols,rows}=item.patch,p=item.geo.attributes.position.array,n=item.geo.attributes.normal.array,uv=item.geo.attributes.uv.array,a=geo.attributes.position.array,t=geo.attributes.uv.array;
      for(let y=0;y<=3;y++)for(let x=0;x<=cols;x++){
        const i=(rows*(cols+1)+x)*3,j=i-(cols+1)*3,k=(y*(cols+1)+x)*3,q=y/3,dir=V.norm([p[j]-p[i],p[j+1]-p[i+1],p[j+2]-p[i+2]]);
        const width=f.S*(item.type==='body'?.018:.025),roll=.0012+Math.sin(q*Math.PI)*.0015;
        for(let z=0;z<3;z++)a[k+z]=p[i+z]+dir[z]*q*width+n[i+z]*roll;
        t[k/3*2]=uv[i/3*2];t[k/3*2+1]=uv[i/3*2+1]+q*.016;
      }
      geo.attributes.position.needsUpdate=true;geo.attributes.uv.needsUpdate=true;geo.computeVertexNormals();
    }
    this.occluder.position.copy(toThree(f.sh));this.occluder.scale.set(f.S,f.T,f.S);
    const basis=new THREE.Matrix4().makeBasis(toThree(f.side),toThree(V.mul(f.down,-1)),toThree(f.front));this.occluder.quaternion.setFromRotationMatrix(basis);
    // Haori-himo joins two front edges; never use gray decorative lapel strips.
    const b=this.patches[0].patch,row=Math.round(b.rows*.36),left=Array.from(b.p.subarray(row*(b.cols+1)*3,row*(b.cols+1)*3+3));
    const ri=(row*(b.cols+1)+b.cols)*3,right=Array.from(b.p.subarray(ri,ri+3));
    const mid=V.add(V.mix(left,right,.5),V.add(V.mul(f.gravity,f.S*.05),V.mul(f.front,f.S*.035)));
    this.cord.geometry.dispose();this.cord.geometry=new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(toThree(left),toThree(mid),toThree(right)),16,f.S*.008,6,false);this.knot.position.copy(toThree(mid));
    const light=opts.light||{brightness:1,x:-.7,color:[1,.97,.92]};this.hemi.intensity=.6+light.brightness*.35;this.key.intensity=.9+light.brightness*.65;
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
