// Strefa / Diagramy — prosty edytor diagramów w stylu Excalidraw (rysowanie „ołówkiem").
// Galeria diagramów z miniaturami (renderowane z jsonb) → klik otwiera edytor pełnoekranowy.
// Kształt: { id, type: 'rect'|'arrow', x, y, w, h, text?, seed }
// (strzałka: x,y = początek, w,h = wektor do końca; rect trzymany znormalizowany w>0,h>0).
import { getClient, getTeamUser } from './supabase.js';
import { $, esc, fmtDateTime, toast, confirmDialog, openModal, closeModal } from './strefa-ui.js';

const sb = getClient();

/* ── stan ── */
let diagrams = [];          // [{id,title,updated_at,data}]
let current = null;         // otwarty diagram
let shapes = [];
let tool = 'select';
let selectedId = null;
let camera = { x: 0, y: 0, z: 1 };
let drag = null;            // operacja myszy w toku
let editingId = null;       // rect z otwartym edytorem tekstu
let saveTimer = null;
let dirty = false;

const FONT = 36, LINE_H = 43; // tekst w prostokątach (Caveat)

const canvas = $('#diag-canvas');
const ctx = canvas.getContext('2d');
const wrap = $('#canvas-wrap');
const textEl = $('#diag-text');

const uid = () => Math.random().toString(36).slice(2, 10);

/* ── „ołówkowe" rysowanie: seedowany PRNG, JEDNA falująca kreska ── */
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Pojedyncza kreska ołówka: łamana z błądzeniem losowym w poprzek + lekkie wygięcie
// całości (bow) i drobny przestrzał na końcach — bez drugiego przebiegu.
function sketchLine(g, x1, y1, x2, y2, rnd, overshoot = 0) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len;   // wzdłuż
  const nx = -uy, ny = ux;                            // w poprzek
  if (overshoot) {
    const o1 = rnd() * overshoot, o2 = rnd() * overshoot;
    x1 -= ux * o1; y1 -= uy * o1; x2 += ux * o2; y2 += uy * o2;
  }
  const segs = Math.max(4, Math.min(26, Math.round(len / 18)));
  const amp = Math.min(1.6, 0.5 + len / 400);         // amplituda drżenia
  const bow = (rnd() - 0.5) * Math.min(6, len / 22);  // wygięcie łuku całej kreski
  let off = (rnd() - 0.5) * amp;
  g.beginPath();
  g.moveTo(x1 + nx * off, y1 + ny * off);
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    off += (rnd() - 0.5) * amp;
    off = Math.max(-2.2, Math.min(2.2, off));
    const o = off + Math.sin(Math.PI * t) * bow;
    g.lineTo(x1 + (x2 - x1) * t + nx * o, y1 + (y2 - y1) * t + ny * o);
  }
  g.stroke();
}
function sketchRect(g, x, y, w, h, rnd) {
  const ov = Math.min(5, Math.max(2, (w + h) / 90)); // rogi lekko „przerysowane"
  sketchLine(g, x, y, x + w, y, rnd, ov);
  sketchLine(g, x + w, y, x + w, y + h, rnd, ov);
  sketchLine(g, x + w, y + h, x, y + h, rnd, ov);
  sketchLine(g, x, y + h, x, y, rnd, ov);
}
function sketchArrow(g, x1, y1, x2, y2, rnd) {
  sketchLine(g, x1, y1, x2, y2, rnd);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const hl = Math.min(18, Math.max(10, Math.hypot(x2 - x1, y2 - y1) * 0.16));
  for (const da of [Math.PI * 0.86, -Math.PI * 0.86]) {
    sketchLine(g, x2, y2, x2 + Math.cos(ang + da) * hl, y2 + Math.sin(ang + da) * hl, rnd);
  }
}
function drawShape(g, s, color) {
  g.strokeStyle = color;
  const rnd = mulberry32(s.seed);
  if (s.type === 'rect') sketchRect(g, s.x, s.y, s.w, s.h, rnd);
  else if (s.type === 'arrow') sketchArrow(g, s.x, s.y, s.x + s.w, s.y + s.h, rnd);
  // 'text' — bez ramki (samą ramkę zaznaczenia rysuje render())
}

/* ── render edytora ── */
function resize() {
  const r = wrap.getBoundingClientRect();
  if (!r.width || !r.height) return; // shell strefy może być jeszcze ukryty (guard auth)
  const dpr = window.devicePixelRatio || 1;
  canvas.width = r.width * dpr;
  canvas.height = r.height * dpr;
  canvas.style.width = r.width + 'px';
  canvas.style.height = r.height + 'px';
  render();
}

