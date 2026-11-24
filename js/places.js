/* Sentinella — scheda luogo arricchita: orari con stato aperto/chiuso, recensioni e foto (Google, facoltativo), Wikipedia, meteo sul posto. */
'use strict';
const Places = App.Places = (()=>{
  const S=App.S;

  /* ---------- orari OpenStreetMap (opening_hours) ---------- */
  const DAYS=['Mo','Tu','We','Th','Fr','Sa','Su'],DIT=['Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato','Domenica'],DSH=['lun','mar','mer','gio','ven','sab','dom'];
  const mins=t=>{const m=/^(\d{1,2}):(\d{2})$/.exec(t.trim());return m?(+m[1])*60+(+m[2]):null};
  // restituisce week[0..6] = elenco di intervalli [inizio,fine] in minuti (fine può superare 1440 per gli orari notturni); null se non interpretabile
  function parseOH(str){if(!str)return null;str=str.trim();if(str==='24/7')return Array.from({length:7},()=>[[0,1440]]);
    const week=Array.from({length:7},()=>null);let ok=false;
    for(let rule of str.split(/\s*;\s*/)){rule=rule.replace(/"[^"]*"/g,'').trim();if(!rule)continue;
      if(/^PH\b/.test(rule)||/\b(SH|week|[A-Z][a-z]{2}\s\d)/.test(rule))continue; // festività e mesi: ignorati
      let m=/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*,?\s*)+)?\s*(.*)$/.exec(rule);if(!m)continue;
      let days=[0,1,2,3,4,5,6];
      if(m[1]){days=[];for(const part of m[1].split(',')){const r=part.trim().split(/\s*-\s*/);if(!r[0])continue;const a=DAYS.indexOf(r[0]),b=r[1]?DAYS.indexOf(r[1]):a;if(a<0||b<0)continue;for(let i=a;;i=(i+1)%7){days.push(i);if(i===b)break}}}
      const rest=(m[2]||'').replace(/^PH\s*,?\s*/,'').trim();let iv=[];
      if(/^(off|closed)$/i.test(rest))iv=[];
      else if(!rest)iv=[[0,1440]];
      else{for(const t of rest.split(/\s*,\s*/)){const r=t.split('-');if(r.length!==2)continue;let a=mins(r[0]),b=mins(r[1].replace('+',''));if(a==null||b==null)continue;if(b<=a)b+=1440;iv.push([a,b])}if(!iv.length)continue}
      for(const d of days)week[d]=iv;ok=true}
    if(!ok)return null;return week.map(x=>x||[])}
  const hhmm=m=>{m=((m%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')};
  function ohStatus(week,now=new Date()){if(!week)return null;const d=(now.getDay()+6)%7,t=now.getHours()*60+now.getMinutes();
    // aperto ora? controllo anche gli orari notturni del giorno prima
    const prev=week[(d+6)%7]||[];for(const [a,b] of prev)if(b>1440&&t<b-1440)return {open:true,until:b-1440,soon:b-1440-t<45};
    for(const [a,b] of week[d]||[])if(t>=a&&t<b)return {open:true,until:b,soon:b-t<45,always:a===0&&b>=1440};
    // prossima apertura
    for(let k=0;k<8;k++){const dd=(d+k)%7;for(const [a] of (week[dd]||[]).slice().sort((x,y)=>x[0]-y[0])){if(k===0&&a<=t)continue;return {open:false,next:a,day:k,dd,soon:k===0&&a-t<45}}}
    return {open:false}}
  function ohLabel(st){if(!st)return '';if(st.open){if(st.always)return '<b class="oh open">Aperto 24 ore</b>';return `<b class="oh ${st.soon?'soon':'open'}">${st.soon?'Chiude presto':'Aperto'}</b> · chiude alle ${hhmm(st.until)}`}
    if(st.next==null)return '<b class="oh closed">Chiuso</b>';return `<b class="oh ${st.soon?'soon':'closed'}">${st.soon?'Apre presto':'Chiuso'}</b> · apre ${st.day===0?'alle':st.day===1?'domani alle':DIT[st.dd].toLowerCase()+' alle'} ${hhmm(st.next)}`}
  function weekTable(week){const d=(new Date().getDay()+6)%7;return week.map((iv,i)=>`<div class="ohrow${i===d?' today':''}"><span>${DIT[i]}</span><b>${iv.length?iv.map(([a,b])=>a===0&&b>=1440?'24 ore':hhmm(a)+'–'+hhmm(b)).join(', '):'Chiuso'}</b></div>`).join('')}

  /* ---------- Google Places (facoltativo, chiave dell'utente) ---------- */
  const gCache=new Map();
  async function google(p){if(!S.googleKey)return null;const k=p.name+'|'+p.lat.toFixed(4)+'|'+p.lon.toFixed(4);if(gCache.has(k))return gCache.get(k);
    const body={textQuery:[p.name,p.addr].filter(Boolean).join(' '),languageCode:'it',maxResultCount:1,locationBias:{circle:{center:{latitude:p.lat,longitude:p.lon},radius:250}}};
    const fields=['id','displayName','rating','userRatingCount','reviews','regularOpeningHours','currentOpeningHours','photos','priceLevel','googleMapsUri','nationalPhoneNumber','websiteUri','editorialSummary','location','businessStatus'].map(f=>'places.'+f).join(',');
    const r=await API.tfetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':S.googleKey,'X-Goog-FieldMask':fields},body:JSON.stringify(body)},10000);
    const j=await r.json();if(j.error)throw new Error(j.error.message||'Google');
    let g=(j.places||[])[0]||null;if(g&&g.location&&G.dist(g.location.latitude,g.location.longitude,p.lat,p.lon)>400)g=null;gCache.set(k,g);return g}
  const photoUrl=(ph,w=640)=>`https://places.googleapis.com/v1/${ph.name}/media?maxWidthPx=${w}&key=${encodeURIComponent(S.googleKey)}`;
  const stars=v=>{let h='';for(let i=1;i<=5;i++){const f=Math.max(0,Math.min(1,v-i+1));h+=`<i class="st" style="--f:${Math.round(f*100)}%"></i>`}return `<span class="stars">${h}</span>`};
  const PRICE={PRICE_LEVEL_FREE:'Gratis',PRICE_LEVEL_INEXPENSIVE:'€',PRICE_LEVEL_MODERATE:'€€',PRICE_LEVEL_EXPENSIVE:'€€€',PRICE_LEVEL_VERY_EXPENSIVE:'€€€€'};

  /* ---------- Wikipedia ---------- */
  async function wiki(tags){let t=tags&&tags.wikipedia;let lang='it';
    if(!t&&tags&&tags.wikidata){try{const r=await API.tfetch(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(tags.wikidata)}.json`,{},8000);const j=await r.json();const e=Object.values(j.entities||{})[0];const sl=e&&e.sitelinks;const s=sl&&(sl.itwiki||sl.enwiki);if(s){t=s.title;lang=sl.itwiki?'it':'en'}}catch(e){}}
    if(!t)return null;const m=/^([a-z]{2,3}):(.+)$/.exec(t);if(m){lang=m[1];t=m[2]}
    const r=await API.tfetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g,'_'))}`,{},8000);if(!r.ok)return null;const j=await r.json();
    return j&&j.extract?{text:j.extract,img:j.thumbnail&&j.thumbnail.source,url:j.content_urls&&j.content_urls.mobile&&j.content_urls.mobile.page}:null}

  /* ---------- rendering nella scheda ---------- */
  App.on('placeOpen',({p})=>{const box=$('#pLive');if(!box)return;box.innerHTML='<div id="pHours"></div><div id="pGoogle"></div><div id="pWiki"></div>';
    // meteo sul posto
    if(App.Weather)App.Weather.at(p.lat,p.lon).then(w=>{const sub=document.querySelector('.scr .hdr .sub');if(w&&sub&&!sub.querySelector('.wxs'))sub.insertAdjacentHTML('beforeend',` · <span class="wxs">${App.Weather.icon(w.code,w.day,16)} ${Math.round(w.t)}°</span>`)}).catch(()=>{});
    if(S.googleKey&&!p.isCar&&!/^(Punto sulla mappa|Segnaposto)$/.test(p.name)){$('#pGoogle').innerHTML='<div class="spin" style="margin:12px auto"></div>';
      google(p).then(g=>renderGoogle(p,g)).catch(e=>{const b=$('#pGoogle');if(b)b.innerHTML=`<p class="note">Recensioni Google non disponibili: ${esc(e.message||'errore')}.</p>`})}
    else if(!p.isCar&&p.osm)renderLinks(p)});
  App.on('placeTags',({p,tags})=>{const h=$('#pHours');if(!h)return;const oh=tags.opening_hours;
    const week=parseOH(oh);if(week){const st=ohStatus(week);h.innerHTML=`<button class="group ohbox" id="ohT"><div class="kv"><span>${ohLabel(st)}</span><svg class="chev"><use href="#i-down"/></svg></div><div class="ohweek hidden">${weekTable(week)}</div></button>`;
      $('#ohT').onclick=()=>{$('#ohT').classList.toggle('open');$('#ohT .ohweek').classList.toggle('hidden')}}
    // la riga "Orari" testuale diventa superflua se l'ho interpretata
    if(week)document.querySelectorAll('#pTags .kv').forEach(r=>{if(r.firstElementChild&&r.firstElementChild.textContent==='Orari')r.remove()});
    if(tags.wikipedia||tags.wikidata)wiki(tags).then(w=>{const b=$('#pWiki');if(!w||!b)return;
      b.innerHTML=`<div class="group wiki">${w.img?`<img src="${esc(w.img)}" alt="" loading="lazy">`:''}<p>${esc(w.text.length>420?w.text.slice(0,400).replace(/\s\S*$/,'')+'…':w.text)}</p>${w.url?`<a href="${esc(w.url)}" target="_blank" rel="noopener">Leggi su Wikipedia</a>`:''}</div>`}).catch(()=>{})});
  function renderLinks(p){const b=$('#pGoogle');if(!b)return;const q=encodeURIComponent([p.name,p.addr].filter(Boolean).join(' '));
    b.innerHTML=`<div class="revlinks"><a class="btn" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">${stars(0).replace('stars','stars mono')} Recensioni Google</a><a class="btn" href="https://www.tripadvisor.it/Search?q=${q}" target="_blank" rel="noopener">TripAdvisor</a></div>
      <p class="note">Per vedere voto, recensioni e foto direttamente qui aggiungi la chiave Google in Impostazioni → Recensioni.</p>`}
  function renderGoogle(p,g){const b=$('#pGoogle');if(!b)return;if(!g){renderLinks(p);return}
    const ph=(g.photos||[]).slice(0,8),rv=(g.reviews||[]).slice(0,5);
    const closed=g.businessStatus==='CLOSED_PERMANENTLY'?'<span class="tag red">Chiuso definitivamente</span>':g.businessStatus==='CLOSED_TEMPORARILY'?'<span class="tag orange">Chiuso temporaneamente</span>':'';
    let html='';
    if(ph.length)html+=`<div class="photos">${ph.map((x,i)=>`<img src="${esc(photoUrl(x,i?400:720))}" alt="" loading="lazy" class="${i?'':'big'}">`).join('')}</div>`;
    html+=`<div class="rating">${g.rating?`<b>${F.n(g.rating,1)}</b>${stars(g.rating)}<span>${(g.userRatingCount||0).toLocaleString('it-IT')} recensioni</span>`:'<span>Nessuna valutazione</span>'}${g.priceLevel&&PRICE[g.priceLevel]?`<span class="price">${PRICE[g.priceLevel]}</span>`:''}${closed}</div>`;
    if(g.editorialSummary&&g.editorialSummary.text)html+=`<p class="gsum">${esc(g.editorialSummary.text)}</p>`;
    // orari da Google se OSM non li ha
    if(!$('#ohT')&&g.regularOpeningHours&&g.regularOpeningHours.weekdayDescriptions){const open=g.currentOpeningHours?g.currentOpeningHours.openNow:g.regularOpeningHours.openNow;
      const wd=g.regularOpeningHours.weekdayDescriptions,d=(new Date().getDay()+6)%7;
      $('#pHours').innerHTML=`<button class="group ohbox" id="ohT"><div class="kv"><span><b class="oh ${open?'open':'closed'}">${open?'Aperto':'Chiuso'}</b> · ${esc((wd[d]||'').replace(/^[^:]+:\s*/,''))}</span><svg class="chev"><use href="#i-down"/></svg></div><div class="ohweek hidden">${wd.map((x,i)=>{const k=x.indexOf(':');return `<div class="ohrow${i===d?' today':''}"><span>${esc(x.slice(0,k))}</span><b>${esc(x.slice(k+1).trim())}</b></div>`}).join('')}</div></button>`;
      $('#ohT').onclick=()=>{$('#ohT').classList.toggle('open');$('#ohT .ohweek').classList.toggle('hidden')}}
    if(rv.length)html+=`<div class="sec"><h3>Recensioni</h3>${g.googleMapsUri?`<a href="${esc(g.googleMapsUri)}" target="_blank" rel="noopener">Tutte</a>`:''}</div><div class="reviews">${rv.map(r=>{const a=r.authorAttribution||{};const t=(r.text&&r.text.text)||(r.originalText&&r.originalText.text)||'';
      return `<div class="rev"><div class="rh">${a.photoUri?`<img src="${esc(a.photoUri)}" alt="" loading="lazy">`:`<span class="ra">${esc((a.displayName||'?')[0])}</span>`}<div><b>${esc(a.displayName||'Utente Google')}</b><small>${stars(r.rating||0)} ${esc(r.relativePublishTimeDescription||'')}</small></div></div>${t?`<p class="rt clamp">${esc(t)}</p>`:''}</div>`}).join('')}</div>`;
    html+=`<p class="note">Valutazioni, recensioni e foto © Google.${g.googleMapsUri?` <a href="${esc(g.googleMapsUri)}" target="_blank" rel="noopener">Apri in Google Maps</a>`:''}</p>`;
    b.innerHTML=html;b.querySelectorAll('.rt.clamp').forEach(e=>e.onclick=()=>e.classList.toggle('clamp'));
    // telefono e sito se OSM non li aveva
    const info=$('#pInfo');if(info){if(g.nationalPhoneNumber&&!/Telefono/.test($('#pTags').textContent))info.insertAdjacentHTML('beforeend',`<div class="kv"><span>Telefono</span><b><a href="tel:${esc(g.nationalPhoneNumber.replace(/\s/g,''))}">${esc(g.nationalPhoneNumber)}</a></b></div>`);
      if(g.websiteUri&&!/Sito/.test($('#pTags').textContent))info.insertAdjacentHTML('beforeend',`<div class="kv"><span>Sito</span><b><a href="${esc(g.websiteUri)}" target="_blank" rel="noopener">${esc(g.websiteUri.replace(/^https?:\/\/(www\.)?/,'').replace(/\/$/,'').slice(0,32))}</a></b></div>`)}}

  return {parseOH,ohStatus,ohLabel,hhmm,google};
})();
