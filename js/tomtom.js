/* Sentinella — servizi TomTom gratuiti (chiave dell'utente): percorsi con traffico in tempo reale, «fin dove arrivo» (Reachable Range),
   ricerca di indirizzi e civici più precisa (Places Search), nomi delle strade (Reverse Geocoding).
   Ogni servizio ha un contatore mensile: arrivato al 95% della quota gratuita Sentinella torna da sola ai servizi liberi (Valhalla, Photon). */
'use strict';
const TT = App.TT = (()=>{
  const S=App.S,BASE='https://api.tomtom.com';
  // quote gratuite mensili (pagina prezzi TomTom, novembre 2026)
  const Q={route:20000,range:2500,suggest:10000,details:5000,rev:20000,inc:2500};
  const LBL={route:'Percorsi con traffico',inc:'Incidenti',suggest:'Ricerca (suggerimenti)',details:'Ricerca (dettagli)',rev:'Nomi delle strade',range:'Fin dove arrivo'};
  const month=()=>{const d=new Date();return d.getFullYear()+'-'+(d.getMonth()+1)};
  let U=Store.get('ttUse',{m:month(),c:{}});
  const roll=()=>{if(U.m!==month()){U={m:month(),c:{}};Store.set('ttUse',U)}};
  function can(k,n=1){if(!S.tomtomKey)return false;roll();return (U.c[k]||0)+n<=Q[k]*0.95}
  function use(k,n=1){roll();U.c[k]=(U.c[k]||0)+n;Store.set('ttUse',U)}
  const key=()=>encodeURIComponent(S.tomtomKey);

  /* =================== PERCORSI CON TRAFFICO =================== */
  const TYPE={DEPART:1,ARRIVE:4,ARRIVE_LEFT:4,ARRIVE_RIGHT:4,WAYPOINT_LEFT:4,WAYPOINT_RIGHT:4,WAYPOINT_REACHED:4,STRAIGHT:8,FOLLOW:8,KEEP_RIGHT:23,KEEP_LEFT:24,BEAR_RIGHT:9,BEAR_LEFT:16,
    TURN_RIGHT:10,TURN_LEFT:15,SHARP_RIGHT:11,SHARP_LEFT:14,MAKE_UTURN:13,TRY_MAKE_UTURN:13,ENTER_MOTORWAY:25,ENTER_FREEWAY:25,ENTER_HIGHWAY:25,ENTRANCE_RAMP:25,TAKE_EXIT:20,MOTORWAY_EXIT_RIGHT:20,
    MOTORWAY_EXIT_LEFT:21,ROUNDABOUT_CROSS:26,ROUNDABOUT_RIGHT:26,ROUNDABOUT_LEFT:26,ROUNDABOUT_BACK:26,TAKE_FERRY:28,SWITCH_PARALLEL_ROAD:22,SWITCH_MAIN_ROAD:22};
  async function route(stops,o={}){
    const fun=S.funRoute&&!o.pedestrian;
    const p=new URLSearchParams({key:S.tomtomKey,traffic:'true',travelMode:'car',routeType:fun?'thrilling':'fastest',instructionsType:'text',language:'it-IT',routeRepresentation:'polyline',computeTravelTimeFor:'all'});
    if(fun){p.set('hilliness','normal');p.set('windingness','high')}
    if(o.alternates&&stops.length===2&&!fun)p.set('maxAlternatives',String(Math.min(2,o.alternates)));
    for(const x of ['toll','motorway','traffic','ferry'])p.append('sectionType',x);
    if(o.avoidTolls)p.append('avoid','tollRoads');if(o.avoidHighways||fun)p.append('avoid','motorways');if(o.avoidFerries)p.append('avoid','ferries');
    if(stops[0].heading!=null)p.set('vehicleHeading',String(Math.round((stops[0].heading+360)%360)));
    const locs=stops.map(s=>s.lat.toFixed(6)+','+s.lon.toFixed(6)).join(':');
    use('route');const r=await API.tfetch(`${BASE}/routing/1/calculateRoute/${locs}/json?${p}`,{},20000);const j=await r.json();
    if(!r.ok||!j.routes||!j.routes.length)throw new Error((j.detailedError&&j.detailedError.message)||(j.error&&j.error.description)||'TomTom '+r.status);
    return j.routes.map(parse)}
  function parse(rt){const coords=[],legs=[];
    rt.legs.forEach(L=>{const pts=L.points.map(q=>[q.latitude,q.longitude]);const b=coords.length;for(const q of pts)coords.push(q);legs.push({shape:G.encode(pts,6),base:b,n:pts.length,len:L.summary.lengthInMeters,time:L.summary.travelTimeInSeconds})});
    const P=G.prep(coords);const secs=rt.sections||[];const inSec=(t,a,b)=>secs.some(s=>s.sectionType===t&&s.startPointIndex<b&&s.endPointIndex>a);
    // punto della manovra sul percorso: cerco in avanti dal precedente (gli indici TomTom possono contare i doppioni tra le tappe)
    let last=0;const near=(lat,lon)=>{let bi=last,bd=1e12;for(let i=last;i<Math.min(coords.length,last+4000);i++){const d=(coords[i][0]-lat)**2+(coords[i][1]-lon)**2;if(d<bd){bd=d;bi=i}if(bd<1e-12)break}last=bi;return bi};
    const ins=(rt.guidance&&rt.guidance.instructions)||[];const man=[];
    ins.forEach((it,k)=>{const nx=ins[k+1];const i=near(it.point.latitude,it.point.longitude);const t=TYPE[it.maneuver]||8;
      const street=it.street||(it.roadNumbers||[]).join(' · ')||'';const txt=(it.message||it.combinedMessage||'Prosegui').replace(/<[^>]+>/g,'');
      let leg=0;for(let li=0;li<legs.length;li++)if(legs[li].base<=i)leg=li;
      man.push({type:t,text:txt,alert:txt,pre:txt,post:'',succ:'',len:nx?nx.routeOffsetInMeters-it.routeOffsetInMeters:0,time:nx?nx.travelTimeInSeconds-it.travelTimeInSeconds:0,i,ie:i,street,begin:street,toll:false,hw:false,ferry:false,exits:it.roundaboutExitNumber||(it.exitNumber&&+it.exitNumber)||0,sign:it.signpostText?{text:it.signpostText}:null,leg})});
    for(let k=0;k<man.length;k++){const m=man[k];m.ie=k<man.length-1?man[k+1].i:coords.length-1;m.toll=inSec('TOLL_ROAD',m.i,m.ie)||inSec('TOLL',m.i,m.ie);m.hw=inSec('MOTORWAY',m.i,m.ie);m.ferry=inSec('FERRY',m.i,m.ie)}
    const jams=secs.filter(s=>s.sectionType==='TRAFFIC').map(s=>({a:P.cum[Math.min(s.startPointIndex,coords.length-1)],b:P.cum[Math.min(s.endPointIndex,coords.length-1)],i0:s.startPointIndex,i1:s.endPointIndex,cat:s.simpleCategory,delay:s.delayInSeconds||0,mag:s.magnitudeOfDelay||0,kmh:s.effectiveSpeedInKmh}));
    const sm=rt.summary;
    return {coords,man,legs,dist:sm.lengthInMeters,time:sm.travelTimeInSeconds,hasToll:man.some(m=>m.toll),hasHw:man.some(m=>m.hw),hasFerry:man.some(m=>m.ferry),ped:false,src:'tomtom',
      traffic:{delay:sm.trafficDelayInSeconds||0,free:sm.noTrafficTravelTimeInSeconds||sm.travelTimeInSeconds,jams}}}
  // TomTom come prima scelta quando c'è la chiave; altrimenti, o se non risponde, Valhalla come prima
  const _route=API.route;
  API.route=async(stops,o={})=>{if(!o.pedestrian&&can('route')){try{return await route(stops,o)}catch(e){console.warn('TomTom routing',e)}}return _route(stops,o)};
  // etichetta del traffico sulle schede dei percorsi
  App.on('plan',()=>{for(const r of Plan.st.routes){if(!r.traffic||r._ttTag)continue;r._ttTag=true;const d=r.traffic.delay;
    r.tags.push(d>=180?['Traffico +'+F.dur(d),d>=900?'red':'orange']:['Traffico scorrevole','green'])}});

  /* ---- code sulla linea del percorso (solo davanti alla freccia in navigazione) ---- */
  const EMPTY={type:'FeatureCollection',features:[]};let jamData=EMPTY,bound=false;
  function ensure(){const map=MapView.map;if(!map||!MapView.ready)return false;if(!map.getSource('ttjam'))map.addSource('ttjam',{type:'geojson',data:jamData});
    if(!map.getLayer('ttjam-line'))map.addLayer({id:'ttjam-line',type:'line',source:'ttjam',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['match',['get','m'],4,'#7F1D1D',3,'#D70015',2,'#FF3B30','#FF9500'],'line-width':['interpolate',['linear'],['zoom'],8,2.5,16,6.5]}});
    return true}
  function drawJams(r,from=0){if(!r||!r.traffic||!r.traffic.jams.length){jamData=EMPTY}else{const P=G.prep(r.coords);
      jamData={type:'FeatureCollection',features:r.traffic.jams.filter(j=>j.b>from+20).map(j=>{const a=Math.max(j.a,from);const i0=G.idxAt(P,a),i1=Math.min(r.coords.length-1,j.i1);
        const pa=G.pointAt(P,a);const g=[[pa.lon,pa.lat]].concat(r.coords.slice(i0+1,i1+1).map(q=>[q[1],q[0]]));return g.length>1?{type:'Feature',geometry:{type:'LineString',coordinates:g},properties:{m:j.mag}}:null}).filter(Boolean)}}
    if(ensure())MapView.map.getSource('ttjam').setData(jamData)}
  App.on('mapReady',()=>{ensure();drawJams(Nav.active?Nav.route:Plan.route,Nav.active?Nav.along():0)});
  App.on('plan',()=>{if(!Nav.active)drawJams(Plan.st.routes.length?Plan.route:null)});
  App.on('navStart',()=>drawJams(Nav.route,0));App.on('navReroute',()=>drawJams(Nav.route,0));App.on('navEnd',()=>drawJams(null));
  let lastJ=0;App.on('tick',()=>{if(Nav.active&&Nav.route&&Nav.route.traffic&&Date.now()-lastJ>3000){lastJ=Date.now();drawJams(Nav.route,Nav.along())}});
  // avvisi delle code più avanti (dal percorso stesso: non consuma richieste in più)
  Ahead.add(ctx=>{if(!ctx.nav||!Nav.route||!Nav.route.traffic)return [];const out=[];
    for(const j of Nav.route.traffic.jams){const d=j.a-ctx.along;const inside=ctx.along>=j.a&&ctx.along<=j.b;if(!inside&&(d<0||d>5000))continue;const big=j.mag>=3||j.delay>=300;
      const l=j.cat==='ROAD_CLOSURE'?'Strada chiusa':j.cat==='ROAD_WORK'?'Lavori in corso':'Coda';
      out.push({id:'tj'+Math.round(j.a),kind:'traffic',color:App.KINDS.traffic.c,icon:FX.glyph(j.cat==='ROAD_CLOSURE'?'closure':j.cat==='ROAD_WORK'?'hazard':'traffic',22),t1:inside?l+' in corso':l,t2:`${F.km(j.b-Math.max(j.a,ctx.along))}${j.delay?' · +'+F.dur(j.delay):''}${j.kmh?' · '+j.kmh+' km/h':''}`,d:inside?0:d,show:inside,prio:big?2:1,showAt:3000,sayAt:Math.max(1500,(ctx.f.spd||0)*70),say:`${l} tra ${F.speakDist(d)}${j.delay>=60?', ritardo '+F.dur(j.delay):''}`})}
    return out});

  /* =================== FIN DOVE ARRIVO =================== */
  const RANGE_EMPTY={type:'FeatureCollection',features:[]};let rangeData=RANGE_EMPTY;
  function ensureRange(){const map=MapView.map;if(!map||!MapView.ready)return false;if(!map.getSource('range'))map.addSource('range',{type:'geojson',data:rangeData});
    if(!map.getLayer('range-fill'))map.addLayer({id:'range-fill',type:'fill',source:'range',paint:{'fill-color':'#0A84FF','fill-opacity':0.12}});
    if(!map.getLayer('range-line'))map.addLayer({id:'range-line',type:'line',source:'range',layout:{'line-join':'round'},paint:{'line-color':'#0A84FF','line-width':2.5,'line-dasharray':[2,1.2]}});return true}
  function drawRange(ring){rangeData=ring?{type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[ring]},properties:{}}]}:RANGE_EMPTY;if(ensureRange())MapView.map.getSource('range').setData(rangeData)}
  App.on('mapReady',()=>{ensureRange()});
  async function reach(lat,lon,mode,val){const v=App.vehicle();const ev=v.fuel==='elettrica';
    const p=new URLSearchParams({key:S.tomtomKey,traffic:'true',routeType:'fastest',travelMode:'car'});
    if(mode==='time')p.set('timeBudgetInSec',String(Math.round(val*60)));
    else{const pairs=`50,${v.urb}:90,${v.ext}:130,${v.aut}`;if(ev){p.set('vehicleEngineType','electric');p.set('energyBudgetInkWh',val.toFixed(1));p.set('constantSpeedConsumptionInkWhPerHundredkm',pairs)}else{p.set('fuelBudgetInLiters',val.toFixed(1));p.set('constantSpeedConsumptionInLitersPerHundredkm',pairs)}}
    use('range');const r=await API.tfetch(`${BASE}/routing/1/calculateReachableRange/${lat.toFixed(6)},${lon.toFixed(6)}/json?${p}`,{},20000);const j=await r.json();
    if(!r.ok||!j.reachableRange)throw new Error((j.detailedError&&j.detailedError.message)||(j.error&&j.error.description)||'TomTom '+r.status);
    return j.reachableRange.boundary.map(q=>[q.longitude,q.latitude])}
  // senza chiave: stima a cerchio (le strade allungano il tragitto di circa un quarto)
  function circle(lat,lon,km){const out=[];for(let a=0;a<=360;a+=6){const q=G.dest(lat,lon,a,km*1000*0.78);out.push([q[1],q[0]])}return out}
  let rState={mode:'fuel',pct:20,min:30};
  App.UI.R.range=()=>{const v=App.vehicle();const ev=v.fuel==='elettrica';const tank=v.tank||(ev?55:45);const unit=ev?'kWh':'l';const amount=tank*rState.pct/100;
    const mix=(v.urb*0.3+v.ext*0.4+v.aut*0.3)||6;const km=amount/mix*100;
    return {detent:'half',html:`${App.UI.hdr('Fin dove arrivo',S.tomtomKey?'Con il traffico di adesso':'Stima senza traffico')}
      <div class="seg" style="margin-bottom:12px"><button data-m="fuel" class="${rState.mode==='fuel'?'on':''}">${ev?'Batteria':'Carburante'}</button><button data-m="time" class="${rState.mode==='time'?'on':''}">Tempo</button></div>
      ${rState.mode==='fuel'?`<div class="group" style="padding:14px"><div style="display:flex;justify-content:space-between;align-items:baseline"><span>${ev?'Batteria':'Nel serbatoio'}</span><b style="font-size:22px">${rState.pct}% <small style="font-size:14px;color:var(--label2)">· ${F.n(amount,1)} ${unit}</small></b></div>
          <input type="range" min="5" max="100" step="5" value="${rState.pct}" id="rgPct" style="margin-top:10px"><p class="note" style="margin:8px 0 0">${esc(v.name)} · ${ev?'batteria':'serbatoio'} da ${tank} ${unit} · circa ${Math.round(km)} km di autonomia</p></div>`
        :`<div class="chips">${[15,30,45,60,90,120].map(m=>`<button class="chip ${rState.min===m?'on':''}" data-t="${m}">${m<60?m+' min':m/60+(m%60?',5':'')+' h'}</button>`).join('')}</div>`}
      <button class="btn primary big" id="rgGo" style="margin-top:12px">Mostra sulla mappa</button>
      <div id="rgOut"></div>
      <p class="note">${S.tomtomKey?'L\'area segue le strade vere e il traffico attuale (TomTom).':'Senza chiave TomTom è un cerchio indicativo. Con la chiave gratuita l\'area segue le strade e il traffico.'} I consumi sono quelli dell'auto scelta in «I miei veicoli».</p>`,
      bind(r){r.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{rState.mode=b.dataset.m;App.UI.render()});r.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{rState.min=+b.dataset.t;App.UI.render()});
        const s=$('#rgPct');if(s)s.oninput=()=>{rState.pct=+s.value;const a=tank*rState.pct/100;s.parentElement.querySelector('b').innerHTML=`${rState.pct}% <small style="font-size:14px;color:var(--label2)">· ${F.n(a,1)} ${unit}</small>`};
        $('#rgGo').onclick=async()=>{const me=App.UI.myPos();if(!me){App.toast('Serve la posizione');return}const out=$('#rgOut');out.innerHTML='<div class="spin"></div>';
          let ring,exact=false;try{if(can('range')){ring=await reach(me.lat,me.lon,rState.mode,rState.mode==='time'?rState.min:tank*rState.pct/100);exact=true}}catch(e){out.innerHTML=`<p class="note">TomTom non risponde (${esc(e.message)}): mostro una stima.</p>`}
          if(!ring){const kmr=rState.mode==='time'?rState.min/60*55:(tank*rState.pct/100)/mix*100;ring=circle(me.lat,me.lon,kmr)}
          drawRange(ring);let bb=[[180,90],[-180,-90]],far=0;for(const q of ring){bb[0][0]=Math.min(bb[0][0],q[0]);bb[0][1]=Math.min(bb[0][1],q[1]);bb[1][0]=Math.max(bb[1][0],q[0]);bb[1][1]=Math.max(bb[1][1],q[1]);far=Math.max(far,G.dist(me.lat,me.lon,q[1],q[0]))}
          MapView.fit(bb);if(!out.querySelector('.note'))out.innerHTML='';
          out.insertAdjacentHTML('beforeend',`<div class="group" style="margin-top:12px">${App.UI.item({color:'#0A84FF',icon:'<svg><use href="#i-route"/></svg>',t1:`Fino a ${F.km(far)} in linea d'aria`,t2:exact?'Area raggiungibile lungo le strade':'Stima indicativa'})}${rState.mode==='fuel'?App.UI.item({attr:'id="rgFuel"',color:'#FF9500',icon:App.catIcon(App.CATS.find(c=>c.k===(ev?'charge':'fuel')),18),t1:ev?'Colonnine vicino a te':'Benzinai vicino a te',t2:'Fai rifornimento prima di uscire dall\'area',chev:true}):''}</div>`);
          const fu=$('#rgFuel');if(fu)fu.onclick=()=>App.UI.show('results',{cat:ev?'charge':'fuel'})}}}};
  const _home=App.UI.home;App.UI.home=function(){drawRange(null);return _home.apply(this,arguments)};

  /* =================== RICERCA PIÙ PRECISA (indirizzi con civico) =================== */
  let sess=null,sessT=0;const sid=()=>{if(!sess||Date.now()-sessT>120000){sess=(crypto.randomUUID?crypto.randomUUID():'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)))}sessT=Date.now();return sess};
  const H=()=>({'TomTom-Api-Key':S.tomtomKey,'TomTom-Api-Version':'3','Accept-Language':'it-IT,it','Session-Id':sid(),Accept:'application/json'});
  const DAYS=['Su','Mo','Tu','We','Th','Fr','Sa'];
  function ohFromTT(list){if(!list||!list.length)return null;const byDay={};for(const d of list){const wd=new Date(d.date+'T12:00:00').getDay();if(byDay[wd]!=null)continue;byDay[wd]=(d.timeRanges||[]).map(t=>t.start+'-'+t.end).join(',')||'off'}
    const order=[1,2,3,4,5,6,0].filter(d=>byDay[d]!=null);return order.length?order.map(d=>`${DAYS[d]} ${byDay[d]}`).join('; '):null}
  async function suggest(q,near){use('suggest');const body={query:q,maxResults:5};if(near){body.origin={type:'point',coordinates:[near.lon,near.lat]};body.preferences={geometry:{type:'point',coordinates:[near.lon,near.lat]}}}
    const r=await API.tfetch(`${BASE}/maps/orbis/places/suggest`,{method:'POST',headers:Object.assign({'Content-Type':'application/json',Attributes:'results'},H()),body:JSON.stringify(body)},7000);const j=await r.json();
    if(!r.ok)throw new Error('TomTom '+r.status);return (j.results||[]).filter(x=>x.id&&/^(poi|address|street)$/.test(x.type))}
  async function details(x){use('details');const t={poi:'pois',address:'addresses',street:'streets'}[x.type];
    const r=await API.tfetch(`${BASE}/maps/orbis/places/details/${t}/${encodeURIComponent(x.id)}`,{headers:Object.assign({Attributes:'id,type,title,subtitles,position,address,poiTypes,poiBrands,openingHours,contacts'},H())},7000);const d=await r.json();if(!r.ok||!d.position)return null;
    const c=d.position.coordinates;const tags={};const oh=ohFromTT(d.openingHours);if(oh)tags.opening_hours=oh;
    const ct=(d.contacts||[])[0]||{};const ph=(ct.phones||[])[0],ws=(ct.websites||[])[0];if(ph)tags.phone=typeof ph==='string'?ph:(ph.number||ph.value||'');if(ws)tags.website=typeof ws==='string'?ws:(ws.url||ws.value||'');
    if(d.title)tags.name=d.title;
    const a=d.address||{};const addr=[[a.street,a.houseNumber].filter(Boolean).join(' '),a.municipality].filter(Boolean).join(', ')||(d.subtitles||[]).join(', ');
    return {id:'tt'+d.id,name:d.title||addr,type:d.poiTypes&&d.poiTypes[0]?d.poiTypes[0].name:(x.type==='address'?'Indirizzo':'Via'),addr:x.type==='poi'?addr:(a.municipality||''),lat:c[1],lon:c[0],tags,src:'tomtom'}}
  const _search=API.search;
  API.search=async(q,near,limit)=>{const base=_search(q,near,limit);
    // TomTom solo dove Photon è debole: indirizzi con il numero civico
    if(!(S.tomtomKey&&q.trim().length>=5&&/\d/.test(q)&&can('suggest')&&can('details',3)))return base;
    const tt=(async()=>{const s=await suggest(q,near);const out=[];for(const x of s.slice(0,3)){try{const p=await details(x);if(p)out.push(p)}catch(e){}}return out})().catch(()=>[]);
    const [b,t]=await Promise.all([base.catch(()=>[]),tt]);const res=t.slice();for(const p of b)if(!res.some(o=>G.dist(o.lat,o.lon,p.lat,p.lon)<40))res.push(p);
    if(!res.length)return base;return res.slice(0,limit||15)};

  /* =================== NOMI DELLE STRADE =================== */
  const _rev=API.reverse;
  API.reverse=async(lat,lon)=>{if(can('rev')){try{use('rev');const r=await API.tfetch(`${BASE}/search/2/reverseGeocode/${lat.toFixed(6)},${lon.toFixed(6)}.json?key=${key()}&language=it-IT&returnSpeedLimit=true&radius=60`,{},7000);const j=await r.json();
      const a=j.addresses&&j.addresses[0]&&j.addresses[0].address;if(a){const st=[a.streetName,a.streetNumber].filter(Boolean).join(' ');return {name:st||a.municipality||a.freeformAddress,addr:a.freeformAddress||'',lat,lon,type:'Indirizzo',tags:{},speedLimit:a.speedLimit||null,src:'tomtom'}}}catch(e){}}
    return _rev(lat,lon)};

  /* =================== CONSUMI NELLE IMPOSTAZIONI =================== */
  function usageHtml(){roll();const rows=Object.keys(Q).map(k=>{const n=U.c[k]||0,p=n/Q[k];return `<div class="kv"><span>${LBL[k]}</span><b style="${p>0.8?'color:var(--red)':p>0.5?'color:var(--orange)':''}">${n.toLocaleString('it-IT')} <span style="color:var(--label2);font-weight:400">/ ${Q[k].toLocaleString('it-IT')}</span></b></div>`}).join('');
    return `<div class="sec"><h3>TomTom questo mese</h3></div><div class="group">${rows}</div><p class="note">Quote gratuite mensili. Al 95% Sentinella passa da sola ai servizi liberi: non paghi mai niente.</p>`}
  const _set=App.UI.R.settings;
  App.UI.R.settings=function(a){const o=_set.apply(this,arguments);if(!o||!o.html)return o;if(S.tomtomKey)o.html=o.html.replace('<div class="sec"><h3>Recensioni e foto</h3></div>',usageHtml()+'<div class="sec"><h3>Recensioni e foto</h3></div>');
    // versione dell'app e aggiornamento forzato
    o.html+=`<div class="sec"><h3>App</h3></div><div class="group"><div class="kv"><span>Versione</span><b>${App.VERSION} · ${App.BUILD}</b></div></div>
      <button class="btn wide" id="stUpd" style="margin-top:8px">Scarica l'ultima versione</button><p class="note">Se la versione qui sopra non è l'ultima, tocca il pulsante: svuoto la copia salvata e ricarico da GitHub. Impostazioni, preferiti e viaggi restano.</p>`;
    const b0=o.bind;o.bind=function(r){if(b0)b0.apply(this,arguments);const u=$('#stUpd');if(u)u.onclick=async()=>{u.textContent='Aggiorno…';try{const ks=await caches.keys();await Promise.all(ks.filter(k=>k!=='snt-tiles').map(k=>caches.delete(k)));const rs=navigator.serviceWorker?await navigator.serviceWorker.getRegistrations():[];await Promise.all(rs.map(x=>x.unregister()))}catch(e){}location.replace(location.pathname+'?v='+Date.now())}};
    return o};

  return {can,use,route,reach,suggest,details,get usage(){roll();return U.c},Q};
})();
