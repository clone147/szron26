// Aplikacja „Szkolenia" strefy zamkniętej SZRON.
// Dane w schemacie `strefa` (RLS). Siatka uczestników edytowalna w pełni z klawiatury (jak arkusz).
import { getClient, getTeamUser, startRealtime, pollBlocked, LEGACY_OWNER_ID } from './supabase.js';
import { $, $$, esc, toast, openModal, closeModal, confirmDialog, fmtDate as fmtDateBase, fmtDateTime, todayStr, telHref, ICONS, STAGES, stageColor, stageName, SUBS, bindSearch, bindFileImport, downloadJSON } from './strefa-ui.js';
import { createGridNav } from './strefa-grid.js';
import qrcode from 'qrcode-generator';

const sb = getClient();

// fmtDate: pusta data w Szkoleniach pokazuje „bez daty" (wspólny helper ma fallback '')
const fmtDate = (d) => fmtDateBase(d, 'bez daty');

/* ── ikony (wspólne ICONS + lokalne) ── */
const ICO = {
  ...ICONS,
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>',
  qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h2v2M18 14h.01M21 17v.01M14 18v.01M17 21h.01M21 21v-2"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>',
};

// dopasowanie uczestnik ↔ programista: normalizacja imienia+nazwiska (bez wielkości liter, diakrytyków, „ł")
const foldName = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/ł/g, 'l').replace(/\s+/g, ' ');
const nameKey = (first, last) => (foldName(first) + ' ' + foldName(last)).trim();

/* ── stan ── */
let trainings = [];            // [{...t, participants:[...]}]
const partMap = new Map();     // pid -> participant
const trMap = new Map();       // tid -> training
const openIds = new Set();
const selected = new Map();     // tid -> Set(pid)
let query = '';
let developers = [];            // [{id, first_name, last_name, company_id, stage}] — z /strefa/programisci
const devByName = new Map();    // nameKey -> developer (dopasowanie uczestnika do programisty)

// kolumny nawigowane klawiaturą (kolejność = lewo/prawo)
const NAV = ['attendance', 'first_name', 'last_name', 'position', 'main_project', 'main_technology', 'email', 'phone'];
const MAXC = NAV.length - 1; // ostatni indeks kolumny edytowalnej

/* ── DB helpery ── */
let polling = false;

async function fetchTrainings() {
  const { data, error } = await sb.from('trainings').select('*, participants:participants(*)');
  if (error) throw error;
  const arr = (data || []).sort((a, b) => (b.training_date || '').localeCompare(a.training_date || ''));
  for (const t of arr) t.participants = (t.participants || []).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  return arr;
}
function commitTrainings(arr) {
  trainings = arr; trMap.clear(); partMap.clear();
  for (const t of trainings) { trMap.set(t.id, t); for (const p of t.participants) partMap.set(p.id, p); }
}
async function fetchDevelopers() {
  const { data, error } = await sb.from('developers').select('id, first_name, last_name, company_id, stage');
  if (error) throw error;
  return data || [];
}
function commitDevelopers(devs) {
  developers = devs || [];
  devByName.clear();
  for (const d of developers) { const k = nameKey(d.first_name, d.last_name); if (k) devByName.set(k, d); }
}
const matchDev = (p) => devByName.get(nameKey(p.first_name, p.last_name)) || null;
const devSig = (devs) => JSON.stringify((devs || []).map((d) => [d.id, d.first_name, d.last_name, d.company_id, d.stage]));
// Sygnatura danych — do wykrycia, czy cokolwiek się zmieniło (bez tego nie ruszamy DOM).
function sigOf(arr) {
  return JSON.stringify((arr || []).map((t) => [t.id, t.name, t.training_date, t.location, t.description,
    (t.participants || []).map((p) => [p.id, p.first_name, p.last_name, p.position, p.main_project, p.main_technology, p.email, p.phone, p.attendance_confirmed, p.subscription, p.subscription_start_date])]));
}
async function loadData() {
  try {
    const [trs, devs] = await Promise.all([fetchTrainings(), fetchDevelopers()]);
    commitTrainings(trs); commitDevelopers(devs);
  } catch (e) { toast('Błąd ładowania', e.message, 'err'); }
}

// Ciche auto-odświeżanie: renderuje WYŁĄCZNIE gdy dane serwera różnią się od lokalnych.
// Pomija, gdy: zakładka w tle, trwa edycja komórki, otwarty jest dialog, albo user jest aktywny w siatce.
async function pollRefresh() {
  if (polling || gridNav.editing || pollBlocked('trainings')) return;
  polling = true;
  try {
    const [arr, devs] = await Promise.all([fetchTrainings(), fetchDevelopers()]);
    if (sigOf(arr) !== sigOf(trainings) || devSig(devs) !== devSig(developers)) {
      const y = window.scrollY;
      commitTrainings(arr); commitDevelopers(devs);
      renderAll();
      window.scrollTo({ top: y });
    }
  } catch (e) { /* błąd auto-odświeżania ignorujemy po cichu */ }
  finally { polling = false; }
}

async function dbUpdatePart(pid, patch) {
  const { error } = await sb.from('participants').update(patch).eq('id', pid);
  if (error) { toast('Błąd zapisu', error.message, 'err'); return false; }
  return true;
}

/* ── render ── */
function matches(p, t) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [p.first_name, p.last_name, p.position, p.main_project, p.main_technology, p.email, p.phone, p.subscription, t.name, t.location].some((v) => String(v || '').toLowerCase().includes(q));
}
function visibleParts(t) { return query ? t.participants.filter((p) => matches(p, t)) : t.participants; }

