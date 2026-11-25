/* Sentinella — utilità di base: geometria, formattazione, memoria locale, impostazioni, voce. */
'use strict';
const App = window.App = {bus:{},state:{}};
const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const esc = v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
App.on=(e,f)=>{(App.bus[e]=App.bus[e]||[]).push(f)};
App.emit=(e,d)=>{(App.bus[e]||[]).forEach(f=>{try{f(d)}catch(x){console.error(x)}})};

/* ---------- geometria ---------- */
const G = App.G = (()=>{
  const R=6371000,rad=d=>d*Math.PI/180,deg=r=>r*180/Math.PI;
  const dist=(a,b,c,d)=>{const p1=rad(a),p2=rad(c),dp=rad(c-a),dl=rad(d-b);const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)))};
  const brg=(a,b,c,d)=>{const p1=rad(a),p2=rad(c),dl=rad(d-b);const y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);return (deg(Math.atan2(y,x))+360)%360};
  const adiff=(a,b)=>{let d=Math.abs(a-b)%360;return d>180?360-d:d};
  const sdiff=(a,b)=>((b-a+540)%360)-180; // differenza con segno da a a b
  const dest=(lat,lon,b,m)=>{const dr=m/R,br=rad(b),p1=rad(lat),l1=rad(lon);const p2=Math.asin(Math.sin(p1)*Math.cos(dr)+Math.cos(p1)*Math.sin(dr)*Math.cos(br));const l2=l1+Math.atan2(Math.sin(br)*Math.sin(dr)*Math.cos(p1),Math.cos(dr)-Math.sin(p1)*Math.sin(p2));return [deg(p2),deg(l2)]};
  // polilinea: g=[[lat,lon],...]
  const prep=g=>{const cum=new Float64Array(g.length);for(let i=1;i<g.length;i++)cum[i]=cum[i-1]+dist(g[i-1][0],g[i-1][1],g[i][0],g[i][1]);let b=[90,180,-90,-180];for(const p of g){if(p[0]<b[0])b[0]=p[0];if(p[1]<b[1])b[1]=p[1];if(p[0]>b[2])b[2]=p[0];if(p[1]>b[3])b[3]=p[1]}return {g,cum,len:g.length?cum[g.length-1]:0,b}};
  // proiezione su polilinea; i0/i1 limitano la ricerca (per prestazioni in navigazione)
  const proj=(lat,lon,P,i0=0,i1=Infinity)=>{const k=Math.cos(rad(lat))*111320,m=110574,g=P.g;let best={d:Infinity,along:0,b:0,i:0};const e=Math.min(g.length-1,i1);
    for(let i=Math.max(0,i0);i<e;i++){const ax=(g[i][1]-lon)*k,ay=(g[i][0]-lat)*m,bx=(g[i+1][1]-lon)*k,by=(g[i+1][0]-lat)*m,dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy;
      let t=L2?-(ax*dx+ay*dy)/L2:0;t=t<0?0:t>1?1:t;const d=Math.hypot(ax+t*dx,ay+t*dy);
      if(d<best.d)best={d,i,t,along:P.cum[i]+t*(P.cum[i+1]-P.cum[i]),b:(deg(Math.atan2(dx,dy))+360)%360}}
    return best};
  const pointAt=(P,s)=>{const c=P.cum,g=P.g;if(!g.length)return null;s=Math.max(0,Math.min(P.len,s));let lo=0,hi=g.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(c[mid]<=s)lo=mid;else hi=mid}const seg=(c[hi]-c[lo])||1,t=(s-c[lo])/seg;return {lat:g[lo][0]+(g[hi][0]-g[lo][0])*t,lon:g[lo][1]+(g[hi][1]-g[lo][1])*t,b:brg(g[lo][0],g[lo][1],g[hi][0],g[hi][1]),i:lo}};
  const idxAt=(P,s)=>{const c=P.cum;let lo=0,hi=c.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(c[mid]<=s)lo=mid;else hi=mid}return lo};
  // decodifica polyline (precisione 6 per Valhalla/OSRM)
  const decode=(str,prec=6)=>{const f=10**prec,out=[];let i=0,lat=0,lon=0;while(i<str.length){let r=0,s=0,b;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<s;s+=5}while(b>=32);lat+=(r&1)?~(r>>1):(r>>1);r=0;s=0;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<s;s+=5}while(b>=32);lon+=(r&1)?~(r>>1):(r>>1);out.push([lat/f,lon/f])}return out};
  const encode=(pts,prec=6)=>{const f=10**prec;let out='',pl=0,pn=0;const enc=v=>{v=v<0?~(v<<1):(v<<1);let s='';while(v>=32){s+=String.fromCharCode((32|(v&31))+63);v>>=5}return s+String.fromCharCode(v+63)};for(const p of pts){const la=Math.round(p[0]*f),lo=Math.round(p[1]*f);out+=enc(la-pl)+enc(lo-pn);pl=la;pn=lo}return out};
  const simplify=(pts,tol)=>window.OSMP?OSMP.dp(pts,tol):pts;
  return {R,rad,deg,dist,brg,adiff,sdiff,dest,prep,proj,pointAt,idxAt,decode,encode,simplify};
})();

