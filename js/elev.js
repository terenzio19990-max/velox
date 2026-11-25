/* Sentinella — salite e discese (quote Open-Meteo, modello Copernicus 90 m, senza chiave):
   profilo altimetrico del percorso, dislivello, pendenze, carburante in più per le salite,
   avvisi di discesa ripida e note «cresta» per il copilota. */
'use strict';
const Elev = App.Elev = (()=>{
  const S=App.S;
  async function heights(pts){const out=[];for(let i=0;i<pts.length;i+=100){const ch=pts.slice(i,i+100);
      const u=`https://api.open-meteo.com/v1/elevation?latitude=${ch.map(p=>p[0].toFixed(5)).join(',')}&longitude=${ch.map(p=>p[1].toFixed(5)).join(',')}`;
      const r=await API.tfetch(u,{},12000);const j=await r.json();if(!j.elevation)throw new Error('quote non disponibili');out.push(...j.elevation)}return out}
  function profile(rt){if(rt._elev)return rt._elev;rt._elev=(async()=>{const P=G.prep(rt.coords);const n=Math.max(30,Math.min(300,Math.round(P.len/150)));const s=[],pts=[];
      for(let i=0;i<=n;i++){const d=P.len*i/n;const q=G.pointAt(P,d);s.push(d);pts.push([q.lat,q.lon])}
      let h=await heights(pts);h=h.map((v,i)=>{const a=h[Math.max(0,i-1)],c=h[Math.min(h.length-1,i+1)];return (a+2*v+c)/4});
      let up=0,down=0,ref=h[0];for(const v of h){if(v-ref>=3){up+=v-ref;ref=v}else if(ref-v>=3){down+=ref-v;ref=v}}
      // pendenze su tratti di circa 300 m
      const step=P.len/n;const w=Math.max(1,Math.round(300/step));const grades=[];for(let i=0;i+w<h.length;i++)grades.push({a:s[i],b:s[i+w],g:(h[i+w]-h[i])/(s[i+w]-s[i])*100});
      const maxUp=Math.max(0,...grades.map(x=>x.g)),maxDown=Math.min(0,...grades.map(x=>x.g));
      // discese ripide continue (≤ -7% per almeno 500 m)
      const steep=[];for(const x of grades){if(x.g<=-7){const l=steep[steep.length-1];if(l&&x.a<=l.b+50){l.b=x.b;l.g=Math.min(l.g,x.g)}else steep.push({a:x.a,b:x.b,g:x.g})}}
      // creste: salita decisa seguita subito da discesa decisa (dossi ciechi)
      const crests=[];const k=Math.max(1,Math.round(60/step));for(let i=k;i+k<h.length;i++){const g1=(h[i]-h[i-k])/(s[i]-s[i-k])*100,g2=(h[i+k]-h[i])/(s[i+k]-s[i])*100;if(g1>=5&&g2<=-5&&h[i]>=h[i-1]&&h[i]>=h[i+1]){if(!crests.length||s[i]-crests[crests.length-1]>150)crests.push(s[i])}}
      return {s,h,up,down,min:Math.min(...h),max:Math.max(...h),maxUp,maxDown,steep:steep.filter(x=>x.b-x.a>=500),crests,len:P.len}})();
    rt._elev.catch(()=>{rt._elev=null});return rt._elev}
  // energia per salire: m·g·h divisa per il rendimento del motore (l'elettrica recupera parte della discesa)
  function extraFuel(e,v=App.vehicle()){const m=(v.mass||1350)+75*Math.max(1,S.people||1);const J=m*9.81*e.up;
    const E={benzina:[0.25,32e6],diesel:[0.30,36e6],gpl:[0.25,24e6],metano:[0.25,50e6],elettrica:[0.85,3.6e6]}[v.fuel]||[0.25,32e6];
    let q=J/(E[0]*E[1]);if(v.fuel==='elettrica')q-=m*9.81*e.down*0.6/E[1];return Math.max(0,q)}
  function chart(e,{w=340,h=92,mark=null}={}){const lo=e.min,hi=Math.max(e.max,lo+20),pad=4;const X=s=>(s/e.len)*w,Y=v=>h-pad-(v-lo)/(hi-lo)*(h-2*pad-12);
    const line=e.s.map((s,i)=>`${X(s).toFixed(1)},${Y(e.h[i]).toFixed(1)}`).join(' ');const iMax=e.h.indexOf(e.max);
    const steep=e.steep.map(x=>`<rect x="${X(x.a).toFixed(1)}" y="0" width="${Math.max(2,X(x.b)-X(x.a)).toFixed(1)}" height="${h}" fill="rgba(255,59,48,.12)"/>`).join('');
    return `<svg class="elchart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="elg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#34C759" stop-opacity=".55"/><stop offset="1" stop-color="#34C759" stop-opacity=".05"/></linearGradient></defs>
      ${steep}<polygon points="0,${h} ${line} ${w},${h}" fill="url(#elg)"/><polyline points="${line}" fill="none" stroke="#34C759" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
      <circle cx="${X(e.s[iMax]).toFixed(1)}" cy="${Y(e.max).toFixed(1)}" r="3.5" fill="#fff" stroke="#34C759" stroke-width="2" vector-effect="non-scaling-stroke"/>
      ${mark!=null?`<line x1="${X(mark)}" x2="${X(mark)}" y1="0" y2="${h}" stroke="#0A84FF" stroke-width="2" vector-effect="non-scaling-stroke"/>`:''}</svg>`}
  App.on('planBody',({route,box})=>{if(!box||route.ped)return;let el=box.querySelector('#elBox');if(!el){box.insertAdjacentHTML('beforeend','<div id="elBox"></div>');el=box.querySelector('#elBox')}
    el.innerHTML='<div class="sec"><h3>Salite e discese</h3></div><div class="group" style="padding:14px"><div class="spin" style="margin:6px auto"></div></div>';
    profile(route).then(e=>{if(Plan.route!==route)return;const v=App.vehicle();const q=extraFuel(e,v);const unit=(App.FUELS[v.fuel]||{}).unit||'l';
      el.innerHTML=`<div class="sec"><h3>Salite e discese</h3><span class="secr">${Math.round(e.min)}–${Math.round(e.max)} m</span></div>
        <div class="group elbox"><div class="elwrap">${chart(e)}<span class="el-top" style="left:${(e.s[e.h.indexOf(e.max)]/e.len*100).toFixed(1)}%">${Math.round(e.max)} m</span></div>
          <div class="elstats"><span><b>↑ ${Math.round(e.up)} m</b>salita</span><span><b>↓ ${Math.round(e.down)} m</b>discesa</span><span><b>${Math.round(e.maxUp)}% / ${Math.round(-e.maxDown)}%</b>pendenza max</span></div>
          ${q>=0.05?`<div class="kv"><span>Per le salite</span><b>circa +${F.n(q,1)} ${unit} (${F.eur(q*(App.PRICES[v.fuel]||1.9))})</b></div>`:''}
          ${e.steep.length?`<div class="kv"><span style="color:var(--red)">Discese ripide</span><b>${e.steep.length} · fino al ${Math.round(-Math.min(...e.steep.map(x=>x.g)))}%</b></div>`:''}</div>
        <p class="note">Quote Copernicus 90 m via Open-Meteo. In rosso i tratti in forte discesa: usa il freno motore.</p>`})
      .catch(()=>{el.innerHTML='<div class="sec"><h3>Salite e discese</h3></div><p class="note">Profilo altimetrico non disponibile ora.</p>'})});
  // avvisi: discesa ripida; per il copilota anche le creste
  App.on('navStart',()=>{const r=Nav.route;if(r)profile(r).then(e=>{r._elv=e}).catch(()=>{})});App.on('navReroute',()=>{const r=Nav.route;if(r)profile(r).then(e=>{r._elv=e}).catch(()=>{})});
  Ahead.add(ctx=>{if(!ctx.nav||!Nav.route||!Nav.route._elv)return [];const e=Nav.route._elv,out=[],sp=ctx.f.spd||0;
    for(const x of e.steep){const d=x.a-ctx.along;const inside=ctx.along>=x.a&&ctx.along<=x.b;if(!inside&&(d<0||d>900))continue;
      out.push({id:'st'+Math.round(x.a),kind:'hazard',color:'#FF3B30',icon:'<svg viewBox="0 0 24 24" style="width:22px;height:22px"><path d="M3 6l18 12H3z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg>',t1:`Discesa ripida ${Math.round(-x.g)}%`,t2:`per ${F.km(x.b-Math.max(x.a,ctx.along))} · usa il freno motore`,d:inside?0:d,show:inside,sayAt:Math.max(300,sp*15),say:`Discesa ripida al ${Math.round(-x.g)} per cento, usa il freno motore`})}
    if(App.Copilot&&App.Copilot.on)for(const c of e.crests){const d=c-ctx.along;if(d<0||d>Math.max(120,sp*5))continue;out.push({id:'cr'+Math.round(c),kind:'hazard',color:'#8B5CF6',icon:'<b style="font-size:13px;color:#fff">∩</b>',t1:'Cresta',t2:'Dosso cieco: non vedi oltre',d,sayAt:Math.max(80,sp*4.5),say:'cresta',beep:false})}
    return out});
  return {profile,chart,extraFuel};
})();
