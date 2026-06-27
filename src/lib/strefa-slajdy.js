// Edytor slajdów SZRON — v2 (model obiektowy). Faza 0: dokument sceny `content`,
// wspólny renderer (edytor/miniatury/prezentacja), autosave całego content, undo/redo.
import { getClient, getSessionUser, isAllowed, uploadSlideImage } from './supabase.js';
import { SLIDE_W, SLIDE_H, slideToContent, contentToPatch, newObject, sanitizeHtml, textToHtml, genId } from './slajdy/slide-model.js';
import { mountSlide, applyScale, renderSlideInner } from './slajdy/slide-renderer.js';
import { createHistory } from './slajdy/slide-store.js';
import { createObjectEditor } from './slajdy/slide-editor.js';

const sb = getClient();
const clone = (x) => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

/* ── helpery DOM ── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (c) => String(c || '').trim().toLowerCase();
const toHex = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : null);
const plSlajdy = (n) => {
  if (n === 1) return 'slajd';
  const d = n % 10, h = n % 100;
  return (d >= 2 && d <= 4 && !(h >= 12 && h <= 14)) ? 'slajdy' : 'slajdów';
};

const ICO = {
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5h16v2M9 5v14M7 19h4"/></svg>',
  img: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>',
  empty: '<svg class="deck-empty__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M12 9v4M10 11h4"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/></svg>',
  redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h1"/></svg>',
};

/* ── toasty / modale ── */
function toast(title, body = '', kind = '') {
  const wrap = $('#toasts');
  const t = document.createElement('div');
  t.className = 'strefa-toast' + (kind ? ` strefa-toast--${kind}` : '');
  t.innerHTML = `<strong>${esc(title)}</strong>${body ? `<span>${esc(body)}</span>` : ''}`;
  wrap.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3800);
}
function openModal(html) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="strefa-modal"><div class="strefa-modal__scrim" data-close></div><div class="strefa-modal__box" role="dialog" aria-modal="true">${html}</div></div>`;
  const box = $('.strefa-modal__box', root);
  root.querySelector('[data-close]').addEventListener('click', closeModal);
  const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', onKey);
  root._onKey = onKey;
  return box;
}
function closeModal() {
  const root = $('#modal-root');
  if (root._onKey) document.removeEventListener('keydown', root._onKey);
  root.innerHTML = '';
}
function confirmDialog(message, okLabel = 'Usuń', danger = true) {
  return new Promise((resolve) => {
    const box = openModal(`
      <div class="strefa-modal__body">
        <p style="margin:0 0 var(--space-lg)">${esc(message)}</p>
        <div class="strefa-actions-row">
          <button class="strefa-btn strefa-btn--ghost" data-no>Anuluj</button>
          <button class="strefa-btn ${danger ? 'strefa-btn--danger' : 'strefa-btn--accent'}" data-yes>${esc(okLabel)}</button>
        </div>
      </div>`);
    box.querySelector('[data-no]').addEventListener('click', () => { closeModal(); resolve(false); });
    box.querySelector('[data-yes]').addEventListener('click', () => { closeModal(); resolve(true); });
    box.querySelector('[data-yes]').focus();
  });
}

/* ── stan ── */
const trainingId = new URLSearchParams(location.search).get('t');
let training = null;
let slides = [];            // wiersze DB z domateralizowanym `.content`
let current = 0;
const saveTimers = new Map();
let dragFrom = -1;
const history = createHistory();
let editorRO = null;
let objEditor = null;       // kontroler Moveable bieżącego canvasu

const BG_PRESETS = [
  { name: 'Grafit', value: '#14181f' }, { name: 'Granat', value: '#0f1f4d' }, { name: 'Stal', value: '#334155' },
  { name: 'Pomarańcz', value: '#f97316' }, { name: 'Biały', value: '#ffffff' }, { name: 'Czarny', value: '#000000' },
];

/* ── tło decku (CSS background do renderera) ── */
function deckBgCss() {
  if (training.slides_bg_image) return `url("${training.slides_bg_image}") center / cover no-repeat`;
  return training.slides_bg_color || 'var(--color-ink)';
}
async function saveDeckBg(patch) {
  Object.assign(training, patch);
  const { error } = await sb.from('trainings').update(patch).eq('id', trainingId);
  if (error) toast('Błąd tła', error.message, 'err');
}
// motyw decku (jeden punkt prawdy: akcent / kolor tekstu / font dla nowych obiektów + paleta)
function theme() { return { accent: '#f97316', textColor: '#ffffff', font: 'helvetica', ...(training.slides_theme || {}) }; }
async function saveTheme(patch) {
  training.slides_theme = { ...theme(), ...patch };
  const { error } = await sb.from('trainings').update({ slides_theme: training.slides_theme }).eq('id', trainingId);
  if (error) toast('Błąd motywu', error.message, 'err');
}

/* ── DB load ── */
async function load() {
  const { data: t, error: te } = await sb.from('trainings')
    .select('id,name,slides_bg_color,slides_bg_image,slides_theme').eq('id', trainingId).single();
  training = te ? null : t;
  if (!training) return;
  const { data: s } = await sb.from('training_slides')
    .select('*').eq('training_id', trainingId).order('position').order('created_at');
  slides = s || [];
  slides.forEach((row) => { row.content = slideToContent(row); history.reset(row.id, clone(row.content)); });
}

/* ── status zapisu ── */
let statusTimer = null;
function setStatus(state) {
  const el = $('#save-status'); if (!el) return;
  clearTimeout(statusTimer);
  el.className = 'slides-status' + (state === 'saving' ? ' is-saving' : state === 'error' ? ' is-error' : ' is-saved');
  if (state === 'saving') el.textContent = 'Zapisywanie…';
  else if (state === 'error') el.textContent = 'Błąd zapisu';
  else { el.textContent = 'Zapisano'; statusTimer = setTimeout(() => { el.textContent = ''; el.className = 'slides-status'; }, 1600); }
}

/* ── zapis content + notatek ── */
function saveContentNow(s) {
  sb.from('training_slides').update(contentToPatch(s.content)).eq('id', s.id)
    .then(({ error }) => { if (error) { toast('Błąd zapisu', error.message, 'err'); setStatus('error'); } else setStatus('saved'); });
}
function scheduleSaveContent(s) {
  setStatus('saving');
  const key = s.id + '|content';
  clearTimeout(saveTimers.get(key));
  saveTimers.set(key, setTimeout(() => { saveTimers.delete(key); saveContentNow(s); }, 600));
}
function flushSaveContent(s) {
  const key = s.id + '|content';
  if (!saveTimers.has(key)) return;
  clearTimeout(saveTimers.get(key)); saveTimers.delete(key);
  saveContentNow(s);
}
function scheduleSave(id, patch) {
  setStatus('saving');
  const key = id + '|' + Object.keys(patch).join(',');
  clearTimeout(saveTimers.get(key));
  saveTimers.set(key, setTimeout(() => {
    saveTimers.delete(key);
    sb.from('training_slides').update(patch).eq('id', id).then(({ error }) => { if (error) { toast('Błąd zapisu', error.message, 'err'); setStatus('error'); } else setStatus('saved'); });
  }, 600));
}
function flushSave(id, patch) {
  const key = id + '|' + Object.keys(patch).join(',');
  clearTimeout(saveTimers.get(key)); saveTimers.delete(key);
  sb.from('training_slides').update(patch).eq('id', id).then(({ error }) => { if (error) { toast('Błąd zapisu', error.message, 'err'); setStatus('error'); } else setStatus('saved'); });
}

// Wczytaj zawartość edytowalnych obiektów tekstowych z DOM do modelu. Zwraca true, gdy zmiana.
function captureTextDom() {
  const s = slides[current]; if (!s) return false;
  let changed = false;
  $$('#canvas .slide-obj__text[contenteditable]').forEach((el) => {
    const id = el.closest('.slide-obj')?.dataset.id;
    const obj = s.content.objects.find((o) => o.id === id);
    if (!obj) return;
    const html = sanitizeHtml(el.innerHTML); // rich text (allowlista)
    if ((obj.richText || '') !== html) { obj.richText = html; changed = true; }
  });
  return changed;
}
function flushCurrent() {
  const s = slides[current]; if (!s) return;
  if (captureTextDom()) saveContentNow(s); else flushSaveContent(s);   // wymuś zapis gdy capture coś zmienił
  const nta = $('#slide-notes');
  if (nta && nta.value !== (s.notes || '')) { s.notes = nta.value; flushSave(s.id, { notes: nta.value }); }
}

/* ── historia / undo-redo ── */
function pushHistory() { const s = slides[current]; if (s) { history.push(s.id, clone(s.content)); updateUndoButtons(); } }
function updateUndoButtons() {
  const s = slides[current];
  const u = $('#btn-undo'), r = $('#btn-redo');
  if (u) u.disabled = !s || !history.canUndo(s.id);
  if (r) r.disabled = !s || !history.canRedo(s.id);
}
function doUndo() {
  const s = slides[current]; if (!s) return;
  captureTextDom();
  const snap = history.undo(s.id); if (!snap) return;
  s.content = clone(snap); saveContentNow(s); redraw();
}
function doRedo() {
  const s = slides[current]; if (!s) return;
  const snap = history.redo(s.id); if (!snap) return;
  s.content = clone(snap); saveContentNow(s); redraw();
}

/* ── render ── */
function redraw() { renderEditor(); renderInspector(); renderStrip(); updateCounts(); updateUndoButtons(); }
function updateCounts() {
  const n = slides.length;
  const dc = $('#deck-count'); if (dc) dc.textContent = `${n} ${plSlajdy(n)}`;
  const rc = $('#rail-count'); if (rc) rc.textContent = String(n);
}
function rescaleAll() { $$('.slide-stage').forEach((st) => applyScale(st.parentElement, st)); objEditor?.updateRect(); positionObjBar(); }

function renderEditor() {
  const stage = $('#editor-stage');
  if (!slides.length) {
    stage.innerHTML = `
      <div class="deck-canvas-wrap">
        <div class="slide-viewport is-empty" style="display:grid;place-items:center">
          <div class="deck-empty">
            ${ICO.empty}
            <p class="deck-empty__title">Pusty deck</p>
            <p class="deck-empty__hint">Zacznij od pierwszego slajdu.</p>
            <button class="strefa-btn strefa-btn--accent" id="btn-add-first" type="button">+ Dodaj pierwszy slajd</button>
          </div>
        </div>
      </div>`;
    $('#btn-add-first')?.addEventListener('click', addSlide);
    return;
  }
  const s = slides[current];
  stage.innerHTML = `
    <div class="deck-toolbar">
      <div class="deck-toolbar__group">
        <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="btn-add-text" type="button">${ICO.text}<span>Tekst</span></button>
        <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="btn-add-img" type="button">${ICO.img}<span>Obrazek</span></button>
        <div class="deck-shape-wrap">
          <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="btn-add-shape" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8" rx="1"/><circle cx="16" cy="16" r="5"/></svg><span>Kształt</span></button>
          <div class="deck-shape-menu" id="shape-menu" hidden>
            <button data-shape="rect" type="button">▭ Prostokąt</button>
            <button data-shape="ellipse" type="button">◯ Elipsa</button>
            <button data-shape="triangle" type="button">△ Trójkąt</button>
            <button data-shape="line" type="button">— Linia</button>
            <button data-shape="arrow" type="button">→ Strzałka</button>
          </div>
        </div>
        <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="btn-layouts" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/></svg><span>Layout</span></button>
      </div>
      <span class="deck-toolbar__spacer"></span>
      <span class="deck-toolbar__counter">${current + 1} / ${slides.length}</span>
    </div>
    <div class="deck-canvas-wrap">
      <div class="slide-viewport" id="canvas"></div>
      <div class="obj-bar" id="obj-bar" hidden></div>
      <div class="fmt-bar" id="fmt-bar" hidden></div>
    </div>
    <div class="deck-notes">
      <label class="deck-notes__label" for="slide-notes">Notatki prezentera</label>
      <textarea class="deck-notes__field" id="slide-notes" placeholder="Notatki dla prezentera — widoczne tylko tu, nie na slajdzie…">${esc(s.notes || '')}</textarea>
    </div>`;
  const host = $('#canvas');
  mountSlide(host, s.content, { deckBg: deckBgCss(), editable: false, observe: false });
  if (editorRO) { editorRO.disconnect(); editorRO = null; }
  const st = host.querySelector('.slide-stage');
  if (st && 'ResizeObserver' in window) { editorRO = new ResizeObserver(() => { applyScale(host, st); objEditor?.updateRect(); }); editorRO.observe(host); }
  const keepIds = objEditor ? objEditor.selectedIds() : [];
  if (objEditor) objEditor.destroy();
  stopBarTracking(); { const b = $('#obj-bar'); if (b) b.hidden = true; }
  objEditor = createObjectEditor({ host, getSlide: () => slides[current], commit: editorCommit, onSelect: renderRightPanel, onEmptyDblClick: insertTextAt, onEditStart: showFmtBar, onEditEnd: hideFmtBar, onDrawShape });
  bindEditorChrome();
  bindCanvasDrop(host);
  // przywróć selekcję synchronicznie (koniec migotania) — tylko obiekty które nadal istnieją
  const stillThere = keepIds.filter((id) => s.content.objects.some((o) => o.id === id));
  if (stillThere.length) objEditor.selectMany(stillThere);
}

// prawy panel: właściwości zaznaczonego obiektu / grupy / tło decku
function renderRightPanel(model) {
  if (model && model.multi) renderMultiInspector(model.ids);
  else if (model) renderObjectInspector(model);
  else renderInspector();
  renderObjBar(model);
}

/* pływający pasek kontekstowy nad zaznaczeniem */
function renderObjBar(model) {
  const bar = $('#obj-bar'); if (!bar) return;
  if (!model) { bar.hidden = true; bar.innerHTML = ''; return; }
  const isText = !model.multi && model.type === 'text';
  bar.innerHTML = model.multi
    ? `<button data-act="dup" title="Duplikuj (⌘D)">⧉</button><button data-act="del" class="obj-bar__del" title="Usuń (Delete)">${ICO.trash}</button>`
    : `${isText ? `<button data-act="edit" title="Edytuj tekst">${ICO.text}</button>` : ''}<button data-act="dup" title="Duplikuj (⌘D)">⧉</button><button data-act="front" title="Na wierzch">⤒</button><button data-act="back" title="Na spód">⤓</button><button data-act="del" class="obj-bar__del" title="Usuń (Delete)">${ICO.trash}</button>`;
  bar.querySelectorAll('button').forEach((b) => b.addEventListener('pointerdown', (e) => e.stopPropagation()));
  bar.querySelectorAll('button').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const a = b.dataset.act;
    if (a === 'edit' && !model.multi) objEditor.enterTextEdit(model.id);
    else if (a === 'dup') duplicateSelectedObject();
    else if (a === 'front') zorder('front');
    else if (a === 'back') zorder('back');
    else if (a === 'del') deleteSelectedObject();
  }));
  positionObjBar();
}
function stopBarTracking() { const b = $('#obj-bar'); if (b) b.hidden = true; }
function positionObjBar() {
  const bar = $('#obj-bar'); if (!bar) return;
  const ids = objEditor?.selectedIds() || [];
  if (!ids.length || objEditor.isEditing()) { bar.hidden = true; return; }
  const wrap = $('.deck-canvas-wrap'); if (!wrap) return;
  const wr = wrap.getBoundingClientRect();
  let minL = Infinity, minT = Infinity, maxR = -Infinity;
  ids.forEach((id) => { const el = $(`#canvas .slide-obj[data-id="${id}"]`); if (!el) return; const r = el.getBoundingClientRect(); minL = Math.min(minL, r.left); minT = Math.min(minT, r.top); maxR = Math.max(maxR, r.right); });
  if (!isFinite(minL)) { bar.hidden = true; return; }
  bar.hidden = false;
  const cx = (minL + maxR) / 2 - wr.left;
  let top = minT - wr.top - bar.offsetHeight - 12;
  if (top < 2) top = minT - wr.top + 8;
  bar.style.left = `${cx}px`;
  bar.style.top = `${Math.max(2, top)}px`;
}

