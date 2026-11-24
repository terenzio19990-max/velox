// Sentinella — aggiorna i dati di autovelox (OpenStreetMap) e ricostruisce le tratte tutor ufficiali.
// Uso: node tools/aggiorna-dati.mjs [--solo-autovelox] [--solo-tutor]
// Gira da solo ogni settimana con GitHub Actions (vedi .github/workflows/aggiorna-dati.yml).
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OSMP = require(path.join(ROOT, 'js/osmproc.js'));
const args = new Set(process.argv.slice(2));
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const VALHALLA = 'https://valhalla1.openstreetmap.de';
const UA = {'User-Agent': 'Sentinella/2 (aggiornamento dati, github actions)'};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function overpass(q, tries = 10) {
  let wait = 15000;
  for (let i = 0; i < tries; i++) {
    const url = OVERPASS[i % OVERPASS.length];
    try {
      const r = await fetch(url, {method: 'POST', body: 'data=' + encodeURIComponent(q), headers: {'Content-Type': 'application/x-www-form-urlencoded', ...UA}, signal: AbortSignal.timeout(400000)});
      if (r.ok) return await r.json();
      log('Overpass', url, 'HTTP', r.status, '— riprovo tra', wait / 1000, 's');
    } catch (e) { log('Overpass errore', e.message); }
    await sleep(wait); wait = Math.min(wait * 2, 240000);
  }
  throw new Error('Overpass non disponibile');
}
async function valhalla(p, body, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(VALHALLA + '/' + p, {method: 'POST', body: JSON.stringify(body), headers: {'Content-Type': 'application/json', ...UA}, signal: AbortSignal.timeout(60000)});
      const j = await r.json();
      if (r.status === 429) { await sleep(5000 * (i + 1)); continue; }
      return j;
    } catch (e) { await sleep(3000 * (i + 1)); }
  }
  return {error: 'valhalla non raggiungibile'};
}
function decode(str, prec = 6) { const f = 10 ** prec, out = []; let i = 0, lat = 0, lon = 0; while (i < str.length) { let r = 0, s = 0, b; do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << s; s += 5; } while (b >= 32); lat += (r & 1) ? ~(r >> 1) : (r >> 1); r = 0; s = 0; do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << s; s += 5; } while (b >= 32); lon += (r & 1) ? ~(r >> 1) : (r >> 1); out.push([lat / f, lon / f]); } return out; }
const r5 = x => Math.round(x * 1e5) / 1e5;
function writeJs(file, varName, obj) {
  fs.writeFileSync(path.join(ROOT, file), `/* generato da tools/aggiorna-dati.mjs — non modificare a mano */\nwindow.${varName}=${JSON.stringify(obj)};\n`);
  log('scritto', file, (fs.statSync(path.join(ROOT, file)).size / 1024).toFixed(0), 'KB');
}

/* ---------------- autovelox ---------------- */
async function autovelox() {
  log('Scarico autovelox e tutor OSM per tutta Italia…');
  const q = '[out:json][timeout:300][maxsize:536870912];area["ISO3166-1"="IT"][admin_level=2]->.it;(node["highway"="speed_camera"](area.it);node["disused:highway"="speed_camera"](area.it);node["removed:highway"="speed_camera"](area.it););out body qt;relation["type"="enforcement"]["enforcement"~"^(maxspeed|average_speed)$"](area.it);out geom qt;';
  const js = await overpass(q);
  const d = OSMP.process(js);
  if (d.cams.length < 3000) throw new Error('troppi pochi autovelox (' + d.cams.length + '), non sovrascrivo');
  d.v = 1; d.ts = new Date().toISOString().slice(0, 10);
  writeJs('data/italia.js', 'SNT_DATA', d);
  log('autovelox:', d.cams.length, 'tutor OSM:', d.tuts.length);
}