function render() {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const W = canvas.width / dpr, H = canvas.height / dpr;

  // kropkowana siatka tła
  ctx.fillStyle = 'rgba(255,255,255,.07)';
  const step = 24 * camera.z;
  if (step > 8) {
    const ox = ((-camera.x * camera.z) % step + step) % step;
    const oy = ((-camera.y * camera.z) % step + step) % step;
    for (let gx = ox; gx < W; gx += step)
      for (let gy = oy; gy < H; gy += step) ctx.fillRect(gx, gy, 1.4, 1.4);
  }

  ctx.translate(-camera.x * camera.z, -camera.y * camera.z);
  ctx.scale(camera.z, camera.z);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.8;

  for (const s of shapes) {
    const sel = s.id === selectedId;
    drawShape(ctx, s, sel ? 'oklch(83% 0.15 90)' : 'rgba(235,235,240,.92)');
    if (s.type !== 'arrow' && s.text && s.id !== editingId) drawText(ctx, s);
    if (s.type === 'text' && sel) { // pole tekstowe: delikatna ramka tylko przy zaznaczeniu
      ctx.save();
      ctx.setLineDash([4 / camera.z, 4 / camera.z]);
      ctx.lineWidth = 1 / camera.z;
      ctx.strokeStyle = 'oklch(83% 0.15 90 / .6)';
      ctx.strokeRect(s.x, s.y, s.w, s.h);
      ctx.restore();
    }
    if (sel) drawHandles(s);
  }
  // podgląd rysowanego kształtu
  if (drag?.mode === 'draw') {
    ctx.strokeStyle = 'rgba(235,235,240,.5)';
    const rnd = mulberry32(drag.seed);
    const { x, y, w, h } = drag;
    if (drag.tool === 'rect') sketchRect(ctx, Math.min(x, x + w), Math.min(y, y + h), Math.abs(w), Math.abs(h), rnd);
    else if (drag.tool === 'arrow') sketchArrow(ctx, x, y, x + w, y + h, rnd);
    else {
      ctx.save();
      ctx.setLineDash([4 / camera.z, 4 / camera.z]);
      ctx.lineWidth = 1 / camera.z;
      ctx.strokeRect(Math.min(x, x + w), Math.min(y, y + h), Math.abs(w), Math.abs(h));
      ctx.restore();
    }
  }
}

function drawText(g, s) {
  g.fillStyle = 'rgba(235,235,240,.95)';
  g.font = `500 ${FONT}px Caveat, cursive`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lines = wrapText(g, s.text, Math.max(20, s.w - 16));
  const y0 = s.y + s.h / 2 - ((lines.length - 1) * LINE_H) / 2;
  lines.forEach((ln, i) => g.fillText(ln, s.x + s.w / 2, y0 + i * LINE_H));
}
function wrapText(g, text, maxW) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    let line = '';
    for (const word of raw.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (g.measureText(t).width > maxW && line) { out.push(line); line = word; }
      else line = t;
    }
    out.push(line);
  }
  return out;
}

function handlesFor(s) {
  if (s.type === 'arrow') return [{ k: 'a1', x: s.x, y: s.y }, { k: 'a2', x: s.x + s.w, y: s.y + s.h }];
  return [{ k: 'se', x: s.x + s.w, y: s.y + s.h }];
}
function drawHandles(s) {
  ctx.fillStyle = 'oklch(83% 0.15 90)';
  for (const h of handlesFor(s)) {
    ctx.beginPath();
    ctx.arc(h.x, h.y, 4.5 / camera.z, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ── geometria / hit-test ── */
const toWorld = (e) => {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / camera.z + camera.x, y: (e.clientY - r.top) / camera.z + camera.y };
};
function distSeg(p, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.y - y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (x1 + t * dx), p.y - (y1 + t * dy));
}
function hitShape(p) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (s.type === 'arrow') {
      if (distSeg(p, s.x, s.y, s.x + s.w, s.y + s.h) < 7 / camera.z) return s;
    } else if (p.x >= s.x - 4 && p.x <= s.x + s.w + 4 && p.y >= s.y - 4 && p.y <= s.y + s.h + 4) return s;
  }
  return null;
}
function hitHandle(p) {
  const s = shapes.find((x) => x.id === selectedId);
  if (!s) return null;
  for (const h of handlesFor(s)) if (Math.hypot(p.x - h.x, p.y - h.y) < 8 / camera.z) return { s, k: h.k };
  return null;
}

