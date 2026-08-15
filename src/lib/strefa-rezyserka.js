// Strefa / Reżyserka — planowanie odcinków kanału YT (port lokalnej appki szron-rezyserka).
// Biblioteka filmów → widok filmu ze storyboardem (long/short), autozapis do strefa.filmy.
// Wynikiem filmu jest DIAGRAM SCENOPISU (nowy typ diagramu w /strefa/diagramy), a zmiany
// zrobione w edytorze diagramów wracają tu NA ŻYWO (realtime na strefa.diagrams).
import { getClient, getTeamUser, startRealtime } from './supabase.js';
import { $, esc, fmtDateTime, toast, confirmDialog, openModal, closeModal } from './strefa-ui.js';
import {
  STATUSY, RODZAJE_SCEN, UJECIA, RODZAJE_NAKLADEK, POZYCJE, uid,
  round1, czasBitu, czasNarracji, czasSceny, startyScen, czasWariantu, mmss,
  sekcja, brakujaceSekcje, uzupelnijKregoslup, nowyFilm, normalizujFilm, sprawdz,
  filmDoShapes, shapesDoScen, projekcjaScen, projekcjaShapesFilmu,
} from './rezyserka-model.js';

const sb = getClient();

/* ── stan ── */
let filmy = [];        // [{id,title,updated_at,data}] — lista do biblioteki
let current = null;    // { id, updated_at, film } — otwarty film (film.tytul = title wiersza)
let ktory = 'long';
let uwagi = [];
let dirty = false, saveTimer = null, lintTimer = null;
let pokazBrief = false, pokazUwagi = false;
let pendingDiagCheck = false; // realtime diagramu przyszedł w trakcie edycji — sprawdzimy po zapisie

const libEl = $('#rez-lib');
const filmEl = $('#rez-film');

const POLA_BRIEFU = [
  ['hook', 'Hook'], ['teza', 'Teza pod prąd'], ['kotwica', 'Kotwica'],
  ['icon', 'Wzorzec ICON'], ['cta', 'CTA'], ['aktywa', 'Aktywa (po ·)'],
];

/* ── drobne helpery ── */
const filmData = (f) => {
  const { id, tytul, ...reszta } = f;
  return reszta;
};
const scenaZ = (id) => current.film[ktory].sceny.find((s) => s.id === id);
const autosize = (el) => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };
const setZapis = (t) => { const el = $('#rez-zapis'); if (el) el.textContent = t; };
const modalOtwarty = () => !!$('#modal-root')?.children.length;
const nrTytul = (f) => `${f.nr !== undefined ? String(f.nr).padStart(2, '0') + '. ' : ''}${f.tytul}`;

