/* Sentinella — mappa vettoriale (MapLibre + OpenFreeMap), stili chiaro/scuro/satellite, livelli dati, posizione fluida a 60 fps. */
'use strict';
const MapView = App.Map = (()=>{
  const OFM='https://tiles.openfreemap.org/styles/liberty';
  let baseStyle=null,map=null,ready=false;
  const data={cams:{type:'FeatureCollection',features:[]},tuts:{type:'FeatureCollection',features:[]},route:{type:'FeatureCollection',features:[]},routeHead:{type:'FeatureCollection',features:[]},alts:{type:'FeatureCollection',features:[]},pois:{type:'FeatureCollection',features:[]},tutAct:{type:'FeatureCollection',features:[]}};

  /* ---------- stile ---------- */
  const DARK={background:'#121417',water:'#0E2233',waterway:'#16354D',park:'#132219',wood:'#122019',grass:'#141f17',residential:'#16191E',landuse:'#17191d',building:'#1F242B',b3d:'#262C34',
    casing:'#0B0D10',motorway:'#8C6B3E',trunk:'#5C5F66',primary:'#4C5058',secondary:'#40444B',minor:'#2E3238',service:'#26292E',rail:'#33363c',path:'#3a3d44',label:'#C9CED6',halo:'#0B0D10',boundary:'#4a4f57'};
  function darken(st){const s=JSON.parse(JSON.stringify(st));
    for(const l of s.layers){const id=l.id,p=l.paint=l.paint||{};
      if(l.type==='background')p['background-color']=DARK.background;
      else if(l.type==='raster'&&id==='natural_earth'){p['raster-opacity']=0.25;p['raster-brightness-max']=0.35}
      else if(l.type==='fill'){
        if(/water/.test(id))p['fill-color']=DARK.water;
        else if(/park/.test(id))p['fill-color']=DARK.park;
        else if(/wood|forest/.test(id))p['fill-color']=DARK.wood;
        else if(/grass|wetland|pitch|track|cemetery/.test(id))p['fill-color']=DARK.grass;
        else if(/residential/.test(id))p['fill-color']=DARK.residential;
        else if(/building/.test(id)){p['fill-color']=DARK.building;p['fill-outline-color']='#2A3038'}
        else if(/sand|ice/.test(id))p['fill-color']='#1e2024';
        else if(/aeroway/.test(id))p['fill-color']='#1b1e23';
        else if(/road_area/.test(id))p['fill-opacity']=0.2;
        else p['fill-color']=DARK.landuse;
        delete p['fill-pattern'];
      }
      else if(l.type==='fill-extrusion'){p['fill-extrusion-color']=DARK.b3d;p['fill-extrusion-opacity']=0.85}
      else if(l.type==='line'){
        if(/waterway/.test(id))p['line-color']=DARK.waterway;
        else if(/casing/.test(id))p['line-color']=DARK.casing;
        else if(/motorway/.test(id))p['line-color']=DARK.motorway;
        else if(/trunk_primary|trunk/.test(id))p['line-color']=DARK.trunk;
        else if(/secondary_tertiary/.test(id))p['line-color']=DARK.secondary;
        else if(/minor|street|link/.test(id))p['line-color']=DARK.minor;
        else if(/service|track/.test(id))p['line-color']=DARK.service;
        else if(/rail/.test(id))p['line-color']=DARK.rail;
        else if(/path|pedestrian/.test(id))p['line-color']=DARK.path;
        else if(/boundary/.test(id))p['line-color']=DARK.boundary;
        else if(/park_outline/.test(id))p['line-color']='#1d2d22';
        else if(/aeroway/.test(id))p['line-color']='#2a2d33';
      }
      else if(l.type==='symbol'){if(l.layout&&l.layout['text-field']){p['text-color']=/water/.test(id)?'#5d86a8':DARK.label;p['text-halo-color']=DARK.halo;p['text-halo-width']=1.2}}
    }
    return s}
  function satStyle(){return {version:8,glyphs:baseStyle?baseStyle.glyphs:'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',sprite:baseStyle?baseStyle.sprite:undefined,
    sources:Object.assign({sat:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:19,attribution:'Immagini © Esri, Maxar, Earthstar Geographics'}},baseStyle?{openmaptiles:baseStyle.sources.openmaptiles}:{}),
    layers:[{id:'background',type:'background',paint:{'background-color':'#000'}},{id:'sat',type:'raster',source:'sat'}].concat(baseStyle?baseStyle.layers.filter(l=>l.type==='symbol'&&/label|name|shield/.test(l.id)).map(l=>{const c=JSON.parse(JSON.stringify(l));c.paint=Object.assign({},c.paint,{'text-color':'#fff','text-halo-color':'rgba(0,0,0,.75)','text-halo-width':1.4});return c}):[])}}
  function rasterFallback(){const dark=App.isDark();return {version:8,glyphs:'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,attribution:'© OpenStreetMap'}},
    layers:[{id:'background',type:'background',paint:{'background-color':dark?'#121417':'#eee'}},{id:'osm',type:'raster',source:'osm',paint:dark?{'raster-saturation':-0.7,'raster-brightness-max':0.55,'raster-contrast':0.1,'raster-hue-rotate':180}:{}}]}}
  // mappa TomTom (Map Display, riquadri raster in alta definizione) e colori del traffico sulle strade
  const TTOK=()=>App.S.tomtomKey&&App.TT&&App.TT.can('tiles');
  function ttStyle(){const k=encodeURIComponent(App.S.tomtomKey),st=App.isDark()?'night':'main';
    return {version:8,glyphs:baseStyle?baseStyle.glyphs:'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',sprite:baseStyle?baseStyle.sprite:undefined,
      sources:{tt:{type:'raster',tiles:['a','b','c','d'].map(h=>`https://${h}.api.tomtom.com/map/1/tile/basic/${st}/{z}/{x}/{y}.png?key=${k}&tileSize=512&language=it-IT&view=Unified`),tileSize:256,maxzoom:22,attribution:'© TomTom'}},
      layers:[{id:'background',type:'background',paint:{'background-color':App.isDark()?'#1d2a36':'#f1efe9'}},{id:'tt',type:'raster',source:'tt'}]}}
  function addFlow(s){if(!App.S.ttFlow||!TTOK())return s;const k=encodeURIComponent(App.S.tomtomKey),dark=App.isDark()||App.S.mapType==='sat';
    s.sources.ttflow={type:'raster',tiles:['a','b','c','d'].map(h=>`https://${h}.api.tomtom.com/traffic/map/4/tile/flow/${dark?'relative0-dark':'relative0'}/{z}/{x}/{y}.png?key=${k}&tileSize=512&thickness=${dark?8:6}`),tileSize:256,minzoom:6,maxzoom:22,attribution:'Traffico © TomTom'};
    const lay={id:'ttflow',type:'raster',source:'ttflow',minzoom:6,paint:{'raster-opacity':['interpolate',['linear'],['zoom'],6,0.65,12,0.9]}};const i=s.layers.findIndex(l=>l.type==='symbol');if(i<0)s.layers.push(lay);else s.layers.splice(i,0,lay);return s}
  function buildStyle(){return addFlow(buildStyle0())}
  function buildStyle0(){if(App.S.mapType==='tt'&&TTOK())return ttStyle();if(App.S.mapType==='sat')return satStyle();if(!baseStyle)return rasterFallback();
    const s=App.isDark()?darken(baseStyle):JSON.parse(JSON.stringify(baseStyle));
    const b=s.layers.find(l=>l.id==='building-3d');if(b){b.layout=Object.assign({},b.layout,{visibility:App.S.buildings3d?'visible':'none'})}
    // punti di interesse più visibili: rimuovo il filtro di rango sui POI
    for(const l of s.layers)if(/^poi_r(1|7|20)$/.test(l.id)){l.minzoom=Math.min(l.minzoom||14,l.id==='poi_r1'?14:15)}
    return s}
  async function loadBase(){const cached=Store.get('ofm',null);
    try{const r=await API.tfetch(OFM,{},10000);if(!r.ok)throw 0;baseStyle=await r.json();try{localStorage.setItem('snt.ofm',JSON.stringify(baseStyle))}catch(e){}}
    catch(e){baseStyle=cached}}

  /* ---------- icone disegnate ---------- */
  function canvasIcon(w,h,draw){const r=2,c=document.createElement('canvas');c.width=w*r;c.height=h*r;const x=c.getContext('2d');x.scale(r,r);draw(x);return {img:x.getImageData(0,0,w*r,h*r),ratio:r}}
  function rr(x,X,Y,W,H,R){x.beginPath();x.moveTo(X+R,Y);x.arcTo(X+W,Y,X+W,Y+H,R);x.arcTo(X+W,Y+H,X,Y+H,R);x.arcTo(X,Y+H,X,Y,R);x.arcTo(X,Y,X+W,Y,R);x.closePath()}
  function camIcon(color){return canvasIcon(30,30,x=>{x.shadowColor='rgba(0,0,0,.35)';x.shadowBlur=4;x.shadowOffsetY=1;rr(x,3,3,24,24,7);x.fillStyle=color;x.fill();x.shadowColor='transparent';x.lineWidth=2;x.strokeStyle='#fff';x.stroke();
    x.fillStyle='#fff';rr(x,8,11,11,9,2);x.fill();x.beginPath();x.moveTo(19,14);x.lineTo(23,12);x.lineTo(23,19);x.lineTo(19,17);x.closePath();x.fill();x.fillStyle=color;x.beginPath();x.arc(13.5,15.5,2.2,0,7);x.fill()})}
  function tutIcon(){return canvasIcon(30,30,x=>{x.shadowColor='rgba(0,0,0,.35)';x.shadowBlur=4;x.shadowOffsetY=1;rr(x,3,3,24,24,7);x.fillStyle='#FF9500';x.fill();x.shadowColor='transparent';x.lineWidth=2;x.strokeStyle='#fff';x.stroke();x.fillStyle='#fff';x.font='800 15px -apple-system,system-ui,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('T',15,16)})}
  function poiIcon(cat){return canvasIcon(34,42,x=>{x.shadowColor='rgba(0,0,0,.35)';x.shadowBlur=5;x.shadowOffsetY=2;x.beginPath();x.arc(17,16,13,Math.PI*0.82,Math.PI*2.18);x.lineTo(17,38);x.closePath();x.fillStyle=cat.c;x.fill();x.shadowColor='transparent';x.lineWidth=2;x.strokeStyle='#fff';x.stroke();
    const p=new Path2D(cat.i);x.save();x.translate(9,8);x.scale(0.667,0.667);x.strokeStyle='#fff';x.lineWidth=3;x.lineCap='round';x.lineJoin='round';x.stroke(p);x.restore()})}
  function ensureImages(){const add=(id,o)=>{if(!map.hasImage(id))map.addImage(id,o.img,{pixelRatio:o.ratio})};
    add('snt-cam',camIcon('#E1251B'));add('snt-cam-off',camIcon('#8E8E93'));add('snt-cam-mob',camIcon('#007AFF'));add('snt-cam-unk',camIcon('#FF9500'));add('snt-tut',tutIcon());
    for(const c of App.CATS)add('snt-poi-'+c.k,poiIcon(c))}

  /* ---------- livelli ---------- */
  function addLayers(){ensureImages();const dark=App.isDark();
    const src=(id)=>{if(!map.getSource(id))map.addSource(id,{type:'geojson',data:data[id]})};
    ['alts','route','routeHead','tuts','tutAct','cams','pois'].forEach(src);
    const before=map.getLayer('highway-name-path')?'highway-name-path':undefined;
    map.addLayer({id:'alts-case',type:'line',source:'alts',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':dark?'#2b2b2e':'#fff','line-width':['interpolate',['linear'],['zoom'],8,6,16,14]}},before);
    map.addLayer({id:'alts-line',type:'line',source:'alts',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':dark?'#5E6E85':'#9DB4D6','line-width':['interpolate',['linear'],['zoom'],8,3.5,16,9]}},before);
    map.addLayer({id:'route-case',type:'line',source:'route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':dark?'#0A2A55':'#0A4FB0','line-width':['interpolate',['linear'],['zoom'],8,7,16,16]}},before);
    map.addLayer({id:'route-line',type:'line',source:'route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':['case',['==',['get','k'],'toll'],dark?'#3FA0FF':'#1E8BFF','#0A84FF'],'line-width':['interpolate',['linear'],['zoom'],8,4.5,16,11]}},before);
    // tratto tra la freccia e il resto del percorso: ridisegnato a ogni fotogramma, così la linea parte sempre dalla freccia
    map.addLayer({id:'rhead-case',type:'line',source:'routeHead',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':dark?'#0A2A55':'#0A4FB0','line-width':['interpolate',['linear'],['zoom'],8,7,16,16]}},before);
    map.addLayer({id:'rhead-line',type:'line',source:'routeHead',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#0A84FF','line-width':['interpolate',['linear'],['zoom'],8,4.5,16,11]}},before);
    map.addLayer({id:'route-done',type:'line',source:'route',filter:['==',['get','k'],'done'],layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':dark?'#3a3a3c':'#B8C2CF','line-width':['interpolate',['linear'],['zoom'],8,4.5,16,11]}},before);
    map.addLayer({id:'tuts-line',type:'line',source:'tuts',minzoom:7,layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#FF9500','line-opacity':['case',['get','off'],0.3,0.85],'line-width':['interpolate',['linear'],['zoom'],7,2,15,6],'line-dasharray':[2,1.2]}});
    map.addLayer({id:'tutAct-line',type:'line',source:'tutAct',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#FF9500','line-width':['interpolate',['linear'],['zoom'],7,4,15,10],'line-opacity':0.9}});
    map.addLayer({id:'tuts-lbl',type:'symbol',source:'tuts',minzoom:9,filter:['==',['get','pt'],1],layout:{'icon-image':'snt-tut','icon-size':0.95,'text-field':['get','lbl'],'text-font':['Noto Sans Bold'],'text-size':11,'text-offset':[0,1.5],'text-anchor':'top','icon-allow-overlap':true},paint:{'text-color':dark?'#FFB340':'#B35F00','text-halo-color':dark?'#000':'#fff','text-halo-width':1.4}});
    map.addLayer({id:'cams-dot',type:'circle',source:'cams',maxzoom:10.5,paint:{'circle-radius':['interpolate',['linear'],['zoom'],5,1.6,10,4],'circle-color':['match',['get','s'],'off','#8E8E93','mob','#007AFF','unk','#FF9500','#E1251B'],'circle-stroke-width':1,'circle-stroke-color':'#fff'}});
    map.addLayer({id:'cams-ic',type:'symbol',source:'cams',minzoom:10.5,layout:{'icon-image':['match',['get','s'],'off','snt-cam-off','mob','snt-cam-mob','unk','snt-cam-unk','snt-cam'],'icon-size':['interpolate',['linear'],['zoom'],10.5,0.75,16,1],'icon-allow-overlap':true,'text-field':['case',['>',['get','l'],0],['to-string',['get','l']],''],'text-font':['Noto Sans Bold'],'text-size':11,'text-offset':[0,1.45],'text-anchor':'top','text-optional':true},paint:{'text-color':dark?'#FF8A80':'#C4170F','text-halo-color':dark?'#000':'#fff','text-halo-width':1.4}});
    map.addLayer({id:'pois-ic',type:'symbol',source:'pois',layout:{'icon-image':['concat','snt-poi-',['get','c']],'icon-anchor':'bottom','icon-allow-overlap':true,'text-field':['get','n'],'text-font':['Noto Sans Regular'],'text-size':12,'text-offset':[0,0.3],'text-anchor':'top','text-optional':true,'text-max-width':9},paint:{'text-color':dark?'#fff':'#222','text-halo-color':dark?'#000':'#fff','text-halo-width':1.5}});
    ['cams-ic','cams-dot'].forEach(id=>{map.on('click',id,e=>{const f=e.features[0];App.emit('camTap',f.properties.id)});map.on('mouseenter',id,()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave',id,()=>map.getCanvas().style.cursor='')});
    map.on('click','pois-ic',e=>App.emit('poiTap',e.features[0].properties.id));
    map.on('click','tuts-line',e=>App.emit('tutTap',e.features[0].properties.id));
    map.on('click','alts-line',e=>App.emit('altTap',e.features[0].properties.i));
  }
  function setData(id,fc){data[id]=fc;if(map&&map.getSource(id))map.getSource(id).setData(fc)}

  /* ---------- posizione e camera ----------
     La mappa segue la posizione solo quando l'utente non la tocca: durante un gesto (trascinare, pizzicare,
     ruotare, rotella) la camera non viene mai riposizionata, così i gesti non vengono interrotti.
     A fine gesto: se la posizione è stata spostata lontano dal centro si passa a «libera», altrimenti
     si resta in modalità segui adottando lo zoom scelto dall'utente. */
  let puck=null,puckEl=null,disp=null,dispHd=0,camMode='free',prevMode='follow',lastFrame=0,freeSince=0,zoomS=16,navPitch=55,navZoomOff=0;
  let touching=0,wheelT=0,gestRot=false,gestPan=false,lastBr=null;
  function makePuck(){puckEl=document.createElement('div');puckEl.className='puck';
    puckEl.innerHTML='<div class="halo"></div><div class="cone"></div><div class="dot"></div><svg class="arrow" viewBox="0 0 48 48"><defs><filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".4"/></filter></defs><path d="M24 5l14 34-14-8-14 8z" fill="#0A84FF" stroke="#fff" stroke-width="3" stroke-linejoin="round" filter="url(#sh)"/></svg>';
    puck=new maplibregl.Marker({element:puckEl,rotationAlignment:'map',pitchAlignment:'map'}).setLngLat([0,0])}
  function padFor(m){const H=innerHeight,vis=Sheet.visible();return m==='nav'?{top:Math.round(H*0.42),bottom:Math.max(40,Math.min(vis,H*0.35)),left:0,right:0}:{top:0,bottom:Math.max(0,Math.min(vis,H*0.6)),left:0,right:0}}
  // zoom con pizzico/rotella/doppio tocco attorno al centro quando si segue la posizione, attorno al dito quando la mappa è libera
  function setAround(){if(!map)return;const c=camMode!=='free'?{around:'center'}:undefined;
    map.touchZoomRotate.enable(c);map.scrollZoom.enable(c);map.touchZoomRotate.enableRotation()}
  function setCam(m){if(m!=='free')prevMode=m;else if(camMode!=='free')freeSince=performance.now();
    camMode=m;navZoomOff=m==='nav'?navZoomOff:0;
    const b=$('#cLocate');if(b){b.innerHTML=`<svg><use href="#${m==='heading'?'i-heading':m==='follow'?'i-locate-on':'i-locate'}"/></svg>`;b.classList.toggle('on',m!=='free')}
    puckEl&&puckEl.classList.toggle('nav',m==='nav');
    if(!map){App.emit('cam',m);return}
    setAround();
    const f=App.state.fix;const o={padding:padFor(m),duration:600};
    if(m==='nav')Object.assign(o,{pitch:navPitch});
    else if(m==='follow')Object.assign(o,{bearing:0,pitch:0},map.getZoom()<12?{zoom:15.5}:{});
    else if(m==='heading')Object.assign(o,{pitch:45},map.getZoom()<12?{zoom:16}:{},dispHd!=null?{bearing:dispHd}:{});
    if(m!=='free'){if(f){o.center=[(disp||f).lon,(disp||f).lat]}busy(650);map.easeTo(o)}
    App.emit('cam',m)}
  function busy(ms){App.state.mapBusy=true;clearTimeout(busy.t);busy.t=setTimeout(()=>{App.state.mapBusy=false},ms)}
  function updatePadding(){if(!map||App.state.mapBusy||touching)return;map.setPadding(padFor(camMode==='nav'?'nav':'x'))}
  function zoomFor(spd){const k=(spd||0)*3.6;return camMode==='nav'?(k>100?15.2:k>70?15.8:k>40?16.4:17.1):(k>90?14.5:k>50?15.5:16.2)}
  const gesturing=()=>touching>0||performance.now()-wheelT<350;
  // fine gesto: decido se restare agganciato alla posizione
  function gestureEnd(){if(!map||camMode==='free'||!disp){gestRot=gestPan=false;return}
    const p=map.project([disp.lon,disp.lat]),c=map.getCanvas(),pad=map.getPadding();
    const cx=(c.clientWidth+pad.left-pad.right)/2,cy=(c.clientHeight+pad.top-pad.bottom)/2;
    const off=Math.hypot(p.x-cx,p.y-cy);
    if((gestPan&&off>70)||(gestRot&&camMode!=='follow')){setCam('free');App.emit('userPan')}
    else{if(camMode==='nav')navZoomOff=Math.max(-3,Math.min(2.5,map.getZoom()-zoomS));
      busy(320);map.easeTo({center:[disp.lon,disp.lat],duration:300})}
    gestRot=gestPan=false}
  function frame(t){requestAnimationFrame(frame);if(!map)return;
    const cb=$('#cCompass');if(cb){const br=map.getBearing();const show=Math.abs(br)>1.5&&!App.state.navigating;
      cb.classList.toggle('hidden',!show);if(show&&br!==lastBr){cb.firstElementChild.style.transform=`rotate(${-br}deg)`;lastBr=br}}
    const f=App.state.fix;if(!f)return;const dt=Math.min(0.1,(t-lastFrame)/1000||0.016);lastFrame=t;
    // previsione tra un fix e l'altro: niente scatti
    let plat=f.lat,plon=f.lon;const hd=App.state.hd;
    if(f.spd>1.2&&hd!=null&&App.state.hdSrc==='gps'){const ah=Math.min(1.3,(performance.now()-f.recv)/1000);const p=G.dest(f.lat,f.lon,hd,f.spd*ah);plat=p[0];plon=p[1]}
    if(!disp||G.dist(disp.lat,disp.lon,plat,plon)>400){disp={lat:plat,lon:plon};dispHd=hd||0}
    const k=1-Math.exp(-dt/0.16);disp.lat+=(plat-disp.lat)*k;disp.lon+=(plon-disp.lon)*k;
    if(hd!=null)dispHd=(dispHd+G.sdiff(dispHd,hd)*(1-Math.exp(-dt/(App.state.hdSrc==='compass'?0.3:0.22)))+360)%360;
    puck.setLngLat([disp.lon,disp.lat]);puck.setRotation(dispHd);
    if(App.state.navigating&&App.Nav.drawHead&&t-(frame.hT||0)>45){frame.hT=t;App.Nav.drawHead(disp)}
    puckEl.style.setProperty('--cone',hd!=null&&(f.spd>0.8||App.state.hdSrc==='compass')?1:0);
    const pxPerM=map.getZoom()>3?(1/(156543.03*Math.cos(G.rad(disp.lat))/2**map.getZoom())):0;
    puckEl.style.setProperty('--acc',Math.max(24,Math.min(300,(f.acc||20)*2*pxPerM))+'px');
    if(camMode!=='free'&&!App.state.mapBusy&&!gesturing()&&!map.isMoving()){
      const o={center:[disp.lon,disp.lat]};
      if(camMode==='heading'||camMode==='nav'){const br=map.getBearing();if(Math.abs(G.sdiff(br,dispHd))>0.3)o.bearing=dispHd}
      if(camMode==='nav'){const zt=zoomFor(f.spd);zoomS+=(zt-zoomS)*(1-Math.exp(-dt/1.2));o.zoom=Math.max(3,Math.min(19,zoomS+navZoomOff));o.pitch=navPitch}
      map.jumpTo(o)}
    // ripresa automatica in guida e in navigazione dopo 10 s senza tocchi
    if(camMode==='free'&&(App.state.navigating||App.state.driving)&&freeSince&&!gesturing()&&performance.now()-freeSince>10000){freeSince=0;setCam(App.state.navigating?'nav':prevMode==='nav'?'heading':prevMode)}}

  /* ---------- avvio ---------- */
  async function init(center){await loadBase();
    map=new maplibregl.Map({container:'map',style:buildStyle(),center:center?[center.lon,center.lat]:[12.6,42.2],zoom:center?14:5.3,attributionControl:false,maxPitch:70,transformRequest:url=>{if(/api\.tomtom\.com\/(map\/1\/tile|traffic\/map\/4\/tile)\//.test(url)&&App.TT)App.TT.use('tiles');return {url}},fadeDuration:150,dragRotate:true,pitchWithRotate:true,touchPitch:true});
    map.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-right');
    map.touchZoomRotate.enableRotation();
    makePuck();
    // tocchi letti prima di MapLibre: durante un gesto la camera non si muove da sola
    const cont=map.getCanvasContainer();
    const tch=e=>{touching=e.touches?e.touches.length:0;if(touching){if(camMode==='free')freeSince=performance.now()}else gestureEnd()};
    cont.addEventListener('touchstart',tch,{passive:true,capture:true});cont.addEventListener('touchend',tch,{passive:true,capture:true});cont.addEventListener('touchcancel',tch,{passive:true,capture:true});
    cont.addEventListener('mousedown',()=>{touching=1;const up=()=>{touching=0;removeEventListener('mouseup',up);gestureEnd()};addEventListener('mouseup',up)},{capture:true});
    cont.addEventListener('wheel',()=>{wheelT=performance.now();clearTimeout(wheelT.t);wheelT.t=setTimeout(gestureEnd,360)},{passive:true,capture:true});
    map.on('load',()=>{const a=document.querySelector('.maplibregl-ctrl-attrib');if(a){a.classList.remove('maplibregl-compact-show');a.removeAttribute('open')}});
    map.on('style.load',()=>{addLayers();ready=true;App.emit('mapReady')});
    map.on('styleimagemissing',e=>{if(/^snt-/.test(e.id))ensureImages()});
    map.on('dragstart',e=>{if(e.originalEvent)gestPan=true});
    map.on('rotatestart',e=>{if(e.originalEvent)gestRot=true});
    map.on('movestart',e=>{if(e.originalEvent&&camMode==='free')freeSince=performance.now()});
    map.on('error',e=>{if(!baseStyle&&/openfreemap|openstreetmap/.test(String(e.error&&e.error.message)))console.warn(e)});
    // pressione prolungata = segnaposto
    let lpT=0,lpPos=null;
    map.on('touchstart',e=>{if(e.originalEvent.touches.length!==1)return;lpPos=e.point;clearTimeout(lpT);lpT=setTimeout(()=>{App.Voice.buzz(12);App.emit('longPress',e.lngLat)},550)});
    map.on('touchmove',e=>{if(lpPos&&(Math.abs(e.point.x-lpPos.x)>8||Math.abs(e.point.y-lpPos.y)>8))clearTimeout(lpT)});
    map.on('touchend',()=>clearTimeout(lpT));map.on('touchcancel',()=>clearTimeout(lpT));
    map.on('contextmenu',e=>App.emit('longPress',e.lngLat));
    Sheet.onMove(()=>{if(camMode!=='free')updatePadding()});
    requestAnimationFrame(frame);
    $('#cLocate').onclick=()=>{App.Compass&&App.Compass.ask();if(!App.state.fix){App.emit('needGps');return}setCam(camMode==='follow'?'heading':'follow');if(!puck._map)puck.addTo(map)};
    $('#cCompass').onclick=()=>{App.Compass&&App.Compass.ask();if(camMode==='heading'||camMode==='nav')setCam('follow');else{busy(450);map.easeTo({bearing:0,pitch:0,duration:400})}};
    $('#cLayers').onclick=()=>App.emit('layers');
    App.on('theme',restyle);
  }
  function restyle(){if(!map)return;ready=false;map.setStyle(buildStyle(),{diff:false})}
  function showPuck(){if(puck&&!puck._map)puck.addTo(map)}
  function fit(bounds,opt={}){setCam('free');const H=innerHeight,vis=Sheet.visible();map.fitBounds(bounds,Object.assign({padding:{top:Math.max(70,H*0.08),bottom:Math.min(vis,H*0.62)+30,left:40,right:40},duration:700,maxZoom:16},opt))}
  function flyTo(lat,lon,z=15.5){map.easeTo({center:[lon,lat],zoom:Math.max(map.getZoom(),z),duration:700})}
  return {init,restyle,setData,setCam,get ready(){return ready&&!!map&&!!map.style},get cam(){return camMode},showPuck,fit,flyTo,get map(){return map},updatePadding,get disp(){return disp}};
})();