function attDot(on) {
  return on
    ? `<span class="att-dot att-yes" title="Obecność potwierdzona">${ICO.check}</span>`
    : `<span class="att-dot att-no" title="Brak potwierdzenia">${ICO.x}</span>`;
}
function subBadge(p) {
  if (!p.subscription) return '<span class="sub-badge sub-badge--none">— brak —</span>';
  const date = p.subscription_start_date ? ` · ${fmtDate(p.subscription_start_date)}` : '';
  return `<span class="sub-badge">${esc(p.subscription)}${date}</span>`;
}
function cellInner(p, col) {
  if (col === 'attendance') return `<div class="dcell">${attDot(p.attendance_confirmed)}</div>`;
  const val = p[col];
  const muted = !val ? ' dcell--muted' : '';
  return `<div class="dcell${muted}">${val ? esc(val) : '—'}</div>`;
}
// Kolumna „Etap (programista)": select etapu, gdy uczestnik pokrywa się z kimś w /strefa/programisci;
// inaczej przycisk dodania go do listy programistów (z dialogiem wyboru firmy).
function devStageCell(p) {
  const d = matchDev(p);
  if (!d) {
    return `<div class="dcell"><button class="strefa-btn strefa-btn--ghost strefa-btn--sm" data-act="add-dev" title="Dodaj do listy programistów">${ICO.plus}<span style="margin-left:.25rem">do programistów</span></button></div>`;
  }
  const cur = Math.max(1, Math.min(6, d.stage || 1));
  const opts = STAGES.map((s) => `<option value="${s.n}"${s.n === cur ? ' selected' : ''}>${s.n} · ${esc(s.name)}</option>`).join('');
  return `<div class="dcell"><span class="stage-dot" style="background:${stageColor(cur)}"></span><select class="strefa-select part-stage" data-stage-dev="${esc(d.id)}" title="Etap programisty: ${esc(d.first_name)} ${esc(d.last_name)} — zmień">${opts}</select></div>`;
}

function rowHTML(p, r) {
  const sel = selected.get(p.training_id)?.has(p.id);
  return `<tr data-pid="${p.id}" class="${sel ? 'is-selected' : ''}">
    <td class="col-sel"><input type="checkbox" data-sel ${sel ? 'checked' : ''} aria-label="Zaznacz"></td>
    ${NAV.map((col, c) => `<td${col === 'attendance' ? ' class="col-check"' : ''} data-col="${col}" data-r="${r}" data-c="${c}">${cellInner(p, col)}</td>`).join('')}
    <td class="col-devstage">${devStageCell(p)}</td>
    <td class="col-sub"><div class="dcell" data-act="sub" title="Edytuj abonament / notatki" style="cursor:pointer">${subBadge(p)}</div></td>
    <td class="col-actions"><div class="dcell">
      ${p.phone ? `<a class="strefa-iconbtn strefa-iconbtn--call" href="tel:${esc(telHref(p.phone))}" title="Zadzwoń: ${esc(p.phone)}">${ICO.phone}</a>` : ''}
      <button class="strefa-iconbtn" data-act="notes" title="Notatki i abonament">${ICO.file}</button>
      <button class="strefa-iconbtn" data-act="del-part" title="Usuń uczestnika">${ICO.trash}</button>
    </div></td>
  </tr>`;
}

function gridHTML(t) {
  const parts = visibleParts(t);
  const selCount = selected.get(t.id)?.size || 0;
  const rows = parts.map((p, i) => rowHTML(p, i)).join('');
  const body = parts.length
    ? rows
    : `<tr><td colspan="12" class="dgrid-empty">${query ? 'Brak pasujących uczestników.' : 'Brak uczestników. Dodaj poniżej.'}</td></tr>`;
  return `
    ${selCount ? `<div class="strefa-toolbar" style="margin-bottom:.6rem">
      <span class="strefa-chip strefa-chip--count">Zaznaczono: ${selCount}</span>
      <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" data-bulk="confirm">Potwierdź obecność</button>
      <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" data-bulk="unconfirm">Cofnij obecność</button>
      <button class="strefa-btn strefa-btn--danger strefa-btn--sm" data-bulk="delete">Usuń zaznaczone</button>
    </div>` : ''}
    <div class="dgrid-wrap" tabindex="0">
      <table class="dgrid">
        <thead><tr>
          <th class="col-sel"><input type="checkbox" data-sel-all aria-label="Zaznacz wszystkich"></th>
          <th class="col-check">Obecność</th><th>Imię</th><th>Nazwisko</th><th>Stanowisko</th><th>Główny projekt</th><th>Technologia</th><th>E-mail</th><th>Telefon</th><th class="col-devstage">Etap (programista)</th><th>Abonament</th><th class="col-actions"></th>
        </tr></thead>
        <tbody>${body}</tbody>
        <tr class="dgrid-add">
          <td></td>
          <td colspan="11">
            <div style="display:flex;gap:.4rem;padding:.35rem .5rem;flex-wrap:wrap;align-items:center">
              <input class="strefa-input" data-add="first_name" placeholder="Imię" style="width:7rem">
              <input class="strefa-input" data-add="last_name" placeholder="Nazwisko" style="width:8rem">
              <input class="strefa-input" data-add="position" placeholder="Stanowisko" style="width:8rem">
              <input class="strefa-input" data-add="main_project" placeholder="Główny projekt" style="width:9rem">
              <input class="strefa-input" data-add="main_technology" placeholder="Technologia" style="width:9rem">
              <input class="strefa-input" data-add="email" type="email" placeholder="E-mail" style="width:11rem">
              <input class="strefa-input" data-add="phone" type="tel" placeholder="Telefon" style="width:8rem">
              <button class="strefa-btn strefa-btn--accent strefa-btn--sm" data-add-go>Dodaj</button>
            </div>
          </td>
        </tr>
      </table>
    </div>
    <p class="grid-hint">
      <span><kbd>↑↓←→</kbd> ruch</span><span><kbd>Enter</kbd>/<kbd>F2</kbd> edycja</span>
      <span><kbd>Tab</kbd> dalej</span><span><kbd>Spacja</kbd> obecność</span><span><kbd>Esc</kbd> anuluj</span>
    </p>`;
}

