/* Sentinella — ricalcolo istantaneo e senza rete.
   Costruisce sul telefono un piccolo grafo stradale dai riquadri della mappa già scaricati (strato «transportation»
   di OpenFreeMap, con i sensi unici) e trova la strada più rapida per rientrare sul percorso più avanti.
   Risponde in pochi millisecondi: il navigatore ti guida subito, poi il percorso del server (se arriva) lo sostituisce. */
'use strict';
const LocalRoute = App.LocalRoute = (()=>{
  const SPEED={motorway:30,trunk:24,primary:17,secondary:15,tertiary:13,minor:10,service:6,busway:8};   // m/s indicativi
  const OK=new Set(Object.keys(SPEED));
  const CELL=3e4;                                       // griglia ~3,7 m per unire i nodi dei riquadri vicini
  const key=(la,lo)=>Math.round(la*CELL)+'_'+Math.round(lo*CELL);
  function graph(bb){const map=MapView.map;if(!map||!map.getSource('openmaptiles'))return null;let fs;
    try{fs=map.querySourceFeatures('openmaptiles',{sourceLayer:'transportation'})}catch(e){return null}if(!fs||!fs.length)return null;
    const N=new Map(),E=new Map();let nid=0;
    const node=(la,lo)=>{const k=key(la,lo);let n=N.get(k);if(!n){n={id:nid++,k,la,lo};N.set(k,n);E.set(n.id,[])}return n};
    for(const f of fs){const p=f.properties||{};const cls=p.class;if(!OK.has(cls)||p.access==='no'||/path|track|pedestrian/.test(p.subclass||''))continue;
      const sp=SPEED[cls]*(p.ramp?0.8:1);const one=p.oneway===1||p.oneway==='1'?1:p.oneway===-1||p.oneway==='-1'?-1:0;
      const lines=f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.type==='MultiLineString'?f.geometry.coordinates:[];
      for(const L of lines){let prev=null;for(const c of L){const la=c[1],lo=c[0];if(la<bb[1]||la>bb[3]||lo<bb[0]||lo>bb[2]){prev=null;continue}const n=node(la,lo);
          if(prev&&prev!==n){const d=G.dist(prev.la,prev.lo,n.la,n.lo);if(one>=0)E.get(prev.id).push({to:n,d,t:d/sp,cls});if(one<=0)E.get(n.id).push({to:prev,d,t:d/sp,cls})}prev=n}}}
    return {N,E,byId:[...N.values()]}}
  class Heap{constructor(){this.a=[]}push(x){const a=this.a;a.push(x);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p][0]<=a[i][0])break;[a[p],a[i]]=[a[i],a[p]];i=p}}
    pop(){const a=this.a;const top=a[0],last=a.pop();if(a.length){a[0]=last;let i=0;for(;;){let l=2*i+1,r=l+1,m=i;if(l<a.length&&a[l][0]<a[m][0])m=l;if(r<a.length&&a[r][0]<a[m][0])m=r;if(m===i)break;[a[m],a[i]]=[a[i],a[m]];i=m}}return top}get size(){return this.a.length}}
  // nodo di partenza: lo spigolo più vicino nel verso di marcia
  function startEdges(g,f,hd){let best=[];for(const n of g.byId){const d=G.dist(f.lat,f.lon,n.la,n.lo);if(d>60)continue;
      for(const e of g.E.get(n.id)){const b=G.brg(n.la,n.lo,e.to.la,e.to.lo);const pr=projSeg(f,n,e.to);if(pr.d>35)continue;const hdPen=hd!=null?G.adiff(b,hd):0;if(hdPen>75)continue;
        best.push({e,n,pr,score:pr.d+hdPen*0.5})}}
    return best.sort((a,b)=>a.score-b.score).slice(0,3)}
  function projSeg(f,a,b){const kx=Math.cos(G.rad(f.lat))*111320,ky=111320;const ax=(a.lo-f.lon)*kx,ay=(a.la-f.lat)*ky,bx=(b.lo-f.lon)*kx,by=(b.la-f.lat)*ky;
    const dx=bx-ax,dy=by-ay,L=dx*dx+dy*dy||1;let t=-(ax*dx+ay*dy)/L;t=Math.max(0,Math.min(1,t));const px=ax+dx*t,py=ay+dy*t;return {d:Math.hypot(px,py),t}}
  /* rientro sul percorso: Dijkstra con più arrivi possibili; costo = tempo fino al punto + tempo che resta da lì */
  function rejoin(f,hd,rt,P,along){const t0=performance.now();if(!rt||!P)return null;
    const ahead=[];const vAvg=Math.max(8,rt.dist/Math.max(60,rt.time));
    for(let i=0;i<P.g.length;i++){const a=P.cum[i];if(a<along+25)continue;if(a>along+4000)break;ahead.push(i)}if(!ahead.length)return null;
    let bb=[f.lon,f.lat,f.lon,f.lat];for(const i of ahead.slice(0,400)){const p=P.g[i];bb=[Math.min(bb[0],p[1]),Math.min(bb[1],p[0]),Math.max(bb[2],p[1]),Math.max(bb[3],p[0])]}
    const pad=0.012;bb=[bb[0]-pad,bb[1]-pad,bb[2]+pad,bb[3]+pad];const g=graph(bb);if(!g||g.byId.length<4)return null;
    // arrivi: nodi del grafo vicini ai punti del percorso più avanti, nella stessa direzione
    const tgt=new Map();for(const i of ahead){const p=P.g[i];const nx=P.g[Math.min(P.g.length-1,i+1)];const rb=G.brg(p[0],p[1],nx[0],nx[1]);
      const ci=Math.round(p[0]*CELL),cj=Math.round(p[1]*CELL);for(let a=-3;a<=3;a++)for(let b=-3;b<=3;b++){const n=g.N.get((ci+a)+'_'+(cj+b));if(!n||tgt.has(n.id))continue;
        if(G.dist(n.la,n.lo,p[0],p[1])>10)continue;const outOk=g.E.get(n.id).some(e=>G.adiff(G.brg(n.la,n.lo,e.to.la,e.to.lo),rb)<40);if(!outOk&&i<P.g.length-1)continue;
        tgt.set(n.id,{i,rem:(P.len-P.cum[i])/vAvg})}}
    if(!tgt.size)return null;
    const st=startEdges(g,f,hd);if(!st.length)return null;
    const dist=new Map(),prev=new Map(),H=new Heap();
    const from=new Map();
    for(const s of st){const n=s.e.to;const d=G.dist(f.lat,f.lon,n.la,n.lo);const t=d/(SPEED[s.e.cls]||10);if(!dist.has(n.id)||t<dist.get(n.id)){dist.set(n.id,t);prev.set(n.id,null);from.set(n.id,s.n);H.push([t,n])}}
    let best=null,bestCost=Infinity;let it=0;
    while(H.size&&it++<60000){const [t,n]=H.pop();if(t>dist.get(n.id))continue;if(t>bestCost)break;const T=tgt.get(n.id);
      if(T){const c=t+T.rem;if(c<bestCost){bestCost=c;best={n,T,t}}}
      // niente inversioni a U sullo stesso tratto; le svolte strette costano tempo, come nella realtà
      const pn=prev.get(n.id)||from.get(n.id)||null;const inB=pn?G.brg(pn.la,pn.lo,n.la,n.lo):null;
      for(const e of g.E.get(n.id)){if(pn&&e.to===pn)continue;let pen=e.cls==='service'?4:0;
        if(inB!=null){const a=G.adiff(inB,G.brg(n.la,n.lo,e.to.la,e.to.lo));if(a>150)pen+=60;else if(a>100)pen+=12;else if(a>45)pen+=5}
        const nt=t+e.t+pen;if(nt<(dist.has(e.to.id)?dist.get(e.to.id):Infinity)){dist.set(e.to.id,nt);prev.set(e.to.id,n);H.push([nt,e.to])}}}
    if(!best)return null;
    const path=[];for(let n=best.n;n;n=prev.get(n.id))path.push([n.la,n.lo]);path.reverse();path.unshift([f.lat,f.lon]);
    const r=build(rt,P,path,best.T.i,best.t);r.ms=Math.round(performance.now()-t0);r.nodes=g.byId.length;return r}
  // percorso nuovo: tratto locale + resto del percorso originale, con le manovre ricavate dagli angoli
  function build(rt,P,path,join,tLocal){const man=[];const pc=G.prep(path);
    const typeFor=a=>{const x=Math.abs(a),r=a>0;return x<35?8:x<60?(r?9:16):x<135?(r?10:15):(r?11:14)};
    const txt={8:'Prosegui',9:'Tieni la destra',16:'Tieni la sinistra',10:'Svolta a destra',15:'Svolta a sinistra',11:'Svolta decisamente a destra',14:'Svolta decisamente a sinistra'};
    man.push({type:1,i:0,ie:0,time:0,len:0,text:'Prosegui',pre:'Prosegui',alert:'',post:'',street:'',begin:'',local:true});
    for(let i=1;i<path.length-1;i++){const b1=G.brg(path[i-1][0],path[i-1][1],path[i][0],path[i][1]),b2=G.brg(path[i][0],path[i][1],path[i+1][0],path[i+1][1]);const a=G.sdiff(b1,b2);
      if(Math.abs(a)<35)continue;if(G.dist(path[i-1][0],path[i-1][1],path[i][0],path[i][1])<6&&man.length>1&&pc.cum[i]-pc.cum[man[man.length-1].i]<15)continue;
      const ty=typeFor(a);man.push({type:ty,i,ie:i,time:0,len:0,text:txt[ty],pre:txt[ty],alert:txt[ty].toLowerCase(),post:'',street:'',begin:'',local:true})}
    // aggancio al percorso
    const off=path.length;const rest=rt.coords.slice(join);const coords=path.concat(rest);
    const jb=G.brg(path[path.length-2][0],path[path.length-2][1],path[path.length-1][0],path[path.length-1][1]);const rb=rest.length>1?G.brg(rest[0][0],rest[0][1],rest[1][0],rest[1][1]):jb;const ja=G.sdiff(jb,rb);
    const jt=Math.abs(ja)<35?8:typeFor(ja);man.push({type:jt,i:off-1,ie:off-1,time:0,len:0,text:jt===8?'Riprendi il percorso':txt[jt]+' e riprendi il percorso',pre:jt===8?'Riprendi il percorso':txt[jt]+' e riprendi il percorso',alert:jt===8?'riprendi il percorso':txt[jt].toLowerCase(),post:'',street:'',begin:'',local:true});
    for(let k=0;k<man.length;k++){const a=pc.cum[Math.min(man[k].i,pc.g.length-1)],b=k+1<man.length?pc.cum[Math.min(man[k+1].i,pc.g.length-1)]:pc.len;man[k].len=b-a;man[k].time=(b-a)/Math.max(1,pc.len/Math.max(1,tLocal))}
    const remT=rt.time*(1-P.cum[join]/P.len);
    for(const m of rt.man){if(m.i<join+1&&m.type!==4&&m.type!==5&&m.type!==6)continue;if(m.i<join)continue;const c=Object.assign({},m);c.i=m.i-join+off;if(c.ie!=null)c.ie=Math.max(c.i,m.ie-join+off);delete c._a;man.push(c)}
    return {coords,man,legs:rt.legs,dist:pc.len+(P.len-P.cum[join]),time:tLocal+remT,hasToll:rt.hasToll,hasHw:rt.hasHw,src:'local',joinAlong:pc.len,cost:rt.cost}}
  return {rejoin,graph};
})();
