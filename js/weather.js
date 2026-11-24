/* Sentinella — meteo dal vivo (Open-Meteo, senza chiave): condizioni attuali, prossime ore, meteo lungo il percorso all'ora di passaggio,
   avvisi in navigazione e modalità pioggia automatica per i limiti. */
'use strict';
const Weather = App.Weather = (()=>{
  const S=App.S,BASE='https://api.open-meteo.com/v1/forecast';
  const DESC={0:'Sereno',1:'Quasi sereno',2:'Poco nuvoloso',3:'Nuvoloso',45:'Nebbia',48:'Nebbia con brina',51:'Pioviggine debole',53:'Pioviggine',55:'Pioviggine intensa',56:'Pioviggine gelata',57:'Pioviggine gelata',61:'Pioggia debole',63:'Pioggia',65:'Pioggia forte',66:'Pioggia gelata',67:'Pioggia gelata forte',71:'Neve debole',73:'Neve',75:'Neve forte',77:'Nevischio',80:'Rovesci deboli',81:'Rovesci',82:'Rovesci violenti',85:'Rovesci di neve',86:'Forti rovesci di neve',95:'Temporale',96:'Temporale con grandine',99:'Temporale con grandine forte'};
  const desc=c=>DESC[c]||'—';
  // icone disegnate (niente emoji: aspetto coerente su tutti i telefoni)
  function icon(code,day=1,size=22){const sun=`<circle cx="12" cy="12" r="4.2" fill="#FFCC00"/><g stroke="#FFCC00" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></g>`;
    const moon=`<path d="M15.5 3.5a8 8 0 108.2 11.3A6.5 6.5 0 0115.5 3.5z" transform="translate(-3 0)" fill="#C7D2FE"/>`;
    const cloud=(c='#C9CED6',y=0)=>`<path d="M7 ${18+y}h10.5a3.8 3.8 0 00.4-7.6A5.5 5.5 0 007.4 9.6 4.2 4.2 0 007 ${18+y}z" fill="${c}"/>`;
    const drops=c=>`<g stroke="${c}" stroke-width="1.8" stroke-linecap="round"><path d="M9 19.5l-1 2.3M13 19.5l-1 2.3M17 19.5l-1 2.3"/></g>`;
    const flakes=`<g fill="#fff"><circle cx="8.5" cy="21" r="1.2"/><circle cx="12.5" cy="22" r="1.2"/><circle cx="16.5" cy="21" r="1.2"/></g>`;
    let b;const sm='transform="translate(5 -3) scale(.7)"';
    if(code<=1)b=day?sun:moon;
    else if(code===2)b=`<g ${sm}>${day?sun:moon}</g>${cloud('#E5E7EB',1)}`;
    else if(code===3)b=cloud();
    else if(code===45||code===48)b=`${cloud('#AEB4BC',-3)}<g stroke="#AEB4BC" stroke-width="1.8" stroke-linecap="round"><path d="M4 19h16M6 22h12"/></g>`;
    else if(code>=95)b=`${cloud('#8E95A3',-2)}<path d="M12.5 16l-2.5 4h3l-2 4" stroke="#FFCC00" stroke-width="1.9" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
    else if((code>=71&&code<=77)||code===85||code===86)b=cloud('#C9CED6',-2)+flakes;
    else if(code===56||code===57||code===66||code===67)b=cloud('#9DB4D6',-2)+drops('#7DD3FC');
    else b=cloud('#AEB4BC',-2)+drops('#4FA3FF');
    return `<svg class="wxi" viewBox="0 0 24 24" width="${size}" height="${size}" style="width:${size}px;height:${size}px">${b}</svg>`}

  /* ---------- condizioni attuali ---------- */
  let cur=null,curAt=0,curPos=null,busy=false;
  async function current(lat,lon){const u=`${BASE}?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,precipitation,snowfall,wind_speed_10m,wind_gusts_10m,wind_direction_10m,visibility,is_day,cloud_cover&minutely_15=precipitation,weather_code&forecast_minutely_15=12&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,visibility,wind_gusts_10m,snowfall,is_day&forecast_hours=24&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&forecast_days=4&timezone=auto&timeformat=unixtime`;
    const r=await API.tfetch(u,{},9000);const j=await r.json();if(j.error)throw new Error(j.reason);return j}
  async function at(lat,lon){const r=await API.tfetch(`${BASE}?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,weather_code,is_day&timezone=auto`,{},8000);const j=await r.json();return j.current?{t:j.current.temperature_2m,code:j.current.weather_code,day:j.current.is_day}:null}
  async function refresh(force){const f=App.state.fix;const pos=f?{lat:f.lat,lon:f.lon}:(MapView.map?{lat:MapView.map.getCenter().lat,lon:MapView.map.getCenter().lng}:null);if(!pos||busy)return;
    if(!force&&cur&&Date.now()-curAt<10*60e3&&curPos&&G.dist(curPos.lat,curPos.lon,pos.lat,pos.lon)<8000)return;
    busy=true;try{cur=await current(pos.lat,pos.lon);curAt=Date.now();curPos=pos;chip();wetCheck();App.emit('weather',cur)}catch(e){}finally{busy=false}}
  function chip(){const b=$('#cWx');if(!b||!cur||!cur.current)return;const c=cur.current;b.innerHTML=`${icon(c.weather_code,c.is_day,22)}<b>${Math.round(c.temperature_2m)}°</b>`;b.classList.remove('hidden');
    b.classList.toggle('warn',sevNow()>=2)}
  function sevNow(){if(!cur||!cur.current)return 0;return classify({code:cur.current.weather_code,p:cur.current.precipitation,sn:cur.current.snowfall,vis:cur.current.visibility,g:cur.current.wind_gusts_10m,t:cur.current.temperature_2m}).sev}
  // pioggia o neve in corso: limiti ridotti in autostrada (110) e superstrada (90), se l'utente lo consente
  function wetCheck(){if(!S.autoRain||!cur||!cur.current){if(App.state.wet){App.state.wet=false}return}const c=cur.current;
    const wet=(c.precipitation||0)>=0.2||(c.weather_code>=51&&c.weather_code<=67)||(c.weather_code>=71&&c.weather_code<=86)||c.weather_code>=95;
    if(wet!==!!App.state.wet){App.state.wet=wet;if(wet&&(App.state.driving||App.state.navigating)){App.toast('Piove: limiti per pioggia attivi (autostrada 110, superstrada 90)',5000);Voice.say('Pioggia: limite in autostrada 110')}}}

  /* ---------- classificazione dei fenomeni ---------- */
  // sev: 0 nessuno · 1 attenzione · 2 pericolo · 3 grave
  function classify(x){const c=x.code||0,p=x.p||0,sn=x.sn||0,vis=x.vis==null?99999:x.vis,g=x.g||0,t=x.t==null?10:x.t;
    if(c>=96)return {k:'storm',l:'Temporale con grandine',sev:3,col:'#AF52DE'};
    if(c>=95)return {k:'storm',l:'Temporale',sev:3,col:'#AF52DE'};
    if(sn>0.2||(c>=71&&c<=77)||c===85||c===86)return {k:'snow',l:c===75||c===86||sn>1.5?'Neve forte':'Neve',sev:3,col:'#7DD3FC'};
    if(c===56||c===57||c===66||c===67||(t<=0.5&&p>0.1))return {k:'ice',l:'Pioggia gelata, ghiaccio',sev:3,col:'#22D3EE'};
    if(vis<250)return {k:'fog',l:'Nebbia fitta',sev:3,col:'#9CA3AF'};
    if(vis<1000||c===45||c===48)return {k:'fog',l:'Nebbia',sev:2,col:'#9CA3AF'};
    if(g>=75)return {k:'wind',l:'Raffiche forti',sev:2,col:'#F59E0B'};
    if(p>=4||c===65||c===82)return {k:'rain',l:'Pioggia forte',sev:2,col:'#2563EB'};
    if(p>=0.3||c===61||c===63||c===80||c===81||c===53||c===55)return {k:'rain',l:'Pioggia',sev:1,col:'#3B82F6'};
    if(t<=1)return {k:'cold',l:'Rischio ghiaccio',sev:1,col:'#67E8F9'};
    if(g>=55)return {k:'wind',l:'Vento',sev:1,col:'#F59E0B'};
    return {k:'ok',l:'',sev:0}}

  /* ---------- meteo lungo il percorso ---------- */
  function etaFn(rt){const P=G.prep(rt.coords);const marks=[];let t=0;for(const m of rt.man){marks.push([P.cum[Math.min(m.i,P.g.length-1)],t]);t+=m.time}marks.push([P.len,rt.time]);
    return {P,eta:s=>{let i=0;while(i<marks.length-2&&marks[i+1][0]<s)i++;const a=marks[i],b=marks[i+1];return a[1]+(b[1]-a[1])*Math.max(0,Math.min(1,(s-a[0])/Math.max(1,b[0]-a[0])))}}}
  async function forRoute(rt,t0=Date.now()){if(rt._wx)return rt._wx;
    rt._wx=(async()=>{const {P,eta}=etaFn(rt);const n=Math.max(2,Math.min(45,Math.ceil(P.len/12000)+1));const pts=[];
      for(let i=0;i<n;i++){const s=P.len*i/(n-1);const q=G.pointAt(P,s);pts.push({s,lat:q.lat,lon:q.lon,ts:t0+eta(s)*1000})}
      const days=Math.min(16,Math.max(2,Math.ceil((pts[pts.length-1].ts-Date.now())/864e5)+1));
      const u=`${BASE}?latitude=${pts.map(p=>p.lat.toFixed(3)).join(',')}&longitude=${pts.map(p=>p.lon.toFixed(3)).join(',')}&hourly=temperature_2m,precipitation,snowfall,weather_code,visibility,wind_gusts_10m,precipitation_probability&timeformat=unixtime&forecast_days=${days}`;
      const r=await API.tfetch(u,{},15000);let j=await r.json();if(j.error)throw new Error(j.reason);if(!Array.isArray(j))j=[j];
      pts.forEach((p,i)=>{const h=(j[i]||j[0]).hourly;let k=0,bd=1e18;for(let x=0;x<h.time.length;x++){const d=Math.abs(h.time[x]*1000-p.ts);if(d<bd){bd=d;k=x}}
        p.w={code:h.weather_code[k],p:h.precipitation[k],sn:h.snowfall[k],vis:h.visibility?h.visibility[k]:null,g:h.wind_gusts_10m[k],t:h.temperature_2m[k],pp:h.precipitation_probability?h.precipitation_probability[k]:null};p.c=classify(p.w)});
      // tratti con lo stesso fenomeno
      const segs=[];for(let i=0;i<pts.length;i++){const p=pts[i];if(!p.c.sev)continue;const last=segs[segs.length-1];
        const a=i>0?(pts[i-1].s+p.s)/2:0,b=i<pts.length-1?(p.s+pts[i+1].s)/2:P.len;
        if(last&&last.k===p.c.k&&last.i1===i-1){last.b=b;last.i1=i;last.sev=Math.max(last.sev,p.c.sev);if(p.c.sev>=last.sev)last.l=p.c.l;last.tmin=Math.min(last.tmin,p.w.t)}
        else segs.push({k:p.c.k,l:p.c.l,col:p.c.col,sev:p.c.sev,a,b,i0:i,i1:i,ts:p.ts,tmin:p.w.t})}
      const temps=pts.map(p=>p.w.t);
      return {pts,segs,P,tmin:Math.min(...temps),tmax:Math.max(...temps),worst:segs.reduce((m,s)=>Math.max(m,s.sev),0)}})();
    rt._wx.catch(()=>{rt._wx=null});return rt._wx}
  // tratti colorati sulla mappa
  const EMPTY={type:'FeatureCollection',features:[]};let wxData=EMPTY,layerOk=false;
  function ensure(){const map=MapView.map;if(!map||!MapView.ready)return false;if(!map.getSource('wx'))map.addSource('wx',{type:'geojson',data:wxData});
    if(!map.getLayer('wx-line'))map.addLayer({id:'wx-line',type:'line',source:'wx',layout:{'line-cap':'butt','line-join':'round'},paint:{'line-color':['get','col'],'line-width':['interpolate',['linear'],['zoom'],6,3,14,7],'line-offset':['interpolate',['linear'],['zoom'],6,-5,14,-12],'line-opacity':0.9,'line-dasharray':[1.2,0.6]}});
    return true}
  App.on('mapReady',()=>{layerOk=ensure()});
  function draw(wx){if(!wx){wxData=EMPTY}else{wxData={type:'FeatureCollection',features:wx.segs.map(sg=>{const g=[];const i0=G.idxAt(wx.P,sg.a),i1=G.idxAt(wx.P,sg.b)+1;for(let i=i0;i<=Math.min(i1,wx.P.g.length-1);i++)g.push([wx.P.g[i][1],wx.P.g[i][0]]);return g.length>1?{type:'Feature',geometry:{type:'LineString',coordinates:g},properties:{col:sg.col}}:null}).filter(Boolean)}}
    if(ensure())MapView.map.getSource('wx').setData(wxData)}
  App.on('planBody',({route,box})=>{if(!S.wxRoute||!box)return;let el=box.querySelector('#wxRoute');if(!el){box.insertAdjacentHTML('beforeend','<div id="wxRoute"></div>');el=box.querySelector('#wxRoute')}
    el.innerHTML='<div class="sec"><h3>Meteo sul percorso</h3></div><div class="group"><div class="spin" style="margin:14px auto"></div></div>';
    forRoute(route).then(wx=>{if(Plan.route!==route)return;draw(wx);el.innerHTML=`<div class="sec"><h3>Meteo sul percorso</h3><span class="secr">${Math.round(wx.tmin)}°–${Math.round(wx.tmax)}°</span></div>${routeHtml(wx)}`;bindStrip(el,wx)})
      .catch(()=>{el.innerHTML='<div class="sec"><h3>Meteo sul percorso</h3></div><p class="note">Meteo non disponibile ora.</p>'})});
  App.on('plan',()=>{if(!Plan.st.routes.length&&!App.state.navigating)draw(null)});
  App.on('navStart',()=>draw(null));
  App.on('navEnd',()=>draw(null));
  function routeHtml(wx){const strip=`<div class="wxstrip">${wx.pts.filter((p,i)=>i%Math.max(1,Math.ceil(wx.pts.length/9))===0||i===wx.pts.length-1).map(p=>`<div class="wxc ${p.c.sev>=2?'bad':p.c.sev?'warn':''}"><small>${F.clock(p.ts)}</small>${icon(p.w.code,isDay(p.ts),26)}<b>${Math.round(p.w.t)}°</b><small>${F.km(p.s)}</small></div>`).join('')}</div>`;
    const list=wx.segs.length?wx.segs.map(sg=>`<div class="item"><span class="ic" style="background:${sg.col}">${icon(sg.k==='rain'?63:sg.k==='snow'?73:sg.k==='fog'?45:sg.k==='storm'?95:sg.k==='ice'?66:3,1,20)}</span><span class="tx"><span class="t1" style="display:block">${esc(sg.l)}${sg.sev>=3?' <span class="tag red">attenzione</span>':''}</span><span class="t2" style="display:block">dal km ${Math.round(sg.a/1000)} al km ${Math.round(sg.b/1000)} · verso le ${F.clock(sg.ts)}</span></span></div>`).join('')
      :`<div class="item"><span class="ic" style="background:var(--green)">${icon(1,1,20)}</span><span class="tx"><span class="t1" style="display:block">Nessun fenomeno previsto</span><span class="t2" style="display:block">Niente pioggia, neve o nebbia all'ora del tuo passaggio</span></span></div>`;
    return `${strip}<div class="group" style="margin-top:8px">${list}</div>${wx.worst>=3?`<p class="note">Fenomeni intensi sul percorso: controlla le <a href="https://mappe.protezionecivile.gov.it/it/mappe-rischi/bollettino-di-criticita/" target="_blank" rel="noopener">allerte della Protezione Civile</a> e le dotazioni invernali.</p>`:''}`}
  function bindStrip(){}
  const isDay=ts=>{const h=new Date(ts).getHours();return h>=7&&h<18?1:0};

  /* ---------- avvisi in navigazione ---------- */
  const said=new Set();
  App.Ahead.add(ctx=>{if(!ctx.nav||!Nav.route||!Nav.route._wx)return [];const out=[];const wx=Nav.route._wxv;if(!wx)return [];
    for(const sg of wx.segs){const d=sg.a-ctx.along;const inside=ctx.along>=sg.a&&ctx.along<=sg.b;
      if(inside){out.push({id:'wx'+sg.a,kind:'wx',color:sg.col,icon:icon(sg.k==='rain'?63:sg.k==='snow'?73:sg.k==='fog'?45:sg.k==='storm'?95:66,1,24),t1:sg.l,t2:`per ${F.km(sg.b-ctx.along)}`,d:0,show:true,prio:sg.sev>=3?2:0});continue}
      if(d>0&&d<(sg.sev>=3?15000:8000))out.push({id:'wx'+sg.a,kind:'wx',color:sg.col,icon:icon(sg.k==='rain'?63:sg.k==='snow'?73:sg.k==='fog'?45:sg.k==='storm'?95:66,1,24),t1:sg.l+' in arrivo',t2:`verso le ${F.clock(Date.now()+d/Math.max(8,ctx.f.spd||15)*1000)}`,d,sayAt:sg.sev>=3?12000:6000,say:`Tra ${F.speakDist(d)}, ${sg.l.toLowerCase()}`,prio:sg.sev>=3?2:0})}
    return out});
  App.on('navStart',()=>{const r=Nav.route;if(r)forRoute(r).then(w=>{r._wxv=w}).catch(()=>{})});
  App.on('navReroute',()=>{const r=Nav.route;if(r)forRoute(r).then(w=>{r._wxv=w}).catch(()=>{})});

  /* ---------- schermata meteo ---------- */
  App.UI.R.weather=()=>{if(!cur){refresh(true).then(()=>{if(App.UI.cur&&App.UI.cur.name==='weather')App.UI.render()});return {detent:'half',html:App.UI.hdr('Meteo')+'<div class="spin"></div>'}}
    const c=cur.current,h=cur.hourly,m=cur.minutely_15,d=cur.daily;const k=classify({code:c.weather_code,p:c.precipitation,sn:c.snowfall,vis:c.visibility,g:c.wind_gusts_10m,t:c.temperature_2m});
    const now=Date.now()/1000;const hi=h.time.findIndex(t=>t>=now-1800);
    const next=[];for(let i=Math.max(0,hi);i<Math.min(h.time.length,hi+12);i++)next.push(i);
    // allerte nelle prossime 12 ore
    const alerts=[];for(const i of next){const x=classify({code:h.weather_code[i],p:h.precipitation[i],sn:h.snowfall[i],vis:h.visibility[i],g:h.wind_gusts_10m[i],t:h.temperature_2m[i]});if(x.sev>=2&&!alerts.some(a=>a.k===x.k))alerts.push(Object.assign({t:h.time[i]},x))}
    const rainSoon=m&&m.precipitation?m.precipitation.slice(0,8):[];const maxR=Math.max(0.5,...rainSoon);
    const rainTxt=(()=>{if(!rainSoon.length)return '';const iNow=rainSoon[0]>=0.1;const j=rainSoon.findIndex(v=>iNow?v<0.1:v>=0.1);if(iNow)return j<0?'Pioggia per almeno le prossime 2 ore':`La pioggia smette tra circa ${j*15} minuti`;return j<0?'Niente pioggia nelle prossime 2 ore':`Pioggia tra circa ${j*15} minuti`})();
    const wdir=['N','NE','E','SE','S','SO','O','NO'][Math.round((c.wind_direction_10m||0)/45)%8];
    return {detent:'full',html:`${App.UI.hdr('Meteo',curPos&&App.state.fix?'Dove sei adesso':'Centro della mappa')}
      <div class="wxnow"><div class="wxbig">${icon(c.weather_code,c.is_day,74)}<div><b>${Math.round(c.temperature_2m)}°</b><span>${esc(desc(c.weather_code))}</span><small>Percepita ${Math.round(c.apparent_temperature)}° · min ${Math.round(d.temperature_2m_min[0])}° max ${Math.round(d.temperature_2m_max[0])}°</small></div></div></div>
      ${alerts.length?`<div class="group wxalert">${alerts.map(a=>`<div class="item"><span class="ic" style="background:${a.col}"><svg><use href="#i-alert"/></svg></span><span class="tx"><span class="t1" style="display:block">${esc(a.l)}</span><span class="t2" style="display:block">dalle ${F.clock(a.t*1000)}</span></span></div>`).join('')}</div>`:''}
      ${rainSoon.length?`<div class="sec"><h3>Prossime 2 ore</h3></div><div class="group" style="padding:12px"><div class="rainbar">${rainSoon.map((v,i)=>`<i style="height:${Math.max(3,v/maxR*100)}%" class="${v>=0.1?'on':''}" title="${F.n(v,1)} mm"></i>`).join('')}</div><div class="rainlab"><span>ora</span><span>+1 h</span><span>+2 h</span></div><p style="margin:8px 0 0;font-size:15px">${esc(rainTxt)}</p></div>`:''}
      <div class="sec"><h3>Prossime ore</h3></div><div class="group"><div class="wxstrip">${next.map(i=>`<div class="wxc"><small>${i===hi?'Ora':new Date(h.time[i]*1000).getHours()+''}</small>${icon(h.weather_code[i],h.is_day?h.is_day[i]:1,26)}<b>${Math.round(h.temperature_2m[i])}°</b><small class="pp">${h.precipitation_probability[i]!=null&&h.precipitation_probability[i]>=20?h.precipitation_probability[i]+'%':'&nbsp;'}</small></div>`).join('')}</div></div>
      <div class="group" style="margin-top:12px"><div class="kv"><span>Vento</span><b>${Math.round(c.wind_speed_10m)} km/h da ${wdir} · raffiche ${Math.round(c.wind_gusts_10m)}</b></div><div class="kv"><span>Visibilità</span><b>${c.visibility>=10000?'Oltre 10 km':F.km(c.visibility)}</b></div><div class="kv"><span>Umidità</span><b>${c.relative_humidity_2m}%</b></div><div class="kv"><span>Alba e tramonto</span><b>${F.clock(d.sunrise[0]*1000)} · ${F.clock(d.sunset[0]*1000)}</b></div></div>
      <div class="sec"><h3>Prossimi giorni</h3></div><div class="group">${d.time.map((t,i)=>`<div class="kv wxday"><span>${i===0?'Oggi':new Date(t*1000).toLocaleDateString('it-IT',{weekday:'long'})}</span>${icon(d.weather_code[i],1,24)}<span class="pp">${d.precipitation_probability_max[i]>=20?d.precipitation_probability_max[i]+'%':''}</span><b>${Math.round(d.temperature_2m_min[i])}° / ${Math.round(d.temperature_2m_max[i])}°</b></div>`).join('')}</div>
      <div class="group" style="margin-top:12px"><div class="field"><label>Pioggia automatica<small>Con pioggia o neve applica i limiti ridotti (110 in autostrada, 90 in superstrada)</small></label><input type="checkbox" class="sw" id="wxAuto" ${S.autoRain?'checked':''}></div></div>
      <p class="note">Dati Open-Meteo, aggiornati ${F.clock(curAt)}. Allerte ufficiali: <a href="https://mappe.protezionecivile.gov.it/it/mappe-rischi/bollettino-di-criticita/" target="_blank" rel="noopener">Protezione Civile</a>.</p>`,
      bind(){$('#wxAuto').onchange=e=>{S.autoRain=e.target.checked;App.saveS();wetCheck()}}}};

  setInterval(()=>refresh(),60e3);App.on('mapReady',()=>setTimeout(()=>refresh(),1500));App.on('tick',({f})=>{if(!curPos||G.dist(curPos.lat,curPos.lon,f.lat,f.lon)>8000)refresh()});
  return {icon,desc,at,refresh,classify,forRoute,get cur(){return cur},sevNow};
})();
