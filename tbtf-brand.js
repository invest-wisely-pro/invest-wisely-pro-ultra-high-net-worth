// ══════════════════════════════════════════════════════════════════════════════
// tbtf-brand.js — Brandizzazione "Too Big To Fail Edition" (su licenza TBTF)
// Mini-figures dei tre host + decorazioni. Stile ispirato alla cover del podcast:
// poster flat rétro — tramonto corallo, crema, blu petrolio.
// Nessuna logica di calcolo viene toccata: solo skin e personaggi guida.
// ══════════════════════════════════════════════════════════════════════════════
(function initTBTFBrand() {
  'use strict';

  // ── Palette poster ──────────────────────────────────────────────────────────
  const C = {
    coral:  '#e8604a', coralDeep: '#cf4732', coralSoft: '#f0876f',
    cream:  '#f4ede1', creamHi:   '#fbf6ec',
    ink:    '#1f3540', slate:     '#2e4a56', petrol: '#23606f',
    sky:    '#bcd6e0', skyHi:     '#d9e8ee',
    gold:   '#e8a13c', skin:      '#ecc19c', skin2: '#d9a87f',
    blond:  '#e3b04b', brown:     '#6f4e33', dark:  '#2b2118',
  };

  // ── MINI FIGURES ────────────────────────────────────────────────────────────
  // Personaggi stilizzati flat (busti in cerchio), coerenti con la cover.
  // Vittorio (Finanza Cafona): biondo, viso pulito, catenina, camicia aperta — l'uomo del popolo.
  // Alain (Salto Mentale): capelli molto corti marroni, barba corta, occhiali — il Comandante.
  // Nicola (The Italian Leather Sofa): capelli scuri, barba, niente occhiali, dolcevita — il Maestro.
  function avatar(host, size) {
    size = size || 72;
    const svgs = {
      vittorio: `
        <svg viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="Vittorio — Finanza Cafona" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="48" fill="${C.coral}"/>
          <circle cx="50" cy="50" r="48" fill="none" stroke="${C.ink}" stroke-width="2.5"/>
          <path d="M14 84 a40 40 0 0 1 72 0 Z" fill="${C.creamHi}"/>
          <!-- busto: camicia con scollo a V simmetrico -->
          <path d="M24 100 v-14 a26 18 0 0 1 52 0 V100 Z" fill="${C.sky}"/>
          <path d="M43 69.5 L50 84 L57 69.5 Z" fill="${C.skin}"/>
          <path d="M43 69.5 L50 84 L57 69.5" fill="none" stroke="${C.ink}" stroke-width="2" stroke-linejoin="round"/>
          <!-- catenina d'oro -->
          <path d="M43.5 72.5 q6.5 7 13 0" fill="none" stroke="${C.gold}" stroke-width="2.4" stroke-linecap="round"/>
          <!-- collo + testa (rasato, niente barba) -->
          <rect x="44" y="58" width="12" height="10" fill="${C.skin2}"/>
          <circle cx="50" cy="42" r="19" fill="${C.skin}"/>
          <!-- capelli biondi all'indietro, speculari, con ciuffo centrale -->
          <path d="M31 42 q0-19 19-19 q19 0 19 19 q-4-11-19-11 q-15 0-19 11 Z" fill="${C.blond}"/>
          <path d="M44 25.5 q6-4.5 12 0 l-2.5 5 q-3.5-3-7-2.5 Z" fill="${C.blond}"/>
          <!-- sopracciglia centrate sugli occhi -->
          <path d="M37.5 36.5 h9 M53.5 36.5 h9" stroke="${C.brown}" stroke-width="2.2" stroke-linecap="round"/>
          <circle cx="42" cy="43" r="2.1" fill="${C.ink}"/>
          <circle cx="58" cy="43" r="2.1" fill="${C.ink}"/>
          <!-- sorriso largo centrato -->
          <path d="M42 52.5 q8 7 16 0" fill="none" stroke="${C.ink}" stroke-width="2.2" stroke-linecap="round"/>
        </svg>`,
      alain: `
        <svg viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="Alain — Salto Mentale" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="48" fill="${C.sky}"/>
          <circle cx="50" cy="50" r="48" fill="none" stroke="${C.ink}" stroke-width="2.5"/>
          <path d="M14 84 a40 40 0 0 1 72 0 Z" fill="${C.creamHi}"/>
          <!-- busto: maglia da ciclismo, zip e colletto centrati -->
          <path d="M24 100 v-14 a26 18 0 0 1 52 0 V100 Z" fill="${C.coral}"/>
          <path d="M25 92 h50" stroke="${C.creamHi}" stroke-width="4"/>
          <rect x="44" y="69.5" width="12" height="6" fill="${C.coralDeep}"/>
          <path d="M50 69.5 v13" stroke="${C.ink}" stroke-width="1.8"/>
          <!-- collo + testa -->
          <rect x="44" y="58" width="12" height="10" fill="${C.skin2}"/>
          <circle cx="50" cy="42" r="19" fill="${C.skin}"/>
          <!-- barba corta marrone, anello speculare -->
          <path d="M33.5 46 q0 14.5 16.5 14.5 q16.5 0 16.5-14.5 h-3.5 q-0.5 11-13 11 q-12.5 0-13-11 Z" fill="${C.brown}"/>
          <!-- capelli molto corti marroni (buzz cut), speculari -->
          <path d="M32.5 38 q3.5-14 17.5-14 q14 0 17.5 14 q-6-8-17.5-8 q-11.5 0-17.5 8 Z" fill="${C.brown}"/>
          <!-- occhiali rettangolari: lenti centrate sugli occhi -->
          <rect x="35.5" y="37.5" width="13" height="10" rx="3" fill="none" stroke="${C.ink}" stroke-width="2.2"/>
          <rect x="51.5" y="37.5" width="13" height="10" rx="3" fill="none" stroke="${C.ink}" stroke-width="2.2"/>
          <path d="M48.5 41.5 h3 M35.5 41.5 h-4 M64.5 41.5 h4" stroke="${C.ink}" stroke-width="2.2"/>
          <!-- sopracciglio alzato a sinistra, dritto a destra: lo sguardo del provocatore -->
          <path d="M37 33.5 q4-3 8-1.5" fill="none" stroke="${C.brown}" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M54 35.5 h8" stroke="${C.brown}" stroke-width="2.2" stroke-linecap="round"/>
          <circle cx="42" cy="43" r="2" fill="${C.ink}"/>
          <circle cx="58" cy="43" r="2" fill="${C.ink}"/>
          <!-- mezzo sorriso nella barba -->
          <path d="M44.5 53.5 q5.5 4.5 11 0.5" fill="none" stroke="${C.creamHi}" stroke-width="2" stroke-linecap="round"/>
        </svg>`,
      nicola: `
        <svg viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="Nicola — The Italian Leather Sofa" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="48" fill="${C.petrol}"/>
          <circle cx="50" cy="50" r="48" fill="none" stroke="${C.ink}" stroke-width="2.5"/>
          <path d="M14 84 a40 40 0 0 1 72 0 Z" fill="${C.creamHi}"/>
          <!-- busto: dolcevita centrato -->
          <path d="M24 100 v-14 a26 18 0 0 1 52 0 V100 Z" fill="${C.ink}"/>
          <rect x="42" y="61" width="16" height="9" rx="3" fill="${C.ink}"/>
          <!-- testa -->
          <circle cx="50" cy="42" r="19" fill="${C.skin}"/>
          <!-- barba piena scura, anello speculare -->
          <path d="M33 45.5 q0 15.5 17 15.5 q17 0 17-15.5 h-3.5 q-0.5 12-13.5 12 q-13 0-13.5-12 Z" fill="${C.dark}"/>
          <!-- capelli scuri, speculari -->
          <path d="M31 42 q0-19 19-19 q19 0 19 19 q-3-11-19-11 q-16 0-19 11 Z" fill="${C.dark}"/>
          <!-- sopracciglia + occhi, niente occhiali -->
          <path d="M37.5 36.5 h9 M53.5 36.5 h9" stroke="${C.dark}" stroke-width="2.2" stroke-linecap="round"/>
          <circle cx="42" cy="43" r="2.1" fill="${C.ink}"/>
          <circle cx="58" cy="43" r="2.1" fill="${C.ink}"/>
          <!-- sorriso misurato centrato nella barba -->
          <path d="M44.5 53.5 q5.5 4 11 0" fill="none" stroke="${C.creamHi}" stroke-width="2" stroke-linecap="round"/>
        </svg>`,
    };
    return svgs[host] || '';
  }
  window.TBTF_AVATAR = avatar;

  // ── Logo skyline (richiamo diretto alla cover: sole, grattacieli, montagna) ──
  function logo(size) {
    size = size || 40;
    return `
      <svg viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="Too Big To Fail" xmlns="http://www.w3.org/2000/svg">
        <rect x="1.5" y="1.5" width="61" height="61" rx="13" fill="${C.coral}" stroke="${C.ink}" stroke-width="3"/>
        <circle cx="44" cy="20" r="9" fill="${C.creamHi}"/>
        <path d="M2 50 L18 34 L30 46 L44 30 L62 48 V61 q0 1.5-1.5 1.5 H3.5 Q2 62.5 2 61 Z" fill="${C.sky}"/>
        <rect x="14" y="22" width="8" height="32" fill="${C.slate}"/>
        <rect x="25" y="14" width="9" height="40" fill="${C.ink}"/>
        <rect x="37" y="28" width="8" height="26" fill="${C.petrol}"/>
        <path d="M2 54 h60" stroke="${C.creamHi}" stroke-width="3"/>
      </svg>`;
  }
  window.TBTF_LOGO = logo;

  // ── Dati host ───────────────────────────────────────────────────────────────
  const HOSTS = {
    alain: {
      name: 'Alain', blog: 'Salto Mentale', role: 'il Comandante',
      mission: 'ti guida nella Guida all\'Utilizzo',
    },
    vittorio: {
      name: 'Vittorio', blog: 'Finanza Cafona', role: 'l\'uomo del popolo',
      mission: 'ti guida nella versione Base',
    },
    nicola: {
      name: 'Nicola', blog: 'The Italian Leather Sofa', role: 'il Maestro, quello tecnico',
      mission: 'ti guida nella versione Pro',
    },
  };
  window.TBTF_HOSTS = HOSTS;

  // ── Decorazione: riempi tutti i placeholder [data-tbtf-host] ────────────────
  let _decorating = false;
  function decorate() {
    _decorating = true;
    document.querySelectorAll('[data-tbtf-host]').forEach(el => {
      if (el.dataset.tbtfDone) return;
      const host = el.dataset.tbtfHost;
      if (!HOSTS[host]) return;
      const size = parseInt(el.dataset.tbtfSize || '72', 10);
      el.innerHTML = avatar(host, size);
      el.dataset.tbtfDone = '1';
    });
    document.querySelectorAll('[data-tbtf-logo]').forEach(el => {
      if (el.dataset.tbtfDone) return;
      el.innerHTML = logo(parseInt(el.dataset.tbtfLogo || '40', 10));
      el.dataset.tbtfDone = '1';
    });
    _decorating = false;
  }
  window.TBTF_DECORATE = decorate;

  document.addEventListener('DOMContentLoaded', () => {
    decorate();
    // Placeholder creati dopo (es. tier chooser): osserva e decora, idempotente.
    if (window.MutationObserver) {
      let deb = null;
      new MutationObserver(() => {
        if (_decorating) return;
        clearTimeout(deb);
        deb = setTimeout(decorate, 200);
      }).observe(document.body, { childList: true, subtree: true });
    }
  });
})();
