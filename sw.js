/* Sentinella — funzionamento offline: app e dati in cache, mappe salvate mentre le usi. */
const V='snt-v3.0.0';
const SHELL=['./','index.html','manifest.webmanifest','css/app.css','css/extra.css','js/lib/maplibre-gl.js','js/lib/maplibre-gl.css','js/osmproc.js','js/core.js','js/api.js','js/sheet.js','js/mapview.js','js/guard.js','js/route.js','js/nav.js','js/ui.js','js/fx.js','js/ahead.js','js/places.js','js/weather.js','js/roads.js','js/tomtom.js','js/ztl.js','js/turns.js','js/junction.js','js/fuel.js','js/elev.js','js/parking.js','js/diary.js','js/voice.js','js/offline.js','js/hud.js','js/track.js','js/siri.js','js/trip.js','js/eta.js','js/laps.js','js/localroute.js','js/fixes.js','js/depart.js','js/assist.js','js/choose.js','js/live.js','js/music.js','js/app.js','data/italia.js','data/tutor.js','img/icon-180.png','img/icon-192.png','img/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V&&k!=='snt-tiles'&&k!=='snt-offline').map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
let n=0;
async function trim(){const c=await caches.open('snt-tiles');const ks=await c.keys();if(ks.length>6000)for(const k of ks.slice(0,ks.length-5000))await c.delete(k)}
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
  // mappe vettoriali, font, icone e immagini satellitari: prima la rete, poi la copia salvata
  if(/(^|\.)openfreemap\.org$|arcgisonline\.com$|tile\.openstreetmap\.org$/.test(u.hostname)){e.respondWith((async()=>{
    const c=await caches.open('snt-tiles');const saved=()=>caches.match(r.url,{ignoreVary:true,ignoreSearch:false});
    // senza rete: subito la copia salvata (zone offline o cache normale)
    if(self.navigator&&self.navigator.onLine===false){const m=await saved();if(m)return m}
    try{const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),4500);const res=await fetch(r,{signal:ctl.signal});clearTimeout(to);
      if(res.ok){c.put(r,res.clone());if(++n%300===0)trim()}return res}
    catch(err){const m=await saved();if(m)return m;throw err}})());return}
  if(u.origin===location.origin){e.respondWith((async()=>{try{const res=await fetch(r);if(res.ok){const c=await caches.open(V);c.put(r,res.clone())}return res}catch(err){const m=await caches.match(r,{ignoreSearch:true});if(m)return m;throw err}})())}
});