function trainingHTML(t) {
  const open = openIds.has(t.id);
  const parts = t.participants;
  const confirmed = parts.filter((p) => p.attendance_confirmed).length;
  const withSub = parts.filter((p) => p.subscription).length;
  return `<section class="strefa-tr ${open ? 'is-open' : ''}" data-tid="${t.id}">
    <div class="strefa-tr__head" data-toggle>
      ${ICO.chev}
      <div class="strefa-tr__grow">
        <div class="strefa-tr__name">${esc(t.name)}</div>
        <div class="strefa-tr__meta">
          <span>${fmtDate(t.training_date)}</span>
          ${t.location ? `<span>${esc(t.location)}</span>` : ''}
          ${t.description ? `<span>${esc(t.description)}</span>` : ''}
        </div>
      </div>
      <div class="strefa-tr__counts">
        <span class="strefa-chip strefa-chip--count">${parts.length} os.</span>
        <span class="strefa-chip strefa-chip--ok">${confirmed} obecnych</span>
        ${withSub ? `<span class="strefa-chip strefa-chip--count">${withSub} abon.</span>` : ''}
      </div>
      <div class="strefa-tr__actions">
        <button class="strefa-iconbtn" data-act="open-slides" title="Edytor slajdów (prezentacja)">${ICO.play}</button>
        <button class="strefa-iconbtn" data-act="qr" title="Kod QR do samozapisu">${ICO.qr}</button>
        <button class="strefa-iconbtn" data-act="add-part" title="Dodaj uczestnika">${ICO.plus}</button>
        <button class="strefa-iconbtn" data-act="toggle-disabled" title="Przełącz sufiks DISABLED w mailach">${ICO.shield}</button>
        <button class="strefa-iconbtn" data-act="edit-training" title="Edytuj szkolenie">${ICO.pencil}</button>
        <button class="strefa-iconbtn" data-act="del-training" title="Usuń szkolenie">${ICO.trash}</button>
      </div>
    </div>
    ${open ? `<div class="strefa-tr__body">${gridHTML(t)}</div>` : ''}
  </section>`;
}

function renderStats() {
  const tp = trainings.reduce((a, t) => a + t.participants.length, 0);
  const conf = trainings.reduce((a, t) => a + t.participants.filter((p) => p.attendance_confirmed).length, 0);
  const sub = trainings.reduce((a, t) => a + t.participants.filter((p) => p.subscription).length, 0);
  $('#stats').innerHTML = [
    ['Szkolenia', trainings.length], ['Uczestnicy', tp], ['Obecności', conf], ['Abonamenty AI', sub],
  ].map(([l, n]) => `<div class="strefa-stat"><div class="strefa-stat__num">${n}</div><div class="strefa-stat__lbl">${l}</div></div>`).join('');
}

function renderAll() {
  renderStats();
  const list = query
    ? trainings.filter((t) => visibleParts(t).length || String(t.name).toLowerCase().includes(query.toLowerCase()))
    : trainings;
  if (query) list.forEach((t) => openIds.add(t.id)); // auto-rozwiń przy szukaniu
  const host = $('#trainings');
  host.innerHTML = list.map(trainingHTML).join('');
  $('#empty').hidden = trainings.length !== 0;
  bindGrids();
  gridNav.reset();
}

/* ── nawigacja klawiaturą po siatce (wspólny silnik ./strefa-grid.js) ── */
const gridNav = createGridNav({
  getRecord: (tr) => ({ id: tr.dataset.pid, rec: partMap.get(tr.dataset.pid) }),
  dbUpdate: dbUpdatePart,
  cellInner,
  maxCol: MAXC,
});

async function toggleAttendance(td) {
  const pid = td.closest('tr').dataset.pid;
  const p = partMap.get(pid);
  const nv = !p.attendance_confirmed;
  p.attendance_confirmed = nv;
  td.innerHTML = cellInner(p, 'attendance');
  renderStats(); updateCounts(p.training_id);
  if (!(await dbUpdatePart(pid, { attendance_confirmed: nv }))) { p.attendance_confirmed = !nv; td.innerHTML = cellInner(p, 'attendance'); renderStats(); updateCounts(p.training_id); }
}

function bindGrids() {
  $$('.strefa-tr').forEach((sec) => {
    const tid = sec.dataset.tid;

    // rozwijanie / akcje nagłówka
    const head = $('.strefa-tr__head', sec);
    head.addEventListener('click', (e) => {
      const actBtn = e.target.closest('[data-act]');
      if (actBtn) { e.stopPropagation(); headAction(actBtn.dataset.act, tid); return; }
      if (openIds.has(tid)) openIds.delete(tid); else openIds.add(tid);
      renderAll();
    });

    const grid = $('.dgrid', sec);
    if (!grid) return;
    const wrap = $('.dgrid-wrap', sec);

    // klik w komórkę
    grid.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (act) { rowAction(act.dataset.act, e.target.closest('tr')?.dataset.pid); return; }
      if (e.target.closest('[data-sel]')) { onSelect(e.target.closest('tr'), tid); return; }
      if (e.target.closest('[data-sel-all]')) { onSelectAll(grid, tid, e.target.checked); return; }
      const td = e.target.closest('td[data-col]');
      if (td) {
        if (td.dataset.col === 'attendance') { toggleAttendance(td); gridNav.setActive(td); }
        // Pojedynczy klik = edycja w miejscu: karetka tam, gdzie kliknięto, bez kasowania zawartości.
        else { const caret = gridNav.caretIndexFromPoint(td, e.clientX, e.clientY); gridNav.beginEdit(td, { caret }); }
      }
    });

    // zmiana etapu programisty (select w kolumnie „Etap (programista)")
    grid.addEventListener('change', (e) => {
      const sel = e.target.closest('.part-stage');
      if (sel) changeDevStage(sel);
    });

    // nawigacja klawiaturą: specyfika Szkoleń PRZED wspólnym rdzeniem — filtr pól
    // oraz kolumna „Obecność" (Enter/Spacja = toggle, F2/znaki połknięte; Spacja nie edytuje zwykłych kolumn)
    wrap.addEventListener('keydown', (e) => {
      if (gridNav.editing) return;
      if (e.target.closest('select, input, textarea')) { e.stopImmediatePropagation(); return; } // strzałki w polach (np. select etapu) nie sterują siatką
      const td = gridNav.active;
      if (!td || !grid.contains(td)) return;
      if (td.dataset.col === 'attendance') {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAttendance(td); e.stopImmediatePropagation(); }
        else if (e.key === 'F2' || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)) e.stopImmediatePropagation(); // bez edycji na obecności
      } else if (e.key === ' ') e.stopImmediatePropagation(); // Spacja nie zaczyna edycji
    });
    gridNav.bindKeydown(wrap, grid);

    // dodawanie uczestnika
    const addGo = $('[data-add-go]', sec);
    const addInputs = $$('[data-add]', sec);
    const doAdd = () => addParticipant(tid, addInputs, addGo);
    addGo?.addEventListener('click', doAdd);
    addInputs.forEach((inp) => inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } }));
  });
}

