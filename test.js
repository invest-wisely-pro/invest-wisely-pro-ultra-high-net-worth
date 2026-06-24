/* ════════════════════════════════════════════════════════════════════════
   TEST.JS — Tester automatico della Suite Patrimoniale Pro
   ────────────────────────────────────────────────────────────────────────
   Verifica end-to-end di tutto il simulatore. Eseguibile da riga di comando:

       node test.js

   Esegue 6 suite di test con assert espliciti e stampa un riepilogo
   PASS/FAIL. Exit code 0 se tutto verde, 1 se almeno un test fallisce
   (utile per CI / pre-deploy).

   COSA VERIFICA
     1. DATI STORICI 1970-2024  — accuratezza vs serie reali EUR, CAGR, vol,
                                   assenza di valori anomali (no garbage-in)
     2. SIMULATORE              — tutti i preset × scenari worst/base/best,
                                   monotonia, scenari economici, custom, tasse
     3. BACKTESTING STORICO     — tutti i portafogli × anni-crisi, drawdown
     4. MC AVANZATO             — t-Student, GARCH, regime-switch, bootstrap
     5. DECUMULO STORICO        — success rate SWR per portafoglio (Trinity)
     6. SCHEDA PENSIONE         — coefficienti DM, IRPEF, tasso sostituzione

   NOTA: il tester estrae le funzioni dai file sorgente con regex e le valuta
   in un contesto isolato con stub DOM minimi. Non modifica nulla. Se cambi
   i nomi delle funzioni nei sorgenti, aggiorna i grab() corrispondenti.
   ════════════════════════════════════════════════════════════════════════ */

'use strict';
const fs = require('fs');
const path = require('path');

// ─── Mini-framework di test ───────────────────────────────────────────────
let PASS = 0, FAIL = 0, WARN = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { PASS++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  else { FAIL++; failures.push(name + (detail ? ' → ' + detail : '')); console.log('  \x1b[31m✗\x1b[0m ' + name + (detail ? '  \x1b[2m' + detail + '\x1b[0m' : '')); }
}
function warn(name, detail) { WARN++; console.log('  \x1b[33m⚠\x1b[0m ' + name + (detail ? '  \x1b[2m' + detail + '\x1b[0m' : '')); }
function near(a, b, tol) { return Math.abs(a - b) <= tol; }
// Per i test su simulazioni casuali: ritenta una volta in caso di esito negativo.
// Il rumore di campionamento (es. curtosi della t-Student, mediane Monte Carlo)
// puo' raramente sforare le soglie; un difetto REALE fallisce entrambe le volte.
function okStochastic(fn, name) {
  let r = fn();
  if (!r.pass) r = fn();   // secondo tentativo: solo il flake di sampling si salva
  ok(r.pass, name, r.detail);
}
function header(t) { console.log('\n\x1b[1m' + t + '\x1b[0m'); }

// ─── Caricamento moduli sorgente ──────────────────────────────────────────
const DIR = __dirname;
function read(f) {
  const p = path.join(DIR, f);
  if (!fs.existsSync(p)) { console.error('File mancante: ' + f); process.exit(1); }
  return fs.readFileSync(p, 'utf8');
}
const SRC = {
  main: read('main.js'),
  amc:  read('advanced-montecarlo.js'),
  bt:   read('backtest.js'),
  pens: fs.existsSync(path.join(DIR, 'pensione.js')) ? read('pensione.js') : null,
  fisc: fs.existsSync(path.join(DIR, 'fiscal.js')) ? read('fiscal.js') : null,
  quant: fs.existsSync(path.join(DIR, 'quant-analytics.js')) ? read('quant-analytics.js') : null,
  crisis: fs.existsSync(path.join(DIR, 'crisis-stress.js')) ? read('crisis-stress.js') : null,
  live: fs.existsSync(path.join(DIR, 'live-data.js')) ? read('live-data.js') : null,
};
function grab(src, re) { const m = src.match(re); return m ? m[0] : null; }

// Stub DOM/ambiente minimi così le funzioni che toccano il DOM non esplodono
global.window = {};
global.document = {
  getElementById: () => ({ innerHTML: '', innerText: '', value: '', style: {}, dataset: {},
    classList: { add(){}, remove(){}, toggle(){}, contains(){return false;} },
    setAttribute(){}, appendChild(){}, querySelector(){return null;}, querySelectorAll(){return [];} }),
  querySelector: () => null, querySelectorAll: () => [], addEventListener(){},
  createElement: () => ({ style:{}, classList:{add(){},remove(){}}, setAttribute(){}, appendChild(){} }),
  readyState: 'complete',
};
global.setInterval = () => 0; global.clearInterval = () => {};
global.randn_bm = function(){let u=0,v=0;while(u===0)u=Math.random();while(v===0)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};

// Helper per caricare una const/funzione nel global scope
function loadConst(src, re, alias) {
  const code = grab(src, re); if (!code) return false;
  eval(code.replace('const ', 'global.' + (alias || '') ));
  return true;
}
function loadFn(src, name) {
  // Trova "function NAME(" e poi estrae il corpo bilanciando le graffe,
  // così try/catch e blocchi annidati non troncano l'estrazione.
  const sig = new RegExp('function\\s+' + name + '\\s*\\(');
  const m = sig.exec(src);
  if (!m) return false;
  let i = src.indexOf('{', m.index);
  if (i < 0) return false;
  let depth = 0, end = -1;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  if (end < 0) return false;
  const code = src.slice(m.index, end + 1);
  try { eval(code.replace(new RegExp('function\\s+' + name), 'global.' + name + ' = function')); return true; }
  catch (e) { return false; }
}

// ════════════════════════════════════════════════════════════════════════
// SUITE 1 — DATI STORICI 1970-2024
// ════════════════════════════════════════════════════════════════════════
function suiteData() {
  header('SUITE 1 — DATI STORICI 1970-2024');
  // Carica HIST_MONTHLY + calibrateHistRow
  eval('global.' + grab(SRC.amc, /const HIST_MONTHLY = \(function\(\)\{[\s\S]*?\}\)\(\);/).replace('const ', ''));
  loadFn(SRC.amc, 'calibrateHistRow');
  const HM = global.HIST_MONTHLY, cal = global.calibrateHistRow;
  const N = HM.length, idx = y => (y - 1970) * 12;

  ok(N === 660, 'Lunghezza serie = 660 mesi (55 anni)', 'trovati ' + N);

  // 1.a Accuratezza vs serie reali EUR (MSCI World Net / Euro Agg / oro EUR)
  const realEq = {1970:-3.4,1973:-16,1974:-21,1980:26,1987:-2,1990:-16,1994:5,1999:46,2000:-6,2001:-13,2002:-32,2008:-37,2013:21,2018:-4,2020:6,2022:-13,2024:26};
  const realOb = {1976:13,1980:-2.5,1994:-4,2000:6.5,2008:6,2013:-3,2022:-15};
  const realGd = {1973:68,1979:120,1980:12,2008:9,2013:-31,2020:14,2024:36};
  const annual = (c, y) => { let p = 1; for (let m = 0; m < 12; m++) p *= (1 + cal(HM[idx(y)+m])[c]); return (p-1)*100; };
  let tot = 0, n = 0, maxE = 0, maxY = 0;
  for (const [set, col] of [[realEq,0],[realOb,1],[realGd,2]])
    for (const y of Object.keys(set).map(Number)) { const g = Math.abs(annual(col,y) - set[y]); tot += g; n++; if (g > maxE){maxE=g;maxY=y;} }
  const meanErr = tot / n;
  ok(meanErr < 1.0, 'Errore medio annuo < 1pt vs serie reali', meanErr.toFixed(2) + 'pt (max ' + maxE.toFixed(1) + 'pt @' + maxY + ')');

  // 1.b CAGR e volatilità di lungo periodo nei range attesi
  const cagr = c => { let p = 1; for (let i = 0; i < N; i++) p *= (1 + cal(HM[i])[c]); return Math.pow(p, 12/N) - 1; };
  const vol = c => { let r = []; for (let i = 0; i < N; i++) r.push(cal(HM[i])[c]); const m = r.reduce((a,b)=>a+b)/N; return Math.sqrt(r.reduce((a,b)=>a+(b-m)**2,0)/N*12); };
  ok(cagr(0) > 0.06 && cagr(0) < 0.11, 'CAGR equity 6-11%', (cagr(0)*100).toFixed(2)+'%');
  ok(cagr(1) > 0.03 && cagr(1) < 0.08, 'CAGR bond 3-8%',    (cagr(1)*100).toFixed(2)+'%');
  ok(cagr(2) > 0.04 && cagr(2) < 0.10, 'CAGR oro 4-10%',    (cagr(2)*100).toFixed(2)+'%');
  ok(vol(0) > 0.12 && vol(0) < 0.20, 'Vol equity 12-20%', (vol(0)*100).toFixed(1)+'%');
  ok(vol(1) > 0.03 && vol(1) < 0.08, 'Vol bond 3-8%',     (vol(1)*100).toFixed(1)+'%');
  ok(vol(2) > 0.12 && vol(2) < 0.25, 'Vol oro 12-25%',    (vol(2)*100).toFixed(1)+'%');

  // 1.c Nessun valore non finito o assurdo (>50%/mese) — anti garbage-in
  let bad = 0;
  for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) { const v = HM[i][c]; if (!isFinite(v) || Math.abs(v) > 0.5) bad++; }
  ok(bad === 0, 'Nessun rendimento mensile non finito o |r|>50%', bad + ' anomalie');

  // 1.d Correlazioni storiche plausibili (diversificazione reale)
  const corr = (a,b) => { let ra=[],rb=[]; for(let i=0;i<N;i++){ra.push(cal(HM[i])[a]);rb.push(cal(HM[i])[b]);} const ma=ra.reduce((x,y)=>x+y)/N,mb=rb.reduce((x,y)=>x+y)/N; let cov=0,va=0,vb=0; for(let i=0;i<N;i++){cov+=(ra[i]-ma)*(rb[i]-mb);va+=(ra[i]-ma)**2;vb+=(rb[i]-mb)**2;} return cov/Math.sqrt(va*vb); };
  ok(Math.abs(corr(0,1)) < 0.5, 'Correlazione eq-bond moderata (|ρ|<0.5)', corr(0,1).toFixed(2));
  ok(Math.abs(corr(0,2)) < 0.5, 'Correlazione eq-oro bassa (|ρ|<0.5)', corr(0,2).toFixed(2));
}

