// Edytor slajdów dla szkoleń (strefa zamknięta SZRON).
// Osobny widok wchodzony z /strefa/szkolenia (przycisk Play). Dane w schemacie `strefa`:
// tabela `training_slides` (tekst + obrazek + kolejność) oraz tło decku w kolumnach na `trainings`.
// Workspace 3-panele: lewy filmstrip (drag&drop) + centralny canvas + prawy inspektor tła.
// Tryb prezentacji przez Fullscreen API. Jednoosobowa edycja jednego decku — bez Realtime.
import { getClient, getSessionUser, isAllowed, uploadSlideImage } from './supabase.js';

const sb = getClient();

/* ── helpery DOM (spójne ze strefa-szkolenia.js) ── */
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
// Slajd „tylko obraz" (np. zaimportowana prezentacja) — obraz wypełnia cały slajd, bez pola tekstu.
const isMedia = (s) => !!s.image_url && !(s.text || '').trim();

/* ── ikony (16px viewBox, currentColor) ── */
const ICO = {
  img: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>',
  empty: '<svg class="deck-empty__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M12 9v4M10 11h4"/></svg>',
};

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
let dragFrom = -1;            // indeks przeciąganej miniatury

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
  const key = id + '|' + Object.keys(patch).join(','); // osobny timer dla tekstu i notatek
  clearTimeout(saveTimers.get(key));
  saveTimers.set(key, setTimeout(() => {
    saveTimers.delete(key);
    sb.from('training_slides').update(patch).eq('id', id).then(({ error }) => { if (error) toast('Błąd zapisu', error.message, 'err'); });
  }, 600));
}
function flushSave(id, patch) {
  const key = id + '|' + Object.keys(patch).join(',');
  clearTimeout(saveTimers.get(key));
  saveTimers.delete(key);
  sb.from('training_slides').update(patch).eq('id', id).then(({ error }) => { if (error) toast('Błąd zapisu', error.message, 'err'); });
}
// Zapisuje bieżącą zawartość pola tekstu i notatek do pamięci + planuje zapis (przed re-renderem/zmianą slajdu).
function captureEdits() {
  const s = slides[current];
  if (!s) return;
  const el = document.getElementById('slide-text');
  if (el) {
    const val = el.innerText;
    if (val !== (s.text || '')) { s.text = val; scheduleSave(s.id, { text: val }); }
  }
  const nel = document.getElementById('slide-notes');
  if (nel) {
    const nv = nel.value;
    if (nv !== (s.notes || '')) { s.notes = nv; scheduleSave(s.id, { notes: nv }); }
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

/* ── render (4 części) ── */
function redraw() { renderEditor(); renderInspector(); renderStrip(); updateCounts(); }

function updateCounts() {
  const n = slides.length;
  const dc = $('#deck-count'); if (dc) dc.textContent = `${n} ${plSlajdy(n)}`;
  const rc = $('#rail-count'); if (rc) rc.textContent = String(n);
}

/* centrum: toolbar + canvas */
function renderEditor() {
  const stage = $('#editor-stage');
  if (!slides.length) {
    stage.innerHTML = `
      <div class="deck-canvas-wrap">
        <div class="deck-canvas is-empty" id="canvas">
          <div class="deck-empty">
            ${ICO.empty}
            <p class="deck-empty__title">Pusty deck</p>
            <p class="deck-empty__hint">Zacznij od pierwszego slajdu — tekst i tło dodasz za chwilę.</p>
            <button class="strefa-btn strefa-btn--accent" id="btn-add-first" type="button">+ Dodaj pierwszy slajd</button>
          </div>
        </div>
      </div>`;
    applyCanvasBg();
    $('#btn-add-first')?.addEventListener('click', addSlide);
    return;
  }
  const s = slides[current];
  const media = isMedia(s); // slajd tylko z obrazem → obraz wypełnia slajd (bez pola tekstu)
  stage.innerHTML = `
    <div class="deck-toolbar">
      <div class="deck-toolbar__group">
        <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="btn-slide-img" type="button">${ICO.img}<span>${s.image_url ? 'Zmień obrazek' : 'Obrazek'}</span></button>
        ${s.image_url ? `<button class="strefa-btn strefa-btn--ghost strefa-btn--sm" id="btn-slide-img-del" type="button">${ICO.trash}<span>Usuń</span></button>` : ''}
      </div>
      <span class="deck-toolbar__spacer"></span>
      <span class="deck-toolbar__counter">${current + 1} / ${slides.length}</span>
    </div>
    <div class="deck-canvas-wrap">
      <div class="deck-canvas${media ? ' is-media' : ''}" id="canvas">
        ${s.image_url ? `<img class="deck-canvas__img" src="${esc(s.image_url)}" alt="">` : ''}
        ${media ? '' : `<div class="deck-canvas__text" id="slide-text" contenteditable="true" data-ph="Wpisz tekst slajdu…" role="textbox" aria-multiline="true">${esc(s.text || '')}</div>`}
      </div>
    </div>
    <div class="deck-notes">
      <label class="deck-notes__label" for="slide-notes">Notatki prezentera</label>
      <textarea class="deck-notes__field" id="slide-notes" placeholder="Notatki dla prezentera — widoczne tylko tu, nie na slajdzie…">${esc(s.notes || '')}</textarea>
    </div>`;
  applyCanvasBg();
  bindCanvas();
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
    captureEdits();
    slides[current].image_url = null;
    const { error } = await sb.from('training_slides').update({ image_url: null }).eq('id', slides[current].id);
    if (error) return toast('Błąd', error.message, 'err');
    redraw();
  });
  const nta = $('#slide-notes');
  if (nta) {
    nta.addEventListener('input', () => { slides[current].notes = nta.value; scheduleSave(slides[current].id, { notes: nta.value }); });
    nta.addEventListener('blur', () => { flushSave(slides[current].id, { notes: nta.value }); });
  }
}