/* ---------- formattazione ---------- */
App.VERSION='2.6';App.BUILD='25 novembre 2026';
const F = App.F = {
  km(m){if(m==null||!isFinite(m))return '–';if(m<995)return (m<100?Math.round(m/5)*5:Math.round(m/10)*10)+' m';const k=m/1000;return (k<10?k.toFixed(1):Math.round(k)).toString().replace('.',',')+' km'},
  kmParts(m){const s=F.km(m);const i=s.lastIndexOf(' ');return [s.slice(0,i),s.slice(i+1)]},
  dur(s){s=Math.max(0,Math.round(s/60));if(s<60)return s+' min';const h=Math.floor(s/60),m=s%60;return h+' h'+(m?' '+m+' min':'')},
  durShort(s){s=Math.max(0,Math.round(s/60));if(s<60)return s+' min';const h=Math.floor(s/60),m=s%60;return h+':'+String(m).padStart(2,'0')+' h'},
  clock(ts){return new Date(ts).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})},
  date(ts){return new Date(ts).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})},
  eur(v){return v==null||!isFinite(v)?'–':v.toLocaleString('it-IT',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2})},
  eur0(v){return v==null||!isFinite(v)?'–':(v<10?v.toLocaleString('it-IT',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}):v.toLocaleString('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}))},
  n(v,d=1){return v==null||!isFinite(v)?'–':v.toLocaleString('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d})},
  mmss(s){s=Math.max(0,Math.round(s));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return (h?h+':'+String(m).padStart(2,'0'):m)+':'+String(x).padStart(2,'0')},
  speakDist(m){if(m<1000){const r=m<200?Math.round(m/10)*10:Math.round(m/50)*50;return r+' metri'}const k=Math.round(m/100)/10;return (k%1===0?k.toFixed(0):k.toFixed(1).replace('.',','))+' chilometri'}
};

/* ---------- memoria locale ---------- */
const Store = App.Store = {
  get(k,d){try{const v=localStorage.getItem('snt.'+k);return v==null?d:JSON.parse(v)}catch(e){return d}},
  set(k,v){try{localStorage.setItem('snt.'+k,JSON.stringify(v));return true}catch(e){return false}},
  del(k){try{localStorage.removeItem('snt.'+k)}catch(e){}}
};

/* ---------- impostazioni ---------- */
const DEF = {
  theme:'auto', mapType:'std', buildings3d:true, voice:true, beep:true, camVoice:true,
  neo:false, rain:false, margin:3, lead:20, showOff:false,
  avoidTolls:false, avoidHighways:false, avoidFerries:false,
  vehicle:'v1', people:1, timeValue:0, tomtomKey:'', traffic:false, onboarded:false,
  myName:'', googleKey:'', spClient:'', amToken:'', autoRain:true, community:true,
  hzSignals:false, hzBumps:true, hzRail:true, hzRough:true, hzCurves:true, hzScenic:true, hzReports:true, wxRoute:true,
  copiVoice:true, copiSpeed:1.12, funRoute:false, shareLiveNav:false
};
App.S = Object.assign({}, DEF, Store.get('set',{}));
App.saveS = ()=>Store.set('set',App.S);

/* Prezzi medi self MIMIT 19/11/2026 per benzina e gasolio; gli altri sono valori indicativi modificabili */
App.FUELS = {
  benzina:{label:'Benzina',unit:'l',price:1.948,co2:2.31,ref:'MIMIT 19/11/2026'},
  diesel:{label:'Gasolio',unit:'l',price:2.202,co2:2.68,ref:'MIMIT 19/11/2026'},
  gpl:{label:'GPL',unit:'l',price:0.75,co2:1.61,ref:'stima, verifica'},
  metano:{label:'Metano',unit:'kg',price:1.45,co2:2.75,ref:'stima, verifica'},
  elettrica:{label:'Elettrica',unit:'kWh',price:0.45,co2:0.25,ref:'stima mista casa/colonnina'}
};
App.PRICES = Object.assign({}, Object.fromEntries(Object.entries(App.FUELS).map(([k,v])=>[k,v.price])), Store.get('prices',{}));
App.TOLL = {A:0.080,B:0.082}; // €/km medi IVA inclusa (stima, ±15%)
App.PRESETS = [
  {name:'Utilitaria benzina',fuel:'benzina',urb:7.0,ext:4.9,aut:6.3},
  {name:'Compatta diesel',fuel:'diesel',urb:5.6,ext:3.9,aut:5.2},
  {name:'Ibrida full',fuel:'benzina',urb:4.2,ext:4.4,aut:5.6},
  {name:'SUV benzina',fuel:'benzina',urb:9.5,ext:6.6,aut:8.2},
  {name:'SUV diesel',fuel:'diesel',urb:7.6,ext:5.3,aut:6.8},
  {name:'GPL',fuel:'gpl',urb:9.2,ext:6.6,aut:8.4},
  {name:'Metano',fuel:'metano',urb:5.0,ext:3.6,aut:4.6},
  {name:'Elettrica',fuel:'elettrica',urb:14.5,ext:15.5,aut:20.5},
  {name:'Sportiva',fuel:'benzina',urb:13.5,ext:8.0,aut:10.5}
];
App.vehicles = Store.get('veh',null) || [{id:'v1',name:'La mia auto',fuel:'benzina',urb:7.0,ext:4.9,aut:6.3,cls:'A'}];
App.saveVeh = ()=>Store.set('veh',App.vehicles);
App.vehicle = ()=>App.vehicles.find(v=>v.id===App.S.vehicle)||App.vehicles[0];

/* ---------- tema ---------- */
App.isDark = ()=>App.S.theme==='dark'||(App.S.theme==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);
App.applyTheme = ()=>{document.documentElement.classList.toggle('dark',App.isDark());const m=$('meta[name=theme-color]');if(m)m.content=App.isDark()?'#000000':'#F2F2F7';};
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(App.S.theme==='auto'){App.applyTheme();App.emit('theme')}});
App.applyTheme();

/* ---------- toast e finestre ---------- */
let toastT;
App.toast = (t,ms=2600)=>{const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>e.classList.remove('show'),ms)};
App.confirm = (title,text,ok='OK',danger=false)=>new Promise(res=>{const m=$('#modal'),s=$('#scrim');
  m.innerHTML=`<div class="mb"><h4>${esc(title)}</h4><p>${esc(text)}</p></div><div class="mbtns"><button data-r="0">Annulla</button><button data-r="1" class="${danger?'danger':''}">${esc(ok)}</button></div>`;
  m.classList.remove('hidden');s.classList.remove('hidden');
  const done=v=>{m.classList.add('hidden');s.classList.add('hidden');res(v)};
  m.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>done(b.dataset.r==='1'));s.onclick=()=>done(false)});
