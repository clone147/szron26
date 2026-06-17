// Aplikacja „Programiści" strefy zamkniętej SZRON — kokpit do prowadzenia programistów
// ku autonomicznemu programowaniu intencyjnemu. Dane w schemacie `strefa` (RLS), styl jak „Szkolenia".
import { getClient, getSessionUser, isAllowed } from './supabase.js';
import { akademia } from '../data/akademia.mjs';

const sb = getClient();

/* ── helpery DOM ── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => d ? new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d)) : '';
const fmtDateTime = (d) => d ? new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : '';
const todayStr = () => new Date().toISOString().slice(0, 10);
const telHref = (s) => String(s || '').replace(/[^\d+]/g, '');
const daysUntil = (d) => Math.round((new Date(d).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000);

/* ── ikony ── */
const ICO = {
  chev: '<svg class="strefa-tr__chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
};

/* ── model coachingu ── */
const STAGES = [
  { n: 1, name: 'Początkujący', hint: 'Pierwszy kontakt z AI — agent jako asystent, człowiek pyta.' },
  { n: 2, name: 'Prowadzący', hint: 'Formułuje intencję (co, po co, kryteria); agent pisze, dev recenzuje.' },
  { n: 3, name: 'Agentowy', hint: 'Pętle /loop, MCP — agent pracuje obok, człowiek kontroluje.' },
  { n: 4, name: 'Opanowujący', hint: 'CLAUDE.md, własne MCP, dostrajanie per zadanie.' },
  { n: 5, name: 'Autonomiczny', hint: 'Deleguje całe moduły — agent planuje, koduje, testuje.' },
  { n: 6, name: 'Architekt AI', hint: 'Mentoruje innych, projektuje workflow zespołu i strategię agentów.' },
];
const stageColor = (n) => `oklch(72% 0.15 ${25 + (Math.max(1, Math.min(6, n)) - 1) * 25})`;
const stageName = (n) => (STAGES[(n || 1) - 1] || STAGES[0]).name;
const MINDSETS = ['entuzjasta', 'pragmatyk', 'sceptyk'];
const AGENTS = ['Claude Code', 'Cursor', 'GitHub Copilot', 'Gemini CLI', 'Codex CLI', 'ChatGPT', 'LM Studio / lokalny', 'inny'];
const SUBS = ['Claude', 'Gemini', 'ChatGPT', 'Github Copilot', 'Brak'];
const ALLOWED_SKILLS = ['claude-code', 'claude-code-bezpieczenstwo', 'szkolenie-git', 'szkolenie-supabase-mcp', 'szkolenie-mysql', 'serwery-mcp', 'tips-and-tricks', 'petle', 'gemini-cli', 'codex-cli', 'lm-studio', 'llama-server'];
const SKILLS = akademia.filter((a) => ALLOWED_SKILLS.includes(a.slug)).map((a) => ({ slug: a.slug, title: a.title }));
const NONE = '__none__'; // grupa „bez firmy"

/* ── stan ── */
let companies = [];          // [{...c, developers:[...]}]
const devMap = new Map();    // did -> developer
let query = '';
const openIds = new Set();
let activeTd = null, editing = false;
let polling = false, adding = false;
let openDevId = null, activeTab = 'overview', tabBusy = false;
const NAV = ['first_name', 'last_name', 'position', 'main_project', 'email', 'phone'];
const MAXC = NAV.length - 1;

/* ── toasty ── */
function toast(title, body = '', kind = '') {
  const wrap = $('#toasts'); const t = document.createElement('div');
  t.className = 'strefa-toast' + (kind ? ` strefa-toast--${kind}` : '');
  t.innerHTML = `<strong>${esc(title)}</strong>${body ? `<span>${esc(body)}</span>` : ''}`;
  wrap.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3600);
}

