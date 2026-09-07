// Strefa / Prompter — scenariusz do czytania + pełnoekranowy teleprompter.
// Widok scenariusza: czarno na białym, per bit: timecode | CO MÓWISZ | CO NA EKRANIE.
// Teleprompter: pełny ekran na drugi laptop — bieżący bit ogromną czcionką,
// odliczanie czasu bitu (z wpm albo dur ręcznego), auto-przejścia, sterowanie dotykiem i klawiszami.
import { getClient, getTeamUser, startRealtime } from './supabase.js';
import { $, esc, toast } from './strefa-ui.js';
import { czasBitu, czasSceny, startyScen, czasWariantu, mmss, normalizujFilm } from './rezyserka-model.js';

const sb = getClient();

let film = null;      // { id, tytul, dane (znormalizowane) }
let ktory = 'long';
let bity = [];        // płaska oś czasu: [{tekst, rezyseria, dur, start, scena, sekcja, ekran, nakladki, pierwszyWScenie}]
let total = 0;
let routeVersion = 0, refreshVersion = 0, refreshPending = false;

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
        id: b.id, scenaId: s.id, nr: out.length + 1,
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
let renderedIdx = -1;

function startPrompter() {
  if (!bity.length) { toast('Brak tekstu', 'Dodaj sceny do tego wariantu filmu.', 'err'); return; }
  clearInterval(timer); timer = null;
  idx = 0; elapsedBit = 0; running = false; countdown = 0; renderedIdx = -1;
  $('#pr-scenariusz').hidden = true;
  const tp = $('#pr-teleprompter');
  tp.hidden = false;
  document.body.classList.add('pr-full');
  window.getSelection?.()?.removeAllRanges();
  // Przyciski pozostają w DOM podczas odliczania — dotyk i fokus nie giną na ticku.
  tp.innerHTML = `
    <header class="tp-top">
      <div class="tp-heading"><span class="tp-label">Teleprompter</span><span class="tp-sekcja"></span></div>
      <span class="tp-zegar"><span id="tp-elapsed"></span> <em id="tp-total">/ ${mmss(total)}</em></span>
      <button type="button" class="tp-btn tp-exit" data-tp="exit">Wyjdź <span aria-hidden="true">×</span></button>
    </header>
    <div class="tp-pasek"><i></i></div>
    <div class="tp-stage">
      <main class="tp-main"><p class="tp-tekst"></p><p class="tp-nast"></p></main>
      <div class="tp-stan">
        <div class="tp-ready">
          <p class="tp-state-title" role="status" aria-live="polite"></p>
          <p class="tp-state-hint"></p>
          <button type="button" class="tp-btn tp-btn--primary tp-start" data-tp="toggle"></button>
        </div>
      </div>
    </div>
    <footer class="tp-dol">
      <div class="tp-meta"><span id="tp-position"></span><span>Pozostało w tym fragmencie: <b class="tp-bitclock"></b> s</span></div>
      <nav class="tp-controls" aria-label="Sterowanie teleprompterem">
        <button type="button" class="tp-btn" data-tp="prev">← Wstecz</button>
        <button type="button" class="tp-btn tp-btn--primary" data-tp="toggle" id="tp-toggle"></button>
        <button type="button" class="tp-btn" data-tp="next">Dalej →</button>
        <button type="button" class="tp-btn tp-reset" data-tp="reset">↺ Od początku</button>
      </nav>
      <details class="tp-notes"><summary>Wskazówki do ujęcia</summary><div class="tp-notes-body"><span class="tp-ekran"></span><span class="tp-rez"></span></div></details>
      <span class="tp-help">Klawiatura: spacja — start/pauza · ← → — fragmenty · R — od początku · Esc — wyjście</span>
    </footer>`;
  renderTp();
  tp.querySelector('.tp-start').focus();
  tp.requestFullscreen?.().catch(() => {}); // Na iPadzie bez API działa widok wypełniający okno.
}

function stopPrompter() {
  clearInterval(timer); timer = null; running = false; countdown = 0;
  document.body.classList.remove('pr-full');
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  $('#pr-teleprompter').hidden = true;
  $('#pr-scenariusz').hidden = false;
  $('#pr-start')?.focus();
}

function tick() {
  if (countdown > 0) {
    countdown = Math.max(0, countdown - 0.1);
    renderTp();
    return;
  }
  if (!running) return;
  elapsedBit += 0.1;
  const b = bity[idx];
  if (elapsedBit >= b.dur) {
    if (idx < bity.length - 1) { idx += 1; elapsedBit = 0; }
    else { elapsedBit = b.dur; running = false; clearInterval(timer); timer = null; }
  }
  renderTp();
}

const skonczone = () => idx === bity.length - 1 && elapsedBit >= bity[idx].dur;

