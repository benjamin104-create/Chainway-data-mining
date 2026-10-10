// Camera-native, viewport-bounded effects. No camera shake or strobe flashes.
export const ULTIMATE_SECONDS=2.8;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const jokes={saya:['鞘之奧義','拔鞘一閃'],flyswatter:['拍之奧義','蚊蟲退散'],duster:['撢之奧義','塵世斷絕'],catwand:['喵之奧義','喵之誘惑']};
export function ultimateName(ch,weapon){return jokes[weapon]||['終之奧義',ch.move.name.split('・').at(-1)];}
export function ultimateLayout(W,H,kp){
  return {cx:clamp((kp.ls.x+kp.rs.x)/2,W*.30,W*.70),cy:clamp((kp.ls.y+kp.rs.y)/2+W*.22,H*.46,H*.66),radius:Math.min(W*.46,H*.29),titleY:H*.75};
}
export function fitPropScale(b,T,W,H,reach){
  const padX=W*.07,padY=Math.min(90,H*.13),dx=b.dir.x,dy=b.dir.y;
  let room=Infinity;
  if(Math.abs(dx)>.05)room=Math.min(room,dx>0?(W-padX-b.grip.x)/dx:(b.grip.x-padX)/-dx);
  if(Math.abs(dy)>.05)room=Math.min(room,dy>0?(H-H*.18-b.grip.y)/dy:(b.grip.y-padY)/-dy);
  return Math.max(T*.20,Math.min(T,room/Math.max(.1,reach+.16)));
}
export function drawUltimate(ctx,W,H,ch,kp,t,weapon='own',reduceMotion=false){
  if(t<0||t>=ULTIMATE_SECONDS)return;
  const {cx,cy,radius:R,titleY}=ultimateLayout(W,H,kp),[tag,name]=ultimateName(ch,weapon);
  const time=reduceMotion?.72:t,fade=Math.min(1,t*8,(ULTIMATE_SECONDS-t)*2.5),attack=clamp(time/.55,0,1);
  ctx.save();ctx.globalAlpha=fade;ctx.lineCap='round';ctx.lineJoin='round';
  // Dark edge contrast leaves the face and center of the camera readable.
  const vignette=ctx.createRadialGradient(cx,cy,R*.25,cx,cy,Math.max(W,H)*.75);vignette.addColorStop(0,'#0000');vignette.addColorStop(1,'#080b18a8');ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
  ctx.strokeStyle=ch.glow;ctx.lineWidth=Math.max(1,W*.003);ctx.globalAlpha=fade*.38;
  for(let i=0;i<36;i++){
    const a=i*Math.PI*2/36,r=R*(1.25+(i%4)*.12);ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);ctx.lineTo(cx+Math.cos(a)*Math.max(W,H),cy+Math.sin(a)*Math.max(W,H));ctx.stroke();
  }
  // Attribute ribbon encircles the torso instead of expanding offscreen with T.
  const a0=Math.atan2(ch.move.blade[1],ch.move.blade[0])-.45+time*.12,a1=a0+Math.PI*2*attack;
  ctx.globalAlpha=fade;ctx.shadowColor=ch.tint;ctx.shadowBlur=Math.min(26,W*.055);
  for(let layer=0;layer<3;layer++){
    ctx.strokeStyle=layer===2?'#fffdf0':layer===1?ch.glow:ch.tint;ctx.lineWidth=W*[.065,.033,.012][layer];ctx.beginPath();
    for(let i=0;i<=64;i++){const a=a0+(a1-a0)*i/64,rr=R*(.91+layer*.025)+Math.sin(a*5-time*3)*W*.022,x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr*.73;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();
  }
  for(let i=0;i<24;i++){
    const a=i*Math.PI*2/24+time*.25,r=R*(.95+(i%3)*.08),x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r*.79;
    if(y<kp.n.y+W*.13&&Math.abs(x-kp.n.x)<W*.23)continue; // Don't paint the eyes.
    ctx.strokeStyle=i%2?ch.glow:ch.tint;ctx.fillStyle=ch.glow;ctx.lineWidth=W*.009;
    if(ch.fx==='thunder'){
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*W*.07,y+Math.sin(a)*W*.07);ctx.lineTo(x+Math.cos(a+.35)*W*.12,y+Math.sin(a+.35)*W*.12);ctx.lineTo(x+Math.cos(a)*W*.18,y+Math.sin(a)*W*.18);ctx.stroke();
    }else if(ch.fx==='flame'){
      ctx.beginPath();ctx.moveTo(x,y-W*.08);ctx.quadraticCurveTo(x+W*.035,y,x,y+W*.025);ctx.quadraticCurveTo(x-W*.035,y,x,y-W*.08);ctx.fill();
    }else if(ch.fx==='wave'||ch.fx==='moon'){
      ctx.beginPath();ctx.arc(x,y,W*(.018+(i%3)*.009),a,a+Math.PI*1.4);ctx.stroke();
    }else{ctx.beginPath();ctx.arc(x,y,W*.007+(i%3)*W*.002,0,Math.PI*2);ctx.fill();}
  }
  // Large type sits below the face, with measurable width fitting for phones.
  const plate=ctx.createLinearGradient(0,titleY-W*.10,0,titleY+W*.14);plate.addColorStop(0,'#05060a00');plate.addColorStop(.45,'#05060acc');plate.addColorStop(1,'#05060a00');ctx.fillStyle=plate;ctx.fillRect(0,titleY-W*.1,W,W*.27);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowBlur=W*.025;ctx.shadowColor=ch.tint;
  ctx.font=`900 ${W*.045}px "Noto Serif TC",serif`;ctx.fillStyle=ch.glow;ctx.fillText(tag,cx,titleY-W*.09);
  let size=Math.min(W*.145,H*.078);ctx.font=`900 ${size}px "Noto Serif TC",serif`;size*=Math.min(1,W*.88/Math.max(1,ctx.measureText(name).width));ctx.font=`900 ${size}px "Noto Serif TC",serif`;
  ctx.lineWidth=size*.10;ctx.strokeStyle='#080909';ctx.strokeText(name,W/2,titleY);ctx.fillStyle='#fffbed';ctx.fillText(name,W/2,titleY);
  ctx.font=`700 ${W*.03}px sans-serif`;ctx.fillStyle=ch.glow;ctx.fillText(jokes[weapon]?'搞笑武器也有自己的必殺技':'劍意覺醒 · 絕技發動',W/2,titleY+W*.10);
  ctx.restore();
}