/* pasek formatowania tekstu (rich text) — widoczny w trybie edycji */
let savedRange = null;
function saveRange() { const s = getSelection(); if (s && s.rangeCount) savedRange = s.getRangeAt(0).cloneRange(); }
function restoreRange() { if (savedRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); } }
function showFmtBar(id) {
  const bar = $('#fmt-bar'); if (!bar) return;
  bar.innerHTML = `
    <button data-cmd="bold" title="Pogrubienie (⌘B)"><b>B</b></button>
    <button data-cmd="italic" title="Kursywa (⌘I)"><i>I</i></button>
    <button data-cmd="underline" title="Podkreślenie (⌘U)"><u>U</u></button>
    <span class="fmt-sep"></span>
    <button data-cmd="insertUnorderedList" title="Lista punktowana">•</button>
    <button data-cmd="insertOrderedList" title="Lista numerowana">1.</button>
    <button data-link title="Wstaw link">🔗</button>
    <span class="fmt-sep"></span>
    <label class="fmt-color" title="Kolor tekstu"><span>A</span><input type="color" id="fmt-color" value="#ffffff"></label>`;
  bar.querySelectorAll('button[data-cmd]').forEach((b) => b.addEventListener('mousedown', (e) => {
    e.preventDefault(); document.execCommand(b.dataset.cmd, false, null);
  }));
  bar.querySelector('[data-link]')?.addEventListener('mousedown', (e) => {
    e.preventDefault(); saveRange();
    const url = window.prompt('Adres linku:', 'https://');
    if (url && /^(https?:|mailto:)/i.test(url)) { restoreRange(); document.execCommand('createLink', false, url); }
  });
  const ci = $('#fmt-color');
  ci?.addEventListener('mousedown', saveRange);
  ci?.addEventListener('input', (e) => { restoreRange(); document.execCommand('foreColor', false, e.target.value); });
  const txt = $(`#canvas .slide-obj[data-id="${id}"] .slide-obj__text`);
  txt?.addEventListener('keyup', saveRange);
  txt?.addEventListener('mouseup', saveRange);
  positionFmtBar(id);
  bar.hidden = false;
}
function positionFmtBar(id) {
  const bar = $('#fmt-bar'); const el = $(`#canvas .slide-obj[data-id="${id}"]`); const wrap = $('.deck-canvas-wrap');
  if (!bar || !el || !wrap) return;
  const wr = wrap.getBoundingClientRect(); const r = el.getBoundingClientRect();
  bar.style.left = `${(r.left + r.right) / 2 - wr.left}px`;
  let top = r.top - wr.top - bar.offsetHeight - 12;
  if (top < 2) top = r.bottom - wr.top + 12;
  bar.style.top = `${Math.max(2, top)}px`;
}
function hideFmtBar() { const bar = $('#fmt-bar'); if (bar) bar.hidden = true; savedRange = null; }
function renderMultiInspector(ids) {
  const host = $('#editor-inspector');
  host.innerHTML = `
    <div class="deck-inspector__head"><span class="deck-inspector__title">${ids.length} obiektów</span>
      <button class="deck-obj-x" id="oi-x" title="Odznacz (Esc)">${ICO.x}</button></div>
    <div class="oi-row">
      <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="oi-dup">Duplikuj</button>
      <button class="strefa-btn strefa-btn--ghost strefa-btn--sm oi-danger" id="oi-del">${ICO.trash}<span>Usuń</span></button>
    </div>
    <div class="deck-field"><span class="deck-field__label">Wyrównaj</span>
      <div class="oi-seg" id="oi-align-multi">
        <button data-a="left" title="Do lewej">⇤</button>
        <button data-a="hcenter" title="Środek →">⇔</button>
        <button data-a="right" title="Do prawej">⇥</button>
        <button data-a="top" title="Do góry">⤒</button>
        <button data-a="vcenter" title="Środek ↓">⇕</button>
        <button data-a="bottom" title="Do dołu">⤓</button>
      </div>
    </div>
    <div class="deck-field"><span class="deck-field__label">Rozłóż równo (≥3)</span>
      <div class="oi-seg" id="oi-dist">
        <button data-d="h" title="Poziomo">⇿</button>
        <button data-d="v" title="Pionowo">⇳</button>
      </div>
    </div>
    <div class="oi-row">
      <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="oi-group">Grupuj</button>
      <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="oi-ungroup">Rozgrupuj</button>
    </div>`;
  $('#oi-x')?.addEventListener('click', () => objEditor.clear());
  $('#oi-dup')?.addEventListener('click', duplicateSelectedObject);
  $('#oi-del')?.addEventListener('click', deleteSelectedObject);
  $('#oi-align-multi')?.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => alignSelected(b.dataset.a)));
  $('#oi-dist')?.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => distributeSelected(b.dataset.d)));
  $('#oi-group')?.addEventListener('click', groupSelected);
  $('#oi-ungroup')?.addEventListener('click', ungroupSelected);
}
function alignSelected(mode) {
  const s = slides[current]; const ids = objEditor?.selectedIds() || []; if (ids.length < 2) return;
  const objs = ids.map((id) => s.content.objects.find((o) => o.id === id)).filter(Boolean);
  const minX = Math.min(...objs.map((o) => o.x)), maxX = Math.max(...objs.map((o) => o.x + o.w));
  const minY = Math.min(...objs.map((o) => o.y)), maxY = Math.max(...objs.map((o) => o.y + o.h));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  objs.forEach((o) => {
    if (mode === 'left') o.x = Math.round(minX);
    else if (mode === 'right') o.x = Math.round(maxX - o.w);
    else if (mode === 'hcenter') o.x = Math.round(cx - o.w / 2);
    else if (mode === 'top') o.y = Math.round(minY);
    else if (mode === 'bottom') o.y = Math.round(maxY - o.h);
    else if (mode === 'vcenter') o.y = Math.round(cy - o.h / 2);
  });
  scheduleSaveContent(s); pushHistory(); renderEditor();
  setTimeout(() => objEditor.selectMany(ids), 20);
}
function distributeSelected(axis) {
  const s = slides[current]; const ids = objEditor?.selectedIds() || []; if (ids.length < 3) return;
  const objs = ids.map((id) => s.content.objects.find((o) => o.id === id)).filter(Boolean);
  const k = axis === 'h' ? 'x' : 'y';
  objs.sort((a, b) => a[k] - b[k]);
  const min = objs[0][k], max = objs[objs.length - 1][k], step = (max - min) / (objs.length - 1);
  objs.forEach((o, i) => { o[k] = Math.round(min + step * i); });
  scheduleSaveContent(s); pushHistory(); renderEditor();
  setTimeout(() => objEditor.selectMany(ids), 20);
}
function groupSelected() {
  const s = slides[current]; const ids = objEditor?.selectedIds() || []; if (ids.length < 2) return;
  const gid = genId();
  ids.forEach((id) => { const o = s.content.objects.find((x) => x.id === id); if (o) o.group = gid; });
  scheduleSaveContent(s); pushHistory();
  renderRightPanel({ multi: true, ids });
}
function ungroupSelected() {
  const s = slides[current]; const ids = objEditor?.selectedIds() || []; if (!ids.length) return;
  ids.forEach((id) => { const o = s.content.objects.find((x) => x.id === id); if (o) delete o.group; });
  scheduleSaveContent(s); pushHistory();
}
let clipboard = null;
function copySelected() {
  const s = slides[current]; const ids = objEditor?.selectedIds() || []; if (!ids.length) return;
  clipboard = ids.map((id) => s.content.objects.find((o) => o.id === id)).filter(Boolean).map((o) => JSON.parse(JSON.stringify(o)));
}
function pasteClipboard() {
  const s = slides[current]; if (!clipboard || !clipboard.length || !s) return;
  const groupMap = {}; const newIds = [];
  clipboard.forEach((src) => {
    const copy = { ...JSON.parse(JSON.stringify(src)), id: genId(), x: src.x + 28, y: src.y + 28, z: s.content.objects.length };
    if (copy.group) { groupMap[src.group] = groupMap[src.group] || genId(); copy.group = groupMap[src.group]; }
    s.content.objects.push(copy); newIds.push(copy.id);
  });
  scheduleSaveContent(s); pushHistory(); renderEditor();
  setTimeout(() => objEditor.selectMany(newIds), 20);
}
function selectAllObjects() {
  const s = slides[current]; if (!s || !s.content.objects.length) return;
  objEditor.selectMany(s.content.objects.map((o) => o.id));
}

