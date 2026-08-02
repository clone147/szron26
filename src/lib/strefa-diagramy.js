// Strefa / Diagramy — prosty edytor diagramów w stylu Excalidraw (rysowanie „ołówkiem").
// Galeria diagramów z miniaturami (renderowane z jsonb) → klik otwiera edytor pełnoekranowy.
// Kształt: { id, type: 'rect'|'arrow'|'text'|'icon'|'image', x, y, w, h, text?, icon?, src?, seed, startBind?, endBind? }
// ('icon' = biblioteka doodle barwiona kolorem kreski, 'image' = obrazek z wyszukiwarki rysowany 1:1)
// (strzałka: x,y = początek, w,h = wektor do końca; rect trzymany znormalizowany w>0,h>0;
//  startBind/endBind = id obiektu, do którego przyklejona jest końcówka strzałki).
import { getClient, getTeamUser } from './supabase.js';
import { $, esc, fmtDateTime, toast, confirmDialog, openModal, closeModal } from './strefa-ui.js';
import { searchProvider, providerKeys, materialize, PROVIDER_LIST } from './diagram-image-search.js';

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
let locked = false;         // kłódka: diagram tylko do odczytu (stan trzymany w data.locked)
let play = null;            // tryb Play: { steps: [[id,...],...], idx, shown: Map(id→timestamp) }

const FONT = 36, LINE_H = 43; // tekst w prostokątach (Caveat)

const canvas = $('#diag-canvas');
const ctx = canvas.getContext('2d');
const wrap = $('#canvas-wrap');
const textEl = $('#diag-text');

const uid = () => Math.random().toString(36).slice(2, 10);

/* ── paleta kresek zależna od motywu strefy (body[data-theme]) ── */
const PAL_DARK = {
  grid: 'rgba(255,255,255,.07)', ink: 'rgba(235,235,240,.92)', inkSoft: 'rgba(235,235,240,.5)',
  inkThumb: 'rgba(235,235,240,.85)', text: 'rgba(235,235,240,.95)', muted: 'rgba(255,255,255,.25)',
  sel: 'oklch(83% 0.15 90)', selSoft: 'oklch(83% 0.15 90 / .6)',
};
const PAL_LIGHT = {
  grid: 'rgba(0,0,0,.09)', ink: 'rgba(32,36,46,.92)', inkSoft: 'rgba(32,36,46,.5)',
  inkThumb: 'rgba(32,36,46,.85)', text: 'rgba(32,36,46,.95)', muted: 'rgba(0,0,0,.3)',
  sel: 'oklch(55% 0.14 90)', selSoft: 'oklch(55% 0.14 90 / .6)',
};
const pal = () => (document.body.dataset.theme === 'light' ? PAL_LIGHT : PAL_DARK);

// przełączenie motywu → przerysowanie edytora i miniatur galerii
new MutationObserver(() => {
  if (!$('#diag-editor').hidden) render();
  if (!$('#diag-gallery').hidden) renderGallery();
}).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });

/* ── biblioteka ikon doodle (rysunkowe PNG/WebP, czarny tusz na przezroczystym tle) ── */
const ICONS = [
  { k: 'editor', label: 'Edytor kodu' },
  { k: 'terminal', label: 'Terminal' },
  { k: 'browser', label: 'Przeglądarka' },
  { k: 'laptop', label: 'Laptop' },
  { k: 'server', label: 'Serwer' },
  { k: 'database', label: 'Baza danych' },
  { k: 'cloud', label: 'Chmura' },
  { k: 'chip', label: 'Mikrokontroler' },
  { k: 'robot', label: 'Robot AI' },
  { k: 'clipboard', label: 'Checklista' },
  { k: 'lock', label: 'Kłódka' },
  { k: 'lightbulb', label: 'Pomysł' },
  // partia 2 (2026-07-22): wektorowe SVG (vtracer z rastrów /imagegen)
  { k: 'gear', label: 'Proces', ext: 'svg' },
  { k: 'document', label: 'Dokument', ext: 'svg' },
  { k: 'folder', label: 'Folder', ext: 'svg' },
  { k: 'envelope', label: 'E-mail', ext: 'svg' },
  { k: 'user', label: 'Osoba', ext: 'svg' },
  { k: 'users', label: 'Zespół', ext: 'svg' },
  { k: 'branch', label: 'Gałąź gita', ext: 'svg' },
  { k: 'bug', label: 'Bug', ext: 'svg' },
  { k: 'rocket', label: 'Rakieta', ext: 'svg' },
  { k: 'magnifier', label: 'Audyt', ext: 'svg' },
  { k: 'chart', label: 'Wykres', ext: 'svg' },
  { k: 'clock', label: 'Czas', ext: 'svg' },
  { k: 'webcam', label: 'Webcam', ext: 'svg' },
  { k: 'camera-tripod', label: 'Kamera', ext: 'svg' },
];
const ICON_SRC = (k) => `/img/doodle/${k}.${ICONS.find((i) => i.k === k)?.ext || 'webp'}`;
const bmpStore = new Map(); // src → { img, ready, tints: Map(kolor → canvas) }
function bmpEntry(src) {
  let e = bmpStore.get(src);
  if (!e) {
    const img = new Image();
    e = { img, ready: false, failed: false, tints: new Map() };
    img.onload = () => {
      e.ready = true;
      if (!$('#diag-editor').hidden) render();
      if (!$('#diag-gallery').hidden) renderGallery();
    };
    img.onerror = () => { e.failed = true; };
    img.src = src;
    bmpStore.set(src, e);
  }
  return e;
}
// adres bitmapy kształtu: ikona z biblioteki albo obrazek z wyszukiwarki
const shapeSrc = (s) => (s.type === 'icon' ? ICON_SRC(s.icon) : s.src);
// proporcje obrazka (do skalowania) — z wczytanej bitmapy, a przed wczytaniem z bieżącej ramki
const aspectOf = (s) => {
  const e = bmpEntry(s.src);
  if (e.ready && e.img.naturalHeight) return e.img.naturalWidth / e.img.naturalHeight;
  return s.h > 0 ? s.w / s.h : 1;
};
// przebarwienie czarnego tuszu na kolor kreski motywu (alpha rysunku zachowana)
function tintedBmp(src, color) {
  const e = bmpEntry(src);
  if (!e.ready) return null;
  let cv = e.tints.get(color);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = e.img.naturalWidth;
    cv.height = e.img.naturalHeight;
    const g = cv.getContext('2d');
    g.drawImage(e.img, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, cv.width, cv.height);
    e.tints.set(color, cv);
  }
  return cv;
}
// rysuje bitmapę kształtu (ikona = barwiona kolorem kreski, obrazek = w oryginalnych barwach);
// frac<1 = odsłanianie od lewej (tryb Play „rysowanie"); zwraca punkt „ołówka"
function drawIcon(g, s, color, frac = 1) {
  const src = shapeSrc(s);
  const e = bmpEntry(src);
  // ikony biblioteki i grafiki jednokolorowe (flaga tint) barwimy kolorem kreski, resztę rysujemy 1:1
  const cv = s.type === 'icon' || s.tint ? tintedBmp(src, color) : (e.ready ? e.img : null);
  if (!cv) { // obrazek jeszcze się ładuje — delikatna ramka zamiast pustki (w prezentacji: nic)
    if (play) return null;
    g.save();
    g.setLineDash([4, 4]);
    g.lineWidth = 1;
    g.strokeStyle = pal().muted;
    g.strokeRect(s.x, s.y, s.w, s.h);
    g.restore();
    return null;
  }
  if (frac >= 1) { g.drawImage(cv, s.x, s.y, s.w, s.h); return null; }
  const f = Math.max(0, Math.min(1, frac));
  g.save();
  g.beginPath();
  g.rect(s.x, s.y, s.w * f, s.h);
  g.clip();
  g.drawImage(cv, s.x, s.y, s.w, s.h);
  g.restore();
  return { x: s.x + s.w * f, y: s.y + s.h / 2 };
}

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
// Geometria jednej kreski ołówka: łamana + współczynnik „docisku pióra" (lwf).
// Kolejność wywołań rnd() jest ZAWSZE identyczna, więc każdy przebieg daje tę samą kreskę.
function sketchPts(x1, y1, x2, y2, rnd, overshoot = 0) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len;   // wzdłuż
  const nx = -uy, ny = ux;                            // w poprzek
  if (overshoot) {
    // czasem przestrzał, czasem lekko niedociągnięta kreska — jak przy szybkim rysowaniu
    const o1 = (rnd() - 0.3) * overshoot, o2 = (rnd() - 0.3) * overshoot;
    x1 -= ux * o1; y1 -= uy * o1; x2 += ux * o2; y2 += uy * o2;
  }
  const segs = Math.max(4, Math.min(26, Math.round(len / 18)));
  // każda kreska ma własny „charakter": inną nerwowość, wygięcie i powolną falę ręki
  const amp = Math.min(2.2, 0.5 + len / 400) * (0.55 + rnd() * 1.1);
  const bow = (rnd() - 0.5) * Math.min(9, len / 16);
  const waveF = 1 + rnd() * 2.5;                      // częstotliwość fali nadgarstka
  const waveP = rnd() * Math.PI * 2;                  // losowa faza
  const waveA = amp * (0.3 + rnd() * 0.9);            // i jej amplituda
  let off = (rnd() - 0.5) * amp;
  const pts = [[x1 + nx * off, y1 + ny * off]];
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    off += (rnd() - 0.5) * amp;
    off = Math.max(-2.8, Math.min(2.8, off));
    const env = Math.sin(Math.PI * t);                // fala i łuk zanikają na końcach kreski
    const o = off + env * (bow + Math.sin(Math.PI * t * waveF + waveP) * waveA);
    pts.push([x1 + (x2 - x1) * t + nx * o, y1 + (y2 - y1) * t + ny * o]);
  }
  return { pts, lwf: 0.85 + rnd() * 0.35 };           // minimalnie inny docisk pióra per kreska
}
// frac ∈ (0..1] rysuje tylko część kreski (od początku, po długości łamanej).
// Zwraca punkt „ołówka" (koniec narysowanego fragmentu) przy frac<1, inaczej null.
function sketchLine(g, x1, y1, x2, y2, rnd, overshoot = 0, frac = 1) {
  const { pts, lwf } = sketchPts(x1, y1, x2, y2, rnd, overshoot);
  const lw = g.lineWidth;
  g.lineWidth = lw * lwf;
  let tip = null;
  if (frac > 0) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    if (frac >= 1) for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    else {
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      let left = total * frac;
      for (let i = 1; i < pts.length && left > 0; i++) {
        const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (d <= left) { g.lineTo(pts[i][0], pts[i][1]); tip = pts[i]; }
        else {
          const t = left / d;
          tip = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
          g.lineTo(tip[0], tip[1]);
        }
        left -= d;
      }
    }
    g.stroke();
  }
  g.lineWidth = lw;
  return frac < 1 && tip ? { x: tip[0], y: tip[1] } : null;
}
// rysuje listę kresek [x1,y1,x2,y2,overshoot] po kolei, globalny frac rozłożony po długościach;
// kreski poza progiem NIE są rysowane, ale rnd konsumowany jest zawsze (spójność kształtu)
function partialStrokes(g, strokes, rnd, frac) {
  const lens = strokes.map((k) => Math.hypot(k[2] - k[0], k[3] - k[1]) || 1);
  const total = lens.reduce((a, b) => a + b, 0);
  const target = total * Math.max(0, Math.min(1, frac));
  let acc = 0, tip = null;
  for (let i = 0; i < strokes.length; i++) {
    const f = Math.max(0, Math.min(1, (target - acc) / lens[i]));
    const t = sketchLine(g, strokes[i][0], strokes[i][1], strokes[i][2], strokes[i][3], rnd, strokes[i][4] || 0, f);
    if (t) tip = t;
    acc += lens[i];
  }
  return frac < 1 ? tip : null;
}
// definicje kresek kształtu: [x1, y1, x2, y2, overshoot] w kolejności rysowania
function shapeStrokes(s) {
  if (s.type === 'rect') {
    const { x, y, w, h } = s;
    const ov = Math.min(5, Math.max(2, (w + h) / 90)); // rogi lekko „przerysowane"
    return [
      [x, y, x + w, y, ov],
      [x + w, y, x + w, y + h, ov],
      [x + w, y + h, x, y + h, ov],
      [x, y + h, x, y, ov],
    ];
  }
  if (s.type === 'arrow') {
    const x1 = s.x, y1 = s.y, x2 = s.x + s.w, y2 = s.y + s.h;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const hl = Math.min(18, Math.max(10, Math.hypot(x2 - x1, y2 - y1) * 0.16));
    return [
      [x1, y1, x2, y2, 0],
      [x2, y2, x2 + Math.cos(ang + Math.PI * 0.86) * hl, y2 + Math.sin(ang + Math.PI * 0.86) * hl, 0],
      [x2, y2, x2 + Math.cos(ang - Math.PI * 0.86) * hl, y2 + Math.sin(ang - Math.PI * 0.86) * hl, 0],
    ];
  }
  return []; // 'text' — bez ramki (samą ramkę zaznaczenia rysuje render())
}
// cache geometrii per kształt: gotowe Path2D (+ zawinięte linie tekstu) zamiast przeliczania
// PRNG i setek lineTo co klatkę — kluczowe dla płynności pan/zoom/animacji kamery
const shapeCache = new Map(); // id → { key, strokes: [{path, lwf}], tkey?, lines? }
function cacheEntry(s) {
  const key = `${s.type}|${s.seed}|${s.x}|${s.y}|${s.w}|${s.h}`;
  let c = shapeCache.get(s.id);
  if (!c || c.key !== key) {
    const rnd = mulberry32(s.seed);
    const strokes = shapeStrokes(s).map((d) => {
      const { pts, lwf } = sketchPts(d[0], d[1], d[2], d[3], rnd, d[4]);
      const path = new Path2D();
      path.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
      return { path, lwf };
    });
    c = { key, strokes };
    shapeCache.set(s.id, c);
  }
  return c;
}
function drawShape(g, s, color, frac = 1) {
  g.strokeStyle = color;
  if (frac >= 1) { // pełny kształt — z cache
    const lw = g.lineWidth;
    for (const st of cacheEntry(s).strokes) { g.lineWidth = lw * st.lwf; g.stroke(st.path); }
    g.lineWidth = lw;
    return null;
  }
  return partialStrokes(g, shapeStrokes(s), mulberry32(s.seed), frac);
}
// jeden punkt wejścia rysowania kształtu: ikona/obrazek → bitmapa, reszta → kreski ołówka
function paintShape(g, s, color, frac = 1) {
  return s.type === 'icon' || s.type === 'image' ? drawIcon(g, s, color, frac) : drawShape(g, s, color, frac);
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
  updateBoundArrows();
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const W = canvas.width / dpr, H = canvas.height / dpr;

  // kropkowana siatka tła
  ctx.fillStyle = pal().grid;
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
    // tryb Play: kształty animowane wg przypisanego efektu (rysowanie/pop/wjazd/licznik + puls)
    if (play) {
      if (play.pres) { // Prezentacja: focus pełny, reszta przygaszona, nieodsłonięte jako duchy
        const rec = play.shown.get(s.id);
        const now = performance.now();
        const a = presAlpha(s);
        if (a > 0.004) {
          ctx.globalAlpha = a;
          if (rec && now >= rec.t0 && now < rec.t0 + rec.dur + (rec.pulse ? PULSE_DUR : 0) + 40) drawShapeAnimated(s, rec);
          else {
            paintShape(ctx, s, pal().ink);
            if (s.type !== 'arrow' && s.text) drawText(ctx, s);
          }
          ctx.globalAlpha = 1;
        }
        continue;
      }
      const rec = play.shown.get(s.id);
      if (rec) drawShapeAnimated(s, rec);
      continue;
    }
    // podgląd efektu w edycji — po wybraniu animacji w panelu
    if (fxPreview?.id === s.id) { drawShapeAnimated(s, fxPreview.rec); continue; }
    const sel = s.id === selectedId;
    paintShape(ctx, s, sel ? pal().sel : pal().ink);
    if (s.type !== 'arrow' && s.text && s.id !== editingId) drawText(ctx, s);
    if (s.type === 'text' && sel) { // pole tekstowe: delikatna ramka tylko przy zaznaczeniu
      ctx.save();
      ctx.setLineDash([4 / camera.z, 4 / camera.z]);
      ctx.lineWidth = 1 / camera.z;
      ctx.strokeStyle = pal().selSoft;
      ctx.strokeRect(s.x, s.y, s.w, s.h);
      ctx.restore();
    }
    if (sel) drawHandles(s);
  }
  // Prezentacja, widok całej mapy: ramka wokół bieżącego kadru (jak slajd w graph-slides)
  if (play?.pres && play.over && play.idx >= 0 && !play.steps[play.idx].finale) {
    const fr = presFrameRect(play.steps[play.idx]);
    const p = 26;
    ctx.save();
    ctx.strokeStyle = pal().sel;
    ctx.lineWidth = 1.6 / camera.z;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(fr.x1 - p, fr.y1 - p, fr.x2 - fr.x1 + p * 2, fr.y2 - fr.y1 + p * 2, 16);
    else ctx.rect(fr.x1 - p, fr.y1 - p, fr.x2 - fr.x1 + p * 2, fr.y2 - fr.y1 + p * 2);
    ctx.stroke();
    ctx.restore();
  }
  // podświetlenie obiektu, do którego przyklei się końcówka strzałki
  const bindPt = drag?.mode === 'draw' && drag.tool === 'arrow' ? { x: drag.x + drag.w, y: drag.y + drag.h }
    : drag?.mode === 'handle' && drag.s.type === 'arrow' ? drag.p : null;
  const bt = bindPt && bindTargetAt(bindPt);
  if (bt) {
    ctx.save();
    ctx.setLineDash([5 / camera.z, 4 / camera.z]);
    ctx.lineWidth = 1.2 / camera.z;
    ctx.strokeStyle = pal().selSoft;
    ctx.strokeRect(bt.x - 6, bt.y - 6, bt.w + 12, bt.h + 12);
    ctx.restore();
  }
  // podgląd rysowanego kształtu
  if (drag?.mode === 'draw') {
    ctx.strokeStyle = pal().inkSoft;
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
  updateFxPanel();
}