App.modal = (html,onBind)=>{const m=$('#modal'),s=$('#scrim');m.innerHTML=html;m.classList.remove('hidden');s.classList.remove('hidden');const close=()=>{m.classList.add('hidden');s.classList.add('hidden')};s.onclick=close;if(onBind)onBind(m,close);return close};

/* ---------- voce, suoni, vibrazione ---------- */
const Voice = App.Voice = (()=>{
  let AC=null,voice=null,primed=false;
  const pick=()=>{try{const vs=speechSynthesis.getVoices();voice=vs.find(v=>/it[-_]IT/i.test(v.lang)&&/Alice|Federica|Luca|Paola|Emma|Siri/i.test(v.name))||vs.find(v=>/^it/i.test(v.lang))||null}catch(e){}};
  const prime=()=>{if(primed)return;primed=true;try{AC=new (window.AudioContext||window.webkitAudioContext)();AC.resume()}catch(e){}
    try{const u=new SpeechSynthesisUtterance(' ');u.volume=0;speechSynthesis.speak(u);pick();speechSynthesis.onvoiceschanged=pick}catch(e){}};
  const say=(t,urgent)=>{if(!App.S.voice||!t)return;try{if(urgent)speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.lang='it-IT';if(voice)u.voice=voice;u.rate=1.04;speechSynthesis.speak(u)}catch(e){}};
  const beep=(n=1,f=880,dur=.16)=>{if(!App.S.beep||!AC)return;try{for(let i=0;i<n;i++){const o=AC.createOscillator(),g=AC.createGain(),t=AC.currentTime+i*(dur+.06);o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.3,t+.015);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g).connect(AC.destination);o.start(t);o.stop(t+dur+.02)}}catch(e){}};
  const buzz=p=>{try{navigator.vibrate&&navigator.vibrate(p)}catch(e){}};
  return {prime,say,beep,buzz};
})();
let wake=null;
App.keepAwake = async on=>{try{if(on){if(!wake&&'wakeLock' in navigator){wake=await navigator.wakeLock.request('screen');wake.addEventListener('release',()=>{wake=null})}}else if(wake){await wake.release();wake=null}}catch(e){}};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&App.state.awake)App.keepAwake(true)});

