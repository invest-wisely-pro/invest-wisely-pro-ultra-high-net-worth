// ══════════════════════════════════════════════════════════════
// HISTORICAL BACKTESTING ENGINE
// Usa la serie mensile HIST_MONTHLY (1970-2024, totali annui reali e
// mesi-crisi ancorati ai valori storici, infra-annuale ricostruito) per simulare
// il piano PAC su periodi storici specifici, con correlazioni
// DINAMICHE: in anni di drawdown > 15% le correlazioni si alzano
// verso la matrice STRESS (come osservato empiricamente).
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// CAPE STORICI ANNUALI 1970-2024 (Shiller P/E10)
// Fonte: Robert Shiller — irrationalexuberance.com, aggiornato 2024
// Valori al gennaio di ogni anno (inizio periodo).
// Usati per aggiustare il rendimento atteso azionario in base
// alle valutazioni di partenza (regressione Shiller 10a forward).
// ══════════════════════════════════════════════════════════════
const CAPE_HIST = {
  1970:16.5, 1971:17.9, 1972:19.0, 1973:18.9, 1974:13.5, 1975:8.3,
  1976:11.2, 1977:11.4, 1978:10.0, 1979:9.3,  1980:9.0,  1981:9.3,
  1982:8.5,  1983:10.6, 1984:11.1, 1985:11.0, 1986:14.0, 1987:17.5,
  1988:14.5, 1989:15.8, 1990:16.9, 1991:16.2, 1992:20.3, 1993:21.6,
  1994:21.7, 1995:19.8, 1996:25.8, 1997:29.2, 1998:36.0, 1999:44.2,
  2000:43.8, 2001:37.3, 2002:28.8, 2003:22.9, 2004:27.7, 2005:26.5,
  2006:26.4, 2007:27.2, 2008:24.7, 2009:15.2, 2010:20.5, 2011:23.4,
  2012:21.2, 2013:21.9, 2014:25.9, 2015:27.2, 2016:26.0, 2017:28.1,
  2018:33.3, 2019:28.4, 2020:30.5, 2021:35.6, 2022:38.3, 2023:29.8,
  2024:31.5,
};

// ── Rendimento forward CAPE-adjusted (regressione Shiller) ────────────────────
// Formula: R_10a_real = a + b / CAPE  (OLS su dataset Shiller 1881-2024)
//   a = -0.0056, b = 1.788  (slope OLS ~1.75-1.90 su E/P ratio, R²≈0.38-0.45 @10a)
//   Fonte: Shiller (2014 AER), Campbell-Shiller (1998), Goyal-Welch (2008)
// Restituisce il fattore di scala per il rendimento equity nel backtest rispetto al
// CAGR di calibrazione (10.4%/a nominale 1970-2024, CAPE medio ~19.6).
// IMPORTANTE: il rapporto usa R_REAL (non nominale) per eliminare la distorsione
// da inflazione variabile (es. 2009 deflazione, 2022 inflazione 8% distorcono il factor
// se si include l'inflazione nel denominatore).
function capeAdjEquityFactor(startYear) {
  const cape = CAPE_HIST[startYear];
  if (!cape) return 1.0; // nessun dato → nessun aggiustamento

  // Rendimento REALE atteso dalla regressione Shiller
  const rReal = -0.0056 + 1.788 / cape;

  // Rendimento reale di calibrazione (CAPE medio campione 1970-2024 = 19.6)
  const capeMediaCampione = 19.6;
  const rCalibReal = -0.0056 + 1.788 / capeMediaCampione;

  // Fattore di scala: confronto su REAL return (invariante all'inflazione corrente)
  // Factor > 1 → CAPE basso → mercato economico → rendimenti futuri > media storica
  // Factor < 1 → CAPE alto → mercato caro → rendimenti futuri < media storica
  // Limitato a [0.55, 1.55] per evitare distorsioni eccessive
  const factor = Math.max(0.55, Math.min(1.55, rReal / rCalibReal));
  return factor;
}

// ── Percentile CAPE storico (distribuzione 1970-2024) ─────────────────────────
function capeHistPercentile(cape) {
  const allVals = Object.values(CAPE_HIST).sort((a, b) => a - b);
  const below = allVals.filter(v => v <= cape).length;
  return Math.round(below / allVals.length * 100);
}

// ── Label semaforo CAPE ───────────────────────────────────────────────────────
function capeBtLabel(cape) {
  if (!cape) return '';
  if (cape < 12) return { txt: 'Molto economico', col: 'var(--green)' };
  if (cape < 17) return { txt: 'Economico',        col: 'var(--green)' };
  if (cape < 22) return { txt: 'Fair value',        col: 'var(--blue)'  };
  if (cape < 28) return { txt: 'Caro',              col: 'var(--orange)'};
  if (cape < 35) return { txt: 'Molto caro',        col: 'var(--red)'   };
  return               { txt: 'Estremo',            col: 'var(--red)'   };
}

const BT_PERIODS = {
  1970: { label: '1970 \u2192 Stagflazione OPEC (crisi 1973-74)', color: '#e37400', bg: 'rgba(227,116,0,.08)', context: 'Inizio nel 1970: 3 anni di accumulo, poi embargo petrolifero OPEC (ottobre 1973) che colpisce un capitale gia formato. Inflazione al 12%, azioni \u221248% in 2 anni \u2014 oro +162%. Stress test: la crisi morde dopo la fase di accumulo, non subito.', crisis: [1973, 1974] },
  1977: { label: '1977 \u2192 Volcker shock (crisi 1980-81)', color: '#d93025', bg: 'rgba(217,48,37,.08)', context: 'Inizio nel 1977: si accumula capitale, poi Paul Volcker porta i tassi al 20% per schiacciare inflazione (1980-81). Azioni \u221228%, obbligazioni devastate. Poi il piu lungo bull market della storia (1982-2000).', crisis: [1980, 1981] },
  1984: { label: '1984 \u2192 Black Monday (crisi 1987)', color: '#9334e6', bg: 'rgba(147,52,230,.08)', context: 'Inizio nel 1984: 3 anni di accumulo, poi il Black Monday del 19 ottobre 1987 (azioni \u221222% in UN giorno) colpisce il capitale formato. Il mercato recupero entro 2 anni \u2014 crash violento ma breve.', crisis: [1987] },
  1995: { label: '1995 \u2192 Bolla dot-com (crisi 2000-02)', color: '#1e8e3e', bg: 'rgba(30,142,62,.08)', context: 'Inizio nella fase espansiva pre-bolla internet. Rendimenti eccezionali 1995-1999 accumulano un grande capitale, poi il crash 2000-2002 lo falcidia. Stress test della euforia seguita dal crollo.', crisis: [2000, 2001, 2002] },
  1997: { label: '1997 \u2192 Burst dot-com (crisi 2000-02)', color: '#d93025', bg: 'rgba(217,48,37,.08)', context: 'Inizio nel 1997: 3 anni di forte accumulo nella bolla, poi il crollo internet. Azioni \u221249% in 3 anni (2000-2002), NASDAQ \u221278%. Chi aveva accumulato vide il capitale dimezzarsi \u2014 poi recupero fino al 2007.', crisis: [2000, 2001, 2002] },
  2004: { label: '2004 \u2192 Crisi finanziaria (crisi 2008-09)', color: '#1a73e8', bg: 'rgba(26,115,232,.08)', context: 'Inizio nel 2004: bull market 2004-2007 accumula capitale, poi il peggior crash dal 1929. Lo stress test vero: il capitale formato incontra la crisi finanziaria globale nel mezzo del piano.', crisis: [2008, 2009] },
  2005: { label: '2005 \u2192 Lehman (crisi 2008-09)', color: '#d93025', bg: 'rgba(217,48,37,.1)', context: 'Inizio nel 2005: 3 anni di accumulo prima del crollo. S&P500 \u221257%, MSCI World \u221254% nel 2008-09, le correlazioni azioni-obbligazioni implosero. Il capitale gia formato subisce il pieno impatto \u2014 poi triplica in 10 anni.', crisis: [2008, 2009] },
  2009: { label: '2009 \u2192 Crisi Euro sovrana (crisi 2011-12)', color: '#e37400', bg: 'rgba(227,116,0,.08)', context: 'Inizio nel 2009: si accumula nella ripresa, poi la crisi dei debiti sovrani europei (2011-2012). Spread BTP-Bund a 500bp. Draghi (whatever it takes, luglio 2012) segna il bottom. Poi bull market fino al 2022.', crisis: [2011, 2012] },
  2017: { label: '2017 \u2192 COVID-19 (crisi 2020)', color: '#1e8e3e', bg: 'rgba(30,142,62,.08)', context: 'Inizio nel 2017: 3 anni di accumulo, poi il crollo COVID-19 (febbraio-marzo 2020): azioni \u221234% in 33 giorni sul capitale formato. Recovery completata in meno di 6 mesi \u2014 il crash piu veloce della storia.', crisis: [2020] },
  2019: { label: '2019 \u2192 Inflazione & tassi (crisi 2022)', color: '#00897b', bg: 'rgba(0,137,123,.08)', context: 'Inizio nel 2019: si accumula capitale, poi il 2022 unico nella storia \u2014 azioni \u221220% E obbligazioni \u221215% contemporaneamente. Il 60/40 perde \u221217%: il peggior anno dal 1937 per portafogli bilanciati. Lo stress test colpisce il capitale formato.', crisis: [2022] },
};