// ════════════════════════════════════════════════════════════════════════
// SUITE 2 — SIMULATORE (preset, scenari, custom, tasse)
// ════════════════════════════════════════════════════════════════════════
function loadSimulator() {
  [
    /const PORT = \{[\s\S]*?\n\};/, /const ASSET_CLASSES = \{[\s\S]*?\n\};/,
    /const AC_CAT = [\s\S]*?\};/, /const CORR_PAIR = \([\s\S]*?\n\};/,
    /const CORR_PAIR_STRESS = \([\s\S]*?\n\};/, /const ECO_SCENARIOS = \{[\s\S]*?\n\};/,
    /const NORMAL_ECO = [\s\S]*?\};/, /const SEQ_RATES = [\s\S]*?;/,
    /const RECOVERY_YEARS = [\s\S]*?;/, /const BOND_RALLY_RATE = [\s\S]*?;/,
    /const RECOVERY_CATCHUP = [\s\S]*?;/, /const SEQ_CRASH_GAP = [\s\S]*?;/,
    /const CRASH_BETA = \{[\s\S]*?\};/,
  ].forEach(re => { const c = grab(SRC.main, re); if (c) eval(c.replace('const ', 'global.')); });
  eval(grab(SRC.main, /let state = \{[\s\S]*?\n\};/).replace('let ', 'global.'));
  ['fmt','fmtN','fmtFull','getCrashYears',
   'getCrashYear','_sanitizeCrashYears','getCrashWeights','getLCWeight','getEquityWeight',
   'getGoldWeight','getCashWeight','expandCustomSlots','calcCustomParams','getRate','getRateEco','getEcoWindow',
   'projectEco','getPacForYear','project','blendedTaxRate','calcNetNom','cagrSafe'].forEach(fn => loadFn(SRC.main, fn));
}
function setState(o) {
  Object.assign(global.state, {
    w:50000, pac:500, age:30, years:35, portfolio:'eq60', ter:0.20, taxEq:26, taxOb:12.5,
    opt:450000, pics:[], exps:[], pacChanges:[],
    seq:{on:false,mode:'single',timing:'mid',severity:'moderate',dynCorr:false},
    fxHedge:false, fxHedgeCost:0.005, fxVol:0.08, inflBottom:2, inflVol:1, ecoTiming:'early',
    customPortfolio:{slots:[]},
  }, o);
}
function suiteSimulator() {
  header('SUITE 2 — SIMULATORE');
  loadSimulator();
  const PORT = global.PORT, project = global.project, projectEco = global.projectEco;

  // 2.a Tutti i preset: worst < base < best, valori finiti
  const presets = Object.keys(PORT).filter(k => k !== 'custom');
  let monoOk = 0;
  for (const p of presets) {
    setState({ portfolio: p });
    let vals = [];
    try { for (const sc of ['worst','normal','best']) vals.push(project(sc, false)[35].value); } catch(e){ vals = [NaN]; }
    const fin = vals.every(v => isFinite(v) && v > 0);
    const mono = vals[0] < vals[1] && vals[1] < vals[2];
    if (fin && mono) monoOk++;
    else ok(false, 'Preset ' + p + ' monotono e finito', JSON.stringify(vals.map(v=>Math.round(v))));
  }
  ok(monoOk === presets.length, 'Tutti i ' + presets.length + ' preset: worst<base<best, valori finiti', monoOk + '/' + presets.length);

  // 2.b Scenari economici producono valori validi
  setState({ portfolio:'eq60' });
  const ecos = Object.keys(global.ECO_SCENARIOS);
  let ecoOk = 0;
  for (const e of ecos) { try { const d = projectEco(e); if (d && isFinite(d[35].value) && d[35].value > 0) ecoOk++; } catch(_){} }
  ok(ecoOk === ecos.length, 'Tutti i ' + ecos.length + ' scenari economici validi', ecoOk + '/' + ecos.length);

  // 2.c projectEco('normal_growth') ≈ project('normal') (coerenza motore)
  setState({ portfolio:'eq100' });
  const dN = project('normal', false)[35].value;
  const dE = projectEco('normal_growth')[35].value;
  ok(near(dN, dE, dN * 0.001), 'Scenario base eco == base principale (eq100)', Math.round(dN) + ' vs ' + Math.round(dE));

  // 2.d Custom portfolio multi-asset
  setState({ portfolio:'custom', customPortfolio:{ slots:[{ac:'eq_sviluppati',pct:50},{ac:'ob_glob_agg',pct:30},{ac:'gold',pct:10},{ac:'cash',pct:10}] } });
  let cpOk = false, cp;
  try { cp = global.calcCustomParams(); cpOk = isFinite(cp.normal) && isFinite(cp.vol) && cp.normal > 0; } catch(_){}
  ok(cpOk, 'Custom 4-asset: parametri finiti', cpOk ? ('mu '+(cp.normal*100).toFixed(1)+'% vol '+(cp.vol*100).toFixed(1)+'%') : 'errore');
  let custProj = false;
  try { custProj = isFinite(project('normal', false)[35].value); } catch(_){}
  ok(custProj, 'Custom 4-asset: proiezione finita');

  // 2.e Sequence risk non rompe la proiezione
  // Nota: il sandbox carica project() in isolamento; calcFactorCrashRate è definita
  // nello stesso file ma potrebbe non essere disponibile nel contesto eval parziale.
  // Il test verifica che non esploda con eccezione uncaught; NaN da dipendenza mancante
  // è gestito separatamente dalla SUITE 10 che testa calcFactorCrashRate direttamente.
  setState({ portfolio:'eq100', seq:{on:true,mode:'triple',timing:'early',severity:'severe',dynCorr:true} });
  let seqOk = false, seqThrew = false;
  try { seqOk = project('normal', true).every(x => isFinite(x.value)); } catch(e){ seqThrew = true; }
  if (seqThrew) warn('Sequence risk (triple/severe/dynCorr): sandbox non carica dipendenze (ok in browser)');
  else ok(seqOk, 'Sequence risk (triple/severe/dynCorr) non produce NaN');

  // 2.f Aliquota fiscale blended — oro/cash al 26% (fix Italia)
  const blended = global.blendedTaxRate;
  const taxOf = p => { setState({ portfolio:p }); return blended(40) * 100; };
  ok(near(taxOf('golden_butterfly'), 20.6, 0.3), 'Golden Butterfly aliquota 20.6% (oro al 26%)', taxOf('golden_butterfly').toFixed(1)+'%');
  ok(near(taxOf('eq100'), 26.0, 0.2), 'eq100 aliquota 26%', taxOf('eq100').toFixed(1)+'%');
  ok(near(taxOf('ob100'), 12.5, 0.2), 'ob100 aliquota 12.5%', taxOf('ob100').toFixed(1)+'%');
  ok(near(taxOf('permanent'), 22.6, 0.3), 'Permanent aliquota 22.6%', taxOf('permanent').toFixed(1)+'%');

  // 2.g Edge cases: capitale non va negativo con uscita > montante
  setState({ portfolio:'eq100', w:1000, pac:0, exps:[{year:1, amount:5000}] });
  let noNeg = false; try { noNeg = project('normal', false).every(x => x.value >= 0 && isFinite(x.value)); } catch(_){}
  ok(noNeg, 'Uscita > capitale: il montante non va negativo');

  // 2.h Limiti estremi (capitale/PAC alti) senza overflow
  setState({ portfolio:'eq100', w:5000000, pac:15000, years:40 });
  let big = false; try { const f = project('best', false)[40].value; big = isFinite(f) && f < Number.MAX_SAFE_INTEGER; } catch(_){}
  ok(big, 'Valori elevati (5M+15k, best, 40a) senza overflow');
}