// frac<1 — „pisanie ręczne": odsłania znaki po kolei; zwraca pozycję pióra przy frac<1
function drawText(g, s, frac = 1) {
  g.fillStyle = pal().text;
  g.font = `500 ${FONT}px Caveat, cursive`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const c = cacheEntry(s); // zawijanie (measureText per słowo) tylko gdy tekst/szerokość się zmienią
  const tkey = `${s.text}|${s.w}`;
  if (c.tkey !== tkey) { c.tkey = tkey; c.lines = wrapText(g, s.text, Math.max(20, s.w - 16)); }
  const lines = c.lines;
  const y0 = s.y + s.h / 2 - ((lines.length - 1) * LINE_H) / 2;
  const cx = s.x + s.w / 2;
  if (frac >= 1) {
    lines.forEach((ln, i) => g.fillText(ln, cx, y0 + i * LINE_H));
    return null;
  }
  const total = lines.reduce((a, l) => a + l.length, 0) || 1;
  let left = Math.ceil(total * Math.max(0, frac));
  let pen = null;
  for (let i = 0; i < lines.length && left > 0; i++) {
    const ln = lines[i], y = y0 + i * LINE_H;
    const lx = cx - g.measureText(ln).width / 2; // lewa krawędź docelowej (pełnej) linii
    const part = ln.slice(0, left);
    g.textAlign = 'left';
    g.fillText(part, lx, y);
    pen = { x: lx + g.measureText(part).width, y };
    left -= ln.length;
  }
  g.textAlign = 'center';
  return pen;
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
  ctx.fillStyle = pal().sel;
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
/* ── przyklejanie strzałek ── */
const BIND_PAD = 12; // margines łapania obiektu wokół jego ramki
const BIND_GAP = 5;  // odstęp grotu od ramki
const byId = (id) => shapes.find((s) => s.id === id);
// obiekt (nie-strzałka) pod punktem, do którego można przykleić końcówkę
function bindTargetAt(p) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (s.type !== 'arrow' && p.x >= s.x - BIND_PAD && p.x <= s.x + s.w + BIND_PAD &&
        p.y >= s.y - BIND_PAD && p.y <= s.y + s.h + BIND_PAD) return s;
  }
  return null;
}
// punkt na ramce obiektu s (z odstępem) na linii środek→toward
function borderPoint(s, toward) {
  const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
  const dx = toward.x - cx, dy = toward.y - cy;
  if (!dx && !dy) return { x: cx, y: s.y - BIND_GAP };
  const k = 1 / Math.max(Math.abs(dx) / (s.w / 2 + BIND_GAP), Math.abs(dy) / (s.h / 2 + BIND_GAP));
  return { x: cx + dx * k, y: cy + dy * k };
}
// przelicza końcówki przyklejonych strzałek (obiekty mogły się przesunąć/rozciągnąć)
function updateBoundArrows() {
  for (const a of shapes) {
    if (a.type !== 'arrow' || (!a.startBind && !a.endBind)) continue;
    const s1 = a.startBind && byId(a.startBind);
    const s2 = a.endBind && byId(a.endBind);
    if (a.startBind && !s1) delete a.startBind;
    if (a.endBind && !s2) delete a.endBind;
    let p1 = { x: a.x, y: a.y }, p2 = { x: a.x + a.w, y: a.y + a.h };
    const c = (s) => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 });
    if (s1) p1 = borderPoint(s1, s2 && s2 !== s1 ? c(s2) : p2);
    if (s2) p2 = borderPoint(s2, s1 && s1 !== s2 ? c(s1) : p1);
    a.x = p1.x; a.y = p1.y; a.w = p2.x - p1.x; a.h = p2.y - p1.y;
  }
}
// próba przyklejenia jednej końcówki strzałki po puszczeniu myszy
function tryBind(a, which, p) {
  const t = bindTargetAt(p);
  if (t) a[which] = t.id; else delete a[which];
  if (a.startBind && a.startBind === a.endBind) delete a[which]; // obie końcówki w tym samym obiekcie — bez sensu
  updateBoundArrows();
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
  if (!iconPanel.hidden) toggleIconPanel(false);
  if (!imgPanel.hidden) toggleImgPanel(false);
  stopCamAnim(); // ręczna interakcja przerywa przelot kamery
  canvas.setPointerCapture(e.pointerId);
  const p = toWorld(e);
  if (play) { // tryb Play: klik = następny krok, przeciągnięcie = pan
    drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, cx: camera.x, cy: camera.y, playStep: true };
    return;
  }
  if (locked) { // zablokowany diagram: tylko przesuwanie widoku
    drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, cx: camera.x, cy: camera.y };
    return;
  }
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
    // przeciągnięcie całej strzałki odkleja ją od obiektów
    if (drag.s.type === 'arrow') { delete drag.s.startBind; delete drag.s.endBind; }
    drag.s.x += p.x - drag.p.x; drag.s.y += p.y - drag.p.y;
    drag.p = p; dirty = true;
  } else if (drag.mode === 'handle') {
    const s = drag.s;
    // na czas przeciągania końcówki odklejamy ją (ponowne przyklejenie przy puszczeniu)
    if (drag.k === 'a1') delete s.startBind;
    else if (drag.k === 'a2') delete s.endBind;
    if (drag.k === 'se') {
      s.w = Math.max(20, p.x - s.x); s.h = Math.max(20, p.y - s.y);
      if (s.type === 'icon') { const d = Math.max(s.w, s.h); s.w = d; s.h = d; } // ikony zawsze w proporcji 1:1
      if (s.type === 'image') s.h = Math.max(20, s.w / aspectOf(s));              // obrazek trzyma proporcje oryginału
    }
    else if (drag.k === 'a1') { s.w += s.x - p.x; s.h += s.y - p.y; s.x = p.x; s.y = p.y; }
    else { s.w = p.x - s.x; s.h = p.y - s.y; }
    drag.p = p; dirty = true;
  } else if (drag.mode === 'pan') {
    if (drag.playStep && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.playStep = false;
    camera.x = drag.cx - (e.clientX - drag.sx) / camera.z;
    camera.y = drag.cy - (e.clientY - drag.sy) / camera.z;
  }
  render();
});