// Inflazione storica annua (CPI USA approssimato) per periodo, per deflatare
const HIST_INFLATION = {
  1970:5.7,1971:4.4,1972:3.2,1973:6.2,1974:11.0,1975:9.1,1976:5.8,1977:6.5,1978:7.6,1979:11.3,
  1980:13.5,1981:10.3,1982:6.2,1983:3.2,1984:4.3,1985:3.6,1986:1.9,1987:3.6,1988:4.1,1989:4.8,
  1990:5.4,1991:4.2,1992:3.0,1993:3.0,1994:2.6,1995:2.8,1996:3.0,1997:2.3,1998:1.6,1999:2.2,
  2000:3.4,2001:2.8,2002:1.6,2003:2.3,2004:2.7,2005:3.4,2006:3.2,2007:2.8,2008:3.8,2009:-0.4,
  2010:1.6,2011:3.2,2012:2.1,2013:1.5,2014:1.6,2015:0.1,2016:1.3,2017:2.1,2018:2.4,2019:1.8,
  2020:1.2,2021:4.7,2022:8.0,2023:4.1,2024:2.9,
};

// Stato Backtesting
let btState = {
  startYear: 1970,
  port: 'eq60',
  pac: 500,
  w: 10000,
  showReal: false,
  capeEnabled: false, // CAPE OFF di default: dati gia' reali (eviterebbe doppio conteggio)
  seqCrisis: 2008,   // crisi selezionata per lo stress test di sequenza
  seqMode: 'cap_pac', // modalità versamento: 'cap_pac' | 'solo_cap' | 'solo_pac'
  crisisSeqMode: 'solo_cap', // modalità versamento per la sezione Stress Test Macro
  crisisSeqStage: 'meta', // stadio del piano per lo Stress Test Macro: inizio/meta/fine
};

// Configurazione crisi per il sequence-of-returns stress test.
// startYear: anno in cui far partire la simulazione (3 anni prima del crollo,
// così c'è una fase di accumulo). crashYear: anno del crollo. horizon: durata.
// Gli stadi (inizio/metà/fine) sono simulati col capitale già accumulato (w0)
// che rappresenta quanto un investitore avrebbe al momento del crollo.
const BT_SEQ_CRISES = {
  1973: { label: 'Stagflazione OPEC 1973-74', crashYear: 1973, desc: 'Azioni −48% in 2 anni con inflazione al 12%. Il peggior regime per un 60/40.' },
  1980: { label: 'Volcker shock 1980-81', crashYear: 1980, desc: 'Tassi al 20%, azioni −28%, obbligazioni devastate.' },
  1987: { label: 'Black Monday 1987', crashYear: 1987, desc: 'Azioni −22% in un giorno. Crash violento ma recuperato in 2 anni.' },
  2000: { label: 'Bolla dot-com 2000-02', crashYear: 2000, desc: 'Azioni −49% in 3 anni, NASDAQ −78%. Crisi da valutazioni estreme (CAPE 44).' },
  2008: { label: 'Crisi finanziaria globale 2008-09', crashYear: 2008, desc: 'S&P500 −57%, MSCI World −54%. Le correlazioni azioni-obbligazioni implosero.' },
  2011: { label: 'Crisi Euro sovrana 2011-12', crashYear: 2011, desc: 'Spread BTP-Bund a 500bp. "Whatever it takes" segna il bottom.' },
  2020: { label: 'COVID-19 2020', crashYear: 2020, desc: 'Azioni −34% in 33 giorni. Il crash più veloce della storia, recupero in 6 mesi.' },
  2022: { label: 'Inflazione & rialzo tassi 2022', crashYear: 2022, desc: 'Azioni −20% E obbligazioni −15% insieme. Peggior anno dal 1937 per il 60/40.' },
  1990: { label: 'Recessione 1990 (Golfo)', crashYear: 1990, desc: 'Guerra del Golfo e shock petrolifero. Recessione USA, azioni −20%.' },
  1998: { label: 'Crisi LTCM / Russia 1998', crashYear: 1998, desc: 'Default russo e collasso LTCM. Azioni −19% in poche settimane.' },
};
let chartBt = null, chartBtDD = null, chartBtComp = null, chartBtSeq = null;
let btInitialized = false;

function initBacktest() {
  if (btInitialized) return;
  btInitialized = true;

  // Init start year buttons
  document.getElementById('btStartYearBtns').onclick = e => {
    const b = e.target.closest('[data-y]'); if (!b) return;
    btState.startYear = +b.dataset.y;
    document.querySelectorAll('#btStartYearBtns .gbtn').forEach(x => x.classList.remove('a-blue'));
    b.classList.add('a-blue');
  };

  // Portfolio buttons
  document.getElementById('btPortBtns').onclick = e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    btState.port = b.dataset.k;
    document.querySelectorAll('#btPortBtns .gbtn').forEach(x => x.classList.remove('a-blue'));
    b.classList.add('a-blue');
    if (b.dataset.k === 'sim') {
      btState.port = state.portfolio;
      btState.pac = state.pac;
      btState.w = state.w;
      document.getElementById('sBtPac').value = state.pac;
      document.getElementById('lBtPac').textContent = '€' + fmtN(state.pac) + '/m';
      document.getElementById('sBtW').value = Math.min(state.w, +document.getElementById('sBtW').max);
      document.getElementById('lBtW').textContent = fmt(state.w);
      // Sincronizza i campi numerici digitabili affiancati agli slider
      document.getElementById('sBtPac').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('sBtW').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('btSyncBanner').style.display = 'block';
      document.getElementById('btSyncBanner').innerHTML = `↩ Importati dal Simulatore: portafoglio <strong>${getPortLabel(state.portfolio)}</strong> · PAC <strong>€${fmtN(state.pac)}/m</strong> · Capitale iniziale <strong>${fmt(state.w)}</strong>`;
    }
    // Aggiorna stress test macro se già inizializzato
    try {
      const activePill = document.querySelector('.crisis-pill.a-red');
      if (activePill && window.renderCrisis) {
        window.renderCrisis(activePill.dataset.crisis);
        // Nascondi confronto (invalidato dal cambio portafoglio)
        const cs = document.getElementById('crisisCompareSection');
        if (cs) cs.style.display = 'none';
      }
    } catch(_) {}
  };

  // Sequence-risk crisis selector buttons
  const seqBtns = document.getElementById('btSeqCrisisBtns');
  if (seqBtns) seqBtns.onclick = e => {
    const b = e.target.closest('[data-crisis]'); if (!b) return;
    btState.seqCrisis = +b.dataset.crisis;
    document.querySelectorAll('#btSeqCrisisBtns .gbtn').forEach(x => x.classList.remove('a-blue'));
    b.classList.add('a-blue');
  };
  // Sequence-risk contribution mode buttons
  const seqModeBtns = document.getElementById('btSeqModeBtns');
  if (seqModeBtns) seqModeBtns.onclick = e => {
    const b = e.target.closest('[data-mode]'); if (!b) return;
    btState.seqMode = b.dataset.mode;
    document.querySelectorAll('#btSeqModeBtns .gbtn').forEach(x => x.classList.remove('a-blue'));
    b.classList.add('a-blue');
  };
}

function toggleBtInflation() {
  btState.showReal = !btState.showReal;
  document.getElementById('btInflTog').classList.toggle('on', btState.showReal);
}

function toggleBtCape() {
  btState.capeEnabled = !btState.capeEnabled;
  document.getElementById('btCapeTog').classList.toggle('on', btState.capeEnabled);
  // Ri-esegue il backtest se i risultati sono già visibili
  if (document.getElementById('btResults').style.display !== 'none') runBacktest();
}

// Calcola indici dell'array HIST_MONTHLY a partire dall'anno
function yearToHistIdx(year) {
  return Math.max(0, (year - 1970) * 12);
}

// Drawdown massimo da un array di valori
function maxDrawdown(values) {
  let peak = values[0], maxDD = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? (v - peak) / peak : 0;
    if (dd < maxDD) maxDD = dd;
  }
  return maxDD; // negativo o 0
}

// Calcola drawdown annuale per il grafico
function calcYearlyDrawdown(values) {
  const dd = [];
  let peak = values[0];
  for (const v of values) {
    if (v > peak) peak = v;
    dd.push(peak > 0 ? (v - peak) / peak * 100 : 0);
  }
  return dd;
}

// Rileva correlazione "in crisi" in base al drawdown corrente
function getCorrMultiplier(eqDraw, obDraw) {
  // Se azioni in drawdown > 15% e siamo in contesto di stress, correlaz. salgono
  if (eqDraw < -0.15) return 0.7; // stress: usa 70% corr_stress + 30% corr_normal
  if (eqDraw < -0.25) return 0.9; // crisi: quasi completamente stress
  return 0; // normale
}

