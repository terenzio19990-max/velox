/* Sentinella — in tempo reale tra telefoni, senza un server proprio:
   · client MQTT minimo su WebSocket verso broker pubblici (HiveMQ, EMQX, Mosquitto, con ripiego automatico)
   · posizione live: link con chiave nel frammento (#live=…), dati cifrati AES-GCM: il broker vede solo byte illeggibili
   · carovana: codice di gruppo da cui derivano argomento e chiave; posizioni, messaggi rapidi, destinazione comune
   · segnalazioni della community (traffico, polizia, buche…) per zone di circa 60 km, con «Grazie» e «Non c'è più». */
'use strict';

/* =================== MQTT 3.1.1 =================== */
const MQ = App.MQ = (()=>{
  const BROKERS=['wss://broker.hivemq.com:8884/mqtt','wss://broker.emqx.io:8084/mqtt','wss://test.mosquitto.org:8081/mqtt'];
  // server personalizzato (per prove o per un broker proprio): localStorage 'snt.broker'
  try{const c=localStorage.getItem('snt.broker');if(c)BROKERS.unshift(c)}catch(e){}
  const te=new TextEncoder(),td=new TextDecoder();
  let ws=null,buf=new Uint8Array(0),ok=false,want=false,bi=0,fails=0,pid=1,ping=0,retryT=0;const subs=new Map(),queue=[],listeners=[];
  const id='snt-'+Math.random().toString(36).slice(2,12);
  const str=s=>{const b=te.encode(s);return [b.length>>8,b.length&255,...b]};
  const vlen=n=>{const o=[];do{let d=n%128;n=Math.floor(n/128);if(n>0)d|=128;o.push(d)}while(n>0);return o};
  const pkt=(h,body)=>{const b=body instanceof Uint8Array?body:Uint8Array.from(body);const head=[h,...vlen(b.length)];const out=new Uint8Array(head.length+b.length);out.set(head);out.set(b,head.length);return out};
  const cat=(...a)=>{let n=0;for(const x of a)n+=x.length;const o=new Uint8Array(n);let i=0;for(const x of a){o.set(x,i);i+=x.length}return o};
  function send(p){if(ws&&ws.readyState===1){try{ws.send(p);return true}catch(e){}}return false}
  function connect(){want=true;if(ws&&(ws.readyState===0||ws.readyState===1))return;clearTimeout(retryT);
    try{ws=new WebSocket(BROKERS[bi],'mqtt')}catch(e){fail();return}ws.binaryType='arraybuffer';buf=new Uint8Array(0);
    const my=ws;const to=setTimeout(()=>{if(my===ws&&!ok){try{my.close()}catch(e){}}},9000);
    ws.onopen=()=>{send(pkt(0x10,[...str('MQTT'),4,0x02,0,45,...str(id)]))};
    ws.onmessage=ev=>{buf=cat(buf,new Uint8Array(ev.data));parse()};
    ws.onclose=()=>{clearTimeout(to);if(my!==ws)return;const was=ok;ok=false;clearInterval(ping);emit('state',false);if(want){if(!was)fail();else{retryT=setTimeout(connect,1500)}}};
    ws.onerror=()=>{}}
  function fail(){fails++;bi=(bi+1)%BROKERS.length;retryT=setTimeout(connect,Math.min(30000,800*Math.pow(1.6,fails)))}
  function parse(){for(;;){if(buf.length<2)return;let m=1,len=0,i=1,b;do{if(i>=buf.length)return;b=buf[i++];len+=(b&127)*m;m*=128}while(b&128);
      if(buf.length<i+len)return;const h=buf[0],body=buf.slice(i,i+len);buf=buf.slice(i+len);const t=h>>4;
      if(t===2){if(body[1]===0){ok=true;fails=0;emit('state',true);for(const tp of subs.keys())sub0(tp);while(queue.length)send(queue.shift());clearInterval(ping);ping=setInterval(()=>send(Uint8Array.from([0xC0,0])),25000)}else{try{ws.close()}catch(e){}}}
      else if(t===3){const qos=(h>>1)&3;const tl=(body[0]<<8)|body[1];const topic=td.decode(body.slice(2,2+tl));let off=2+tl;if(qos){const p=(body[off]<<8)|body[off+1];off+=2;if(qos===1)send(Uint8Array.from([0x40,2,p>>8,p&255]))}
        const payload=body.slice(off);for(const [f,cbs] of subs)if(match(f,topic))for(const cb of cbs){try{cb(topic,payload,!!(h&1))}catch(e){console.warn(e)}}}}}
  function match(f,t){const a=f.split('/'),b=t.split('/');for(let i=0;i<a.length;i++){if(a[i]==='#')return true;if(a[i]==='+'){if(b[i]==null)return false;continue}if(a[i]!==b[i])return false}return a.length===b.length}
  function sub0(tp){const p=pid++&0xffff||1;send(pkt(0x82,[p>>8,p&255,...str(tp),0]))}
  function subscribe(tp,cb){connect();if(!subs.has(tp)){subs.set(tp,new Set());if(ok)sub0(tp)}subs.get(tp).add(cb);return ()=>unsubscribe(tp,cb)}
  function unsubscribe(tp,cb){const s=subs.get(tp);if(!s)return;if(cb)s.delete(cb);if(!cb||!s.size){subs.delete(tp);if(ok){const p=pid++&0xffff||1;send(pkt(0xA2,[p>>8,p&255,...str(tp)]))}}}
  function publish(tp,payload,retain=false,important=false){connect();const pl=payload==null?new Uint8Array(0):payload instanceof Uint8Array?payload:te.encode(typeof payload==='string'?payload:JSON.stringify(payload));
    const p=pkt(0x30|(retain?1:0),cat(Uint8Array.from(str(tp)),pl));if(ok)return send(p);if(important){queue.push(p);if(queue.length>50)queue.shift()}return false}
  function emit(e,v){for(const f of listeners)try{f(e,v)}catch(x){}}
  // l'iPhone chiude i socket quando l'app va in secondo piano: riconnetto al ritorno
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&want&&!ok){clearTimeout(retryT);try{ws&&ws.close()}catch(e){}ws=null;connect()}});
  return {connect,subscribe,unsubscribe,publish,on(f){listeners.push(f)},get ok(){return ok},get broker(){return BROKERS[bi].replace(/^wss:\/\/|:\d+\/mqtt$/g,'')},id};
})();

