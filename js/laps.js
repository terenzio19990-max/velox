/* Sentinella — confronto tra due giri (analisi dati in stile race engineering):
   traiettoria colorata per velocità o per guadagno/perdita, delta tempo lungo il giro, velocità sovrapposte,
   cursore da trascinare sui grafici che muove i due punti sulla mappa, settori a confronto. */
'use strict';
const Laps = App.Laps = (()=>{
  const num=x=>+String(x).replace(',','.');
  function parse(sid){const t=localStorage.getItem('snt.trackCsv_'+sid);if(!t)return null;const L=new Map();
    for(const row of t.replace(/^﻿/,'').split(/\r?\n/).slice(1)){const c=row.split(';');if(c.length<8)continue;const n=+c[0];if(!L.has(n))L.set(n,[]);L.get(n).push({t:num(c[1]),lat:num(c[2]),lon:num(c[3]),v:num(c[4]),gl:num(c[5]),gg:num(c[6]),d:num(c[7])})}
    return L}
  // ricampiono ogni 1% del giro: tempo e velocità interpolati sulla distanza normalizzata
  function resample(S,N=200){if(!S||S.length<3)return null;const tot=S[S.length-1].d||1;const out=[];let j=0;
    for(let i=0;i<=N;i++){const d=tot*i/N;while(j<S.length-2&&S[j+1].d<d)j++;const a=S[j],b=S[j+1];const k=Math.max(0,Math.min(1,(d-a.d)/Math.max(0.01,b.d-a.d)));
      out.push({f:i/N,d,t:a.t+(b.t-a.t)*k,v:a.v+(b.v-a.v)*k,lat:a.lat+(b.lat-a.lat)*k,lon:a.lon+(b.lon-a.lon)*k})}return out}
  const lapTime=(sess,n)=>{const l=sess.laps.find(x=>x.n===n);return l?l.t:null};
  function colorSpeed(v,lo,hi){const k=Math.max(0,Math.min(1,(v-lo)/Math.max(1,hi-lo)));const st=[[0,[255,59,48]],[0.35,[255,149,0]],[0.65,[255,214,10]],[1,[52,199,89]]];
    let i=0;while(i<st.length-2&&k>st[i+1][0])i++;const [a,A]=st[i],[b,B]=st[i+1];const t=(k-a)/(b-a);return `rgb(${A.map((x,j)=>Math.round(x+(B[j]-x)*t)).join(',')})`}
  /* ---------- mappa ---------- */
  const EMPTY={type:'FeatureCollection',features:[]};
  function mapDraw(A,B,mode){const map=MapView.map;if(!map||!MapView.ready)return;
    if(!map.getSource('lapA')){map.addSource('lapA',{type:'geojson',data:EMPTY});map.addSource('lapB',{type:'geojson',data:EMPTY});map.addSource('lapCur',{type:'geojson',data:EMPTY});
      map.addLayer({id:'lapB',type:'line',source:'lapB',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#FFFFFF','line-width':2,'line-dasharray':[2,2],'line-opacity':0.8}});
      map.addLayer({id:'lapA',type:'line',source:'lapA',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','c'],'line-width':['interpolate',['linear'],['zoom'],13,4,17,9]}});
      map.addLayer({id:'lapCur',type:'circle',source:'lapCur',paint:{'circle-radius':8,'circle-color':['get','c'],'circle-stroke-color':'#fff','circle-stroke-width':2.5}})}
    const vs=A.map(p=>p.v),lo=Math.min(...vs),hi=Math.max(...vs);const fs=[];
    for(let i=0;i<A.length-1;i++){let c;if(mode==='gain'){const g=(A[i+1].t-A[i].t)-(B[i+1].t-B[i].t);c=g<-0.012?'#34C759':g>0.012?'#FF3B30':'#8E8E93'}else c=colorSpeed((A[i].v+A[i+1].v)/2,lo,hi);
      fs.push({type:'Feature',properties:{c},geometry:{type:'LineString',coordinates:[[A[i].lon,A[i].lat],[A[i+1].lon,A[i+1].lat]]}})}
    map.getSource('lapA').setData({type:'FeatureCollection',features:fs});map.getSource('lapB').setData({type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:B.map(p=>[p.lon,p.lat])}}]});
    let bb=[[180,90],[-180,-90]];for(const p of A){bb[0][0]=Math.min(bb[0][0],p.lon);bb[0][1]=Math.min(bb[0][1],p.lat);bb[1][0]=Math.max(bb[1][0],p.lon);bb[1][1]=Math.max(bb[1][1],p.lat)}MapView.fit(bb)}
  function cursor(A,B,i){const map=MapView.map;if(!map||!map.getSource('lapCur'))return;const a=A[i],b=B[i];
    map.getSource('lapCur').setData({type:'FeatureCollection',features:[{type:'Feature',properties:{c:'#FF2D95'},geometry:{type:'Point',coordinates:[b.lon,b.lat]}},{type:'Feature',properties:{c:'#22D3EE'},geometry:{type:'Point',coordinates:[a.lon,a.lat]}}]})}
  function clearMap(){const m=MapView.map;if(m&&m.getSource&&m.getSource('lapA'))for(const s of ['lapA','lapB','lapCur'])m.getSource(s).setData(EMPTY)}
  setInterval(()=>{if(!(UI.cur&&UI.cur.name==='lapCmp'))clearMap()},1500);
  /* ---------- grafici ---------- */
  function charts(A,B){const W=340,H=96,N=A.length-1;const x=i=>(i/N*W).toFixed(1);
    const dl=A.map((p,i)=>p.t-B[i].t);const dm=Math.max(0.2,...dl.map(Math.abs));const yD=v=>(H/2-v/dm*(H/2-6)).toFixed(1);
    const dPath=dl.map((v,i)=>(i?'L':'M')+x(i)+' '+yD(v)).join('');const area=`M0 ${H/2}`+dl.map((v,i)=>'L'+x(i)+' '+yD(v)).join('')+`L${W} ${H/2}Z`;
    const vmax=Math.max(...A.map(p=>p.v),...B.map(p=>p.v)),vmin=Math.min(...A.map(p=>p.v),...B.map(p=>p.v));const yV=v=>(H-6-(v-vmin)/Math.max(1,vmax-vmin)*(H-14)).toFixed(1);
    const vA=A.map((p,i)=>(i?'L':'M')+x(i)+' '+yV(p.v)).join(''),vB=B.map((p,i)=>(i?'L':'M')+x(i)+' '+yV(p.v)).join('');
    return `<div class="lc-ch"><div class="lc-lab"><b>Delta tempo A−B</b><span><i style="background:#34C759"></i>guadagni <i style="background:#FF3B30"></i>perdi</span></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="lc-svg" data-ch="d"><defs><clipPath id="lcUp"><rect width="${W}" height="${H/2}"/></clipPath><clipPath id="lcDn"><rect y="${H/2}" width="${W}" height="${H/2}"/></clipPath></defs>
        <path d="${area}" fill="#34C759" opacity=".3" clip-path="url(#lcDn)"/><path d="${area}" fill="#FF3B30" opacity=".3" clip-path="url(#lcUp)"/>
        <line x1="0" x2="${W}" y1="${H/2}" y2="${H/2}" stroke="currentColor" opacity=".25"/><path d="${dPath}" fill="none" stroke="currentColor" stroke-width="1.8" vector-effect="non-scaling-stroke"/><line class="lc-cur" x1="0" x2="0" y1="0" y2="${H}" stroke="#FFD60A" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>
      <div class="lc-lab"><b>Velocità</b><span><i style="background:#22D3EE"></i>giro A <i style="background:#FF2D95"></i>giro B</span></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="lc-svg" data-ch="v"><path d="${vB}" fill="none" stroke="#FF2D95" stroke-width="1.8" vector-effect="non-scaling-stroke" opacity=".9"/><path d="${vA}" fill="none" stroke="#22D3EE" stroke-width="2.2" vector-effect="non-scaling-stroke"/><line class="lc-cur" x1="0" x2="0" y1="0" y2="${H}" stroke="#FFD60A" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>
      <div class="lc-read" id="lcRead">Trascina il dito sui grafici</div></div>`}
  /* ---------- schermata ---------- */
  let mode='speed';
  App.UI.R.lapCmp=(arg)=>{const sess=Store.get('trackSess',[]).find(s=>s.id===arg.sid);const L=parse(arg.sid);
    if(!sess||!L||L.size<2)return {html:App.UI.hdr('Confronto giri')+'<div class="empty">Servono almeno due giri con la telemetria salvata.</div>'};
    const ok=sess.laps.filter(l=>!l.out&&L.has(l.n)&&L.get(l.n).length>5);const best=ok.slice().sort((a,b)=>a.t-b.t)[0]||sess.laps[0];
    const a=arg.a||best.n,b=arg.b||(ok.filter(l=>l.n!==a).sort((x,y)=>x.t-y.t)[0]||sess.laps.find(l=>l.n!==a)).n;
    const A=resample(L.get(a)),B=resample(L.get(b));if(!A||!B)return {html:App.UI.hdr('Confronto giri')+'<div class="empty">Telemetria insufficiente.</div>'};
    const ta=lapTime(sess,a),tb=lapTime(sess,b),d=ta-tb;const la=sess.laps.find(l=>l.n===a),lb=sess.laps.find(l=>l.n===b);
    const chip=(k,n)=>`<button class="chip ${n===(k==='a'?a:b)?'on':''}" data-${k}="${n}">${n}</button>`;
    return {detent:'full',html:`${App.UI.hdr('Confronto giri',esc(sess.name))}
      <div class="lc-pick"><div><small style="color:#22D3EE">Giro A</small><div class="chips">${sess.laps.filter(l=>L.has(l.n)).map(l=>chip('a',l.n)).join('')}</div></div><div><small style="color:#FF2D95">Giro B</small><div class="chips">${sess.laps.filter(l=>L.has(l.n)).map(l=>chip('b',l.n)).join('')}</div></div></div>
      <div class="tiles"><div class="tile"><span>Giro ${a}</span><b>${fmt(ta)}</b><small>max ${la?la.vmax:'–'} km/h</small></div><div class="tile"><span>Giro ${b}</span><b>${fmt(tb)}</b><small>max ${lb?lb.vmax:'–'} km/h</small></div></div>
      <div class="lc-delta ${d<0?'neg':'pos'}">A è ${d<0?'più veloce':'più lento'} di <b>${Math.abs(d).toFixed(2)} s</b></div>
      ${la&&lb&&la.sec.length===lb.sec.length&&la.sec.length>1?`<div class="group lapt"><div class="kv fhead"><span>Settore</span><b>A</b><b>B</b><b>Δ</b></div>${la.sec.map((x,i)=>{const dd=x-lb.sec[i];return `<div class="kv"><span>S${i+1}</span><b>${fmt(x)}</b><b>${fmt(lb.sec[i])}</b><b style="color:${dd<0?'var(--green)':'var(--red)'}">${dd<0?'−':'+'}${Math.abs(dd).toFixed(2)}</b></div>`}).join('')}</div>`:''}
      <div class="seg lc-mode" style="margin:12px 0 4px"><button data-mode="speed" class="${mode==='speed'?'on':''}">Colori: velocità</button><button data-mode="gain" class="${mode==='gain'?'on':''}">Colori: guadagno</button></div>
      ${charts(A,B)}
      <p class="note">Sulla mappa: giro A colorato${mode==='speed'?' dal rosso (lento) al verde (veloce)':' in verde dove guadagna e in rosso dove perde su B'}, giro B tratteggiato in bianco. Distanze normalizzate sulla lunghezza del giro.</p>`,
      bind(r){setTimeout(()=>mapDraw(A,B,mode),200);
        r.querySelectorAll('[data-a]').forEach(x=>x.onclick=()=>UI.show('lapCmp',{sid:arg.sid,a:+x.dataset.a,b}));r.querySelectorAll('[data-b]').forEach(x=>x.onclick=()=>UI.show('lapCmp',{sid:arg.sid,a,b:+x.dataset.b}));
        r.querySelectorAll('[data-mode]').forEach(x=>x.onclick=()=>{mode=x.dataset.mode;App.UI.render()});
        const read=$('#lcRead');const move=e=>{const svg=e.currentTarget;const rc=svg.getBoundingClientRect();const p=(e.touches?e.touches[0]:e).clientX;const k=Math.max(0,Math.min(1,(p-rc.left)/rc.width));const i=Math.round(k*(A.length-1));
          r.querySelectorAll('.lc-cur').forEach(l=>{l.setAttribute('x1',k*340);l.setAttribute('x2',k*340)});const dd=A[i].t-B[i].t;
          read.innerHTML=`<b>${Math.round(A[i].d)} m</b> · A <b style="color:#22D3EE">${Math.round(A[i].v)}</b> · B <b style="color:#FF2D95">${Math.round(B[i].v)}</b> km/h · Δ <b style="color:${dd<=0?'var(--green)':'var(--red)'}">${dd<=0?'−':'+'}${Math.abs(dd).toFixed(2)} s</b>`;cursor(A,B,i);if(e.cancelable)e.preventDefault()};
        r.querySelectorAll('.lc-svg').forEach(s=>{s.addEventListener('touchstart',move,{passive:false});s.addEventListener('touchmove',move,{passive:false});s.addEventListener('mousemove',move);s.addEventListener('click',move)})}}};
  const fmt=s=>{if(s==null||!isFinite(s))return '–';const m=Math.floor(s/60),x=s-m*60;return (m?m+':'+(x<10?'0':''):'')+x.toFixed(2)};
  // pulsante nella schermata della sessione
  const _ts=App.UI.R.trackSess;
  App.UI.R.trackSess=function(a){const o=_ts.apply(this,arguments);const s=Store.get('trackSess',[]).find(x=>x.id===a.id);if(!o||!s||s.laps.length<2||!localStorage.getItem('snt.trackCsv_'+a.id))return o;
    o.html=o.html.replace('<button class="btn wide" id="tsCsv"','<button class="btn primary wide" id="tsCmp" style="margin-top:12px;background:linear-gradient(90deg,#0891B2,#7C3AED)">Confronta due giri</button><button class="btn wide" id="tsCsv"');
    const b0=o.bind;o.bind=function(){if(b0)b0.apply(this,arguments);const b=$('#tsCmp');if(b)b.onclick=()=>UI.show('lapCmp',{sid:a.id})};return o};
  return {parse,resample};
})();
