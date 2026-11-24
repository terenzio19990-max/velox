/* Sentinella — avvisi "più avanti": raccoglie da tutti i moduli (meteo, pericoli, curve, segnalazioni, incidenti, carovana)
   ciò che sta davanti all'auto, mostra il più vicino in una pillola animata e lo annuncia a voce una sola volta. */
'use strict';
const Ahead = App.Ahead = (()=>{
  const providers=[],said=new Map();let shown=null,P=null,PRt=null;
  function add(fn){providers.push(fn)}
  // in guida libera: distanza di un punto davanti a me (cono di 30°), altrimenti null
  function front(f,hd,lat,lon,max=1500,cone=30){const d=G.dist(f.lat,f.lon,lat,lon);if(d>max)return null;if(hd==null)return d<120?d:null;
    const ad=G.adiff(hd,G.brg(f.lat,f.lon,lat,lon));return (ad<cone||(d<60&&ad<70))?d:null}
  // in navigazione: distanza lungo il percorso
  function routeP(){const r=Nav.route;if(!r)return null;if(PRt!==r){PRt=r;P=G.prep(r.coords)}return P}
  function onRoute(lat,lon,tol=30){const p=routeP();if(!p)return null;const pr=G.proj(lat,lon,p);return pr.d<=tol?pr.along:null}
  function tick({f,hd}){const nav=!!(Nav.active&&Nav.route);const ctx={f,hd,nav,along:nav?Nav.along():0,P:nav?routeP():null,kmh:Math.round((f.spd||0)*3.6)};
    let items=[];for(const fn of providers){try{const r=fn(ctx);if(r&&r.length)items.push(...r)}catch(e){console.warn(e)}}
    items=items.filter(x=>x&&x.d!=null&&x.d>=0);
    // voce: ogni elemento una sola volta, quando entra nella sua distanza di annuncio
    const sp=f.spd||0;
    for(const x of items.sort((a,b)=>a.d-b.d)){if(!x.say)continue;const at=x.sayAt||Math.max(200,Math.min(900,sp*12));if(x.d<=at&&!said.has(x.id)){said.set(x.id,Date.now());if(x.beep!==false)Voice.beep(1,x.prio>=2?990:760);Voice.say(x.say,x.prio>=2);if(x.prio>=2)Voice.buzz(40)}}
    for(const [k,t] of said)if(Date.now()-t>20*60e3)said.delete(k);
    // pillola: il più importante tra i vicini
    const vis=items.filter(x=>x.show||x.d<(x.showAt||Math.max(600,sp*30))).sort((a,b)=>(b.prio||0)-(a.prio||0)||a.d-b.d)[0];
    render(vis||null)}
  function render(x){const el=$('#hz');if(!el)return;
    if(!x){if(shown){shown=null;el.classList.add('out');clearTimeout(render.t);render.t=setTimeout(()=>{if(!shown){el.classList.add('hidden');el.classList.remove('out');App.emit('layout')}},260)}return}
    const changed=!shown||shown.id!==x.id;shown=x;
    if(changed){el.classList.remove('hidden','out');el.style.animation='none';void el.offsetWidth;el.style.animation='';$('#hzIc').style.background=x.color||'var(--orange)';$('#hzIc').innerHTML=x.icon||'<svg><use href="#i-alert"/></svg>';App.emit('layout')}
    el.classList.toggle('sev',(x.prio||0)>=2);$('#hzT').textContent=x.t1;$('#hzS').textContent=x.t2||'';
    if(x.d>0){const [n,u]=F.kmParts(x.d);$('#hzD').innerHTML=`${n}<small> ${u}</small>`}else $('#hzD').innerHTML='<small>qui</small>';
    el.onclick=x.tap||null}
  App.on('tick',tick);App.on('navEnd',()=>render(null));
  return {add,front,onRoute,routeP,get shown(){return shown}};
})();
