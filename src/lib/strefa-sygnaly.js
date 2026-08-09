// Aplikacja „Sygnały" strefy zamkniętej SZRON — sygnały zakupowe CAIO (oferty pracy + newsy)
// zbierane przez skaner scripts/caio/scan.mjs → Edge Function caio-ingest → strefa.caio_signals.
// Widok: firmy jako zwijane karty (wzorzec .strefa-tr ze Szkoleń), w środku wiersze sygnałów.
import { getClient, getTeamUser } from './supabase.js';
import { $, esc, toast, fmtDate } from './strefa-ui.js';

const sb = getClient();

let signals = [];
let query = '';
let fTyp = '';           // '' | 'praca' | 'news'
let fStatus = 'aktywne'; // 'aktywne' (nowy+przeczytany) | 'nowy' | 'odrzucony' | ''
const openFirms = new Set();

const WAGA_LABEL = { 3: 'Gorący', 2: 'Ciepły', 1: 'Info' };

const ICO = {
  chev: '<svg class="strefa-tr__chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  job: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0V6"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
};

async function load() {
  const { data, error } = await sb.from('caio_signals').select('*').order('created_at', { ascending: false });
  if (error) { toast('Błąd wczytywania', error.message, 'err'); return; }
  signals = data ?? [];
  render();
}

/* opis skanera = "Dopasowane: c++, embedded · Warszawa" → chipy + lokalizacja */
function parseOpis(opis) {
  const m = /^Dopasowane:\s*([^·]+?)(?:\s*·\s*(.+))?$/.exec(opis ?? '');
  if (!m) return { kws: [], extra: opis ?? '' };
  return { kws: m[1].split(',').map((s) => s.trim()).filter(Boolean), extra: m[2] ?? '' };
}