/* ── zapis ── */
function scheduleSave() {
  if (!current) return;
  dirty = true;
  setZapis('zapisuję…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 600);
}
async function saveNow() {
  if (!current || !dirty) return;
  dirty = false;
  const stamp = new Date().toISOString();
  const { error } = await sb.from('filmy')
    .update({ title: current.film.tytul, data: filmData(current.film), updated_at: stamp })
    .eq('id', current.id);
  if (error) { dirty = true; setZapis('błąd zapisu'); toast('Błąd zapisu', error.message, 'err'); return; }
  current.updated_at = stamp;
  setZapis('zapisane');
  if (pendingDiagCheck) { pendingDiagCheck = false; checkLinkedDiagrams(); }
  autoDiagramSync(); // film → diagramy scenopisu, automatycznie po każdym zapisie
}
window.addEventListener('beforeunload', () => { if (dirty) saveNow(); });

// Auto-eksport: każdy zapis filmu odświeża powiązane diagramy scenopisu (bez ręcznego przycisku).
// Guard pętli: projekcjaShapesFilmu pomija eksport bez zmian, a link.stamp = updated_at diagramu
// sprawia, że checkLinkedDiagrams uzna nasz własny zapis za już zaimportowany.
let syncingDiag = false;
async function autoDiagramSync() {
  if (!current || syncingDiag) return;
  syncingDiag = true;
  try {
    const film = current.film;
    let metaZmiana = false;
    for (const w of ['long', 'short']) {
      const link = film.diagramy?.[w];
      if (!link?.id) continue;
      const { data: row } = await sb.from('diagrams').select('id, data').eq('id', link.id).maybeSingle();
      if (!current || current.film !== film) return; // user zmienił film w trakcie fetch
      if (!row) { delete film.diagramy[w]; metaZmiana = true; continue; }
      const stare = Array.isArray(row.data?.shapes) ? row.data.shapes : [];
      const shapes = filmDoShapes(film, w, stare);
      if (projekcjaShapesFilmu(shapes) === projekcjaShapesFilmu(stare)) continue;
      const stamp = new Date().toISOString();
      const { error } = await sb.from('diagrams')
        .update({ data: { ...row.data, shapes, film: { id: current.id, wariant: w } }, updated_at: stamp })
        .eq('id', link.id);
      if (error) continue;
      link.stamp = stamp;
      metaZmiana = true;
    }
    if (metaZmiana && current && !dirty) {
      const stamp = new Date().toISOString();
      const { error } = await sb.from('filmy').update({ data: filmData(current.film), updated_at: stamp }).eq('id', current.id);
      if (!error) current.updated_at = stamp;
    }
  } finally { syncingDiag = false; }
}

function lintuj() {
  if (!current) return;
  uwagi = sprawdz(current.film);
  const chip = $('#rez-chip');
  if (!chip) return;
  const uw = uwagi.filter((u) => u.wariant === ktory);
  chip.hidden = !uw.length;
  chip.textContent = `⚠ ${uw.length}`;
  chip.dataset.status = uw.some((u) => u.poziom === 'blad') ? 'zarys' : 'rozpisany';
  if (pokazUwagi) renderUwagi();
}

/* ── routing na hashu ── */
function route() {
  const m = location.hash.match(/^#\/film\/(.+)$/);
  if (m) openFilm(decodeURIComponent(m[1]));
  else showLib();
}
window.addEventListener('hashchange', route);

/* ── biblioteka ── */
async function loadList() {
  const { data, error } = await sb.from('filmy').select('id, title, updated_at, data').order('updated_at', { ascending: false });
  if (error) { toast('Błąd', error.message, 'err'); return; }
  filmy = data || [];
}

function miniHtml(sceny, wpm) {
  if (!sceny.length) return '<div class="rez-mini rez-mini--pusty"></div>';
  const total = sceny.reduce((s, x) => s + czasSceny(x, wpm), 0) || 1;
  return `<div class="rez-mini">${sceny.map((s) =>
    `<i style="flex:${czasSceny(s, wpm) / total};background:var(--sc-${esc(s.rodzaj)})"></i>`).join('')}</div>`;
}

/* ── drag&drop kolejności filmów (karta idzie za kursorem; sekcje long/short osobno) ── */
let dndSuppressClick = false; // stłum click po zakończonym dragu
let dndActive = false;        // realtime nie przerysowuje listy w trakcie przeciągania
function bindDnD() {
  const grid = $('#rez-grid');
  let st = null; // { karta, ph, dx, dy, x0, y0, started, id }
  // FLIP: karty płynnie dojeżdżają na nowe miejsca po przestawieniu placeholdera
  const flip = (fn) => {
    const karty = [...grid.querySelectorAll('.rez-karta:not(.rez-karta--ghost)')];
    const przed = new Map(karty.map((k) => [k, k.getBoundingClientRect()]));
    fn();
    for (const k of karty) {
      const a = przed.get(k), b = k.getBoundingClientRect();
      if (!a) continue;
      const dx = a.left - b.left, dy = a.top - b.top;
      if (dx || dy) k.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 180, easing: 'ease' });
    }
  };
  grid.addEventListener('pointerdown', (e) => {
    const karta = e.target.closest('.rez-karta');
    if (!karta || e.button !== 0 || e.target.closest('.rez-karta__del')) return;
    st = { karta, x0: e.clientX, y0: e.clientY, started: false, id: e.pointerId };
  });
  window.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    if (!st.started) {
      if (Math.hypot(e.clientX - st.x0, e.clientY - st.y0) < 6) return; // to jeszcze klik
      st.started = true; dndSuppressClick = true; dndActive = true;
      const r = st.karta.getBoundingClientRect();
      st.dx = e.clientX - r.left; st.dy = e.clientY - r.top;
      st.ph = document.createElement('div');
      st.ph.className = 'rez-karta rez-karta--placeholder';
      st.ph.style.height = `${r.height}px`;
      st.karta.before(st.ph);
      Object.assign(st.karta.style, { position: 'fixed', width: `${r.width}px`, left: `${r.left}px`, top: `${r.top}px`, zIndex: 100, margin: 0 });
      st.karta.classList.add('rez-karta--ghost');
      document.body.classList.add('rez-dnd');
    }
    st.karta.style.left = `${e.clientX - st.dx}px`;
    st.karta.style.top = `${e.clientY - st.dy}px`;
    st.karta.style.pointerEvents = 'none';
    const pod = document.elementFromPoint(e.clientX, e.clientY)?.closest('.rez-karta:not(.rez-karta--ghost):not(.rez-karta--placeholder)');
    st.karta.style.pointerEvents = '';
    if (pod && pod.dataset.sekcja === st.karta.dataset.sekcja) {
      const r = pod.getBoundingClientRect();
      const przed = e.clientY < r.top + r.height / 2 || (e.clientY < r.bottom && e.clientX < r.left + r.width / 2);
      if ((przed && pod.previousElementSibling !== st.ph) || (!przed && pod.nextElementSibling !== st.ph)) {
        flip(() => (przed ? pod.before(st.ph) : pod.after(st.ph)));
      }
    }
  });
  async function koniec(commit) {
    if (!st) return;
    const { karta, ph, started } = st;
    st = null;
    if (!started) return;
    dndActive = false;
    setTimeout(() => { dndSuppressClick = false; }, 0);
    document.body.classList.remove('rez-dnd');
    // płynne dokowanie do placeholdera, potem podmiana
    const a = karta.getBoundingClientRect(), b = ph.getBoundingClientRect();
    karta.classList.remove('rez-karta--ghost');
    karta.removeAttribute('style');
    ph.replaceWith(karta);
    karta.animate([{ transform: `translate(${a.left - b.left}px,${a.top - b.top}px)` }, { transform: 'none' }], { duration: 150, easing: 'ease' });
    if (commit) await zapiszKolejnosc();
    else renderLib(); // Escape/anulowanie → wróć do porządku z danych
  }
  window.addEventListener('pointerup', (e) => { if (st && e.pointerId === st.id) koniec(true); });
  window.addEventListener('pointercancel', () => koniec(false));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') koniec(false); });
}

// Kolejność w DOM → numeracja: longi od 1, shorty od 101. Zapis tylko zmienionych.
async function zapiszKolejnosc() {
  const grid = $('#rez-grid');
  const zmiany = [];
  for (const [sek, baza] of [['long', 1], ['short', 101]]) {
    [...grid.querySelectorAll(`.rez-karta[data-sekcja="${sek}"]`)].forEach((k, i) => {
      const r = filmy.find((x) => x.id === k.dataset.id);
      const nowyNr = baza + i;
      if (r && r.data?.nr !== nowyNr) { r.data = { ...r.data, nr: nowyNr }; zmiany.push(r); }
    });
  }
  if (!zmiany.length) return;
  const stamp = new Date().toISOString();
  const wyniki = await Promise.all(zmiany.map((r) => sb.from('filmy').update({ data: r.data, updated_at: stamp }).eq('id', r.id)));
  const zly = wyniki.find((w) => w.error);
  if (zly) { toast('Błąd zapisu kolejności', zly.error.message, 'err'); await loadList(); }
  else toast('Kolejność zapisana', `Przenumerowane filmy: ${zmiany.length}.`);
  renderLib();
}