/* ── modale / drawer ── */
function openModal(html, drawer = false) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="strefa-modal${drawer ? ' strefa-modal--drawer' : ''}"><div class="strefa-modal__scrim" data-close></div><div class="strefa-modal__box" role="dialog" aria-modal="true">${html}</div></div>`;
  const box = $('.strefa-modal__box', root);
  root.querySelector('[data-close]').addEventListener('click', closeModal);
  const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', onKey); root._onKey = onKey;
  return box;
}
function closeModal() {
  const root = $('#modal-root');
  if (root._onKey) document.removeEventListener('keydown', root._onKey);
  root.innerHTML = ''; openDevId = null;
}
function confirmDialog(message, okLabel = 'Usuń', danger = true) {
  return new Promise((resolve) => {
    const box = openModal(`<div class="strefa-modal__body"><p style="margin:0 0 var(--space-lg)">${esc(message)}</p>
      <div class="strefa-actions-row"><button class="strefa-btn strefa-btn--ghost" data-no>Anuluj</button>
      <button class="strefa-btn ${danger ? 'strefa-btn--danger' : 'strefa-btn--accent'}" data-yes>${esc(okLabel)}</button></div></div>`);
    box.querySelector('[data-no]').addEventListener('click', () => { closeModal(); resolve(false); });
    box.querySelector('[data-yes]').addEventListener('click', () => { closeModal(); resolve(true); });
    box.querySelector('[data-yes]').focus();
  });
}

/* ── DB load ── */
async function fetchData() {
  const [{ data: comp, error: ce }, { data: devs, error: de }] = await Promise.all([
    sb.from('dev_companies').select('*'),
    sb.from('developers').select('*, dev_skills(skill_key), dev_tasks(status)'),
  ]);
  if (ce) throw ce; if (de) throw de;
  const byComp = new Map();
  for (const d of (devs || [])) {
    d.skillsCount = (d.dev_skills || []).length;
    d.openTasks = (d.dev_tasks || []).filter((t) => t.status !== 'done').length;
    const key = d.company_id || NONE;
    if (!byComp.has(key)) byComp.set(key, []);
    byComp.get(key).push(d);
  }
  const list = (comp || []).map((c) => ({ ...c, developers: (byComp.get(c.id) || []) }));
  list.sort((a, b) => String(a.name).localeCompare(b.name, 'pl'));
  if (byComp.has(NONE)) list.push({ id: NONE, name: '— Bez firmy —', developers: byComp.get(NONE), _none: true });
  for (const c of list) c.developers.sort((a, b) => (a.last_name || '').localeCompare(b.last_name || '', 'pl'));
  return list;
}
function commit(list) {
  companies = list; devMap.clear();
  for (const c of companies) for (const d of c.developers) devMap.set(d.id, d);
}
function sigOf(list) {
  return JSON.stringify((list || []).map((c) => [c.id, c.name,
    c.developers.map((d) => [d.id, d.first_name, d.last_name, d.position, d.main_project, d.email, d.phone, d.stage, d.subscription, d.mindset, d.skillsCount, d.openTasks])]));
}
async function loadData() {
  try { commit(await fetchData()); } catch (e) { toast('Błąd ładowania', e.message, 'err'); }
}
async function dbUpdateDev(did, patch) {
  const { error } = await sb.from('developers').update(patch).eq('id', did);
  if (error) { toast('Błąd zapisu', error.message, 'err'); return false; }
  return true;
}

/* ── render: statystyki ── */
function renderStats() {
  const devs = companies.flatMap((c) => c.developers);
  const auto = devs.filter((d) => (d.stage || 1) >= 5).length;
  const openTasks = devs.reduce((a, d) => a + (d.openTasks || 0), 0);
  const dist = [0, 0, 0, 0, 0, 0];
  devs.forEach((d) => { dist[Math.max(1, Math.min(6, d.stage || 1)) - 1]++; });
  const spark = dist.map((n, i) => n ? `<span style="flex:${n};background:${stageColor(i + 1)}" title="Etap ${i + 1} · ${n} os."></span>` : '').join('');
  const realCompanies = companies.filter((c) => !c._none).length;
  $('#stats').innerHTML = [
    ['Firmy', realCompanies], ['Programiści', devs.length], ['Autonomiczni (5–6)', auto], ['Zadania otwarte', openTasks],
  ].map(([l, n]) => `<div class="strefa-stat"><div class="strefa-stat__num">${n}</div><div class="strefa-stat__lbl">${l}</div></div>`).join('')
    + `<div class="strefa-stat"><div class="stage-spark">${spark || '<span style="flex:1;background:var(--color-ink-3)"></span>'}</div><div class="strefa-stat__lbl">Rozkład etapów</div></div>`;
}

/* ── render: lista firm + siatka programistów ── */
function matches(d, c) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [d.first_name, d.last_name, d.position, d.main_project, d.email, d.phone, c.name].some((v) => String(v || '').toLowerCase().includes(q));
}
function visibleDevs(c) { return query ? c.developers.filter((d) => matches(d, c)) : c.developers; }

function stageChip(d) {
  const n = d.stage || 1;
  return `<span class="stage-chip" data-act="stage" title="Etap ${n} · ${esc(stageName(n))} (klik = zmień)" style="--sc:${stageColor(n)}">${n} · ${esc(stageName(n))}</span>`;
}
function skillBar(d) {
  const c = d.skillsCount || 0; const pct = Math.round((c / SKILLS.length) * 100);
  return `<span class="skill-bar skill-bar--cell" data-act="skills" title="Umiejętności ${c}/${SKILLS.length} (klik = profil)"><span class="skill-bar__fill" style="width:${pct}%"></span></span><span class="skill-bar__num">${c}/${SKILLS.length}</span>`;
}
function cellInner(d, col) {
  const val = d[col]; const muted = !val ? ' dcell--muted' : '';
  return `<div class="dcell${muted}">${val ? esc(val) : '—'}</div>`;
}
function devRow(d, r) {
  return `<tr data-did="${d.id}">
    <td class="col-stage"><div class="dcell" style="cursor:pointer">${stageChip(d)}</div></td>
    <td data-col="first_name" data-r="${r}" data-c="0">${cellInner(d, 'first_name')}</td>
    <td data-col="last_name" data-r="${r}" data-c="1">${cellInner(d, 'last_name')}</td>
    <td data-col="position" data-r="${r}" data-c="2">${cellInner(d, 'position')}</td>
    <td data-col="main_project" data-r="${r}" data-c="3">${cellInner(d, 'main_project')}</td>
    <td data-col="email" data-r="${r}" data-c="4">${cellInner(d, 'email')}</td>
    <td data-col="phone" data-r="${r}" data-c="5">${cellInner(d, 'phone')}</td>
    <td class="col-skills"><div class="dcell" data-act="skills" style="cursor:pointer">${skillBar(d)}</div></td>
    <td class="col-actions"><div class="dcell">
      ${d.phone ? `<a class="strefa-iconbtn strefa-iconbtn--call" href="tel:${esc(telHref(d.phone))}" title="Zadzwoń: ${esc(d.phone)}">${ICO.phone}</a>` : ''}
      <button class="strefa-iconbtn" data-act="open" title="Otwórz profil">${ICO.user}</button>
      <button class="strefa-iconbtn" data-act="del-dev" title="Usuń programistę">${ICO.trash}</button>
    </div></td>
  </tr>`;
}
function gridHTML(c) {
  const devs = visibleDevs(c);
  const rows = devs.length ? devs.map((d, i) => devRow(d, i)).join('')
    : `<tr><td colspan="9" class="dgrid-empty">${query ? 'Brak pasujących programistów.' : 'Brak programistów. Dodaj poniżej.'}</td></tr>`;
  return `<div class="dgrid-wrap" tabindex="0"><table class="dgrid">
    <thead><tr><th class="col-stage">Etap</th><th>Imię</th><th>Nazwisko</th><th>Stanowisko</th><th>Projekt</th><th>E-mail</th><th>Telefon</th><th class="col-skills">Umiejętności</th><th class="col-actions"></th></tr></thead>
    <tbody>${rows}</tbody>
    <tr class="dgrid-add"><td></td><td colspan="8">
      <div style="display:flex;gap:.4rem;padding:.35rem .5rem;flex-wrap:wrap;align-items:center">
        <input class="strefa-input" data-add="first_name" placeholder="Imię" style="width:7rem">
        <input class="strefa-input" data-add="last_name" placeholder="Nazwisko" style="width:8rem">
        <input class="strefa-input" data-add="position" placeholder="Stanowisko" style="width:8rem">
        <input class="strefa-input" data-add="main_project" placeholder="Projekt" style="width:8rem">
        <input class="strefa-input" data-add="email" type="email" placeholder="E-mail" style="width:10rem">
        <input class="strefa-input" data-add="phone" type="tel" placeholder="Telefon" style="width:7rem">
        <button class="strefa-btn strefa-btn--accent strefa-btn--sm" data-add-go>Dodaj</button>
      </div></td></tr>
  </table></div>
  <p class="grid-hint"><span><kbd>↑↓←→</kbd> ruch</span><span><kbd>Enter</kbd>/<kbd>F2</kbd> edycja</span><span><kbd>Tab</kbd> dalej</span><span>klik etap = zmień · klik profil = szczegóły</span></p>`;
}
function companyHTML(c) {
  const open = openIds.has(c.id);
  const devs = c.developers;
  const auto = devs.filter((d) => (d.stage || 1) >= 5).length;
  return `<section class="strefa-tr ${open ? 'is-open' : ''}" data-cid="${c.id}">
    <div class="strefa-tr__head" data-toggle>
      ${ICO.chev}
      <div class="strefa-tr__grow"><div class="strefa-tr__name">${esc(c.name)}</div>
        <div class="strefa-tr__meta"><span>${devs.length} ${devs.length === 1 ? 'programista' : 'programistów'}</span></div></div>
      <div class="strefa-tr__counts">
        <span class="strefa-chip strefa-chip--count">${devs.length} os.</span>
        ${auto ? `<span class="strefa-chip strefa-chip--ok">${auto} autonom.</span>` : ''}
      </div>
      <div class="strefa-tr__actions">
        <button class="strefa-iconbtn" data-act="add-dev" title="Dodaj programistę">${ICO.plus}</button>
        ${c._none ? '' : `<button class="strefa-iconbtn" data-act="edit-company" title="Edytuj firmę">${ICO.pencil}</button>
        <button class="strefa-iconbtn" data-act="del-company" title="Usuń firmę">${ICO.trash}</button>`}
      </div>
    </div>
    ${open ? `<div class="strefa-tr__body">${gridHTML(c)}</div>` : ''}
  </section>`;
}
function renderAll() {
  renderStats();
  const list = query ? companies.filter((c) => visibleDevs(c).length) : companies;
  if (query) list.forEach((c) => openIds.add(c.id));
  $('#companies').innerHTML = list.map(companyHTML).join('');
  $('#empty').hidden = companies.length !== 0;
  bindGrids();
  activeTd = null;
}

/* ── nawigacja klawiaturą po siatce (jak w Szkoleniach) ── */
function setActive(td) {
  if (activeTd) activeTd.classList.remove('is-active');
  activeTd = td;
  if (td) { td.classList.add('is-active'); td.closest('.dgrid-wrap')?.focus({ preventScroll: true }); td.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
}
const cellAt = (grid, r, c) => grid.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
function caretIndexFromPoint(td, x, y) {
  try {
    if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (r && td.contains(r.startContainer)) return r.startOffset; }
    else if (document.caretPositionFromPoint) { const pp = document.caretPositionFromPoint(x, y); if (pp && td.contains(pp.offsetNode)) return pp.offset; }
  } catch (e) { /* ignore */ }
  return null;
}
function beginEdit(td, opts = {}) {
  if (editing) return;
  const col = td.dataset.col; if (!col) return;
  const { caret = null, appendChar = null } = opts;
  const did = td.closest('tr').dataset.did; const d = devMap.get(did);
  const orig = d[col] ?? '';
  editing = true;
  if (activeTd && activeTd !== td) activeTd.classList.remove('is-active');
  activeTd = td; td.classList.add('is-editing');
  td.innerHTML = `<input class="dgrid-edit" type="text">`;
  const inp = td.querySelector('input');
  inp.value = appendChar != null ? orig + appendChar : orig;
  inp.focus();
  try {
    const pos = (appendChar == null && caret != null) ? Math.min(caret, inp.value.length) : inp.value.length;
    inp.setSelectionRange(pos, pos);
  } catch (e) { /* ignore */ }
  let done = false;
  const finish = async (dir) => {
    if (done) return; done = true;
    const val = inp.value.trim(); editing = false; td.classList.remove('is-editing');
    td.innerHTML = cellInner(d, col); setActive(td);
    if (val !== (orig ?? '')) {
      d[col] = val; td.innerHTML = cellInner(d, col);
      if (!(await dbUpdateDev(did, { [col]: val || null }))) { d[col] = orig; td.innerHTML = cellInner(d, col); }
    }
    if (dir) moveActive(td.closest('.dgrid'), td, dir);
  };
  const cancel = () => { if (done) return; done = true; editing = false; td.classList.remove('is-editing'); td.innerHTML = cellInner(d, col); setActive(td); };
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish('down'); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    else if (e.key === 'Tab') { e.preventDefault(); finish(e.shiftKey ? 'prev' : 'next'); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); finish('down'); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); finish('up'); }
  });
  inp.addEventListener('blur', () => finish(null));
}
function moveActive(grid, td, dir) {
  let r = +td.dataset.r, c = +td.dataset.c;
  if (dir === 'down') r++; else if (dir === 'up') r = Math.max(0, r - 1);
  else if (dir === 'next') { c++; if (c > MAXC) { c = 0; r++; } }
  else if (dir === 'prev') { c--; if (c < 0) { c = MAXC; r = Math.max(0, r - 1); } }
  const nt = cellAt(grid, r, c); if (nt) setActive(nt);
}
function bindGrids() {
  $$('.strefa-tr').forEach((sec) => {
    const cid = sec.dataset.cid;
    const head = $('.strefa-tr__head', sec);
    head.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (a) { e.stopPropagation(); companyAction(a.dataset.act, cid); return; }
      if (openIds.has(cid)) openIds.delete(cid); else openIds.add(cid);
      renderAll();
    });
    const grid = $('.dgrid', sec); if (!grid) return;
    const wrap = $('.dgrid-wrap', sec);
    grid.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      const tr = e.target.closest('tr');
      if (a) { devRowAction(a.dataset.act, tr?.dataset.did, a, e); return; }
      const td = e.target.closest('td[data-col]');
      if (td) { const caret = caretIndexFromPoint(td, e.clientX, e.clientY); beginEdit(td, { caret }); }
    });
    const addGo = $('[data-add-go]', sec);
    const addInputs = $$('[data-add]', sec);
    const doAdd = () => addDeveloper(cid, addInputs, addGo);
    addGo?.addEventListener('click', doAdd);
    addInputs.forEach((inp) => inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } }));
    wrap.addEventListener('keydown', (e) => {
      if (editing) return;
      if (!activeTd || !grid.contains(activeTd)) return;
      const td = activeTd; let r = +td.dataset.r, c = +td.dataset.c; let handled = true;
      switch (e.key) {
        case 'ArrowRight': c = Math.min(MAXC, c + 1); break;
        case 'ArrowLeft': c = Math.max(0, c - 1); break;
        case 'ArrowDown': r++; break;
        case 'ArrowUp': r = Math.max(0, r - 1); break;
        case 'Tab': e.preventDefault(); moveActive(grid, td, e.shiftKey ? 'prev' : 'next'); return;
        case 'Enter': case 'F2': e.preventDefault(); beginEdit(td); return;
        default:
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); beginEdit(td, { appendChar: e.key }); }
          handled = false;
      }
      if (handled) { const nt = cellAt(grid, r, c); if (nt) { e.preventDefault(); setActive(nt); } }
    });
  });
}

/* ── akcje firmy ── */
async function companyAction(act, cid) {
  const c = companies.find((x) => x.id === cid);
  if (act === 'add-dev') { openIds.add(cid); renderAll(); setTimeout(() => $(`.strefa-tr[data-cid="${cid}"] [data-add="first_name"]`)?.focus(), 30); }
  else if (act === 'edit-company') companyModal(c);
  else if (act === 'del-company') {
    if (!(await confirmDialog(`Usunąć firmę „${c.name}"? Programiści zostaną odpięci (nie skasowani).`))) return;
    const { error } = await sb.from('dev_companies').delete().eq('id', cid);
    if (error) return toast('Błąd', error.message, 'err');
    await loadData(); renderAll(); toast('Usunięto', 'Firma skasowana', 'ok');
  }
}
function companyModal(c) {
  const isEdit = !!c;
  const box = openModal(`<div class="strefa-modal__head"><div><h2>${isEdit ? 'Edytuj firmę' : 'Nowa firma'}</h2></div><button class="strefa-iconbtn" data-close-x>${ICO.x}</button></div>
    <div class="strefa-modal__body"><div class="strefa-field"><label>Nazwa firmy *</label><input class="strefa-input" id="cf-name" value="${esc(c?.name || '')}" placeholder="np. R&G Plus"></div>
    <div class="strefa-actions-row"><button class="strefa-btn strefa-btn--ghost" data-close-x>Anuluj</button><button class="strefa-btn strefa-btn--accent" id="cf-save">${isEdit ? 'Zapisz' : 'Dodaj firmę'}</button></div></div>`);
  box.querySelectorAll('[data-close-x]').forEach((b) => b.addEventListener('click', closeModal));
  $('#cf-name', box).focus();
  let saving = false;
  $('#cf-save', box).addEventListener('click', async () => {
    if (saving) return;
    const name = $('#cf-name', box).value.trim(); if (!name) return toast('Brak nazwy', 'Podaj nazwę firmy', 'err');
    saving = true; $('#cf-save', box).disabled = true;
    const res = isEdit ? await sb.from('dev_companies').update({ name }).eq('id', c.id) : await sb.from('dev_companies').insert({ name }).select().single();
    if (res.error) { toast('Błąd', res.error.message, 'err'); saving = false; $('#cf-save', box).disabled = false; return; }
    closeModal(); if (!isEdit && res.data) openIds.add(res.data.id);
    await loadData(); renderAll(); toast(isEdit ? 'Zapisano' : 'Dodano', 'Firma', 'ok');
  });
}

