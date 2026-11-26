/* Sentinella — diario di guida: registra da solo ogni tragitto in auto (con l'app aperta), con traccia, km, tempi,
   velocità e costo stimato; statistiche del mese, tragitti ripetuti con il tempo migliore, esportazione CSV e GPX. */
'use strict';
const Diary = App.Diary = (()=>{
  let T=Store.get('diary',[]);let cur=Store.get('diaryCur',null);let last=null;
  const persist=()=>{if(cur)Store.set('diaryCur',cur);else Store.del('diaryCur')};
  setTimeout(()=>{if(cur&&Date.now()-cur.tl>15*60e3){finish(cur);cur=null;Store.del('diaryCur')}},3000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persist()});
  App.on('tick',({f})=>{if(App.state.sim||(f.acc||0)>60)return;const now=Date.now(),sp=f.spd||0;
    if(cur&&now-cur.tl>10*60e3){finish(cur);cur=null}
    if(!cur){if(sp>4.2){cur={id:'d'+now,t0:now,tl:now,pts:[[+f.lat.toFixed(5),+f.lon.toFixed(5)]],dist:0,moving:0,vmax:0,still:0,nav:!!Nav.active};last={lat:f.lat,lon:f.lon,t:now}}return}
    if(!last){last={lat:f.lat,lon:f.lon,t:now};return}
    const dt=(now-last.t)/1000;const d=G.dist(last.lat,last.lon,f.lat,f.lon);
    if(sp>1)cur.moving+=Math.min(dt,10);cur.vmax=Math.max(cur.vmax,sp*3.6);if(Nav.active)cur.nav=true;
    if(d>=25){cur.dist+=d;cur.pts.push([+f.lat.toFixed(5),+f.lon.toFixed(5)]);last={lat:f.lat,lon:f.lon,t:now}}else last.t=now;
    cur.tl=now;if(sp<1.5){if(!cur.still)cur.still=now;else if(now-cur.still>5*60e3){finish(cur);cur=null}}else cur.still=0;
    if(cur&&cur.pts.length%20===0)persist()});
  function finish(c){if(!c)return;persist();Store.del('diaryCur');const dur=(c.tl-c.t0)/1000;if(c.dist<1000||dur<180)return;
    const v=App.vehicle();const mix=v.urb*0.35+v.ext*0.4+v.aut*0.25;const qty=c.dist/1000*mix/100;const price=App.PRICES[v.fuel]||1.9;
    const pts=G.simplify(c.pts,12);const t={id:c.id,t0:c.t0,t1:c.still||c.tl,dist:Math.round(c.dist),moving:Math.round(c.moving),vmax:Math.round(c.vmax),qty:+qty.toFixed(2),cost:+(qty*price).toFixed(2),fuel:v.fuel,veh:v.name,g:G.encode(pts,5),nav:c.nav,from:'',to:''};
    t.avg=Math.round(t.dist/Math.max(60,t.moving)*3.6);T.unshift(t);T=T.slice(0,300);Store.set('diary',T);App.emit('tripSaved',t);
    const a=pts[0],b=pts[pts.length-1];Promise.all([API.reverse(a[0],a[1]).catch(()=>null),API.reverse(b[0],b[1]).catch(()=>null)]).then(([x,y])=>{t.from=x?(x.name||x.addr||''):'';t.to=y?(y.name||y.addr||''):'';Store.set('diary',T)})}
  App.on('arrived',()=>{if(cur){cur.still=Date.now();finish(cur);cur=null}});
  // tragitti ripetuti: stessa partenza e arrivo entro 500 m
  function repeats(list){const g=new Map();for(const t of list){const p=G.decode(t.g,5);const a=p[0],b=p[p.length-1];const k=[a,b].map(q=>(q[0]*200|0)+','+(q[1]*200|0)).join('>');const e=g.get(k)||{n:0,best:null,from:t.from,to:t.to,list:[]};e.n++;e.list.push(t);const d=(t.t1-t.t0)/1000;if(!e.best||d<e.best)e.best=d;g.set(k,e)}
    return [...g.values()].filter(e=>e.n>=2).sort((a,b)=>b.n-a.n)}
  /* ---------- mappa ---------- */
  const EMPTY={type:'FeatureCollection',features:[]};
  function showTrack(t){const map=MapView.map;if(!map||!MapView.ready)return;if(!map.getSource('diary'))map.addSource('diary',{type:'geojson',data:EMPTY});
    if(!map.getLayer('diary-line'))map.addLayer({id:'diary-line',type:'line',source:'diary',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#FF9500','line-width':['interpolate',['linear'],['zoom'],8,3,15,7],'line-opacity':0.9}});
    if(!t){map.getSource('diary').setData(EMPTY);return}const p=G.decode(t.g,5);map.getSource('diary').setData({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'LineString',coordinates:p.map(q=>[q[1],q[0]])},properties:{}}]});
    let bb=[[180,90],[-180,-90]];for(const q of p){bb[0][0]=Math.min(bb[0][0],q[1]);bb[0][1]=Math.min(bb[0][1],q[0]);bb[1][0]=Math.max(bb[1][0],q[1]);bb[1][1]=Math.max(bb[1][1],q[0])}MapView.fit(bb)}
  setInterval(()=>{if(UI.cur&&UI.cur.name!=='trip'&&MapView.map&&MapView.map.getSource&&MapView.map.getSource('diary'))showTrack(null)},1500);
  /* ---------- esportazione ---------- */
  function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500)}
  function csv(list){const rows=[['data','partenza','arrivo','km','durata_min','in_movimento_min','media_kmh','max_kmh','carburante','quantita','costo_eur','veicolo']];
    for(const t of list)rows.push([new Date(t.t0).toISOString().slice(0,16).replace('T',' '),t.from,t.to,(t.dist/1000).toFixed(1),Math.round((t.t1-t.t0)/60000),Math.round(t.moving/60),t.avg,t.vmax,t.fuel,t.qty,t.cost,t.veh]);
    return '﻿'+rows.map(r=>r.map(x=>{x=String(x==null?'':x);return /[;"\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x}).join(';')).join('\r\n')}
  function gpx(t){const p=G.decode(t.g,5);return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Sentinella" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${esc((t.from||'')+' - '+(t.to||''))}</name><trkseg>${p.map(q=>`<trkpt lat="${q[0]}" lon="${q[1]}"/>`).join('')}</trkseg></trk></gpx>`}
  /* ---------- schermate ---------- */
  let month=null;
  const MESI=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  App.UI.R.diary=()=>{const now=new Date();if(!month)month=[now.getFullYear(),now.getMonth()];const [y,m]=month;
    const list=T.filter(t=>{const d=new Date(t.t0);return d.getFullYear()===y&&d.getMonth()===m});
    const km=list.reduce((a,t)=>a+t.dist,0)/1000,hrs=list.reduce((a,t)=>a+(t.t1-t.t0),0)/3600e3,cost=list.reduce((a,t)=>a+t.cost,0);
    const days=new Date(y,m+1,0).getDate();const per=Array(days).fill(0);for(const t of list)per[new Date(t.t0).getDate()-1]+=t.dist/1000;const mx=Math.max(1,...per);
    const reps=repeats(T).slice(0,5);
    return {detent:'full',html:`${App.UI.hdr('Diario di guida',cur?'<span style="color:var(--green)">● Sto registrando questo tragitto</span>':'Registro da solo i tragitti in auto')}
      <div class="mnav"><button id="dPrev" aria-label="Mese precedente"><svg style="transform:rotate(180deg)"><use href="#i-chev"/></svg></button><b>${MESI[m]} ${y}</b><button id="dNext" aria-label="Mese successivo" ${y===now.getFullYear()&&m===now.getMonth()?'disabled':''}><svg><use href="#i-chev"/></svg></button></div>
      <div class="tiles"><div class="tile"><span>Chilometri</span><b>${F.n(km,km<100?1:0)}</b><small>${list.length} ${list.length===1?'tragitto':'tragitti'}</small></div><div class="tile"><span>Alla guida</span><b>${F.dur(hrs*3600)}</b><small>${list.length?'media '+Math.round(km/Math.max(0.1,hrs))+' km/h':''}</small></div>
        <div class="tile"><span>Costo stimato</span><b>${F.eur(cost)}</b><small>carburante</small></div><div class="tile"><span>Più lungo</span><b>${list.length?F.km(Math.max(...list.map(t=>t.dist))):'—'}</b><small>&nbsp;</small></div></div>
      <div class="group dbars">${per.map((v,i)=>`<i style="height:${v?Math.max(4,v/mx*100):0}%" title="${i+1}: ${F.n(v,1)} km"></i>`).join('')}</div><div class="rainlab"><span>1</span><span>${Math.round(days/2)}</span><span>${days}</span></div>
      ${reps.length?`<div class="sec"><h3>Tragitti abituali</h3></div><div class="group">${reps.map(e=>App.UI.item({color:'#5856D6',icon:`<b style="font-size:12px">×${e.n}</b>`,t1:esc((e.from||'Partenza')+' → '+(e.to||'Arrivo')),t2:'tempo migliore '+F.dur(e.best)})).join('')}</div>`:''}
      <div class="sec"><h3>Tragitti</h3>${list.length?'<button class="link" id="dCsv">Esporta CSV</button>':''}</div>
      ${list.length?`<div class="group">${list.map(t=>App.UI.item({attr:`data-t="${t.id}"`,color:t.nav?'var(--accent)':'#FF9500',icon:'<svg><use href="#i-route"/></svg>',t1:esc((t.from||'…')+' → '+(t.to||'…')),t2:`${new Date(t.t0).toLocaleDateString('it-IT',{weekday:'short',day:'numeric'})} ${F.clock(t.t0)} · ${F.km(t.dist)} · ${F.dur((t.t1-t.t0)/1000)}${t.score?' · voto '+t.score.v:''}`,chev:true})).join('')}</div>`:'<div class="empty">Nessun tragitto in questo mese.</div>'}
      <p class="note">Registro con Sentinella aperta, sopra i 15 km/h; il tragitto finisce dopo 5 minuti da fermo. I dati restano solo sul telefono.</p>`,
      bind(r){$('#dPrev').onclick=()=>{month=m?[y,m-1]:[y-1,11];App.UI.render()};$('#dNext').onclick=()=>{month=m===11?[y+1,0]:[y,m+1];App.UI.render()};
        const c=$('#dCsv');if(c)c.onclick=()=>download(`sentinella-${y}-${String(m+1).padStart(2,'0')}.csv`,csv(list),'text/csv');
        r.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>App.UI.show('trip',{id:b.dataset.t}))}}};
  App.UI.R.trip=({id})=>{const t=T.find(x=>x.id===id);if(!t)return {html:App.UI.hdr('Tragitto')+'<div class="empty">Non trovato.</div>'};
    return {detent:'half',html:`${App.UI.hdr(esc((t.from||'Partenza')+' → '+(t.to||'Arrivo')),new Date(t.t0).toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'})+' · '+F.clock(t.t0)+'–'+F.clock(t.t1))}
      <div class="tiles"><div class="tile"><span>Distanza</span><b>${F.km(t.dist)}</b></div><div class="tile"><span>Durata</span><b>${F.dur((t.t1-t.t0)/1000)}</b><small>${F.dur(t.moving)} in movimento</small></div>
        <div class="tile"><span>Media</span><b>${t.avg} km/h</b><small>massima ${t.vmax} km/h</small></div><div class="tile"><span>Costo stimato</span><b>${F.eur(t.cost)}</b><small>${F.n(t.qty,1)} ${(App.FUELS[t.fuel]||{}).unit||'l'} · ${esc(t.veh||'')}</small></div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px"><button class="btn" id="tGpx">Esporta GPX</button><button class="btn" id="tDel" style="color:var(--red)">Elimina</button></div>`,
      bind(){setTimeout(()=>showTrack(t),150);$('#tGpx').onclick=()=>download(`tragitto-${new Date(t.t0).toISOString().slice(0,10)}.gpx`,gpx(t),'application/gpx+xml');
        $('#tDel').onclick=async()=>{if(await App.confirm('Eliminare questo tragitto?','','Elimina',true)){T=T.filter(x=>x.id!==id);Store.set('diary',T);showTrack(null);App.UI.back()}}}}};
  return {get trips(){return T},get recording(){return !!cur},get curId(){return cur&&cur.id},save:()=>Store.set('diary',T),finish:()=>{if(cur){finish(cur);cur=null}},repeats};
})();