/* prawy inspektor: tło */
function renderInspector() {
  const host = $('#editor-inspector');
  const hasBg = !!(training.slides_bg_image || training.slides_bg_color);
  const activeColor = training.slides_bg_image ? '' : norm(training.slides_bg_color);
  host.innerHTML = `
    <div class="deck-inspector__head">
      <span class="deck-inspector__title">Tło</span>
      <span class="deck-inspector__sub">całe szkolenie</span>
    </div>
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
  const prev = $('#bg-preview');
  if (prev) prev.style.background = bgValue();
  bindInspector();
}

function bindInspector() {
  $$('.bg-chip').forEach((b) => b.addEventListener('click', async () => {
    captureEdits();
    await saveBg({ slides_bg_color: b.dataset.bg, slides_bg_image: null });
    redraw();
  }));
  const ci = $('#bg-color');
  // live preview podczas wybierania (bez re-renderu)
  ci?.addEventListener('input', () => {
    const c = $('#canvas'); if (c) c.style.background = ci.value;
    const p = $('#bg-preview'); if (p) p.style.background = ci.value;
    const h = $('#bg-hex'); if (h) h.textContent = ci.value.toUpperCase();
  });
  ci?.addEventListener('change', async () => {
    captureEdits();
    await saveBg({ slides_bg_color: ci.value, slides_bg_image: null });
    redraw();
  });
  $('#btn-bg-img')?.addEventListener('click', () => $('#bg-img-input').click());
  $('#btn-bg-clear')?.addEventListener('click', async () => {
    captureEdits();
    await saveBg({ slides_bg_color: null, slides_bg_image: null });
    redraw();
  });
}

/* lewy rail: filmstrip miniatur */
function renderStrip() {
  const strip = $('#strip');
  strip.innerHTML = slides.map((s, i) => `
    <div class="deck-thumb ${i === current ? 'is-active' : ''}${isMedia(s) ? ' is-media' : ''}" data-idx="${i}" draggable="true" role="option" aria-selected="${i === current}" tabindex="0">
      <div class="deck-thumb__inner">
        ${s.image_url ? `<img src="${esc(s.image_url)}" alt="">` : ''}
        ${isMedia(s) ? '' : `<span class="deck-thumb__txt">${esc((s.text || '').slice(0, 60))}</span>`}
      </div>
      <span class="deck-thumb__num">${i + 1}</span>
      <div class="deck-thumb__tools">
        <button class="deck-thumb__btn" data-move="up" title="W górę" ${i === 0 ? 'disabled' : ''}>${ICO.up}</button>
        <button class="deck-thumb__btn" data-move="down" title="W dół" ${i === slides.length - 1 ? 'disabled' : ''}>${ICO.down}</button>
        <button class="deck-thumb__btn deck-thumb__btn--del" data-del title="Usuń slajd">${ICO.x}</button>
      </div>
      <span class="deck-thumb__grip" aria-hidden="true">${ICO.grip}</span>
    </div>`).join('');
  // tło miniatur = tło decku
  $$('.deck-thumb__inner', strip).forEach((el) => { el.style.background = bgValue(); });
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
    thumb.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectSlide(idx); }
    });

    // drag & drop reorder
    thumb.addEventListener('dragstart', (e) => {
      dragFrom = idx; thumb.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(idx)); } catch (_) { /* noop */ }
    });
    thumb.addEventListener('dragend', () => {
      dragFrom = -1;
      strip.querySelectorAll('.deck-thumb').forEach((t) => t.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after'));
    });
    thumb.addEventListener('dragover', (e) => {
      if (dragFrom < 0 || dragFrom === idx) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      const r = thumb.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      thumb.classList.toggle('is-drop-after', after);
      thumb.classList.toggle('is-drop-before', !after);
    });
    thumb.addEventListener('dragleave', () => { thumb.classList.remove('is-drop-before', 'is-drop-after'); });
    thumb.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragFrom < 0 || dragFrom === idx) return;
      const r = thumb.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      dropReorder(dragFrom, idx + (after ? 1 : 0));
    });
  });
}

function selectSlide(idx) {
  if (idx === current) return;
  captureEdits();
  current = idx;
  redraw();
}

/* ── CRUD / reorder ── */
async function addSlide() {
  captureEdits();
  const { data, error } = await sb.from('training_slides')
    .insert({ training_id: trainingId, position: slides.length, text: '', image_url: null })
    .select().single();
  if (error) return toast('Błąd', error.message, 'err');
  slides.push(data);
  current = slides.length - 1;
  redraw();
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
  redraw();
  toast('Usunięto', 'Slajd skasowany', 'ok');
}

// Wyrównuje position do indeksów 0..n-1 (po usunięciu / przeniesieniu). Zapisuje tylko zmienione.
async function renumber() {
  const ops = [];
  slides.forEach((s, i) => { if (s.position !== i) { s.position = i; ops.push(sb.from('training_slides').update({ position: i }).eq('id', s.id)); } });
  if (ops.length) await Promise.all(ops);
}

// Przesunięcie strzałką (fallback dla drag&drop). dir: 'up' | 'down'.
async function moveSlide(idx, dir) {
  const j = dir === 'up' ? idx - 1 : idx + 1;
  if (j < 0 || j >= slides.length) return;
  captureEdits();
  const movedId = slides[idx].id;
  [slides[idx], slides[j]] = [slides[j], slides[idx]];
  current = slides.findIndex((s) => s.id === movedId);
  redraw();
  await renumber();
}

// Przeniesienie przez drag&drop: z indeksu `from` na pozycję `target` (przed elementem o tym indeksie).
async function dropReorder(from, target) {
  if (from < 0 || from >= slides.length) return;
  const movedId = slides[from].id;
  const [m] = slides.splice(from, 1);
  if (target > from) target -= 1;                 // korekta po usunięciu źródła
  target = Math.max(0, Math.min(slides.length, target));
  slides.splice(target, 0, m);
  current = slides.findIndex((s) => s.id === movedId);
  redraw();
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
  captureEdits();
  toast('Wgrywanie…', file.name);
  const res = await uploadSlideImage(file, trainingId, 'slides');
  if (res.error) return toast('Błąd uploadu', res.error, 'err');
  slides[current].image_url = res.url;
  const { error } = await sb.from('training_slides').update({ image_url: res.url }).eq('id', slides[current].id);
  if (error) return toast('Błąd', error.message, 'err');
  redraw();
  toast('Gotowe', 'Obrazek dodany', 'ok');
}

async function handleBgImage(file) {
  toast('Wgrywanie tła…', file.name);
  const res = await uploadSlideImage(file, trainingId, 'bg');
  if (res.error) return toast('Błąd uploadu', res.error, 'err');
  captureEdits();
  await saveBg({ slides_bg_image: res.url, slides_bg_color: null });
  redraw();
  toast('Gotowe', 'Tło ustawione', 'ok');
}

// Wklejenie obrazka ze schowka (Ctrl/Cmd+V) → wstaw na aktywny slajd jak przyciskiem „Obrazek".
function onPaste(e) {
  if (!slides.length || !slides[current]) return;     // brak slajdu do wklejenia
  if (!$('#stage').hidden) return;                    // trwa prezentacja
  if ($('#modal-root')?.children.length) return;      // otwarty dialog
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const it of items) {
    if (it.kind === 'file' && it.type && it.type.startsWith('image/')) {
      const file = it.getAsFile();
      if (file) { e.preventDefault(); handleSlideImage(file); }
      return;                                          // obsłużony obrazek — nie wklejaj jako tekst
    }
  }
  // brak obrazka w schowku → zwykłe wklejenie tekstu w polu przebiega normalnie
}

/* ── tryb prezentacji (Fullscreen API) ── */
let presentIdx = 0;
function startPresent() {
  if (!slides.length) return toast('Brak slajdów', 'Dodaj choć jeden slajd', 'err');
  captureEdits();
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
  const total = slides.length;
  stage.style.background = bgValue();
  const dots = total <= 12
    ? slides.map((_, i) => `<span class="stage-dot ${i === presentIdx ? 'is-current' : ''}" data-go="${i}"></span>`).join('')
    : '';
  stage.innerHTML = `
    <button class="stage-nav stage-prev" aria-label="Poprzedni slajd" ${presentIdx === 0 ? 'disabled' : ''}>◀</button>
    <div class="stage-slide${isMedia(s) ? ' is-media' : ''}">
      ${s.image_url ? `<img class="stage-img" src="${esc(s.image_url)}" alt="">` : ''}
      ${isMedia(s) ? '' : `<div class="stage-text">${esc(s.text || '').replace(/\n/g, '<br>')}</div>`}
    </div>
    <button class="stage-nav stage-next" aria-label="Następny slajd" ${presentIdx === total - 1 ? 'disabled' : ''}>▶</button>
    <button class="stage-exit" aria-label="Zamknij prezentację">✕</button>
    <div class="stage-progress">${dots}<span class="stage-count-txt">${presentIdx + 1} / ${total}</span></div>`;
  stage.querySelector('.stage-prev').addEventListener('click', () => goPresent(-1));
  stage.querySelector('.stage-next').addEventListener('click', () => goPresent(1));
  stage.querySelector('.stage-exit').addEventListener('click', exitPresent);
  stage.querySelectorAll('[data-go]').forEach((d) => d.addEventListener('click', () => { presentIdx = +d.dataset.go; renderStage(); }));
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
  document.addEventListener('paste', onPaste);
  $('#btn-present').addEventListener('click', startPresent);
  $('#btn-add-slide').addEventListener('click', addSlide);
  await load();
  if (!training) {
    toast('Nie znaleziono', 'Szkolenie nie istnieje lub brak dostępu', 'err');
    setTimeout(() => location.replace('/strefa/szkolenia'), 1500);
    return;
  }
  document.getElementById('deck-title').textContent = training.name;
  redraw();
}

init();
