// Local, identity-preserving portrait retouch. No face warp or gender inference.
export const BEAUTY = Object.freeze({
  off: {label:'關閉',smooth:0,light:0,glow:0,contrast:1},
  standard: {label:'標準',smooth:.62,light:.115,glow:1.2,contrast:1},
  hero: {label:'男神',smooth:.45,light:.09,glow:.65,contrast:1.022},
  goddess: {label:'女神',smooth:.78,light:.16,glow:1.8,contrast:1},
});
export function beautyMode(value){return Object.hasOwn(BEAUTY,value||'')?value:'standard';}
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
export function faceGeometry(kp){
  const l=kp?.ley,r=kp?.rey,n=kp?.n;
  if(![l,r,n].every(p=>p&&p.v>.42&&Number.isFinite(p.x)&&Number.isFinite(p.y)))return null;
  const d=Math.hypot(r.x-l.x,r.y-l.y);if(d<6)return null;
  const side=[(r.x-l.x)/d,(r.y-l.y)/d],down=[-side[1],side[0]],eye={x:(l.x+r.x)/2,y:(l.y+r.y)/2};
  if(down[1]<0){side[0]*=-1;side[1]*=-1;down[0]*=-1;down[1]*=-1;}
  if(Math.abs((n.x-eye.x)*side[0]+(n.y-eye.y)*side[1])>d*.8)return null;
  const earSpan=kp.lear?.v>.5&&kp.rear?.v>.5?Math.hypot(kp.rear.x-kp.lear.x,kp.rear.y-kp.lear.y):d*2.7;
  const width=clamp(earSpan,d*2.25,d*3.25),cx=eye.x+down[0]*width*.25,cy=eye.y+down[1]*width*.25;
  return {cx,cy,width,height:width*1.34,side,down,eyes:[l,r],nose:n,
    mouth:kp.lmouth?.v>.5&&kp.rmouth?.v>.5?{x:(kp.lmouth.x+kp.rmouth.x)/2,y:(kp.lmouth.y+kp.rmouth.y)/2}:{x:n.x+down[0]*width*.25,y:n.y+down[1]*width*.25}};
}
const chroma=(r,g,b)=>[-.1687*r-.3313*g+.5*b,.5*r-.4187*g-.0813*b];
// Summed-area RGB blur: constant-time local average per pixel, no extra model
// and no browser-specific Canvas filter. Features remain protected below.
export function skinIntegral(src,w,h){
  const stride=(w+1)*3,a=new Uint32Array((w+1)*(h+1)*3);
  for(let y=1;y<=h;y++){let r=0,g=0,b=0;for(let x=1;x<=w;x++){
    const i=((y-1)*w+x-1)*4,j=y*stride+x*3;r+=src[i];g+=src[i+1];b+=src[i+2];a[j]=a[j-stride]+r;a[j+1]=a[j-stride+1]+g;a[j+2]=a[j-stride+2]+b;
  }}return a;
}
// Pixel output is an alpha-only face overlay. All pixels outside the mask stay
// transparent; original background/hair/garment pixels are never rewritten.
export function retouchPixels(src,w,h,f,mode,strength=1){
  const preset=BEAUTY[beautyMode(mode)],k=clamp(Number.isFinite(strength)?strength:1,.6,1.6),b={...preset,smooth:Math.min(.94,preset.smooth*k),light:preset.light*k,glow:preset.glow*k,contrast:1+(preset.contrast-1)*k},out=new Uint8ClampedArray(src.length);
  if(mode==='off'||!f)return out;
  const samples=[-.13,0,.13].map(dx=>{
    const x=clamp(Math.round(f.nose.x+f.side[0]*f.width*dx+f.down[0]*f.width*.045),0,w-1),y=clamp(Math.round(f.nose.y+f.side[1]*f.width*dx+f.down[1]*f.width*.045),0,h-1),i=(y*w+x)*4;
    return chroma(src[i],src[i+1],src[i+2]);
  });
  const rad=Math.max(2,Math.round(f.width*.026)),integral=skinIntegral(src,w,h),stride=(w+1)*3,sx=f.side[0],sy=f.side[1],ux=f.down[0],uy=f.down[1];
  const features=[...f.eyes.map(p=>({x:p.x-ux*f.width*.025,y:p.y-uy*f.width*.025,rx:f.width*.19,ry:f.width*.105})),{...f.mouth,rx:f.width*.23,ry:f.width*.095}];
  const protect=features.map(p=>({x:(p.x-f.cx)*sx+(p.y-f.cy)*sy,y:(p.x-f.cx)*ux+(p.y-f.cy)*uy,ix:1/(p.rx*p.rx),iy:1/(p.ry*p.ry)}));
  const ix=1/(f.width*.48)**2,iy=1/(f.height*.48)**2;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const dx=x-f.cx,dy=y-f.cy,fx=dx*sx+dy*sy,fy=dx*ux+dy*uy,edge=clamp((1-fx*fx*ix-fy*fy*iy)/.40);
    if(!edge)continue;
    let detail=1;for(const p of protect){const ex=fx-p.x,ey=fy-p.y;detail=Math.min(detail,clamp((ex*ex*p.ix+ey*ey*p.iy-.72)/.97));}
    if(!detail)continue;
    const i=(y*w+x)*4,r=src[i],g=src[i+1],bl=src[i+2],cb=-.1687*r-.3313*g+.5*bl,cr=.5*r-.4187*g-.0813*bl;
    let dist2=Infinity;for(const s of samples){const a=cb-s[0],c=cr-s[1];dist2=Math.min(dist2,a*a+c*c);}
    const skin=clamp((1024-dist2)/735),lum=r*.299+g*.587+bl*.114;
    const alpha=edge*skin*detail*clamp((lum-22)/40)*clamp(src[i+3]/255);
    if(alpha<.01)continue;
    const x0=Math.max(0,x-rad),x1=Math.min(w,x+rad+1),y0=Math.max(0,y-rad),y1=Math.min(h,y+rad+1),area=(x1-x0)*(y1-y0),tl=y0*stride+x0*3,tr=y0*stride+x1*3,bl0=y1*stride+x0*3,br=y1*stride+x1*3;
    const avg=q=>(integral[br+q]-integral[tr+q]-integral[bl0+q]+integral[tl+q])/area;
    const sr=avg(0),sg=avg(1),sb=avg(2),detailWeight=clamp(1-(Math.abs(sr-r)+Math.abs(sg-g)+Math.abs(sb-bl))/100);
    for(let q=0;q<3;q++){
      const original=src[i+q],soft=original+((q===0?sr:q===1?sg:sb)-original)*b.smooth*detailWeight;
      const lift=(255-soft)*b.light*(1-lum/255),warm=(q===0?1.4:q===1?.25:-.65)*b.glow;
      out[i+q]=clamp((soft+lift-128)*b.contrast+128+warm,0,255);
    }
    out[i+3]=Math.round(alpha*255);
  }
  return out;
}
export class BeautyPass{
  constructor(){this.cv=document.createElement('canvas');this.g=this.cv.getContext('2d',{willReadFrequently:true});}
  draw(ctx,kp,mode,capture=false,strength=1){
    this.activePixels=0;
    if(mode==='off')return false;
    const f=faceGeometry(kp);if(!f)return false;
    const W=ctx.canvas.width,H=ctx.canvas.height,pad=Math.max(f.width,f.height)*.72;
    const x=Math.max(0,Math.floor(f.cx-pad)),y=Math.max(0,Math.floor(f.cy-pad)),rw=Math.min(W-x,Math.ceil(f.cx+pad)-x),rh=Math.min(H-y,Math.ceil(f.cy+pad)-y);
    if(rw<4||rh<4)return false;
    const scale=Math.min(1,(capture?384:224)/Math.max(rw,rh)),w=Math.max(1,Math.round(rw*scale)),h=Math.max(1,Math.round(rh*scale));
    if(this.cv.width!==w||this.cv.height!==h){this.cv.width=w;this.cv.height=h;}
    this.g.clearRect(0,0,w,h);this.g.drawImage(ctx.canvas,x,y,rw,rh,0,0,w,h);
    const point=p=>({x:(p.x-x)*w/rw,y:(p.y-y)*h/rh});
    const local={...f,cx:(f.cx-x)*w/rw,cy:(f.cy-y)*h/rh,width:f.width*scale,height:f.height*scale,eyes:f.eyes.map(point),nose:point(f.nose),mouth:point(f.mouth)};
    const pixels=this.g.getImageData(0,0,w,h),overlay=retouchPixels(pixels.data,w,h,local,mode,strength);for(let i=3;i<overlay.length;i+=4)if(overlay[i]>16)this.activePixels++;pixels.data.set(overlay);this.g.putImageData(pixels,0,0);
    ctx.save();ctx.filter='none';ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.drawImage(this.cv,0,0,w,h,x,y,rw,rh);ctx.restore();return this.activePixels>8;
  }
}
