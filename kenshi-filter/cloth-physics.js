// XPBD distance constraints, SI units. Bend is a two-hop distance approximation,
// not a measured textile constitutive law. No fabric/self-collision claim.
// Reference: https://mmacklin.com/xpbd.pdf (Macklin, Müller, Chentanez, 2016).
export const COTTON_PRESET=Object.freeze({density:.18,gravity:9.81,stretchCompliance:2e-7,
  shearCompliance:6e-7,bendCompliance:2e-2,damping:2.5,dt:1/120,iterations:20,stretchLimit:.025});
const len=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export class ClothPatch {
  constructor(cols,rows,pointAt,pins=[],params={}) {
    this.cols=cols;this.rows=rows;this.params={...COTTON_PRESET,...params};
    const n=(cols+1)*(rows+1);this.p=new Float64Array(n*3);this.previous=new Float64Array(n*3);this.velocity=new Float64Array(n*3);
    this.mass=new Float64Array(n);this.invMass=new Float64Array(n);this.edges=[];this.indices=[];this.pins=new Set(pins);this.targets=new Map();
    const idx=(x,y)=>y*(cols+1)+x;
    for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++)this.p.set(pointAt(x/cols,y/rows),idx(x,y)*3);
    this.previous.set(this.p);
    const vertex=i=>this.p.subarray(i*3,i*3+3);
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++) {
      const a=idx(x,y),b=idx(x+1,y),c=idx(x,y+1),d=idx(x+1,y+1);
      this.indices.push(a,c,b,b,c,d);
      for(const tri of [[a,c,b],[b,c,d]]){
        const A=vertex(tri[0]),B=vertex(tri[1]),C=vertex(tri[2]),u=B.map((v,k)=>v-A[k]),v=C.map((v,k)=>v-A[k]);
        const area=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])*.5;
        for(const i of tri)this.mass[i]+=area*this.params.density/3;
      }
    }
    for(let i=0;i<n;i++)this.invMass[i]=this.pins.has(i)?0:1/Math.max(1e-6,this.mass[i]);
    const add=(a,b,type)=>this.edges.push({a,b,type,rest:len(vertex(a),vertex(b)),lambda:0,
      compliance:this.params[type+'Compliance']});
    for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){
      if(x<cols)add(idx(x,y),idx(x+1,y),'stretch');if(y<rows)add(idx(x,y),idx(x,y+1),'stretch');
      if(x<cols&&y<rows){add(idx(x,y),idx(x+1,y+1),'shear');add(idx(x+1,y),idx(x,y+1),'shear');}
      if(x+2<=cols)add(idx(x,y),idx(x+2,y),'bend');if(y+2<=rows)add(idx(x,y),idx(x,y+2),'bend');
    }
    if(params.seamClosed)for(let y=0;y<=rows;y++)this.edges.push({a:idx(0,y),b:idx(cols,y),type:'seam',rest:0,lambda:0,compliance:0});
    this.structural=this.edges.filter(e=>e.type==='stretch');this.seams=this.edges.filter(e=>e.type==='seam');
    for(const i of pins)this.targets.set(i,Array.from(vertex(i)));
    this.totalMass=this.mass.reduce((a,b)=>a+b,0);this.age=0;
  }
  setTarget(i,p){this.targets.set(i,p.slice());}
  addTie(a,b,slack=1.04){this.edges.push({a,b,type:'tie',rest:len(this.p.subarray(a*3,a*3+3),this.p.subarray(b*3,b*3+3))*slack,lambda:0,compliance:2e-6});}
  step(gravity=[0,9.81,0],collide=null,dt=this.params.dt) {
    const {p,previous,velocity,invMass,edges}=this,damp=Math.exp(-this.params.damping*dt);previous.set(p);
    for(let i=0;i<invMass.length;i++)if(invMass[i])for(let k=0;k<3;k++){
      velocity[i*3+k]=velocity[i*3+k]*damp+gravity[k]*dt;p[i*3+k]+=velocity[i*3+k]*dt;
    }
    for(const e of edges)e.lambda=0;
    for(let it=0;it<this.params.iterations;it++){
      for(const [i,t] of this.targets)p.set(t,i*3);
      for(const e of edges){
        const a=e.a*3,b=e.b*3,dx=p[a]-p[b],dy=p[a+1]-p[b+1],dz=p[a+2]-p[b+2],L=Math.hypot(dx,dy,dz);
        if(e.type==='tie'&&L<=e.rest){e.lambda=0;continue;}
        const alpha=e.compliance/(dt*dt),wa=invMass[e.a],wb=invMass[e.b];if(L<1e-8||wa+wb===0)continue;
        const dl=(-(L-e.rest)-alpha*e.lambda)/(wa+wb+alpha);e.lambda+=dl;
        const ca=wa*dl/L,cb=wb*dl/L;
        p[a]+=ca*dx;p[a+1]+=ca*dy;p[a+2]+=ca*dz;p[b]-=cb*dx;p[b+1]-=cb*dy;p[b+2]-=cb*dz;
      }
      if(collide)for(let i=0;i<invMass.length;i++)if(invMass[i])collide(p,i*3);
    }
    for(const [i,t] of this.targets)p.set(t,i*3);
    // Inelastic strain-limiting inequality. Unlike a visual scale clamp this
    // moves the cloth particles, so normals, folds and velocities stay coupled.
    // 2.5% is a prototype guard, not a measured textile yield strain.
    const structural=this.structural,limit=this.params.stretchLimit;
    for(let pass=0;pass<(this.params.strainPasses??24);pass++){
      let worst=0;
      for(let j=0;j<structural.length;j++){
        const e=structural[pass%2?structural.length-1-j:j],a=e.a*3,b=e.b*3;
        const dx=p[a]-p[b],dy=p[a+1]-p[b+1],dz=p[a+2]-p[b+2],L=Math.hypot(dx,dy,dz),max=e.rest*(1+limit),w=invMass[e.a]+invMass[e.b];
        if(L<=max||w===0)continue;worst=Math.max(worst,L/(e.rest||1)-1);
        const d=(L-max)/(L*w),ca=invMass[e.a]*d,cb=invMass[e.b]*d;
        p[a]-=ca*dx;p[a+1]-=ca*dy;p[a+2]-=ca*dz;p[b]+=cb*dx;p[b+1]+=cb*dy;p[b+2]+=cb*dz;
      }
      for(const e of this.seams){const a=e.a*3,b=e.b*3,wa=invMass[e.a],wb=invMass[e.b],w=wa+wb;if(!w)continue;
        for(let k=0;k<3;k++){const d=p[b+k]-p[a+k];p[a+k]+=d*wa/w;p[b+k]-=d*wb/w;}}
      if(worst<limit+.002)break;
    }
    for(let i=0;i<invMass.length;i++)for(let k=0;k<3;k++)velocity[i*3+k]=invMass[i]?(p[i*3+k]-previous[i*3+k])/dt:0;
    this.age+=dt;
  }
  audit(){
    let maxStretch=0,meanStretch=0,n=0,speed=0,finite=true;
    for(const e of this.edges)if(e.type==='stretch'){
      const L=len(this.p.subarray(e.a*3,e.a*3+3),this.p.subarray(e.b*3,e.b*3+3));const strain=Math.max(0,L/(e.rest||1)-1);
      maxStretch=Math.max(maxStretch,strain);meanStretch+=strain;n++;
    }
    for(let i=0;i<this.p.length;i++)finite&&=Number.isFinite(this.p[i]);
    for(let i=0;i<this.velocity.length;i+=3)speed=Math.max(speed,Math.hypot(...this.velocity.subarray(i,i+3)));
    return {massKg:this.totalMass,maxStretch,meanStretch:meanStretch/(n||1),maxSpeed:speed,finite,age:this.age};
  }
}