// Simula il piano PAC su dati storici reali con aggiustamento CAPE
// portKey: portafoglio (usa pesi eq/ob/gold/cash)
// startYear: anno di partenza
// years: durata in anni (usa state.years se non specificato, max 30 anni)
// Il rendimento azionario mensile viene scalato dal fattore CAPE dell'anno
// di partenza: mercati cari (CAPE alto) → rendimenti futuri attesi più bassi;
// mercati economici (CAPE basso) → rendimenti futuri attesi più alti.
// Questo NON altera la struttura dei crash storici (i mesi negativi rimangono
// negativi), agisce solo sul drift medio annualizzato del componente azionario.
function simulateBacktest(portKey, startYear, pacMonthly, w0, skipEvents, useCape) {
  const startIdx = yearToHistIdx(startYear);
  const years = Math.min(state.years, Math.floor((HIST_MONTHLY.length - startIdx) / 12));
  const months = years * 12;
  // Aggiunte lump sum (PIC) e prelievi una tantum impostati nel simulatore principale.
  // Vengono riflessi nel backtest così la simulazione corrisponde ai dati dell'utente.
  // skipEvents=true nelle simulazioni sintetiche (rischio di sequenza) dove gli eventi
  // a date fisse distorcerebbero il confronto tra stadi con orizzonti diversi.
  const btPics = (!skipEvents && Array.isArray(state.pics)) ? state.pics : [];
  const btExps = (!skipEvents && Array.isArray(state.exps)) ? state.exps : [];
  
  // Pesi: per lifecycle scorrono col glidepath durante la finestra storica
  // (l'investitore invecchia anche nel backtest); per gli altri sono costanti.
  const goldW = getGoldWeight(portKey);
  const cashW = getCashWeight(portKey);
  // Pesi dei fattori reali (sottoinsiemi di eqW): Small Value, Momentum, HML/RMW/CMA/SMB.
  const fw = {
    scvW: (typeof getSmallValueWeight === 'function') ? getSmallValueWeight(portKey) : 0,
    momW: (typeof getMomentumWeight === 'function') ? getMomentumWeight(portKey) : 0,
    ff5W: (typeof getFactorWeights === 'function') ? getFactorWeights(portKey) : null,
    reitsW: (typeof getReitsWeight === 'function') ? getReitsWeight(portKey) : 0,
    emW: (typeof getEmWeight === 'function') ? getEmWeight(portKey) : 0,
    usaW: (portKey === 'custom' && typeof calcCustomParams === 'function') ? (calcCustomParams().usaW || 0) : 0,
    europaW: (portKey === 'custom' && typeof calcCustomParams === 'function') ? (calcCustomParams().europaW || 0) : 0,
  };
  const wAt = (mIdx) => {
    const e = getEquityWeight(portKey, state.age + mIdx / 12);
    return { eqW: e, obW: Math.max(0, 1 - e - goldW - cashW) };
  };
  const { eqW, obW } = wAt(0); // pesi iniziali (per le sezioni informative)

  // ── DURATION dei bond: serie storiche REALI per scadenza (solo custom) ────
  // I bond per scadenza ora usano serie total-return reali (yield FRED/ECB convertiti):
  // un Gov breve, intermedio, lungo, ultra-lungo subiscono i drawdown storici VERI
  // (es. 2022: USA 2Y -4%, 5Y -9%, 10Y -16%, 30Y -32%; 2008 flight-to-quality opposto).
  // FIX 2026-07-04: 'Gov. Globale hedged' ora ha serie dedicata reale (HIST_GOV_GLOBAL, dal 1985-02,
  // fallback aggregato pre-start via null). La quota bond senza serie dedicata (aggregato globale
  // hedged, inflation-linked) usa l'aggregato
  // row[1] con scaling per volatilità come fallback. I preset usano sempre l'aggregato.
  const _BOND_AGG_VOL = 0.057;
  const _BOND_MEAN_M = 0.00466;
  let _obDurK = 1.0;            // fallback duration per la quota aggregata
  let _bondMix = null;         // composizione bond per serie reale
  let _obWtot = 0;
  try {
    if (portKey === 'custom' && typeof calcCustomParams === 'function') {
      const _cp = calcCustomParams();
      _obDurK = Math.max(0.5, Math.min(1.8, Math.sqrt((_cp.obVolW || _BOND_AGG_VOL) / _BOND_AGG_VOL)));
      _bondMix = _cp.bondMix || null;
      if (_bondMix) { for (const k in _bondMix) _obWtot += _bondMix[k]; }
    }
  } catch (e) { _obDurK = 1.0; _bondMix = null; }

  // ── PRESET con composizione reale (realMix): mappa Golden Butterfly, Permanent, ecc.
  // alle serie storiche reali per scadenza/regione, invece dell'aggregato eq/ob.
  // Allinea il calcolo storico al breakdown mostrato all'utente. I parametri μ/σ/best/worst
  // dei preset restano invariati (usati per le proiezioni), qui cambia solo il backtest storico.
  let _realMix = null;
  try {
    if (portKey !== 'custom' && typeof PORT !== 'undefined' && PORT[portKey] && PORT[portKey].realMix) {
      _realMix = PORT[portKey].realMix;
    }
  } catch (e) { _realMix = null; }
  function _realMixRet(mi) {
    if (!_realMix) return null;
    const H = HIST_MONTHLY[mi];
    let r = 0;
    // azionario
    if (_realMix.eqUsa && typeof eqUsaReturnAt === 'function') { const ur = eqUsaReturnAt(mi); r += _realMix.eqUsa * (ur !== null ? ur : H[0]); }
    if (_realMix.eqEuropa && typeof eqEuropeReturnAt === 'function') { const er2 = eqEuropeReturnAt(mi); r += _realMix.eqEuropa * (er2 !== null ? er2 : H[0]); }
    if (_realMix.eqWorld) r += _realMix.eqWorld * H[0];
    if (_realMix.scv) r += _realMix.scv * H[0]; // small value ≈ mercato + premio (semplificato nel backtest)
    if (_realMix.em && typeof HIST_EM !== 'undefined') { const ei = mi - (typeof EM_START!=='undefined'?EM_START:216); r += _realMix.em * (ei>=0 && ei<HIST_EM.length ? HIST_EM[ei] : H[0]); }
    // oro, cash
    if (_realMix.gold) r += _realMix.gold * H[2];
    if (_realMix.cash) r += _realMix.cash * 0.002;
    // bond per scadenza
    if (_realMix.bond) {
      for (const key in _realMix.bond) {
        const w = _realMix.bond[key];
        const br = (typeof bondSeriesReturnAt === 'function') ? bondSeriesReturnAt(key, mi) : null;
        r += w * (br !== null ? br : H[1]);
      }
    }
    return r;
  }
  // Rendimento bond del mese (indice assoluto): media pesata delle serie reali + quota aggregata.
  function _bondRetReal(mi) {
    if (!_bondMix || _obWtot <= 0) return null;
    let acc = 0;
    for (const key in _bondMix) {
      const w = _bondMix[key];
      if (key === '_agg') {
        acc += w * (_BOND_MEAN_M + _obDurK * (HIST_MONTHLY[mi][1] - _BOND_MEAN_M));
      } else {
        const br = (typeof bondSeriesReturnAt === 'function') ? bondSeriesReturnAt(key, mi) : null;
        acc += w * (br !== null ? br : HIST_MONTHLY[mi][1]);
      }
    }
    return acc / _obWtot;
  }

  const terRate = state.ter / 100 / 12; // mensile

  // ── Fattore CAPE: scala il rendimento azionario in base alle valutazioni di partenza
  const capeStart  = CAPE_HIST[startYear] || null;
  // useCape: undefined → usa btState.capeEnabled (chiamata da UI); true/false → override esplicito
  const _capeOn = (useCape !== undefined) ? useCape : (typeof btState !== 'undefined' ? btState.capeEnabled : true);
  const capeFactor = _capeOn ? capeAdjEquityFactor(startYear) : 1.0; // 1.0 = nessun aggiustamento
  // L'aggiustamento è graduale: nei primi anni pesa di più (mean-reversion più lenta
  // per valutazioni molto estreme), poi si attenua. Usiamo una rampa lineare su 10 anni.
  // Anno 1: pieno fattore. Anno 10+: fattore → 1.0 (convergenza al rendimento storico).
  const capeRampFactor = (monthIdx) => {
    const yearN = Math.floor(monthIdx / 12); // anno 0-based
    if (yearN >= 10) return 1.0;
    // Interpolazione lineare da capeFactor (anno 0) a 1.0 (anno 10)
    return capeFactor + (1.0 - capeFactor) * (yearN / 10);
  };
  
  let portValue = w0;
  let totalInvested = w0;
  const monthlyValues = [w0];
  // pureValues: valore del portafoglio SEN ZA i nuovi contributi PAC, per il drawdown
  // Il drawdown "puro" misura la perdita dovuta al mercato, non mascherata dai versamenti.
  // È il numero corretto da mostrare come Max Drawdown nella card rischio di sequenza.
  let pureValue = w0;
  const pureMonthlyValues = [w0];
  const monthlyReturns = [];   // rendimento mensile del portafoglio (per TWR money-weighted-free)
  const annualValues = [w0];
  const annualInvested = [w0];
  const annualInflations = [];
  const yearlyEqReturns = [];
  
  let cumInfl = 1;
  let eqPeak = 1, eqCumRet = 1;

  for (let m = 0; m < months; m++) {
    const idx = startIdx + m;
    if (idx >= HIST_MONTHLY.length) break;
    
    const row = calibrateHistRow(HIST_MONTHLY[idx]);
    // Applica fattore CAPE al rendimento azionario (rampa su 10 anni)
    const rf = capeRampFactor(m);
    // Il fattore scala solo la parte di drift: separa drift da rumore.
    // Approccio: scala il rendimento totale verso zero (neutro) poi riapplica.
    // eqRet_adj = eqRet * rf + eqOffset * (rf - 1) non è corretto —
    // invece usiamo: se eqRet > 0, moltiplica per rf; se eqRet < 0, lascia invariato
    // (i crash storici non vengono amplificati da CAPE alto: il CAPE prevede il drift, non i crash)
    const eqRaw = row[0];
    const eqAdj = eqRaw >= 0
      ? eqRaw * rf                          // mesi positivi: scala per fattore CAPE
      : eqRaw * (1 + (1 - rf) * 0.15);     // mesi negativi: lieve attenuazione se CAPE basso (mercati economici rimbalzano prima)
    // Rendimento bond scalato per duration: cedola fissa + spread amplificato/smorzato
    const _brReal = _bondRetReal(idx);
    const obRet   = (_brReal !== null) ? _brReal
                  : (_obDurK === 1.0) ? row[1] : (_BOND_MEAN_M + _obDurK * (row[1] - _BOND_MEAN_M));
    const goldRet = row[2];
    const cashRet = 0.002;

    // Correlazione dinamica: se azioni in stress, le correlazioni salgono
    eqCumRet *= (1 + eqAdj);
    if (eqCumRet > eqPeak) eqPeak = eqCumRet;
    const currentEqDraw = eqPeak > 0 ? (eqCumRet - eqPeak) / eqPeak : 0;

    // Rendimento portafoglio mensile con pesi (glidepath per lifecycle)
    const { eqW: eqW_m, obW: obW_m } = wAt(m);
    // Quota azionaria con tutti i fattori reali (SV, Momentum, HML/RMW/CMA/SMB),
    // applicati sul rendimento di mercato CAPE-adjusted (eqAdj). La quota "pura" usa eqAdj.
    const eqPart = (typeof eqReturnWithFactors === 'function')
      ? eqReturnWithFactors(eqW_m, eqAdj, idx, fw)
      : eqW_m * eqAdj;
    let portRet;
    const _rmRet = _realMixRet(idx);
    if (_rmRet !== null) {
      portRet = _rmRet;  // composizione reale del preset (Golden Butterfly, Permanent...)
    } else {
      portRet = eqPart + obW_m * obRet + goldW * goldRet + cashW * cashRet;
    }
    portRet -= terRate;

    // PAC mensile — metodo midpoint (coerente con project() nel simulatore principale)
    // Il contributo matura metà del rendimento mensile: mid = (cap + cap+pac) / 2
    totalInvested += pacMonthly;
    const mid = portValue + pacMonthly / 2;
    portValue = Math.max(0, portValue + pacMonthly + mid * portRet);

    // pureValue: rendimento di mercato sul capitale già investito, senza nuovi PAC.
    // Per solo_cap (pacMonthly=0): coincide con portValue, nessuna differenza.
    // Per cap_pac (w0>0, pac>0): misura la perdita del capitale accumulato pre-crisi
    //   senza che i versamenti mensili mascherino il drawdown.
    // Per solo_pac (w0=0): pureValue resterebbe 0 → non usato; si ricade su monthlyValues.
    pureValue = Math.max(0, pureValue * (1 + portRet));
    pureMonthlyValues.push(pureValue);

    // Eventi una tantum a inizio di ciascun anno (coerente col simulatore principale):
    // aggiunte lump sum (PIC) e prelievi (uscite). Applicati a fine mese di dicembre
    // dell'anno corrispondente (m+1 multiplo di 12 → fine anno yr).
    if ((m + 1) % 12 === 0) {
      const yr = (m + 1) / 12; // anno 1-based appena completato
      for (const p of btPics) {
        if (+p.year === yr) { portValue += +p.amount; totalInvested += +p.amount; }
      }
      for (const e of btExps) {
        if (+e.year === yr) { portValue = Math.max(0, portValue - +e.amount); totalInvested -= +e.amount; }
      }
    }
    monthlyReturns.push(portRet);  // rendimento "puro" del portafoglio nel mese

    monthlyValues.push(portValue);
    
    // Registrazione annuale
    if ((m + 1) % 12 === 0) {
      const yr = startYear + Math.floor((m + 1) / 12);
      annualValues.push(Math.round(portValue));
      annualInvested.push(Math.round(totalInvested));
      const infl = (HIST_INFLATION[yr] || 2.5) / 100;
      cumInfl *= (1 + infl);
      annualInflations.push(infl);
      yearlyEqReturns.push(annualValues[annualValues.length-1] / annualValues[annualValues.length-2] - 1);
    }
  }

  const finalValue    = annualValues[annualValues.length - 1];
  const finalInvested = annualInvested[annualInvested.length - 1];
  const totalReturn   = finalInvested > 0 ? (finalValue - finalInvested) / finalInvested : 0;

  // ── Rendimenti annualizzati CORRETTI per un PAC ───────────────────────────
  // Il vecchio "CAGR = (finale/w0)^(1/anni)" era improprio: attribuiva tutta la
  // crescita al solo capitale iniziale, ignorando che la maggior parte del
  // capitale viene versata nel tempo (e cresce per meno anni). Lo sostituiamo con:
  //   1) IRR money-weighted (rendimento reale del PIANO, considera il timing dei flussi)
  //   2) TWR time-weighted (rendimento "puro" del portafoglio, indipendente dai flussi)
  const nMonths = monthlyReturns.length;

  // TWR: composizione dei rendimenti mensili del portafoglio, annualizzata
  let twrCum = 1;
  for (const r of monthlyReturns) twrCum *= (1 + r);
  const twr = nMonths > 0 ? Math.pow(twrCum, 12 / nMonths) - 1 : 0;

  // IRR money-weighted: tasso che annulla il NPV dei flussi di cassa mensili
  //   t=0: −w0 ; ogni mese: −pacMonthly ; alla fine: +finalValue
  const _npvMonthly = (rMonthly) => {
    let npv = -w0;
    for (let m = 1; m <= nMonths; m++) npv += (-pacMonthly) / Math.pow(1 + rMonthly, m);
    npv += finalValue / Math.pow(1 + rMonthly, nMonths);
    return npv;
  };
  let irr = 0;
  if (nMonths > 0 && (w0 > 0 || pacMonthly > 0)) {
    let lo = -0.5 / 12, hi = 1.0 / 12;  // bracket mensile [−50%, +100%] annuo
    // Assicura il cambio di segno; altrimenti fallback a TWR
    if (_npvMonthly(lo) * _npvMonthly(hi) < 0) {
      for (let it = 0; it < 200; it++) {
        const mid = (lo + hi) / 2;
        if (_npvMonthly(mid) > 0) lo = mid; else hi = mid;
      }
      const rMonthly = (lo + hi) / 2;
      irr = Math.pow(1 + rMonthly, 12) - 1;  // annualizza
    } else {
      irr = twr;  // fallback robusto
    }
  }

  // Manteniamo `cagr` come alias dell'IRR per compatibilità con il resto del codice.
  const cagr          = irr;
  // Per solo_pac (w0=0) pureMonthlyValues è una lista di zeri: non ha senso misurare
  // il drawdown su di essa. In quel caso si usa monthlyValues (il valore reale inclusi i PAC),
  // che per una rendita pura è comunque l'unico riferimento significativo.
  const ddSource = w0 > 0 ? pureMonthlyValues : monthlyValues;
  const dd            = maxDrawdown(ddSource);
  const realValues    = annualValues.map((v, i) => {
    let cumI = 1;
    for (let j = 0; j < Math.min(i, annualInflations.length); j++) cumI *= (1 + annualInflations[j]);
    return Math.round(v / cumI);
  });

  // CAGR "senza aggiustamento CAPE" — per confronto nella UI
  // Riesegue una simulazione rapida con factor=1 per mostrare il delta
  let cagrNoCape = null;
  if (Math.abs(capeFactor - 1.0) > 0.05) {
    // Confronto "senza aggiustamento CAPE": calcola il TWR (rendimento asset)
    // con factor=1, coerente con la nuova metrica twr (non più il vecchio CAGR/w0).
    let twrCum2 = 1, nM2 = 0;
    for (let m2 = 0; m2 < months; m2++) {
      const idx2 = startIdx + m2;
      if (idx2 >= HIST_MONTHLY.length) break;
      const row2 = calibrateHistRow(HIST_MONTHLY[idx2]);
      const { eqW: eqW2, obW: obW2 } = wAt(m2);
      const eqPart2 = (typeof eqReturnWithFactors === 'function')
        ? eqReturnWithFactors(eqW2, row2[0], idx2, fw)
        : eqW2 * row2[0];
      const pr2 = eqPart2 + obW2 * row2[1] + goldW * row2[2] + cashW * 0.002 - terRate;
      twrCum2 *= (1 + pr2);
      nM2++;
    }
    cagrNoCape = nM2 > 0 ? Math.pow(twrCum2, 12 / nM2) - 1 : null;
  }
  
  return {
    annualValues, annualInvested, realValues, monthlyValues, pureMonthlyValues,
    finalValue, finalInvested, totalReturn, cagr, irr, twr, maxDD: dd,
    years: annualValues.length - 1,
    yearlyEqReturns, cumInflation: cumInfl,
    // Dati CAPE
    capeStart, capeFactor,
    cagrNoCape,           // CAGR senza aggiustamento (confronto)
    capeAdj: Math.abs(capeFactor - 1.0) > 0.05, // flag: aggiustamento significativo
  };
}