/* ── interakcje myszy ── */
canvas.addEventListener('pointerdown', (e) => {
  if (editingId) commitText();
  canvas.setPointerCapture(e.pointerId);
  const p = toWorld(e);
  if (tool === 'rect' || tool === 'arrow' || tool === 'text') {
    drag = { mode: 'draw', tool, x: p.x, y: p.y, w: 0, h: 0, seed: (Math.random() * 1e9) | 0 };
    return;
  }
  const h = hitHandle(p);
  if (h) { drag = { mode: 'handle', ...h, p }; return; }
  const s = hitShape(p);
  if (s) {
    selectedId = s.id;
    drag = { mode: 'move', s, p };
  } else {
    selectedId = null;
    drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, cx: camera.x, cy: camera.y };
  }
  render();
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = toWorld(e);
  if (drag.mode === 'draw') {
    drag.w = p.x - drag.x; drag.h = p.y - drag.y;
  } else if (drag.mode === 'move') {
    drag.s.x += p.x - drag.p.x; drag.s.y += p.y - drag.p.y;
    drag.p = p; dirty = true;
  } else if (drag.mode === 'handle') {
    const s = drag.s;
    if (drag.k === 'se') { s.w = Math.max(20, p.x - s.x); s.h = Math.max(20, p.y - s.y); }
    else if (drag.k === 'a1') { s.w += s.x - p.x; s.h += s.y - p.y; s.x = p.x; s.y = p.y; }
    else { s.w = p.x - s.x; s.h = p.y - s.y; }
    dirty = true;
  } else if (drag.mode === 'pan') {
    camera.x = drag.cx - (e.clientX - drag.sx) / camera.z;
    camera.y = drag.cy - (e.clientY - drag.sy) / camera.z;
  }
  render();
});

canvas.addEventListener('pointerup', () => {
  if (drag?.mode === 'draw') {
    const d = drag;
    if (Math.abs(d.w) > 8 || Math.abs(d.h) > 8) {
      const s = { id: uid(), type: d.tool, seed: d.seed };
      if (d.tool === 'arrow') { s.x = d.x; s.y = d.y; s.w = d.w; s.h = d.h; }
      else {
        s.x = Math.min(d.x, d.x + d.w); s.y = Math.min(d.y, d.y + d.h);
        s.w = Math.max(24, Math.abs(d.w)); s.h = Math.max(24, Math.abs(d.h));
        s.text = '';
      }
      shapes.push(s);
      selectedId = s.id;
      scheduleSave();
      if (d.tool === 'text') { setTool('select'); drag = null; startTextEdit(s); return; } // od razu wpisywanie
    }
    setTool('select');
  } else if (dirty) scheduleSave();
  drag = null;
  render();
});

canvas.addEventListener('dblclick', (e) => {
  const s = hitShape(toWorld(e));
  if (s && s.type !== 'arrow') startTextEdit(s);
});

// scroll = przesuwanie, Ctrl/⌘+scroll = zoom
wrap.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const p = toWorld(e);
    const z = Math.max(0.25, Math.min(3, camera.z * (e.deltaY < 0 ? 1.08 : 0.92)));
    camera.x = p.x - (p.x - camera.x) * (camera.z / z);
    camera.y = p.y - (p.y - camera.y) * (camera.z / z);
    camera.z = z;
  } else {
    camera.x += e.deltaX / camera.z;
    camera.y += e.deltaY / camera.z;
  }
  render();
}, { passive: false });

/* ── edycja tekstu w prostokącie ── */
function startTextEdit(s) {
  editingId = s.id;
  selectedId = s.id;
  const sx = (s.x - camera.x) * camera.z;
  const sy = (s.y - camera.y) * camera.z;
  Object.assign(textEl.style, {
    left: sx + 4 + 'px', top: sy + 4 + 'px',
    width: s.w * camera.z - 8 + 'px', height: s.h * camera.z - 8 + 'px',
    fontSize: FONT * camera.z + 'px', lineHeight: LINE_H * camera.z + 'px',
  });
  textEl.value = s.text || '';
  textEl.hidden = false;
  centerTextarea(s);
  textEl.focus();
  render();
}
// Pionowe centrowanie tekstu w textarea (jak na canvasie): padding-top wg liczby linii.
function centerTextarea(s) {
  ctx.font = `500 ${FONT}px Caveat, cursive`;
  const lines = wrapText(ctx, textEl.value, Math.max(20, s.w - 16)).length;
  const pad = Math.max(0, (s.h - 8 / camera.z - lines * LINE_H) * camera.z / 2);
  textEl.style.paddingTop = pad + 'px';
}
textEl.addEventListener('input', () => {
  const s = shapes.find((x) => x.id === editingId);
  if (s) centerTextarea(s);
});
function commitText() {
  const s = shapes.find((x) => x.id === editingId);
  if (s && s.text !== textEl.value) { s.text = textEl.value; scheduleSave(); }
  editingId = null;
  textEl.hidden = true;
  render();
}
textEl.addEventListener('blur', () => { if (editingId) commitText(); });
textEl.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); commitText(); }
  e.stopPropagation();
});