canvas.addEventListener('pointerup', (e) => {
  if (drag?.playStep) { // tryb Play: klik w widoczny obiekt = zoom na niego, klik w tło = powrót kadru
    drag = null;
    const s = hitShape(toWorld(e));
    if (play?.pres) { // Prezentacja: klik = dalej; klik w inny odsłonięty obiekt (lub na mapie) = skok
      if (play.over) { if (s) presTravel(s.id); else presOverview(false); }
      else if (s && play.shown.has(s.id) && !play.steps[play.idx]?.ids?.includes(s.id)) presTravel(s.id);
      else presAdvance();
      return;
    }
    if (s && play?.shown.has(s.id)) zoomToShape(s);
    else zoomBackOut();
    return;
  }
  if (drag?.mode === 'draw') {
    const d = drag;
    if (Math.abs(d.w) > 8 || Math.abs(d.h) > 8) {
      const s = { id: uid(), type: d.tool, seed: d.seed };
      if (d.tool === 'arrow') {
        s.x = d.x; s.y = d.y; s.w = d.w; s.h = d.h;
        tryBind(s, 'startBind', { x: s.x, y: s.y });
        tryBind(s, 'endBind', { x: s.x + s.w, y: s.y + s.h });
      }
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
  } else if (dirty) {
    // puszczenie końcówki strzałki nad obiektem → przyklejenie
    if (drag?.mode === 'handle' && drag.s.type === 'arrow' && drag.p) {
      if (drag.k === 'a1') tryBind(drag.s, 'startBind', { x: drag.s.x, y: drag.s.y });
      else tryBind(drag.s, 'endBind', { x: drag.s.x + drag.s.w, y: drag.s.y + drag.s.h });
    }
    scheduleSave();
  }
  drag = null;
  render();
});

canvas.addEventListener('dblclick', (e) => {
  if (locked || play) return;
  const s = hitShape(toWorld(e));
  if (s && !['arrow', 'icon', 'image'].includes(s.type)) startTextEdit(s);
});

/* ── zoom ── */
function centerWorld() {
  const r = canvas.getBoundingClientRect();
  return { x: r.width / 2 / camera.z + camera.x, y: r.height / 2 / camera.z + camera.y };
}
// zmienia zoom trzymając punkt p (świat) w miejscu na ekranie; domyślnie środek widoku
function setZoom(z, p = centerWorld()) {
  z = Math.max(0.25, Math.min(8, z));
  camera.x = p.x - (p.x - camera.x) * (camera.z / z);
  camera.y = p.y - (p.y - camera.y) * (camera.z / z);
  camera.z = z;
  updateZoomLabel();
  render();
}
function updateZoomLabel() { $('#btn-zoom-100').textContent = Math.round(camera.z * 100) + '%'; }

/* ── zoom na obiekt (klawisze = / + i powrót -) ── */
let zoomBack = null; // kamera sprzed zoomu na obiekt — „-" wraca dokładnie do tego stanu
let camRaf = 0;
function stopCamAnim() { cancelAnimationFrame(camRaf); }
// płynny przelot kamery do celu; zoom interpolowany logarytmicznie (stałe tempo optyczne)
function animateCamera(to, dur = 500) {
  const from = { ...camera };
  const t0 = performance.now();
  stopCamAnim();
  const tick = () => {
    const t = Math.min(1, (performance.now() - t0) / dur);
    const e = 1 - (1 - t) ** 3; // ease-out cubic
    camera.z = from.z * (to.z / from.z) ** e;
    camera.x = from.x + (to.x - from.x) * e;
    camera.y = from.y + (to.y - from.y) * e;
    updateZoomLabel();
    render();
    if (t < 1) camRaf = requestAnimationFrame(tick);
  };
  camRaf = requestAnimationFrame(tick);
}
// przelot kamery tak, by prostokąt świata (x1..x2, y1..y2) wypełnił viewport
function zoomToRect(x1, y1, x2, y2) {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const pad = 48;
  const z = Math.max(0.25, Math.min(8,
    Math.min((r.width - pad * 2) / Math.max(24, x2 - x1), (r.height - pad * 2) / Math.max(24, y2 - y1))));
  animateCamera({ z, x: (x1 + x2) / 2 - r.width / 2 / z, y: (y1 + y2) / 2 - r.height / 2 / z });
}
function zoomToShape(s) {
  if (!zoomBack) zoomBack = { ...camera }; // seria zoomów → „-" wraca do stanu sprzed pierwszego
  zoomToRect(Math.min(s.x, s.x + s.w), Math.min(s.y, s.y + s.h),
    Math.max(s.x, s.x + s.w), Math.max(s.y, s.y + s.h));
}
function zoomBackOut() {
  if (!zoomBack) return;
  animateCamera(zoomBack);
  zoomBack = null;
}

// scroll = zoom (kursor jako punkt odniesienia)
wrap.addEventListener('wheel', (e) => {
  // panele pływające nad kanwą (ikony, wyszukiwarka) mają własne przewijanie — kółko należy do nich
  if (e.target instanceof Element && e.target.closest('.diag-icons, .diag-imgsearch, .diag-fx')) return;
  e.preventDefault();
  if (editingId) commitText();
  stopCamAnim();
  setZoom(camera.z * (e.deltaY < 0 ? 1.08 : 0.92), toWorld(e));
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
  if (!current || editingId || (e.target instanceof Element && e.target.matches('input, textarea, select'))) return;
  if (play?.pres) { // Prezentacja: spacja/→ = krok, ← = wstecz, O/„-" = cała mapa, Esc = koniec
    if (e.key === 'Escape') stopPlay();
    else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); presAdvance(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); presRetreat(); }
    else if (e.key === 'o' || e.key === 'O' || e.key === '-' || e.key === '_') { e.preventDefault(); presOverview(); }
    return;
  }
  if (play) { // tryb Play: Esc kończy, spacja/Enter/→ = następny krok, ← = krok wstecz, "-" = powrót kadru
    if (e.key === 'Escape') stopPlay();
    else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); advancePlay(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); retreatPlay(); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBackOut(); }
    return;
  }
  if (locked) { // zablokowany: tylko nawigacja + prezentacja
    if (e.key === 'ArrowLeft') navDiagram(-1);
    else if (e.key === 'ArrowRight') navDiagram(1);
    else if (e.key === 'p' || e.key === 'P') startPres();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
    const s = shapes.find((x) => x.id === selectedId);
    if (s) { clipboard = { ...s }; e.preventDefault(); }
    return;
  }
  if ((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V')) {
    if (!clipboard) return;
    e.preventDefault();
    const s = { ...clipboard, id: uid(), x: clipboard.x + 16, y: clipboard.y + 16 };
    delete s.startBind; delete s.endBind; // kopia strzałki nie dziedziczy przyklejenia
    delete s.film; // kopia karty sceny to NOWA scena, nie duplikat starej (meta scenopisu precz)
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
  } else if (e.key === 'ArrowLeft') navDiagram(-1);
  else if (e.key === 'ArrowRight') navDiagram(1);
  else if (e.key === '=' || e.key === '+') { const s = byId(selectedId); if (s) { e.preventDefault(); zoomToShape(s); } }
  else if (e.key === '-' || e.key === '_') { if (zoomBack) { e.preventDefault(); zoomBackOut(); } }
  else if (e.key === 'v' || e.key === 'V') setTool('select');
  else if (e.key === 'r' || e.key === 'R') setTool('rect');
  else if (e.key === 'a' || e.key === 'A') setTool('arrow');
  else if (e.key === 't' || e.key === 'T') setTool('text');
  else if (e.key === 'i' || e.key === 'I') { toggleKbPanel(false); toggleIconPanel(); }
  else if (e.key === 'g' || e.key === 'G') { toggleIconPanel(false); toggleKbPanel(false); toggleImgPanel(); }
  else if (e.key === 'k' || e.key === 'K') { e.preventDefault(); toggleKbPanel(); } // preventDefault: „k” nie może wpaść do autofokusowanego filtra
  else if (e.key === 'p' || e.key === 'P') startPres();
  else if (e.key === 'Escape' && !iconPanel.hidden) toggleIconPanel(false);
  else if (e.key === 'Escape' && !imgPanel.hidden) toggleImgPanel(false);
  else if (e.key === 'Escape' && !kbPanel.hidden) toggleKbPanel(false);
});

function setTool(t) {
  tool = t;
  document.querySelectorAll('.diag-tool').forEach((b) => b.classList.toggle('is-active', b.dataset.tool === t));
  canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
}

/* ── panel „Ikony": biblioteka rysunkowych ikon wstawianych na kanwę ── */
const iconPanel = $('#icon-panel');
const iconBtn = $('#btn-icons');
iconPanel.innerHTML = ICONS.map((i) => `
  <button class="diag-icon" type="button" role="option" data-icon="${i.k}" title="${i.label}">
    <img src="${ICON_SRC(i.k)}" alt="" loading="lazy" draggable="false"><span>${i.label}</span>
  </button>`).join('');