// ── Helper: rileva se il portafoglio custom include asset senza serie storica mensile ──
// HIST_MONTHLY copre SOLO tre colonne: azioni sviluppate (MSCI World), obbligazioni
// aggregate e oro. Qualsiasi asset NON presente come colonna propria in HIST_MONTHLY
// verrebbe simulato usando come proxy la serie sbagliata (tipicamente col[0] = MSCI World),
// producendo risultati fuorvianti. Blocco obbligatorio.
//
// Asset bloccati per categoria:
//   'trend'  — Managed Futures/Trend Following (nessuna colonna in HIST_MONTHLY)
//   'carry'  — Carry bond/FX/commodity (nessuna colonna in HIST_MONTHLY)
//   'fat'    — Fattori azionari (Value, Momentum, Quality, Low Vol, Small Cap, ecc.):
//              la serie MSCI World non è la loro storia reale (cicli e crash diversi)
//
// Asset bloccati per chiave specifica:
//   'eq_em'         — Mercati Emergenti (serie storica distinta, non proxy di MSCI World)
//   'reits'         — Immobiliare Quotato (REITs): HIST_MONTHLY non include una colonna REITs;
//              verrebbe simulato come azioni sviluppate ignorando il ciclo immobiliare
//              reale (2007-09 drawdown −68%, correlazione con equity diversa nel tempo)
//
// NOTA: 'eq_small_value' è ora BACKTESTABILE — dispone della serie storica reale
//   (spread Fama-French Small Value su mercato, EUR 1979-2024, SCV_SPREAD in
//   advanced-montecarlo.js). Backtest e bootstrap applicano row[0]+scvSpreadAt(idx)
//   alla sua quota, quindi non è più trattato come proxy di MSCI World.
//
// Asset compositi a leva (Efficient Core 90/60 USA/Globale):
//   isComposite+finCost > 0 → esposizione notional >100%; la leva e il suo costo
//   verrebbero ignorati nel backtest storico → risultati sistematicamente gonfiati.
// NOTA: questi fattori sono ora BACKTESTABILI pur avendo cat='fat' — dispongono
//   della serie reale (EUR 1979-2024, in advanced-montecarlo.js):
//     fat_momentum (β·WML), fat_valore (β·HML), fat_qualita (β·RMW),
//     fat_investment (β·CMA), fat_size (β·SMB) — fonte Fama-French;
//     fat_low_vol (β·BAB) — fonte AQR Betting Against Beta;
//     fat_multifat — composizione VIVA di 5 fattori reali equipesati (Val+Mom+Qual+
//       LowVol+CMA), espansa nei pesi: nessuna serie propria, sempre coerente coi singoli.
//   Resta non-backtestabile solo fat_dividendi (nessun fattore accademico standard diretto).
function customPortfolioIsNonBacktestable() {
  if (state.portfolio !== 'custom') return false;
  const NON_BT_CATS = new Set(['trend', 'carry', 'fat']);
  const NON_BT_KEYS = new Set([]); // tutti gli asset principali ora hanno serie reale
  // Eccezioni: chiavi con serie reale, backtestabili anche se la categoria è bloccata.
  const BT_EXCEPTION_KEYS = new Set(['fat_momentum', 'fat_valore', 'fat_qualita', 'fat_investment', 'fat_size', 'fat_low_vol', 'fat_multifat']);
  return (state.customPortfolio?.slots || []).some(sl => {
    const ac = ASSET_CLASSES[sl.ac];
    if (!ac || !(Number(sl.pct) > 0)) return false;
    // Asset con serie reale dedicata: backtestabile nonostante la categoria.
    if (BT_EXCEPTION_KEYS.has(sl.ac)) return false;
    // Categoria non backtestabile (trend, carry, fattoriali)
    if (NON_BT_CATS.has(ac.cat)) return true;
    // Asset specifico senza serie reale (mercati emergenti)
    if (NON_BT_KEYS.has(sl.ac)) return true;
    // Asset composito a leva (efficient core 90/60 USA o Globale)
    if (ac.isComposite && ac.finCost > 0) return true;
    return false;
  });
}

