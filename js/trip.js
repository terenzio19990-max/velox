/* Sentinella — in viaggio:
   · pedaggi: confronto tra il percorso con autostrada e quello senza (minuti in più, euro risparmiati, quale conviene)
   · pausa: dopo 2 ore di guida (o il tempo scelto) propone l'area di servizio lungo il percorso
   · punteggio di guida: frenate e accelerazioni brusche, curve prese forte, velocità sopra il limite → voto salvato nel diario */
'use strict';
const Trip = App.Trip = (()=>{
  const S=App.S;
  /* ---------- pedaggi ---------- */
  App.on('planBody',({route:r,box})=>{if(!box||!r||!r.cost)return;const rs=Plan.st.routes||[];
    const toll=r.hasToll?r:rs.filter(x=>x.hasToll).sort((a,b)=>a.time-b.time)[0];const free=!r.hasToll?r:rs.filter(x=>!x.hasToll).sort((a,b)=>a.time-b.time)[0];
    if(!toll||!free||toll===free)return;const dm=Math.round((free.time-toll.time)/60),de=toll.cost.toll+(toll.cost.fuel-free.cost.fuel);
    if(dm<=0&&de<=0)return;
    // valore del tempo: conviene l'autostrada se ogni ora risparmiata costa meno di ~14 €
    const perH=dm>0?de/(dm/60):Infinity;const goFree=dm<=4||perH>14;const sel=r===free;
    const verdict=goFree?`<b style="color:var(--green)">Conviene senza pedaggi</b>: ${dm>0?'solo '+dm+' min in più':'nessun minuto in più'} e risparmi ${F.eur(Math.max(0,de))}`
      :`<b style="color:var(--accent)">Conviene l'autostrada</b>: guadagni ${F.dur(dm*60)} per ${F.eur(de)}`;
    box.insertAdjacentHTML('beforeend',`<div class="sec"><h3>Pedaggi</h3></div><div class="group tollbox"><div class="tl-row"><div class="${sel?'':'on'}"><small>Con autostrada</small><b>${F.dur(toll.time)}</b><span>pedaggio ~${F.eur(toll.cost.toll)}</span></div>
      <div class="${sel?'on':''}"><small>Senza pedaggi</small><b>${F.dur(free.time)}</b><span>${dm>0?'+'+dm+' min':'stesso tempo'}</span></div></div><p class="tl-v">${verdict}</p>
      ${(goFree&&!sel)||(!goFree&&sel)?`<button class="btn wide" id="tlSw">${sel?'Usa l\'autostrada':'Scegli il percorso senza pedaggi'}</button>`:''}</div>
      <p class="note">Pedaggio stimato a ${F.n((App.TOLL[App.vehicle().cls]||App.TOLL.A)*100,1)} € ogni 100 km di autostrada (±15%), carburante incluso nel confronto.</p>`);
    const b=box.querySelector('#tlSw');if(b)b.onclick=()=>{const i=rs.indexOf(sel?toll:free);if(i>=0){Plan.select(i);App.UI.render()}}});
  /* ---------- pausa ---------- */
  let drive={t:0,still:0,last:0,snooze:0},breakEl=null;
  App.on('tick',({f})=>{if(App.state.sim)return;const now=Date.now(),dt=drive.last?Math.min(10,(now-drive.last)/1000):0;drive.last=now;const sp=f.spd||0;
    if(sp>3){drive.t+=dt;drive.still=0}else{drive.still+=dt;if(drive.still>10*60){drive.t=0;drive.snooze=0}}
    const lim=(S.breakMins||120)*60;if(S.breakRemind!==false&&drive.t>=lim&&drive.t>=drive.snooze&&sp>8&&!breakEl)ask()});
  function ask(){const h=Math.floor(drive.t/3600),m=Math.round((drive.t%3600)/60);const txt=`Guidi da ${h?h+(h===1?' ora':' ore'):''}${m?' e '+m+' minuti':''}`;
    Voice.say(`${txt}. Che ne dici di una pausa?`,true);
    document.body.insertAdjacentHTML('beforeend',`<div class="brk" id="brk"><span class="brk-ic">☕</span><div class="brk-tx"><b>Che ne dici di una pausa?</b><small>${txt.toLowerCase()}</small></div>
      <div class="brk-b"><button id="brkGo">Aree di servizio</button><button id="brkLater" class="brk-l">Tra 30 min</button></div></div>`);breakEl=$('#brk');
    const close=()=>{breakEl&&breakEl.remove();breakEl=null};$('#brkGo').onclick=()=>{close();drive.snooze=drive.t+30*60;App.UI.show('results',{cat:'services',along:!!Nav.active})};
    $('#brkLater').onclick=()=>{close();drive.snooze=drive.t+30*60};setTimeout(()=>{if(breakEl){close();drive.snooze=drive.t+20*60}},30000)}
  /* ---------- punteggio di guida ---------- */
  let acc=null,prev=null;
  function reset(id){acc={id,brake:0,accel:0,corner:0,over:0,total:0,ev:[],lb:0,la:0,lc:0}}
  App.on('tick',({f})=>{const D=App.Diary;if(!D||App.state.sim)return;const id=D.curId;if(!id){acc=null;prev=null;return}if(!acc||acc.id!==id)reset(id);
    const now=f.t||Date.now(),v=f.spd;if(v==null||(f.acc||0)>40){prev=null;return}
    if(prev){const dt=(now-prev.t)/1000;if(dt>0.4&&dt<4){const a=(v-prev.v)/dt;const ev=(k,c)=>{if(acc.ev.length<40)acc.ev.push([k,+f.lat.toFixed(5),+f.lon.toFixed(5),Math.round(c*100)/100])};
        if(a<-3.4&&prev.v>6&&now-acc.lb>5000){acc.brake++;acc.lb=now;ev('b',a/9.81)}
        if(a>3.0&&now-acc.la>5000){acc.accel++;acc.la=now;ev('a',a/9.81)}
        const h1=prev.h,h2=f.hd;if(v>8&&h1!=null&&h2!=null&&h1>=0&&h2>=0){const lat=v*G.rad(Math.abs(G.sdiff(h1,h2)))/dt;if(lat>4.6&&now-acc.lc>5000){acc.corner++;acc.lc=now;ev('c',lat/9.81)}}
        if(v>3){acc.total+=dt;const L=Guard.limit;if(L&&L.v&&v*3.6>L.v+Math.max(10,L.v*0.1))acc.over+=dt}}}
    prev={t:now,v,h:f.hd}});
  function grade(x){return x>=90?['Ottima guida','#34C759']:x>=75?['Buona guida','#30B0C7']:x>=60?['Migliorabile','#FF9500']:['Da rivedere','#FF3B30']}
  App.on('tripSaved',t=>{if(!acc||acc.id!==t.id||acc.total<120)return;const km=Math.max(1,t.dist/1000);const per=Math.max(1,km/15);
    const pen=(acc.brake*5+acc.accel*3+acc.corner*3)/per;const sp=acc.over/acc.total*100;const v=Math.max(0,Math.min(100,Math.round(100-pen-sp*0.8)));
    t.score={v,brake:acc.brake,accel:acc.accel,corner:acc.corner,speedPct:Math.round(sp),ev:acc.ev};acc=null;App.Diary.save();if(km>=2)summary(t)});
  function summary(t){const s=t.score,[g,c]=grade(s.v);$('#tsum')&&$('#tsum').remove();
    document.body.insertAdjacentHTML('beforeend',`<div class="tsum" id="tsum"><div class="ts-score" style="--c:${c};--p:${s.v}"><b>${s.v}</b></div><div class="ts-tx"><b>${g}</b><small>${F.km(t.dist)} · ${[s.brake?s.brake+' frenat'+(s.brake>1?'e':'a')+' brusc'+(s.brake>1?'he':'a'):'',s.corner?s.corner+' curv'+(s.corner>1?'e':'a')+' forte':'',s.speedPct>=3?s.speedPct+'% oltre il limite':''].filter(Boolean).join(' · ')||'nessun evento brusco'}</small></div><button id="tsX" aria-label="Chiudi">×</button></div>`);
    const el=$('#tsum');el.onclick=e=>{if(e.target.id==='tsX'){el.remove();return}el.remove();App.UI.show('trip',{id:t.id})};setTimeout(()=>el&&el.remove(),15000)}
  // dettaglio del tragitto: voto, eventi e punti sulla mappa
  const _trip=App.UI.R.trip;
  App.UI.R.trip=function(a){const o=_trip.apply(this,arguments);const t=App.Diary.trips.find(x=>x.id===a.id);if(!o||!t||!t.score)return o;const s=t.score,[g,c]=grade(s.v);
    const row=(k,l,n,tip)=>`<div class="sc-r"><i style="background:${k}"></i><span>${l}</span><b>${n}</b>${tip?`<small>${tip}</small>`:''}</div>`;
    o.html+=`<div class="sec"><h3>Come hai guidato</h3></div><div class="group scbox"><div class="sc-top"><div class="ts-score big" style="--c:${c};--p:${s.v}"><b>${s.v}</b></div><div><b style="font-size:19px">${g}</b><small style="display:block;color:var(--label2)">su 100: meno eventi bruschi e meno velocità oltre il limite, più alto il voto</small></div></div>
      ${row('#FF3B30','Frenate brusche',s.brake,s.brake?'anticipa: guarda più lontano e lascia più spazio':'')}${row('#FF9500','Accelerazioni brusche',s.accel,'')}${row('#AF52DE','Curve prese forte',s.corner,s.corner?'rallenta prima della curva, non dentro':'')}${row('#0A84FF','Tempo oltre il limite',s.speedPct+'%','')}</div>
      <p class="note">Stime dal GPS del telefono: servono come tendenza, non come misura esatta.</p>`;
    const b0=o.bind;o.bind=function(){if(b0)b0.apply(this,arguments);setTimeout(()=>evLayer(s.ev),400)};return o};
  function evLayer(ev){const map=MapView.map;if(!map||!MapView.ready)return;const E={type:'FeatureCollection',features:(ev||[]).map(e=>({type:'Feature',properties:{k:e[0]},geometry:{type:'Point',coordinates:[e[2],e[1]]}}))};
    if(!map.getSource('scoreEv')){map.addSource('scoreEv',{type:'geojson',data:E});map.addLayer({id:'scoreEv',type:'circle',source:'scoreEv',paint:{'circle-radius':7,'circle-color':['match',['get','k'],'b','#FF3B30','a','#FF9500','#AF52DE'],'circle-stroke-color':'#fff','circle-stroke-width':2}})}else map.getSource('scoreEv').setData(E)}
  setInterval(()=>{const m=MapView.map;if(m&&m.getSource&&m.getSource('scoreEv')&&!(UI.cur&&UI.cur.name==='trip'))m.getSource('scoreEv').setData({type:'FeatureCollection',features:[]})},1500);
  return {grade,get driving(){return drive.t}};
})();