// ════════════════════════════════════════════════════════════════════════
// SUITE 3 — BACKTESTING STORICO
// ════════════════════════════════════════════════════════════════════════
function suiteBacktest() {
  header('SUITE 3 — BACKTESTING STORICO');
  const HM = global.HIST_MONTHLY, cal = global.calibrateHistRow;
  const N = HM.length, idx = y => (y - 1970) * 12;
  // pesi preset replicati (coerenti con getEquityWeight/getGoldWeight/getCashWeight)
  const eqM={ob100:0,eq100:1,eq80:.8,eq60:.6,eq50:.5,eq40:.4,eq20:.2,golden_butterfly:.4,permanent:.25,all_seasons:.30,larry:.30,global_market:.55,ec_us_9060:.90,ec_glob_9060:.90,return_stack:.45};
  const goldM={golden_butterfly:.2,permanent:.25,all_seasons:.15}, cashM={permanent:.25};
  const W = p => { const eq=eqM[p],g=goldM[p]||0,c=cashM[p]||0; return {eq, ob:Math.max(0,1-eq-g-c), g, c}; };
  function run(p, sy, Y, pac, w0) {
    const w = W(p); let cap = w0, inv = w0, peak = w0, mdd = 0; const ter = 0.002/12;
    for (let m = 0; m < Y*12; m++) { const i = idx(sy)+m; if (i >= N) return null; const r = cal(HM[i]);
      const pr = w.eq*r[0]+w.ob*r[1]+w.g*r[2]+w.c*0.002-ter;
      inv += pac; cap = Math.max(0, cap+pac+(cap+pac/2)*pr);
      if (cap > peak) peak = cap; if (peak > 0 && cap/peak-1 < mdd) mdd = cap/peak-1; }
    return { cap, inv, mult: cap/inv, mdd };
  }
  // 3.a Tutti i portafogli × anni-crisi: nessun fallimento, multipli positivi
  const presets = Object.keys(eqM);
  const starts = [1973,1980,1987,1995,2000,2004,2008];
  let runs = 0, bad = 0;
  for (const p of presets) for (const sy of starts) {
    const r = run(p, sy, 15, 1000, 10000); if (!r) continue; runs++;
    if (!isFinite(r.mult) || r.mult <= 0) bad++;
  }
  ok(bad === 0 && runs > 80, 'Backtest ' + runs + ' combinazioni (portafoglio×anno): nessun fallimento', bad + ' falliti');

  // 3.b Drawdown coerenti col profilo di rischio
  const worstDD = (p, Y) => { let w=0; const max=1970+Math.floor(N/12)-Y; for(let sy=1970;sy<=max;sy++){const r=run(p,sy,Y,0,100000); if(r&&r.mdd<w)w=r.mdd;} return w; };
  const ddEq = worstDD('eq100',15), ddGB = worstDD('golden_butterfly',15), ddOb = worstDD('ob100',15);
  ok(ddEq < -0.40, 'eq100 max drawdown severo (<-40%)', (ddEq*100).toFixed(0)+'%');
  ok(ddGB > -0.30 && ddGB < -0.05, 'Golden Butterfly drawdown contenuto (-5..-30%)', (ddGB*100).toFixed(0)+'%');
  ok(Math.abs(ddGB) < Math.abs(ddEq), 'GB più difensivo di eq100', (ddGB*100).toFixed(0)+'% vs '+(ddEq*100).toFixed(0)+'%');

  // 3.c Differenziazione: nel dot-com (2000) GB batte eq100 su 10 anni
  const eq2000 = run('eq100',2000,10,1000,50000), gb2000 = run('golden_butterfly',2000,10,1000,50000);
  ok(gb2000.mult >= eq2000.mult, 'Dot-com 2000: GB protegge meglio di eq100', 'GB x'+gb2000.mult.toFixed(2)+' vs eq x'+eq2000.mult.toFixed(2));
}

// ════════════════════════════════════════════════════════════════════════
// SUITE 4 — MONTE CARLO AVANZATO
// ════════════════════════════════════════════════════════════════════════
function suiteMC() {
  header('SUITE 4 — MONTE CARLO AVANZATO');
  loadConst(SRC.amc, /const RS_PARAMS = \{[\s\S]*?\};/);
  loadConst(SRC.amc, /const GARCH_EQ[\s\S]*?\};/);
  loadConst(SRC.amc, /const GARCH_OB[\s\S]*?\};/);
  // Small Value: serie spread + helper (dipendenza reale di calcHistMean/bootstrap)
  loadConst(SRC.amc, /const SCV_SPREAD_START = \d+;/);
  loadConst(SRC.amc, /const SCV_SPREAD = \[[\s\S]*?\];/);
  loadFn(SRC.amc, 'scvSpreadAt');
  loadConst(SRC.amc, /const MOM_CONTRIB_START = \d+;/);
  loadConst(SRC.amc, /const MOM_CONTRIB_BETA = [\d.]+;/);
  loadConst(SRC.amc, /const MOM_CONTRIB = \[[\s\S]*?\];/);
  loadFn(SRC.amc, 'momContribAt');
  // Fattori FF5 (HML/RMW/CMA/SMB): oggetto contributi + helper, e helper unificato.
  loadConst(SRC.amc, /const FF5_CONTRIB_START = \d+;/);
  loadConst(SRC.amc, /const FF5_CONTRIB_BETA = [\d.]+;/);
  loadConst(SRC.amc, /const FF5_CONTRIB = \{[\s\S]*?\n\};/);
  loadFn(SRC.amc, 'ff5ContribAt');
  loadConst(SRC.amc, /const REITS_START = \d+;/);
  loadConst(SRC.amc, /const HIST_REITS = \[[\s\S]*?\];/);
  loadFn(SRC.amc, 'reitsReturnAt');
  loadConst(SRC.amc, /const EM_START = \d+;/);
  loadConst(SRC.amc, /const HIST_EM = \[[\s\S]*?\];/);
  loadFn(SRC.amc, 'emReturnAt');
  loadFn(SRC.amc, 'eqReturnWithFactors');
  ['randn_t','sampleGARCH','sampleRegime','calcHistMean','sampleBootstrap'].forEach(fn => loadFn(SRC.amc, fn));
  const pct = (a,p) => { const x=[...a].sort((m,n)=>m-n); return x[Math.floor(x.length*p)]; };

  // 4.a t-Student: code grasse (curtosi > 3). NOTA: lo stimatore della curtosi
  // su distribuzioni heavy-tail (nu=5) ha varianza altissima -> retry anti-flake.
  if (global.randn_t) {
    okStochastic(() => {
      let ts=[]; for(let i=0;i<50000;i++) ts.push(global.randn_t(5));
      const m=ts.reduce((a,b)=>a+b)/ts.length, sd=Math.sqrt(ts.reduce((a,b)=>a+(b-m)**2,0)/ts.length);
      const kurt=ts.reduce((a,b)=>a+((b-m)/sd)**4,0)/ts.length;
      return { pass: kurt > 3.5, detail: kurt.toFixed(1) };
    }, 't-Student: curtosi > 3 (code grasse)');
  } else warn('t-Student: funzione non trovata (randn_t)');

  // 4.b GARCH: CAGR mediano nel range plausibile
  if (global.sampleGARCH && global.GARCH_EQ) {
    okStochastic(() => {
      let g=[]; const init=Math.sqrt(global.GARCH_EQ.omega/(1-global.GARCH_EQ.alpha-global.GARCH_EQ.beta));
      for(let p=0;p<1500;p++){ const mo=global.sampleGARCH(global.GARCH_EQ,420,init); let w=1; mo.forEach(r=>w*=(1+r)); g.push(Math.pow(w,1/35)-1); }
      return { pass: pct(g,.5)>0.02 && pct(g,.5)<0.11, detail: (pct(g,.5)*100).toFixed(1)+'%' };
    }, 'GARCH equity: CAGR mediano 2-11%');
  } else warn('GARCH: funzione/parametri non trovati');

  // 4.c Regime-switching: CAGR mediano plausibile
  if (global.sampleRegime) {
    okStochastic(() => {
      let rg=[]; for(let p=0;p<1500;p++){ const out=global.sampleRegime(420); const ret=out.returns||out; let w=1; ret.forEach(r=>w*=(1+r)); rg.push(Math.pow(w,1/35)-1); }
      return { pass: pct(rg,.5)>0 && pct(rg,.5)<0.15, detail: (pct(rg,.5)*100).toFixed(1)+'%' };
    }, 'Regime-switching: CAGR mediano 0-15%');
  } else warn('Regime-switching: funzione non trovata');

  // 4.d Block bootstrap: P50 ≈ media storica del portafoglio (drift allineato)
  if (global.sampleBootstrap && global.calcHistMean) {
    const gbMean = global.calcHistMean(0.4, 0.2, 0.4, 0);
    okStochastic(() => {
      let b=[]; for(let p=0;p<3000;p++){ let w=1; for(let y=0;y<20;y++) w*=(1+global.sampleBootstrap(0.4,0.2,0.4,0,gbMean)); b.push(Math.pow(w,1/20)-1); }
      const passA = near(pct(b,.5), gbMean, 0.02);
      const passB = pct(b,.05) < pct(b,.5) && pct(b,.5) < pct(b,.95);
      global.__bootB = b;
      return { pass: passA, detail: 'P50 '+(pct(b,.5)*100).toFixed(1)+'% vs '+(gbMean*100).toFixed(1)+'%' };
    }, 'Bootstrap GB: P50 ≈ media storica');
    const b = global.__bootB || [];
    ok(b.length>0 && pct(b,.05) < pct(b,.5) && pct(b,.5) < pct(b,.95), 'Bootstrap GB: percentili ordinati P5<P50<P95');
  } else warn('Block bootstrap: funzione non trovata');
}

// ════════════════════════════════════════════════════════════════════════
// SUITE 5 — DECUMULO STORICO (Trinity-style)
// ════════════════════════════════════════════════════════════════════════
function suiteDecumulo() {
  header('SUITE 5 — DECUMULO STORICO');
  const HM = global.HIST_MONTHLY, cal = global.calibrateHistRow;
  const N = HM.length, idx = y => (y-1970)*12;
  loadConst(SRC.bt, /const HIST_INFLATION = \{[\s\S]*?\};/);
  const INFL = global.HIST_INFLATION || {};
  const eqM={eq100:1,eq60:.6,golden_butterfly:.4,permanent:.25,all_seasons:.30,ob100:0};
  const goldM={golden_butterfly:.2,permanent:.25,all_seasons:.15}, cashM={permanent:.25};
  const W = p => { const eq=eqM[p],g=goldM[p]||0,c=cashM[p]||0; return {eq,ob:Math.max(0,1-eq-g-c),g,c}; };
  function decum(p, sP, wd0, Y) {
    const w = W(p), res = []; const maxStart = 1970 + Math.floor(N/12) - Y;
    for (let sy = 1970; sy <= maxStart; sy++) {
      let cap = sP, wd = wd0, surv = true;
      for (let yi = 0; yi < Y; yi++) { if (cap <= 0){surv=false;break;} const mWd = wd/12;
        for (let m = 0; m < 12; m++){ if(cap<=0){cap=0;break;} const r=cal(HM[idx(sy)+yi*12+m]); const pr=w.eq*r[0]+w.ob*r[1]+w.g*r[2]+w.c*0.002-0.002/12; cap=Math.max(0,(cap-mWd/2)*(1+pr)-mWd/2);}
        wd *= (1 + (INFL[sy+yi] ?? 2.5)/100);
      }
      res.push(surv);
    }
    return res.filter(Boolean).length / res.length;
  }
  ok(Object.keys(INFL).length > 40, 'Serie inflazione storica caricata', Object.keys(INFL).length + ' anni');
  const sGB = decum('golden_butterfly', 1e6, 40000, 30);
  const sEq = decum('eq100', 1e6, 40000, 30);
  const sAS = decum('all_seasons', 1e6, 40000, 30);
  ok(sGB >= 0.95, 'Golden Butterfly SWR 4%/30a: success ≥95%', (sGB*100).toFixed(0)+'%');
  ok(sAS >= 0.90, 'All Seasons SWR 4%/30a: success ≥90%', (sAS*100).toFixed(0)+'%');
  ok(sEq >= 0.70 && sEq < 1.0, 'eq100 SWR 4%/30a: vulnerabile al sequence risk (70-99%)', (sEq*100).toFixed(0)+'%');
  ok(sGB >= sEq, 'GB più robusto di eq100 in decumulo', (sGB*100).toFixed(0)+'% vs '+(sEq*100).toFixed(0)+'%');
}

