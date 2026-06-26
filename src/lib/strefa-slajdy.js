// Edytor slajdów dla szkoleń (strefa zamknięta SZRON).
// Osobny widok wchodzony z /strefa/szkolenia (przycisk Play). Dane w schemacie `strefa`:
// tabela `training_slides` (tekst + obrazek + kolejność) oraz tło decku w kolumnach na `trainings`.
// Tryb prezentacji przez Fullscreen API. Jednoosobowa edycja jednego decku — bez Realtime.
import { getClient, getSessionUser, isAllowed, uploadSlideImage } from './supabase.js';

const sb = getClient();

/* ── helpery DOM (spójne ze strefa-szkolenia.js) ── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (c) => String(c || '').trim().toLowerCase();
const toHex = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : null);

/* ── toasty ── */
function toast(title, body = '', kind = '') {
  const wrap = $('#toasts');
  const t = document.createElement('div');
  t.className = 'strefa-toast' + (kind ? ` strefa-toast--${kind}` : '');
  t.innerHTML = `<strong>${esc(title)}</strong>${body ? `<span>${esc(body)}</span>` : ''}`;
  wrap.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3800);
}

/* ── modale ── */
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
let training = null;          // { id, name, slides_bg_color, slides_bg_image }
let slides = [];              // [{ id, position, text, image_url }]
let current = 0;              // aktywny slajd w edytorze
const saveTimers = new Map(); // slideId -> timeout (debounce zapisu tekstu)

// Presety tła (hex — kompatybilne z <input type="color">).
const BG_PRESETS = [
  { name: 'Grafit', value: '#14181f' },
  { name: 'Granat', value: '#0f1f4d' },
  { name: 'Stal', value: '#334155' },
  { name: 'Pomarańcz', value: '#f97316' },
  { name: 'Biały', value: '#ffffff' },
  { name: 'Czarny', value: '#000000' },
];

/* ── DB ── */
async function load() {
  const { data: t, error: te } = await sb.from('trainings')
    .select('id,name,slides_bg_color,slides_bg_image').eq('id', trainingId).single();
  training = te ? null : t;
  if (!training) return;
  const { data: s } = await sb.from('training_slides')
    .select('*').eq('training_id', trainingId).order('position').order('created_at');
  slides = s || [];
}

function scheduleSave(id, patch) {
  clearTimeout(saveTimers.get(id));
  saveTimers.set(id, setTimeout(() => {
    saveTimers.delete(id);
    sb.from('training_slides').update(patch).eq('id', id).then(({ error }) => { if (error) toast('Błąd zapisu', error.message, 'err'); });
  }, 600));
}
function flushSave(id, patch) {
  clearTimeout(saveTimers.get(id));
  saveTimers.delete(id);
  sb.from('training_slides').update(patch).eq('id', id).then(({ error }) => { if (error) toast('Błąd zapisu', error.message, 'err'); });
}
// Zapisuje bieżącą zawartość pola tekstowego do pamięci + planuje zapis (przed re-renderem/zmianą slajdu).
function captureText() {
  const el = document.getElementById('slide-text');
  if (!el || !slides[current]) return;
  const val = el.innerText;
  if (val !== (slides[current].text || '')) {
    slides[current].text = val;
    scheduleSave(slides[current].id, { text: val });
  }
}

/* ── tło decku ── */
function bgValue() {
  if (training.slides_bg_image) return `url("${training.slides_bg_image}") center / cover no-repeat`;
  return training.slides_bg_color || 'var(--color-ink)';
}
function applyCanvasBg() {
  const c = document.getElementById('canvas');
  if (c) c.style.background = bgValue();
}
async function saveBg(patch) {
  Object.assign(training, patch);
  const { error } = await sb.from('trainings').update(patch).eq('id', trainingId);
  if (error) toast('Błąd tła', error.message, 'err');
}