function visible() {
  const q = query.toLowerCase();
  return signals.filter((s) => {
    if (fTyp && s.typ !== fTyp) return false;
    if (fStatus === 'aktywne' && s.status === 'odrzucony') return false;
    else if (fStatus && fStatus !== 'aktywne' && s.status !== fStatus) return false;
    if (q && !`${s.firma} ${s.tytul} ${s.opis ?? ''} ${s.zrodlo ?? ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderStats() {
  const nowe = signals.filter((s) => s.status === 'nowy').length;
  const gorace = signals.filter((s) => s.waga === 3 && s.status !== 'odrzucony').length;
  const firmy = new Set(signals.filter((s) => s.status !== 'odrzucony').map((s) => s.firma)).size;
  const last = signals[0]?.created_at;
  $('#stats').innerHTML = [
    ['Nowe sygnały', nowe], ['Gorące (waga 3)', gorace], ['Firmy z sygnałem', firmy],
    ['Ostatni skan', last ? fmtDate(last) : '—'],
  ].map(([l, n]) => `<div class="strefa-stat"><div class="strefa-stat__num">${n}</div><div class="strefa-stat__lbl">${l}</div></div>`).join('');
}

function row(s) {
  const { kws, extra } = parseOpis(s.opis);
  return `<div class="syg-row ${s.status === 'odrzucony' ? 'is-dismissed' : ''}" data-id="${s.id}">
    <span class="syg-row__waga syg-row__waga--${s.waga}" title="Waga ${s.waga}: ${WAGA_LABEL[s.waga]}"></span>
    <span class="syg-row__typ" title="${s.typ === 'praca' ? 'Oferta pracy' : 'News'}">${s.typ === 'praca' ? ICO.job : ICO.news}</span>
    <div class="syg-row__main">
      <a class="syg-row__tytul" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.tytul.replace(/\s+—\s+[^—]+$/, ''))} ${ICO.ext}</a>
      <div class="syg-row__meta">
        ${s.status === 'nowy' ? '<span class="strefa-chip strefa-chip--ok">nowy</span>' : ''}
        ${kws.map((k) => `<span class="syg-kw">${esc(k)}</span>`).join('')}
        ${extra ? `<span>${esc(extra)}</span>` : ''}
        ${s.zrodlo ? `<span>${esc(s.zrodlo)}</span>` : ''}
        <span>${fmtDate(s.posted_at || s.created_at)}</span>
      </div>
    </div>
    <div class="syg-row__actions">
      ${s.status === 'nowy' ? `<button class="strefa-iconbtn" data-act="przeczytany" title="Oznacz jako przeczytany">${ICO.check}</button>` : ''}
      ${s.status !== 'odrzucony'
        ? `<button class="strefa-iconbtn" data-act="odrzucony" title="Odrzuć sygnał">${ICO.x}</button>`
        : `<button class="strefa-iconbtn" data-act="nowy" title="Przywróć">${ICO.undo}</button>`}
    </div>
  </div>`;
}

function firmCard(firma, items) {
  const open = openFirms.has(firma);
  const maxWaga = Math.max(...items.map((s) => s.waga));
  const nowe = items.filter((s) => s.status === 'nowy').length;
  const prace = items.filter((s) => s.typ === 'praca').length;
  const newsy = items.length - prace;
  const tier = items.find((s) => s.tier)?.tier;
  const heat = maxWaga === 3 ? '<span class="strefa-chip strefa-chip--error">Gorący</span>'
    : maxWaga === 2 ? '<span class="strefa-chip strefa-chip--pending">Ciepły</span>' : '';
  return `<section class="strefa-tr ${open ? 'is-open' : ''}" data-firma="${esc(firma)}">
    <div class="strefa-tr__head" role="button" tabindex="0" aria-expanded="${open}">
      ${ICO.chev}
      <div class="strefa-tr__grow">
        <div class="strefa-tr__name">${esc(firma)} ${tier ? `<span class="syg-tier">Tier ${tier}</span>` : ''}</div>
        <div class="strefa-tr__meta">
          ${prace ? `<span>${prace} ${prace === 1 ? 'oferta' : 'oferty/ofert'} pracy</span>` : ''}
          ${newsy ? `<span>${newsy} news${newsy === 1 ? '' : 'y/ów'}</span>` : ''}
          <span>ostatni: ${fmtDate(items[0].posted_at || items[0].created_at)}</span>
        </div>
      </div>
      <div class="strefa-tr__counts">
        ${heat}
        ${nowe ? `<span class="strefa-chip strefa-chip--ok">${nowe} nowe</span>` : ''}
        <span class="strefa-chip strefa-chip--count">${items.length}</span>
      </div>
    </div>
    ${open ? `<div class="strefa-tr__body syg-body">${items.map(row).join('')}</div>` : ''}
  </section>`;
}

function render() {
  renderStats();
  const list = visible();
  const byFirma = new Map();
  for (const s of list) {
    if (!byFirma.has(s.firma)) byFirma.set(s.firma, []);
    byFirma.get(s.firma).push(s);
  }
  const firms = [...byFirma.entries()].sort((a, b) => {
    const wa = Math.max(...a[1].map((s) => s.waga)); const wb = Math.max(...b[1].map((s) => s.waga));
    if (wb !== wa) return wb - wa;
    return new Date(b[1][0].created_at) - new Date(a[1][0].created_at);
  });
  $('#list').innerHTML = firms.map(([f, items]) => firmCard(f, items)).join('');
  $('#empty').hidden = firms.length > 0;
}

async function setStatus(id, status) {
  const { error } = await sb.from('caio_signals').update({ status }).eq('id', id);
  if (error) { toast('Błąd zapisu', error.message, 'err'); return; }
  const s = signals.find((x) => x.id === id);
  if (s) s.status = status;
  render();
}

async function init() {
  if (!(await getTeamUser())) return; // layout przekieruje na login
  $('#search').addEventListener('input', (e) => { query = e.target.value; render(); });
  $('#f-typ').addEventListener('change', (e) => { fTyp = e.target.value; render(); });
  $('#f-status').addEventListener('change', (e) => { fStatus = e.target.value; render(); });
  $('#list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (btn) { setStatus(btn.closest('.syg-row').dataset.id, btn.dataset.act); return; }
    if (e.target.closest('a')) return;
    const head = e.target.closest('.strefa-tr__head');
    if (head) {
      const f = head.closest('.strefa-tr').dataset.firma;
      openFirms.has(f) ? openFirms.delete(f) : openFirms.add(f);
      render();
    }
  });
  $('#list').addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('strefa-tr__head')) {
      e.preventDefault(); e.target.click();
    }
  });
  await load();
  // pierwsza firma otwarta na start, żeby widok nie był pustą listą nagłówków
  const first = $('#list .strefa-tr');
  if (first && !openFirms.size) { openFirms.add(first.dataset.firma); render(); }
}
init();
