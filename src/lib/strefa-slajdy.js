// Edytor slajdów SZRON — v2 (model obiektowy). Faza 0: dokument sceny `content`,
// wspólny renderer (edytor/miniatury/prezentacja), autosave całego content, undo/redo.
import { getClient, getSessionUser, isAllowed, uploadSlideImage } from './supabase.js';
import { SLIDE_W, SLIDE_H, slideToContent, contentToPatch, newObject, textToHtml, genId } from './slajdy/slide-model.js';
import { mountSlide, applyScale } from './slajdy/slide-renderer.js';
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

/* ── DB load ── */
async function load() {
  const { data: t, error: te } = await sb.from('trainings')
    .select('id,name,slides_bg_color,slides_bg_image').eq('id', trainingId).single();
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
    const html = textToHtml(el.innerText); // Faza 0: plain text
    if ((obj.richText || '') !== html) { obj.richText = html; changed = true; }
  });
  return changed;
}
function flushCurrent() {
  const s = slides[current]; if (!s) return;
  captureTextDom();
  flushSaveContent(s);
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
function rescaleAll() { $$('.slide-stage').forEach((st) => applyScale(st.parentElement, st)); }

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
      </div>
      <span class="deck-toolbar__spacer"></span>
      <span class="deck-toolbar__counter">${current + 1} / ${slides.length}</span>
    </div>
    <div class="deck-canvas-wrap">
      <div class="slide-viewport" id="canvas"></div>
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
  if (objEditor) objEditor.destroy();
  objEditor = createObjectEditor({ host, getSlide: () => slides[current], commit: editorCommit });
  bindEditorChrome();
}

function editorCommit() { const s = slides[current]; if (!s) return; scheduleSaveContent(s); pushHistory(); }

function bindEditorChrome() {
  const s = slides[current];
  $('#btn-add-text')?.addEventListener('click', insertText);
  $('#btn-add-img')?.addEventListener('click', () => $('#slide-img-input').click());
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
  const obj = newObject('text', { x: 560, y: 460, w: 800, h: 160, size: 64, align: 'center', valign: 'middle', richText: '' });
  addObject(s, obj, { edit: true });
}
function imageDims(url) {
  return new Promise((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 0, h: 0 }); im.src = url; });
}
function deleteSelectedObject() {
  const s = slides[current]; const id = objEditor?.selected(); if (!s || !id) return;
  const i = s.content.objects.findIndex((o) => o.id === id);
  if (i < 0) return;
  s.content.objects.splice(i, 1);
  s.content.objects.forEach((o, k) => { o.z = k; });
  objEditor.clear();
  scheduleSaveContent(s); pushHistory(); renderEditor();
}
function duplicateSelectedObject() {
  const s = slides[current]; const id = objEditor?.selected(); if (!s || !id) return;
  const src = s.content.objects.find((o) => o.id === id); if (!src) return;
  const copy = { ...JSON.parse(JSON.stringify(src)), id: genId(), x: src.x + 24, y: src.y + 24 };
  addObject(s, copy);
}
function nudgeSelected(dx, dy) {
  const s = slides[current]; const id = objEditor?.selected(); if (!s || !id) return;
  const o = s.content.objects.find((x) => x.id === id); if (!o) return;
  o.x += dx; o.y += dy;
  const el = $(`#canvas .slide-obj[data-id="${id}"]`);
  if (el) el.style.transform = `translate(${o.x}px,${o.y}px) rotate(${o.rotation || 0}deg)`;
  objEditor.updateRect();
  scheduleSaveContent(s); pushHistory();
}

