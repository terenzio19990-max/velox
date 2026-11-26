/* Sentinella — «Sto arrivando»: un link che mostra solo l'orario di arrivo, aggiornato da solo, senza la tua posizione.
   Dati cifrati come la posizione live (la chiave sta nel link, il server vede byte illeggibili). Finisce da solo all'arrivo. */
'use strict';
const Eta = App.Eta = (()=>{
  let me=Store.get('eta',null),key=null,last=null,lastPub=0;let view=null;
  const TOPIC=id=>'snt1/e/'+id;
  const link=()=>me?`${People.base()}#eta=${me.id}.${me.k}`:'';
  async function start(){if(!Nav.active){App.toast('Avvia prima la navigazione');return}const name=await People.askName('Lo vedrà chi riceve il link.');if(!name)return;
    const raw=Crypt.rnd(32);me={id:Crypt.b64u.enc(Crypt.rnd(9)),k:Crypt.b64u.enc(raw),t0:Date.now()};Store.set('eta',me);key=await Crypt.key(raw);MQ.connect();lastPub=0;await pub(true);App.emit('eta',true);await share()}
  async function share(){if(!me)return;const d=dest();const t=`${App.S.myName} sta arrivando${d?' a '+d:''}: segui l'orario di arrivo`;
    try{if(navigator.share){await navigator.share({title:'Sto arrivando',text:t,url:link()});return}}catch(e){if(e&&e.name==='AbortError')return}
    try{await navigator.clipboard.writeText(link());App.toast('Link copiato')}catch(e){App.toast(link(),8000)}}
  const dest=()=>{const s=Plan.st.stops;const d=s&&s[s.length-1];return d&&d.name||''};
  async function pub(force,status){if(!me)return;if(!key)key=await Crypt.key(Crypt.b64u.dec(me.k));const R=Nav.rem;
    const o={n:App.S.myName,d:dest(),eta:R?R.eta:null,km:R?Math.round(R.dist):null,st:status||(Nav.active?'go':'stop'),t:Date.now(),t0:me.t0,tot:me.tot||(R?R.dist:null)};if(!me.tot&&R){me.tot=R.dist;Store.set('eta',me)}
    const ch=!last||Math.abs((o.eta||0)-(last.eta||0))>45e3||o.st!==last.st;if(!force&&!ch&&Date.now()-lastPub<60e3)return;last=o;lastPub=Date.now();MQ.publish(TOPIC(me.id),await Crypt.enc(key,o),true)}
  async function stop(silent){if(!me)return;await pub(true,'end');me=null;key=null;last=null;Store.del('eta');App.emit('eta',false);if(!silent)App.toast('Non condividi più l\'arrivo')}
  App.on('tick',()=>{if(me)pub(false)});
  App.on('arrived',async()=>{if(!me)return;await pub(true,'arr');me=null;key=null;Store.del('eta');App.emit('eta',false)});
  App.on('navEnd',()=>{if(me&&!Nav.active)setTimeout(()=>{if(me&&!Nav.active)pub(true,'stop')},1500)});
  /* ---------- chi riceve il link ---------- */
  async function watch(id,k){const kk=await Crypt.key(Crypt.b64u.dec(k));view={id,k,d:null};paint();
    view.off=MQ.subscribe(TOPIC(id),async(t,pl)=>{if(!pl.length)return;const d=await Crypt.dec(kk,pl);if(!d)return;view.d=d;paint()});
    view.iv=setInterval(paint,15000)}
  function paint(){let el=$('#etav');if(!view){el&&el.remove();return}if(!el){document.body.insertAdjacentHTML('beforeend','<div class="etav" id="etav"></div>');el=$('#etav')}
    const d=view.d;let h;
    if(!d)h=`<div class="ev-c"><div class="ev-spin"></div><b>In attesa dell'orario di arrivo…</b><small>Si aggiorna da solo.</small></div>`;
    else{const left=d.eta?Math.max(0,d.eta-Date.now()):null;const arr=d.st==='arr',end=d.st==='end'||d.st==='stop';const p=d.tot&&d.km!=null?Math.max(0,Math.min(1,1-d.km/d.tot)):0;
      h=`<div class="ev-c"><div class="ev-av" style="background:${People.colorOf(view.id)}">${esc(People.initials(d.n))}</div>
        <small>${esc(d.n)} ${arr?'è arrivato':end?'ha fermato la navigazione':'sta arrivando'}${d.d?' a <b>'+esc(d.d)+'</b>':''}</small>
        <div class="ev-eta">${arr?'Arrivato':d.eta?F.clock(d.eta):'–'}</div>
        ${!arr&&!end&&left!=null?`<div class="ev-left">tra ${F.dur(left/1000)}${d.km!=null?' · '+F.km(d.km):''}</div><div class="ev-prog"><i style="width:${(p*100).toFixed(1)}%"></i><span style="left:${(p*100).toFixed(1)}%">🚗</span></div>`:''}
        <p>Aggiornato ${FX.ago(d.t)}. ${arr||end?'':'La posizione non viene condivisa: vedi solo l\'orario.'}</p></div>`}
    el.innerHTML=h+`<button class="ev-x" id="evX">Chiudi</button>`;$('#evX').onclick=()=>{view.off&&view.off();clearInterval(view.iv);view=null;paint()}}
  const fromHash=()=>{const m=/#eta=([\w-]+)\.([\w-]+)/.exec(location.hash);if(!m)return;history.replaceState(null,'',location.pathname+location.search);if(view&&view.id===m[1])return;if(view){view.off&&view.off();clearInterval(view.iv)}watch(m[1],m[2])};
  App.on('mapReady',fromHash);window.addEventListener('hashchange',fromHash);
  // pulsante nel pannello di navigazione
  App.on('navPanel',({box})=>{if(!box)return;const ic='<svg viewBox="0 0 24 24" style="width:20px;height:20px"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    box.insertAdjacentHTML('afterbegin',me?`<div class="etarow"><button class="btn etabtn on" id="etaRe">${ic}Invia di nuovo l'arrivo</button><button class="btn" id="etaStop" style="color:var(--red)">Ferma</button></div>`:`<button class="btn wide etabtn" id="etaBtn">${ic}Sto arrivando: invia l'orario di arrivo</button>`);
    const b=$('#etaBtn');if(b)b.onclick=async()=>{await start();App.UI.render()};const r=$('#etaRe');if(r)r.onclick=share;
    const x=$('#etaStop');if(x)x.onclick=async()=>{if(await App.confirm('Fermare la condivisione dell\'arrivo?','Chi ha il link vedrà che hai fermato.','Ferma',true)){await stop();App.UI.render()}}});
  return {start,stop,share,get on(){return !!me}};
})();