/* =================== cifratura =================== */
const Crypt = App.Crypt = (()=>{
  const b64u={enc:b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),dec:s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0))};
  const te=new TextEncoder(),td=new TextDecoder();
  const sha=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',te.encode(s)));
  const hex=b=>[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
  const key=raw=>crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
  async function enc(k,obj){const iv=crypto.getRandomValues(new Uint8Array(12));const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},k,te.encode(JSON.stringify(obj))));const o=new Uint8Array(12+ct.length);o.set(iv);o.set(ct,12);return o}
  async function dec(k,bytes){if(!bytes||bytes.length<29)return null;try{const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},k,bytes.slice(12));return JSON.parse(td.decode(pt))}catch(e){return null}}
  const rnd=n=>crypto.getRandomValues(new Uint8Array(n));
  return {b64u,sha,hex,key,enc,dec,rnd};
})();

/* =================== nome e utilità =================== */
const People = (()=>{
  const COLORS=['#FF2D55','#34C759','#FF9500','#5856D6','#00C7BE','#AF52DE','#FFCC00','#007AFF','#FF3B30','#A2845E'];
  const colorOf=s=>{let h=0;for(const c of String(s))h=(h*31+c.charCodeAt(0))|0;return COLORS[Math.abs(h)%COLORS.length]};
  const initials=n=>String(n||'?').trim().split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase()||'?';
  function askName(why){return new Promise(res=>{if(App.S.myName){res(App.S.myName);return}
    App.modal(`<div class="mb"><h4>Come ti chiami?</h4><p>${esc(why)}</p></div><div style="padding:0 16px 14px"><input type="text" id="nmI" maxlength="24" placeholder="Il tuo nome" style="width:100%;height:44px;border:0;border-radius:11px;background:var(--fill);padding:0 12px;font-size:17px;color:var(--label)"></div><div class="mbtns"><button data-x>Annulla</button><button data-ok>Continua</button></div>`,
      (m,close)=>{const i=m.querySelector('#nmI');setTimeout(()=>i.focus(),50);m.querySelector('[data-x]').onclick=()=>{close();res(null)};m.querySelector('[data-ok]').onclick=()=>{const v=i.value.trim();if(!v){i.focus();return}App.S.myName=v;App.saveS();close();res(v)}})})}
  const base=()=>location.origin+location.pathname;
  // marcatore persona: freccia colorata con le iniziali, ruotata secondo la direzione
  function marker(name,color){const el=document.createElement('div');el.className='pm';el.style.setProperty('--c',color);
    el.innerHTML=`<div class="pm-hd"><svg viewBox="0 0 40 40"><path d="M20 3l11 28-11-6-11 6z" fill="var(--c)" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg></div><div class="pm-av">${esc(initials(name))}</div><div class="pm-nm">${esc(name)}</div>`;return el}
  return {colorOf,initials,askName,base,marker};
})();
App.People=People;