/* ---------- categorie POI ---------- */
App.CATS = [
  {k:'fuel',ph:['amenity:fuel'],nm:'fuel',l:'Benzinai',c:'#FF9500',q:'nwr["amenity"="fuel"]',i:'M5 20V5a1.5 1.5 0 011.5-1.5h6A1.5 1.5 0 0114 5v15M3.5 20h12M14 9h2a1.5 1.5 0 011.5 1.5v6a1.5 1.5 0 003 0V8l-3-3M7.5 7.5h4'},
  {k:'charge',ph:['amenity:charging_station'],nm:'charging station',l:'Ricarica',c:'#34C759',q:'nwr["amenity"="charging_station"]',i:'M13 2.5L5.5 13.5H12L11 21.5l7.5-11H12z'},
  {k:'food',ph:['amenity:restaurant', 'amenity:fast_food'],nm:'restaurant',l:'Ristoranti',c:'#FF6B3D',q:'nwr["amenity"~"^(restaurant|fast_food)$"]',i:'M7 3v8a2.5 2.5 0 002.5 2.5V21M4.5 3v5.5A2.5 2.5 0 007 11M9.5 3v5.5A2.5 2.5 0 017 11M17.5 21V3c-2.2 1.2-3.5 3.6-3.5 7v3.5h3.5'},
  {k:'cafe',ph:['amenity:cafe', 'amenity:bar'],nm:'cafe',l:'Bar e caffè',c:'#A2845E',q:'nwr["amenity"~"^(cafe|bar|pub|ice_cream)$"]',i:'M4.5 9h12v5a5 5 0 01-5 5h-2a5 5 0 01-5-5zM16.5 10.5h1.5a2.5 2.5 0 010 5h-1.5M8 3.5c-.7.8-.7 1.7 0 2.5M12 3.5c-.7.8-.7 1.7 0 2.5'},
  {k:'parking',ph:['amenity:parking'],nm:'parking',l:'Parcheggi',c:'#007AFF',q:'nwr["amenity"="parking"]["access"!~"private|customers"]',i:'M7 21V3.5h6a5 5 0 010 10H7'},
  {k:'super',ph:['shop:supermarket', 'shop:convenience'],nm:'supermarket',l:'Supermercati',c:'#5856D6',q:'nwr["shop"~"^(supermarket|convenience)$"]',i:'M3 4h2.5l2.2 11h10.5l2-8H6.5M9 20a1 1 0 100-2 1 1 0 000 2zM17 20a1 1 0 100-2 1 1 0 000 2z'},
  {k:'pharm',ph:['amenity:pharmacy'],nm:'pharmacy',l:'Farmacie',c:'#30B05A',q:'nwr["amenity"="pharmacy"]',i:'M12 4v16M4 12h16'},
  {k:'hosp',ph:['amenity:hospital', 'amenity:clinic'],nm:'hospital',l:'Ospedali',c:'#FF3B30',q:'nwr["amenity"~"^(hospital|clinic)$"]',i:'M4 20V6h16v14M9.5 13h5M12 10.5v5M3 20h18'},
  {k:'hotel',ph:['tourism:hotel', 'tourism:motel', 'tourism:guest_house'],nm:'hotel',l:'Hotel',c:'#AF52DE',q:'nwr["tourism"~"^(hotel|motel|guest_house)$"]',i:'M3 19V6M3 15h18v4M21 15v-3.5A2.5 2.5 0 0018.5 9H11v6M7 12.5a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6z'},
  {k:'atm',ph:['amenity:atm', 'amenity:bank'],nm:'atm',l:'Bancomat',c:'#32ADE6',q:'nwr["amenity"~"^(atm|bank)$"]',i:'M3 7.5h18v11H3zM3 11h18M7 15h3'},
  {k:'repair',ph:['shop:car_repair', 'shop:tyres'],nm:'car repair',l:'Officine',c:'#8E8E93',q:'nwr["shop"~"^(car_repair|tyres)$"]',i:'M14.5 6.5a4 4 0 00-5.3 5.3L3.5 17.5l3 3 5.7-5.7a4 4 0 005.3-5.3l-2.5 2.5-2.5-.5-.5-2.5z'},
  {k:'sights',ph:['tourism:attraction', 'tourism:museum', 'tourism:viewpoint'],nm:'tourist attraction',l:'Da visitare',c:'#FF2D55',q:'nwr["tourism"~"^(attraction|museum|viewpoint|gallery)$"]',i:'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z'},
  {k:'services',ph:['highway:services', 'highway:rest_area'],nm:'services',l:'Aree di servizio',c:'#FF9F0A',q:'nwr["highway"~"^(services|rest_area)$"]',i:'M4 20V9l8-5 8 5v11M9 20v-6h6v6'},
  {k:'police',ph:['amenity:police'],nm:'police',l:'Forze dell\'ordine',c:'#1C3F94',q:'nwr["amenity"="police"]',i:'M12 3l7.5 3v5c0 4.6-3.2 8.6-7.5 10-4.3-1.4-7.5-5.4-7.5-10V6z'},
  {k:'wash',ph:['amenity:car_wash'],nm:'car wash',l:'Autolavaggi',c:'#0FB5BA',q:'nwr["amenity"="car_wash"]',i:'M5 17v-4l1.6-4h10.8l1.6 4v4M3.5 17h17M8 4.5c-.6.9-.6 1.6 0 2.5M12 3.5c-.6.9-.6 1.6 0 2.5M16 4.5c-.6.9-.6 1.6 0 2.5'},
  {k:'toilets',ph:['amenity:toilets'],nm:'toilets',l:'Bagni',c:'#64748B',q:'nwr["amenity"="toilets"]',i:'M8 6.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM16 6.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM6 21v-6H4.5L6 9h4l1.5 6H10v6M14.5 21V9h3v12'}
];
App.catIcon = (c,size=24,stroke='#fff')=>`<svg viewBox="0 0 24 24" width="${size}" height="${size}"><path d="${c.i}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
App.catOf = tags=>{if(!tags)return null;const t=tags;
  const m=[['fuel',t.amenity==='fuel'],['charge',t.amenity==='charging_station'],['food',/^(restaurant|fast_food)$/.test(t.amenity)],['cafe',/^(cafe|bar|pub|ice_cream)$/.test(t.amenity)],['parking',t.amenity==='parking'],['super',/^(supermarket|convenience)$/.test(t.shop)],['pharm',t.amenity==='pharmacy'],['hosp',/^(hospital|clinic)$/.test(t.amenity)],['hotel',/^(hotel|motel|guest_house)$/.test(t.tourism)],['atm',/^(atm|bank)$/.test(t.amenity)],['repair',/^(car_repair|tyres)$/.test(t.shop)],['sights',/^(attraction|museum|viewpoint|gallery)$/.test(t.tourism)],['services',/^(services|rest_area)$/.test(t.highway)],['police',t.amenity==='police'],['wash',t.amenity==='car_wash'],['toilets',t.amenity==='toilets']];
  const f=m.find(x=>x[1]);return f?App.CATS.find(c=>c.k===f[0]):null};
/* etichette italiane per i tipi OSM (ricerca) */
App.TYPE_IT = {restaurant:'Ristorante',fast_food:'Fast food',cafe:'Bar',bar:'Bar',pub:'Pub',ice_cream:'Gelateria',fuel:'Distributore',charging_station:'Colonnina di ricarica',parking:'Parcheggio',supermarket:'Supermercato',convenience:'Alimentari',pharmacy:'Farmacia',hospital:'Ospedale',clinic:'Clinica',hotel:'Hotel',motel:'Motel',guest_house:'B&B',atm:'Bancomat',bank:'Banca',car_repair:'Officina',tyres:'Gommista',attraction:'Attrazione',museum:'Museo',viewpoint:'Belvedere',gallery:'Galleria',services:'Area di servizio',rest_area:'Area di sosta',police:'Forze dell\'ordine',car_wash:'Autolavaggio',toilets:'Bagni',school:'Scuola',university:'Università',college:'Istituto',townhall:'Municipio',place_of_worship:'Luogo di culto',church:'Chiesa',station:'Stazione',train_station:'Stazione',bus_stop:'Fermata bus',city:'Città',town:'Città',village:'Paese',hamlet:'Frazione',suburb:'Quartiere',house:'Indirizzo',street:'Via',residential:'Via',primary:'Strada',secondary:'Strada',tertiary:'Strada',motorway:'Autostrada',motorway_junction:'Uscita',aerodrome:'Aeroporto',stadium:'Stadio',park:'Parco',post_office:'Ufficio postale',library:'Biblioteca',cinema:'Cinema',theatre:'Teatro',bakery:'Panificio',clothes:'Abbigliamento',mall:'Centro commerciale',doctors:'Medico',dentist:'Dentista',veterinary:'Veterinario',kindergarten:'Asilo',marketplace:'Mercato',castle:'Castello',monument:'Monumento',memorial:'Memoriale',ruins:'Rovine',archaeological_site:'Sito archeologico',beach:'Spiaggia',peak:'Vetta',administrative:'Comune'};