function editorCommit() { const s = slides[current]; if (!s) return; scheduleSaveContent(s); pushHistory(); positionObjBar(); }

function bindEditorChrome() {
  const s = slides[current];
  $('#btn-add-text')?.addEventListener('click', insertText);
  $('#btn-add-img')?.addEventListener('click', () => $('#slide-img-input').click());
  $('#btn-add-shape')?.addEventListener('click', (e) => { e.stopPropagation(); $('#shape-menu')?.toggleAttribute('hidden'); });
  $('#shape-menu')?.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { $('#shape-menu').hidden = true; objEditor?.setDrawMode(b.dataset.shape); }));
  $('#btn-layouts')?.addEventListener('click', openLayoutPicker);
  const nta = $('#slide-notes');
  if (nta) {
    nta.addEventListener('input', () => { s.notes = nta.value; scheduleSave(s.id, { notes: nta.value }); });
    nta.addEventListener('blur', () => { s.notes = nta.value; flushSave(s.id, { notes: nta.value }); });
  }
}

/* ── obiekty: wstawianie / operacje ── */
function addObject(s, obj, { edit = false } = {}) {
  obj.z = s.content.objects.length;
  s.content.objects.push(obj);
  scheduleSaveContent(s); pushHistory();
  renderEditor();
  setTimeout(() => { if (edit) objEditor?.enterTextEdit(obj.id); else objEditor?.select(obj.id); }, 20);
}
function insertText() {
  const s = slides[current]; if (!s) return;
  const obj = newObject('text', { x: 560, y: 460, w: 800, h: 160, size: 64, align: 'center', valign: 'middle', richText: '', color: theme().textColor, font: theme().font });
  addObject(s, obj, { edit: true });
}
function onDrawShape(kind, rect) {
  const s = slides[current]; if (!s) return;
  const isLine = kind === 'line' || kind === 'arrow';
  const obj = newObject('shape', { kind, x: rect.x, y: rect.y, w: rect.w, h: rect.h, fill: isLine ? theme().textColor : theme().accent, stroke: null, radius: kind === 'rect' ? 12 : 0 });
  addObject(s, obj);
}
function refreshObject(id) { const s = slides[current]; if (!s) return; scheduleSaveContent(s); pushHistory(); renderEditor(); setTimeout(() => objEditor?.select(id), 20); }

/* ── layouty slajdów (wstawiane jako gotowy slajd) ── */
function ltxt(text, props) { return newObject('text', { ...props, richText: textToHtml(text) }); }
const LAYOUTS = {
  'Tytuł': () => [ltxt('Tytuł prezentacji', { x: 160, y: 400, w: 1600, h: 200, size: 128, weight: 700, font: 'display', align: 'center' }), ltxt('Podtytuł', { x: 160, y: 624, w: 1600, h: 120, size: 56, align: 'center', color: '#94a3b8' })],
  'Tytuł + treść': () => [ltxt('Nagłówek', { x: 140, y: 110, w: 1640, h: 170, size: 88, weight: 700, font: 'display', align: 'left' }), ltxt('Pierwszy punkt\nDrugi punkt\nTrzeci punkt', { x: 140, y: 330, w: 1640, h: 620, size: 52, align: 'left', valign: 'top' })],
  'Dwie kolumny': () => [ltxt('Nagłówek', { x: 140, y: 110, w: 1640, h: 170, size: 88, weight: 700, font: 'display', align: 'left' }), ltxt('Kolumna pierwsza', { x: 140, y: 330, w: 780, h: 620, size: 46, align: 'left', valign: 'top' }), ltxt('Kolumna druga', { x: 1000, y: 330, w: 780, h: 620, size: 46, align: 'left', valign: 'top' })],
  'Cytat': () => [ltxt('„Inspirujący cytat w tym miejscu."', { x: 220, y: 360, w: 1480, h: 360, size: 84, weight: 600, font: 'display', align: 'center' }), ltxt('— Autor', { x: 220, y: 740, w: 1480, h: 100, size: 44, align: 'center', color: '#94a3b8' })],
  'Sekcja': () => [ltxt('Sekcja', { x: 160, y: 440, w: 1600, h: 200, size: 140, weight: 700, font: 'display', align: 'center' })],
  'Pusty': () => [],
};
async function applyLayout(name) {
  const make = LAYOUTS[name]; if (!make) return;
  flushCurrent();
  const objs = make(); objs.forEach((o, i) => { o.z = i; });
  const content = { version: 1, background: { type: 'none' }, objects: objs };
  const { data, error } = await sb.from('training_slides').insert({ training_id: trainingId, position: slides.length, ...contentToPatch(content) }).select().single();
  if (error) return toast('Błąd', error.message, 'err');
  data.content = content; slides.push(data); current = slides.length - 1;
  history.reset(data.id, clone(content));
  redraw();
  toast('Dodano slajd', name, 'ok');
}
function openLayoutPicker() {
  const box = openModal(`<div class="strefa-modal__body"><h3 style="margin:0 0 var(--space-md)">Nowy slajd z layoutu</h3><div class="layout-grid">${Object.keys(LAYOUTS).map((n) => `<button class="layout-card" data-layout="${esc(n)}" type="button">${esc(n)}</button>`).join('')}</div></div>`);
  box.querySelectorAll('[data-layout]').forEach((b) => b.addEventListener('click', () => { closeModal(); applyLayout(b.dataset.layout); }));
}

