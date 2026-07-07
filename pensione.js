// ██████  MODULO — PIANO PENSIONISTICO INTEGRATO
// Stima INPS contributivo/misto/retributivo + Fondo Pensione + ETF Portfolio
// ══════════════════════════════════════════════════════════════

// ── Stato modulo ─────────────────────────────────────────────
let penState = {
  age:        35,
  retAge:     67,
  lifeExp:    85,
  contYears:  10,      // anni contributi già versati
  ral:        35000,   // RAL attuale lordo annuo
  ralGrowth:  0.015,   // crescita reale RAL annua
  aliqCont:   0.33,    // aliquota contributiva IVS (dip. priv. = 33%)
  montante:   0,       // montante contributivo già accumulato
  desired:    2000,    // spesa mensile desiderata in pensione (€ oggi)
  infl:       0.02,    // inflazione attesa
  pil:        0.010,   // rivalutazione montante INPS: PIL reale medio di lungo
               // periodo (scenario RGS ~1,0%/a). NB: volutamente DISACCOPPIATO
               // dalla crescita RAL individuale (1,5%): assumere che il montante
               // si rivaluti quanto i salari gonfia il tasso di sostituzione.
  coeffDecl:  0.003,   // declino annuo del coeff. di trasformazione (revisioni biennali ISTAT)
  fpVers:     100,     // versamento mensile fondo pensione (quota lavoratore)
  fpRet:      0.04,    // rendimento annuo fondo pensione (lordo)
  tfrSi:      true,    // TFR versato al fondo pensione (quota = RAL/13.5, auto)
  regime:     'contributivo',
  // Fondo negoziale
  isNegoziale:      false,   // è un fondo negoziale (con contributo datoriale)?
  contDatoriale:    0.015,   // contributo datoriale (% RAL, default 1,5%)
  contLavoratore:   0.013,   // contributo lavoratore aggiuntivo contrattuale (% RAL, default 1,3%)
  // Risparmio fiscale
  rispFiscDest:     'reinvesti_fp', // 'spendi' | 'reinvesti_fp' | 'reinvesti_etf'
  // Dati ETF ereditati dal Simulatore (aggiornati su importa)
  etfCapital: 0,       // capitale ETF stimato al pensionamento
  etfRet:     0.05,    // rendimento annuo NETTO del portafoglio del Simulatore (default ~bilanciato; aggiornato su importa)
};

let chartPen     = null;
let chartPenFisc = null;
let chartRispFisc = null;

// ── Coefficienti di trasformazione INPS — biennio 2025/2026 ──
// FIX 2026-07-04: verificati TUTTI i 15 valori contro il DM Lavoro/MEF 20-22
// novembre 2024 (n. 436/2024, revisione biennale ex L.335/1995 Tab.A): le età
// 68/69/70 riportavano 5.821/6.042/6.272 (valori errati); i valori ufficiali
// sono 5.808/6.024/6.258, coerenti col reciproco dei divisori del decreto
// (1/17.218, 1/16.600, 1/15.980). Gli altri 12 valori erano già esatti.
// Vigente a lug 2026: il decreto del biennio 2027-28 arriverà a fine 2026.
// Fonte: DM 436/2024 (Min. Lavoro, 20/11/2024), in vigore dal 1°/1/2025.
// Valori ufficiali verificati per le età 57-67 e 71. Le età 68-69-70
// (assenti nelle fonti testuali consultate) sono interpolate
// geometricamente tra i valori ufficiali certi a 67 (5,608%) e 71
// (6,510%), con progressione monotòna coerente col trend reale.
const COEFF_TRASF = {
  57: 0.04204, 58: 0.04308, 59: 0.04419, 60: 0.04536,
  61: 0.04661, 62: 0.04795, 63: 0.04936, 64: 0.05088,
  65: 0.05250, 66: 0.05423, 67: 0.05608, 68: 0.05808,
  69: 0.06024, 70: 0.06258, 71: 0.06510,
};

function getCoeffTrasf(age) {
  const ages = Object.keys(COEFF_TRASF).map(Number).sort((a, b) => a - b);
  if (age <= ages[0]) return COEFF_TRASF[ages[0]];
  if (age >= ages[ages.length - 1]) return COEFF_TRASF[ages[ages.length - 1]];
  const lo = ages.filter(a => a <= age).pop();
  const hi = ages.filter(a => a >  age)[0];
  const t  = (age - lo) / (hi - lo);
  return COEFF_TRASF[lo] + t * (COEFF_TRASF[hi] - COEFF_TRASF[lo]);
}


// ── Età di vecchiaia di legge (adeguamenti speranza di vita) ──────────────────
// Normativa vigente + proiezioni RGS/MEF (rapporto tendenze 2025-26):
//   2025-26: 67 · 2027: 67a1m · 2028-29: 67a3m (L. Bilancio 2026, gradualità)
//   poi scatti biennali ISTAT: ~67a6m dal 2029-30, 68a nel 2037,
//   68a11m nel 2050, 70a nel 2065. Interpolazione lineare tra le ancore,
//   arrotondata al mese. È una STIMA: i decreti MEF biennali fissano i valori.
const ETA_VECCHIAIA_ANCHORS = [
  [2026, 67],        [2027, 67 + 1/12],  [2028, 67.25],
  [2030, 67.5],      [2037, 68],         [2050, 68 + 11/12],
  [2065, 70],        [2080, 70.75],
];
function getEtaVecchiaiaLegale(year) {
  const A = ETA_VECCHIAIA_ANCHORS;
  if (year <= A[0][0]) return A[0][1];
  if (year >= A[A.length-1][0]) return A[A.length-1][1];
  for (let i = 1; i < A.length; i++) {
    if (year <= A[i][0]) {
      const t = (year - A[i-1][0]) / (A[i][0] - A[i-1][0]);
      const v = A[i-1][1] + t * (A[i][1] - A[i-1][1]);
      return Math.round(v * 12) / 12; // arrotonda al mese
    }
  }
  return A[A.length-1][1];
}
// Età di vecchiaia che si applicherà all'utente: punto fisso età/anno
// (il requisito dipende dall'anno in cui lo si raggiunge).
function getEtaVecchiaiaUtente(currentAge, currentYear) {
  let eta = 67;
  for (let i = 0; i < 8; i++) {
    const yr = currentYear + (eta - currentAge);
    const req = getEtaVecchiaiaLegale(Math.round(yr));
    if (Math.abs(req - eta) < 1/24) break;
    eta = req;
  }
  return eta;
}
function fmtEta(e) {
  const a = Math.floor(e), m = Math.round((e - a) * 12);
  return m === 0 ? `${a} anni` : `${a}a ${m}m`;
}

// FIX 2026-07-04: formattazione PRECISA per la scheda pensione. Il fmtP() globale
// arrotonda al migliaio ("€3k/m"): su importi previdenziali mensili nasconde fino a
// ±500€/mese e può fuorviare. Qui: euro interi con separatori it-IT (€2.847/m,
// €822.347). Niente centesimi (falsa precisione su una stima). I tick degli assi
// dei grafici restano compatti (fmt) per leggibilità; tooltip e card sono precisi.
function fmtP(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  // separatore migliaia garantito anche senza ICU (indipendente dal runtime)
  const n = String(Math.round(Math.abs(v))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 ? '−' : '') + '€' + n;
}

// ── Descrizioni regime ────────────────────────────────────────
// FIX 2026-07-04: le definizioni erano scambiate rispetto alla norma (L.335/1995
// art.1 c.12-13 + DL 201/2011 art.24 c.2). Regola corretta:
//   nessun contributo ante-1996            -> CONTRIBUTIVO puro
//   contributi ante-1996 ma <18 anni al 31/12/1995 -> MISTO (retributivo fino al 1995)
//   >=18 anni al 31/12/1995 -> RETRIBUTIVO fino al 31/12/2011, contributivo dal 2012 (Fornero)
const PEN_REGIME_DESC = {
  contributivo: `<strong>Contributivo puro (L. 335/1995):</strong> per chi ha iniziato a versare dal 1° gennaio 1996 (nessun contributo ante-1996).
    Il montante individuale (33% della retribuzione, entro il massimale contributivo: €120.607 nel 2025, indicizzato) viene rivalutato annualmente al tasso di capitalizzazione (media quinquennale PIL nominale).
    La pensione lorda = montante × coefficiente di trasformazione (per età). <em>Pensione minima di importo almeno pari all'assegno sociale × 1,5 per accedere a 64 anni.</em>`,
  misto: `<strong>Sistema misto (L. 335/1995):</strong> per chi aveva contributi al 31/12/1995 ma <strong>meno di 18 anni</strong>.
    La quota maturata fino al 31/12/1995 è retributiva (~2% della retribuzione pensionabile per anno di anzianità ante-1996); dal 1° gennaio 1996 in poi il calcolo è contributivo.
    Il modello calcola le due quote separatamente — il montante contributivo considera SOLO gli anni post-1995 — e le somma.`,
  retributivo: `<strong>Retributivo pro-rata (≥18 anni di contributi al 31/12/1995):</strong>
    quota retributiva (~2%/anno, massimo 40 anni) per l'anzianità fino al <strong>31/12/2011</strong>; dal 1° gennaio 2012 anche questa platea è passata al calcolo contributivo (riforma Fornero, DL 201/2011).
    Il "retributivo puro" fino al pensionamento non esiste più per chi si ritira oggi.`,
};

