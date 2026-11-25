/* Sentinella — prezzi ufficiali dei carburanti (MIMIT · Osservaprezzi, licenza IODL 2.0), preparati ogni mattina
   dall'azione GitHub del repository (tools/carburanti.py). Distributori più economici vicino a te e lungo il percorso,
   prezzi nella scheda del distributore, prezzi medi del giorno usati per il costo del viaggio. */
'use strict';
const Fuel = App.Fuel = (()=>{
  const S=App.S;const KEY={benzina:'b',diesel:'g',gpl:'l',metano:'m'};const NAME={b:'Benzina',g:'Gasolio',l:'GPL',m:'Metano'};
  const bases=(()=>{const out=[];const h=location.hostname;if(/\.github\.io$/.test(h)){const user=h.split('.')[0],repo=location.pathname.split('/').filter(Boolean)[0];if(repo)out.push(`https://raw.githubusercontent.com/${user}/${repo}/main/data/carburanti/`)}
    out.push(new URL('data/carburanti/',location.href).href);return out})();
  let idx=Store.get('fuelIdx',null),idxAt=0,baseOk=null;const tiles=new Map();
  async function get(path){const list=baseOk?[baseOk]:bases;let err;for(const b of list){try{const r=await API.tfetch(b+path,{cache:'no-cache'},12000);if(r.ok){baseOk=b;return await r.json()}err=new Error('HTTP '+r.status)}catch(e){err=e}}throw err||new Error('non disponibile')}
  async function index(){if(idx&&Date.now()-idxAt<3600e3&&idxAt)return idx;try{idx=await get('index.json');idxAt=Date.now();Store.set('fuelIdx',idx);applyAvg()}catch(e){if(!idx)throw e}return idx}
  // il costo del viaggio usa le medie ufficiali del giorno (se non hai messo un prezzo tuo)
  function applyAvg(){if(!idx||!idx.avg)return;const custom=Store.get('prices',{});let ch=false;
    for(const [f,k] of Object.entries(KEY)){if(custom[f]!=null||!idx.avg[k])continue;if(App.PRICES[f]!==idx.avg[k]){App.PRICES[f]=idx.avg[k];ch=true}App.FUELS[f].ref='MIMIT '+F.date(Date.parse(idx.date))}
    if(ch&&Plan.st.routes.length){Plan.st.routes.forEach(r=>r.cost=Plan.cost(r))}}
  if(idx)applyAvg();
  async function tile(key){if(tiles.has(key))return tiles.get(key);const ix=await index();if(!ix.tiles.includes(key)){tiles.set(key,[]);return []}
    const p=get('t/'+key+'.json').then(a=>a.map(x=>({id:x[0],lat:x[1],lon:x[2],brand:x[3],name:x[4],addr:x[5],city:x[6],prov:x[7],p:x[8],dt:x[9],hw:!!x[10]}))).catch(()=>[]);tiles.set(key,p);return p}
  async function inBox(b){const out=[];for(let la=Math.floor(b[1]);la<=Math.floor(b[3]);la++)for(let lo=Math.floor(b[0]);lo<=Math.floor(b[2]);lo++)out.push(...await tile(la+'_'+lo));return out.filter(s=>s.lon>=b[0]&&s.lon<=b[2]&&s.lat>=b[1]&&s.lat<=b[3])}
  const fk=v=>KEY[(v||App.vehicle()).fuel]||null;
  const price=(s,k)=>{const x=s.p[k];return x?(x[0]!=null?x[0]:x[1]):null};
  const isSelf=(s,k)=>!!(s.p[k]&&s.p[k][0]!=null);
  const old=s=>s.dt&&Date.now()-Date.parse(s.dt)>10*864e5;
  async function near(lat,lon,km=10,k=fk()){const d=km/111,e=km/(111*Math.cos(G.rad(lat)));const list=await inBox([lon-e,lat-d,lon+e,lat+d]);
    return list.filter(s=>price(s,k)!=null).map(s=>Object.assign(s,{d:G.dist(lat,lon,s.lat,s.lon)})).filter(s=>s.d<=km*1000)}
  async function along(r,k=fk(),lat=900){const P=G.prep(r.coords);const list=await inBox([P.b[1]-0.02,P.b[0]-0.02,P.b[3]+0.02,P.b[2]+0.02]);const out=[];
    for(const s of list){if(price(s,k)==null)continue;const pr=G.proj(s.lat,s.lon,P);if(pr.d<=lat)out.push(Object.assign(s,{along:pr.along,off:pr.d}))}return out}
  const brandShort=b=>(b||'').replace(/^Pompe Bianche$/i,'No logo').replace(/^Agip Eni$/i,'Eni').slice(0,18);
  const eur=v=>v==null?'—':v.toFixed(3).replace('.',',');

  /* ---------- prezzi come fumetti sulla mappa ---------- */
  let pills=[];
  function clearPills(){pills.forEach(m=>m.remove());pills=[]}
  function drawPills(list,k){clearPills();const map=MapView.map;if(!map||!list.length)return;const min=Math.min(...list.map(s=>price(s,k)));
    for(const s of list.slice(0,25)){const p=price(s,k);const el=document.createElement('div');el.className='fpill'+(p<=min+0.005?' best':p<=min+0.04?' good':'');
      el.innerHTML=`<b>${eur(p)}</b><small>${esc(brandShort(s.brand))}</small>`;el.onclick=e=>{e.stopPropagation();openStation(s)};pills.push(new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([s.lon,s.lat]).addTo(map))}}
  setInterval(()=>{if(pills.length&&(!UI.cur||!/^(plan|fuel|place)$/.test(UI.cur.name)||Nav.active))clearPills()},700);
  function openStation(s){UI.openPlace({name:(s.brand&&s.brand!=='Pompe Bianche'?s.brand+' · ':'')+s.name,type:'Distributore',addr:[s.addr,s.city].filter(Boolean).join(', '),lat:s.lat,lon:s.lon,cat:'fuel',tags:{amenity:'fuel'},mimit:s})}

  /* ---------- tabella prezzi nella scheda del distributore ---------- */
  function table(s){const ks=['b','g','l','m'].filter(k=>s.p[k]);if(!ks.length)return '';const my=fk();
    return `<div class="sec"><h3>Prezzi ufficiali</h3><span class="secr">${s.dt?'comunicati il '+F.date(Date.parse(s.dt)):''}</span></div>
      <div class="group ftab"><div class="kv fhead"><span></span><b>Self</b><b>Servito</b></div>${ks.map(k=>`<div class="kv${k===my?' mine':''}"><span>${NAME[k]}</span><b>${eur(s.p[k][0])}</b><b>${eur(s.p[k][1])}</b></div>`).join('')}</div>
      ${old(s)?'<p class="note" style="color:var(--orange)">Prezzi non aggiornati da più di 10 giorni: potrebbero essere cambiati.</p>':''}<p class="note">Fonte: MIMIT, Osservaprezzi Carburanti${idx?' · dati del '+F.date(Date.parse(idx.date)):''}.</p>`}
  App.on('placeOpen',async({p})=>{const isFuel=p.mimit||p.cat==='fuel'||(p.tags&&p.tags.amenity==='fuel')||/distribut|carburant|benzin/i.test(p.type||'');if(!isFuel)return;
    let s=p.mimit;if(!s){try{const l=await near(p.lat,p.lon,0.3,'b').catch(()=>[]);const all=l.length?l:await inBox([p.lon-0.004,p.lat-0.003,p.lon+0.004,p.lat+0.003]);s=all.map(x=>Object.assign(x,{d:G.dist(p.lat,p.lon,x.lat,x.lon)})).sort((a,b)=>a.d-b.d)[0];if(s&&s.d>150)s=null}catch(e){}}
    const box=$('#pLive');if(!box||!s)return;box.insertAdjacentHTML('afterbegin',`<div id="pFuel">${table(s)}</div>`)});

  /* ---------- nel piano: dove conviene fare rifornimento ---------- */
  App.on('planBody',async({route,box})=>{const k=fk();if(!box||!k||route.ped)return;let el=box.querySelector('#fuelBox');if(!el){box.insertAdjacentHTML('beforeend','<div id="fuelBox"></div>');el=box.querySelector('#fuelBox')}
    try{const list=await along(route,k);if(Plan.route!==route)return;if(!list.length){el.innerHTML='';return}const v=App.vehicle();const tank=v.tank||45;const avg=idx&&idx.avg[k];
      const best=list.slice().sort((a,b)=>price(a,k)-price(b,k)).slice(0,5);const min=price(best[0],k);
      el.innerHTML=`<div class="sec"><h3>Rifornimento più conveniente</h3><span class="secr">${NAME[k]}</span></div><div class="group">${best.map((s,i)=>App.UI.item({attr:`data-fs="${i}"`,color:i===0?'var(--green)':'#8E8E93',icon:`<b style="font-size:11px">${eur(price(s,k)).slice(0,4)}</b>`,
          t1:`${eur(price(s,k))} €${isSelf(s,k)?'':' (servito)'} · ${esc(brandShort(s.brand)||s.name)}`,t2:`al km ${Math.round(s.along/1000)}${s.off>150?` · a ${F.km(s.off)} dal percorso`:''}${s.hw?' · area di servizio':''}${avg&&price(s,k)<avg-0.02?` · pieno ${F.eur((avg-price(s,k))*tank)} in meno della media`:''}`,chev:true})).join('')}</div>
        <p class="note">Prezzi ufficiali MIMIT${idx?' del '+F.date(Date.parse(idx.date)):''}. Il costo del viaggio usa la media nazionale del giorno (${avg?eur(avg)+' €':'—'}).</p>`;
      el.querySelectorAll('[data-fs]').forEach(b=>b.onclick=()=>openStation(best[+b.dataset.fs]));drawPills(best,k)}
    catch(e){el.innerHTML=''}});

  /* ---------- schermata «Carburante» ---------- */
  let fsel=null;
  App.UI.R.fuel=()=>{const k=fsel||fk()||'b';return {detent:'half',html:`${App.UI.hdr('Carburante','I distributori più convenienti entro 10 km')}
      <div class="chips">${Object.entries(NAME).map(([kk,l])=>`<button class="chip ${kk===k?'on':''}" data-k="${kk}">${l}</button>`).join('')}</div><div id="fuOut"><div class="spin"></div></div>`,
    async bind(r){r.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{fsel=b.dataset.k;App.UI.render()});const me=App.UI.myPos();const out=$('#fuOut');if(!me){out.innerHTML='<div class="empty">Serve la posizione.</div>';return}
      try{const list=(await near(me.lat,me.lon,10,k)).sort((a,b)=>price(a,k)-price(b,k)||a.d-b.d);if(!list.length){out.innerHTML='<div class="empty">Nessun prezzo disponibile qui intorno.</div>';return}
        const avg=idx&&idx.avg[k];const top=list.slice(0,20);
        out.innerHTML=`${avg?`<div class="favg"><span>Media in Italia oggi</span><b>${eur(avg)} €</b></div>`:''}<div class="group">${top.map((s,i)=>App.UI.item({attr:`data-i="${i}"`,color:i===0?'var(--green)':price(s,k)<=price(top[0],k)+0.04?'#34C759':'#8E8E93',icon:`<b style="font-size:11px">${i+1}</b>`,t1:`${eur(price(s,k))} € · ${esc(brandShort(s.brand)||s.name)}`,t2:`${esc(s.addr||'')}${old(s)?' · prezzo vecchio':''}${isSelf(s,k)?'':' · servito'}`,rt:F.km(s.d),chev:true})).join('')}</div>
          <p class="note">Fonte MIMIT · Osservaprezzi${idx?', dati del '+F.date(Date.parse(idx.date)):''}. Si aggiornano ogni mattina.</p>`;
        out.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>openStation(top[+b.dataset.i]));drawPills(top,k);
        let bb=[[me.lon,me.lat],[me.lon,me.lat]];for(const s of top.slice(0,10)){bb[0][0]=Math.min(bb[0][0],s.lon);bb[0][1]=Math.min(bb[0][1],s.lat);bb[1][0]=Math.max(bb[1][0],s.lon);bb[1][1]=Math.max(bb[1][1],s.lat)}MapView.fit(bb)}
      catch(e){out.innerHTML=`<div class="empty">Prezzi non ancora disponibili.<br><br><small>L'aggiornamento automatico su GitHub prepara i dati ogni mattina: controlla che l'azione «Prezzi carburanti» sia attiva nel repository.</small></div>`}}}};
  // all'avvio provo a leggere le medie del giorno
  setTimeout(()=>index().catch(()=>{}),4000);
  return {index,near,along,price,get idx(){return idx}};
})();
