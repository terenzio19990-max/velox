/* Sentinella — funzionamento offline: app e dati in cache, mappe salvate mentre le usi. */
const V='snt-v2.0.0';
const SHELL=['./','index.html','manifest.webmanifest','css/app.css','js/lib/maplibre-gl.js','js/lib/maplibre-gl.css','js/osmproc.js','js/core.js','js/api.js','js/sheet.js','js/mapview.js','js/guard.js','js/route.js','js/nav.js','js/ui.js','js/app.js','data/italia.js','data/tutor.js','img/icon-180.png','img/icon-192.png','img/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V&&k!=='snt-tiles').map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
let n=0;
async function trim(){const c=await caches.open('snt-tiles');const ks=await c.keys();if(ks.length>6000)for(const k of ks.slice(0,ks.length-5000))await c.delete(k)}
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
  // mappe vettoriali, font, icone e immagini satellitari: prima la rete, poi la copia salvata
  if(/(^|\.)openfreemap\.org$|arcgisonline\.com$|tile\.openstreetmap\.org$/.test(u.hostname)){e.respondWith((async()=>{const c=await caches.open('snt-tiles');try{const res=await fetch(r);if(res.ok){c.put(r,res.clone());if(++n%300===0)trim()}return res}catch(err){const m=await c.match(r);if(m)return m;throw err}})());return}
  if(u.origin===location.origin){e.respondWith((async()=>{try{const res=await fetch(r);if(res.ok){const c=await caches.open(V);c.put(r,res.clone())}return res}catch(err){const m=await caches.match(r,{ignoreSearch:true});if(m)return m;throw err}})())}
});