/* =================== POSIZIONE LIVE =================== */
const Live = App.Live = (()=>{
  let me=Store.get('live',null);let key=null,lastPub=0;const follow=new Map();
  const TOPIC=id=>'snt1/l/'+id;
  async function start(minutes){const name=await People.askName('Lo vedrà chi riceve il link.');if(!name)return;
    const id=Crypt.b64u.enc(Crypt.rnd(9)),raw=Crypt.rnd(32);me={id,k:Crypt.b64u.enc(raw),exp:minutes?Date.now()+minutes*60e3:null,arr:minutes===-1,t0:Date.now()};if(me.arr)me.exp=null;
    Store.set('live',me);key=await Crypt.key(raw);MQ.connect();lastPub=0;pub(true);App.emit('live',true);await shareLink();UI.render&&UI.cur&&UI.cur.name==='live'&&UI.render()}
  const link=()=>me?`${People.base()}#live=${me.id}.${me.k}`:'';
  async function shareLink(){if(!me)return;const t=`${App.S.myName} condivide la sua posizione in tempo reale con Sentinella`;try{if(navigator.share){await navigator.share({title:'Posizione live',text:t,url:link()});return}}catch(e){if(e&&e.name==='AbortError')return}
    try{await navigator.clipboard.writeText(link());App.toast('Link copiato')}catch(e){App.toast(link(),8000)}}
  async function stop(){if(!me)return;MQ.publish(TOPIC(me.id),null,true,true);me=null;key=null;Store.del('live');App.emit('live',false);App.toast('Condivisione terminata')}
  async function pub(force){if(!me)return;if(me.exp&&Date.now()>me.exp){stop();return}const f=App.state.fix;if(!f)return;if(!key)key=await Crypt.key(Crypt.b64u.dec(me.k));
    const moving=(f.spd||0)>1.5;if(!force&&Date.now()-lastPub<(moving?3000:15000))return;lastPub=Date.now();
    const o={n:App.S.myName,la:+f.lat.toFixed(6),lo:+f.lon.toFixed(6),s:Math.round((f.spd||0)*3.6),h:App.state.hd!=null?Math.round(App.state.hd):null,a:Math.round(f.acc||0),t:Date.now()};
    if(Nav.active&&Nav.rem){const d=Plan.st.stops[Plan.st.stops.length-1];o.d={n:d&&d.name,eta:Nav.rem.eta,km:Math.round(Nav.rem.dist)}}
    MQ.publish(TOPIC(me.id),await Crypt.enc(key,o),true)}
  App.on('tick',()=>pub(false));App.on('arrived',()=>{if(me&&me.arr){stop()}});
  App.on('navStart',()=>{if(App.S.shareLiveNav&&!me)App.toast('Ricorda: puoi condividere l\'arrivo dal pannello')});

  // --- chi segue ---
  async function watch(id,k,focus){if(follow.has(id))return;const kk=await Crypt.key(Crypt.b64u.dec(k));const o={id,k,key:kk,last:null,mk:null,focus};follow.set(id,o);saveFollow();
    o.off=MQ.subscribe(TOPIC(id),async(t,pl)=>{if(!pl.length){o.ended=true;o.last&&(o.last.end=true);draw(o);App.toast((o.last&&o.last.n||'La persona')+' ha smesso di condividere');return}const d=await Crypt.dec(kk,pl);if(!d)return;o.last=d;draw(o);if(o.focus){o.focus=false;MapView.setCam('free');MapView.flyTo(d.la,d.lo,15)}
      if(UI.cur&&UI.cur.name==='liveView'&&UI.cur.arg.id===id)UI.render()})}
  function unwatch(id){const o=follow.get(id);if(!o)return;o.off&&o.off();o.mk&&o.mk.remove();follow.delete(id);saveFollow()}
  const saveFollow=()=>Store.set('follow',[...follow.values()].map(o=>({id:o.id,k:o.k})));
  function draw(o){const map=MapView.map;if(!map||!o.last)return;const d=o.last;
    if(!o.mk){const el=People.marker(d.n,People.colorOf(o.id));el.classList.add('live');o.mk=new maplibregl.Marker({element:el,rotationAlignment:'viewport'}).setLngLat([d.lo,d.la]).addTo(map);el.onclick=e=>{e.stopPropagation();bubble(o)};o.el=el}
    o.mk.setLngLat([d.lo,d.la]);o.el.querySelector('.pm-hd').style.transform=`rotate(${(d.h||0)-map.getBearing()}deg)`;o.el.querySelector('.pm-hd').style.opacity=d.h!=null&&d.s>3?1:0;o.el.classList.toggle('stale',Date.now()-d.t>120e3||!!d.end)}
  function bubble(o){const d=o.last;FX.bubble([d.lo,d.la],`<b>${esc(d.n)}</b><span>${d.end?'Ha smesso di condividere':d.s>3?`Velocità: circa ${d.s} km/h`:'Fermo'}</span><small>${FX.ago(d.t)}${d.d&&d.d.n?` · arriva a ${esc(d.d.n)} alle ${F.clock(d.d.eta)}`:''}</small>`,{avatar:esc(People.initials(d.n)),avColor:People.colorOf(o.id),onTap:()=>{FX.closeBubble();UI.show('liveView',{id:o.id})}})}
  setInterval(()=>{for(const o of follow.values())draw(o)},20000);
  App.on('mapReady',()=>{for(const o of follow.values()){if(o.mk){o.mk.remove();o.mk=null}draw(o)}});
  // rotazione delle frecce quando gira la mappa
  App.on('mapReady',()=>MapView.map&&MapView.map.on('rotate',()=>{for(const o of follow.values())draw(o)}));

  App.UI.R.live=()=>{const sh=!!me;const left=me&&me.exp?Math.max(0,me.exp-Date.now()):null;
    return {detent:'half',html:`${App.UI.hdr('Posizione live',sh?'Stai condividendo la tua posizione':'Chi ha il link ti vede muovere sulla mappa')}
      ${sh?`<div class="livebox"><span class="pulse"></span><div><b>In diretta</b><small>${me.arr?'Fino all\'arrivo':left!=null?`Ancora ${F.dur(left/1000)}`:'Finché non la interrompi'} · ${MQ.ok?'collegato':'mi collego…'}</small></div></div>
        <div style="display:grid;gap:8px;margin-top:12px"><button class="btn primary big" id="lvShare"><svg><use href="#i-share"/></svg>Invia di nuovo il link</button><button class="btn wide" id="lvStop" style="color:var(--red)">Interrompi la condivisione</button></div>`
      :`<div class="group">${[[30,'30 minuti'],[60,'1 ora'],[180,'3 ore'],[-1,'Fino all\'arrivo'],[0,'Finché non la interrompo']].map(([m,l])=>App.UI.item({attr:`data-m="${m}"`,color:m===-1?'var(--green)':'var(--accent)',icon:'<svg><use href="#i-clock"/></svg>',t1:l,t2:m===-1?'Si ferma da sola quando arrivi':'',chev:true})).join('')}</div>`}
      ${follow.size?`<div class="sec"><h3>Stai seguendo</h3></div><div class="group">${[...follow.values()].map(o=>App.UI.item({attr:`data-f="${o.id}"`,color:People.colorOf(o.id),icon:`<b style="font-size:13px">${esc(People.initials(o.last&&o.last.n))}</b>`,t1:esc(o.last?o.last.n:'In attesa…'),t2:o.last?(o.last.end?'Condivisione finita':FX.ago(o.last.t)):'',chev:true})).join('')}</div>`:''}
      <p class="note">I dati viaggiano cifrati: chi gestisce il server di collegamento non può leggerli, solo chi ha il link. Su iPhone la posizione si aggiorna mentre Sentinella è aperta.</p>`,
      bind(r){r.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>start(+b.dataset.m));const s=$('#lvShare');if(s)s.onclick=shareLink;const x=$('#lvStop');if(x)x.onclick=async()=>{await stop();App.UI.render()};
        r.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>App.UI.show('liveView',{id:b.dataset.f}))}}};
  App.UI.R.liveView=({id})=>{const o=follow.get(id);const d=o&&o.last;const f=App.state.fix;
    return {detent:'half',html:`${App.UI.hdr(d?d.n:'Posizione live',d?(d.end?'Ha smesso di condividere':'Aggiornata '+FX.ago(d.t)):'In attesa della prima posizione…')}
      ${d?`<div class="group"><div class="kv"><span>Velocità</span><b>${d.s>3?d.s+' km/h':'Fermo'}</b></div>${f?`<div class="kv"><span>Distanza da te</span><b>${F.km(G.dist(f.lat,f.lon,d.la,d.lo))}</b></div>`:''}${d.d&&d.d.n?`<div class="kv"><span>Destinazione</span><b>${esc(d.d.n)}</b></div><div class="kv"><span>Arrivo previsto</span><b>${F.clock(d.d.eta)} · ${F.km(d.d.km)}</b></div>`:''}<div class="kv"><span>Precisione</span><b>±${d.a} m</b></div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px"><button class="btn" id="lvSee">Mostra</button><button class="btn primary" id="lvGo">Raggiungi</button></div>`:'<div class="spin"></div>'}
      <button class="btn wide" id="lvUn" style="margin-top:8px;color:var(--red)">Smetti di seguire</button>`,
      bind(){const s=$('#lvSee');if(s)s.onclick=()=>{MapView.setCam('free');MapView.flyTo(d.la,d.lo,15);Sheet.set('peek')};const g=$('#lvGo');if(g)g.onclick=()=>{Plan.reset({name:d.n,lat:d.la,lon:d.lo});App.UI.openPlan()};
        $('#lvUn').onclick=()=>{unwatch(id);App.UI.back()}}}};
  async function resume(){if(me){key=await Crypt.key(Crypt.b64u.dec(me.k));if(me.exp&&Date.now()>me.exp){me=null;Store.del('live')}else MQ.connect()}
    for(const x of Store.get('follow',[]))watch(x.id,x.k)}
  return {start,stop,watch,unwatch,shareLink,resume,get sharing(){return !!me},link};
})();

/* =================== CAROVANA =================== */
const Convoy = App.Convoy = (()=>{
  let st=Store.get('convoy',null);let key=null,base='',members=new Map(),offs=[],lastPub=0,dest=null,msgs=[];
  const QUICK=[['stop','Sosta alla prossima area'],['fuel','Devo fare benzina'],['slow','Rallentate'],['wait','Vi aspetto'],['ok','Tutto ok'],['police','Polizia avanti'],['camera','Autovelox avanti'],['lost','Mi sono perso']];
  const code8=()=>{const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const r=Crypt.rnd(8);return [...r].map(x=>A[x%A.length]).join('').replace(/^(.{4})/,'$1-')};
  async function open(){if(!st)return;const norm=st.code.toUpperCase().replace(/[^A-Z0-9]/g,'');key=await Crypt.key(await Crypt.sha('snt-cv-k:'+norm));base='snt1/c/'+Crypt.hex(await Crypt.sha('snt-cv-t:'+norm)).slice(0,24);
    offs.push(MQ.subscribe(base+'/p/+',async(t,pl)=>{const mid=t.split('/').pop();if(mid===st.me)return;if(!pl.length){const m=members.get(mid);if(m){m.mk&&m.mk.remove();members.delete(mid);refresh()}return}
      const d=await Crypt.dec(key,pl);if(!d)return;let m=members.get(mid);const isNew=!m;if(!m){m={id:mid};members.set(mid,m)}Object.assign(m,d);draw(m);if(isNew&&Date.now()-d.t<120e3&&st.t0<d.t)App.toast(`${d.n} è nella carovana`);refresh()}));
    offs.push(MQ.subscribe(base+'/m',async(t,pl)=>{const d=await Crypt.dec(key,pl);if(!d||d.from===st.me)return;msgs.unshift(d);msgs=msgs.slice(0,30);Voice.beep(2,820);Voice.say(`${d.n}: ${d.txt}`,true);App.toast(`${d.n}: ${d.txt}`,6000);
      const m=members.get(d.from);if(m&&m.la)FX.bubble([m.lo,m.la],`<b>${esc(d.n)}</b><span>${esc(d.txt)}</span>`,{avatar:esc(People.initials(d.n)),avColor:People.colorOf(d.from),ttl:7000});refresh()}));
    offs.push(MQ.subscribe(base+'/d',async(t,pl)=>{if(!pl.length){dest=null;refresh();return}const d=await Crypt.dec(key,pl);if(!d)return;const isNew=!dest||dest.t!==d.t;dest=d;if(isNew&&d.by!==st.me&&Date.now()-d.t<3600e3){App.toast(`${d.n} ha scelto la destinazione: ${d.stops[d.stops.length-1].name}`,6000);Voice.say('Nuova destinazione per la carovana')}refresh()}));
    lastPub=0;pub(true)}
  function close(){for(const f of offs)f();offs=[];for(const m of members.values())m.mk&&m.mk.remove();members=new Map();dest=null;msgs=[]}
  async function create(){const n=await People.askName('Gli altri della carovana ti vedranno con questo nome.');if(!n)return;st={code:code8(),me:Crypt.b64u.enc(Crypt.rnd(6)),t0:Date.now(),owner:true};Store.set('convoy',st);await open();App.UI.render();invite()}
  async function join(code){code=(code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(code.length<6){App.toast('Codice non valido');return}const n=await People.askName('Gli altri della carovana ti vedranno con questo nome.');if(!n)return;
    if(st)leave(true);st={code:code.slice(0,4)+'-'+code.slice(4),me:Crypt.b64u.enc(Crypt.rnd(6)),t0:Date.now()};Store.set('convoy',st);await open();send('ok',`${n} si è unito`);App.toast('Sei nella carovana '+st.code);App.UI.show('convoy')}
  function leave(silent){if(!st)return;MQ.publish(base+'/p/'+st.me,null,true,true);if(!silent)send('ok',`${App.S.myName} ha lasciato la carovana`);close();st=null;Store.del('convoy');App.emit('convoy',false)}
  const link=()=>st?`${People.base()}#cv=${st.code.replace('-','')}`:'';
  async function invite(){if(!st)return;const t=`Unisciti alla mia carovana su Sentinella: codice ${st.code}`;try{if(navigator.share){await navigator.share({title:'Carovana',text:t,url:link()});return}}catch(e){if(e&&e.name==='AbortError')return}try{await navigator.clipboard.writeText(t+'\n'+link());App.toast('Invito copiato')}catch(e){App.toast(t,8000)}}
  async function pub(force){if(!st||!key)return;const f=App.state.fix;if(!f)return;const mv=(f.spd||0)>1.5;if(!force&&Date.now()-lastPub<(mv?3000:15000))return;lastPub=Date.now();
    const o={n:App.S.myName,la:+f.lat.toFixed(6),lo:+f.lon.toFixed(6),s:Math.round((f.spd||0)*3.6),h:App.state.hd!=null?Math.round(App.state.hd):null,t:Date.now()};if(Nav.active&&Nav.rem)o.eta=Nav.rem.eta;
    MQ.publish(base+'/p/'+st.me,await Crypt.enc(key,o),true)}
  async function send(k,txt){if(!st||!key)return;const o={from:st.me,n:App.S.myName,k,txt,t:Date.now()};MQ.publish(base+'/m',await Crypt.enc(key,o),false,true);msgs.unshift(o);refresh()}
  async function shareDest(){if(!st)return;const stops=(Nav.active?Plan.st.stops:Plan.st.stops).filter(s=>!s.gps).map(s=>({name:s.name,lat:s.lat,lon:s.lon}));if(!stops.length){App.toast('Scegli prima una destinazione');return}
    const o={by:st.me,n:App.S.myName,stops,t:Date.now()};MQ.publish(base+'/d',await Crypt.enc(key,o),true,true);dest=o;App.toast('Destinazione condivisa con la carovana');refresh()}
  function followDest(){if(!dest)return;Plan.st.stops=[{gps:true,name:'La mia posizione'}].concat(dest.stops);Plan.st.ver++;App.UI.openPlan()}
  function draw(m){const map=MapView.map;if(!map||m.la==null)return;
    if(!m.mk){const el=People.marker(m.n,People.colorOf(m.id));m.el=el;m.mk=new maplibregl.Marker({element:el,rotationAlignment:'viewport'}).setLngLat([m.lo,m.la]).addTo(map);
      el.onclick=e=>{e.stopPropagation();const f=App.state.fix;FX.bubble([m.lo,m.la],`<b>${esc(m.n)}</b><span>${m.s>3?`Velocità: circa ${m.s} km/h`:'Fermo'}</span><small>${FX.ago(m.t)}${f?' · a '+F.km(G.dist(f.lat,f.lon,m.la,m.lo)):''}</small>`,{avatar:esc(People.initials(m.n)),avColor:People.colorOf(m.id),onTap:()=>{FX.closeBubble();Plan.reset({name:m.n,lat:m.la,lon:m.lo});App.UI.openPlan()}})}}
    m.mk.setLngLat([m.lo,m.la]);const hd=m.el.querySelector('.pm-hd');hd.style.transform=`rotate(${(m.h||0)-map.getBearing()}deg)`;hd.style.opacity=m.h!=null&&m.s>3?1:0;m.el.classList.toggle('stale',Date.now()-m.t>120e3)}
  function refresh(){if(UI.cur&&UI.cur.name==='convoy')App.UI.render();const nb=$('#cvNav');if(nb)nb.innerHTML=navList()}
  function navList(){const f=App.state.fix;return [...members.values()].filter(m=>m.la!=null&&Date.now()-m.t<30*60e3).map(m=>{let rel='';
      if(Nav.active&&Nav.route){const a=Ahead.onRoute(m.la,m.lo,80);if(a!=null){const d=a-Nav.along();rel=d>0?`${F.km(d)} davanti`:`${F.km(-d)} dietro`}}if(!rel&&f)rel=F.km(G.dist(f.lat,f.lon,m.la,m.lo));
      return App.UI.item({color:People.colorOf(m.id),icon:`<b style="font-size:13px">${esc(People.initials(m.n))}</b>`,t1:esc(m.n),t2:(m.s>3?m.s+' km/h':'fermo')+' · '+FX.ago(m.t),rt:rel})}).join('')}
  // avvisi: chi resta indietro o smette di aggiornarsi
  const warned=new Set();
  setInterval(()=>{if(!st)return;for(const m of members.values()){draw(m);const old=Date.now()-m.t;if(old>150e3&&old<20*60e3&&!warned.has(m.id)){warned.add(m.id);App.toast(`${m.n} non si aggiorna da ${Math.round(old/60e3)} minuti`,5000)}if(old<60e3)warned.delete(m.id)}},15000);
  App.on('tick',()=>pub(false));
  App.on('mapReady',()=>{for(const m of members.values()){if(m.mk){m.mk.remove();m.mk=null}draw(m)}MapView.map&&MapView.map.on('rotate',()=>{for(const m of members.values())draw(m)})});
  App.on('navPanel',({box})=>{if(!st||!box)return;box.insertAdjacentHTML('beforeend',`<div class="sec"><h3>Carovana ${esc(st.code)}</h3><button class="link" id="cvOpen">Apri</button></div><div class="group" id="cvNav">${navList()||App.UI.item({color:'#8E8E93',icon:'<svg><use href="#i-car"/></svg>',t1:'Nessun altro collegato',t2:'Condividi il codice '+st.code})}</div>
    <div class="qmsg">${QUICK.slice(0,4).map(([k,t])=>`<button data-q="${k}">${esc(t)}</button>`).join('')}</div>`);
    $('#cvOpen').onclick=()=>App.UI.show('convoy');box.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{const q=QUICK.find(x=>x[0]===b.dataset.q);send(q[0],q[1]);App.toast('Inviato: '+q[1]);b.classList.add('sent');setTimeout(()=>b.classList.remove('sent'),900)})});

  App.UI.R.convoy=()=>{if(!st)return {detent:'half',html:`${App.UI.hdr('Carovana','Viaggiate insieme e vi vedete sulla mappa')}
      <div class="cvhero">${[0,1,2].map(i=>`<span style="--c:${['#FF2D55','#34C759','#5856D6'][i]};--d:${i*.15}s"><svg viewBox="0 0 40 40"><path d="M20 3l11 28-11-6-11 6z" fill="var(--c)" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg></span>`).join('')}</div>
      <button class="btn primary big" id="cvNew">Crea una carovana</button>
      <div class="group" style="margin-top:12px"><div class="field"><label>Hai un codice?</label><input type="text" id="cvCode" placeholder="ABCD-1234" autocapitalize="characters" maxlength="9" style="text-transform:uppercase"></div></div>
      <button class="btn wide" id="cvJoin" style="margin-top:8px">Unisciti</button>
      <p class="note">Posizioni, messaggi e destinazione viaggiano cifrati con il codice della carovana: solo chi lo conosce può vederli.</p>`,
      bind(){$('#cvNew').onclick=create;$('#cvJoin').onclick=()=>join($('#cvCode').value)}};
    const f=App.state.fix;const list=[...members.values()].filter(m=>m.la!=null&&Date.now()-m.t<60*60e3);
    return {detent:'full',html:`${App.UI.hdr('Carovana '+st.code,`${list.length+1} ${list.length?'auto':'auto · aspetto gli altri'}`)}
      <div class="actions" style="grid-template-columns:repeat(3,1fr)"><button class="act" id="cvInv"><svg><use href="#i-share"/></svg>Invita</button><button class="act" id="cvMap"><svg><use href="#i-route"/></svg>Mostra tutti</button><button class="act" id="cvDest"><svg><use href="#i-flag"/></svg>Destinazione</button></div>
      ${dest?`<div class="group">${App.UI.item({attr:'id="cvFol"',color:'var(--green)',icon:'<svg><use href="#i-flag"/></svg>',t1:esc(dest.stops[dest.stops.length-1].name),t2:`Scelta da ${esc(dest.n)} · ${FX.ago(dest.t)}`,rt:dest.by===st.me?'':'Segui',chev:dest.by!==st.me})}</div>`:''}
      <div class="sec"><h3>In viaggio</h3></div>
      <div class="group">${App.UI.item({color:People.colorOf(st.me),icon:`<b style="font-size:13px">${esc(People.initials(App.S.myName))}</b>`,t1:esc(App.S.myName)+' <span class="tag blue">tu</span>',t2:f?Math.round((f.spd||0)*3.6)+' km/h':'Posizione non disponibile'})}
        ${list.map(m=>App.UI.item({attr:`data-m="${m.id}"`,color:People.colorOf(m.id),icon:`<b style="font-size:13px">${esc(People.initials(m.n))}</b>`,t1:esc(m.n),t2:(Date.now()-m.t>120e3?'<span class="tag orange">non aggiornato</span> ':'')+(m.s>3?m.s+' km/h':'fermo')+' · '+FX.ago(m.t)+(m.eta?' · arrivo '+F.clock(m.eta):''),rt:f?F.km(G.dist(f.lat,f.lon,m.la,m.lo)):'',chev:true})).join('')}</div>
      <div class="sec"><h3>Messaggi rapidi</h3></div>
      <div class="qmsg">${QUICK.map(([k,t])=>`<button data-q="${k}">${esc(t)}</button>`).join('')}</div>
      ${msgs.length?`<div class="group" style="margin-top:10px">${msgs.slice(0,8).map(m=>`<div class="kv"><span>${esc(m.from===st.me?'Tu':m.n)}</span><b>${esc(m.txt)} <small style="color:var(--label2)">${F.clock(m.t)}</small></b></div>`).join('')}</div>`:''}
      <button class="btn wide" id="cvLeave" style="margin-top:14px;color:var(--red)">Esci dalla carovana</button>
      <p class="note">Collegamento: ${MQ.ok?'attivo':'in corso'} (${esc(MQ.broker)}). Su iPhone la posizione si aggiorna mentre Sentinella è aperta.</p>`,
      bind(r){$('#cvInv').onclick=invite;$('#cvLeave').onclick=async()=>{if(await App.confirm('Uscire dalla carovana?','','Esci',true)){leave();App.UI.render()}};
        $('#cvDest').onclick=()=>{if(Plan.st.stops.some(s=>!s.gps))shareDest();else{App.toast('Scegli una destinazione, poi condividila da qui');App.UI.show('search')}};
        const fo=$('#cvFol');if(fo&&dest.by!==st.me)fo.onclick=followDest;
        $('#cvMap').onclick=()=>{const pts=list.map(m=>[m.lo,m.la]);if(f)pts.push([f.lon,f.lat]);if(!pts.length)return;let bb=[[180,90],[-180,-90]];for(const p of pts){bb[0][0]=Math.min(bb[0][0],p[0]);bb[0][1]=Math.min(bb[0][1],p[1]);bb[1][0]=Math.max(bb[1][0],p[0]);bb[1][1]=Math.max(bb[1][1],p[1])}Sheet.set('peek');setTimeout(()=>MapView.fit(bb,{maxZoom:15,padding:{top:170,bottom:200,left:70,right:90}}),250)};
        r.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{const q=QUICK.find(x=>x[0]===b.dataset.q);send(q[0],q[1]);b.classList.add('sent');setTimeout(()=>b.classList.remove('sent'),900)});
        r.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{const m=members.get(b.dataset.m);if(m){MapView.setCam('free');MapView.flyTo(m.la,m.lo,15);Sheet.set('peek')}})}}};
  async function resume(){if(st){await open()}}
  return {create,join,leave,send,shareDest,resume,get active(){return !!st},get code(){return st&&st.code},get members(){return members}};
})();