function renderLib() {
  if (modalOtwarty() || dndActive) return; // nie wyrywaj listy spod okna ani spod przeciąganej karty
  const grid = $('#rez-grid');
  const karty = filmy
    .map((r) => ({ r, f: { id: r.id, tytul: r.title, ...normalizujFilm(r.data) } }))
    .sort((a, b) => (a.f.nr ?? 999) - (b.f.nr ?? 999) || (a.r.updated_at < b.r.updated_at ? 1 : -1));
  // short-only = brak scen w longu przy rozpisanym shorcie (np. samodzielne shorty 101+)
  const jestShortOnly = ({ f }) => !f.long.sceny.length && f.short.sceny.length > 0;
  const karta = ({ r, f }) => {
    const shortOnly = jestShortOnly({ f });
    const w = shortOnly ? f.short : f.long;
    const sec = czasWariantu(w);
    const b = f.brief || {};
    const opis = b.teza || b.hook || '';
    const tytul = shortOnly ? f.tytul.replace(/^Short:\s*/i, '') : f.tytul;
    return `
    <button class="rez-karta" type="button" data-id="${r.id}" data-sekcja="${shortOnly ? 'short' : 'long'}">
      <span class="rez-karta__del" role="button" title="Usuń film" aria-label="Usuń film"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></span>
      <div class="rez-karta__gora">
        ${f.nr !== undefined ? `<span class="rez-karta__nr">${String(f.nr).padStart(2, '0')}</span>` : ''}
        <h3 class="rez-karta__tytul">${esc(tytul)}</h3>
      </div>
      ${opis ? `<p class="rez-karta__opis"${b.hook && b.teza ? ` title="Hook: ${esc(b.hook)}"` : ''}>${esc(opis)}</p>` : '<p class="rez-karta__opis rez-karta__opis--brak">Brak briefu — otwórz film i wypełnij tezę.</p>'}
      ${b.kotwica ? `<p class="rez-karta__kotwica" title="Kotwica — moment zapowiedziany w hooku, spłacany na końcu">🪝 ${esc(b.kotwica)}</p>` : ''}
      ${miniHtml(w.sceny, w.wpm)}
      <div class="rez-karta__meta">
        <span class="rez-chip" data-status="${esc(f.status)}">${esc(f.status)}</span>
        <span>${shortOnly
          ? `short ${mmss(sec)} / ${mmss(f.short.targetSec)}`
          : `long ${mmss(sec)} / ${mmss(f.long.targetSec)}${f.short.sceny.length ? ` · short ${mmss(czasWariantu(f.short))}` : ''}`}
          · ${w.sceny.length} scen</span>
      </div>
    </button>`;
  };
  const longi = karty.filter((k) => !jestShortOnly(k));
  const shorty = karty.filter(jestShortOnly);
  const sekcja = (tytul, sub, items) => items.length
    ? `<h2 class="rez-karty__h">${tytul} <span class="rez-karty__hn">${items.length}</span> <span class="rez-karty__hsub">${sub}</span></h2>` + items.map(karta).join('')
    : '';
  grid.innerHTML = (sekcja('🎬 Longi', '8–10 min · 16:9', longi) + sekcja('⚡ Shorty', 'do 30 s · 9:16', shorty))
    || '<p class="rez-pusto">Jeszcze nic nie jest w produkcji. Załóż pierwszy film albo zaimportuj scenopis z Diagramów.</p>';

  for (const karta of grid.querySelectorAll('.rez-karta')) {
    karta.addEventListener('click', () => { if (dndSuppressClick) return; location.hash = `/film/${encodeURIComponent(karta.dataset.id)}`; });
    karta.querySelector('.rez-karta__del').addEventListener('click', async (e) => {
      e.stopPropagation();
      const r = filmy.find((x) => x.id === karta.dataset.id);
      if (!(await confirmDialog(`Usunąć film „${r?.title}"? Powiązane diagramy scenopisu zostaną w Diagramach.`))) return;
      const { error } = await sb.from('filmy').delete().eq('id', karta.dataset.id);
      if (error) { toast('Błąd', error.message, 'err'); return; }
      filmy = filmy.filter((x) => x.id !== karta.dataset.id);
      renderLib();
    });
  }
}

async function showLib() {
  if (dirty) await saveNow();
  current = null;
  filmEl.hidden = true;
  libEl.hidden = false;
  await loadList();
  renderLib();
}

// „12. Tytuł filmu" → numer + tytuł; sam tytuł też jest w porządku.
function zalozFilm() {
  const box = openModal(`
    <div class="strefa-modal__body">
      <h3 style="margin:0 0 var(--space-md)">Nowy film</h3>
      <p style="margin:0 0 var(--space-md);color:var(--color-text-inv-2);font-size:var(--text-s)">Możesz zacząć od numeru, np. „12. Zbudowałem urządzenie IoT za 30 zł”.</p>
      <input class="strefa-input" id="rez-nowy-tytul" type="text" placeholder="Tytuł (opcjonalnie z numerem)" />
      <div class="strefa-actions-row" style="margin-top:var(--space-lg)">
        <button class="strefa-btn strefa-btn--ghost" data-no>Anuluj</button>
        <button class="strefa-btn strefa-btn--accent" data-yes>Załóż</button>
      </div>
    </div>`);
  const input = box.querySelector('#rez-nowy-tytul');
  input.focus();
  const ok = async () => {
    const wpis = input.value.trim();
    if (!wpis) return;
    const m = wpis.match(/^\s*(\d{1,3})[.)]\s*(.+)$/);
    const film = nowyFilm();
    if (m) film.nr = Number(m[1]);
    const tytul = (m ? m[2] : wpis).trim();
    const { data, error } = await sb.from('filmy').insert({ title: tytul, data: filmData(film) }).select().single();
    if (error) { toast('Błąd', error.message, 'err'); return; }
    closeModal();
    location.hash = `/film/${encodeURIComponent(data.id)}`;
  };
  box.querySelector('[data-yes]').addEventListener('click', ok);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  box.querySelector('[data-no]').addEventListener('click', closeModal);
}

