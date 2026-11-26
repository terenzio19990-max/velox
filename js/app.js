/* Sentinella — avvio, GPS, modalità guida, simulazione, traffico, impaginazione degli elementi sopra la mappa. */
'use strict';
(()=>{
  const S=App.S,st=App.state;
  let watchId=null,lastFix=null,gpsErr=null;

  /* ---------- GPS ---------- */
  function onPos(p){if(st.sim)return;const c=p.coords;fix({lat:c.latitude,lon:c.longitude,acc:c.accuracy,spd:c.speed,hd:c.heading,t:p.timestamp||Date.now()})}
  function fix(f){f.recv=performance.now();
    if(f.spd==null||f.spd<0||isNaN(f.spd)){if(lastFix&&f.t>lastFix.t){f.spd=G.dist(lastFix.lat,lastFix.lon,f.lat,f.lon)/((f.t-lastFix.t)/1000)}else f.spd=0}
    if(f.acc>80&&f.spd<1.5)f.spd=0;
    // direzione: rotta GPS quando ci si muove, bussola del telefono da fermi o a passo d'uomo
    if(f.hd!=null&&!isNaN(f.hd)&&f.hd>=0&&f.spd>2){st.hd=f.hd;st.hdSrc='gps';st.gpsHdT=Date.now()}
    else if(lastFix&&G.dist(lastFix.lat,lastFix.lon,f.lat,f.lon)>8&&f.spd>2){st.hd=G.brg(lastFix.lat,lastFix.lon,f.lat,f.lon);st.hdSrc='gps';st.gpsHdT=Date.now()}
    else if(Compass.fresh()){st.hd=Compass.hd;st.hdSrc='compass'}
    const first=!st.fix;st.fix=f;lastFix=f;
    if(first){MapView.showPuck();if(!st.navigating&&!st.driving&&(!UI.cur||UI.cur.name==='home'))MapView.setCam('follow')}
    Guard.tick(f,st.hd);if(App.Nav.active)App.Nav.update(f,st.hd);App.emit('tick',{f,hd:st.hd})}
  function onErr(e){gpsErr=e;if(st.sim)return;if(e.code===1&&!onErr.shown){onErr.shown=1;App.toast('Posizione negata: attivala nelle impostazioni del telefono',5000);gpsHelp()}}
  App.startGps=()=>{if(watchId!=null||!('geolocation' in navigator))return;
    watchId=navigator.geolocation.watchPosition(onPos,onErr,{enableHighAccuracy:true,maximumAge:0,timeout:20000});
    // ripiego rapido con la posizione approssimata (rete) mentre il GPS si aggancia
    navigator.geolocation.getCurrentPosition(p=>{if(!st.fix)onPos(p)},()=>{},{enableHighAccuracy:false,maximumAge:120000,timeout:10000})};
  function gpsHelp(){const ios=/iPhone|iPad|iPod/.test(navigator.userAgent);App.modal(`<div class="mb"><h4>Serve la posizione</h4><p style="text-align:left;margin-top:8px">${ios?'Impostazioni → Privacy e sicurezza → Localizzazione → Siti web di Safari: «Durante l\'uso» con «Posizione esatta» attiva. Poi riapri Sentinella.':'Consenti la posizione dal pulsante a sinistra dell\'indirizzo e, su Windows, attiva Impostazioni → Privacy e sicurezza → Posizione.'}</p></div><div class="mbtns"><button data-x>OK</button></div>`,(m,close)=>m.querySelector('[data-x]').onclick=close)}
  App.on('needGps',()=>{App.startGps();App.toast('Cerco la tua posizione…')});

  /* ---------- bussola del telefono ----------
     iPhone: webkitCompassHeading (serve il permesso, chiesto al primo tocco). Android: deviceorientationabsolute.
     Il valore viene corretto per l'orientamento dello schermo e filtrato per togliere il tremolio. */
  const Compass=App.Compass=(()=>{let hd=null,t=0,on=false,asked=false;
    const scr=()=>{const a=(screen.orientation&&screen.orientation.angle!=null)?screen.orientation.angle:(window.orientation||0);return +a||0};
    function feed(raw){if(raw==null||isNaN(raw))return;raw=(raw+scr()+360)%360;
      if(hd==null)hd=raw;else{const d=G.sdiff(hd,raw);if(Math.abs(d)<1.2)return;hd=(hd+d*0.35+360)%360}t=Date.now();
      // da fermi o lenti la direzione la dà la bussola; in movimento resta quella del GPS
      const f=st.fix;const gpsOk=st.gpsHdT&&Date.now()-st.gpsHdT<4000&&f&&f.spd>2;
      if(!gpsOk&&!st.sim){st.hd=hd;st.hdSrc='compass'}}
    function onIOS(e){if(e.webkitCompassHeading!=null&&(e.webkitCompassAccuracy==null||e.webkitCompassAccuracy<0||e.webkitCompassAccuracy<=45))feed(e.webkitCompassHeading)}
    function onAbs(e){if(e.alpha!=null&&e.absolute!==false)feed(360-e.alpha)}
    function listen(){if(on)return;on=true;if('ondeviceorientationabsolute' in window)addEventListener('deviceorientationabsolute',onAbs);else addEventListener('deviceorientation',onIOS)}
    function ask(){if(on)return;const D=window.DeviceOrientationEvent;
      if(D&&typeof D.requestPermission==='function'){if(asked)return;asked=true;D.requestPermission().then(r=>{if(r==='granted')listen()}).catch(()=>{asked=false})}else listen()}
    return {ask,get hd(){return hd},fresh(){return hd!=null&&Date.now()-t<1500}}})();
  // il permesso della bussola su iPhone si può chiedere solo dopo un tocco
  document.addEventListener('touchend',()=>Compass.ask(),{passive:true});document.addEventListener('click',()=>Compass.ask());

  /* ---------- modalità guida (senza destinazione) ---------- */
  App.toggleDrive=()=>{st.driving=!st.driving;if(st.driving){Voice.prime();App.startGps();App.keepAwake(true);st.awake=true;MapView.setCam('heading');App.toast('Guida attiva: autovelox, tutor e limiti');Voice.say('Guida attiva')}
    else{if(!st.navigating){App.keepAwake(false);st.awake=false}MapView.setCam(st.fix?'follow':'free');App.toast('Guida terminata')}};

  /* ---------- HUD ---------- */
  App.on('hud',h=>{const setL=(el,v,est)=>{el.className='limit'+(v?'':' none')+(String(v||'').length>2?' d3':'')+(est?' est':'')+(h.over?' over':'');el.firstElementChild.textContent=v||'–'};
    setL($('#limit'),h.lim,h.est);setL($('#nLimit'),h.lim,h.est);$('#speed').textContent=h.kmh;$('#nSpeed').textContent=h.kmh;
    $$('.speedo').forEach(e=>e.classList.toggle('over',!!h.over));
    $('#hud').classList.toggle('off',st.navigating||(!st.driving&&h.kmh<8&&!h.lim))});

  /* ---------- impaginazione ---------- */
  function layout(){const top=parseFloat(getComputedStyle($('#hud')).top)||12;const nav=st.navigating;const navH=nav?$('#navTop').getBoundingClientRect().bottom:0;
    const al=$('#alert');if(nav)al.style.top=(navH+8)+'px';else al.style.top='';
    const alB=al.classList.contains('hidden')?0:al.getBoundingClientRect().bottom;
    $('#navSide').style.top=Math.max(navH,alB)+10+'px';
    const tu=$('#tutor');const vis=Sheet.visible();const hi=vis>innerHeight*0.62;let b=vis+10;
    // pila sopra il pannello: mini lettore, avvisi più avanti, tutor
    for(const id of ['mplayer','hz']){const e=$('#'+id);if(!e||e.classList.contains('hidden'))continue;e.style.bottom=b+'px';e.style.opacity=hi?0:'';e.style.pointerEvents=hi?'none':'';b+=e.offsetHeight+8}
    document.documentElement.style.setProperty('--attrib-b',Math.min(b-10,innerHeight*0.6)+'px');
    if(vis<innerHeight*0.45){tu.style.top='';tu.style.bottom=b+'px'}else{tu.style.bottom='';tu.style.top=(Math.max(navH,alB,top+70)+10)+'px'}
    const cp=$('#copi');if(cp&&!cp.classList.contains('hidden'))cp.style.top=(Math.max(navH,alB)+10)+'px';
    $('#ctrls').style.opacity=vis>innerHeight*0.7?0:1;$('#hud').style.opacity=vis>innerHeight*0.7?0:''}
  App.on('layout',layout);
  $('#cWx').onclick=()=>UI.show('weather');
  App.on('markRec',on=>{$('#recdot').classList.toggle('hidden',!on)});$('#recdot').onclick=()=>App.Roads.markToggle();App.on('navStart',()=>setTimeout(layout,30));App.on('navEnd',layout);Sheet.onMove(()=>layout());addEventListener('resize',layout);

  /* ---------- traffico TomTom (facoltativo) ---------- */
  App.applyTraffic=()=>{const map=MapView.map;if(!map||!MapView.ready)return;const on=S.traffic&&S.tomtomKey;
    if(map.getLayer('traffic'))map.removeLayer('traffic');if(map.getSource('traffic'))map.removeSource('traffic');
    if(on){map.addSource('traffic',{type:'raster',tiles:[`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${encodeURIComponent(S.tomtomKey)}&tileSize=256`],tileSize:256,attribution:'Traffico © TomTom'});
      map.addLayer({id:'traffic',type:'raster',source:'traffic',paint:{'raster-opacity':0.85}},map.getLayer('alts-case')?'alts-case':undefined)}};
  App.on('mapReady',()=>{Guard.publish();if(Plan.st.routes.length&&!st.navigating)Plan.draw();App.applyTraffic()});

  /* ---------- simulazione lungo un percorso ---------- */
  let simT=0;
  App.simulate=(rt,scale=3)=>{App.stopSim();if(!rt)return;st.sim=true;st.simReady=true;Voice.prime();const P=G.prep(rt.coords);
    const speeds=new Float64Array(P.g.length);for(const m of rt.man){const v=m.time>0?Math.min(38,m.len/m.time):14;for(let i=m.i;i<=Math.min(P.g.length-1,m.ie||m.i);i++)speeds[i]=v}
    let s=0,t=Date.now();const tick=()=>{const p=G.pointAt(P,s);const v=Math.max(4,speeds[p.i]||14)*(0.96+Math.random()*0.08);
      const ff={lat:p.lat,lon:p.lon,acc:5,spd:v,hd:p.b,t};ff.recv=performance.now();
      st.hd=p.b;const first=!st.fix;st.fix=ff;lastFix=ff;if(first)MapView.showPuck();ff.spd=v*scale;// animazione alla velocità simulata
      const real=v;ff.spdReal=real;const fr=Object.assign({},ff,{spd:real});Guard.tick(fr,st.hd);if(App.Nav.active)App.Nav.update(fr,st.hd);App.emit('tick',{f:fr,hd:st.hd});
      s+=v*scale;t+=1000*scale;if(s>=P.len){App.stopSim();return}};
    tick();simT=setInterval(tick,1000);App.toast('Simulazione ×'+scale+': nessun GPS usato')};
  App.stopSim=()=>{if(simT){clearInterval(simT);simT=0}if(st.sim){st.sim=false;st.fix=null;lastFix=null;if(watchId!=null&&!st.navigating)MapView.setCam('follow')}};
  App.on('navEnd',()=>App.stopSim());
  App.demo=async()=>{UI.home();Plan.reset({name:'Frosinone',lat:41.6396,lon:13.3427});Plan.st.stops[0]={name:'Cassino',lat:41.4895,lon:13.8297};Plan.st.ver++;UI.show('plan');await Plan.compute();
    if(!Plan.route){App.toast('Serve la connessione per il viaggio di prova');return}App.toast('Premi «Simula» per partire')};

  /* ---------- avvio ---------- */
  async function boot(){
    Guard.load();
    const last=Store.get('lastPos',null);
    await MapView.init(last);
    UI.home();
    setInterval(()=>{if(st.fix&&!st.sim)Store.set('lastPos',{lat:+st.fix.lat.toFixed(4),lon:+st.fix.lon.toFixed(4)})},30000);
    const go=()=>{Voice.prime();Compass.ask();$('#splash').classList.add('out');setTimeout(()=>$('#splash').remove(),500);S.onboarded=true;App.saveS();App.startGps()};
    if(S.onboarded||/#(live|cv|eta|vai|cmd|hud|pista|segnala|parcheggio|diario|carburante)\b/.test(location.hash)||/[?&]state=snt/.test(location.search)){if(!S.onboarded){S.onboarded=true;App.saveS()}$('#splash').remove();App.startGps();document.addEventListener('pointerdown',()=>Voice.prime(),{once:true})}
    else $('#spGo').onclick=go;
    layout();
    // navigazione interrotta (app chiusa per errore): propongo di riprendere
    const ln=Store.get('lastNav',null);if(ln&&Date.now()-ln.ts<3*3600e3){const d=ln.stops[ln.stops.length-1];
      setTimeout(async()=>{if(await App.confirm('Riprendere la navigazione?',`Verso ${d.name}`,'Riprendi')){Plan.st.stops=[{gps:true,name:'La mia posizione'}].concat(ln.stops.slice(1).filter(s=>!s.gps));Plan.st.ver++;UI.show('plan');await Plan.compute()}else Store.del('lastNav')},1200)}
    if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
    window.__snt=App}
  boot();
})();
