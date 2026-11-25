#!/usr/bin/env python3
"""Sentinella — prezzi ufficiali dei carburanti (MIMIT, Osservaprezzi, licenza IODL 2.0).
Scarica anagrafica e prezzi "alle 8", li unisce e scrive file piccoli per riquadri di 1 grado:
  data/carburanti/index.json            data, medie nazionali, elenco riquadri
  data/carburanti/t/<lat>_<lon>.json    distributori del riquadro con i prezzi
Uso: python tools/carburanti.py [anagrafica.csv prezzi.csv]   (senza argomenti scarica dal sito MIMIT)"""
import csv, io, json, os, sys, urllib.request, statistics, datetime, math

URL_A = 'https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv'
URL_P = 'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'carburanti')
FUEL = {'benzina': 'b', 'gasolio': 'g', 'gpl': 'l', 'metano': 'm'}

def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Sentinella; +https://github.com)'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()

def decode(raw):
    for enc in ('utf-8-sig', 'cp1252', 'latin-1'):
        try: return raw.decode(enc)
        except UnicodeDecodeError: pass
    return raw.decode('latin-1', 'replace')

def rows(text):
    """Salta la riga «Estrazione del …», riconosce il separatore (| dal 10/02/2026, prima ;) e restituisce dizionari."""
    lines = text.splitlines()
    date = ''
    if lines and lines[0].lower().startswith('estrazione'):
        date = lines[0].split()[-1].strip(); lines = lines[1:]
    head = lines[0]
    sep = '|' if head.count('|') >= head.count(';') else ';'
    rd = csv.reader(io.StringIO('\n'.join(lines)), delimiter=sep, quotechar='"' if sep == ';' else '\x00')
    cols = [c.strip().lower() for c in next(rd)]
    out = []
    for r in rd:
        if len(r) < len(cols) - 1: continue
        out.append({cols[i]: (r[i].strip() if i < len(r) else '') for i in range(len(cols))})
    return date, out

def num(s):
    try: return float(str(s).replace(',', '.'))
    except Exception: return None

def pick(d, *names):
    for n in names:
        if n in d and d[n] != '': return d[n]
    return ''

def main():
    if len(sys.argv) >= 3:
        ta, tp = decode(open(sys.argv[1], 'rb').read()), decode(open(sys.argv[2], 'rb').read())
    else:
        ta, tp = decode(fetch(URL_A)), decode(fetch(URL_P))
    da, ana = rows(ta); dp, pre = rows(tp)
    st = {}
    for a in ana:
        try: sid = int(pick(a, 'idimpianto', 'id impianto'))
        except ValueError: continue
        lat, lon = num(pick(a, 'latitudine')), num(pick(a, 'longitudine'))
        if lat is None or lon is None or not (35 < lat < 48 and 6 < lon < 19.5): continue
        st[sid] = {'id': sid, 'lat': round(lat, 5), 'lon': round(lon, 5), 'br': pick(a, 'bandiera'), 'nm': pick(a, 'nome impianto', 'nomeimpianto'),
                   'ad': pick(a, 'indirizzo'), 'co': pick(a, 'comune'), 'pr': pick(a, 'provincia'), 'ty': pick(a, 'tipo impianto'), 'p': {}, 'dt': ''}
    for p in pre:
        try: sid = int(pick(p, 'idimpianto', 'id impianto'))
        except ValueError: continue
        s = st.get(sid)
        if not s: continue
        k = FUEL.get(pick(p, 'desccarburante').strip().lower())
        v = num(pick(p, 'prezzo'))
        if not k or v is None or not (0.3 < v < 4.5): continue
        self_ = pick(p, 'isself') in ('1', 'true', 'True')
        cur = s['p'].setdefault(k, [None, None])
        i = 0 if self_ else 1
        cur[i] = v if cur[i] is None else min(cur[i], v)
        dt = pick(p, 'dtcomu')[:10]
        if dt:
            # «dtComu» è in formato GG/MM/AAAA hh:mm:ss
            try: dt = datetime.datetime.strptime(dt, '%d/%m/%Y').strftime('%Y-%m-%d')
            except ValueError: pass
            if dt > s['dt']: s['dt'] = dt
    tiles, avg = {}, {k: [] for k in FUEL.values()}
    for s in st.values():
        if not s['p']: continue
        for k, (a, b) in s['p'].items():
            if a or b: avg[k].append(a or b)
        key = f"{math.floor(s['lat'])}_{math.floor(s['lon'])}"
        tiles.setdefault(key, []).append([s['id'], s['lat'], s['lon'], s['br'], s['nm'], s['ad'], s['co'], s['pr'], s['p'], s['dt'], 1 if 'autostrad' in s['ty'].lower() else 0])
    os.makedirs(os.path.join(OUT, 't'), exist_ok=True)
    for f in os.listdir(os.path.join(OUT, 't')):
        if f.endswith('.json'): os.remove(os.path.join(OUT, 't', f))
    for key, lst in tiles.items():
        with open(os.path.join(OUT, 't', key + '.json'), 'w', encoding='utf-8') as fh:
            json.dump(lst, fh, ensure_ascii=False, separators=(',', ':'))
    idx = {'date': dp or da, 'made': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%MZ'), 'n': sum(len(v) for v in tiles.values()),
           'avg': {k: round(statistics.median(v), 3) for k, v in avg.items() if v}, 'tiles': sorted(tiles)}
    with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8') as fh:
        json.dump(idx, fh, ensure_ascii=False, separators=(',', ':'))
    print(f"{idx['n']} distributori in {len(tiles)} riquadri, dati del {idx['date']}, medie {idx['avg']}")

if __name__ == '__main__':
    main()
