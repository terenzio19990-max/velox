/* Sentinella — dove ho parcheggiato: salvataggio automatico quando arrivi o quando scendi dall'auto,
   foto e nota (piano, colonna), scadenza della sosta con promemoria nel Calendario, strada a piedi per tornare. */
'use strict';
const Parking = App.Parking = (()=>{
  let P=Store.get('parked',null);let mk=null;
  const save=()=>{if(P)Store.set('parked',P);else Store.del('parked')};
  function set(lat,lon,auto){P={lat,lon,ts:Date.now(),auto:!!auto,note:'',photo:null,until:null,addr:''};save();draw();
    API.reverse(lat,lon).then(r=>{if(P&&r){P.addr=r.name||r.addr||'';save()}}).catch(()=>{});
    if(auto)App.toast('Ho segnato dove hai parcheggiato',3500);else{Voice.buzz(15);App.toast('Parcheggio salvato')}}
  function clear(){P=null;save();draw()}
  function draw(){const map=MapView.map;if(mk){mk.remove();mk=null}if(!map||!P)return;const el=document.createElement('div');el.className='pkm';
    el.innerHTML='<div class="pk-b"><b>P</b></div>';el.onclick=e=>{e.stopPropagation();UI.show('parking')};mk=new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([P.lon,P.lat]).addTo(map)}
  App.on('mapReady',draw);
  // salvataggio automatico: arrivo a destinazione, oppure guida (oltre 20 km/h) → fermo → a piedi
  let ped=false;App.on('navStart',()=>{ped=!!(Nav.route&&Nav.route.ped)});
  App.on('arrived',d=>{const f=App.state.fix;if(f&&!ped&&!App.state.sim)set(f.lat,f.lon,true)});
  let drove=0,stopAt=null,walkN=0;
  App.on('tick',({f})=>{const k=(f.spd||0)*3.6;if(k>20){drove=Date.now();stopAt=null;walkN=0;return}
    if(!drove||Date.now()-drove>30*60e3)return;
    if(k<1.5){if(!stopAt)stopAt={lat:f.lat,lon:f.lon,t:Date.now()};walkN=0;return}
    if(stopAt&&Date.now()-stopAt.t>60e3&&k>=2.5&&k<=8){if(++walkN>=12&&G.dist(stopAt.lat,stopAt.lon,f.lat,f.lon)>25){if(!P||G.dist(P.lat,P.lon,stopAt.lat,stopAt.lon)>40||Date.now()-P.ts>3600e3)set(stopAt.lat,stopAt.lon,true);drove=0;stopAt=null;walkN=0}}});
  // scadenza: avviso in app 10 minuti prima e promemoria nel Calendario dell'iPhone (file .ics)
  setInterval(()=>{if(!P||!P.until)return;const left=P.until-Date.now();if(left<10*60e3&&left>0&&!P.warned){P.warned=true;save();Voice.beep(2,880);Voice.say('La sosta scade tra 10 minuti',true);App.toast('La sosta scade tra 10 minuti',8000)}},30000);
  function ics(){const pad=n=>String(n).padStart(2,'0');const d=new Date(P.until);const fmt=x=>`${x.getUTCFullYear()}${pad(x.getUTCMonth()+1)}${pad(x.getUTCDate())}T${pad(x.getUTCHours())}${pad(x.getUTCMinutes())}00Z`;
    const txt=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Sentinella//IT','BEGIN:VEVENT',`UID:snt-${P.ts}@sentinella`,`DTSTAMP:${fmt(new Date())}`,`DTSTART:${fmt(new Date(P.until-15*60e3))}`,`DTEND:${fmt(d)}`,'SUMMARY:Scade la sosta','DESCRIPTION:'+(P.addr||'Auto parcheggiata').replace(/[,;]/g,' ')+(P.note?' - '+P.note.replace(/[,;\n]/g,' '):''),`GEO:${P.lat};${P.lon}`,'BEGIN:VALARM','TRIGGER:-PT10M','ACTION:DISPLAY','DESCRIPTION:Scade la sosta','END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'text/calendar'}));a.download='sosta.ics';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500)}
  // foto ridotta (max 900 px) per non riempire la memoria
  function shrink(file){return new Promise((res,rej)=>{const img=new Image();img.onload=()=>{const k=Math.min(1,900/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',0.72));URL.revokeObjectURL(img.src)};img.onerror=rej;img.src=URL.createObjectURL(file)})}
  App.UI.R.parking=()=>{const f=App.state.fix;if(!P)return {detent:'half',html:`${App.UI.hdr('Parcheggio','Ricordo io dove hai lasciato l\'auto')}
      <div class="pkhero"><div class="pk-b big"><b>P</b></div></div>
      <button class="btn primary big" id="pkHere">Ho parcheggiato qui</button>
      <p class="note">Lo segno anche da solo quando arrivi con il navigatore, o quando dopo un tragitto in auto ti fermi e inizi a camminare (con Sentinella aperta).</p>`,
      bind(){$('#pkHere').onclick=()=>{const p=App.UI.myPos();if(!p){App.toast('Serve la posizione');return}set(p.lat,p.lon,false);App.UI.render()}}};
    const left=P.until?P.until-Date.now():null;
    return {detent:'half',html:`${App.UI.hdr('La tua auto',`${P.addr?esc(P.addr)+' · ':''}${FX.ago(P.ts)}`)}
      ${P.photo?`<img class="pkphoto" src="${P.photo}" alt="Foto del parcheggio">`:''}
      <div class="tiles">${f?`<div class="tile"><span>Distanza</span><b>${F.km(G.dist(f.lat,f.lon,P.lat,P.lon))}</b><small>circa ${Math.max(1,Math.round(G.dist(f.lat,f.lon,P.lat,P.lon)/80))} min a piedi</small></div>`:''}
        <div class="tile"><span>Sosta</span><b>${left==null?'Libera':left>0?F.dur(left/1000):'Scaduta'}</b><small>${P.until?'fino alle '+F.clock(P.until):'nessuna scadenza'}</small></div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px"><button class="btn" id="pkSee">Mostra</button><button class="btn primary" id="pkGo">Torna all'auto</button></div>
      <div class="sec"><h3>Scadenza della sosta</h3></div>
      <div class="chips">${[[30,'30 min'],[60,'1 ora'],[90,'1,5 ore'],[120,'2 ore'],[180,'3 ore'],[0,'Nessuna']].map(([m,l])=>`<button class="chip ${P.until&&m&&Math.abs(P.until-P.ts-m*60e3)<60e3?'on':''}" data-m="${m}">${l}</button>`).join('')}</div>
      ${P.until&&P.until>Date.now()?'<button class="btn wide" id="pkIcs" style="margin-top:8px"><svg><use href="#i-clock"/></svg>Aggiungi promemoria al Calendario</button>':''}
      <div class="group" style="margin-top:12px"><div class="field"><label>Nota</label><input type="text" id="pkNote" value="${esc(P.note||'')}" placeholder="Es. piano -2, colonna B4" maxlength="80"></div>
        <label class="item" style="cursor:pointer"><span class="ic" style="background:#5856D6"><svg viewBox="0 0 24 24" style="width:18px;height:18px"><path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="#fff" stroke-width="2"/></svg></span><span class="tx"><span class="t1" style="display:block">${P.photo?'Cambia foto':'Scatta una foto'}</span><span class="t2" style="display:block">Il cartello del piano o un punto di riferimento</span></span><input type="file" accept="image/*" capture="environment" id="pkPh" hidden></label></div>
      <button class="btn wide" id="pkDone" style="margin-top:12px;color:var(--red)">Ho ripreso l'auto</button>`,
      bind(){$('#pkSee').onclick=()=>{MapView.setCam('free');MapView.flyTo(P.lat,P.lon,17);Sheet.set('peek')};
        $('#pkGo').onclick=()=>{Plan.reset({name:'La mia auto',lat:P.lat,lon:P.lon});App.UI.openPlan(true)};
        document.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{const m=+b.dataset.m;P.until=m?Date.now()+m*60e3:null;P.warned=false;save();App.UI.render();if(m)App.toast('Ti avviso 10 minuti prima della scadenza')});
        const ic=$('#pkIcs');if(ic)ic.onclick=ics;$('#pkNote').onchange=e=>{P.note=e.target.value.trim();save()};
        $('#pkPh').onchange=async e=>{const fl=e.target.files&&e.target.files[0];if(!fl)return;try{P.photo=await shrink(fl);save();App.UI.render()}catch(x){App.toast('Foto non leggibile')}};
        $('#pkDone').onclick=()=>{clear();App.UI.back()}}}};
  return {set,clear,get car(){return P}};
})();
