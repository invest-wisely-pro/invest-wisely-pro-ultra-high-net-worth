# MANUTENZIONE DELLA SUITE — PLAYBOOK
*Aggiornato: 4 luglio 2026. Documento vivo: aggiornare a ogni ciclo di manutenzione.*

## 1. STATO DEI DATI (cosa è reale, da quando, fino a quando)

| Serie | Dato reale da | Fino a | Fonte export | Prima del tratto reale |
|---|---|---|---|---|
| World, USA, Europa, Oro (HIST_MONTHLY, HIST_EQ_*) | gen 1970 | dic 2025 | curvo.eu indici (chart_world/usa/europa/oro.csv) | — (tutto reale) |
| EM (HIST_EM) | gen 1988 | dic 2025 | curvo.eu MSCI EM | fallback World |
| Aggregato bond row[1] | apr 2009 (microstruttura) | dic 2025 | SPDR Euro Agg (IE00B41RYL63) | ricostruzione ancorata ai totali annui |
| Gov Globale hedged (HIST_GOV_GLOBAL) | feb 1985 | dic 2025 | curvo.eu gov globale | fallback aggregato |
| Inflation-Linked (HIST_INFL_LINKED) | dic 2005 | dic 2025 | Amundi (LU1650491282) | fallback aggregato |
| Agg. Globale hedged (HIST_AGG_GLOBAL) | dic 2017 | dic 2025 | iShares AGGH (IE00BDBRDM35) | fallback aggregato |
| Commodities (HIST_COMMODITIES) | apr 2005 | dic 2025 | Bloomberg Commodity EUR | fallback oro |
| Curve USB 2Y/5Y/10Y/30Y | gen 2005 | dic 2025 | iShares $ Treasury (B14X4S71/B3VWN393/B1FZS798/BSKRJZ44) | derivate da yield FRED (medie mensili) |
| Curve EUB 5Y/10Y/30Y | gen 2007 | dic 2025 | iShares Euro Gov (B1FZS681/B1FZS806/B1FZS913) | derivate da yield Bund |
| Curva EUB 2Y | lug 2009 | dic 2025 | iShares Euro Gov 1-3 (B14X4Q57) | derivata da yield Bund |
| USB_3M / EUB_3M | tassi ufficiali | dic 2024 | FRED/Bundesbank (derivate: per il monetario il tasso È il dato) | — |
| REITs (HIST_REITS) | gen 1979 | dic 2024 | FTSE Nareit All Equity EUR | fallback World (2025 incluso) |
| Fattori (SCV/MOM/FF5/BAB) | gen 1979 | dic 2024 | Kenneth French / AQR | spread 0 nel 2025 (rendimento di mercato) |
| Inflazione (HIST_INFLATION, annuale) | 1970 | 2025 | CPI Germania (FRED FPCPITOTLZGDEU) 1970-98 + area euro (FPCPITOTLZGEMU/Eurostat) 1999+ | — |

Caveat permanente: i tratti da ETF incorporano il TER (0,07-0,20%/a) — documentato nei commenti.

## 2. CALENDARIO

**Gennaio-febbraio 2027 — estensione 2026 (il ciclo grosso, ~1-2 ore col metodo rodato)**
Ri-esportare da Curvo gli stessi 19 CSV della tabella sopra (scenario "solo capitale iniziale",
EUR, non-hedged per USB), più: rendimenti FF/AQR 2025-26 se si vogliono estendere i fattori,
NAREIT 2025-26 per i REITs. Poi seguire la procedura §3.
- Inflazione: aggiungere 2026 a HIST_INFLATION (media mensili HICP Eurostat).
- Finestra: estendere SOLO ad anni interi (672 → 684). Mai anni parziali.

**Dicembre 2026 — coefficienti INPS biennio 2027-28**
Uscirà il nuovo DM (revisione biennale L.335/1995). Aggiornare COEFF_TRASF in pensione.js
E la tabella OFF_DM nel test 7.m di test.js. Verifica: coefficiente = 1/divisore del decreto.

**Ogni ~1-3 mesi — fallback CAPE**
live-data.js: costante fallback (oggi 41,5, giu 2026). Promemoria già nel codice. Fonte: multpl.com.

**A ogni modifica di qualunque tipo**
`node test.js` → attesi 144 PASS / 0 FAIL. Se un numero atteso cambia legittimamente,
aggiornare il test NELLO STESSO commit del dato.

## 3. PROCEDURA DI ESTENSIONE/PATCH (il metodo validato in questa sessione)

1. **Ispezione**: verificare base, date, righe di ogni CSV. La versione PAC non serve
   (i rendimenti si estraggono dal solo-capitale: v[t]/v[t-1]−1).
2. **GATE prima di toccare** — mai patchare alla cieca:
   - match col tratto già in serie (deve essere ~0 se stessa fonte);
   - eventi noti (2008, 2013 oro, 2022 bond, ecc.) entro pochi decimi dai valori ufficiali;
   - per fonti nuove: corr/CAGR/vol sull'overlap col dato esistente; se la corr è bassa,
     TROVARE LA CAUSA (convenzione temporale? composizione?) e decidere documentando.
   - Se il gate non passa e la causa non è spiegata: NON toccare (v. tentativo FRED curve, bloccato).
3. **Regole di scrittura**: tratto storico INALTERATO byte-per-byte (tenere i token originali,
   appendere i nuovi a 6 decimali); ogni replace con guardia a occorrenza unica (mustReplace);
   commento FIX datato con fonte, motivazione e caveat.
4. **Verifica post**: match a scarto zero vs CSV; sintassi (node -c) su tutti i file;
   test.js su tutte e 4 le suite; QA harness se si toccano i motori.
5. **Propagazione**: i blocchi dati sono identici nelle 4 suite → stesso script su tutte,
   poi md5 dei blocchi per conferma.

**Da NON fare mai**: ETF quando esiste l'indice (doppio conteggio TER: il motore lo applica già);
"rilordizzare" il TER a mano (fu la causa del drift +0,23%/a del World); estendere una serie
senza aggiornare i suoi test; anni parziali; deflazionare serie EUR/DEM con inflazioni non-EUR.

## 4. LIMITI NOTI ACCETTATI (non azionabili con dati gratuiti)
- Microstruttura aggregato row[1] pre-2009: ricostruzione ancorata ai totali annui.
- Curve bond pre-2005/2007: derivate da yield (medie mensili per USB; Bund puro per EUB —
  il tratto reale post-patch è invece area euro, coerente col label).
- Fattoriali: modello market+spread su dati accademici reali; indici MSCI fattoriali (1998+)
  rimandati per scelta — riaprire solo se i fattoriali diventano centrali nei portafogli.
- EPRA Developed su Curvo si ferma ad apr 2023: NAREIT USA mantenuta (dichiarata in src).

## 5. MAPPA DEL CODICE
- Serie storiche: advanced-montecarlo.js (d[], HIST_*, registro HIST_BOND_SERIES, offset/START).
- Inflazione storica + CAPE backtest: backtest.js (HIST_INFLATION, CAPE_HIST).
- Asset class e parametri: main.js (ASSET_CLASSES, _BSM, PORT).
- Coefficienti INPS/IRPEF: pensione.js. CAPE live: live-data.js.
- Test: test.js (suite 7.x = test sui dati). Storico fattori: STATO-FATTORI-REALI.md.