/* ── ⌘K paleta poleceń / „/" quick-insert ── */
function commandList() {
  const cmds = [
    { label: '＋ Nowy slajd', kw: 'dodaj slide', run: addSlide },
    { label: 'Wstaw tekst', kw: 'insert text', run: insertText },
    { label: 'Wstaw obrazek', kw: 'insert image grafika', run: () => $('#slide-img-input').click() },
    { label: 'Wstaw kształt — prostokąt', kw: 'shape rect', run: () => objEditor?.setDrawMode('rect') },
    { label: 'Wstaw kształt — elipsa', kw: 'shape ellipse koło', run: () => objEditor?.setDrawMode('ellipse') },
    { label: 'Wstaw kształt — strzałka', kw: 'shape arrow', run: () => objEditor?.setDrawMode('arrow') },
    { label: 'Layouty…', kw: 'layout szablon', run: openLayoutPicker },
    { label: 'AI: zrób slajd z promptu', kw: 'ai generate sztuczna', run: openAiSlide },
    { label: 'Rozpocznij prezentację', kw: 'present play', run: startPresent },
    { label: 'Widok prezentera', kw: 'presenter notatki', run: () => { startPresent(); setTimeout(openPresenter, 350); } },
    { label: 'Eksport do PDF', kw: 'export pdf druk', run: exportPDF },
    { label: 'Eksport slajdu do PNG', kw: 'export png obraz', run: exportPNG },
    { label: 'Kopiuj link do prezentacji', kw: 'share link udostepnij', run: copyShareLink },
  ];
  slides.forEach((s, i) => cmds.push({ label: `Idź do slajdu ${i + 1}`, kw: 'goto slajd ' + (s.text || '').slice(0, 30), run: () => selectSlide(i) }));
  return cmds;
}
function openCommandPalette(initialQuery = '') {
  const box = openModal(`<div class="cmdk"><input class="cmdk__input" id="cmdk-input" placeholder="Szukaj polecenia lub wstaw…" autocomplete="off" spellcheck="false"><div class="cmdk__list" id="cmdk-list"></div></div>`);
  const input = $('#cmdk-input'); const list = $('#cmdk-list');
  let items = []; let active = 0;
  const setActive = (i) => { active = Math.max(0, Math.min(items.length - 1, i)); list.querySelectorAll('.cmdk__item').forEach((b, k) => b.classList.toggle('is-active', k === active)); list.children[active]?.scrollIntoView({ block: 'nearest' }); };
  const render = () => {
    const q = input.value.trim().toLowerCase();
    items = commandList().filter((c) => !q || (c.label + ' ' + (c.kw || '')).toLowerCase().includes(q));
    list.innerHTML = items.map((c, i) => `<button class="cmdk__item ${i === 0 ? 'is-active' : ''}" data-i="${i}" type="button">${esc(c.label)}</button>`).join('') || '<div class="cmdk__empty">Brak wyników</div>';
    active = 0;
    list.querySelectorAll('.cmdk__item').forEach((b) => { b.addEventListener('click', () => { const c = items[+b.dataset.i]; closeModal(); setTimeout(() => c?.run(), 0); }); });
  };
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); const c = items[active]; closeModal(); setTimeout(() => c?.run(), 0); }
  });
  input.value = initialQuery; render(); input.focus();
}

/* ── eksport ── */
const EXPORT_SLIDE_CSS = `.slide-stage{position:absolute;top:0;left:0;transform-origin:top left}
.slide-bg{position:absolute;inset:0}.slide-bg__img{position:absolute;inset:0;width:100%;height:100%}
.slide-obj{position:absolute;box-sizing:border-box}.slide-obj--text{display:flex}
.slide-obj__text{max-width:100%;max-height:100%;overflow:hidden;white-space:pre-wrap;word-break:break-word;letter-spacing:-.01em}
.slide-obj__text ul,.slide-obj__text ol{margin:0;padding-left:1.3em;text-align:left}.slide-obj__text a{color:inherit}`;
function exportPDF() {
  const w = window.open('', 'szron-export', 'width=1280,height=760');
  if (!w) return toast('Popup zablokowany', 'Zezwól na okno wydruku', 'err');
  const dbg = deckBgCss();
  const pages = slides.map((s) => `<div class="pg"><div class="slide-stage" style="width:${SLIDE_W}px;height:${SLIDE_H}px">${renderSlideInner(s.content, { deckBg: dbg })}</div></div>`).join('');
  w.document.write(`<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${esc(training.name)}</title><style>
    *{margin:0;box-sizing:border-box}body{background:#fff}
    .pg{position:relative;width:100vw;aspect-ratio:16/9;overflow:hidden;background:#000;page-break-after:always;break-after:page}
    ${EXPORT_SLIDE_CSS}
    @page{size:landscape;margin:0}
  </style></head><body>${pages}<scr` + `ipt>window.onload=function(){document.querySelectorAll('.pg').forEach(function(p){var st=p.querySelector('.slide-stage');if(st)st.style.transform='scale('+(p.clientWidth/${SLIDE_W})+')';});setTimeout(function(){window.print();},400);};</scr` + `ipt></body></html>`);
  w.document.close();
  toast('Eksport PDF', 'Wybierz „Zapisz jako PDF" w oknie wydruku', 'ok');
}
function exportPNG() {
  const s = slides[current]; if (!s) return;
  const hasImg = (s.content.objects || []).some((o) => o.type === 'image') || (s.content.background && s.content.background.type === 'image');
  if (hasImg) return toast('PNG niedostępny', 'Slajd z obrazem — użyj eksportu PDF', 'err');
  const inner = renderSlideInner(s.content, { deckBg: deckBgCss() });
  const html = `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${SLIDE_W}px;height:${SLIDE_H}px;position:relative"><style>${EXPORT_SLIDE_CSS}</style>${inner}</div>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SLIDE_W}" height="${SLIDE_H}"><foreignObject width="100%" height="100%">${html}</foreignObject></svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas'); canvas.width = SLIDE_W; canvas.height = SLIDE_H;
    try {
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = `slajd-${current + 1}.png`; a.click();
      toast('Gotowe', 'PNG pobrany', 'ok');
    } catch (e) { toast('PNG nieudany', 'Slajd z obrazem — użyj eksportu PDF', 'err'); }
    URL.revokeObjectURL(url);
  };
  img.onerror = () => { toast('PNG nieudany', 'Spróbuj eksportu PDF', 'err'); URL.revokeObjectURL(url); };
  img.src = url;
}
function copyShareLink() {
  const url = location.href;
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast('Skopiowano link', 'Otworzą go członkowie zespołu', 'ok'), () => toast('Link', url, 'ok'));
  else toast('Link', url, 'ok');
}

/* ── AI: zrób slajd z promptu (Edge Function strefa-ai-slide → Claude) ── */
function openAiSlide() {
  const box = openModal(`<div class="strefa-modal__body">
    <h3 style="margin:0 0 var(--space-sm)">AI — zrób slajd z promptu</h3>
    <p style="margin:0 0 var(--space-md);color:var(--color-text-inv-2);font-size:var(--text-s)">Opisz slajd — AI ułoży tekst i layout w stylu decku.</p>
    <textarea class="deck-notes__field" id="ai-prompt" rows="3" placeholder="np. Tytuł „Zalety AI w programowaniu" + 3 punkty korzyści"></textarea>
    <div class="strefa-actions-row" style="margin-top:var(--space-md)"><button class="strefa-btn strefa-btn--ghost" data-no type="button">Anuluj</button><button class="strefa-btn strefa-btn--accent" id="ai-go" type="button">Generuj</button></div>
    <div id="ai-status" style="margin-top:var(--space-sm);font-size:var(--text-s);color:var(--color-text-inv-2)"></div></div>`);
  box.querySelector('[data-no]').addEventListener('click', closeModal);
  box.querySelector('#ai-prompt').focus();
  box.querySelector('#ai-go').addEventListener('click', async () => {
    const prompt = box.querySelector('#ai-prompt').value.trim(); if (!prompt) return;
    const status = box.querySelector('#ai-status'); const go = box.querySelector('#ai-go');
    status.textContent = 'Generuję…'; go.disabled = true;
    try {
      const { data, error } = await sb.functions.invoke('strefa-ai-slide', { body: { prompt, theme: theme() } });
      if (error) {
        let msg = error.message || 'błąd funkcji';
        try { if (error.context && typeof error.context.json === 'function') { const b = await error.context.json(); if (b && b.error) msg = b.error; } } catch (_) {}
        throw new Error(msg);
      }
      if (!data || !data.content || !Array.isArray(data.content.objects)) throw new Error(data && data.error ? data.error : 'zła odpowiedź AI');
      closeModal();
      await insertAiSlide(data.content);
    } catch (e) { status.textContent = 'Błąd: ' + (e.message || 'nie udało się'); go.disabled = false; }
  });
}
async function insertAiSlide(content) {
  flushCurrent();
  const objs = (content.objects || []).slice(0, 16).map((o) => {
    const type = o.type === 'image' ? 'image' : o.type === 'shape' ? 'shape' : 'text';
    const obj = newObject(type, o);
    if (type === 'text') obj.richText = sanitizeHtml(o.richText || textToHtml(o.text || ''));
    return obj;
  });
  objs.forEach((o, i) => { o.z = i; });
  const full = { version: 1, background: content.background && content.background.type ? content.background : { type: 'none' }, objects: objs, transition: 'none' };
  const { data, error } = await sb.from('training_slides').insert({ training_id: trainingId, position: slides.length, ...contentToPatch(full) }).select().single();
  if (error) return toast('Błąd', error.message, 'err');
  data.content = full; slides.push(data); current = slides.length - 1;
  history.reset(data.id, clone(full)); redraw();
  toast('Gotowe', 'AI utworzyło slajd', 'ok');
}
function imageDims(url) {
  return new Promise((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 0, h: 0 }); im.src = url; });
}
function deleteSelectedObject() {
  const s = slides[current]; const ids = objEditor?.selectedIds() || []; if (!s || !ids.length) return;
  s.content.objects = s.content.objects.filter((o) => !ids.includes(o.id));
  s.content.objects.forEach((o, k) => { o.z = k; });
  objEditor.clear();
  scheduleSaveContent(s); pushHistory(); renderEditor();
}
function duplicateSelectedObject() {
  const s = slides[current]; const ids = objEditor?.selectedIds() || []; if (!s || !ids.length) return;
  const newIds = [];
  ids.forEach((id) => {
    const src = s.content.objects.find((o) => o.id === id); if (!src) return;
    const copy = { ...JSON.parse(JSON.stringify(src)), id: genId(), x: src.x + 24, y: src.y + 24, z: s.content.objects.length };
    s.content.objects.push(copy); newIds.push(copy.id);
  });
  if (!newIds.length) return;
  scheduleSaveContent(s); pushHistory(); renderEditor();
  setTimeout(() => objEditor.selectMany(newIds), 20);
}
function nudgeSelected(dx, dy) {
  const s = slides[current]; const ids = objEditor?.selectedIds() || []; if (!s || !ids.length) return;
  ids.forEach((id) => {
    const o = s.content.objects.find((x) => x.id === id); if (!o) return;
    o.x += dx; o.y += dy;
    const el = $(`#canvas .slide-obj[data-id="${id}"]`);
    if (el) el.style.transform = `translate(${o.x}px,${o.y}px) rotate(${o.rotation || 0}deg)`;
  });
  objEditor.updateRect();
  scheduleSaveContent(s); pushHistory();
}
function insertTextAt(cx, cy) {
  const s = slides[current]; if (!s) return;
  const w = 800, h = 160;
  const obj = newObject('text', { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h, size: 64, align: 'center', valign: 'middle', richText: '', color: theme().textColor, font: theme().font });
  addObject(s, obj, { edit: true });
}
function zorder(dir) {
  const s = slides[current]; const id = objEditor?.selected(); if (!s || !id) return;
  const objs = s.content.objects.slice().sort((a, b) => a.z - b.z);
  const i = objs.findIndex((o) => o.id === id); if (i < 0) return;
  const [m] = objs.splice(i, 1);
  let j = dir === 'front' ? objs.length : dir === 'back' ? 0 : dir === 'forward' ? Math.min(objs.length, i + 1) : Math.max(0, i - 1);
  objs.splice(j, 0, m);
  objs.forEach((o, k) => { o.z = k; });
  scheduleSaveContent(s); pushHistory(); renderEditor();
  setTimeout(() => objEditor?.select(id), 20);
}
function bindCanvasDrop(host) {
  host.addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); host.classList.add('is-drop'); } });
  host.addEventListener('dragleave', (e) => { if (e.target === host) host.classList.remove('is-drop'); });
  host.addEventListener('drop', (e) => {
    host.classList.remove('is-drop');
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) { e.preventDefault(); handleSlideImage(file); }
  });
}

