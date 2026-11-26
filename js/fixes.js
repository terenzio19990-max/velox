/* Sentinella — dati più affidabili, corretti da chi guida:
   · limiti: tocca il cartello del limite e scegli quello vero; vale per te subito e, con la community attiva, per chi passa di lì
   · autovelox: dopo averne passato uno l'app chiede «attivo? spento? non c'è più?»; l'ultima conferma compare nell'avviso */
'use strict';
const Fixes = App.Fixes = (()=>{
  const S=App.S;let lims=Store.get('limFix',[]),camv=Store.get('camV',{});const remote=new Map();
  const Z=9;const tileOf=(lat,lon)=>{const n=2**Z;const x=Math.floor((lon+180)/360*n);const r=G.rad(lat);const y=Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n);return x+'_'+y};
  const TOP=(tile,id)=>`snt1/x/${tile}/${id}`;
  /* ---------- limiti ---------- */
  function at(f,hd){const all=lims.concat([...remote.values()].filter(x=>x.t==='lim'));let best=null,bd=1e9;
    for(const o of all){const d=G.dist(f.lat,f.lon,o.la,o.lo);if(d>(o.r||160))continue;if(o.h!=null&&hd!=null&&G.adiff(o.h,hd)>50)continue;const sc=d+(o.mine?0:30);if(sc<bd){bd=sc;best=o}}return best}
  function setLimit(v){const f=App.state.fix;if(!f){App.toast('Serve la posizione');return}const hd=App.state.hd;
    const o={t:'lim',la:+f.lat.toFixed(5),lo:+f.lon.toFixed(5),h:hd!=null&&(f.spd||0)>2?Math.round(hd):null,v,ts:Date.now(),r:160,mine:true};
    lims=lims.filter(x=>G.dist(x.la,x.lo,o.la,o.lo)>60||(x.h!=null&&o.h!=null&&G.adiff(x.h,o.h)>50));lims.push(o);Store.set('limFix',lims.slice(-400));
    if(S.community){const id='L'+Math.round(o.la*2000)+'_'+Math.round(o.lo*2000)+'_'+(o.h==null?'x':Math.round(o.h/45)%8);MQ.publish(TOP(tileOf(o.la,o.lo),id),{t:'lim',la:o.la,lo:o.lo,h:o.h,v,ts:o.ts,exp:Date.now()+180*864e5},true)}
    App.toast(v?`Grazie: qui il limite è ${v}`:'Grazie: qui non c\'è limite indicato');App.emit('limFix')}
  function askLimit(){const f=App.state.fix;if(!f){App.toast('Serve la posizione');return}const V=[20,30,40,50,60,70,80,90,100,110,130];
    App.modal(`<div class="mb"><h4>Qual è il limite qui?</h4><p>Tocca quello del cartello: correggo da qui per circa 150 metri${S.community?' e lo vedrà anche chi passa di qui':''}.</p></div>
      <div class="limpick">${V.map(v=>`<button data-v="${v}"><span>${v}</span></button>`).join('')}</div><div class="mbtns"><button data-x>Annulla</button><button data-v="0">Nessun cartello</button></div>`,(m,close)=>{
      m.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{setLimit(+b.dataset.v);close()});m.querySelector('[data-x]').onclick=close})}
  // tocco sui cartelli del limite (guida libera e navigazione)
  function bindSigns(){for(const id of ['nLimit','limit']){const el=document.getElementById(id);if(el&&!el._fx){el._fx=1;el.style.cursor='pointer';el.addEventListener('click',e=>{e.stopPropagation();askLimit()})}}}
  App.on('mapReady',bindSigns);setTimeout(bindSigns,1500);
  /* ---------- autovelox: conferme ---------- */
  const conf=id=>{const a=camv[id],b=remote.get('C'+id);return [a,b].filter(Boolean).sort((x,y)=>y.ts-x.ts)[0]||null};
  function camLabel(c){const k=conf(c.id);if(!k)return '';return `${k.v==='on'?'confermato attivo':k.v==='off'?'segnalato spento':'segnalato rimosso'} ${FX.ago(k.ts)}`}
  function setCam(c,v){camv[c.id]={v,ts:Date.now()};Store.set('camV',camv);if(v==='off'||v==='gone')Guard.setStatus(c.id,'off');else if(Guard.stat(c)==='off'||Guard.stat(c)==='unk')Guard.setStatus(c.id,'on');
    if(S.community)MQ.publish(TOP(tileOf(c.lat,c.lon),'C'+c.id),{t:'cam',cid:c.id,v,ts:Date.now(),exp:Date.now()+365*864e5},true);App.emit('camV',c)}
  // dopo il passaggio davanti a un autovelox chiedo com'era (al massimo una volta ogni 20 giorni per autovelox)
  let near=null,askEl=null;
  App.on('tick',({f})=>{if(App.state.sim||!f||(f.spd||0)<3)return;const hd=App.state.hd;
    if(near){const d=G.dist(f.lat,f.lon,near.c.lat,near.c.lon);if(d<near.min)near.min=d;if(near.min<45&&d>60){const c=near.c;near=null;const k=camv[c.id];if(!k||Date.now()-k.ts>20*864e5)ask(c)}else if(d>400)near=null;return}
    for(const c of Guard.nearCams(f.lat,f.lon,0)){if(c.kind==='tutorpt'||c.kind==='mobile')continue;const d=G.dist(f.lat,f.lon,c.lat,c.lon);if(d<120&&(hd==null||G.adiff(hd,G.brg(f.lat,f.lon,c.lat,c.lon))<60)){near={c,min:d};break}}});
  function ask(c){if(askEl||$('#ask'))return;document.body.insertAdjacentHTML('beforeend',`<div class="ask camask" id="camAsk"><span class="ask-ic" style="background:#FF3B30"><svg style="width:24px;height:24px;color:#fff"><use href="#i-camera"/></svg></span><div class="ask-tx"><b>L'autovelox com'era?</b><small>${esc(camLabel(c)||'aiuta chi passa dopo di te')}</small></div>
      <div class="ca-b"><button data-v="on" class="ask-y">Attivo</button><button data-v="off">Spento</button><button data-v="gone">Non c'è</button></div><i class="ask-bar"></i></div>`);
    askEl=$('#camAsk');Voice.beep(1,740);const done=v=>{if(v)setCam(c,v);if(askEl){askEl.classList.add('out');const e=askEl;askEl=null;setTimeout(()=>e.remove(),300)}};
    askEl.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{done(b.dataset.v);App.toast('Grazie!')});setTimeout(()=>done(null),12000)}
  // aggiungo l'ultima conferma all'avviso autovelox
  const mo=new MutationObserver(()=>{const t=$('#alT2'),a=$('#alert');if(!t||!a||a.classList.contains('hidden')||a.classList.contains('tut'))return;const nav=App.Nav;const f=App.state.fix;if(!f)return;
    const c=Guard.nearCams(f.lat,f.lon,0).filter(x=>x.kind!=='tutorpt').sort((x,y)=>G.dist(f.lat,f.lon,x.lat,x.lon)-G.dist(f.lat,f.lon,y.lat,y.lon))[0];if(!c)return;const l=camLabel(c);
    if(l&&!t.querySelector('.cv')){t.insertAdjacentHTML('beforeend',`<span class="cv"> · ${esc(l)}</span>`)}});
  setTimeout(()=>{const t=$('#alT2');if(t)mo.observe(t,{childList:true,characterData:true,subtree:true})},1500);
  /* ---------- community: ricevo correzioni e conferme ---------- */
  const tiles=new Map();let lastArea=null;
  function onMsg(t,pl){const id=t.split('/').pop();if(!pl.length){remote.delete(id);return}let r;try{r=JSON.parse(new TextDecoder().decode(pl))}catch(e){return}if(!r||!r.t)return;if(r.exp&&Date.now()>r.exp)return;
    if(r.t==='lim'&&typeof r.v==='number'&&r.la!=null){remote.set(id,Object.assign(r,{r:160}))}else if(r.t==='cam'&&r.cid){remote.set('C'+r.cid,r);if((r.v==='off'||r.v==='gone')&&!camv[r.cid]){const c=Guard.allCams().find(x=>x.id===r.cid);if(c&&Guard.stat(c)!=='off'&&Date.now()-r.ts<30*864e5)Guard.setStatus(r.cid,'off')}}}
  App.on('tick',({f})=>{if(!S.community||typeof MQ==='undefined')return;if(lastArea&&G.dist(lastArea.lat,lastArea.lon,f.lat,f.lon)<15000)return;lastArea={lat:f.lat,lon:f.lon};
    const n=2**Z;const [x,y]=tileOf(f.lat,f.lon).split('_').map(Number);const want=new Set();for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)want.add(((x+i+n)%n)+'_'+(y+j));
    for(const [t,off] of tiles)if(!want.has(t)){off&&off();tiles.delete(t)}for(const t of want)if(!tiles.has(t))tiles.set(t,MQ.subscribe(`snt1/x/${t}/+`,onMsg))});
  return {at,setLimit,askLimit,camLabel,setCam,get count(){return lims.length}};
})();
