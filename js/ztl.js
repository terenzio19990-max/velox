/* Sentinella — ZTL (zone a traffico limitato) da OpenStreetMap (boundary=limited_traffic_zone):
   zone disegnate sulla mappa, avviso se il percorso ci entra con proposta di evitarle, avviso a voce prima del varco. */
'use strict';
const ZTL = App.ZTL = (()=>{
  const S=App.S,EMPTY={type:'FeatureCollection',features:[]};
  let zones=[],busy=false;           // zone note: {id,name,rings:[[[lon,lat]...]],bb:[minLon,minLat,maxLon,maxLat],hours}
  const seen=new Map();                            // id -> zona (cache di sessione)
  // ricompongo gli anelli di un multipoligono unendo i tratti per gli estremi
  function joinRings(segs){const rings=[];segs=segs.map(s=>s.slice());
    while(segs.length){let r=segs.shift();let guard=0;while(guard++<5000){const a=r[0],b=r[r.length-1];if(a[0]===b[0]&&a[1]===b[1]&&r.length>3)break;
        let k=segs.findIndex(s=>{const p=s[0],q=s[s.length-1];return (p[0]===b[0]&&p[1]===b[1])||(q[0]===b[0]&&q[1]===b[1])});if(k<0)break;let s=segs.splice(k,1)[0];if(!(s[0][0]===b[0]&&s[0][1]===b[1]))s.reverse();r=r.concat(s.slice(1))}
      if(r.length>3)rings.push(r)}return rings}
  function bbox(rings){let b=[180,90,-180,-90];for(const r of rings)for(const p of r){if(p[0]<b[0])b[0]=p[0];if(p[1]<b[1])b[1]=p[1];if(p[0]>b[2])b[2]=p[0];if(p[1]>b[3])b[3]=p[1]}return b}
  function parse(j){const out=[];for(const e of j.elements||[]){const t=e.tags||{};let rings=[];
      if(e.type==='way'&&e.geometry)rings=[e.geometry.map(p=>[p.lon,p.lat])];
      else if(e.type==='relation'&&e.members)rings=joinRings(e.members.filter(m=>m.type==='way'&&m.geometry&&m.role!=='inner').map(m=>m.geometry.map(p=>[p.lon,p.lat])));
      rings=rings.filter(r=>r.length>3);if(!rings.length)continue;
      const hours=t['access:conditional']||t['motor_vehicle:conditional']||t.opening_hours||t['zone:traffic:conditional']||'';
      out.push({id:e.type[0]+e.id,name:t.name||t['name:it']||'ZTL',rings,bb:bbox(rings),hours,note:t.description||t.note||''})}return out}
  function inPoly(lon,lat,ring){let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if(((a[1]>lat)!==(b[1]>lat))&&(lon<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0]))c=!c}return c}
  const inside=(z,lon,lat)=>lon>=z.bb[0]&&lon<=z.bb[2]&&lat>=z.bb[1]&&lat<=z.bb[3]&&z.rings.some(r=>inPoly(lon,lat,r));
  const loaded=[];const covered=b=>loaded.some(l=>b[0]>=l[0]&&b[1]>=l[1]&&b[2]<=l[2]&&b[3]<=l[3]);
  let pending=null;
  async function load(b){if(covered(b))return zones;if(pending){await pending.catch(()=>{});if(covered(b))return zones}pending=_load(b);return pending}
  async function _load(b){busy=true;
    try{const q=`[out:json][timeout:40];(way["boundary"="limited_traffic_zone"](${b[1]},${b[0]},${b[3]},${b[2]});relation["boundary"="limited_traffic_zone"](${b[1]},${b[0]},${b[3]},${b[2]}););out geom qt;`;
      const j=await API.overpass(q,45000);for(const z of parse(j))seen.set(z.id,z);loaded.push(b);zones=[...seen.values()];draw()}catch(e){}finally{busy=false;pending=null}return zones}
  // zone attraversate dal percorso, con il punto d'ingresso
  function onRoute(r){const P=G.prep(r.coords);const out=[];
    for(const z of zones){let entry=null;for(let i=0;i<P.g.length;i++){const p=P.g[i];if(inside(z,p[1],p[0])){entry={i,along:P.cum[i],lat:p[0],lon:p[1]};break}}if(entry&&entry.along>30)out.push({z,entry});else if(entry&&i0Inside(z,P))out.push({z,entry,start:true})}
    return out.sort((a,b)=>a.entry.along-b.entry.along)}
  const i0Inside=(z,P)=>inside(z,P.g[0][1],P.g[0][0]);
  /* ---------- mappa ---------- */
  function ensure(){const map=MapView.map;if(!map||!MapView.ready)return false;if(!map.getSource('ztl'))map.addSource('ztl',{type:'geojson',data:EMPTY});
    if(!map.getLayer('ztl-fill'))map.addLayer({id:'ztl-fill',type:'fill',source:'ztl',minzoom:11,paint:{'fill-color':'#FF3B30','fill-opacity':['interpolate',['linear'],['zoom'],11,0.05,15,0.1]}});
    if(!map.getLayer('ztl-line'))map.addLayer({id:'ztl-line',type:'line',source:'ztl',minzoom:11,layout:{'line-join':'round'},paint:{'line-color':'#FF3B30','line-width':['interpolate',['linear'],['zoom'],11,1.5,16,3.5],'line-dasharray':[3,1.5],'line-opacity':0.85}});
    if(!map.getLayer('ztl-lab'))map.addLayer({id:'ztl-lab',type:'symbol',source:'ztl',minzoom:13,layout:{'text-field':['concat','ZTL · ',['get','name']],'text-size':12,'text-font':['Noto Sans Bold'],'symbol-placement':'line','text-max-angle':30},paint:{'text-color':'#FF3B30','text-halo-color':App.isDark()?'#000':'#fff','text-halo-width':1.5}});
    return true}
  function draw(){if(!ensure())return;MapView.map.getSource('ztl').setData({type:'FeatureCollection',features:zones.map(z=>({type:'Feature',geometry:{type:'Polygon',coordinates:z.rings},properties:{name:z.name}}))})}
  App.on('mapReady',()=>{draw();const m=MapView.map;if(!m)return;let t=0;m.on('moveend',()=>{clearTimeout(t);t=setTimeout(()=>{if(m.getZoom()<11.5)return;const b=m.getBounds();load([b.getWest()-0.05,b.getSouth()-0.05,b.getEast()+0.05,b.getNorth()+0.05])},900)})});
  /* ---------- nel piano del viaggio ---------- */
  App.on('planBody',async({route,box})=>{if(!box||route.ped)return;const P=G.prep(route.coords);const b=[P.b[1]-0.03,P.b[0]-0.03,P.b[3]+0.03,P.b[2]+0.03];
    if((b[2]-b[0])*(b[3]-b[1])<6)await load(b);else{const end=route.coords[route.coords.length-1];await load([end[1]-0.08,end[0]-0.08,end[1]+0.08,end[0]+0.08])}
    if(Plan.route!==route)return;const hits=onRoute(route).filter(h=>!h.start);let el=box.querySelector('#ztlBox');if(!el){box.insertAdjacentHTML('afterbegin','<div id="ztlBox"></div>');el=box.querySelector('#ztlBox')}
    if(!hits.length){el.innerHTML='';return}
    el.innerHTML=`<div class="group ztlwarn">${hits.map(h=>App.UI.item({color:'#FF3B30',icon:'<b style="font-size:11px">ZTL</b>',t1:`Il percorso entra nella ZTL ${esc(h.z.name)}`,t2:`dopo ${F.km(h.entry.along)}${h.z.hours?' · '+esc(h.z.hours.slice(0,60)):''}`,cls:'wrap'})).join('')}
      <button class="btn wide" id="ztlAvoid" style="color:var(--red)">Ricalcola evitando la ZTL</button></div>
      <p class="note">Le ZTL vengono da OpenStreetMap: orari e permessi cambiano, controlla sempre i cartelli e i varchi.</p>`;
    el.querySelector('#ztlAvoid').onclick=()=>{App.state.avoidZtl=hits.map(h=>h.z);Plan.compute();App.toast('Ricalcolo senza ZTL')}});
  // il ricalcolo esclude le zone scelte (solo Valhalla accetta le aree da evitare)
  const _route=API.route;API.route=(stops,o={})=>{const av=App.state.avoidZtl;if(av&&av.length&&!o.pedestrian)o=Object.assign({},o,{exclude:av.flatMap(z=>z.rings.map(r=>r.length>120?r.filter((p,i)=>i%Math.ceil(r.length/120)===0||i===r.length-1):r))});return _route(stops,o)};
  App.on('plan',()=>{if(!Plan.st.routes.length&&!Nav.active)App.state.avoidZtl=null});
  /* ---------- avvisi più avanti ---------- */
  Ahead.add(ctx=>{if(!zones.length)return [];const {f,hd,nav,along}=ctx;const out=[];const sp=f.spd||0;
    for(const z of zones){if(inside(z,f.lon,f.lat)){out.push({id:'ztlin'+z.id,kind:'closure',color:'#FF3B30',icon:'<b style="font-size:11px;color:#fff">ZTL</b>',t1:'Sei nella ZTL',t2:z.name,d:0,show:true});continue}
      let d=null;
      if(nav&&Nav.route){const P=ctx.P;if(P){const s0=G.idxAt(P,along);for(let i=s0;i<P.g.length&&P.cum[i]-along<1200;i++){if(inside(z,P.g[i][1],P.g[i][0])){d=P.cum[i]-along;break}}}}
      else if(hd!=null&&sp>2){for(let s=40;s<=500;s+=40){const q=G.dest(f.lat,f.lon,hd,s);if(inside(z,q[1],q[0])){d=s;break}}}
      if(d!=null)out.push({id:'ztl'+z.id,kind:'closure',color:'#FF3B30',icon:'<b style="font-size:11px;color:#fff">ZTL</b>',t1:'ZTL '+z.name,t2:z.hours?z.hours.slice(0,50):'Controlla il varco',d,prio:2,showAt:900,sayAt:Math.max(250,sp*15),say:`Attenzione, ZTL tra ${F.speakDist(d)}`})}
    return out});
  App.on('tick',({f})=>{if(!S.ztlOn&&S.ztlOn!==undefined)return;const k=Math.floor(f.lat*20)+'_'+Math.floor(f.lon*20);if(k!==App.state.ztlTile){App.state.ztlTile=k;load([f.lon-0.06,f.lat-0.05,f.lon+0.06,f.lat+0.05])}});
  return {load,onRoute,inside,get zones(){return zones}};
})();