// ── Calcolo core ──────────────────────────────────────────────
function calcPensione() {
  const { age, retAge, lifeExp, contYears, ral, ralGrowth, aliqCont,
          montante, desired, infl, pil, fpVers, fpRet,
          tfrSi, regime, isNegoziale, contDatoriale, contLavoratore,
          rispFiscDest } = penState;

  const yearsToRet   = Math.max(0, retAge - age);
  const yearsInPen   = Math.max(0, lifeExp - retAge);

  // ── 1. Calcolo deducibilità e risparmio fiscale annuo ─────
  // Limite deducibilità annua D.Lgs. 252/2005: €5.300,00 (dal 2026; era €5.164,57 fino al 2025)
  // Versamento lavoratore volontario (mensile × 12)
  const fpVersAnnVolont = fpVers * 12;
  // Quota lavoratore contrattuale da fondo negoziale (% RAL)
  const fpVersAnnLav = isNegoziale ? ral * contLavoratore : 0;
  // Quota datoriale (non è reddito del lavoratore → non entra nella deducibilità IRPEF del lavoratore)
  const fpVersAnnDat = (isNegoziale && tfrSi) ? ral * contDatoriale : 0;
  // TFR annuo (non deducibile, è accantonamento figurativo)
  const TFR_DIVISOR  = 13.5;
  const tfrAnnBase   = tfrSi ? (ral / TFR_DIVISOR) : 0;

  // Contributi deducibili = versamento volontario + quota lavoratore contrattuale.
  // Il plafond di legge (5.300€/anno dal 2026) è COMPLESSIVO: vi concorre anche il contributo
  // DATORIALE, che pur non essendo dedotto dal lavoratore erode lo spazio deducibile
  // disponibile. Il TFR conferito resta invece fuori dal plafond (non deducibile).
  const deduzMassima      = 5300.00;
  const plafondResiduo    = Math.max(0, deduzMassima - fpVersAnnDat);
  const deduzLorda        = fpVersAnnVolont + fpVersAnnLav;
  const deduzEffettiva    = Math.min(deduzLorda, plafondResiduo);
  const aliqMargIRPEF  = calcAliqMargIRPEF(ral);
  const risparmioFisc  = deduzEffettiva * aliqMargIRPEF; // risparmio IRPEF annuo

  // Risparmio fiscale destinazione:
  // 'spendi'        → esce dal sistema (extra consumo, non investe)
  // 'reinvesti_fp'  → aggiunto come versamento extra al FP
  // 'reinvesti_etf' → investito nel portafoglio ETF (fuori dal FP)
  const rispFiscMens = risparmioFisc / 12;
  const extraFP  = rispFiscDest === 'reinvesti_fp'  ? risparmioFisc : 0;
  const extraETF = rispFiscDest === 'reinvesti_etf' ? risparmioFisc : 0;

  // ── 2. Proiezione anno per anno ──────────────────────────
  // FIX 2026-07-04 (regimi): (1) l'ordine di capitalizzazione della stima era INVERTITO
  // (k crescente = dal recente al vecchio: il contributo più vecchio non capitalizzava
  // mai -> montante sottostimato). Ora si itera dal più vecchio al più recente.
  // (2) stimaMontanteDa(annoTaglio) permette di scorporare la quota post-taglio per
  // misto (post-1995) e retributivo-Fornero (post-2011), eliminando il DOPPIO CONTEGGIO
  // (prima la quota contributiva del misto includeva anche gli anni già pagati dalla
  // quota retributiva). (3) massimale contributivo (€120.607/2025, art.2 c.18 L.335/95)
  // applicato SOLO al contributivo puro, come da norma.
  const curYear = new Date().getFullYear();
  const annoInizioContrib = curYear - contYears;
  const MASSIMALE_2025 = 120607;
  const stimaMontanteDa = (annoDa) => {
    let stima = 0;
    for (let k = contYears - 1; k >= 0; k--) {        // k = anni fa (dal più vecchio)
      const annoK = curYear - 1 - k;                   // anno del versamento
      const capitalizza = stima * (1 + pil);
      if (annoK < annoDa) { stima = capitalizza; continue; } // ante-taglio: fuori quota
      let ralPassata = ral / Math.pow(1 + ralGrowth, k);
      if (regime === 'contributivo') ralPassata = Math.min(ralPassata, MASSIMALE_2025);
      stima = capitalizza + ralPassata * aliqCont;
    }
    return stima;
  };
  const annoTaglio = regime === 'misto' ? 1996 : regime === 'retributivo' ? 2012 : null;
  let montanteIniziale = montante > 0 ? montante : stimaMontanteDa(-Infinity);
  // quota post-taglio del montante passato (se montante fornito dall'utente: ripartizione pro-stima)
  let montantePostIniziale = montanteIniziale;
  if (annoTaglio !== null) {
    const stTot = stimaMontanteDa(-Infinity), stPost = stimaMontanteDa(annoTaglio);
    montantePostIniziale = montante > 0
      ? montante * (stTot > 0 ? stPost / stTot : 1)
      : stPost;
  }
  let cumMontante     = montanteIniziale;
  let cumMontantePost = montantePostIniziale;
  let capFP        = 0;
  let capETFBonus  = 0;   // capital accumulato dal risparmio fiscale reinvestito in ETF
  let capETFBonusVers = 0; // base di costo (somma dei versamenti) per il capital gain
  let capTfrAz     = 0;   // TFR lasciato in azienda: liquidazione separata (rivalutaz. di legge)
  let capTfrFp     = 0;   // TFR conferito al fondo: quota di capFP derivante dal solo TFR
  // ── Composizione del montante FP (FIX 2026-07-04): versato nominale per fonte.
  // Serve per (a) trasparenza verso l'utente e (b) tassazione NORMATIVA della
  // prestazione (D.lgs 252/2005 art.11 c.6): l'aliquota 15%→9% si applica SOLO
  // all'imponibile (TFR + contributo datore + contributi dedotti); sono ESENTI i
  // rendimenti (già tassati al 20% annuo) e i contributi NON dedotti (eccedenza
  // oltre il plafond, da comunicare al fondo).
  let versTfrFP = 0, versDatFP = 0, versLavFP = 0, versVolFP = 0, versExtraFP = 0, versNonDedottiFP = 0;
  const eccedenzaAnnua = Math.max(0, (fpVersAnnVolont + fpVersAnnLav) - plafondResiduo);
  const revAzienda = 0.015 + 0.75 * infl; // rivalutazione TFR di legge (art. 2120 c.c.)
  const rateCapIT  = pil + infl;

  const accData = [];
  for (let y = 0; y < yearsToRet; y++) {
    const curRal     = ral * Math.pow(1 + ralGrowth + infl, y);
    const baseCont   = regime === 'contributivo'
      ? Math.min(curRal, MASSIMALE_2025 * Math.pow(1 + infl, y + 1))  // massimale indicizzato
      : curRal;                                                        // non si applica ad ante-1996
    const contAnn    = baseCont * aliqCont;
    cumMontante      = cumMontante * (1 + rateCapIT) + contAnn;
    cumMontantePost  = cumMontantePost * (1 + rateCapIT) + contAnn;   // gli anni futuri sono tutti post-taglio

    // TFR corrente sull'anno
    const tfrAnnCur  = tfrSi ? (curRal / TFR_DIVISOR) : 0;
    // Se il TFR resta in azienda, si accumula come liquidazione separata, rivalutata
    // per legge (1,5% + 75% inflazione). Verrà tassato separatamente al riscatto.
    if (!tfrSi) {
      capTfrAz = capTfrAz * (1 + revAzienda) + (curRal / TFR_DIVISOR);
    }
    // Fondo negoziale: contributo datoriale + lavoratore proporzionali alla RAL corrente.
    // Il contributo DATORIALE richiede il conferimento del TFR al fondo (requisito di legge/CCNL):
    // se il TFR resta in azienda, il datore non versa la sua quota. Il contributo del lavoratore
    // e il versamento volontario restano invece possibili anche con TFR in azienda.
    const fpDatCur   = (isNegoziale && tfrSi) ? curRal * contDatoriale  : 0;
    const fpLavCur   = isNegoziale ? curRal * contLavoratore : 0;

    // Totale versato nel FP quest'anno:
    // versamento volontario + quota negoziale lavoratore + TFR + eventuale extra da risparmio fiscale reinvestito
    const fpAnn      = fpVers * 12 + fpLavCur + tfrAnnCur + fpDatCur + extraFP;

    // NOTA FISCALE FP: il rendimento annuo è tassato al 20% ogni anno (non al 26% come ETF).
    // Implementazione: il rendimento netto è fpRet * (1 - 0.20) = fpRet * 0.80
    // (a differenza del portafoglio ETF ad accumulazione dove la tassazione è differita)
    capFP = capFP * (1 + fpRet * 0.80) + fpAnn;
    // Quota del capitale FP derivante dal solo TFR conferito (per mostrarne lordo/netto)
    if (tfrSi) {
      capTfrFp = capTfrFp * (1 + fpRet * 0.80) + tfrAnnCur;
    }
    // Composizione: versato nominale cumulato per fonte
    versTfrFP   += tfrAnnCur;
    versDatFP   += fpDatCur;
    versLavFP   += fpLavCur;
    versVolFP   += fpVers * 12;
    versExtraFP += extraFP;
    versNonDedottiFP += eccedenzaAnnua;

    // ETF bonus da risparmio fiscale reinvestito nel portafoglio del Simulatore.
    // Cresce al rendimento NETTO del portafoglio scelto (etfRet), con tassazione
    // del capital gain DIFFERITA al riscatto (a differenza del FP, tassato lungo il
    // percorso al 20%). La tassa sulla plusvalenza viene applicata più sotto, al riscatto.
    if (extraETF > 0) {
      capETFBonus = capETFBonus * (1 + penState.etfRet) + extraETF;
      capETFBonusVers += extraETF;
    }

    accData.push({
      year:         y + 1,
      age:          age + y + 1,
      ral:          Math.round(curRal),
      contrib:      Math.round(contAnn),
      montanteINPS: Math.round(cumMontante),
      capFP:        Math.round(capFP),
      fpVersAnn:    Math.round(fpAnn),
      tfrAnn:       Math.round(tfrAnnCur),
      fpDatAnn:     Math.round(fpDatCur),
      fpLavAnn:     Math.round(fpLavCur),
      rispFiscAnn:  Math.round(risparmioFisc),
    });
  }

  // ── 3. Pensione INPS lorda ─────────────────────────────
  const coeffTrasfBase = getCoeffTrasf(retAge);
  const coeffTrasf     = coeffTrasfBase * Math.pow(1 - (penState.coeffDecl ?? 0), yearsToRet);

  let pensioneLordaAnn;
  // Retribuzione pensionabile per le quote retributive: media degli ultimi anni PRIMA
  // del pensionamento (quota A/B), proiettata a fine carriera in termini NOMINALI
  // (coerente con curRal del loop; prima il misto usava la RAL di oggi e il
  // retributivo la proiettava solo in reale -> sottostima incoerente tra rami).
  const ralFinaleNom = ral * Math.pow(1 + ralGrowth + infl, yearsToRet);
  if (regime === 'contributivo') {
    pensioneLordaAnn = cumMontante * coeffTrasf;
  } else if (regime === 'misto') {
    // <18 anni al 31/12/1995: quota retributiva SOLO per gli anni ante-1996,
    // quota contributiva SOLO sul montante post-1995 (niente doppio conteggio).
    const anniAnte  = Math.max(0, Math.min(contYears, 1996 - annoInizioContrib));
    const quotaRet  = ralFinaleNom * 0.85 * 0.02 * anniAnte;
    const quotaCont = cumMontantePost * coeffTrasf;
    pensioneLordaAnn = quotaRet + quotaCont;
  } else {
    // >=18 anni al 31/12/1995 — riforma Fornero (DL 201/2011): quota retributiva
    // per gli anni fino al 31/12/2011, contributiva dal 2012 in poi.
    const totalAnni   = contYears + yearsToRet;
    const anniRetrib  = Math.max(0, Math.min(totalAnni, 2012 - annoInizioContrib));
    const quotaRet    = ralFinaleNom * 0.80 * 0.02 * Math.min(anniRetrib, 40);
    const quotaCont   = cumMontantePost * coeffTrasf;   // taglio 2012
    pensioneLordaAnn  = quotaRet + quotaCont;
  }

  const pensioneLordaMens = pensioneLordaAnn / 12;
  const irpefAnn          = calcIRPEF(pensioneLordaAnn);
  const pensioneNettaAnn  = pensioneLordaAnn - irpefAnn;
  const pensioneNettaMens = pensioneNettaAnn / 12;
  const ralFinale         = ral * Math.pow(1 + ralGrowth + infl, yearsToRet);
  const tassoSost         = pensioneLordaAnn / ralFinale;

  // ── 4. Rendita fondo pensione ──────────────────────────
  const anniAdesione   = yearsToRet;
  const aliqFP         = Math.max(0.09, 0.15 - Math.max(0, anniAdesione - 15) * 0.003);
  // FIX 2026-07-04: il coefficiente di conversione in rendita era SBAGLIATO in due modi:
  // (1) il "tasso tecnico" era derivato dal rendimento del comparto di ACCUMULO e
  //     dall'aliquota FISCALE (iTecnico = fpRet*(1-aliqFP)*0.6) — grandezze estranee
  //     alla conversione: a 67 anni produceva un coefficiente ~6,8% (7,4% con comparto
  //     azionario!), sopra perfino il coefficiente INPS (5,608%) e +45/55% rispetto
  //     alle convenzioni assicurative reali -> rendita FP sovrastimata di quasi meta'.
  // (2) rendita certa sulla sola vita attesa puntuale: nessun margine di longevita'.
  // Ora: modello conforme alle convenzioni standard di mercato verificate sui
  // "Documenti sull'erogazione delle rendite" dei fondi (Fon.Te., Alifond, UnipolSai,
  // Generali, FPA): tavole A62 ANIA (proiettate ISTAT per coorte), TASSO TECNICO 0%
  // (lo standard delle convenzioni; le rendite si rivalutano poi con la gestione
  // separata), caricamento ~1%. Con tt=0 il coefficiente = 1/aspettativa_A62(eta') x
  // (1-caricamento); l'aspettativa A62 proiettata ~ vita attesa puntuale + ~3 anni.
  // Risultato a 67 anni (lifeExp 85): ~4,7% — nel range 4,5-4,9% delle convenzioni,
  // e correttamente INFERIORE al coefficiente INPS (basi assicurative piu' prudenti).
  const TT_RENDITA        = 0.0;   // tasso tecnico convenzioni (0% standard)
  const CARICAMENTO_REND  = 0.011; // spese erogazione 0,8-1,3% nei documenti rendite
  const MARGINE_A62       = 3;     // anni: proiezione per coorte delle tavole A62 vs vita attesa puntuale
  const anniVita       = Math.max(1, (lifeExp - retAge) + MARGINE_A62);
  const annuityFactor  = (TT_RENDITA > 0
    ? TT_RENDITA / (1 - Math.pow(1 + TT_RENDITA, -anniVita))
    : 1 / anniVita) * (1 - CARICAMENTO_REND);
  const rendFPAnn      = capFP * annuityFactor;
  // Tassazione normativa (D.lgs 252/2005 art.11 c.6): imponibile = TFR + datore +
  // contributi dedotti; ESENTI rendimenti (già tassati 20%/anno) e non dedotti.
  const versTotFP      = versTfrFP + versDatFP + versLavFP + versVolFP + versExtraFP;
  const versDedottiFP  = Math.max(0, versLavFP + versVolFP + versExtraFP - versNonDedottiFP);
  const rendimentiFP   = Math.max(0, capFP - versTotFP);
  const quotaImponibileFP = capFP > 0
    ? Math.min(1, Math.max(0, (versTfrFP + versDatFP + versDedottiFP) / capFP))
    : 1;
  const rendFPNetta    = rendFPAnn * (1 - aliqFP * quotaImponibileFP); // prima tassava anche i rendimenti (già tassati) e i non dedotti
  const rendFPMens     = rendFPNetta / 12;

  // ── 5. ETF portafoglio (da Simulatore + bonus risparmio fiscale) ──
  // L'ETF bonus sconta la tassazione del capital gain (26%) DIFFERITA al riscatto,
  // solo sulla plusvalenza (capitale meno base di costo) — a differenza del FP,
  // già tassato al 20% lungo il percorso.
  const capETFBonusGain = Math.max(0, capETFBonus - capETFBonusVers);
  const capETFBonusNetto = capETFBonusVers + capETFBonusGain * (1 - 0.26);

  // TFR lasciato in azienda: liquidazione separata netta (tassazione separata
  // all'aliquota media IRPEF, proxy clampata 23-43%). Mostrato come VOCE SEPARATA
  // (è un incasso una tantum, non un capitale a rendita), non sommato all'ETF.
  const aliqSepTFR     = Math.min(0.43, Math.max(0.23, aliqMargIRPEF));
  const capTfrAzNetto  = capTfrAz * (1 - aliqSepTFR);
  // Lordo/netto del TFR nei due regimi (per la card di trasparenza fiscale):
  //  • azienda: tassazione separata all'aliquota media IRPEF
  //  • fondo:   tassazione agevolata 15%→9% (aliqFP)
  const tfrInfo = {
    azienda: { lordo: Math.round(capTfrAz),  netto: Math.round(capTfrAzNetto),        aliq: aliqSepTFR },
    fondo:   { lordo: Math.round(capTfrFp),
               netto: Math.round(capTfrFp * (1 - aliqFP * (capTfrFp > 0 ? Math.min(1, versTfrFP / capTfrFp) : 1))),
               aliq: aliqFP },
  };
  const etfCap         = penState.etfCapital + capETFBonusNetto;
  const swr            = 0.04;
  const etfPrelievoAnn = etfCap * swr;
  const etfPrelievoMens = etfPrelievoAnn / 12;

  // ── 6. Gap analysis in pensione ───────────────────────
  const decData = [];
  let capFPResiduo  = capFP;
  let capETFResiduo = etfCap;
  for (let y = 0; y < yearsInPen; y++) {
    const curAge         = retAge + y;
    const fabbisognoMens = desired * Math.pow(1 + infl, yearsToRet + y);
    const fabbisognoAnn  = fabbisognoMens * 12;
    const pensNettaY     = pensioneNettaAnn * Math.pow(1 + infl * 0.75, y);
    const rendFPY        = rendFPNetta * Math.pow(1 + fpRet * (1 - aliqFP) * 0.5, y);
    // L'ETF genera il suo reddito al prelievo SWR pieno (4% del capitale residuo),
    // coerentemente con la barra-riepilogo in alto: il grafico risponde a "da dove
    // arriva il reddito", quindi mostra il reddito PRODOTTO da ogni gamba, non solo
    // il tappabuchi del fabbisogno. La linea tratteggiata "Fabbisogno reale" resta il
    // riferimento da confrontare; se le tre gambe la superano, è un surplus reale.
    const etfY           = capETFResiduo * swr;
    capETFResiduo        = Math.max(0, capETFResiduo * (1 + fpRet * 0.7) - etfY);
    const coperto        = pensNettaY + rendFPY + etfY;
    // Gap = quota di fabbisogno NON coperta dalla somma delle tre gambe (0 se surplus).
    const gap            = Math.max(0, fabbisognoAnn - coperto);
    decData.push({
      year: y + 1, age: curAge,
      fabbisognoMens: Math.round(fabbisognoMens), fabbisognoAnn: Math.round(fabbisognoAnn),
      pensNettaMens:  Math.round(pensNettaY / 12), pensNettaAnn:  Math.round(pensNettaY),
      rendFPMens:     Math.round(rendFPY / 12),    rendFPAnn:     Math.round(rendFPY),
      etfMens:        Math.round(etfY / 12),        etfAnn:        Math.round(etfY),
      gapMens:        Math.round(gap / 12),          gapAnn:        Math.round(gap),
      copertoPct:     fabbisognoAnn > 0 ? Math.round((coperto / fabbisognoAnn) * 100) : 100,
    });
  }

  // ── 7. fiscData completo ───────────────────────────────
  const tfrAnnuoMedio = tfrSi ? (ral / TFR_DIVISOR) : 0;
  const fiscData = {
    aliqFP, aliqMargIRPEF, risparmioFisc, rispFiscMens,
    deduzEffettiva, deduzLorda, anniAdesione, capFP, rendFPNetta,
    tfrAnnuoMedio, extraFP, extraETF, capETFBonus,
    fpDatoriale: fpVersAnnDat, fpLavoratore: fpVersAnnLav, fpVersAnnDat, plafondResiduo,
    fpVersAnnVolont, rispFiscDest,
  };

  return {
    accData, decData, fiscData,
    pensioneLordaMens: Math.round(pensioneLordaMens),
    pensioneLordaAnn:  Math.round(pensioneLordaAnn),
    pensioneNettaMens: Math.round(pensioneNettaMens),
    pensioneNettaAnn:  Math.round(pensioneNettaAnn),
    irpefAnn:          Math.round(irpefAnn),
    tassoSost, coeffTrasf, coeffTrasfBase,
    cumMontante:       Math.round(cumMontante),
    montanteIniziale:  Math.round(montanteIniziale),
    capFP:             Math.round(capFP),
    rendFPMens:        Math.round(rendFPMens),
    rendFPNetta:       Math.round(rendFPNetta),
    fpComposizione: {
      tfr: Math.round(versTfrFP), datore: Math.round(versDatFP),
      lavoratore: Math.round(versLavFP), volontari: Math.round(versVolFP),
      extra: Math.round(versExtraFP), rendimenti: Math.round(rendimentiFP),
      nonDedotti: Math.round(versNonDedottiFP), quotaImponibile: quotaImponibileFP,
    },
    aliqFP,
    etfPrelievoMens:   Math.round(etfPrelievoMens),
    etfCap:            Math.round(etfCap),
    capETFBonus:       Math.round(capETFBonus),
    capTfrAzNetto:     Math.round(capTfrAzNetto),
    tfrInfo,
    yearsToRet, yearsInPen,
    dec0: decData[0] ?? null,
  };
}

