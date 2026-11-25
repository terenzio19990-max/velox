/* Sentinella — comandi vocali in italiano (riconoscimento vocale del telefono):
   «segnala polizia», «portami a casa», «portami a Frosinone», «quanto manca?», «che limite c'è?», «metti la musica»,
   «prossima canzone», «che tempo fa?», «ho parcheggiato», «dov'è la macchina?», «benzinai», «ferma la navigazione». */
'use strict';
const VoiceCmd = App.VoiceCmd = (()=>{
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;let rec=null,busy=false;
  const norm=s=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[.,!?¿]/g,' ').replace(/\s+/g,' ').trim();
  const REP=[[/polizi|carabinier|pattuglia|posto di blocco/,'police'],[/autovelox|velox|telelaser/,'camera'],[/incident/,'accident'],[/traffico|coda|code|rallentament/,'traffic'],[/buca|buche/,'pothole'],[/dosso/,'bump'],
    [/strada chiusa|chiusa|chiusura/,'closure'],[/dissestat|sterrat|asfalto rovinato/,'rough'],[/nebbia|neve|ghiaccio|grandine|allagat/,'weather'],[/pericolo|ostacolo|oggetto|animale|veicolo fermo|lavori/,'hazard']];
  function ui(state,text){let el=$('#vc');if(!el){document.body.insertAdjacentHTML('beforeend','<div class="vc hidden" id="vc"><div class="vc-bars"><i></i><i></i><i></i><i></i><i></i></div><div class="vc-tx" id="vcT"></div></div>');el=$('#vc');el.onclick=()=>stop()}
    el.classList.toggle('hidden',state==='off');el.classList.toggle('listen',state==='listen');$('#vcT').textContent=text||'';if(state==='done')setTimeout(()=>{if(!busy)el.classList.add('hidden')},2600)}
  function say(t){Voice.say(t,true);ui('done',t)}
  function start(){if(!SR){App.toast('Il riconoscimento vocale non è disponibile su questo browser');return}if(busy){stop();return}
    try{rec=new SR();rec.lang='it-IT';rec.interimResults=true;rec.maxAlternatives=3;rec.continuous=false}catch(e){App.toast('Microfono non disponibile');return}
    busy=true;let final='';Voice.beep(1,660);ui('listen','Ti ascolto…');try{speechSynthesis.cancel()}catch(e){}
    rec.onresult=e=>{let t='';for(let i=0;i<e.results.length;i++){t+=e.results[i][0].transcript;if(e.results[i].isFinal)final=t}ui('listen',t)};
    rec.onerror=e=>{busy=false;ui('done',e.error==='not-allowed'?'Consenti il microfono nelle impostazioni di Safari':e.error==='no-speech'?'Non ho sentito niente':'Non ho capito')};
    rec.onend=()=>{busy=false;if(final)handle(final);else if($('#vc')&&$('#vc').classList.contains('listen'))ui('done','Non ho sentito niente')};
    try{rec.start()}catch(e){busy=false;ui('off')}}
  function stop(){try{rec&&rec.abort()}catch(e){}busy=false;ui('off')}
  async function handle(raw){const t=norm(raw);ui('done','«'+raw+'»');let m;
    // segnalazioni
    if(/^(segnala|c e |ce |attenzione|c'e)/.test(t)||/^(polizia|autovelox|incidente|traffico|buca|dosso)\b/.test(t)){const k=(REP.find(([re])=>re.test(t))||[])[1];
      if(k==='camera'){Guard.report(/mobile|telelaser|pattuglia/.test(t)?'mobile':'fixed');return say('Autovelox segnalato')}
      if(k){App.Community.report(k);return say('Segnalazione inviata: '+App.KINDS[k].l.toLowerCase())}return say('Cosa vuoi segnalare? Per esempio: segnala polizia')}
    // navigazione
    if((m=/^(portami|vai|naviga|andiamo|guidami|accompagnami|voglio andare|indicazioni)( verso| fino)?( a| al| alla| allo| all| ai| alle| in| da| per)?\s+(.+)$/.exec(t))){return go(m[4])}
    if(/(ferma|termina|chiudi|interrompi|stop).*(navigazione|percorso|viaggio)/.test(t)){if(Nav.active){Nav.stop();return say('Navigazione terminata')}return say('Non stai navigando')}
    if(/quanto manca|a che ora arriv|quando arriv|tempo di arrivo|quanti (km|chilometri)/.test(t)){if(!Nav.active||!Nav.rem)return say('Non stai navigando');return say(`Mancano ${F.speakDist(Nav.rem.dist)}, arrivo alle ${F.clock(Nav.rem.eta)}`)}
    if(/limite|velocita massima|a quanto posso andare/.test(t)){const L=Guard.limit;return say(L&&L.v?`Il limite è ${L.v} chilometri orari${L.road?' su '+L.road:''}`:'Non conosco il limite di questa strada')}
    if(/copilota/.test(t)){if(!Nav.active)return say('Il copilota parte con la navigazione');if(App.Copilot.on){App.Roads.copStop(false);return say('Copilota spento')}App.Roads.copStart();return ui('done','Copilota acceso')}
    // musica
    if(/(prossima|successiva|salta|avanti)( canzone| brano)?$|^next/.test(t))return music('next','Prossimo brano');
    if(/precedente|indietro|torna al brano/.test(t))return music('prev','Brano precedente');
    if(/(pausa|ferma la musica|stop musica|spegni la musica|silenzio)/.test(t))return music('pause','Musica in pausa');
    if(/(metti|fai partire|riproduci|accendi|play).*(musica|canzon|spotify|playlist)|^musica$/.test(t))return music('play','Riproduco');
    // meteo
    if(/meteo|che tempo|piove|piovera|temperatura/.test(t)){const w=App.Weather&&App.Weather.cur;if(!w||!w.current){App.Weather&&App.Weather.refresh(true);return say('Controllo il meteo, riprova tra un attimo')}const c=w.current;UI.show('weather');return say(`${App.Weather.desc(c.weather_code)}, ${Math.round(c.temperature_2m)} gradi`)}
    // parcheggio
    if(/ho parcheggiato|salva (il )?parcheggio|parcheggio qui/.test(t)){const p=App.UI.myPos();if(!p)return say('Non ho la posizione');App.Parking.set(p.lat,p.lon,false);return say('Parcheggio salvato')}
    if(/dov.*(auto|macchina|parcheggi)|trova (la )?(mia )?(auto|macchina)/.test(t)){const P=App.Parking.car;if(!P)return say('Non ho salvato nessun parcheggio');UI.show('parking');const f=App.state.fix;return say(f?`La tua auto è a ${F.speakDist(G.dist(f.lat,f.lon,P.lat,P.lon))}`:'Ecco dove hai parcheggiato')}
    if(/benzin|distributor|carburant|gasolio|diesel|rifornimento/.test(t)){UI.show('fuel');return ui('done','Distributori più convenienti')}
    if(/condividi.*posizione|posizione live/.test(t)){UI.show('live');return say('Scegli per quanto tempo condividere')}
    if(/fin dove arrivo|autonomia/.test(t)){UI.show('range');return ui('done','Fin dove arrivo')}
    if(/annulla|niente|lascia stare/.test(t))return ui('off');
    say('Non ho capito. Prova: portami a casa, segnala polizia, quanto manca')}
  function music(c,msg){const M=App.Music;if(!M||!M.connected){UI.show('music');return say('Collega prima Spotify nella schermata Musica')}const b=$(`#mplayer [data-c="${c==='play'||c==='pause'?'pp':c}"]`);
    if(b&&(c==='next'||c==='prev'||(c==='play')!==!!(M.now&&M.now.playing)))b.click();return ui('done',msg)}
  async function go(q){q=q.replace(/^(la |il |lo |l )/,'').trim();const fv=Store.get('favs',{home:null,work:null,list:[]});
    let dest=null;if(/^(casa|a casa|mia casa)$/.test(q)){dest=fv.home;if(!dest)return say('Non hai salvato casa: impostala nei preferiti')}
    else if(/^(lavoro|ufficio|al lavoro)$/.test(q)){dest=fv.work;if(!dest)return say('Non hai salvato il lavoro: impostalo nei preferiti')}
    else{dest=(fv.list||[]).find(f=>f&&f.name&&(norm(f.name)===q||norm(f.name).includes(q)));
      if(!dest){ui('done','Cerco «'+q+'»…');try{const r=await API.search(q,App.UI.myPos(),5);dest=r&&r[0]}catch(e){}}}
    if(!dest)return say('Non ho trovato '+q);
    if(Nav.active)Nav.stop(true);Plan.reset({name:dest.name||q,lat:dest.lat,lon:dest.lon,addr:dest.addr});App.UI.openPlan();say(`Calcolo il percorso per ${dest.name||q}`);
    // parto da solo appena il percorso è pronto
    let done=false;const t0=Date.now();App.on('plan',()=>{if(done||Plan.st.loading)return;done=true;if(Date.now()-t0<30000&&Plan.st.routes.length&&!Nav.active)setTimeout(()=>App.UI.startNav(),900)})}
  // pulsante microfono sulla mappa
  function button(){const c=$('#ctrls');if(!c||$('#cMic'))return;c.insertAdjacentHTML('beforeend','<button class="ctrl glass mic" id="cMic" aria-label="Comandi vocali"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>');$('#cMic').onclick=start}
  App.on('mapReady',button);setTimeout(button,1500);
  return {start,stop,handle,supported:!!SR};
})();