/* prawy inspektor: właściwości zaznaczonego obiektu */
const FONTS = [['helvetica', 'Helvetica'], ['display', 'Nagłówkowy'], ['body', 'Tekstowy']];
const FONT_CSS = { helvetica: "'Helvetica Neue', Helvetica, Arial, sans-serif", display: 'var(--font-display)', body: 'var(--font-body)' };
// presety stylów tekstu (spięte z wyglądem decku)
const TEXT_STYLES = {
  'Tytuł': { size: 128, weight: 700, align: 'center', font: 'display' },
  'Podtytuł': { size: 72, weight: 600, align: 'center', font: 'helvetica' },
  'Treść': { size: 48, weight: 500, align: 'left', font: 'helvetica' },
  'Cytat': { size: 64, weight: 500, align: 'center', font: 'display' },
  'Podpis': { size: 30, weight: 500, align: 'center', font: 'helvetica' },
};
const TEXT_PALETTE = ['#ffffff', '#000000', '#f97316', '#94a3b8', '#0f1f4d', '#14181f'];
function objElById(id) { return $(`#canvas .slide-obj[data-id="${id}"]`); }

function renderObjectInspector(o) {
  const host = $('#editor-inspector');
  const isText = o.type === 'text', isImg = o.type === 'image', isShape = o.type === 'shape';
  host.innerHTML = `
    <div class="deck-inspector__head">
      <span class="deck-inspector__title">${isText ? 'Tekst' : isImg ? 'Obrazek' : isShape ? 'Kształt' : 'Obiekt'}</span>
      <button class="deck-obj-x" id="oi-x" title="Odznacz (Esc)">${ICO.x}</button>
    </div>
    <div class="oi-row">
      <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="oi-dup">Duplikuj</button>
      <button class="strefa-btn strefa-btn--ghost strefa-btn--sm oi-danger" id="oi-del">${ICO.trash}<span>Usuń</span></button>
    </div>
    <div class="oi-row">
      <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="oi-front" title="Na wierzch">⤒ Wierzch</button>
      <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="oi-back" title="Na spód">⤓ Spód</button>
    </div>
    ${isText ? `
      <div class="deck-field"><span class="deck-field__label">Styl tekstu</span>
        <select class="oi-select" id="oi-style"><option value="">— styl —</option>${Object.keys(TEXT_STYLES).map((n) => `<option value="${n}">${n}</option>`).join('')}</select>
      </div>
      <div class="deck-field"><span class="deck-field__label">Czcionka</span>
        <select class="oi-select" id="oi-font">${FONTS.map(([v, l]) => `<option value="${v}" ${o.font === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="oi-row">
        <label class="oi-num"><span>Rozmiar</span><input type="number" id="oi-size" value="${o.size || 64}" min="8" max="400"></label>
        <label class="oi-num"><span>Interlinia</span><input type="number" id="oi-lh" value="${o.lineHeight || 1.18}" min="0.8" max="3" step="0.05"></label>
        <label class="oi-num oi-num--color"><span>Kolor</span><input type="color" id="oi-color" value="${toHex(o.color) || '#ffffff'}"></label>
      </div>
      <div class="oi-pal" id="oi-pal">${[theme().accent, ...TEXT_PALETTE.filter((c) => norm(c) !== norm(theme().accent))].map((c) => `<button class="oi-pal__chip" data-c="${c}" style="background:${c}" title="${c}" type="button"></button>`).join('')}</div>
      <div class="deck-field"><span class="deck-field__label">Wyrównanie</span>
        <div class="oi-seg" id="oi-align">
          <button data-al="left" class="${o.align === 'left' ? 'is-active' : ''}">≡L</button>
          <button data-al="center" class="${(o.align || 'center') === 'center' ? 'is-active' : ''}">≡C</button>
          <button data-al="right" class="${o.align === 'right' ? 'is-active' : ''}">R≡</button>
        </div>
      </div>
      <label class="oi-check"><input type="checkbox" id="oi-bold" ${(+o.weight) >= 600 ? 'checked' : ''}> Pogrubienie</label>
    ` : ''}
    ${isImg ? `
      <div class="deck-field"><span class="deck-field__label">Dopasowanie</span>
        <div class="oi-seg" id="oi-fit">
          <button data-fit="contain" class="${o.fit !== 'cover' ? 'is-active' : ''}">Zmieść</button>
          <button data-fit="cover" class="${o.fit === 'cover' ? 'is-active' : ''}">Wypełnij</button>
        </div>
      </div>
      <label class="oi-num"><span>Zaokrąglenie rogów</span><input type="number" id="oi-radius" value="${o.radius || 0}" min="0" max="400"></label>
    ` : ''}
    ${isShape ? `
      <div class="deck-field"><span class="deck-field__label">Kształt</span>
        <select class="oi-select" id="oi-kind">${[['rect', 'Prostokąt'], ['ellipse', 'Elipsa'], ['triangle', 'Trójkąt'], ['line', 'Linia'], ['arrow', 'Strzałka']].map(([k, l]) => `<option value="${k}" ${(o.kind || 'rect') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="oi-row">
        <label class="oi-num oi-num--color"><span>${o.kind === 'line' || o.kind === 'arrow' ? 'Kolor' : 'Wypełnienie'}</span><input type="color" id="oi-fill" value="${toHex(o.fill) || '#f97316'}"></label>
        ${(o.kind || 'rect') === 'rect' ? `<label class="oi-num"><span>Zaokrąglenie</span><input type="number" id="oi-srad" value="${o.radius || 0}" min="0" max="400"></label>` : ''}
      </div>
      ${o.kind !== 'line' && o.kind !== 'arrow' ? `<label class="oi-check"><input type="checkbox" id="oi-stroke-on" ${o.stroke ? 'checked' : ''}> Obramowanie</label>
      ${o.stroke ? `<div class="oi-row"><label class="oi-num oi-num--color"><span>Kolor</span><input type="color" id="oi-stroke-color" value="${toHex(o.stroke.color) || '#ffffff'}"></label><label class="oi-num"><span>Grubość</span><input type="number" id="oi-stroke-w" value="${o.stroke.width || 2}" min="1" max="40"></label></div>` : ''}` : `<label class="oi-num"><span>Grubość linii</span><input type="number" id="oi-line-w" value="${(o.stroke && o.stroke.width) || 4}" min="1" max="60"></label>`}
    ` : ''}
    <div class="deck-field"><span class="deck-field__label">Krycie <b id="oi-op-val">${Math.round((o.opacity ?? 1) * 100)}%</b></span>
      <input type="range" id="oi-opacity" min="0" max="100" value="${Math.round((o.opacity ?? 1) * 100)}">
    </div>
    <div class="deck-field"><span class="deck-field__label">Animacja wejścia</span>
      <select class="oi-select" id="oi-anim">${[['none', 'Brak'], ['fade', 'Pojawienie'], ['slide', 'Wsunięcie'], ['scale', 'Skala']].map(([v, l]) => `<option value="${v}" ${(o.anim || 'none') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div class="oi-grid">
      <label class="oi-num"><span>X</span><input type="number" id="oi-px" value="${Math.round(o.x)}"></label>
      <label class="oi-num"><span>Y</span><input type="number" id="oi-py" value="${Math.round(o.y)}"></label>
      <label class="oi-num"><span>Szer.</span><input type="number" id="oi-pw" value="${Math.round(o.w)}"></label>
      <label class="oi-num"><span>Wys.</span><input type="number" id="oi-ph" value="${Math.round(o.h)}"></label>
      <label class="oi-num"><span>Obrót°</span><input type="number" id="oi-rot" value="${Math.round(o.rotation || 0)}"></label>
    </div>`;
  bindObjectInspector(o);
}

function bindObjectInspector(o) {
  const s = slides[current];
  const el = () => objElById(o.id);
  const txt = () => el()?.querySelector('.slide-obj__text');
  const live = () => { scheduleSaveContent(s); objEditor?.updateRect(); };
  const commit = () => { pushHistory(); };

  $('#oi-x')?.addEventListener('click', () => objEditor.clear());
  $('#oi-dup')?.addEventListener('click', duplicateSelectedObject);
  $('#oi-del')?.addEventListener('click', deleteSelectedObject);
  $('#oi-front')?.addEventListener('click', () => zorder('front'));
  $('#oi-back')?.addEventListener('click', () => zorder('back'));

  $('#oi-font')?.addEventListener('change', (e) => { o.font = e.target.value; const t = txt(); if (t) t.style.fontFamily = FONT_CSS[o.font]; live(); commit(); });
  $('#oi-size')?.addEventListener('input', (e) => { o.size = +e.target.value || 64; const t = txt(); if (t) t.style.fontSize = o.size + 'px'; live(); });
  $('#oi-size')?.addEventListener('change', commit);
  $('#oi-color')?.addEventListener('input', (e) => { o.color = e.target.value; const t = txt(); if (t) t.style.color = o.color; live(); });
  $('#oi-color')?.addEventListener('change', commit);
  $('#oi-lh')?.addEventListener('input', (e) => { o.lineHeight = +e.target.value || 1.18; const t = txt(); if (t) t.style.lineHeight = o.lineHeight; live(); });
  $('#oi-lh')?.addEventListener('change', commit);
  $('#oi-style')?.addEventListener('change', (e) => {
    const preset = TEXT_STYLES[e.target.value]; if (!preset) return;
    Object.assign(o, preset);
    const t = txt(), box = el();
    if (t) { t.style.fontFamily = FONT_CSS[o.font]; t.style.fontSize = o.size + 'px'; t.style.fontWeight = o.weight; t.style.textAlign = o.align; }
    if (box) box.style.justifyContent = { left: 'flex-start', center: 'center', right: 'flex-end' }[o.align];
    live(); commit(); renderObjectInspector(o);
  });
  $('#oi-pal')?.querySelectorAll('.oi-pal__chip').forEach((c) => c.addEventListener('click', () => {
    o.color = c.dataset.c; const t = txt(); if (t) t.style.color = o.color;
    const ci = $('#oi-color'); if (ci) ci.value = toHex(o.color) || '#ffffff';
    live(); commit();
  }));
  $('#oi-align')?.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    o.align = b.dataset.al; $('#oi-align').querySelectorAll('button').forEach((x) => x.classList.toggle('is-active', x === b));
    const box = el(); const t = txt();
    if (box) box.style.justifyContent = { left: 'flex-start', center: 'center', right: 'flex-end' }[o.align];
    if (t) t.style.textAlign = o.align;
    live(); commit();
  }));
  $('#oi-bold')?.addEventListener('change', (e) => { o.weight = e.target.checked ? 700 : 500; const t = txt(); if (t) t.style.fontWeight = o.weight; live(); commit(); });

  $('#oi-fit')?.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    o.fit = b.dataset.fit; $('#oi-fit').querySelectorAll('button').forEach((x) => x.classList.toggle('is-active', x === b));
    const img = el()?.querySelector('img'); if (img) img.style.objectFit = o.fit; live(); commit();
  }));
  $('#oi-radius')?.addEventListener('input', (e) => { o.radius = +e.target.value || 0; const img = el()?.querySelector('img'); if (img) img.style.borderRadius = o.radius + 'px'; live(); });
  $('#oi-radius')?.addEventListener('change', commit);
  // kształt
  $('#oi-kind')?.addEventListener('change', (e) => { o.kind = e.target.value; if (o.kind !== 'rect') o.radius = 0; refreshObject(o.id); });
  $('#oi-fill')?.addEventListener('change', (e) => { o.fill = e.target.value; refreshObject(o.id); });
  $('#oi-srad')?.addEventListener('input', (e) => { o.radius = +e.target.value || 0; const b = el()?.querySelector('.slide-shape-fill'); if (b) b.style.borderRadius = o.radius + 'px'; live(); });
  $('#oi-srad')?.addEventListener('change', commit);
  $('#oi-stroke-on')?.addEventListener('change', (e) => { o.stroke = e.target.checked ? { color: '#ffffff', width: 3 } : null; refreshObject(o.id); });
  $('#oi-stroke-color')?.addEventListener('change', (e) => { if (o.stroke) o.stroke.color = e.target.value; refreshObject(o.id); });
  $('#oi-stroke-w')?.addEventListener('change', (e) => { if (o.stroke) o.stroke.width = +e.target.value || 2; refreshObject(o.id); });
  $('#oi-line-w')?.addEventListener('change', (e) => { o.stroke = { color: o.fill, width: +e.target.value || 4 }; refreshObject(o.id); });

  $('#oi-opacity')?.addEventListener('input', (e) => { o.opacity = (+e.target.value) / 100; const b = el(); if (b) b.style.opacity = o.opacity; const v = $('#oi-op-val'); if (v) v.textContent = e.target.value + '%'; live(); });
  $('#oi-opacity')?.addEventListener('change', commit);
  $('#oi-anim')?.addEventListener('change', (e) => { o.anim = e.target.value === 'none' ? undefined : e.target.value; scheduleSaveContent(s); pushHistory(); });

  const geo = () => { const b = el(); if (b) { b.style.transform = `translate(${o.x}px,${o.y}px) rotate(${o.rotation || 0}deg)`; b.style.width = o.w + 'px'; b.style.height = o.h + 'px'; } objEditor?.updateRect(); };
  $('#oi-px')?.addEventListener('input', (e) => { o.x = +e.target.value || 0; geo(); live(); });
  $('#oi-py')?.addEventListener('input', (e) => { o.y = +e.target.value || 0; geo(); live(); });
  $('#oi-pw')?.addEventListener('input', (e) => { o.w = Math.max(20, +e.target.value || 20); geo(); live(); });
  $('#oi-ph')?.addEventListener('input', (e) => { o.h = Math.max(20, +e.target.value || 20); geo(); live(); });
  $('#oi-rot')?.addEventListener('input', (e) => { o.rotation = +e.target.value || 0; geo(); live(); });
  ['#oi-px', '#oi-py', '#oi-pw', '#oi-ph', '#oi-rot'].forEach((sel) => $(sel)?.addEventListener('change', commit));
}

/* prawy inspektor: tło decku */
function renderInspector() {
  const host = $('#editor-inspector');
  const hasBg = !!(training.slides_bg_image || training.slides_bg_color);
  const activeColor = training.slides_bg_image ? '' : norm(training.slides_bg_color);
  host.innerHTML = `
    ${slides.length ? `<div class="deck-inspector__head"><span class="deck-inspector__title">Slajd ${current + 1}</span><span class="deck-inspector__sub">przejście</span></div>
    <div class="deck-field"><span class="deck-field__label">Przejście wejścia</span>
      <select class="oi-select" id="slide-trans">${[['none', 'Brak'], ['fade', 'Wygaszenie'], ['push', 'Wsunięcie']].map(([v, l]) => `<option value="${v}" ${(slides[current]?.content.transition || 'none') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>` : ''}
    <div class="deck-inspector__head"${slides.length ? ' style="margin-top:var(--space-lg)"' : ''}><span class="deck-inspector__title">Tło</span><span class="deck-inspector__sub">całe szkolenie</span></div>
    <div class="deck-inspector__preview" id="bg-preview"></div>
    <div class="deck-field">
      <span class="deck-field__label">Kolory</span>
      <div class="bg-grid">
        ${BG_PRESETS.map((p) => `<button class="bg-chip ${activeColor === norm(p.value) ? 'is-active' : ''}" data-bg="${p.value}" title="${esc(p.name)}" style="background:${p.value}" type="button"></button>`).join('')}
      </div>
    </div>
    <div class="deck-field">
      <label class="bg-custom" for="bg-color" title="Własny kolor">
        <input type="color" id="bg-color" value="${toHex(training.slides_bg_color) || '#14181f'}">
        <span class="bg-custom__txt">Własny kolor</span>
        <span class="bg-custom__hex" id="bg-hex">${(toHex(training.slides_bg_color) || '').toUpperCase()}</span>
      </label>
    </div>
    <div class="deck-field deck-field--actions">
      <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="btn-bg-img" type="button">${training.slides_bg_image ? 'Zmień obrazek tła' : 'Obrazek tła'}</button>
      ${hasBg ? `<button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="btn-bg-clear" type="button">Usuń tło</button>` : ''}
    </div>
    <div class="deck-inspector__head" style="margin-top:var(--space-lg)"><span class="deck-inspector__title">Motyw</span><span class="deck-inspector__sub">domyślne obiektów</span></div>
    <div class="oi-row">
      <label class="oi-num oi-num--color"><span>Akcent</span><input type="color" id="theme-accent" value="${toHex(theme().accent) || '#f97316'}"></label>
      <label class="oi-num oi-num--color"><span>Kolor tekstu</span><input type="color" id="theme-text" value="${toHex(theme().textColor) || '#ffffff'}"></label>
    </div>`;
  const prev = $('#bg-preview'); if (prev) prev.style.background = deckBgCss();
  bindInspector();
}
function bindInspector() {
  $$('.bg-chip').forEach((b) => b.addEventListener('click', async () => { await saveDeckBg({ slides_bg_color: b.dataset.bg, slides_bg_image: null }); redraw(); }));
  const ci = $('#bg-color');
  ci?.addEventListener('input', () => {
    const p = $('#bg-preview'); if (p) p.style.background = ci.value;
    const h = $('#bg-hex'); if (h) h.textContent = ci.value.toUpperCase();
    const st = $('#canvas .slide-stage .slide-bg'); // live preview na slajdzie gdy tło dziedziczone
    if (st && slides[current]?.content.background.type === 'none') st.style.background = ci.value;
  });
  ci?.addEventListener('change', async () => { await saveDeckBg({ slides_bg_color: ci.value, slides_bg_image: null }); redraw(); });
  $('#btn-bg-img')?.addEventListener('click', () => $('#bg-img-input').click());
  $('#btn-bg-clear')?.addEventListener('click', async () => { await saveDeckBg({ slides_bg_color: null, slides_bg_image: null }); redraw(); });
  $('#theme-accent')?.addEventListener('change', (e) => saveTheme({ accent: e.target.value }));
  $('#theme-text')?.addEventListener('change', (e) => saveTheme({ textColor: e.target.value }));
  $('#slide-trans')?.addEventListener('change', (e) => { const s = slides[current]; if (s) { s.content.transition = e.target.value; scheduleSaveContent(s); pushHistory(); } });
}

/* lewy rail: filmstrip miniatur (renderowany wspólnym rendererem) */
function renderStrip() {
  const strip = $('#strip');
  strip.innerHTML = slides.map((s, i) => `
    <div class="deck-thumb ${i === current ? 'is-active' : ''}" data-idx="${i}" draggable="true" role="option" aria-selected="${i === current}" tabindex="0">
      <div class="deck-thumb__inner" data-thumb="${i}"></div>
      <span class="deck-thumb__num">${i + 1}</span>
      <div class="deck-thumb__tools">
        <button class="deck-thumb__btn" data-move="up" title="W górę" ${i === 0 ? 'disabled' : ''}>${ICO.up}</button>
        <button class="deck-thumb__btn" data-move="down" title="W dół" ${i === slides.length - 1 ? 'disabled' : ''}>${ICO.down}</button>
        <button class="deck-thumb__btn deck-thumb__btn--del" data-del title="Usuń slajd">${ICO.x}</button>
      </div>
      <span class="deck-thumb__grip" aria-hidden="true">${ICO.grip}</span>
    </div>`).join('');
  const dbg = deckBgCss();
  slides.forEach((s, i) => {
    const h = strip.querySelector(`[data-thumb="${i}"]`);
    if (h) mountSlide(h, s.content, { deckBg: dbg, editable: false, observe: false });
  });
  bindStrip();
}
function bindStrip() {
  const strip = $('#strip');
  strip.querySelectorAll('[data-idx]').forEach((thumb) => {
    const idx = +thumb.dataset.idx;
    thumb.addEventListener('click', (e) => {
      const moveBtn = e.target.closest('[data-move]');
      if (moveBtn) { e.stopPropagation(); moveSlide(idx, moveBtn.dataset.move); return; }
      if (e.target.closest('[data-del]')) { e.stopPropagation(); deleteSlide(idx); return; }
      selectSlide(idx);
    });
    thumb.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectSlide(idx); } });
    thumb.addEventListener('dragstart', (e) => { dragFrom = idx; thumb.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(idx)); } catch (_) {} });
    thumb.addEventListener('dragend', () => { dragFrom = -1; strip.querySelectorAll('.deck-thumb').forEach((t) => t.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after')); });
    thumb.addEventListener('dragover', (e) => {
      if (dragFrom < 0 || dragFrom === idx) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      const r = thumb.getBoundingClientRect(); const after = e.clientY > r.top + r.height / 2;
      thumb.classList.toggle('is-drop-after', after); thumb.classList.toggle('is-drop-before', !after);
    });
    thumb.addEventListener('dragleave', () => { thumb.classList.remove('is-drop-before', 'is-drop-after'); });
    thumb.addEventListener('drop', (e) => {
      e.preventDefault(); if (dragFrom < 0 || dragFrom === idx) return;
      const r = thumb.getBoundingClientRect(); const after = e.clientY > r.top + r.height / 2;
      dropReorder(dragFrom, idx + (after ? 1 : 0));
    });
  });
}

function selectSlide(idx) {
  if (idx === current) return;
  flushCurrent();
  current = idx;
  redraw();
}

/* ── CRUD / reorder ── */
async function addSlide() {
  flushCurrent();
  // Nowy slajd = pusty canvas (obiekty dodaje się świadomie: + Tekst / + Obrazek / dwuklik).
  const starter = { version: 1, background: { type: 'none' }, objects: [] };
  const { data, error } = await sb.from('training_slides')
    .insert({ training_id: trainingId, position: slides.length, ...contentToPatch(starter) }).select().single();
  if (error) return toast('Błąd', error.message, 'err');
  data.content = starter;
  slides.push(data);
  current = slides.length - 1;
  history.reset(data.id, clone(starter));
  redraw();
}
async function deleteSlide(idx) {
  const s = slides[idx]; if (!s) return;
  if (!(await confirmDialog('Usunąć ten slajd?'))) return;
  const { error } = await sb.from('training_slides').delete().eq('id', s.id);
  if (error) return toast('Błąd', error.message, 'err');
  history.drop(s.id);
  slides.splice(idx, 1);
  if (current >= slides.length) current = Math.max(0, slides.length - 1);
  await renumber();
  redraw();
  toast('Usunięto', 'Slajd skasowany', 'ok');
}
async function renumber() {
  const ops = [];
  slides.forEach((s, i) => { if (s.position !== i) { s.position = i; ops.push(sb.from('training_slides').update({ position: i }).eq('id', s.id)); } });
  if (ops.length) await Promise.all(ops);
}
async function moveSlide(idx, dir) {
  const j = dir === 'up' ? idx - 1 : idx + 1;
  if (j < 0 || j >= slides.length) return;
  flushCurrent();
  const movedId = slides[idx].id;
  [slides[idx], slides[j]] = [slides[j], slides[idx]];
  current = slides.findIndex((s) => s.id === movedId);
  redraw();
  await renumber();
}
async function dropReorder(from, target) {
  if (from < 0 || from >= slides.length) return;
  const movedId = slides[from].id;
  const [m] = slides.splice(from, 1);
  if (target > from) target -= 1;
  target = Math.max(0, Math.min(slides.length, target));
  slides.splice(target, 0, m);
  current = slides.findIndex((s) => s.id === movedId);
  redraw();
  await renumber();
}

/* ── upload / paste obrazka (Faza 0: jako tło slajdu) ── */
function bindFileInputs() {
  $('#slide-img-input').addEventListener('change', async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) await handleSlideImage(f); });
  $('#bg-img-input').addEventListener('change', async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) await handleBgImage(f); });
}
async function handleSlideImage(file) {
  const s = slides[current]; if (!s) return;
  toast('Wgrywanie…', file.name); setStatus('saving');
  const res = await uploadSlideImage(file, trainingId, 'slides');
  if (res.error) { setStatus('error'); return toast('Błąd uploadu', res.error, 'err'); }
  const dim = await imageDims(res.url);
  const aspect = (dim.w && dim.h) ? dim.w / dim.h : 16 / 9;
  let w = 1000, h = Math.round(w / aspect);
  if (h > 760) { h = 760; w = Math.round(h * aspect); }
  const obj = newObject('image', { src: res.url, w, h, x: Math.round((SLIDE_W - w) / 2), y: Math.round((SLIDE_H - h) / 2), fit: 'contain', naturalW: dim.w, naturalH: dim.h });
  addObject(s, obj);
  toast('Gotowe', 'Obrazek dodany', 'ok');
}
async function handleBgImage(file) {
  toast('Wgrywanie tła…', file.name); setStatus('saving');
  const res = await uploadSlideImage(file, trainingId, 'bg');
  if (res.error) { setStatus('error'); return toast('Błąd uploadu', res.error, 'err'); }
  await saveDeckBg({ slides_bg_image: res.url, slides_bg_color: null });
  redraw();
  toast('Gotowe', 'Tło ustawione', 'ok');
}
function onPaste(e) {
  if (!slides.length || !slides[current]) return;
  if (!$('#stage').hidden) return;
  if ($('#modal-root')?.children.length) return;
  const items = e.clipboardData?.items; if (!items) return;
  for (const it of items) {
    if (it.kind === 'file' && it.type && it.type.startsWith('image/')) {
      const file = it.getAsFile();
      if (file) { e.preventDefault(); handleSlideImage(file); }
      return;
    }
  }
}

