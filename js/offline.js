/* Sentinella — mappe offline (zone scaricate prima di partire, conservate a parte dalla cache normale)
   e backup dei dati (esporta / importa un file con veicoli, preferiti, viaggi, diario, impostazioni). */
'use strict';
const Offline = App.Offline = (()=>{
  const CACHE='snt-offline';let job=null;
  const lon2x=(lon,z)=>Math.floor((lon+180)/360*2**z),lat2y=(lat,z)=>{const r=G.rad(lat);return Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*2**z)};
  function template(){const map=MapView.map;if(!map)return null;const st=map.getStyle();for(const id in st.sources){const s=map.getSource(id);if(s&&s.type==='vector'&&s.tiles&&s.tiles.length)return {tiles:s.tiles[0],max:s.maxzoom||14,style:st}}return null}
  // riquadri di una zona: tutti i livelli fino a zmax
  function boxTiles(b,z0,z1,set){for(let z=z0;z<=z1;z++){const x0=lon2x(b[0],z),x1=lon2x(b[2],z),y0=lat2y(b[3],z),y1=lat2y(b[1],z);for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)set.add(z+'/'+x+'/'+y)}}
  function areaTiles(lat,lon,km,zmax){const d=km/111,e=km/(111*Math.cos(G.rad(lat)));const set=new Set();boxTiles([lon-e,lat-d,lon+e,lat+d],5,zmax,set);return set}
  // corridoio del percorso: stretto ai livelli alti, largo ai bassi
  function routeTiles(coords,zmax){const set=new Set();const P=G.prep(coords);boxTiles([P.b[1],P.b[0],P.b[3],P.b[2]],5,9,set);
    const bands=[[10,15],[11,8],[12,5],[13,2.5],[14,1.2]].filter(b=>b[0]<=zmax);
    for(const [z,km] of bands){const step=Math.max(200,km*500);for(let s=0;s<=P.len;s+=step){const q=G.pointAt(P,s);const d=km/111,e=km/(111*Math.cos(G.rad(q.lat)));boxTiles([q.lon-e,q.lat-d,q.lon+e,q.lat+d],z,z,set)}}return set}
  function extras(st){const out=[];const sp=st.sprite;const sprites=typeof sp==='string'?[sp]:Array.isArray(sp)?sp.map(x=>x.url):[];for(const s of sprites)for(const suf of ['.json','.png','@2x.json','@2x.png'])out.push(s+suf);
    if(st.glyphs){const stacks=new Set();for(const l of st.layers||[]){const f=l.layout&&l.layout['text-font'];if(Array.isArray(f)&&typeof f[0]==='string')stacks.add(f.join(','))}
      for(const s of stacks)for(const r of ['0-255','256-511','8192-8447'])out.push(st.glyphs.replace('{fontstack}',encodeURIComponent(s)).replace('{range}',r))}return out}
  async function download(name,set){const t=template();if(!t){App.toast('Mappa non pronta');return}if(job)return;
    try{navigator.storage&&navigator.storage.persist&&await navigator.storage.persist()}catch(e){}
    const urls=[...set].map(k=>{const [z,x,y]=k.split('/');return t.tiles.replace('{z}',z).replace('{x}',x).replace('{y}',y)}).concat(extras(t.style));
    const c=await caches.open(CACHE);job={name,total:urls.length,done:0,bytes:0,fail:0,stop:false};render();
    let i=0;const worker=async()=>{while(i<urls.length&&!job.stop){const u=urls[i++];try{if(!(await c.match(u,{ignoreVary:true}))){const r=await fetch(u,{mode:'cors'});if(r.ok){const b=await r.clone().arrayBuffer();job.bytes+=b.byteLength;await c.put(u,r)}else job.fail++}}catch(e){job.fail++}job.done++;if(job.done%15===0)render()}};
    await Promise.all(Array.from({length:6},worker));const z=Store.get('offZones',[]);if(!job.stop){z.unshift({name,n:job.done-job.fail,mb:+(job.bytes/1048576).toFixed(1),ts:Date.now()});Store.set('offZones',z.slice(0,30))}
    const ok=!job.stop;const f=job.fail;job=null;render();App.toast(ok?`Mappa «${name}» salvata${f?` (${f} riquadri non scaricati)`:''}`:'Download interrotto',5000)}
  let est=null;
  async function usage(){try{const e=await navigator.storage.estimate();return e}catch(x){return null}}
  function render(){if(UI.cur&&UI.cur.name==='offline')App.UI.render()}
  App.UI.R.offline=()=>{const zones=Store.get('offZones',[]);const r=Plan.route;const me=App.UI.myPos();
    const opt=(km,z)=>me?areaTiles(me.lat,me.lon,km,z).size:0;const n10=opt(10,14),n25=opt(25,14),n50=opt(50,13);const nr=r?routeTiles(r.coords,14).size:0;const mb=n=>F.n(n*0.03,0)+' MB';
    return {detent:'full',html:`${App.UI.hdr('Mappe offline','Per le zone senza segnale: scaricale prima di partire')}
      ${job?`<div class="group" style="padding:14px"><b>Scarico «${esc(job.name)}»</b><div class="prog"><i style="width:${(job.done/job.total*100).toFixed(1)}%"></i></div><small style="color:var(--label2)">${job.done} di ${job.total} · ${F.n(job.bytes/1048576,1)} MB${job.fail?` · ${job.fail} non riusciti`:''}</small><button class="btn wide" id="offStop" style="margin-top:10px;color:var(--red)">Interrompi</button></div>`:`
      <div class="group">${r?App.UI.item({attr:'id="offR"',color:'var(--accent)',icon:'<svg><use href="#i-route"/></svg>',t1:'Lungo il percorso',t2:`${F.km(r.dist)} · ${nr} riquadri, circa ${mb(nr)}`,chev:true}):''}
        ${me?[[10,n10],[25,n25],[50,n50]].map(([k,n])=>App.UI.item({attr:`data-km="${k}"`,color:'#34C759',icon:'<svg><use href="#i-globe"/></svg>',t1:`Zona di ${k} km intorno a te`,t2:`${n} riquadri, circa ${mb(n)}`,chev:true})).join(''):'<div class="empty">Serve la posizione per scaricare la zona.</div>'}</div>`}
      ${zones.length?`<div class="sec"><h3>Scaricate</h3><button class="link" id="offDel">Elimina tutte</button></div><div class="group">${zones.map(z=>App.UI.item({color:'#8E8E93',icon:'<svg><use href="#i-globe"/></svg>',t1:esc(z.name),t2:`${F.date(z.ts)} · ${z.n} riquadri · ${z.mb} MB`})).join('')}</div>`:''}
      <div id="offUse"></div>
      <p class="note">Offline funzionano mappa, autovelox, tutor e la navigazione già calcolata. Ricerca, percorsi nuovi, meteo e traffico hanno bisogno di rete.</p>`,
      bind(rt){const s=$('#offStop');if(s)s.onclick=()=>{if(job)job.stop=true};const R=$('#offR');if(R)R.onclick=()=>{const last=Plan.st.stops[Plan.st.stops.length-1];download('Percorso per '+(last?last.name:'destinazione'),routeTiles(r.coords,14))};
        rt.querySelectorAll('[data-km]').forEach(b=>b.onclick=()=>{const k=+b.dataset.km;download(`${k} km intorno a ${(Guard.limit&&Guard.limit.road)||'te'}`,areaTiles(me.lat,me.lon,k,k>=50?13:14))});
        const d=$('#offDel');if(d)d.onclick=async()=>{if(await App.confirm('Eliminare le mappe offline?','Liberi lo spazio sul telefono.','Elimina',true)){await caches.delete(CACHE);Store.del('offZones');App.UI.render()}};
        usage().then(e=>{const el=$('#offUse');if(e&&el&&e.quota)el.innerHTML=`<p class="note">Spazio usato da Sentinella: ${F.n(e.usage/1048576,0)} MB su ${F.n(e.quota/1048576/1024,1)} GB disponibili.</p>`})}}};

  /* ---------- backup ---------- */
  function exportData(){const data={app:'Sentinella',v:App.VERSION,ts:Date.now(),keys:{}};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith('snt.')&&k!=='snt.spv')data.keys[k]=localStorage.getItem(k)}
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));a.download=`sentinella-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500)}
  async function importData(file){try{const d=JSON.parse(await file.text());if(d.app!=='Sentinella'||!d.keys)throw new Error('file non valido');
      if(!await App.confirm('Ripristinare il backup?',`Del ${F.date(d.ts)}: sostituisce i dati attuali di questo telefono.`,'Ripristina',true))return;
      for(const [k,v] of Object.entries(d.keys))if(k.startsWith('snt.'))localStorage.setItem(k,v);App.toast('Backup ripristinato: ricarico');setTimeout(()=>location.reload(),900)}catch(e){App.toast('Backup non valido: '+e.message)}}
  const _set=App.UI.R.settings;
  App.UI.R.settings=function(){const o=_set.apply(this,arguments);if(!o||!o.html)return o;
    o.html=o.html.replace('<div class="sec"><h3>App</h3></div>',`<div class="sec"><h3>Backup</h3></div><div class="group">${App.UI.item({attr:'id="bkOut"',color:'#34C759',icon:'<svg><use href="#i-share"/></svg>',t1:'Esporta backup',t2:'Veicoli, preferiti, viaggi, diario, impostazioni e chiavi',chev:true})}<label class="item" style="cursor:pointer"><span class="ic" style="background:#FF9500"><svg style="transform:rotate(180deg)"><use href="#i-share"/></svg></span><span class="tx"><span class="t1" style="display:block">Importa backup</span><span class="t2" style="display:block">Da un file esportato prima</span></span><input type="file" accept="application/json,.json" id="bkIn" hidden></label></div>
      <p class="note">Su iPhone Safari può cancellare i dati dei siti non usati per 7 giorni: con l'app aggiunta alla schermata Home non succede, ma un backup ogni tanto è prudente. Il file contiene anche le tue chiavi: non condividerlo.</p>
      <div class="sec"><h3>App</h3></div>`);
    const b0=o.bind;o.bind=function(){if(b0)b0.apply(this,arguments);const a=$('#bkOut');if(a)a.onclick=exportData;const i=$('#bkIn');if(i)i.onchange=e=>{const f=e.target.files&&e.target.files[0];if(f)importData(f)}};return o};
  return {download,areaTiles,routeTiles,exportData};
})();
