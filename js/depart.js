/* Sentinella — quando partire e tappe in ordine:
   · «Quando partire»: tempo di viaggio previsto per partenze da adesso a +3 ore (traffico previsto TomTom), con l'orario migliore
   · ordine delle tappe: se il server non risponde, riordino sul telefono (vicino più vicino + scambi 2-opt) */
'use strict';
const Depart = App.Depart = (()=>{
  // orario locale con il fuso esplicito
  const isoLocal=d=>{const z=-d.getTimezoneOffset(),p=n=>String(Math.floor(Math.abs(n))).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00${z>=0?'+':'-'}${p(z/60)}:${p(z%60)}`};
  const S=App.S;const SLOTS=[0,15,30,45,60,90,120,180];let cache=null;
  async function one(stops,at){const p=new URLSearchParams({key:S.tomtomKey,traffic:'true',travelMode:'car',routeType:'fastest',routeRepresentation:'summaryOnly',computeTravelTimeFor:'all'});
    if(at>Date.now()+60e3)p.set('departAt',isoLocal(new Date(at)));if(S.avoidTolls)p.append('avoid','tollRoads');if(S.avoidHighways)p.append('avoid','motorways');
    const locs=stops.map(s=>s.lat.toFixed(6)+','+s.lon.toFixed(6)).join(':');App.TT.use('route');
    const r=await API.tfetch(`https://api.tomtom.com/routing/1/calculateRoute/${locs}/json?${p}`,{},15000);if(!r.ok)throw new Error('http '+r.status);const j=await r.json();const s=j.routes[0].summary;
    return {at,time:s.travelTimeInSeconds,delay:s.trafficDelayInSeconds||0,arr:Date.parse(s.arrivalTime)||at+s.travelTimeInSeconds*1000}}
  async function compute(){const pts=Plan.st.stops.map(Plan.resolve);if(pts.some(p=>!p))return;const key=pts.map(p=>p.lat.toFixed(4)+','+p.lon.toFixed(4)).join('|');
    if(!S.tomtomKey||!App.TT.can('route')){cache={key,err:'tt'};App.UI.render();return}
    const now=Math.ceil(Date.now()/300e3)*300e3;cache={key,loading:true};App.UI.render();
    const res=await Promise.all(SLOTS.map(m=>one(pts,m?now+m*60e3:Date.now()).catch(()=>null)));cache={key,list:res.filter(Boolean)};App.UI.render()}
  App.on('planBody',({route:r,box})=>{if(!box||!r)return;const pts=Plan.st.stops.map(Plan.resolve);if(pts.some(p=>!p))return;const key=pts.map(p=>p.lat.toFixed(4)+','+p.lon.toFixed(4)).join('|');
    const c=cache&&cache.key===key?cache:null;let h;
    if(!c)h=`<button class="btn wide" id="dpGo"><svg viewBox="0 0 24 24" style="width:19px;height:19px"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>Confronta gli orari di partenza</button>`;
    else if(c.err)h=`<p class="note" style="margin:0">Serve la chiave TomTom gratuita (Impostazioni): il traffico previsto per le prossime ore viene da lì.</p>`;
    else if(c.loading)h=`<div class="dp-load"><i class="ev-spin" style="width:20px;height:20px;border-width:2px"></i>Calcolo il traffico previsto…</div>`;
    else if(c.list&&c.list.length){const L=c.list;const mx=Math.max(...L.map(x=>x.time)),mn=Math.min(...L.map(x=>x.time));const best=L.find(x=>x.time===mn);const now0=L[0];
      const save=now0.time-mn;h=`<div class="dp-tip">${save>=180?`Partendo alle <b>${F.clock(best.at)}</b> ci metti <b>${F.dur(save)}</b> in meno (${F.dur(best.time)})`:`Il traffico non cambia molto nelle prossime ore: parti quando vuoi`}</div>
        <div class="dp-bars">${L.map(x=>{const hgt=20+70*(x.time-mn*0.85)/Math.max(1,mx-mn*0.85);const t=x.time===mn;return `<div class="${t?'best':''}"><small>${F.dur(x.time)}</small><i style="height:${Math.min(100,hgt).toFixed(0)}%;background:${x.delay>600?'#FF3B30':x.delay>240?'#FF9500':'#34C759'}"></i><span>${x===now0?'Ora':F.clock(x.at)}</span><em>arr. ${F.clock(x.arr)}</em></div>`}).join('')}</div>
        <p class="note">Colore: verde scorrevole, arancio rallentamenti, rosso code previste. Previsioni TomTom basate sul traffico tipico di quel giorno e ora.</p>`}
    else h=`<p class="note" style="margin:0">Previsione non disponibile ora. <a href="#" id="dpRe">Riprova</a></p>`;
    box.insertAdjacentHTML('beforeend',`<div class="sec"><h3>Quando partire</h3></div><div class="group dpbox">${h}</div>`);
    const g=box.querySelector('#dpGo');if(g)g.onclick=compute;const re=box.querySelector('#dpRe');if(re)re.onclick=e=>{e.preventDefault();compute()}});
  /* ---------- tappe in ordine anche senza server ---------- */
  function localOrder(pts){const n=pts.length;const d=(a,b)=>G.dist(pts[a].lat,pts[a].lon,pts[b].lat,pts[b].lon);let order=[0];const left=new Set([...Array(n).keys()].slice(1,n-1));
    while(left.size){const last=order[order.length-1];let b=null,bd=1e18;for(const i of left){const x=d(last,i);if(x<bd){bd=x;b=i}}order.push(b);left.delete(b)}order.push(n-1);
    const len=o=>o.reduce((s,x,i)=>i?s+d(o[i-1],x):0,0);let imp=true,it=0;while(imp&&it++<200){imp=false;for(let i=1;i<n-2;i++)for(let k=i+1;k<n-1;k++){const o=order.slice(0,i).concat(order.slice(i,k+1).reverse(),order.slice(k+1));if(len(o)<len(order)-1){order=o;imp=true}}}
    return {order,len:len(order),before:len([...Array(n).keys()])}}
  Plan.optimize=async function(){const st=Plan.st;if(st.stops.length<4){App.toast('Servono almeno due tappe intermedie');return}
    const pts=st.stops.map(Plan.resolve);if(pts.some(p=>!p))return;App.toast('Ottimizzo l\'ordine delle tappe…');const oldDist=Plan.route?Plan.route.dist:null;
    let order=null;try{order=await Promise.race([API.optimize(pts),new Promise((_,r)=>setTimeout(()=>r(0),9000))])}catch(e){}
    if(!order||order.length!==st.stops.length){const L=localOrder(pts);order=L.order}
    if(order.every((x,i)=>x===i)){App.toast('L\'ordine delle tappe è già il migliore');return}
    const old=st.stops.slice();st.stops=order.map(i=>old[i]);st.ver++;await Plan.compute();
    const nd=Plan.route&&Plan.route.dist;App.toast(oldDist&&nd&&oldDist-nd>200?`Tappe riordinate: ${F.km(oldDist-nd)} in meno`:'Tappe riordinate');App.UI.render()};
  return {compute,localOrder};
})();
