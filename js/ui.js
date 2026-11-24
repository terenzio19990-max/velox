/* Sentinella — interfaccia: schermate del pannello, ricerca, schede luogo, pianificazione, navigazione, impostazioni. */
'use strict';
const UI = App.UI = (()=>{
  const S=App.S;
  const scr=$('#screen'),scroller=$('#sheetScroll');
  let stack=[],cur=null;
  let favs=Store.get('favs',{home:null,work:null,list:[]});
  let recents=Store.get('recents',[]);
  const saveFavs=()=>Store.set('favs',favs);
  const pushRecent=p=>{recents=[{name:p.name,addr:p.addr||'',lat:p.lat,lon:p.lon,type:p.type||'',cat:p.cat||null,osm:p.osm||null}].concat(recents.filter(r=>G.dist(r.lat,r.lon,p.lat,p.lon)>30)).slice(0,15);Store.set('recents',recents)};
  const myPos=()=>App.state.fix?{lat:App.state.fix.lat,lon:App.state.fix.lon}:(MapView.map?{lat:MapView.map.getCenter().lat,lon:MapView.map.getCenter().lng}:null);
  const distTxt=p=>{const m=myPos();return m?F.km(G.dist(m.lat,m.lon,p.lat,p.lon)):''};

  /* ---------- navigazione tra schermate ---------- */
  const R={};
  function show(name,arg,{replace=false,detent}={}){if(cur&&!replace)stack.push(cur);cur={name,arg};render(detent)}
  function back(){cur=stack.pop()||{name:'home'};render()}
  function home(){stack=[];cur={name:'home'};render('peek');clearPois();selPin(null)}
  function render(detent){const r=R[cur.name];if(!r)return;const out=r(cur.arg||{});scr.innerHTML=`<div class="scr">${out.html}</div>`;scroller.scrollTop=0;
    if(out.peek!=null)Sheet.setPeek(out.peek);App.state.noHalf=!!out.noHalf;
    const d=detent||out.detent;if(d&&!(d==='peek'&&Sheet.cur==='peek'))Sheet.set(d);
    scr.querySelectorAll('[data-back]').forEach(b=>b.onclick=back);scr.querySelectorAll('[data-home]').forEach(b=>b.onclick=home);
    out.bind&&out.bind(scr)}
  const hdr=(title,sub,{backBtn=true,close=false}={})=>`<div class="hdr">${backBtn?'<button class="round" data-back aria-label="Indietro"><svg><use href="#i-back"/></svg></button>':''}<h2>${esc(title)}${sub?`<span class="sub">${sub}</span>`:''}</h2>${close?'<button class="round" data-home aria-label="Chiudi"><svg><use href="#i-x"/></svg></button>':''}</div>`;
  const item=(o)=>`<button class="item" ${o.attr||''}><span class="ic" style="background:${o.color||'var(--accent)'}">${o.icon||''}</span><span class="tx"><span class="t1 ${o.cls||''}" style="display:block">${o.t1}</span>${o.t2?`<span class="t2" style="display:block">${o.t2}</span>`:''}</span>${o.rt?`<span class="rt">${o.rt}</span>`:''}${o.chev?'<svg class="chev"><use href="#i-chev"/></svg>':''}</button>`;
  const catById=k=>App.CATS.find(c=>c.k===k);
  const placeIcon=p=>{const c=p.cat?catById(p.cat):App.catOf(p.tags);return c?{color:c.c,icon:App.catIcon(c,18)}:{color:'#FF3B30',icon:'<svg><use href="#i-pin"/></svg>'}};

  /* ---------- HOME ---------- */
  R.home=()=>{const nav=App.state.navigating;
    const favList=[
      {k:'home',l:'Casa',i:'i-home',c:'#007AFF',p:favs.home},{k:'work',l:'Lavoro',i:'i-work',c:'#A2845E',p:favs.work},
      ...favs.list.map((p,i)=>({k:'f'+i,l:p.name,i:'i-star',c:'#FF9500',p}))];
    const park=Store.get('park',null);
    return {peek:78,detent:'peek',html:`
      <div class="row-top"><label class="search" id="hSearch"><svg><use href="#i-search"/></svg><input id="hq" placeholder="Cerca luoghi, indirizzi, benzinai" readonly></label>
      <button class="avatar" id="hSet" aria-label="Impostazioni"><svg><use href="#i-gear"/></svg></button></div>
      <div class="sec"><h3>Preferiti</h3><button class="link" id="hFavEdit">Modifica</button></div>
      <div class="favs">${favList.map(f=>`<button class="fav" data-fav="${f.k}"><span class="fi" style="background:${f.c}"><svg><use href="#${f.i}"/></svg></span><span>${esc(f.l)}</span><small>${f.p?esc(distTxt(f.p)):'Aggiungi'}</small></button>`).join('')}
        <button class="fav" id="hFavAdd"><span class="fi" style="background:var(--fill);color:var(--accent)"><svg><use href="#i-plus"/></svg></span><span>Aggiungi</span><small>&nbsp;</small></button></div>
      <div class="sec"><h3>Trova nelle vicinanze</h3></div>
      <div class="cats">${App.CATS.slice(0,12).map(c=>`<button class="cat" data-cat="${c.k}"><span class="ci" style="background:${c.c}">${App.catIcon(c)}</span>${esc(c.l)}</button>`).join('')}</div>
      <div class="sec"><h3>Guida</h3></div>
      <div class="group">
        ${item({attr:'id="hDrive"',color:App.state.driving?'var(--red)':'var(--green)',icon:'<svg><use href="#i-car"/></svg>',t1:App.state.driving?'Termina la guida':'Avvia la guida',t2:App.state.driving?'Autovelox, tutor e limiti attivi':'Autovelox, tutor e limiti senza destinazione',chev:true})}
        ${item({attr:'id="hTutor"',color:'#FF9500',icon:'<b style="font-size:15px">T</b>',t1:Guard.act?'Termina tutor':'Tutor manuale',t2:'Misura la media su una tratta che scegli tu',chev:true})}
        ${item({attr:'id="hReport"',color:'#007AFF',icon:'<svg><use href="#i-alert"/></svg>',t1:'Segnala',t2:'Autovelox o controllo qui',chev:true})}
        ${item({attr:'id="hPark"',color:'#5856D6',icon:'<b style="font-size:17px">P</b>',t1:park?'Torna all\'auto':'Salva il parcheggio',t2:park?`Parcheggiata ${F.date(park.ts)}`:'Ricorda dove hai lasciato l\'auto',chev:true})}
        ${item({attr:'id="hCams"',color:'#E1251B',icon:'<svg><use href="#i-camera"/></svg>',t1:'Autovelox e tutor vicini',t2:`${Guard.info.n.toLocaleString('it-IT')} autovelox e ${Guard.info.t} tutor in archivio`,chev:true})}
        ${Store.get('trips',[]).length?item({attr:'id="hTrips"',color:'#34C759',icon:'<svg><use href="#i-route"/></svg>',t1:'I miei viaggi',t2:Store.get('trips',[]).length+' viaggi salvati',chev:true}):''}
        ${item({attr:'id="hHist"',color:'#8E8E93',icon:'<svg><use href="#i-clock"/></svg>',t1:'Storico tutor',t2:Guard.hist.length?`${Guard.hist.length} passaggi registrati`:'Nessun passaggio',chev:true})}
      </div>
      ${recents.length?`<div class="sec"><h3>Recenti</h3><button class="link" id="hRecClear">Cancella</button></div><div class="group">${recents.slice(0,8).map((p,i)=>{const pi=placeIcon(p);return item({attr:`data-rec="${i}"`,color:pi.color,icon:pi.icon,t1:esc(p.name),t2:esc([p.type,p.addr].filter(Boolean).join(' · ')),rt:esc(distTxt(p))})}).join('')}</div>`:''}
      <p class="note">Mappa © OpenFreeMap, © OpenStreetMap. Percorsi Valhalla (FOSSGIS). Dati autovelox ${esc(Guard.info.date)}.</p>`,
      bind(r){$('#hSearch').onclick=()=>show('search');$('#hq').onfocus=e=>{e.target.blur();show('search')};$('#hSet').onclick=()=>show('settings');
        r.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>show('results',{cat:b.dataset.cat}));
        r.querySelectorAll('[data-fav]').forEach(b=>b.onclick=()=>{const k=b.dataset.fav;const p=k==='home'?favs.home:k==='work'?favs.work:favs.list[+k.slice(1)];if(p)openPlace(p);else show('search',{pickFav:k})});
        $('#hFavAdd').onclick=()=>show('search',{pickFav:'new'});$('#hFavEdit').onclick=()=>show('favs');
        r.querySelectorAll('[data-rec]').forEach(b=>b.onclick=()=>openPlace(recents[+b.dataset.rec]));
        const rc=$('#hRecClear');if(rc)rc.onclick=()=>{recents=[];Store.set('recents',recents);render()};
        $('#hDrive').onclick=()=>{App.toggleDrive();render()};$('#hTutor').onclick=()=>{Guard.act?Guard.end('manuale'):Guard.startManual();render()};
        $('#hReport').onclick=()=>show('report');const ht=$('#hTrips');if(ht)ht.onclick=()=>show('trips');$('#hCams').onclick=()=>show('cams');$('#hHist').onclick=()=>show('hist');
        $('#hPark').onclick=()=>{const pk=Store.get('park',null);if(pk)openPlace({name:'La tua auto',type:'Parcheggio',addr:'Salvato '+F.date(pk.ts),lat:pk.lat,lon:pk.lon,cat:'parking',isCar:true});else savePark()}}}};
  function savePark(){const f=App.state.fix;if(!f){App.toast('Serve la posizione per salvare il parcheggio');return}Store.set('park',{lat:f.lat,lon:f.lon,ts:Date.now()});App.toast('Parcheggio salvato');Voice.buzz(15);render()}

  /* ---------- RICERCA ---------- */
  let sTimer=0,sReq=0;
  R.search=(a)=>{const title=a.pickFav?(a.pickFav==='home'?'Imposta Casa':a.pickFav==='work'?'Imposta Lavoro':'Aggiungi ai preferiti'):a.addStop!=null?'Aggiungi una tappa':a.setStop!=null?'Scegli il punto':'';
    return {detent:'full',html:`${title?hdr(title):''}
      <div class="row-top"><label class="search" id="sBox"><svg><use href="#i-search"/></svg><input id="sq" placeholder="Cerca luoghi o indirizzi" autocomplete="off" enterkeyhint="search"><button class="clear" id="sClr" aria-label="Cancella"><svg><use href="#i-x"/></svg></button></label>${title?'':'<button class="btn" style="background:none;padding:0 4px" data-back>Annulla</button>'}</div>
      <div id="sOut" style="margin-top:14px"></div>`,
      bind(){const q=$('#sq'),out=$('#sOut'),box=$('#sBox');setTimeout(()=>q.focus(),60);
        const idle=()=>{out.innerHTML=`<div class="chips">${App.CATS.map(c=>`<button class="chip" data-cat="${c.k}"><span style="color:${c.c};display:flex">${App.catIcon(c,16,c.c)}</span>${esc(c.l)}</button>`).join('')}</div>
          ${a.setStop!=null||a.addStop!=null?`<div class="group" style="margin-top:12px">${item({attr:'id="sHere"',icon:'<svg><use href="#i-locate-on"/></svg>',t1:'La mia posizione'})}</div>`:''}
          ${recents.length?`<div class="sec"><h3>Recenti</h3></div><div class="group">${recents.slice(0,10).map((p,i)=>{const pi=placeIcon(p);return item({attr:`data-rec="${i}"`,color:pi.color,icon:pi.icon,t1:esc(p.name),t2:esc(p.addr||p.type),rt:esc(distTxt(p))})}).join('')}</div>`:''}`;
          out.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>show('results',{cat:b.dataset.cat,ctx:a},{replace:true}));
          out.querySelectorAll('[data-rec]').forEach(b=>b.onclick=()=>pick(recents[+b.dataset.rec],a));
          const sh=$('#sHere');if(sh)sh.onclick=()=>pick({gps:true,name:'La mia posizione'},a)};
        idle();
        q.oninput=()=>{box.classList.toggle('has',!!q.value);clearTimeout(sTimer);const v=q.value.trim();if(!v){idle();return}
          // coordinate
          const m=v.match(/^\s*(-?\d{1,2}[.,]\d+)\s*[,; ]\s*(-?\d{1,3}[.,]\d+)\s*$/);if(m){const lat=+m[1].replace(',','.'),lon=+m[2].replace(',','.');out.innerHTML=`<div class="group">${item({attr:'id="sCoord"',color:'#FF3B30',icon:'<svg><use href="#i-pin"/></svg>',t1:`${lat.toFixed(5)}, ${lon.toFixed(5)}`,t2:'Coordinate'})}</div>`;$('#sCoord').onclick=()=>pick({name:'Punto sulla mappa',addr:`${lat.toFixed(5)}, ${lon.toFixed(5)}`,lat,lon},a);return}
          const catMatch=App.CATS.filter(c=>c.l.toLowerCase().startsWith(v.toLowerCase())||(c.k==='fuel'&&/^(benz|distr|carbur|gas)/i.test(v))||(c.k==='food'&&/^(pizz|risto|mangi|tratt)/i.test(v))||(c.k==='cafe'&&/^(caff|bar)/i.test(v)));
          out.innerHTML=`${catMatch.length?`<div class="group" style="margin-bottom:12px">${catMatch.map(c=>item({attr:`data-cat="${c.k}"`,color:c.c,icon:App.catIcon(c,18),t1:esc(c.l)+' vicino a te',chev:true})).join('')}</div>`:''}<div class="spin"></div>`;
          out.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>show('results',{cat:b.dataset.cat,ctx:a},{replace:true}));
          sTimer=setTimeout(async()=>{const id=++sReq;try{const res=await API.search(v,myPos(),15);if(id!==sReq)return;
            const list=res.map(p=>({p,d:myPos()?G.dist(myPos().lat,myPos().lon,p.lat,p.lon):0}));
            const html=list.length?`<div class="group">${list.map((x,i)=>{const pi=placeIcon(x.p);return item({attr:`data-i="${i}"`,color:pi.color,icon:pi.icon,t1:esc(x.p.name),t2:esc([x.p.type,x.p.addr].filter(Boolean).join(' · ')),rt:x.d?F.km(x.d):''})}).join('')}</div>`:'<div class="empty">Nessun risultato. Prova con il nome del comune.</div>';
            const sp=out.querySelector('.spin');if(sp)sp.outerHTML=html;else out.insertAdjacentHTML('beforeend',html);
            out.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>pick(list[+b.dataset.i].p,a))}
          catch(e){if(id===sReq){const sp=out.querySelector('.spin');if(sp)sp.outerHTML='<div class="empty">Ricerca non disponibile: controlla la connessione.</div>'}}},260)};
        q.onkeydown=e=>{if(e.key==='Enter')q.blur()};
        $('#sClr').onclick=e=>{e.preventDefault();q.value='';q.oninput();q.focus()}}}};
  function pick(p,ctx){ctx=ctx||{};
    if(ctx.pickFav){if(p.gps){App.toast('Scegli un luogo preciso');return}const fp={name:p.name,addr:p.addr,lat:p.lat,lon:p.lon,type:p.type,cat:p.cat,osm:p.osm};
      if(ctx.pickFav==='home'){favs.home=Object.assign(fp,{name:'Casa',addr:p.addr||p.name})}else if(ctx.pickFav==='work'){favs.work=Object.assign(fp,{name:'Lavoro',addr:p.addr||p.name})}else favs.list.push(fp);saveFavs();App.toast('Preferito salvato');home();return}
    if(ctx.addStop!=null){if(!p.gps)pushRecent(p);Plan.addStop(p.gps?{name:'La mia posizione',gps:true}:p,ctx.addStop);openPlan();return}
    if(ctx.setStop!=null){Plan.st.stops[ctx.setStop]=p.gps?{name:'La mia posizione',gps:true}:{name:p.name,lat:p.lat,lon:p.lon,addr:p.addr};Plan.st.ver++;if(!p.gps)pushRecent(p);openPlan();return}
    openPlace(p)}

  /* ---------- RISULTATI PER CATEGORIA ---------- */
  let poiList=[];
  function clearPois(){poiList=[];MapView.setData('pois',{type:'FeatureCollection',features:[]})}
  function showPois(list,cat){poiList=list;MapView.setData('pois',{type:'FeatureCollection',features:list.map(p=>({type:'Feature',geometry:{type:'Point',coordinates:[p.lon,p.lat]},properties:{id:p.id,c:p.cat||cat,n:p.name}}))})}
  App.on('poiTap',id=>{const p=poiList.find(x=>x.id===id);if(p)openPlace(p,{keepPois:true})});
  R.results=(a)=>{const c=catById(a.cat);const route=App.state.navigating?Nav.route:Plan.route;const along=a.along&&route;
    return {detent:'half',html:`${hdr(c.l,along?'Lungo il percorso':'Vicino a '+(App.state.fix?'te':'centro mappa'))}
      ${route?`<div class="seg" style="margin-bottom:12px"><button class="${along?'':'on'}" data-m="near">Vicino</button><button class="${along?'on':''}" data-m="along">Lungo il percorso</button></div>`:''}
      <div id="rOut"><div class="spin"></div></div>`,
      async bind(){scr.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{cur.arg=Object.assign({},a,{along:b.dataset.m==='along'});render()});
        const out=$('#rOut');const me=myPos();
        try{let list;if(along){const pts=G.simplify(route.coords,150);const step=Math.ceil(pts.length/70);list=await API.poisAlong(c,pts.filter((p,i)=>i%step===0||i===pts.length-1),c.k==='fuel'||c.k==='charge'||c.k==='services'?600:400)}
          else list=await API.poisNear(c,me.lat,me.lon,c.k==='hosp'||c.k==='services'?15000:4000);
          list.forEach(p=>{p.cat=p.cat||c.k;p.d=me?G.dist(me.lat,me.lon,p.lat,p.lon):0;if(along&&route){const pr=G.proj(p.lat,p.lon,G.prep(route.coords));p.along=pr.along;p.off=pr.d}});
          list.sort((x,y)=>along?(x.along-y.along):(x.d-y.d));list=list.slice(0,60);
          if(!list.length){out.innerHTML='<div class="empty">Nessun risultato qui vicino.</div>';return}
          showPois(list,c.k);
          out.innerHTML=`<div class="group">${list.map((p,i)=>item({attr:`data-i="${i}"`,color:c.c,icon:App.catIcon(c,18),t1:esc(p.name),t2:esc([p.tags.brand&&p.tags.brand!==p.name?p.tags.brand:'',p.addr,p.tags.opening_hours?fmtHours(p.tags.opening_hours):''].filter(Boolean).join(' · ')||p.type),rt:along?`tra ${F.km(Math.max(0,p.along-(App.state.navigating?Nav.along():0)))}`:F.km(p.d)})).join('')}</div>`;
          out.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>openPlace(list[+b.dataset.i],{keepPois:true}));
          let bb=[[180,90],[-180,-90]];for(const p of list.slice(0,20)){bb[0][0]=Math.min(bb[0][0],p.lon);bb[0][1]=Math.min(bb[0][1],p.lat);bb[1][0]=Math.max(bb[1][0],p.lon);bb[1][1]=Math.max(bb[1][1],p.lat)}
          if(!App.state.navigating&&!along){if(me){bb[0][0]=Math.min(bb[0][0],me.lon);bb[0][1]=Math.min(bb[0][1],me.lat);bb[1][0]=Math.max(bb[1][0],me.lon);bb[1][1]=Math.max(bb[1][1],me.lat)}MapView.setCam('free');MapView.fit(bb)}}
        catch(e){out.innerHTML=`<div class="empty">${navigator.onLine===false?'Sei offline: i punti di interesse servono la connessione.':'Nessun risultato trovato nei dintorni, oppure i servizi sono momentaneamente lenti.'}<br><br><button class="btn" id="rRetry">Riprova</button></div>`;$('#rRetry').onclick=()=>render()}}}};
  function fmtHours(h,full){if(h==='24/7')return 'Aperto 24 ore';const t=h.replace(/\bMo\b/g,'Lun').replace(/\bTu\b/g,'Mar').replace(/\bWe\b/g,'Mer').replace(/\bTh\b/g,'Gio').replace(/\bFr\b/g,'Ven').replace(/\bSa\b/g,'Sab').replace(/\bSu\b/g,'Dom').replace(/\bPH\b/g,'Festivi').replace(/\boff\b/g,'chiuso').replace(/,/g,', ');
    if(full)return t.split(/\s*;\s*/).join('\n');return t.length>30?t.split(/\s*;\s*/)[0]+'…':t}

  /* ---------- SCHEDA LUOGO ---------- */
  let pin=null;
  function selPin(p){if(pin){pin.remove();pin=null}if(!p||!MapView.map)return;const el=document.createElement('div');el.innerHTML='<svg class="pin" viewBox="0 0 34 44"><path d="M17 43s-14-12.4-14-23a14 14 0 0128 0c0 10.6-14 23-14 23z" fill="#FF3B30" stroke="#fff" stroke-width="2.5"/><circle cx="17" cy="20" r="5.5" fill="#fff"/></svg>';pin=new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([p.lon,p.lat]).addTo(MapView.map)}
  function openPlace(p,o={}){if(!o.keepPois)clearPois();selPin(p);MapView.setCam('free');MapView.flyTo(p.lat,p.lon);show('place',{p});if(!p.isCar)pushRecent(p)}
  R.place=({p})=>{const isFav=favs.list.some(f=>G.dist(f.lat,f.lon,p.lat,p.lon)<20)||(favs.home&&G.dist(favs.home.lat,favs.home.lon,p.lat,p.lon)<20)||(favs.work&&G.dist(favs.work.lat,favs.work.lon,p.lat,p.lon)<20);
    const planning=Plan.st.stops.length>1&&!App.state.navigating;
    return {detent:'half',html:`<div class="hdr"><h2>${esc(p.name)}<span class="sub">${esc([p.type,distTxt(p)].filter(Boolean).join(' · '))}</span></h2><button class="round" data-back aria-label="Chiudi"><svg><use href="#i-x"/></svg></button></div>
      <div class="actions">
        <button class="act primary" id="pGo"><svg><use href="#i-car"/></svg><span id="pEta">Indicazioni</span></button>
        <button class="act" id="pStop"><svg><use href="#i-plus"/></svg>${App.state.navigating?'Aggiungi tappa':planning?'Aggiungi tappa':'Tappa'}</button>
        <button class="act" id="pFav"><svg><use href="#${isFav?'i-star':'i-star-o'}"/></svg>${isFav?'Salvato':'Salva'}</button>
        <button class="act" id="pShare"><svg><use href="#i-share"/></svg>Condividi</button>
      </div>
      <div class="group" id="pInfo">${p.addr?`<div class="kv"><span>Indirizzo</span><b>${esc(p.addr)}</b></div>`:''}<div class="kv"><span>Coordinate</span><b>${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</b></div></div>
      <div id="pTags"></div>
      ${p.isCar?'<button class="btn wide" id="pClearPark" style="margin-top:12px;color:var(--red)">Elimina il parcheggio salvato</button>':''}`,
      async bind(){
        $('#pGo').onclick=()=>{if(p.isCar){Plan.reset({name:'La tua auto',lat:p.lat,lon:p.lon});openPlan(true)}else{Plan.reset({name:p.name,lat:p.lat,lon:p.lon,addr:p.addr});openPlan()}};
        $('#pStop').onclick=()=>{if(App.state.navigating){addStopDuringNav(p);return}if(Plan.st.stops.length<2)Plan.reset();Plan.addStop(p,Plan.st.stops.length>1?Plan.st.stops.length-1:undefined);openPlan()};
        $('#pFav').onclick=()=>{const i=favs.list.findIndex(f=>G.dist(f.lat,f.lon,p.lat,p.lon)<20);if(i>=0)favs.list.splice(i,1);else favs.list.push({name:p.name,addr:p.addr,lat:p.lat,lon:p.lon,type:p.type,cat:p.cat,osm:p.osm});saveFavs();render();Voice.buzz(10)};
        $('#pShare').onclick=()=>share(p.name,`${p.name}${p.addr?' — '+p.addr:''}\nhttps://www.openstreetmap.org/?mlat=${p.lat.toFixed(6)}&mlon=${p.lon.toFixed(6)}#map=18/${p.lat.toFixed(5)}/${p.lon.toFixed(5)}`);
        const cp=$('#pClearPark');if(cp)cp.onclick=()=>{Store.del('park');selPin(null);home()};
        // tempo di guida stimato
        const f=App.state.fix;if(f&&!p.isCar){API.route([{lat:f.lat,lon:f.lon},{lat:p.lat,lon:p.lon}],{}).then(r=>{const e=$('#pEta');if(e&&r[0])e.textContent=F.dur(r[0].time)}).catch(()=>{})}
        // dettagli da OSM
        let tags=p.tags&&Object.keys(p.tags).length>2?p.tags:null;if(!tags&&p.osm)tags=await API.osmTags(p.osm);if(!tags)return;
        const rows=[];const add=(l,v)=>v&&rows.push(`<div class="kv"><span>${l}</span><b>${v}</b></div>`);
        if(tags.brand&&tags.brand!==p.name)add('Marchio',esc(tags.brand));
        if(tags.opening_hours)add('Orari',esc(fmtHours(tags.opening_hours,true)).replace(/\n/g,'<br>'));
        const ph=tags.phone||tags['contact:phone'];if(ph)add('Telefono',`<a href="tel:${esc(ph.replace(/\s/g,''))}">${esc(ph)}</a>`);
        const web=tags.website||tags['contact:website'];if(web)add('Sito',`<a href="${esc(/^https?:/.test(web)?web:'https://'+web)}" target="_blank" rel="noopener">${esc(web.replace(/^https?:\/\/(www\.)?/,'').replace(/\/$/,'').slice(0,32))}</a>`);
        const fuels=Object.keys(tags).filter(k=>/^fuel:/.test(k)&&tags[k]==='yes').map(k=>({diesel:'Gasolio',octane_95:'Benzina',octane_98:'Benzina 98',lpg:'GPL',cng:'Metano',adblue:'AdBlue',HGV_diesel:'Gasolio camion',e85:'E85',hydrogen:'Idrogeno'}[k.slice(5)]||null)).filter(Boolean);
        if(fuels.length)add('Carburanti',esc([...new Set(fuels)].join(', ')));
        if(tags['self_service'])add('Self service',tags.self_service==='yes'?'Sì':'No');
        const sockets=Object.keys(tags).filter(k=>/^socket:[^:]+$/.test(k)).map(k=>k.slice(7).replace('type2','Tipo 2').replace('_combo',' CCS').replace('chademo','CHAdeMO')+(isFinite(+tags[k])?' ×'+tags[k]:''));
        if(sockets.length)add('Prese',esc(sockets.join(', ')));if(tags.capacity)add('Posti',esc(tags.capacity));if(tags.fee)add('A pagamento',tags.fee==='no'?'No':'Sì');
        if(tags.cuisine)add('Cucina',esc(tags.cuisine.replace(/_/g,' ').replace(/;/g,', ')));if(tags.stars)add('Stelle',esc(tags.stars));if(tags.wheelchair)add('Accessibile',tags.wheelchair==='yes'?'Sì':tags.wheelchair==='limited'?'In parte':'No');
        if(rows.length)$('#pTags').innerHTML=`<div class="group" style="margin-top:12px">${rows.join('')}</div>`}}};
  async function share(title,text){try{if(navigator.share){await navigator.share({title,text});return}}catch(e){if(e&&e.name==='AbortError')return}try{await navigator.clipboard.writeText(text);App.toast('Copiato negli appunti')}catch(e){App.toast('Condivisione non disponibile')}}
  App.on('longPress',async ll=>{const p={name:'Punto sulla mappa',type:'Segnaposto',addr:'',lat:ll.lat,lon:ll.lng};openPlace(p);try{const r=await API.reverse(ll.lat,ll.lng);if(r&&cur.name==='place'&&cur.arg.p===p){p.addr=[r.name!==r.addr?r.name:'',r.addr].filter(Boolean).join(', ');p.name=r.name&&r.name!=='Luogo'?r.name:'Punto sulla mappa';render()}}catch(e){}});

  /* ---------- PIANIFICAZIONE ---------- */
  function openPlan(walk){selPin(null);clearPois();if(!cur||cur.name!=='plan')planTab='over';cur&&cur.name!=='plan'?show('plan',{walk}):render();Plan.compute()}
  App.on('plan',()=>{if(cur&&cur.name==='plan')renderPlanBody()});
  let planTab='over';
  R.plan=(a)=>{if(a.tab)planTab=a.tab;return {detent:'half',html:`${hdr('Il tuo viaggio','',{backBtn:false,close:true})}
      <div class="group stops" id="plStops"></div>
      <div style="display:flex;gap:8px;margin-top:10px"><button class="btn" id="plAdd" style="flex:1"><svg><use href="#i-plus"/></svg>Aggiungi tappa</button>${Plan.st.stops.length>3?'<button class="btn" id="plOpt"><svg><use href="#i-magic"/></svg>Ottimizza</button>':''}</div>
      <div class="chips" style="margin-top:12px" id="plOpts"></div>
      <div class="seg" style="margin:6px 0 12px"><button data-tab="over" class="${planTab==='over'?'on':''}">Panoramica</button><button data-tab="itin" class="${planTab==='itin'?'on':''}">Itinerario</button></div>
      <div id="plBody"></div>`,
    bind(){renderStops();renderOpts();renderPlanBody();$('#plAdd').onclick=()=>show('search',{addStop:Plan.st.stops.length});const o=$('#plOpt');if(o)o.onclick=()=>Plan.optimize();
      scr.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{planTab=b.dataset.tab;scr.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('on',x===b));renderPlanBody()})}}};
  function renderStops(){const box=$('#plStops');if(!box)return;const n=Plan.st.stops.length;
    box.innerHTML=Plan.st.stops.map((s,i)=>`<div class="stop"><span class="dot ${i===0?'':i===n-1?'end':'mid'}"></span><button class="sn" data-set="${i}" style="text-align:left">${esc(i===0&&s.gps?'La mia posizione':s.name)}</button>
      ${n>2?`<button class="mini" data-up="${i}" aria-label="Sposta su"><svg><use href="#i-up"/></svg></button>`:''}${n>2||i>0?`<button class="mini" data-del="${i}" aria-label="Rimuovi"><svg><use href="#i-x"/></svg></button>`:''}</div>`).join('');
    box.querySelectorAll('[data-set]').forEach(b=>b.onclick=()=>show('search',{setStop:+b.dataset.set}));
    box.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>{const i=+b.dataset.up;Plan.move(i,i===0?1:-1);renderStops();Plan.compute()});
    box.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{Plan.removeStop(+b.dataset.del);if(Plan.st.stops.length<2){home();Plan.clearMap();return}render();Plan.compute()})}
  function renderOpts(){const box=$('#plOpts');if(!box)return;const v=App.vehicle();
    box.innerHTML=`<button class="chip" id="oVeh"><svg><use href="#i-car"/></svg>${esc(v.name)}</button>
      <button class="chip ${S.avoidTolls?'on':''}" data-o="avoidTolls">Evita pedaggi</button><button class="chip ${S.avoidHighways?'on':''}" data-o="avoidHighways">Evita autostrade</button><button class="chip ${S.avoidFerries?'on':''}" data-o="avoidFerries">Evita traghetti</button>`;
    box.querySelectorAll('[data-o]').forEach(b=>b.onclick=()=>{S[b.dataset.o]=!S[b.dataset.o];App.saveS();renderOpts();Plan.compute()});
    $('#oVeh').onclick=()=>pickVehicle(()=>{renderOpts();Plan.st.routes.forEach(r=>r.cost=Plan.cost(r));renderPlanBody()})}
  // conteggio autovelox e tutor sul percorso
  function guardOnRoute(r){if(r._guard)return r._guard;const P=G.prep(r.coords);const seen=new Set();const step=Math.max(1,Math.floor(P.g.length/300));let nCam=0;
    for(let i=0;i<P.g.length;i+=step){for(const cm of Guard.nearCams(P.g[i][0],P.g[i][1],0)){if(seen.has(cm.id)||Guard.stat(cm)==='off'||cm.kind==='tutorpt')continue;seen.add(cm.id);const pr=G.proj(cm.lat,cm.lon,P,Math.max(0,i-step*3),i+step*3+2);if(pr.d<35)nCam++}}
    let nTut=0;for(const t of Guard.allTuts()){if(Guard.stat(t)==='off')continue;if(t.A[0]<P.b[0]-0.02||t.A[0]>P.b[2]+0.02||t.A[1]<P.b[1]-0.02||t.A[1]>P.b[3]+0.02)continue;const a=G.proj(t.A[0],t.A[1],P),bb=G.proj(t.B[0],t.B[1],P);if(a.d<120&&bb.d<120&&bb.along>a.along)nTut++}
    return r._guard={nCam,nTut}}
  // punti del percorso ogni ~2 ore di guida (per le pause)
  function breakPoints(r,every=7200){const out=[];let acc=0,next=every;for(const m of r.man){if(acc+m.time>=next&&m.len>0){const frac=(next-acc)/m.time;const P=G.prep(r.coords.slice(m.i,(m.ie||m.i)+1));const p=P.len?G.pointAt(P,P.len*frac):{lat:r.coords[m.i][0],lon:r.coords[m.i][1]};out.push({lat:p.lat,lon:p.lon,at:next});next+=every}acc+=m.time}return out}
  function rangeKm(v){const tank=v.tank||(v.fuel==='elettrica'?55:45);const mix=(v.urb*0.2+v.ext*0.4+v.aut*0.4)||6;return tank/mix*100}
  function departTs(){return Plan.st.depart||Date.now()}
  function renderPlanBody(){const b=$('#plBody');if(!b)return;const st=Plan.st;
    if(st.loading){b.innerHTML='<div class="spin"></div>';return}
    if(st.err){b.innerHTML=`<div class="empty">${esc(st.err)}<br><br><button class="btn" id="plRetry">Riprova</button></div>`;$('#plRetry').onclick=()=>Plan.compute();return}
    if(!st.routes.length){b.innerHTML='';return}
    if(planTab==='itin')renderItin(b);else renderOver(b)}
  function renderOver(b){const st=Plan.st;const r=Plan.route,c=r.cost,ppl=Math.max(1,S.people||1),v=App.vehicle();const g=guardOnRoute(r);
    const stopsMin=st.stops.slice(1,-1).reduce((a,s)=>a+(s.stay||0),0);const total=r.time+stopsMin*60;const arr=departTs()+total*1000;
    const drives=r.time/3600;const nBreak=Math.floor(drives/2);const range=rangeKm(v);const needFuel=r.dist/1000>range*0.85;
    const tips=[];
    if(nBreak>0&&!st.stops.slice(1,-1).length)tips.push(['#FF9500','<svg><use href="#i-clock"/></svg>',`Ti consiglio ${nBreak} ${nBreak===1?'pausa':'pause'}`,'Una sosta ogni 2 ore di guida. Le trovi in «Itinerario».']);
    if(needFuel)tips.push(['#FF9500',App.catIcon(catById('fuel'),18),'Serve un rifornimento',`Con un pieno fai circa ${Math.round(range)} km: il viaggio è di ${F.km(r.dist)}.`]);
    if(c.tollKm)tips.push(['#5856D6','<svg><use href="#i-euro"/></svg>',`${F.km(c.tollKm*1000)} di autostrada a pagamento`,`Circa ${F.eur(c.toll)} di pedaggio. Senza pedaggi: tocca «Evita pedaggi».`]);
    if(g.nTut)tips.push(['#FF9500','<b style="font-size:14px">T</b>',`${g.nTut} ${g.nTut===1?'tratta':'tratte'} con tutor`,'Ti mostro la media in tempo reale e quanto puoi andare per restare in regola.']);
    const arrH=new Date(arr).getHours();if(arrH>=22||arrH<6)tips.push(['#1C3F94','<svg><use href="#i-alert"/></svg>','Arrivo di notte','Dalle 22 alle 7 le multe per velocità aumentano di un terzo.']);
    const tile=(l,v2,sub)=>`<div class="tile"><span>${l}</span><b>${v2}</b>${sub?`<small>${sub}</small>`:''}</div>`;
    b.innerHTML=`<div class="routes">${st.routes.map((rr,i)=>`<button class="rcard ${i===st.sel?'on':''}" data-r="${i}">
        <div class="rc-top"><span class="rc-time">${F.dur(rr.time)}</span><span class="rc-dist">${F.km(rr.dist)}</span><span class="rc-cost">${F.eur(rr.cost.total)}</span></div>
        <div class="rc-via">${rr.via.length?'via '+esc(rr.via.join(', ')):''}</div>
        <div class="rc-mid">${rr.tags.map(t=>`<span class="tag ${t[1]}">${esc(t[0])}</span>`).join('')}</div></button>`).join('')}</div>
      <div class="sec"><h3>Il viaggio in breve</h3></div>
      <div class="tiles">${tile('Partenza',st.depart?F.clock(st.depart):'Adesso')}${tile('Arrivo',F.clock(arr),stopsMin?`con ${stopsMin} min di soste`:'')}
        ${tile('Guida',F.dur(r.time),F.km(r.dist))}${tile('Costo totale',F.eur(c.total),ppl>1?F.eur(c.per)+' a testa':'')}
        ${tile(esc(c.fuelLabel),F.eur(c.fuel),`${F.n(c.qty,1)} ${c.unit}`)}${tile('Pedaggi',c.tollKm?F.eur(c.toll):'Nessuno',c.tollKm?F.km(c.tollKm*1000):'')}
        ${tile('Autovelox',g.nCam,'sul percorso')}${tile('Tutor',g.nTut,'tratte')}${tile('Autostrada',F.km(c.hwKm*1000),Math.round(c.hwKm*1000/r.dist*100)+'% del viaggio')}${tile('CO₂',F.n(c.co2,1)+' kg','stimata')}</div>
      ${tips.length?`<div class="sec"><h3>Consigli</h3></div><div class="group">${tips.map(t=>`<div class="item" style="align-items:flex-start"><span class="ic" style="background:${t[0]}">${t[1]}</span><span class="tx"><span class="t1" style="display:block;white-space:normal;font-weight:600">${t[2]}</span><span class="t2" style="display:block;white-space:normal">${t[3]}</span></span></div>`).join('')}</div>`:''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px"><button class="btn big" id="plItin">Pianifica il viaggio</button><button class="btn green big" id="plGo">Vai</button></div>
      <button class="btn wide" id="plSim" style="margin-top:8px">Simula il percorso</button>
      <div class="sec"><h3>Lungo il percorso</h3></div>
      <div class="chips">${['fuel','charge','services','food','cafe','parking','hotel'].map(k=>{const cc=catById(k);return `<button class="chip" data-along="${k}"><span style="color:${cc.c};display:flex">${App.catIcon(cc,16,cc.c)}</span>${esc(cc.l)}</button>`}).join('')}</div>
      <p class="note">Tempi senza traffico in tempo reale. Pedaggi stimati con la tariffa media di ${F.n(App.TOLL[v.cls]*100,1)} € ogni 100 km (classe ${v.cls}): l'importo reale può variare del 10–15%.</p>`;
    bindCommon(b);$('#plItin').onclick=()=>{planTab='itin';scr.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('on',x.dataset.tab==='itin'));renderPlanBody();scroller.scrollTop=0}}
  function bindCommon(b){b.querySelectorAll('[data-r]').forEach(x=>x.onclick=()=>{Plan.select(+x.dataset.r)});
    const go=$('#plGo');if(go)go.onclick=startNav;const sim=$('#plSim');if(sim)sim.onclick=()=>{App.state.simReady=true;const r=Plan.route;startNav();App.simulate(r)};
    b.querySelectorAll('[data-along]').forEach(x=>x.onclick=()=>show('results',{cat:x.dataset.along,along:true}))}
  function renderItin(b){const st=Plan.st;const r=Plan.route;const v=App.vehicle();const n=st.stops.length;
    // tempi e costi per tratto
    const legs=r.legs.map((L,i)=>{const ms=r.man.filter(m=>m.leg===i);const sub={man:ms,time:ms.reduce((a,m)=>a+m.time,0)};const c=Plan.cost(sub,v);return {dist:ms.reduce((a,m)=>a+m.len,0),time:sub.time,cost:c}});
    let t=departTs();const rows=[];
    st.stops.forEach((s,i)=>{if(i>0){const L=legs[i-1]||{dist:0,time:0,cost:{total:0,toll:0,tollKm:0}};
        rows.push(`<div class="tl-leg"><span class="tl-line"></span><span>${F.dur(L.time)} · ${F.km(L.dist)} · ${F.eur(L.cost.total)}${L.cost.tollKm?` <span class="tag orange">pedaggio ${F.eur(L.cost.toll)}</span>`:''}</span></div>`);t+=L.time*1000}
      const last=i===n-1,first=i===0;const name=first&&s.gps?'La mia posizione':s.name;const arr=t;if(!first&&!last)t+=(s.stay||0)*60000;
      rows.push(`<div class="tl-stop"><span class="tl-dot ${first?'start':last?'end':''}">${first||last?'':i}</span><div class="tl-tx"><b>${esc(name)}</b>
        <span>${first?'Partenza alle '+F.clock(arr):last?'Arrivo alle '+F.clock(arr):`Arrivo ${F.clock(arr)} · riparti ${F.clock(t)}`}</span>
        ${!first&&!last?`<div class="tl-stay"><button class="mini" data-stay="${i}" data-d="-5" aria-label="Meno">−</button><span>Sosta ${s.stay||0} min</span><button class="mini" data-stay="${i}" data-d="5" aria-label="Più">+</button></div>`:''}</div></div>`)});
    const stopsMin=st.stops.slice(1,-1).reduce((a,s)=>a+(s.stay||0),0);
    const dep=new Date(departTs());const local=new Date(dep.getTime()-dep.getTimezoneOffset()*60000).toISOString().slice(0,16);
    b.innerHTML=`<div class="group"><div class="field"><label>Partenza</label><div class="seg" style="width:auto"><button data-dep="now" class="${st.depart?'':'on'}" style="padding:0 10px;font-size:14px">Adesso</button><button data-dep="set" class="${st.depart?'on':''}" style="padding:0 10px;font-size:14px">Programma</button></div></div>
        ${st.depart?`<div class="field"><label>Data e ora</label><input type="datetime-local" id="plDep" value="${local}" style="border:0;background:none;color:var(--accent);font-size:16px"></div>`:''}</div>
      <div class="timeline">${rows.join('')}</div>
      <div class="group" style="margin-top:12px"><div class="kv"><span>Guida</span><b>${F.dur(r.time)} · ${F.km(r.dist)}</b></div><div class="kv"><span>Soste</span><b>${stopsMin?stopsMin+' min':'Nessuna'}</b></div><div class="kv"><span>Durata totale</span><b style="font-weight:700">${F.dur(r.time+stopsMin*60)}</b></div><div class="kv"><span>Costo</span><b style="font-weight:700">${F.eur(r.cost.total)}</b></div></div>
      <div style="display:grid;gap:8px;margin-top:12px">
        <button class="btn wide" id="plSug"><svg><use href="#i-magic"/></svg>Suggerisci le soste (ogni 2 ore)</button>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn" id="plSave"><svg><use href="#i-star-o"/></svg>Salva viaggio</button><button class="btn" id="plShare"><svg><use href="#i-share"/></svg>Condividi</button></div>
        <button class="btn green big" id="plGo">Vai</button></div>
      <div id="plSugOut"></div>`;
    bindCommon(b);
    b.querySelectorAll('[data-stay]').forEach(x=>x.onclick=()=>{const s=st.stops[+x.dataset.stay];s.stay=Math.max(0,Math.min(600,(s.stay||0)+(+x.dataset.d)));renderPlanBody()});
    b.querySelectorAll('[data-dep]').forEach(x=>x.onclick=()=>{st.depart=x.dataset.dep==='now'?null:(st.depart||Date.now()+3600e3);renderPlanBody()});
    const dp=$('#plDep');if(dp)dp.onchange=()=>{const ts=new Date(dp.value).getTime();if(ts)st.depart=ts;renderPlanBody()};
    $('#plSave').onclick=()=>saveTrip();
    $('#plShare').onclick=()=>{let tt=departTs();const lines=[`Viaggio con Sentinella — ${F.km(r.dist)}, ${F.dur(r.time)} di guida, ${F.eur(r.cost.total)}`];
      st.stops.forEach((s,i)=>{if(i>0)tt+=(legs[i-1]?legs[i-1].time:0)*1000;lines.push(`${F.clock(tt)}  ${i===0&&s.gps?'Partenza':s.name}${s.stay?` (sosta ${s.stay} min)`:''}`);if(i>0&&i<n-1)tt+=(s.stay||0)*60000});share('Itinerario',lines.join('\n'))};
    $('#plSug').onclick=async()=>{const out=$('#plSugOut');const pts=breakPoints(r);if(!pts.length){out.innerHTML='<p class="note">Il viaggio dura meno di 2 ore: nessuna pausa necessaria.</p>';return}
      out.innerHTML='<div class="spin"></div>';const sug=[];
      for(const p of pts){let list=[];try{list=await API.poisNear(catById('services'),p.lat,p.lon,8000)}catch(e){}if(!list.length){try{list=await API.poisNear(catById('fuel'),p.lat,p.lon,5000)}catch(e){}}
        list.sort((a,b2)=>G.dist(p.lat,p.lon,a.lat,a.lon)-G.dist(p.lat,p.lon,b2.lat,b2.lon));sug.push({p,place:list[0]||null})}
      out.innerHTML=`<div class="sec"><h3>Soste suggerite</h3></div><div class="group">${sug.map((x,i)=>x.place?item({attr:`data-sg="${i}"`,color:'#FF9F0A',icon:App.catIcon(catById('services'),18),t1:esc(x.place.name),t2:`Dopo ${F.dur(x.p.at)} di guida · sosta 20 min`,rt:'Aggiungi'}):item({color:'#8E8E93',icon:'<svg><use href="#i-clock"/></svg>',t1:`Pausa dopo ${F.dur(x.p.at)}`,t2:'Nessuna area di servizio trovata qui vicino'})).join('')}</div>`;
      out.querySelectorAll('[data-sg]').forEach(x=>x.onclick=()=>{const s=sug[+x.dataset.sg].place;Plan.addStop(s,insertIndex(s));const added=Plan.st.stops.find(q=>q.lat===s.lat&&q.lon===s.lon);if(added)added.stay=20;App.toast('Sosta aggiunta: '+s.name);render();Plan.compute()})}}
  // inserisce una tappa nel punto giusto lungo il percorso
  function insertIndex(p){const r=Plan.route;if(!r)return Plan.st.stops.length-1;const P=G.prep(r.coords);const a=G.proj(p.lat,p.lon,P).along;let idx=1;
    for(let i=1;i<Plan.st.stops.length-1;i++){const s=Plan.resolve(Plan.st.stops[i]);if(s&&G.proj(s.lat,s.lon,P).along<a)idx=i+1}return idx}
  /* viaggi salvati */
  function saveTrip(){const st=Plan.st;const d=st.stops[st.stops.length-1];const trips=Store.get('trips',[]);
    trips.unshift({id:'t'+Date.now(),name:(st.stops.length>2?`${d.name} con ${st.stops.length-2} ${st.stops.length===3?'tappa':'tappe'}`:d.name),ts:Date.now(),depart:st.depart||null,stops:st.stops.map(s=>s.gps?{gps:true,name:'La mia posizione'}:{name:s.name,lat:s.lat,lon:s.lon,addr:s.addr||'',stay:s.stay||0}),km:Plan.route?Plan.route.dist:0});
    Store.set('trips',trips.slice(0,30));App.toast('Viaggio salvato: lo trovi nella schermata principale');Voice.buzz(12)}
  R.trips=()=>{const trips=Store.get('trips',[]);return {detent:'full',html:`${hdr('I miei viaggi')}${trips.length?`<div class="group">${trips.map((t,i)=>item({attr:`data-t="${i}"`,color:'#34C759',icon:'<svg><use href="#i-route"/></svg>',t1:esc(t.name),t2:`${t.stops.length} punti · ${F.km(t.km)}${t.depart?' · partenza '+F.date(t.depart):''}`,chev:true})).join('')}</div><p class="note">Tocca un viaggio per aprirlo. Scorri in basso per eliminarli tutti.</p><button class="btn wide" id="trClr" style="color:var(--red)">Elimina tutti i viaggi salvati</button>`:'<div class="empty">Pianifica un viaggio e tocca «Salva viaggio».</div>'}`,
    bind(r){r.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{const t=trips[+b.dataset.t];Plan.reset();Plan.st.stops=t.stops.map(s=>Object.assign({},s));Plan.st.depart=t.depart&&t.depart>Date.now()?t.depart:null;Plan.st.ver++;planTab='itin';show('plan');Plan.compute()});
      const c=$('#trClr');if(c)c.onclick=async()=>{if(await App.confirm('Eliminare tutti i viaggi?','','Elimina',true)){Store.set('trips',[]);render()}}}}};
  App.on('altTap',i=>{if(cur&&cur.name==='plan')Plan.select(+i)});
  function startNav(){const r=Plan.route;if(!r)return;if(!App.state.fix&&!App.state.simReady){App.toast('Serve la posizione GPS: attivala per partire');App.startGps();return}
    Nav.start(r,Plan.st.stops.map(s=>Plan.resolve(s)||s));show('nav',{}, {replace:true})}
  function addStopDuringNav(p){const stops=[{gps:true,name:'La mia posizione'}].concat(Plan.st.stops.slice(1));stops.splice(stops.length-1,0,{name:p.name,lat:p.lat,lon:p.lon,addr:p.addr});Plan.st.stops=stops;Nav.stop(true);
    Plan.compute().then(()=>{if(Plan.route){Nav.start(Plan.route,Plan.st.stops.map(s=>Plan.resolve(s)||s));stack=[];cur={name:'nav'};render('peek');App.toast('Tappa aggiunta: '+p.name)}})}
  App.on('arrived',()=>{home()});

  /* ---------- PANNELLO NAVIGAZIONE ---------- */
  R.nav=()=>({peek:100,detent:'peek',html:`<div class="navbar"><div class="nb-eta"><b id="nbEta">--:--</b><div class="nb-sub" id="nbSub">–</div></div><button class="nb-end" id="nbEnd">Fine</button></div>
      <div style="margin-top:16px" class="actions"><button class="act" id="nbMute"><svg><use href="#${Nav.muted?'i-mute':'i-volume'}"/></svg>${Nav.muted?'Riattiva':'Silenzia'}</button><button class="act" id="nbShare"><svg><use href="#i-share"/></svg>Arrivo</button><button class="act" id="nbRep"><svg><use href="#i-alert"/></svg>Segnala</button><button class="act" id="nbOv"><svg><use href="#i-route"/></svg>Panoramica</button></div>
      <div class="sec" style="margin-top:6px"><h3>Fermati lungo il percorso</h3></div>
      <div class="chips">${['fuel','charge','services','food','cafe','parking','toilets'].map(k=>{const c=catById(k);return `<button class="chip" data-along="${k}"><span style="color:${c.c};display:flex">${App.catIcon(c,16,c.c)}</span>${esc(c.l)}</button>`}).join('')}</div>
      <div class="sec"><h3>Prossime indicazioni</h3></div><div class="group" id="nbSteps"></div>
      <div class="sec"><h3>Costo stimato</h3></div><div class="group" id="nbCost"></div>`,
    bind(){$('#nbEnd').onclick=async()=>{if(await App.confirm('Terminare la navigazione?','','Termina',true)){App.stopSim&&App.stopSim();Nav.stop();home()}};
      $('#nbMute').onclick=()=>{Nav.toggleMute();render()};
      $('#nbShare').onclick=()=>{const r=Nav.rem;const d=Plan.st.stops[Plan.st.stops.length-1];const f=App.state.fix;share('Arrivo previsto',`Arrivo previsto alle ${r?F.clock(r.eta):'--'} a ${d.name}.${f?`\nSono qui: https://www.openstreetmap.org/?mlat=${f.lat.toFixed(5)}&mlon=${f.lon.toFixed(5)}`:''}`)};
      $('#nbRep').onclick=()=>show('report');$('#nbOv').onclick=()=>{MapView.setCam('free');Plan.fitRoutes();App.toast('La guida riprende da sola tra pochi secondi')};
      scr.querySelectorAll('[data-along]').forEach(x=>x.onclick=()=>show('results',{cat:x.dataset.along,along:true}));
      if(!Nav.route)return;const c=Nav.route.cost||Plan.cost(Nav.route);
      $('#nbCost').innerHTML=`<div class="kv"><span>Carburante</span><b>${F.eur(c.fuel)}</b></div><div class="kv"><span>Pedaggi</span><b>${c.tollKm?F.eur(c.toll):'Nessuno'}</b></div><div class="kv"><span>Totale</span><b style="font-weight:700">${F.eur(c.total)}</b></div>`;
      navTick()}});
  function navTick(){if(!cur||cur.name!=='nav')return;const r=Nav.rem;if(r){const e=$('#nbEta');if(e){e.textContent=F.clock(r.eta);$('#nbSub').textContent=`${F.dur(r.time)} · ${F.km(r.dist)}`}}
    const box=$('#nbSteps');if(box&&Sheet.cur!=='peek'){const s=Nav.steps().slice(0,12);box.innerHTML=s.map(x=>`<div class="item"><span class="ic" style="background:#1c1c1e;border-radius:10px">${x.icon.replace('<svg ','<svg width="22" height="22" ')}</span><span class="tx"><span class="t1" style="display:block;white-space:normal">${esc(x.m.text)}</span></span><span class="rt">${F.km(Math.max(0,x.dist))}</span></div>`).join('')}}
  App.on('navTick',navTick);App.on('sheet',()=>{if(cur&&cur.name==='nav')navTick()});
  App.on('navReroute',()=>{if(cur&&cur.name==='nav')render()});

  /* ---------- SEGNALA ---------- */
  R.report=()=>({detent:'half',html:`${hdr('Segnala','Alla tua posizione, nella direzione di marcia')}
      <div class="group">${item({attr:'data-k="fixed"',color:'#E1251B',icon:'<svg><use href="#i-camera"/></svg>',t1:'Autovelox fisso',t2:'Resta salvato',chev:true})}
      ${item({attr:'data-k="mobile"',color:'#007AFF',icon:'<svg><use href="#i-alert"/></svg>',t1:'Controllo mobile o pattuglia',t2:'Visibile per 4 ore',chev:true})}
      ${item({attr:'data-k="tutor"',color:'#FF9500',icon:'<b style="font-size:15px">T</b>',t1:Guard.act&&Guard.act.manual?'Fine tutor manuale qui':'Inizio tutor qui',t2:'Registra la tratta e la media',chev:true})}</div>
      <p class="note">Le segnalazioni restano su questo telefono.</p>`,
    bind(r){r.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{const k=b.dataset.k;if(k==='tutor'){Guard.act&&Guard.act.manual?Guard.end('manuale'):Guard.startManual()}else Guard.report(k);back()})}});

  /* ---------- AUTOVELOX VICINI ---------- */
  let camFilter='tutti';
  R.cams=()=>{const me=myPos();if(!me)return {detent:'half',html:hdr('Autovelox e tutor')+'<div class="empty">Serve la posizione.</div>'};
    const cams=Guard.nearCams(me.lat,me.lon,2).filter(c=>c.kind!=='tutorpt').map(c=>({o:c,t:'cam',d:G.dist(me.lat,me.lon,c.lat,c.lon)}));
    const tuts=Guard.allTuts().map(t=>({o:t,t:'tut',d:Math.min(G.dist(me.lat,me.lon,t.A[0],t.A[1]),G.dist(me.lat,me.lon,t.B[0],t.B[1]))})).filter(x=>x.d<80000);
    let list=cams.concat(tuts).filter(x=>camFilter==='tutti'||(camFilter==='attivi'?Guard.stat(x.o)!=='off':camFilter==='spenti'?Guard.stat(x.o)==='off':x.t==='tut')).sort((a,b)=>a.d-b.d).slice(0,80);
    const chip=s=>s==='off'?'<span class="tag gray">spento</span>':s==='unk'?'<span class="tag orange">da verificare</span>':'<span class="tag green">attivo</span>';
    return {detent:'full',html:`${hdr('Autovelox e tutor',`${Guard.info.n.toLocaleString('it-IT')} autovelox e ${Guard.info.t} tutor in Italia`)}
      <div class="seg" style="margin-bottom:12px">${['tutti','attivi','spenti','tutor'].map(f=>`<button data-f="${f}" class="${f===camFilter?'on':''}">${f[0].toUpperCase()+f.slice(1)}</button>`).join('')}</div>
      ${list.length?`<div class="group">${list.map((x,i)=>item({attr:`data-i="${i}"`,color:x.t==='tut'?'#FF9500':Guard.stat(x.o)==='off'?'#8E8E93':x.o.kind==='mobile'?'#007AFF':'#E1251B',icon:x.t==='tut'?'<b style="font-size:15px">T</b>':`<b style="font-size:13px">${x.o.lim||'AV'}</b>`,
        t1:x.t==='tut'?esc(x.o.name):(x.o.kind==='mobile'?'Controllo mobile':'Autovelox')+(x.o.lim?' · '+x.o.lim+' km/h':''),t2:chip(Guard.stat(x.o))+' '+(x.t==='tut'?F.km(x.o.len)+(x.o.src==='uff'?' · elenco Polizia':''):x.o.src==='user'?'tua segnalazione':'OpenStreetMap'),rt:F.km(x.d)})).join('')}</div>`:'<div class="empty">Niente in questa categoria nei dintorni.</div>'}
      <p class="note">Dal 30 novembre 2025 possono multare solo gli autovelox registrati nell'elenco ufficiale del Ministero: <a href="https://velox.mit.gov.it/dispositivi" target="_blank" rel="noopener">velox.mit.gov.it</a>. Lo stato qui sopra viene da OpenStreetMap e lo puoi correggere tu.</p>`,
      bind(r){r.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{camFilter=b.dataset.f;render()});r.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>show('cam',{id:list[+b.dataset.i].o.id}))}}};
  App.on('camTap',id=>show('cam',{id},{detent:'half'}));App.on('tutTap',id=>show('cam',{id},{detent:'half'}));
  R.cam=({id})=>{const o=Guard.allCams().find(c=>c.id===id)||Guard.allTuts().find(t=>t.id===id);if(!o)return {html:hdr('Non trovato')};const isT=!!o.A;const s=Guard.stat(o);
    return {detent:'half',html:`${hdr(isT?o.name:(o.kind==='mobile'?'Controllo mobile':o.kind==='tutorpt'?'Portale tutor':'Autovelox'),isT?`${F.km(o.len)}${o.lim?' · limite '+o.lim:''} · ${o.src==='uff'?'elenco ufficiale Polizia di Stato':'OpenStreetMap'}`:`${o.lim?'Limite '+o.lim+' km/h · ':''}${o.src==='user'?'tua segnalazione':'OpenStreetMap'}`)}
      <div class="seg">${[['on','Attivo'],['off','Spento'],['unk','Da verificare']].map(([k,l])=>`<button data-s="${k}" class="${s===k?'on':''}">${l}</button>`).join('')}</div>
      <div class="group" style="margin-top:12px">${!isT?`<div class="kv"><span>Direzione controllata</span><b>${o.dir!=null?['Nord','Nord-est','Est','Sud-est','Sud','Sud-ovest','Ovest','Nord-ovest'][Math.round(o.dir/45)%8]:'Non indicata'}</b></div>`:''}<div class="kv"><span>Distanza</span><b>${distTxt(isT?{lat:o.A[0],lon:o.A[1]}:o)}</b></div></div>
      <div style="display:grid;gap:8px;margin-top:12px"><button class="btn wide" id="cMap">Mostra sulla mappa</button>${o.src==='user'?'<button class="btn wide" id="cDel" style="color:var(--red)">Elimina segnalazione</button>':''}</div>`,
      bind(r){r.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{Guard.setStatus(id,b.dataset.s);render()});
        $('#cMap').onclick=()=>{MapView.setCam('free');Sheet.set('peek');if(isT){const g=o.P?o.P.g:[o.A,o.B];let bb=[[180,90],[-180,-90]];for(const p of g){bb[0][0]=Math.min(bb[0][0],p[1]);bb[0][1]=Math.min(bb[0][1],p[0]);bb[1][0]=Math.max(bb[1][0],p[1]);bb[1][1]=Math.max(bb[1][1],p[0])}MapView.fit(bb)}else MapView.flyTo(o.lat,o.lon,16)};
        const d=$('#cDel');if(d)d.onclick=()=>{Guard.removeUser(id);back()}}}};

  /* ---------- STORICO ---------- */
  R.hist=()=>{const H=Guard.hist;const over=H.filter(h=>h.L&&h.ex>0).length;
    return {detent:'full',html:`${hdr('Storico tutor',H.length?`${H.length} passaggi · ${over} oltre soglia stimata`:'')}
      ${H.length?`<div class="group">${H.slice(0,150).map((h,i)=>item({attr:`data-h="${i}"`,color:!h.L?'#8E8E93':h.ex>0?'#FF3B30':'#34C759',icon:`<b style="font-size:13px">${Math.round(h.avg)}</b>`,t1:esc(h.name),t2:`${F.date(h.ts)} · ${F.km(h.len)} · ${F.mmss(h.secs)}${h.partial?' · parziale':''}`,rt:h.L?(h.ex>0?'+'+F.n(h.ex,1):'ok'):'',chev:true})).join('')}</div>
      <div style="display:grid;gap:8px;margin-top:12px"><button class="btn wide" id="hsShare"><svg><use href="#i-share"/></svg>Esporta lo storico</button><button class="btn wide" id="hsClr" style="color:var(--red)">Cancella lo storico</button></div>`:'<div class="empty">Quando passi in una tratta tutor, qui trovi media, tempo ed esito stimato.</div>'}
      <p class="note">Le medie sono calcolate dal GPS del telefono: sono una stima utile per un confronto, non una prova ufficiale.</p>`,
      bind(r){r.querySelectorAll('[data-h]').forEach(b=>b.onclick=()=>show('histd',{h:H[+b.dataset.h]}));
        const s=$('#hsShare');if(s)s.onclick=()=>share('Storico tutor','Sentinella · storico tutor\n'+H.map(h=>`${F.date(h.ts)} | ${h.name} | ${F.n(h.len/1000,2)} km | ${F.mmss(h.secs)} | media ${F.n(h.avg,1)} km/h | limite ${h.L||'n.d.'}${h.partial?' | parziale':''}`).join('\n'));
        const c=$('#hsClr');if(c)c.onclick=async()=>{if(await App.confirm('Cancellare lo storico?','Tutti i passaggi registrati verranno eliminati.','Cancella',true)){Guard.clearHist();render()}}}}};
  R.histd=({h})=>({detent:'full',html:`${hdr(h.name,F.date(h.ts))}${resultHtml(h)}`});
  function resultHtml(r){const b=r.L?Guard.band(r.ex):null;
    return `<div style="display:flex;align-items:baseline;gap:10px;margin:4px 0 14px"><b style="font:700 60px/1 var(--font);letter-spacing:-2px" class="num">${Math.round(r.avg)}</b><span style="color:var(--label2)">km/h di media</span></div>
    <div class="group"><div class="kv"><span>Distanza</span><b>${F.km(r.len)}</b></div><div class="kv"><span>Tempo</span><b>${F.mmss(r.secs)}</b></div><div class="kv"><span>Limite</span><b>${r.L?r.L+' km/h':'n.d.'}</b></div>
    <div class="kv"><span>Media meno tolleranza (5%, min 5)</span><b>${r.L?Math.round(r.avg-Guard.tol(r.avg))+' km/h':'–'}</b></div>
    <div class="kv"><span>Esito stimato</span><b>${!r.L?'–':r.ex<=0?'<span class="tag green">In regola</span>':`<span class="tag red">+${F.n(r.ex,1)} km/h</span>`}</b></div>
    ${b?`<div class="kv"><span>Sanzione (art. 142 CdS)</span><b>${b.e}</b></div><div class="kv"><span>Punti patente</span><b>${b.p}${b.x?' · '+b.x:''}</b></div>`:''}
    ${r.maxV?`<div class="kv"><span>Velocità massima</span><b>${r.maxV} km/h</b></div>`:''}</div>
    ${r.partial?'<p class="note">Media parziale: sei entrato a tratta già iniziata.</p>':''}`}
  App.on('tutorEnd',({rec,a})=>{if(App.state.navigating&&cur&&cur.name==='nav'){App.toast(`Fine tutor: media ${Math.round(rec.avg)} km/h${rec.L?(rec.ex>0?' · oltre soglia':' · in regola'):''}`,5000);return}
    if(a.manual&&a.track.length>3&&a.prog>500){show('saveTut',{a,rec});return}show('tutEnd',{rec})});
  R.tutEnd=({rec})=>({detent:'half',html:`${hdr('Fine tutor',esc(rec.name))}${resultHtml(rec)}<button class="btn wide big" style="margin-top:14px" data-back>Chiudi</button>`,bind(){setTimeout(()=>{if(cur&&cur.name==='tutEnd')back()},12000)}});
  R.saveTut=({a,rec})=>({detent:'full',html:`${hdr('Salvare la tratta?',`Media ${Math.round(rec.avg)} km/h su ${F.km(rec.len)}`)}
      <div class="group"><div class="field"><label>Nome</label><input type="text" id="stN" value="Tratta ${esc(F.date(rec.ts))}" maxlength="60"></div><div class="field"><label>Limite (km/h)</label><input type="number" id="stL" inputmode="numeric" value="${a.L||130}"></div></div>
      <p class="note">Salvandola, la prossima volta Sentinella la riconosce da sola all'ingresso.</p>
      <button class="btn primary big" id="stSave">Salva tratta</button><button class="btn wide" style="margin-top:8px" data-back>Non salvare</button>`,
    bind(){$('#stSave').onclick=()=>{Guard.saveManual(a,$('#stN').value.trim()||'Tratta',+$('#stL').value||null);App.toast('Tratta salvata');back()}}});

  /* ---------- PREFERITI ---------- */
  R.favs=()=>({detent:'full',html:`${hdr('Preferiti')}
      <div class="group">${[['home','Casa','#007AFF','i-home'],['work','Lavoro','#A2845E','i-work']].map(([k,l,c,i])=>item({attr:`data-f="${k}"`,color:c,icon:`<svg><use href="#${i}"/></svg>`,t1:l,t2:favs[k]?esc(favs[k].addr||''):'Non impostato',rt:favs[k]?'Cambia':'Imposta'})).join('')}
      ${favs.list.map((p,i)=>item({attr:`data-d="${i}"`,color:'#FF9500',icon:'<svg><use href="#i-star"/></svg>',t1:esc(p.name),t2:esc(p.addr||''),rt:'Rimuovi'})).join('')}</div>`,
    bind(r){r.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>show('search',{pickFav:b.dataset.f}));r.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{favs.list.splice(+b.dataset.d,1);saveFavs();render()})}});

  /* ---------- VEICOLI ---------- */
  function pickVehicle(done){const v=App.vehicles;App.modal(`<div class="mb"><h4>Con quale auto viaggi?</h4></div><div class="group" style="border-radius:0">${v.map(x=>item({attr:`data-v="${x.id}"`,color:x.id===S.vehicle?'var(--accent)':'#8E8E93',icon:'<svg><use href="#i-car"/></svg>',t1:esc(x.name),t2:`${App.FUELS[x.fuel].label} · ${F.n(x.ext,1)}–${F.n(x.aut,1)} ${App.FUELS[x.fuel].unit}/100 km`})).join('')}</div><div class="mbtns"><button data-x>Chiudi</button><button data-g>Gestisci</button></div>`,
    (m,close)=>{m.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{S.vehicle=b.dataset.v;App.saveS();close();done&&done()});m.querySelector('[data-x]').onclick=close;m.querySelector('[data-g]').onclick=()=>{close();show('vehicles')}})}
  R.vehicles=()=>({detent:'full',html:`${hdr('Le mie auto','Consumi e prezzi per il costo del viaggio')}
      <div class="group">${App.vehicles.map(v=>item({attr:`data-v="${v.id}"`,color:v.id===S.vehicle?'var(--accent)':'#8E8E93',icon:'<svg><use href="#i-car"/></svg>',t1:esc(v.name)+(v.id===S.vehicle?' <span class="tag blue">in uso</span>':''),t2:`${App.FUELS[v.fuel].label} · città ${F.n(v.urb,1)} · extra ${F.n(v.ext,1)} · autostrada ${F.n(v.aut,1)}`,chev:true})).join('')}</div>
      <button class="btn wide" id="vAdd" style="margin-top:10px"><svg><use href="#i-plus"/></svg>Aggiungi auto</button>
      <div class="sec"><h3>Prezzi carburante</h3></div>
      <div class="group">${Object.entries(App.FUELS).map(([k,f])=>`<div class="field"><label>${f.label}<small>€/${f.unit} · ${esc(f.ref)}</small></label><input type="number" step="0.001" inputmode="decimal" data-p="${k}" value="${App.PRICES[k]}"></div>`).join('')}</div>
      <div class="sec"><h3>Viaggio</h3></div>
      <div class="group"><div class="field"><label>Persone a bordo<small>Per dividere la spesa</small></label><input type="number" min="1" max="9" id="vPpl" value="${S.people||1}"></div>
      <div class="field"><label>Valore del tuo tempo<small>€/ora, per scegliere la più conveniente</small></label><input type="number" min="0" step="1" id="vTv" value="${S.timeValue||0}"></div></div>
      <p class="note">Benzina e gasolio: prezzi medi self MIMIT del 19 novembre 2026. Aggiornali quando vuoi con quelli del tuo distributore.</p>`,
    bind(r){r.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>show('vehEdit',{id:b.dataset.v}));$('#vAdd').onclick=()=>show('vehEdit',{id:null});
      r.querySelectorAll('[data-p]').forEach(i=>i.onchange=()=>{const v=parseFloat(i.value.replace(',','.'));if(v>0){App.PRICES[i.dataset.p]=v;const o={};for(const k in App.PRICES)if(App.PRICES[k]!==App.FUELS[k].price)o[k]=App.PRICES[k];Store.set('prices',o)}});
      $('#vPpl').onchange=e=>{S.people=Math.max(1,Math.min(9,+e.target.value||1));App.saveS()};$('#vTv').onchange=e=>{S.timeValue=Math.max(0,+e.target.value||0);App.saveS()}}});
  R.vehEdit=({id})=>{const v=id?App.vehicles.find(x=>x.id===id):{id:null,name:'Nuova auto',fuel:'benzina',urb:7,ext:4.9,aut:6.3,cls:'A'};const u=()=>App.FUELS[$('#veF').value].unit;
    return {detent:'full',html:`${hdr(id?'Modifica auto':'Nuova auto')}
      <div class="sec" style="margin-top:4px"><h3 style="font-size:15px;color:var(--label2);font-weight:500">Parti da un modello tipo</h3></div>
      <div class="chips">${App.PRESETS.map((p,i)=>`<button class="chip" data-pr="${i}">${esc(p.name)}</button>`).join('')}</div>
      <div class="group" style="margin-top:10px">
        <div class="field"><label>Nome</label><input type="text" id="veN" value="${esc(v.name)}" maxlength="40"></div>
        <div class="field"><label>Alimentazione</label><select id="veF">${Object.entries(App.FUELS).map(([k,f])=>`<option value="${k}" ${k===v.fuel?'selected':''}>${f.label}</option>`).join('')}</select></div>
        <div class="field"><label>Consumo in città<small id="veU1">${App.FUELS[v.fuel].unit}/100 km</small></label><input type="number" step="0.1" inputmode="decimal" id="veU" value="${v.urb}"></div>
        <div class="field"><label>Consumo extraurbano<small>${App.FUELS[v.fuel].unit}/100 km</small></label><input type="number" step="0.1" inputmode="decimal" id="veE" value="${v.ext}"></div>
        <div class="field"><label>Consumo in autostrada<small>${App.FUELS[v.fuel].unit}/100 km a 130 km/h</small></label><input type="number" step="0.1" inputmode="decimal" id="veA" value="${v.aut}"></div>
        <div class="field"><label>Serbatoio<small id="veTU">${v.fuel==='elettrica'?'kWh di batteria':v.fuel==='metano'?'kg':'litri'}, per l'autonomia</small></label><input type="number" step="1" inputmode="numeric" id="veT" value="${v.tank||(v.fuel==='elettrica'?55:45)}"></div>
        <div class="field"><label>Classe pedaggio<small>A: auto fino a 1,3 m all'asse anteriore</small></label><select id="veC"><option value="A" ${v.cls==='A'?'selected':''}>Classe A</option><option value="B" ${v.cls==='B'?'selected':''}>Classe B</option></select></div>
      </div>
      <p class="note">Usa i consumi reali del computer di bordo. Se lo conosci in km/l, dividi 100 per quel numero: 15 km/l corrispondono a 6,7 l/100 km.</p>
      <button class="btn primary big" id="veS">Salva</button>${id&&App.vehicles.length>1?'<button class="btn wide" id="veD" style="margin-top:8px;color:var(--red)">Elimina auto</button>':''}`,
      bind(r){r.querySelectorAll('[data-pr]').forEach(b=>b.onclick=()=>{const p=App.PRESETS[+b.dataset.pr];$('#veF').value=p.fuel;$('#veU').value=p.urb;$('#veE').value=p.ext;$('#veA').value=p.aut;if(/Nuova auto|La mia auto/.test($('#veN').value))$('#veN').value=p.name});
        const num=x=>parseFloat(String(x).replace(',','.'))||0;
        $('#veS').onclick=()=>{const o={id:v.id||'v'+Date.now(),name:$('#veN').value.trim()||'Auto',fuel:$('#veF').value,urb:num($('#veU').value),ext:num($('#veE').value),aut:num($('#veA').value),cls:$('#veC').value,tank:num($('#veT').value)||null};
          const i=App.vehicles.findIndex(x=>x.id===o.id);if(i>=0)App.vehicles[i]=o;else{App.vehicles.push(o);S.vehicle=o.id;App.saveS()}App.saveVeh();back()};
        const d=$('#veD');if(d)d.onclick=()=>{App.vehicles=App.vehicles.filter(x=>x.id!==v.id);if(S.vehicle===v.id){S.vehicle=App.vehicles[0].id;App.saveS()}App.saveVeh();back()}}}};

  /* ---------- IMPOSTAZIONI ---------- */
  R.settings=()=>{const t=(k,l,s)=>`<div class="field"><label>${l}${s?`<small>${s}</small>`:''}</label><input type="checkbox" class="sw" data-k="${k}" ${S[k]?'checked':''}></div>`;const v=App.vehicle();
    return {detent:'full',html:`${hdr('Impostazioni')}
      <div class="group">${item({attr:'id="stVeh"',color:'var(--accent)',icon:'<svg><use href="#i-car"/></svg>',t1:esc(v.name),t2:'Auto, consumi e prezzi carburante',chev:true})}</div>
      <div class="sec"><h3>Autovelox e tutor</h3></div>
      <div class="group">${t('rain','Pioggia o neve','Autostrade 110, superstrade 90')}${t('neo','Neopatentato','Autostrade 100, superstrade 90, punti doppi')}${t('camVoice','Annuncia gli autovelox','A voce, con distanza e limite')}${t('showOff','Mostra i dispositivi spenti','In grigio, senza avvisi')}
        <div class="field" style="flex-direction:column;align-items:stretch;padding:12px"><label>Avviso superamento limite: +<span id="vMar">${S.margin}</span> km/h</label><input type="range" min="0" max="10" step="1" value="${S.margin}" data-r="margin"></div>
        <div class="field" style="flex-direction:column;align-items:stretch;padding:12px"><label>Anticipo avvisi autovelox: <span id="vLead">${S.lead}</span> secondi</label><input type="range" min="10" max="40" step="5" value="${S.lead}" data-r="lead"></div></div>
      <div class="sec"><h3>Voce e suoni</h3></div>
      <div class="group">${t('voice','Indicazioni vocali','')}${t('beep','Segnali acustici','')}</div>
      <div class="sec"><h3>Percorsi</h3></div>
      <div class="group">${t('avoidTolls','Evita pedaggi','')}${t('avoidHighways','Evita autostrade','')}${t('avoidFerries','Evita traghetti','')}</div>
      <div class="sec"><h3>Mappa</h3></div>
      <div class="group"><div class="field"><label>Aspetto</label><div class="seg" style="width:60%">${[['auto','Auto'],['light','Chiaro'],['dark','Scuro']].map(([k,l])=>`<button data-th="${k}" class="${S.theme===k?'on':''}">${l}</button>`).join('')}</div></div>${t('buildings3d','Edifici in 3D','Inclina la mappa con due dita')}</div>
      <div class="sec"><h3>Traffico in tempo reale</h3></div>
      <div class="group"><div class="field"><label>Chiave TomTom<small>Gratuita su developer.tomtom.com</small></label><input type="password" id="stTT" value="${esc(S.tomtomKey||'')}" placeholder="facoltativa" autocomplete="off"></div>${t('traffic','Mostra il traffico','Strade colorate per velocità')}</div>
      <div class="group" style="margin-top:8px">${item({attr:'id="stTTg"',color:'#DF1B12',icon:'<b style="font-size:13px">TT</b>',t1:'Come ottenere la chiave gratuita',t2:'5 minuti, nessun costo',chev:true})}</div>
      <p class="note">Senza chiave i tempi di percorrenza sono senza traffico in tempo reale. Con la chiave vedi il traffico colorato sulla mappa.</p>
      <div class="sec"><h3>Dati</h3></div>
      <div class="group"><div class="kv"><span>Autovelox</span><b>${Guard.info.n.toLocaleString('it-IT')} · ${esc(Guard.info.date)}</b></div><div class="kv"><span>Tratte tutor</span><b>${Guard.info.t}${Guard.info.tdate?' · '+esc(Guard.info.tdate):''}</b></div>
        ${item({attr:'id="stUpd"',color:'#34C759',icon:'<svg><use href="#i-camera"/></svg>',t1:'Aggiorna la zona da OpenStreetMap',t2:'Raggio 30 km, può richiedere un minuto'})}
        ${item({attr:'id="stDemo"',color:'#5856D6',icon:'<svg><use href="#i-route"/></svg>',t1:'Viaggio di prova',t2:'Simula Cassino → Frosinone sulla A1',chev:true})}</div>
      <p class="note">Mappa © OpenFreeMap e contributori OpenStreetMap. Percorsi: Valhalla su server FOSSGIS. Ricerca: Photon (komoot). Elenco tutor: Polizia di Stato / Autostrade per l'Italia. Sanzioni: art. 142 CdS in vigore, importi 2026; tolleranza 5% con minimo 5 km/h.</p>`,
      bind(r){$('#stVeh').onclick=()=>show('vehicles');
        r.querySelectorAll('[data-k]').forEach(i=>i.onchange=()=>{S[i.dataset.k]=i.checked;App.saveS();const k=i.dataset.k;if(k==='buildings3d')MapView.restyle();if(k==='showOff')Guard.publish();if(k==='traffic')App.applyTraffic();if(/^avoid/.test(k)&&Plan.st.routes.length)Plan.compute()});
        r.querySelectorAll('[data-r]').forEach(i=>i.oninput=()=>{S[i.dataset.r]=+i.value;App.saveS();$('#vMar').textContent=S.margin;$('#vLead').textContent=S.lead});
        r.querySelectorAll('[data-th]').forEach(b=>b.onclick=()=>{S.theme=b.dataset.th;App.saveS();App.applyTheme();MapView.restyle();render()});
        $('#stTT').onchange=e=>{S.tomtomKey=e.target.value.trim();App.saveS();App.applyTraffic()};$('#stTTg').onclick=()=>show('ttGuide');
        $('#stUpd').onclick=async()=>{const me=myPos();if(!me)return;App.toast('Scarico i dati della zona…',60000);try{const n=await Guard.refreshArea(me.lat,me.lon);App.toast(`Aggiornati: ${n} autovelox nella zona`)}catch(e){App.toast('Server OpenStreetMap occupato, riprova tra qualche minuto')}};
        $('#stDemo').onclick=()=>App.demo()}}};

  /* ---------- guida chiave TomTom ---------- */
  R.ttGuide=()=>({detent:'full',html:`${hdr('Chiave TomTom gratuita','Per vedere il traffico in tempo reale')}
      <div class="group">
        ${[['Apri il sito','Vai su <a href="https://my.tomtom.com" target="_blank" rel="noopener">my.tomtom.com</a> (da telefono o PC).'],
           ['Registrati','Tocca «Register» e crea l\'account con la tua email: il piano base è gratuito.'],
           ['Conferma l\'email','Apri il messaggio che TomTom ti manda e tocca il link di conferma, poi accedi.'],
           ['Apri le chiavi','Nel menu scegli «API & SDK Keys». Trovi già una chiave pronta che si chiama «My first API key».'],
           ['Copia la chiave','Tocca la chiave: viene copiata negli appunti (sul sito si vede accorciata, è normale).'],
           ['Incollala qui sotto','Incolla la chiave nel campo, tocca «Prova la chiave» e poi attiva «Mostra il traffico».']]
          .map((x,i)=>`<div class="item" style="align-items:flex-start"><span class="ic" style="background:var(--accent);font-weight:700">${i+1}</span><span class="tx"><span class="t1" style="display:block;font-weight:600">${x[0]}</span><span style="display:block;font-size:15px;color:var(--label2);white-space:normal">${x[1]}</span></span></div>`).join('')}
      </div>
      <div class="group" style="margin-top:14px"><div class="field"><label>Chiave</label><input type="password" id="ttK" value="${esc(S.tomtomKey||'')}" placeholder="incolla qui" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <div class="field"><label>Mostra il traffico</label><input type="checkbox" class="sw" id="ttOn" ${S.traffic?'checked':''}></div></div>
      <button class="btn primary big" id="ttTest" style="margin-top:12px">Prova la chiave</button>
      <p class="note" id="ttRes"></p>
      <p class="note">Il piano gratuito ha un limite di richieste: per un uso personale non lo raggiungi. Se un giorno compare «chiave non valida o limite superato», controlla la chiave su my.tomtom.com. Non condividere la chiave con altri: è legata al tuo account.</p>`,
    bind(){const k=$('#ttK'),res=$('#ttRes');
      k.onchange=()=>{S.tomtomKey=k.value.trim();App.saveS();App.applyTraffic()};
      $('#ttOn').onchange=e=>{if(e.target.checked&&!S.tomtomKey){e.target.checked=false;App.toast('Prima incolla la chiave');return}S.traffic=e.target.checked;App.saveS();App.applyTraffic()};
      $('#ttTest').onclick=async()=>{const key=k.value.trim();if(!key){res.textContent='Incolla prima la chiave.';return}
        S.tomtomKey=key;App.saveS();res.textContent='Verifico…';
        try{const r=await API.tfetch(`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/10/547/377.png?key=${encodeURIComponent(key)}&tileSize=256`,{},10000);
          if(r.ok){res.innerHTML='<b style="color:var(--green)">Chiave valida.</b> Il traffico è attivo sulla mappa.';S.traffic=true;App.saveS();$('#ttOn').checked=true;App.applyTraffic();Voice.buzz(15)}
          else if(r.status===403||r.status===401)res.innerHTML='<b style="color:var(--red)">Chiave non valida o limite superato.</b> Controlla di averla copiata tutta.';
          else res.textContent='Risposta inattesa dal server TomTom ('+r.status+'). Riprova tra poco.'}
        catch(e){res.textContent='Non riesco a raggiungere TomTom: controlla la connessione.'}}}});

  /* ---------- livelli mappa ---------- */
  App.on('layers',()=>{App.modal(`<div class="mb" style="padding-bottom:0"><h4>Mappa</h4></div><div class="layers">
      <button data-m="std" class="${S.mapType==='std'&&!App.isDark()?'on':''}"><span class="lp" style="background:linear-gradient(135deg,#e9eef3 0 40%,#f7d68a 40% 46%,#e9eef3 46% 70%,#bfe3c6 70%)"></span>Esplora</button>
      <button data-m="dark" class="${S.mapType==='std'&&App.isDark()?'on':''}"><span class="lp" style="background:linear-gradient(135deg,#1b1f24 0 40%,#8c6b3e 40% 46%,#1b1f24 46% 70%,#132219 70%)"></span>Notte</button>
      <button data-m="sat" class="${S.mapType==='sat'?'on':''}"><span class="lp" style="background:linear-gradient(135deg,#3d5a3a,#6b7f4a 50%,#4a5a6e)"></span>Satellite</button></div>
      <div class="group" style="border-radius:0"><div class="field"><label>Edifici in 3D</label><input type="checkbox" class="sw" id="l3d" ${S.buildings3d?'checked':''}></div><div class="field"><label>Traffico${S.tomtomKey?'':'<small><a href="#" id="lTTg">Serve la chiave TomTom gratuita: ecco come</a></small>'}</label><input type="checkbox" class="sw" id="lTr" ${S.traffic?'checked':''} ${S.tomtomKey?'':'disabled'}></div></div>
      <div class="mbtns"><button data-x>Fine</button></div>`,(m,close)=>{
      m.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{const k=b.dataset.m;if(k==='sat')S.mapType='sat';else{S.mapType='std';S.theme=k==='dark'?'dark':'light'}App.saveS();App.applyTheme();MapView.restyle();close()});
      const g=m.querySelector('#lTTg');if(g)g.onclick=e=>{e.preventDefault();close();show('ttGuide')};m.querySelector('#l3d').onchange=e=>{S.buildings3d=e.target.checked;App.saveS();MapView.restyle()};m.querySelector('#lTr').onchange=e=>{S.traffic=e.target.checked;App.saveS();App.applyTraffic()};m.querySelector('[data-x]').onclick=close})});

  return {show,back,home,render,openPlace,get cur(){return cur}};
})();