/* ── klawiatura ── */
let clipboard = null; // skopiowany kształt (⌘C/⌘V)
document.addEventListener('keydown', (e) => {
  if (!current || editingId || e.target.matches('input, textarea, select')) return;
  if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
    const s = shapes.find((x) => x.id === selectedId);
    if (s) { clipboard = { ...s }; e.preventDefault(); }
    return;
  }
  if ((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V')) {
    if (!clipboard) return;
    e.preventDefault();
    const s = { ...clipboard, id: uid(), x: clipboard.x + 16, y: clipboard.y + 16 };
    clipboard = { ...s }; // kolejne wklejenia kaskadowo
    shapes.push(s);
    selectedId = s.id;
    scheduleSave();
    render();
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
    shapes = shapes.filter((s) => s.id !== selectedId);
    selectedId = null;
    scheduleSave();
    render();
  } else if (e.key === 'v' || e.key === 'V') setTool('select');
  else if (e.key === 'r' || e.key === 'R') setTool('rect');
  else if (e.key === 'a' || e.key === 'A') setTool('arrow');
  else if (e.key === 't' || e.key === 'T') setTool('text');
});

function setTool(t) {
  tool = t;
  document.querySelectorAll('.diag-tool').forEach((b) => b.classList.toggle('is-active', b.dataset.tool === t));
  canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
}

