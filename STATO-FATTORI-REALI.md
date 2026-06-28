# FATTORI REALI NEL MOTORE — STATO FINALE

## COMPLETATI ✅ (8 asset fattoriali reali — famiglia completa)
Modello: rendimento long-only = β_mkt·mercato + β·fattore, serie EUR 1979-2024
(552 mesi, 0 buchi). β_mkt=1 salvo low-vol (0,70). Conversione EUR via FRED+BCE.

| Asset            | Fattore  | β     | β_mkt | CAGR    | Fonte |
|------------------|----------|-------|-------|---------|-------|
| eq_small_value   | SCV-mkt  | spread| 1,0   | +2,18%  | FF 6 Portfolios 2x3 |
| fat_momentum     | WML      | 0,21  | 1,0   | 12,0%   | FF Momentum |
| fat_valore       | HML      | 0,30  | 1,0   | 11,22%  | FF 5 Factors |
| fat_qualita      | RMW      | 0,30  | 1,0   | 11,91%  | FF 5 Factors |
| fat_investment   | CMA      | 0,30  | 1,0   | 11,37%  | FF 5 Factors |
| fat_size         | SMB      | 0,30  | 1,0   | 10,77%  | FF 5 Factors |
| fat_low_vol      | BAB      | 0,15  | 0,70  | 9,15%   | AQR Betting Against Beta |
| fat_multifat     | mix vivo | —     | —     | 11,17%  | composizione 5 fattori reali |

Regressione: **46 PASS / 0 FAIL** dopo ogni asset.

## MULTIFAT — COMPOSIZIONE VIVA (questa sessione)
fat_multifat NON ha serie propria: è espanso nei pesi in 1/5 ciascuno di
Momentum + Valore + Qualità + LowVol + Investment (CMA), i 5 fattori reali già nel motore.
Scelta vs serie precalcolata: la composizione viva NON PUÒ divergere dai singoli —
qualunque ricalibrazione futura di un fattore si propaga automaticamente. Internamente
consistente per costruzione. Punto di espansione unico: calcCustomParams (main.js);
getMomentumWeight e getFactorWeights lo raccolgono via momW/ff5W senza modifiche.
- CAGR 11,17% (dichiarato 10%); vol 15,6% (<mercato 16,8%; dichiarato 13,8%).
- Diversificazione reale ma MODESTA: la componente di mercato comune ai 5 fattori non
  si diversifica, solo i contributi β·fattore tra loro → effetto limitato (onesto).
- Eredita la difensività del low-vol: crash 2008 +2,9pt, dot-com +12,7pt vs mercato.

## ARCHITETTURA
Helper unico advanced-montecarlo.js: eqReturnWithFactors(eqW, eqRet, idx, fw).
  fw = {scvW, momW, ff5W:{valore,qualita,investment,size,low_vol}}.
  FACTOR_MKT_BETA = {fat_low_vol:0.70} (default 1). Pesi=0 → bit-identico.
Usato da 3 bootstrap + calcHistMean + 2 siti backtest.js.
Gate BT_EXCEPTION_KEYS: momentum,valore,qualita,investment,size,low_vol,multifat.
multifat espanso in main.js → riusa tutta l'infrastruttura, zero casi speciali nel motore.

## RESTA A PROXY (1 solo asset)
- fat_dividendi → nessun fattore accademico standard diretto. Opzioni se si volesse:
  proxy con HML (i dividendi correlano col value) o serie "High Dividend" da provider,
  ma non c'è un fattore FF/AQR pulito. Lasciato a proxy intenzionalmente.

## VERIFICA DIREZIONALE (tutti i comportamenti storici riprodotti)
- Momentum crash 2009: −7,1%/mese ✓ | Value winter 2017-20: Valore −5,5pt/a ✓
- Qualità difensiva 2008: +4,75pt ✓ | Low-vol: scudo crash (+5,4pt 2008) e freno tori (−90pt anni 90) ✓
- Multifat: eredita difensività low-vol ✓

## PATTERN (per fat_dividendi, se mai)
build dato EUR → β realistico (+ β_mkt<1 se difensivo) → verifica direzionale →
innesto inerte (46/0) → attiva via eqReturnWithFactors → sblocca gate → regressione.

## ═══ AGGIORNAMENTO: REITS REALI ═══
REITs ora usano una COLONNA DI RENDIMENTO INDIPENDENTE (non spread su mercato).
- Fonte: FTSE NAREIT All Equity REITs, total return mensile, dic-1971→2024.
- EUR con fxExp 0.80 (80% esposizione $, coerente col campo asset).
- Serie HIST_REITS (552 mesi 1979-2024), helper reitsReturnAt(idx)→null pre-1979 (fallback azionario).
- CAGR 10.87% (dichiarato 11.2%), vol 17.8% (dichiarata 17.5%) ✓
- Modellato come asset class a sé: nel block-bootstrap la correlazione reale con
  azioni/bond/gold emerge dal campionamento congiunto dello stesso mese (NON imposta).