function toggleIconPanel(force) {
  const show = force ?? iconPanel.hidden;
  if (show && (locked || play)) return;
  iconPanel.hidden = !show;
  iconBtn.classList.toggle('is-active', show);
  iconBtn.setAttribute('aria-pressed', String(show));
}
// wstawienie ikony: na środku widoku, od razu zaznaczona — gotowa do przesunięcia/skalowania
function insertIcon(k) {
  const c = centerWorld();
  const SIZE = 180;
  const s = {
    id: uid(), type: 'icon', icon: k, seed: (Math.random() * 1e9) | 0,
    x: Math.round(c.x - SIZE / 2), y: Math.round(c.y - SIZE / 2), w: SIZE, h: SIZE,
  };
  shapes.push(s);
  selectedId = s.id;
  setTool('select');
  scheduleSave();
  render();
}
iconBtn.addEventListener('click', () => { toggleKbPanel(false); toggleIconPanel(); });
iconPanel.addEventListener('pointerdown', (e) => e.stopPropagation());
iconPanel.addEventListener('click', (e) => {
  const b = e.target.closest('[data-icon]');
  if (b) { insertIcon(b.dataset.icon); toggleIconPanel(false); }
});

/* ── panel „Obrazki": wyszukiwarka grafik z kilku źródeł (Simple Icons / Wikimedia / Openverse) ── */
const imgPanel = $('#img-panel');
const imgBtn = $('#btn-images');
const imgInput = $('#img-q');
const imgGrid = $('#img-results');
const imgNote = $('#img-note');
const RECENT_KEY = 'strefa.diag.recentImages';
let imgProvider = 'all';
let imgSeq = 0; // licznik zapytań — starsza odpowiedź nie nadpisze nowszej

const isImageSrc = (v) => typeof v === 'string' && (/^https:\/\//.test(v) || /^data:image\//.test(v));
const recentList = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } };
function pushRecent(item) {
  const list = recentList().filter((r) => r.src !== item.src);
  list.unshift(item);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 24))); } catch { /* pełny storage — trudno */ }
}

$('#img-tabs').innerHTML = PROVIDER_LIST.map((p) => `
  <button class="diag-imgtab${p.k === 'all' ? ' is-active' : ''}" type="button" data-prov="${p.k}">${p.label}</button>`).join('');
$('#img-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-prov]');
  if (!b) return;
  imgProvider = b.dataset.prov;
  $('#img-tabs').querySelectorAll('.diag-imgtab').forEach((x) => x.classList.toggle('is-active', x === b));
  runSearch();
});

function paintResults(items, { recent = false } = {}) {
  imgGrid.innerHTML = items.map((i, n) => `
    <button class="diag-imgres" type="button" data-n="${n}" title="${esc(i.title || '')}${i.credit ? ' · ' + esc(i.credit) : ''}">
      <img src="${esc(i.thumb || i.src)}" alt="" loading="lazy" draggable="false">
      <span>${esc(i.title || '')}</span>
      ${i.source ? `<em>${esc(i.source)}</em>` : ''}
    </button>`).join('');
  imgGrid.dataset.recent = recent ? '1' : '';
  imgGrid._items = items;
}

function showRecent() {
  const list = recentList();
  imgNote.textContent = list.length ? 'Ostatnio użyte' : 'Wpisz, czego szukasz — np. „docker”, „database”, „serwerownia”. Ikony i logotypy szukają po angielsku.';
  paintResults(list.map((r) => ({ ...r, url: r.src, thumb: r.src })), { recent: true });
}

let searchTimer = null;
function runSearch() {
  clearTimeout(searchTimer);
  const q = imgInput.value.trim();
  if (!q) { showRecent(); return; }
  searchTimer = setTimeout(() => {
    const seq = ++imgSeq;
    const keys = providerKeys(imgProvider);
    const packs = new Map();  // źródło → wyniki (dorzucane w miarę odpowiedzi)
    imgNote.textContent = 'Szukam…';
    paintResults([]);
    let done = 0;
    for (const k of keys) searchProvider(k, q).then((items) => {
      if (seq !== imgSeq) return; // zdążyła wyjść nowsza fraza — ta odpowiedź już nieaktualna
      done++;
      packs.set(k, items);
      // wyniki przeplatane źródło po źródle, żeby logotypy nie zepchnęły zdjęć na sam dół
      const lists = keys.map((x) => packs.get(x) || []);
      const out = [];
      for (let i = 0; i < Math.max(...lists.map((l) => l.length), 0); i++)
        for (const l of lists) if (l[i]) out.push(l[i]);
      const shown = out.slice(0, 48);
      paintResults(shown);
      imgNote.textContent = shown.length
        ? `${shown.length}${out.length > shown.length ? ` z ${out.length}` : ''} wyników${done < keys.length ? ' · szukam dalej…' : ''}`
        : (done < keys.length ? 'Szukam…' : 'Brak wyników — spróbuj innej frazy albo innego źródła.');
    });
  }, 260);
}
imgInput.addEventListener('input', runSearch);
imgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { toggleImgPanel(false); canvas.focus(); }
  else if (e.key === 'Enter') { clearTimeout(searchTimer); runSearch(); }
});

function toggleImgPanel(force) {
  const show = force ?? imgPanel.hidden;
  if (show && (locked || play)) return;
  imgPanel.hidden = !show;
  imgBtn.classList.toggle('is-active', show);
  imgBtn.setAttribute('aria-pressed', String(show));
  if (show) { if (!imgGrid._items?.length) showRecent(); imgInput.focus(); imgInput.select(); }
}
imgBtn.addEventListener('click', () => { toggleIconPanel(false); toggleKbPanel(false); toggleImgPanel(); });
imgPanel.addEventListener('pointerdown', (e) => e.stopPropagation());

// kopia obrazka do bucketu strefy — dzięki temu diagram nie zależy od cudzego serwera
async function uploadImage(blob, item) {
  const ext = (item.ext || blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  const path = `${current?.id || 'scratch'}/${uid()}.${ext}`;
  const { error } = await sb.storage.from('strefa-diagramy').upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) return null;
  return sb.storage.from('strefa-diagramy').getPublicUrl(path).data.publicUrl;
}

// czeka na wczytanie bitmapy (albo na błąd) — wstawiamy dopiero pewny obrazek, nie ślepy adres
function bmpReady(e) {
  if (e.ready) return Promise.resolve(true);
  if (e.failed) return Promise.resolve(false);
  return new Promise((ok) => {
    e.img.addEventListener('load', () => ok(true), { once: true });
    e.img.addEventListener('error', () => ok(false), { once: true });
    setTimeout(() => ok(e.ready), 12000);
  });
}

// wstawienie obrazka: na środku widoku, szerokość 260 px, wysokość wg proporcji oryginału
async function insertImage(src, title, tint = false) {
  const e = bmpEntry(src);
  if (!(await bmpReady(e))) return false;
  const c = centerWorld();
  const W = 260;
  const ratio = e.img.naturalWidth && e.img.naturalHeight ? e.img.naturalWidth / e.img.naturalHeight : 1;
  const s = {
    id: uid(), type: 'image', src, seed: (Math.random() * 1e9) | 0,
    x: Math.round(c.x - W / 2), y: Math.round(c.y - W / ratio / 2), w: W, h: Math.round(W / ratio),
    ...(tint && { tint: true }),
  };
  shapes.push(s);
  selectedId = s.id;
  setTool('select');
  scheduleSave();
  render();
  pushRecent({ src, title: title || '', ...(tint && { tint: true }) });
  return true;
}

imgGrid.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-n]');
  if (!b) return;
  const item = imgGrid._items[+b.dataset.n];
  if (!item) return;
  b.classList.add('is-busy');
  try {
    const src = imgGrid.dataset.recent ? item.src : await materialize(item, uploadImage);
    if (!isImageSrc(src)) throw new Error(`zły adres obrazka: ${src}`);
    if (!(await insertImage(src, item.title, !!item.tint))) throw new Error(`bitmapa się nie wczytała: ${src.slice(0, 80)}`);
    toggleImgPanel(false);
  } catch (err) {
    console.error('[diagramy] wstawianie obrazka:', err);
    toast('Nie udało się wstawić', 'Źródło nie oddało pliku — spróbuj innego wyniku.', 'err');
  } finally {
    b.classList.remove('is-busy');
  }
});

/* ── panel „Koboyo": kopia wybranych rysunkowych ikon koboyo.com w naszym buckecie ──
   Przeglądarka pokazuje od razu WSZYSTKIE ikony (miniatury dociągane leniwie), filtr zawęża.
   Indeks: koboyo/index.json = [[slug, nazwa, słowa kluczowe, grupa], …]; plik: koboyo/<slug>.svg.
   Czarny tusz → wstawiamy z tint, żeby edytor barwił je kolorem kreski jak własne doodle. */
const kbPanel = $('#koboyo-panel');
const kbBtn = $('#btn-koboyo');
const kbInput = $('#kb-q');
const kbGrid = $('#kb-grid');
const kbNote = $('#kb-note');
const KB_URL = (p) => sb.storage.from('strefa-diagramy').getPublicUrl(`koboyo/${p}`).data.publicUrl;
let kbIndex = null;   // wpisy z index.json (null = jeszcze nie pobrany)
let kbGroup = 'all';

async function kbLoad() {
  if (kbIndex) return kbIndex;
  kbNote.textContent = 'Wczytuję bibliotekę…';
  try {
    const r = await fetch(KB_URL('index.json'), { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`index.json → ${r.status}`);
    kbIndex = await r.json();
  } catch (err) {
    console.error('[diagramy] indeks Koboyo:', err);
    kbNote.textContent = 'Nie udało się wczytać biblioteki — spróbuj otworzyć panel ponownie.';
    return null;
  }
  $('#kb-tabs').innerHTML = ['all', ...new Set(kbIndex.map((e) => e[3]))].map((g) => `
    <button class="diag-imgtab${g === kbGroup ? ' is-active' : ''}" type="button" data-group="${esc(g)}">${g === 'all' ? 'Wszystkie' : esc(g)}</button>`).join('');
  return kbIndex;
}

function kbPaint() {
  if (!kbIndex) return;
  const words = kbInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = kbIndex.filter(([slug, name, kw, group]) => (kbGroup === 'all' || group === kbGroup)
    && words.every((w) => slug.includes(w) || name.toLowerCase().includes(w) || kw.includes(w)));
  kbGrid.innerHTML = list.map(([slug, name]) => `
    <button class="diag-imgres" type="button" data-slug="${esc(slug)}" data-name="${esc(name)}" title="${esc(name)}">
      <img src="${esc(KB_URL(slug + '.svg'))}" alt="" loading="lazy" draggable="false">
      <span>${esc(name)}</span>
    </button>`).join('');
  kbGrid.scrollTop = 0;
  kbNote.textContent = list.length
    ? `${list.length} ${kbGroup === 'all' ? 'ikon w bibliotece' : 'ikon w grupie'} · klik wstawia (barwiona tuszem)`
    : 'Nic nie pasuje — spróbuj krótszej frazy (indeks jest po angielsku).';
}

let kbTimer = null;
kbInput.addEventListener('input', () => { clearTimeout(kbTimer); kbTimer = setTimeout(kbPaint, 180); });
kbInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') { toggleKbPanel(false); canvas.focus(); } });

$('#kb-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-group]');
  if (!b) return;
  kbGroup = b.dataset.group;
  $('#kb-tabs').querySelectorAll('.diag-imgtab').forEach((x) => x.classList.toggle('is-active', x === b));
  kbPaint();
});