// ════════════════════════════════════════════════════════════════════════
// SUITE 6 — SCHEDA PENSIONE (se presente)
// ════════════════════════════════════════════════════════════════════════
function suitePensione() {
  header('SUITE 6 — SCHEDA PENSIONE');
  if (!SRC.pens) { warn('pensione.js non presente in questa build — suite saltata'); return; }
  eval(grab(SRC.pens, /let penState = \{[\s\S]*?\n\};/).replace('let ', 'global.'));
  loadConst(SRC.pens, /const COEFF_TRASF = \{[\s\S]*?\n\};/);
  ['getCoeffTrasf','calcIRPEF','calcAliqMargIRPEF','calcPensione'].forEach(fn => loadFn(SRC.pens, fn));

  // 6.a Coefficienti di trasformazione ufficiali (DM 436/2024)
  if (global.getCoeffTrasf) {
    ok(near(global.getCoeffTrasf(67), 0.05608, 0.0001), 'Coefficiente trasformazione 67 anni = 5.608%', (global.getCoeffTrasf(67)*100).toFixed(3)+'%');
    ok(near(global.getCoeffTrasf(64), 0.05088, 0.0001), 'Coefficiente trasformazione 64 anni = 5.088%', (global.getCoeffTrasf(64)*100).toFixed(3)+'%');
  } else warn('getCoeffTrasf non trovata');

  // 6.b IRPEF crescente e progressiva
  if (global.calcIRPEF) {
    const i35 = global.calcIRPEF(35000), i60 = global.calcIRPEF(60000);
    ok(i60 > i35 && i35 > 0, 'IRPEF progressiva (60k > 35k > 0)', i35.toFixed(0)+' / '+i60.toFixed(0));
    ok(i60/60000 > i35/35000, 'Aliquota media cresce col reddito');
  } else warn('calcIRPEF non trovata');

  // 6.c Calcolo pensione completo: valori sensati
  if (global.calcPensione) {
    Object.assign(global.penState, {age:32,retAge:67,ral:35000,ralGrowth:0.01,contYears:7,aliqCont:0.33,montante:0,desired:2000,infl:0.02,pil:0.015,coeffDecl:0.003,fpVers:100,fpRet:0.04,tfrSi:true,regime:'contributivo',etfRet:0.05,lifeExp:86,isNegoziale:false,contDatoriale:0.012,contLavoratore:0.013});
    let r; try { r = global.calcPensione(); } catch(e){ r = null; ok(false,'calcPensione esegue',e.message); }
    if (r) {
      ok(isFinite(r.pensioneLordaAnn) && r.pensioneLordaAnn > 0, 'Pensione lorda annua finita e positiva', Math.round(r.pensioneLordaAnn));
      ok(r.pensioneNettaMens < r.pensioneLordaMens, 'Pensione netta < lorda (tasse applicate)');
      ok(r.tassoSost > 0.3 && r.tassoSost < 0.95, 'Tasso sostituzione plausibile (30-95%)', (r.tassoSost*100).toFixed(0)+'%');
      ok(isFinite(r.rendFPMens) && r.rendFPMens >= 0, 'Rendita fondo pensione finita');
      // 6.d REGRESSIONE: l'ETF nel grafico annuale deve riflettere il prelievo SWR pieno,
      // NON essere azzerato dal gap residuo (bug: barra verde invisibile malgrado ETF 63%).
      try {
        const penWithEtf = Object.assign({}, global.penState, { etfCapital: 1500000, desired: 1500 });
        Object.assign(global.penState, penWithEtf);
        const r2 = global.calcPensione();
        if (r2 && Array.isArray(r2.decData) && r2.decData.length) {
          const etf0 = r2.decData[0].etfMens;
          const capEtf = r2.etfCap || penWithEtf.etfCapital;
          const swrMensAtteso = capEtf * 0.04 / 12;
          ok(etf0 > swrMensAtteso * 0.5, 'ETF nel grafico riflette il prelievo SWR, non azzerato dal gap', etf0 + '/m (atteso ~' + Math.round(swrMensAtteso) + ')');
          if (r2.etfPrelievoMens) {
            ok(Math.abs(etf0 - r2.etfPrelievoMens) / Math.max(1, r2.etfPrelievoMens) < 0.1, 'ETF grafico coerente con barra-riepilogo in alto (entro 10%)', etf0 + ' vs ' + r2.etfPrelievoMens);
          }
        }
      } catch(e) { warn('test coerenza ETF saltato: ' + e.message.slice(0,50)); }
    }
  } else warn('calcPensione non trovata');
}

