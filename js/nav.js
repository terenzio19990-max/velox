/* Sentinella — navigazione passo-passo: istruzioni vocali, ricalcolo, arrivo, limiti lungo il percorso. */
'use strict';
const Nav = App.Nav = (()=>{
  const N={active:false};
  let rt=null,P=null,lims=[],manA=[],manT=[],said=[],along=0,idx=0,offCnt=0,lastReroute=0,stopsLeft=[],legEnds=[],legIdx=0,lastDraw=0,postSaid=-1,camsOnRoute=[],muted=false;

  /* ---------- icone di manovra ---------- */
  function arrow(deg){return `<svg viewBox="0 0 64 64"><g transform="rotate(${deg} 32 40)"><path d="M32 58V30" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M18 32L32 14l14 18z" fill="#fff"/></g></svg>`}
  function turn(dir){const g='<path d="M22 58V36c0-7 5-12 12-12h10" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M42 12l14 12-14 12z" fill="#fff"/>';return `<svg viewBox="0 0 64 64">${dir==='l'?`<g transform="translate(64 0) scale(-1 1)">${g}</g>`:g}</svg>`}
  function icon(m){const t=m.type;
    if(t===26||t===27)return `<svg viewBox="0 0 64 64"><circle cx="32" cy="34" r="12" stroke="#fff" stroke-width="6" fill="none"/><path d="M32 60V46" stroke="#fff" stroke-width="6" stroke-linecap="round"/><text x="32" y="39" text-anchor="middle" font-size="13" font-weight="800" fill="#fff" font-family="-apple-system,system-ui">${m.exits||''}</text><path d="M44 22l8-10M44 12h8v8" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
    if(t===4||t===5||t===6)return `<svg viewBox="0 0 64 64"><path d="M18 58V10M18 12h28l-6 10 6 10H18" stroke="#fff" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" fill="none"/></svg>`;
    if(t===10||t===2||t===18||t===20)return turn('r',false);if(t===15||t===3||t===19||t===21)return turn('l',false);
    if(t===11)return arrow(130);if(t===14)return arrow(-130);if(t===12)return arrow(170);if(t===13)return arrow(-170);
    if(t===9||t===23||t===37)return arrow(35);if(t===16||t===24||t===38)return arrow(-35);
    if(t===28||t===29)return `<svg viewBox="0 0 64 64"><path d="M10 40h44l-6 12H16zM20 40V24h24v16M32 24V12" stroke="#fff" stroke-width="5" stroke-linejoin="round" fill="none"/></svg>`;
    return arrow(0)}

  /* ---------- avvio ---------- */
  function setup(route,stops){rt=route;P=G.prep(rt.coords);lims=[];manA=rt.man.map(m=>P.cum[Math.min(m.i,P.g.length-1)]);
    manT=[];let acc=0;for(const m of rt.man){manT.push(acc);acc+=m.time}
    said=rt.man.map(()=>({a:false,p:false}));along=0;idx=0;offCnt=0;postSaid=-1;legIdx=0;
    legEnds=rt.man.map((m,i)=>[4,5,6].includes(m.type)?manA[i]:null).filter(x=>x!=null);
    stopsLeft=stops.slice(1);
    camsOnRoute=matchCams();
    API.routeLimits(rt).then(l=>{if(rt===route){lims=l.sort((a,b)=>a.i0-b.i0)}}).catch(()=>{})}
  function matchCams(){const out=[];const seen=new Set();const step=Math.max(1,Math.floor(P.g.length/400));
    for(let i=0;i<P.g.length;i+=step){const p=P.g[i];for(const c of Guard.nearCams(p[0],p[1],0)){if(seen.has(c.id)||c.kind==='tutorpt')continue;seen.add(c.id);
      const pr=G.proj(c.lat,c.lon,P,Math.max(0,i-step*3),i+step*3+2);if(pr.d<35&&(c.dir==null||G.adiff(c.dir,pr.b)<90))out.push({c,along:pr.along})}}
    return out.sort((a,b)=>a.along-b.along)}
  function start(route,stops){setup(route,stops);N.active=true;App.state.navigating=true;document.body.classList.add('navigating');
    App.keepAwake(true);App.state.awake=true;MapView.setCam('nav');$('#navTop').classList.remove('hidden');$('#navSide').classList.remove('hidden');$('#hud').classList.add('off');$('#ctrls').classList.add('nav');
    const dest=stops[stops.length-1];Voice.say(`Partiamo. ${F.speakDist(rt.dist)}, arrivo previsto alle ${F.clock(Date.now()+rt.time*1000)}.`,true);
    Store.set('lastNav',{stops,ts:Date.now()});drawProgress(true);App.emit('navStart');if(App.state.fix)update(App.state.fix,App.state.hd)}
  function stop(silent){N.active=false;App.state.navigating=false;document.body.classList.remove('navigating');App.state.awake=!!App.state.driving;if(!App.state.driving)App.keepAwake(false);
    $('#navTop').classList.add('hidden');$('#navSide').classList.add('hidden');$('#hud').classList.remove('off');$('#ctrls').classList.remove('nav');
    MapView.setData('routeHead',EMPTY);MapView.setCam(App.state.fix?'follow':'free');Plan.clearMap();Plan.st.routes=[];rt=null;Store.del('lastNav');if(!silent)Voice.say('Navigazione terminata');App.emit('navEnd')}

  /* ---------- aggiornamento a ogni posizione ---------- */
  function update(f,hd){if(!N.active||!rt)return;
    const win0=Math.max(0,idx-30),win1=idx+600;let p=G.proj(f.lat,f.lon,P,win0,win1);
    if(p.d>60)p=G.proj(f.lat,f.lon,P);
    const thr=Math.max(45,Math.min(90,(f.acc||10)*1.6));
    if(p.d>thr&&(f.spd||0)>2){offCnt++;if(offCnt>=3&&Date.now()-lastReroute>8000)reroute(f,hd)}else{offCnt=0;
      if(p.along>=along-40||p.d<15){along=p.along;idx=p.i}}
    // tappe intermedie
    if(legIdx<legEnds.length-1&&along>=legEnds[legIdx]-35){legIdx++;Voice.say('Hai raggiunto la tappa '+legIdx);Voice.beep(2,700);App.toast('Tappa '+legIdx+' raggiunta')}
    // arrivo
    if(P.len-along<30||(legIdx>=legEnds.length-1&&legEnds.length&&along>=legEnds[legEnds.length-1]-25)){arrive();return}
    // prossima manovra
    let k=rt.man.findIndex((m,i)=>i>0&&manA[i]>along+4);if(k<0)k=rt.man.length-1;const m=rt.man[k];const dist=Math.max(0,manA[k]-along);const spd=f.spd||0;
    renderMan(m,dist,rt.man[k+1],manA[k+1]!=null?manA[k+1]-manA[k]:null);
    // voce
    if(!muted&&App.S.voice){const s=said[k];const far=m.hw||spd>22?Math.max(1200,spd*45):Math.max(350,spd*25);
      if(!s.a&&dist<far&&dist>Math.max(160,spd*12)&&(m.alert||m.pre)){s.a=true;Voice.say('Tra '+F.speakDist(dist)+', '+lc(m.alert||m.pre))}
      if(!s.p&&dist<=Math.max(55,spd*7)){s.p=true;s.a=true;Voice.say(m.pre,true)}
      const prev=rt.man[k-1];if(k-1!==postSaid&&prev&&prev.post&&dist>3000&&manA[k-1]<along){postSaid=k-1;Voice.say(prev.post)}}
    // tempi
    const pk=Math.max(0,k-1);const segLen=Math.max(1,manA[k]-manA[pk]);const frac=Math.min(1,Math.max(0,(along-manA[pk])/segLen));
    const tRem=Math.max(0,rt.time-manT[pk]-rt.man[pk].time*frac);
    N.rem={dist:P.len-along,time:tRem,eta:Date.now()+tRem*1000};
    App.emit('navTick',N.rem);
    if(Date.now()-lastDraw>2500)drawProgress()}
  const lc=s=>s?s.charAt(0).toLowerCase()+s.slice(1):'';
  function renderMan(m,dist,next,nextGap){$('#manIc').innerHTML=icon(m);const [n,u]=F.kmParts(dist);$('#manD').innerHTML=`${n}<small>${u}</small>`;
    const street=m.begin||m.street||'';$('#manS').textContent=street?street:m.text.replace(/\.$/,'');
    const nx=$('#manNext');if(next&&nextGap!=null&&nextGap<400&&![4,5,6].includes(m.type)){nx.classList.remove('hidden');nx.innerHTML=`Poi ${icon(next)}`}else nx.classList.add('hidden')}
  // linea del percorso: la parte lontana si aggiorna di rado, il tratto vicino parte sempre dalla freccia (drawHead, ogni fotogramma)
  let j0=0;const EMPTY={type:'FeatureCollection',features:[]};
  const line=c=>({type:'FeatureCollection',features:c.length>1?[{type:'Feature',geometry:{type:'LineString',coordinates:c},properties:{k:'main'}}]:[]});
  function drawProgress(force){lastDraw=Date.now();if(!rt)return;
    if(force||j0<idx+2||j0>idx+600){j0=Math.min(P.g.length-1,G.idxAt(P,along+900)+1);MapView.setData('route',line(P.g.slice(j0).map(p=>[p[1],p[0]])))}
    if(force)MapView.setData('alts',EMPTY);if(force||!App.state.fix)drawHead(null)}
  function drawHead(d){if(!rt)return;let c;
    if(d){const p=G.proj(d.lat,d.lon,P,Math.max(0,idx-8),j0+1);
      if(p.i>=j0-1){drawProgress(true);return}
      const s=p.d<25?[d.lon,d.lat]:[P.g[p.i][1]+(P.g[p.i+1][1]-P.g[p.i][1])*p.t,P.g[p.i][0]+(P.g[p.i+1][0]-P.g[p.i][0])*p.t];
      c=[s].concat(P.g.slice(p.i+1,j0+1).map(q=>[q[1],q[0]]))}
    else c=P.g.slice(Math.max(0,idx),j0+1).map(q=>[q[1],q[0]]);
    MapView.setData('routeHead',line(c))}
  async function reroute(f,hd){lastReroute=Date.now();offCnt=0;Voice.say('Ricalcolo il percorso',true);App.toast('Ricalcolo…');
    const remaining=[{lat:f.lat,lon:f.lon,heading:hd,name:'Posizione'}].concat(stopsLeft.slice(legIdx));
    try{let r;try{r=(await API.route(remaining,{avoidTolls:App.S.avoidTolls,avoidHighways:App.S.avoidHighways,avoidFerries:App.S.avoidFerries}))[0]}catch(e){r=(await API.routeOSRM(remaining,{}))[0]}
      r.cost=Plan.cost(r);setup(r,remaining);drawProgress(true);App.emit('navReroute')}
    catch(e){App.toast('Ricalcolo non riuscito, riprovo');lastReroute=Date.now()-4000}}
  function arrive(){const d=Plan.st.stops[Plan.st.stops.length-1];App.emit('beforeArrive',d);Voice.beep(2,880);Voice.say('Sei arrivato a destinazione',true);App.toast('Sei arrivato');stop(true);App.emit('arrived',d)}
  function limitHere(){if(!lims.length)return null;return Guard.routeLimit(lims,idx)}
  function steps(){if(!rt)return [];const k=rt.man.findIndex((m,i)=>i>0&&manA[i]>along+4);return rt.man.slice(Math.max(1,k)).map((m,j)=>({m,icon:icon(m),dist:manA[Math.max(1,k)+j]-along}))}
  Object.assign(N,{start,stop,update,limitHere,steps,icon,drawHead,along:()=>along,toggleMute(){muted=!muted;return muted}});
  Object.defineProperties(N,{camsOnRoute:{get:()=>camsOnRoute},route:{get:()=>rt},muted:{get:()=>muted}});
  return N;
})();
