/* Sentinella — HUD: velocità e limite enormi, schermo nero, da appoggiare sotto il parabrezza (modalità specchio) o sul supporto.
   Mostra anche la prossima manovra, gli avvisi autovelox/tutor e l'orario di arrivo. Tocca lo schermo per i comandi. */
'use strict';
const Hud = App.Hud = (()=>{
  let on=false,mirror=Store.get('hudMirror',false),hideT=0,last={kmh:0,lim:null,over:false};
  function build(){if($('#hudx'))return;document.body.insertAdjacentHTML('beforeend',`<div class="hudx hidden" id="hudx">
    <div class="hx-in" id="hxIn">
      <div class="hx-top"><span id="hxClock"></span><span id="hxEta"></span></div>
      <div class="hx-main"><div class="hx-spd"><b id="hxSpd">0</b><small>km/h</small></div><div class="hx-lim none" id="hxLim"><span>–</span></div></div>
      <div class="hx-man hidden" id="hxMan"><span id="hxManIc"></span><b id="hxManD"></b><small id="hxManT"></small></div>
      <div class="hx-alert hidden" id="hxAl"></div>
    </div>
    <div class="hx-ctl" id="hxCtl"><button id="hxMir">${mirror?'Normale':'Specchio'}</button><button id="hxX">Chiudi</button><small>Specchio: telefono sdraiato sul cruscotto sotto il parabrezza, di notte e con la luminosità al massimo. Se la scritta riflessa è capovolta, gira il telefono di mezzo giro</small></div></div>`);
    const h=$('#hudx');h.onclick=e=>{if(e.target.closest('#hxCtl button'))return;showCtl()};
    $('#hxX').onclick=()=>toggle(false);$('#hxMir').onclick=()=>{mirror=!mirror;Store.set('hudMirror',mirror);$('#hxMir').textContent=mirror?'Normale':'Specchio';apply();showCtl()}}
  function apply(){$('#hxIn').classList.toggle('mir',mirror)}
  function showCtl(){const c=$('#hxCtl');c.classList.add('vis');clearTimeout(hideT);hideT=setTimeout(()=>c.classList.remove('vis'),4000)}
  function toggle(v){build();on=v==null?!on:v;$('#hudx').classList.toggle('hidden',!on);document.body.classList.toggle('hudon',on);
    if(on){apply();showCtl();Voice.prime();App.startGps&&App.startGps();App.keepAwake&&App.keepAwake(true);try{document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen().catch(()=>{})}catch(e){}paint()}
    else{if(!App.state.driving&&!App.state.navigating)App.keepAwake&&App.keepAwake(false);try{document.fullscreenElement&&document.exitFullscreen()}catch(e){}}}
  function paint(){if(!on)return;$('#hxSpd').textContent=last.kmh;const L=$('#hxLim');L.classList.toggle('none',!last.lim);L.classList.toggle('d3',String(last.lim||'').length>2);L.firstElementChild.textContent=last.lim||'–';
    $('#hudx').classList.toggle('over',!!last.over);$('#hxClock').textContent=F.clock(Date.now());
    const R=Nav.active&&Nav.rem;$('#hxEta').textContent=R?`arrivo ${F.clock(R.eta)} · ${F.km(R.dist)}`:'';
    $('#hxMan').classList.toggle('hidden',!Nav.active)}
  App.on('hud',h=>{last=h;paint()});
  App.on('man',({m,dist})=>{if(!on)return;$('#hxManIc').innerHTML=Nav.icon(m);$('#hxManD').textContent=F.km(dist);$('#hxManT').textContent=(m.begin||m.street||m.text||'').replace(/\.$/,'').slice(0,44)});
  // avvisi autovelox/tutor e pericoli: li riprendo dalla pillola «più avanti» e dal banner autovelox
  setInterval(()=>{if(!on)return;const al=$('#hxAl');const A=$('#alert'),H=$('#hz');let t='';
    if(A&&!A.classList.contains('hidden'))t=[$('#alT1').textContent,$('#alD').textContent].filter(Boolean).join(' · ');
    else if(H&&!H.classList.contains('hidden')&&!H.classList.contains('out'))t=[$('#hzT').textContent,$('#hzD').textContent].filter(Boolean).join(' · ');
    al.classList.toggle('hidden',!t);al.textContent=t;paint()},700);
  App.on('navEnd',paint);
  return {toggle,get on(){return on}};
})();