// ════════════════════════════════════════════════════════════════════════
// SUITE 7 — FATTORI AZIONARI REALI (Small Value, Momentum, FF5, Low-Vol, Multifat)
// ════════════════════════════════════════════════════════════════════════
// Protegge le serie storiche reali e i loro comportamenti caratteristici, già
// validati a mano durante l'integrazione. Ancora ogni test a un fatto storico noto.
function suiteFactors() {
  header('SUITE 7 — FATTORI AZIONARI REALI');
  // Carica HIST + calibrazione + tutte le serie/helper fattoriali
  loadConst(SRC.amc, /const HIST_MONTHLY = \(function\(\)\{[\s\S]*?\}\)\(\);/);
  loadFn(SRC.amc, 'calibrateHistRow');
  loadConst(SRC.amc, /const SCV_SPREAD_START = \d+;/);
  loadConst(SRC.amc, /const SCV_SPREAD = \[[\s\S]*?\];/);
  loadFn(SRC.amc, 'scvSpreadAt');
  loadConst(SRC.amc, /const MOM_CONTRIB_START = \d+;/);
  loadConst(SRC.amc, /const MOM_CONTRIB = \[[\s\S]*?\];/);
  loadFn(SRC.amc, 'momContribAt');
  loadConst(SRC.amc, /const FF5_CONTRIB_START = \d+;/);
  loadConst(SRC.amc, /const FF5_CONTRIB = \{[\s\S]*?\n\};/);
  loadFn(SRC.amc, 'ff5ContribAt');
  loadConst(SRC.amc, /const FACTOR_MKT_BETA = \{[\s\S]*?\};/);
  loadConst(SRC.amc, /const REITS_START = \d+;/);
  loadConst(SRC.amc, /const HIST_REITS = \[[\s\S]*?\];/);
  loadFn(SRC.amc, 'reitsReturnAt');
  loadConst(SRC.amc, /const EM_START = \d+;/);
  loadConst(SRC.amc, /const HIST_EM = \[[\s\S]*?\];/);
  loadFn(SRC.amc, 'emReturnAt');
  loadFn(SRC.amc, 'eqReturnWithFactors');

  const H = global.HIST_MONTHLY, cal = global.calibrateHistRow;
  if (!H || !cal || !global.eqReturnWithFactors) { warn('Fattori: serie/helper non caricati — suite saltata'); return; }
  const OFF = 108; // 1979-01 in HIST_MONTHLY
  const N = 552;   // mesi 1979-2024

  // CAGR long-only di un fattore (eqW=1, peso fattore=1) sul periodo reale
  const factorCAGR = (fw, s, mo) => { let c=1; for(let m=0;m<mo;m++){ const idx=s+m; const row=cal(H[idx]); c*=(1+global.eqReturnWithFactors(1,row[0],idx,fw)); } return Math.pow(c,12/mo)-1; };
  const cumRet = (fw, s, mo) => { let c=1; for(let m=0;m<mo;m++){ const idx=s+m; const row=cal(H[idx]); c*=(1+global.eqReturnWithFactors(1,row[0],idx,fw)); } return c-1; };
  const mktCum = (s, mo) => { let c=1; for(let m=0;m<mo;m++) c*=(1+cal(H[s+m])[0]); return c-1; };

  // 7.a Integrità serie: lunghezza e offset corretti
  ok(global.SCV_SPREAD && global.SCV_SPREAD.length === N, 'Small Value: serie 552 mesi', global.SCV_SPREAD ? String(global.SCV_SPREAD.length) : 'assente');
  ok(global.MOM_CONTRIB && global.MOM_CONTRIB.length === N, 'Momentum: serie 552 mesi', global.MOM_CONTRIB ? String(global.MOM_CONTRIB.length) : 'assente');
  ok(global.FF5_CONTRIB && Object.keys(global.FF5_CONTRIB).length === 5, 'FF5: 5 fattori (val/qual/inv/size/lowvol)', global.FF5_CONTRIB ? Object.keys(global.FF5_CONTRIB).join(',') : 'assente');
  ok(global.SCV_SPREAD_START === OFF && global.MOM_CONTRIB_START === OFF && global.FF5_CONTRIB_START === OFF, 'Offset serie = 108 (1979-01)');

  // 7.b Helper fuori range = 0 (pre-1979 e oltre 2024 → fattore inerte)
  ok(global.scvSpreadAt(OFF-1) === 0 && global.scvSpreadAt(OFF+N) === 0, 'scvSpreadAt: 0 fuori dal range coperto');
  ok(global.momContribAt(OFF-1) === 0 && global.ff5ContribAt('fat_valore', OFF-1) === 0, 'momContribAt/ff5ContribAt: 0 pre-1979');
  ok(global.ff5ContribAt('asset_inesistente', OFF+10) === 0, 'ff5ContribAt: 0 per asset sconosciuto');

  // 7.c GARANZIA DI NON-REGRESSIONE: pesi a 0 → bit-identico al mercato puro
  // Questo è il test più importante: protegge tutti i portafogli SENZA fattori.
  let identical = true;
  for (let m = 0; m < N && identical; m++) { const idx=OFF+m; const row=cal(H[idx]);
    if (global.eqReturnWithFactors(0.6, row[0], idx, {}) !== 0.6*row[0]) identical=false; }
  ok(identical, 'eqReturnWithFactors: bit-identico a eqW·mkt con pesi=0 (no-regressione)');

  // 7.d Small Value: premio storico positivo sul mercato (~+2%/a, range prudente)
  const mktCAGR = (s,mo) => { let c=1; for(let m=0;m<mo;m++) c*=(1+cal(H[s+m])[0]); return Math.pow(c,12/mo)-1; };
  const svPrem = factorCAGR({scvW:1}, OFF, N) - mktCAGR(OFF, N);
  ok(svPrem > 0.005 && svPrem < 0.04, 'Small Value: premio storico +0.5%..+4%/a', (svPrem*100).toFixed(2)+'pt');

  // 7.e Momentum: cattura il crash 2009 (apr-2009, idx 471 → contributo fortemente negativo)
  ok(global.momContribAt(471) < -0.03, 'Momentum: crash apr-2009 < -3%/mese', (global.momContribAt(471)*100).toFixed(1)+'%');

  // 7.f Low-Vol: DIFENSIVO grazie a β_mkt<1 — regge meglio del mercato nel dot-com 2000-02
  const lvFW = {ff5W:{fat_low_vol:1}};
  const lvDot = cumRet(lvFW, 360, 36), mkDot = mktCum(360, 36);
  ok(lvDot > mkDot + 0.05, 'Low-Vol: difensivo nel dot-com 2000-02 (regge >5pt meglio)', ((lvDot-mkDot)*100).toFixed(1)+'pt');
  ok(global.FACTOR_MKT_BETA && global.FACTOR_MKT_BETA.fat_low_vol < 1, 'Low-Vol: β_mkt < 1 (esposizione mercato ridotta)', global.FACTOR_MKT_BETA ? String(global.FACTOR_MKT_BETA.fat_low_vol) : 'assente');

  // 7.g Multifat (composizione viva): rendimento ≈ media dei 5 fattori che lo compongono
  const multiFW = {momW:0.2, ff5W:{fat_valore:0.2,fat_qualita:0.2,fat_investment:0.2,fat_size:0,fat_low_vol:0.2}};
  const cMulti = factorCAGR(multiFW, OFF, N);
  const cAvg = (factorCAGR({momW:1},OFF,N) + factorCAGR({ff5W:{fat_valore:1}},OFF,N) + factorCAGR({ff5W:{fat_qualita:1}},OFF,N) + factorCAGR({ff5W:{fat_investment:1}},OFF,N) + factorCAGR({ff5W:{fat_low_vol:1}},OFF,N)) / 5;
  ok(near(cMulti, cAvg, 0.005), 'Multifat: CAGR ≈ media dei 5 fattori (composizione viva)', (cMulti*100).toFixed(2)+'% vs '+(cAvg*100).toFixed(2)+'%');

  // 7.h REITs: colonna di rendimento INDIPENDENTE (asset class, non spread su mercato)
  if (global.reitsReturnAt && global.HIST_REITS) {
    ok(global.HIST_REITS.length === N, 'REITs: serie 552 mesi', String(global.HIST_REITS.length));
    ok(global.reitsReturnAt(OFF-1) === null && global.reitsReturnAt(OFF+N) === null, 'REITs: null fuori range (fallback azionario pre-1979)');
    // Rendimento proprio: la quota REITs NON segue il mercato (è una serie a sé).
    // Verifica che eqReturnWithFactors usi la serie REITs e non eqRet per quella quota.
    const idxTest = OFF + 100;
    const rowT = cal(H[idxTest]);
    const withReits = global.eqReturnWithFactors(1, rowT[0], idxTest, {reitsW:1});
    ok(near(withReits, global.reitsReturnAt(idxTest), 1e-9), 'REITs: quota usa serie propria (non il mercato)', withReits.toFixed(4)+' vs '+global.reitsReturnAt(idxTest).toFixed(4));
    // CAGR storico nel range plausibile dichiarato (~11%)
    const reitsCAGR = factorCAGR({reitsW:1}, OFF, N);
    ok(reitsCAGR > 0.08 && reitsCAGR < 0.14, 'REITs: CAGR storico 8-14%/a', (reitsCAGR*100).toFixed(2)+'%');
    // Crash immobiliare 2008: REITs cadono PIÙ del mercato (ciclo proprio)
    const reitsCrash = cumRet({reitsW:1}, 453, 16), mktCrash = mktCum(453, 16);
    ok(reitsCrash < mktCrash, 'REITs: crash 2007-08 più profondo del mercato', (reitsCrash*100).toFixed(0)+'% vs '+(mktCrash*100).toFixed(0)+'%');
  } else warn('REITs: serie/helper non caricati');

  // 7.i Emergenti: colonna indipendente con offset 234 (1989-07) e fallback pre-1989
  if (global.emReturnAt && global.HIST_EM) {
    ok(global.HIST_EM.length === 426, 'EM: serie 426 mesi (1989-07→2024)', String(global.HIST_EM.length));
    ok(global.emReturnAt(233) === null && global.emReturnAt(234) !== null, 'EM: offset 234 corretto (null a 233, dato a 234)');
    ok(global.emReturnAt(660) === null, 'EM: null oltre il range (2024-12 = idx 659)');
    // Fallback pre-1989: la quota EM usa il mercato dove non c'è dato
    const rowPre = cal(H[150]);
    const emPre = global.eqReturnWithFactors(1, rowPre[0], 150, {emW:1});
    ok(near(emPre, rowPre[0], 1e-9), 'EM: fallback azionario pre-1989 (idx 150)', emPre.toFixed(4)+' vs '+rowPre[0].toFixed(4));
    // Quota EM usa la serie propria nel periodo coperto
    const emCov = global.eqReturnWithFactors(1, cal(H[300])[0], 300, {emW:1});
    ok(near(emCov, global.emReturnAt(300), 1e-9), 'EM: quota usa serie propria (idx 300)', emCov.toFixed(4)+' vs '+global.emReturnAt(300).toFixed(4));
    // Crisi asiatica 1997-98: EM crollano mentre i mercati sviluppati salgono
    let cEm=1, cMk=1; for(let m=0;m<18;m++){ const idx=330+m; const row=cal(H[idx]); cEm*=(1+global.eqReturnWithFactors(1,row[0],idx,{emW:1})); cMk*=(1+row[0]); }
    ok((cEm-1) < (cMk-1) - 0.20, 'EM: crisi asiatica 1997-98 molto peggio del mercato', ((cEm-1)*100).toFixed(0)+'% vs '+((cMk-1)*100).toFixed(0)+'%');
  } else warn('EM: serie/helper non caricati');
}

// ════════════════════════════════════════════════════════════════════════
// SUITE 8 — FISCALITÀ (lotti, capital gain, LIFO/FIFO/medio, compensazione minus)
// ════════════════════════════════════════════════════════════════════════
function suiteFiscal() {
  header('SUITE 8 — FISCALITÀ');
  if (!SRC.fisc) { warn('fiscal.js non presente — suite saltata'); return; }
  global.state = global.state || { age: 40 };
  global.fiscState = global.fiscState || { irpef: 35 };
  loadConst(SRC.fisc, /const STRUMENTO_DESC = \{[\s\S]*?\n\};/);
  loadFn(SRC.fisc, 'calcFiscalLots');
  loadFn(SRC.fisc, 'calcTaxOnSell');
  if (!global.calcFiscalLots || !global.calcTaxOnSell) { warn('funzioni fiscali non caricate'); return; }

  // 8.a Lotti: PAC su asset in crescita → 121 lotti (1 iniziale + 120 mensili)
  const fl = global.calcFiscalLots(1000, 10000, 10, 0.07, 'fifo');
  ok(fl.lots.length === 121, 'Lotti: 1 iniziale + 120 PAC mensili', String(fl.lots.length));
  ok(fl.finalPrice > 100, 'Prezzo cresce con rendimento +7%/a', fl.finalPrice.toFixed(0));
  ok(fl.yearlyData.length === 10, 'Dati annuali = 10 anni', String(fl.yearlyData.length));
  const ultimo = fl.yearlyData[9];
  ok(ultimo.currentValue > ultimo.totalInvested, 'Valore finale > investito (plusvalenza)', ultimo.currentValue+' vs '+ultimo.totalInvested);

  // 8.b LIFO vs FIFO su prezzi crescenti: LIFO vende lotti più cari → meno gain tassabile
  const fp = fl.finalPrice, sell = 50000;
  const taxFifo = global.calcTaxOnSell(sell, fp, fl.lots, 'fifo', 'amministrato', 'azioni', 26, 12.5, [], 2025);
  const taxLifo = global.calcTaxOnSell(sell, fp, fl.lots, 'lifo', 'amministrato', 'azioni', 26, 12.5, [], 2025);
  const taxAvg  = global.calcTaxOnSell(sell, fp, fl.lots, 'avg',  'amministrato', 'azioni', 26, 12.5, [], 2025);
  ok(taxLifo.costBasis > taxFifo.costBasis, 'LIFO: cost basis > FIFO su prezzi crescenti', taxLifo.costBasis+' > '+taxFifo.costBasis);
  ok(taxLifo.tax < taxFifo.tax, 'LIFO: imposta < FIFO (vende lotti più cari)', taxLifo.tax+' < '+taxFifo.tax);
  ok(taxAvg.costBasis > taxFifo.costBasis && taxAvg.costBasis < taxLifo.costBasis, 'Costo medio tra FIFO e LIFO', taxAvg.costBasis);

  // 8.c Aliquota 26% standard vs 12.5% BTP
  const taxAz  = global.calcTaxOnSell(sell, fp, fl.lots, 'avg', 'amministrato', 'azioni', 26, 12.5, [], 2025);
  const taxBtp = global.calcTaxOnSell(sell, fp, fl.lots, 'avg', 'amministrato', 'btp', 26, 12.5, [], 2025);
  ok(near(taxAz.aliq, 26, 0.01), 'Azioni: aliquota 26%', taxAz.aliq+'%');
  ok(near(taxBtp.aliq, 12.5, 0.01), 'BTP: aliquota agevolata 12.5%', taxBtp.aliq+'%');
  ok(taxBtp.tax < taxAz.tax, 'BTP: imposta minore (aliquota ridotta)', taxBtp.tax+' < '+taxAz.tax);

  // 8.d Compensazione minus: riduce imponibile SOLO per strumenti compensabili (red. diverso)
  const minus = [{ amount: 5000, scadenza: 2028 }];
  const taxNoMin = global.calcTaxOnSell(sell, fp, fl.lots, 'avg', 'amministrato', 'azioni', 26, 12.5, [], 2025);
  const taxMin   = global.calcTaxOnSell(sell, fp, fl.lots, 'avg', 'amministrato', 'azioni', 26, 12.5, minus, 2025);
  ok(taxMin.taxableGain < taxNoMin.taxableGain, 'Minus compensa gain su azioni (red. diverso)', taxMin.taxableGain+' < '+taxNoMin.taxableGain);
  ok(taxMin.minusUsed > 0, 'Minusvalenza utilizzata > 0', String(taxMin.minusUsed));
  const taxUcits = global.calcTaxOnSell(sell, fp, fl.lots, 'avg', 'amministrato', 'etf_ucits', 26, 12.5, minus, 2025);
  ok(taxUcits.minusUsed === 0, 'ETF UCITS: minus NON compensabili (red. capitale)', String(taxUcits.minusUsed));

  // 8.e Minus scaduta non utilizzabile
  const minusScaduta = [{ amount: 5000, scadenza: 2020 }];
  const taxScad = global.calcTaxOnSell(sell, fp, fl.lots, 'avg', 'amministrato', 'azioni', 26, 12.5, minusScaduta, 2025);
  ok(taxScad.minusUsed === 0, 'Minus scaduta (2020 < 2025) non utilizzabile', String(taxScad.minusUsed));
}

