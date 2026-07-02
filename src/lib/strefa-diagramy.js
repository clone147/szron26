// Strefa / Diagramy — prosty edytor diagramów w stylu Excalidraw (rysowanie „ołówkiem").
// Prostokąty z tekstem + strzałki na <canvas>; wiele diagramów w strefa.diagrams (jsonb).
// Kształt: { id, type: 'rect'|'arrow', x, y, w, h, text?, seed }
// (strzałka: x,y = początek, w,h = wektor do końca; rect trzymany znormalizowany w>0,h>0).
import { getClient, getTeamUser } from './supabase.js';
import { $, toast, confirmDialog, openModal, closeModal } from './strefa-ui.js';

const sb = getClient();

/* ── stan ── */
let diagrams = [];          // [{id,title,updated_at}]
let current = null;         // {id,title,data:{shapes:[]}}
let shapes = [];
let tool = 'select';
let selectedId = null;
let camera = { x: 0, y: 0, z: 1 };
let drag = null;            // operacja myszy w toku
let editingId = null;       // rect z otwartym edytorem tekstu
let saveTimer = null;
let dirty = false;

const canvas = $('#diag-canvas');
const ctx = canvas.getContext('2d');
const wrap = $('#canvas-wrap');
const textEl = $('#diag-text');

const uid = () => Math.random().toString(36).slice(2, 10);

/* ── „ołówkowe" rysowanie: seedowany PRNG + jitter, dwa przebiegi ── */
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Odcinek jako lekko wygięta krzywa z szumem — rnd steruje powtarzalnym „drżeniem".
function sketchLine(x1, y1, x2, y2, rnd) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const off = Math.min(3, Math.max(1.2, len / 90));
  const j = () => (rnd() - 0.5) * 2 * off;
  for (let pass = 0; pass < 2; pass++) {
    const mx = (x1 + x2) / 2 + j() * 1.6;
    const my = (y1 + y2) / 2 + j() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x1 + j(), y1 + j());
    ctx.quadraticCurveTo(mx, my, x2 + j(), y2 + j());
    ctx.stroke();
  }
}
function sketchRect(x, y, w, h, rnd) {
  sketchLine(x, y, x + w, y, rnd);
  sketchLine(x + w, y, x + w, y + h, rnd);
  sketchLine(x + w, y + h, x, y + h, rnd);
  sketchLine(x, y + h, x, y, rnd);
}
function sketchArrow(x1, y1, x2, y2, rnd) {
  sketchLine(x1, y1, x2, y2, rnd);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const hl = Math.min(16, Math.max(9, Math.hypot(x2 - x1, y2 - y1) * 0.18));
  for (const da of [Math.PI * 0.85, -Math.PI * 0.85]) {
    sketchLine(x2, y2, x2 + Math.cos(ang + da) * hl, y2 + Math.sin(ang + da) * hl, rnd);
  }
}

/* ── render ── */
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

  for (const s of shapes) {
    const sel = s.id === selectedId;
    ctx.strokeStyle = sel ? 'oklch(83% 0.15 90)' : 'rgba(235,235,240,.92)';
    ctx.lineWidth = 1.6;
    const rnd = mulberry32(s.seed);
    if (s.type === 'rect') {
      sketchRect(s.x, s.y, s.w, s.h, rnd);
      if (s.text && s.id !== editingId) drawText(s);
    } else {
      sketchArrow(s.x, s.y, s.x + s.w, s.y + s.h, rnd);
    }
    if (sel) drawHandles(s);
  }
  // podgląd rysowanego kształtu
  if (drag?.mode === 'draw') {
    ctx.strokeStyle = 'rgba(235,235,240,.5)';
    const rnd = mulberry32(drag.seed);
    const { x, y, w, h } = drag;
    if (drag.tool === 'rect') sketchRect(Math.min(x, x + w), Math.min(y, y + h), Math.abs(w), Math.abs(h), rnd);
    else sketchArrow(x, y, x + w, y + h, rnd);
  }
}

function drawText(s) {
  ctx.fillStyle = 'rgba(235,235,240,.95)';
  ctx.font = '500 17px Caveat, cursive';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrapText(s.text, Math.max(20, s.w - 16));
  const lh = 20;
  const y0 = s.y + s.h / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((ln, i) => ctx.fillText(ln, s.x + s.w / 2, y0 + i * lh));
}
function wrapText(text, maxW) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    let line = '';
    for (const word of raw.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; }
      else line = t;
    }
    out.push(line);
  }
  return out;
}

function handlesFor(s) {
  if (s.type === 'rect') return [{ k: 'se', x: s.x + s.w, y: s.y + s.h }];
  return [{ k: 'a1', x: s.x, y: s.y }, { k: 'a2', x: s.x + s.w, y: s.y + s.h }];
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
    if (s.type === 'rect') {
      if (p.x >= s.x - 4 && p.x <= s.x + s.w + 4 && p.y >= s.y - 4 && p.y <= s.y + s.h + 4) return s;
    } else if (distSeg(p, s.x, s.y, s.x + s.w, s.y + s.h) < 7 / camera.z) return s;
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
  if (tool === 'rect' || tool === 'arrow') {
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
      if (d.tool === 'rect') {
        s.x = Math.min(d.x, d.x + d.w); s.y = Math.min(d.y, d.y + d.h);
        s.w = Math.max(24, Math.abs(d.w)); s.h = Math.max(24, Math.abs(d.h));
        s.text = '';
      } else { s.x = d.x; s.y = d.y; s.w = d.w; s.h = d.h; }
      shapes.push(s);
      selectedId = s.id;
      scheduleSave();
    }
    setTool('select');
  } else if (dirty) scheduleSave();
  drag = null;
  render();
});

