// Estimated camera calibration, not a body-size measurement. Pose world points
// are inferred by MediaPipe; focal length is selected by reprojection error.
export const V = {
  add:(a,b)=>a.map((v,i)=>v+b[i]), sub:(a,b)=>a.map((v,i)=>v-b[i]),
  mul:(a,t)=>a.map(v=>v*t), dot:(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  len:a=>Math.hypot(...a), norm:a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);},
  mix:(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),
};
export function solve3(A,b) {
  const m=A.map((r,i)=>[...r,b[i]]);
  for(let k=0;k<3;k++) {
    let p=k;for(let j=k+1;j<3;j++)if(Math.abs(m[j][k])>Math.abs(m[p][k]))p=j;
    if(Math.abs(m[p][k])<1e-10)return null;
    [m[k],m[p]]=[m[p],m[k]];const d=m[k][k];for(let j=k;j<4;j++)m[k][j]/=d;
    for(let i=0;i<3;i++)if(i!==k){const t=m[i][k];for(let j=k;j<4;j++)m[i][j]-=t*m[k][j];}
  }return m.map(r=>r[3]);
}
export function fitBodyCamera(kp,W,H,focalRatio=null) {
  const S=Math.hypot(kp.rs.x-kp.ls.x,kp.rs.y-kp.ls.y),cx=W/2,cy=H/2;
  const keys=['ls','rs','lh','rh','le','re','lw','rw','n'];
  const samples=keys.filter(k=>kp[k]?.v>.4&&[kp[k].wx,kp[k].wy,kp[k].wz].every(Number.isFinite));
  if(samples.length<3) {
    const scale=S/.36,f=W*1.3,D=f/scale;
    return {f,D,tx:0,ty:0,cx,cy,error:0,estimated:false,
      world:p=>[(p.x-cx)/scale,(p.y-cy)/scale,-(p.z||0)/scale*.15],
      project:p=>[cx+p[0]*scale,cy+p[1]*scale],scale};
  }
  let best=null;
  for(const ratio of focalRatio?[focalRatio]:[.7,1,1.3,1.7,2.2,3]) {
    const f=W*ratio,A=[[0,0,0],[0,0,0],[0,0,0]],b=[0,0,0];
    for(const k of samples) {
      const p=kp[k],weight=(['ls','rs','lh','rh'].includes(k)?1:.22)*p.v;
      for(const [q,value,axis] of [[p.x-cx,p.wx,1],[p.y-cy,p.wy,2]]) {
        const row=[q,axis===1?-f:0,axis===2?-f:0],rhs=f*value-q*p.wz;
        for(let i=0;i<3;i++){b[i]+=row[i]*rhs*weight;for(let j=0;j<3;j++)A[i][j]+=row[i]*row[j]*weight;}
      }
    }
    const answer=solve3(A,b);if(!answer)continue;
    const [D,tx,ty]=answer;if(D<.25||D>15)continue;
    const project=p=>[cx+f*(p[0]+tx)/Math.max(.08,D+p[2]),cy+f*(p[1]+ty)/Math.max(.08,D+p[2])];
    let err=0,n=0;
    for(const k of samples){const p=kp[k],q=project([p.wx,p.wy,p.wz]);const w=['ls','rs','lh','rh'].includes(k)?1:.22;err+=w*((q[0]-p.x)**2+(q[1]-p.y)**2);n+=w;}
    err=Math.sqrt(err/n);
    if(!best||err<best.error)best={f,D,tx,ty,cx,cy,error:err,project,estimated:true,world:p=>[p.wx,p.wy,p.wz],scale:f/D};
  }
  if(!best)return fitBodyCamera(Object.fromEntries(Object.entries(kp).map(([k,p])=>[k,{...p,wx:undefined}])),W,H);
  return best;
}

export function bodyFrame(kp,camera) {
  const point=k=>camera.world(kp[k]);
  const ls=point('ls'),rs=point('rs'),sh=V.mix(ls,rs,.5),S=V.len(V.sub(rs,ls)),side=V.norm(V.sub(rs,ls));
  let hip=kp.lh&&kp.rh?V.mix(point('lh'),point('rh'),.5):null;
  const hipsReady=hip&&kp.lh.v>.35&&kp.rh.v>.35&&V.len(V.sub(hip,sh))>S*.5&&V.len(V.sub(hip,sh))<S*2.5;
  let down=hipsReady?V.norm(V.sub(hip,sh)):V.norm(V.sub([0,1,0],V.mul(side,side[1])));
  down=V.norm(V.sub(down,V.mul(side,V.dot(down,side))));
  const T=hipsReady?V.len(V.sub(hip,sh)):S*1.28;
  if(!hipsReady)hip=V.add(sh,V.mul(down,T));
  // Legs improve the gravity estimate for a leaning upper torso. Camera tilt is
  // not separately observable from body posture in one uncalibrated RGB image.
  let gravity=down;
  if(kp.lk?.v>.6&&kp.rk?.v>.6){const legs=V.sub(V.mix(point('lk'),point('rk'),.5),hip);if(V.len(legs)>T*.35)gravity=V.norm(legs);}
  let front=V.norm(V.cross(side,down));if(front[2]>0)front=V.mul(front,-1);
  const yaw=Math.atan2(side[2],Math.abs(side[0])||.001),pitch=Math.atan2(down[2],down[1]);
  return {sh,hip,S,T,side,down,front,gravity,hipsReady,yaw,pitch,point};
}