### NOTA METODOLOGICA (importante)
La correlazione di un asset esterno reale NON è validabile contro row[0]: la colonna
azioni del motore è calibrata per distribuzione/CAGR, non per allineamento temporale
puntuale (REITs vs row[0] dà 0.16; REITs vs SWDA reale dà 0.41, vicino al ~0.6 atteso).
Per questo i REITs sono una colonna campionata in parallelo, non un modello correlato.

### Verifica direzionale REITs
- Crash immobiliare 2007-08: −52% vs −45% mercato (cadono di più, crisi partì da lì) ✓
- Ripresa 2009-10: +134% vs +47% (rimbalzo esplosivo dai minimi) ✓

### Integrazione
- eqReturnWithFactors esteso con fw.reitsW: quota usa reitsReturnAt(idx), fallback eqRet.
- main.js: reitsW in calcCustomParams + getReitsWeight. backtest+3 bootstrap collegati.
- Gate: rimosso 'reits' da NON_BT_KEYS. Test: SUITE 7 +5 test REITs (tot batteria 64/0).

## RESTA A PROXY
- eq_em (Emergenti) → serve Kenneth French "Emerging Markets" CSV (stesso flusso REITs).
- fat_dividendi → nessun fattore accademico standard.

## ═══ AGGIORNAMENTO: MERCATI EMERGENTI REALI ═══
EM ora usano una COLONNA DI RENDIMENTO INDIPENDENTE (come i REITs).
- Fonte: Fama-French Emerging Markets 6 Portfolios ME×BE/ME (media VW), lug-1989→2024.
- EUR con fxExp 1.0 (mercati esteri puri → esposizione valutaria piena). La conversione
  piena abbassa il CAGR da 11.45% USD a 9.15% EUR: riflette la storica erosione da valuta.
- Serie HIST_EM (426 mesi), OFFSET 234 (1989-07, NON 108: EM iniziano 10 anni dopo).
  Helper emReturnAt(idx)→null fuori range. Pre-1989: fallback azionario (EM non
  investibili come asset class per retail EU prima del lancio MSCI EM 1988).
- CAGR 9.15% (dichiarato 9.8%), vol 20.4% (dichiarata 22.5%) ✓

### Verifica direzionale EM (storia di estremi)
- Crisi asiatica/russa 1997-98: EM −44% mentre mercato +43% (Δ −86pt!) ✓
- Boom commodity 2003-07: EM +242% vs mercato +55% (Δ +187pt) ✓
- Fallback pre-1989: bit-identico al mercato ✓

### Integrazione
- eqReturnWithFactors esteso con fw.emW (offset 234 gestito da emReturnAt).
- main.js: emW in calcCustomParams + getEmWeight. backtest+3 bootstrap collegati.
- Gate NON_BT_KEYS ora VUOTO: nessun asset principale resta a proxy.
- Test: SUITE 7 +6 test EM. Batteria totale: 70/0.

## ═══ STATO COMPLESSIVO: COMPLETO ═══
Asset con serie storica reale: 7 fattori azionari + REITs + Emergenti = 9.
Resta a proxy SOLO fat_dividendi (nessun fattore accademico standard, scelta intenzionale).
Batteria di regressione: 70 test, 0 fail. Gate non-backtestabili: vuoto.

## ═══ AGGIORNAMENTO: BATTERIA DI TEST ESTESA (70 → 94) ═══
Aggiunte 2 suite che portano la verifica funzionale oltre il motore di asset:

### SUITE 8 — FISCALITÀ (14 test)
Verifica calcFiscalLots e calcTaxOnSell con fatti della normativa italiana:
- Lotti PAC (121 = 1+120 mensili), plusvalenza su asset in crescita
- LIFO vs FIFO vs costo medio: su prezzi crescenti LIFO ha cost basis maggiore → meno
  imposta (proprietà fiscale corretta verificata)
- Aliquote: 26% azioni/ETF vs 12,5% BTP agevolata
- Compensazione minus per CATEGORIA di reddito: compensabile su azioni (red. diverso),
  NON su ETF UCITS (red. capitale); minus scadute non utilizzabili

### SUITE 9 — QUANT ANALYTICS (10 test)
Verifica proprietà matematiche di frontiera efficiente, Sharpe, VaR/CVaR:
- _normCDF: Φ(0)=0.5, Φ(1.645)=0.95, code corrette
- Varianza portafoglio ≥0, diversificazione (σ_port ≤ Σwᵢσᵢ)
- Frontiera: max-Sharpe ≥ ogni punto, min-variance ha vol minima, pesi sommano a 1
- VaR/CVaR: segno e monotonicità corretti
Caricamento: blocco matematico puro (righe 1-658) in sandbox vm, escludendo il codice DOM.

### Prove di sabotaggio (entrambe le suite)
Confermato che i test catturano regressioni reali: alterando l'aliquota BTP (12.5→26%)
due test fiscali scattano in rosso; ripristinando tornano verdi. Non sono test sempre-verdi.

## ═══ COPERTURA TEST COMPLESSIVA: 94 test, 0 fail ═══
9 suite: dati storici · simulatore · backtest · Monte Carlo · decumulo · pensione ·
fattori reali · fiscalità · quant analytics. Restano non coperti da test dedicati:
crisis-stress, live-data, scenarios-manager, tier/pro (UI/accessori).