/* =================== SEGNALAZIONI DELLA COMMUNITY =================== */
const Community = App.Community = (()=>{
  const S=App.S,K=App.KINDS;let reps=new Map(),tiles=new Set(),offs=new Map();let mine=Store.get('myReps',[]);const markers=new Map();
  const Z=9;const tileOf=(lat,lon)=>{const n=2**Z;const x=Math.floor((lon+180)/360*n);const r=G.rad(lat);const y=Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n);return x+'_'+y};
  const T=(tile,id)=>`snt1/r/${tile}/${id}`;
  function onMsg(t,pl){const id=t.split('/').pop();if(!pl.length){drop(id);return}let r;try{r=JSON.parse(new TextDecoder().decode(pl))}catch(e){return}if(!r||!r.k||!K[r.k]){return}r.id=id;
    if(r.k==='scenic'||r.k==='fun'){if(r.g&&App.Roads)App.Roads.addRemoteMark({id:r.id,k:r.k,name:r.name||K[r.k].l,g:G.decode(r.g,5),len:r.len||0,ts:r.t});return}
    if(r.exp&&Date.now()>r.exp){if(Math.random()<0.3)MQ.publish(t,null,true);drop(id);return}
    reps.set(id,r);draw(r)}
  function drop(id){reps.delete(id);const m=markers.get(id);if(m){m.getElement().classList.add('out');setTimeout(()=>m.remove(),250);markers.delete(id)}}
  function area(lat,lon){if(!S.community)return;const n=2**Z;const [x,y]=tileOf(lat,lon).split('_').map(Number);const want=new Set();for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)want.add(((x+i+n)%n)+'_'+(y+j));
    for(const t of tiles)if(!want.has(t)){offs.get(t)&&offs.get(t)();offs.delete(t);tiles.delete(t)}
    for(const t of want)if(!tiles.has(t)){tiles.add(t);offs.set(t,MQ.subscribe(`snt1/r/${t}/+`,onMsg))}}
  let lastArea=null;App.on('tick',({f})=>{if(!S.community)return;if(!lastArea||G.dist(lastArea.lat,lastArea.lon,f.lat,f.lon)>15000){lastArea={lat:f.lat,lon:f.lon};area(f.lat,f.lon)}});
  App.on('mapReady',()=>{const m=MapView.map;if(!m)return;const c=m.getCenter();if(S.community&&!lastArea)setTimeout(()=>{if(!lastArea){const f=App.state.fix;lastArea=f?{lat:f.lat,lon:f.lon}:{lat:c.lat,lon:c.lng};area(lastArea.lat,lastArea.lon)}},2500);
    for(const [id,mk] of markers){mk.remove()}markers.clear();for(const r of reps.values())draw(r);for(const r of mine)if(!reps.has(r.id)&&(!r.exp||r.exp>Date.now()))draw(r)});
  function draw(r){const map=MapView.map;if(!map||!S.hzReports)return;let mk=markers.get(r.id);
    if(!mk){const el=FX.marker(r.k,{badge:r.up>0?'+'+r.up:''});el.onclick=e=>{e.stopPropagation();tap(r.id)};mk=new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([r.lo,r.la]).addTo(map);markers.set(r.id,mk)}
    else{mk.setLngLat([r.lo,r.la]);const b=mk.getElement().querySelector('.wz-n');if(r.up>0){if(b)b.textContent='+'+r.up;else mk.getElement().insertAdjacentHTML('beforeend',`<span class="wz-n">+${r.up}</span>`)}}}
  function tap(id){const r=reps.get(id)||mine.find(x=>x.id===id);if(!r)return;const f=App.state.fix;const d=f?G.dist(f.lat,f.lon,r.la,r.lo):null;const kd=K[r.k];
    const isMine=mine.some(x=>x.id===id);
    FX.spotlight({lngLat:[r.lo,r.la],title:kd.l+(r.note?' · '+r.note:''),big:d!=null?'dista '+F.km(d):'',sub:r.st||'',color:kd.c,icon:FX.glyph(r.k,34),
      meta:`${FX.ago(r.t)}${r.by?' da '+esc(r.by):''}${r.up?` · confermata da ${r.up}`:''}`,
      actions:isMine?[{l:'Elimina',cls:'neg',fn:()=>{remove(id)}}]:[{l:'Grazie',cls:'thumb',icon:'<svg viewBox="0 0 24 24" width="20" height="20"><path d="M7 21H4V10h3zM9 10l4-7c1.5 0 2.5 1 2.2 2.6L14.6 9H20a1.8 1.8 0 011.8 2.1l-1.4 7.6A2.6 2.6 0 0117.8 21H9z" fill="currentColor"/></svg>',fn:()=>{vote(id,1)}},{l:'Non c\'è più',cls:'neg',fn:()=>{vote(id,-1)}}],
      onClose:null});
    if(!r.st&&!isMine)API.reverse(r.la,r.lo).then(x=>{const e=document.querySelector('.spot .sc-sub');if(e&&x)e.textContent=[x.name!==x.addr?x.name:'',x.addr].filter(Boolean).join(', ')}).catch(()=>{})}
  async function report(k,note){const f=App.state.fix;if(!f){App.toast('Serve la posizione per segnalare');return}const kd=K[k];
    if(S.community&&!S.myName){const n=await People.askName('Comparirà come autore delle tue segnalazioni.');if(!n)return}
    const r={k,la:+f.lat.toFixed(5),lo:+f.lon.toFixed(5),h:App.state.hd!=null?Math.round(App.state.hd):null,t:Date.now(),by:S.myName||'',up:0,dn:0,exp:kd.exp?Date.now()+kd.exp*60e3:null,st:(Guard.limit&&Guard.limit.road)||'',note:note||''};
    r.id=Crypt.b64u.enc(Crypt.rnd(8));r.tile=tileOf(r.la,r.lo);mine.push(r);mine=mine.filter(x=>!x.exp||x.exp>Date.now()).slice(-200);Store.set('myReps',mine);reps.set(r.id,r);draw(r);
    if(S.community)MQ.publish(T(r.tile,r.id),r,true,true);Voice.buzz(20);App.toast(`${kd.l} segnalato${S.community?' a chi passa di qui':''}`);
    const mk=markers.get(r.id);if(mk){const el=mk.getElement();el.classList.add('fresh');setTimeout(()=>el.classList.remove('fresh'),900)}}
  function vote(id,v){const r=reps.get(id);if(!r)return;if(v>0){r.up=(r.up||0)+1;r.t2=Date.now();if(r.exp)r.exp=Math.max(r.exp,Date.now()+K[r.k].exp*60e3*0.5);App.toast('Grazie! Segnalazione confermata')}else{r.dn=(r.dn||0)+1;App.toast('Grazie, aggiornato')}
    const tile=r.tile||tileOf(r.la,r.lo);if(r.dn>=2||(v<0&&!r.up)){MQ.publish(T(tile,id),null,true,true);drop(id)}else{MQ.publish(T(tile,id),Object.assign({},r,{id:undefined}),true,true);draw(r)}}
  function remove(id){const r=mine.find(x=>x.id===id);mine=mine.filter(x=>x.id!==id);Store.set('myReps',mine);if(r)MQ.publish(T(r.tile||tileOf(r.la,r.lo),id),null,true,true);drop(id)}
  function publishMark(mk){const tile=tileOf(mk.g[0][0],mk.g[0][1]);MQ.publish(T(tile,mk.id),{k:mk.k,name:mk.name,g:G.encode(mk.g,5),len:Math.round(mk.len),t:mk.ts,by:S.myName||'',exp:Date.now()+365*864e5,la:mk.g[0][0],lo:mk.g[0][1]},true,true)}
  // avvisi più avanti
  Ahead.add(ctx=>{if(!S.hzReports)return [];const out=[],{f,hd,nav,along}=ctx;const sp=f.spd||0;
    for(const r of reps.values()){if(r.exp&&Date.now()>r.exp)continue;let d;if(nav){const a=Ahead.onRoute(r.la,r.lo,40);if(a==null)continue;d=a-along;if(d<-15||d>3000)continue}else{d=Ahead.front(f,hd,r.la,r.lo,2000,25);if(d==null)continue;if(r.h!=null&&hd!=null&&G.adiff(r.h,hd)>110)continue}
      const kd=K[r.k];const strong=r.k==='accident'||r.k==='closure'||r.k==='hazard';
      out.push({id:'r'+r.id,kind:r.k,color:kd.c,icon:FX.glyph(r.k,22),t1:kd.l+' segnalato',t2:`${FX.ago(r.t)}${r.by?' da '+r.by:''}`,d,prio:strong?2:1,showAt:Math.max(700,sp*35),sayAt:r.k==='pothole'||r.k==='bump'?Math.max(150,sp*8):Math.max(500,sp*25),say:`${kd.l} segnalat${/a$/.test(kd.l)?'a':'o'} tra ${F.speakDist(d)}`,tap:()=>tap(r.id)})}
    return out});
  App.on('settings',()=>{if(!S.community){for(const t of tiles){offs.get(t)&&offs.get(t)()}tiles.clear();offs.clear()}else if(lastArea)area(lastArea.lat,lastArea.lon)});
  return {report,publishMark,tap,get count(){return reps.size}};
})();