// ── IRPEF scaglioni 2025 ──────────────────────────────────────
// FIX 2026-07-04: la detrazione usata era una formula da LAVORO DIPENDENTE
// (1955+1190x(55000-R)/47000): per una pensione di 28k dava 2.639 euro di
// detrazione contro i 700 della detrazione REDDITI DA PENSIONE (art.13 c.3
// TUIR, vigente 2025-26) -> pensione netta gonfiata fino a ~2k/anno.
// Ora: detrazione pensionati corretta (no-tax area ~8.500) e parametro 'detr'
// perche' l'aliquota media per la tassazione separata del TFR va calcolata
// per legge sugli scaglioni SENZA detrazioni.
function calcIRPEF(reddito, detr = 'pensione') {
  const scaglioni = [
    { max: 28000,    aliq: 0.23 },
    { max: 50000,    aliq: 0.35 },
    { max: Infinity, aliq: 0.43 },
  ];
  let imposta = 0, prev = 0;
  for (const { max, aliq } of scaglioni) {
    if (reddito <= prev) break;
    imposta += (Math.min(reddito, max) - prev) * aliq;
    prev = max;
  }
  let detrazione = 0;
  if (detr === 'pensione') {
    detrazione = reddito <= 8500 ? 1955
      : reddito <= 28000 ? 700 + 1255 * (28000 - reddito) / 19500
      : reddito <= 50000 ? 700 * (50000 - reddito) / 22000
      : 0;
  }
  return Math.max(0, imposta - detrazione);
}