function updateCounts(tid) {
  const t = trMap.get(tid); if (!t) return;
  const sec = $(`.strefa-tr[data-tid="${tid}"]`); if (!sec) return;
  const conf = t.participants.filter((p) => p.attendance_confirmed).length;
  const counts = $('.strefa-tr__counts', sec);
  const withSub = t.participants.filter((p) => p.subscription).length;
  counts.innerHTML = `<span class="strefa-chip strefa-chip--count">${t.participants.length} os.</span><span class="strefa-chip strefa-chip--ok">${conf} obecnych</span>${withSub ? `<span class="strefa-chip strefa-chip--count">${withSub} abon.</span>` : ''}`;
}

/* ── selekcja / bulk ── */
function onSelect(tr, tid) {
  const pid = tr.dataset.pid;
  if (!selected.has(tid)) selected.set(tid, new Set());
  const set = selected.get(tid);
  if (set.has(pid)) set.delete(pid); else set.add(pid);
  if (!set.size) selected.delete(tid);
  renderAll();
}
function onSelectAll(grid, tid, on) {
  const set = new Set();
  if (on) visibleParts(trMap.get(tid)).forEach((p) => set.add(p.id));
  if (set.size) selected.set(tid, set); else selected.delete(tid);
  renderAll();
}
async function bulkAction(tid, action) {
  const ids = Array.from(selected.get(tid) || []);
  if (!ids.length) return;
  if (action === 'delete') {
    if (!(await confirmDialog(`Usunąć ${ids.length} zaznaczonych uczestników?`))) return;
    const { error } = await sb.from('participants').delete().in('id', ids);
    if (error) return toast('Błąd', error.message, 'err');
  } else {
    const val = action === 'confirm';
    const { error } = await sb.from('participants').update({ attendance_confirmed: val }).in('id', ids);
    if (error) return toast('Błąd', error.message, 'err');
  }
  selected.delete(tid);
  await loadData(); renderAll();
  toast('Gotowe', action === 'delete' ? 'Usunięto zaznaczonych' : 'Zaktualizowano obecność', 'ok');
}

/* ── akcje nagłówka szkolenia ── */
async function headAction(act, tid) {
  const t = trMap.get(tid);
  if (act === 'add-part') { openIds.add(tid); renderAll(); setTimeout(() => $(`.strefa-tr[data-tid="${tid}"] [data-add="first_name"]`)?.focus(), 30); }
  else if (act === 'open-slides') { window.location.href = `/strefa/slajdy?t=${tid}`; }
  else if (act === 'qr') qrModal(t);
  else if (act === 'edit-training') trainingModal(t);
  else if (act === 'del-training') {
    if (!(await confirmDialog(`Usunąć szkolenie „${t.name}" wraz z listą uczestników?`))) return;
    const { error } = await sb.from('trainings').delete().eq('id', tid);
    if (error) return toast('Błąd', error.message, 'err');
    await loadData(); renderAll(); toast('Usunięto', 'Szkolenie skasowane', 'ok');
  } else if (act === 'toggle-disabled') {
    const anyDisabled = t.participants.some((p) => (p.email || '').endsWith('DISABLED'));
    const jobs = []; // buildery są thenable — odpalą się równolegle przy Promise.all (zamiast N szeregowych RTT)
    for (const p of t.participants) {
      if (!p.email) continue;
      const ne = anyDisabled ? p.email.replace(/DISABLED$/, '') : (p.email.endsWith('DISABLED') ? p.email : p.email + 'DISABLED');
      if (ne !== p.email) { p.email = ne; jobs.push(sb.from('participants').update({ email: ne }).eq('id', p.id)); }
    }
    await Promise.all(jobs);
    renderAll(); toast('Maile', anyDisabled ? 'Usunięto sufiks DISABLED' : 'Dodano sufiks DISABLED', 'ok');
  }
}

/* ── akcje wiersza ── */
async function rowAction(act, pid) {
  if (!pid) return;
  if (act === 'del-part') {
    const p = partMap.get(pid);
    if (!(await confirmDialog(`Usunąć uczestnika ${p.first_name} ${p.last_name}?`))) return;
    const { error } = await sb.from('participants').delete().eq('id', pid);
    if (error) return toast('Błąd', error.message, 'err');
    await loadData(); renderAll(); toast('Usunięto', 'Uczestnik skasowany', 'ok');
  } else if (act === 'add-dev') {
    addDevModal(partMap.get(pid));
  } else if (act === 'notes' || act === 'sub') {
    notesModal(pid);
  }
}

let adding = false;
async function addParticipant(tid, inputs, btn) {
  if (adding) return; // blokada podwójnego wstawienia (Enter+klik / dwa Entery zanim pola się wyczyściły)
  const vals = {};
  inputs.forEach((i) => { vals[i.dataset.add] = i.value.trim(); });
  if (!vals.first_name && !vals.last_name) { toast('Uzupełnij dane', 'Podaj przynajmniej imię lub nazwisko', 'err'); return; }
  adding = true;
  if (btn) btn.disabled = true;
  try {
    const { error } = await sb.from('participants').insert({
      training_id: tid, first_name: vals.first_name || '—', last_name: vals.last_name || '—',
      position: vals.position || null, main_project: vals.main_project || null, main_technology: vals.main_technology || null,
      email: vals.email || null, phone: vals.phone || null, attendance_confirmed: false,
    });
    if (error) { toast('Błąd', error.message, 'err'); if (btn) btn.disabled = false; return; }
    await loadData(); openIds.add(tid); renderAll();
    setTimeout(() => $(`.strefa-tr[data-tid="${tid}"] [data-add="first_name"]`)?.focus(), 30);
    toast('Dodano', 'Uczestnik dopisany', 'ok');
  } finally { adding = false; }
}