/* ── render: edytor ── */
function bgPanelHTML() {
  const hasBg = !!(training.slides_bg_image || training.slides_bg_color);
  const activeColor = training.slides_bg_image ? '' : norm(training.slides_bg_color);
  return `
    <div class="bg-panel">
      <span class="bg-panel__label">Tło — całe szkolenie</span>
      <div class="bg-swatches">
        ${BG_PRESETS.map((p) => `<button class="bg-swatch ${activeColor === norm(p.value) ? 'is-active' : ''}" data-bg="${p.value}" title="${esc(p.name)}" style="background:${p.value}"></button>`).join('')}
      </div>
      <label class="bg-colorpick" title="Własny kolor">
        <input type="color" id="bg-color" value="${toHex(training.slides_bg_color) || '#14181f'}" />
        <span>Własny</span>
      </label>
      <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="btn-bg-img">${training.slides_bg_image ? 'Zmień obrazek tła' : 'Obrazek tła'}</button>
      ${hasBg ? `<button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="btn-bg-clear">Usuń tło</button>` : ''}
    </div>`;
}

function renderEditor() {
  const ed = $('#editor');
  if (!slides.length) {
    ed.innerHTML = `
      <div class="slide-canvas slide-canvas--empty" id="canvas">
        <div class="slide-empty">Brak slajdów. Dodaj pierwszy przyciskiem <strong>+ Slajd</strong> poniżej.</div>
      </div>
      ${bgPanelHTML()}`;
    applyCanvasBg();
    bindBgPanel();
    return;
  }
  const s = slides[current];
  ed.innerHTML = `
    <div class="slide-canvas" id="canvas">
      ${s.image_url ? `<img class="slide-img" src="${esc(s.image_url)}" alt="">` : ''}
      <div class="slide-text" id="slide-text" contenteditable="true" data-ph="Wpisz tekst slajdu…">${esc(s.text || '')}</div>
    </div>
    <div class="slide-toolbar">
      <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="btn-slide-img">${s.image_url ? 'Zmień obrazek' : '+ Obrazek'}</button>
      ${s.image_url ? `<button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="btn-slide-img-del">Usuń obrazek</button>` : ''}
      <span class="slide-counter">Slajd ${current + 1} / ${slides.length}</span>
    </div>
    ${bgPanelHTML()}`;
  applyCanvasBg();
  bindCanvas();
  bindBgPanel();
}

function bindCanvas() {
  const txt = $('#slide-text');
  if (txt) {
    txt.addEventListener('input', () => {
      const val = txt.innerText;
      slides[current].text = val;
      scheduleSave(slides[current].id, { text: val });
    });
    txt.addEventListener('blur', () => { flushSave(slides[current].id, { text: txt.innerText }); });
  }
  $('#btn-slide-img')?.addEventListener('click', () => $('#slide-img-input').click());
  $('#btn-slide-img-del')?.addEventListener('click', async () => {
    captureText();
    slides[current].image_url = null;
    const { error } = await sb.from('training_slides').update({ image_url: null }).eq('id', slides[current].id);
    if (error) return toast('Błąd', error.message, 'err');
    renderEditor(); renderStrip();
  });
}

function bindBgPanel() {
  $$('.bg-swatch').forEach((b) => b.addEventListener('click', async () => {
    captureText();
    await saveBg({ slides_bg_color: b.dataset.bg, slides_bg_image: null });
    renderEditor(); renderStrip();
  }));
  const ci = $('#bg-color');
  // live preview podczas wybierania
  ci?.addEventListener('input', () => { const c = $('#canvas'); if (c) c.style.background = ci.value; });
  ci?.addEventListener('change', async () => {
    captureText();
    await saveBg({ slides_bg_color: ci.value, slides_bg_image: null });
    renderEditor(); renderStrip();
  });
  $('#btn-bg-img')?.addEventListener('click', () => $('#bg-img-input').click());
  $('#btn-bg-clear')?.addEventListener('click', async () => {
    captureText();
    await saveBg({ slides_bg_color: null, slides_bg_image: null });
    renderEditor(); renderStrip();
  });
}

