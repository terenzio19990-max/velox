/* Sentinella — vista incrocio: agli svincoli e alle biforcazioni veloci compare un disegno grande delle carreggiate in prospettiva,
   con la diramazione giusta illuminata, il cartello (verde in autostrada, blu sulle altre) e la barra della distanza. */
'use strict';
const Junction = App.Junction = (()=>{
  const EXIT=new Set([18,19,20,21,23,24]);
  const RIGHT=new Set([18,20,23]);
  let shownFor=null,lastPrevHw=false;
  function signInfo(m){const s=m.sign||{};const tx=a=>(a||[]).map(x=>x.text||x).filter(Boolean);
    const num=tx(s.exit_number_elements)[0]||(m.type===20||m.type===21?(m.exits||''):'');
    const branch=tx(s.exit_branch_elements).slice(0,2),toward=tx(s.exit_toward_elements).slice(0,2);
    if(s.text&&!toward.length)toward.push(...String(s.text).split(/[,/]/).map(x=>x.trim()).filter(Boolean).slice(0,2));
    if(!toward.length&&m.street)toward.push(...m.street.split(' · ').slice(0,2));
    return {num:num?String(num):'',branch,toward}}
  function svg(m,hw){const right=RIGHT.has(m.type);const n=Math.max(2,Math.min(4,(m.lanes&&m.lanes.length?m.lanes.length-1:3)));
    // prospettiva: punto di fuga (180,58); la carreggiata principale va dritta, la diramazione curva verso destra (sinistra = specchio)
    const lanes=[];for(let i=1;i<n;i++){const xb=24+(212-24)*i/n,xt=166+(190-166)*i/n;lanes.push(`<path d="M${xb} 200L${xt} 64" stroke="#fff" stroke-width="2.4" stroke-dasharray="14 14" opacity=".75"/>`)}
    const main='M24 200L166 64L190 64L212 200Z';const exitP='M222 200C238 150 262 108 300 74L318 76C292 112 274 152 268 200Z';
    const gore='M212 200L190 64L196 64C214 110 220 150 222 200Z';
    const hiMain=false,hiExit=true;
    const arrowExit=`<path d="M246 196C254 156 270 124 296 96" stroke="url(#jvA)" stroke-width="15" fill="none" stroke-linecap="round"/><path d="M308 84L282 92L300 112Z" fill="#E0FBFF"/>`;
    const arrowMain=`<path d="M118 196L176 90" stroke="url(#jvA)" stroke-width="15" fill="none" stroke-linecap="round"/><path d="M182 76L164 96L188 102Z" fill="#E0FBFF"/>`;
    const body=`<path d="${main}" fill="${hiMain?'url(#jvH)':'url(#jvR)'}"/><path d="${exitP}" fill="${hiExit?'url(#jvH)':'url(#jvR)'}"/><path d="${gore}" fill="#1a2238"/>
      <path d="M212 200L190 64M222 200C220 150 214 110 196 64" stroke="#fff" stroke-width="2.2" opacity=".9"/>
      ${[0,1,2,3].map(i=>`<path d="M${213+i*1.5} ${196-i*30}l${6-i} ${-12+i*2}" stroke="#F4F4F5" stroke-width="2" opacity="${0.8-i*0.15}"/>`).join('')}
      <path d="M24 200L166 64M268 200C274 152 292 112 318 76" stroke="#fff" stroke-width="3"/>${lanes.join('')}${hiExit?arrowExit:arrowMain}`;
    return `<svg viewBox="0 0 360 200" preserveAspectRatio="xMidYMax slice"><defs>
      <linearGradient id="jvS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B1630"/><stop offset="1" stop-color="#25406E"/></linearGradient>
      <linearGradient id="jvG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1F3A2A"/><stop offset="1" stop-color="#0E1A14"/></linearGradient>
      <linearGradient id="jvR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3A4256"/><stop offset="1" stop-color="#22283A"/></linearGradient>
      <linearGradient id="jvH" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1E6FD9"/><stop offset="1" stop-color="#0B3E8A"/></linearGradient>
      <linearGradient id="jvA" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#22D3EE" stop-opacity=".25"/><stop offset="1" stop-color="#E0FBFF"/></linearGradient></defs>
      <rect width="360" height="64" fill="url(#jvS)"/><rect y="62" width="360" height="138" fill="url(#jvG)"/>
      <g ${right?'':'transform="translate(360 0) scale(-1 1)"'}>${body}</g></svg>`}
  function signHtml(m,hw){const s=signInfo(m);const right=RIGHT.has(m.type);
    return `<div class="jv-sign ${hw?'hw':'ord'}">${s.num?`<b class="jv-num">${esc(s.num)}</b>`:''}<div class="jv-st">${s.branch.length?`<div class="jv-refs">${s.branch.map(r=>`<span class="${/^A\s?\d/.test(r)?'a':/^E\s?\d/.test(r)?'e':'s'}">${esc(r)}</span>`).join('')}</div>`:''}<div class="jv-tw">${esc(s.toward.join(' · ')||m.text||'')}</div></div><svg class="jv-arr" viewBox="0 0 24 24" style="${right?'':'transform:scaleX(-1)'}"><path d="M7 17L17 7M9 7h8v8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`}
  function el(){let e=$('#jv');if(!e){const t=$('#navTop');if(!t)return null;t.insertAdjacentHTML('beforeend','<div class="jv hidden" id="jv"><div class="jv-pic" id="jvPic"></div><div class="jv-bar"><i id="jvBar"></i></div><b class="jv-d" id="jvD"></b></div>');e=$('#jv')}return e}
  App.on('man',({m,dist})=>{const e=el();if(!e)return;const f=App.state.fix||{};const fast=(f.spd||0)>15;const hw=!!(m&&(m.hw||lastPrevHw))||fast&&(f.spd||0)>22;
    const show=App.S.junctionView!==false&&m&&EXIT.has(m.type)&&(m.type===20||m.type===21||fast||m.hw||lastPrevHw)&&dist<1000&&dist>15;
    if(!show){if(shownFor){e.classList.add('out');setTimeout(()=>{if(!shownFor)e.classList.add('hidden')},280)}shownFor=null;return}
    if(shownFor!==m){shownFor=m;$('#jvPic').innerHTML=svg(m,hw)+signHtml(m,hw);e.classList.remove('hidden','out');e.classList.add('in');setTimeout(()=>e.classList.remove('in'),450)}
    $('#jvBar').style.transform=`scaleX(${Math.max(0,Math.min(1,dist/1000)).toFixed(3)})`;$('#jvD').textContent=F.km(dist)});
  App.on('navMan',({k,rt})=>{const p=rt.man[k-1];lastPrevHw=!!(p&&p.hw)});
  App.on('navEnd',()=>{shownFor=null;const e=$('#jv');if(e)e.classList.add('hidden')});
  return {svg,signInfo};
})();