kbGrid.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-slug]');
  if (!b) return;
  b.classList.add('is-busy');
  try {
    if (!(await insertImage(KB_URL(b.dataset.slug + '.svg'), b.dataset.name, true))) throw new Error(`nie wczytała się: ${b.dataset.slug}`);
    toggleKbPanel(false);
  } catch (err) {
    console.error('[diagramy] wstawianie ikony Koboyo:', err);
    toast('Nie udało się wstawić', 'Ikona nie chciała się wczytać — spróbuj innej.', 'err');
  } finally {
    b.classList.remove('is-busy');
  }
});

function toggleKbPanel(force) {
  const show = force ?? kbPanel.hidden;
  if (show && (locked || play)) return;
  kbPanel.hidden = !show;
  kbBtn.classList.toggle('is-active', show);
  kbBtn.setAttribute('aria-pressed', String(show));
  if (show) {
    toggleIconPanel(false);
    toggleImgPanel(false);
    if (!kbIndex) kbLoad().then((ok) => { if (ok) kbPaint(); });
    kbInput.focus();
    kbInput.select();
  }
}
kbBtn.addEventListener('click', () => toggleKbPanel());
kbPanel.addEventListener('pointerdown', (e) => e.stopPropagation());

// „Wklej adres": obrazek prosto z URL-a (bez kopii w buckecie — adres zostaje cudzy)
$('#img-url').addEventListener('click', async () => {
  const url = (await promptTitle('Adres obrazka (https://…)', ''))?.trim();
  if (!url) return;
  if (!isImageSrc(url)) { toast('Zły adres', 'Podaj adres https:// do pliku graficznego.', 'err'); return; }
  if (await insertImage(url, 'z adresu')) toggleImgPanel(false);
  else toast('Nie udało się wstawić', 'Spod tego adresu nie wczytał się obrazek.', 'err');
});

/* ── tryb Play: stopniowe odsłanianie diagramu ── */
let playRaf = 0;
const PULSE_DUR = 1400;         // czas „pulsu" akcentem po wejściu elementu
const FX_LIST = ['pop', 'slide', 'count']; // efekty inne niż domyślne rysowanie
const backOut = (t, k = 1.7) => 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2;
const easeOut = (t) => 1 - (1 - t) * (1 - t);

// czas animacji kształtu; dla rysowania: kontur wg obwodu, tekst wg liczby znaków
function shapeTiming(s) {
  const fx = FX_LIST.includes(s.fx) ? s.fx : 'draw';
  const pulse = !!s.pulse;
  if ((s.type === 'icon' || s.type === 'image') && fx === 'draw') return { dur: 650, of: 1, fx, pulse }; // bitmapa: odsłanianie od lewej
  if (fx === 'pop') return { dur: 520, of: 1, fx, pulse };
  if (fx === 'slide') return { dur: 560, of: 1, fx, pulse };
  if (fx === 'count') return { dur: 1400, of: 1, fx, pulse };
  let L = 0;
  if (s.type === 'rect') L = 2 * (s.w + s.h);
  else if (s.type === 'arrow') L = Math.hypot(s.w, s.h) * 1.35;
  const outline = L ? Math.min(1100, Math.max(320, L / 1.3)) : 0;
  const text = s.type !== 'arrow' && s.text ? Math.min(1500, Math.max(300, String(s.text).length * 42)) : 0;
  const dur = Math.max(220, outline + text);
  return { dur, of: outline / dur, fx, pulse }; // of = jaka część czasu to kontur
}

// „licznik": pierwsza liczba w tekście interpolowana 0→wartość
function countProxy(s, t) {
  const m = /\d[\d ]*/.exec(s.text || '');
  if (!m) return s;
  const target = parseInt(m[0].replace(/\D/g, ''), 10);
  const cur = Math.round(target * t);
  return { ...s, text: s.text.slice(0, m.index) + cur + s.text.slice(m.index + m[0].length) };
}

// rysuje kształt w trakcie animacji wg rec = { t0, dur, of, fx, pulse }
function drawShapeAnimated(s, rec) {
  const now = performance.now();
  const p = (now - rec.t0) / rec.dur;
  if (p <= 0) return;
  if (p >= 1) { // stan końcowy + ewentualny puls akcentem
    let glow = 0, k = 1;
    if (rec.pulse) {
      const q = (now - rec.t0 - rec.dur) / PULSE_DUR;
      if (q < 1) {
        const w = Math.abs(Math.sin(q * Math.PI * 2)) * Math.sin(Math.PI * q); // 2 pulsy, wygaszane
        glow = 26 * w; k = 1 + 0.035 * w;
      }
    }
    ctx.save();
    if (k !== 1) {
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy);
    }
    if (glow > 0) { ctx.shadowColor = pal().sel; ctx.shadowBlur = glow; }
    paintShape(ctx, s, pal().ink);
    if (s.type !== 'arrow' && s.text) drawText(ctx, s);
    ctx.restore();
    return;
  }
  if (rec.fx === 'draw') { // „ręką": kreska po kresce, tekst znak po znaku, punkt ołówka
    const po = rec.of > 0 ? Math.min(1, p / rec.of) : 1;
    const pt = rec.of < 1 ? Math.max(0, (p - rec.of) / (1 - rec.of)) : 0;
    let tip = paintShape(ctx, s, pal().ink, po);
    if (s.type !== 'arrow' && s.text && pt > 0) tip = drawText(ctx, s, pt) || tip;
    if (tip) {
      ctx.fillStyle = pal().sel;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 3 / Math.sqrt(camera.z), 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  ctx.save();
  ctx.globalAlpha = Math.min(1, p * 2.2);
  if (rec.fx === 'slide') {
    ctx.translate(-46 * (1 - easeOut(p)), 0);
  } else { // pop / count — sprężysty scale-in wokół środka
    const k = 0.82 + 0.18 * backOut(p);
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy);
  }
  const sd = rec.fx === 'count' ? countProxy(s, easeOut(p)) : s;
  paintShape(ctx, s, pal().ink);
  if (s.type !== 'arrow' && s.text) drawText(ctx, sd);
  ctx.restore();
}

// Kroki odsłaniania (BFS warstwami): korzenie → strzałki wychodzące → ich cele → … → reszta.
// Korzeń = obiekt spięty strzałkami, do którego żadna nie prowadzi. Reszta (luźne teksty,
// nieprzypięte strzałki, nieosiągalne cykle) trafia do ostatniego kroku.
function buildPlaySteps() {
  const arrows = shapes.filter((s) => s.type === 'arrow');
  const nodes = shapes.filter((s) => s.type !== 'arrow');
  // graf: bind jawny, a dla odklejonych końcówek wirtualny — obiekt, przy którego ramce
  // leży końcówka strzałki (żeby odklejona strzałka nie psuła kolejności prezentacji)
  const conn = new Map(arrows.map((a) => [a.id, {
    s: a.startBind || bindTargetAt({ x: a.x, y: a.y })?.id,
    e: a.endBind || bindTargetAt({ x: a.x + a.w, y: a.y + a.h })?.id,
  }]));
  const inGraph = new Set();
  for (const { s, e } of conn.values()) { if (s) inGraph.add(s); if (e) inGraph.add(e); }
  const hasIncoming = new Set([...conn.values()].map((c) => c.e).filter(Boolean));
  let roots = nodes.filter((n) => inGraph.has(n.id) && !hasIncoming.has(n.id));
  if (!roots.length) roots = nodes.filter((n) => inGraph.has(n.id)).slice(0, 1); // sam cykl — start od pierwszego
  const steps = [];
  const visible = new Set();
  if (roots.length) { steps.push(roots.map((r) => r.id)); roots.forEach((r) => visible.add(r.id)); }
  for (;;) {
    // strzałki, których początek jest już widoczny (lub nie mają początku, a mają cel)
    const layer = arrows.filter((a) => !visible.has(a.id) && (conn.get(a.id).s || conn.get(a.id).e) &&
      (!conn.get(a.id).s || visible.has(conn.get(a.id).s)));
    if (!layer.length) break;
    steps.push(layer.map((a) => a.id));
    layer.forEach((a) => visible.add(a.id));
    const targets = [...new Set(layer.map((a) => conn.get(a.id).e).filter((id) => id && !visible.has(id)))];
    if (targets.length) { steps.push(targets); targets.forEach((id) => visible.add(id)); }
  }
  // luźne kształty (ikony, podpisy niespięte strzałkami) nie mogą czekać hurtem na koniec —
  // dołączamy je do kroku obiektu, przy którym leżą (najbliższy środek), a bezdomne na koniec
  const rest = shapes.filter((s) => !visible.has(s.id));
  const placed = shapes.filter((s) => visible.has(s.id) && s.type !== 'arrow');
  const orphans = [];
  const mid = (s) => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 });
  for (const s of rest) {
    const c = mid(s);
    let best = null, bestD = Infinity;
    for (const p of placed) {
      const pc = mid(p);
      const d = Math.hypot(c.x - pc.x, c.y - pc.y) - Math.max(Math.abs(p.w), Math.abs(p.h)) / 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    const step = best && bestD < 520 ? steps.find((st) => st.includes(best.id)) : null;
    if (step) step.push(s.id); else orphans.push(s.id);
  }
  if (orphans.length) steps.push(orphans);
  return { steps, conn };
}