/* ── render: pasek miniatur ── */
function renderStrip() {
  const strip = $('#strip');
  strip.innerHTML = slides.map((s, i) => `
    <div class="slide-thumb ${i === current ? 'is-active' : ''}" data-idx="${i}">
      <div class="slide-thumb__inner">
        ${s.image_url ? `<img src="${esc(s.image_url)}" alt="">` : ''}
        <span class="slide-thumb__txt">${esc((s.text || '').slice(0, 60))}</span>
      </div>
      <span class="slide-thumb__num">${i + 1}</span>
      <div class="slide-thumb__tools">
        <button class="slide-thumb__btn" data-move="prev" title="W lewo" ${i === 0 ? 'disabled' : ''}>◀</button>
        <button class="slide-thumb__btn" data-move="next" title="W prawo" ${i === slides.length - 1 ? 'disabled' : ''}>▶</button>
        <button class="slide-thumb__btn slide-thumb__btn--del" data-del title="Usuń slajd">✕</button>
      </div>
    </div>`).join('') +
    `<button class="slide-thumb slide-thumb--add" data-add-slide title="Dodaj slajd"><span>+ Slajd</span></button>`;
  // tło miniatur = tło decku
  $$('.slide-thumb__inner', strip).forEach((el) => { el.style.background = bgValue(); });
  bindStrip();
}

function bindStrip() {
  const strip = $('#strip');
  strip.querySelectorAll('[data-idx]').forEach((thumb) => {
    thumb.addEventListener('click', (e) => {
      const moveBtn = e.target.closest('[data-move]');
      if (moveBtn) { e.stopPropagation(); moveSlide(+thumb.dataset.idx, moveBtn.dataset.move); return; }
      if (e.target.closest('[data-del]')) { e.stopPropagation(); deleteSlide(+thumb.dataset.idx); return; }
      const idx = +thumb.dataset.idx;
      if (idx === current) return;
      captureText();
      current = idx;
      renderEditor(); renderStrip();
    });
  });
  strip.querySelector('[data-add-slide]')?.addEventListener('click', addSlide);
}

/* ── CRUD slajdów ── */
async function addSlide() {
  captureText();
  const { data, error } = await sb.from('training_slides')
    .insert({ training_id: trainingId, position: slides.length, text: '', image_url: null })
    .select().single();
  if (error) return toast('Błąd', error.message, 'err');
  slides.push(data);
  current = slides.length - 1;
  renderEditor(); renderStrip();
  $('#slide-text')?.focus();
}

async function deleteSlide(idx) {
  const s = slides[idx];
  if (!s) return;
  if (!(await confirmDialog('Usunąć ten slajd?'))) return;
  const { error } = await sb.from('training_slides').delete().eq('id', s.id);
  if (error) return toast('Błąd', error.message, 'err');
  slides.splice(idx, 1);
  if (current >= slides.length) current = Math.max(0, slides.length - 1);
  await renumber();
  renderEditor(); renderStrip();
  toast('Usunięto', 'Slajd skasowany', 'ok');
}

// Wyrównuje position do indeksów 0..n-1 (po usunięciu / przeniesieniu). Zapisuje tylko zmienione.
async function renumber() {
  const ops = [];
  slides.forEach((s, i) => { if (s.position !== i) { s.position = i; ops.push(sb.from('training_slides').update({ position: i }).eq('id', s.id)); } });
  if (ops.length) await Promise.all(ops);
}

async function moveSlide(idx, dir) {
  const j = dir === 'prev' ? idx - 1 : idx + 1;
  if (j < 0 || j >= slides.length) return;
  captureText();
  const movedId = slides[idx].id;
  [slides[idx], slides[j]] = [slides[j], slides[idx]];
  current = slides.findIndex((s) => s.id === movedId);
  renderEditor(); renderStrip();
  await renumber();
}

/* ── upload obrazków ── */
function bindFileInputs() {
  $('#slide-img-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (file) await handleSlideImage(file);
  });
  $('#bg-img-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (file) await handleBgImage(file);
  });
}