/* ── akcje wiersza programisty ── */
async function addDeveloper(cid, inputs, btn) {
  if (adding) return;
  const vals = {}; inputs.forEach((i) => { vals[i.dataset.add] = i.value.trim(); });
  if (!vals.first_name && !vals.last_name) { toast('Uzupełnij dane', 'Podaj imię lub nazwisko', 'err'); return; }
  adding = true; if (btn) btn.disabled = true;
  try {
    const { error } = await sb.from('developers').insert({
      company_id: cid === NONE ? null : cid, first_name: vals.first_name || '—', last_name: vals.last_name || '—',
      position: vals.position || null, main_project: vals.main_project || null, email: vals.email || null, phone: vals.phone || null, stage: 1,
    });
    if (error) { toast('Błąd', error.message, 'err'); if (btn) btn.disabled = false; return; }
    await loadData(); openIds.add(cid); renderAll();
    setTimeout(() => $(`.strefa-tr[data-cid="${cid}"] [data-add="first_name"]`)?.focus(), 30);
    toast('Dodano', 'Programista dopisany', 'ok');
  } finally { adding = false; }
}
function devRowAction(act, did, anchor, ev) {
  if (!did) return;
  if (act === 'open') openProfile(did);
  else if (act === 'skills') openProfile(did, 'skills');
  else if (act === 'stage') stagePopover(did, anchor);
  else if (act === 'del-dev') (async () => {
    const d = devMap.get(did);
    if (!(await confirmDialog(`Usunąć programistę ${d.first_name} ${d.last_name}? Usunie też jego notatki, spotkania, zadania, prompty, maile.`))) return;
    const { error } = await sb.from('developers').delete().eq('id', did);
    if (error) return toast('Błąd', error.message, 'err');
    await loadData(); renderAll(); toast('Usunięto', 'Programista skasowany', 'ok');
  })();
}
function stagePopover(did, anchor) {
  const d = devMap.get(did); if (!d) return;
  document.querySelector('.stage-pop')?.remove();
  const pop = document.createElement('div'); pop.className = 'stage-pop';
  pop.innerHTML = STAGES.map((s) => `<button data-n="${s.n}" class="${d.stage === s.n ? 'is-active' : ''}"><span class="stage-pop__dot" style="background:${stageColor(s.n)}"></span>${s.n} · ${esc(s.name)}</button>`).join('');
  document.body.appendChild(pop);
  const rect = anchor.getBoundingClientRect();
  pop.style.left = `${Math.min(rect.left, window.innerWidth - 240)}px`;
  pop.style.top = `${rect.bottom + 4}px`;
  const close = () => { pop.remove(); document.removeEventListener('mousedown', onOut); };
  const onOut = (e) => { if (!pop.contains(e.target)) close(); };
  setTimeout(() => document.addEventListener('mousedown', onOut), 0);
  pop.querySelectorAll('button').forEach((b) => b.addEventListener('click', async () => {
    const n = +b.dataset.n; close();
    d.stage = n; renderAll();
    if (!(await dbUpdateDev(did, { stage: n }))) { await loadData(); renderAll(); }
    else toast('Etap', `${n} · ${stageName(n)}`, 'ok');
    if (openDevId === did) renderProfile();
  }));
}