function startPlay() {
  // ikony ładują się leniwie przy pierwszym rysowaniu — w prezentacji byłoby za późno
  // (animacja kroku zdążyłaby przelecieć na przerywanej ramce), więc grzejemy je z góry
  for (const s of shapes) {
    if (s.type === 'icon' && s.icon) tintedBmp(ICON_SRC(s.icon), pal().ink);
    else if (s.type === 'image' && s.src) { bmpEntry(s.src); if (s.tint) tintedBmp(s.src, pal().ink); }
  }
  const { steps, conn } = buildPlaySteps();
  if (!steps.length) { toast('Pusty diagram', 'Nie ma czego odtwarzać.', 'err'); return; }
  if (editingId) commitText();
  play = { steps, conn, idx: 0, shown: new Map() };
  fxPreview = null;
  selectedId = null;
  drag = null;
  zoomBack = null; // świeży kontekst kadrów dla zoomu-pod-klikiem
  applyPlayUI(true);
  revealStep();
}
// odsłania bieżący krok; startAt = kiedy zacząć (domyślnie teraz), zwraca czas końca animacji
function revealStep(startAt) {
  // kształty warstwy rysują się PO KOLEI (jak ręką), w porządku czytania, z lekkim zazębieniem;
  // całość kroku skalowana tak, by nie przekroczyć ~2.6 s
  const shs = play.steps[play.idx].map(byId).filter(Boolean)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const timings = shs.map(shapeTiming);
  const total = timings.reduce((a, t) => a + t.dur * 0.85, 0);
  const k = Math.min(1, 2600 / Math.max(1, total));
  let t = startAt ?? performance.now();
  shs.forEach((s, i) => {
    play.shown.set(s.id, { ...timings[i], t0: t, dur: timings[i].dur * k });
    t += timings[i].dur * k * 0.85; // następny startuje tuż przed końcem poprzedniego
  });
  cancelAnimationFrame(playRaf);
  const tick = () => {
    render();
    if (play && [...play.shown.values()].some((r) => performance.now() < r.t0 + r.dur + (r.pulse ? PULSE_DUR : 0) + 40))
      playRaf = requestAnimationFrame(tick);
  };
  playRaf = requestAnimationFrame(tick);
  return t;
}
const isArrowStep = (i) => play.steps[i]?.length && play.steps[i].every((id) => byId(id)?.type === 'arrow');
function advancePlay() {
  if (!play) return;
  if (play.idx < play.steps.length - 1) {
    play.idx++;
    const end = revealStep();
    // krok złożony z samych strzałek nie jest osobną „klatką" prezentacji — od razu dociągamy
    // obiekty, do których prowadzą (jedno naciśnięcie = strzałka + jej cel)
    if (isArrowStep(play.idx) && play.idx < play.steps.length - 1) {
      play.idx++;
      revealStep(end);
    }
    if (zoomBack) followPlayCamera(); // kamera zzoomowana → podążaj za nowym krokiem
  } else stopPlay(); // wszystko widoczne — kolejna spacja kończy tryb
}
// krok wstecz: chowa obiekty bieżącego kroku (bez ponownej animacji poprzednich)
function retreatPlay() {
  if (!play || play.idx === 0) return;
  for (const id of play.steps[play.idx]) play.shown.delete(id);
  play.idx--;
  // krok ze strzałkami był pokazany razem z celem — cofamy je razem
  if (isArrowStep(play.idx) && play.idx > 0) {
    for (const id of play.steps[play.idx]) play.shown.delete(id);
    play.idx--;
  }
  // poprzedni krok ma być od razu w pełni widoczny, nie animowany od nowa
  for (const id of play.steps[play.idx]) {
    const rec = play.shown.get(id);
    if (rec) { rec.t0 = -1e9; rec.pulse = false; }
  }
  if (zoomBack) followPlayCamera();
  render();
}
// przelot kamery na obiekty bieżącego kroku; kadr trzyma się obiektów, nie strzałek —
// dla kroku samych strzałek celujemy w to, na co wskazują
function followPlayCamera() {
  const targets = [];
  for (const id of play.steps[play.idx]) {
    const s = byId(id);
    if (!s) continue;
    if (s.type !== 'arrow') targets.push(s);
    else {
      const e = play.conn.get(id)?.e;
      const t = e && byId(e);
      if (t) targets.push(t);
    }
  }
  if (!targets.length) return; // np. luźne strzałki bez celu — kamera zostaje
  let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
  for (const s of targets) {
    x1 = Math.min(x1, s.x, s.x + s.w); x2 = Math.max(x2, s.x, s.x + s.w);
    y1 = Math.min(y1, s.y, s.y + s.h); y2 = Math.max(y2, s.y, s.y + s.h);
  }
  zoomToRect(x1, y1, x2, y2);
}
function stopPlay() {
  if (!play) return;
  const wasPres = !!play.pres;
  play = null;
  cancelAnimationFrame(playRaf);
  cancelAnimationFrame(presRaf);
  zoomBack = null;
  if (wasPres) applyPresUI(false); else applyPlayUI(false);
  render();
}
function applyPlayUI(on) {
  const btn = $('#btn-play');
  btn.classList.toggle('is-active', on);
  btn.setAttribute('aria-pressed', String(on));
  btn.title = on ? 'Zakończ odtwarzanie (Esc)' : 'Odtwórz diagram (spacja = krok, klik = zoom na obiekt)';
  $('#play-hint').hidden = !on;
  document.querySelectorAll('.diag-tool[data-tool]').forEach((b) => { b.disabled = on || locked; });
  iconBtn.disabled = on || locked;
  imgBtn.disabled = on || locked;
  kbBtn.disabled = on || locked;
  if (on) toggleImgPanel(false);
  if (on) toggleIconPanel(false);
  if (on) toggleKbPanel(false);
  $('#btn-rename').disabled = on || locked;
  $('#btn-delete').disabled = on || locked;
  if (on) setTool('select');
  canvas.style.cursor = on ? 'pointer' : 'default';
}
$('#btn-play').addEventListener('click', () => (play ? stopPlay() : startPlay()));

/* ── tryb Prezentacja: kamera-slajdy jak w „graph-based slides" ──
   Jeden krok = jeden obiekt (plus doklejone podpisy i strzałka dochodząca). Kamera nurkuje
   między kadrami po łuku van Wijka–Nuij (jak d3.interpolateZoom): przy dalekich skokach sama
   odjeżdża pokazując całą mapę i wchodzi w nowy region. Focus pełną kreską, wcześniejsze
   kroki przygaszone, nieodsłonięte jako ledwo widoczne duchy. Czysty ekran pod nagrywanie. */
let presRaf = 0;
let presCursorTimer = 0;
const PRES = { ghost: 0.06, ghostOver: 0.09, dim: 0.22, dimOver: 0.55, maxZ: 2.4 };

function boundsOf(shs) {
  let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
  for (const s of shs) {
    x1 = Math.min(x1, s.x, s.x + s.w); x2 = Math.max(x2, s.x, s.x + s.w);
    y1 = Math.min(y1, s.y, s.y + s.h); y2 = Math.max(y2, s.y, s.y + s.h);
  }
  return { x1, y1, x2, y2 };
}

// Kroki prezentacji: kolejność BFS jak w Play, ale nody POJEDYNCZO. Luźne podpisy/ikony
// dołączają do kroku najbliższego obiektu, strzałka odsłania się w kroku swojego celu
// (rysuje się tuż przed nim — „skąd przyszliśmy"), bezdomne kształty dostają własne kroki.
function buildPresSteps() {
  const arrows = shapes.filter((s) => s.type === 'arrow');
  const nodes = shapes.filter((s) => s.type !== 'arrow');
  const conn = new Map(arrows.map((a) => [a.id, {
    s: a.startBind || bindTargetAt({ x: a.x, y: a.y })?.id,
    e: a.endBind || bindTargetAt({ x: a.x + a.w, y: a.y + a.h })?.id,
  }]));
  const inGraph = new Set();
  for (const { s, e } of conn.values()) { if (s) inGraph.add(s); if (e) inGraph.add(e); }
  const hasIncoming = new Set([...conn.values()].map((c) => c.e).filter(Boolean));
  const read = (a, b) => (a.y - b.y) || (a.x - b.x); // porządek czytania w obrębie warstwy
  const order = [];
  const seen = new Set();
  let layer = nodes.filter((n) => inGraph.has(n.id) && !hasIncoming.has(n.id)).sort(read);
  if (!layer.length) layer = nodes.filter((n) => inGraph.has(n.id)).slice(0, 1); // sam cykl
  while (layer.length) {
    for (const n of layer) { order.push(n); seen.add(n.id); }
    const next = new Set();
    for (const { s, e } of conn.values())
      if (e && !seen.has(e) && (!s || seen.has(s))) next.add(e);
    layer = nodes.filter((n) => next.has(n.id)).sort(read);
  }
  for (const n of nodes.filter((n) => inGraph.has(n.id) && !seen.has(n.id)).sort(read)) { order.push(n); seen.add(n.id); }
  // luźne kształty → do kroku najbliższego obiektu grafu albo własny krok na końcu
  const loose = nodes.filter((n) => !seen.has(n.id));
  const att = new Map();
  const solo = [];
  const mid = (s) => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 });
  for (const s of loose) {
    const c = mid(s);
    let best = null, bestD = Infinity;
    for (const p of order) {
      const pc = mid(p);
      const d = Math.hypot(c.x - pc.x, c.y - pc.y) - Math.max(Math.abs(p.w), Math.abs(p.h)) / 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best && bestD < 520) { if (!att.has(best.id)) att.set(best.id, []); att.get(best.id).push(s); }
    else solo.push(s);
  }
  const steps = order.map((n) => ({ ids: [n.id, ...(att.get(n.id) || []).sort(read).map((x) => x.id)] }));
  for (const s of solo.sort(read)) steps.push({ ids: [s.id] });
  const stepIdx = new Map();
  steps.forEach((st, i) => st.ids.forEach((id) => stepIdx.set(id, i)));
  for (const a of arrows) {
    const { s, e } = conn.get(a.id);
    const ie = e != null ? stepIdx.get(e) : undefined;
    const is = s != null ? stepIdx.get(s) : undefined;
    const target = ie !== undefined && is !== undefined ? Math.max(ie, is) : ie ?? is;
    if (target === undefined) { steps.push({ ids: [a.id] }); continue; } // strzałka w próżni
    // dochodząca rysuje się przed nodem kroku, wychodząca wstecz — po nim
    if (ie === target) steps[target].ids.unshift(a.id); else steps[target].ids.push(a.id);
  }
  return steps;
}

// kadr kroku: bbox obiektów + dociągnięcie w stronę końcówek strzałek (kontekst „skąd"),
// ale bez odjeżdżania od bohatera dalej niż ~1 przekątną
function presFrameRect(st) {
  const shs = st.ids.map(byId).filter(Boolean);
  const solid = shs.filter((s) => s.type !== 'arrow');
  const b = boundsOf(solid.length ? solid : shs);
  if (solid.length) {
    const cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2;
    const lim = Math.max(b.x2 - b.x1, b.y2 - b.y1) * 0.9 + 60;
    for (const s of shs) {
      if (s.type !== 'arrow') continue;
      for (const p of [{ x: s.x, y: s.y }, { x: s.x + s.w, y: s.y + s.h }]) {
        const dx = Math.max(-lim, Math.min(lim, p.x - cx));
        const dy = Math.max(-lim, Math.min(lim, p.y - cy));
        b.x1 = Math.min(b.x1, cx + dx); b.x2 = Math.max(b.x2, cx + dx);
        b.y1 = Math.min(b.y1, cy + dy); b.y2 = Math.max(b.y2, cy + dy);
      }
    }
  }
  return b;
}

// kamera, przy której prostokąt świata wypełnia viewport (z marginesem, zoom ograniczony)
function camForRect(rect, maxZ = PRES.maxZ, padScale = 0.14) {
  const r = canvas.getBoundingClientRect();
  const pad = Math.max(48, Math.min(r.width, r.height) * padScale);
  const z = Math.max(0.08, Math.min(maxZ,
    Math.min((r.width - pad * 2) / Math.max(24, rect.x2 - rect.x1),
      (r.height - pad * 2) / Math.max(24, rect.y2 - rect.y1))));
  return { z, x: (rect.x1 + rect.x2) / 2 - r.width / 2 / z, y: (rect.y1 + rect.y2) / 2 - r.height / 2 / z };
}

