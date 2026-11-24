/* Sentinella — musica: Spotify (telecomando dell'app Spotify via Web API, accesso PKCE senza server) e Apple Music
   (MusicKit con token sviluppatore, oppure apertura rapida dell'app Musica). Mini lettore sopra il pannello durante la guida. */
'use strict';
const Music = App.Music = (()=>{
  const S=App.S;
  /* =================== SPOTIFY =================== */
  const SCOPES='user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private user-library-read user-read-recently-played';
  let tok=Store.get('spTok',null),now=null,pollT=0,lastErr='';
  const redirect=()=>location.origin+location.pathname;
  async function login(){if(!S.spClient){App.toast('Inserisci prima il Client ID di Spotify');UI.show('music');return}
    const v=App.Crypt.b64u.enc(App.Crypt.rnd(48));const ch=App.Crypt.b64u.enc(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));
    sessionStorage.setItem('snt.spv',v);try{localStorage.setItem('snt.spv',v)}catch(e){}
    const u=new URL('https://accounts.spotify.com/authorize');Object.entries({response_type:'code',client_id:S.spClient,scope:SCOPES,redirect_uri:redirect(),code_challenge_method:'S256',code_challenge:ch,state:'snt'}).forEach(([k,x])=>u.searchParams.set(k,x));
    location.href=u.toString()}
  async function token(body){const r=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(Object.assign({client_id:S.spClient},body))});const j=await r.json();if(!r.ok)throw new Error(j.error_description||j.error||'Spotify');
    tok={a:j.access_token,r:j.refresh_token||(tok&&tok.r),exp:Date.now()+(j.expires_in-60)*1000};Store.set('spTok',tok);return tok}
  async function handleReturn(){const q=new URLSearchParams(location.search);if(q.get('state')!=='snt')return;const code=q.get('code'),err=q.get('error');history.replaceState(null,'',location.pathname+location.hash);
    if(err){App.toast('Spotify: accesso annullato');return}const v=sessionStorage.getItem('snt.spv')||localStorage.getItem('snt.spv');
    try{await token({grant_type:'authorization_code',code,redirect_uri:redirect(),code_verifier:v});App.toast('Spotify collegato');Voice.buzz(15);startPoll();setTimeout(()=>UI.show('music'),600)}catch(e){App.toast('Spotify: '+e.message,6000)}}
  async function api(path,opt={}){if(!tok)throw new Error('non collegato');if(Date.now()>tok.exp){if(!tok.r)throw new Error('accesso scaduto');await token({grant_type:'refresh_token',refresh_token:tok.r})}
    const r=await fetch('https://api.spotify.com/v1'+path,Object.assign({},opt,{headers:Object.assign({Authorization:'Bearer '+tok.a},opt.body?{'Content-Type':'application/json'}:{})}));
    if(r.status===401){tok.exp=0;Store.set('spTok',tok);throw new Error('accesso scaduto')}if(r.status===204||r.status===202)return null;const t=await r.text();let j=null;try{j=t?JSON.parse(t):null}catch(e){}
    if(!r.ok){const m=j&&j.error&&(j.error.message||j.error.reason)||('HTTP '+r.status);throw Object.assign(new Error(m),{status:r.status,reason:j&&j.error&&j.error.reason})}return j}
  async function poll(){if(!tok)return;try{const j=await api('/me/player?additional_types=episode');now=j&&j.item?{src:'sp',title:j.item.name,artist:(j.item.artists||[]).map(a=>a.name).join(', ')||(j.item.show&&j.item.show.name)||'',art:((j.item.album&&j.item.album.images)||j.item.images||[]).slice(-2)[0]?.url||'',playing:j.is_playing,pos:j.progress_ms,dur:j.item.duration_ms,at:Date.now(),dev:j.device&&j.device.name,vol:j.device&&j.device.volume_percent,shuffle:j.shuffle_state}:(j?Object.assign(now||{},{playing:false}):null);lastErr=''}
    catch(e){lastErr=e.message}render()}
  function startPoll(){clearInterval(pollT);if(!tok)return;poll();pollT=setInterval(()=>{if(document.visibilityState==='visible')poll()},5000)}
  // comando con ripiego: se nessun dispositivo è attivo, sveglio il primo disponibile
  async function cmd(method,path,body){try{await api(path,{method,body:body?JSON.stringify(body):undefined})}catch(e){
      if(e.status===404||e.reason==='NO_ACTIVE_DEVICE'){const d=await api('/me/player/devices').catch(()=>null);const dev=d&&d.devices&&(d.devices.find(x=>/smartphone/i.test(x.type))||d.devices[0]);
        if(dev){await api('/me/player',{method:'PUT',body:JSON.stringify({device_ids:[dev.id],play:true})});await new Promise(r=>setTimeout(r,600));try{await api(path,{method,body:body?JSON.stringify(body):undefined})}catch(e2){}}
        else{App.toast('Apri Spotify sul telefono e fai partire un brano, poi riprova',6000);location.href='spotify:';return}}
      else if(e.status===403)App.toast('Spotify: serve un account Premium per i comandi');else App.toast('Spotify: '+e.message)}
    setTimeout(poll,350)}
  const sp={play:()=>cmd('PUT','/me/player/play'),pause:()=>cmd('PUT','/me/player/pause'),next:()=>cmd('POST','/me/player/next'),prev:()=>cmd('POST','/me/player/previous'),
    context:uri=>cmd('PUT','/me/player/play',{context_uri:uri}),tracks:uris=>cmd('PUT','/me/player/play',{uris}),vol:v=>cmd('PUT','/me/player/volume?volume_percent='+v)};

  /* =================== APPLE MUSIC =================== */
  let mk=null,mkLoading=null;
  async function mkInit(){if(mk)return mk;if(!S.amToken)return null;if(!mkLoading)mkLoading=new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://js-cdn.music.apple.com/musickit/v3/musickit.js';s.onload=res;s.onerror=()=>rej(new Error('MusicKit non raggiungibile'));document.head.appendChild(s)})
      .then(async()=>{await new Promise(r=>{if(window.MusicKit)r();else document.addEventListener('musickitloaded',r,{once:true})});await MusicKit.configure({developerToken:S.amToken,app:{name:'Sentinella',build:'2.1'}});mk=MusicKit.getInstance();
        mk.addEventListener('playbackStateDidChange',amNow);mk.addEventListener('nowPlayingItemDidChange',amNow);return mk});return mkLoading}
  function amNow(){if(!mk)return;const it=mk.nowPlayingItem;if(it){now={src:'am',title:it.title,artist:it.artistName,art:it.artworkURL?it.artworkURL.replace('{w}',120).replace('{h}',120):(it.attributes&&it.attributes.artwork?MusicKit.formatArtworkURL(it.attributes.artwork,120,120):''),playing:mk.playbackState===MusicKit.PlaybackStates.playing,at:Date.now()}}render()}
  const am={play:()=>mk&&mk.play(),pause:()=>mk&&mk.pause(),next:()=>mk&&mk.skipToNextItem(),prev:()=>mk&&mk.skipToPreviousItem()};
  const openAM=(q)=>{location.href=q?`https://music.apple.com/it/search?term=${encodeURIComponent(q)}`:'music://'};

  /* =================== MINI LETTORE =================== */
  let hiddenByUser=false;
  function render(){const el=$('#mplayer');if(!el)return;const show=!!now&&!hiddenByUser&&(App.state.driving||App.state.navigating||(UI.cur&&UI.cur.name==='home'));
    const was=!el.classList.contains('hidden');el.classList.toggle('hidden',!show);if(was!==show)App.emit('layout');if(!show){if(UI.cur&&UI.cur.name==='music')renderScreenNow();return}
    const p=now.dur?Math.min(1,((now.pos||0)+(now.playing?Date.now()-now.at:0))/now.dur):0;
    el.innerHTML=`<div class="mp-art" style="${now.art?`background-image:url('${now.art}')`:''}">${now.art?'':'<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zm11-2a3 3 0 11-6 0 3 3 0 016 0z" fill="none" stroke="currentColor" stroke-width="2"/></svg>'}</div>
      <div class="mp-tx"><b>${esc(now.title||'')}</b><small>${esc(now.artist||'')}${now.dev?' · '+esc(now.dev):''}</small></div>
      <button data-c="prev" aria-label="Precedente"><svg viewBox="0 0 24 24"><path d="M6 5v14M19 5L9 12l10 7z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></button>
      <button data-c="pp" class="pp" aria-label="${now.playing?'Pausa':'Riproduci'}"><svg viewBox="0 0 24 24">${now.playing?'<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/>':'<path d="M7 4.5l13 7.5-13 7.5z" fill="currentColor"/>'}</svg></button>
      <button data-c="next" aria-label="Successivo"><svg viewBox="0 0 24 24"><path d="M18 5v14M5 5l10 7-10 7z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></button>
      <i class="mp-bar" style="width:${(p*100).toFixed(1)}%"></i>`;
    el.querySelectorAll('[data-c]').forEach(b=>b.onclick=e=>{e.stopPropagation();b.classList.add('tap');setTimeout(()=>b.classList.remove('tap'),250);const c=b.dataset.c,P=now.src==='am'?am:sp;if(c==='pp'){now.playing?P.pause():P.play();now.playing=!now.playing;render()}else P[c]()});
    el.onclick=()=>UI.show('music');if(UI.cur&&UI.cur.name==='music')renderScreenNow()}
  ['navStart','navEnd','sheet'].forEach(e=>App.on(e,render));setInterval(()=>{if(now&&now.playing)render()},1000);

  /* =================== SCHERMATA =================== */
  function renderScreenNow(){const b=$('#muNow');if(!b)return;if(!now){b.innerHTML='';return}
    b.innerHTML=`<div class="mu-now"><div class="mu-art" style="${now.art?`background-image:url('${now.art.replace(/\/[^/]*$/,m=>m)}')`:''}"></div><b>${esc(now.title||'')}</b><span>${esc(now.artist||'')}</span>
      <div class="mu-ctl"><button data-c="prev"><svg viewBox="0 0 24 24"><path d="M6 5v14M19 5L9 12l10 7z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></button><button data-c="pp" class="pp"><svg viewBox="0 0 24 24">${now.playing?'<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/>':'<path d="M7 4.5l13 7.5-13 7.5z" fill="currentColor"/>'}</svg></button><button data-c="next"><svg viewBox="0 0 24 24"><path d="M18 5v14M5 5l10 7-10 7z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></button></div>
      ${now.src==='sp'&&now.vol!=null?`<input type="range" min="0" max="100" value="${now.vol}" id="muVol" aria-label="Volume">`:''}</div>`;
    b.querySelectorAll('[data-c]').forEach(x=>x.onclick=()=>{const c=x.dataset.c,P=now.src==='am'?am:sp;if(c==='pp'){now.playing?P.pause():P.play();now.playing=!now.playing;render()}else P[c]()});
    const v=$('#muVol');if(v)v.onchange=()=>sp.vol(+v.value)}
  App.UI.R.music=()=>({detent:'full',html:`${App.UI.hdr('Musica',tok?'Spotify collegato':'Spotify e Apple Music')}
      <div id="muNow"></div>
      <div class="sec"><h3>Spotify</h3>${tok?'<button class="link" id="spOut">Scollega</button>':''}</div>
      ${tok?`<div class="row-top"><label class="search"><svg><use href="#i-search"/></svg><input id="spQ" placeholder="Cerca brani, artisti, playlist" enterkeyhint="search"></label></div><div id="spRes" style="margin-top:10px"></div><div class="sec"><h3>Le tue playlist</h3></div><div id="spPl"><div class="spin"></div></div>${lastErr?`<p class="note">Ultimo errore: ${esc(lastErr)}</p>`:''}`
        :`<div class="group">${App.UI.item({attr:'id="spIn"',color:'#1DB954',icon:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#fff"/><path d="M7 9.5c3.5-1 7.5-.6 10.5 1M7.5 12.5c3-.8 6-.4 8.5 1M8 15.3c2.4-.6 4.6-.3 6.6.8" stroke="#1DB954" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',t1:'Collega Spotify',t2:S.spClient?'Accedi con il tuo account':'Serve un Client ID: vedi sotto',chev:true})}
          <div class="field"><label>Client ID<small>da developer.spotify.com</small></label><input type="text" id="spCid" value="${esc(S.spClient)}" placeholder="incolla qui" autocomplete="off" autocapitalize="off"></div></div>
          <details class="howto"><summary>Come ottenere il Client ID (2 minuti)</summary><ol><li>Apri <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">developer.spotify.com/dashboard</a> e accedi con il tuo Spotify (serve Premium).</li><li>«Create app»: nome «Sentinella», in <b>Redirect URI</b> metti esattamente:<br><code>${esc(redirect())}</code></li><li>Spunta «Web API», salva, poi copia il <b>Client ID</b> e incollalo qui sopra.</li></ol></details>`}
      <div class="sec"><h3>Apple Music</h3></div>
      <div class="group">${S.amToken?App.UI.item({attr:'id="amIn"',color:'#FA243C',icon:'<svg viewBox="0 0 24 24"><path d="M9 18V6l10-2v12" fill="none" stroke="#fff" stroke-width="2"/><circle cx="7" cy="18" r="2.5" fill="#fff"/><circle cx="17" cy="16" r="2.5" fill="#fff"/></svg>',t1:mk&&mk.isAuthorized?'Apple Music collegato':'Collega Apple Music',t2:'Riproduzione dentro Sentinella',chev:true})
          :App.UI.item({attr:'id="amOpen"',color:'#FA243C',icon:'<svg viewBox="0 0 24 24"><path d="M9 18V6l10-2v12" fill="none" stroke="#fff" stroke-width="2"/><circle cx="7" cy="18" r="2.5" fill="#fff"/><circle cx="17" cy="16" r="2.5" fill="#fff"/></svg>',t1:'Apri Apple Music',t2:'Torna a Sentinella dall\'angolo in alto a sinistra',chev:true})}
        <div class="field"><label>Token sviluppatore<small>facoltativo, da Apple Developer</small></label><input type="password" id="amTok" value="${esc(S.amToken)}" placeholder="facoltativo" autocomplete="off"></div></div>
      ${mk&&mk.isAuthorized?'<div class="sec"><h3>Le tue playlist Apple Music</h3></div><div id="amPl"><div class="spin"></div></div>':''}
      <div class="group" style="margin-top:12px"><div class="field"><label>Mini lettore sulla mappa<small>Durante la guida, sopra il pannello</small></label><input type="checkbox" class="sw" id="muShow" ${hiddenByUser?'':'checked'}></div></div>
      <p class="note">Spotify: Sentinella fa da telecomando all'app Spotify del telefono (account Premium). Apple Music: senza un token sviluppatore Apple (programma a pagamento) un'app web può solo aprire l'app Musica; con il token suona dentro Sentinella.</p>`,
    async bind(){renderScreenNow();const ci=$('#spCid');if(ci)ci.onchange=()=>{S.spClient=ci.value.trim();App.saveS()};const si=$('#spIn');if(si)si.onclick=()=>{if(ci)S.spClient=ci.value.trim();App.saveS();login()};
      const so=$('#spOut');if(so)so.onclick=()=>{tok=null;now=null;Store.del('spTok');clearInterval(pollT);render();App.UI.render()};
      $('#amTok').onchange=e=>{S.amToken=e.target.value.trim();App.saveS();mk=null;mkLoading=null;App.UI.render()};
      const ao=$('#amOpen');if(ao)ao.onclick=()=>openAM();const ai=$('#amIn');if(ai)ai.onclick=async()=>{try{const m=await mkInit();await m.authorize();App.UI.render()}catch(e){App.toast('Apple Music: '+(e.message||'errore'))}};
      $('#muShow').onchange=e=>{hiddenByUser=!e.target.checked;render()};
      if(tok){const q=$('#spQ');let t=0;q.oninput=()=>{clearTimeout(t);const v=q.value.trim();if(!v){$('#spRes').innerHTML='';return}t=setTimeout(async()=>{try{const j=await api('/search?type=track,playlist,artist&limit=6&q='+encodeURIComponent(v));const tr=(j.tracks&&j.tracks.items)||[],pl=((j.playlists&&j.playlists.items)||[]).filter(Boolean);
            $('#spRes').innerHTML=`<div class="group">${tr.map((x,i)=>App.UI.item({attr:`data-t="${i}"`,color:'#1DB954',icon:x.album&&x.album.images&&x.album.images.length?`<img src="${esc(x.album.images[x.album.images.length-1].url)}" alt="" style="width:34px;height:34px;border-radius:6px">`:'♪',t1:esc(x.name),t2:esc(x.artists.map(a=>a.name).join(', '))})).join('')}${pl.slice(0,4).map((x,i)=>App.UI.item({attr:`data-p="${i}"`,color:'#1DB954',icon:'<svg><use href="#i-list"/></svg>',t1:esc(x.name),t2:'Playlist'})).join('')}</div>`;
            $('#spRes').querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>sp.tracks([tr[+b.dataset.t].uri]));$('#spRes').querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>sp.context(pl[+b.dataset.p].uri))}catch(e){$('#spRes').innerHTML=`<p class="note">${esc(e.message)}</p>`}},350)};
        try{const j=await api('/me/playlists?limit=30');const pl=(j.items||[]).filter(Boolean);const box=$('#spPl');if(!box)return;
          box.innerHTML=pl.length?`<div class="plgrid">${pl.map((x,i)=>`<button data-p="${i}"><span style="${x.images&&x.images[0]?`background-image:url('${esc(x.images[0].url)}')`:''}"></span>${esc(x.name)}</button>`).join('')}</div>`:'<p class="note">Nessuna playlist.</p>';
          box.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{b.classList.add('pop');sp.context(pl[+b.dataset.p].uri)})}catch(e){const box=$('#spPl');if(box)box.innerHTML=`<p class="note">Playlist non disponibili: ${esc(e.message)}</p>`}}
      if(mk&&mk.isAuthorized){try{const r=await mk.api.music('/v1/me/library/playlists',{limit:25});const pl=(r.data&&r.data.data)||[];const box=$('#amPl');if(box){box.innerHTML=`<div class="plgrid">${pl.map((x,i)=>`<button data-a="${i}"><span style="${x.attributes.artwork?`background-image:url('${esc(MusicKit.formatArtworkURL(x.attributes.artwork,200,200))}')`:''}"></span>${esc(x.attributes.name)}</button>`).join('')}</div>`;
          box.querySelectorAll('[data-a]').forEach(b=>b.onclick=async()=>{await mk.setQueue({playlist:pl[+b.dataset.a].id});mk.play()})}}catch(e){}}}});
  // ripresa
  handleReturn();if(tok)startPoll();
  return {login,render,get now(){return now},get connected(){return !!tok}};
})();