// Film z istniejącego diagramu: scenopis wchodzi 1:1, zwykły diagram — prostokąty stają się scenami.
async function filmZDiagramu() {
  const { data, error } = await sb.from('diagrams').select('id, title, updated_at, data').order('updated_at', { ascending: false });
  if (error) { toast('Błąd', error.message, 'err'); return; }
  const lista = (data || []).map((d) => {
    const shapes = Array.isArray(d.data?.shapes) ? d.data.shapes : [];
    return { d, rects: shapes.filter((s) => s.type === 'rect').length, scenopis: !!d.data?.film };
  }).filter((x) => x.rects > 0 || x.scenopis);
  const box = openModal(`
    <div class="strefa-modal__body">
      <h3 style="margin:0 0 var(--space-xs)">Film z diagramu</h3>
      <p style="margin:0 0 var(--space-md);color:var(--color-text-inv-2);font-size:var(--text-s)">
        Diagram scenopisu wchodzi w całości; w zwykłym diagramie każdy prostokąt staje się sceną.</p>
      <div class="rez-diaglista">${lista.map(({ d, rects, scenopis }) => `
        <button class="rez-diagpoz" type="button" data-id="${d.id}">
          <span class="rez-diagpoz__tytul">${esc(d.title)}</span>
          ${scenopis ? '<span class="rez-chip" data-status="rozpisany">scenopis</span>' : ''}
          <span class="rez-diagpoz__meta">${rects} prostokątów · ${esc(fmtDateTime(d.updated_at))}</span>
        </button>`).join('') || '<p class="rez-pusto">Brak diagramów z prostokątami.</p>'}
      </div>
      <div class="strefa-actions-row" style="margin-top:var(--space-lg)">
        <button class="strefa-btn strefa-btn--ghost" data-no>Anuluj</button>
      </div>
    </div>`);
  box.querySelector('[data-no]').addEventListener('click', closeModal);
  box.querySelectorAll('.rez-diagpoz').forEach((b) => b.addEventListener('click', async () => {
    const wpis = lista.find((x) => x.d.id === b.dataset.id);
    if (!wpis) return;
    b.disabled = true;
    await utworzFilmZDiagramu(wpis.d);
  }));
}

async function utworzFilmZDiagramu(d) {
  // diagram już powiązany z istniejącym filmem → po prostu go otwórz
  const meta = d.data?.film;
  if (meta?.id) {
    const { data: row } = await sb.from('filmy').select('id').eq('id', meta.id).maybeSingle();
    if (row) { closeModal(); location.hash = `/film/${encodeURIComponent(row.id)}`; return; }
  }
  const w = meta?.wariant === 'short' ? 'short' : 'long';
  const film = nowyFilm();
  film[w] = { ...film[w], sceny: shapesDoScen(Array.isArray(d.data?.shapes) ? d.data.shapes : [], film, w) };
  if (!film[w].sceny.length) { toast('Pusty diagram', 'Nie znalazłem prostokątów, które mogłyby zostać scenami.', 'err'); return; }
  const tytul = d.title.replace(/\s+—\s+scenopis.*$/i, '');
  const { data: row, error } = await sb.from('filmy').insert({ title: tytul, data: filmData(film) }).select().single();
  if (error) { toast('Błąd', error.message, 'err'); return; }
  // oznacz diagram jako scenopis tego filmu (od teraz działa żywy import)
  const stamp = new Date().toISOString();
  await sb.from('diagrams').update({ data: { ...d.data, film: { id: row.id, wariant: w } }, updated_at: stamp }).eq('id', d.id);
  film.diagramy = { ...film.diagramy, [w]: { id: d.id, stamp } };
  await sb.from('filmy').update({ data: filmData(film) }).eq('id', row.id);
  closeModal();
  toast('Film założony', `„${tytul}" — ${film[w].sceny.length} scen z diagramu.`);
  location.hash = `/film/${encodeURIComponent(row.id)}`;
}

/* ── diagram scenopisu: eksport (wynik pracy) i import na żywo ── */
async function doDiagramu() {
  if (!current) return;
  if (dirty) await saveNow();
  const film = current.film;
  const link = film.diagramy?.[ktory];
  const stamp = new Date().toISOString();
  let id = link?.id;
  let row = null;
  if (id) {
    const { data } = await sb.from('diagrams').select('id, data').eq('id', id).maybeSingle();
    row = data;
  }
  if (row) {
    const shapes = filmDoShapes(film, ktory, Array.isArray(row.data?.shapes) ? row.data.shapes : []);
    const { error } = await sb.from('diagrams')
      .update({ data: { ...row.data, shapes, film: { id: current.id, wariant: ktory } }, updated_at: stamp })
      .eq('id', id);
    if (error) { toast('Błąd', error.message, 'err'); return; }
  } else {
    const shapes = filmDoShapes(film, ktory, []);
    const { data, error } = await sb.from('diagrams')
      .insert({ title: `${film.tytul} — scenopis ${ktory}`, data: { shapes, film: { id: current.id, wariant: ktory } } })
      .select().single();
    if (error) { toast('Błąd', error.message, 'err'); return; }
    id = data.id;
  }
  film.diagramy = { ...film.diagramy, [ktory]: { id, stamp } };
  dirty = true;
  await saveNow();
  renderPasek();
  toast('Diagram scenopisu gotowy', 'Otwórz go w Diagramach — zmiany tam robione wracają tu na żywo.');
}

// Import na żywo: diagram powiązany z filmem zmienił się w /strefa/diagramy → wciągamy zmiany.
async function checkLinkedDiagrams() {
  if (!current) return;
  if (dirty) { pendingDiagCheck = true; return; }
  const dg = current.film.diagramy || {};
  let zmienione = false, metaZmiana = false;
  for (const w of ['long', 'short']) {
    const link = dg[w];
    if (!link?.id) continue;
    const { data: row, error } = await sb.from('diagrams').select('id, updated_at, data').eq('id', link.id).maybeSingle();
    if (error) continue;
    if (!row) { delete dg[w]; metaZmiana = true; continue; } // diagram usunięty → zerwij powiązanie
    if (row.updated_at === link.stamp) continue;             // nic nowego od ostatniego synca
    if (dirty) { pendingDiagCheck = true; return; }          // user zaczął pisać w trakcie fetch
    const nowe = shapesDoScen(Array.isArray(row.data?.shapes) ? row.data.shapes : [], current.film, w);
    if (projekcjaScen(nowe) !== projekcjaScen(current.film[w].sceny)) {
      current.film[w] = { ...current.film[w], sceny: nowe };
      zmienione = true;
      toast('Zmiany z diagramu', `Wariant ${w}: ${nowe.length} scen zaktualizowanych z Diagramów.`);
    }
    link.stamp = row.updated_at;
    metaZmiana = true;
  }
  if (zmienione) { lintuj(); renderFilm(); }
  if (zmienione || metaZmiana) { dirty = true; await saveNow(); }
}