function tpAction(action) {
  if ($('#pr-teleprompter').hidden) return;
  if (action === 'exit') { stopPrompter(); return; }
  if (action === 'toggle') {
    if (running || countdown) {
      running = false; countdown = 0; clearInterval(timer); timer = null;
    } else {
      if (skonczone()) { idx = 0; elapsedBit = 0; }
      countdown = 3; running = true;
      if (!timer) timer = setInterval(tick, 100);
    }
  } else if (action === 'reset') {
    clearInterval(timer); timer = null;
    idx = 0; elapsedBit = 0; running = false; countdown = 0;
  } else if (action === 'next' && !countdown && idx < bity.length - 1) {
    idx += 1; elapsedBit = 0;
  } else if (action === 'prev' && !countdown) {
    if (elapsedBit > 1) elapsedBit = 0;
    else if (idx > 0) { idx -= 1; elapsedBit = 0; }
  }
  renderTp();
}

function renderTp(preserveScroll = false) {
  const tp = $('#pr-teleprompter');
  const b = bity[idx];
  const nast = bity[idx + 1];
  const elapsedTotal = b.start + Math.min(elapsedBit, b.dur);
  const left = Math.max(0, Math.ceil(b.dur - elapsedBit));
  const done = skonczone();
  const initial = elapsedTotal === 0 && idx === 0;
  const overlay = countdown > 0 || !running;
  const label = countdown ? 'Anuluj odliczanie' : running ? 'Ⅱ Pauza' : done ? '↺ Jeszcze raz' : initial ? '▶ Start' : '▶ Wznów';
  if (renderedIdx !== idx) {
    tp.querySelector('.tp-sekcja').textContent = `${b.sekcja} · ${b.scena}`;
    tp.querySelector('.tp-tekst').textContent = b.tekst;
    tp.querySelector('.tp-nast').textContent = nast ? `Następnie: ${nast.tekst}` : 'Ostatni fragment — trzymaj kadr';
    tp.querySelector('.tp-ekran').innerHTML = ekranHtml(b);
    tp.querySelector('.tp-rez').textContent = b.rezyseria;
    if (!preserveScroll) tp.querySelector('.tp-main').scrollTop = 0;
    renderedIdx = idx;
  }
  $('#tp-elapsed').textContent = mmss(elapsedTotal);
  $('#tp-total').textContent = `/ ${mmss(total)}`;
  $('#tp-position').textContent = `Fragment ${idx + 1} z ${bity.length}`;
  tp.querySelector('.tp-bitclock').textContent = left;
  tp.querySelector('.tp-bitclock').classList.toggle('tp-bitclock--malo', left <= 3 && running);
  tp.querySelector('.tp-pasek i').style.width = `${Math.min(100, elapsedBit / b.dur * 100)}%`;
  tp.querySelector('.tp-main').classList.toggle('tp-main--dim', overlay);
  const state = tp.querySelector('.tp-stan');
  // Przenieś fokus przed ukryciem środkowego przycisku po odliczaniu.
  if (!overlay && state.contains(document.activeElement)) $('#tp-toggle').focus();
  state.hidden = !overlay;
  const title = countdown ? String(Math.ceil(countdown)) : done ? 'Ujęcie skończone' : initial ? 'Gotowy do nagrania?' : 'Pauza';
  const titleEl = tp.querySelector('.tp-state-title');
  if (titleEl.textContent !== title) titleEl.textContent = title;
  titleEl.classList.toggle('tp-countdown', countdown > 0);
  tp.querySelector('.tp-state-hint').textContent = countdown ? 'Za chwilę zaczynamy' : done ? 'Możesz wrócić do scenariusza lub nagrać kolejne podejście.' : 'Dotknij przycisku. Masz 3 sekundy, żeby spojrzeć w kamerę.';
  tp.querySelectorAll('[data-tp="toggle"]').forEach(btn => { if (btn.textContent !== label) btn.textContent = label; });
  tp.querySelector('[data-tp="prev"]').disabled = countdown > 0 || (idx === 0 && elapsedBit <= 1);
  tp.querySelector('[data-tp="next"]').disabled = countdown > 0 || idx === bity.length - 1;
}

