// Elaborazione dati OSM (Overpass) -> formato compatto Sentinella. Usato dall'app e dallo script di aggiornamento.
(function(G){
'use strict';
const R=6371000,rad=d=>d*Math.PI/180,deg=r=>r*180/Math.PI;
function dist(a,b,c,d){const p1=rad(a),p2=rad(c),dp=rad(c-a),dl=rad(d-b);const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)))}
function brg(a,b,c,d){const p1=rad(a),p2=rad(c),dl=rad(d-b);const y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);return (deg(Math.atan2(y,x))+360)%360}
function prep(g){const cum=[0];for(let i=1;i<g.length;i++)cum.push(cum[i-1]+dist(g[i-1][0],g[i-1][1],g[i][0],g[i][1]));return {g,cum,len:cum[cum.length-1]||0}}
function proj(lat,lon,P){const k=Math.cos(rad(lat))*111320,m=110574,g=P.g;let best={d:Infinity,along:0,b:0,i:0};
  for(let i=0;i<g.length-1;i++){const ax=(g[i][1]-lon)*k,ay=(g[i][0]-lat)*m,bx=(g[i+1][1]-lon)*k,by=(g[i+1][0]-lat)*m,dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy;
    let t=L2?-(ax*dx+ay*dy)/L2:0;t=Math.max(0,Math.min(1,t));const d=Math.hypot(ax+t*dx,ay+t*dy);
    if(d<best.d)best={d,i,along:P.cum[i]+t*(P.cum[i+1]-P.cum[i]),b:(deg(Math.atan2(dx,dy))+360)%360}}
  return best}
function pointAt(P,s){const c=P.cum,g=P.g;s=Math.max(0,Math.min(P.len,s));let i=0;while(i<c.length-2&&c[i+1]<s)i++;const seg=(c[i+1]-c[i])||1,t=(s-c[i])/seg;return [g[i][0]+(g[i+1][0]-g[i][0])*t,g[i][1]+(g[i+1][1]-g[i][1])*t]}
function slicePath(P,a0,a1){const out=[pointAt(P,a0)];for(let i=0;i<P.g.length;i++){if(P.cum[i]>a0&&P.cum[i]<a1)out.push(P.g[i])}out.push(pointAt(P,a1));return out}
// Douglas-Peucker in metri
function dp(pts,tol){if(pts.length<3)return pts;const k=Math.cos(rad(pts[0][0]))*111320,m=110574;const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;const st=[[0,pts.length-1]];
  while(st.length){const [a,b]=st.pop();let md=0,mi=-1;const ax=pts[a][1]*k,ay=pts[a][0]*m,bx=pts[b][1]*k,by=pts[b][0]*m,dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy||1;
    for(let i=a+1;i<b;i++){const px=pts[i][1]*k,py=pts[i][0]*m;let t=((px-ax)*dx+(py-ay)*dy)/L2;t=Math.max(0,Math.min(1,t));const d=Math.hypot(px-ax-t*dx,py-ay-t*dy);if(d>md){md=d;mi=i}}
    if(md>tol){keep[mi]=1;st.push([a,mi],[mi,b])}}
  return pts.filter((_,i)=>keep[i])}
const IMPL={'IT:urban':50,'IT:rural':90,'IT:trunk':110,'IT:motorway':130};
function parseMs(v){if(!v)return 0;v=String(v).split(';')[0].trim();if(IMPL[v])return IMPL[v];const n=parseFloat(v);return isFinite(n)?Math.round(/mph/.test(v)?n*1.609:n):0}
function midOf(geo){const P=prep(geo.map(p=>[p.lat,p.lon]));return pointAt(P,P.len/2)}
function joinWays(segs){if(!segs.length)return null;let path=segs[0].slice();
  for(let i=1;i<segs.length;i++){const s=segs[i],e=path[path.length-1],st=path[0],sl=s[s.length-1];
    const o=[[dist(e[0],e[1],s[0][0],s[0][1]),0],[dist(e[0],e[1],sl[0],sl[1]),1],[dist(st[0],st[1],sl[0],sl[1]),2],[dist(st[0],st[1],s[0][0],s[0][1]),3]].sort((a,b)=>a[0]-b[0])[0];
    if(o[0]>800)continue;
    if(o[1]===0)path=path.concat(s.slice(1));else if(o[1]===1)path=path.concat(s.slice().reverse().slice(1));else if(o[1]===2)path=s.slice(0,-1).concat(path);else path=s.slice().reverse().slice(0,-1).concat(path)}
  return path}