/* ── PROFIL — drawer z zakładkami ── */
const TABS = [['overview', 'Przegląd'], ['notes', 'Notatki'], ['meetings', 'Spotkania'], ['tasks', 'Zadania'], ['prompts', 'Prompty'], ['emails', 'Maile']];
async function openProfile(did, tab = 'overview') {
  openDevId = did; activeTab = tab;
  const box = openModal('<div class="strefa-prof"></div>', true);
  box._cid = box; // marker
  renderProfile();
}
function profileHost() { return $('#modal-root .strefa-prof'); }
function renderProfile() {
  const host = profileHost(); if (!host) return;
  const d = devMap.get(openDevId); if (!d) { closeModal(); return; }
  const compName = companies.find((c) => c.id === (d.company_id || NONE))?.name || '— Bez firmy —';
  host.innerHTML = `
    <div class="strefa-modal__head">
      <div>
        <h2>${esc(d.first_name)} ${esc(d.last_name)}</h2>
        <p>${esc(d.position || '')}${d.position ? ' · ' : ''}${esc(compName)} · <span class="stage-chip" style="--sc:${stageColor(d.stage || 1)}">${d.stage || 1} · ${esc(stageName(d.stage || 1))}</span></p>
      </div>
      <button class="strefa-iconbtn" data-close-x>${ICO.x}</button>
    </div>
    <div class="strefa-tabs" role="tablist">
      ${TABS.map(([k, l]) => `<button class="strefa-tab ${activeTab === k ? 'is-active' : ''}" data-tab="${k}" role="tab" aria-selected="${activeTab === k}">${l}</button>`).join('')}
    </div>
    <div class="strefa-modal__body" id="tabpanel"></div>`;
  host.querySelector('[data-close-x]').addEventListener('click', closeModal);
  host.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { activeTab = b.dataset.tab; renderProfile(); }));
  const panel = $('#tabpanel', host);
  if (activeTab === 'overview') renderOverview(panel, d);
  else if (activeTab === 'notes') renderListTab(panel, d, 'notes');
  else if (activeTab === 'meetings') renderListTab(panel, d, 'meetings');
  else if (activeTab === 'tasks') renderListTab(panel, d, 'tasks');
  else if (activeTab === 'prompts') renderListTab(panel, d, 'prompts');
  else if (activeTab === 'emails') renderEmailsTab(panel, d);
}

