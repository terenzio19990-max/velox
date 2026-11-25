/* Sentinella — modalità pista: cronometro sul giro con il GPS.
   Traguardo e settori li fissi tu (fermo sulla linea, oppure dalla mappa); giro, settori, delta sul miglior giro in tempo reale,
   giro ideale (somma dei settori migliori), velocità e g laterale/longitudinale stimati dal GPS, esportazione CSV per giro. */
'use strict';
const Track = App.Track = (()=>{
  const HALF=30;                                           // semilarghezza della linea (m)
  let tracks=Store.get('tracks',[]);let sess=Store.get('trackSess',[]);
  let S=null;                                              // sessione in corso
  const saveT=()=>Store.set('tracks',tracks),saveS=()=>Store.set('trackSess',sess.slice(0,40));
  const fmt=s=>{if(s==null||!isFinite(s))return '–';const m=Math.floor(s/60),x=s-m*60;return (m?m+':'+(x<10?'0':''):'')+x.toFixed(m?2:2)};
  const fmtD=d=>(d>0?'+':d<0?'−':'±')+Math.abs(d).toFixed(2);
  // coordinate locali in metri rispetto a un punto
  const loc=(o,p)=>[(p.lon-o.lon)*111320*Math.cos(G.rad(o.lat)),(p.lat-o.lat)*111320];
  // attraversamento della linea {lat,lon,h} tra due fix: frazione 0..1 o null
  function cross(L,a,b){const u=[Math.sin(G.rad(L.h)),Math.cos(G.rad(L.h))],n=[u[1],-u[0]];const A=loc(L,a),B=loc(L,b);
    const sa=A[0]*u[0]+A[1]*u[1],sb=B[0]*u[0]+B[1]*u[1];if(!(sa<0&&sb>=0))return null;const k=sa/(sa-sb);
    const X=[A[0]+(B[0]-A[0])*k,A[1]+(B[1]-A[1])*k];return Math.abs(X[0]*n[0]+X[1]*n[1])<=HALF?k:null}
  /* ---------- cronometro ---------- */
  function start(id){const tr=tracks.find(t=>t.id===id);if(!tr)return;S={tr,id:'s'+Date.now(),ts:Date.now(),laps:[],lap:null,prev:null,v0:null,h0:null,g:{lat:0,lon:0},gmax:0,
      best:Store.get('trackBest_'+tr.id,null)};
    App.startGps&&App.startGps();App.keepAwake&&App.keepAwake(true);Voice.prime();overlay(true);App.toast('Pista: passa sul traguardo per iniziare il giro')}
  function stop(){if(!S)return;const s=S;S=null;overlay(false);if(!App.state.driving&&!App.state.navigating)App.keepAwake&&App.keepAwake(false);
    if(s.laps.length){const rec={id:s.id,track:s.tr.id,name:s.tr.name,ts:s.ts,laps:s.laps.map(l=>({n:l.n,t:l.t,sec:l.sec,vmax:l.vmax,gmax:l.gmax,out:l.out})),csv:null};sess.unshift(rec);saveS();
      try{localStorage.setItem('snt.trackCsv_'+s.id,csv(s))}catch(e){}
      const old=Store.get('trackCsvIds',[]);old.unshift(s.id);for(const x of old.slice(8))localStorage.removeItem('snt.trackCsv_'+x);Store.set('trackCsvIds',old.slice(0,8));
      UI.show('trackSess',{id:rec.id})}}
  function newLap(t){S.lap={t0:t,secT:[],dist:0,vmax:0,gmax:0,samples:[],secIdx:0}}
  function onFix(f){if(!S)return;const t=f.t||Date.now(),p=S.prev;S.prev={lat:f.lat,lon:f.lon,t,spd:f.spd};
    if(!p)return;const dt=(t-p.t)/1000;if(dt<=0||dt>5)return;const d=G.dist(p.lat,p.lon,f.lat,f.lon);const v=f.spd!=null?f.spd:d/dt;
    // g stimati: longitudinale da dv/dt, laterale da v·dψ/dt
    const h=d>2?G.brg(p.lat,p.lon,f.lat,f.lon):S.h0;let glon=S.v0!=null?(v-S.v0)/dt/9.81:0,glat=0;if(h!=null&&S.h0!=null&&v>4)glat=v*G.rad(G.sdiff(S.h0,h))/dt/9.81;
    S.v0=v;if(h!=null)S.h0=h;glon=Math.max(-2,Math.min(2,glon));glat=Math.max(-2.5,Math.min(2.5,glat));S.g={lat:S.g.lat*0.35+glat*0.65,lon:S.g.lon*0.35+glon*0.65};
    const tr=S.tr;const k=cross(tr.line,p,{lat:f.lat,lon:f.lon});
    if(k!=null){const tc=p.t+(t-p.t)*k;if(S.lap){const L=S.lap;const lt=(tc-L.t0)/1000;if(lt>12)finishLap(lt,tc);else return}else{newLap(tc);Voice.beep(1,880);App.toast('Giro lanciato!')}
      const L=S.lap;L.dist=d*(1-k);return}
    const L=S.lap;if(!L)return;L.dist+=d;L.vmax=Math.max(L.vmax,v*3.6);const gm=Math.hypot(S.g.lat,S.g.lon);L.gmax=Math.max(L.gmax,gm);
    L.samples.push([Math.round(t-L.t0),+f.lat.toFixed(6),+f.lon.toFixed(6),+(v*3.6).toFixed(1),+S.g.lat.toFixed(2),+S.g.lon.toFixed(2),Math.round(L.dist)]);
    const sec=tr.sectors[L.secIdx];if(sec){const ks=cross(sec,p,{lat:f.lat,lon:f.lon});if(ks!=null){const tc=p.t+(t-p.t)*ks;const st=(tc-L.t0)/1000;L.secT.push(st);L.secIdx++;split(L.secT.length-1,st)}}}
  function secTimes(L,total){const out=[];let a=0;for(const s of L.secT.concat([total])){out.push(+(s-a).toFixed(3));a=s}return out}
  function finishLap(lt,tc){const L=S.lap;const sec=secTimes(L,lt);const out=L.secT.length<S.tr.sectors.length;const lap={n:S.laps.length+1,t:+lt.toFixed(3),sec,vmax:Math.round(L.vmax),gmax:+L.gmax.toFixed(2),samples:L.samples,out};
    S.laps.push(lap);const prevBest=S.best&&S.best.t;const isBest=!out&&(!prevBest||lt<prevBest);
    if(isBest){S.best={t:lap.t,sec,ref:L.samples.filter((x,i)=>i%2===0).map(x=>[x[6],x[0]])};Store.set('trackBest_'+S.tr.id,S.best)}
    const bs=Store.get('trackBestSec_'+S.tr.id,[]);if(!out)sec.forEach((x,i)=>{if(!bs[i]||x<bs[i])bs[i]=x});Store.set('trackBestSec_'+S.tr.id,bs);
    Voice.beep(isBest?3:1,isBest?1046:880);const d=prevBest?lt-prevBest:null;
    Voice.say(`Giro ${lap.n}, ${speakT(lt)}${isBest?', miglior giro':d!=null?', '+(d>0?'più ':'meno ')+Math.abs(d).toFixed(1).replace('.',' e ')+' secondi':''}`,true);
    flash(isBest?'best':'lap',fmt(lt),isBest?'Miglior giro!':d!=null?fmtD(d):'');newLap(tc)}
  function split(i,st){const bs=Store.get('trackBestSec_'+S.tr.id,[]);const L=S.lap;const prev=i?L.secT[i-1]:0;const s=st-prev;const d=bs[i]?s-bs[i]:null;
    flash(d!=null&&d<0?'best':'sec',`S${i+1} ${fmt(s)}`,d!=null?fmtD(d):'')}
  const speakT=s=>{const m=Math.floor(s/60),x=(s-m*60).toFixed(1).replace('.',' e ');return (m?m+' minuti ':'')+x+' secondi'};
  // delta sul miglior giro alla stessa distanza percorsa
  function delta(){if(!S||!S.lap||!S.best||!S.best.ref||S.best.ref.length<3)return null;const r=S.best.ref,d=S.lap.dist;let i=0;while(i<r.length-2&&r[i+1][0]<d)i++;
    const a=r[i],b=r[i+1];if(d>b[0]*1.05)return null;const k=Math.max(0,Math.min(1,(d-a[0])/Math.max(1,b[0]-a[0])));const tb=a[1]+(b[1]-a[1])*k;return ((Date.now()-S.lap.t0)-tb)/1000}
  /* ---------- schermo pista ---------- */
  let raf=0,flT=0;
  function overlay(v){let el=$('#trk');if(v&&!el){document.body.insertAdjacentHTML('beforeend',`<div class="trk" id="trk"><div class="tk-top"><b id="tkName"></b><span id="tkLapN"></span><button id="tkStop">Fine</button></div>
      <div class="tk-time" id="tkTime">–</div><div class="tk-delta" id="tkDelta"></div>
      <div class="tk-row"><div><small>Ultimo</small><b id="tkLast">–</b></div><div><small>Migliore</small><b id="tkBest">–</b></div><div><small>Ideale</small><b id="tkIdeal">–</b></div></div>
      <div class="tk-row"><div><small>Velocità</small><b id="tkSpd">0</b></div><div class="tk-g"><i id="tkGdot"></i><small id="tkG">0,00 g</small></div><div><small>Max g giro</small><b id="tkGm">–</b></div></div>
      <div class="tk-laps" id="tkLaps"></div><div class="tk-flash" id="tkFl"></div></div>`);el=$('#trk');$('#tkStop').onclick=async()=>{if(await App.confirm('Finire la sessione?','I giri vengono salvati.','Fine'))stop()}}
    if(!el)return;el.classList.toggle('hidden',!v);document.body.classList.toggle('trkon',v);cancelAnimationFrame(raf);if(v)loop()}
  function loop(){if(!S)return;raf=requestAnimationFrame(loop);const L=S.lap;$('#tkName').textContent=S.tr.name;$('#tkLapN').textContent=L?'Giro '+(S.laps.length+1):'Passa sul traguardo';
    $('#tkTime').textContent=L?fmt((Date.now()-L.t0)/1000):'0.00';const d=delta();const D=$('#tkDelta');D.textContent=d!=null?fmtD(d):'';D.className='tk-delta '+(d==null?'':d<0?'neg':'pos');
    const last=S.laps[S.laps.length-1];$('#tkLast').textContent=last?fmt(last.t):'–';$('#tkBest').textContent=S.best?fmt(S.best.t):'–';
    const bs=Store.get('trackBestSec_'+S.tr.id,[]);$('#tkIdeal').textContent=bs.length===S.tr.sectors.length+1&&bs.every(Boolean)?fmt(bs.reduce((a,b)=>a+b,0)):'–';
    $('#tkSpd').textContent=Math.round((S.v0||0)*3.6);$('#tkG').textContent=F.n(Math.hypot(S.g.lat,S.g.lon),2)+' g';$('#tkGdot').style.transform=`translate(${(S.g.lat*22).toFixed(1)}px,${(-S.g.lon*22).toFixed(1)}px)`;$('#tkGm').textContent=L?F.n(L.gmax,2):'–';
    if(S.laps.length!==+$('#tkLaps').dataset.n){$('#tkLaps').dataset.n=S.laps.length;const bt=Math.min(...S.laps.filter(l=>!l.out).map(l=>l.t));$('#tkLaps').innerHTML=S.laps.slice().reverse().slice(0,6).map(l=>`<span class="${l.t===bt?'best':''}">${l.n}. ${fmt(l.t)}${l.out?' *':''}</span>`).join('')}}
  function flash(cls,big,small){const el=$('#tkFl');if(!el)return;el.className='tk-flash show '+cls;el.innerHTML=`<b>${big}</b><small>${small||''}</small>`;clearTimeout(flT);flT=setTimeout(()=>el.className='tk-flash',3500)}
  App.on('tick',({f})=>onFix(f));
  /* ---------- traguardo e settori ---------- */
  function hereLine(){const f=App.state.fix;if(!f){App.toast('Serve la posizione GPS');return null}const h=App.state.hd!=null?App.state.hd:(f.hd!=null&&f.hd>=0?f.hd:null);
    if(h==null){App.toast('Non conosco la direzione: muoviti un po\' nel senso di marcia, oppure usa la mappa');return null}return {lat:+f.lat.toFixed(6),lon:+f.lon.toFixed(6),h:Math.round(h)}}
  function mapLine(){const m=MapView.map;if(!m)return null;const c=m.getCenter();return {lat:+c.lat.toFixed(6),lon:+c.lng.toFixed(6),h:Math.round((m.getBearing()+360)%360)}}
  /* ---------- mappa ---------- */
  const EMPTY={type:'FeatureCollection',features:[]};
  function lineGeo(L,col,lab){const u=[Math.sin(G.rad(L.h+90)),Math.cos(G.rad(L.h+90))];const a=G.dest(L.lat,L.lon,L.h+90,HALF),b=G.dest(L.lat,L.lon,L.h-90,HALF);const tip=G.dest(L.lat,L.lon,L.h,18);
    return [{type:'Feature',geometry:{type:'LineString',coordinates:[[a[1],a[0]],[b[1],b[0]]]},properties:{c:col,l:lab}},{type:'Feature',geometry:{type:'LineString',coordinates:[[L.lon,L.lat],[tip[1],tip[0]]]},properties:{c:col,l:''}}]}
  function showLines(tr){const map=MapView.map;if(!map||!MapView.ready)return;if(!map.getSource('trk'))map.addSource('trk',{type:'geojson',data:EMPTY});
    if(!map.getLayer('trk-l'))map.addLayer({id:'trk-l',type:'line',source:'trk',layout:{'line-cap':'round'},paint:{'line-color':['get','c'],'line-width':5}});
    if(!map.getLayer('trk-t'))map.addLayer({id:'trk-t',type:'symbol',source:'trk',layout:{'text-field':['get','l'],'text-size':13,'text-font':['Noto Sans Bold'],'symbol-placement':'line-center','text-offset':[0,-1]},paint:{'text-color':['get','c'],'text-halo-color':'#000','text-halo-width':1.5}});
    map.getSource('trk').setData(tr?{type:'FeatureCollection',features:lineGeo(tr.line,'#FFFFFF','Traguardo').concat(...tr.sectors.map((s,i)=>lineGeo(s,'#FFCC00','S'+(i+1))))}:EMPTY);
    if(tr&&MapView.map){MapView.setCam&&MapView.setCam('free');MapView.map.easeTo({center:[tr.line.lon,tr.line.lat],zoom:16.5,bearing:tr.line.h,duration:700})}}
  /* ---------- schermate ---------- */
  App.UI.R.tracks=()=>({detent:'full',html:`${App.UI.hdr('Pista','Cronometro sul giro con il GPS')}
    <div class="group">${tracks.map(t=>App.UI.item({attr:`data-t="${t.id}"`,color:'#FF2D55',icon:'<svg><use href="#i-clock"/></svg>',t1:esc(t.name),t2:`${t.sectors.length+1} settori${Store.get('trackBest_'+t.id,null)?' · miglior giro '+fmt(Store.get('trackBest_'+t.id).t):''}`,chev:true})).join('')}
      ${App.UI.item({attr:'id="tkNew"',color:'#34C759',icon:'<b style="font-size:20px">+</b>',t1:'Nuovo circuito',t2:'Fissa il traguardo e, se vuoi, i settori'})}</div>
    ${sess.length?`<div class="sec"><h3>Sessioni</h3></div><div class="group">${sess.slice(0,15).map(s=>{const v=s.laps.filter(l=>!l.out);const b=v.length?Math.min(...v.map(l=>l.t)):null;return App.UI.item({attr:`data-s="${s.id}"`,color:'#8E8E93',icon:'<svg><use href="#i-route"/></svg>',t1:esc(s.name),t2:`${F.date(s.ts)} · ${s.laps.length} giri${b?' · migliore '+fmt(b):''}`,chev:true})}).join('')}</div>`:''}
    <p class="note">Il GPS del telefono aggiorna circa una volta al secondo: il tempo del giro è interpolato e preciso a qualche decimo, i g sono stime. Solo in pista o in aree chiuse al traffico.</p>`,
    bind(r){$('#tkNew').onclick=()=>UI.show('trackEdit',{});r.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>UI.show('track',{id:b.dataset.t}));r.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>UI.show('trackSess',{id:b.dataset.s}));showLines(null)}});
  App.UI.R.track=({id})=>{const t=tracks.find(x=>x.id===id);if(!t)return {html:App.UI.hdr('Pista')};const best=Store.get('trackBest_'+id,null),bs=Store.get('trackBestSec_'+id,[]);
    return {detent:'half',html:`${App.UI.hdr(esc(t.name),`${t.sectors.length+1} settori`)}
      <div class="tiles"><div class="tile"><span>Miglior giro</span><b>${best?fmt(best.t):'–'}</b></div><div class="tile"><span>Giro ideale</span><b>${bs.length===t.sectors.length+1&&bs.every(Boolean)?fmt(bs.reduce((a,b)=>a+b,0)):'–'}</b><small>${bs.length?bs.map((x,i)=>'S'+(i+1)+' '+fmt(x)).join(' · '):''}</small></div></div>
      <button class="btn primary wide" id="tkGo" style="margin-top:12px;background:#FF2D55">Avvia cronometro</button>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px"><button class="btn" id="tkEd">Modifica</button><button class="btn" id="tkRs">Azzera tempi</button><button class="btn" id="tkDel" style="color:var(--red)">Elimina</button></div>`,
      bind(){setTimeout(()=>showLines(t),200);$('#tkGo').onclick=()=>{UI.home();start(id)};$('#tkEd').onclick=()=>UI.show('trackEdit',{id});
        $('#tkRs').onclick=async()=>{if(await App.confirm('Azzerare miglior giro e settori?','','Azzera',true)){Store.del('trackBest_'+id);Store.del('trackBestSec_'+id);App.UI.render()}};
        $('#tkDel').onclick=async()=>{if(await App.confirm('Eliminare il circuito?','','Elimina',true)){tracks=tracks.filter(x=>x.id!==id);saveT();Store.del('trackBest_'+id);Store.del('trackBestSec_'+id);showLines(null);UI.back()}}}}};
  let draft=null;
  App.UI.R.trackEdit=({id})=>{if(!draft||draft._for!==(id||'new')){const t=id&&tracks.find(x=>x.id===id);draft=t?JSON.parse(JSON.stringify(t)):{id:'k'+Date.now(),name:'',line:null,sectors:[]};draft._for=id||'new'}
    const L=x=>x?`${x.lat.toFixed(5)}, ${x.lon.toFixed(5)} · verso ${x.h}°`:'non impostato';
    return {detent:'half',html:`${App.UI.hdr(id?'Modifica circuito':'Nuovo circuito','Linee lunghe 60 m, attraversate nel senso di marcia')}
      <div class="group"><div class="field"><label>Nome</label><input id="tkN" value="${esc(draft.name)}" placeholder="Es. Vallelunga, kartodromo…"></div></div>
      <div class="sec"><h3>Traguardo</h3></div><div class="group">${App.UI.item({color:'#000',icon:'<b>🏁</b>',t1:'Linea del traguardo',t2:L(draft.line)})}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px"><button class="btn" data-set="line" data-src="gps">Qui, dove sono</button><button class="btn" data-set="line" data-src="map">Centro della mappa</button></div>
      <div class="sec"><h3>Settori</h3></div>${draft.sectors.length?`<div class="group">${draft.sectors.map((s,i)=>App.UI.item({attr:`data-rm="${i}"`,color:'#FFCC00',icon:`<b style="color:#000">S${i+1}</b>`,t1:'Fine settore '+(i+1),t2:L(s)+' · tocca per togliere'})).join('')}</div>`:''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px"><button class="btn" data-set="sec" data-src="gps">+ Settore qui</button><button class="btn" data-set="sec" data-src="map">+ Settore dalla mappa</button></div>
      <button class="btn primary wide" id="tkSave" style="margin-top:14px">Salva</button>
      <p class="note">Dalla mappa: metti il centro sulla linea e ruota la mappa con due dita finché la parte alta indica il senso di marcia. Dal GPS: fermati sulla linea dopo averla percorsa nel senso giusto.</p>`,
      bind(r){showLines(draft.line?draft:null);$('#tkN').oninput=e=>draft.name=e.target.value;
        r.querySelectorAll('[data-set]').forEach(b=>b.onclick=()=>{const x=b.dataset.src==='gps'?hereLine():mapLine();if(!x)return;if(b.dataset.set==='line')draft.line=x;else draft.sectors.push(x);App.UI.render()});
        r.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{draft.sectors.splice(+b.dataset.rm,1);App.UI.render()});
        $('#tkSave').onclick=()=>{if(!draft.line){App.toast('Imposta prima il traguardo');return}const t=Object.assign({},draft,{name:draft.name.trim()||'Circuito'});delete t._for;
          const i=tracks.findIndex(x=>x.id===t.id);if(i>=0){if(tracks[i].sectors.length!==t.sectors.length)Store.del('trackBestSec_'+t.id);tracks[i]=t}else tracks.unshift(t);saveT();draft=null;UI.show('track',{id:t.id})}}}};
  App.UI.R.trackSess=({id})=>{const s=sess.find(x=>x.id===id);if(!s)return {html:App.UI.hdr('Sessione')};const v=s.laps.filter(l=>!l.out);const b=v.length?Math.min(...v.map(l=>l.t)):null;
    const nsec=Math.max(...s.laps.map(l=>l.sec.length));const bsec=Array.from({length:nsec},(_,i)=>Math.min(...v.filter(l=>l.sec.length===nsec).map(l=>l.sec[i])));
    return {detent:'full',html:`${App.UI.hdr(esc(s.name),F.date(s.ts)+' · '+F.clock(s.ts))}
      <div class="tiles"><div class="tile"><span>Miglior giro</span><b>${b?fmt(b):'–'}</b></div><div class="tile"><span>Giri</span><b>${s.laps.length}</b><small>${s.laps.some(l=>l.out)?'* settori mancanti':''}</small></div></div>
      <div class="group lapt"><div class="kv fhead"><span>Giro</span><b>Tempo</b>${Array.from({length:nsec},(_,i)=>`<b>S${i+1}</b>`).join('')}<b>Max</b></div>
        ${s.laps.map(l=>`<div class="kv${l.t===b?' mine':''}"><span>${l.n||''}${l.out?'*':''}</span><b>${fmt(l.t)}</b>${l.sec.map((x,i)=>`<b class="${x===bsec[i]?'pb':''}">${fmt(x)}</b>`).join('')}<b>${l.vmax}</b></div>`).join('')}</div>
      <button class="btn wide" id="tsCsv" style="margin-top:12px" ${localStorage.getItem('snt.trackCsv_'+id)?'':'disabled'}>Esporta telemetria CSV</button>
      <button class="btn wide" id="tsDel" style="margin-top:8px;color:var(--red)">Elimina sessione</button>
      <p class="note">CSV: giro, tempo dal via del giro, coordinate, velocità, g laterale e longitudinale, distanza nel giro. Si apre con Excel o con i software di analisi dati.</p>`,
      bind(){$('#tsCsv').onclick=()=>{const t=localStorage.getItem('snt.trackCsv_'+id);if(!t)return;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:'text/csv'}));a.download=`pista-${s.name.replace(/\W+/g,'-')}-${new Date(s.ts).toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500)};
        $('#tsDel').onclick=async()=>{if(await App.confirm('Eliminare la sessione?','','Elimina',true)){sess=sess.filter(x=>x.id!==id);saveS();localStorage.removeItem('snt.trackCsv_'+id);UI.back()}}}}};
  function csv(s){const rows=['giro;tempo_s;lat;lon;velocita_kmh;g_lat;g_long;distanza_m'];for(const l of s.laps)for(const x of l.samples)rows.push([l.n,(x[0]/1000).toFixed(2),x[1],x[2],x[3],x[4],x[5],x[6]].join(';').replace(/(\d)\.(\d)/g,'$1,$2'));return '﻿'+rows.join('\r\n')}
  return {start,stop,get active(){return !!S},cross,get tracks(){return tracks}};
})();