/* ── otwarcie filmu ── */
function ustawCurrent(row) {
  current = { id: row.id, updated_at: row.updated_at, film: { id: row.id, tytul: row.title, ...normalizujFilm(row.data) } };
}
async function openFilm(id) {
  if (dirty) await saveNow();
  const { data: row, error } = await sb.from('filmy').select('*').eq('id', id).maybeSingle();
  if (error || !row) { toast('Nie ma takiego filmu', error?.message || '', 'err'); location.hash = ''; return; }
  ustawCurrent(row);
  ktory = 'long';
  pokazBrief = false; pokazUwagi = false;
  libEl.hidden = true;
  filmEl.hidden = false;
  lintujByProjekt();
  renderFilm();
  setZapis('');
  checkLinkedDiagrams(); // dogonienie zmian zrobionych w Diagramach, gdy reżyserka była zamknięta
}
function lintujByProjekt() { uwagi = current ? sprawdz(current.film) : []; }

// przeładowanie otwartego filmu po zmianie z zewnątrz (inna karta / agent) — tylko gdy nic nie piszemy
async function reloadCurrent() {
  if (!current || dirty) return;
  const { data: row } = await sb.from('filmy').select('*').eq('id', current.id).maybeSingle();
  if (!current || dirty) return;
  if (!row) { toast('Film usunięty', 'Ktoś skasował ten projekt.', 'err'); location.hash = ''; return; }
  if (row.updated_at === current.updated_at) return;
  ustawCurrent(row);
  lintujByProjekt();
  renderFilm();
}

/* ── render widoku filmu ── */
function renderFilm() {
  if (!current) return;
  renderPasek();
  renderBrief();
  renderUwagi();
  renderSb();
  lintuj();
}

function renderPasek() {
  const f = current.film;
  const w = f[ktory];
  const suma = czasWariantu(w);
  const zle = Math.abs(suma - w.targetSec) / w.targetSec > 0.15;
  const link = f.diagramy?.[ktory];
  $('#rez-pasek').innerHTML = `
    <button class="strefa-iconbtn" data-akcja="wroc" title="Wróć do biblioteki" aria-label="Wróć do biblioteki"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m7-7-7 7 7 7"/></svg></button>
    <span class="rez-tytul" title="${esc(f.tytul)}">${esc(nrTytul(f))}</span>
    <button class="strefa-iconbtn" data-akcja="rename" title="Zmień tytuł"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
    <select class="rez-ghost" data-pole="status" aria-label="Status produkcji">
      ${STATUSY.map((s) => `<option value="${s}"${s === f.status ? ' selected' : ''}>${s}</option>`).join('')}
    </select>
    <span class="rez-meta" id="rez-zapis"></span>
    <div class="rez-rozp"></div>
    <div class="rez-przelacznik" role="tablist">
      <button data-akcja="wariant" data-w="long" aria-pressed="${ktory === 'long'}">Long</button>
      <button data-akcja="wariant" data-w="short" aria-pressed="${ktory === 'short'}">Short</button>
    </div>
    <span class="rez-czas${zle ? ' rez-czas--zle' : ''}" id="rez-suma">${mmss(suma)} <span>/ ${mmss(w.targetSec)}</span></span>
    <button class="strefa-btn strefa-btn--sm strefa-btn--accent" data-akcja="do-diagramu" title="Wynik pracy: diagram scenopisu w /strefa/diagramy (aktualizuje istniejący)">${link ? '⇪ Odśwież diagram' : '⇪ Do diagramu'}</button>
    ${link ? `<a class="strefa-btn strefa-btn--sm strefa-btn--ghost" href="/strefa/diagramy?open=${esc(link.id)}" target="_blank" rel="noopener" title="Otwórz diagram scenopisu w nowej karcie — edycje tam wracają tu na żywo">Otwórz ↗</a>` : ''}`;
}

function renderBrief() {
  const f = current.film;
  const braki = brakujaceSekcje(f[ktory], ktory);
  const uw = uwagi.filter((u) => u.wariant === ktory);
  $('#rez-brief').innerHTML = `
    <div class="rez-band">
      <button class="rez-band__toggle" data-akcja="brief-toggle">${pokazBrief ? '▾' : '▸'} brief</button>
      ${f.brief.teza ? `<span class="rez-band__poz" data-band="teza" title="${esc(f.brief.teza)}"><b>teza</b>${esc(f.brief.teza)}</span>` : ''}
      ${f.brief.kotwica ? `<span class="rez-band__poz" data-band="kotwica" title="${esc(f.brief.kotwica)}"><b>kotwica</b>${esc(f.brief.kotwica)}</span>` : ''}
      <div class="rez-rozp"></div>
      ${braki.length ? `<button class="strefa-btn strefa-btn--ghost strefa-btn--sm" data-akcja="kreg" title="Brakuje: ${esc(braki.map((s) => s.tytul).join(', '))}">⌗ uzupełnij kręgosłup (${braki.length})</button>` : ''}
      <button class="rez-chip" id="rez-chip" data-akcja="uwagi-toggle" data-status="${uw.some((u) => u.poziom === 'blad') ? 'zarys' : 'rozpisany'}"${uw.length ? '' : ' hidden'} style="cursor:pointer">⚠ ${uw.length}</button>
    </div>
    <div class="rez-briefpanel"${pokazBrief ? '' : ' hidden'}>
      ${POLA_BRIEFU.map(([k, label]) => `
        <label class="rez-briefpoz"><b>${label}</b>
          <textarea class="rez-ghost rez-auto" rows="1" data-brief="${k}" placeholder="—">${esc(k === 'aktywa' ? (f.brief.aktywa || []).join(' · ') : f.brief[k] || '')}</textarea>
        </label>`).join('')}
    </div>`;
  $('#rez-brief').querySelectorAll('.rez-auto').forEach(autosize);
}