function calcAliqMargIRPEF(ral) {
  if (ral <= 28000) return 0.23;
  if (ral <= 50000) return 0.35;
  return 0.43;
}

// ── Suggerisci versamento ottimale ─────────────────────────
function calcPenSuggerito() {
  const original = penState.fpVers;
  let lo = 0, hi = 5000, best = original;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    penState.fpVers = mid;
    const r = calcPensione();
    const dec0 = r.dec0;
    if (!dec0) break;
    const coperto = dec0.pensNettaAnn + dec0.rendFPAnn + dec0.etfAnn;
    if (coperto < dec0.fabbisognoAnn) lo = mid;
    else { best = mid; hi = mid; }
  }
  penState.fpVers = Math.ceil(best / 10) * 10;
  const sl = document.getElementById('sPenFPVers');
  if (sl) { sl.value = penState.fpVers; document.getElementById('lPenFPVers').textContent = fmtP(penState.fpVers); }
  renderPensione();
}

// ── Import dati dal Simulatore ─────────────────────────────
function importPenFromSim() {
  if (typeof state === 'undefined') return;
  penState.age = state.age || penState.age;
  let capStimato = 0;
  try {
    const yearsToRet = Math.max(0, penState.retAge - penState.age);
    const dSim = project('normal', false);
    capStimato = dSim[Math.min(yearsToRet, dSim.length - 1)]?.value ?? 0;
    penState.etfCapital = capStimato;
    // Rendimento NETTO del portafoglio scelto nel Simulatore (per il reinvestimento del risparmio fiscale in ETF)
    if (typeof getRate === 'function') {
      const terRate = (typeof state.ter === 'number' ? state.ter : 0) / 100;
      const rNet = getRate(state.portfolio, 'normal', 0, state.age) - terRate;
      if (isFinite(rNet) && rNet > 0) penState.etfRet = rNet;
    }
  } catch(e) { penState.etfCapital = 0; }
  const slAge = document.getElementById('sPenAge');
  if (slAge) { slAge.value = penState.age; document.getElementById('lPenAge').textContent = penState.age; }
  const swrMens = Math.round(capStimato * 0.04 / 12);
  document.getElementById('penImportStatus').innerHTML =
    `<span style="color:var(--green)">✅ Importato dal Simulatore: età <strong>${penState.age}</strong> anni · capitale ETF stimato al pensionamento (scenario Base): <strong>${fmtP(penState.etfCapital)}</strong> → ~${fmtP(swrMens)}/mese al 4% SWR, a completamento di INPS e fondo pensione.</span>`;
  renderPensione();
}

// ── Render principale ─────────────────────────────────────
function renderPensione() {
  try {
    const r = calcPensione();
    window.lastPenResult = { r, params: { ...penState } };
    const tfrLbl = document.getElementById('lPenTFRAuto');
    if (tfrLbl) tfrLbl.textContent = penState.tfrSi ? fmtP(Math.round(penState.ral / 13.5)) + '/anno' : 'non conferito';
    const mHint = document.getElementById('penMontanteHint');
    if (mHint) {
      // Hint normativo: età di vecchiaia stimata per l'utente (tabellare RGS)
      const lawHint = document.getElementById('penAgeLawHint');
      if (lawHint) {
        const nowY    = new Date().getFullYear();
        const etaLeg  = getEtaVecchiaiaUtente(penState.age, nowY);
        const yrLeg   = Math.round(nowY + (etaLeg - penState.age));
        const etaCtr  = Math.min(71.25, etaLeg + 4); // canale contributivo: 71 (71a3m dal 2028), adeguato
        if (penState.retAge < etaLeg - 1/24) {
          lawHint.innerHTML = `⚠️ Sotto l'<strong>età di vecchiaia stimata per te: ${fmtEta(etaLeg)}</strong> (nel ${yrLeg}, adeguamenti speranza di vita RGS). Uscire prima richiede la <strong>pensione anticipata</strong> (43a 2m di contributi dal 2028, anch'essi in crescita) o canali dedicati (APE, usuranti).`;
          lawHint.style.color = 'var(--orange)';
        } else {
          lawHint.innerHTML = `✓ Compatibile con l'età di vecchiaia stimata per te: <strong>${fmtEta(etaLeg)}</strong> nel ${yrLeg} (tabellare adeguamenti ISTAT/RGS).${penState.retAge >= 71 ? ` A 71+ rientri anche nel canale <strong>vecchiaia contributiva</strong> (71a, 71a3m dal 2028, bastano 5 anni di contributi effettivi).` : ''}`;
          lawHint.style.color = 'var(--text3)';
        }
      }
      if (penState.montante <= 0 && penState.contYears > 0)
        mHint.innerHTML = `Stimato automaticamente da <strong>${penState.contYears} anni</strong> già versati: <strong>${fmtP(r.montanteIniziale)}</strong>. Inserisci il valore esatto dal sito INPS per più precisione.`;
      else if (penState.montante <= 0)
        mHint.innerHTML = `Nessun contributo pregresso. Imposta gli "anni già versati" o inserisci il montante dal sito INPS.`;
      else
        mHint.innerHTML = `Valore inserito manualmente. Riporta a <strong>0</strong> per stimarlo dagli anni già versati.`;
    }
    const negBlock = document.getElementById('penNegozialBlock');
    if (negBlock) negBlock.style.display = penState.isNegoziale ? 'block' : 'none';
    const negRAL = document.getElementById('penNegRALShow');
    const negDat = document.getElementById('penNegDatShow');
    const negLav = document.getElementById('penNegLavShow');
    if (negRAL) negRAL.textContent = Math.round(penState.ral).toLocaleString('it-IT');
    if (negDat) negDat.textContent = '€' + Math.round(penState.ral * penState.contDatoriale).toLocaleString('it-IT');
    if (negLav) negLav.textContent = '€' + Math.round(penState.ral * penState.contLavoratore).toLocaleString('it-IT');
    // sync slider labels
    const lDat = document.getElementById('lPenContDat');
    const lLav = document.getElementById('lPenContLav');
    if (lDat) lDat.textContent = (penState.contDatoriale * 100).toFixed(2) + '%';
    if (lLav) lLav.textContent = (penState.contLavoratore * 100).toFixed(2) + '%';

    try { renderPenKPI(r); }      catch(e) { console.error('renderPenKPI:', e); }
    try { renderPenChart(r); }    catch(e) { console.error('renderPenChart:', e); }
    try { renderPenINPS(r); }     catch(e) { console.error('renderPenINPS:', e); }
    try { renderPenFP(r); }       catch(e) { console.error('renderPenFP:', e); }
    try { renderPenRispFisc(r); } catch(e) { console.error('renderPenRispFisc:', e); }
    try { renderPenFiscComp(r); } catch(e) { console.error('renderPenFiscComp:', e); }
    try { renderPenAccTable(r); } catch(e) { console.error('renderPenAccTable:', e); }
    try { renderPenDecTable(r); } catch(e) { console.error('renderPenDecTable:', e); }
  } catch(e) {
    console.error('renderPensione fatale:', e);
  }
}

