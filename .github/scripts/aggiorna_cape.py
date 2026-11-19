#!/usr/bin/env python3
"""Aggiorna data/cape.json con il CAPE (Shiller P/E) corrente dell'S&P 500.

Gira su GitHub Actions (lato server: niente blocchi CORS del browser). Legge il valore
"Current Shiller PE Ratio" pubblicato da multpl.com (prezzo giornaliero, utili mensili
di Shiller) e lo scrive in data/cape.json, che il sito legge dalla stessa origine.
Se la fonte non risponde o il valore non e' plausibile, il file NON viene toccato:
il sito continua a usare l'ultimo valore valido (e ne mostra la data).
"""
import json, os, re, sys, datetime, urllib.request

URL = 'https://www.multpl.com/shiller-pe'
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'cape.json')

def leggi_html(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (aggiornamento CAPE per simulatore educativo)'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')

def estrai_cape(html):
    testo = re.sub(r'<[^>]+>', ' ', html)
    testo = re.sub(r'\s+', ' ', testo)
    m = re.search(r'Current Shiller PE Ratio\s*:?\s*([0-9]{1,3}(?:\.[0-9]+)?)', testo, re.I)
    return float(m.group(1)) if m else None

def main(html=None):
    try:
        html = html if html is not None else leggi_html(URL)
    except Exception as e:
        print(f'::warning::Fonte CAPE non raggiungibile ({e}); data/cape.json lasciato invariato.'); return 0
    v = estrai_cape(html)
    if v is None or not (10 <= v <= 80):
        print(f'::warning::Valore CAPE non trovato o non plausibile ({v}); file lasciato invariato.'); return 0
    precedente = None
    try:
        precedente = json.load(open(OUT)).get('value')
    except Exception:
        pass
    if precedente and abs(v / precedente - 1) > 0.25:
        print(f'::warning::Variazione sospetta {precedente} -> {v} (oltre 25%); file lasciato invariato.'); return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    dato = {'value': round(v, 2), 'asOf': datetime.date.today().isoformat(), 'source': 'multpl.com',
            'note': 'CAPE (Shiller P/E) S&P 500 aggiornato automaticamente da GitHub Actions'}
    json.dump(dato, open(OUT, 'w'), indent=2)
    print(f'CAPE aggiornato: {dato}'); return 0

if __name__ == '__main__':
    sys.exit(main())