function renderUwagi() {
  const uw = uwagi.filter((u) => u.wariant === ktory);
  $('#rez-uwagi').innerHTML = pokazUwagi && uw.length ? `
    <div class="rez-uwagi">${uw.map((u) => `
      <div class="rez-uwaga" data-poziom="${u.poziom}"${u.scenaId ? ` data-skok="${u.scenaId}"` : ''}>${esc(u.tekst)}</div>`).join('')}
    </div>` : '';
}

function przegladHtml(w, starty) {
  return w.sceny.map((s, i) => `
    <button style="flex:${Math.max(czasSceny(s, w.wpm), 3)};background:var(--sc-${esc(s.rodzaj)})"
      title="${esc(`${i + 1}. ${s.tytul} · ${mmss(starty[i])}–${mmss(starty[i] + czasSceny(s, w.wpm))}`)}"
      data-skok="${s.id}">${i + 1}</button>`).join('') +
    `<span class="rez-przeglad__czas">${mmss(czasWariantu(w))}</span>`;
}

function renderSb() {
  const w = current.film[ktory];
  const root = $('#rez-sb');
  if (!w.sceny.length) {
    root.innerHTML = `
      <p class="rez-pusto">Brak scen. Wstaw kręgosłup odcinka albo zacznij od pustej sceny.</p>
      <button class="strefa-btn strefa-btn--accent rez-dodaj" data-akcja="kreg">⌗ wstaw kręgosłup</button>
      <button class="strefa-btn strefa-btn--ghost rez-dodaj" data-akcja="add-scena">+ pusta scena</button>`;
    return;
  }
  const starty = startyScen(w);
  root.innerHTML = `<div class="rez-przeglad" id="rez-przeglad">${przegladHtml(w, starty)}</div>` +
    w.sceny.map((s, i) => {
      const start = starty[i];
      const dur = czasSceny(s, w.wpm);
      const sek = sekcja(s.sekcja, ktory);
      const pusta = !s.bity.length && !s.obraz.length;
      let kursor = start;
      const bity = s.bity.map((b) => {
        const t = kursor;
        const d = czasBitu(b, w.wpm);
        kursor += d;
        return `
        <div class="rez-sk__bit" data-b="${b.id}">
          <time data-czas-b>${mmss(t, true)}</time>
          <div class="rez-sk__tresc">
            <textarea class="rez-ghost rez-auto" rows="1" data-pole="bit-tekst" placeholder="Co mówisz…">${esc(b.tekst)}</textarea>
            <input class="rez-ghost rez-sk__rez" data-pole="bit-rez" data-ma="${b.rezyseria ? 'tak' : 'nie'}" value="${esc(b.rezyseria ?? '')}" placeholder="wskazówka do nagrania (opcjonalnie)">
          </div>
          <span class="rez-sk__sek" data-sek-b>${round1(d)} s</span>
          <button class="rez-sk__x" data-akcja="del-bit" title="Usuń zdanie">✕</button>
        </div>`;
      }).join('');
      const obraz = s.obraz.map((o) => `
        <div class="rez-sk__wiersz rez-sk__wiersz--obraz" data-o="${o.id}">
          <select class="rez-ghost" data-pole="obraz-ujecie">${UJECIA.map((u) => `<option value="${u}"${u === o.ujecie ? ' selected' : ''}>${u}</option>`).join('')}</select>
          <input class="rez-ghost rez-sk__rosnij" data-pole="obraz-opis" value="${esc(o.opis)}" placeholder="co widać w kadrze">
          <button class="rez-sk__x" data-akcja="del-obraz" title="Usuń blok obrazu">✕</button>
        </div>`).join('');
      const nakladki = s.nakladki.map((n) => `
        <div class="rez-sk__wiersz rez-sk__wiersz--nak" data-n="${n.id}">
          <span class="rez-sk__znaczek">▸</span>
          <select class="rez-ghost" data-pole="nak-rodzaj">${RODZAJE_NAKLADEK.map((r) => `<option value="${r}"${r === n.rodzaj ? ' selected' : ''}>${r}</option>`).join('')}</select>
          <input class="rez-ghost rez-sk__rosnij" data-pole="nak-tekst" value="${esc(n.tekst)}" placeholder="treść nakładki">
          <select class="rez-ghost" data-pole="nak-pozycja" title="Pozycja w kadrze">${POZYCJE.map((p) => `<option value="${p}"${p === n.pozycja ? ' selected' : ''}>${p}</option>`).join('')}</select>
          <label title="Start — sekundy od początku sceny">od<input class="rez-ghost" type="number" min="0" step="0.5" data-pole="nak-t" value="${n.t}"></label>
          <label title="Jak długo wisi na ekranie">przez<input class="rez-ghost" type="number" min="0.5" step="0.5" data-pole="nak-dur" value="${n.dur}"></label>
          <button class="rez-sk__x" data-akcja="del-nak" title="Usuń nakładkę">✕</button>
        </div>`).join('');
      return `
      <article class="rez-sk" id="sk-${s.id}" data-s="${s.id}"${sek ? ' data-kreg="tak"' : ''} style="border-left-color:var(--sc-${esc(s.rodzaj)})">
        <header class="rez-sk__glowa">
          <span class="rez-sk__czas" data-czas-s>${mmss(start)}–${mmss(start + dur)}</span>
          ${sek ? `<span class="rez-sk__sekcja" title="${esc(`Sekcja kręgosłupa — ${sek.wskazowka}`)}">⌗</span>` : ''}
          <input class="rez-ghost rez-sk__tytul" data-pole="tytul" value="${esc(s.tytul)}">
          <select class="rez-ghost" data-pole="rodzaj">${RODZAJE_SCEN.map((r) => `<option value="${r}"${r === s.rodzaj ? ' selected' : ''}>${r}</option>`).join('')}</select>
          <label class="rez-sk__dur" title="Długość sceny w sekundach"><input class="rez-ghost" type="number" min="1" step="1" data-pole="dur" value="${s.dur}">s</label>
          <div class="rez-sk__akcje">
            <button data-akcja="sc-up" title="Wyżej">↑</button>
            <button data-akcja="sc-down" title="Niżej">↓</button>
            <button data-akcja="sc-copy" title="${ktory === 'long' ? 'Skopiuj do shorta' : 'Skopiuj do longa'}">⧉</button>
            <button data-akcja="sc-del" title="Usuń scenę">✕</button>
          </div>
        </header>
        ${bity}${obraz}${nakladki}
        <footer class="rez-sk__stopka">
          <button data-akcja="add-bit">+ zdanie</button>
          <button data-akcja="add-obraz">+ obraz</button>
          <button data-akcja="add-nak">+ nakładka</button>
          ${s.notatka ? `<span class="rez-sk__notka" title="${esc(s.notatka)}">${esc(s.notatka)}</span>`
            : sek && pusta ? `<span class="rez-sk__notka rez-sk__notka--podpowiedz" title="${esc(sek.wskazowka)}">${esc(sek.wskazowka)}</span>` : ''}
        </footer>
      </article>`;
    }).join('') +
    `<button class="strefa-btn strefa-btn--ghost rez-dodaj" data-akcja="add-scena">+ scena</button>`;
  root.querySelectorAll('.rez-auto').forEach(autosize);
}