/* ── programista: zmiana etapu + dodanie uczestnika do listy programistów ── */
async function changeDevStage(sel) {
  const devId = sel.dataset.stageDev;
  const stage = Number(sel.value);
  if (!devId || !(stage >= 1 && stage <= 6)) return;
  const { error } = await sb.from('developers').update({ stage }).eq('id', devId);
  if (error) { toast('Błąd', error.message, 'err'); return; }
  const d = developers.find((x) => x.id === devId);
  if (d) d.stage = stage;
  const dot = sel.parentElement?.querySelector('.stage-dot');
  if (dot) dot.style.background = stageColor(stage);
  toast('Zapisano', `Etap ${stage} · ${stageName(stage)}`, 'ok');
}

async function addDevModal(p) {
  if (!p) return;
  let comps = [];
  try {
    const { data, error } = await sb.from('dev_companies').select('id, name').order('name', { ascending: true });
    if (error) throw error;
    comps = data || [];
  } catch (e) { toast('Błąd', e.message, 'err'); return; }
  const opts = comps.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('') + '<option value="">— bez firmy —</option>';
  const box = openModal(`
    <div class="strefa-modal__head">
      <div><h2>Dodaj do programistów</h2><p>${esc(p.first_name)} ${esc(p.last_name)}</p></div>
      <button class="strefa-iconbtn" data-close-x>${ICO.x}</button>
    </div>
    <div class="strefa-modal__body">
      <div class="strefa-field" style="margin-bottom:var(--space-md)">
        <label for="ad-company">Firma</label>
        <select class="strefa-select" id="ad-company">${opts}</select>
      </div>
      <p style="color:var(--color-text-inv-3);font-size:var(--text-caption);margin:0 0 var(--space-lg)">Utworzę profil w „Programiści" na etapie 1 (Początkujący), z danymi z zapisu: stanowisko, projekt, e-mail, telefon.</p>
      <div class="strefa-actions-row" style="justify-content:flex-end">
        <button class="strefa-btn strefa-btn--ghost" data-no>Anuluj</button>
        <button class="strefa-btn strefa-btn--accent" data-yes>Dodaj programistę</button>
      </div>
    </div>`);
  box.querySelectorAll('[data-close-x],[data-no]').forEach((b) => b.addEventListener('click', closeModal));
  const yes = box.querySelector('[data-yes]');
  yes.addEventListener('click', async () => {
    yes.disabled = true;
    const company_id = box.querySelector('#ad-company').value || null;
    const { error } = await sb.from('developers').insert({
      company_id,
      first_name: p.first_name || '—',
      last_name: p.last_name || '—',
      position: p.position || null,
      main_project: p.main_project || null,
      email: p.email || null,
      phone: p.phone || null,
      stage: 1,
    });
    if (error) { toast('Błąd', error.message, 'err'); yes.disabled = false; return; }
    closeModal();
    await loadData();
    renderAll();
    toast('Dodano', `${p.first_name} ${p.last_name} → Programiści`, 'ok');
  });
}

/* ── modal QR samozapisu ── */
function qrModal(t) {
  const url = `${window.location.origin}/zapis?t=${t.id}`;
  const screenUrl = `${window.location.origin}/qr?t=${t.id}`;
  const box = openModal(`
    <div class="strefa-modal__head">
      <div><h2>Kod QR — samozapis</h2><p>${esc(t.name)}</p></div>
      <button class="strefa-iconbtn" data-close-x>${ICO.x}</button>
    </div>
    <div class="strefa-modal__body" style="text-align:center">
      <div id="qrbox" style="background:#fff;padding:18px;border-radius:14px;display:inline-block;line-height:0"></div>
      <p style="color:var(--color-text-inv-2);font-size:var(--text-s);margin:var(--space-md) auto 0;max-width:40ch">Uczestnik skanuje telefonem i dopisuje się do listy. Nie masz wydruku? Otwórz <strong>ekran z kodem QR</strong> na dowolnym iPadzie i pokaż go sali.</p>

      <div style="margin-top:var(--space-md);text-align:left">
        <p style="font-size:var(--text-caption);color:var(--color-text-inv-3);margin:0 0 .25rem">Ekran z kodem QR — pokaż na iPadzie</p>
        <div style="display:flex;gap:.4rem">
          <input class="strefa-input" id="qr-screen-link" readonly value="${esc(screenUrl)}" style="text-align:center">
          <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="qr-screen-copy">Kopiuj</button>
        </div>
      </div>

      <div style="margin-top:.7rem;text-align:left">
        <p style="font-size:var(--text-caption);color:var(--color-text-inv-3);margin:0 0 .25rem">Link strony zapisu (bezpośredni)</p>
        <div style="display:flex;gap:.4rem">
          <input class="strefa-input" id="qr-link" readonly value="${esc(url)}" style="text-align:center">
          <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="qr-copy">Kopiuj</button>
        </div>
      </div>

      <div class="strefa-actions-row" style="justify-content:center;margin-top:var(--space-md)">
        <a class="strefa-btn strefa-btn--accent strefa-btn--sm" href="${esc(screenUrl)}" target="_blank" rel="noopener">Otwórz ekran QR →</a>
        <a class="strefa-btn strefa-btn--ghost strefa-btn--sm" href="${esc(url)}" target="_blank" rel="noopener">Strona zapisu →</a>
      </div>
    </div>`);
  box.querySelectorAll('[data-close-x]').forEach((b) => b.addEventListener('click', closeModal));
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const host = $('#qrbox', box);
    host.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 1, scalable: true });
    const el = host.querySelector('svg');
    if (el) { el.style.width = '230px'; el.style.height = '230px'; }
  } catch (e) {
    $('#qrbox', box).innerHTML = '<p style="color:#b00;margin:0">Nie udało się wygenerować kodu QR.</p>';
  }
  const bindCopy = (btnSel, inputSel, val) => $(btnSel, box)?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(val); toast('Skopiowano', 'Link w schowku', 'ok'); }
    catch (e) { $(inputSel, box)?.select(); }
  });
  bindCopy('#qr-copy', '#qr-link', url);
  bindCopy('#qr-screen-copy', '#qr-screen-link', screenUrl);
}

