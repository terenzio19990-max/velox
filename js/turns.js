/* Sentinella — manovre disegnate: frecce 3D sopra la linea blu a ogni svolta e rotonda (come Mappe e Google Maps),
   avvicinamento con la mappa che si inclina e ingrandisce l'incrocio, icone costruite sull'angolo vero della strada
   (rotonde con l'uscita giusta e le altre uscite in grigio), tratti di curve pericolose evidenziati sulla linea. */
'use strict';
const Turns = App.Turns = (()=>{
  const S=App.S;
  const TURNY=new Set([2,3,9,10,11,12,13,14,15,16,18,19,20,21,23,24,26,27]);   // manovre che meritano la freccia
  const RB=t=>t===26||t===27;
  const ptAt=(P,s)=>G.pointAt(P,Math.max(0,Math.min(P.len,s)));
  const brgAB=(P,a,b)=>{const x=ptAt(P,a),y=ptAt(P,b);return G.brg(x.lat,x.lon,y.lat,y.lon)};
  /* ---------- angoli veri dalla geometria ---------- */
  function rbExit(P,s){// fine della rotonda: dove la linea torna dritta dopo aver girato
    let turned=0,prev=brgAB(P,s,s+8);for(let x=s+6;x<s+260&&x<P.len-20;x+=4){const b1=brgAB(P,x,x+10),b2=brgAB(P,x+10,x+22);turned+=Math.abs(G.sdiff(prev,b1));prev=b1;
      if(x-s>=18&&turned>=25&&Math.abs(G.sdiff(b1,b2))<7)return x+4}return Math.min(P.len,s+45)}
  function annotate(rt,P,manA){if(!rt||!rt.man)return;P=P||G.prep(rt.coords);manA=manA||rt.man.map(m=>P.cum[Math.min(m.i,P.g.length-1)]);
    for(let k=1;k<rt.man.length;k++){const m=rt.man[k],s=manA[k];if(m._a)continue;m._a=1;
      const bin=brgAB(P,s-28,s-2),bout=brgAB(P,s+2,s+28);m._rel=G.sdiff(bin,bout);
      if(m.type===26){const nx=rt.man[k+1];const sx=nx&&nx.type===27&&manA[k+1]-s<400?manA[k+1]:rbExit(P,s);m._sx=sx;m._rb=G.sdiff(bin,brgAB(P,sx+2,sx+28));if(nx&&nx.type===27){nx._rb=m._rb;nx._sx=sx;nx._a=1;nx.exits=nx.exits||m.exits;nx._skip=true}}}}
  App.on('plan',()=>{for(const r of Plan.st.routes||[])if(r&&r.man&&!r._ann){r._ann=1;try{annotate(r)}catch(e){}}});
  /* ---------- icone ---------- */
  const W='#fff',GR='rgba(255,255,255,.32)';
  const dir=(a,l)=>[Math.sin(G.rad(a))*l,-Math.cos(G.rad(a))*l];
  function head(x,y,a,s=1){const [dx,dy]=dir(a,1);const nx=-dy,ny=dx;const tip=[x+dx*10*s,y+dy*10*s],b1=[x+nx*9*s,y+ny*9*s],b2=[x-nx*9*s,y-ny*9*s];return `<path d="M${tip}L${b1}L${b2}z" fill="${W}" stroke="${W}" stroke-width="2" stroke-linejoin="round"/>`}
  function turnIcon(rel,type){rel=Math.max(-178,Math.min(178,rel));const a=Math.abs(rel);
    if(a>=150||type===12||type===13){const right=type===12||(type!==13&&rel>0&&false);const g=`<path d="M42 60V30a10 10 0 00-20 0v16" stroke="${W}" stroke-width="7" fill="none" stroke-linecap="round"/>${head(22,44,180,1)}`;return `<svg viewBox="0 0 64 64">${right?`<g transform="translate(64 0) scale(-1 1)">${g}</g>`:g}</svg>`}
    const fork=type===23||type===24;const r=fork?(type===23?24:-24):rel;const sharp=Math.abs(r)>110;
    const X=sharp?32-Math.sign(r)*13:32,oy=sharp?16:30,len=sharp?26:20;const [ex,ey]=dir(r,len);const E=[X+ex,oy+ey];const Eb=[E[0]-dir(r,6)[0],E[1]-dir(r,6)[1]];
    const g=dir(fork?-r:0,22);const ctx=a>=22||fork?`<path d="M${X} ${oy}L${X+g[0]} ${oy+g[1]}" stroke="${GR}" stroke-width="7" stroke-linecap="round"/>`:'';
    return `<svg viewBox="0 0 64 64">${ctx}<path d="M${X} 60V${oy+4}Q${X} ${oy} ${Eb[0]} ${Eb[1]}" stroke="${W}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${head(Eb[0],Eb[1],r,sharp?0.8:1)}</svg>`}
  function rbIcon(rb,n){// entrata dal basso, giro antiorario; uscita all'angolo vero, le uscite prima in grigio
    const cx=32,cy=30,R=12;rb=rb==null?0:rb;const ang=a=>[cx+Math.sin(G.rad(a))*R,cy-Math.cos(G.rad(a))*R];
    // posizione sull'anello (0=alto, 90=destra, 180=basso): l'uscita sta nella direzione del nuovo rumbo
    const pe=Math.abs(rb)>=160?205:(rb+360)%360,pin=180;const trav=(pin-pe+360)%360||360;   // gradi percorsi in senso antiorario dal basso
    const [x0,y0]=ang(pin),[x1,y1]=ang(pe);const large=trav>180?1:0;
    let stubs='';if(n>1)for(let j=1;j<n;j++){const a=pin-trav*j/n;const [sx,sy]=ang(a),[ox,oy]=[cx+Math.sin(G.rad(a))*(R+11),cy-Math.cos(G.rad(a))*(R+11)];stubs+=`<path d="M${sx} ${sy}L${ox} ${oy}" stroke="${GR}" stroke-width="5" stroke-linecap="round"/>`}
    const [ox,oy]=[cx+Math.sin(G.rad(pe))*(R+13),cy-Math.cos(G.rad(pe))*(R+13)];
    return `<svg viewBox="0 0 64 64"><circle cx="${cx}" cy="${cy}" r="${R}" stroke="${GR}" stroke-width="6" fill="none"/>${stubs}
      <path d="M32 60V${y0}A${R} ${R} 0 ${large} 0 ${x1} ${y1}L${ox} ${oy}" stroke="${W}" stroke-width="6.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${head(ox,oy,pe,0.85)}
      ${n?`<text x="${cx}" y="${cy+4.5}" text-anchor="middle" font-size="13" font-weight="800" fill="${W}" font-family="-apple-system,system-ui">${n}</text>`:''}</svg>`}
  function icon(m){if(!m||!m._a)return null;if(RB(m.type))return rbIcon(m._rb,m.exits);if(!TURNY.has(m.type))return null;if(Math.abs(m._rel)<10&&m.type!==23&&m.type!==24)return null;return turnIcon(m._rel,m.type)}
  /* ---------- freccia 3D sulla mappa: esce dalla strada, fluttua, scia di luce e onda sul punto di svolta ---------- */
  const EMPTY={type:'FeatureCollection',features:[]};let shown='',listKey='';
  const RM=matchMedia('(prefers-reduced-motion: reduce)');
  const fx=()=>S.manFx!==false&&!RM.matches;
  const sym=()=>['tuts-line','cams-dot','pois-ic'].find(id=>MapView.map.getLayer(id));
  function layers(){const map=MapView.map;if(!map||!MapView.ready)return false;if(map.getLayer('man-top'))return true;
    for(const id of ['manArrow','curveSeg','manPt'])if(!map.getSource(id))map.addSource(id,{type:'geojson',data:EMPTY});
    if(!map.getSource('manPath'))map.addSource('manPath',{type:'geojson',data:EMPTY,lineMetrics:true});
    const before=map.getLayer('route-case')?'route-case':undefined,b=sym();
    if(!map.getLayer('curve-glow'))map.addLayer({id:'curve-glow',type:'line',source:'curveSeg',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':['case',['get','hair'],'#FF3B30','#FF9500'],'line-width':['interpolate',['linear'],['zoom'],10,9,16,24],'line-opacity':0.75,'line-blur':1.5}},before);
    map.addLayer({id:'man-glow',type:'line',source:'manPath',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#22D3EE','line-width':['interpolate',['exponential',1.6],['zoom'],13,14,17,46,19,110],'line-blur':['interpolate',['linear'],['zoom'],13,6,17,18],'line-opacity':0}},b);
    map.addLayer({id:'man-shadow',type:'fill',source:'manArrow',filter:['==',['get','k'],'slab'],paint:{'fill-color':'#04131F','fill-opacity':0}},b);
    map.addLayer({id:'man-flow',type:'line',source:'manPath',layout:{'line-join':'round','line-cap':'round'},paint:{'line-width':['interpolate',['exponential',1.6],['zoom'],13,4,17,13,19,30],'line-blur':2,'line-gradient':'rgba(0,0,0,0)'}},b);
    map.addLayer({id:'man-ring',type:'circle',source:'manPt',paint:{'circle-radius':0,'circle-color':'rgba(34,211,238,0.12)','circle-stroke-color':'#22D3EE','circle-stroke-width':2.5,'circle-opacity':0,'circle-stroke-opacity':0,'circle-pitch-alignment':'map','circle-pitch-scale':'viewport'}},b);
    map.addLayer({id:'man-slab',type:'fill-extrusion',source:'manArrow',filter:['==',['get','k'],'slab'],paint:{'fill-extrusion-color':'#0B3E8A','fill-extrusion-height':0,'fill-extrusion-base':0,'fill-extrusion-opacity':0.95,'fill-extrusion-vertical-gradient':true}},b);
    map.addLayer({id:'man-top',type:'fill-extrusion',source:'manArrow',filter:['==',['get','k'],'top'],paint:{'fill-extrusion-color':'#FFFFFF','fill-extrusion-height':0,'fill-extrusion-base':0,'fill-extrusion-opacity':1,'fill-extrusion-vertical-gradient':true}},b);
    return true}
  App.on('mapReady',()=>{shown='';listKey='';if(Nav.active)setTimeout(()=>{curves();draw(true)},200)});
  // ricampiona e smussa il tratto (curve morbide come le frecce di Mappe)
  function path(P,s0,s1){const out=[];const st=Math.max(2,(s1-s0)/45);for(let s=s0;s<=s1;s+=st){const q=ptAt(P,s);out.push([q.lat,q.lon])}const e=ptAt(P,s1);out.push([e.lat,e.lon]);
    let c=out;for(let it=0;it<2;it++){const n=[c[0]];for(let i=0;i<c.length-1;i++){const a=c[i],b=c[i+1];n.push([a[0]*0.75+b[0]*0.25,a[1]*0.75+b[1]*0.25],[a[0]*0.25+b[0]*0.75,a[1]*0.25+b[1]*0.75])}n.push(c[c.length-1]);c=n}return c}
  // primo tratto del percorso fino alla frazione p (per la freccia che «si disegna»)
  function partial(pts,p){if(p>=1)return pts;const d=[0];for(let i=1;i<pts.length;i++)d.push(d[i-1]+G.dist(pts[i-1][0],pts[i-1][1],pts[i][0],pts[i][1]));const L=d[d.length-1]*p;const out=[pts[0]];
    for(let i=1;i<pts.length;i++){if(d[i]<L){out.push(pts[i]);continue}const t=(L-d[i-1])/Math.max(1e-6,d[i]-d[i-1]);out.push([pts[i-1][0]+(pts[i][0]-pts[i-1][0])*t,pts[i-1][1]+(pts[i][1]-pts[i-1][1])*t]);break}return out}
  const plen=pts=>{let l=0;for(let i=1;i<pts.length;i++)l+=G.dist(pts[i-1][0],pts[i-1][1],pts[i][0],pts[i][1]);return l};
  // nastro con punta: poligono in metri locali → lon/lat
  function ribbon(pts,w,headL,headW){const o=pts[0],kx=111320*Math.cos(G.rad(o[0])),ky=111320;const L=pts.map(p=>[(p[1]-o[1])*kx,(p[0]-o[0])*ky]);
    let rem=headL,end=L.length-1;while(end>1){const d=Math.hypot(L[end][0]-L[end-1][0],L[end][1]-L[end-1][1]);if(d>=rem){const t=rem/d;L[end]=[L[end][0]+(L[end-1][0]-L[end][0])*t,L[end][1]+(L[end-1][1]-L[end][1])*t];break}rem-=d;L.pop();end--}
    const tipBase=L[L.length-1];const tipDir=(()=>{const a=L[L.length-2],b=L[L.length-1];const d=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return [(b[0]-a[0])/d,(b[1]-a[1])/d]})();
    const left=[],right=[],h=w/2;
    for(let i=0;i<L.length;i++){const a=L[Math.max(0,i-1)],b=L[Math.min(L.length-1,i+1)];let dx=b[0]-a[0],dy=b[1]-a[1];const d=Math.hypot(dx,dy)||1;dx/=d;dy/=d;left.push([L[i][0]-dy*h,L[i][1]+dx*h]);right.push([L[i][0]+dy*h,L[i][1]-dx*h])}
    const nx=-tipDir[1],ny=tipDir[0];const tip=[tipBase[0]+tipDir[0]*headL,tipBase[1]+tipDir[1]*headL];
    const ring=left.concat([[tipBase[0]+nx*headW/2,tipBase[1]+ny*headW/2],tip,[tipBase[0]-nx*headW/2,tipBase[1]-ny*headW/2]],right.reverse());ring.push(ring[0]);
    return ring.map(p=>[o[1]+p[0]/kx,o[0]+p[1]/ky])}
  function mPerPx(lat){return 78271.517*Math.cos(G.rad(lat))/2**MapView.map.getZoom()}
  // geometria di una freccia (tratto completo, larghezza, punto di svolta)
  function arrowGeo(P,manA,rt,k,lat){const m=rt.man[k],s=manA[k];const mp=mPerPx(lat);const w=Math.max(3,Math.min(18,11*mp));
    const pre=Math.max(30,Math.min(90,70*mp*1.2));let s0=s-pre,s1;
    if(m.type===26)s1=(m._sx||s+40)+Math.max(18,w*5);else s1=s+Math.max(22,Math.min(60,w*7));s0=Math.max(0,s0);s1=Math.min(P.len,s1);if(s1-s0<15)return null;
    const q=ptAt(P,s);return {pts:path(P,s0,s1),w,at:[q.lon,q.lat]}}
  function feats(A,p){const fs=[],paths=[],pts=[];for(const a of A){const pp=partial(a.pts,p);const w=a.w,hl=w*2.1,hw=w*2.6;if(pp.length<2||plen(pp)<hl*1.4)continue;
      fs.push({type:'Feature',properties:{k:'slab',w},geometry:{type:'Polygon',coordinates:[ribbon(pp,w*1.32,hl*1.12,hw*1.22)]}},{type:'Feature',properties:{k:'top',w},geometry:{type:'Polygon',coordinates:[ribbon(pp,w,hl,hw)]}});
      paths.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:pp.map(x=>[x[1],x[0]])}});pts.push({type:'Feature',properties:{},geometry:{type:'Point',coordinates:a.at}})}
    return {fs,paths,pts}}
  function publish(A,p){const map=MapView.map,f=feats(A,p);map.getSource('manArrow').setData({type:'FeatureCollection',features:f.fs});map.getSource('manPath').setData({type:'FeatureCollection',features:f.paths});map.getSource('manPt').setData({type:'FeatureCollection',features:f.pts});return f.fs.length}
  let st=null,cur=null,anim={t0:0,on:false},raf=0,lastF=0;
  App.on('navMan',x=>{st=x;draw(false)});
  function draw(force){if(!st||!MapView.map)return;if(!layers())return;const {k,dist,spd,P,manA,rt}=st;const m=rt.man[k];
    // avvicinamento: inclino e ingrandisco quando la svolta è vicina
    const near=TURNY.has(m.type)&&!m._skip&&(RB(m.type)||Math.abs(m._rel||90)>=25);const zone=Math.max(140,Math.min(450,(spd||0)*11));
    if(S.manZoom!==false&&near&&dist<zone&&dist>3&&(spd||0)<31)MapView.setBoost(0.75*(1-dist/zone)+0.35,10);else MapView.setBoost(0,0);
    if(S.manArrows===false){if(shown){shown='';listKey='';cur=null;publish([],1);stopAnim()}return}
    const z=Math.round(MapView.map.getZoom()*4)/4;const list=[];if(TURNY.has(m.type)&&dist<2500)list.push(k);
    const k2=k+1,m2=rt.man[k2];if(m2&&TURNY.has(m2.type)&&manA[k2]-manA[k]<450)list.push(k2);
    const lk=list.join(',')+'|'+rt.dist,key=lk+'|'+z;if(!force&&key===shown)return;shown=key;
    const lat=P.g[0][0];const A=[];for(const j of list){const mm=rt.man[j];if(mm._skip)continue;if(!RB(mm.type)&&Math.abs(mm._rel||90)<12&&mm.type!==23&&mm.type!==24)continue;const g=arrowGeo(P,manA,rt,j,lat);if(g)A.push(g)}
    const isNew=lk!==listKey;listKey=lk;cur=A.length?{A,dist,spd}:null;
    if(!cur){publish([],1);stopAnim();return}
    if(isNew&&fx()){anim={t0:performance.now(),on:true};publish(A,0.02)}else publish(A,anim.on&&performance.now()-anim.t0<520?Math.min(1,(performance.now()-anim.t0)/520):1);
    style();startAnim()}
  App.on('navMan',x=>{if(cur){cur.dist=x.dist;cur.spd=x.spd}});
  function style(){const map=MapView.map;if(!map||!map.getLayer('man-top'))return;const F=fx();
    map.setPaintProperty('man-slab','fill-extrusion-color',F?'#0891B2':'#0B3E8A');map.setPaintProperty('man-top','fill-extrusion-color',F?'#ECFEFF':'#FFFFFF');
    if(!F){for(const [l,pr,v] of [['man-glow','line-opacity',0],['man-shadow','fill-opacity',0],['man-ring','circle-opacity',0],['man-ring','circle-stroke-opacity',0],['man-flow','line-gradient','rgba(0,0,0,0)']])map.setPaintProperty(l,pr,v);
      map.setPaintProperty('man-slab','fill-extrusion-base',0);map.setPaintProperty('man-slab','fill-extrusion-height',['*',['get','w'],0.06]);
      map.setPaintProperty('man-top','fill-extrusion-base',0);map.setPaintProperty('man-top','fill-extrusion-height',['*',['get','w'],0.55]);map.setPaintProperty('man-top','fill-extrusion-opacity',1)}}
  function stopAnim(){cancelAnimationFrame(raf);raf=0;anim.on=false}
  function startAnim(){if(raf||!fx())return;raf=requestAnimationFrame(frame)}
  const spring=t=>t<=0?0:1-Math.exp(-5.5*t)*Math.cos(8.5*t);
  function frame(now){raf=0;if(!cur||!Nav.active||!fx()||!MapView.map||!MapView.map.getLayer('man-top')){style();return}raf=requestAnimationFrame(frame);
    if(document.hidden||now-lastF<33||document.body.classList.contains('hudon'))return;lastF=now;const map=MapView.map;const t=(now-anim.t0)/1000;
    // 1) la freccia si disegna dalla strada verso la punta
    if(anim.on&&t<0.6){publish(cur.A,Math.min(1,1-Math.pow(1-t/0.52,3)))}else if(anim.on){anim.on=false;publish(cur.A,1)}
    // 2) esce dalla strada con un rimbalzo e sale man mano che ti avvicini, poi fluttua
    const E=Math.max(0,spring(t-0.08));const far=Math.max(260,(cur.spd||10)*18),near=Math.max(60,(cur.spd||10)*5);
    const a=Math.max(0,Math.min(1,(far-cur.dist)/(far-near)));const bob=0.07*Math.sin(now/1000*2*Math.PI/1.9)*Math.min(1,t);
    const L=Math.max(0,E*(0.22+1.25*a)+bob),th1=0.36*Math.min(1.05,E),th2=0.72*Math.min(1.05,E);
    map.setPaintProperty('man-slab','fill-extrusion-base',['*',['get','w'],L]);map.setPaintProperty('man-slab','fill-extrusion-height',['*',['get','w'],L+th1]);
    map.setPaintProperty('man-top','fill-extrusion-base',['*',['get','w'],L+th1]);map.setPaintProperty('man-top','fill-extrusion-height',['*',['get','w'],L+th2]);
    map.setPaintProperty('man-top','fill-extrusion-opacity',Math.min(1,t*5));map.setPaintProperty('man-slab','fill-extrusion-opacity',Math.min(0.92,t*5));
    // 3) ombra e alone sulla strada, che respirano
    const pulse=0.5+0.5*Math.sin(now/1000*2*Math.PI/1.4);
    map.setPaintProperty('man-shadow','fill-opacity',Math.min(0.32,E*0.32)*(1-0.35*a));map.setPaintProperty('man-glow','line-opacity',Math.min(1,t*3)*(0.28+0.22*pulse));
    // 4) scia di luce che corre verso la punta
    const ph=((now-anim.t0)/1150)%1;const C=x=>`rgba(103,232,249,${x})`;const stops=[[0,C(0)],[Math.max(0.001,ph-0.22),C(0)],[Math.max(0.002,ph-0.08),C(0.55)],[Math.max(0.003,ph),'rgba(255,255,255,0.95)'],[Math.min(0.999,ph+0.035),C(0)],[1,C(0)]];
    const g=['interpolate',['linear'],['line-progress']];let lastP=-1;for(const [p,c] of stops){const q=Math.max(p,lastP+0.0005);if(q>1)break;g.push(q,c);lastP=q}map.setPaintProperty('man-flow','line-gradient',g);
    // 5) onda sul punto di svolta
    const r=((now-anim.t0)/1600)%1;map.setPaintProperty('man-ring','circle-radius',8+r*62*(0.6+0.4*a));map.setPaintProperty('man-ring','circle-stroke-opacity',(1-r)*0.9*Math.min(1,t*2));map.setPaintProperty('man-ring','circle-opacity',(1-r)*0.8*Math.min(1,t*2))}
  setInterval(()=>{if(st&&Nav.active&&MapView.map&&MapView.map.getSource('manArrow'))draw(false)},700);
  App.on('settings',()=>{shown='';listKey='';if(st&&Nav.active){draw(true);style()}});
  App.on('navEnd',()=>{st=null;cur=null;shown='';listKey='';stopAnim();MapView.setBoost(0,0);const m=MapView.map;if(m&&m.getSource('manArrow')){publish([],1);m.getSource('curveSeg').setData(EMPTY)}});
  // tratti di curve pericolose evidenziati sotto la linea blu
  function curves(){const r=Nav.route;if(!r||!layers())return;const an=r._an;if(!an||S.hzCurves===false){MapView.map.getSource('curveSeg').setData(EMPTY);return}
    const fs=an.curves.filter(c=>c.danger).map(c=>{const i0=G.idxAt(an.P,c.a-10),i1=G.idxAt(an.P,c.b+10)+1;return {type:'Feature',properties:{hair:!!c.hair},geometry:{type:'LineString',coordinates:an.P.g.slice(i0,i1+1).map(p=>[p[1],p[0]])}}});
    MapView.map.getSource('curveSeg').setData({type:'FeatureCollection',features:fs})}
  App.on('navStart',()=>setTimeout(curves,400));App.on('navReroute',()=>{shown='';setTimeout(curves,400)});App.on('settings',()=>{shown='';if(Nav.active)curves()});
  return {annotate,icon,rbIcon,turnIcon,draw:()=>draw(true)};
})();
