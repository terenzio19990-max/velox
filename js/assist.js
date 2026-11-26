/* Sentinella — ricerca più comoda e voce su misura:
   · «Di solito a quest'ora»: dal diario capisco dove vai a quell'ora e in quel giorno e lo propongo in cima
   · microfono nella barra di ricerca
   · voce delle indicazioni: scelta tra le voci italiane del telefono, velocità, tono, volume, prova */
'use strict';
const Assist = App.Assist = (()=>{
  const S=App.S;
  /* ---------- suggerimenti per orario ---------- */
  function habits(){const D=App.Diary;if(!D||!D.trips||D.trips.length<3)return [];const now=new Date();const wk=d=>d.getDay()===0||d.getDay()===6;const h0=now.getHours()+now.getMinutes()/60;
    const cl=[];for(const t of D.trips){if(!t.g)continue;const p=G.decode(t.g,5);const e=p[p.length-1];const d=new Date(t.t0);const h=d.getHours()+d.getMinutes()/60;
      const dh=Math.min(Math.abs(h-h0),24-Math.abs(h-h0));const w=(dh<=1.5?1:dh<=3?0.35:0)*(wk(d)===wk(now)?1:0.3)*(Date.now()-t.t0<60*864e5?1:0.5);if(!w)continue;
      let c=cl.find(c=>G.dist(c.lat,c.lon,e[0],e[1])<300);if(!c){c={lat:e[0],lon:e[1],name:t.to||'',score:0,n:0,dur:[]};cl.push(c)}c.score+=w;c.n++;c.dur.push((t.t1-t.t0)/1000);if(!c.name&&t.to)c.name=t.to}
    const f=App.state.fix;return cl.filter(c=>c.score>=1.6&&c.n>=2&&(!f||G.dist(f.lat,f.lon,c.lat,c.lon)>400)).sort((a,b)=>b.score-a.score).slice(0,2).map(c=>{
      const fv=Store.get('favs',{home:null,work:null,list:[]});const near=p=>p&&G.dist(p.lat,p.lon,c.lat,c.lon)<250;const name=near(fv.home)?'Casa':near(fv.work)?'Lavoro':((fv.list||[]).find(near)||{}).name||c.name||'Destinazione abituale';
      c.dur.sort((a,b)=>a-b);return {name,lat:c.lat,lon:c.lon,dur:c.dur[c.dur.length>>1],n:c.n}})}
  function card(list){if(!list.length)return '';const h=new Date().getHours();
    return `<div class="sugg">${list.map((s,i)=>`<button class="sg" data-sg="${i}"><span class="sg-ic"><svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 4v5l3.5 2" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg></span><span class="sg-tx"><small>${h<12?'Di solito a quest\'ora del mattino':h<18?'Di solito a quest\'ora':'Di solito la sera'}</small><b>${esc(s.name)}</b></span><span class="sg-d">${F.dur(s.dur)}</span></button>`).join('')}</div>`}
  function go(s){Plan.reset({name:s.name,lat:s.lat,lon:s.lon});App.UI.openPlan()}
  const _home=App.UI.R.home;
  App.UI.R.home=function(){const o=_home.apply(this,arguments);if(!o||!o.html||App.state.navigating)return o;let L=[];try{L=habits()}catch(e){}if(!L.length)return o;
    const anchor='<div class="sec"><h3>Preferiti</h3>';if(o.html.includes(anchor))o.html=o.html.replace(anchor,card(L)+anchor);else o.html+=card(L);
    const b0=o.bind;o.bind=function(r){if(b0)b0.apply(this,arguments);(r||document).querySelectorAll('[data-sg]').forEach(b=>b.onclick=()=>go(L[+b.dataset.sg]))};return o};
  /* ---------- microfono nella ricerca ---------- */
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const _search=App.UI.R.search;
  App.UI.R.search=function(a){const o=_search.apply(this,arguments);if(!o||!SR)return o;
    o.html=o.html.replace('<button class="clear" id="sClr"','<button class="smic" id="sMic" aria-label="Cerca a voce"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button><button class="clear" id="sClr"');
    const b0=o.bind;o.bind=function(){if(b0)b0.apply(this,arguments);const m=$('#sMic'),q=$('#sq');if(!m||!q)return;
      m.onclick=e=>{e.preventDefault();let rec;try{rec=new SR();rec.lang='it-IT';rec.interimResults=true}catch(x){return}m.classList.add('on');q.placeholder='Ti ascolto…';try{speechSynthesis.cancel()}catch(x){}
        rec.onresult=ev=>{let t='';for(let i=0;i<ev.results.length;i++)t+=ev.results[i][0].transcript;q.value=t.replace(/^(cerca|portami a|vai a)\s+/i,'');q.dispatchEvent(new Event('input'))};
        rec.onend=()=>{m.classList.remove('on');q.placeholder='Cerca luoghi o indirizzi'};rec.onerror=()=>{m.classList.remove('on')};try{rec.start()}catch(x){m.classList.remove('on')}}};return o};
  /* ---------- voce ---------- */
  function itVoices(){try{return speechSynthesis.getVoices().filter(v=>/^it/i.test(v.lang))}catch(e){return []}}
  App.UI.R.voices=()=>{const vs=itVoices();const cur=S.voiceName||'';
    const sl=(k,l,min,max,step,def,fmt)=>`<div class="field vsl"><label>${l}<small id="vl_${k}">${fmt(S[k]??def)}</small></label><input type="range" min="${min}" max="${max}" step="${step}" value="${S[k]??def}" data-r="${k}" data-fmt="${k}"></div>`;
    const FM={voiceRate:v=>Math.round(v*100)+'%',voicePitch:v=>v<0.95?'più basso':v>1.05?'più alto':'normale',voiceVol:v=>Math.round(v*100)+'%'};
    return {detent:'full',html:`${App.UI.hdr('Voce delle indicazioni','Scegli quella che senti meglio in auto')}
      <div class="group">${App.UI.item({attr:'data-vn=""',color:cur?'#8E8E93':'var(--accent)',icon:'<svg viewBox="0 0 24 24" style="width:18px;height:18px"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',t1:'Automatica',t2:'La migliore voce italiana del telefono'+(cur?'':' · in uso')})}
        ${vs.map(v=>App.UI.item({attr:`data-vn="${esc(v.name)}"`,color:cur===v.name?'var(--accent)':'#8E8E93',icon:'<svg viewBox="0 0 24 24" style="width:18px;height:18px"><path d="M4 10v4h4l5 4V6L8 10H4zM16 9a4 4 0 010 6" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>',t1:esc(v.name.replace(/\s*\(.*\)/,'')),t2:(v.localService?'sul telefono':'in rete')+(/premium|enhanced|migliorata/i.test(v.name+v.voiceURI)?' · alta qualità':'')+(cur===v.name?' · in uso':''),chev:false})).join('')}
        ${vs.length?'':'<div class="empty">Il telefono non ha ancora caricato le voci: riapri questa schermata tra un momento.</div>'}</div>
      <div class="group" style="margin-top:12px">${sl('voiceRate','Velocità',0.7,1.4,0.02,1.04,FM.voiceRate)}${sl('voicePitch','Tono',0.7,1.3,0.05,1,FM.voicePitch)}${sl('voiceVol','Volume',0.3,1,0.05,1,FM.voiceVol)}</div>
      <button class="btn primary wide" id="vTry" style="margin-top:12px">Prova la voce</button>
      <p class="note">Le voci migliori su iPhone si scaricano gratis in Impostazioni › Accessibilità › Contenuto letto › Voci › Italiano (es. «Federica» o «Luca» migliorate). Il volume qui è relativo a quello del telefono.</p>`,
      bind(r){r.querySelectorAll('[data-vn]').forEach(b=>b.onclick=()=>{S.voiceName=b.dataset.vn||'';App.saveS();Voice.refresh&&Voice.refresh();test();App.UI.render()});
        r.querySelectorAll('[data-r]').forEach(i=>{i.oninput=()=>{S[i.dataset.r]=+i.value;$('#vl_'+i.dataset.r).textContent=FM[i.dataset.r](+i.value)};i.onchange=()=>{App.saveS();test()}});
        $('#vTry').onclick=test}}};
  function test(){Voice.prime();Voice.say('Tra 300 metri, svolta a destra in Via Garibaldi. Autovelox tra 500 metri, limite 50.',true)}
  // voce: riscrivo la scelta e la lettura per usare le impostazioni
  const pickVoice=()=>{const vs=itVoices();return (S.voiceName&&vs.find(v=>v.name===S.voiceName))||vs.find(v=>/premium|enhanced|migliorata/i.test(v.name+v.voiceURI))||vs.find(v=>/Alice|Federica|Luca|Paola|Emma/i.test(v.name))||vs[0]||null};
  let vc=null;Voice.refresh=()=>{vc=pickVoice()};try{speechSynthesis.addEventListener('voiceschanged',Voice.refresh)}catch(e){}setTimeout(Voice.refresh,800);
  const _say=Voice.say;
  Voice.say=(t,urgent)=>{if(!S.voice||!t)return;try{if(!vc)vc=pickVoice();if(urgent)speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.lang='it-IT';if(vc)u.voice=vc;
      u.rate=S.voiceRate??1.04;u.pitch=S.voicePitch??1;u.volume=S.voiceVol??1;speechSynthesis.speak(u)}catch(e){_say(t,urgent)}};
  // riga nelle impostazioni
  const _set=App.UI.R.settings;
  App.UI.R.settings=function(){const o=_set.apply(this,arguments);if(!o||!o.html)return o;const v=S.voiceName?S.voiceName.replace(/\s*\(.*\)/,''):'Automatica';
    const row=`<div class="group" style="margin-top:8px">${App.UI.item({attr:'id="setVoice"',color:'#5856D6',icon:'<svg viewBox="0 0 24 24" style="width:18px;height:18px"><path d="M4 10v4h4l5 4V6L8 10H4zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>',t1:'Voce delle indicazioni',t2:`${esc(v)} · velocità ${Math.round((S.voiceRate??1.04)*100)}%`,chev:true})}</div>`;
    const anchor='<div class="sec"><h3>Percorsi</h3></div>';if(o.html.includes(anchor))o.html=o.html.replace(anchor,row+anchor);
    const b0=o.bind;o.bind=function(){if(b0)b0.apply(this,arguments);const b=$('#setVoice');if(b)b.onclick=()=>App.UI.show('voices')};return o};
  return {habits,test};
})();
