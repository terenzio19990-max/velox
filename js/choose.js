/* Sentinella — scelta del percorso prima di partire:
   · fumetti sulla mappa per ogni alternativa, nel punto in cui si separa dalle altre, con tempo e differenza (tocco = scelta)
   · barra per ogni percorso, lunga in proporzione ai km: autostrada a pagamento, superstrada, extraurbana, città, code. */
'use strict';
const Choose = App.Choose = (()=>{
  const COL={toll:'#AF52DE',hw:'#0A84FF',ext:'#34C759',city:'#8E8E93',jam:'#FF3B30'};
  // tipo di strada per ogni manovra
  function kind(m){if(m.toll)return 'toll';if(m.hw)return 'hw';const v=m.time>0?m.len/m.time:0;return v>=17?'ext':'city'}
  function segs(r){if(r._segs)return r._segs;const P=G.prep(r.coords);const out=[];
    for(const m of r.man){if(!(m.len>0))continue;const a=P.cum[Math.min(m.i,P.g.length-1)],b=P.cum[Math.min(m.ie||m.i,P.g.length-1)];if(b<=a)continue;const k=kind(m);const last=out[out.length-1];if(last&&last.k===k&&a-last.b<50)last.b=b;else out.push({k,a,b})}
    const sums={toll:0,hw:0,ext:0,city:0};for(const s of out)sums[s.k]+=s.b-s.a;
    return r._segs={list:out,len:P.len||r.dist,sums}}
  function strip(r,maxDist){const s=segs(r);const w=Math.max(18,r.dist/maxDist*100);
    const parts=s.list.map(x=>`<i style="left:${(x.a/s.len*100).toFixed(2)}%;width:${Math.max(0.6,(x.b-x.a)/s.len*100).toFixed(2)}%;background:${COL[x.k]}"></i>`).join('');
    const jams=r.traffic?r.traffic.jams.map(j=>`<i class="jam" style="left:${(j.a/s.len*100).toFixed(2)}%;width:${Math.max(1.2,(j.b-j.a)/s.len*100).toFixed(2)}%"></i>`).join(''):'';
    return `<div class="rc-strip" style="width:${w.toFixed(1)}%">${parts}${jams}</div>`}
  function legend(rs){const used=new Set();rs.forEach(r=>segs(r).list.forEach(x=>used.add(x.k)));const L={toll:'Autostrada a pagamento',hw:'Autostrada e superstrada',ext:'Strada extraurbana',city:'Città'};
    const jam=rs.some(r=>r.traffic&&r.traffic.jams.length);
    return `<div class="rc-legend">${['toll','hw','ext','city'].filter(k=>used.has(k)).map(k=>`<span><i style="background:${COL[k]}"></i>${L[k]}</span>`).join('')}${jam?`<span><i style="background:${COL.jam}"></i>Coda</span>`:''}</div>`}
  // riga di icone con quello che cambia tra un percorso e l'altro
  function facts(r,g){const s=segs(r);const out=[];
    if(g){if(g.nCam)out.push(`<span class="rf">${g.nCam} autovelox</span>`);if(g.nTut)out.push(`<span class="rf">${g.nTut} tutor</span>`)}
    if(s.sums.city>800)out.push(`<span class="rf">${F.km(s.sums.city)} in città</span>`);
    if(r.fun&&r.fun.stars>=3)out.push(`<span class="rf fun">Curve ${'★'.repeat(r.fun.stars)}</span>`);
    return out.join('')}

  /* ---------- fumetti sulla mappa ---------- */
  let marks=[];
  function clear(){marks.forEach(m=>m.remove());marks=[]}
  // punto del percorso più lontano dagli altri (dove si vede che è un'alternativa)
  function uniquePoint(r,others,placed=[]){const P=G.prep(r.coords);const n=40;let best=null,bd=-1e12;const D=Math.max(300,P.len*0.18);
    const samp=others.map(o=>{const Q=G.prep(o.coords);const pts=[];for(let k=0;k<=60;k++){const q=G.pointAt(Q,Q.len*k/60);pts.push(q)}return pts});
    for(let k=3;k<=n-3;k++){const q=G.pointAt(P,P.len*k/n);let md=1e12;for(const pts of samp)for(const o of pts){const d=G.dist(q.lat,q.lon,o.lat,o.lon);if(d<md)md=d}
      let score=md-Math.abs(k-n/2)*20;for(const pl of placed){const dd=G.dist(q.lat,q.lon,pl.lat,pl.lon);if(dd<D)score-=(D-dd)*3}if(score>bd){bd=score;best=q}}
    return best||G.pointAt(P,P.len/2)}
  function draw(){clear();const map=MapView.map;const st=Plan.st;if(!map||Nav.active||!st.routes.length||!UI.cur||UI.cur.name!=='plan')return;const rs=st.routes;const fastest=Math.min(...rs.map(r=>r.time));
    const placed=[];rs.forEach((r,i)=>{const q=rs.length>1?uniquePoint(r,rs.filter(o=>o!==r),placed):G.pointAt(G.prep(r.coords),G.prep(r.coords).len*0.55);
      const d=r.time-fastest;const sel=i===st.sel;const el=document.createElement('div');el.className='rbub'+(sel?' on':'');el.style.animationDelay=(i*70)+'ms';
      el.innerHTML=`<b>${F.dur(r.time)}</b>${rs.length>1?`<small>${d<60?'più veloce':'+'+F.dur(d)}</small>`:''}${r.hasToll?'<span class="rb-t">€</span>':''}`;
      placed.push(q);el.onclick=e=>{e.stopPropagation();Voice.buzz(6);Plan.select(i)};
      marks.push(new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([q.lon,q.lat]).addTo(map))})}
  App.on('plan',()=>setTimeout(draw,30));App.on('navStart',clear);
  setInterval(()=>{if(marks.length&&(!UI.cur||UI.cur.name!=='plan'||Nav.active))clear()},600);
  const _home=App.UI.home;App.UI.home=function(){clear();return _home.apply(this,arguments)};
  return {strip,legend,facts,segs,draw,clear};
})();
