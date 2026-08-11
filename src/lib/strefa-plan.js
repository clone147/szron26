// Aplikacja „Plan wzrostu" strefy zamkniętej SZRON — kokpit planu „5 klientów do 31.12.2026".
// Treść zadań żyje w HTML strony (li.plan-item[data-key]); tu tylko stan odhaczeń
// (strefa.plan_items), liczniki z pipeline'u CAIO i logika czasu (okno, fazy, terminy).
import { getClient, getTeamUser } from './supabase.js';
import { $, $$, esc, toast, fmtDate } from './strefa-ui.js';

const sb = getClient();
const state = new Map(); // key -> { done, done_at }

// Okno sprzedażowe i terminy z planu H2 2026
const WINDOW_FROM = new Date('2026-09-01T00:00:00');
const WINDOW_TO = new Date('2026-12-15T23:59:59');
const KEY_DATES = [
  ['Start fali 1', '2026-09-01'],
  ['CRA art. 14', '2026-09-11'],
  ['uKSC / NIS2', '2026-10-03'],
  ['Koniec okna', '2026-12-15'],
];
// Kolejność podpowiedzi „Teraz" — od najwyższego lewaru
const PRIORITY = [
  'ars-demo', 'ars-lista70', 'ars-case-rg', 'ars-linkedin', 'ars-szablony',
  'bl-film1', 'bl-posty-li', 'bl-rg-opinie', 'bl-siec', 'bl-kfs', 'bl-ceny',
  'bl-dossier', 'bl-calendly', 'bl-po-audycie', 'bl-quiz-d3', 'bl-roi', 'bl-film2', 'bl-porzadki',
];

const dayMs = 86400000;
const today = () => new Date();
const daysTo = (iso) => Math.ceil((new Date(`${iso}T00:00:00`) - today()) / dayMs);

/* ── dane ── */
async function load() {
  const [items, comp] = await Promise.all([
    sb.from('plan_items').select('*'),
    sb.from('caio_companies').select('status'),
  ]);
  const err = items.error || comp.error;
  if (err) { toast('Błąd wczytywania', err.message, 'err'); return; }
  state.clear();
  for (const r of items.data ?? []) state.set(r.key, r);
  renderChecks();
  renderFunnel(comp.data ?? []);
  renderNow();
}

/* ── checklisty ── */
function renderChecks() {
  for (const li of $$('.plan-item')) {
    const rec = state.get(li.dataset.key);
    const done = !!rec?.done;
    li.classList.toggle('is-done', done);
    li.querySelector('input').checked = done;
    const when = li.querySelector('.plan-item__when');
    when.textContent = done && rec?.done_at ? fmtDate(rec.done_at) : '';
  }
  for (const group of $$('.plan-group')) {
    const all = $$('.plan-item', group);
    const done = all.filter((li) => li.classList.contains('is-done')).length;
    group.querySelector('.plan-progress i').style.width = `${all.length ? (done / all.length) * 100 : 0}%`;
    group.querySelector('.plan-progress__lbl').textContent = `${done}/${all.length}`;
  }
}

/* ── hero: lejek + terminy + okno ── */
function renderFunnel(companies) {
  const by = (s) => companies.filter((c) => c.status === s).length;
  const active = companies.filter((c) => c.status && c.status !== 'nowy' && c.status !== 'odpadl').length;
  const klienci = by('klient');
  $('#goal-now').textContent = String(klienci);
  const firms = Number($('#funnel').dataset.firms) || 0;
  $('#funnel').innerHTML = [
    ['Firmy na liście', `${firms} / 70`],
    ['W kontakcie', String(active)],
    ['Rozmowy', String(by('rozmowa'))],
    ['Propozycje', String(by('propozycja'))],
  ].map(([lbl, val]) => `<span class="strefa-chip">${esc(lbl)}: <strong>${esc(val)}</strong></span>`).join('');
}

