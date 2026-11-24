/* Sentinella — sorveglianza: limiti di velocità, autovelox, tutor con velocità media. */
'use strict';
const Guard = App.Guard = (()=>{
  const S=App.S;
  let CAMS=[],TUTS=[],grid=new Map();
  let OVR=Store.get('ovr',{});            // id -> 'on'|'off'|'unk'
  let USER=Store.get('user',{cams:[],tuts:[]});
  let HIST=Store.get('hist',[]);
  let dataInfo={n:0,t:0,date:''};

  /* ---------- dati ---------- */
  const key=(la,lo)=>Math.floor(la*10)+'_'+Math.floor(lo*10);
  function index(){grid=new Map();for(const c of allCams()){const k=key(c.lat,c.lon);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(c)}}
  function load(){
    const D=window.SNT_DATA||{cams:[],tuts:[],ts:''};
    CAMS=D.cams.map(a=>({id:'n'+a[0],lat:a[1],lon:a[2],lim:a[3]||0,dir:a[4]>=0?a[4]:null,status:a[5]?'off':'on',kind:a[6]?'tutorpt':'fixed',src:'osm'}));
    const official=(window.SNT_TUTOR&&window.SNT_TUTOR.tratte)||[];
    const tOff=official.map(t=>mkTut({id:'u'+t.id,n:t.n,mw:t.mw,dir:t.dir,l:t.l||130,a:t.a,b:t.b,p:t.p,len:t.len,src:'uff'}));
    const tOsm=(D.tuts||[]).filter(t=>!tOff.some(o=>G.dist(o.A[0],o.A[1],t.a[0],t.a[1])<1500&&G.dist(o.B[0],o.B[1],t.b[0],t.b[1])<1500))
      .map(t=>mkTut({id:'r'+t.id,n:t.n||'Tutor',l:t.l||0,a:t.a,b:t.b,p:t.p,bd:t.bd,off:t.off,src:'osm'}));
    TUTS=tOff.concat(tOsm);
    dataInfo={n:CAMS.length,t:TUTS.length,date:D.ts||'',tdate:window.SNT_TUTOR&&window.SNT_TUTOR.ts||''};
    index();publish()}
  function mkTut(t){const P=t.p&&t.p.length>1?G.prep(t.p):null;
    return {id:t.id,name:t.n||'Tutor',mw:t.mw||'',dir:t.dir||'',lim:t.l||0,A:t.a,B:t.b,P,len:t.len||(P?P.len:G.dist(t.a[0],t.a[1],t.b[0],t.b[1])*1.03),exact:!!P,bidir:!!t.bd,status:t.off?'off':'on',src:t.src}}
  const stat=o=>OVR[o.id]||o.status;
  function allCams(){const now=Date.now();USER.cams=USER.cams.filter(c=>!c.exp||c.exp>now);return CAMS.concat(USER.cams)}
  function allTuts(){return TUTS.concat(USER.tuts.map(t=>mkTut(Object.assign({},t,{src:'user'}))))}
  function nearCams(lat,lon,r=2){const out=[],a=Math.floor(lat*10),b=Math.floor(lon*10);for(let i=-r;i<=r;i++)for(let j=-r;j<=r;j++){const c=grid.get((a+i)+'_'+(b+j));if(c)out.push(...c)}return out}
  function publish(){
    MapView.setData('cams',{type:'FeatureCollection',features:allCams().filter(c=>S.showOff||stat(c)!=='off').map(c=>({type:'Feature',geometry:{type:'Point',coordinates:[c.lon,c.lat]},properties:{id:c.id,l:c.lim||0,s:stat(c)==='off'?'off':c.kind==='mobile'?'mob':stat(c)==='unk'?'unk':c.kind==='tutorpt'?'tut':'on'}}))});
    const tf=[];for(const t of allTuts()){if(stat(t)==='off'&&!S.showOff)continue;const g=t.P?t.P.g:[t.A,t.B];
      tf.push({type:'Feature',geometry:{type:'LineString',coordinates:g.map(p=>[p[1],p[0]])},properties:{id:t.id,off:stat(t)==='off'}});
      const m=t.P?G.pointAt(t.P,t.P.len/2):{lat:(t.A[0]+t.B[0])/2,lon:(t.A[1]+t.B[1])/2};
      tf.push({type:'Feature',geometry:{type:'Point',coordinates:[m.lon,m.lat]},properties:{id:t.id,pt:1,lbl:'Tutor'+(t.lim?' '+adjLim(t.lim,'motorway'):'')}})}
    MapView.setData('tuts',{type:'FeatureCollection',features:tf})}

  /* ---------- limiti ---------- */
  const CLS_FALL={motorway:130,trunk:90,primary:90,secondary:90,tertiary:70,unclassified:50,residential:50,service_other:30,service:30,living_street:20};
  function adjLim(v,cls){if(!v)return v;const hw=cls==='motorway';const tr=cls==='trunk';
    if(S.rain||App.state.wet){if(hw)v=Math.min(v,110);else if(tr&&v>90)v=Math.min(v,90)}
    if(S.neo){if(hw)v=Math.min(v,100);else if(tr)v=Math.min(v,90)}return v}
  let L={v:null,est:false,road:'',cls:''},locBusy=false,locAt=0,locPos=null;
  async function freeLimit(f,hd){if(locBusy)return;const moved=locPos?G.dist(locPos.lat,locPos.lon,f.lat,f.lon):1e9;
    if(moved<35&&Date.now()-locAt<12000)return;if(Date.now()-locAt<2200)return;
    locBusy=true;locAt=Date.now();locPos={lat:f.lat,lon:f.lon};
    try{const r=await API.locate(f.lat,f.lon,hd);if(r&&r.dist<45){const fb=CLS_FALL[r.cls]||null;L={v:adjLim(r.lim||fb,r.cls),est:!r.lim,road:r.name,cls:r.cls}}else if(r){L={v:null,est:false,road:'',cls:''}}}
    catch(e){}finally{locBusy=false}}
  function routeLimit(lims,idx){if(!lims||!lims.length)return null;let lo=0,hi=lims.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(lims[m].i0<=idx)lo=m;else hi=m-1}const e=lims[lo];if(!e||idx>e.i1+2)return null;
    const fb=CLS_FALL[e.cls]||null;return {v:adjLim(e.lim||fb,e.cls),est:!e.lim,road:e.name,cls:e.cls}}

  /* ---------- tick principale (ogni fix GPS) ---------- */
  let overSince=0,lastOverVoice=0;
  const announced=new Map();const approachSaid=new Set();
  function tick(f,hd){
    // limite
    const nv=App.Nav&&App.Nav.active?App.Nav.limitHere():null;
    if(nv)L=nv;else if(!App.state.sim)freeLimit(f,hd);
    const kmh=Math.round((f.spd||0)*3.6);
    const over=L.v&&kmh>L.v+S.margin;
    if(over){if(!overSince)overSince=f.t}else overSince=0;
    if(over&&f.t-overSince>3000&&Date.now()-lastOverVoice>25000){lastOverVoice=Date.now();Voice.beep(2,990);Voice.say('Limite '+L.v)}
    App.emit('hud',{kmh,lim:L.v,est:L.est,over,road:L.road});
    checkTutor(f,hd);
    checkCams(f,hd,kmh)}

  /* ---------- autovelox ---------- */
  function camsAhead(f,hd){const sp=f.spd||0;const out=[];const nav=App.Nav&&App.Nav.active?App.Nav:null;
    if(nav&&nav.camsOnRoute){const my=nav.along();for(const x of nav.camsOnRoute){const d=x.along-my;if(d>-15&&d<3000&&stat(x.c)!=='off')out.push({c:x.c,d:Math.max(0,d)})}return out}
    for(const c of nearCams(f.lat,f.lon,1)){if(stat(c)==='off'||c.kind==='tutorpt')continue;const d=G.dist(f.lat,f.lon,c.lat,c.lon);if(d>3000)continue;
      if(hd==null){if(d<250)out.push({c,d});continue}
      const ad=G.adiff(hd,G.brg(f.lat,f.lon,c.lat,c.lon));const ahead=ad<30||(d<150&&ad<60);
      if(!ahead){if(announced.has(c.id)&&d>150)announced.delete(c.id);continue}
      if(c.dir!=null&&G.adiff(hd,c.dir)>100)continue;out.push({c,d})}
    return out.sort((a,b)=>a.d-b.d)}
  let alertShown=null;
  function checkCams(f,hd,kmh){const sp=f.spd||0;const lead=Math.max(300,Math.min(1300,sp*S.lead));
    const best=camsAhead(f,hd)[0];const appr=!Tut.act?tutorAhead(f,hd):null;
    if(best&&best.d<lead*1.6){const c=best.c;const lim=c.lim||L.v||null;
      showAlert(c.kind==='mobile'?'mob':'cam',c.kind==='mobile'?'Controllo segnalato':'Autovelox',
        (stat(c)==='unk'?'Stato da verificare · ':'')+(lim?`Limite ${lim}`+(kmh>lim?` · <b>sei a ${kmh}</b>`:''):'Limite non indicato'),best.d);
      if(best.d<lead&&!announced.has(c.id)){announced.set(c.id,Date.now());Voice.beep(1,880);Voice.buzz(30);
        if(S.camVoice)Voice.say(`${c.kind==='mobile'?'Controllo segnalato':'Autovelox'} tra ${F.speakDist(best.d)}${lim?', limite '+lim:''}`,true)}
      if(lim&&kmh>lim+S.margin&&best.d<260&&!announced.has(c.id+'!')){announced.set(c.id+'!',Date.now());Voice.beep(3,1100);Voice.say('Rallenta',true)}
      return}
    if(appr){const t=appr.t;showAlert('tut','Tutor in arrivo',`${t.lim?'Limite '+adjLim(t.lim,'motorway')+' · ':''}${F.km(t.len)} di tratta`,appr.d);
      if(!approachSaid.has(t.id)&&appr.d<Math.max(700,sp*25)){approachSaid.add(t.id);Voice.beep(1,700);Voice.say('Tutor tra '+F.speakDist(appr.d))}return}
    hideAlert()}
  function showAlert(kind,t1,t2,d){const a=$('#alert');a.classList.remove('hidden');a.className='alert '+(kind==='tut'?'tut':kind==='mob'?'mob':'');
    $('#alIc').innerHTML=kind==='tut'?'<b style="font-size:20px">T</b>':'<svg><use href="#i-camera"/></svg>';$('#alT1').textContent=t1;$('#alT2').innerHTML=t2;
    const [n,u]=F.kmParts(d);$('#alD').innerHTML=`${n}<small> ${u}</small>`;alertShown=kind;App.emit('layout')}
  function hideAlert(){if(alertShown){alertShown=null;$('#alert').classList.add('hidden');App.emit('layout')}}

  /* ---------- tutor ---------- */
  const Tut={act:null};const cool=new Map();
  const tol=v=>Math.max(5,v*0.05);const thr=L_=>Math.max(L_+5,L_/0.95);
  function band(ex){if(ex<=0)return null;const m=S.neo?2:1;
    if(ex<=10)return {e:'42–173 €',p:0,x:''};if(ex<=40)return {e:'173–695 €',p:3*m,x:''};
    if(ex<=60)return {e:'543–2.170 €',p:6*m,x:'sospensione patente 1–3 mesi'};return {e:'845–3.382 €',p:10*m,x:'sospensione patente 6–12 mesi'}}
  function orient(t){const o=[{A:t.A,B:t.B,rev:false}];if(t.bidir)o.push({A:t.B,B:t.A,rev:true});return o}
  function tutorAhead(f,hd){if(hd==null)return null;let best=null;
    for(const t of allTuts()){if(stat(t)==='off')continue;for(const o of orient(t)){const d=G.dist(f.lat,f.lon,o.A[0],o.A[1]);if(d>2500||d<40)continue;
      if(G.adiff(hd,G.brg(f.lat,f.lon,o.A[0],o.A[1]))<30&&G.adiff(hd,G.brg(o.A[0],o.A[1],o.B[0],o.B[1]))<70&&(!best||d<best.d))best={t,o,d}}}
    return best}
  function checkTutor(f,hd){if(Tut.act){updTutor(f);return}if((f.spd||0)<4)return;
    for(const t of allTuts()){if(stat(t)==='off')continue;if(cool.has(t.id)&&f.t-cool.get(t.id)<6e5)continue;
      for(const o of orient(t)){const dA=G.dist(f.lat,f.lon,o.A[0],o.A[1]);if(dA>3000&&!t.P)continue;
        const toB=hd==null?0:G.adiff(hd,G.brg(f.lat,f.lon,o.B[0],o.B[1]));
        const P=t.P?(o.rev?G.prep(t.P.g.slice().reverse()):t.P):null;
        if(dA<Math.max(90,(f.spd||0)*2.6)&&toB<75){begin(t,o,P,0,false,f);return}
        if(P&&f.lat>=P.b[0]-0.01&&f.lat<=P.b[2]+0.01&&f.lon>=P.b[1]-0.01&&f.lon<=P.b[3]+0.01){const p=G.proj(f.lat,f.lon,P);
          if(p.d<35&&hd!=null&&G.adiff(hd,p.b)<35&&p.along>150&&p.along<P.len-400){begin(t,o,P,p.along,true,f);return}}}}}
  function begin(t,o,P,off,partial,f){const fromRoad=!t.lim;const Lm=t.lim?adjLim(t.lim,'motorway'):(L.cls==='motorway'?adjLim(130,'motorway'):L.v)||null;
    const len=(t.len||(P?P.len:0))-(partial&&P?off*(t.len/P.len):0);
    Tut.act={t,B:o.B,P,off,len,scale:P&&t.len?t.len/P.len:1,t0:f.t,prog:0,last:f,minD:Infinity,offT:0,partial,manual:false,L:Lm,fromRoad,overSaid:false,kmSaid:false,track:[[f.lat,f.lon]],maxV:0};
    if(P)MapView.setData('tutAct',{type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'LineString',coordinates:P.g.map(p=>[p[1],p[0]])},properties:{}}]});
    $('#tutor').classList.remove('hidden');App.emit('layout');Voice.beep(2,660);
    Voice.say(`Inizio tutor${Lm?', limite '+Lm:''}. ${F.speakDist(len)}`+(partial?'. Media parziale':''),true);render()}
  function startManual(){const f=App.state.fix;if(!f){App.toast('Serve prima la posizione');return}if(Tut.act){App.toast('Un tutor è già attivo');return}
    const Lm=L.v||130;Tut.act={t:{id:'manual',name:'Tratta manuale',lim:Lm},B:null,P:null,off:0,len:null,scale:1,t0:f.t,prog:0,last:f,minD:Infinity,offT:0,partial:false,manual:true,L:Lm,overSaid:false,kmSaid:false,track:[[f.lat,f.lon]],maxV:0};
    $('#tutor').classList.remove('hidden');App.emit('layout');Voice.beep(2,660);Voice.say('Tutor manuale avviato, limite '+Lm,true);render()}
  function updTutor(f){const a=Tut.act;const dt=Math.max(0,(f.t-a.last.t)/1000);
    if(a.P){const p=G.proj(f.lat,f.lon,a.P);if(p.d<150){a.prog=Math.max(a.prog,Math.min(a.len,(p.along-a.off)*a.scale));a.offT=0}else a.offT+=dt}
    else if((f.acc||0)<70||App.state.sim)a.prog+=G.dist(a.last.lat,a.last.lon,f.lat,f.lon);
    a.last=f;a.maxV=Math.max(a.maxV,(f.spd||0)*3.6);
    const tl=a.track[a.track.length-1];if(G.dist(tl[0],tl[1],f.lat,f.lon)>40)a.track.push([f.lat,f.lon]);
    if(!a.manual){const dB=G.dist(f.lat,f.lon,a.B[0],a.B[1]);a.minD=Math.min(a.minD,dB);
      const done=(a.P&&a.prog>=a.len-25)||dB<45||(a.minD<300&&dB>a.minD+120)||(!a.P&&a.prog>a.len*1.6)||a.offT>40;
      if(done){end(a.offT>40?'uscito':'fine');return}}
    if((a.fromRoad||!a.L)&&L.v&&!a.manual)a.L=L.v;const st=stats();
    if(st.avg!=null&&a.L){if(st.avg>a.L&&!a.overSaid&&st.el>25){a.overSaid=true;Voice.beep(2,990);Voice.say('Media sopra il limite: '+Math.round(st.avg))}else if(st.avg<a.L-2&&a.overSaid)a.overSaid=false}
    if(!a.manual&&!a.kmSaid&&st.left!=null&&st.left<1000&&st.left>200){a.kmSaid=true;Voice.say('Ultimo chilometro di tutor. Media '+Math.round(st.avg||0))}
    render()}
  function stats(){const a=Tut.act,f=App.state.fix;const el=(f.t-a.t0)/1000;const avg=el>2?a.prog/el*3.6:null;const left=a.len!=null?Math.max(0,a.len-a.prog):null;let vmax=null,vtol=null,imp=false;
    if(a.L&&left!=null&&left>60){const budget=a.len/(a.L/3.6)-el;if(budget<=0)imp=true;else vmax=left/budget*3.6;const b2=a.len/(thr(a.L)/3.6)-el;if(b2>0)vtol=left/b2*3.6}
    return {el,avg,left,vmax,vtol,imp}}
  function render(){const a=Tut.act,st=stats();const box=$('#tutor');
    $('#tuName').textContent=a.t.name||'';$('#tuAvg').textContent=st.avg==null?'–':Math.round(st.avg);$('#tuAvgL').textContent=a.partial?'media parziale':'media km/h';
    $('#tuLim').textContent=a.L?a.L+' km/h':'n.d.';$('#tuLeft').textContent=a.manual?F.km(a.prog)+' fatti':F.km(st.left);$('#tuTime').textContent=F.mmss(st.el);
    $('#tuBar').style.width=a.len?Math.min(100,a.prog/a.len*100)+'%':'0%';
    let cls='',badge='TUTOR · OK',adv='';
    if(a.L&&st.avg!=null){if(st.avg>thr(a.L)){cls='bad';badge='TUTOR · OLTRE SOGLIA'}else if(st.avg>a.L){cls='warn';badge='TUTOR · IN TOLLERANZA'}}
    if(a.manual)adv='Premi la X all\'uscita per salvare la tratta.';
    else if(!a.L)adv='Limite della tratta non noto.';
    else if(st.imp)adv='<b style="color:var(--red)">Media già oltre il limite</b>: tieni la velocità più bassa possibile.';
    else if(st.vmax!=null)adv=`Max <b>${Math.round(Math.min(st.vmax,250))} km/h</b> nel resto per chiudere entro ${a.L}`+(st.vtol&&st.vtol>st.vmax+1?` <span style="color:var(--label2)">· soglia multa ${Math.round(Math.min(st.vtol,250))}</span>`:'');
    else adv='Quasi alla fine della tratta.';
    box.className='tutor glass '+cls;$('#tuBadge').textContent=badge;$('#tuAdv').innerHTML=adv}
  function end(why){const a=Tut.act;if(!a)return;const f=App.state.fix;const st=stats();Tut.act=null;cool.set(a.t.id,f.t);
    $('#tutor').classList.add('hidden');MapView.setData('tutAct',{type:'FeatureCollection',features:[]});App.emit('layout');
    const avg=st.el>2?a.prog/st.el*3.6:0;const Lm=a.L;let ex=0;if(Lm)ex=Math.round((avg-tol(avg)-Lm)*10)/10;
    const rec={ts:Date.now(),name:a.t.name||'Tutor',len:Math.round(a.prog),secs:Math.round(st.el),avg:Math.round(avg*10)/10,L:Lm,ex,partial:a.partial,manual:a.manual,why,maxV:Math.round(a.maxV),official:a.t.src==='uff'};
    if(a.prog>300){HIST.unshift(rec);HIST=HIST.slice(0,300);Store.set('hist',HIST)}
    Voice.beep(1,520);Voice.say(`Fine tutor. Media ${Math.round(avg)}`+(Lm?(ex>0?', oltre il limite':', in regola'):''),true);
    App.emit('tutorEnd',{rec,a})}
  function saveManual(a,name,lim){const g=G.simplify(a.track,15);USER.tuts.push({id:'m'+Date.now(),n:name,l:lim,a:g[0],b:g[g.length-1],p:g,len:G.prep(g).len});Store.set('user',USER);publish()}

  /* ---------- segnalazioni e stato ---------- */
  function report(kind){const f=App.state.fix;if(!f){App.toast('Serve prima la posizione');return}
    USER.cams.push({id:'s'+Date.now(),lat:f.lat,lon:f.lon,kind,lim:L.v||0,dir:App.state.hd,status:'on',src:'user',exp:kind==='mobile'?Date.now()+4*3600e3:null});
    Store.set('user',USER);index();publish();App.toast(kind==='mobile'?'Controllo segnalato per 4 ore':'Autovelox aggiunto');Voice.buzz(15)}
  function setStatus(id,s){const o=allCams().find(c=>c.id===id)||allTuts().find(t=>t.id===id);if(!o)return;if(s===o.status)delete OVR[id];else OVR[id]=s;Store.set('ovr',OVR);publish()}
  function removeUser(id){USER.cams=USER.cams.filter(c=>c.id!==id);USER.tuts=USER.tuts.filter(t=>t.id!==id);Store.set('user',USER);index();publish()}
  function clearHist(){HIST=[];Store.set('hist',HIST)}
  // aggiornamento opzionale della zona da OpenStreetMap
  async function refreshArea(lat,lon,km=30){const dl=km/111,dn=km/(111*Math.cos(G.rad(lat)));const b=[lat-dl,lon-dn,lat+dl,lon+dn].map(x=>x.toFixed(4)).join(',');
    const q=`[out:json][timeout:90];(node["highway"="speed_camera"](${b});node["disused:highway"="speed_camera"](${b}););out body qt;relation["type"="enforcement"]["enforcement"~"^(maxspeed|average_speed)$"](${b});out geom qt;`;
    const js=await API.overpass(q,95000);const d=OSMP.process(js);const ids=new Set(d.cams.map(c=>'n'+c[0]));
    CAMS=CAMS.filter(c=>!(c.lat>=lat-dl&&c.lat<=lat+dl&&c.lon>=lon-dn&&c.lon<=lon+dn)||ids.has(c.id));const have=new Set(CAMS.map(c=>c.id));
    for(const a of d.cams){const id='n'+a[0];const o={id,lat:a[1],lon:a[2],lim:a[3]||0,dir:a[4]>=0?a[4]:null,status:a[5]?'off':'on',kind:a[6]?'tutorpt':'fixed',src:'osm'};if(have.has(id))CAMS[CAMS.findIndex(c=>c.id===id)]=o;else CAMS.push(o)}
    index();publish();return d.cams.length}

  return {load,tick,publish,stat,allCams,allTuts,nearCams,report,setStatus,removeUser,refreshArea,startManual,end,saveManual,band,tol,thr,adjLim,
    get act(){return Tut.act},get hist(){return HIST},clearHist,get info(){return dataInfo},get limit(){return L},set limit(v){L=v},hideAlert,routeLimit,CLS_FALL};
})();