function runBacktest() {
  const { startYear, port, pac, w } = btState;
  const portKey = port === 'sim' ? state.portfolio : port;

  // I preset con leva e/o asset alternativi (efficient core, return stacking)
  // non sono backtestabili sulla serie storica: HIST_MONTHLY contiene solo
  // azioni/obbligazioni/oro (manca il managed futures), la leva verrebbe
  // ignorata, e gli strumenti UCITS non esistevano nelle finestre storiche.
  // Stessa cosa per il portafoglio custom che include Trend Following / Carry.
  const NON_BACKTESTABLE = { ec_us_9060: 1, ec_glob_9060: 1, return_stack: 1 };
  if (NON_BACKTESTABLE[portKey] || (portKey === 'custom' && customPortfolioIsNonBacktestable())) {
    document.getElementById('btResults').style.display = 'block';
    document.getElementById('btCompareSec').style.display = 'none';
    const lbl = (typeof getPortLabel === 'function') ? getPortLabel(portKey) : portKey;
    document.getElementById('btResultTitle').textContent = `Backtesting non disponibile — ${lbl}`;
    const box = document.getElementById('btContextBox');
    box.style.background = 'var(--orange-dim, rgba(230,138,0,.08))';
    box.style.border = '1px solid rgba(230,138,0,.35)';
    box.style.color = 'var(--orange, #b8860b)';
    const isCustomMF = portKey === 'custom' && customPortfolioIsNonBacktestable();
    box.innerHTML = isCustomMF
      ? `Il portafoglio custom include asset <strong>privi di serie storica mensile propria in questo modello</strong>: ` +
        `<strong>Trend Following / Managed Futures</strong>, <strong>Carry</strong> o <strong>Efficient Core (leva)</strong>. ` +
        `(Small Cap Value, REITs, Mercati Emergenti e i fattoriali Value/Momentum/Quality/Size/Investment/Low-Vol sono ora pienamente backtestabili con serie storiche reali 1979-2024.) ` +
        `Per gli asset a leva o managed futures, la storia mensile coerente non è disponibile. ` +
        `Usa le schede <strong>Simulatore</strong>, <strong>Monte Carlo</strong> o <strong>Frontiera Efficiente</strong>, che usano i parametri specifici (μ, σ) di ogni asset.`
      : `Il backtest storico non è applicabile a <strong>${lbl}</strong>. ` +
        `Questa strategia usa leva (esposizione &gt;100%) e/o managed futures, ` +
        `asset per cui non esiste una serie storica coerente in questo modello ` +
        `(i dati storici coprono solo azioni, obbligazioni e oro). ` +
        `Inoltre gli strumenti UCITS che la compongono non esistevano nelle finestre storiche. ` +
        `Per analizzare questa strategia usa le schede <strong>Simulatore</strong>, ` +
        `<strong>Monte Carlo</strong> o <strong>Frontiera Efficiente</strong>, che modellano correttamente leva e diversificazione.`;
    // Svuota/nascondi le sezioni dei risultati da eventuali run precedenti
    const statsEl = document.getElementById('btStats');       if (statsEl) statsEl.innerHTML = '';
    const ddSec   = document.getElementById('btDrawdownSec');  if (ddSec)   ddSec.style.display = 'none';
    return;
  }

  const period = BT_PERIODS[startYear];
  if (!period) return;

  const result = simulateBacktest(portKey, startYear, pac, w);
  
  document.getElementById('btResults').style.display = 'block';
  document.getElementById('btCompareSec').style.display = 'none';
  
  // Title & context
  document.getElementById('btResultTitle').textContent = `Backtesting — ${period.label}`;
  document.getElementById('btContextBox').style.background = period.bg;
  document.getElementById('btContextBox').style.border = `1px solid ${period.color}44`;
  document.getElementById('btContextBox').style.color = period.color;
  document.getElementById('btContextBox').innerHTML = period.context;

  // Stats — include CAPE iniziale e confronto con/senza aggiustamento
  const portLabel = getPortLabel(portKey);
  const inflAdjReturn = result.cumInflation > 0 ? (result.finalValue / result.cumInflation - result.finalInvested) / result.finalInvested : result.totalReturn;
  const capeLabel = result.capeStart ? capeBtLabel(result.capeStart) : null;
  const capePct   = result.capeStart ? capeHistPercentile(result.capeStart) : null;

  const statsCards = [
    { l: `Valore finale (${startYear}→${startYear+result.years})`, v: fmt(result.finalValue), c: 'var(--blue)' },
    { l: 'Totale versato', v: fmt(result.finalInvested), c: 'var(--text)' },
    { l: 'Ritorno nominale totale', v: (result.totalReturn >= 0 ? '+' : '') + (result.totalReturn * 100).toFixed(1) + '%', c: result.totalReturn >= 0 ? 'var(--green)' : 'var(--red)' },
    { l: 'Rendim. annuo del piano (IRR)', v: (result.irr >= 0 ? '+' : '') + (result.irr * 100).toFixed(2) + '%/a', c: result.irr >= 0 ? 'var(--green)' : 'var(--red)' },
    { l: 'Rendim. annuo asset (TWR)', v: (result.twr >= 0 ? '+' : '') + (result.twr * 100).toFixed(2) + '%/a', c: result.twr >= 0 ? 'var(--green)' : 'var(--red)' },
    { l: 'Max Drawdown', v: (result.maxDD * 100).toFixed(1) + '%', c: result.maxDD < -0.3 ? 'var(--red)' : result.maxDD < -0.15 ? 'var(--orange)' : 'var(--green)' },
    { l: 'Valore reale (inflaz. +' + ((result.cumInflation-1)*100).toFixed(0) + '% cum.)', v: fmt(result.realValues[result.realValues.length-1]), c: 'var(--teal)' },
  ];

  // Aggiunge CAPE card se disponibile
  if (result.capeStart && capeLabel) {
    statsCards.unshift({
      l: `CAPE S&P500 a inizio ${startYear}`,
      v: result.capeStart.toFixed(1) + ` (${capePct}° pct.)`,
      c: capeLabel.col,
      sub: capeLabel.txt + (result.capeFactor ? ` · Fattore adj: ×${result.capeFactor.toFixed(2)}` : ''),
    });
  }

  document.getElementById('btStats').innerHTML = statsCards
    .map(s => `<div class="bt-stat-card"><div class="lbl">${s.l}</div><div class="val" style="color:${s.c}">${s.v}</div>${s.sub ? `<div style="font-size:10.5px;color:var(--text3);margin-top:2px">${s.sub}</div>` : ''}</div>`)
    .join('');

  // Nota CAPE interpretativa sotto i KPI
  const _capeOnUI = btState.capeEnabled !== false; // legge lo stato toggle dalla UI
  const capeNoteEl = document.getElementById('btCapeNote');
  if (result.capeStart && result.capeAdj && _capeOnUI) {
    const direction = result.capeFactor > 1 ? 'sottovalutato' : 'sopravvalutato';
    const effect    = result.capeFactor > 1 ? 'superiori alla media storica' : 'inferiori alla media storica';
    const delta     = result.cagrNoCape != null
      ? ` Il rendimento asset (TWR) senza aggiustamento CAPE sarebbe stato <strong>${(result.cagrNoCape >= 0 ? '+' : '') + (result.cagrNoCape * 100).toFixed(2)}%/a</strong> (delta: ${((result.twr - result.cagrNoCape) * 100).toFixed(2)}pp).`
      : '';
    if (capeNoteEl) {
      capeNoteEl.style.display = 'block';
      capeNoteEl.innerHTML = `<strong>Aggiustamento CAPE attivo</strong> — Nel ${startYear} il mercato era <strong style="color:${capeLabel?.col}">${direction}</strong> (CAPE ${result.capeStart.toFixed(1)}, ${capePct}° percentile storico). La regressione Shiller prevede rendimenti azionari <strong>${effect}</strong> — fattore di scala x${result.capeFactor.toFixed(2)} applicato al drift equity (rampa lineare su 10 anni).${delta}`;
    }
  } else if (result.capeStart && !_capeOnUI) {
    if (capeNoteEl) {
      capeNoteEl.style.display = 'block';
      capeNoteEl.innerHTML = `<strong>CAPE adjust disattivato</strong> — CAPE ${startYear}: <strong>${result.capeStart.toFixed(1)}</strong> (${capePct}° percentile, ${capeLabel?.txt}). Fattore Shiller non applicato: la simulazione usa i rendimenti storici grezzi senza correzione per le valutazioni di partenza.`;
    }
  } else {
    if (capeNoteEl) capeNoteEl.style.display = 'none';
  }

    // Crea btCapeNote dinamicamente se non esiste (non è nell'HTML originale)
  if (!document.getElementById('btCapeNote')) {
    const statsEl = document.getElementById('btStats');
    if (statsEl) {
      const noteDiv = document.createElement('div');
      noteDiv.id = 'btCapeNote';
      noteDiv.style.cssText = 'display:none;margin:10px 0;padding:12px 16px;background:var(--bg2);border:1px solid var(--border2);border-left:3px solid var(--blue);border-radius:var(--radius-sm);font-size:12px;color:var(--text2);line-height:1.7';
      statsEl.parentNode.insertBefore(noteDiv, statsEl.nextSibling);
    }
  }

  // Main chart
  if (chartBt) { chartBt.destroy(); chartBt = null; }
  const years2 = result.years;
  const labels = Array.from({ length: years2 + 1 }, (_, i) => startYear + i);
  const displayVals = btState.showReal ? result.realValues : result.annualValues;
  const tC = 'rgba(0,0,0,.45)', gC = 'rgba(0,0,0,.05)';
  
  // Highlight crisis years with background
  const crisisYearsSet = new Set((period.crisis || []).map(y => y - startYear));
  
  chartBt = new Chart(document.getElementById('chBt'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: btState.showReal ? 'Valore Reale' : 'Valore Nominale', data: displayVals, borderColor: period.color, borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: labels.map((yr, i) => crisisYearsSet.has(i) ? '#d93025' : period.color), fill: true, backgroundColor: period.bg, tension: .3 },
        { label: 'Totale Versato', data: result.annualInvested, borderColor: 'rgba(0,0,0,.3)', borderWidth: 1.5, borderDash: [4,3], pointRadius: 0, fill: false, tension: .3 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true },
        tooltip: { callbacks: { title: c => 'Anno ' + c[0].label, label: c => ' ' + c.dataset.label + ': ' + fmt(c.raw) }, backgroundColor: '#fff', borderColor: '#dadce0', borderWidth: 1, titleColor: '#202124', bodyColor: '#5f6368', padding: 10 },
        annotation: {
          // Annotate crisis years if Chart.js annotation plugin available
        }
      },
      scales: {
        x: { ticks: { color: tC, font: { size: 11, family: 'DM Mono' }, maxTicksLimit: 12 }, grid: { color: gC } },
        y: { ticks: { color: tC, font: { size: 11, family: 'DM Mono' }, callback: v => fmt(v) }, grid: { color: gC } }
      }
    }
  });

  // Drawdown chart
  if (chartBtDD) { chartBtDD.destroy(); chartBtDD = null; }
  const ddVals = calcYearlyDrawdown(result.annualValues);
  
  document.getElementById('btDrawdownSec').style.display = 'block';
  document.getElementById('btDrawdownInfo').innerHTML = buildCorrInfo(period, portKey, result);
  
  chartBtDD = new Chart(document.getElementById('chBtDD'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Drawdown dal massimo (%)',
        data: ddVals.map(d => +d.toFixed(1)),
        backgroundColor: ddVals.map(d => d < -25 ? 'rgba(217,48,37,.75)' : d < -10 ? 'rgba(227,116,0,.6)' : 'rgba(30,142,62,.4)'),
        borderRadius: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` Drawdown: ${c.raw.toFixed(1)}%` } } },
      scales: {
        x: { ticks: { color: tC, font: { size: 10, family: 'DM Mono' }, maxTicksLimit: 12 }, grid: { color: gC } },
        y: { ticks: { color: tC, font: { size: 10, family: 'DM Mono' }, callback: v => v + '%' }, grid: { color: gC }, suggestedMin: Math.min(...ddVals) * 1.1, suggestedMax: 2 }
      }
    }
  });
}