/* ── tryb prezentacji (Fullscreen API) ── */
let presentIdx = 0, buildStep = 0;
let presenterWin = null, presenterTimer = null, presentStart = 0;
function startPresent() {
  if (!slides.length) return toast('Brak slajdów', 'Dodaj choć jeden slajd', 'err');
  flushCurrent();
  objEditor?.clear();      // schowaj uchwyty Moveable edytora (inaczej prześwitują przez prezentację)
  hideFmtBar();
  presentIdx = current; buildStep = 0;
  const stage = $('#stage');
  stage.hidden = false;
  renderStage(false);
  const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
  if (req) req.call(stage).catch(() => {});
  document.addEventListener('keydown', onPresentKey);
}
function animObjects(content) { return (content.objects || []).filter((o) => o.anim && o.anim !== 'none').sort((a, b) => (a.z || 0) - (b.z || 0)); }
function applyBuilds(host, content, step) {
  animObjects(content).forEach((o, i) => {
    const el = host.querySelector(`.slide-obj[data-id="${o.id}"]`);
    if (!el) return;
    if (i < step) { if (i === step - 1) el.classList.add('build-in-' + o.anim); }
    else el.style.visibility = 'hidden';
  });
}
function renderStage(animate) {
  const stage = $('#stage');
  const s = slides[presentIdx];
  const total = slides.length;
  const dots = total <= 12 ? slides.map((_, i) => `<span class="stage-dot ${i === presentIdx ? 'is-current' : ''}" data-go="${i}"></span>`).join('') : '';
  stage.innerHTML = `
    <button class="stage-nav stage-prev" aria-label="Poprzedni" ${presentIdx === 0 && buildStep === 0 ? 'disabled' : ''}>◀</button>
    <div class="slide-viewport" id="stage-vp"></div>
    <button class="stage-nav stage-next" aria-label="Następny">▶</button>
    <button class="stage-exit" aria-label="Zamknij prezentację">✕</button>
    <button class="stage-presenter" aria-label="Widok prezentera (P)" title="Widok prezentera (P)">▣</button>
    <div class="stage-progress">${dots}<span class="stage-count-txt">${presentIdx + 1} / ${total}</span></div>`;
  const host = $('#stage-vp');
  mountSlide(host, s.content, { deckBg: deckBgCss(), editable: false, observe: false });
  applyScale(host, host.querySelector('.slide-stage'));
  applyBuilds(host, s.content, buildStep);
  if (animate && s.content.transition && s.content.transition !== 'none') { void host.offsetWidth; host.classList.add('stage-trans-' + s.content.transition); }
  stage.querySelector('.stage-prev').addEventListener('click', prevStep);
  stage.querySelector('.stage-next').addEventListener('click', nextStep);
  stage.querySelector('.stage-exit').addEventListener('click', exitPresent);
  stage.querySelector('.stage-presenter').addEventListener('click', openPresenter);
  stage.querySelectorAll('[data-go]').forEach((d) => d.addEventListener('click', () => { presentIdx = +d.dataset.go; buildStep = 0; renderStage(true); }));
  renderPresenter();
}
function nextStep() {
  const cnt = animObjects(slides[presentIdx].content).length;
  if (buildStep < cnt) { buildStep++; stepBuilds(true); } else goPresent(1);
}
function prevStep() {
  if (buildStep > 0) { buildStep--; stepBuilds(false); } else goPresent(-1);
}
// kroki buildów na ISTNIEJĄCYM DOM (bez remountu) — animacja odpala się raz, cofanie tylko ukrywa
function stepBuilds(forward) {
  const host = $('#stage-vp'); if (!host) return;
  animObjects(slides[presentIdx].content).forEach((o, i) => {
    const el = host.querySelector(`.slide-obj[data-id="${o.id}"]`);
    if (!el) return;
    if (i < buildStep) {
      el.style.visibility = 'visible';
      if (forward && i === buildStep - 1) { el.classList.remove('build-in-' + o.anim); void el.offsetWidth; el.classList.add('build-in-' + o.anim); }
    } else {
      el.style.visibility = 'hidden';
      el.classList.remove('build-in-fade', 'build-in-slide', 'build-in-scale');
    }
  });
  const prev = $('.stage-prev'); if (prev) prev.disabled = (presentIdx === 0 && buildStep === 0);
}
function goPresent(d) {
  const ni = Math.max(0, Math.min(slides.length - 1, presentIdx + d));
  if (ni === presentIdx) return;
  presentIdx = ni; buildStep = 0; renderStage(true);
}
function onPresentKey(e) {
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); nextStep(); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prevStep(); }
  else if (e.key === 'Escape') exitPresent();
  else if (e.key.toLowerCase() === 'p') { e.preventDefault(); openPresenter(); }
}