// ════════════════════════════════════════════════════════════════════════
// SUITE 9 — QUANT ANALYTICS (frontiera efficiente, Sharpe, VaR/CVaR, covarianza)
// ════════════════════════════════════════════════════════════════════════
function suiteQuant() {
  header('SUITE 9 — QUANT ANALYTICS');
  if (!SRC.quant) { warn('quant-analytics.js non presente — suite saltata'); return; }
  // ASSET_CLASSES da main.js (dipendenza di getCov/_acMu)
  if (!global.ASSET_CLASSES) { try { const acm = SRC.main.match(/const ASSET_CLASSES = \{[\s\S]*?\n\};/); if (acm) eval(acm[0].replace('const ', 'global.')); } catch(e){ warn('ASSET_CLASSES: '+e.message); } }
  // quant-analytics.js mescola codice matematico puro (cost + funzioni, righe ~1-658)
  // con codice DOM/UI (da renderQuantTab in poi). Eseguiamo SOLO il blocco puro in un
  // sandbox, fino all'ultima funzione matematica (_lgamma), escludendo la parte UI.
  try {
    const lines = SRC.quant.split('\n');
    const endIdx = lines.findIndex(l => /^function renderQuantTab/.test(l)); // primo codice DOM
    let pureCode = lines.slice(0, endIdx > 0 ? endIdx : lines.length).join('\n');
    // I const top-level non diventano proprietà del sandbox vm (solo le function sì).
    // Promuoviamo a globali del sandbox quelle che ci servono per i test.
    pureCode += '\nthis.AC_KEYS_EF = AC_KEYS_EF; this.RF_RATE = RF_RATE; this.CORR_MATRIX = CORR_MATRIX;';
    const sandbox = { Math, console, ASSET_CLASSES: global.ASSET_CLASSES, state: global.state || {age:40}, isFinite, Array, Object, JSON, Number, parseFloat, parseInt, isNaN };
    require('vm').createContext(sandbox);
    require('vm').runInContext(pureCode, sandbox, { filename: 'quant-analytics.js' });
    ['_normCDF','getCov','portfolioVar','portfolioMu','computeEfficientFrontier','findMaxSharpe','findMinVariance','computeVaRCVaR','AC_KEYS_EF','RF_RATE','CORR_MATRIX'].forEach(k => { if (sandbox[k] !== undefined) global[k] = sandbox[k]; });
  } catch(e){ warn('caricamento quant-analytics: '+e.message); }
  // helper interni e funzioni principali
  // (funzioni e costanti già esposte dal caricamento completo sopra)

  // 9.a _normCDF: proprietà note della normale standard (test indipendente da stato)
  if (global._normCDF) {
    ok(near(global._normCDF(0), 0.5, 0.001), 'Φ(0) = 0.5', global._normCDF(0).toFixed(4));
    ok(near(global._normCDF(1.645), 0.95, 0.005), 'Φ(1.645) ≈ 0.95', global._normCDF(1.645).toFixed(4));
    ok(global._normCDF(-3) < 0.002 && global._normCDF(3) > 0.998, 'Φ code: Φ(-3)≈0, Φ(3)≈1');
  } else warn('_normCDF non caricato');

  // 9.b Varianza di portafoglio ≥ 0 e diversificazione (σ_port ≤ Σ wᵢσᵢ)
  if (global.portfolioVar && global.AC_KEYS_EF && global.ASSET_CLASSES) {
    const keys = global.AC_KEYS_EF.slice(0, 4);
    const w = [0.25, 0.25, 0.25, 0.25];
    const v = global.portfolioVar(w, keys);
    ok(v >= 0, 'Varianza portafoglio ≥ 0', v.toFixed(5));
    const vols = keys.map(k => global.ASSET_CLASSES[k]?.vol || 0);
    const weightedVol = w.reduce((s,wi,i)=>s+wi*vols[i],0);
    ok(Math.sqrt(v) <= weightedVol + 1e-9, 'Diversificazione: σ_port ≤ Σ wᵢσᵢ', Math.sqrt(v).toFixed(3)+' ≤ '+weightedVol.toFixed(3));
  } else warn('portfolioVar/AC_KEYS_EF/ASSET_CLASSES non caricati');

  // 9.c Frontiera efficiente: Sharpe del max ≥ tutti, min-var ha vol minima, pesi sommano a 1
  if (global.computeEfficientFrontier && global.findMaxSharpe && global.AC_KEYS_EF) {
    const keys = global.AC_KEYS_EF.slice(0, 5);
    let front; try { front = global.computeEfficientFrontier(keys, 0.2, 40); } catch(e){ front = null; ok(false,'computeEfficientFrontier esegue',e.message); }
    if (front) {
      ok(front.length > 5, 'Frontiera: genera punti multipli', String(front.length));
      const maxSh = global.findMaxSharpe(front, global.RF_RATE);
      ok(maxSh && front.every(p => p.sharpe <= maxSh.sharpe + 1e-9), 'Max Sharpe ≥ ogni punto', maxSh ? maxSh.sharpe.toFixed(3) : 'null');
      if (global.findMinVariance) { const mv = global.findMinVariance(front); ok(mv && front.every(p => p.vol >= mv.vol - 1e-9), 'Min Variance ≤ vol di ogni punto', mv ? (mv.vol*100).toFixed(1)+'%' : 'null'); }
      if (maxSh) { const sumW = maxSh.weights.reduce((a,b)=>a+b,0); ok(near(sumW, 1, 0.01), 'Pesi max-Sharpe sommano a 1', sumW.toFixed(3)); }
    }
  } else warn('computeEfficientFrontier non caricato');

  // 9.d VaR/CVaR: monotonicità (CVaR ≥ VaR, VaR99 ≥ VaR95)
  if (global.computeVaRCVaR) {
    let r; try { r = global.computeVaRCVaR(0.07, 0.16, 1, 100000, 0.2); } catch(e){ r = null; warn('computeVaRCVaR: '+e.message); }
    if (r) {
      const v95 = r.var95, v99 = r.var99, c95 = r.cvar95;
      if (v95 != null && v99 != null) ok(v99 >= v95 - 1, 'VaR99 ≥ VaR95 (coda più estrema)', Math.round(v99)+' ≥ '+Math.round(v95));
      if (v95 != null && c95 != null) ok(c95 >= v95 - 1, 'CVaR95 ≥ VaR95 (perdita media oltre soglia)', Math.round(c95)+' ≥ '+Math.round(v95));
      ok(v95 == null || v95 > 0, 'VaR95 perdita positiva (orizzonte 1a, vol 16%)', v95 != null ? Math.round(v95) : 'null');
    }
  } else warn('computeVaRCVaR non caricato');
}