function buildCorrInfo(period, portKey, result) {
  const eqW = getEquityWeight(portKey, state.age);
  const goldW = getGoldWeight(portKey);
  const obW = Math.max(0, 1 - eqW - goldW - getCashWeight(portKey));
  const crisisYears = period.crisis || [];
  
  // Compute dynamic vs static correlation effect
  const portLabel = getPortLabel(portKey);
  const crisisStr = crisisYears.length > 0 ? crisisYears.join(', ') : 'n/a';
  
  // Stima correlazione statica vs dinamica per azioni-obbligazioni
  const corrStatic = CORR_PAIR('eq', 'ob_glob');
  const corrStress = CORR_PAIR_STRESS('eq', 'ob_glob');
  
  return `<strong>Correlazioni Dinamiche — ${portLabel}</strong><br>
    In periodi di crisi (${crisisStr}), le correlazioni storicamente osservate <strong>divergono significativamente</strong> da quelle medie.<br>
    <div style="margin-top:8px;display:flex;gap:16px;flex-wrap:wrap;font-family:'DM Mono',monospace;font-size:11.5px">
      <span>Az.↔Ob.: regime normale <strong style="color:var(--green)">${corrStatic.toFixed(2)}</strong> → crisi <strong style="color:var(--red)">${corrStress.toFixed(2)}</strong></span>
      <span>Az.↔Oro: normale <strong style="color:var(--green)">${CORR_PAIR('eq','real').toFixed(2)}</strong> → crisi <strong style="color:var(--orange)">${CORR_PAIR_STRESS('eq','real').toFixed(2)}</strong></span>
    </div>
    <div style="margin-top:6px;font-size:11.5px;color:var(--text3)">⚠️ Nel 2022 azioni e obbligazioni hanno correlato positivamente (+0.6) per la prima volta dagli anni '70: il 60/40 non ha diversificato come atteso. Nell'agosto 2024 la correlazione è tornata negativa (flight-to-quality). Le correlazioni statiche usate nei modelli parametrici sottostimano il rischio in mercati stressati.</div>`;
}

