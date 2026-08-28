// Strefa / Prompter — scenariusz do czytania + pełnoekranowy teleprompter.
// Widok scenariusza: czarno na białym, per bit: timecode | CO MÓWISZ | CO NA EKRANIE.
// Teleprompter: pełny ekran na drugi laptop — bieżący bit ogromną czcionką,
// odliczanie czasu bitu (z wpm albo dur ręcznego), auto-przejścia, sterowanie klawiszami.
import { getClient, getTeamUser } from './supabase.js';
import { $, esc, toast } from './strefa-ui.js';
import { czasBitu, czasSceny, startyScen, czasWariantu, mmss, normalizujFilm } from './rezyserka-model.js';

const sb = getClient();

let film = null;      // { id, tytul, dane (znormalizowane) }
let ktory = 'long';
let bity = [];        // płaska oś czasu: [{tekst, rezyseria, dur, start, scena, sekcja, ekran, nakladki, pierwszyWScenie}]
let total = 0;

/* ── budowa płaskiej osi czasu ── */
// Ekran dla bitu = obrazy sceny aktywne w oknie bitu (t względem sceny) + nakładki wchodzące w tym oknie.
function zbudujOs(w) {
  const starty = startyScen(w);
  const out = [];
  w.sceny.forEach((s, si) => {
    const sStart = starty[si];
    let t = 0;
    const dl = czasSceny(s, w.wpm);
    const bs = s.bity.length ? s.bity : [{ id: 'pusty' + si, tekst: '(bez narracji — demo bez słów)', dur: dl, reczny: true }];
    bs.forEach((b, bi) => {
      // ostatni bit sceny rozciąga się do końca sceny (demo bez słów po narracji)
      const nominal = czasBitu(b, w.wpm) || 2;
      const doKonca = dl - t;
      const dur = bi === bs.length - 1 ? Math.max(nominal, doKonca) : Math.min(nominal, doKonca);
      const a = t, z = t + dur;
      const ekran = s.obraz.filter((o) => (o.t ?? 0) < z && (o.t ?? 0) + (o.dur ?? 0) > a);
      const nak = (s.nakladki || []).filter((n) => (n.t ?? 0) >= a && (n.t ?? 0) < z);
      out.push({
        nr: out.length + 1,
        tekst: b.tekst, rezyseria: b.rezyseria || '', dur, start: sStart + a,
        scena: s.tytul, sekcja: (s.sekcja || s.rodzaj || '').toUpperCase(),
        scenaStart: sStart, scenaKoniec: sStart + dl,
        ekran, nakladki: nak, pierwszyWScenie: bi === 0,
      });
      t = z;
    });
  });
  return out;
}

const ekranHtml = (b) => {
  const o = b.ekran.map((o) => `<span class="pr-uj">[${esc(o.ujecie || 'ekran')}]</span> ${esc(o.opis || '')}`).join('<br>');
  const n = b.nakladki.map((x) => `<span class="pr-uj pr-uj--nak">[nakładka]</span> ${esc(x.tekst || x.opis || '')}`).join('<br>');
  return [o, n].filter(Boolean).join('<br>') || '<span class="pr-brak">— bez zmian —</span>';
};