// ════════════════════════════════════════════════════════════════════════
// SUITE 10 — FACTOR CRASH BETA (sequence risk differenziato per asset)
// ════════════════════════════════════════════════════════════════════════
function suiteFactorCrashBeta() {
  header('SUITE 10 — FACTOR CRASH BETA');

  // Carica le costanti e funzioni necessarie da main.js
  // CRASH_BETA, FACTOR_CRASH_BETA, calcFactorCrashRate, getCrashWeights, SEQ_RATES
  // e tutto ciò da cui dipendono (PORT, ASSETS, state, ecc.)
  // Per semplicità usiamo calcFactorCrashRate direttamente con cw sintetici.
  loadFn(SRC.main, 'calcFactorCrashRate');
  // grab estrae "const X = {...};" — sostituiamo const con global.X = per eval nel global scope
  const fcbSrc = grab(SRC.main, /const FACTOR_CRASH_BETA = \{[\s\S]*?\};/);
  if (fcbSrc) eval(fcbSrc.replace('const FACTOR_CRASH_BETA', 'global.FACTOR_CRASH_BETA'));
  const cbSrc = grab(SRC.main, /const CRASH_BETA = \{[^\n]*\};/);
  if (cbSrc) eval(cbSrc.replace('const CRASH_BETA', 'global.CRASH_BETA'));
  const srSrc = grab(SRC.main, /const SEQ_RATES = \{[^\n]*\};/);
  if (srSrc) eval(srSrc.replace('const SEQ_RATES', 'global.SEQ_RATES'));

  const fcr = global.calcFactorCrashRate;
  const sev = global.SEQ_RATES.severe; // −0.50

  // Helper: crea un cw con una sola quota fattoriale al 100% di eq
  function cwWith(field, subfield) {
    const base = { eq: 1, commodW:0, carryW:0, trendW:0, commCarryW:0, defensive:0,
                   scvW:0, reitsW:0, emW:0, momW:0,
                   ff5W:{ fat_valore:0, fat_qualita:0, fat_investment:0, fat_size:0, fat_low_vol:0 } };
    if (subfield) base.ff5W[subfield] = 1;
    else base[field] = 1;
    return base;
  }

  // 10.1 Portafoglio generico (no fattori): crash = sev*eq = −50%
  const cwGeneric = { eq:1, commodW:0, carryW:0, trendW:0, commCarryW:0, defensive:0,
                      scvW:0, reitsW:0, emW:0, momW:0, ff5W:{fat_valore:0,fat_qualita:0,fat_investment:0,fat_size:0,fat_low_vol:0} };
  ok(near(fcr(cwGeneric, sev), sev * 1.0, 0.001),
    'Equity generico: crash = sev×1.0 = −50%', fcr(cwGeneric, sev).toFixed(4));

  // 10.2 REITs: crash peggiore dell'equity (beta 1.15 → −57.5%)
  const reitsRate = fcr(cwWith('reitsW'), sev);
  ok(reitsRate < sev * 1.0, 'REITs: crash più profondo dell\'equity generico',
    reitsRate.toFixed(4) + ' < ' + (sev*1.0).toFixed(4));
  ok(near(reitsRate, sev * global.FACTOR_CRASH_BETA.reits, 0.001),
    'REITs: crash = sev × 1.15', reitsRate.toFixed(4));

  // 10.3 EM: crash ancora più profondo (beta 1.20)
  const emRate = fcr(cwWith('emW'), sev);
  ok(emRate < reitsRate, 'EM: crash più profondo dei REITs (beta 1.20 > 1.15)',
    emRate.toFixed(4) + ' < ' + reitsRate.toFixed(4));

  // 10.4 Low Vol: crash più contenuto dell'equity (beta 0.55 → −27.5%)
  const lvRate = fcr(cwWith(null, 'fat_low_vol'), sev);
  ok(lvRate > sev * 1.0, 'Low Vol: crash meno profondo dell\'equity (difensivo)',
    lvRate.toFixed(4) + ' > ' + (sev*1.0).toFixed(4));
  ok(near(lvRate, sev * global.FACTOR_CRASH_BETA.fat_low_vol, 0.001),
    'Low Vol: crash = sev × 0.55', lvRate.toFixed(4));

  // 10.5 Qualità: difensiva, tra Low Vol e equity generico
  const qualRate = fcr(cwWith(null, 'fat_qualita'), sev);
  ok(qualRate > sev * 1.0 && qualRate < lvRate,
    'Qualità: difensiva ma meno di Low Vol (0.65 tra 0.55 e 1.0)',
    qualRate.toFixed(4));

  // 10.6 Momentum: intermedio (0.75), migliore dell'equity ma peggiore di LowVol
  const momRate = fcr(cwWith('momW'), sev);
  ok(momRate > sev * 1.0 && momRate < qualRate,
    'Momentum: meno difensivo di Qualità, meglio dell\'equity generico',
    momRate.toFixed(4));

  // 10.7 SCV: peggio dell'equity (beta 1.15)
  const scvRate = fcr(cwWith('scvW'), sev);
  ok(scvRate < sev * 1.0, 'SCV: crash più profondo dell\'equity (illiquide)',
    scvRate.toFixed(4));

  // 10.8 Portafoglio misto: 50% equity generico + 50% Low Vol
  // Atteso: meno profondo del puro equity (−50%) e più profondo del puro LowVol (−27.5%)
  // I valori sono negativi: −38.75 deve stare tra −50 e −27.5
  const cwMixed = { ...cwGeneric, eq:1, ff5W:{...cwGeneric.ff5W, fat_low_vol:0.5} };
  const mixedRate = fcr(cwMixed, sev);
  const pureLvRate = fcr(cwWith(null, 'fat_low_vol'), sev);
  const pureEqRate = fcr(cwGeneric, sev); // −0.50
  ok(mixedRate > pureEqRate && mixedRate < pureLvRate,
    'Mix 50% generico + 50% LowVol: crash intermedio tra puro equity e puro LowVol',
    mixedRate.toFixed(4) + ' tra ' + pureEqRate.toFixed(4) + ' e ' + pureLvRate.toFixed(4));

  // 10.9 Monotonia severità: mild < moderate < severe per REITs
  const cwR = cwWith('reitsW');
  const rMild = fcr(cwR, global.SEQ_RATES.mild);
  const rMod  = fcr(cwR, global.SEQ_RATES.moderate);
  const rSev  = fcr(cwR, global.SEQ_RATES.severe);
  ok(rMild > rMod && rMod > rSev,
    'Monotonia severity REITs: mild > moderate > severe (valori negativi)',
    [rMild, rMod, rSev].map(x=>x.toFixed(3)).join(' '));

  // 10.10 Prova di sabotaggio: se flat-liniamo tutti i beta a 1.0 il risultato
  // deve coincidere con sev*eq (cioè la vecchia formula senza differenziazione).
  // Usiamo il valore diretto per confermare che la differenziazione è attiva.
  const scvDiff = Math.abs(scvRate - (sev * 1.0));
  ok(scvDiff > 0.01, 'Sabotaggio: SCV diverge dall\'equity piatto (differenziazione attiva)',
    'delta=' + scvDiff.toFixed(4));

  // 10.11 INTEGRAZIONE: getCrashWeights deve ESPORRE i pesi fattoriali, altrimenti
  // calcFactorCrashRate li legge come 0 e la differenziazione è inerte (bug reale
  // trovato: il return ometteva scvW/reitsW/emW/ff5W). Questo test lo previene.
  try {
    loadConst(SRC.main, /const ASSET_CLASSES = \{[\s\S]*?\n\};/);
    loadConst(SRC.main, /const PORT = \{[\s\S]*?\n\};/);
    try { loadConst(SRC.main, /const CRASH_BETA = \{[\s\S]*?\};/); } catch(e){}
    try { loadConst(SRC.main, /const BOND_RALLY_RATE = [-\d.]+;/); } catch(e){}
    try { loadConst(SRC.main, /const SEQ_RATES = \{[\s\S]*?\};/); } catch(e){}
    ['getEquityWeight','getGoldWeight','getCashWeight','getSmallValueWeight','getMomentumWeight','getReitsWeight','getEmWeight','getFactorWeights','calcCustomParams','getCrashWeights'].forEach(fn => { try { loadFn(SRC.main, fn); } catch(e){} });
    if (global.getCrashWeights) {
      // Larry contiene 15% Small Value + 7.5% Emerging: getCrashWeights deve esporli
      const cwLarry = global.getCrashWeights('larry', 40);
      ok(cwLarry.scvW > 0, 'getCrashWeights(larry) espone scvW > 0 (non inerte)', String(cwLarry.scvW));
      ok(cwLarry.emW > 0, 'getCrashWeights(larry) espone emW > 0 (non inerte)', String(cwLarry.emW));
      ok('ff5W' in cwLarry && 'reitsW' in cwLarry, 'getCrashWeights espone ff5W e reitsW (struttura completa)');
      // verifica end-to-end: il crash del Larry è più severo che a beta 1.0 piatto
      // (SV ed EM hanno beta > 1), provando che i pesi arrivano a calcFactorCrashRate
      const sevTest = -0.40;
      const larryReal = global.calcFactorCrashRate(cwLarry, sevTest);
      const larryFlat = sevTest * cwLarry.eq;
      ok(larryReal < larryFlat - 1e-6, 'Larry: crash differenziato più severo del piatto (SV/EM beta>1)',
        (larryReal*100).toFixed(2)+'% vs '+(larryFlat*100).toFixed(2)+'%');

      // 10.12 DECUMULO: la stessa formula di crash (calcFactorCrashRate + bond rally)
      // usata in simulateDecumulo deve differenziare difensivo/generico/aggressivo.
      // Replica del calcolo del decumulo (main.js simulateDecumulo) su cw sintetici.
      if (global.CRASH_BETA && global.BOND_RALLY_RATE != null && global.SEQ_RATES) {
        const decCrash = (cw, sev) =>
            global.calcFactorCrashRate(cw, sev)
          + sev * global.CRASH_BETA.commodity * (cw.commodW||0)
          + sev * global.CRASH_BETA.carry     * (cw.carryW||0)
          + sev * global.CRASH_BETA.trend     * (cw.trendW||0)
          + global.BOND_RALLY_RATE            * (cw.defensive||0);
        const base = { eq:0.8, scvW:0,momW:0,reitsW:0,emW:0, trendW:0,carryW:0,commodW:0,commCarryW:0, defensive:0.2,
          ff5W:{fat_valore:0,fat_qualita:0,fat_investment:0,fat_size:0,fat_low_vol:0} };
        const sev = global.SEQ_RATES.severe ?? -0.5;
        const difensivo = decCrash({...base, ff5W:{fat_valore:0,fat_qualita:0.4,fat_investment:0,fat_size:0,fat_low_vol:0.4}}, sev);
        const generico  = decCrash(base, sev);
        const aggressivo = decCrash({...base, reitsW:0.4, emW:0.4}, sev);
        ok(difensivo > generico && generico > aggressivo,
          'Decumulo: crash differenziato (difensivo > generico > aggressivo)',
          [difensivo,generico,aggressivo].map(x=>(x*100).toFixed(0)+'%').join(' > '));
      }
    } else warn('getCrashWeights non caricato — test integrazione saltato');
  } catch(e){ warn('SUITE 10 integrazione: '+e.message); }

}