async function handleSlideImage(file) {
  if (!slides[current]) return;
  captureText();
  toast('Wgrywanie…', file.name);
  const res = await uploadSlideImage(file, trainingId, 'slides');
  if (res.error) return toast('Błąd uploadu', res.error, 'err');
  slides[current].image_url = res.url;
  const { error } = await sb.from('training_slides').update({ image_url: res.url }).eq('id', slides[current].id);
  if (error) return toast('Błąd', error.message, 'err');
  renderEditor(); renderStrip();
  toast('Gotowe', 'Obrazek dodany', 'ok');
}

async function handleBgImage(file) {
  toast('Wgrywanie tła…', file.name);
  const res = await uploadSlideImage(file, trainingId, 'bg');
  if (res.error) return toast('Błąd uploadu', res.error, 'err');
  captureText();
  await saveBg({ slides_bg_image: res.url, slides_bg_color: null });
  renderEditor(); renderStrip();
  toast('Gotowe', 'Tło ustawione', 'ok');
}

/* ── tryb prezentacji (Fullscreen API) ── */
let presentIdx = 0;
function startPresent() {
  if (!slides.length) return toast('Brak slajdów', 'Dodaj choć jeden slajd', 'err');
  captureText();
  presentIdx = current;
  const stage = $('#stage');
  stage.hidden = false;
  renderStage();
  const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
  if (req) req.call(stage).catch(() => { /* zostajemy w fixed-overlay fallback */ });
  document.addEventListener('keydown', onPresentKey);
}

function renderStage() {
  const stage = $('#stage');
  const s = slides[presentIdx];
  stage.style.background = bgValue();
  stage.innerHTML = `
    <button class="stage-nav stage-prev" aria-label="Poprzedni slajd" ${presentIdx === 0 ? 'disabled' : ''}>◀</button>
    <div class="stage-slide">
      ${s.image_url ? `<img class="stage-img" src="${esc(s.image_url)}" alt="">` : ''}
      <div class="stage-text">${esc(s.text || '').replace(/\n/g, '<br>')}</div>
    </div>
    <button class="stage-nav stage-next" aria-label="Następny slajd" ${presentIdx === slides.length - 1 ? 'disabled' : ''}>▶</button>
    <button class="stage-exit" aria-label="Zamknij prezentację">✕</button>
    <span class="stage-counter">${presentIdx + 1} / ${slides.length}</span>`;
  stage.querySelector('.stage-prev').addEventListener('click', () => goPresent(-1));
  stage.querySelector('.stage-next').addEventListener('click', () => goPresent(1));
  stage.querySelector('.stage-exit').addEventListener('click', exitPresent);
}

function goPresent(d) {
  presentIdx = Math.max(0, Math.min(slides.length - 1, presentIdx + d));
  renderStage();
}

function onPresentKey(e) {
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); goPresent(1); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goPresent(-1); }
  else if (e.key === 'Escape') exitPresent();
}

function exitPresent() {
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  if (fsEl) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) exit.call(document); // fullscreenchange posprząta
  } else {
    closeStage();
  }
}

function closeStage() {
  const stage = $('#stage');
  if (stage.hidden) return;
  stage.hidden = true;
  stage.innerHTML = '';
  document.removeEventListener('keydown', onPresentKey);
}

document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) closeStage(); });
document.addEventListener('webkitfullscreenchange', () => { if (!document.webkitFullscreenElement) closeStage(); });

/* ── init ── */
async function init() {
  const user = await getSessionUser();
  if (!user || !isAllowed(user.email)) return; // layout przekieruje na /strefa/login
  if (!trainingId) { location.replace('/strefa/szkolenia'); return; }
  bindFileInputs();
  $('#btn-present').addEventListener('click', startPresent);
  await load();
  if (!training) {
    toast('Nie znaleziono', 'Szkolenie nie istnieje lub brak dostępu', 'err');
    setTimeout(() => location.replace('/strefa/szkolenia'), 1500);
    return;
  }
  document.getElementById('deck-title').textContent = training.name;
  renderEditor();
  renderStrip();
}

init();