/* ── widok: scenariusz (czarno na białym) ── */
function renderScenariusz() {
  const el = $('#pr-scenariusz');
  let html = `
    <div class="pr-pasek">
      <a class="strefa-btn strefa-btn--ghost strefa-btn--sm" href="#/">← filmy</a>
      <b class="pr-tytul">${esc(film.tytul)}</b>
      <div class="rez-przelacznik" role="tablist">
        <button data-w="long" aria-pressed="${ktory === 'long'}">Long</button>
        <button data-w="short" aria-pressed="${ktory === 'short'}">Short</button>
      </div>
      <span class="pr-suma">${mmss(total)}</span>
      <div class="rez-rozp"></div>
      <button class="strefa-btn strefa-btn--accent" id="pr-start">▶ Teleprompter (pełny ekran)</button>
    </div>
    <div class="pr-arkusz">
      <div class="pr-naglowek"><span>czas</span><span>mówisz</span><span>na ekranie widza</span></div>`;
  for (const b of bity) {
    if (b.pierwszyWScenie) html += `<div class="pr-scena"><span>${esc(b.sekcja)}</span> ${esc(b.scena)} <em>${mmss(b.scenaStart)}–${mmss(b.scenaKoniec)}</em></div>`;
    html += `
      <div class="pr-bit">
        <div class="pr-t"><b>${b.nr}</b>${mmss(b.start)}<small>${Math.round(b.dur)} s</small></div>
        <div class="pr-mow"><span class="pr-mow__label">mówisz</span>${esc(b.tekst)}${b.rezyseria ? `<div class="pr-rez">🎬 ${esc(b.rezyseria)}</div>` : ''}</div>
        <div class="pr-ekr">${ekranHtml(b)}</div>
      </div>`;
  }
  html += '</div>';
  el.innerHTML = html;
  el.querySelectorAll('[data-w]').forEach((btn) => btn.addEventListener('click', () => {
    location.hash = `/film/${film.id}/${btn.dataset.w}`;
  }));
  $('#pr-start').addEventListener('click', startPrompter);
}

/* ── widok: teleprompter ── */
let idx = 0, elapsedBit = 0, running = false, timer = null, countdown = 0;

function startPrompter() {
  idx = 0; elapsedBit = 0; running = false; countdown = 0;
  $('#pr-scenariusz').hidden = true;
  const tp = $('#pr-teleprompter');
  tp.hidden = false;
  document.body.classList.add('pr-full');
  tp.requestFullscreen?.().catch(() => {});
  renderTp();
}

function stopPrompter() {
  clearInterval(timer); timer = null; running = false;
  document.body.classList.remove('pr-full');
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  $('#pr-teleprompter').hidden = true;
  $('#pr-scenariusz').hidden = false;
}

function tick() {
  if (countdown > 0) {
    countdown -= 0.1;
    if (countdown <= 0) { countdown = 0; }
    renderTp();
    return;
  }
  if (!running) return;
  elapsedBit += 0.1;
  const b = bity[idx];
  if (elapsedBit >= b.dur) {
    if (idx < bity.length - 1) { idx += 1; elapsedBit = 0; }
    else { running = false; clearInterval(timer); timer = null; }
  }
  renderTp();
}

function startOdliczanie() {
  countdown = 3;
  running = true;
  if (!timer) timer = setInterval(tick, 100);
  renderTp();
}

function renderTp() {
  const tp = $('#pr-teleprompter');
  const b = bity[idx];
  const nast = bity[idx + 1];
  const elapsedTotal = b.start + Math.min(elapsedBit, b.dur);
  const zostaloBit = Math.max(0, Math.ceil(b.dur - elapsedBit));
  const skonczone = !running && !countdown && idx === bity.length - 1 && elapsedBit >= b.dur;
  const stan = countdown ? String(Math.ceil(countdown)) : (running ? '' : (elapsedTotal === 0 && idx === 0 ? 'SPACJA = START' : (skonczone ? 'KONIEC 🎬' : 'PAUZA — spacja wznawia')));
  tp.innerHTML = `
    <header class="tp-top">
      <span class="tp-sekcja">${esc(b.sekcja)} · ${esc(b.scena)}</span>
      <span class="tp-zegar">${mmss(elapsedTotal)} <em>/ ${mmss(total)}</em></span>
      <span class="tp-bitclock${zostaloBit <= 3 && running ? ' tp-bitclock--malo' : ''}">${zostaloBit}</span>
    </header>
    <div class="tp-pasek"><i style="width:${Math.min(100, (elapsedBit / b.dur) * 100)}%"></i></div>
    <main class="tp-main${countdown || stan ? ' tp-main--dim' : ''}">
      <p class="tp-tekst">${esc(b.tekst)}</p>
      ${nast ? `<p class="tp-nast">→ ${esc(nast.tekst)}</p>` : '<p class="tp-nast">→ koniec — trzymaj kadr</p>'}
    </main>
    ${stan ? `<div class="tp-stan"><span>${esc(stan)}</span></div>` : ''}
    <footer class="tp-dol">
      <span class="tp-ekran">🖥 ${ekranHtml(b).replace(/<br>/g, ' · ')}</span>
      ${b.rezyseria ? `<span class="tp-rez">🎬 ${esc(b.rezyseria)}</span>` : ''}
      <span class="tp-help">spacja start/pauza · ←→ bity · R od nowa · Esc wyjście</span>
    </footer>`;
}