// ── KPI Cards ────────────────────────────────────────────────
function renderPenKPI(r) {
  const { pensioneNettaMens, rendFPMens, etfPrelievoMens, dec0, yearsToRet, tassoSost, cumMontante, capFP, etfCap, coeffTrasf, capTfrAzNetto, tfrInfo } = r;
  const deflaz     = Math.pow(1 + penState.infl, yearsToRet);
  const toReal     = v => v / deflaz;
  const fabb       = dec0?.fabbisognoMens ?? (penState.desired * deflaz);
  const totMens    = pensioneNettaMens + rendFPMens + etfPrelievoMens;
  const gap        = Math.max(0, fabb - totMens);
  const copertoPct = fabb > 0 ? Math.round((totMens / fabb) * 100) : 100;
  const gapCol     = gap === 0 ? 'var(--green)' : gap < fabb * 0.2 ? 'var(--orange)' : 'var(--red)';
  const tsCol      = tassoSost >= 0.7 ? 'var(--green)' : tassoSost >= 0.5 ? 'var(--orange)' : 'var(--red)';
  const inpsReal   = toReal(pensioneNettaMens), fpReal = toReal(rendFPMens), etfReal = toReal(etfPrelievoMens), totReal = toReal(totMens);

  const _co = r.fpComposizione || {};
  const _coTot = Math.max(1, (_co.tfr||0)+(_co.datore||0)+(_co.lavoratore||0)+(_co.volontari||0)+(_co.extra||0)+(_co.rendimenti||0));
  const _coPct = v => ((v||0)/_coTot*100).toFixed(1)+'%';
  const _coRow = (lbl,v,col,note) => (v>0 ? `<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px dashed var(--border)"><span>${lbl}${note?` <span style="opacity:.55;font-size:10px">${note}</span>`:''}</span><span style="color:${col};font-family:'DM Mono'">${fmtP(v)} <span style="opacity:.6;font-size:10px">(${_coPct(v)})</span></span></div>` : '');
  const compHtml = `
    <div class="pcard" style="margin-top:10px">
      <div class="ml" style="margin-bottom:6px">📊 Composizione del montante Fondo Pensione a scadenza — ${fmtP(capFP)}</div>
      <div style="font-size:12px">
        ${_coRow('TFR conferito', _co.tfr, 'var(--gold)', 'imponibile 15→9%')}
        ${_coRow('Contributo datore (CCNL)', _co.datore, 'var(--green)', 'imponibile · richiede TFR al fondo')}
        ${_coRow('Contributo lavoratore (CCNL)', _co.lavoratore, 'var(--blue)', 'dedotto → imponibile')}
        ${_coRow('Versamenti volontari', _co.volontari, 'var(--blue)', 'dedotti entro plafond €5.300')}
        ${_coRow('Contributi aggiuntivi (risparmio fiscale reinvestito)', _co.extra, 'var(--teal)', '')}
        ${_coRow('Rendimenti netti maturati', _co.rendimenti, 'var(--purple)', 'ESENTI in erogazione: già tassati 20%/anno')}
        ${(_co.nonDedotti>0 ? _coRow('di cui contributi NON dedotti (oltre plafond)', _co.nonDedotti, 'var(--orange)', 'esenti in erogazione se comunicati al fondo') : '')}
      </div>
      <div style="font-size:11px;opacity:.65;margin-top:6px">Quota imponibile della prestazione (D.lgs 252/2005): <strong>${((_co.quotaImponibile||1)*100).toFixed(1)}%</strong> — l'aliquota agevolata ${((r.aliqFP ?? 0.15)*100).toFixed(1).replace('.0','')}% si applica solo a questa quota; rendimenti e contributi non dedotti sono esenti.</div>
    </div>`;
  document.getElementById('penKpiCards').innerHTML = compHtml + `
    <div class="mcard">
      <div class="ml">Pensione INPS netta</div>
      <div class="mv" style="color:var(--blue)">${fmtP(pensioneNettaMens)}<span style="font-size:11px;opacity:.6">/m</span></div>
      <div class="ms">≈ ${fmtP(inpsReal)}/m in € di oggi · coeff. ${(coeffTrasf*100).toFixed(3)}%${r.coeffTrasfBase && Math.abs(r.coeffTrasfBase-coeffTrasf)>1e-5?` (2025: ${(r.coeffTrasfBase*100).toFixed(3)}%)`:''}</div>
    </div>
    <div class="mcard">
      <div class="ml">Rendita Fondo Pensione</div>
      <div class="mv" style="color:var(--purple)">${fmtP(rendFPMens)}<span style="font-size:11px;opacity:.6">/m</span></div>
      <div class="ms">≈ ${fmtP(fpReal)}/m in € di oggi · cap. ${fmtP(capFP)}</div>
    </div>
    ${tfrInfo && tfrInfo.fondo.lordo > 0 ? `
    <div class="mcard">
      <div class="ml">TFR nel fondo (quota)</div>
      <div class="mv" style="color:var(--purple)">${fmtP(tfrInfo.fondo.netto)}</div>
      <div class="ms">${fmtP(tfrInfo.fondo.lordo)} lordo → ${fmtP(tfrInfo.fondo.netto)} netto (tass. agevolata ${(tfrInfo.fondo.aliq*100).toFixed(1)}%) · già incluso nel capitale FP</div>
    </div>` : ''}
    <div class="mcard">
      <div class="ml">Prelievo ETF Portfolio</div>
      <div class="mv" style="color:var(--teal)">${fmtP(etfPrelievoMens)}<span style="font-size:11px;opacity:.6">/m</span></div>
      <div class="ms">≈ ${fmtP(etfReal)}/m in € di oggi · cap. ${fmtP(etfCap)} · SWR 4%</div>
    </div>
    ${capTfrAzNetto > 0 ? `
    <div class="mcard">
      <div class="ml">TFR liquidazione (azienda)</div>
      <div class="mv" style="color:var(--orange)">${fmtP(capTfrAzNetto)}</div>
      <div class="ms">${fmtP(tfrInfo.azienda.lordo)} lordo → ${fmtP(tfrInfo.azienda.netto)} netto (tass. separata ${(tfrInfo.azienda.aliq*100).toFixed(0)}%) · incasso una tantum · ≈ ${fmtP(Math.round(toReal(capTfrAzNetto)))} in € di oggi</div>
    </div>` : ''}
    <div class="mcard">
      <div class="ml">Totale disponibile</div>
      <div class="mv" style="color:${copertoPct>=100?'var(--green)':'var(--orange)'}">${fmtP(totMens)}<span style="font-size:11px;opacity:.6">/m</span></div>
      <div class="ms">≈ ${fmtP(totReal)}/m oggi · fabbisogno ${fmtP(Math.round(fabb))}/m</div>
    </div>
    <div class="mcard">
      <div class="ml">Gap previdenziale</div>
      <div class="mv" style="color:${gapCol}">${gap === 0 ? '✅ Zero' : fmtP(gap) + '/m'}</div>
      <div class="ms" style="color:${gapCol};font-weight:600">Copertura: ${copertoPct}%</div>
    </div>
    <div class="mcard">
      <div class="ml">Tasso di sostituzione</div>
      <div class="mv" style="color:${tsCol}">${(tassoSost*100).toFixed(1)}%</div>
      <div class="ms">INPS lorda / RAL finale · ${penState.contYears + yearsToRet} anni di contributi${(penState.contYears + yearsToRet) >= 42 ? ' <span title="Tasso elevato perché assume una carriera lunga e SENZA interruzioni fino a età avanzata (coefficiente alto). Con carriera standard (~38 anni, età di vecchiaia) il tasso scende tipicamente al 60-70% lordo. Interruzioni, part-time o anni non coperti lo riducono.">ⓘ</span>' : ''}</div>
    </div>
    <div class="mcard">
      <div class="ml">Montante INPS al pensionamento</div>
      <div class="mv" style="color:var(--blue)">${fmtP(cumMontante)}</div>
      <div class="ms">${yearsToRet} anni di accumulo</div>
    </div>`;

  // Incidenza tre gambe
  const incEl = document.getElementById('penLegsBox');
  if (incEl) {
    const pI = totMens > 0 ? pensioneNettaMens / totMens * 100 : 0;
    const pF = totMens > 0 ? rendFPMens / totMens * 100 : 0;
    const pE = totMens > 0 ? etfPrelievoMens / totMens * 100 : 0;
    incEl.innerHTML = `
      <div class="sec-label" style="font-size:11px;margin-bottom:10px">⚖️ Da dove arriva il tuo reddito in pensione (${fmtP(totMens)}/mese)</div>
      <div style="display:flex;height:34px;border-radius:8px;overflow:hidden;border:1px solid var(--border2);margin-bottom:10px">
        <div style="width:${pI}%;background:var(--blue);min-width:${pI>0?'2px':'0'}"></div>
        <div style="width:${pF}%;background:var(--purple);min-width:${pF>0?'2px':'0'}"></div>
        <div style="width:${pE}%;background:var(--teal);min-width:${pE>0?'2px':'0'}"></div>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px">
        <span style="color:var(--blue)">● <strong>INPS ${pI.toFixed(0)}%</strong> — ${fmtP(pensioneNettaMens)}/m</span>
        <span style="color:var(--purple)">● <strong>Fondo Pensione ${pF.toFixed(0)}%</strong> — ${fmtP(rendFPMens)}/m</span>
        <span style="color:var(--teal)">● <strong>ETF ${pE.toFixed(0)}%</strong> — ${fmtP(etfPrelievoMens)}/m</span>
      </div>
      <div style="font-size:11.5px;color:var(--text3);margin-top:8px;line-height:1.5">
        Il <strong>fondo pensione integrativo incide per il ${pF.toFixed(0)}%</strong> del tuo reddito in pensione${pF < 1 ? ' (aumenta il versamento mensile per farlo crescere)' : ''}.
        ${pE < 1 ? 'Il piano ETF non è ancora collegato: usa "Importa dal Simulatore" per includerlo.' : 'Il piano ETF copre il ' + pE.toFixed(0) + '% a completamento delle altre due gambe.'}
      </div>`;
  }

  // Alert gap
  const alertEl = document.getElementById('penGapAlert');
  if (gap === 0) {
    alertEl.innerHTML = `<div style="background:#e6f4ea;border:1px solid #81c995;border-radius:var(--radius-sm);padding:12px 16px;font-size:13px;color:#1e8e3e;margin-bottom:4px">
      ✅ <strong>Piano completo:</strong> le tre fonti coprono interamente il fabbisogno desiderato.
    </div>`;
  } else {
    alertEl.innerHTML = `<div style="background:#fce8e6;border:1px solid #f28b82;border-radius:var(--radius-sm);padding:12px 16px;font-size:13px;color:#c5221f;margin-bottom:4px">
      ⚠️ <strong>Gap di ${fmtP(gap)}/mese</strong> (${fmtP(gap*12)}/anno) non coperto al primo anno di pensione.
      Aumenta il versamento mensile al fondo pensione o il PAC ETF, oppure usa <em>"Calcola versamento ottimale"</em>.
    </div>`;
  }
}

// ── Grafico principale copertura ─────────────────────────────
function renderPenChart(r) {
  if (chartPen) { chartPen.destroy(); chartPen = null; }
  const { decData } = r;
  if (!decData.length) return;
  const labels  = decData.map(d => d.age + 'a');
  const gC = 'rgba(0,0,0,.05)', tC = 'rgba(0,0,0,.45)';
  const canvasPen = document.getElementById('chPen');
  // Canvas in tab nascosto (display:none) → offsetParent null → 0×0 → Chart.js errore.
  // Verrà ridisegnato dal setTimeout in switchTab quando il tab diventa visibile.
  if (!canvasPen || canvasPen.offsetParent === null) return;
  chartPen = new Chart(canvasPen, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Pensione INPS netta',   data: decData.map(d => d.pensNettaMens), backgroundColor: 'rgba(26,115,232,0.75)',  stack: 'cover', order: 2 },
        { label: 'Rendita Fondo Pensione',data: decData.map(d => d.rendFPMens),    backgroundColor: 'rgba(147,52,230,0.75)', stack: 'cover', order: 2 },
        { label: 'Prelievo ETF Portfolio',data: decData.map(d => d.etfMens),       backgroundColor: 'rgba(0,150,136,0.75)',  stack: 'cover', order: 2 },
        { label: 'Gap non coperto',       data: decData.map(d => d.gapMens),       backgroundColor: 'rgba(217,48,37,0.35)',  stack: 'cover', order: 2 },
        { label: 'Fabbisogno reale',      data: decData.map(d => d.fabbisognoMens),type: 'line', borderColor: '#d93025', borderWidth: 2, borderDash: [5,4], backgroundColor: 'transparent', pointRadius: 0, fill: false, tension: .3, order: 1 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { font: { family: 'DM Mono', size: 11 }, boxWidth: 16 } },
        tooltip: {
          callbacks: {
            title: c => 'Età ' + c[0].label,
            label: c => ' ' + c.dataset.label + ': ' + fmtP(c.raw) + '/m',
            afterBody: items => { const d = decData[items[0].dataIndex]; return [`Copertura totale: ${d.copertoPct}%`]; }
          },
          backgroundColor: '#fff', borderColor: '#dadce0', borderWidth: 1, titleColor: '#202124', bodyColor: '#5f6368', padding: 10
        }
      },
      scales: {
        x: { stacked: true, ticks: { color: tC, font: { size: 11, family: 'DM Mono' } }, grid: { color: gC } },
        y: { stacked: true, ticks: { color: tC, font: { size: 11, family: 'DM Mono' }, callback: v => fmt(v) + '/m' }, grid: { color: gC } }
      }
    }
  });
}