// przeliczenie pochodnych po edycji w miejscu — bez przerysowania (fokus zostaje w polu)
function updateDerived() {
  if (!current) return;
  const w = current.film[ktory];
  const starty = startyScen(w);
  const suma = czasWariantu(w);
  const sumaEl = $('#rez-suma');
  if (sumaEl) {
    sumaEl.innerHTML = `${mmss(suma)} <span>/ ${mmss(w.targetSec)}</span>`;
    sumaEl.classList.toggle('rez-czas--zle', Math.abs(suma - w.targetSec) / w.targetSec > 0.15);
  }
  const przeglad = $('#rez-przeglad');
  if (przeglad) przeglad.innerHTML = przegladHtml(w, starty);
  for (const art of $('#rez-sb').querySelectorAll('[data-s]')) {
    const i = w.sceny.findIndex((s) => s.id === art.dataset.s);
    if (i < 0) continue;
    const s = w.sceny[i];
    const dur = czasSceny(s, w.wpm);
    const czasEl = art.querySelector('[data-czas-s]');
    if (czasEl) czasEl.textContent = `${mmss(starty[i])}–${mmss(starty[i] + dur)}`;
    let kursor = starty[i];
    for (const bitEl of art.querySelectorAll('[data-b]')) {
      const b = s.bity.find((x) => x.id === bitEl.dataset.b);
      if (!b) continue;
      const d = czasBitu(b, w.wpm);
      bitEl.querySelector('[data-czas-b]').textContent = mmss(kursor, true);
      bitEl.querySelector('[data-sek-b]').textContent = `${round1(d)} s`;
      kursor += d;
    }
  }
  // pasmo briefu (teza/kotwica) aktualizowane przy edycji panelu
  for (const [k] of [['teza'], ['kotwica']]) {
    const el = document.querySelector(`[data-band="${k}"]`);
    const v = current.film.brief[k] || '';
    if (el) { el.title = v; el.innerHTML = `<b>${k}</b>${esc(v)}`; }
  }
  clearTimeout(lintTimer);
  lintTimer = setTimeout(lintuj, 350);
}

/* ── edycja: delegacja zdarzeń na całym widoku filmu ── */
filmEl.addEventListener('input', (e) => {
  const t = e.target;
  if (!current) return;
  if (t.classList.contains('rez-auto')) autosize(t);
  const brief = t.dataset.brief;
  if (brief) {
    const v = t.value.trim();
    if (brief === 'aktywa') current.film.brief.aktywa = v ? v.split(/\s*[·,]\s*/).filter(Boolean) : undefined;
    else current.film.brief[brief] = v || undefined;
    scheduleSave();
    updateDerived();
    return;
  }
  const pole = t.dataset.pole;
  if (!pole) return;
  const s = scenaZ(t.closest('[data-s]')?.dataset.s ?? '');
  const bit = s?.bity.find((x) => x.id === t.closest('[data-b]')?.dataset.b);
  const obr = s?.obraz.find((x) => x.id === t.closest('[data-o]')?.dataset.o);
  const nak = s?.nakladki.find((x) => x.id === t.closest('[data-n]')?.dataset.n);
  switch (pole) {
    case 'tytul': if (s) s.tytul = t.value; break;
    case 'dur': if (s) s.dur = Math.max(1, Number(t.value) || 1); break;
    case 'bit-tekst': if (bit) bit.tekst = t.value; break;
    case 'bit-rez': if (bit) { bit.rezyseria = t.value || undefined; t.dataset.ma = t.value ? 'tak' : 'nie'; } break;
    case 'obraz-opis': if (obr) obr.opis = t.value; break;
    case 'nak-tekst': if (nak) nak.tekst = t.value; break;
    case 'nak-t': if (nak) nak.t = Math.max(0, Number(t.value) || 0); break;
    case 'nak-dur': if (nak) nak.dur = Math.max(0.5, Number(t.value) || 0.5); break;
    default: return;
  }
  scheduleSave();
  updateDerived();
});

filmEl.addEventListener('change', (e) => {
  const t = e.target;
  const pole = t.dataset.pole;
  if (!pole || !current) return;
  const s = scenaZ(t.closest('[data-s]')?.dataset.s ?? '');
  const obr = s?.obraz.find((x) => x.id === t.closest('[data-o]')?.dataset.o);
  const nak = s?.nakladki.find((x) => x.id === t.closest('[data-n]')?.dataset.n);
  switch (pole) {
    case 'status': current.film.status = t.value; break;
    case 'rodzaj':
      if (s) {
        s.rodzaj = t.value;
        t.closest('.rez-sk').style.borderLeftColor = `var(--sc-${t.value})`;
      }
      break;
    case 'obraz-ujecie': if (obr) obr.ujecie = t.value; break;
    case 'nak-rodzaj': if (nak) nak.rodzaj = t.value; break;
    case 'nak-pozycja': if (nak) nak.pozycja = t.value; break;
    default: return;
  }
  scheduleSave();
  updateDerived();
});