/* ── modal szkolenia (dodaj/edytuj) ── */
function trainingModal(t, opts = {}) {
  const isEdit = !!t;
  const box = openModal(`
    <div class="strefa-modal__head"><div><h2>${isEdit ? 'Edytuj szkolenie' : 'Nowe szkolenie'}</h2></div>
      <button class="strefa-iconbtn" data-close-x>${ICO.x}</button></div>
    <div class="strefa-modal__body">
      <div class="strefa-field" style="margin-bottom:var(--space-md)"><label>Nazwa *</label><input class="strefa-input" id="tf-name" value="${esc(t?.name || '')}" placeholder="np. Szkolenie w R&G Plus"></div>
      <div class="strefa-grid2">
        <div class="strefa-field"><label>Data</label><input class="strefa-input" id="tf-date" type="date" value="${t ? (t.training_date || '') : todayStr()}"></div>
        <div class="strefa-field"><label>Lokalizacja</label><input class="strefa-input" id="tf-loc" value="${esc(t?.location || '')}" placeholder="np. Sala"></div>
      </div>
      <div class="strefa-field" style="margin-top:var(--space-md)"><label>Opis</label><textarea class="strefa-textarea" id="tf-desc" placeholder="opcjonalnie">${esc(t?.description || '')}</textarea></div>
      <div class="strefa-actions-row">
        <button class="strefa-btn strefa-btn--ghost" data-close-x>Anuluj</button>
        <button class="strefa-btn strefa-btn--accent" id="tf-save">${isEdit ? 'Zapisz' : 'Dodaj szkolenie'}</button>
      </div>
    </div>`);
  box.querySelectorAll('[data-close-x]').forEach((b) => b.addEventListener('click', closeModal));
  $('#tf-name', box).focus();
  let saving = false;
  const saveBtn = $('#tf-save', box);
  saveBtn.addEventListener('click', async () => {
    if (saving) return; // blokada podwójnego utworzenia/zapisu szkolenia
    const name = $('#tf-name', box).value.trim();
    if (!name) { toast('Brak nazwy', 'Podaj nazwę szkolenia', 'err'); return; }
    saving = true;
    saveBtn.disabled = true;
    const payload = { name, training_date: $('#tf-date', box).value || null, location: $('#tf-loc', box).value.trim() || null, description: $('#tf-desc', box).value.trim() || null };
    const res = isEdit ? await sb.from('trainings').update(payload).eq('id', t.id) : await sb.from('trainings').insert(payload).select().single();
    if (res.error) { toast('Błąd', res.error.message, 'err'); saving = false; saveBtn.disabled = false; return; }
    closeModal();
    if (!isEdit && res.data) openIds.add(res.data.id);
    await loadData(); renderAll();
    toast(isEdit ? 'Zapisano' : 'Dodano', isEdit ? 'Szkolenie zaktualizowane' : 'Nowe szkolenie', 'ok');
    if (!isEdit && res.data && opts.afterCreate) opts.afterCreate(res.data);
  });
}

/* ── modal notatek + abonament ── */
async function notesModal(pid) {
  const p = partMap.get(pid);
  const box = openModal(`
    <div class="strefa-modal__head">
      <div><h2>${esc(p.first_name)} ${esc(p.last_name)}</h2><p>${esc(p.position || '')}${p.email ? ' · ' + esc(p.email) : ''}</p></div>
      <button class="strefa-iconbtn" data-close-x>${ICO.x}</button>
    </div>
    <div class="strefa-modal__body">
      <div class="strefa-modal__section">
        <h3>Abonament AI</h3>
        <div class="strefa-grid2">
          <div class="strefa-field"><label>Agent</label>
            <select class="strefa-select" id="sub-name">
              ${['', ...SUBS].map((s) => `<option value="${esc(s)}" ${(p.subscription || '') === s ? 'selected' : ''}>${s || '— brak —'}</option>`).join('')}
              <option value="__custom" ${p.subscription && !SUBS.includes(p.subscription) ? 'selected' : ''}>Inny (wpisz)…</option>
            </select>
          </div>
          <div class="strefa-field"><label>Data startu</label><input class="strefa-input" id="sub-date" type="date" value="${p.subscription_start_date || todayStr()}"></div>
        </div>
        <div class="strefa-field" id="sub-custom-wrap" style="margin-top:var(--space-sm);${p.subscription && !SUBS.includes(p.subscription) ? '' : 'display:none'}">
          <label>Nazwa własna</label><input class="strefa-input" id="sub-custom" value="${p.subscription && !SUBS.includes(p.subscription) ? esc(p.subscription) : ''}">
        </div>
        <div class="strefa-actions-row"><button class="strefa-btn strefa-btn--accent strefa-btn--sm" id="sub-save">Zapisz abonament</button></div>
      </div>
      <div class="strefa-modal__section">
        <h3>Nowa notatka</h3>
        <textarea class="strefa-textarea" id="note-text" placeholder="Obserwacje o tej osobie podczas szkolenia (pytania, reakcje, obawy, entuzjazm)…"></textarea>
        <div class="strefa-actions-row">
          <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="note-clear">Wyczyść</button>
          <button class="strefa-btn strefa-btn--accent strefa-btn--sm" id="note-save">Zapisz i przetwórz AI</button>
        </div>
      </div>
      <div class="strefa-modal__section">
        <h3>Historia notatek <span id="notes-count" style="color:var(--color-text-inv-3);font-weight:400"></span></h3>
        <div id="notes-list"><p class="note-empty">Wczytuję…</p></div>
      </div>
    </div>`);
  box.querySelectorAll('[data-close-x]').forEach((b) => b.addEventListener('click', closeModal));

  // abonament
  const selName = $('#sub-name', box), customWrap = $('#sub-custom-wrap', box), custom = $('#sub-custom', box);
  selName.addEventListener('change', () => { customWrap.style.display = selName.value === '__custom' ? '' : 'none'; });
  $('#sub-save', box).addEventListener('click', async () => {
    let sub = selName.value;
    if (sub === '__custom') sub = custom.value.trim();
    if (sub === '') sub = null;
    const date = $('#sub-date', box).value || null;
    const { error } = await sb.from('participants').update({ subscription: sub, subscription_start_date: date }).eq('id', pid);
    if (error) return toast('Błąd', error.message, 'err');
    p.subscription = sub; p.subscription_start_date = date;
    const cell = $(`.strefa-tr[data-tid="${p.training_id}"] tr[data-pid="${pid}"] .col-sub .dcell`);
    if (cell) cell.innerHTML = subBadge(p);
    updateCounts(p.training_id); renderStats();
    toast('Zapisano', 'Abonament zaktualizowany', 'ok');
  });

  // notatki
  $('#note-clear', box).addEventListener('click', () => { $('#note-text', box).value = ''; });
  $('#note-save', box).addEventListener('click', () => saveNote(pid, box));
  loadNotes(pid, box);
}

