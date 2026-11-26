/* Sentinella — la strada: dossi, semafori, passaggi a livello, fondo dissestato e pericoli (OpenStreetMap), curve pericolose calcolate
   dalla geometria, tratti panoramici e da guidare, incidenti e code (TomTom, facoltativo), copilota con note da rally e cronometro. */
'use strict';
const Roads = App.Roads = (()=>{
  const S=App.S,K=App.KINDS,EMPTY={type:'FeatureCollection',features:[]};
  const fc=f=>({type:'FeatureCollection',features:f});const pl=(n,a,b)=>n+' '+(n===1?a:b);

  /* =================== CURVE =================== */
  // ricampiona e calcola la curvatura; restituisce le curve con direzione, raggio minimo, angolo, grado da rally (1 stretta … 6 veloce)
  function analyze(coords,man){const P=G.prep(coords);if(P.len<60)return {P,curves:[],len:P.len};
    const step=P.len>150000?10:P.len>40000?7:5;const n=Math.floor(P.len/step)+1;const la=new Float64Array(n),lo=new Float64Array(n);
    for(let i=0;i<n;i++){const q=G.pointAt(P,i*step);la[i]=q.lat;lo[i]=q.lon}
    const w=Math.max(2,Math.round(20/step));const k=new Float64Array(n);
    for(let i=w;i<n-w;i++){const hb=G.brg(la[i-w],lo[i-w],la[i],lo[i]),ha=G.brg(la[i],lo[i],la[i+w],lo[i+w]);k[i]=G.rad(G.sdiff(hb,ha))/(w*step)}
    const curves=[];let i=0;const TH=1/260;
    while(i<n){if(Math.abs(k[i])<TH){i++;continue}const sg=Math.sign(k[i]);let j=i,gap=0,end=i;
      while(j<n){if(Math.sign(k[j])===sg&&Math.abs(k[j])>=TH){end=j;gap=0}else if(++gap>Math.max(2,Math.round(15/step)))break;j++}
      let ang=0,minR=1e9,rs=[];for(let x=i;x<=end;x++){ang+=k[x]*step;const R=1/Math.max(1e-6,Math.abs(k[x]));rs.push(R);if(R<minR)minR=R}
      const deg=G.deg(Math.abs(ang));
      if(deg>=18){const a=i*step,b=end*step,len=b-a;const th=Math.max(1,Math.floor(rs.length/3));const r1=Math.min(...rs.slice(0,th)),r3=Math.min(...rs.slice(-th));
        const grade=minR<=18?1:minR<=32?2:minR<=55?3:minR<=90?4:minR<=150?5:6;
        curves.push({a,b,len,dir:sg,deg,minR,grade,vs:Math.min(130,Math.round(Math.sqrt(3.4*minR)*3.6)),tight:r3<r1*0.65&&len>40,open:r1<r3*0.65&&len>40,hair:minR<=20&&deg>=115,lat:la[Math.round((i+end)/2)],lon:lo[Math.round((i+end)/2)]})}
      i=end+1}
    // pericolose: strette oppure precedute da un rettilineo veloce
    for(let c=0;c<curves.length;c++){const cv=curves[c],prev=curves[c-1];const straight=cv.a-(prev?prev.b:0);cv.straight=straight;cv.danger=cv.grade<=2||(cv.grade===3&&straight>=280)||(cv.grade===4&&straight>=700&&cv.deg>=60);cv.next=curves[c+1]||null}
    // svolte agli incroci e rotonde non sono «curve pericolose»: lì parla già la navigazione (e la freccia sulla mappa)
    if(man&&man.length){const J=new Set([2,3,9,10,11,12,13,14,15,16,17,18,19,20,21,23,24,25,26,27,37,38]);const at=man.filter(m=>J.has(m.type)).map(m=>[P.cum[Math.min(m.i,P.g.length-1)],P.cum[Math.min(m.ie!=null&&m.type===26?m.ie:m.i,P.g.length-1)]]);
      for(const cv of curves)if(at.some(([x0,x1])=>cv.b>=x0-35&&cv.a<=Math.max(x0,Math.min(x1,x0+250))+35)){cv.junction=true;cv.danger=false}}
    return {P,curves,len:P.len}}
  // indice di divertimento: gradi di curva per km nei tratti non urbani + tratti continui da guidare
  function funInfo(rt,an){const hwAt=s=>{const P=an.P;for(const m of rt.man){const a=P.cum[Math.min(m.i,P.g.length-1)],b=P.cum[Math.min(m.ie||m.i,P.g.length-1)];if(s>=a&&s<=b)return m.hw||(m.len>0&&m.time>0&&m.len/m.time<8)}return false};
    const cs=an.curves.filter(c=>c.grade>=2&&!hwAt((c.a+c.b)/2));const tot=cs.reduce((s,c)=>s+c.deg,0);
    const segs=[];const W=2000;for(let s=0;s<an.len;s+=500){const d=cs.filter(c=>c.a>=s&&c.a<s+W).reduce((x,c)=>x+c.deg,0)/(W/1000);if(d>=230){const last=segs[segs.length-1];if(last&&s<=last.b)last.b=Math.min(an.len,s+W);else segs.push({a:s,b:Math.min(an.len,s+W)})}}
    const funKm=segs.reduce((x,s)=>x+(s.b-s.a),0)/1000;const dens=tot/Math.max(1,an.len/1000);
    return {dens,funKm,segs,stars:dens>380?5:dens>260?4:dens>170?3:dens>90?2:1}}

  /* =================== PERICOLI DA OPENSTREETMAP =================== */
  const HZ_IT={curve:'Curve pericolose',curves:'Curve pericolose',dangerous_curve:'Curva pericolosa',animal_crossing:'Attraversamento animali',deer:'Attraversamento animali',falling_rocks:'Caduta massi',landslide:'Frana',ice:'Possibile ghiaccio',slippery:'Strada sdrucciolevole',school_zone:'Zona scolastica',children:'Bambini',queues_likely:'Possibili code',fog:'Nebbia frequente',crosswind:'Vento laterale',side_winds:'Vento laterale',road_narrows:'Strettoia',bump:'Dosso',dip:'Cunetta',flooding:'Rischio allagamento',low_flying_aircraft:'Aerei a bassa quota',cyclists:'Ciclisti',pedestrians:'Pedoni',horse_riders:'Cavalli',road_works:'Lavori',steep_incline:'Discesa pericolosa',frost_heave:'Fondo deformato',damaged_road:'Strada danneggiata',loose_gravel:'Ghiaia',dangerous_junction:'Incrocio pericoloso',accident_area:'Zona incidenti',hump:'Dosso'};
  const CALM={bump:'Dosso',hump:'Dosso',table:'Dosso rialzato',cushion:'Cuscino berlinese',yes:'Dosso',rumble_strip:'Bande rumorose',chicane:'Chicane',choker:'Strettoia',dip:'Cunetta'};
  function hzQuery(sel){return `[out:json][timeout:50];(node${sel(20)}["highway"="traffic_signals"];node${sel(20)}["traffic_calming"];node${sel(25)}["railway"="level_crossing"];node${sel(25)}["hazard"];node${sel(350)}["tourism"="viewpoint"];way${sel(15)}["highway"]["smoothness"~"^(bad|very_bad|horrible|very_horrible|impassable)$"];way${sel(15)}["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential)$"]["surface"~"^(unpaved|gravel|dirt|ground|compacted|fine_gravel|sett|cobblestone)$"];way${sel(20)}["scenic"="yes"];);out geom qt;`}
  function parseHz(j){const nodes=[],ways=[];for(const e of j.elements||[]){const t=e.tags||{};
    if(e.type==='node'){let k=null,l='',v=null;
      if(t.highway==='traffic_signals'){k='signal';l='Semaforo'}
      else if(t.traffic_calming){k='bump';l=CALM[t.traffic_calming]||'Rallentatore';if(t.traffic_calming==='island')continue}
      else if(t.railway==='level_crossing'){k='rail';l='Passaggio a livello'+(t['crossing:barrier']==='no'?' senza barriere':'')}
      else if(t.hazard){k=/curve/.test(t.hazard)?'curve':'hazard';l=HZ_IT[t.hazard]||'Pericolo'}
      else if(t.tourism==='viewpoint'){k='scenic';l=t.name?'Belvedere '+t.name:'Belvedere'}
      if(k)nodes.push({id:'h'+e.id,k,l,lat:e.lat,lon:e.lon,dir:t.direction&&isFinite(+t.direction)?+t.direction:null})}
    else if(e.type==='way'&&e.geometry){const rough=!!(t.smoothness||t.surface);const k=t.scenic==='yes'?'scenic':'rough';
      const l=k==='scenic'?'Strada panoramica'+(t.name?' · '+t.name:''):t.smoothness?({bad:'Strada dissestata',very_bad:'Strada molto dissestata',horrible:'Strada in pessimo stato',very_horrible:'Strada in pessimo stato',impassable:'Strada impraticabile'}[t.smoothness]||'Strada dissestata'):'Strada sterrata';
      ways.push({id:'w'+e.id,k,l,g:e.geometry.map(p=>[p.lat,p.lon]),name:t.name||t.ref||''})}}
    return {nodes,ways}}

  // --- lungo il percorso ---
  async function routeHazards(rt){if(rt._hz)return rt._hz;rt._hz=(async()=>{const an=rt._an||(rt._an=analyze(rt.coords,rt.man));
      const pts=G.simplify(rt.coords,60);const step=Math.max(1,Math.ceil(pts.length/450));const line=pts.filter((p,i)=>i%step===0||i===pts.length-1).map(p=>p[0].toFixed(5)+','+p[1].toFixed(5)).join(',');
      const j=await API.overpass(hzQuery(r=>`(around:${r},${line})`),60000);const {nodes,ways}=parseHz(j);const P=an.P;const items=[];
      for(const n of nodes){const pr=G.proj(n.lat,n.lon,P);if(pr.d>(n.k==='scenic'?400:28))continue;if(n.dir!=null&&n.k!=='scenic'&&G.adiff(n.dir,pr.b)>100&&G.adiff(n.dir,pr.b)<170)continue;items.push(Object.assign(n,{along:pr.along,side:n.k==='scenic'?side(P,pr,n):0}))}
      const segs=[];for(const w of ways){let a=1e12,b=-1;for(const p of w.g){const pr=G.proj(p[0],p[1],P);if(pr.d<22){a=Math.min(a,pr.along);b=Math.max(b,pr.along)}}if(b-a>40)segs.push({id:w.id,k:w.k,l:w.l,a,b,name:w.name})}
      segs.sort((x,y)=>x.a-y.a);const merged=[];for(const s of segs){const m=merged.find(x=>x.k===s.k&&s.a<=x.b+60);if(m){m.b=Math.max(m.b,s.b)}else merged.push(Object.assign({},s))}
      // i semafori a pochi metri l'uno dall'altro (stesso incrocio) contano una volta
      items.sort((x,y)=>x.along-y.along);const out=[];for(const x of items){const p=out.findLast?out.findLast(y=>y.k===x.k):[...out].reverse().find(y=>y.k===x.k);if(p&&x.along-p.along<(x.k==='signal'?60:x.k==='scenic'?800:15))continue;out.push(x)}
      return {nodes:out,segs:merged}})();rt._hz.catch(()=>{rt._hz=null});return rt._hz}
  function side(P,pr,n){const a=P.g[pr.i],b=P.g[Math.min(pr.i+1,P.g.length-1)];const cr=(b[1]-a[1])*(n.lat-a[0])-(b[0]-a[0])*(n.lon-a[1]);return cr>0?-1:1}

  // --- guida libera: zona intorno a me ---
  let area=null,areaAt=0,areaPos=null,areaBusy=false;
  async function areaHazards(f){if(areaBusy)return;if(areaPos&&G.dist(areaPos.lat,areaPos.lon,f.lat,f.lon)<1300&&Date.now()-areaAt<10*60e3)return;if(Date.now()-areaAt<40000)return;
    areaBusy=true;areaAt=Date.now();try{const j=await API.overpass(hzQuery(r=>`(around:${Math.max(r,2200)},${f.lat.toFixed(5)},${f.lon.toFixed(5)})`),45000);area=parseHz(j);areaPos={lat:f.lat,lon:f.lon};publish()}catch(e){}finally{areaBusy=false}}
  // distanza dal punto alla polilinea di una via
  function nearWay(g,lat,lon){let best=1e9;for(let i=0;i<g.length-1;i++){const P={g:[g[i],g[i+1]],cum:new Float64Array([0,G.dist(g[i][0],g[i][1],g[i+1][0],g[i+1][1])])};const d=G.proj(lat,lon,P).d;if(d<best)best=d}return best}

  /* =================== INCIDENTI E CODE (TomTom) =================== */
  const INC={1:['accident','Incidente'],2:['weather','Nebbia'],3:['hazard','Condizioni pericolose'],4:['weather','Pioggia'],5:['weather','Ghiaccio'],6:['traffic','Coda'],7:['closure','Corsia chiusa'],8:['closure','Strada chiusa'],9:['hazard','Lavori in corso'],10:['weather','Vento forte'],11:['weather','Allagamento'],14:['hazard','Veicolo in panne']};
  const MAG=['','lieve','moderata','forte','chiusa'];
  async function incidentsBox(b){if(!S.tomtomKey||!App.TT||!App.TT.can('inc'))return [];App.TT.use('inc');
    const fields='{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code},startTime,from,to,length,delay,roadNumbers}}}';
    const u=`https://api.tomtom.com/traffic/services/5/incidentDetails?key=${encodeURIComponent(S.tomtomKey)}&bbox=${b.map(x=>x.toFixed(4)).join(',')}&fields=${encodeURIComponent(fields)}&language=it-IT&timeValidityFilter=present`;
    const r=await API.tfetch(u,{},12000);const j=await r.json();if(!j.incidents)return [];
    return j.incidents.map(x=>{const p=x.properties||{};const t=INC[p.iconCategory]||['hazard','Evento'];const g=x.geometry.type==='Point'?[x.geometry.coordinates]:x.geometry.coordinates;
      return {id:'t'+p.id,k:t[0],l:(p.events&&p.events[0]&&p.events[0].description)||t[1],cat:p.iconCategory,mag:p.magnitudeOfDelay||0,delay:p.delay||0,len:p.length||0,from:p.from||'',to:p.to||'',roads:(p.roadNumbers||[]).join(', '),start:p.startTime?Date.parse(p.startTime):null,g:g.map(c=>[c[1],c[0]])}})}
  async function routeIncidents(rt){if(!S.tomtomKey)return null;if(rt._inc&&Date.now()-rt._incAt<10*60e3)return rt._inc;rt._incAt=Date.now();
    // poche richieste: un solo riquadro se il percorso sta in 9.000 km² (limite TomTom 10.000), altrimenti riquadri grandi solo dove passa
    rt._inc=(async()=>{let la0=90,la1=-90,lo0=180,lo1=-180;for(const p of rt.coords){if(p[0]<la0)la0=p[0];if(p[0]>la1)la1=p[0];if(p[1]<lo0)lo0=p[1];if(p[1]>lo1)lo1=p[1]}
      const pad=0.02;const area=(la1-la0+2*pad)*111*(lo1-lo0+2*pad)*111*Math.cos(G.rad((la0+la1)/2));const boxes=[];
      if(area<=9000)boxes.push([lo0-pad,la0-pad,lo1+pad,la1+pad]);
      else{const T=0.85;const tiles=new Set();for(let i=0;i<rt.coords.length;i+=3){const p=rt.coords[i];tiles.add(Math.floor(p[0]/T)+'_'+Math.floor(p[1]/T))}for(const t of tiles){const [a,b]=t.split('_').map(Number);boxes.push([b*T,a*T,(b+1)*T,(a+1)*T])}}
      const list=[];const seen=new Set();for(const bx of boxes.slice(0,12)){try{for(const x of await incidentsBox(bx))if(!seen.has(x.id)){seen.add(x.id);list.push(x)}}catch(e){}}
      const P=(rt._an||(rt._an=analyze(rt.coords,rt.man))).P;const on=[];
      for(const x of list){const first=G.proj(x.g[0][0],x.g[0][1],P),last=G.proj(x.g[x.g.length-1][0],x.g[x.g.length-1][1],P);
        if(first.d<60&&(x.g.length===1||(last.d<60&&last.along>=first.along-20)))on.push(Object.assign(x,{along:first.along,alongEnd:last.along}))}
      on.sort((a,b)=>a.along-b.along);return {all:list,on,delay:on.reduce((s,x)=>s+(x.delay||0),0)}})();rt._inc.catch(()=>{rt._inc=null});return rt._inc}
  let incArea=[],incAt=0,incPos=null,incTimer=0;
  async function areaIncidents(f){if(!S.tomtomKey||!App.state.driving||(f.spd||0)<4)return;if(incPos&&Date.now()-incAt<10*60e3&&G.dist(incPos.lat,incPos.lon,f.lat,f.lon)<20000)return;incAt=Date.now();incPos={lat:f.lat,lon:f.lon};
    const dl=0.12,dn=0.16;try{incArea=await incidentsBox([f.lon-dn,f.lat-dl,f.lon+dn,f.lat+dl]);publish()}catch(e){}}

  /* =================== TRATTI SEGNATI DALL'UTENTE =================== */
  let MARKS=Store.get('marks',[]);let rec=null;
  function markToggle(){const f=App.state.fix;if(!rec){if(!f){App.toast('Serve la posizione');return}rec={t0:Date.now(),g:[[f.lat,f.lon]]};Voice.beep(1,700);App.toast('Registro il tratto: tocca di nuovo alla fine');App.emit('markRec',true);return}
    const r=rec;rec=null;App.emit('markRec',false);const P=G.prep(r.g);if(P.len<300){App.toast('Tratto troppo corto');return}
    App.modal(`<div class="mb"><h4>Che tratto è?</h4><p>${F.km(P.len)} registrati</p></div><div class="group" style="border-radius:0;padding:10px 14px"><input type="text" id="mkN" placeholder="Nome (facoltativo)" maxlength="50" style="width:100%;height:40px;border:0;border-radius:10px;background:var(--fill);padding:0 10px;font-size:16px"></div>
      <div class="mbtns"><button data-t="scenic">Panoramico</button><button data-t="fun">Da guidare</button></div>`,(m,close)=>{m.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{const k=b.dataset.t;const g=G.simplify(r.g,8);
        const mk={id:'m'+Date.now(),k,name:$('#mkN').value.trim()||(k==='scenic'?'Tratto panoramico':'Tratto da guidare'),g,len:P.len,ts:Date.now(),mine:true};MARKS.push(mk);Store.set('marks',MARKS);publish();close();App.toast('Tratto salvato'+(S.community?' e condiviso':''));
        if(S.community&&App.Community)App.Community.publishMark(mk)})})}
  function addRemoteMark(mk){if(MARKS.some(x=>x.id===mk.id))return;MARKS.push(Object.assign(mk,{mine:false}));if(MARKS.length>400)MARKS=MARKS.slice(-400);Store.set('marks',MARKS);publish()}
  App.on('tick',({f})=>{if(rec){const l=rec.g[rec.g.length-1];if(G.dist(l[0],l[1],f.lat,f.lon)>12)rec.g.push([f.lat,f.lon])}});

  /* =================== MAPPA =================== */
  let routeLayer={nodes:[],segs:[],inc:[],fun:[],curves:[]},funPreview=null,bound=false;
  function ensure(){const map=MapView.map;if(!map||!MapView.ready)return false;
    for(const id of ['hz','hzl','inc','incl','fun','marks'])if(!map.getSource(id))map.addSource(id,{type:'geojson',data:EMPTY});
    const add=(o)=>{if(!map.getLayer(o.id))map.addLayer(o)};
    add({id:'fun-glow',type:'line',source:'fun',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#8B5CF6','line-width':['interpolate',['linear'],['zoom'],8,7,15,18],'line-opacity':0.4,'line-blur':3}});
    add({id:'fun-line',type:'line',source:'fun',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#A78BFA','line-width':['interpolate',['linear'],['zoom'],8,1.5,15,3.5],'line-opacity':0.95}});
    add({id:'marks-line',type:'line',source:'marks',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['match',['get','k'],'scenic','#EAB308','#8B5CF6'],'line-width':['interpolate',['linear'],['zoom'],8,2.5,15,6],'line-dasharray':[1.5,1]}});
    add({id:'hzl-line',type:'line',source:'hzl',minzoom:11,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['match',['get','k'],'scenic','#EAB308','#A16207'],'line-width':['interpolate',['linear'],['zoom'],11,3,16,8],'line-opacity':0.75,'line-dasharray':[0.6,0.9]}});
    add({id:'incl-line',type:'line',source:'incl',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['match',['get','m'],3,'#B91C1C',4,'#7F1D1D',2,'#EF4444','#F59E0B'],'line-width':['interpolate',['linear'],['zoom'],8,3,15,8],'line-opacity':0.85}});
    add({id:'hz-ic',type:'symbol',source:'hz',minzoom:12.5,layout:{'icon-image':['concat','wzs-',['get','k']],'icon-size':['interpolate',['linear'],['zoom'],12.5,0.7,16,1],'icon-allow-overlap':true,'icon-ignore-placement':true,'symbol-sort-key':['get','o']}});
    add({id:'inc-ic',type:'symbol',source:'inc',layout:{'icon-image':['concat','wz-',['get','k']],'icon-anchor':'bottom','icon-size':['interpolate',['linear'],['zoom'],8,0.7,14,1],'icon-allow-overlap':true}});
    if(!bound){bound=true;map.on('click','inc-ic',e=>tapInc(e.features[0].properties.id));map.on('click','hz-ic',e=>tapHz(e.features[0].properties.id));
      ['inc-ic','hz-ic'].forEach(id=>{map.on('mouseenter',id,()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave',id,()=>map.getCanvas().style.cursor='')})}
    return true}
  const pt=(lat,lon,p)=>({type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:p});
  const ln=(g,p)=>({type:'Feature',geometry:{type:'LineString',coordinates:g.map(q=>[q[1],q[0]])},properties:p});
  let hzIndex=new Map(),incIndex=new Map();
  function publish(){if(!ensure())return;const map=MapView.map;hzIndex=new Map();incIndex=new Map();
    const nodes=[],lines=[];const want=k=>k==='signal'?S.hzSignals||true:k==='bump'?S.hzBumps:k==='rail'?S.hzRail:k==='scenic'?S.hzScenic:true;
    const addN=n=>{if(!want(n.k)||hzIndex.has(n.id))return;hzIndex.set(n.id,n);nodes.push(pt(n.lat,n.lon,{id:n.id,k:n.k,o:n.k==='signal'?1:0}))};
    if(area){area.nodes.forEach(addN);for(const w of area.ways){if(w.k==='rough'&&!S.hzRough)continue;hzIndex.set(w.id,w);lines.push(ln(w.g,{k:w.k,id:w.id}))}}
    routeLayer.nodes.forEach(addN);for(const c of routeLayer.curves){const id='c'+Math.round(c.a);hzIndex.set(id,Object.assign({id,k:'curve',l:'Curva pericolosa a '+(c.dir>0?'destra':'sinistra')},c));nodes.push(pt(c.lat,c.lon,{id,k:'curve',o:2}))}
    map.getSource('hz').setData(fc(nodes));map.getSource('hzl').setData(fc(lines));
    const inc=[],incl=[];for(const x of incArea.concat(routeLayer.inc)){if(incIndex.has(x.id))continue;incIndex.set(x.id,x);inc.push(pt(x.g[0][0],x.g[0][1],{id:x.id,k:x.k}));if(x.g.length>1)incl.push(ln(x.g,{m:x.mag}))}
    map.getSource('inc').setData(fc(inc));map.getSource('incl').setData(fc(incl));
    map.getSource('fun').setData(fc((funPreview||routeLayer.fun).map(g=>ln(g,{}))));
    map.getSource('marks').setData(fc(MARKS.map(m=>ln(m.g,{k:m.k,id:m.id}))))}
  App.on('mapReady',()=>publish());
  function tapHz(id){const h=hzIndex.get(id);if(!h)return;const f=App.state.fix;const ll=h.lat!=null?[h.lon,h.lat]:[h.g[0][1],h.g[0][0]];
    const d=f?G.dist(f.lat,f.lon,ll[1],ll[0]):null;
    FX.spotlight({lngLat:ll,title:(K[h.k]||K.hazard).l,big:d!=null?'dista '+F.km(d):'',sub:h.l+(h.k==='curve'&&h.vs?` · consigliati ${h.vs} km/h`:''),color:(K[h.k]||K.hazard).c,icon:FX.glyph(h.k,34),meta:h.k==='curve'?'Calcolata dalla forma della strada':'Dati OpenStreetMap'})}
  function tapInc(id){const x=incIndex.get(id);if(!x)return;const f=App.state.fix;const d=f?G.dist(f.lat,f.lon,x.g[0][0],x.g[0][1]):null;
    FX.spotlight({lngLat:[x.g[0][1],x.g[0][0]],title:x.l,big:d!=null?'dista '+F.km(d):'',sub:[x.roads,x.from&&x.to?`da ${x.from} a ${x.to}`:x.from].filter(Boolean).join(' · '),color:(K[x.k]||K.hazard).c,icon:FX.glyph(x.k,34),
      meta:[x.delay?`Ritardo ${F.dur(x.delay)}`:'',x.len?`${F.km(x.len)} di coda`:'',x.mag?'intensità '+MAG[x.mag]:'',x.start?'dalle '+F.clock(x.start):''].filter(Boolean).join(' · ')+'<br><small>Fonte TomTom Traffic</small>'})}

  /* =================== AVVISI PIÙ AVANTI =================== */
  const hzSay=(k,l)=>k==='signal'?'Semaforo':k==='bump'?l:k==='rail'?l:k==='scenic'?l:k==='rough'?l:l;
  Ahead.add(ctx=>{const out=[],{f,hd,nav,along,kmh}=ctx;const sp=f.spd||0;
    const want=k=>k==='signal'?(S.hzSignals&&kmh>=40):k==='bump'?S.hzBumps:k==='rail'?S.hzRail:k==='rough'?S.hzRough:k==='scenic'?S.hzScenic:k==='curve'?S.hzCurves:true;
    if(nav){const r=Nav.route;const hz=r&&r._hzv;if(hz){for(const n of hz.nodes){const d=n.along-along;if(d<-10||d>1500||!want(n.k))continue;
        if(n.k==='scenic'){if(d<900)out.push({id:n.id,kind:'scenic',color:K.scenic.c,icon:FX.glyph('scenic',22),t1:n.l,t2:n.side<0?'sulla sinistra':'sulla destra',d,sayAt:700,say:`Tra ${F.speakDist(d)}, ${n.l.toLowerCase()} ${n.side<0?'a sinistra':'a destra'}`});continue}
        const at=n.k==='rail'?Math.max(250,sp*14):n.k==='bump'?Math.max(110,sp*7):Math.max(150,sp*8);
        out.push({id:n.id,kind:n.k,color:K[n.k].c,icon:FX.glyph(n.k,22),t1:n.l,t2:n.k==='bump'&&kmh>35?`Rallenta, sei a ${kmh}`:'',d,showAt:at*1.6,sayAt:at,say:n.k==='signal'?null:`${n.l} tra ${F.speakDist(d)}`,beep:n.k!=='signal'})}
      for(const s of hz.segs){if(!want(s.k))continue;const d=s.a-along;if(along>=s.a&&along<=s.b){out.push({id:s.id+'in',kind:s.k,color:K[s.k].c,icon:FX.glyph(s.k,22),t1:s.l,t2:`ancora ${F.km(s.b-along)}`,d:0,show:true});continue}
        if(d>0&&d<900)out.push({id:s.id,kind:s.k,color:K[s.k].c,icon:FX.glyph(s.k,22),t1:s.l,t2:`per ${F.km(s.b-s.a)}`,d,sayAt:Math.max(300,sp*15),say:`Tra ${F.speakDist(d)}, ${s.l.toLowerCase()} per ${F.speakDist(s.b-s.a)}`})}}
      // curve pericolose (non in modalità copilota: lì parlano le note)
      const an=r&&r._an;if(an&&S.hzCurves&&!Copilot.on)for(const c of an.curves){if(c.junction)continue;const d=c.a-along;if(d<-5||d>700)continue;const fast=kmh>c.vs+12;if(!c.danger&&!fast)continue;
        out.push({id:'c'+Math.round(c.a),kind:'curve',color:K.curve.c,icon:curveIcon(c,26),t1:c.hair?'Tornante':'Curva pericolosa',t2:`${c.dir>0?'a destra':'a sinistra'} · consigliati ${c.vs}`,d,prio:fast?2:1,sayAt:Math.max(150,sp*9),say:S.hzCurvesVoice===false?null:`${c.hair?'Tornante':'Curva pericolosa'} a ${c.dir>0?'destra':'sinistra'} tra ${F.speakDist(d)}${fast?', rallenta a '+c.vs:''}`})}
      // incidenti e code
      const inc=r&&r._incv;if(inc)for(const x of inc.on){const d=x.along-along;if(d<-20||d>6000)continue;
        out.push({id:x.id,kind:x.k,color:K[x.k].c,icon:FX.glyph(x.k,22),t1:x.l,t2:[x.delay?'+'+F.dur(x.delay):'',x.len?F.km(x.len):''].filter(Boolean).join(' · '),d,prio:x.k==='closure'||x.k==='accident'?2:1,showAt:2500,sayAt:Math.max(1200,sp*60),say:`${x.l} tra ${F.speakDist(d)}${x.delay?', ritardo '+F.dur(x.delay):''}`,tap:()=>tapInc(x.id)})}}
    else{// guida libera
      areaHazards(f);areaIncidents(f);
      if(area){for(const n of area.nodes){if(!want(n.k))continue;const d=Ahead.front(f,hd,n.lat,n.lon,n.k==='scenic'?900:600,n.k==='signal'?18:24);if(d==null)continue;
          if(n.dir!=null&&hd!=null&&G.adiff(n.dir,hd)>100&&G.adiff(n.dir,hd)<170)continue;
          const at=n.k==='rail'?Math.max(250,sp*14):n.k==='bump'?Math.max(110,sp*7):Math.max(150,sp*8);
          out.push({id:n.id,kind:n.k,color:K[n.k].c,icon:FX.glyph(n.k,22),t1:n.l,t2:'',d,showAt:at*1.5,sayAt:at,say:n.k==='signal'?null:`${n.l} tra ${F.speakDist(d)}`,beep:n.k!=='signal'})}
        if(S.hzRough&&hd!=null&&sp>2){const ah=G.dest(f.lat,f.lon,hd,Math.max(120,sp*10));for(const w of area.ways){if(w.k!=='rough')continue;const here=nearWay(w.g,f.lat,f.lon)<15,next=nearWay(w.g,ah[0],ah[1])<20;
            if(here)out.push({id:w.id+'in',kind:'rough',color:K.rough.c,icon:FX.glyph('rough',22),t1:w.l,t2:w.name,d:0,show:true});
            else if(next)out.push({id:w.id,kind:'rough',color:K.rough.c,icon:FX.glyph('rough',22),t1:w.l+' più avanti',t2:w.name,d:Math.max(120,sp*10),sayAt:5000,say:w.l+' più avanti'})}}}
      for(const x of incArea){const d=Ahead.front(f,hd,x.g[0][0],x.g[0][1],3000,22);if(d==null)continue;out.push({id:x.id,kind:x.k,color:K[x.k].c,icon:FX.glyph(x.k,22),t1:x.l,t2:x.delay?'+'+F.dur(x.delay):'',d,prio:1,sayAt:1500,say:`${x.l} tra ${F.speakDist(d)}`,tap:()=>tapInc(x.id)})}}
    // tratti segnati (panorama / da guidare)
    for(const m of MARKS){const st=m.g[0];const d=nav?null:Ahead.front(f,hd,st[0],st[1],800,30);const dd=nav?(()=>{const a=Ahead.onRoute(st[0],st[1],35);return a==null?null:a-along})():d;
      if(dd!=null&&dd>=0&&dd<800)out.push({id:'mk'+m.id,kind:m.k,color:K[m.k].c,icon:FX.glyph(m.k,22),t1:(m.k==='scenic'?'Inizia: ':'Inizia: ')+m.name,t2:F.km(m.len),d:dd,sayAt:400,say:`Tra ${F.speakDist(dd)} inizia ${m.k==='scenic'?'il tratto panoramico':'il tratto da guidare'} ${m.name}`})}
    return out});

  /* =================== COPILOTA =================== */
  function curveIcon(c,size=40){const r=c.dir>0;const t=c.hair?'<path d="M14 40V22a10 10 0 0120 0v10" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M27 30l7 9 7-9z" fill="#fff"/>':
      c.grade<=2?'<path d="M18 42V24c0-6 4-10 10-10h6" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M32 5l10 9-10 9z" fill="#fff"/>':c.grade<=4?'<path d="M20 42V30c0-9 6-15 14-18" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M30 4l11 7-9 10z" fill="#fff"/>':'<path d="M22 42V32c0-8 3-14 9-19" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M26 6l11 3-6 11z" fill="#fff"/>';
    return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" style="width:${size}px;height:${size}px"><g ${r?'':'transform="translate(48 0) scale(-1 1)"'}>${t}</g></svg>`}
  function noteText(c){let t=c.hair?`tornante ${c.dir>0?'destro':'sinistro'}`:`${c.dir>0?'destra':'sinistra'} ${c.grade}`;if(!c.hair&&c.len>90&&c.deg>=70)t+=' lunga';if(c.tight)t+=' si stringe';else if(c.open)t+=' si apre';if(c.danger&&c.grade<=2&&!c.hair)t+=', attenzione';return t}
  function gapCall(g){if(g<35)return 'e';const R=[50,70,100,150,200,250,300,400,500];if(g>520)return 'dritto';let b=R[0];for(const r of R)if(Math.abs(r-g)<Math.abs(b-g))b=r;return String(b)}
  const Copilot=App.Copilot={on:false,t0:0,said:new Set(),maxG:0,lastF:null,g:{lat:0,lon:0},key:null,splits:[]};
  function copStart(){const r=Nav.route;if(!r)return;Copilot.on=true;Copilot.t0=Date.now();Copilot.said=new Set();Copilot.maxG=0;Copilot.vmax=0;Copilot.lastF=null;Copilot.dist0=0;
    const a=r.coords[0],b=r.coords[r.coords.length-1];Copilot.key=[a,b].map(p=>p[0].toFixed(3)+','+p[1].toFixed(3)).join('>');if(!r._an)r._an=analyze(r.coords,r.man);
    $('#copi').classList.remove('hidden');App.emit('layout');Voice.say('Copilota pronto. Note sulle curve attive.',true);copRender()}
  function copStop(save){if(!Copilot.on)return;Copilot.on=false;$('#copi').classList.add('hidden');App.emit('layout');
    if(save){const secs=(Date.now()-Copilot.t0)/1000;const r=Nav.route||Copilot.lastRoute;const best=Store.get('stages',{});const k=Copilot.key;const prev=best[k];const dist=r?r.dist:0;
      const rec={secs,dist,avg:dist/secs*3.6,maxG:Copilot.maxG,vmax:Copilot.vmax,ts:Date.now(),name:Plan.st.stops.length?Plan.st.stops[Plan.st.stops.length-1].name:''};
      const isBest=!prev||secs<prev.secs;if(isBest){best[k]=rec;Store.set('stages',best)}
      const hist=Store.get('stageHist',[]);hist.unshift(rec);Store.set('stageHist',hist.slice(0,100));
      App.toast(`Tempo ${F.mmss(secs)}${isBest?' · nuovo record':prev?' · record '+F.mmss(prev.secs):''}`,6000);Voice.say(`Arrivati. Tempo ${Math.floor(secs/60)} minuti e ${Math.round(secs%60)} secondi${isBest&&prev?'. Nuovo record':''}`)}}
  App.on('navEnd',()=>copStop(false));App.on('beforeArrive',()=>{if(Copilot.on)copStop(true)});
  App.on('navStart',()=>{if(App.state.wantCopilot){App.state.wantCopilot=false;setTimeout(copStart,600)}});
  App.on('navReroute',()=>{const r=Nav.route;if(r&&!r._an)r._an=analyze(r.coords,r.man)});
  App.on('tick',({f,hd})=>{if(!Copilot.on||!Nav.route)return;const r=Nav.route,an=r._an;if(!an)return;const along=Nav.along(),sp=f.spd||0;
    // accelerazione laterale e longitudinale dal GPS (non dipende da come è montato il telefono)
    const L=Copilot.lastF;if(L&&f.t>L.t){const dt=(f.t-L.t)/1000;if(dt>0.3&&dt<3){const dh=hd!=null&&L.hd!=null?G.rad(G.sdiff(L.hd,hd))/dt:0;const lat=sp*dh/9.81,lon=(sp-(L.spd||0))/dt/9.81;
      Copilot.g.lat=Copilot.g.lat*0.4+Math.max(-1.5,Math.min(1.5,lat))*0.6;Copilot.g.lon=Copilot.g.lon*0.4+Math.max(-1.5,Math.min(1.5,lon))*0.6;Copilot.maxG=Math.max(Copilot.maxG,Math.hypot(Copilot.g.lat,Copilot.g.lon))}}
    Copilot.lastF={t:f.t,hd,spd:sp};Copilot.vmax=Math.max(Copilot.vmax||0,sp*3.6);Copilot.lastRoute=r;
    // note: 4,5 secondi prima della curva (minimo 70 m), concatenate se ravvicinate
    const lead=Math.max(70,sp*4.5);const nx=an.curves.find(c=>c.b>along+5&&!c.junction);Copilot.next=nx;
    if(nx&&!Copilot.said.has(nx.a)&&nx.a-along<=lead){let txt=noteText(nx);Copilot.said.add(nx.a);let c=nx;
      for(let k=0;k<2&&c.next;k++){const gap=c.next.a-c.b;if(gap>110)break;const call=gapCall(gap);txt+=(call==='e'?' e ':', '+call+', ')+noteText(c.next);Copilot.said.add(c.next.a);c=c.next}
      const after=c.next?c.next.a-c.b:null;if(after!=null&&after>520)txt+=', poi dritto';
      if(S.copiVoice)sayFast(txt);if(nx.danger||(sp*3.6>nx.vs+15))Voice.buzz(30)}
    copRender()});
  function sayFast(t){if(!App.S.voice)return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.lang='it-IT';u.rate=S.copiSpeed||1.12;speechSynthesis.speak(u)}catch(e){}}
  function copRender(){if(!Copilot.on)return;const el=$('#copi');const c=Copilot.next,along=Nav.along();const f=App.state.fix;const kmh=f?Math.round((f.spd||0)*3.6):0;
    const g=Copilot.g;const gx=Math.max(-1,Math.min(1,g.lat/1.1))*26,gy=Math.max(-1,Math.min(1,-g.lon/1.1))*26;
    el.innerHTML=`<div class="cp-top">${c?`<div class="cp-ic ${c.danger?'bad':kmh>c.vs+10?'warn':''}">${curveIcon(c,44)}<b>${c.hair?'T':c.grade}</b></div><div class="cp-tx"><b>${esc(noteText(c).replace(', attenzione',''))}</b><span>${F.km(Math.max(0,c.a-along))} · ${c.vs} km/h</span></div>`:'<div class="cp-tx"><b>Dritto</b><span>nessuna curva</span></div>'}</div>
      <div class="cp-bot"><div class="cp-g"><i style="transform:translate(${gx}px,${gy}px)"></i><small>${F.n(Math.hypot(g.lat,g.lon),2)} g</small></div><div class="cp-t"><b>${F.mmss((Date.now()-Copilot.t0)/1000)}</b><small>max ${F.n(Copilot.maxG,2)} g</small></div></div>`;
    if(c&&c.next){const n2=c.next;el.querySelector('.cp-top').insertAdjacentHTML('afterend',`<div class="cp-next">poi ${esc(gapCall(n2.a-c.b))==='e'?'':esc(gapCall(n2.a-c.b))+' · '}${esc(noteText(n2).replace(', attenzione',''))}</div>`)}}
  setInterval(()=>{if(Copilot.on)copRender()},1000);

  /* =================== PIANIFICAZIONE: sezione «Guida» =================== */
  App.on('plan',()=>{const rs=Plan.st.routes;if(!rs.length||rs._funDone)return;rs._funDone=true;
    for(const r of rs){r._an=r._an||analyze(r.coords,r.man);r.fun=funInfo(r,r._an);if(r.fun.stars>=3)r.tags.push(['Curve '+'★'.repeat(r.fun.stars),'purple'])}
    if(S.funRoute&&rs.length>1){let bi=0;rs.forEach((r,i)=>{if(r.fun.dens>rs[bi].fun.dens)bi=i});if(!rs[bi].tags.some(t=>t[0]==='Più divertente'))rs[bi].tags.unshift(['Più divertente','purple']);if(bi!==Plan.st.sel){Plan.select(bi);return}}
    App.emit('plan')});
  App.on('planBody',({route,box})=>{if(!box)return;const r=route;r._an=r._an||analyze(r.coords,r.man);r.fun=r.fun||funInfo(r,r._an);
    let el=box.querySelector('#rdBox');if(!el){box.insertAdjacentHTML('afterbegin','<div id="rdBox"></div>');el=box.querySelector('#rdBox')}
    const dang=r._an.curves.filter(c=>c.danger).length,hair=r._an.curves.filter(c=>c.hair).length;
    // tratti da guidare evidenziati
    routeLayer.fun=r.fun.segs.map(s=>{const i0=G.idxAt(r._an.P,s.a),i1=G.idxAt(r._an.P,s.b)+1;return r._an.P.g.slice(i0,i1+1)});routeLayer.curves=r._an.curves.filter(c=>c.danger);publish();
    el.innerHTML=`<div class="sec"><h3>La strada</h3></div><div class="group">
      ${App.UI.item({color:K.fun.c,icon:FX.glyph('fun',18),t1:`Curve: ${'★'.repeat(r.fun.stars)}${'☆'.repeat(5-r.fun.stars)}`,t2:r.fun.funKm>=1?`${F.n(r.fun.funKm,1)} km di tratti da guidare, evidenziati in viola`:'Percorso scorrevole, poche curve'})}
      ${App.UI.item({color:K.curve.c,icon:FX.glyph('curve',18),t1:`${pl(dang,'curva pericolosa','curve pericolose')}${hair?` · ${pl(hair,'tornante','tornanti')}`:''}`,t2:'Avviso a voce con velocità consigliata'})}
      <div id="rdHz">${App.UI.item({color:'#8E8E93',icon:'<span class="spin" style="width:16px;height:16px;margin:0;border-width:2px"></span>',t1:'Cerco dossi, semafori e passaggi a livello…',t2:'OpenStreetMap'})}</div>
      <div id="rdInc"></div></div>`;
    routeHazards(r).then(hz=>{const e=$('#rdHz');if(!e||Plan.route!==r)return;r._hzv=hz;routeLayer.nodes=hz.nodes;publish();
      const cnt=k=>hz.nodes.filter(n=>n.k===k).length;const rough=hz.segs.filter(s=>s.k==='rough').reduce((x,s)=>x+s.b-s.a,0),scen=cnt('scenic')+hz.segs.filter(s=>s.k==='scenic').length;
      const parts=[[cnt('bump'),'dosso','dossi'],[cnt('signal'),'semaforo','semafori'],[cnt('rail'),'passaggio a livello','passaggi a livello'],[cnt('hazard')+cnt('curve'),'pericolo segnalato','pericoli segnalati']].filter(x=>x[0]);
      e.innerHTML=App.UI.item({color:K.bump.c,icon:FX.glyph('bump',18),t1:parts.length?parts.map(x=>pl(x[0],x[1],x[2])).join(' · '):'Nessun dosso o semaforo',cls:'wrap',t2:rough>200?`${F.km(rough)} di strada dissestata o sterrata`:'Fondo stradale senza problemi segnalati'})+(scen?App.UI.item({color:K.scenic.c,icon:FX.glyph('scenic',18),t1:pl(scen,'punto panoramico','punti panoramici'),t2:scen===1?'Te lo indico quando ci passi vicino':'Te li indico quando ci passi vicino'}):'')})
      .catch(()=>{const e=$('#rdHz');if(e)e.innerHTML=App.UI.item({color:'#8E8E93',icon:FX.glyph('bump',18),t1:'Dossi e semafori non disponibili ora',t2:'Il server OpenStreetMap è occupato: li cerco di nuovo alla partenza'})});
    const ie=$('#rdInc');if(S.tomtomKey){routeIncidents(r).then(inc=>{if(!inc||!$('#rdInc'))return;r._incv=inc;routeLayer.inc=inc.on;publish();
        $('#rdInc').innerHTML=App.UI.item({color:inc.on.length?K.traffic.c:'var(--green)',icon:FX.glyph('traffic',18),t1:inc.on.length?`${inc.on.length} eventi sul percorso${inc.delay?' · +'+F.dur(inc.delay):''}`:'Traffico regolare',t2:inc.on.length?inc.on.slice(0,3).map(x=>x.l).join(', '):'Nessun incidente o coda segnalati da TomTom'})}).catch(()=>{})}
    else ie.innerHTML=App.UI.item({attr:'id="rdTT"',color:'#8E8E93',icon:FX.glyph('traffic',18),t1:'Incidenti e code in tempo reale',t2:'Aggiungi la chiave TomTom gratuita nelle impostazioni',chev:true});
    const tt=$('#rdTT');if(tt)tt.onclick=()=>App.UI.show('settings')});
  App.on('plan',()=>{if(!Plan.st.routes.length&&!Nav.active){routeLayer={nodes:[],segs:[],inc:[],fun:[],curves:[]};publish()}});
  App.on('navStart',()=>{const r=Nav.route;if(!r)return;r._an=r._an||analyze(r.coords,r.man);routeLayer.fun=[];routeLayer.curves=r._an.curves.filter(c=>c.danger);
    routeHazards(r).then(hz=>{r._hzv=hz;routeLayer.nodes=hz.nodes;publish()}).catch(()=>{});
    if(S.tomtomKey){const upd=()=>{if(Nav.route!==r)return;routeIncidents(r).then(inc=>{if(inc){r._incv=inc;routeLayer.inc=inc.on;publish();App.emit('trafficDelay',inc.delay)}}).catch(()=>{})};upd();clearInterval(incTimer);incTimer=setInterval(upd,10*60e3)}publish()});
  App.on('navReroute',()=>{const r=Nav.route;if(!r)return;r._an=analyze(r.coords,r.man);routeLayer.curves=r._an.curves.filter(c=>c.danger);routeHazards(r).then(hz=>{r._hzv=hz;routeLayer.nodes=hz.nodes;publish()}).catch(()=>{})});
  App.on('navEnd',()=>{clearInterval(incTimer);routeLayer={nodes:[],segs:[],inc:[],fun:[],curves:[]};publish()});

  /* =================== STRADE DA GUIDARE VICINO A ME =================== */
  let funNear=null;
  async function findFunRoads(lat,lon,km=12){const d=km/111,e=km/(111*Math.cos(G.rad(lat)));const b=[lat-d,lon-e,lat+d,lon+e].map(x=>x.toFixed(4)).join(',');
    const q=`[out:json][timeout:90];way["highway"~"^(primary|secondary|tertiary|unclassified)$"]["area"!="yes"]["tunnel"!="yes"](${b});out geom qt;`;
    const j=await API.overpass(q,95000);const groups=new Map();
    for(const w of j.elements||[]){if(!w.geometry||w.geometry.length<4)continue;const t=w.tags||{};if(t.maxspeed&&+t.maxspeed<=30)continue;const key=t.ref||t.name;if(!key)continue;
      const an=analyze(w.geometry.map(p=>[p.lat,p.lon]));if(an.len<150)continue;const cs=an.curves.filter(c=>c.minR>=12&&c.grade>=2);let g=groups.get(key);
      if(!g){g={name:t.name||t.ref,ref:t.ref||'',hw:t.highway,len:0,deg:0,curves:0,geoms:[]};groups.set(key,g)}g.len+=an.len;g.deg+=cs.reduce((s,c)=>s+c.deg,0);g.curves+=cs.length;g.geoms.push(an.P.g)}
    const out=[];for(const g of groups.values()){if(g.len<2500)continue;g.dens=g.deg/(g.len/1000);if(g.dens<150)continue;
      let best=null,bd=1e12;for(const geo of g.geoms)for(const p of [geo[0],geo[geo.length-1]]){const dd=G.dist(lat,lon,p[0],p[1]);if(dd<bd){bd=dd;best=p}}g.near=best;g.d=bd;g.stars=g.dens>380?5:g.dens>260?4:g.dens>190?3:2;g.score=g.dens*Math.sqrt(g.len/1000);out.push(g)}
    return out.sort((a,b)=>b.score-a.score).slice(0,15)}
  App.UI.R.funroads=()=>({detent:'half',html:`${App.UI.hdr('Strade da guidare','Le più ricche di curve entro 12 km')}<div id="frOut"><div class="spin"></div><p class="note" style="text-align:center">Analizzo la forma delle strade intorno a te…</p></div>`,
    async bind(){const me=App.UI.myPos();const out=$('#frOut');if(!me){out.innerHTML='<div class="empty">Serve la posizione.</div>';return}
      try{if(!funNear||G.dist(funNear.lat,funNear.lon,me.lat,me.lon)>4000)funNear={lat:me.lat,lon:me.lon,list:await findFunRoads(me.lat,me.lon)};const list=funNear.list;
        if(!list.length){out.innerHTML='<div class="empty">Nessuna strada particolarmente guidata qui intorno.</div>';return}
        funPreview=list.flatMap(g=>g.geoms);publish();
        out.innerHTML=`<div class="group">${list.map((g,i)=>App.UI.item({attr:`data-i="${i}"`,color:K.fun.c,icon:`<b style="font-size:13px">${g.stars}★</b>`,t1:esc(g.name)+(g.ref&&g.ref!==g.name?` <span class="tag gray">${esc(g.ref)}</span>`:''),t2:`${F.km(g.len)} · ${g.curves} curve · ${Math.round(g.dens)}°/km`,rt:F.km(g.d),chev:true})).join('')}</div>
          <p class="note">Classifica calcolata dalla geometria di OpenStreetMap: più gradi di curva per chilometro, più la strada è guidata. Rispetta sempre limiti e codice: sono strade aperte al traffico.</p>`;
        let bb=[[180,90],[-180,-90]];for(const geo of funPreview)for(const p of geo){bb[0][0]=Math.min(bb[0][0],p[1]);bb[0][1]=Math.min(bb[0][1],p[0]);bb[1][0]=Math.max(bb[1][0],p[1]);bb[1][1]=Math.max(bb[1][1],p[0])}MapView.fit(bb);
        out.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>App.UI.show('funroad',{g:list[+b.dataset.i]}))}
      catch(e){out.innerHTML='<div class="empty">Il server OpenStreetMap è occupato.<br><br><button class="btn" id="frR">Riprova</button></div>';$('#frR').onclick=()=>App.UI.render()}}});
  App.UI.R.funroad=({g})=>({detent:'half',html:`${App.UI.hdr(g.name,`${F.km(g.len)} · ${g.curves} curve · ${'★'.repeat(g.stars)}`)}
      <div class="group">${App.UI.item({color:K.fun.c,icon:FX.glyph('fun',18),t1:`${Math.round(g.dens)} gradi di curva per km`,t2:g.hw==='primary'?'Strada statale o regionale':g.hw==='secondary'?'Strada provinciale principale':'Strada secondaria'})}</div>
      <button class="btn primary big" id="frGo" style="margin-top:12px">Portami all'inizio</button><button class="btn wide" id="frCopi" style="margin-top:8px;color:${K.fun.c}">Percorrila con il copilota</button>`,
    bind(){funPreview=g.geoms;publish();let bb=[[180,90],[-180,-90]];for(const geo of g.geoms)for(const p of geo){bb[0][0]=Math.min(bb[0][0],p[1]);bb[0][1]=Math.min(bb[0][1],p[0]);bb[1][0]=Math.max(bb[1][0],p[1]);bb[1][1]=Math.max(bb[1][1],p[0])}MapView.fit(bb);
      // capi della strada: i due estremi più lontani tra loro
      const ends=g.geoms.flatMap(x=>[x[0],x[x.length-1]]);let A=ends[0],B=ends[1],bd=0;for(const p of ends)for(const q of ends){const d=G.dist(p[0],p[1],q[0],q[1]);if(d>bd){bd=d;A=p;B=q}}
      const me=App.UI.myPos();if(me&&G.dist(me.lat,me.lon,B[0],B[1])<G.dist(me.lat,me.lon,A[0],A[1]))[A,B]=[B,A];
      $('#frGo').onclick=()=>{Plan.reset({name:'Inizio '+g.name,lat:A[0],lon:A[1]});App.UI.openPlan()};
      $('#frCopi').onclick=()=>{Plan.reset();Plan.addStop({name:'Inizio '+g.name,lat:A[0],lon:A[1]});Plan.addStop({name:'Fine '+g.name,lat:B[0],lon:B[1]});App.state.wantCopilot=true;App.UI.openPlan()}}});
  App.on('sheet',()=>{});
  // pulizia anteprima quando si torna alla home
  const _home=App.UI.home;App.UI.home=function(){if(funPreview){funPreview=null;publish()}return _home.apply(this,arguments)};

  /* =================== CRONOMETRO: storico prove =================== */
  App.UI.R.stages=()=>{const H=Store.get('stageHist',[]);return {detent:'full',html:`${App.UI.hdr('Prove a tempo','Percorsi fatti con il copilota')}
    ${H.length?`<div class="group">${H.map(h=>App.UI.item({color:K.fun.c,icon:'<svg><use href="#i-clock"/></svg>',t1:`${F.mmss(h.secs)} · ${esc(h.name||'Percorso')}`,t2:`${F.date(h.ts)} · ${F.km(h.dist)} · media ${Math.round(h.avg)} km/h · max ${F.n(h.maxG,2)} g`})).join('')}</div>`:'<div class="empty">Avvia un percorso con il copilota: qui trovi tempi, medie e record.</div>'}
    <p class="note">Le accelerazioni sono stimate dal GPS. Usa il copilota solo su strade aperte nel rispetto dei limiti: il cronometro serve a confrontare la regolarità, non a correre.</p>`}};

  // percorso divertente: niente autostrade, più alternative
  const _route=API.route;API.route=(stops,o={})=>{if(S.funRoute&&!o.pedestrian)o=Object.assign({},o,{avoidHighways:true});return _route(stops,o)};

  return {analyze,funInfo,routeHazards,routeIncidents,markToggle,get recording(){return !!rec},addRemoteMark,get marks(){return MARKS},publish,curveIcon,noteText,copStart,copStop,tapInc,findFunRoads};
})();