filmEl.addEventListener('click', async (e) => {
  const skok = e.target.closest('[data-skok]');
  if (skok) { document.getElementById(`sk-${skok.dataset.skok}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const btn = e.target.closest('[data-akcja]');
  if (!btn || !current) return;
  const akcja = btn.dataset.akcja;
  const w = current.film[ktory];
  const sId = btn.closest('[data-s]')?.dataset.s;
  const s = scenaZ(sId ?? '');
  const struktura = () => { scheduleSave(); lintujByProjekt(); renderFilm(); };
  switch (akcja) {
    case 'wroc': location.hash = ''; break;
    case 'rename': {
      const box = openModal(`
        <div class="strefa-modal__body">
          <h3 style="margin:0 0 var(--space-md)">Zmień tytuł</h3>
          <input class="strefa-input" id="rez-ren" type="text" value="${esc(current.film.tytul)}" />
          <div class="strefa-actions-row" style="margin-top:var(--space-lg)">
            <button class="strefa-btn strefa-btn--ghost" data-no>Anuluj</button>
            <button class="strefa-btn strefa-btn--accent" data-yes>Zapisz</button>
          </div>
        </div>`);
      const input = box.querySelector('#rez-ren');
      input.focus(); input.select();
      const ok = () => {
        const v = input.value.trim();
        closeModal();
        if (!v || v === current.film.tytul) return;
        current.film.tytul = v;
        scheduleSave();
        renderPasek();
      };
      box.querySelector('[data-yes]').addEventListener('click', ok);
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ok(); });
      box.querySelector('[data-no]').addEventListener('click', closeModal);
      break;
    }
    case 'wariant':
      if (dirty) await saveNow();
      ktory = btn.dataset.w;
      lintujByProjekt();
      renderFilm();
      break;
    case 'do-diagramu': btn.disabled = true; await doDiagramu(); break;
    case 'brief-toggle': pokazBrief = !pokazBrief; renderBrief(); break;
    case 'uwagi-toggle': pokazUwagi = !pokazUwagi; renderUwagi(); break;
    case 'kreg': current.film[ktory] = uzupelnijKregoslup(w, ktory); struktura(); break;
    case 'add-scena':
      w.sceny.push({ id: uid(), tytul: 'Nowa scena', rodzaj: 'inne', dur: 15, bity: [], obraz: [], nakladki: [] });
      struktura();
      break;
    case 'sc-up': case 'sc-down': {
      const i = w.sceny.findIndex((x) => x.id === sId);
      const j = i + (akcja === 'sc-up' ? -1 : 1);
      if (i < 0 || j < 0 || j >= w.sceny.length) break;
      [w.sceny[i], w.sceny[j]] = [w.sceny[j], w.sceny[i]];
      struktura();
      break;
    }
    case 'sc-copy': {
      // wycinek demo z longa = gotowy materiał na shorta (i odwrotnie)
      if (!s) break;
      const drugi = ktory === 'long' ? 'short' : 'long';
      const kopia = {
        ...structuredClone(s), id: uid(),
        bity: s.bity.map((b) => ({ ...b, id: uid() })),
        obraz: s.obraz.map((o) => ({ ...o, id: uid() })),
        nakladki: s.nakladki.map((n) => ({ ...n, id: uid() })),
      };
      delete kopia.sekcja;
      current.film[drugi].sceny.push(kopia);
      ktory = drugi;
      struktura();
      setTimeout(() => document.getElementById(`sk-${kopia.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      break;
    }
    case 'sc-del':
      if (!s) break;
      if (!(await confirmDialog(`Usunąć scenę „${s.tytul}"? Zniknie razem z narracją i nakładkami.`, 'Usuń'))) break;
      w.sceny = w.sceny.filter((x) => x.id !== sId);
      struktura();
      break;
    case 'add-bit': if (s) { s.bity.push({ id: uid(), tekst: '', dur: 3 }); struktura(); } break;
    case 'add-obraz': if (s) { s.obraz.push({ id: uid(), t: 0, dur: 5, ujecie: 'ekran', opis: '' }); struktura(); } break;
    case 'add-nak': if (s) { s.nakladki.push({ id: uid(), t: 0, dur: 3, rodzaj: 'karta', tekst: 'Nowa nakładka', pozycja: 'dol' }); struktura(); } break;
    case 'del-bit': if (s) { s.bity = s.bity.filter((x) => x.id !== btn.closest('[data-b]')?.dataset.b); struktura(); } break;
    case 'del-obraz': if (s) { s.obraz = s.obraz.filter((x) => x.id !== btn.closest('[data-o]')?.dataset.o); struktura(); } break;
    case 'del-nak': if (s) { s.nakladki = s.nakladki.filter((x) => x.id !== btn.closest('[data-n]')?.dataset.n); struktura(); } break;
  }
});

/* ── start ── */
(async () => {
  if (!(await getTeamUser())) return; // layout przekieruje na login
  $('#btn-nowy-film').addEventListener('click', zalozFilm);
  $('#btn-z-diagramu').addEventListener('click', filmZDiagramu);
  bindDnD();
  route();
  // realtime: filmy (lista + otwarty projekt) i diagramy (żywy import scenopisu)
  startRealtime(sb, 'strefa-rezyserka', ['filmy', 'diagrams'], () => {
    if (!libEl.hidden) loadList().then(renderLib);
    reloadCurrent();
    if (current) checkLinkedDiagrams();
  }, {
    filmy: () => { if (!libEl.hidden) loadList().then(renderLib); reloadCurrent(); },
    diagrams: () => { if (current) checkLinkedDiagrams(); },
  });
})();
