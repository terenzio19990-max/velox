/* Sentinella — pianificazione: tappe, alternative, costi (carburante, pedaggi, CO2), ottimizzazione dell'ordine. */
'use strict';
const Plan = App.Plan = (()=>{
  const st={stops:[],routes:[],sel:0,loading:false,err:null,ver:0,depart:null};
  const here=()=>({name:'La mia posizione',gps:true});
  function reset(dest){st.depart=null;st.stops=[here()];if(dest)st.stops.push(dest);st.routes=[];st.sel=0;st.err=null;st.ver++}
  function resolve(s){if(s.gps){const f=App.state.fix;return f?{lat:f.lat,lon:f.lon,heading:App.state.hd,name:s.name}:null}return s}

  /* ---------- costo ---------- */
  function cost(rt,veh=App.vehicle()){let qty=0,tollKm=0,hwKm=0;
    for(const m of rt.man){const km=m.len/1000;if(km<=0)continue;let c;
      if(m.hw)c=veh.aut;else{const v=m.time>0?km/(m.time/3600):50;c=v>75?veh.ext:v<45?veh.urb:(veh.ext*0.7+veh.urb*0.3)}
      qty+=km*c/100;if(m.toll)tollKm+=km;if(m.hw)hwKm+=km}
    const F_=App.FUELS[veh.fuel]||App.FUELS.benzina;const price=App.PRICES[veh.fuel]??F_.price;
    const fuel=qty*price,toll=tollKm*(App.TOLL[veh.cls]||App.TOLL.A);const total=fuel+toll;
    const ppl=Math.max(1,App.S.people||1);const tv=(App.S.timeValue||0)*rt.time/3600;
    return {qty,unit:F_.unit,price,fuel,toll,tollKm,hwKm,total,per:total/ppl,co2:qty*F_.co2,gen:total+tv,fuelLabel:F_.label}}
  function via(rt){const agg=new Map();for(const m of rt.man){const n=(m.street||'').split(' · ').find(x=>/^(A|SS|SR|SP|E|RA|T)\s?\d/.test(x))||(m.street||'').split(' · ')[0];if(!n)continue;agg.set(n,(agg.get(n)||0)+m.len)}
    return [...agg.entries()].sort((a,b)=>b[1]-a[1]).slice(0,2).map(x=>x[0])}

  /* ---------- calcolo ---------- */
  let reqId=0;
  async function compute(){const id=++reqId;st.err=null;
    const pts=st.stops.map(resolve);if(pts.some(p=>!p)||pts.length<2){st.routes=[];st.err=pts.length<2?null:'Serve la tua posizione per partire da qui';App.emit('plan');return}
    st.loading=true;App.emit('plan');
    const o={avoidTolls:App.S.avoidTolls,avoidHighways:App.S.avoidHighways,avoidFerries:App.S.avoidFerries,alternates:2};
    let list=[];
    try{const jobs=[API.route(pts,o)];if(!o.avoidTolls&&pts.length===2)jobs.push(API.route(pts,Object.assign({},o,{avoidTolls:true,alternates:0})).catch(()=>[]));
      const res=await Promise.all(jobs);list=res.flat()}
    catch(e){try{list=await API.routeOSRM(pts,o)}catch(e2){if(id===reqId){st.loading=false;st.err='Percorso non disponibile: controlla la connessione e riprova';App.emit('plan')}return}}
    if(id!==reqId)return;
    // rimuovo i doppioni
    const uniq=[];for(const r of list){if(!uniq.some(u=>Math.abs(u.dist-r.dist)/u.dist<0.01&&Math.abs(u.time-r.time)/u.time<0.015))uniq.push(r)}
    for(const r of uniq){r.cost=cost(r);r.via=via(r);r.tags=[]}
    uniq.sort((a,b)=>a.time-b.time);
    if(uniq.length){uniq[0].tags.push(['Più veloce','blue']);if(uniq.length>1){const ch=uniq.slice().sort((a,b)=>a.cost.gen-b.cost.gen)[0];if(ch!==uniq[0]&&ch.cost.total<uniq[0].cost.total-0.5)ch.tags.push(['Più economica','green'])}
      for(const r of uniq){if(r.hasToll)r.tags.push(['Pedaggio '+F.eur(r.cost.toll),'orange']);else if(uniq.some(u=>u.hasToll))r.tags.push(['Senza pedaggi','gray']);if(r.hasFerry)r.tags.push(['Traghetto','gray']);if(r.src==='osrm')r.tags.push(['Servizio di riserva','gray'])}}
    st.routes=uniq.slice(0,4);st.sel=0;st.loading=false;st.ver++;draw();App.emit('plan');
    if(st.routes.length)fitRoutes()}
  function draw(){const rs=st.routes;if(!rs.length){MapView.setData('route',{type:'FeatureCollection',features:[]});MapView.setData('alts',{type:'FeatureCollection',features:[]});return}
    const sel=rs[st.sel];
    MapView.setData('alts',{type:'FeatureCollection',features:rs.map((r,i)=>i===st.sel?null:{type:'Feature',geometry:{type:'LineString',coordinates:r.coords.map(p=>[p[1],p[0]])},properties:{i}}).filter(Boolean)});
    MapView.setData('route',{type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'LineString',coordinates:sel.coords.map(p=>[p[1],p[0]])},properties:{k:'main'}}]});
    stopMarkers()}
  let markers=[];
  function stopMarkers(){markers.forEach(m=>m.remove());markers=[];const map=MapView.map;if(!map)return;
    st.stops.forEach((s,i)=>{const p=resolve(s);if(!p||s.gps)return;const el=document.createElement('div');const last=i===st.stops.length-1;
      if(last){el.innerHTML='<svg class="pin" viewBox="0 0 34 44"><path d="M17 43s-14-12.4-14-23a14 14 0 0128 0c0 10.6-14 23-14 23z" fill="#FF3B30" stroke="#fff" stroke-width="2.5"/><circle cx="17" cy="20" r="5.5" fill="#fff"/></svg>';markers.push(new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([p.lon,p.lat]).addTo(map))}
      else{el.className='stopm'+(i===0?' start':'');el.textContent=i===0?'':i;markers.push(new maplibregl.Marker({element:el}).setLngLat([p.lon,p.lat]).addTo(map))}})}
  function clearMap(){markers.forEach(m=>m.remove());markers=[];MapView.setData('route',{type:'FeatureCollection',features:[]});MapView.setData('alts',{type:'FeatureCollection',features:[]})}
  function fitRoutes(){const r=st.routes[st.sel];if(!r)return;let b=[[180,90],[-180,-90]];for(const rr of st.routes)for(const p of rr.coords){if(p[1]<b[0][0])b[0][0]=p[1];if(p[0]<b[0][1])b[0][1]=p[0];if(p[1]>b[1][0])b[1][0]=p[1];if(p[0]>b[1][1])b[1][1]=p[0]}MapView.fit(b)}
  function select(i){if(i<0||i>=st.routes.length)return;st.sel=i;draw();App.emit('plan')}
  async function optimize(){if(st.stops.length<4){App.toast('Servono almeno due tappe intermedie');return}
    const pts=st.stops.map(resolve);if(pts.some(p=>!p))return;App.toast('Ottimizzo l\'ordine delle tappe…');
    try{const order=await API.optimize(pts);if(order&&order.length===st.stops.length){const old=st.stops.slice();st.stops=order.map(i=>old[i]);st.ver++;App.toast('Tappe riordinate per il percorso più breve');compute()}}
    catch(e){App.toast('Ottimizzazione non disponibile ora')}}
  function addStop(p,at){const s={name:p.name,lat:p.lat,lon:p.lon,addr:p.addr||'',stay:p.stay||0};if(at==null)st.stops.push(s);else st.stops.splice(at,0,s);st.ver++}
  function removeStop(i){st.stops.splice(i,1);if(!st.stops.length)st.stops=[here()];st.ver++}
  function move(i,d){const j=i+d;if(j<0||j>=st.stops.length)return;[st.stops[i],st.stops[j]]=[st.stops[j],st.stops[i]];st.ver++}
  return {st,reset,compute,select,optimize,addStop,removeStop,move,cost,clearMap,draw,resolve,fitRoutes,get route(){return st.routes[st.sel]}};
})();