function klawisz(e) {
  if ($('#pr-teleprompter').hidden) return;
  if (e.key === ' ') {
    e.preventDefault();
    if (countdown) return;
    if (!running && elapsedBit === 0 && idx === 0) startOdliczanie();
    else { running = !running; if (running && !timer) timer = setInterval(tick, 100); }
    renderTp();
  } else if (e.key === 'ArrowRight') { if (idx < bity.length - 1) { idx += 1; elapsedBit = 0; renderTp(); } }
  else if (e.key === 'ArrowLeft') { if (elapsedBit > 1) elapsedBit = 0; else if (idx > 0) { idx -= 1; elapsedBit = 0; } renderTp(); }
  else if (e.key === 'r' || e.key === 'R') { idx = 0; elapsedBit = 0; running = false; countdown = 0; renderTp(); }
  else if (e.key === 'Escape') stopPrompter();
  else if (e.key === 'f' || e.key === 'F') $('#pr-teleprompter').requestFullscreen?.().catch(() => {});
}
window.addEventListener('keydown', klawisz);
// tap/klik na tekście = następny bit (sterowanie z pilota do prezentacji też wysyła strzałki)
document.addEventListener('click', (e) => {
  if ($('#pr-teleprompter').hidden) return;
  if (e.target.closest('.tp-main') && running && idx < bity.length - 1) { idx += 1; elapsedBit = 0; renderTp(); }
});

/* ── lista filmów ── */
async function renderLista() {
  const { data, error } = await sb.from('filmy').select('id, title, data').order('updated_at', { ascending: false });
  if (error) { toast('Błąd', error.message, 'err'); return; }
  const aktywne = (data || []).filter((r) => r.data?.archiwum !== true);
  $('#pr-filmy').innerHTML = aktywne.map((r) => `
    <div class="pr-film">
      <b>${esc(r.title)}</b>
      <a class="strefa-btn strefa-btn--sm strefa-btn--accent" href="#/film/${r.id}/long">Long</a>
      <a class="strefa-btn strefa-btn--sm strefa-btn--ghost" href="#/film/${r.id}/short">Short</a>
    </div>`).join('') || '<p>Brak aktywnych filmów.</p>';
}

/* ── routing ── */
async function route() {
  stopPrompterCicho();
  const m = location.hash.match(/^#\/film\/([^/]+)\/(long|short)$/);
  $('#pr-lista').hidden = !!m;
  $('#pr-scenariusz').hidden = !m;
  if (!m) { renderLista(); return; }
  ktory = m[2];
  if (!film || film.id !== m[1]) {
    const { data, error } = await sb.from('filmy').select('id, title, data').eq('id', m[1]).single();
    if (error) { toast('Błąd', error.message, 'err'); return; }
    film = { id: data.id, tytul: data.title, dane: normalizujFilm(data.data) };
  }
  bity = zbudujOs(film.dane[ktory]);
  total = czasWariantu(film.dane[ktory]);
  renderScenariusz();
}
function stopPrompterCicho() {
  clearInterval(timer); timer = null; running = false; countdown = 0; idx = 0; elapsedBit = 0;
  document.body.classList.remove('pr-full');
  const tp = $('#pr-teleprompter'); if (tp) { tp.hidden = true; tp.innerHTML = ''; }
}
function pokazBlad(err) {
  const el = $('#pr-scenariusz') || document.body;
  el.hidden = false;
  el.innerHTML = `<div style="padding:2rem;color:#b91c1c;background:#fff;border-radius:12px"><b>Błąd promptera:</b><br><code>${esc(String(err?.stack || err))}</code></div>`;
}
window.addEventListener('error', (e) => pokazBlad(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => pokazBlad(e.reason));
window.addEventListener('hashchange', () => route().catch(pokazBlad));

(async () => {
  if (!(await getTeamUser())) return; // layout przekieruje na login
  await route();
})().catch(pokazBlad);
