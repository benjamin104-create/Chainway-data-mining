import {V} from './body-camera.js';
import {ClothPatch} from './cloth-physics.js';
export const LIVE_CLOTH=Object.freeze({bodyCols:24,bodyRows:14,sleeveCols:16,sleeveRows:10,iterations:12,strainPasses:24,damping:8,shadowSize:512});
export const PHOTO_CLOTH=Object.freeze({bodyCols:36,bodyRows:20,sleeveCols:20,sleeveRows:12,iterations:20,strainPasses:24,shadowSize:1024});
export function liveClock(now,last){
  const elapsed=Math.max(1/120,Math.min(1/15,(now-(last??now-1000/30))/1000));
  return {steps:2,dt:elapsed/2,elapsed}; // Bound stalls; no old-frame catch-up queue.
}
const rotate=(p,a,b)=>V.add(V.add(V.mul(b.side,V.dot(p,a.side)),V.mul(b.down,V.dot(p,a.down))),V.mul(b.front,V.dot(p,a.front)));
// Kinematic pose advection followed by local cloth relaxation. This sacrifices
// absolute world-space inertia to make mobile AR follow the latest person,
// while preserving solved local folds instead of resetting a flat template.
export function followCloth(patch,before,after,oldFrame,newFrame){
  if(!before||!oldFrame)return;
  for(let y=0;y<=patch.rows;y++)for(let x=0;x<=patch.cols;x++){
    const i=(y*(patch.cols+1)+x)*3,u=x/patch.cols,v=y/patch.rows,a=before(u,v),b=after(u,v);
    for(const field of ['p','previous']){
      const offset=rotate(V.sub(Array.from(patch[field].subarray(i,i+3)),a),oldFrame,newFrame);
      patch[field].set(V.add(b,offset),i);
    }
    patch.velocity.set(rotate(Array.from(patch.velocity.subarray(i,i+3)),oldFrame,newFrame),i);
  }
}
// Pose-conditioned recovery for this procedural AR model, not a fixed-cut
// garment simulation. Keep the same mass-density/compliance and export guard.
export function reconditionCloth(patch,at){
  const next=new ClothPatch(patch.cols,patch.rows,at,[...patch.pins],patch.params);
  for(const e of patch.edges)if(e.type==='tie')next.addTie(e.a,e.b);
  return next;
}