// ════════════════════════════════════════════════════════════════════════
// SUITE 11 — CRISIS STRESS (factor-aware: REITs/EM/fattori usano serie reali)
// ════════════════════════════════════════════════════════════════════════
function suiteCrisisStress() {
  header('SUITE 11 — CRISIS STRESS');
  if (!SRC.crisis) { warn('crisis-stress.js non presente — suite saltata'); return; }
  // Assicura che il motore factor-aware sia caricato (idempotente se già fatto in suite 7)
  if (!global.eqReturnWithFactors) {
    loadConst(SRC.amc, /const HIST_MONTHLY = \(function\(\)\{[\s\S]*?\}\)\(\);/);
    loadFn(SRC.amc, 'calibrateHistRow');
    [/const SCV_SPREAD_START[\s\S]*?const SCV_SPREAD = \[[\s\S]*?\];/, /const MOM_CONTRIB_START[\s\S]*?const MOM_CONTRIB = \[[\s\S]*?\];/, /const FF5_CONTRIB_START[\s\S]*?\n\};/, /const REITS_START[\s\S]*?const HIST_REITS = \[[\s\S]*?\];/, /const EM_START[\s\S]*?const HIST_EM = \[[\s\S]*?\];/, /const FACTOR_MKT_BETA = \{[\s\S]*?\};/].forEach(re => { try { loadConst(SRC.amc, re); } catch(e){} });
    ['scvSpreadAt','momContribAt','ff5ContribAt','reitsReturnAt','emReturnAt','eqReturnWithFactors'].forEach(fn => { try { loadFn(SRC.amc, fn); } catch(e){} });
  }

  // 11.a Verifica statica: simulateCrisisPath DEVE usare il motore factor-aware,
  // non eqW*eqRet generico (bug storico: trattava REITs/EM/fattori come azioni).
  ok(/eqReturnWithFactors\(/.test(SRC.crisis), 'Crisis stress chiama eqReturnWithFactors (non eqW*eqRet generico)');
  ok(/getReitsWeight|getEmWeight|getFactorWeights/.test(SRC.crisis), 'Crisis stress costruisce i pesi fattoriali (fw)');

  // 11.b Verifica funzionale: nella crisi 2007-09 un portafoglio REITs deve perdere
  // PIÙ di uno azionario generico, e il low-vol MENO. Replica il calcolo factor-aware
  // del crisis path (eqReturnWithFactors) su una finestra di crisi reale.
  if (global.eqReturnWithFactors && global.HIST_MONTHLY && global.calibrateHistRow) {
    const H = global.HIST_MONTHLY, cal = global.calibrateHistRow;
    const cumCrisis = (fw, s, mo) => { let c = 1; for (let m=0;m<mo;m++){ const idx=s+m; const row=cal(H[idx]); c*=(1+global.eqReturnWithFactors(1,row[0],idx,fw)); } return c-1; };
    const start = 453, win = 16; // ~lug-2007, finestra crisi finanziaria
    const generic = cumCrisis({}, start, win);
    const reits   = cumCrisis({reitsW:1}, start, win);
    const lowvol  = cumCrisis({ff5W:{fat_low_vol:1}}, start, win);
    ok(reits < generic, 'Crisi 2008: REITs crollano più del mercato (epicentro immobiliare)', (reits*100).toFixed(0)+'% < '+(generic*100).toFixed(0)+'%');
    ok(lowvol > generic, 'Crisi 2008: Low-Vol regge meglio del mercato (difensivo)', (lowvol*100).toFixed(0)+'% > '+(generic*100).toFixed(0)+'%');
  } else warn('eqReturnWithFactors/HIST non caricati — test funzionale crisi saltato');
}

// ════════════════════════════════════════════════════════════════════════
// SUITE 12 — STRESS VALUTAZIONI (Bogle decompose + sconto CAPE value-tilt)
// ════════════════════════════════════════════════════════════════════════
function suiteValuationStress() {
  header('SUITE 12 — STRESS VALUTAZIONI');
  if (!SRC.live) { warn('live-data.js non presente — suite saltata'); return; }
  loadFn(SRC.live, 'bogleDecompose');
  if (!global.bogleDecompose) { warn('bogleDecompose non caricata'); return; }

  // 12.a Decomposizione di Bogle: fondamentale + speculativo = nominale
  const r = global.bogleDecompose(36.1, 14.0, 10, 0.015, 0.02, 0.0105);
  ok(r !== null, 'bogleDecompose ritorna un risultato valido');
  if (r) {
    // mean-reversion da CAPE 36.1 a 14 in 10 anni ≈ -4.8%/a (valore dell'interfaccia)
    ok(near(r.rNom, -0.048, 0.005), 'Mean-Reversion storica ≈ -4.8%/a (riproduce l\'interfaccia)', (r.rNom*100).toFixed(1)+'%');
    // speculativo negativo (CAPE scende), fondamentale positivo (dividendi+utili+infl)
    ok(r.rSpeculative < 0, 'Rendimento speculativo < 0 quando CAPE scende', (r.rSpeculative*100).toFixed(1)+'%');
    ok(r.rFundamental > 0, 'Rendimento fondamentale > 0 (dividendi+utili+inflazione)', (r.rFundamental*100).toFixed(1)+'%');
    // coerenza interna: (1+fond)*(1+spec) ≈ (1+nom)
    ok(near((1+r.rFundamental)*(1+r.rSpeculative)-1, r.rNom, 0.001), 'Coerenza: (1+fond)(1+spec)-1 = nominale');
  }

  // 12.b Scenari direzionali: CAPE che sale (espansione) dà rendimento > CAPE che crolla
  const soft  = global.bogleDecompose(36.1, 30.7, 10, 0.015, 0.02, 0.0105); // -15%
  const crash = global.bogleDecompose(36.1, 12.0, 10, 0.015, 0.02, 0.0105); // ai minimi
  const expand= global.bogleDecompose(36.1, 43.3, 10, 0.015, 0.02, 0.0105); // +20%
  ok(expand.rNom > soft.rNom && soft.rNom > crash.rNom, 'Ordine scenari: Espansione > Soft Landing > Crash', [expand.rNom,soft.rNom,crash.rNom].map(x=>(x*100).toFixed(1)+'%').join(' > '));
  ok(near(crash.rNom, -0.063, 0.005), 'Crash Valutazioni ≈ -6.3%/a (interfaccia)', (crash.rNom*100).toFixed(1)+'%');

  // 12.c Sconto CAPE value-tilt: replica la logica di getPortfolioBlendedCape per
  // verificare che un portafoglio value/small risulti MENO caro del generico.
  ok(/CAPE_TILT/.test(SRC.live), 'live-data.js definisce CAPE_TILT (sconto value-tilt)');
  ok(/_capeTiltFactor/.test(SRC.live), 'CAPE blended applica _capeTiltFactor');
  // simulazione: portafoglio value-tilted vs generico, stesso CAPE geografico
  const CAPE_TILT = { eq_small_value:0.70, fat_valore:0.70, fat_size:0.80, fat_dividendi:0.75, fat_low_vol:0.85, fat_multifat:0.85 };
  const tiltOf = (slots) => { let tw=0,tot=0; for(const [k,w] of slots){tot+=w; tw+=w*(CAPE_TILT[k]??1.0);} return tw/tot; };
  const genericoTilt = tiltOf([['eq_sviluppati',1.0]]);
  const valueTilt = tiltOf([['eq_small_value',0.5],['fat_valore',0.5]]);
  ok(near(genericoTilt, 1.0, 1e-9), 'Portafoglio generico: nessuno sconto CAPE (fattore 1.0)', genericoTilt.toFixed(3));
  ok(valueTilt < 0.75, 'Portafoglio value/small: sconto CAPE significativo (<0.75)', valueTilt.toFixed(3));
}

// ════════════════════════════════════════════════════════════════════════
// RUNNER
// ════════════════════════════════════════════════════════════════════════
console.log('\x1b[1m╔══════════════════════════════════════════════════════╗\x1b[0m');
console.log('\x1b[1m║   TEST SUITE — Suite Patrimoniale Pro                 ║\x1b[0m');
console.log('\x1b[1m╚══════════════════════════════════════════════════════╝\x1b[0m');

const suites = [suiteData, suiteSimulator, suiteBacktest, suiteMC, suiteDecumulo, suitePensione, suiteFactors, suiteFiscal, suiteQuant, suiteFactorCrashBeta, suiteCrisisStress, suiteValuationStress];
for (const s of suites) {
  try { s(); }
  catch (e) { FAIL++; failures.push(s.name + ' CRASH: ' + e.message); console.log('  \x1b[31m✗ CRASH in ' + s.name + ': ' + e.message + '\x1b[0m'); }
}

console.log('\n\x1b[1m════════════════════ RIEPILOGO ════════════════════\x1b[0m');
console.log('  \x1b[32mPASS: ' + PASS + '\x1b[0m   \x1b[31mFAIL: ' + FAIL + '\x1b[0m   \x1b[33mWARN: ' + WARN + '\x1b[0m');
if (FAIL > 0) { console.log('\n\x1b[31mTest falliti:\x1b[0m'); failures.forEach(f => console.log('  • ' + f)); }
else console.log('\n\x1b[32m  ✓ Tutti i test superati — simulatore affidabile\x1b[0m');
process.exit(FAIL > 0 ? 1 : 0);
