import {V} from './body-camera.js';
// Close the open upper body ring with a shoulder surface. The inner boundary
// follows the back of the neck; the front stays open like a real haori.
// This support surface shares the solved body's upper ring, not a 2D sticker.
export function neckBoundaryPoint(f,u){
  const neck=V.mix(f.sh,f.point('n'),.40),t=Math.PI/2+Math.PI*u;
  return V.add(V.add(V.add(neck,V.mul(f.side,f.S*.16*Math.sin(t))),V.mul(f.front,f.S*(.07+.12*Math.cos(t)))),V.mul(f.down,f.S*.02*Math.cos(t)));
}
export function yokePoints(f,patch,rows=4){
  const out=[];
  for(let y=0;y<=rows;y++)for(let x=0;x<=patch.cols;x++){
    const u=x/patch.cols,v=y/rows,inner=neckBoundaryPoint(f,u);
    const i=x*3,outer=Array.from(patch.p.subarray(i,i+3));
    const p=V.mix(inner,outer,v);
    const fold=f.S*.004*Math.sin(u*Math.PI*10)*Math.sin(v*Math.PI);
    out.push(...V.add(p,V.mul(f.front,fold)));
  }return out;
}
export function foldedCollarPoints(f,patch,edge,columns=4){
  const points=[],path=[],extra=3,sign=edge?-1:1,neck=neckBoundaryPoint(f,edge?1:0);
  const topIndex=edge?patch.cols*3:0,top=Array.from(patch.p.subarray(topIndex,topIndex+3));
  for(let y=0;y<extra;y++)path.push(V.mix(neck,top,y/extra));
  for(let y=0;y<=patch.rows;y++){const i=(y*(patch.cols+1)+(edge?patch.cols:0))*3;path.push(Array.from(patch.p.subarray(i,i+3)));}
  for(let y=0;y<path.length;y++){
    const p=path[y],along=V.norm(V.sub(path[Math.min(path.length-1,y+1)],path[Math.max(0,y-1)]));let across=V.norm(V.cross(f.front,along));
    if(V.dot(across,f.side)*sign<0)across=V.mul(across,-1);
    const v=y/(path.length-1),width=f.S*(.09+.02*Math.exp(-v*7));
    for(let x=0;x<=columns;x++){const u=x/columns,roll=f.S*(.009+.019*Math.sin(u*Math.PI));points.push(...V.add(V.add(p,V.mul(across,width*u)),V.mul(f.front,roll)));}
  }return points;
}
export function neckCollarPoints(f,patch,columns=4){
  const points=[];
  for(let y=0;y<=patch.cols;y++){
    const u=y/patch.cols,p=neckBoundaryPoint(f,u),i=y*3,q=Array.from(patch.p.subarray(i,i+3)),across=V.norm(V.sub(q,p));
    for(let x=0;x<=columns;x++){const t=x/columns,roll=f.S*(.009+.019*Math.sin(t*Math.PI));points.push(...V.add(V.add(p,V.mul(across,f.S*.10*t)),V.mul(f.front,roll)));}
  }return points;
}
export const CLOSURE_ROW=.22;
export function closurePose(patch,f){
  const row=Math.round(patch.rows*CLOSURE_ROW),i=row*(patch.cols+1)*3,j=i+patch.cols*3;
  const left=Array.from(patch.p.subarray(i,i+3)),right=Array.from(patch.p.subarray(j,j+3));
  const mid=V.add(V.mix(left,right,.5),V.add(V.mul(f.gravity,f.S*.035),V.mul(f.front,f.S*.065)));
  return {left,right,mid,row};
}