/* ── presenter view (drugie okno: bieżący + następny + notatki + zegar) ── */
const PRESENTER_CSS = `*{box-sizing:border-box;margin:0}
body{background:#0b0d12;color:#e8eaed;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;height:100vh;display:grid;grid-template-rows:auto 1fr auto;gap:14px;padding:16px;overflow:hidden}
.pv-top{display:flex;align-items:center;justify-content:space-between;font-size:14px;color:#9aa0aa}
.pv-timer{font-size:24px;font-weight:600;color:#fff;font-variant-numeric:tabular-nums}
.pv-main{display:grid;grid-template-columns:1.6fr 1fr;gap:18px;min-height:0}
.pv-col{display:flex;flex-direction:column;gap:8px;min-height:0}
.pv-label{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#9aa0aa}
.pv-screen{position:relative;aspect-ratio:16/9;width:100%;background:#000;border:1px solid #2a2f3a;border-radius:8px;overflow:hidden}
.pv-notes{flex:1;overflow:auto;background:#14181f;border:1px solid #2a2f3a;border-radius:8px;padding:14px;font-size:21px;line-height:1.5;white-space:pre-wrap}
.pv-bottom{display:flex;align-items:center;justify-content:center;gap:12px}
.pv-btn{background:#1c2230;border:1px solid #2a2f3a;color:#e8eaed;font-size:16px;padding:10px 24px;border-radius:8px;cursor:pointer}
.pv-btn:hover{background:#262d3d}
.slide-stage{position:absolute;top:0;left:0;transform-origin:top left}
.slide-bg{position:absolute;inset:0}.slide-bg__img{position:absolute;inset:0;width:100%;height:100%}
.slide-obj{position:absolute;box-sizing:border-box}.slide-obj--text{display:flex}
.slide-obj__text{max-width:100%;max-height:100%;overflow:hidden;white-space:pre-wrap;word-break:break-word}
.slide-obj__text ul,.slide-obj__text ol{margin:0;padding-left:1.3em;text-align:left}`;
function openPresenter() {
  if (presenterWin && !presenterWin.closed) { presenterWin.focus(); return; }
  presenterWin = window.open('', 'szron-presenter', 'width=1200,height=820');
  if (!presenterWin) { toast('Popup zablokowany', 'Zezwól na okno prezentera w przeglądarce', 'err'); return; }
  presenterWin.document.write(`<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Prezenter — SZRON</title><style>${PRESENTER_CSS}</style></head><body>
    <div class="pv-top"><span id="pv-count"></span><span class="pv-timer" id="pv-timer">0:00</span></div>
    <div class="pv-main">
      <div class="pv-col"><span class="pv-label">Bieżący slajd</span><div class="pv-screen" id="pv-cur"></div></div>
      <div class="pv-col"><span class="pv-label">Następny</span><div class="pv-screen" id="pv-next"></div><span class="pv-label" style="margin-top:6px">Notatki prezentera</span><div class="pv-notes" id="pv-notes"></div></div>
    </div>
    <div class="pv-bottom"><button class="pv-btn" id="pv-prev">◀ Wstecz</button><button class="pv-btn" id="pv-next-btn">Dalej ▶</button></div>
  </body></html>`);
  presenterWin.document.close();
  presentStart = Date.now();
  presenterWin.document.getElementById('pv-prev').addEventListener('click', prevStep);
  presenterWin.document.getElementById('pv-next-btn').addEventListener('click', nextStep);
  presenterWin.addEventListener('keydown', onPresentKey);
  presenterWin.addEventListener('beforeunload', () => { if (presenterTimer) { clearInterval(presenterTimer); presenterTimer = null; } });
  if (presenterTimer) clearInterval(presenterTimer);
  presenterTimer = setInterval(updatePresenterTimer, 1000);
  renderPresenter();
}
function updatePresenterTimer() {
  if (!presenterWin || presenterWin.closed) { if (presenterTimer) { clearInterval(presenterTimer); presenterTimer = null; } return; }
  const el = presenterWin.document.getElementById('pv-timer'); if (!el) return;
  const sec = Math.floor((Date.now() - presentStart) / 1000);
  el.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
function renderPresenter() {
  if (!presenterWin || presenterWin.closed) return;
  const doc = presenterWin.document; const dbg = deckBgCss();
  const fill = (id, content) => {
    const host = doc.getElementById(id); if (!host) return;
    if (!content) { host.innerHTML = '<div style="position:absolute;inset:0;display:grid;place-items:center;color:#5a616e;font-size:15px">— koniec —</div>'; return; }
    host.innerHTML = `<div class="slide-stage" style="width:${SLIDE_W}px;height:${SLIDE_H}px">${renderSlideInner(content, { deckBg: dbg })}</div>`;
    const st = host.querySelector('.slide-stage'); if (st) st.style.transform = `scale(${host.clientWidth / SLIDE_W})`;
  };
  fill('pv-cur', slides[presentIdx]?.content);
  fill('pv-next', slides[presentIdx + 1]?.content);
  const notes = doc.getElementById('pv-notes'); if (notes) notes.textContent = slides[presentIdx]?.notes || '— brak notatek —';
  const count = doc.getElementById('pv-count'); if (count) count.textContent = `Slajd ${presentIdx + 1} / ${slides.length}`;
}
function exitPresent() {
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  if (fsEl) { const exit = document.exitFullscreen || document.webkitExitFullscreen; if (exit) { try { exit.call(document); } catch (_) {} } }
  closeStage();   // zawsze zamykaj jawnie (nie polegaj na fullscreenchange)
}
function closeStage() {
  const stage = $('#stage');
  if (stage.hidden) return;
  stage.hidden = true; stage.innerHTML = '';
  document.removeEventListener('keydown', onPresentKey);
  if (presenterTimer) { clearInterval(presenterTimer); presenterTimer = null; }
  if (presenterWin && !presenterWin.closed) presenterWin.close();
  presenterWin = null;
}
// Wyjście z fullscreen zamyka prezentację — CHYBA że to przez otwarcie okna prezentera
// (window.open odbiera fullscreen); wtedy zostajemy w trybie overlay z aktywnym presenterem.
function onFsChange() {
  if (document.fullscreenElement || document.webkitFullscreenElement) return;
  if (presenterWin && !presenterWin.closed) return;
  closeStage();
}
document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);