const r5=x=>Math.round(x*1e5)/1e5;
// Restituisce {cams:[[id,lat,lon,limite,dir,stato,tipo]], tuts:[{id,n,l,a,b,p,bd}]}
// stato: 0 attivo, 1 dismesso. tipo: 0 fisso, 1 portale tutor. dir: -1 = sconosciuta
function process(js){const cams=[],tuts=[],byId={};
  for(const e of js.elements){if(e.type!=='node'||!e.tags)continue;const t=e.tags;
    const off=t['disused:highway']==='speed_camera'||t['removed:highway']==='speed_camera'||t.disused==='yes';
    const avg=/average/.test((t.enforcement||'')+(t.speed_camera||''));
    const c=[e.id,r5(e.lat),r5(e.lon),parseMs(t.maxspeed),-1,off?1:0,avg?1:0];cams.push(c);byId[e.id]=c}
  for(const e of js.elements){if(e.type!=='relation'||!e.tags)continue;const t=e.tags,mem=e.members||[];
    const ptOf=m=>m.type==='node'&&m.lat!=null?[m.lat,m.lon]:(m.geometry&&m.geometry.length?midOf(m.geometry):null);
    const devs=mem.filter(m=>m.role==='device'&&m.type==='node'&&m.lat!=null);
    const fromM=mem.find(m=>m.role==='from'),toM=mem.find(m=>m.role==='to');
    if(t.enforcement==='maxspeed'){const F=fromM?ptOf(fromM):null;
      for(const d of devs){let c=byId[d.ref];if(!c){c=[d.ref,r5(d.lat),r5(d.lon),0,-1,t.disused==='yes'?1:0,0];cams.push(c);byId[d.ref]=c}
        if(!c[3])c[3]=parseMs(t.maxspeed);if(F&&dist(F[0],F[1],d.lat,d.lon)>15)c[4]=Math.round(brg(F[0],F[1],d.lat,d.lon))}}
    else if(t.enforcement==='average_speed'){let A=fromM?ptOf(fromM):null,B=toM?ptOf(toM):null,bd=0;
      if(!A||!B){if(devs.length>=2){A=A||[devs[0].lat,devs[0].lon];B=B||[devs[devs.length-1].lat,devs[devs.length-1].lon];bd=(!fromM&&!toM)?1:0}else continue}
      if(dist(A[0],A[1],B[0],B[1])<300)continue;
      let lim=parseMs(t.maxspeed);for(const d of devs){const c=byId[d.ref];if(c){c[6]=1;if(!lim&&c[3])lim=c[3]}}
      const secs=mem.filter(m=>m.type==='way'&&m.geometry&&m.geometry.length>1&&m.role!=='from'&&m.role!=='to').map(m=>m.geometry.map(p=>[p.lat,p.lon]));
      let p=null;const path=joinWays(secs);
      if(path&&path.length>1){let Q=prep(path);let pa=proj(A[0],A[1],Q),pb=proj(B[0],B[1],Q);
        if(pa.d<400&&pb.d<400&&Math.abs(pb.along-pa.along)>250){if(pa.along>pb.along){Q=prep(path.slice().reverse());pa=proj(A[0],A[1],Q);pb=proj(B[0],B[1],Q)}
          p=dp(slicePath(Q,pa.along,pb.along),6).map(q=>[r5(q[0]),r5(q[1])])}}
      tuts.push({id:e.id,n:t.name||t.description||'',l:lim||0,a:[r5(A[0]),r5(A[1])],b:[r5(B[0]),r5(B[1])],p,bd,off:t.disused==='yes'?1:0})}}
  return {cams,tuts}}
const API={process,dist,brg,prep,proj,pointAt,slicePath,dp,parseMs};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else G.OSMP=API;
})(typeof globalThis!=='undefined'?globalThis:this);
