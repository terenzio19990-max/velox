const V='sentinella-v2';
const SHELL=['./','./index.html','./manifest.webmanifest','./leaflet/leaflet.js','./leaflet/leaflet.css','./icon-180.png','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V&&k!=='snt-tiles'&&k!=='snt-fonts').map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
let n=0;
async function trim(){const c=await caches.open('snt-tiles');const ks=await c.keys();if(ks.length>2500)for(const k of ks.slice(0,ks.length-2000))await c.delete(k)}
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
  if(u.hostname==='server.arcgisonline.com'||u.hostname==='tile.openstreetmap.org'){e.respondWith((async()=>{const c=await caches.open('snt-tiles');try{const res=await fetch(r);if(res.ok){c.put(r,res.clone());if(++n%200===0)trim()}return res}catch(err){const m=await c.match(r);if(m)return m;throw err}})());return}
  if(u.hostname==='fonts.googleapis.com'||u.hostname==='fonts.gstatic.com'){e.respondWith(caches.open('snt-fonts').then(async c=>{const m=await c.match(r);if(m)return m;const res=await fetch(r);if(res.ok)c.put(r,res.clone());return res}));return}
  if(u.origin===location.origin){e.respondWith((async()=>{try{const res=await fetch(r);if(res.ok){const c=await caches.open(V);c.put(r,res.clone())}return res}catch(err){const m=await caches.match(r,{ignoreSearch:true});if(m)return m;throw err}})())}
});