canvas.addEventListener('dblclick', (e) => {
  const s = hitShape(toWorld(e));
  if (s?.type === 'rect') startTextEdit(s);
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
    fontSize: 17 * camera.z + 'px',
  });
  textEl.value = s.text || '';
  textEl.hidden = false;
  textEl.focus();
  render();
}
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
document.addEventListener('keydown', (e) => {
  if (editingId || e.target.matches('input, textarea, select')) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
    shapes = shapes.filter((s) => s.id !== selectedId);
    selectedId = null;
    scheduleSave();
    render();
  } else if (e.key === 'v' || e.key === 'V') setTool('select');
  else if (e.key === 'r' || e.key === 'R') setTool('rect');
  else if (e.key === 'a' || e.key === 'A') setTool('arrow');
});

function setTool(t) {
  tool = t;
  document.querySelectorAll('.diag-tool').forEach((b) => b.classList.toggle('is-active', b.dataset.tool === t));
  canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
}

/* ── zapis / Supabase ── */
function setStatus(txt) { $('#save-status').textContent = txt; }
function scheduleSave() {
  dirty = true;
  setStatus('Zapisywanie…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 800);
}
async function saveNow() {
  if (!current || !dirty) return;
  dirty = false;
  const { error } = await sb.from('diagrams')
    .update({ data: { shapes }, updated_at: new Date().toISOString() })
    .eq('id', current.id);
  if (error) { toast('Błąd zapisu', error.message, 'err'); dirty = true; }
  else setStatus('Zapisano');
}
window.addEventListener('beforeunload', () => { if (dirty) saveNow(); });

async function loadList(selectId = null) {
  const { data, error } = await sb.from('diagrams').select('id, title, updated_at').order('updated_at', { ascending: false });
  if (error) { toast('Błąd', error.message, 'err'); return; }
  diagrams = data || [];
  const sel = $('#diag-select');
  sel.innerHTML = diagrams.map((d) => `<option value="${d.id}">${d.title.replace(/</g, '&lt;')}</option>`).join('') || '<option value="">— brak —</option>';
  const id = selectId || current?.id || diagrams[0]?.id;
  if (id && diagrams.some((d) => d.id === id)) { sel.value = id; if (current?.id !== id) await openDiagram(id); }
  else if (!diagrams.length) { current = null; shapes = []; render(); }
}

async function openDiagram(id) {
  if (dirty) await saveNow();
  const { data, error } = await sb.from('diagrams').select('*').eq('id', id).single();
  if (error) { toast('Błąd', error.message, 'err'); return; }
  current = data;
  shapes = Array.isArray(data.data?.shapes) ? data.data.shapes : [];
  selectedId = null;
  camera = { x: 0, y: 0, z: 1 };
  setStatus('');
  render();
}

async function createDiagram() {
  const title = await promptTitle('Nowy diagram', 'Nowy diagram');
  if (title === null) return;
  const { data, error } = await sb.from('diagrams').insert({ title: title || 'Nowy diagram' }).select().single();
  if (error) { toast('Błąd', error.message, 'err'); return; }
  current = data;
  shapes = [];
  await loadList(data.id);
  render();
}

function promptTitle(heading, initial) {
  return new Promise((resolve) => {
    const box = openModal(`
      <div class="strefa-modal__body">
        <h3 style="margin:0 0 var(--space-md)">${heading}</h3>
        <input class="strefa-input" id="dg-title" type="text" value="${String(initial).replace(/"/g, '&quot;')}" />
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

/* ── toolbar ── */
$('#diag-select').addEventListener('change', (e) => openDiagram(e.target.value));
$('#btn-new').addEventListener('click', createDiagram);
$('#btn-rename').addEventListener('click', async () => {
  if (!current) return;
  const title = await promptTitle('Zmień nazwę', current.title);
  if (title === null || !title || title === current.title) return;
  const { error } = await sb.from('diagrams').update({ title }).eq('id', current.id);
  if (error) { toast('Błąd', error.message, 'err'); return; }
  current.title = title;
  loadList(current.id);
});
$('#btn-delete').addEventListener('click', async () => {
  if (!current) return;
  if (!(await confirmDialog(`Usunąć diagram „${current.title}"?`))) return;
  const { error } = await sb.from('diagrams').delete().eq('id', current.id);
  if (error) { toast('Błąd', error.message, 'err'); return; }
  current = null;
  shapes = [];
  await loadList();
});
document.querySelectorAll('.diag-tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));

/* ── start ── */
(async () => {
  if (!(await getTeamUser())) return; // layout przekieruje
  setTool('select');
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(wrap); // łapie też moment odsłonięcia shell'a przez guard auth
  resize();
  await loadList();
  if (!diagrams.length) {
    const { data } = await sb.from('diagrams').insert({ title: 'Mój pierwszy diagram' }).select().single();
    if (data) await loadList(data.id);
  }
})();