/* ---------------- tutor ufficiali ---------------- */
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const REF = {'A1': 'A1', 'A1 Diramazione Roma Nord': 'A1dir', 'A1 Diramazione Roma Sud': 'A1dir', 'A1 Variante di Valico': 'A1var'};
function readCsv() {
  const lines = fs.readFileSync(path.join(ROOT, 'tools/tutor-ufficiali.csv'), 'utf8').trim().split('\n').slice(1);
  return lines.map((l, i) => {
    const [mw, a, ka, b, kb] = l.split(';');
    const clean = s => s.replace(/\s*Dir\.\s*(Nord|Sud|Est|Ovest)\s*$/i, '').trim();
    const dir = (a.match(/Dir\.\s*(Nord|Sud|Est|Ovest)/i) || [])[1] || '';
    return {i, mw, ref: REF[mw] || mw.split(' ')[0], grp: mw, a: clean(a), b: clean(b), ka: parseFloat(ka.replace(',', '.')), kb: parseFloat(kb.replace(',', '.')), dir};
  });
}
async function junctions(refs) {
  let q = '[out:json][timeout:300];area["ISO3166-1"="IT"][admin_level=2]->.it;';
  for (const r of refs) {
    const re = r === 'A1dir' ? 'A1 ?[Dd][Ii][Rr]' : r === 'A1var' ? 'A1 ?[Vv][Aa][Rr]' : r;
    q += `way["highway"~"^motorway"]["ref"~"(^|;)(${re})(;|$)"](area.it)->.w;(node(w.w)["highway"="motorway_junction"];node(w.w)["barrier"="toll_booth"];)->.n;make grp name="${r}";out;.n out body qt;`;
  }
  const js = await overpass(q);
  const out = {}; let cur = null;
  for (const e of js.elements) { if (e.type === 'grp') { cur = e.tags.name; out[cur] = []; continue; } if (cur && e.tags && (e.tags.name || e.tags.ref)) out[cur].push({lat: e.lat, lon: e.lon, name: e.tags.name || '', n: norm((e.tags.name || '') + ' ' + (e.tags.destination || '')), kind: e.tags.highway === 'motorway_junction' ? 'j' : 't'}); }
  return out;
}
function candidates(list, name) {
  const t = norm(name.replace(/^All\.\s*/i, '').replace(/-/g, ' '));
  const words = t.split(' ').filter(w => w.length > 2);
  return list.map(j => {
    let s = 0;
    if (j.n === t) s = 3; else if (j.n.startsWith(t + ' ') || j.n.endsWith(' ' + t)) s = 2.5; else if ((' ' + j.n + ' ').includes(' ' + t + ' ')) s = 2;
    else { const hit = words.filter(w => (' ' + j.n + ' ').includes(' ' + w + ' ')).length; if (words.length && hit === words.length) s = 1.5; }
    // "Nord"/"Sud"/"Est"/"Ovest" nel nome devono combaciare
    for (const k of ['nord', 'sud', 'est', 'ovest']) { const inT = t.split(' ').includes(k), inJ = j.n.split(' ').includes(k); if (inT !== inJ && s) s -= 1.2; }
    return {...j, s};
  }).filter(c => c.s >= 1.5).sort((a, b) => b.s - a.s);
}
async function routeKm(X, Y) {
  const h = OSMP.brg(X.lat, X.lon, Y.lat, Y.lon);
  const loc = (p, head) => ({lat: p.lat, lon: p.lon, type: 'break', heading: Math.round(head), heading_tolerance: 70, search_filter: {min_road_class: 'motorway'}});
  const j = await valhalla('route', {locations: [loc(X, h), loc(Y, h)], costing: 'auto', units: 'kilometers', directions_type: 'none'});
  if (!j.trip) return null;
  const g = decode(j.trip.legs[0].shape);
  return {g, P: OSMP.prep(g), shape: j.trip.legs[0].shape};
}
async function dominantLimit(shape) {
  const j = await valhalla('trace_attributes', {encoded_polyline: shape, shape_match: 'edge_walk', costing: 'auto', filters: {attributes: ['edge.speed_limit', 'edge.length', 'edge.road_class'], action: 'include'}});
  const acc = new Map();
  for (const e of (j.edges || [])) if (e.speed_limit && e.road_class === 'motorway') acc.set(e.speed_limit, (acc.get(e.speed_limit) || 0) + (e.length || 0));
  let best = 0, bl = 0; for (const [k, v] of acc) if (v > bl) { bl = v; best = k; }
  return best || 130;
}
async function tutor() {
  const rows = readCsv();
  const refs = [...new Set(rows.map(r => r.ref))];
  log('Scarico gli svincoli di', refs.join(', '));
  const J = await junctions(refs);
  const prev = (() => { try { const t = fs.readFileSync(path.join(ROOT, 'data/tutor.js'), 'utf8'); return JSON.parse(t.slice(t.indexOf('=') + 1).replace(/;\s*$/, '')); } catch (e) { return {tratte: []}; } })();
  const prevById = new Map((prev.tratte || []).map(t => [t.id, t]));
  // ancore per gruppo: nome -> punto scelto, coerente con i km
  const anchors = {};
  for (const grp of [...new Set(rows.map(r => r.grp))]) {
    const rs = rows.filter(r => r.grp === grp); const ref = rs[0].ref; const list = J[ref] || [];
    const names = new Map(); for (const r of rs) { if (!/^All\./i.test(r.a)) names.set(r.a, (names.get(r.a) || []).concat(r.ka)); if (!/^All\./i.test(r.b)) names.set(r.b, (names.get(r.b) || []).concat(r.kb)); }
    const items = [...names].map(([n, ks]) => ({n, km: ks.reduce((a, b) => a + b, 0) / ks.length, c: candidates(list, n)})).filter(x => x.c.length);
    const chosen = new Map();
    for (const it of items) { const top = it.c.filter(c => c.s >= it.c[0].s - 0.01); if (top.every(c => OSMP.dist(c.lat, c.lon, top[0].lat, top[0].lon) < 3000)) chosen.set(it.n, {...top[0], km: it.km}); }
    for (let pass = 0; pass < 4; pass++) for (const it of items) {
      if (chosen.has(it.n) && pass) continue;
      const ref2 = [...chosen.values()].filter(c => Math.abs(c.km - it.km) > 0.5).sort((a, b) => Math.abs(a.km - it.km) - Math.abs(b.km - it.km))[0];
      if (!ref2) { if (!chosen.has(it.n)) chosen.set(it.n, {...it.c[0], km: it.km}); continue; }
      const want = Math.abs(ref2.km - it.km) * 1000;
      const best = it.c.map(c => ({c, err: Math.abs(OSMP.dist(c.lat, c.lon, ref2.lat, ref2.lon) - want * 0.93) - c.s * 400})).sort((a, b) => a.err - b.err)[0];
      if (best && best.err < Math.max(4000, want * 0.35)) chosen.set(it.n, {...best.c, km: it.km});
    }
    anchors[grp] = chosen;
    log(grp, ':', chosen.size, 'svincoli su', names.size);
  }
  const out = []; let ok = 0, kept = 0, fail = 0;
  for (const r of rows) {
    const id = (r.ref + '-' + norm(r.a) + '-' + norm(r.b) + '-' + r.dir).replace(/\s+/g, '_');
    const lenM = Math.round(Math.abs(r.kb - r.ka) * 1000);
    const dirSign = Math.sign(r.kb - r.ka) || 1; // senso di marcia rispetto ai km
    const ch = [...(anchors[r.grp] || new Map()).values()];
    // ancora X prima dell'inizio e Y dopo la fine (nel senso di marcia), il più vicine possibile
    const before = ch.filter(c => (c.km - r.ka) * dirSign <= 2.5).sort((a, b) => Math.abs(a.km - r.ka) - Math.abs(b.km - r.ka));
    const after = ch.filter(c => (c.km - r.kb) * dirSign >= -2.5).sort((a, b) => Math.abs(a.km - r.kb) - Math.abs(b.km - r.kb));
    let done = null;
    const map = anchors[r.grp] || new Map();
    const A0 = map.get(r.a), B0 = map.get(r.b);
    if (A0 && B0) { // percorso diretto tra i due svincoli della tratta
      await sleep(700);
      const rt = await routeKm(A0, B0);
      if (rt && rt.P.len / lenM > 0.75 && rt.P.len / lenM < 1.35) done = {p: OSMP.dp(rt.g, 8).map(q => [r5(q[0]), r5(q[1])])};
    }
    if (!done) for (const X of before.slice(0, 3)) { for (const Y of after.slice(0, 3)) {
      if (X === Y || Math.abs(Y.km - X.km) < 0.3) continue;
      await sleep(700);
      const rt = await routeKm(X, Y); if (!rt) continue;
      const span = Math.abs(Y.km - X.km) * 1000; const ratio = rt.P.len / span;
      if (ratio < 0.8 || ratio > 1.3) continue;
      const s0 = Math.max(0, (r.ka - X.km) * dirSign) * 1000 * ratio, s1 = Math.min(rt.P.len, (r.kb - X.km) * dirSign * 1000 * ratio);
      if (s1 - s0 < 200) continue;
      const g = OSMP.slicePath(rt.P, Math.min(s0, s1), Math.max(s0, s1));
      const p = OSMP.dp(g, 8).map(q => [r5(q[0]), r5(q[1])]);
      done = {p, shape: rt.shape}; break;
    } if (done) break; }
    if (done) {
      await sleep(500);
      let lim = 130; try { const enc = encode(done.p); lim = await dominantLimit(enc); } catch (e) {}
      out.push({id, n: `${r.ref.replace('dir', ' dir.').replace('var', ' var.')} ${r.a} → ${r.b}`, mw: r.ref, dir: r.dir, l: lim, a: done.p[0], b: done.p[done.p.length - 1], p: done.p, len: lenM, km: [r.ka, r.kb]});
      ok++;
    } else if (prevById.has(id)) { out.push(prevById.get(id)); kept++; }
    else { fail++; log('non ricostruita:', r.mw, r.a, '→', r.b); }
  }
  log(`tutor: ${ok} ricostruite, ${kept} mantenute, ${fail} mancanti su ${rows.length}`);
  if (ok + kept < rows.length * 0.4 && (prev.tratte || []).length) throw new Error('ricostruzione troppo incompleta, mantengo i dati precedenti');
  writeJs('data/tutor.js', 'SNT_TUTOR', {v: 1, ts: new Date().toISOString().slice(0, 10), fonte: 'Polizia di Stato / Autostrade per l\'Italia, geometria OpenStreetMap', tratte: out});
}
function encode(pts, prec = 6) { const f = 10 ** prec; let out = '', pl = 0, pn = 0; const enc = v => { v = v < 0 ? ~(v << 1) : (v << 1); let s = ''; while (v >= 32) { s += String.fromCharCode((32 | (v & 31)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); }; for (const p of pts) { const la = Math.round(p[0] * f), lo = Math.round(p[1] * f); out += enc(la - pl) + enc(lo - pn); pl = la; pn = lo; } return out; }

(async () => {
  let err = 0;
  if (!args.has('--solo-tutor')) { try { await autovelox(); } catch (e) { err++; log('ERRORE autovelox:', e.message); } }
  if (!args.has('--solo-autovelox')) { try { await tutor(); } catch (e) { err++; log('ERRORE tutor:', e.message); } }
  process.exit(err === 2 ? 1 : 0);
})();
