/* Sentinella — Siri e Comandi rapidi: link che aprono l'app già pronta a fare qualcosa.
   #vai=lat,lon,Nome · #vai=casa|lavoro · #cmd=testo come a voce · #hud · #pista=id · #segnala=police
   I link per casa e preferiti contengono già le coordinate: funzionano anche se Comandi rapidi li apre in Safari. */
'use strict';
const Siri = App.Siri = (()=>{
  const base=()=>location.origin+location.pathname;
  const link=(k,v)=>`${base()}#${k}=${encodeURIComponent(v)}`;
  const favs=()=>Store.get('favs',{home:null,work:null,list:[]});
  const ll=p=>`${(+p.lat).toFixed(5)},${(+p.lon).toFixed(5)},${p.name||''}`;
  // dopo l'apertura da link serve un tocco: Safari parla solo dopo un gesto dell'utente
  function tapToGo(name){$('#gotap')&&$('#gotap').remove();document.body.insertAdjacentHTML('beforeend',`<div class="gotap" id="gotap"><div><small>Percorso pronto</small><b>${esc(name)}</b><button id="gtGo">Tocca per partire</button><button id="gtNo" class="gt-no">Annulla</button></div></div>`);
    $('#gtGo').onclick=()=>{Voice.prime();$('#gotap').remove();App.UI.startNav()};$('#gtNo').onclick=()=>$('#gotap').remove()}
  function go(dest){Plan.reset({name:dest.name||'Destinazione',lat:+dest.lat,lon:+dest.lon,addr:dest.addr});App.UI.openPlan();let done=false;const t0=Date.now();
    App.on('plan',()=>{if(done||Plan.st.loading)return;done=true;if(Plan.st.routes.length&&Date.now()-t0<60000&&!Nav.active)tapToGo(dest.name||'Destinazione')})}
  function handle(h){const m=/^#(vai|cmd|hud|pista|segnala|parcheggio|diario|carburante)(?:=(.*))?$/.exec(h||'');if(!m)return false;const k=m[1],v=decodeURIComponent(m[2]||'').trim();
    try{history.replaceState(null,'',base())}catch(e){}
    const wait=f=>{if(App.state.fix||App.state.sim)return f();let n=0;const iv=setInterval(()=>{if(App.state.fix||++n>40){clearInterval(iv);f()}},250)};
    if(k==='vai'){const c=v.split(',');if(c.length>=2&&!isNaN(+c[0])&&!isNaN(+c[1])){wait(()=>go({lat:+c[0],lon:+c[1],name:c.slice(2).join(',')||'Destinazione'}));return true}
      const F=favs();const d=/^casa$/i.test(v)?F.home:/^lavoro$/i.test(v)?F.work:(F.list||[]).find(x=>x&&x.name&&x.name.toLowerCase()===v.toLowerCase());
      if(d){wait(()=>go(d));return true}wait(()=>App.VoiceCmd.handle('portami a '+v));return true}
    if(k==='cmd'){wait(()=>App.VoiceCmd.handle(v));return true}
    if(k==='hud'){App.Hud.toggle(true);return true}
    if(k==='pista'){if(App.Track.tracks.some(t=>t.id===v))App.Track.start(v);else UI.show('tracks');return true}
    if(k==='segnala'){wait(()=>{if(v==='camera'||v==='autovelox')Guard.report('fixed');else if(App.KINDS[v])App.Community.report(v)});return true}
    UI.show({parcheggio:'parking',diario:'diary',carburante:'fuel'}[k]);return true}
  App.on('mapReady',()=>setTimeout(()=>handle(location.hash),600));
  window.addEventListener('hashchange',()=>handle(location.hash));
  /* ---------- schermata ---------- */
  App.UI.R.siri=()=>{const F=favs();const rows=[];
    if(F.home)rows.push(['Sentinella casa','Portami a casa',link('vai',ll(Object.assign({name:'Casa'},F.home))),'#007AFF','i-home']);
    if(F.work)rows.push(['Sentinella lavoro','Portami al lavoro',link('vai',ll(Object.assign({name:'Lavoro'},F.work))),'#A2845E','i-work']);
    for(const p of (F.list||[]).slice(0,6))if(p&&p.lat!=null)rows.push(['Sentinella '+p.name.toLowerCase(),'Portami a '+p.name,link('vai',ll(p)),'#FF9500','i-star']);
    rows.push(['Sentinella HUD','Apri il cruscotto grande','#hud'.replace('#',base()+'#'),'#30B0C7','i-speed']);
    rows.push(['Sentinella polizia','Segnala la polizia',link('segnala','police'),'#0A84FF','i-alert']);
    rows.push(['Sentinella macchina','Apri il parcheggio',base()+'#parcheggio','#34C759','i-pin']);
    for(const t of App.Track.tracks.slice(0,3))rows.push(['Sentinella '+t.name.toLowerCase(),'Avvia il cronometro in pista',link('pista',t.id),'#FF2D55','i-clock']);
    return {detent:'full',html:`${App.UI.hdr('Siri e Comandi rapidi','Apri Sentinella già pronta, senza toccare niente')}
      <div class="group">${rows.map((r,i)=>App.UI.item({attr:`data-c="${i}"`,color:r[3],icon:`<svg><use href="#${r[4]}"/></svg>`,t1:'«'+esc(r[0])+'»',t2:esc(r[1])+' · tocca per copiare il link'})).join('')}</div>
      <div class="sec"><h3>Come si crea</h3></div>
      <div class="group steps"><div><i>1</i><span>Tocca qui sopra il comando che vuoi: copio il link.</span></div><div><i>2</i><span>Apri l'app <b>Comandi rapidi</b>, tocca <b>+</b>, poi <b>Aggiungi azione</b> e cerca <b>Apri URL</b>.</span></div>
        <div><i>3</i><span>Incolla il link al posto di «URL».</span></div><div><i>4</i><span>Tocca il nome in alto e scrivi la frase, per esempio <b>Sentinella casa</b>.</span></div><div><i>5</i><span>Di' «Ehi Siri, Sentinella casa»: si apre Sentinella con il percorso pronto. Tocca «Tocca per partire» e vai.</span></div></div>
      <p class="note">iPhone apre questi link in Safari e non nell'icona sulla schermata Home, che ha impostazioni separate: per questo i link contengono già le coordinate. Il tocco finale serve perché Safari parla solo dopo un tocco. Se cambi casa o lavoro, ricopia il link.</p>`,
      bind(r){r.querySelectorAll('[data-c]').forEach(b=>b.onclick=async()=>{const u=rows[+b.dataset.c][2];try{await navigator.clipboard.writeText(u);App.toast('Link copiato: ora incollalo in Comandi rapidi')}catch(e){App.UI.share('Link Sentinella',u)}})}}};
  return {handle,link};
})();