function klawisz(e) {
  if ($('#pr-teleprompter').hidden) return;
  // Spacja/Enter na przycisku korzystają z natywnej aktywacji (bez podwójnego kliknięcia).
  if (e.target.closest('button, summary, input, textarea, select')) {
    if (e.key === ' ' || e.key === 'Enter') return;
  }
  const action = { ' ': 'toggle', ArrowRight: 'next', ArrowLeft: 'prev', r: 'reset', R: 'reset', Escape: 'exit' }[e.key];
  if (action) { e.preventDefault(); if (!e.repeat) tpAction(action); }
  else if (e.key === 'f' || e.key === 'F') $('#pr-teleprompter').requestFullscreen?.().catch(() => {});
}
window.addEventListener('keydown', klawisz);
// CSS obsługuje Safari/iPad; zdarzenia blokują też zaznaczanie i menu w innych przeglądarkach.
for (const event of ['selectstart', 'contextmenu']) {
  $('#pr-teleprompter').addEventListener(event, (e) => e.preventDefault());
}
$('#pr-teleprompter').addEventListener('click', (e) => {
  const button = e.target.closest('[data-tp]');
  if (button) { tpAction(button.dataset.tp); return; }
  if (e.target.closest('.tp-main') && running && !countdown) tpAction('next');
});
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && !$('#pr-teleprompter').hidden) stopPrompter();
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

/* ── zmiany z Reżyserki, także podczas pełnoekranowego czytania ── */
function aktualizujFilm(row) {
  const dane = normalizujFilm(row.data);
  if (film?.id === row.id && film.tytul === row.title && JSON.stringify(film.dane) === JSON.stringify(dane)) return;
  const tpOpen = !$('#pr-teleprompter').hidden;
  const previous = bity;
  const currentBit = previous[idx];
  const wasDone = tpOpen && currentBit && skonczone();
  film = { id: row.id, tytul: row.title, dane };
  bity = zbudujOs(dane[ktory]);
  total = czasWariantu(dane[ktory]);
  if (tpOpen && bity.length) {
    const findBit = (bit) => bit ? bity.findIndex(b => b.id === bit.id && b.scenaId === bit.scenaId) : -1;
    let nextIdx = findBit(currentBit);
    const sameBit = nextIdx !== -1;
    if (!sameBit) {
      // Usunięty fragment: najpierw następny ocalały, potem poprzedni.
      const nearby = [...previous.slice(idx + 1), ...previous.slice(0, idx).reverse()];
      nextIdx = nearby.map(findBit).find(i => i !== -1) ?? Math.min(idx, bity.length - 1);
      clearInterval(timer); timer = null; running = false; countdown = 0; elapsedBit = 0;
    }
    idx = nextIdx;
    elapsedBit = wasDone && sameBit && idx === bity.length - 1 ? bity[idx].dur : Math.min(elapsedBit, bity[idx].dur);
    renderedIdx = -1; // Odśwież również tekst bieżącego i następnego fragmentu, nawet przy tym samym indeksie.
    renderTp(sameBit);
  } else if (tpOpen) {
    stopPrompter();
    toast('Scenariusz jest pusty', 'W Reżyserce usunięto wszystkie sceny tego wariantu.');
  }
  // Arkusz za pełnym ekranem też musi zawierać najnowszą wersję po wyjściu.
  renderScenariusz();
}

async function refreshFilm() {
  if (document.hidden) return;
  if (!film) { refreshPending = true; return; }
  const id = film.id;
  const routeAtStart = routeVersion;
  const request = ++refreshVersion;
  try {
    const { data, error } = await sb.from('filmy').select('id, title, data').eq('id', id).maybeSingle();
    if (routeAtStart !== routeVersion || request !== refreshVersion || film?.id !== id) return;
    if (error) return; // Utrata sieci nie przerywa nagrania; ponów po odzyskaniu połączenia.
    if (!data) {
      stopPrompter(); film = null;
      location.hash = '/';
      toast('Film został usunięty', 'Wybierz inny scenariusz.');
      return;
    }
    aktualizujFilm(data);
  } catch { /* Przejściowy błąd sieci — zachowaj ostatni odczytany tekst. */ }
}

/* ── routing ── */
async function route() {
  const version = ++routeVersion;
  stopPrompterCicho();
  const m = location.hash.match(/^#\/film\/([^/]+)\/(long|short)$/);
  $('#pr-lista').hidden = !!m;
  $('#pr-scenariusz').hidden = !m;
  film = null;
  if (!m) { renderLista(); return; }
  ktory = m[2];
  // Nie korzystaj z kopii poprzednio otwartego filmu — mogła się zmienić na drugim urządzeniu.
  const { data, error } = await sb.from('filmy').select('id, title, data').eq('id', m[1]).single();
  if (version !== routeVersion) return;
  if (error) { toast('Błąd', error.message, 'err'); return; }
  aktualizujFilm(data);
  if (refreshPending) { refreshPending = false; await refreshFilm(); }
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
  // Nasłuch uruchamiamy przed pierwszym odczytem, żeby nie zgubić zapisu w trakcie otwierania.
  await startRealtime(sb, 'strefa-prompter', ['filmy'], refreshFilm);
  window.addEventListener('online', refreshFilm);
  window.addEventListener('focus', refreshFilm);
  await route();
})().catch(pokazBlad);