async function loadNotes(pid, box) {
  const { data, error } = await sb.from('participant_notes').select('*').eq('participant_id', pid).order('created_at', { ascending: false });
  const list = $('#notes-list', box); const cnt = $('#notes-count', box);
  if (error) { list.innerHTML = `<p class="note-empty">Błąd: ${esc(error.message)}</p>`; return; }
  cnt.textContent = `(${data.length})`;
  if (!data.length) { list.innerHTML = '<p class="note-empty">Brak notatek. Dodaj pierwszą powyżej.</p>'; return; }
  list.innerHTML = data.map((n) => noteHTML(n)).join('');
  $$('[data-note-del]', list).forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('Usunąć tę notatkę?'))) return;
    const { error } = await sb.from('participant_notes').delete().eq('id', b.dataset.noteDel);
    if (error) return toast('Błąd', error.message, 'err');
    loadNotes(pid, box); toast('Usunięto', 'Notatka skasowana', 'ok');
  }));
  $$('[data-note-edit]', list).forEach((b) => b.addEventListener('click', () => editNote(b.dataset.noteEdit, data.find((x) => x.id === b.dataset.noteEdit), pid, box)));
}
function noteHTML(n) {
  const edited = n.updated_at && n.created_at && n.updated_at !== n.created_at;
  return `<div class="note" data-note="${n.id}">
    <div class="note__head">
      <span class="note__time">${fmtDateTime(n.created_at)}${edited ? ' · edytowano' : ''}</span>
      <span style="display:flex;gap:.15rem">
        <button class="strefa-iconbtn" data-note-edit="${n.id}" title="Edytuj podsumowanie">${ICO.pencil}</button>
        <button class="strefa-iconbtn" data-note-del="${n.id}" title="Usuń">${ICO.trash}</button>
      </span>
    </div>
    ${n.ai_summary ? `<div class="note__summary">${esc(n.ai_summary)}</div>` : '<div class="note__summary note__summary--empty">Brak podsumowania AI</div>'}
    <details class="note__raw"><summary>Oryginalna notatka</summary><pre>${esc(n.raw_note)}</pre></details>
  </div>`;
}
function editNote(id, n, pid, box) {
  const el = $(`.note[data-note="${id}"]`, box);
  el.innerHTML = `<div class="strefa-field"><label>Podsumowanie AI</label><textarea class="strefa-textarea" id="ne-text">${esc(n.ai_summary || '')}</textarea></div>
    <div class="strefa-actions-row"><button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="ne-cancel">Anuluj</button><button class="strefa-btn strefa-btn--accent strefa-btn--sm" id="ne-save">Zapisz</button></div>`;
  $('#ne-cancel', el).addEventListener('click', () => loadNotes(pid, box));
  $('#ne-save', el).addEventListener('click', async () => {
    const { error } = await sb.from('participant_notes').update({ ai_summary: $('#ne-text', el).value.trim() || null }).eq('id', id);
    if (error) return toast('Błąd', error.message, 'err');
    loadNotes(pid, box); toast('Zapisano', 'Podsumowanie zaktualizowane', 'ok');
  });
}
async function saveNote(pid, box) {
  const ta = $('#note-text', box); const raw = ta.value.trim();
  if (!raw) { toast('Pusta notatka', 'Wpisz treść', 'err'); return; }
  const btn = $('#note-save', box); btn.disabled = true; btn.textContent = 'Zapisuję…';
  const p = partMap.get(pid);
  const { data, error } = await sb.from('participant_notes').insert({ participant_id: pid, raw_note: raw, ai_summary: null }).select().single();
  if (error) { btn.disabled = false; btn.textContent = 'Zapisz i przetwórz AI'; return toast('Błąd', error.message, 'err'); }
  ta.value = '';
  // przetwarzanie AI (Edge Function summarize-note)
  try {
    btn.textContent = 'AI analizuje…';
    const { data: ai, error: aiErr } = await sb.functions.invoke('summarize-note', { body: { raw_note: raw, participant_name: `${p.first_name} ${p.last_name}` } });
    const summary = ai?.summary || ai?.ai_summary || (typeof ai === 'string' ? ai : null);
    if (!aiErr && summary) await sb.from('participant_notes').update({ ai_summary: summary }).eq('id', data.id);
    toast(summary ? 'Zapisano + AI' : 'Zapisano', summary ? 'Notatka przetworzona' : 'Bez podsumowania AI', 'ok');
  } catch (e) { toast('Zapisano', 'Notatka zapisana (AI niedostępne)', 'ok'); }
  btn.disabled = false; btn.textContent = 'Zapisz i przetwórz AI';
  loadNotes(pid, box);
}

