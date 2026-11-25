/* Sentinella — servizi esterni: Valhalla (percorsi), Photon (ricerca), Overpass (punti di interesse), OSRM (riserva). */
'use strict';
const API = App.API = (()=>{
  const VAL = ['https://valhalla1.openstreetmap.de'];
  const OVP = ['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter'];
  const PHOTON = 'https://photon.komoot.io';
  const OSRM = 'https://routing.openstreetmap.de/routed-car';

  async function tfetch(url,opt={},ms=15000){const ac=new AbortController();const t=setTimeout(()=>ac.abort(),ms);try{return await fetch(url,Object.assign({},opt,{signal:ac.signal}))}finally{clearTimeout(t)}}
  async function vpost(path,body,ms=20000){let err;for(const b of VAL){try{const r=await tfetch(b+'/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},ms);const j=await r.json();if(j.error&&!j.trip&&!Array.isArray(j))throw Object.assign(new Error(j.error),{code:j.error_code});return j}catch(e){err=e}}throw err}

  /* ---- Overpass con coda e attesa progressiva (il server pubblico è spesso saturo) ---- */
  let ovBusyUntil=0,ovIdx=0;
  async function overpass(q,ms=60000){
    if(Date.now()<ovBusyUntil)throw new Error('busy');
    let err;for(let k=0;k<OVP.length;k++){const url=OVP[(ovIdx+k)%OVP.length];
      try{const r=await tfetch(url,{method:'POST',body:'data='+encodeURIComponent(q),headers:{'Content-Type':'application/x-www-form-urlencoded'}},ms);
        if(r.status===429||r.status>=500){err=new Error('HTTP '+r.status);continue}
        const j=await r.json();ovIdx=(ovIdx+k)%OVP.length;return j}catch(e){err=e}}
    ovBusyUntil=Date.now()+60000;throw err}

  /* ---- Photon ---- */
  const placeFromPhoton=f=>{const p=f.properties,c=f.geometry.coordinates;
    const type=App.TYPE_IT[p.osm_value]||App.TYPE_IT[p.type]||'';
    const street=[p.street,p.housenumber].filter(Boolean).join(' ');
    const addr=[street,p.city||p.town||p.village||p.locality||p.district,p.county&&p.county!==p.city?p.county:null].filter(Boolean).join(', ');
    const name=p.name||street||p.city||'Luogo';
    return {id:p.osm_type&&p.osm_id?p.osm_type+p.osm_id:'p'+c.join(','),osm:p.osm_type&&p.osm_id?{t:{N:'node',W:'way',R:'relation'}[p.osm_type],id:p.osm_id}:null,
      name,type,addr:name===street?[p.city,p.county].filter(Boolean).join(', '):addr,lat:c[1],lon:c[0],key:p.osm_key,val:p.osm_value,tags:{[p.osm_key]:p.osm_value}}};
  async function search(q,near,limit=12){
    const u=new URL(PHOTON+'/api/');u.searchParams.set('q',q);u.searchParams.set('limit',limit);
    if(near){u.searchParams.set('lat',near.lat.toFixed(4));u.searchParams.set('lon',near.lon.toFixed(4));u.searchParams.set('location_bias_scale','0.3')}
    const r=await tfetch(u,{},9000);const j=await r.json();return (j.features||[]).map(placeFromPhoton)}
  async function reverse(lat,lon){const r=await tfetch(`${PHOTON}/reverse?lat=${lat}&lon=${lon}&limit=1`,{},8000);const j=await r.json();const f=(j.features||[])[0];return f?placeFromPhoton(f):null}
  async function osmTags(osm){if(!osm)return null;try{const r=await tfetch(`https://api.openstreetmap.org/api/0.6/${osm.t}/${osm.id}.json`,{},8000);const j=await r.json();const e=(j.elements||[])[0];return e?e.tags||{}:null}catch(e){return null}}

  /* ---- POI per categoria (vicino o lungo il percorso) ---- */
  const toPlace=e=>{const t=e.tags||{};const lat=e.lat??(e.center&&e.center.lat),lon=e.lon??(e.center&&e.center.lon);
    const cat=App.catOf(t);const street=[t['addr:street'],t['addr:housenumber']].filter(Boolean).join(' ');
    return {id:e.type[0].toUpperCase()+e.id,osm:{t:e.type,id:e.id},name:t.name||t.brand||t.operator||(cat?cat.l.replace(/i$/,'o'):'Luogo'),type:App.TYPE_IT[t.amenity||t.shop||t.tourism||t.highway]||(cat?cat.l:''),addr:[street,t['addr:city']].filter(Boolean).join(', '),lat,lon,tags:t,cat:cat&&cat.k}};
  /* più fonti in parallelo: vince la prima che risponde con dei risultati */
  const firstOk=ps=>new Promise((res,rej)=>{let left=ps.length,errs=[];ps.forEach(p=>p.then(v=>{if(v&&v.length)res(v);else if(--left===0)rej(errs)},e=>{errs.push(e);if(--left===0)rej(errs)}))});
  const dedupe=list=>{const out=[];for(const p of list){if(p.lat==null)continue;if(!out.some(o=>o.id===p.id||(G.dist(o.lat,o.lon,p.lat,p.lon)<25&&o.name===p.name)))out.push(p)}return out};
  async function photonCat(cat,lat,lon,radiusKm,limit=40){
    const calls=(cat.ph||[]).map(tag=>tfetch(`${PHOTON}/reverse?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&radius=${radiusKm}&limit=${limit}&osm_tag=${encodeURIComponent(tag)}`,{},9000).then(r=>r.ok?r.json():{features:[]}).then(j=>(j.features||[]).map(f=>{const p=placeFromPhoton(f);p.cat=cat.k;if(!p.name||p.name==='Luogo')p.name=cat.l.replace(/i$/,'o');return p})).catch(()=>[]));
    return dedupe((await Promise.all(calls)).flat())}
  async function nominatimCat(cat,lat,lon,km){const dl=km/111,dn=km/(111*Math.cos(G.rad(lat)));
    const u=`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cat.nm)}&format=jsonv2&limit=40&extratags=1&addressdetails=1&bounded=1&viewbox=${(lon-dn).toFixed(4)},${(lat+dl).toFixed(4)},${(lon+dn).toFixed(4)},${(lat-dl).toFixed(4)}`;
    const r=await tfetch(u,{headers:{'Accept-Language':'it'}},10000);const j=await r.json();
    return (j||[]).map(x=>{const t=Object.assign({[x.category]:x.type},x.extratags||{});const a=x.address||{};return {id:(x.osm_type||'n')[0].toUpperCase()+x.osm_id,osm:{t:x.osm_type,id:x.osm_id},name:x.name||cat.l,type:App.TYPE_IT[x.type]||cat.l,addr:[[a.road,a.house_number].filter(Boolean).join(' '),a.city||a.town||a.village].filter(Boolean).join(', '),lat:+x.lat,lon:+x.lon,tags:t,cat:cat.k}})}
  async function overpassCat(cat,lat,lon,radius){const q=`[out:json][timeout:20];${cat.q}(around:${radius},${lat.toFixed(5)},${lon.toFixed(5)});out center tags 80;`;
    const j=await overpass(q,14000);return j.elements.map(toPlace).filter(p=>p.lat!=null)}
  async function poisNear(cat,lat,lon,radius=4000){
    const km=radius/1000;
    try{return await firstOk([overpassCat(cat,lat,lon,radius),photonCat(cat,lat,lon,km)])}
    catch(e){/* ultimo tentativo: raggio più ampio e Nominatim */}
    const v=await firstOk([photonCat(cat,lat,lon,Math.max(10,km*3)),nominatimCat(cat,lat,lon,Math.max(5,km*2))]);return v}
  async function poisAlong(cat,pts,radius=600){
    const line=pts.map(p=>p[0].toFixed(4)+','+p[1].toFixed(4)).join(',');
    const ov=overpass(`[out:json][timeout:30];${cat.q}(around:${radius},${line});out center tags 120;`,25000).then(j=>j.elements.map(toPlace).filter(p=>p.lat!=null));
    // Photon: punti campione lungo il percorso (max 12)
    const P=G.prep(pts);const n=Math.min(12,Math.max(2,Math.ceil(P.len/8000)));const samples=[];for(let i=0;i<n;i++){const q=G.pointAt(P,P.len*(i+0.5)/n);samples.push(q)}
    const rk=Math.max(1,Math.min(5,P.len/n/2000));
    const ph=Promise.all(samples.map(q=>photonCat(cat,q.lat,q.lon,rk,20))).then(r=>dedupe(r.flat()).filter(p=>G.proj(p.lat,p.lon,P).d<Math.max(radius,800)));
    return firstOk([ov,ph])}

  /* ---- Valhalla ---- */
  function costing(o){const a={use_tolls:o.avoidTolls?0:0.5,use_highways:o.avoidHighways?0:1,use_ferry:o.avoidFerries?0:0.5};if(o.avoidTolls)a.exclude_tolls=true;if(o.avoidFerries)a.exclude_ferries=true;return a}
  async function route(stops,o={}){
    const locs=stops.map((s,i)=>{const L={lat:s.lat,lon:s.lon,type:'break'};if(i===0&&s.heading!=null){L.heading=Math.round(s.heading);L.heading_tolerance=60}return L});
    const body={locations:locs,costing:o.pedestrian?'pedestrian':'auto',costing_options:o.pedestrian?{}:{auto:costing(o)},language:'it-IT',units:'kilometers',directions_options:{units:'kilometers',language:'it-IT'}};if(o.exclude&&o.exclude.length)body.exclude_polygons=o.exclude;
    if(o.alternates&&stops.length===2)body.alternates=o.alternates;
    const j=await vpost('route',body,25000);
    const trips=[j.trip].concat((j.alternates||[]).map(a=>a.trip)).filter(Boolean);
    return trips.map(t=>parseTrip(t,o.pedestrian))}
  async function optimize(stops){const body={locations:stops.map(s=>({lat:s.lat,lon:s.lon})),costing:'auto',units:'kilometers',language:'it-IT'};
    const j=await vpost('optimized_route',body,30000);return (j.trip.locations||[]).map(l=>l.original_index)}
  function parseTrip(t,ped){
    const coords=[],man=[];let off=0;const legs=[];
    t.legs.forEach((leg,li)=>{const pts=G.decode(leg.shape,6);const base=coords.length?coords.length-1:0;
      pts.forEach((p,i)=>{if(i===0&&coords.length)return;coords.push(p)});
      const lm=leg.maneuvers.map(m=>({type:m.type,text:m.instruction,alert:m.verbal_transition_alert_instruction||'',pre:m.verbal_pre_transition_instruction||m.instruction,post:m.verbal_post_transition_instruction||'',
        succ:m.verbal_succinct_transition_instruction||'',len:m.length*1000,time:m.time,i:base+m.begin_shape_index,ie:base+m.end_shape_index,street:(m.street_names||m.begin_street_names||[]).join(' · '),
        begin:(m.begin_street_names||[]).join(' · '),toll:!!m.toll,hw:!!m.highway,ferry:!!m.ferry,exits:m.roundabout_exit_count||0,sign:m.sign||null,leg:li}));
      man.push(...lm);legs.push({shape:leg.shape,base,n:pts.length,len:leg.summary.length*1000,time:leg.summary.time})});
    return {coords,man,legs,dist:t.summary.length*1000,time:t.summary.time,hasToll:!!t.summary.has_toll,hasHw:!!t.summary.has_highway,hasFerry:!!t.summary.has_ferry,ped:!!ped,src:'valhalla'}}
  // limiti di velocità lungo il percorso (per ogni tratto)
  async function routeLimits(rt){const out=[];
    for(const leg of rt.legs){try{const j=await vpost('trace_attributes',{encoded_polyline:leg.shape,shape_match:'edge_walk',costing:'auto',filters:{attributes:['edge.speed_limit','edge.road_class','edge.begin_shape_index','edge.end_shape_index','edge.names','edge.use'],action:'include'}},25000);
      for(const e of (j.edges||[]))out.push({i0:leg.base+e.begin_shape_index,i1:leg.base+e.end_shape_index,lim:e.speed_limit||0,cls:e.road_class,use:e.use,name:(e.names||[]).join(' · ')})}catch(e){}}
    return out}
  // limite e strada nel punto (guida libera)
  async function locate(lat,lon,heading){const j=await vpost('locate',{locations:[{lat,lon}],costing:'auto',verbose:true},8000);
    const edges=(j[0]&&j[0].edges)||[];if(!edges.length)return null;
    let best=edges[0];if(heading!=null){best=edges.slice().sort((a,b)=>(G.adiff(a.heading,heading)+a.distance*2)-(G.adiff(b.heading,heading)+b.distance*2))[0]}
    const info=best.edge_info||{},ed=best.edge||{};
    return {lim:info.speed_limit||0,name:(info.names||[]).join(' · '),cls:ed.classification&&ed.classification.classification,dist:best.distance,heading:best.heading}}

  /* ---- OSRM (riserva se Valhalla non risponde) ---- */
  const OSRM_IT={turn:{left:'Svolta a sinistra','slight left':'Tieni la sinistra','sharp left':'Svolta stretta a sinistra',right:'Svolta a destra','slight right':'Tieni la destra','sharp right':'Svolta stretta a destra',straight:'Prosegui dritto',uturn:'Fai inversione'}};
  const FREE=/^(A2|A3|A18dir|A19|A20|A29|A90|A91|RA\d+|A1dir)$/;
  async function routeOSRM(stops,o={}){
    const coords=stops.map(s=>s.lon.toFixed(6)+','+s.lat.toFixed(6)).join(';');
    const r=await tfetch(`${OSRM}/route/v1/driving/${coords}?overview=full&geometries=polyline6&steps=true&alternatives=${stops.length===2}`,{},20000);const j=await r.json();
    if(j.code!=='Ok')throw new Error(j.code);
    return j.routes.map(rt=>{const coordsAll=G.decode(rt.geometry,6);const P=G.prep(coordsAll);const man=[];
      rt.legs.forEach((leg,li)=>leg.steps.forEach(st=>{const m=st.maneuver,mod=m.modifier||'straight';const nm=st.name||st.ref||'';
        let text;if(m.type==='depart')text='Parti'+(nm?' su '+nm:'');else if(m.type==='arrive')text=li<rt.legs.length-1?'Hai raggiunto la tappa':'Sei arrivato a destinazione';
        else if(m.type==='roundabout'||m.type==='rotary')text=`Alla rotonda prendi la ${m.exit||1}ª uscita`+(nm?' per '+nm:'');
        else if(m.type==='merge')text='Immettiti'+(nm?' su '+nm:'');else if(m.type==='on ramp')text='Prendi la rampa'+(nm?' per '+nm:'');else if(m.type==='off ramp')text='Prendi l\'uscita'+(nm?' per '+nm:'');
        else if(m.type==='fork')text=(/left/.test(mod)?'Tieni la sinistra':'Tieni la destra')+(nm?' verso '+nm:'');
        else text=(OSRM_IT.turn[mod]||'Prosegui')+(nm?' su '+nm:'');
        const i=G.proj(m.location[1],m.location[0],P).i;const ref=(st.ref||'').split(';')[0].replace(/\s/g,'');
        man.push({type:m.type==='arrive'?4:m.type==='depart'?1:/left/.test(mod)?15:/right/.test(mod)?10:8,text,alert:text,pre:text,post:'',succ:'',len:st.distance,time:st.duration,i,street:nm,begin:nm,toll:/^A\d/.test(ref)&&!FREE.test(ref),hw:/^A\d/.test(ref),exits:m.exit||0,leg:li})}));
      return {coords:coordsAll,man,legs:rt.legs.map(l=>({shape:null,base:0,len:l.distance,time:l.duration})),dist:rt.distance,time:rt.duration,hasToll:man.some(x=>x.toll),hasHw:man.some(x=>x.hw),src:'osrm'}})}

  return {overpass,search,reverse,osmTags,poisNear,poisAlong,route,optimize,routeLimits,locate,routeOSRM,tfetch};
})();