function renderDates() {
  $('#dates').innerHTML = KEY_DATES.map(([name, iso]) => {
    const d = daysTo(iso);
    const cls = d < 0 ? 'plan-date--past' : d <= 21 ? 'plan-date--soon' : '';
    const rel = d < 0 ? 'minęło' : d === 0 ? 'dziś!' : `za ${d} dni`;
    return `<span class="plan-date ${cls}"><b>${esc(name)}</b> ${esc(fmtDate(iso))} <em>${esc(rel)}</em></span>`;
  }).join('');

  const now = today();
  const fill = $('#window-fill');
  const lbl = $('#window-lbl');
  const weeks = Math.round((WINDOW_TO - WINDOW_FROM) / dayMs / 7);
  if (now < WINDOW_FROM) {
    fill.style.width = '0%';
    lbl.textContent = `Okno sprzedażowe 1.09–15.12 (${weeks} tygodni) startuje za ${daysTo('2026-09-01')} dni — teraz budujesz arsenał.`;
  } else if (now > WINDOW_TO) {
    fill.style.width = '100%';
    lbl.textContent = 'Okno sprzedażowe zamknięte — czas na podsumowanie i plan 2027.';
  } else {
    const pct = ((now - WINDOW_FROM) / (WINDOW_TO - WINDOW_FROM)) * 100;
    const week = Math.min(weeks, Math.floor((now - WINDOW_FROM) / dayMs / 7) + 1);
    fill.style.width = `${pct.toFixed(1)}%`;
    lbl.textContent = `Tydzień ${week} z ${weeks} okna sprzedażowego (1.09–15.12).`;
  }
}

/* ── fazy kalendarza ── */
function renderPhases() {
  const now = today();
  let current = null;
  for (const li of $$('#phases li')) {
    const from = new Date(`${li.dataset.from}T00:00:00`);
    const to = new Date(`${li.dataset.to}T23:59:59`);
    li.classList.toggle('is-past', now > to);
    const isNow = now >= from && now <= to;
    li.classList.toggle('is-now', isNow);
    if (isNow) current = li;
  }
  return current;
}

/* ── „Teraz" ── */
function renderNow() {
  const current = renderPhases();
  if (current) {
    const b = current.querySelector('b').textContent;
    const s = current.querySelector('span').textContent;
    $('#now-phase').textContent = `Faza: ${b} — ${s}.`;
  }
  const top = PRIORITY
    .filter((key) => !state.get(key)?.done)
    .slice(0, 3)
    .map((key) => {
      const li = document.querySelector(`.plan-item[data-key="${key}"]`);
      const title = li?.querySelector('.plan-item__title')?.childNodes[0]?.textContent?.trim() || key;
      return `<li><a href="#" data-goto="${esc(key)}">${esc(title)}</a></li>`;
    });
  $('#now-top').innerHTML = top.length ? top.join('') : '<li>Wszystko odhaczone — do sekwencji! Pipeline prowadzisz w Sygnałach.</li>';
}

/* ── zdarzenia ── */
document.addEventListener('change', async (e) => {
  const input = e.target.closest('.plan-item input[type="checkbox"]');
  if (!input) return;
  const li = input.closest('.plan-item');
  const key = li.dataset.key;
  const done = input.checked;
  const done_at = done ? new Date().toISOString() : null;
  state.set(key, { key, done, done_at });
  renderChecks();
  renderNow();
  const { error } = await sb.from('plan_items')
    .upsert({ key, done, done_at, updated_at: new Date().toISOString() });
  if (error) {
    toast('Nie zapisano', error.message, 'err');
    state.set(key, { key, done: !done, done_at: null });
    renderChecks();
    renderNow();
  }
});

document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-goto]');
  if (!link) return;
  e.preventDefault();
  const li = document.querySelector(`.plan-item[data-key="${link.dataset.goto}"]`);
  li?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

/* ── start ── */
(async () => {
  const user = await getTeamUser();
  if (!user) return; // redirect robi layout
  renderDates();
  await load();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
})();