/* ── import / eksport ── */
async function importLegacy() {
  if (!(await confirmDialog('Zaimportować dane ze starej wersji (public.szron_*)? Rekordy o tych samych ID zostaną nadpisane w strefie.', 'Importuj', false))) return;
  toast('Import…', 'Pobieram dane ze starej wersji', 'ok');
  const pub = sb.schema('public');
  const { data: ts, error: e1 } = await pub.from('szron_trainings').select('id,name,training_date,location,description').eq('user_id', LEGACY_OWNER_ID);
  if (e1) return toast('Błąd importu', e1.message, 'err');
  if (!ts?.length) return toast('Brak danych', 'Nie znaleziono szkoleń do importu', 'err');
  const tIds = ts.map((t) => t.id);
  const { data: ps } = await pub.from('szron_training_participants').select('*').in('training_id', tIds);
  const pIds = (ps || []).map((p) => p.id);
  let ns = [];
  if (pIds.length) { const { data } = await pub.from('szron_participant_notes').select('*').in('participant_id', pIds); ns = data || []; }
  const r1 = await sb.from('trainings').upsert(ts, { onConflict: 'id' });
  if (r1.error) return toast('Błąd importu', r1.error.message, 'err');
  if (ps?.length) {
    const r2 = await sb.from('participants').upsert(ps.map((p) => ({ id: p.id, training_id: p.training_id, first_name: p.first_name, last_name: p.last_name, position: p.position, email: p.email, attendance_confirmed: p.attendance_confirmed, subscription: p.subscription, subscription_start_date: p.subscription_start_date })), { onConflict: 'id' });
    if (r2.error) return toast('Błąd importu', r2.error.message, 'err');
  }
  if (ns.length) await sb.from('participant_notes').upsert(ns.map((n) => ({ id: n.id, participant_id: n.participant_id, raw_note: n.raw_note, ai_summary: n.ai_summary })), { onConflict: 'id' });
  await loadData(); renderAll();
  toast('Zaimportowano', `${ts.length} szkoleń, ${(ps || []).length} uczestników, ${ns.length} notatek`, 'ok');
}

async function importFile(file) {
  let json;
  try { json = JSON.parse(await file.text()); } catch { return toast('Błąd pliku', 'Niepoprawny JSON', 'err'); }
  const arr = Array.isArray(json) ? json : (json.trainings || []);
  if (!arr.length) return toast('Pusty plik', 'Brak szkoleń w pliku', 'err');
  const T = [], P = [], N = [];
  for (const t of arr) {
    T.push({ id: t.id, name: t.name, training_date: t.training_date || null, location: t.location || null, description: t.description || null });
    for (const p of (t.participants || [])) {
      P.push({ id: p.id, training_id: t.id, first_name: p.first_name, last_name: p.last_name, position: p.position || null, email: p.email || null, phone: p.phone || null, attendance_confirmed: !!p.attendance_confirmed, subscription: p.subscription || null, subscription_start_date: p.subscription_start_date || null });
      for (const n of (p.notes || [])) N.push({ id: n.id, participant_id: p.id, raw_note: n.raw_note, ai_summary: n.ai_summary || null });
    }
  }
  if (!(await confirmDialog(`Zaimportować ${T.length} szkoleń i ${P.length} uczestników z pliku?`, 'Importuj', false))) return;
  let r = await sb.from('trainings').upsert(T, { onConflict: 'id' });
  if (r.error) return toast('Błąd', r.error.message, 'err');
  if (P.length) { r = await sb.from('participants').upsert(P, { onConflict: 'id' }); if (r.error) return toast('Błąd', r.error.message, 'err'); }
  if (N.length) await sb.from('participant_notes').upsert(N, { onConflict: 'id' });
  await loadData(); renderAll();
  toast('Zaimportowano', `${T.length} szkoleń, ${P.length} uczestników`, 'ok');
}

async function exportJSON() {
  // Notatki wszystkich uczestników jednym zapytaniem (zamiast N+1 po jednym na osobę), zgrupowane per uczestnik.
  const pids = trainings.flatMap((t) => t.participants.map((p) => p.id));
  const byPid = new Map();
  if (pids.length) {
    const { data } = await sb.from('participant_notes').select('participant_id,id,raw_note,ai_summary,created_at,updated_at').in('participant_id', pids).order('created_at');
    for (const { participant_id, ...n } of (data || [])) {
      if (!byPid.has(participant_id)) byPid.set(participant_id, []);
      byPid.get(participant_id).push(n);
    }
  }
  const out = [];
  for (const t of trainings) {
    const parts = t.participants.map((p) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name, position: p.position, email: p.email, phone: p.phone, attendance_confirmed: p.attendance_confirmed, subscription: p.subscription, subscription_start_date: p.subscription_start_date, notes: byPid.get(p.id) || [] }));
    out.push({ id: t.id, name: t.name, training_date: t.training_date, location: t.location, description: t.description, participants: parts });
  }
  downloadJSON(out, `szron-szkolenia-${todayStr()}.json`);
  toast('Wyeksportowano', 'Pobrano plik JSON', 'ok');
}

/* ── start ── */
async function init() {
  if (!(await getTeamUser())) return; // layout przekieruje na login

  $('#btn-add-training').addEventListener('click', () => trainingModal(null));
  $('#btn-qr')?.addEventListener('click', () => trainingModal(null, { afterCreate: (tr) => qrModal(tr) }));
  $('#btn-import').addEventListener('click', importLegacy);
  $('#btn-export').addEventListener('click', exportJSON);
  bindFileImport('#btn-import-file', '#file-input', importFile);

  bindSearch('#search', (q) => { query = q; renderAll(); });

  // delegacja bulk action (przyciski renderowane dynamicznie)
  $('#trainings').addEventListener('click', (e) => {
    const b = e.target.closest('[data-bulk]');
    if (b) { const tid = b.closest('.strefa-tr').dataset.tid; bulkAction(tid, b.dataset.bulk); }
  });

  await loadData();
  if (trainings.length) openIds.add(trainings[0].id); // pierwsze rozwinięte
  renderAll();

  // Realtime: zmiany doklejają się na żywo (zamiast pollingu co 15 s).
  startRealtime(sb, 'strefa-szkolenia-list', ['participants', 'trainings', 'developers'], pollRefresh);
}

init();
