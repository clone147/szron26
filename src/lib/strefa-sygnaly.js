// Aplikacja „Sygnały" strefy zamkniętej SZRON — sygnały zakupowe CAIO (oferty pracy + newsy)
// zbierane przez skaner scripts/caio/scan.mjs → Edge Function caio-ingest → strefa.caio_signals.
import { getClient, getTeamUser } from './supabase.js';
import { $, esc, toast, fmtDate } from './strefa-ui.js';

const sb = getClient();

let signals = [];
let query = '';
let fTyp = '';      // '' | 'praca' | 'news'
let fStatus = 'aktywne'; // 'aktywne' (nowy+przeczytany) | 'nowy' | 'odrzucony' | ''

const WAGA = { 3: ['w3', 'Gorący'], 2: ['w2', 'Ciepły'], 1: ['w1', 'Info'] };

async function load() {
  const { data, error } = await sb.from('caio_signals').select('*')
    .order('waga', { ascending: false }).order('created_at', { ascending: false });
  if (error) { toast('Błąd wczytywania', error.message, 'err'); return; }
  signals = data ?? [];
  render();
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
  $('#stats').innerHTML = [
    ['Nowe', nowe], ['Gorące (waga 3)', gorace], ['Firmy z sygnałem', firmy], ['Wszystkie', signals.length],
  ].map(([l, n]) => `<div class="strefa-stat"><div class="strefa-stat__num">${n}</div><div class="strefa-stat__lbl">${l}</div></div>`).join('');
}

function card(s) {
  const [wc, wl] = WAGA[s.waga] ?? WAGA[1];
  return `<article class="sygnal ${s.status === 'nowy' ? 'is-new' : ''} ${s.status === 'odrzucony' ? 'is-dismissed' : ''}" data-id="${s.id}">
    <div class="sygnal__top">
      <span class="sygnal__waga sygnal__waga--${wc}" title="Waga ${s.waga}">${wl}</span>
      <span class="sygnal__typ">${s.typ === 'praca' ? 'Oferta pracy' : 'News'}</span>
      <strong class="sygnal__firma">${esc(s.firma)}</strong>
      ${s.tier ? `<span class="sygnal__tier">T${s.tier}</span>` : ''}
      <span class="sygnal__date">${fmtDate(s.posted_at || s.created_at)}</span>
    </div>
    <a class="sygnal__tytul" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.tytul)}</a>
    ${s.opis ? `<p class="sygnal__opis">${esc(s.opis)}${s.zrodlo ? ` · ${esc(s.zrodlo)}` : ''}</p>` : ''}
    <div class="sygnal__actions">
      ${s.status === 'nowy' ? `<button class="strefa-btn strefa-btn--ghost strefa-btn--sm" data-act="przeczytany">Oznacz przeczytany</button>` : ''}
      ${s.status !== 'odrzucony' ? `<button class="strefa-btn strefa-btn--ghost strefa-btn--sm" data-act="odrzucony">Odrzuć</button>`
        : `<button class="strefa-btn strefa-btn--ghost strefa-btn--sm" data-act="nowy">Przywróć</button>`}
    </div>
  </article>`;
}

function render() {
  renderStats();
  const list = visible();
  $('#list').innerHTML = list.map(card).join('');
  $('#empty').hidden = list.length > 0;
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
    if (btn) setStatus(btn.closest('.sygnal').dataset.id, btn.dataset.act);
  });
  await load();
}
init();