// ── Sequence of Returns Risk: stessa crisi a inizio / metà / fine piano ─────
// Simula tre investitori che incontrano la STESSA crisi storica con capitale
// accumulato diverso (poco/medio/molto), isolando l'effetto dello stadio di vita.
function runSequenceRiskStress() {
  const crisisId = btState.seqCrisis || 2008;
  const cfg = BT_SEQ_CRISES[crisisId];
  if (!cfg) return;

  const portKey = btState.port === 'sim' ? state.portfolio : btState.port;
  // Preset con leva / managed futures non backtestabili; stessa esclusione per
  // portafoglio custom con Efficient Core, Trend Following o Carry.
  const isCustomNonBT = portKey === 'custom' &&
    (typeof customPortfolioIsNonBacktestable === 'function') &&
    customPortfolioIsNonBacktestable();
  if ({ ec_us_9060:1, ec_glob_9060:1, return_stack:1 }[portKey] || isCustomNonBT) {
    document.getElementById('btSeqRiskResults').style.display = 'block';
    document.getElementById('btSeqRiskContext').innerHTML =
      isCustomNonBT
        ? 'Lo stress test di sequenza non è disponibile per portafogli custom con <strong>Trend Following</strong>, <strong>Carry</strong> o <strong>Efficient Core (leva)</strong>: HIST_MONTHLY non contiene serie mensili proprie per questi asset. Gli altri asset (Small Cap Value, REITs, Mercati Emergenti, fattoriali) sono ora pienamente supportati con serie storiche reali.'
        : 'Lo stress test di sequenza non è disponibile per i portafogli con leva o managed futures (privi di serie storica coerente).';
    document.getElementById('btSeqRiskCards').innerHTML = '';
    document.getElementById('btSeqRiskNote').innerHTML = '';
    if (chartBtSeq) { chartBtSeq.destroy(); chartBtSeq = null; }
    return;
  }

  // Valori importati dal simulatore (o dallo stato backtest)
  const baseW0  = btState.w   ?? state.w   ?? 10000;
  const basePac = btState.pac ?? state.pac ?? 1000;
  // Modalità di versamento selezionata
  const mode = btState.seqMode || 'cap_pac';
  const modeLabel = { cap_pac: 'Capitale iniziale + PAC', solo_cap: 'Solo capitale iniziale (lump sum)', solo_pac: 'Solo PAC (capitale iniziale 0)' }[mode];

  // Validazione: la modalità scelta richiede dati che potrebbero essere a zero nel simulatore.
  const needsCap = (mode === 'solo_cap' || mode === 'cap_pac');
  const needsPac = (mode === 'solo_pac');
  if ((needsCap && baseW0 <= 0) || (needsPac && basePac <= 0)) {
    document.getElementById('btSeqRiskResults').style.display = 'block';
    const what = mode === 'solo_pac' ? 'un PAC mensile maggiore di zero' : 'un capitale iniziale maggiore di zero';
    document.getElementById('btSeqRiskContext').innerHTML =
      `La modalità <strong>${modeLabel}</strong> richiede ${what}, ma nel simulatore non è impostato. ` +
      `Modifica i valori nella scheda Simulatore (o nella sezione Portafoglio del Backtesting) e riprova, oppure scegli un'altra modalità.`;
    document.getElementById('btSeqRiskCards').innerHTML = '';
    document.getElementById('btSeqRiskNote').innerHTML = '';
    if (chartBtSeq) { chartBtSeq.destroy(); chartBtSeq = null; }
    return;
  }

  // startYear dinamico: 3 anni prima del crollo (fase di accumulo), con clamp ai dati
  const minYear = 1970;
  const startYear = Math.max(minYear, cfg.crashYear - 3);
  const yearsBeforeCrash = cfg.crashYear - startYear;
  const maxAvail = Math.floor((HIST_MONTHLY.length - yearToHistIdx(startYear)) / 12);

  const pac = basePac;
  // Tre momenti del piano in cui può arrivare la crisi, combinati con la modalità
  // di versamento scelta. Il "capitale al crollo" rappresenta quanto è esposto:
  //  - cap_pac : capitale base + accumulo PAC crescente per stadio
  //  - solo_cap: solo capitale (lump sum), crescente per stadio, nessun PAC
  //  - solo_pac: nessun capitale iniziale, solo PAC; l'esposizione cresce per stadio
  // recovery = anni residui dopo il crollo (molti a inizio, pochi a fine piano).
  // Tutti e tre gli stadi simulano la STESSA crisi sulla stessa finestra temporale
  // (3 anni di accumulo prima del crollo + 5 anni di osservazione del crollo/recupero).
  // L'unica variabile è il CAPITALE già accumulato al crollo, che cresce con lo stadio.
  // Così il Max Drawdown riflette sempre la crisi selezionata, non altre crisi che
  // cadrebbero in orizzonti più lunghi.
  const stageDefs = [
    { key: 'inizio', label: 'Crisi a INIZIO piano', accumMonths: 12 },
    { key: 'meta',   label: 'Crisi a METÀ piano',   accumMonths: 12 * 12 },
    { key: 'fine',   label: 'Crisi a FINE piano',   accumMonths: 12 * 25 },
  ];
  const windowYears = Math.min(yearsBeforeCrash + 5, maxAvail); // finestra comune

  const stages = stageDefs.map(s => {
    const yrs = s.accumMonths / 12;
    // Stima del capitale realmente accumulato a quel punto del piano: capitale iniziale
    // cresciuto a un rendimento medio + PAC accumulato anch'esso cresciuto. Questo rende
    // gli stadi distinti ANCHE quando il PAC è 0 (il capitale cresce per i rendimenti).
    const gMonthly = 0.005; // ~6%/a, crescita media di riferimento per stimare l'accumulo
    const grownCap = baseW0 * Math.pow(1 + gMonthly, s.accumMonths);
    // Valore futuro di una rendita mensile (PAC) capitalizzata
    const grownPac = basePac > 0 ? basePac * ((Math.pow(1 + gMonthly, s.accumMonths) - 1) / gMonthly) : 0;
    let w0, pacUsed, desc;
    if (mode === 'solo_cap') {
      // Solo capitale: il capitale iniziale è cresciuto fino a questo stadio, nessun PAC
      w0 = grownCap;
      pacUsed = 0;
      desc = `~${fmt(w0)} al crollo (capitale iniziale cresciuto in ${yrs} anni), nessun PAC`;
    } else if (mode === 'solo_pac') {
      // Solo PAC: nessun capitale iniziale, solo i versamenti accumulati e cresciuti
      w0 = grownPac;
      pacUsed = basePac;
      desc = `~${fmt(w0)} accumulati col solo PAC (€${fmtN(basePac)}/m) in ${yrs} anni`;
    } else {
      // cap_pac: capitale iniziale cresciuto + PAC accumulato e cresciuto
      w0 = grownCap + grownPac;
      pacUsed = basePac;
      desc = basePac > 0
        ? `~${fmt(w0)} al crollo (capitale + ${yrs} anni di PAC), poi €${fmtN(basePac)}/m`
        : `~${fmt(w0)} al crollo (capitale iniziale cresciuto in ${yrs} anni), PAC €0/m`;
    }
    return { ...s, w0, pacUsed, desc };
  });

  const savedYears = state.years;
  const results = stages.map(s => {
    state.years = windowYears; // stessa finestra per tutti: misura la STESSA crisi
    const r = simulateBacktest(portKey, startYear, s.pacUsed, s.w0, true);
    return { ...s, r };
  });
  state.years = savedYears;

  // ── Render ──
  document.getElementById('btSeqRiskResults').style.display = 'block';
  document.getElementById('btSeqRiskContext').innerHTML =
    `<strong>${cfg.label}</strong> — ${cfg.desc} La simulazione parte nel ${startYear} ` +
    `(crollo nel ${cfg.crashYear}), modalità <strong>${modeLabel}</strong>, portafoglio <strong>${getPortLabel(portKey)}</strong>. ` +
    `Confronta i tre momenti in cui la crisi può colpire il tuo piano.`;

  const fmtPct = (v) => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
  document.getElementById('btSeqRiskCards').innerHTML = results.map(s => {
    const ddColor = s.r.maxDD < -0.3 ? 'var(--red)' : s.r.maxDD < -0.15 ? 'var(--orange)' : 'var(--green)';
    // Perdita in euro = drawdown applicato al capitale esposto al crollo
    const lossEur = Math.round(s.w0 * s.r.maxDD);
    const row = (label, val, color) => `<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span style="color:var(--text2)">${label}</span><strong style="font-family:'DM Mono',monospace${color?`;color:${color}`:''}">${val}</strong></div>`;
    return `<div style="padding:14px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm)">
      <div style="font-size:13px;font-weight:700;margin-bottom:4px">${s.label}</div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:10px">${s.desc}</div>
      ${row('Capitale al crollo', fmt(s.w0), 'var(--blue)')}
      ${row('Max Drawdown', (s.r.maxDD*100).toFixed(1)+'%', ddColor)}
      ${row('Perdita al bottom', fmt(lossEur), 'var(--red)')}
      ${row('Valore finale', fmt(s.r.finalValue))}
    </div>`;
  }).join('');

  // Grafico: traiettoria del valore in EURO reali per i tre stadi (dati del simulatore)
  if (chartBtSeq) chartBtSeq.destroy();
  const ctx = document.getElementById('chBtSeqRisk');
  const colors = ['#1e8e3e', '#e37400', '#d93025'];
  const maxLen = Math.max(...results.map(s => s.r.annualValues.length));
  chartBtSeq = new Chart(ctx, {
    type: 'line',
    data: {
      labels: Array.from({ length: maxLen }, (_, i) => startYear + i),
      datasets: results.map((s, i) => ({
        label: s.label,
        data: s.r.annualValues,  // valore reale in euro (capitale + PAC del simulatore)
        borderColor: colors[i], backgroundColor: 'transparent', borderWidth: 2.5, tension: 0.2, pointRadius: 2,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top' },
        title: { display: true, text: 'Valore del portafoglio in € — stessa crisi, capitale esposto diverso' },
        tooltip: { callbacks: { title: c => 'Anno ' + c[0].label, label: c => ' ' + c.dataset.label + ': ' + fmt(c.raw) } },
      },
      scales: { y: { ticks: { callback: v => fmt(v) }, title: { display: true, text: 'Valore (€)' } } },
    },
  });

  // Nota interpretativa: il drawdown % è simile (stessa crisi), ma la PERDITA IN EURO
  // cresce con lo stadio perché il capitale esposto è maggiore.
  const lossInizio = Math.round(results[0].w0 * results[0].r.maxDD);
  const lossFine   = Math.round(results[2].w0 * results[2].r.maxDD);
  document.getElementById('btSeqRiskNote').innerHTML =
    `<strong>Lettura:</strong> lo stesso crollo del ${cfg.crashYear} provoca una caduta percentuale simile in tutti gli stadi ` +
    `(è la stessa crisi), ma la <strong>perdita in euro</strong> cambia radicalmente: circa <strong>${fmt(Math.abs(lossInizio))}</strong> ` +
    `se la crisi arriva a inizio piano, contro circa <strong>${fmt(Math.abs(lossFine))}</strong> se arriva verso la fine. ` +
    `Questo è il rischio di sequenza: la stessa crisi fa molto più male quando hai già accumulato un grande capitale, ` +
    `e ti restano pochi anni per recuperare. È il motivo per cui conviene ridurre gradualmente la quota azionaria ` +
    `avvicinandosi all'obiettivo (glide path).`;

  document.getElementById('btSeqRiskResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function runAllBacktests() {
  // Run backtesting for all start years and compare
  const portKey = btState.port === 'sim' ? state.portfolio : btState.port;
  // Stessa esclusione di runBacktest: i preset con leva / managed futures non
  // sono backtestabili sulla serie storica. Idem per custom con Trend / Carry.
  const NON_BACKTESTABLE = { ec_us_9060: 1, ec_glob_9060: 1, return_stack: 1 };
  if (NON_BACKTESTABLE[portKey] || (portKey === 'custom' && customPortfolioIsNonBacktestable())) {
    document.getElementById('btResults').style.display = 'block';
    document.getElementById('btCompareSec').style.display = 'none';
    const lbl = (typeof getPortLabel === 'function') ? getPortLabel(portKey) : portKey;
    document.getElementById('btResultTitle').textContent = `Backtesting non disponibile — ${lbl}`;
    const box = document.getElementById('btContextBox');
    box.style.background = 'var(--orange-dim, rgba(230,138,0,.08))';
    box.style.border = '1px solid rgba(230,138,0,.35)';
    box.style.color = 'var(--orange, #b8860b)';
    const isCustomMF2 = portKey === 'custom' && customPortfolioIsNonBacktestable();
    box.innerHTML = isCustomMF2
      ? `Il portafoglio custom include asset <strong>privi di serie storica mensile propria in questo modello</strong>: ` +
        `<strong>Trend Following / Managed Futures</strong>, <strong>Carry</strong> o <strong>Efficient Core (leva)</strong>. ` +
        `(Small Cap Value, REITs, Mercati Emergenti e i fattoriali Value/Momentum/Quality/Size/Investment/Low-Vol sono ora pienamente backtestabili con serie storiche reali 1979-2024.) ` +
        `Per gli asset a leva o managed futures, la storia mensile coerente non è disponibile. ` +
        `Usa le schede <strong>Simulatore</strong>, <strong>Monte Carlo</strong> o <strong>Frontiera Efficiente</strong>, che usano i parametri specifici (μ, σ) di ogni asset.`
      : `Il backtest storico non è applicabile a <strong>${lbl}</strong>: ` +
        `usa leva e/o managed futures, asset senza serie storica coerente in questo modello. ` +
        `Usa le schede <strong>Simulatore</strong>, <strong>Monte Carlo</strong> o <strong>Frontiera Efficiente</strong>.`;
    const statsEl = document.getElementById('btStats');      if (statsEl) statsEl.innerHTML = '';
    const ddSec   = document.getElementById('btDrawdownSec'); if (ddSec)   ddSec.style.display = 'none';
    return;
  }
  const tC = 'rgba(0,0,0,.45)', gC = 'rgba(0,0,0,.05)';
  
  document.getElementById('btResults').style.display = 'block';
  document.getElementById('btCompareSec').style.display = 'block';
  
  const years2 = Object.keys(BT_PERIODS).map(Number);
  const datasets = [];
  const summaryRows = [];
  
  for (const startYear of years2) {
    const period = BT_PERIODS[startYear];
    const result = simulateBacktest(portKey, startYear, btState.pac, btState.w);
    
    datasets.push({
      label: startYear.toString(),
      data: result.annualValues.slice(0, Math.min(result.annualValues.length, 26)), // max 25 years
      borderColor: period.color,
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
      tension: .3,
    });
    
    summaryRows.push({
      year: startYear, label: period.label, 
      cagr: result.cagr, twr: result.twr, finalVal: result.finalValue,
      maxDD: result.maxDD, invested: result.finalInvested,
      color: period.color,
      capeStart:  result.capeStart,
      capeFactor: result.capeFactor,
      cagrNoCape: result.cagrNoCape,
    });
  }
  
  // Ordina per rendimento asset (TWR) — confrontabile tra anni indipendentemente
  // dal timing dei versamenti (l'IRR varierebbe solo per effetto del calendario PAC).
  summaryRows.sort((a, b) => b.twr - a.twr);
  
  document.getElementById('btCompareStats').innerHTML = `
    <div class="tbl-outer"><table>
      <thead><tr>
        <th style="text-align:left">Anno inizio</th>
        <th>Evento</th>
        <th title="CAPE Shiller all'inizio del periodo — prevede i rendimenti a 10 anni (R²≈0.38-0.45)">CAPE inizio</th>
        <th title="Rendimento asset (TWR) con aggiustamento CAPE — indipendente dal timing dei versamenti">TWR adj.</th>
        <th title="Rendimento asset (TWR) senza aggiustamento CAPE — solo dati storici puri">TWR storico</th>
        <th>Valore finale</th>
        <th>Max Drawdown</th>
      </tr></thead>
      <tbody>${summaryRows.map(r => {
        const cl = r.capeStart ? capeBtLabel(r.capeStart) : null;
        const cpPct = r.capeStart ? capeHistPercentile(r.capeStart) : null;
        const capeCell = r.capeStart
          ? `<span style="font-family:'DM Mono',monospace;font-weight:700;color:${cl.col}">${r.capeStart.toFixed(1)}</span><br><span style="font-size:10px;color:var(--text3)">${cpPct}° pct. · ${cl.txt}</span>`
          : '—';
        const cagrDelta = (r.cagrNoCape != null && Math.abs(r.twr - r.cagrNoCape) > 0.001)
          ? `<br><span style="font-size:10px;color:var(--text3)" title="Delta rispetto al TWR storico non aggiustato">${r.twr >= r.cagrNoCape ? '+' : ''}${((r.twr - r.cagrNoCape)*100).toFixed(2)}pp vs storico</span>`
          : '';
        const cagrNoCapeCell = r.cagrNoCape != null
          ? `<span style="font-family:'DM Mono',monospace;color:var(--text3)">${(r.cagrNoCape >= 0 ? '+' : '') + (r.cagrNoCape*100).toFixed(2)}%/a</span>`
          : `<span style="font-family:'DM Mono',monospace;color:var(--text3)">${(r.twr >= 0 ? '+' : '') + (r.twr*100).toFixed(2)}%/a</span>`;
        return `<tr>
          <td style="text-align:left;font-weight:700;color:${r.color};font-family:'DM Mono',monospace">${r.year}</td>
          <td style="font-size:11.5px;color:var(--text2)">${BT_PERIODS[r.year].label.split('—')[1]?.trim() || ''}</td>
          <td style="text-align:center">${capeCell}</td>
          <td class="${r.twr >= 0.05 ? 'pos' : r.twr >= 0 ? 'neutral' : 'neg'}" style="font-family:'DM Mono',monospace;font-weight:600">${(r.twr >= 0 ? '+' : '') + (r.twr*100).toFixed(2)}%/a${cagrDelta}</td>
          <td>${cagrNoCapeCell}</td>
          <td style="font-weight:600">${fmt(r.finalVal)}</td>
          <td class="${r.maxDD < -0.3 ? 'neg' : r.maxDD < -0.15 ? 'neutral' : 'pos'}" style="font-family:'DM Mono',monospace">${(r.maxDD*100).toFixed(1)}%</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table></div>
    <div style="font-size:11.5px;color:var(--text3);margin-top:10px;padding:10px 14px;background:var(--bg2);border-radius:8px;line-height:1.7">
      <strong>📊 Metodologia CAPE-adjusted:</strong> il rendimento azionario mensile viene scalato dal fattore CAPE dell'anno di partenza (regressione Shiller: R²≈0.38-0.45 su 10 anni). Mercati cari (CAPE alto → fattore &lt;1) producono rendimenti futuri inferiori alla media storica; mercati economici (CAPE basso → fattore &gt;1) producono rendimenti superiori. L'aggiustamento si attenua linearmente su 10 anni (mean-reversion). I crash storici e la struttura temporale rimangono invariati.
    </div>`;
  
  // Normalize all datasets to same start to compare trajectories
  const normalizedDatasets = datasets.map(ds => ({
    ...ds,
    data: ds.data.map((v, i) => i === 0 ? 100 : Math.round(v / ds.data[0] * 100)),
    label: (() => {
      const row = summaryRows.find(r => r.year === +ds.label);
      const cagr = row?.cagr;
      return ds.label + (cagr != null ? ' (+' + (cagr*100).toFixed(1) + '%/a)' : '');
    })(),
  }));
  
  if (chartBtComp) { chartBtComp.destroy(); chartBtComp = null; }
  const xLabels = Array.from({ length: 26 }, (_, i) => 'Anno +' + i);
  chartBtComp = new Chart(document.getElementById('chBtComp'), {
    type: 'line',
    data: { labels: xLabels, datasets: normalizedDatasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, labels: { font: { size: 10 } } },
        tooltip: { callbacks: { title: c => c[0].label, label: c => ` ${c.dataset.label.split(' ')[0]}: ${c.raw}% del capitale iniziale` }, backgroundColor: '#fff', borderColor: '#dadce0', borderWidth: 1, padding: 10 }
      },
      scales: {
        x: { ticks: { color: tC, font: { size: 10, family: 'DM Mono' }, maxTicksLimit: 13 }, grid: { color: gC } },
        y: { ticks: { color: tC, font: { size: 10, family: 'DM Mono' }, callback: v => v + '%' }, grid: { color: gC } }
      }
    }
  });
}
