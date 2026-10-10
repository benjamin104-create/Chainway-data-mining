import * as THREE from './lib/three.module.min.js';
import {V} from './body-camera.js';
// Procedural costume-inspired layer. No official artwork is used as a texture,
// no face/hair replacement, and no full sewing or size-accurate claim.
export function kimonoPoint(f,u,v){
  const x=u*2-1,top=f.T*(.04+(1-Math.abs(x))*.03),h=top+(f.T*2.08-top)*v;
  return frontPoint(f,x,h,.275);
}
function frontPoint(f,x,h,depth){
  const center=h<f.T?V.mix(f.sh,f.hip,h/f.T):V.add(f.hip,V.mul(f.gravity,h-f.T));
  const fold=Math.sin(x*19+h/f.T)*f.S*.007;
  const shoulderDepth=.14+.13*Math.max(0,Math.min(1,(h/f.T+.16)/.40));
  return V.add(V.add(center,V.mul(f.side,x*f.S*.44)),V.mul(f.front,f.S*(shoulderDepth+(depth-.275)-.14*x*x)+fold));
}
function grid(cols,rows){
  const g=new THREE.BufferGeometry(),p=new Float32Array((cols+1)*(rows+1)*3),uv=new Float32Array((cols+1)*(rows+1)*2),idx=[];
  for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){const i=y*(cols+1)+x;uv.set([x/cols,1-y/rows],i*2);if(y<rows&&x<cols)idx.push(i,i+cols+1,i+1,i+1,i+cols+1,i+cols+2);}
  g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(idx);return {geo:g,cols,rows};
}
function texture(checker=false){
  const cv=document.createElement('canvas');cv.width=cv.height=256;const g=cv.getContext('2d');
  if(checker){for(let y=0;y<8;y++)for(let x=0;x<8;x++){g.fillStyle=(x+y)%2?'#b83237':'#f4e9d8';g.fillRect(x*32,y*32,32,32);}}
  else{g.fillStyle='#e8adba';g.fillRect(0,0,256,256);g.strokeStyle='#985c6a';g.lineWidth=.65;
    const r=32,h=Math.sqrt(3)*r;
    for(let y=-1;y<7;y++)for(let x=-1;x<7;x++){
      const cx=x*r*1.5,cy=y*h+(x%2)*h/2,pts=[];
      for(let k=0;k<6;k++)pts.push([cx+Math.cos(k*Math.PI/3)*r,cy+Math.sin(k*Math.PI/3)*r]);
      g.beginPath();for(let k=0;k<6;k++){g.moveTo(cx,cy);g.lineTo(...pts[k]);g.lineTo(...pts[(k+1)%6]);}g.stroke();
    }
  }
  const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(checker?1:2,checker?1:4);return t;
}
export class KimonoLayer{
  constructor(parent){
    this.group=new THREE.Group();parent.add(this.group);this.materials=[];this.textures=[];this.items=[];
    const cloth=(color,map)=>{const m=new THREE.MeshPhysicalMaterial({color,map,roughness:.95,metalness:0,side:THREE.DoubleSide,sheen:.12,envMapIntensity:.18});this.materials.push(m);return m;};
    const pinkMap=texture(),obiMap=texture(true);this.textures.push(pinkMap,obiMap);
    const pink=cloth('#ffffff',pinkMap),white=cloth('#eee6dc'),obi=cloth('#ffffff',obiMap),green=cloth('#64845f');
    const add=(id,cols,rows,mat)=>{const item={id,...grid(cols,rows)};item.mesh=new THREE.Mesh(item.geo,mat);item.mesh.frustumCulled=false;item.mesh.receiveShadow=true;this.group.add(item.mesh);this.items.push(item);};
    add('inner',16,22,pink);add('obi',12,3,obi);add('cord',12,2,green);
    for(const s of ['l','r'])add('collar'+s,3,12,white);
    for(const s of ['l','r'])add('arm'+s,12,6,pink);
  }
  update(f,pattern){
    for(const item of this.items){const a=item.geo.attributes.position.array;
      for(let y=0;y<=item.rows;y++)for(let x=0;x<=item.cols;x++){
        const u=x/item.cols,v=y/item.rows;let p;
        if(item.id==='inner')p=kimonoPoint(f,u,v);
        else if(item.id==='obi')p=frontPoint(f,u*2-1,f.T*(.76+.21*v),.298);
        else if(item.id==='cord')p=frontPoint(f,u*2-1,f.T*(.845+.024*v),.305);
        else if(item.id.startsWith('collar')){
          const sign=item.id.endsWith('l')?-1:1,xx=sign*(.45*(1-v)+u*.10);
          p=frontPoint(f,xx,f.T*(-.15+v*.27),.293);
        }else{
          const s=item.id.at(-1),sl=pattern.sleeves[s],c=V.mix(sl.cuff,sl.wrist,v*.90),axis=V.norm(V.sub(sl.wrist,sl.cuff)),lateral=V.norm(V.cross(axis,f.front)),t=u*Math.PI*2;
          p=V.add(V.add(c,V.mul(lateral,Math.sin(t)*f.S*.085)),V.mul(f.front,Math.cos(t)*f.S*.085));
          item.mesh.visible=sl.visible;
        }
        const i=(y*(item.cols+1)+x)*3;a[i]=p[0];a[i+1]=-p[1];a[i+2]=-p[2];
      }
      item.geo.attributes.position.needsUpdate=true;item.geo.computeVertexNormals();
    }
  }
  dispose(){this.group.removeFromParent();for(const i of this.items)i.geo.dispose();for(const m of this.materials)m.dispose();for(const t of this.textures)t.dispose();}
}