/* ── zapis / Supabase ── */
function setStatus(txt) { const el = $('#save-status'); if (el) el.textContent = txt; }
function scheduleSave() {
  dirty = true;
  setStatus('Zapisywanie…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 800);
}
async function saveNow() {
  if (!current || !dirty) return;
  dirty = false;
  current.data = { shapes };
  const { error } = await sb.from('diagrams')
    .update({ data: current.data, updated_at: new Date().toISOString() })
    .eq('id', current.id);
  if (error) { toast('Błąd zapisu', error.message, 'err'); dirty = true; }
  else setStatus('Zapisano');
}
window.addEventListener('beforeunload', () => { if (dirty) saveNow(); });

/* ── galeria z miniaturami ── */
async function loadList() {
  const { data, error } = await sb.from('diagrams').select('id, title, updated_at, data').order('updated_at', { ascending: false });
  if (error) { toast('Błąd', error.message, 'err'); return; }
  diagrams = data || [];
}

// Miniatura: kształty diagramu wpasowane w mały canvas (ta sama „ołówkowa" kreska).
function drawThumb(cv, shs) {
  const g = cv.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = cv.width = cv.clientWidth * dpr, H = cv.height = cv.clientHeight * dpr;
  g.scale(dpr, dpr);
  const w = W / dpr, h = H / dpr;
  if (!shs.length) {
    g.fillStyle = 'rgba(255,255,255,.25)';
    g.font = '500 15px Caveat, cursive';
    g.textAlign = 'center';
    g.fillText('pusty diagram', w / 2, h / 2 + 5);
    return;
  }
  let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
  for (const s of shs) {
    x1 = Math.min(x1, s.x, s.x + s.w); x2 = Math.max(x2, s.x, s.x + s.w);
    y1 = Math.min(y1, s.y, s.y + s.h); y2 = Math.max(y2, s.y, s.y + s.h);
  }
  const pad = 14;
  const sc = Math.min((w - pad * 2) / Math.max(40, x2 - x1), (h - pad * 2) / Math.max(40, y2 - y1), 0.9);
  g.translate(w / 2 - ((x1 + x2) / 2) * sc, h / 2 - ((y1 + y2) / 2) * sc);
  g.scale(sc, sc);
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = 1.6 / sc;
  for (const s of shs) {
    drawShape(g, s, 'rgba(235,235,240,.85)');
    if (s.type !== 'arrow' && s.text) drawText(g, s);
  }
}

function renderGallery() {
  const grid = $('#diag-grid');
  grid.innerHTML = `
    <button class="diag-card diag-card--new" id="card-new" type="button">
      <span class="diag-card__thumb diag-card__thumb--new"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span>
      <span class="diag-card__title">Nowy diagram</span>
    </button>` +
    diagrams.map((d) => `
    <button class="diag-card" type="button" data-id="${d.id}">
      <span class="diag-card__thumb"><canvas></canvas></span>
      <span class="diag-card__title">${esc(d.title)}</span>
      <span class="diag-card__date">${fmtDateTime(d.updated_at)}</span>
    </button>`).join('');
  $('#card-new').addEventListener('click', () => createDiagram());
  for (const card of grid.querySelectorAll('.diag-card[data-id]')) {
    const d = diagrams.find((x) => x.id === card.dataset.id);
    card.addEventListener('click', () => openEditor(d.id));
    requestAnimationFrame(() => drawThumb(card.querySelector('canvas'), Array.isArray(d.data?.shapes) ? d.data.shapes : []));
  }
}

async function showGallery() {
  if (dirty) await saveNow();
  current = null;
  $('#diag-editor').hidden = true;
  $('#diag-gallery').hidden = false;
  await loadList();
  renderGallery();
}

/* ── otwieranie / tworzenie / edytor ── */
async function openEditor(id) {
  const { data, error } = await sb.from('diagrams').select('*').eq('id', id).single();
  if (error) { toast('Błąd', error.message, 'err'); return; }
  current = data;
  shapes = Array.isArray(data.data?.shapes) ? data.data.shapes : [];
  selectedId = null;
  camera = { x: 0, y: 0, z: 1 };
  setStatus('');
  $('#diag-title').textContent = data.title;
  $('#diag-gallery').hidden = true;
  $('#diag-editor').hidden = false;
  setTool('select');
  resize();
}

async function createDiagram(title = null) {
  if (title === null) {
    title = await promptTitle('Nowy diagram', 'Nowy diagram');
    if (title === null) return;
  }
  const { data, error } = await sb.from('diagrams').insert({ title: title || 'Nowy diagram' }).select().single();
  if (error) { toast('Błąd', error.message, 'err'); return; }
  openEditor(data.id);
}

function promptTitle(heading, initial) {
  return new Promise((resolve) => {
    const box = openModal(`
      <div class="strefa-modal__body">
        <h3 style="margin:0 0 var(--space-md)">${esc(heading)}</h3>
        <input class="strefa-input" id="dg-title" type="text" value="${esc(initial)}" />
        <div class="strefa-actions-row" style="margin-top:var(--space-lg)">
          <button class="strefa-btn strefa-btn--ghost" data-no>Anuluj</button>
          <button class="strefa-btn strefa-btn--accent" data-yes>Zapisz</button>
        </div>
      </div>`);
    const input = box.querySelector('#dg-title');
    input.focus(); input.select();
    const ok = () => { const v = input.value.trim(); closeModal(); resolve(v); };
    box.querySelector('[data-yes]').addEventListener('click', ok);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    box.querySelector('[data-no]').addEventListener('click', () => { closeModal(); resolve(null); });
  });
}

/* ── toolbar edytora ── */
$('#btn-back').addEventListener('click', showGallery);
$('#btn-rename').addEventListener('click', async () => {
  if (!current) return;
  const title = await promptTitle('Zmień nazwę', current.title);
  if (title === null || !title || title === current.title) return;
  const { error } = await sb.from('diagrams').update({ title }).eq('id', current.id);
  if (error) { toast('Błąd', error.message, 'err'); return; }
  current.title = title;
  $('#diag-title').textContent = title;
});
$('#btn-delete').addEventListener('click', async () => {
  if (!current) return;
  if (!(await confirmDialog(`Usunąć diagram „${current.title}"?`))) return;
  const { error } = await sb.from('diagrams').delete().eq('id', current.id);
  if (error) { toast('Błąd', error.message, 'err'); return; }
  dirty = false;
  showGallery();
});
document.querySelectorAll('.diag-tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));

/* ── start ── */
(async () => {
  if (!(await getTeamUser())) return; // layout przekieruje
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(wrap); // łapie też moment odsłonięcia shell'a przez guard auth
  await loadList();
  if (!diagrams.length) createDiagram('Nowy diagram'); // brak diagramów → od razu do edytora
  else renderGallery();
})();