/* prawy inspektor: tło decku */
function renderInspector() {
  const host = $('#editor-inspector');
  const hasBg = !!(training.slides_bg_image || training.slides_bg_color);
  const activeColor = training.slides_bg_image ? '' : norm(training.slides_bg_color);
  host.innerHTML = `
    <div class="deck-inspector__head"><span class="deck-inspector__title">Tło</span><span class="deck-inspector__sub">całe szkolenie</span></div>
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
  const starter = { version: 1, background: { type: 'none' }, objects: [newObject('text', { x: 80, y: 0, w: SLIDE_W - 160, h: 1080, valign: 'middle', align: 'center', size: 96, richText: '', z: 0 })] };
  const { data, error } = await sb.from('training_slides')
    .insert({ training_id: trainingId, position: slides.length, ...contentToPatch(starter) }).select().single();
  if (error) return toast('Błąd', error.message, 'err');
  data.content = starter;
  slides.push(data);
  current = slides.length - 1;
  history.reset(data.id, clone(starter));
  redraw();
  $('#canvas .slide-obj__text[contenteditable]')?.focus();
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
let presentIdx = 0;
function startPresent() {
  if (!slides.length) return toast('Brak slajdów', 'Dodaj choć jeden slajd', 'err');
  flushCurrent();
  presentIdx = current;
  const stage = $('#stage');
  stage.hidden = false;
  renderStage();
  const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
  if (req) req.call(stage).catch(() => {});
  document.addEventListener('keydown', onPresentKey);
}
function renderStage() {
  const stage = $('#stage');
  const s = slides[presentIdx];
  const total = slides.length;
  const dots = total <= 12 ? slides.map((_, i) => `<span class="stage-dot ${i === presentIdx ? 'is-current' : ''}" data-go="${i}"></span>`).join('') : '';
  stage.innerHTML = `
    <button class="stage-nav stage-prev" aria-label="Poprzedni slajd" ${presentIdx === 0 ? 'disabled' : ''}>◀</button>
    <div class="slide-viewport" id="stage-vp"></div>
    <button class="stage-nav stage-next" aria-label="Następny slajd" ${presentIdx === total - 1 ? 'disabled' : ''}>▶</button>
    <button class="stage-exit" aria-label="Zamknij prezentację">✕</button>
    <div class="stage-progress">${dots}<span class="stage-count-txt">${presentIdx + 1} / ${total}</span></div>`;
  const host = $('#stage-vp');
  mountSlide(host, s.content, { deckBg: deckBgCss(), editable: false, observe: false });
  applyScale(host, host.querySelector('.slide-stage'));
  stage.querySelector('.stage-prev').addEventListener('click', () => goPresent(-1));
  stage.querySelector('.stage-next').addEventListener('click', () => goPresent(1));
  stage.querySelector('.stage-exit').addEventListener('click', exitPresent);
  stage.querySelectorAll('[data-go]').forEach((d) => d.addEventListener('click', () => { presentIdx = +d.dataset.go; renderStage(); }));
}
function goPresent(d) { presentIdx = Math.max(0, Math.min(slides.length - 1, presentIdx + d)); renderStage(); }
function onPresentKey(e) {
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); goPresent(1); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goPresent(-1); }
  else if (e.key === 'Escape') exitPresent();
}
function exitPresent() {
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  if (fsEl) { const exit = document.exitFullscreen || document.webkitExitFullscreen; if (exit) exit.call(document); }
  else closeStage();
}
function closeStage() {
  const stage = $('#stage');
  if (stage.hidden) return;
  stage.hidden = true; stage.innerHTML = '';
  document.removeEventListener('keydown', onPresentKey);
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) closeStage(); });
document.addEventListener('webkitfullscreenchange', () => { if (!document.webkitFullscreenElement) closeStage(); });

/* ── klawiatura globalna (undo/redo) ── */
function onKeyGlobal(e) {
  if (!$('#stage').hidden) return;                       // prezentacja
  if ($('#modal-root')?.children.length) return;         // dialog
  const ae = document.activeElement;
  const editing = (ae && (ae.isContentEditable || ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) || objEditor?.isEditing();
  if (editing) return;                                   // w polu tekstowym → natywne zachowanie
  const k = e.key.toLowerCase();
  if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
  if ((e.metaKey || e.ctrlKey) && k === 'd') { e.preventDefault(); duplicateSelectedObject(); return; }
  const hasSel = !!objEditor?.selected();
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
