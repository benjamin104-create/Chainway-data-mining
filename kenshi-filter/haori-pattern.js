// Reference-informed procedural cut, not a measured sewing pattern. Geometry
// keeps neck, dropped shoulder, hanging body panels and a broad cuff distinct.
import { V } from './body-camera.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const interp=(v,rows)=>{
  for(let i=1;i<rows.length;i++)if(v<=rows[i][0]){const a=rows[i-1],b=rows[i],t=(v-a[0])/(b[0]-a[0]);return a.slice(1).map((x,k)=>x+(b[k+1]-x)*t);}
  return rows.at(-1).slice(1);
};
export function haoriPattern(f,fit={},ease=1.28) {
  const {S,T,sh,hip,side,down,front,gravity}=f;
  const width=clamp(fit.width||1,.85,1.2)*ease,height=T*1.55*clamp(fit.length||1,.8,1.2);
  const bodyAt=(u,v)=>{
    const gap=interp(v,[[0,.43],[.20,.39],[.55,.26],[1,.27]])[0];
    const theta=gap+(Math.PI*2-gap*2)*u,sn=Math.sin(theta),cs=Math.cos(theta);
    const [radius,depth]=interp(v,[[0,.49,.245],[.13,.52,.29],[.55,.53,.31],[1,.55,.30]]);
    // The shoulder line slopes away from the neck instead of pinning a round
    // cone all around the upper chest. Lower panels fall with gravity.
    const shoulderDrop=T*(-.21+.20*Math.pow(Math.abs(sn),1.25));
    const drop=height*v+shoulderDrop*(1-v);
    const center=drop<T?V.mix(sh,hip,drop/T):V.add(hip,V.mul(gravity,drop-T));
    const crease=(Math.sin(theta*7+.25)*.016+Math.sin(theta*13-v*.6)*.006)*S*(.25+.75*v);
    const edge=1-Math.exp(-Math.min(u,1-u)*35);
    const neckTaper=1-Math.exp(-v*22)*.4*(1-Math.abs(sn));
    const neckDepth=depth-.12*Math.exp(-v*18)*(1-Math.abs(sn));
    return V.add(V.add(center,V.mul(side,sn*(S*radius*width*neckTaper+crease*edge))),
      V.mul(front,cs*(S*neckDepth+crease*edge)));
  };
  const sleeves={};
  for(const s of ['l','r']){
    const sign=s==='l'?-1:1,shoulder=f.point(s+'s');
    const elbow=f.kp[s+'e']?.v>.5?f.point(s+'e'):V.add(shoulder,V.mul(down,T*.55));
    const wrist=f.kp[s+'w']?.v>.5?f.point(s+'w'):V.add(elbow,V.mul(down,T*.55));
    // A haori sleeve ends on the forearm, not around the wrist. A large cuff
    // can expose the person's original long sleeve and free hand.
    const cuff=V.mix(elbow,wrist,.58),axis=V.norm(V.sub(cuff,shoulder));
    const root=V.add(shoulder,V.add(V.mul(side,sign*S*.075*width),V.mul(down,-T*.065)));
    let outward=V.norm(V.cross(axis,front));
    if(V.dot(outward,V.mul(side,sign))<0)outward=V.mul(outward,-1);
    const lifted=1-Math.abs(V.dot(axis,gravity));
    const at=(u,v)=>{
      const c=V.add(V.mix(root,cuff,v),V.mul(V.sub(elbow,V.mix(root,cuff,.55)),v*(1-v)/(.55*.45)));
      const theta=u*Math.PI*2,sn=Math.sin(theta),cs=Math.cos(theta);
      // Rounded rectangular front/back sleeve bag, rather than a circular
      // muscle-following tube. Lower cloth is free below the supporting arm.
      const box=n=>Math.sign(n)*Math.pow(Math.abs(n),.65);
      const broad=S*interp(v,[[0,.19],[.3,.28],[1,.31]])[0]*Math.sqrt(width);
      const thin=S*interp(v,[[0,.095],[.5,.065],[1,.065]])[0];
      const sag=S*lifted*(.08+.20*v)*(.5+.5*box(sn)*V.dot(outward,gravity));
      const fold=S*(.010+.018*Math.exp(-(((v-.55)/.22)**2)))*Math.sin(v*14+u*Math.PI*4)*(1-v*.35);
      return V.add(V.add(V.add(V.add(c,V.mul(outward,box(sn)*broad)),
        V.mul(front,box(cs)*thin+fold*Math.abs(cs))),V.mul(gravity,sag)),
        V.mul(down,T*.05*Math.max(0,box(sn))*Math.exp(-v*9)));
    };
    sleeves[s]={at,root,elbow,cuff,wrist,visible:f.kp[s+'w']?.v>.55&&f.kp[s+'e']?.v>.5};
  }
  return {bodyAt,sleeves,width,height};
}

// A small folded band follows the actual solved front edge. Its normal offset
// creates a roll and a same-cloth thickness, never a painted gray inner strip.
export function collarRibbon(patch,S,front,edge,columns=4) {
  const points=[];
  for(let y=0;y<=patch.rows;y++){
    const v=y/patch.rows,i=(y*(patch.cols+1)+(edge?patch.cols:0))*3;
    const j=(y*(patch.cols+1)+(edge?patch.cols-1:1))*3;
    const p=Array.from(patch.p.subarray(i,i+3)),q=Array.from(patch.p.subarray(j,j+3));
    const across=V.norm(V.sub(q,p)),width=S*(.065+.025*Math.exp(-v*8));
    for(let x=0;x<=columns;x++){
      const u=x/columns,roll=S*(.007+.016*Math.exp(-v*7))*Math.sin(u*Math.PI);
      points.push(...V.add(V.add(p,V.mul(across,width*u)),V.mul(front,S*.006+roll)));
    }
  }
  return points;
}