/* — zakładka Przegląd — */
function renderOverview(panel, d) {
  panel.innerHTML = `
    <div class="strefa-modal__section">
      <h3>Dane</h3>
      <div class="strefa-grid2">
        <div class="strefa-field"><label>Imię</label><input class="strefa-input" id="o-first" value="${esc(d.first_name || '')}"></div>
        <div class="strefa-field"><label>Nazwisko</label><input class="strefa-input" id="o-last" value="${esc(d.last_name || '')}"></div>
        <div class="strefa-field"><label>Stanowisko</label><input class="strefa-input" id="o-pos" value="${esc(d.position || '')}"></div>
        <div class="strefa-field"><label>Główny projekt</label><input class="strefa-input" id="o-proj" value="${esc(d.main_project || '')}"></div>
        <div class="strefa-field"><label>E-mail</label><input class="strefa-input" id="o-email" value="${esc(d.email || '')}"></div>
        <div class="strefa-field"><label>Telefon</label><input class="strefa-input" id="o-phone" value="${esc(d.phone || '')}"></div>
        <div class="strefa-field"><label>Firma</label><select class="strefa-select" id="o-company">
          <option value="">— Bez firmy —</option>
          ${companies.filter((c) => !c._none).map((c) => `<option value="${c.id}" ${d.company_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select></div>
      </div>
      <div class="strefa-actions-row"><button class="strefa-btn strefa-btn--accent strefa-btn--sm" id="o-save">Zapisz dane</button></div>
    </div>

    <div class="strefa-modal__section">
      <h3>Etap dojrzałości</h3>
      <div class="stage-ladder">${STAGES.map((s) => {
        const cur = d.stage || 1;
        const cls = s.n === cur ? 'is-current' : (s.n < cur ? 'is-done' : '');
        return `<button class="stage-step ${cls}" data-stage="${s.n}" title="${esc(s.hint)}" style="--sc:${stageColor(s.n)}"><span class="stage-step__dot">${s.n}</span><span class="stage-step__lbl">${esc(s.name)}</span></button>`;
      }).join('')}</div>
      <p class="stage-hint">${esc((STAGES[(d.stage || 1) - 1] || STAGES[0]).hint)}</p>
      <div class="strefa-field" style="margin-top:var(--space-md)"><label>Następny krok / sugestia coacha</label><textarea class="strefa-textarea" id="o-next" placeholder="Co dalej, by przejść na wyższy etap…">${esc(d.next_step || '')}</textarea></div>
      <div class="strefa-actions-row"><button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="o-next-save">Zapisz następny krok</button></div>
    </div>

    <div class="strefa-modal__section">
      <h3>Umiejętności <span style="color:var(--color-text-inv-3);font-weight:400" id="sk-count"></span></h3>
      <div class="skill-bar" style="margin:.2rem 0 .8rem"><span class="skill-bar__fill" id="sk-fill"></span></div>
      <div class="skill-check" id="sk-list">Wczytuję…</div>
    </div>

    <div class="strefa-modal__section">
      <h3>Obserwacje</h3>
      <div class="strefa-grid2">
        <div class="strefa-field"><label>Ulubiony agent</label><select class="strefa-select" id="o-agent"><option value="">—</option>${AGENTS.map((a) => `<option ${d.fav_agent === a ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
        <div class="strefa-field"><label>Nastawienie</label><select class="strefa-select" id="o-mind"><option value="">—</option>${MINDSETS.map((m) => `<option ${d.mindset === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
        <div class="strefa-field"><label>Abonament AI</label><select class="strefa-select" id="o-sub"><option value="">—</option>${SUBS.map((s) => `<option ${d.subscription === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="strefa-field"><label>Data abonamentu</label><input class="strefa-input" type="date" id="o-subdate" value="${d.subscription_start_date || ''}"></div>
      </div>
      <div class="strefa-field" style="margin-top:var(--space-sm)"><label>Blokery</label><textarea class="strefa-textarea" id="o-block" placeholder="Co hamuje przed autonomią…">${esc(d.blockers || '')}</textarea></div>
      <div class="strefa-actions-row"><button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="o-obs-save">Zapisz obserwacje</button></div>
    </div>`;

  // dane
  $('#o-save', panel).addEventListener('click', async () => {
    const patch = { first_name: $('#o-first', panel).value.trim() || '—', last_name: $('#o-last', panel).value.trim() || '—',
      position: $('#o-pos', panel).value.trim() || null, main_project: $('#o-proj', panel).value.trim() || null,
      email: $('#o-email', panel).value.trim() || null, phone: $('#o-phone', panel).value.trim() || null,
      company_id: $('#o-company', panel).value || null };
    if (await dbUpdateDev(d.id, patch)) { Object.assign(d, patch); toast('Zapisano', 'Dane', 'ok'); await loadData(); renderAll(); renderProfile(); }
  });
  // następny krok
  $('#o-next-save', panel).addEventListener('click', async () => {
    const v = $('#o-next', panel).value.trim() || null;
    if (await dbUpdateDev(d.id, { next_step: v })) { d.next_step = v; toast('Zapisano', 'Następny krok', 'ok'); }
  });
  // drabinka etapów
  panel.querySelectorAll('[data-stage]').forEach((b) => b.addEventListener('click', async () => {
    const n = +b.dataset.stage; d.stage = n; renderAll();
    if (await dbUpdateDev(d.id, { stage: n })) { toast('Etap', `${n} · ${stageName(n)}`, 'ok'); renderProfile(); }
  }));
  // obserwacje
  $('#o-obs-save', panel).addEventListener('click', async () => {
    const patch = { fav_agent: $('#o-agent', panel).value || null, mindset: $('#o-mind', panel).value || null,
      subscription: $('#o-sub', panel).value || null, subscription_start_date: $('#o-subdate', panel).value || null,
      blockers: $('#o-block', panel).value.trim() || null };
    if (await dbUpdateDev(d.id, patch)) { Object.assign(d, patch); toast('Zapisano', 'Obserwacje', 'ok'); renderAll(); }
  });
  loadSkills(panel, d);
}
async function loadSkills(panel, d) {
  const { data } = await sb.from('dev_skills').select('skill_key').eq('developer_id', d.id);
  const done = new Set((data || []).map((x) => x.skill_key));
  d.skillsCount = done.size;
  const list = $('#sk-list', panel); if (!list) return;
  list.innerHTML = SKILLS.map((s) => `<label class="skill-row ${done.has(s.slug) ? 'is-done' : ''}">
    <input type="checkbox" data-skill="${s.slug}" ${done.has(s.slug) ? 'checked' : ''}>
    <span>${esc(s.title)}</span>
    <a href="/${s.slug}" target="_blank" rel="noopener" class="strefa-iconbtn" title="Otwórz materiał">${ICO.open}</a>
  </label>`).join('');
  const upd = () => { const c = $$('#sk-list input:checked', panel).length; $('#sk-count', panel).textContent = `${c}/${SKILLS.length}`; $('#sk-fill', panel).style.width = `${Math.round(c / SKILLS.length * 100)}%`; };
  upd();
  list.querySelectorAll('[data-skill]').forEach((cb) => cb.addEventListener('change', async () => {
    const slug = cb.dataset.skill; const row = cb.closest('.skill-row');
    if (cb.checked) {
      row.classList.add('is-done');
      const { error } = await sb.from('dev_skills').insert({ developer_id: d.id, skill_key: slug });
      if (error && !String(error.message).includes('duplicate')) { cb.checked = false; row.classList.remove('is-done'); toast('Błąd', error.message, 'err'); }
    } else {
      row.classList.remove('is-done');
      const { error } = await sb.from('dev_skills').delete().eq('developer_id', d.id).eq('skill_key', slug);
      if (error) { cb.checked = true; row.classList.add('is-done'); toast('Błąd', error.message, 'err'); }
    }
    upd(); d.skillsCount = $$('#sk-list input:checked', panel).length; renderStats();
    const sec = $(`.strefa-tr [data-did="${d.id}"] .col-skills .dcell`); if (sec) sec.innerHTML = skillBar(d);
  }));
}

/* — wspólny renderer zakładek listowych: notes / meetings / tasks / prompts — */
async function renderListTab(panel, d, kind) {
  panel.innerHTML = `<div class="strefa-modal__section" id="add-sec"></div><div id="list-sec">Wczytuję…</div>`;
  const addSec = $('#add-sec', panel);
  if (kind === 'notes') addSec.innerHTML = `<h3>Nowa notatka</h3><textarea class="strefa-textarea" id="x-note" placeholder="Obserwacja, ustalenie, wniosek…"></textarea>
    <div class="strefa-actions-row"><button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="x-clear">Wyczyść</button><button class="strefa-btn strefa-btn--accent strefa-btn--sm" id="x-add">Dodaj notatkę</button></div>`;
  if (kind === 'meetings') addSec.innerHTML = `<h3>Nowe spotkanie</h3><div class="strefa-grid2">
    <div class="strefa-field"><label>Termin</label><input class="strefa-input" type="datetime-local" id="x-at"></div>
    <div class="strefa-field"><label>Tytuł</label><input class="strefa-input" id="x-title" placeholder="np. 1:1 — MCP setup"></div></div>
    <div class="strefa-field" style="margin-top:var(--space-sm)"><label>Notatki</label><textarea class="strefa-textarea" id="x-notes" placeholder="Agenda / ustalenia…"></textarea></div>
    <div class="strefa-actions-row"><button class="strefa-btn strefa-btn--accent strefa-btn--sm" id="x-add">Dodaj spotkanie</button></div>`;
  if (kind === 'tasks') addSec.innerHTML = `<h3>Nowe zadanie</h3><div class="strefa-grid2">
    <div class="strefa-field"><label>Zadanie</label><input class="strefa-input" id="x-title" placeholder="np. Napisz feature z /loop"></div>
    <div class="strefa-field"><label>Termin</label><input class="strefa-input" type="date" id="x-due"></div></div>
    <div class="strefa-actions-row"><button class="strefa-btn strefa-btn--accent strefa-btn--sm" id="x-add">Dodaj zadanie</button></div>`;
  if (kind === 'prompts') addSec.innerHTML = `<h3>Nowy prompt</h3><div class="strefa-field"><label>Tytuł</label><input class="strefa-input" id="x-title" placeholder="np. Retry z exponential backoff"></div>
    <div class="strefa-field" style="margin-top:var(--space-sm)"><label>Treść promptu</label><textarea class="strefa-textarea" id="x-prompt" placeholder="Wklej najlepszy prompt…"></textarea></div>
    <div class="strefa-actions-row"><button class="strefa-btn strefa-btn--accent strefa-btn--sm" id="x-add">Dodaj prompt (${fmtDate(todayStr())})</button></div>`;
  $('#x-clear', addSec)?.addEventListener('click', () => { const t = $('#x-note', addSec); if (t) t.value = ''; });
  let busy = false;
  $('#x-add', addSec)?.addEventListener('click', async () => {
    if (busy) return; busy = true; const btn = $('#x-add', addSec); btn.disabled = true;
    try { await addListItem(d, kind, addSec); await loadList(d, kind); }
    finally { busy = false; const b = $('#x-add', addSec); if (b) b.disabled = false; }
  });
  loadList(d, kind);
}
async function addListItem(d, kind, sec) {
  if (kind === 'notes') {
    const note = $('#x-note', sec).value.trim(); if (!note) return toast('Pusto', 'Wpisz notatkę', 'err');
    const { error } = await sb.from('dev_notes').insert({ developer_id: d.id, note });
    if (error) return toast('Błąd', error.message, 'err'); $('#x-note', sec).value = ''; toast('Dodano', 'Notatka', 'ok');
  } else if (kind === 'meetings') {
    const title = $('#x-title', sec).value.trim(); const at = $('#x-at', sec).value;
    const { error } = await sb.from('dev_meetings').insert({ developer_id: d.id, title: title || null, notes: $('#x-notes', sec).value.trim() || null, meeting_at: at ? new Date(at).toISOString() : new Date().toISOString() });
    if (error) return toast('Błąd', error.message, 'err'); $('#x-title', sec).value = ''; $('#x-notes', sec).value = ''; toast('Dodano', 'Spotkanie', 'ok');
  } else if (kind === 'tasks') {
    const title = $('#x-title', sec).value.trim(); if (!title) return toast('Pusto', 'Wpisz zadanie', 'err');
    const { error } = await sb.from('dev_tasks').insert({ developer_id: d.id, title, due_date: $('#x-due', sec).value || null });
    if (error) return toast('Błąd', error.message, 'err'); $('#x-title', sec).value = ''; $('#x-due', sec).value = ''; toast('Dodano', 'Zadanie', 'ok');
  } else if (kind === 'prompts') {
    const title = $('#x-title', sec).value.trim(); const prompt = $('#x-prompt', sec).value.trim();
    if (!title || !prompt) return toast('Pusto', 'Podaj tytuł i treść', 'err');
    const { error } = await sb.from('dev_prompts').insert({ developer_id: d.id, title, prompt });
    if (error) return toast('Błąd', error.message, 'err'); $('#x-title', sec).value = ''; $('#x-prompt', sec).value = ''; toast('Dodano', 'Prompt', 'ok');
  }
}
async function loadList(d, kind) {
  const host = $('#list-sec'); if (!host) return;
  if (kind === 'notes') {
    const { data } = await sb.from('dev_notes').select('*').eq('developer_id', d.id).order('created_at', { ascending: false });
    host.innerHTML = (data || []).length ? data.map((n) => `<div class="note" data-id="${n.id}"><div class="note__head"><span class="note__time">${fmtDateTime(n.created_at)}</span><button class="strefa-iconbtn" data-del="dev_notes" data-id="${n.id}">${ICO.trash}</button></div><pre style="white-space:pre-wrap;font-family:var(--font-body);margin:0;font-size:var(--text-s)">${esc(n.note)}</pre></div>`).join('') : '<p class="note-empty">Brak notatek.</p>';
  } else if (kind === 'meetings') {
    const { data } = await sb.from('dev_meetings').select('*').eq('developer_id', d.id).order('meeting_at', { ascending: false });
    host.innerHTML = (data || []).length ? data.map((m) => {
      const up = !m.done && new Date(m.meeting_at) >= new Date();
      const du = daysUntil(m.meeting_at);
      const when = up && du >= 0 ? `<span class="strefa-chip strefa-chip--count">${du === 0 ? 'dziś' : du === 1 ? 'jutro' : `za ${du} dni`}</span>` : '';
      return `<div class="meet-item ${up ? 'meet-item--upcoming' : ''} ${m.done ? 'is-done' : ''}" data-id="${m.id}">
        <div class="note__head"><span class="note__time">${fmtDateTime(m.meeting_at)} ${when}</span>
          <span style="display:flex;gap:.15rem"><label class="meet-done" title="Odbyte"><input type="checkbox" data-done="${m.id}" ${m.done ? 'checked' : ''}></label><button class="strefa-iconbtn" data-del="dev_meetings" data-id="${m.id}">${ICO.trash}</button></span></div>
        ${m.title ? `<strong>${esc(m.title)}</strong>` : ''}${m.notes ? `<p style="margin:.3rem 0 0;color:var(--color-text-inv-2);font-size:var(--text-s);white-space:pre-wrap">${esc(m.notes)}</p>` : ''}</div>`;
    }).join('') : '<p class="note-empty">Brak spotkań.</p>';
    host.querySelectorAll('[data-done]').forEach((cb) => cb.addEventListener('change', async () => {
      await sb.from('dev_meetings').update({ done: cb.checked }).eq('id', cb.dataset.done); loadList(d, 'meetings');
    }));
  } else if (kind === 'tasks') {
    const { data } = await sb.from('dev_tasks').select('*').eq('developer_id', d.id).order('due_date', { ascending: true, nullsFirst: false });
    const order = { todo: 0, doing: 1, done: 2 };
    const sorted = (data || []).sort((a, b) => (order[a.status] - order[b.status]) || String(a.due_date || '').localeCompare(String(b.due_date || '')));
    host.innerHTML = sorted.length ? sorted.map((t) => {
      const overdue = t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date(new Date().toDateString());
      return `<div class="task-item ${overdue ? 'task-item--overdue' : ''} ${t.status === 'done' ? 'is-done' : ''}" data-id="${t.id}">
        <select class="task-status" data-status="${t.id}">${[['todo', 'Do zrobienia'], ['doing', 'W toku'], ['done', 'Zrobione']].map(([v, l]) => `<option value="${v}" ${t.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="task-title">${esc(t.title)}</span>
        ${t.due_date ? `<span class="task-due ${overdue ? 'is-overdue' : ''}">${fmtDate(t.due_date)}</span>` : ''}
        <button class="strefa-iconbtn" data-del="dev_tasks" data-id="${t.id}">${ICO.trash}</button></div>`;
    }).join('') : '<p class="note-empty">Brak zadań.</p>';
    host.querySelectorAll('[data-status]').forEach((sel) => sel.addEventListener('change', async () => {
      await sb.from('dev_tasks').update({ status: sel.value }).eq('id', sel.dataset.status); await loadList(d, 'tasks'); renderStats();
      const dd = devMap.get(d.id); // odśwież licznik openTasks w pamięci
    }));
  } else if (kind === 'prompts') {
    const { data } = await sb.from('dev_prompts').select('*').eq('developer_id', d.id).order('used_on', { ascending: false });
    host.innerHTML = (data || []).length ? data.map((p) => `<div class="prompt-card" data-id="${p.id}">
      <div class="note__head"><div><strong>${esc(p.title)}</strong> <span class="note__time">${fmtDate(p.used_on)}</span></div>
        <span style="display:flex;gap:.15rem"><button class="strefa-iconbtn" data-copy="${p.id}" title="Kopiuj">${ICO.copy}</button><button class="strefa-iconbtn" data-del="dev_prompts" data-id="${p.id}">${ICO.trash}</button></span></div>
      <pre style="white-space:pre-wrap;font-family:var(--font-body);margin:.4rem 0 0;font-size:var(--text-s);color:var(--color-text-inv-2)">${esc(p.prompt)}</pre></div>`).join('') : '<p class="note-empty">Brak promptów.</p>';
    host.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
      const p = (data || []).find((x) => x.id === b.dataset.copy); try { await navigator.clipboard.writeText(p.prompt); toast('Skopiowano', 'Prompt w schowku', 'ok'); } catch (e) { /* ignore */ }
    }));
  }
  // wspólne: usuwanie
  host.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('Usunąć tę pozycję?'))) return;
    const { error } = await sb.from(b.dataset.del).delete().eq('id', b.dataset.id);
    if (error) return toast('Błąd', error.message, 'err');
    loadList(d, kind); renderStats();
  }));
}

/* — zakładka Maile — */
let mailDraftId = null;
async function renderEmailsTab(panel, d) {
  mailDraftId = null;
  panel.innerHTML = `<div class="strefa-modal__section">
      <h3 id="mail-head">Nowy mail do ${esc(d.email || '—')}</h3>
      ${d.email ? '' : '<p class="strefa-msg strefa-msg--err">Programista nie ma adresu e-mail — uzupełnij w „Przegląd".</p>'}
      <div class="strefa-field"><label>Temat</label><input class="strefa-input" id="m-subject" placeholder="Temat maila"></div>
      <div class="strefa-field" style="margin-top:var(--space-sm)"><label>Treść</label><textarea class="strefa-textarea" id="m-body" style="min-height:8rem" placeholder="Cześć…"></textarea></div>
      <div class="strefa-actions-row">
        <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="m-draft">Zapisz szkic</button>
        <button class="strefa-btn strefa-btn--accent strefa-btn--sm" id="m-send" ${d.email ? '' : 'disabled'}>Wyślij</button>
      </div></div>
    <div class="strefa-modal__section"><h3>Historia <span id="m-count" style="color:var(--color-text-inv-3);font-weight:400"></span></h3><div id="mail-list">Wczytuję…</div></div>`;
  const subj = () => $('#m-subject', panel).value.trim();
  const body = () => $('#m-body', panel).value;
  let saving = false;
  const saveDraft = async () => {
    if (!subj() && !body().trim()) return null;
    if (mailDraftId) { await sb.from('dev_emails').update({ subject: subj() || '(bez tematu)', body: body() }).eq('id', mailDraftId); return mailDraftId; }
    const { data, error } = await sb.from('dev_emails').insert({ developer_id: d.id, recipient_email: d.email || '', subject: subj() || '(bez tematu)', body: body(), status: 'draft' }).select('id').single();
    if (error) { toast('Błąd', error.message, 'err'); return null; }
    mailDraftId = data.id; return data.id;
  };
  $('#m-draft', panel).addEventListener('click', async () => {
    if (saving) return; saving = true; $('#m-draft', panel).disabled = true;
    const id = await saveDraft(); if (id) toast('Zapisano', 'Szkic', 'ok');
    saving = false; $('#m-draft', panel).disabled = false; await loadMails(d, panel);
  });
  $('#m-send', panel).addEventListener('click', async () => {
    if (saving) return;
    if (!d.email) return toast('Brak adresu', 'Uzupełnij e-mail programisty', 'err');
    if (!subj() && !body().trim()) return toast('Pusto', 'Temat lub treść', 'err');
    if (!(await confirmDialog(`Wysłać maila do ${d.email}? Po wysłaniu nie będzie można go edytować.`, 'Wyślij', false))) return;
    saving = true; const btn = $('#m-send', panel); btn.disabled = true; btn.textContent = 'Wysyłam…';
    const id = await saveDraft();
    if (!id) { saving = false; btn.disabled = false; btn.textContent = 'Wyślij'; return; }
    const { data, error } = await sb.functions.invoke('strefa-send-dev-email', { body: { email_id: id } });
    if (error || !data?.success) { toast('Błąd wysyłki', (data && data.error) || error?.message || 'nieznany', 'err'); btn.disabled = false; btn.textContent = 'Wyślij'; saving = false; await loadMails(d, panel); return; }
    toast('Wysłano', `do ${d.email}`, 'ok');
    mailDraftId = null; $('#m-subject', panel).value = ''; $('#m-body', panel).value = '';
    btn.textContent = 'Wyślij'; btn.disabled = false; saving = false;
    await loadMails(d, panel);
  });
  loadMails(d, panel);
}
async function loadMails(d, panel) {
  const host = $('#mail-list', panel); if (!host) return;
  const { data } = await sb.from('dev_emails').select('*').eq('developer_id', d.id).order('created_at', { ascending: false });
  $('#m-count', panel).textContent = `(${(data || []).length})`;
  host.innerHTML = (data || []).length ? data.map((m) => {
    const sent = m.status === 'sent';
    const failed = m.status === 'failed';
    const badge = sent ? `<span class="mail-badge mail-badge--sent">Wysłano ${fmtDateTime(m.sent_at)}</span>` : failed ? '<span class="mail-badge mail-badge--err">Błąd</span>' : '<span class="mail-badge mail-badge--draft">Szkic</span>';
    return `<div class="mail-item mail-item--${m.status}" data-id="${m.id}">
      <div class="note__head"><div><strong>${esc(m.subject)}</strong> ${badge}</div>
        <span style="display:flex;gap:.15rem">${sent ? '' : `<button class="strefa-iconbtn" data-edit="${m.id}" title="Edytuj szkic">${ICO.pencil}</button><button class="strefa-iconbtn" data-delmail="${m.id}" title="Usuń">${ICO.trash}</button>`}</span></div>
      <details><summary style="cursor:pointer;color:var(--color-text-inv-3);font-size:var(--text-caption)">Treść</summary><pre style="white-space:pre-wrap;font-family:var(--font-body);margin:.4rem 0 0;font-size:var(--text-s);color:var(--color-text-inv-2)">${esc(m.body)}</pre></details>
      ${failed && m.error_message ? `<p style="color:oklch(72% 0.17 25);font-size:var(--text-caption);margin:.3rem 0 0">${esc(m.error_message)}</p>` : ''}</div>`;
  }).join('') : '<p class="note-empty">Brak maili.</p>';
  host.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    const m = data.find((x) => x.id === b.dataset.edit);
    mailDraftId = m.id; $('#m-subject', panel).value = m.subject === '(bez tematu)' ? '' : m.subject; $('#m-body', panel).value = m.body;
    $('#m-head', panel).textContent = 'Edytujesz szkic'; $('#m-subject', panel).focus();
  }));
  host.querySelectorAll('[data-delmail]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('Usunąć szkic maila?'))) return;
    const { error } = await sb.from('dev_emails').delete().eq('id', b.dataset.delmail);
    if (error) return toast('Błąd', error.message, 'err');
    if (mailDraftId === b.dataset.delmail) mailDraftId = null;
    loadMails(d, panel);
  }));
}

/* ── realtime + ciche auto-odświeżanie listy ── */
async function pollRefresh() {
  if (polling || document.hidden || editing) return;
  if (document.getElementById('modal-root')?.children.length) return; // dialog/drawer otwarty
  const root = document.getElementById('companies');
  if (root && root.contains(document.activeElement)) return;
  polling = true;
  try {
    const list = await fetchData();
    if (sigOf(list) !== sigOf(companies)) { const y = window.scrollY; commit(list); renderAll(); window.scrollTo({ top: y }); }
  } catch (e) { /* cicho */ } finally { polling = false; }
}
async function startRealtime() {
  try { const { data } = await sb.auth.getSession(); if (data?.session) sb.realtime.setAuth(data.session.access_token); } catch (e) { /* ignore */ }
  let deb;
  const trigger = () => { clearTimeout(deb); deb = setTimeout(pollRefresh, 400); };
  sb.channel('strefa-programisci-list')
    .on('postgres_changes', { event: '*', schema: 'strefa', table: 'developers' }, trigger)
    .on('postgres_changes', { event: '*', schema: 'strefa', table: 'dev_companies' }, trigger)
    .on('postgres_changes', { event: '*', schema: 'strefa', table: 'dev_skills' }, trigger)
    .subscribe((s) => { if (s === 'SUBSCRIBED') pollRefresh(); });
  setInterval(pollRefresh, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pollRefresh(); });
}

/* ── import / eksport JSON ── */
async function exportJSON() {
  const out = [];
  for (const c of companies.filter((x) => !x._none)) out.push({ id: c.id, name: c.name });
  const { data: devs } = await sb.from('developers').select('*');
  const blob = new Blob([JSON.stringify({ companies: out, developers: devs || [] }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `szron-programisci-${todayStr()}.json`; a.click(); URL.revokeObjectURL(a.href);
  toast('Wyeksportowano', 'Pobrano JSON', 'ok');
}
async function importFile(file) {
  let json; try { json = JSON.parse(await file.text()); } catch { return toast('Błąd', 'Niepoprawny JSON', 'err'); }
  if (!(await confirmDialog(`Zaimportować ${(json.companies || []).length} firm i ${(json.developers || []).length} programistów?`, 'Importuj', false))) return;
  if ((json.companies || []).length) await sb.from('dev_companies').upsert(json.companies.map((c) => ({ id: c.id, name: c.name })), { onConflict: 'id' });
  if ((json.developers || []).length) await sb.from('developers').upsert(json.developers.map((d) => ({ id: d.id, company_id: d.company_id, first_name: d.first_name, last_name: d.last_name, position: d.position, main_project: d.main_project, email: d.email, phone: d.phone, stage: d.stage || 1, subscription: d.subscription })), { onConflict: 'id' });
  await loadData(); renderAll(); toast('Zaimportowano', '', 'ok');
}
async function importLegacy() {
  if (!(await confirmDialog('Zaimportować programistów ze starej wersji (public.szron_*)?', 'Importuj', false))) return;
  const pub = sb.schema('public');
  const { data: comps } = await pub.from('szron_dev_companies').select('id,name');
  const { data: progs } = await pub.from('szron_programmers').select('id,company_id,first_name,last_name,position,main_project,email,phone');
  if (comps?.length) await sb.from('dev_companies').upsert(comps, { onConflict: 'id' });
  if (progs?.length) await sb.from('developers').upsert(progs.map((p) => ({ ...p, stage: 1 })), { onConflict: 'id' });
  await loadData(); renderAll(); toast('Zaimportowano', `${comps?.length || 0} firm, ${progs?.length || 0} programistów`, 'ok');
}

/* ── start ── */
async function init() {
  const user = await getSessionUser();
  if (!user || !isAllowed(user.email)) return;
  $('#btn-add-company').addEventListener('click', () => companyModal(null));
  $('#btn-add-dev').addEventListener('click', () => {
    // dodaj do pierwszej firmy / rozwiń ją, lub do „bez firmy"
    const first = companies.find((c) => !c._none) || companies[0];
    if (first) { openIds.add(first.id); renderAll(); setTimeout(() => $(`.strefa-tr[data-cid="${first.id}"] [data-add="first_name"]`)?.focus(), 40); }
    else companyModal(null);
  });
  $('#btn-export').addEventListener('click', exportJSON);
  $('#btn-import-file').addEventListener('click', () => $('#file-input').click());
  $('#btn-import-legacy')?.addEventListener('click', importLegacy);
  $('#file-input').addEventListener('change', (e) => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; });
  let timer;
  $('#search').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { query = e.target.value.trim(); renderAll(); }, 150); });
  await loadData();
  if (companies.length) openIds.add(companies[0].id);
  renderAll();
  startRealtime();
}
init();
