// ══════════════════════════════════════════════════════════════════════════════
// tier-system.js — Suite Patrimoniale Pro v3
// Gestione tier Base/Pro + Info Helper (ℹ) popovers
// ══════════════════════════════════════════════════════════════════════════════

// ─── CONFIGURAZIONE TIER ─────────────────────────────────────────────────────
const TIER_BASE_TABS = new Set([
  'main', 'scenarios', 'ab', 'mc', 'decumulo', 'backtest',
]);
const TIER_PRO_TABS = new Set([
  'advmc', 'fiscale', 'pensione', 'valuation', 'goal', 'quant',
]);

const PRO_TAB_LABELS = {
  advmc:     { icon: '🧮', name: 'MC Avanzato',        desc: 'Monte Carlo con modelli GARCH, t-Student e Regime-Switching per code di rischio più realistiche e distribuzioni fat-tail.' },
  fiscale:   { icon: '🏛️',  name: 'Fiscalità IT',       desc: 'Analisi completa della tassazione italiana: capital gain, switch di portafoglio, confronto regimi e proiezione netta fiscale.' },
  pensione:  { icon: '👴', name: 'Piano Pensione',      desc: 'Simulazione integrata pensione pubblica + privata con fase di accumulo e decumulo previdenziale personalizzato.' },
  valuation: { icon: '⚠️',  name: 'Stress Valutazioni', desc: 'Analisi CAPE/Bogle, stress test macro e scenario di mean-reversion per valutare la sopravvalutazione di mercato.' },
  goal:      { icon: '🏆', name: 'Obiettivo Inverso',  desc: 'Dato un obiettivo patrimoniale, calcola PAC necessario, orizzonte minimo e sensitività ai parametri.' },
  quant:     { icon: '📐', name: 'Quant Analytics',    desc: 'Ottimizzazione Markowitz, VaR/CVaR multi-metodo, Factor Decomposition Fama-French e analisi rolling.' },
};

