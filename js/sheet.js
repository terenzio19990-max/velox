/* Sentinella — pannello inferiore con fermi (detent), trascinamento 1:1, molla critica e proiezione del gesto. */
'use strict';
const Sheet = App.Sheet = (()=>{
  const el=$('#sheet'),sc=$('#sheetScroll');
  let H=0,full=0,y=0,v=0,target=0,raf=0,cur='peek',dragging=false,lastT=0;
  const det={peek:118,half:0.5,full:1};
  const cbs=[];
  let hiddenMode=false;
  const sb=()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sbpx'))||0;
  function measure(){H=window.innerHeight;full=el.getBoundingClientRect().height||H*0.95}
  function visFor(name){if(name==='hidden')return 0;const d=det[name];if(name==='peek')return d+safeB();if(d<=1)return Math.round(full*d);return d}
  function safeB(){const t=document.createElement('div');t.style.cssText='position:fixed;bottom:0;height:env(safe-area-inset-bottom,0px)';document.body.appendChild(t);const h=t.getBoundingClientRect().height;t.remove();return h}
  let SB=0;
  function yFor(name){return full-visFor(name)}
  function apply(){el.style.transform=`translate3d(0,${y}px,0)`;const vis=full-y;
    document.documentElement.style.setProperty('--sheet-h',Math.max(0,vis)+'px');
    for(const f of cbs)f(vis,y)}
  function step(t){const dt=Math.min(0.032,(t-lastT)/1000||0.016);lastT=t;
    const resp=0.34,zeta=dragging?1:currentZeta;const k=(2*Math.PI/resp)**2,c=2*zeta*Math.sqrt(k);
    const a=-k*(y-target)-c*v;v+=a*dt;y+=v*dt;
    if(Math.abs(y-target)<0.4&&Math.abs(v)<4){y=target;v=0;apply();raf=0;return}
    apply();raf=requestAnimationFrame(step)}
  let currentZeta=1;
  function animateTo(ty,vel=0,zeta=1){target=ty;v=vel;currentZeta=zeta;if(matchMedia('(prefers-reduced-motion: reduce)').matches){y=ty;v=0;apply();return}
    if(!raf){lastT=performance.now();raf=requestAnimationFrame(step)}}
  function set(name,anim=true){if(!(name in det)&&name!=='hidden')return;cur=name;measure();const ty=name==='hidden'?full+20:yFor(name);
    el.classList.toggle('peek',name==='peek');sc.style.overflowY=name==='full'?'auto':'hidden';
    if(!anim){y=ty;v=0;target=ty;apply()}else animateTo(ty);App.emit('sheet',name)}
  // proiezione del momento (funzione di Apple)
  const project=(vel,dr=0.998)=>(vel/1000)*dr/(1-dr);
  function nearest(py){const names=Object.keys(det).filter(n=>!(n==='half'&&App.state.noHalf));let best=names[0],bd=1e9;for(const n of names){const d=Math.abs(yFor(n)-py);if(d<bd){bd=d;best=n}}return best}
  function rubber(over,dim,c=0.55){return (over*dim*c)/(dim+c*Math.abs(over))}
  // gestione tocchi
  let sy=0,y0=0,hist=[],mode=null,startScroll=0;
  function onStart(e){if(hiddenMode)return;const p=e.touches?e.touches[0]:e;sy=p.clientY;y0=y;hist=[[performance.now(),p.clientY]];mode=null;startScroll=sc.scrollTop;
    if(raf){cancelAnimationFrame(raf);raf=0;v=0}}
  function onMove(e){if(hiddenMode||sy==null)return;const p=e.touches?e.touches[0]:e;const dy=p.clientY-sy;
    if(!mode){if(Math.abs(dy)<6)return;const inScroll=sc.contains(e.target);
      if(cur==='full'&&inScroll&&(sc.scrollTop>0||dy<0))mode='scroll';else mode='drag'}
    if(mode==='scroll'){if(sc.scrollTop<=0&&dy>0&&cur==='full'&&startScroll<=0){mode='drag';sy=p.clientY;y0=y}else return}
    if(e.cancelable)e.preventDefault();dragging=true;
    let ny=y0+(p.clientY-sy);const top=yFor('full'),bot=yFor('peek');
    if(ny<top)ny=top-rubber(top-ny,H);else if(ny>bot)ny=bot+rubber(ny-bot,H)*0.9;
    y=ny;apply();hist.push([performance.now(),p.clientY]);if(hist.length>6)hist.shift()}
  function onEnd(){if(sy==null)return;const was=mode;sy=null;if(was!=='drag'){dragging=false;return}dragging=false;
    let vel=0;if(hist.length>1){const a=hist[0],b=hist[hist.length-1];const dt=(b[0]-a[0])/1000;if(dt>0)vel=(b[1]-a[1])/dt}
    const proj=y+project(vel);const n=nearest(proj);cur=n;el.classList.toggle('peek',n==='peek');sc.style.overflowY=n==='full'?'auto':'hidden';
    animateTo(yFor(n),vel,Math.abs(vel)>900?0.86:1);App.emit('sheet',n)}
  el.addEventListener('touchstart',onStart,{passive:true});
  el.addEventListener('touchmove',onMove,{passive:false});
  el.addEventListener('touchend',onEnd);el.addEventListener('touchcancel',onEnd);
  // mouse (desktop): solo dal manico
  $('#grabber').addEventListener('mousedown',e=>{onStart(e);const mm=ev=>onMove(ev),mu=()=>{onEnd();removeEventListener('mousemove',mm);removeEventListener('mouseup',mu)};addEventListener('mousemove',mm);addEventListener('mouseup',mu)});
  $('#grabber').addEventListener('click',()=>{if(dragging)return;set(cur==='peek'?'half':cur==='half'?'full':'peek')});
  addEventListener('resize',()=>{measure();set(cur,false)});
  measure();
  return {
    set,get cur(){return cur},onMove(f){cbs.push(f)},
    setPeek(px){det.peek=px;if(cur==='peek')set('peek')},
    hide(h){hiddenMode=h;if(h)set('hidden');},
    visible(){return full-y}
  };
})();