// przelot van Wijka–Nuij (jak d3.interpolateZoom) — naturalny łuk „odjazd nad mapę i nurkowanie";
// zwraca czas trwania przelotu w ms (do zsynchronizowania startu animacji odsłaniania)
function flyCamera(to) {
  const r = canvas.getBoundingClientRect();
  if (!r.width) { camera = { ...to }; render(); return 0; }
  const rho = 1.42, rho2 = rho * rho;
  const w0 = r.width / camera.z, w1 = r.width / to.z;
  const ux0 = camera.x + r.width / 2 / camera.z, uy0 = camera.y + r.height / 2 / camera.z;
  const ux1 = to.x + r.width / 2 / to.z, uy1 = to.y + r.height / 2 / to.z;
  const dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy, d1 = Math.sqrt(d2);
  let S, at;
  if (d2 < 1) { // czysty zoom (albo brak ruchu)
    S = Math.abs(Math.log(w1 / w0)) / rho;
    at = (t) => ({ cx: ux0 + t * dx, cy: uy0 + t * dy, w: w0 * Math.exp(Math.log(w1 / w0) * t) });
  } else {
    const b0 = (w1 * w1 - w0 * w0 + rho2 * rho2 * d2) / (2 * w0 * rho2 * d1);
    const b1 = (w1 * w1 - w0 * w0 - rho2 * rho2 * d2) / (2 * w1 * rho2 * d1);
    const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
    const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
    S = (r1 - r0) / rho;
    at = (t) => {
      const s = t * S;
      const u = (w0 / (rho2 * d1)) * (Math.cosh(r0) * Math.tanh(rho * s + r0) - Math.sinh(r0));
      return { cx: ux0 + u * dx, cy: uy0 + u * dy, w: (w0 * Math.cosh(r0)) / Math.cosh(rho * s + r0) };
    };
  }
  const dur = Math.max(480, Math.min(1700, Math.abs(S) * 190));
  const t0 = performance.now();
  stopCamAnim();
  const tick = () => {
    const t = Math.min(1, (performance.now() - t0) / dur);
    const f = at((1 - Math.cos(Math.PI * t)) / 2); // delikatne wejście/wyjście
    camera.z = r.width / f.w;
    camera.x = f.cx - r.width / 2 / camera.z;
    camera.y = f.cy - r.height / 2 / camera.z;
    updateZoomLabel();
    render();
    if (t < 1) camRaf = requestAnimationFrame(tick);
  };
  camRaf = requestAnimationFrame(tick);
  return dur;
}

// docelowa widoczność kształtu w bieżącym stanie prezentacji
function presTargetAlpha(s) {
  const st = play.steps[play.idx];
  const rec = play.shown.get(s.id);
  const started = rec && performance.now() >= rec.t0;
  if (st?.finale) return started ? 1 : PRES.ghost;
  if (started && st && st.ids.includes(s.id)) return 1;
  if (started) return play.over ? PRES.dimOver : PRES.dim;
  return play.over || play.idx < 0 ? PRES.ghostOver : PRES.ghost;
}
const presAlpha = (s) => play.alph.get(s.id) ?? presTargetAlpha(s);

// stała pętla renderu prezentacji: wygładza alfa i utrzymuje 60 fps pod nagrywanie
function presTick(now) {
  if (!play?.pres) return;
  const dt = Math.min(64, now - (play.t || now));
  play.t = now;
  const k = 1 - Math.exp(-dt / 130);
  for (const s of shapes) {
    const t = presTargetAlpha(s);
    const cur = play.alph.get(s.id) ?? 0;
    play.alph.set(s.id, cur + (t - cur) * k);
  }
  render();
  presRaf = requestAnimationFrame(presTick);
}

// harmonogram odsłaniania kroku: strzałka → obiekt → podpisy, z zazębieniem jak w Play;
// delay czeka, aż kamera zdąży dolecieć w okolice kadru
function presReveal(st, delay = 0) {
  const shs = st.ids.map(byId).filter(Boolean);
  const timings = shs.map(shapeTiming);
  const total = timings.reduce((a, t) => a + t.dur * 0.85, 0);
  const k = Math.min(1, 2600 / Math.max(1, total));
  let t = performance.now() + delay;
  shs.forEach((s, i) => {
    play.shown.set(s.id, { ...timings[i], t0: t, dur: timings[i].dur * k });
    t += timings[i].dur * k * 0.85;
  });
}

function presAdvance() {
  if (!play?.pres || play.idx >= play.steps.length - 1) return; // po finale kończy tylko Esc
  play.idx++;
  play.over = false;
  const st = play.steps[play.idx];
  if (st.finale) flyCamera(camForRect(boundsOf(shapes), 1, 0.08)); // wielki finał: cała mapa
  else {
    const dur = flyCamera(camForRect(presFrameRect(st)));
    presReveal(st, dur * 0.55);
  }
  updatePresUI();
}

function presRetreat() {
  if (!play?.pres || play.idx < 0) return;
  const st = play.steps[play.idx];
  if (!st.finale) for (const id of st.ids) play.shown.delete(id);
  play.idx--;
  play.over = false;
  const prev = play.steps[play.idx];
  if (!prev || prev.finale) flyCamera(camForRect(boundsOf(shapes), 1, 0.08));
  else {
    for (const id of prev.ids) { // poprzedni krok od razu w pełni, bez ponownej animacji
      const rec = play.shown.get(id);
      if (rec) { rec.t0 = -1e9; rec.pulse = false; }
    }
    flyCamera(camForRect(presFrameRect(prev)));
  }
  updatePresUI();
}

// skok do kroku zawierającego kliknięty kształt: wcześniejsze odsłonięte od razu,
// późniejsze schowane, sam cel odgrywa swoją animację od nowa
function presTravel(id) {
  const i = play.steps.findIndex((st) => !st.finale && st.ids.includes(id));
  if (i < 0) return;
  play.steps.forEach((st, j) => {
    if (st.finale) return;
    if (j < i) for (const sid of st.ids) play.shown.set(sid, { t0: -1e9, dur: 1, of: 1, fx: 'draw', pulse: false });
    else for (const sid of st.ids) play.shown.delete(sid);
  });
  play.idx = i;
  play.over = false;
  const st = play.steps[i];
  const dur = flyCamera(camForRect(presFrameRect(st)));
  presReveal(st, dur * 0.55);
  updatePresUI();
}

function presOverview(force) {
  if (!play?.pres) return;
  const on = force ?? !play.over;
  play.over = on;
  const st = play.idx >= 0 ? play.steps[play.idx] : null;
  if (on || !st || st.finale) flyCamera(camForRect(boundsOf(shapes), 1, 0.08));
  else flyCamera(camForRect(presFrameRect(st)));
  updatePresUI();
}

function updatePresUI() {
  const n = play.steps.length;
  $('#pres-counter').textContent = play.idx < 0 ? `— / ${n}` : `${play.idx + 1} / ${n}`;
}

// kursor znika po chwili bezruchu — czysty kadr do nagrywania
function presCursorWake() {
  if (!play?.pres) return;
  canvas.style.cursor = 'default';
  clearTimeout(presCursorTimer);
  presCursorTimer = setTimeout(() => { if (play?.pres) canvas.style.cursor = 'none'; }, 2200);
}
canvas.addEventListener('pointermove', presCursorWake);

function applyPresUI(on) {
  applyPlayUI(on); // ta sama blokada narzędzi/paneli co w Play…
  $('#btn-play').classList.remove('is-active'); // …ale bez oznaczania przycisku Play
  $('#btn-play').setAttribute('aria-pressed', 'false');
  $('#play-hint').hidden = true;
  $('#diag-editor').classList.toggle('is-pres', on);
  const btn = $('#btn-pres');
  btn.classList.toggle('is-active', on);
  btn.setAttribute('aria-pressed', String(on));
  $('#pres-ui').hidden = !on;
  clearTimeout(presCursorTimer);
  canvas.style.cursor = on ? 'default' : 'default';
  if (on) presCursorWake();
}

function startPres() {
  if (play?.pres) return;
  stopPlay();
  for (const s of shapes) { // bitmapy grzane z góry — w prezentacji nie ma czasu na doładowywanie
    if (s.type === 'icon' && s.icon) tintedBmp(ICON_SRC(s.icon), pal().ink);
    else if (s.type === 'image' && s.src) { bmpEntry(s.src); if (s.tint) tintedBmp(s.src, pal().ink); }
  }
  const steps = buildPresSteps();
  if (!steps.length) { toast('Pusty diagram', 'Nie ma czego prezentować.', 'err'); return; }
  if (editingId) commitText();
  steps.push({ finale: true, ids: [] }); // ostatni slajd = cała mapa w pełnej kresce
  play = { pres: true, steps, idx: -1, shown: new Map(), alph: new Map(shapes.map((s) => [s.id, 0])), over: false };
  selectedId = null;
  drag = null;
  zoomBack = null;
  fxPreview = null;
  applyPresUI(true);
  if (current) $('#pres-title').textContent = current.title;
  resize(); // pasek narzędzi znika → kanwa urosła, kadr liczymy na nowym rozmiarze
  flyCamera(camForRect(boundsOf(shapes), 1, 0.08)); // start: cała mapa jako duchy
  updatePresUI();
  cancelAnimationFrame(presRaf);
  presRaf = requestAnimationFrame(presTick);
}
$('#btn-pres').addEventListener('click', () => (play?.pres ? stopPlay() : startPres()));

/* ── panel „Animacja": przypisywanie efektu do zaznaczonego elementu + podgląd na żywo ── */
let fxPreview = null; // { id, rec } — pojedynczy kształt animowany w edycji
let fxRaf = 0;
let fxSig = '';       // sygnatura ostatniego stanu panelu (unik DOM-writes co klatkę)
const fxPanel = $('#fx-panel');

function previewFx(s) {
  const tm = shapeTiming(s);
  fxPreview = { id: s.id, rec: { ...tm, t0: performance.now() } };
  const end = fxPreview.rec.t0 + tm.dur + (tm.pulse ? PULSE_DUR : 0) + 40;
  cancelAnimationFrame(fxRaf);
  const tick = () => {
    render();
    if (fxPreview && performance.now() < end) fxRaf = requestAnimationFrame(tick);
    else { fxPreview = null; render(); }
  };
  fxRaf = requestAnimationFrame(tick);
}

function updateFxPanel() {
  const s = !locked && !play && selectedId ? byId(selectedId) : null;
  const sig = s ? `${s.id}|${s.fx || 'draw'}|${!!s.pulse}|${!!s.tint}|${s.text || ''}` : '';
  if (sig === fxSig) return;
  fxSig = sig;
  fxPanel.hidden = !s;
  if (!s) return;
  const fx = FX_LIST.includes(s.fx) ? s.fx : 'draw';
  fxPanel.querySelectorAll('[data-fx]').forEach((b) => b.classList.toggle('is-active', b.dataset.fx === fx));
  fxPanel.querySelector('[data-fx="count"]').disabled = s.type === 'arrow' || !/\d/.test(s.text || '');
  $('#fx-pulse').classList.toggle('is-active', !!s.pulse);
  // barwienie tuszem ma sens tylko dla wstawionej grafiki (ikony biblioteki są barwione zawsze)
  const tintBtn = $('#fx-tint');
  tintBtn.hidden = s.type !== 'image';
  tintBtn.classList.toggle('is-active', !!s.tint);
}