// ── Dettaglio INPS ───────────────────────────────────────────
function renderPenINPS(r) {
  const { pensioneLordaMens, pensioneNettaMens, irpefAnn, tassoSost, cumMontante, coeffTrasf, pensioneLordaAnn } = r;
  const tsCol = tassoSost >= 0.7 ? 'var(--green)' : tassoSost >= 0.5 ? 'var(--orange)' : 'var(--red)';
  document.getElementById('penINPSDetail').innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <div class="mcard"><div class="ml">Montante al pensionamento</div><div class="mv" style="color:var(--blue)">${fmtP(cumMontante)}</div><div class="ms">Rivalutato PIL nom. (${((penState.pil+penState.infl)*100).toFixed(1)}%/a)</div></div>
      <div class="mcard"><div class="ml">Coeff. trasformazione</div><div class="mv" style="color:var(--blue)">${(coeffTrasf*100).toFixed(3)}%</div><div class="ms">Età ${penState.retAge}${r.coeffTrasfBase && Math.abs(r.coeffTrasfBase-coeffTrasf)>1e-5?` · futuro stimato (2025: ${(r.coeffTrasfBase*100).toFixed(3)}%)`:'· tabella INPS 2025'}</div></div>
      <div class="mcard"><div class="ml">Pensione lorda annua</div><div class="mv" style="color:var(--blue)">${fmtP(pensioneLordaAnn)}</div><div class="ms">${fmtP(pensioneLordaMens)}/mese</div></div>
      <div class="mcard"><div class="ml">IRPEF stimata annua</div><div class="mv" style="color:var(--red)">${fmtP(irpefAnn)}</div><div class="ms">Scaglioni 2025 + detrazione</div></div>
      <div class="mcard"><div class="ml">Pensione netta mensile</div><div class="mv" style="color:var(--blue)">${fmtP(pensioneNettaMens)}</div><div class="ms">× 13 mensilità INPS</div></div>
      <div class="mcard"><div class="ml">Tasso di sostituzione</div><div class="mv" style="color:${tsCol}">${(tassoSost*100).toFixed(1)}%</div><div class="ms">Lorda / RAL finale</div></div>
    </div>
    <div style="background:#e8f0fe;border:1px solid #aecbfa;border-radius:var(--radius-sm);padding:12px 16px;font-size:12px;color:#1a73e8;line-height:1.7">
      <strong>Formula (metodo contributivo):</strong>
      Pensione lorda = Montante (${fmtP(cumMontante)}) × Coefficiente (${(coeffTrasf*100).toFixed(3)}%) = <strong>${fmtP(r.pensioneLordaAnn)}/anno</strong>.<br>
      Montante rivalutato a PIL nom. (PIL reale ${(penState.pil*100).toFixed(1)}% + inflaz. ${(penState.infl*100).toFixed(1)}% = ${((penState.pil+penState.infl)*100).toFixed(1)}%/a).
    </div>`;
}

// ── Dettaglio Fondo Pensione ─────────────────────────────────
function renderPenFP(r) {
  const { capFP, rendFPMens, rendFPNetta, fiscData } = r;
  const { aliqFP, anniAdesione, risparmioFisc, deduzEffettiva, aliqMargIRPEF,
          fpDatoriale, fpLavoratore, fpVersAnnVolont, fpVersAnnDat, plafondResiduo } = fiscData;
  const isNeg = penState.isNegoziale;
  const negRow = isNeg ? `
      <div class="mcard"><div class="ml">Contrib. datoriale</div><div class="mv" style="color:${penState.tfrSi?'var(--green)':'var(--red)'}">${penState.tfrSi ? fmtP(Math.round(fpDatoriale/12)) : '€0'}<span style="font-size:11px;opacity:.6">/m</span></div><div class="ms">${penState.tfrSi ? `${(penState.contDatoriale*100).toFixed(1)}% RAL · ${fmtP(fpDatoriale)}/a` : '⚠️ Richiede il TFR al fondo'}</div></div>
      <div class="mcard"><div class="ml">Contrib. lavoratore negoziale</div><div class="mv" style="color:var(--blue)">${fmtP(Math.round(fpLavoratore/12))}<span style="font-size:11px;opacity:.6">/m</span></div><div class="ms">${(penState.contLavoratore*100).toFixed(1)}% RAL · ${fmtP(fpLavoratore)}/a</div></div>` : '';
  document.getElementById('penFPDetail').innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <div class="mcard"><div class="ml">Capitale accumulato</div><div class="mv" style="color:var(--purple)">${fmtP(capFP)}</div><div class="ms">Vers. ${fmtP(penState.fpVers)}/m + ${penState.tfrSi ? 'TFR' : 'no TFR'}${isNeg?' + contributi negoziali':''}</div></div>
      <div class="mcard"><div class="ml">Rendita netta mensile</div><div class="mv" style="color:var(--purple)">${fmtP(rendFPMens)}</div><div class="ms">Al netto tassazione ${(aliqFP*100).toFixed(0)}%</div></div>
      <div class="mcard"><div class="ml">Tassazione rendimento</div><div class="mv" style="color:var(--orange)">20%</div><div class="ms">Annua sulle plusvalenze (vs 26% ETF)</div></div>
      <div class="mcard"><div class="ml">Tassazione prestazione</div><div class="mv" style="color:${aliqFP<=0.12?'var(--green)':'var(--orange)'}">${(aliqFP*100).toFixed(1)}%</div><div class="ms">${anniAdesione} anni adesione (min 9%)</div></div>
      <div class="mcard"><div class="ml">Deducibilità annua</div><div class="mv" style="color:var(--green)">${fmtP(deduzEffettiva)}</div><div class="ms">${fpVersAnnDat > 0 ? `Plafond €5.300 − ${fmtP(Math.round(fpVersAnnDat))} datoriale = ${fmtP(Math.round(plafondResiduo))} disp.` : 'Limite €5.300/a (2026)'} · applicata ${(aliqMargIRPEF*100).toFixed(0)}%</div></div>
      <div class="mcard"><div class="ml">Risparmio IRPEF annuo</div><div class="mv" style="color:var(--green)">${fmtP(risparmioFisc)}</div><div class="ms">${fmtP(Math.round(risparmioFisc/12))}/mese · aliq. marg. ${(aliqMargIRPEF*100).toFixed(0)}%</div></div>
      <div class="mcard"><div class="ml">TFR al fondo</div><div class="mv" style="color:${penState.tfrSi?'var(--green)':'var(--red)'}">${penState.tfrSi ? '✅ Sì' : '❌ No'}</div><div class="ms">${penState.tfrSi ? fmtP(Math.round(penState.ral/13.5/12))+'/m (RAL÷13,5)' : 'Resta in azienda'}</div></div>
      ${negRow}
    </div>
    <div style="background:#f3e8fd;border:1px solid #d7aefb;border-radius:var(--radius-sm);padding:12px 16px;font-size:12px;color:#6200ea;line-height:1.7">
      <strong>Vantaggi fiscali (D.Lgs. 252/2005):</strong>
      Contributi fino a €5.300 deducibili dall'IRPEF → risparmio immediato di <strong>${fmtP(risparmioFisc)}/anno</strong>.
      Rendimenti tassati al <strong>20% annuo</strong> (vs 26% ETF, ma con tassazione immediata vs tax deferral ETF).
      Prestazione finale tassata al ${(aliqFP*100).toFixed(1)}% (scende dal 15% al 9% con 35+ anni di adesione).
      ${isNeg ? `<br><strong>Fondo negoziale:</strong> il datore contribuisce ${fmtP(fpDatoriale)}/anno (${(penState.contDatoriale*100).toFixed(1)}% RAL) — versamento "gratuito" per il lavoratore che entra solo versando la quota contrattuale (${fmtP(fpLavoratore)}/anno).` : ''}
    </div>`;
}

