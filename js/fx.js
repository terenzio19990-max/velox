/* Sentinella — effetti in stile Waze: icone tonde a fumetto, faro sulla mappa oscurata con scheda che scende dall'alto,
   fumetti che saltano fuori dai marcatori, «Sei qui» che si espande toccando la propria posizione. */
'use strict';
const FX = App.FX = (()=>{
  /* ---------- tipi di segnalazione e pericolo ---------- */
  const K = App.KINDS = {
    traffic:{l:'Traffico',c:'#E8412C',g:'M5 17v-5l2-5h10l2 5v5M3.5 17h17M8 13.5h.01M16 13.5h.01M6 17v2.5M18 17v2.5',exp:60},
    accident:{l:'Incidente',c:'#FF3B30',g:'M3 19v-4l1.5-3.5h6L12 15v4zM5 19v1.5M10 19v1.5M17 3.5l1 2.6 2.7.4-2 1.9.5 2.7-2.2-1.3-2.3 1.3.5-2.7-2-1.9 2.8-.4z',exp:120},
    police:{l:'Polizia',c:'#2563EB',g:'M12 3l7 3v5c0 4.4-3 8.2-7 9.5C8 19.2 5 15.4 5 11V6zM9.5 11.5l2 2 3.5-4',exp:120},
    hazard:{l:'Pericolo',c:'#FF9500',g:'M12 4L21 19H3zM12 10v4M12 16.6v.4',exp:180},
    pothole:{l:'Buca',c:'#B7791F',g:'M3 15h4l1.5 2.5h7L17 15h4M6 11.5c2-1.3 10-1.3 12 0',exp:60*24*60},
    rough:{l:'Strada dissestata',c:'#A16207',g:'M3 16c2-3 3 3 5 0s3 3 5 0 3 3 5 0 2 2 3 1M4 10h3M10.5 9h3M17 10h3',exp:60*24*90},
    bump:{l:'Dosso',c:'#EAB308',g:'M3 17h3c2-6 10-6 12 0h3',exp:60*24*365},
    closure:{l:'Strada chiusa',c:'#DC2626',g:'M4 9h16v5H4zM7 9l4 5M13 9l4 5M6 14v5M18 14v5',exp:360},
    signal:{l:'Semaforo',c:'#16A34A',g:'M9 3h6v15H9zM12 6.5v.2M12 10.5v.2M12 14.5v.2M12 18v3',exp:0},
    rail:{l:'Passaggio a livello',c:'#DC2626',g:'M5 5l14 14M19 5L5 19',exp:0},
    curve:{l:'Curva pericolosa',c:'#F97316',g:'M7 20V13c0-4 3-7 7-7h3M14 3l3 3-3 3',exp:0},
    scenic:{l:'Panorama',c:'#D4A017',g:'M3 18l6-8 4 5 2.5-3L21 18zM16.5 7.5a1.5 1.5 0 100-.1',exp:60*24*365},
    fun:{l:'Strada da guidare',c:'#8B5CF6',g:'M6 20c0-4 6-4 6-8s-6-4-6-8M18 20c0-4-6-4-6-8',exp:60*24*365},
    weather:{l:'Meteo',c:'#3B82F6',g:'M7 15h10a3.5 3.5 0 00.3-7A5 5 0 007.4 7.4 3.8 3.8 0 007 15zM9 18l-1 2M13 18l-1 2M17 18l-1 2',exp:240},
    camera:{l:'Autovelox',c:'#E1251B',g:'M3.5 8h11v8h-11zM14.5 11l5-2.5v7l-5-2.5',exp:120}
  };
  const glyph=(k,size=22,stroke='#fff')=>{const d=(K[k]||K.hazard).g;return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="width:${size}px;height:${size}px"><path d="${d}" fill="none" stroke="${stroke}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`};
  // icona per i livelli della mappa: cerchio con bordo bianco e codina a fumetto
  function canvasIcon(k,small){const kd=K[k]||K.hazard,s=small?26:36,h=small?26:42,r=2,c=document.createElement('canvas');c.width=s*r;c.height=h*r;const x=c.getContext('2d');x.scale(r,r);
    const R=s/2-3;x.shadowColor='rgba(0,0,0,.35)';x.shadowBlur=4;x.shadowOffsetY=1.5;x.beginPath();x.arc(s/2,s/2,R,0,Math.PI*2);
    if(!small){x.moveTo(s/2-6,s/2+R-2);x.lineTo(s/2,h-2);x.lineTo(s/2+6,s/2+R-2)}x.fillStyle=kd.c;x.fill();x.shadowColor='transparent';x.lineWidth=small?2:2.5;x.strokeStyle='#fff';x.stroke();
    const p=new Path2D(kd.g);const sc=(R*1.3)/24;x.save();x.translate(s/2-12*sc,s/2-12*sc);x.scale(sc,sc);x.strokeStyle='#fff';x.lineWidth=2.3;x.lineCap='round';x.lineJoin='round';x.stroke(p);x.restore();
    return {img:x.getImageData(0,0,s*r,h*r),ratio:r}}
  function addImages(map){for(const k in K){const a='wz-'+k,b='wzs-'+k;if(!map.hasImage(a)){const o=canvasIcon(k,false);map.addImage(a,o.img,{pixelRatio:o.ratio})}if(!map.hasImage(b)){const o=canvasIcon(k,true);map.addImage(b,o.img,{pixelRatio:o.ratio})}}}
  App.on('mapReady',()=>{const m=MapView.map;if(m){addImages(m);m.on('styleimagemissing',e=>{if(/^wzs?-/.test(e.id))addImages(m)})}});
  // marcatore HTML con animazione di comparsa
  function marker(k,o={}){const kd=K[k]||K.hazard;const el=document.createElement('div');el.className='wz'+(o.cls?' '+o.cls:'');el.style.setProperty('--c',o.color||kd.c);
    el.innerHTML=`<div class="wz-b">${o.html||glyph(k,20)}</div>${o.badge?`<span class="wz-n">${esc(o.badge)}</span>`:''}`;return el}

  /* ---------- faro: mappa oscurata + scheda dall'alto ---------- */
  let spot=null;
  function spotlight(o){closeSpot(true);const map=MapView.map;if(!map)return;
    const el=document.createElement('div');el.className='spot';el.innerHTML=`<div class="spot-dim"></div><div class="spot-card">
      <div class="sc-row"><div class="sc-tx"><span class="sc-t">${esc(o.title||'')}</span>${o.big?`<b class="sc-big">${o.big}</b>`:''}${o.sub?`<span class="sc-sub">${esc(o.sub)}</span>`:''}</div>
      <div class="sc-ic" style="background:${o.color||'#FF9500'}">${o.icon||''}</div></div>
      ${o.meta?`<div class="sc-meta">${o.meta}</div>`:''}
      ${o.actions&&o.actions.length?`<div class="sc-act">${o.actions.map((a,i)=>`<button data-a="${i}" class="${a.cls||''}">${a.icon||''}<span>${esc(a.l)}</span></button>`).join('')}</div>`:''}
      <div class="sc-grab"></div></div>`;
    document.body.appendChild(el);spot={el,o,ll:o.lngLat};
    const dim=el.querySelector('.spot-dim'),card=el.querySelector('.spot-card');
    const upd=()=>{if(!spot||spot.el!==el)return;const p=map.project(spot.ll);dim.style.setProperty('--x',p.x+'px');dim.style.setProperty('--y',p.y+'px')};
    spot.upd=upd;map.on('move',upd);upd();
    MapView.setCam('free');const ch=card.getBoundingClientRect().height||170;
    map.easeTo({center:spot.ll,offset:[0,Math.round(ch/2+10)],zoom:Math.max(map.getZoom(),15),duration:650});
    requestAnimationFrame(()=>el.classList.add('in'));Voice.buzz(8);
    dim.onclick=()=>closeSpot();el.querySelectorAll('[data-a]').forEach(b=>b.onclick=ev=>{const a=o.actions[+b.dataset.a];b.classList.add('pop');setTimeout(()=>b.classList.remove('pop'),400);if(a.fn&&a.fn(b)!==false)setTimeout(()=>closeSpot(),a.keep?0:450)});
    // trascina in su per chiudere
    let sy=null;card.addEventListener('touchstart',e=>{sy=e.touches[0].clientY},{passive:true});card.addEventListener('touchmove',e=>{if(sy==null)return;const dy=Math.min(0,e.touches[0].clientY-sy);card.style.transform=`translateY(${dy}px)`},{passive:true});
    card.addEventListener('touchend',e=>{if(sy==null)return;const dy=(e.changedTouches[0].clientY-sy);sy=null;card.style.transform='';if(dy<-50)closeSpot()});
    return spot}
  function closeSpot(now){if(!spot)return;const {el,o,upd}=spot;spot=null;MapView.map&&MapView.map.off('move',upd);if(now){el.remove()}else{el.classList.remove('in');el.classList.add('out');setTimeout(()=>el.remove(),380)}o.onClose&&o.onClose()}

  /* ---------- fumetto sopra un punto ---------- */
  let bub=null;
  function bubble(ll,html,o={}){closeBubble();const map=MapView.map;if(!map)return;const el=document.createElement('div');el.className='bub-w';
    el.innerHTML=`<div class="bub${o.cls?' '+o.cls:''}">${o.avatar?`<div class="bub-av" style="background:${o.avColor||'#5856D6'}">${o.avatar}</div>`:''}<div class="bub-in">${html}</div></div>`;
    const m=new maplibregl.Marker({element:el,anchor:'bottom',offset:[0,o.offset||-22]}).setLngLat(ll).addTo(map);bub={m,el,o};
    el.addEventListener('click',e=>{e.stopPropagation();if(o.onTap)o.onTap(el)});
    if(o.ttl)setTimeout(()=>{if(bub&&bub.el===el)closeBubble()},o.ttl);return bub}
  function closeBubble(){if(!bub)return;const b=bub;bub=null;b.el.classList.add('out');setTimeout(()=>b.m.remove(),220);b.o.onClose&&b.o.onClose()}

  /* ---------- «Sei qui» ---------- */
  function meTap(){const d=MapView.disp||App.state.fix;if(!d)return;const v=App.vehicle();const road=(Guard.limit&&Guard.limit.road)||'';
    const pill=`<div class="me-pill"><b>Sei qui</b><span class="me-road">${esc(road||'…')}</span><svg class="chev"><use href="#i-chev"/></svg></div>`;
    bubble([d.lon,d.lat],pill,{cls:'me',offset:-26,onTap(el){const b=el.querySelector('.bub');if(b.classList.contains('big'))return;b.classList.add('big');
      const f=App.state.fix;const sp=f?Math.round((f.spd||0)*3.6):0;
      b.querySelector('.bub-in').innerHTML=`<div class="me-card"><div class="me-veh"><span><svg><use href="#i-car"/></svg>${esc(v.name)}</span><span class="me-sep"></span><span>${esc(App.FUELS[v.fuel].label)}</span><svg class="chev"><use href="#i-chev"/></svg></div>
        <div class="me-road2"><b>${esc(road||'Strada non riconosciuta')}</b>${sp>3?`<small>${sp} km/h</small>`:''}</div>
        <div class="me-btns"><button data-m="live">${App.Live&&App.Live.sharing?'Posizione condivisa':'Condividi posizione'}</button><button data-m="rep">Segnala</button></div></div>`;
      b.querySelector('.me-veh').onclick=e=>{e.stopPropagation();closeBubble();UI.show('vehicles')};
      b.querySelectorAll('[data-m]').forEach(x=>x.onclick=e=>{e.stopPropagation();closeBubble();if(x.dataset.m==='live')UI.show('live');else UI.show('report')})}});
    if(!road&&App.state.fix){const f=App.state.fix;API.reverse(f.lat,f.lon).then(r=>{const e=document.querySelector('.me-road');if(e&&r)e.textContent=r.addr&&r.name===r.addr.split(',')[0]?r.name:(r.name||r.addr)}).catch(()=>{})}}
  let bound=false;
  App.on('mapReady',()=>{const map=MapView.map;if(bound||!map)return;bound=true;
    map.on('click',e=>{if(spot)return;const d=MapView.disp;if(d&&App.state.fix){const p=map.project([d.lon,d.lat]);if(Math.hypot(p.x-e.point.x,p.y-e.point.y)<30){meTap();return}}
      if(bub&&!(bub.el.contains(e.originalEvent.target)))closeBubble()});
    map.on('dragstart',()=>{if(bub&&!bub.o.sticky)closeBubble()})});
  // tempo trascorso in italiano
  function ago(ts){const s=Math.max(0,(Date.now()-ts)/1000);if(s<50)return 'adesso';if(s<3600)return Math.round(s/60)+' min fa';if(s<86400)return Math.round(s/3600)+' h fa';return Math.round(s/86400)+' giorni fa'}
  return {glyph,marker,spotlight,closeSpot,bubble,closeBubble,ago,addImages,get spotOpen(){return !!spot}};
})();