// ─── INFO HELPER TEXTS ────────────────────────────────────────────────────────
// data-info-id nell'HTML → testo del popover, senza toccare la logica
const INFO_TEXTS = {
  // Tab Simulatore
  'info-params-base': {
    title: 'Parametri Base',
    text: 'Definiscono il punto di partenza della simulazione. Patrimonio, PAC e orizzonte sono ereditati automaticamente da tutti gli altri tab — modificarli qui aggiorna tutto il piano in tempo reale.',
  },
  'info-portafoglio': {
    title: 'Composizione Portafoglio',
    text: 'Alloca tra Azioni, Obbligazioni, Oro e Liquidità. Il peso deve sommare al 100%. Ogni asset usa un rendimento atteso calibrato su dati storici 1970-2024 con rettifica forward-looking conservativa.',
  },
  'info-optionality': {
    title: 'Soglia di Optionality',
    text: 'Livello patrimoniale a cui il portafoglio ti dà opzioni di vita reali — part-time, sabbatico, cambio carriera — prima del FIRE. Il grafico mostra una linea tratteggiata per visualizzare quando ogni scenario la raggiunge.',
  },
  'info-versamenti-extra': {
    title: 'Versamenti Extra',
    text: 'Aggiungi flussi una tantum in anni specifici: eredità, bonus, liquidazione, vendita immobile. Vengono integrati nel calcolo compound e annotati nella tabella e nel report PDF.',
  },
  'info-pac-dinamico': {
    title: 'PAC Dinamico',
    text: 'Definisci variazioni pianificate del versamento mensile in anni futuri. Utile per simulare aumenti di reddito, periodi di riduzione spese o stop temporanei al risparmio.',
  },
  'info-proiezione-annuale': {
    title: 'Proiezione Annuale',
    text: 'Tabella anno per anno con valore lordo, plusvalenza maturata, tassa stimata, valore netto e CAGR progressivo. Tre scenari: base, ottimistico (+1σ) e pessimistico (−1σ).',
  },
  'info-scenari-salvati': {
    title: 'Scenari Salvati',
    text: 'Salva e ricarica configurazioni complete con nome personalizzato. I dati sono conservati nel tuo browser (localStorage) — nessun dato viene inviato a server esterni.',
  },
  // Tab Scenari Economici
  'info-scenari-eco': {
    title: 'Scenari Economici',
    text: 'Confronta 6 regimi macro (crescita normale, recessione, stagflazione, ecc.). Ogni regime applica moltiplicatori sui rendimenti per asset class e usa una distribuzione stocastica di inflazione specifica. Il valore reale deflatato è la metrica che conta.',
  },
  // Tab A/B
  'info-ab': {
    title: 'Confronto A/B',
    text: 'Confronta due portafogli con i tuoi stessi parametri base ma composizioni diverse. Il grafico sovrappone le traiettorie best/normal/worst e la tabella mostra il delta anno per anno.',
  },
  // Tab Prob. Successo
  'info-mc-prob': {
    title: 'Probabilità di Successo (Monte Carlo)',
    text: 'Esegue migliaia di simulazioni con rendimenti casuali estratti dalla distribuzione storica. Mostra P10, P25, P50, P75, P90 come percentili del patrimonio finale — il P50 è la mediana, non il caso migliore.',
  },
  // Tab Decumulo
  'info-decumulo': {
    title: 'Fase di Decumulo',
    text: 'Simula la fase di prelievo dal patrimonio: tasso di prelievo annuo, durata, aliquota fiscale sui prelievi. Calcola la probabilità che il patrimonio sopravviva per l\'intero orizzonte di decumulo.',
  },
  'info-decumulo-overlay': {
    title: 'Overlay Scenario Macro',
    text: 'Sovrapponi un regime macroeconomico per testare la resilienza del decumulo a condizioni avverse (recessione, stagflazione). Le righe viola in tabella indicano gli anni del regime attivo.',
  },
  // Tab Backtesting
  'info-backtest': {
    title: 'Backtesting Storico',
    text: 'Applica il tuo portafoglio ai dati storici reali 1970-2024. Mostra CAGR realizzato, Max Drawdown e valore finale per ogni periodo storico — utile per capire come il portafoglio si sarebbe comportato in crisi reali come 2008 o 2000-02.',
  },
  'info-backtest-multi': {
    title: 'Confronta Tutti i Periodi',
    text: 'Confronta contemporaneamente tutti i periodi storici in una tabella ordinata per CAGR con un grafico normalizzato (base 100). Permette di vedere in un colpo d\'occhio quale contesto storico sarebbe stato più sfidante per il tuo portafoglio.',
  },
  // Tab MC Avanzato (Pro)
  'info-advmc': {
    title: 'Monte Carlo Avanzato',
    text: 'Modelli avanzati: GARCH (volatilità stochasticamente variabile), t-Student (code fat-tail più realistiche) e Regime-Switching (mercato alterna tra fasi bull/bear/crash). Produce percentili con code più pesanti rispetto al MC base.',
  },
  // Tab Fiscalità (Pro)
  'info-fiscale-regimi': {
    title: 'Confronto Regimi Fiscali',
    text: 'Confronta i regimi: Risparmio Amministrato, Risparmio Gestito e Dichiarativo. La tabella mostra quale produce il netto maggiore dato il tuo orizzonte e portafoglio, incluso l\'effetto dello zainetto fiscale.',
  },
  'info-fiscale-switch': {
    title: 'Switch di Portafoglio',
    text: 'Calcola l\'impatto fiscale di ribilanciamenti: plusvalenze realizzate, minusvalenze compensabili e imposta dovuta. Utile per pianificare switch tra ETF in modo fiscalmente efficiente.',
  },
  // Tab Pensione (Pro)
  'info-pensione-acc': {
    title: 'Fase di Accumulo Previdenziale',
    text: 'Simula il versamento in un fondo pensione integrativo: deduzione fiscale in fase di accumulo (entro soglia IRPEF), crescita con rendimento del comparto scelto e confronto con alternativa ETF equivalente.',
  },
  'info-pensione-dec': {
    title: 'Fase di Decumulo Previdenziale',
    text: 'Simula la conversione del montante in rendita o riscatto: tassazione agevolata (15%-9% in base agli anni di adesione), confronto rendita vs capitale, e impatto dell\'aliquota IRPEF in pensione.',
  },
  // Tab Valutazione (Pro)
  'info-valuation-cape': {
    title: 'CAPE & Stress Test di Valutazione',
    text: 'Analisi CAPE (Cyclically Adjusted P/E) di Shiller: percentile storico, rendimento implicito a 10 anni per mean-reversion e confronto con attese forward-looking. Alto CAPE suggerisce rendimenti futuri attesi inferiori alla media.',
  },
  // Tab Obiettivo Inverso (Pro)
  'info-goal': {
    title: 'Pianificazione per Obiettivo',
    text: 'Risponde alla domanda inversa: dato un obiettivo patrimoniale target, calcola il PAC necessario per raggiungerlo in ogni scenario (base, pessimistico, ottimistico). Include sensitività al tasso di rendimento e all\'orizzonte.',
  },
  // Tab Quant (Pro)
  'info-quant-markowitz': {
    title: 'Ottimizzazione di Portafoglio (Markowitz)',
    text: 'Calcola la frontiera efficiente: massimizza il rendimento atteso per ogni livello di rischio (volatilità). Mostra il portafoglio a massimo Sharpe ratio e il portafoglio a minima varianza. Usare come guida qualitativa — l\'instabilità di Markowitz è elevata con piccole variazioni negli input.',
  },
  'info-quant-var': {
    title: 'VaR e CVaR',
    text: 'Value-at-Risk e Conditional VaR (Expected Shortfall) a tre livelli di confidenza: 95%, 99%, 99.9%. Il CVaR misura la perdita attesa oltre il VaR — preferito dai regolatori (Basilea III, Solvency II) per la sua coerenza secondo Artzner et al. (1999).',
  },
  'info-quant-factor': {
    title: 'Factor Decomposition',
    text: 'Scompone il portafoglio in fattori Fama-French (Market, Size, Value, Profitability, Investment) più Momentum. Mostra il contributo percentuale di ogni fattore al rendimento atteso e la barra di decomposizione visuale.',
  },
  'info-quant-rolling': {
    title: 'Analisi Rolling',
    text: 'Calcola rendimento, volatilità, Sharpe e Max Drawdown su finestre mobili di durata configurabile. Permette di vedere come le metriche del portafoglio cambiano nel tempo, non solo come media storica.',
  },

  // ── Tab Simulatore (sezioni aggiuntive) ──
  'info-uscite-straordinarie': {
    title: 'Uscite Straordinarie',
    text: 'Pianifica prelievi una tantum in anni specifici: acquisto casa, auto, spese familiari. Vengono sottratti dal patrimonio nell\'anno indicato e propagati su tutti gli scenari e i tab collegati.',
  },
  'info-liquidazione': {
    title: 'Liquidazione Fiscale Finale',
    text: 'Simula la vendita totale del portafoglio a fine orizzonte: plusvalenza maturata, imposta dovuta (aliquota ponderata sul mix di asset) e netto incassabile. È il valore realmente spendibile, non quello lordo a schermo.',
  },
  'info-swr': {
    title: 'Rendita Sostenibile (SWR)',
    text: 'Safe Withdrawal Rate: stima la rendita annua e mensile prelevabile dal patrimonio finale senza intaccarlo eccessivamente. Il classico riferimento è il 4% (regola di Bengen), qui mostrato a più livelli di prudenza.',
  },
  'info-inflazione': {
    title: 'Modulo Inflazione Avanzato',
    text: 'Converte i valori nominali in potere d\'acquisto reale usando la correlazione storica tra asset e inflazione: le azioni tendono a batterla nel lungo periodo, i bond nominali ne soffrono, l\'oro la traccia. L\'inflazione è generata come distribuzione stocastica, non come numero fisso.',
  },
  'info-capitale-plusvalenza': {
    title: 'Capitale Versato vs Plusvalenza',
    text: 'La barra scompone il patrimonio finale tra capitale effettivamente versato (PAC + iniziale + PIC) e plusvalenza generata dal compounding. Più lungo l\'orizzonte, maggiore la quota di crescita rispetto ai versamenti.',
  },
  'info-sequenza': {
    title: 'Rischio di Sequenza & Rimbalzo',
    text: 'Inserisce un crash di entità e durata configurabili in un anno specifico del piano, con eventuale rimbalzo. Lo stesso crash a inizio piano (con poco capitale) o a fine piano (con molto capitale) ha effetti molto diversi: è il rischio di sequenza.',
  },
  'info-mc-fan': {
    title: 'Fan Chart Monte Carlo',
    text: 'Mostra 1.000 traiettorie simulate come bande di percentili (P10–P90): la fascia scura centrale è l\'intervallo più probabile, le code chiare gli esiti estremi. La dispersione cresce con l\'orizzonte — è l\'incertezza, non un errore.',
  },

  // ── Tab Scenari Economici (sezioni aggiuntive) ──
  'info-eco-confronto': {
    title: 'Confronto Tutti gli Scenari',
    text: 'Tabella riassuntiva con valore nominale, valore reale deflatato e differenza vs scenario base per ogni regime macro. Confronta sempre i valori reali: un nominale alto con inflazione alta può valere meno.',
  },
  'info-multi-regime': {
    title: 'Multi-Regime Stocastico',
    text: 'Simula 1.000 percorsi in cui i regimi economici si alternano lungo il piano secondo probabilità di transizione storiche (o una sequenza manuale). Più realistico del singolo regime fisso: in 20-35 anni si attraversano più cicli.',
  },

  // ── Tab A/B (sezioni aggiuntive) ──
  'info-ab-metriche': {
    title: 'Metriche a Confronto',
    text: 'Valore finale, CAGR, plusvalenza e drawdown atteso per le due strategie, con evidenza del delta. Piccole differenze di rendimento atteso si amplificano molto sul lungo periodo per effetto del compounding.',
  },
  'info-ab-fiscale': {
    title: 'Fiscalità Comparata A/B',
    text: 'Confronta l\'impatto fiscale delle due composizioni: l\'aliquota effettiva dipende dal mix (26% azioni/oro, 12,5% governativi). Un portafoglio più obbligazionario governativo paga meno tasse a parità di plusvalenza.',
  },

  // ── Tab Decumulo (sezioni aggiuntive) ──
  'info-decumulo-storico': {
    title: 'Decumulo su Sequenze Storiche',
    text: 'Testa il piano di prelievo su tutte le finestre storiche reali 1970-2024: chi è andato in pensione nel 1973 o nel 2000 ha vissuto sequenze molto peggiori della media. Mostra in quanti casi storici il capitale sarebbe sopravvissuto.',
  },

  // ── Tab MC Avanzato (sezioni aggiuntive) ──
  'info-advmc-dist': {
    title: 'Distribuzione dei Risultati',
    text: 'Percentili del capitale finale (P5–P95), probabilità di perdita e di raggiungimento dell\'obiettivo. Con modelli fat-tail i percentili bassi sono più severi del Monte Carlo gaussiano: è il prezzo del realismo.',
  },
  'info-advmc-histo': {
    title: 'Istogramma dei Capitali Finali',
    text: 'La forma della distribuzione finale: asimmetria positiva (coda lunga a destra) è tipica del compounding; code sinistre spesse segnalano rischio di esiti molto deludenti. Confronta la forma tra i modelli per capire le differenze.',
  },
  'info-advmc-confronto': {
    title: 'Confronto tra Modelli',
    text: 'Stesso portafoglio, quattro motori statistici: Gaussiano (riferimento), t-Student (code grasse), GARCH (volatilità che si aggrega in cluster) e Regime-Switching (bull/bear/crash). Le differenze nei percentili bassi mostrano quanto il modello gaussiano sottostimi il rischio.',
  },
  'info-advmc-garch': {
    title: 'GARCH — Volatilità Dinamica',
    text: 'Nel modello GARCH la volatilità non è costante: dopo uno shock resta elevata per mesi (volatility clustering), come nei mercati reali. Il grafico mostra come la volatilità simulata evolve e si raggruppa nel tempo.',
  },
  'info-advmc-regime': {
    title: 'Regime-Switching',
    text: 'Il mercato alterna fasi bull, bear e crash con probabilità di transizione calibrate sui dati storici. Il grafico mostra quanto tempo le simulazioni passano in ciascun regime: la persistenza dei bear market è ciò che danneggia di più i piani.',
  },

  // ── Tab Backtesting (sezioni aggiuntive) ──
  'info-backtest-risultati': {
    title: 'Risultati del Backtest',
    text: 'Metriche realizzate sul periodo storico selezionato: valore finale, CAGR effettivo, Max Drawdown e anni di recupero. Il passato non si ripete uguale, ma mostra l\'ordine di grandezza degli shock che un portafoglio simile ha già attraversato.',
  },
  'info-backtest-drawdown': {
    title: 'Drawdown & Correlazioni Dinamiche',
    text: 'Il grafico underwater mostra la distanza dal massimo precedente nel tempo. Le correlazioni tra asset non sono stabili: nelle crisi tendono ad aumentare, riducendo proprio quando serve il beneficio della diversificazione.',
  },

  // ── Tab Fiscalità (sezioni aggiuntive) ──
  'info-fiscale-lotti': {
    title: 'Lotti e Base di Costo',
    text: 'Ogni versamento PAC crea un "lotto" con il proprio prezzo di carico. La base di costo media determina la plusvalenza tassabile in caso di vendita: lotti vecchi hanno tipicamente più plusvalenza latente di quelli recenti.',
  },
  'info-fiscale-bollo': {
    title: 'Imposta di Bollo',
    text: 'Lo 0,20% annuo sul controvalore degli strumenti finanziari si applica all\'intero patrimonio, non solo ai guadagni. Su orizzonti lunghi l\'erosione cumulata è significativa — la tabella la quantifica anno per anno.',
  },
  'info-fiscale-zainetto': {
    title: 'Zainetto Fiscale',
    text: 'Le minusvalenze realizzate sono compensabili con plusvalenze future entro 4 anni, ma solo da "redditi diversi" (non dai capital gain degli ETF armonizzati in regime amministrato). La sezione mostra quanto zainetto si genera e quanto è realmente utilizzabile.',
  },

  // ── Tab Pensione (sezioni aggiuntive) ──
  'info-pensione-copertura': {
    title: 'Copertura al Pensionamento',
    text: 'Sintesi delle tre gambe previdenziali: pensione INPS, rendita/capitale da fondo pensione e decumulo ETF. Il tasso di sostituzione indica quanta parte dell\'ultimo reddito viene coperta — sotto il 70-80% spesso serve integrare.',
  },
  'info-pensione-inps': {
    title: 'Pensione INPS',
    text: 'Stima contributiva basata su montante, coefficienti di trasformazione per età e rivalutazione al PIL. È una proiezione semplificata a normativa vigente: riforme future e carriere discontinue possono modificarla sensibilmente.',
  },
  'info-pensione-fondo': {
    title: 'Fondo Pensione',
    text: 'Montante accumulato con contributi dedotti (fino a 5.164,57 €/anno), rendimento del comparto e tassazione agevolata finale (15% che scende fino al 9% dopo 35 anni di adesione). Include l\'eventuale TFR conferito.',
  },
  'info-pensione-confronto': {
    title: 'Fondo Pensione vs ETF',
    text: 'Confronto a parità di flussi: il fondo gode di deduzione e tassazione agevolata ma ha costi più alti e vincoli di accesso; l\'ETF è flessibile ma tassato al 26%. Il vantaggio fiscale del fondo cresce con aliquota IRPEF e anni di adesione.',
  },

  // ── Tab Valutazione (sezioni aggiuntive) ──
  'info-valuation-parametri': {
    title: 'Parametri dello Scenario',
    text: 'Imposta CAPE attuale, CAPE di equilibrio verso cui assumere la mean-reversion e orizzonte di convergenza. Più il CAPE attuale supera quello di equilibrio, maggiore il drag stimato sui rendimenti azionari futuri.',
  },
  'info-valuation-live': {
    title: 'Dati di Mercato Live',
    text: 'CAPE Shiller e metriche di valutazione aggiornate da fonti pubbliche, con percentile storico. Usali per ancorare lo scenario a dati correnti invece che a valori ipotetici — il pulsante li importa nei parametri.',
  },
  'info-valuation-impatto': {
    title: 'Impatto sul Rendimento',
    text: 'Traduce la mean-reversion del CAPE in punti percentuali di rendimento annuo in meno (o in più) sull\'orizzonte scelto, e mostra l\'effetto sul piano: stesso PAC, capitale finale diverso. Utile come stress test, non come previsione.',
  },

  // ── Tab Obiettivo (sezioni aggiuntive) ──
  'info-goal-modalita': {
    title: 'Modalità di Calcolo',
    text: 'Tre domande inverse: quanto PAC serve per l\'obiettivo (dati orizzonte e rendimento), quanti anni servono (dato il PAC), o quanto capitale è raggiungibile (dati PAC e orizzonte). Ogni modalità risolve per una variabile diversa.',
  },

  // ── Tab Quant (sezioni aggiuntive) ──
  'info-quant-optimizer': {
    title: 'Portfolio Optimizer',
    text: 'Ottimizzazione vincolata: scegli asset, limiti min/max per ciascuno, vincoli di categoria e funzione obiettivo (Max Sharpe, Min Varianza, Risk Parity, Max Rendimento). I vincoli rendono i risultati più stabili e implementabili del Markowitz puro.',
  },

  // ── Stress Test Macro (sezione dinamica) ──
  'info-crisis-stress': {
    title: 'Stress Test su Crisi Storiche',
    text: 'Applica al portafoglio il percorso mensile delle grandi crisi (1973, 1987, 2000, 2008, 2020…): totali annui e mesi-crisi chiave ancorati ai valori storici reali, distribuzione degli altri mesi ricostruita. Mostra drawdown massimo, durata e tempo di recupero stimati.',
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// TIER STATE
// ══════════════════════════════════════════════════════════════════════════════
(function initTierSystem() {

  // Leggi/scrivi tier da localStorage
  function getTier() {
    return localStorage.getItem('suitePatrimoniale_tier') || null; // null = non ancora scelto
  }
  function setTier(tier) {
    localStorage.setItem('suitePatrimoniale_tier', tier);
    window.suiteMode = tier;
    applyTier(tier);
  }
  window.getTier = getTier;
  window.setTier = setTier;
  window.applyTier = applyTier;

  // ── Applica il tier all'UI ──────────────────────────────────────────────────
  function applyTier(tier) {
    const isPro = (tier === 'pro');

    // 1. Badge nell'header
    const badge = document.querySelector('.badge');
    if (badge) {
      if (isPro) {
        badge.textContent = 'PRO SUITE';
        badge.style.color = 'var(--blue)';
        badge.style.borderColor = 'rgba(26,115,232,.3)';
        badge.style.background = 'var(--blue-dim)';
      } else {
        badge.textContent = 'BASE';
        badge.style.color = 'var(--teal)';
        badge.style.borderColor = 'rgba(0,137,123,.3)';
        badge.style.background = 'var(--teal-dim)';
      }
    }

    // 2. Pulsante toggle nel nav
    updateTierToggleBtn(tier);

    // 3. Applica lock ai tab Pro in modalità Base
    TIER_PRO_TABS.forEach(tabId => {
      const btn = document.querySelector(`[data-tab="${tabId}"]`);
      if (!btn) return;
      if (isPro) {
        btn.classList.remove('tab-btn-locked');
        btn.onclick = () => window.switchTab(tabId);
        // Rimuovi overlay se presente
        const panel = document.getElementById(`tab-${tabId}`);
        if (panel) {
          const overlay = panel.querySelector('.pro-lock-overlay');
          if (overlay) overlay.remove();
          panel.style.position = '';
        }
      } else {
        btn.classList.add('tab-btn-locked');
        btn.onclick = (e) => {
          e.preventDefault();
          // Porta comunque al tab con overlay
          _switchTabRaw(tabId);
          ensureProOverlay(tabId);
        };
        // Inietta overlay nel pannello se non c'è già
        const panel = document.getElementById(`tab-${tabId}`);
        if (panel) {
          panel.style.position = 'relative';
          ensureProOverlay(tabId);
        }
      }
    });
  }

  // Chiama il switchTab nativo bypassando il lock (per mostrare l'overlay)
  function _switchTabRaw(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const btn = document.querySelector(`[data-tab="${tabId}"]`);
    if (btn) btn.classList.add('active');
    const panel = document.getElementById(`tab-${tabId}`);
    if (panel) panel.classList.add('active');
  }

  // ── Pro Lock Overlay ────────────────────────────────────────────────────────
  function ensureProOverlay(tabId) {
    const panel = document.getElementById(`tab-${tabId}`);
    if (!panel) return;
    if (panel.querySelector('.pro-lock-overlay')) return; // già presente
    const info = PRO_TAB_LABELS[tabId] || { icon: '🔒', name: tabId, desc: '' };
    const overlay = document.createElement('div');
    overlay.className = 'pro-lock-overlay';
    overlay.innerHTML = `
      <div class="pro-lock-box">
        <div class="pro-lock-icon">${info.icon}</div>
        <div class="pro-lock-title">${info.name}</div>
        <div class="pro-lock-desc">${info.desc}</div>
        <div class="pro-lock-badge">🔒 Funzione Pro</div>
        <button class="pro-lock-cta" onclick="window.showTierChooser()">
          Sblocca versione completa →
        </button>
      </div>
    `;
    panel.appendChild(overlay);
  }

  // ── Tier Chooser (modale di selezione) ─────────────────────────────────────
  function buildTierChooser() {
    if (document.getElementById('tier-chooser-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'tier-chooser-modal';
    modal.className = 'tier-modal-backdrop';
    modal.innerHTML = `
      <div class="tier-modal">
        <div class="tier-modal-header">
          <div class="tier-modal-title">Scegli la tua modalità</div>
          <div class="tier-modal-sub">Puoi cambiare in qualsiasi momento dal pulsante nell'header</div>
        </div>
        <div class="tier-modal-cards">
          <button class="tier-card tier-card-base" onclick="window.setTier('base'); window.hideTierChooser()">
            <div class="tier-card-icon">📊</div>
            <div class="tier-card-name">Versione Base</div>
            <div class="tier-card-tagline">Essenziale e intuitiva</div>
            <ul class="tier-card-list">
              <li>✓ Simulatore patrimoniale completo</li>
              <li>✓ Scenari economici (6 regimi macro)</li>
              <li>✓ Confronto A/B portafogli</li>
              <li>✓ Probabilità di successo (Monte Carlo base)</li>
              <li>✓ Simulazione decumulo</li>
              <li>✓ Backtesting storico 1970-2024</li>
              <li class="tier-list-locked">🔒 MC Avanzato (GARCH, t-Student)</li>
              <li class="tier-list-locked">🔒 Fiscalità IT completa</li>
              <li class="tier-list-locked">🔒 Piano Pensione integrativo</li>
              <li class="tier-list-locked">🔒 Stress Valutazioni (CAPE)</li>
              <li class="tier-list-locked">🔒 Obiettivo Inverso</li>
              <li class="tier-list-locked">🔒 Quant Analytics (Markowitz, VaR)</li>
            </ul>
            <span class="tier-card-cta">Inizia in Base →</span>
          </button>
          <button class="tier-card tier-card-pro" onclick="window.setTier('pro'); window.hideTierChooser()">
            <div class="tier-card-badge-pro">✦ SUITE COMPLETA</div>
            <div class="tier-card-icon">🚀</div>
            <div class="tier-card-name">Versione Pro</div>
            <div class="tier-card-tagline">Strumenti quantitativi avanzati</div>
            <ul class="tier-card-list">
              <li>✓ Tutto della versione Base</li>
              <li>✓ MC Avanzato (GARCH, t-Student, Regime-Switching)</li>
              <li>✓ Fiscalità IT (regimi, switch, zainetto)</li>
              <li>✓ Piano Pensione integrativo completo</li>
              <li>✓ Stress Valutazioni CAPE/Bogle</li>
              <li>✓ Obiettivo Inverso con sensitività</li>
              <li>✓ Quant Analytics (Markowitz, VaR, Factor, Rolling)</li>
            </ul>
            <span class="tier-card-cta">Accedi a tutte le funzioni →</span>
          </button>
        </div>
        <button class="tier-modal-close" onclick="window.hideTierChooser()" title="Chiudi">✕</button>
      </div>
    `;
    document.body.appendChild(modal);
    // Chiudi cliccando backdrop
    modal.addEventListener('click', (e) => {
      if (e.target === modal) window.hideTierChooser();
    });
  }

  window.showTierChooser = function() {
    buildTierChooser();
    const modal = document.getElementById('tier-chooser-modal');
    if (modal) {
      modal.style.display = 'flex';
      requestAnimationFrame(() => modal.classList.add('visible'));
    }
  };
  window.hideTierChooser = function() {
    const modal = document.getElementById('tier-chooser-modal');
    if (modal) {
      modal.classList.remove('visible');
      setTimeout(() => { modal.style.display = 'none'; }, 220);
    }
  };

  // ── Toggle button nel header ────────────────────────────────────────────────
  function updateTierToggleBtn(tier) {
    let btn = document.getElementById('tier-toggle-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'tier-toggle-btn';
      btn.className = 'tier-toggle-btn';
      btn.onclick = () => window.showTierChooser();
      const header = document.querySelector('.header');
      if (header) {
        const badge = header.querySelector('.badge');
        if (badge) header.insertBefore(btn, badge);
        else header.appendChild(btn);
      }
    }
    if (tier === 'pro') {
      btn.innerHTML = '⚡ Pro — cambia modalità';
      btn.classList.remove('btn-base');
      btn.classList.add('btn-pro');
    } else {
      btn.innerHTML = '📊 Base — sblocca Pro';
      btn.classList.remove('btn-pro');
      btn.classList.add('btn-base');
    }
  }

  // ── Init: se non c'è tier salvato, mostra il chooser all'apertura ───────────
  document.addEventListener('DOMContentLoaded', () => {
    const saved = getTier();
    window.suiteMode = saved || 'base';

    // Inietta CSS tier nel documento
    injectTierCSS();

    // Costruisci i pulsanti info-helper su tutti i .sec con data-info-id
    buildInfoHelpers();
    startInfoHelperObserver();

    if (!saved) {
      // Prima visita: mostra chooser dopo un breve ritardo
      setTimeout(() => window.showTierChooser(), 600);
    } else {
      applyTier(saved);
    }
  });

  // ── Hook in showView: quando si entra in 'app', applica il tier ─────────────
  const _origShowView = window.showView;
  if (typeof _origShowView === 'function') {
    window.showView = function(v) {
      _origShowView(v);
      if (v === 'app') {
        const t = getTier() || 'base';
        window.suiteMode = t;
        applyTier(t);
      }
    };
  }
  // Fallback: se showView non è ancora definito, usa MutationObserver sul body
  // (showView è in main.js che carica dopo)
  window._tierPendingHook = true;

  // ══════════════════════════════════════════════════════════════════════════
  // INFO HELPER — Popover ℹ cliccabile su ogni sezione
  // ══════════════════════════════════════════════════════════════════════════
  function buildInfoHelpers() {
    // Trova tutti gli elementi con data-info-id
    _ihBuilding = true;
    document.querySelectorAll('[data-info-id]').forEach(el => {
      const id = el.getAttribute('data-info-id');
      const info = INFO_TEXTS[id];
      if (!info) return;
      injectInfoBtn(el, info);
    });
    _ihBuilding = false;
  }
  window.buildInfoHelpers = buildInfoHelpers;

  // Osserva il DOM: le sezioni renderizzate dinamicamente (Quant, Backtest,
  // Stress Test…) ricevono il pulsante ℹ appena compaiono. Debounce per non
  // pesare sui re-render frequenti; idempotente (skip se il btn esiste già).
  let _ihBuilding = false;
  let _ihDebounce = null;
  function startInfoHelperObserver() {
    if (!window.MutationObserver || !document.body) return;
    const obs = new MutationObserver(() => {
      if (_ihBuilding) return; // ignora le mutazioni causate da noi stessi
      clearTimeout(_ihDebounce);
      _ihDebounce = setTimeout(buildInfoHelpers, 250);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function injectInfoBtn(container, info) {
    // Trova il .sec-label dentro il container (o il container stesso se è sec-label)
    const label = container.classList.contains('sec-label')
      ? container
      : container.querySelector('.sec-label');
    if (!label) return;
    if (label.querySelector('.info-helper-btn')) return; // già iniettato

    const btn = document.createElement('button');
    btn.className = 'info-helper-btn';
    btn.setAttribute('aria-label', `Informazioni su ${info.title}`);
    btn.setAttribute('type', 'button');
    btn.innerHTML = 'ℹ';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault(); // evita il toggle dei <details> quando il label è un <summary>
      toggleInfoPopover(btn, info);
    });
    // Inserisci prima del ::after del sec-label (prima dell'eventuale badge a destra)
    label.insertBefore(btn, label.children[1] || null);
  }

  // Popover globale riusabile
  let _popover = null;
  let _backdrop = null;
  let _activeBtn = null;

  function toggleInfoPopover(btn, info) {
    // Se il popover è già aperto su questo btn, chiudilo
    if (_activeBtn === btn && _popover && _popover.style.display !== 'none') {
      closeInfoPopover();
      return;
    }
    openInfoPopover(btn, info);
  }

  function openInfoPopover(btn, info) {
    if (!_popover) {
      _popover = document.createElement('div');
      _popover.className = 'info-popover';
      _popover.innerHTML = `
        <button class="info-popover-close" aria-label="Chiudi">✕</button>
        <div class="info-popover-title"></div>
        <div class="info-popover-text"></div>
      `;
      document.body.appendChild(_popover);
      // Backdrop (visibile solo su mobile): tap per chiudere, sempre affidabile su touch
      _backdrop = document.createElement('div');
      _backdrop.className = 'info-popover-backdrop';
      document.body.appendChild(_backdrop);
      _backdrop.addEventListener('click', closeInfoPopover);
      _backdrop.addEventListener('touchend', (e) => { e.preventDefault(); closeInfoPopover(); });
      // Pulsante di chiusura esplicito (touch + click)
      const closeBtn = _popover.querySelector('.info-popover-close');
      closeBtn.addEventListener('click', closeInfoPopover);
      closeBtn.addEventListener('touchend', (e) => { e.preventDefault(); closeInfoPopover(); });
      // Chiudi cliccando fuori (desktop)
      document.addEventListener('click', (e) => {
        if (_popover && _popover.style.display !== 'none' && !_popover.contains(e.target) && e.target !== _activeBtn) {
          closeInfoPopover();
        }
      }, true);
    }

    _popover.querySelector('.info-popover-title').textContent = info.title;
    _popover.querySelector('.info-popover-text').textContent = info.text;
    _popover.style.display = 'block';
    if (_backdrop) _backdrop.classList.add('visible');
    _activeBtn = btn;

    // Posizionamento smart: sotto il pulsante, con reflow se esce dallo schermo
    positionPopover(btn);
    requestAnimationFrame(() => _popover.classList.add('visible'));
  }

  function closeInfoPopover() {
    if (!_popover) return;
    _popover.classList.remove('visible');
    if (_backdrop) _backdrop.classList.remove('visible');
    setTimeout(() => {
      if (_popover) _popover.style.display = 'none';
    }, 180);
    _activeBtn = null;
  }

  function positionPopover(btn) {
    const rect = btn.getBoundingClientRect();
    const pw = 300;
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const vw = window.innerWidth;

    let top = rect.bottom + scrollY + 6;
    let left = rect.left + scrollX;

    // Se esce a destra, sposta a sinistra
    if (left + pw > vw - 12) {
      left = vw - pw - 12;
    }
    if (left < 8) left = 8;

    _popover.style.top = top + 'px';
    _popover.style.left = left + 'px';
    _popover.style.width = pw + 'px';

    // Se il popover esce sotto la viewport, aprilo sopra il pulsante
    requestAnimationFrame(() => {
      if (!_popover) return;
      const ph = _popover.offsetHeight;
      const botEdge = top - scrollY + ph;
      if (botEdge > window.innerHeight - 12) {
        _popover.style.top = (rect.top + scrollY - ph - 6) + 'px';
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CSS TIER — iniettato dinamicamente per non richiedere modifiche a style.css
  // ══════════════════════════════════════════════════════════════════════════
  function injectTierCSS() {
    if (document.getElementById('tier-system-css')) return;
    const style = document.createElement('style');
    style.id = 'tier-system-css';
    style.textContent = `
/* ── Tab bloccati (Base mode) ─────────────────────────────────── */
.tab-btn-locked {
  opacity: .55;
  cursor: pointer;
}
.tab-btn-locked::after {
  content: ' 🔒';
  font-size: 10px;
}

/* ── Pro Lock Overlay ─────────────────────────────────────────── */
.pro-lock-overlay {
  position: absolute;
  inset: 0;
  background: rgba(248,249,250,.96);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
  border-radius: var(--radius);
}
.pro-lock-box {
  text-align: center;
  max-width: 400px;
  padding: 40px 32px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0,0,0,.08);
}
.pro-lock-icon {
  font-size: 40px;
  margin-bottom: 12px;
}
.pro-lock-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 10px;
  letter-spacing: -.01em;
}
.pro-lock-desc {
  font-size: 13.5px;
  color: var(--text2);
  line-height: 1.6;
  margin-bottom: 16px;
}
.pro-lock-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-family: 'DM Mono', monospace;
  font-weight: 700;
  color: var(--orange);
  background: var(--orange-dim);
  border: 1px solid rgba(227,116,0,.2);
  border-radius: 4px;
  padding: 3px 10px;
  margin-bottom: 20px;
  text-transform: uppercase;
  letter-spacing: .06em;
}
.pro-lock-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--blue);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 22px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: 'DM Sans', sans-serif;
  transition: background .15s, transform .1s;
}
.pro-lock-cta:hover {
  background: #1558b0;
  transform: translateY(-1px);
}

/* ── Tier Toggle Button (header) ──────────────────────────────── */
.tier-toggle-btn {
  font-size: 11.5px;
  font-family: 'DM Mono', monospace;
  font-weight: 600;
  border-radius: 5px;
  padding: 4px 10px;
  border: 1px solid;
  cursor: pointer;
  transition: all .15s;
  letter-spacing: .03em;
  margin-right: 6px;
}
.tier-toggle-btn.btn-base {
  color: var(--teal);
  border-color: rgba(0,137,123,.3);
  background: var(--teal-dim);
}
.tier-toggle-btn.btn-base:hover {
  background: rgba(0,137,123,.18);
}
.tier-toggle-btn.btn-pro {
  color: var(--blue);
  border-color: rgba(26,115,232,.3);
  background: var(--blue-dim);
}
.tier-toggle-btn.btn-pro:hover {
  background: rgba(26,115,232,.18);
}

/* ── Tier Chooser Modal ───────────────────────────────────────── */
.tier-modal-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(32,33,36,.55);
  backdrop-filter: blur(4px);
  z-index: 1000;
  align-items: center;
  justify-content: center;
  padding: 16px;
  opacity: 0;
  transition: opacity .22s;
}
.tier-modal-backdrop.visible {
  opacity: 1;
}
.tier-modal {
  background: #fff;
  border-radius: 18px;
  padding: 32px 28px 28px;
  max-width: 780px;
  width: 100%;
  box-shadow: 0 24px 64px rgba(0,0,0,.18);
  position: relative;
  transform: translateY(10px);
  transition: transform .22s;
}
.tier-modal-backdrop.visible .tier-modal {
  transform: translateY(0);
}
.tier-modal-header {
  text-align: center;
  margin-bottom: 24px;
}
.tier-modal-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -.02em;
  color: var(--text);
  margin-bottom: 6px;
}
.tier-modal-sub {
  font-size: 13px;
  color: var(--text3);
}
.tier-modal-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media(max-width: 580px) {
  .tier-modal-cards { grid-template-columns: 1fr; }
}
.tier-card {
  border-radius: 14px;
  padding: 24px 22px;
  cursor: pointer;
  text-align: left;
  font-family: 'DM Sans', sans-serif;
  border: 2px solid var(--border);
  background: #fff;
  transition: border-color .15s, box-shadow .15s, transform .15s;
  position: relative;
  overflow: hidden;
}
.tier-card:hover {
  transform: translateY(-2px);
}
.tier-card-base:hover {
  border-color: var(--teal);
  box-shadow: 0 8px 24px rgba(0,137,123,.14);
}
.tier-card-pro {
  border-color: rgba(26,115,232,.35);
  background: linear-gradient(135deg, #fff 60%, rgba(26,115,232,.04));
}
.tier-card-pro:hover {
  border-color: var(--blue);
  box-shadow: 0 8px 24px rgba(26,115,232,.18);
}
.tier-card-badge-pro {
  position: absolute;
  top: 14px;
  right: 14px;
  font-size: 9.5px;
  font-family: 'DM Mono', monospace;
  font-weight: 700;
  color: var(--blue);
  background: var(--blue-dim);
  border: 1px solid rgba(26,115,232,.25);
  border-radius: 4px;
  padding: 2px 7px;
  letter-spacing: .07em;
  text-transform: uppercase;
}
.tier-card-icon {
  font-size: 30px;
  margin-bottom: 10px;
}
.tier-card-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 4px;
  letter-spacing: -.01em;
}
.tier-card-tagline {
  font-size: 12.5px;
  color: var(--text3);
  margin-bottom: 14px;
}
.tier-card-list {
  list-style: none;
  padding: 0;
  margin: 0 0 18px;
  display: grid;
  gap: 5px;
}
.tier-card-list li {
  font-size: 12.5px;
  color: var(--text2);
  padding-left: 2px;
}
.tier-card-list .tier-list-locked {
  color: var(--text3);
  font-size: 12px;
}
.tier-card-cta {
  display: inline-flex;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--blue);
}
.tier-card-base .tier-card-cta {
  color: var(--teal);
}
.tier-modal-close {
  position: absolute;
  top: 14px;
  right: 16px;
  background: none;
  border: none;
  font-size: 18px;
  color: var(--text3);
  cursor: pointer;
  line-height: 1;
  padding: 4px 6px;
  border-radius: 4px;
  transition: color .12s, background .12s;
}
.tier-modal-close:hover {
  color: var(--text);
  background: var(--bg3);
}

/* ── Home Tier Section ────────────────────────────────────────── */
.home-tier-section {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 24px 24px;
}
.home-tier-banner {
  background: linear-gradient(135deg, var(--blue-dim) 0%, var(--purple-dim) 100%);
  border: 1px solid rgba(26,115,232,.2);
  border-radius: 14px;
  padding: 22px 24px;
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}
.home-tier-banner-text {
  flex: 1;
  min-width: 220px;
}
.home-tier-banner-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 5px;
  letter-spacing: -.01em;
}
.home-tier-banner-sub {
  font-size: 12.5px;
  color: var(--text2);
  line-height: 1.5;
}
.home-tier-btns {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.home-tier-btn {
  padding: 9px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: 'DM Sans', sans-serif;
  transition: all .15s;
  border: 1.5px solid;
  white-space: nowrap;
}
.home-tier-btn-base {
  background: #fff;
  color: var(--teal);
  border-color: rgba(0,137,123,.3);
}
.home-tier-btn-base:hover {
  background: var(--teal-dim);
}
.home-tier-btn-pro {
  background: var(--blue);
  color: #fff;
  border-color: var(--blue);
}
.home-tier-btn-pro:hover {
  background: #1558b0;
}

/* ── Info Helper ℹ button ─────────────────────────────────────── */
.info-helper-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: var(--bg3);
  border: 1px solid var(--border);
  color: var(--text2);
  font-size: 10px;
  font-weight: 700;
  font-family: 'DM Mono', monospace;
  cursor: pointer;
  flex-shrink: 0;
  line-height: 1;
  transition: background .12s, color .12s, border-color .12s;
  margin-left: 4px;
  vertical-align: middle;
}
.info-helper-btn:hover {
  background: var(--blue-dim);
  color: var(--blue);
  border-color: rgba(26,115,232,.3);
}

/* ── Info Popover ─────────────────────────────────────────────── */
.info-popover {
  display: none;
  position: absolute;
  z-index: 999;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 13px 15px;
  box-shadow: 0 6px 24px rgba(0,0,0,.13);
  opacity: 0;
  transform: translateY(4px);
  transition: opacity .18s, transform .18s;
  pointer-events: auto;
}
.info-popover.visible {
  opacity: 1;
  transform: translateY(0);
}
.info-popover-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 6px;
  font-family: 'DM Mono', monospace;
  text-transform: uppercase;
  letter-spacing: .05em;
}
.info-popover-text {
  font-size: 12.5px;
  color: var(--text2);
  line-height: 1.65;
}
.info-popover-close {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: var(--text3);
  font-size: 16px;
  cursor: pointer;
  border-radius: 6px;
  display: none;
  align-items: center;
  justify-content: center;
  touch-action: manipulation;
}
.info-popover-close:hover { background: var(--bg2); color: var(--text); }
.info-popover-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.35);
  z-index: 998;
  opacity: 0;
  transition: opacity .18s;
}
.info-popover-backdrop.visible { opacity: 1; }
/* Su mobile: il popover diventa un modale centrato con X e backdrop tappabile.
   Risolve il caso in cui il popover copriva lo schermo senza via di chiusura (Android). */
@media (max-width: 480px) {
  .info-popover-backdrop { display: block; }
  .info-popover {
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -48%) !important;
    width: calc(100vw - 40px) !important;
    max-width: 360px !important;
    max-height: 70vh;
    overflow-y: auto;
    padding: 18px 16px 16px;
    z-index: 999;
  }
  .info-popover.visible { transform: translate(-50%, -50%) !important; }
  .info-popover-close { display: inline-flex; }
  .info-popover-title { padding-right: 28px; }
}
    `;
    document.head.appendChild(style);
  }

})(); // end IIFE

// ──────────────────────────────────────────────────────────────────────────────
// Hook tardivo su showView (caso in cui tier-system.js carichi prima di main.js)
// ──────────────────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  if (window._tierPendingHook) {
    const _origShowView2 = window.showView;
    if (typeof _origShowView2 === 'function' && !_origShowView2._tierHooked) {
      window.showView = function(v) {
        _origShowView2(v);
        if (v === 'app') {
          const t = (localStorage.getItem('suitePatrimoniale_tier') || 'base');
          window.suiteMode = t;
          window.getTier && window.applyTier && window.applyTier(t);
        }
      };
      window.showView._tierHooked = true;
    }
    window._tierPendingHook = false;
  }

  // Applica tier anche se la pagina è partita direttamente su #app
  const hash = (location.hash || '').replace('#', '');
  if (hash === 'app') {
    const t = localStorage.getItem('suitePatrimoniale_tier') || null;
    if (!t) { window.showTierChooser && window.showTierChooser(); }
  }
});