// ── Sezione Risparmio Fiscale ─────────────────────────────────
function renderPenRispFisc(r) {
  const { fiscData, yearsToRet, capFP, capETFBonus } = r;
  const { risparmioFisc, rispFiscMens, aliqMargIRPEF, deduzEffettiva, rispFiscDest } = fiscData;
  const totRisp = risparmioFisc * yearsToRet; // totale risparmio fiscale cumulato (senza interessi)

  // Simula accumulazione del risparmio fiscale nelle 3 destinazioni
  let capSpeso = totRisp; // speso anno per anno: valore nominale cumulato
  let capReinvFP  = 0;
  let capReinvETF = 0;
  const fpRet = penState.fpRet;
  const etfRet = penState.etfRet;
  for (let y = 0; y < yearsToRet; y++) {
    capReinvFP  = capReinvFP  * (1 + fpRet * 0.80) + risparmioFisc; // FP: 20% tassa sui rendimenti, lungo il percorso
    capReinvETF = capReinvETF * (1 + etfRet)        + risparmioFisc; // ETF: rendimento del portafoglio, tassazione differita
  }
  // ETF netto alla vendita finale
  const costBaseETF  = risparmioFisc * yearsToRet;
  const capReinvETFNetto = capReinvETF - Math.max(0, capReinvETF - costBaseETF) * 0.26;

  const destLabel = { spendi: '🛍️ Speso/consumato', reinvesti_fp: '💼 Reinvestito nel Fondo Pensione', reinvesti_etf: '📈 Reinvestito nel portafoglio ETF' };
  const activeStyle = (d) => rispFiscDest === d ? 'background:var(--blue);color:#fff;border-color:var(--blue)' : '';

  document.getElementById('penRispFiscBox').innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <div class="mcard" style="flex:1;min-width:160px">
        <div class="ml">Risparmio IRPEF annuo</div>
        <div class="mv" style="color:var(--green)">${fmtP(risparmioFisc)}</div>
        <div class="ms">${fmtP(rispFiscMens)}/mese · aliq. ${(aliqMargIRPEF*100).toFixed(0)}% su €${fmtP(deduzEffettiva)}</div>
      </div>
      <div class="mcard" style="flex:1;min-width:160px">
        <div class="ml">Totale IRPEF risparmiata</div>
        <div class="mv" style="color:var(--green)">${fmtP(Math.round(totRisp))}</div>
        <div class="ms">Su ${yearsToRet} anni (nominale)</div>
      </div>
    </div>

    <div class="sec-label" style="margin-bottom:8px">📌 Cosa fai con il risparmio fiscale ogni anno?</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      <button class="gbtn" style="${activeStyle('spendi')}" onclick="penState.rispFiscDest='spendi'; renderPensione()">🛍️ Lo spendo</button>
      <button class="gbtn" style="${activeStyle('reinvesti_fp')}" onclick="penState.rispFiscDest='reinvesti_fp'; renderPensione()">💼 Reinvesto nel FP</button>
      <button class="gbtn" style="${activeStyle('reinvesti_etf')}" onclick="penState.rispFiscDest='reinvesti_etf'; renderPensione()">📈 Reinvesto in ETF</button>
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <div class="mcard" style="flex:1;min-width:140px;${rispFiscDest==='spendi'?'border-color:var(--orange)':''}">
        <div class="ml">🛍️ Se lo spendi</div>
        <div class="mv" style="color:var(--orange)">${fmtP(Math.round(totRisp))}</div>
        <div class="ms">Consumato anno per anno · nessun accumulo</div>
      </div>
      <div class="mcard" style="flex:1;min-width:140px;${rispFiscDest==='reinvesti_fp'?'border-color:var(--purple)':''}">
        <div class="ml">💼 Se reinvesti nel FP</div>
        <div class="mv" style="color:var(--purple)">${fmtP(Math.round(capReinvFP))}</div>
        <div class="ms">Rendimento ${(fpRet*100).toFixed(1)}% − 20%/a plusval. FP · +${fmtP(Math.round(capReinvFP - totRisp))} vs speso</div>
      </div>
      <div class="mcard" style="flex:1;min-width:140px;${rispFiscDest==='reinvesti_etf'?'border-color:var(--teal)':''}">
        <div class="ml">📈 Se reinvesti in ETF</div>
        <div class="mv" style="color:var(--teal)">${fmtP(Math.round(capReinvETFNetto))}</div>
        <div class="ms">Rendimento ${(etfRet*100).toFixed(1)}% (piano simulatore) · tax deferral → 26% solo alla fine · +${fmtP(Math.round(capReinvETFNetto - totRisp))} vs speso</div>
      </div>
    </div>

    <div style="background:#e6f4ea;border:1px solid #81c995;border-radius:var(--radius-sm);padding:12px 16px;font-size:12px;color:#1e8e3e;line-height:1.7">
      <strong>Modalità attiva: ${destLabel[rispFiscDest]}</strong><br>
      ${rispFiscDest === 'spendi'
        ? `Il risparmio IRPEF viene consumato ogni anno. Non si accumula capitale aggiuntivo, ma aumenta il tenore di vita attuale (${fmtP(rispFiscMens)}/mese extra).`
        : rispFiscDest === 'reinvesti_fp'
        ? `Il risparmio IRPEF (${fmtP(risparmioFisc)}/anno) viene versato ogni anno come contributo aggiuntivo al fondo pensione. Beneficia anche lui della deducibilità (fino al limite €5.300). Rendimento netto: ${(fpRet*80).toFixed(1)}%/a (tassazione 20% annua plusvalenze). Capitale aggiuntivo stimato: <strong>${fmtP(Math.round(capReinvFP))}</strong>.`
        : `Il risparmio IRPEF (${fmtP(risparmioFisc)}/anno) viene investito nel portafoglio ETF del simulatore (fuori dal FP) al rendimento netto <strong>${(etfRet*100).toFixed(1)}%/a</strong>. Sfrutta il <em>tax deferral</em>: nessuna tassazione intermedia, solo 26% sulla plusvalenza alla vendita finale. Capitale netto stimato: <strong>${fmtP(Math.round(capReinvETFNetto))}</strong>.`
      }
    </div>`;
}

// ── Confronto fiscale FP vs ETF ───────────────────────────────
function renderPenFiscComp(r) {
  const { capFP, fiscData, yearsToRet } = r;
  const { aliqFP, risparmioFisc, deduzEffettiva, aliqMargIRPEF, tfrAnnuoMedio, fpDatoriale } = fiscData;
  const fpVersAnn   = penState.fpVers * 12;
  const rispAnn     = risparmioFisc;

  // Scenario FP: versamento volontario + TFR + contrib. negoziale + risparmio fiscale reinvestito (se applicabile)
  // Con tassazione 20% ANNUA sui rendimenti (non differita)
  const fpTotAnn    = fpVersAnn + tfrAnnuoMedio + (penState.isNegoziale ? fiscData.fpLavoratore + fpDatoriale : 0);
  const etfEquivAnn = fpTotAnn + rispAnn; // scenario ETF: stesso totale + risparmio IRPEF reinvestito

  let capFPSim = 0, capETFSim = 0;
  const fpYears = [], etfYears = [];
  for (let y = 0; y < yearsToRet; y++) {
    // FP: rendimento netto 20% annuo sulle plusvalenze (tassazione immediata ogni anno)
    capFPSim  = capFPSim  * (1 + penState.fpRet * 0.80) + fpTotAnn;
    // ETF accumulazione: nessuna tassazione intermedia (tax deferral), solo 26% alla fine
    capETFSim = capETFSim * (1 + penState.fpRet)        + etfEquivAnn;
    fpYears.push(Math.round(capFPSim));
    etfYears.push(Math.round(capETFSim));
  }

  // ETF: tassa 26% sulla sola plusvalenza finale (vantaggio del tax deferral)
  const etfCostBase    = etfEquivAnn * yearsToRet;
  const capETFNetto    = capETFSim - Math.max(0, capETFSim - etfCostBase) * 0.26;

  // FP: già tassato annualmente al 20%, la prestazione ha poi aliquota ridotta (9-15%)
  // Il capitale finale FP deve essere ridotto dell'aliquota prestazione per confronto netto
  const capFPNetto     = capFPSim * (1 - aliqFP * (r.fpComposizione?.quotaImponibile ?? 1)); // imponibile normativo (quota esposta dal calcolo: quotaImponibileFP vive in calcPensione, qui siamo in renderPenFiscComp)

  const winner = capFPNetto >= capETFNetto ? 'Fondo Pensione' : 'ETF (acc.)';
  const diff   = Math.abs(capFPNetto - capETFNetto);
  const gC = 'rgba(0,0,0,.05)', tC = 'rgba(0,0,0,.45)';

  // ── Confronto destinazione TFR: in azienda vs conferito al fondo ──────────
  // Il TFR ha due regimi distinti per RIVALUTAZIONE e TASSAZIONE:
  //  • In azienda: rivalutazione di legge (art. 2120 c.c.) = 1,5% fisso + 75%
  //    dell'inflazione; tassazione separata all'aliquota media IRPEF (~23-43%).
  //  • Al fondo: rende come il fondo (fpRet); tassazione agevolata 15%→9%.
  // Calcolato solo se c'è un TFR (tfrAnnuoMedio > 0).
  let tfrCompHtml = '';
  if (tfrAnnuoMedio > 0) {
    const revAzienda = 0.015 + 0.75 * penState.infl;          // rivalutazione legale TFR
    // Aliquota media IRPEF per tassazione separata (proxy: IRPEF media sulla RAL)
    const aliqMediaTFR = Math.min(0.43, Math.max(0.23, calcIRPEF(penState.ral, 'nessuna') / penState.ral)); // tassazione separata TFR: aliquota media SENZA detrazioni
    let capTfrAzienda = 0, capTfrFondo = 0;
    for (let y = 0; y < yearsToRet; y++) {
      capTfrAzienda = capTfrAzienda * (1 + revAzienda)     + tfrAnnuoMedio;
      capTfrFondo   = capTfrFondo   * (1 + penState.fpRet) + tfrAnnuoMedio;
    }
    const tfrAziendaNetto = capTfrAzienda * (1 - aliqMediaTFR);
    const tfrFondoNetto   = capTfrFondo   * (1 - aliqFP);
    const tfrDiff         = tfrFondoNetto - tfrAziendaNetto;
    const tfrWinner       = tfrDiff >= 0 ? 'al Fondo' : 'in Azienda';
    const tfrWinColor     = tfrDiff >= 0 ? 'var(--green)' : 'var(--red)';
    tfrCompHtml = `
    <div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.05em;font-weight:600;margin:4px 0 8px">Destinazione del TFR — Azienda vs Fondo Pensione</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <div class="mcard"><div class="ml">TFR in azienda (netto)</div><div class="mv" style="color:var(--orange)">${fmtP(Math.round(tfrAziendaNetto))}</div><div class="ms">Rival. legale ${(revAzienda*100).toFixed(2)}%/a (1,5% + 75% infl.) · tass. separata ${(aliqMediaTFR*100).toFixed(0)}%</div></div>
      <div class="mcard"><div class="ml">TFR al fondo (netto)</div><div class="mv" style="color:var(--purple)">${fmtP(Math.round(tfrFondoNetto))}</div><div class="ms">Rend. fondo ${(penState.fpRet*100).toFixed(1)}%/a · tass. agevolata ${(aliqFP*100).toFixed(1)}%</div></div>
      <div class="mcard"><div class="ml">Conviene ${tfrWinner}</div><div class="mv" style="color:${tfrWinColor}">${fmtP(Math.abs(Math.round(tfrDiff)))}</div><div class="ms">Differenza netta su ${yearsToRet} anni · TFR ${fmtP(Math.round(tfrAnnuoMedio))}/a</div></div>
    </div>
    <div style="background:#f3e5f5;border:1px solid #e1bee7;border-radius:var(--radius-sm);padding:10px 14px;font-size:11.5px;color:#6a1b9a;margin-bottom:12px;line-height:1.6">
      <strong>📌 Perché il TFR cambia molto:</strong> in azienda si rivaluta solo all'<strong>${(revAzienda*100).toFixed(2)}%/a</strong> (1,5% fisso + 75% inflazione, art. 2120 c.c.) e alla liquidazione sconta la <strong>tassazione separata</strong> all'aliquota media IRPEF (~${(aliqMediaTFR*100).toFixed(0)}%). Conferito al fondo rende come il comparto scelto (${(penState.fpRet*100).toFixed(1)}%/a) e la prestazione è tassata col regime agevolato <strong>${(aliqFP*100).toFixed(1)}%</strong> (dal 15% al 9% in base agli anni di adesione). La differenza nasce dal doppio effetto rivalutazione + fiscalità.
    </div>`;
  }

  document.getElementById('penFiscComp').innerHTML = `
    ${tfrCompHtml}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <div class="mcard"><div class="ml">Capitale FP netto a ${penState.retAge}a</div><div class="mv" style="color:var(--purple)">${fmtP(capFPNetto)}</div><div class="ms">Lordo ${fmtP(capFPSim)} · tass. 20%/a rendim. + ${(aliqFP*100).toFixed(0)}% prestaz.</div></div>
      <div class="mcard"><div class="ml">Capitale ETF equiv. netto</div><div class="mv" style="color:var(--teal)">${fmtP(capETFNetto)}</div><div class="ms">Tax deferral + 26% plusval. finale · vers. + IRPEF reinvestita</div></div>
      <div class="mcard"><div class="ml">Vantaggio ${winner}</div><div class="mv" style="color:var(--green)">${fmtP(diff)}</div><div class="ms">Su ${yearsToRet} anni · entrambi al netto imposte</div></div>
    </div>
    <div style="background:#fff3e0;border:1px solid #ffe082;border-radius:var(--radius-sm);padding:10px 14px;font-size:11.5px;color:#e65100;margin-bottom:12px;line-height:1.6">
      <strong>📌 Nota tassazione:</strong> Il fondo pensione tassa i rendimenti al <strong>20% ogni anno</strong> (vs 26% ETF ma con tax deferral).
      L'ETF ad accumulazione rinvia tutta la tassazione alla vendita finale: il capitale "lavora" intero per anni, con effetto compounding più potente.
      Il FP recupera parte del vantaggio grazie alla deducibilità dei contributi e all'aliquota ridotta sulla prestazione finale (${(aliqFP*100).toFixed(0)}%).
    </div>`;

  if (chartPenFisc) { chartPenFisc.destroy(); chartPenFisc = null; }
  const labels = Array.from({ length: yearsToRet }, (_, i) => penState.age + i + 1 + 'a');
  const canvasFisc = document.getElementById('chPenFisc');
  // Canvas dentro <details> chiuso ha offsetParent===null → dimensioni 0×0 → Chart.js errore.
  // Saltiamo: verrà creato al toggle del details (listener sotto).
  if (canvasFisc && canvasFisc.offsetParent !== null) {
  chartPenFisc = new Chart(canvasFisc, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Fondo Pensione (rend. 20%/a)', data: fpYears, borderColor: '#9334e6', borderWidth: 2.5, backgroundColor: 'rgba(147,52,230,.08)', fill: true, pointRadius: 0, tension: .35 },
        { label: 'ETF equiv. (tax deferral, stesso vers.+IRPEF)', data: etfYears, borderColor: '#00897b', borderWidth: 2, borderDash: [5, 4], backgroundColor: 'transparent', fill: false, pointRadius: 0, tension: .35 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { font: { family: 'DM Mono', size: 11 }, boxWidth: 16 } },
        tooltip: { callbacks: { title: c => 'Età ' + c[0].label, label: c => ' ' + c.dataset.label + ': ' + fmtP(c.raw) }, backgroundColor: '#fff', borderColor: '#dadce0', borderWidth: 1, titleColor: '#202124', bodyColor: '#5f6368', padding: 10 }
      },
      scales: {
        x: { ticks: { color: tC, font: { size: 11, family: 'DM Mono' }, maxTicksLimit: 14 }, grid: { color: gC } },
        y: { ticks: { color: tC, font: { size: 11, family: 'DM Mono' }, callback: v => fmt(v) }, grid: { color: gC } }
      }
    }
  });
  } // fine guard canvas visibile
}

// ── Tabella accumulo ─────────────────────────────────────────
function renderPenAccTable(r) {
  const { accData } = r;
  const isNeg = penState.isNegoziale;
  const stp = Math.max(1, Math.floor(accData.length / 12));
  const header = `<thead><tr style="background:var(--bg2)">
    <th>Età</th><th>Anno</th><th>RAL</th><th>Contrib. INPS</th><th>Montante INPS</th><th>Cap. FP</th><th>Vers. FP</th>
    ${isNeg ? '<th>Di cui datoriale</th>' : ''}
    <th>Risp. IRPEF</th>
  </tr></thead>`;
  const rows = accData
    .filter((_, i) => i % stp === 0 || i === accData.length - 1)
    .map(d => `<tr>
      <td><strong>${d.age}</strong></td>
      <td>+${d.year}a</td>
      <td style="color:var(--text2)">${fmtP(d.ral)}</td>
      <td style="color:var(--blue)">${fmtP(d.contrib)}</td>
      <td style="font-weight:600;color:var(--blue)">${fmtP(d.montanteINPS)}</td>
      <td style="font-weight:600;color:var(--purple)">${fmtP(d.capFP)}</td>
      <td style="color:var(--text3)">${fmtP(d.fpVersAnn)}</td>
      ${isNeg ? `<td style="color:var(--green)">${fmtP(d.fpDatAnn)}</td>` : ''}
      <td style="color:var(--green)">${fmtP(d.rispFiscAnn)}</td>
    </tr>`).join('');
  document.getElementById('penAccTable').innerHTML = `<table class="data-table" style="width:100%;border-collapse:collapse">${header}<tbody>${rows}</tbody></table>`;
}

// ── Tabella decumulo ─────────────────────────────────────────
function renderPenDecTable(r) {
  const { decData } = r;
  const stp = Math.max(1, Math.floor(decData.length / 12));
  const header = `<thead><tr style="background:var(--bg2)">
    <th>Età</th><th>Anno pensione</th><th>Fabbisogno/m</th><th>INPS netta/m</th><th>Rendita FP/m</th><th>Prelievo ETF/m</th><th>Copertura</th>
  </tr></thead>`;
  const rows = decData
    .filter((_, i) => i % stp === 0 || i === decData.length - 1)
    .map(d => `<tr>
      <td><strong>${d.age}</strong></td>
      <td>+${d.year}a pens.</td>
      <td style="color:var(--text2)">${fmtP(d.fabbisognoMens)}/m</td>
      <td style="color:var(--blue);font-weight:600">${fmtP(d.pensNettaMens)}/m</td>
      <td style="color:var(--purple)">${fmtP(d.rendFPMens)}/m</td>
      <td style="color:var(--teal)">${fmtP(d.etfMens)}/m</td>
      <td class="${d.gapMens===0?'pos':'neg'}">${d.gapMens===0?'✅ Coperto':'−'+fmtP(d.gapMens)+'/m'}</td>
    </tr>`).join('');
  document.getElementById('penDecTable').innerHTML = `<table class="data-table" style="width:100%;border-collapse:collapse">${header}<tbody>${rows}</tbody></table>`;
}

// ── Event listeners + Init (lazy, al primo render del tab) ───
// Gli elementi esistono solo quando il tab è nel DOM — registriamo
// tutto su DOMContentLoaded così il parse avviene dopo l'HTML completo.
document.addEventListener('DOMContentLoaded', () => {
  const regime  = document.getElementById('penRegimeBtns');
  const tfr     = document.getElementById('penTFRBtns');
  const negoz   = document.getElementById('penNegozialeBtns');
  const regDesc = document.getElementById('penRegimeDesc');

  if (regime) regime.onclick = e => {
    const b = e.target.closest('[data-reg]'); if (!b) return;
    penState.regime = b.dataset.reg;
    regime.querySelectorAll('.gbtn').forEach(x => x.classList.remove('a-blue'));
    b.classList.add('a-blue');
    if (regDesc) regDesc.innerHTML = PEN_REGIME_DESC[b.dataset.reg] || '';
    renderPensione();
  };

  if (tfr) tfr.onclick = e => {
    const b = e.target.closest('[data-tfr]'); if (!b) return;
    penState.tfrSi = b.dataset.tfr === 'si';
    tfr.querySelectorAll('.gbtn').forEach(x => x.classList.remove('a-blue'));
    b.classList.add('a-blue');
    // Vincolo normativo: il fondo NEGOZIALE (di categoria) è il veicolo del conferimento
    // collettivo del TFR e del contributo datoriale. Se il TFR resta in azienda, l'adesione
    // sensata è a un fondo APERTO con solo versamento volontario → disattiviamo il negoziale.
    if (!penState.tfrSi && penState.isNegoziale) {
      penState.isNegoziale = false;
      if (negoz) {
        negoz.querySelectorAll('.gbtn').forEach(x => x.classList.remove('a-blue'));
        const bNo = negoz.querySelector('[data-neg="no"]');
        if (bNo) bNo.classList.add('a-blue');
      }
    }
    renderPensione();
  };

  if (negoz) negoz.onclick = e => {
    const b = e.target.closest('[data-neg]'); if (!b) return;
    penState.isNegoziale = b.dataset.neg === 'si';
    negoz.querySelectorAll('.gbtn').forEach(x => x.classList.remove('a-blue'));
    b.classList.add('a-blue');
    // Il fondo negoziale implica il conferimento del TFR al fondo: se l'utente attiva
    // il negoziale, forziamo coerentemente il TFR al fondo (e aggiorniamo i bottoni TFR).
    if (penState.isNegoziale && !penState.tfrSi) {
      penState.tfrSi = true;
      if (tfr) {
        tfr.querySelectorAll('.gbtn').forEach(x => x.classList.remove('a-blue'));
        const bSi = tfr.querySelector('[data-tfr="si"]');
        if (bSi) bSi.classList.add('a-blue');
      }
    }
    renderPensione();
  };

  // Descrizione regime iniziale (testo statico, nessun calcolo)
  if (regDesc) regDesc.innerHTML = PEN_REGIME_DESC['contributivo'];

  // Quando l'utente apre il <details> del confronto fiscale, chPenFisc diventa
  // visibile: se il chart non era stato creato (canvas era nascosto), lo creiamo ora.
  // FIX 2026-07-04: il canvas del confronto vive dentro DUE <details> annidati
  // (interno "Confronto Fiscale" + esterno "Confronto Strumenti"). Il chart si può
  // disegnare solo quando il canvas ha dimensioni reali, cioè quando ENTRAMBI sono
  // aperti. Prima il listener era su un solo details -> aprendo l'esterno il canvas
  // restava 0x0 (details interno chiuso) e il grafico non compariva. Ora: (1) il
  // details interno parte aperto (open in index.html), (2) agganciamo il toggle a
  // ogni details antenato e (3) tentiamo il redraw con un rAF, quando il layout è
  // applicato. Il testo (penFiscComp) è già scritto da renderPensione: qui garantiamo
  // solo che il grafico appaia appena il canvas diventa visibile.
  const chPenFiscEl = document.getElementById('chPenFisc');
  if (chPenFiscEl) {
    const tryDrawFisc = () => {
      if (chPenFiscEl.offsetParent !== null && window.lastPenResult) {
        try { renderPenFiscComp(window.lastPenResult.r); } catch(e) { console.error('FiscComp draw:', e); }
      }
    };
    let node = chPenFiscEl.closest('details');
    while (node) {
      node.addEventListener('toggle', () => { requestAnimationFrame(tryDrawFisc); });
      node = node.parentElement ? node.parentElement.closest('details') : null;
    }
  }

  // Resize listener per ridisegnare i grafici al cambio dimensione finestra
  window.addEventListener('resize', () => {
    if (chartPen)     { try { chartPen.resize(); }     catch(e) {} }
    if (chartPenFisc) { try { chartPenFisc.resize(); } catch(e) {} }
  });
});