fxPanel.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  const s = b && byId(selectedId);
  if (!s) return;
  if (b.dataset.fx) {
    if (b.dataset.fx === 'draw') delete s.fx; else s.fx = b.dataset.fx;
  } else if (b.id === 'fx-pulse') {
    if (s.pulse) delete s.pulse; else s.pulse = true;
  } else if (b.id === 'fx-tint') {
    if (s.tint) delete s.tint; else s.tint = true;
    if (s.tint) tintedBmp(s.src, pal().ink);
  }
  fxSig = '';
  updateFxPanel();
  scheduleSave();
  previewFx(s);
});
fxPanel.addEventListener('pointerdown', (e) => e.stopPropagation()); // nie odznaczaj kształtu klikiem w panel

/* ── zapis / Supabase ── */
function setStatus(txt) { const el = $('#save-status'); if (el) el.textContent = txt; }
function scheduleSave() {
  dirty = true;
  setStatus('Zapisywanie…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 800);
}
// data budowane przez rozszerzenie — dodatkowe klucze (np. `film` scenopisu reżyserki) przeżywają zapis
function buildData() {
  const data = { ...current.data, shapes };
  if (locked) data.locked = true; else delete data.locked;
  return data;
}
async function saveNow() {
  if (!current || !dirty) return;
  dirty = false;
  current.data = buildData();
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
    g.fillStyle = pal().muted;
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
    paintShape(g, s, pal().inkThumb);
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
      <span class="diag-card__thumb"><canvas></canvas>${d.data?.film ? '<span class="diag-card__badge" title="Diagram scenopisu — powiązany z filmem w Reżyserce, zmiany wracają tam na żywo">scenopis</span>' : ''}<span class="diag-card__del" role="button" aria-label="Usuń diagram" title="Usuń diagram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></span></span>
      <span class="diag-card__title">${esc(d.title)}</span>
      <span class="diag-card__date">${fmtDateTime(d.updated_at)}</span>
    </button>`).join('');
  $('#card-new').addEventListener('click', () => createDiagram());
  for (const card of grid.querySelectorAll('.diag-card[data-id]')) {
    const d = diagrams.find((x) => x.id === card.dataset.id);
    card.addEventListener('click', () => openEditor(d.id));
    card.querySelector('.diag-card__del').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!(await confirmDialog(`Usunąć diagram „${d.title}"?`, 'OK'))) return;
      const { error } = await sb.from('diagrams').delete().eq('id', d.id);
      if (error) { toast('Błąd', error.message, 'err'); return; }
      diagrams = diagrams.filter((x) => x.id !== d.id);
      renderGallery();
    });
    requestAnimationFrame(() => drawThumb(card.querySelector('canvas'), Array.isArray(d.data?.shapes) ? d.data.shapes : []));
  }
}

async function showGallery() {
  stopPlay();
  if (dirty) await saveNow();
  current = null;
  $('#diag-editor').hidden = true;
  $('#diag-gallery').hidden = false;
  await loadList();
  renderGallery();
}

/* ── otwieranie / tworzenie / edytor ── */
async function openEditor(id) {
  stopPlay();
  const { data, error } = await sb.from('diagrams').select('*').eq('id', id).single();
  if (error) { toast('Błąd', error.message, 'err'); return; }
  current = data;
  shapes = Array.isArray(data.data?.shapes) ? data.data.shapes : [];
  selectedId = null;
  stopCamAnim();
  zoomBack = null;
  shapeCache.clear();
  camera = { x: 0, y: 0, z: 1 };
  setStatus('');
  $('#diag-title').textContent = data.title;
  $('#diag-gallery').hidden = true;
  $('#diag-editor').hidden = false;
  locked = !!data.data?.locked;
  applyLock();
  updateZoomLabel();
  setTool('select');
  resize();
}

// przejście na sąsiedni diagram (kolejność jak w galerii); dir = -1 (←) / +1 (→), z zawinięciem
async function navDiagram(dir) {
  if (!current || diagrams.length < 2) return;
  const i = diagrams.findIndex((d) => d.id === current.id);
  const next = diagrams[((i < 0 ? 0 : i) + dir + diagrams.length) % diagrams.length];
  if (!next || next.id === current.id) return;
  if (dirty) await saveNow();
  openEditor(next.id);
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

/* ── import diagramu z JSON ── */
// Akceptuje: {title?, shapes:[...]}, {title?, data:{shapes:[...]}} albo gołą tablicę kształtów.
function sanitizeShapes(raw) {
  const num = (v) => (Number.isFinite(+v) ? +v : null);
  const out = [];
  const ids = new Set();
  for (const r of Array.isArray(raw) ? raw : []) {
    if (!r || !['rect', 'arrow', 'text', 'icon', 'image'].includes(r.type)) continue;
    if (r.type === 'icon' && !ICONS.some((i) => i.k === r.icon)) continue;
    if (r.type === 'image' && !isImageSrc(r.src)) continue;
    let x = num(r.x), y = num(r.y), w = num(r.w), h = num(r.h);
    if (x === null || y === null || w === null || h === null) continue;
    if (r.type !== 'arrow') { // rect/text trzymamy znormalizowane: w,h > 0
      if (w < 0) { x += w; w = -w; }
      if (h < 0) { y += h; h = -h; }
      w = Math.max(24, w); h = Math.max(24, h);
    }
    const s = {
      id: typeof r.id === 'string' && r.id ? r.id : uid(),
      type: r.type, x, y, w, h,
      seed: Number.isInteger(r.seed) ? r.seed : (Math.random() * 1e9) | 0,
    };
    if (ids.has(s.id)) s.id = uid();
    ids.add(s.id);
    if (s.type === 'icon') s.icon = r.icon;
    else if (s.type === 'image') { s.src = r.src; if (r.tint === true) s.tint = true; }
    else if (s.type !== 'arrow') s.text = typeof r.text === 'string' ? r.text : '';
    else {
      if (typeof r.startBind === 'string') s.startBind = r.startBind;
      if (typeof r.endBind === 'string') s.endBind = r.endBind;
    }
    if (['pop', 'slide', 'count'].includes(r.fx)) s.fx = r.fx;
    if (r.pulse === true) s.pulse = true;
    out.push(s);
  }
  for (const s of out) { // bindy do nieistniejących obiektów precz
    if (s.startBind && !out.some((o) => o.id === s.startBind && o.type !== 'arrow')) delete s.startBind;
    if (s.endBind && !out.some((o) => o.id === s.endBind && o.type !== 'arrow')) delete s.endBind;
  }
  return out;
}

function importDiagram() {
  const box = openModal(`
    <div class="strefa-modal__body">
      <h3 style="margin:0 0 var(--space-md)">Import diagramu z JSON</h3>
      <textarea class="strefa-input" id="dg-json" rows="12" spellcheck="false" style="font-family:monospace;font-size:.8rem;resize:vertical"
        placeholder='{"title":"Mój diagram","shapes":[{"type":"rect","x":0,"y":0,"w":300,"h":140,"text":"Hello"},{"type":"arrow","x":150,"y":150,"w":0,"h":120},{"type":"icon","icon":"robot","x":0,"y":300,"w":180,"h":180}]}'></textarea>
      <div class="strefa-actions-row" style="margin-top:var(--space-lg)">
        <button class="strefa-btn strefa-btn--ghost" data-no>Anuluj</button>
        <button class="strefa-btn strefa-btn--accent" data-yes>Importuj</button>
      </div>
    </div>`);
  box.querySelector('[data-no]').addEventListener('click', closeModal);
  box.querySelector('[data-yes]').addEventListener('click', async () => {
    let parsed;
    try { parsed = JSON.parse(box.querySelector('#dg-json').value); }
    catch (e) { toast('Niepoprawny JSON', e.message, 'err'); return; }
    const rawShapes = Array.isArray(parsed) ? parsed : parsed?.shapes ?? parsed?.data?.shapes;
    const shs = sanitizeShapes(rawShapes);
    if (!shs.length) { toast('Pusty import', 'Nie znaleziono żadnego poprawnego kształtu (rect/arrow/text).', 'err'); return; }
    const title = (typeof parsed?.title === 'string' && parsed.title.trim()) || 'Import JSON';
    const { data, error } = await sb.from('diagrams').insert({ title, data: { shapes: shs } }).select().single();
    if (error) { toast('Błąd importu', error.message, 'err'); return; }
    closeModal();
    toast('Zaimportowano', `„${title}" — ${shs.length} kształtów`);
    openEditor(data.id);
  });
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
/* ── kłódka: blokada edycji diagramu ── */
const ICON_LOCKED = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const ICON_UNLOCKED = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.8-1.3"/></svg>';
function applyLock() {
  const btn = $('#btn-lock');
  btn.innerHTML = locked ? ICON_LOCKED : ICON_UNLOCKED;
  btn.title = locked ? 'Diagram zablokowany — kliknij, by odblokować' : 'Zablokuj edycję';
  btn.setAttribute('aria-pressed', String(locked));
  btn.classList.toggle('is-locked', locked);
  document.querySelectorAll('.diag-tool[data-tool]').forEach((b) => { b.disabled = locked; });
  iconBtn.disabled = locked;
  imgBtn.disabled = locked;
  kbBtn.disabled = locked;
  if (locked) toggleImgPanel(false);
  if (locked) toggleIconPanel(false);
  if (locked) toggleKbPanel(false);
  $('#btn-rename').disabled = locked;
  $('#btn-delete').disabled = locked;
  if (locked) {
    if (editingId) commitText();
    selectedId = null;
    setTool('select');
    render();
  }
}
$('#btn-lock').addEventListener('click', async () => {
  if (!current) return;
  stopPlay();
  locked = !locked;
  applyLock();
  current.data = buildData();
  const { error } = await sb.from('diagrams').update({ data: current.data }).eq('id', current.id);
  if (error) { toast('Błąd', error.message, 'err'); }
});

document.querySelectorAll('.diag-tool[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
$('#btn-zoom-in').addEventListener('click', () => setZoom(camera.z * 1.2));
$('#btn-zoom-out').addEventListener('click', () => setZoom(camera.z / 1.2));
$('#btn-zoom-100').addEventListener('click', () => setZoom(1));
$('#btn-import')?.addEventListener('click', importDiagram);
$('#btn-prev').addEventListener('click', () => navDiagram(-1));
$('#btn-next').addEventListener('click', () => navDiagram(1));

/* ── start ── */
(async () => {
  if (!(await getTeamUser())) return; // layout przekieruje
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(wrap); // łapie też moment odsłonięcia shell'a przez guard auth
  await loadList();
  // ?open=<id> — bezpośrednie wejście do edytora (np. z Reżyserki: „Otwórz diagram scenopisu")
  const open = new URLSearchParams(location.search).get('open');
  if (open && diagrams.some((d) => d.id === open)) { openEditor(open); return; }
  if (!diagrams.length) createDiagram('Nowy diagram'); // brak diagramów → od razu do edytora
  else renderGallery();
})();