/* =================== SCHERMATA «SEGNALA» (stile Waze) =================== */
App.UI.R.report=()=>{const K=App.KINDS;const big=[['traffic'],['police'],['accident'],['hazard'],['pothole'],['rough'],['bump'],['closure'],['weather']];
  return {detent:'full',html:`${App.UI.hdr('Segnala','Alla tua posizione, nella direzione di marcia')}
    <div class="repgrid">${big.map(([k])=>`<button data-r="${k}" style="--c:${K[k].c}"><span>${FX.glyph(k,30)}</span>${esc(K[k].l)}</button>`).join('')}
      <button data-g="fixed" style="--c:#E1251B"><span>${FX.glyph('camera',30)}</span>Autovelox fisso</button><button data-g="mobile" style="--c:#007AFF"><span>${FX.glyph('police',30)}</span>Controllo mobile</button>
      <button data-g="tutor" style="--c:#FF9500"><span><b style="font-size:22px;color:#fff">T</b></span>${Guard.act&&Guard.act.manual?'Fine tutor':'Inizio tutor'}</button></div>
    <div class="group" style="margin-top:14px">${App.UI.item({attr:'id="rpMark"',color:K.scenic.c,icon:FX.glyph('scenic',18),t1:App.Roads.recording?'Fine del tratto bello':'Segna un tratto bello',t2:App.Roads.recording?'Tocca alla fine per salvarlo':'Panoramico o da guidare: registro la strada che fai',chev:true})}</div>
    <p class="note">${App.S.community?'Le segnalazioni le vedono anche gli altri utenti di Sentinella che passano nella zona, insieme al tuo nome. Puoi disattivarlo in Impostazioni.':'Le segnalazioni restano su questo telefono.'}</p>`,
    bind(r){r.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{b.classList.add('pop');setTimeout(()=>{Community.report(b.dataset.r);App.UI.back()},180)});
      r.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{const k=b.dataset.g;if(k==='tutor'){Guard.act&&Guard.act.manual?Guard.end('manuale'):Guard.startManual()}else Guard.report(k);App.UI.back()});
      $('#rpMark').onclick=()=>{App.Roads.markToggle();App.UI.back()}}}};

/* =================== link condivisi e ripresa =================== */
App.on('mapReady',()=>{if(App.state.linksDone)return;App.state.linksDone=true;Live.resume();Convoy.resume();
  const h=location.hash;let m;
  if((m=/#live=([\w-]+)\.([\w-]+)/.exec(h))){Live.watch(m[1],m[2],true).then(()=>{App.UI.show('liveView',{id:m[1]});App.toast('Segui la posizione in diretta')});history.replaceState(null,'',location.pathname+location.search)}
  else if((m=/#cv=([A-Za-z0-9]+)/.exec(h))){history.replaceState(null,'',location.pathname+location.search);setTimeout(()=>Convoy.join(m[1]),400)}});