/* ── klawiatura globalna (undo/redo) ── */
function onKeyGlobal(e) {
  if (!$('#stage').hidden) return;                       // prezentacja
  if ($('#modal-root')?.children.length) return;         // dialog
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCommandPalette(); return; }
  const ae = document.activeElement;
  const editing = (ae && (ae.isContentEditable || ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) || objEditor?.isEditing();
  if (editing) return;                                   // w polu tekstowym → natywne zachowanie
  if (e.key === '/') { e.preventDefault(); openCommandPalette('Wstaw'); return; }   // slash quick-insert
  const k = e.key.toLowerCase();
  if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
  if ((e.metaKey || e.ctrlKey) && k === 'd') { e.preventDefault(); duplicateSelectedObject(); return; }
  if ((e.metaKey || e.ctrlKey) && k === 'g') { e.preventDefault(); if (e.shiftKey) ungroupSelected(); else groupSelected(); return; }
  if ((e.metaKey || e.ctrlKey) && k === 'a') { e.preventDefault(); selectAllObjects(); return; }
  if ((e.metaKey || e.ctrlKey) && k === 'c') { if ((objEditor?.selectedIds() || []).length) { e.preventDefault(); copySelected(); } return; }
  if ((e.metaKey || e.ctrlKey) && k === 'v') { if (clipboard) { e.preventDefault(); pasteClipboard(); } return; }
  if ((e.metaKey || e.ctrlKey) && e.key === ']') { e.preventDefault(); zorder(e.shiftKey ? 'front' : 'forward'); return; }
  if ((e.metaKey || e.ctrlKey) && e.key === '[') { e.preventDefault(); zorder(e.shiftKey ? 'back' : 'backward'); return; }
  const hasSel = (objEditor?.selectedIds() || []).length > 0;
  if (hasSel && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); deleteSelectedObject(); return; }
  if (hasSel && e.key.startsWith('Arrow')) {
    e.preventDefault(); const step = e.shiftKey ? 20 : 2;
    nudgeSelected(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
    return;
  }
  if (e.key === 'Escape' && hasSel) { objEditor.clear(); }
}

/* ── init ── */
async function init() {
  const user = await getSessionUser();
  if (!user || !isAllowed(user.email)) return;
  if (!trainingId) { location.replace('/strefa/szkolenia'); return; }
  bindFileInputs();
  document.addEventListener('paste', onPaste);
  document.addEventListener('keydown', onKeyGlobal);
  document.addEventListener('click', (e) => { const m = $('#shape-menu'); if (m && !m.hidden && !e.target.closest('.deck-shape-wrap')) m.hidden = true; });
  window.addEventListener('resize', rescaleAll);
  window.addEventListener('beforeunload', () => { try { flushCurrent(); } catch (_) {} });
  $('#btn-present').addEventListener('click', startPresent);
  $('#btn-add-slide').addEventListener('click', addSlide);
  $('#btn-undo')?.addEventListener('click', doUndo);
  $('#btn-redo')?.addEventListener('click', doRedo);
  await load();
  if (!training) { toast('Nie znaleziono', 'Szkolenie nie istnieje lub brak dostępu', 'err'); setTimeout(() => location.replace('/strefa/szkolenia'), 1500); return; }
  document.getElementById('deck-title').textContent = training.name;
  redraw();
}
init();
