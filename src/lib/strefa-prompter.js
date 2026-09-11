// Strefa / Prompter — scenariusz do czytania + pełnoekranowy teleprompter.
// Widok scenariusza: czarno na białym, per bit: timecode | CO MÓWISZ | CO NA EKRANIE.
// Teleprompter: pełny ekran na drugi laptop — bieżący bit ogromną czcionką,
// odliczanie czasu bitu (z wpm albo dur ręcznego), auto-przejścia, sterowanie dotykiem i klawiszami.
// Kilka urządzeń z tym samym filmem synchronizuje się nawzajem (Realtime Broadcast, bez lidera).
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
let controlsIdle = 0;

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
    <div class="tp-pasek" aria-hidden="true"><i></i></div>
    <header class="tp-top">
      <span class="tp-zegar"><span id="tp-elapsed"></span> <em id="tp-total">/ ${mmss(total)}</em> <b class="tp-bitclock" title="Do końca fragmentu"></b></span>
      <span class="tp-peers" role="status"></span>
      <button type="button" class="tp-btn tp-exit" data-tp="exit" aria-label="Wyjdź z pełnego ekranu" title="Wyjdź (Esc)">×</button>
    </header>
    <div class="tp-stage">
      <main class="tp-main" tabindex="-1" aria-label="Tekst promptera"><p class="tp-tekst"></p><p class="tp-nast"></p></main>
      <div class="tp-stan"><p class="tp-state-title" role="status" aria-live="polite"></p></div>
    </div>
    <footer class="tp-dol">
      <span class="tp-status" role="status"></span>
      <nav class="tp-controls" aria-label="Sterowanie teleprompterem">
        <button type="button" class="tp-btn" data-tp="prev" aria-label="Poprzedni fragment" title="Poprzedni fragment (←)">←</button>
        <button type="button" class="tp-btn tp-btn--primary" data-tp="toggle" id="tp-toggle" aria-keyshortcuts="Space"></button>
        <button type="button" class="tp-btn" data-tp="next" aria-label="Następny fragment" title="Następny fragment (→)">→</button>
      </nav>
    </footer>`;
  controlsIdle = 0;
  renderTp();
  $('#tp-toggle').focus();
  syncConnect();
  tp.requestFullscreen?.().catch(() => {}); // Na iPadzie bez API działa widok wypełniający okno.
}

function stopPrompter() {
  clearInterval(timer); timer = null; running = false; countdown = 0;
  syncDisconnect();
  document.body.classList.remove('pr-full');
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  $('#pr-teleprompter').hidden = true;
  $('#pr-scenariusz').hidden = false;
  $('#pr-start')?.focus();
}

function tick() {
  controlsIdle += 0.1;
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
  controlsIdle = 0;
  if (action === 'exit') { stopPrompter(); return; }
  if (action === 'toggle') {
    if (running || countdown) {
      running = false; countdown = 0; clearInterval(timer); timer = null;
    } else {
      if (skonczone()) { idx = 0; elapsedBit = 0; }
      countdown = 3; running = true;
      $('#pr-teleprompter').querySelector('.tp-main').focus();
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
  syncSend();
}

function renderTp(preserveScroll = false) {
  const tp = $('#pr-teleprompter');
  const b = bity[idx];
  const nast = bity[idx + 1];
  const elapsedTotal = b.start + Math.min(elapsedBit, b.dur);
  const done = skonczone();
  const initial = elapsedTotal === 0 && idx === 0;
  const overlay = countdown > 0;
  const label = countdown ? 'Anuluj odliczanie' : running ? 'Pauza' : done ? 'Jeszcze raz' : initial ? 'Start' : 'Wznów';
  if (renderedIdx !== idx) {
    tp.querySelector('.tp-tekst').textContent = b.tekst;
    tp.querySelector('.tp-nast').textContent = nast ? nast.tekst : '';
    if (!preserveScroll) tp.querySelector('.tp-main').scrollTop = 0;
    renderedIdx = idx;
  }
  $('#tp-elapsed').textContent = mmss(elapsedTotal);
  $('#tp-total').textContent = `/ ${mmss(total)}`;
  const left = Math.max(0, Math.ceil(b.dur - elapsedBit));
  const bitclock = tp.querySelector('.tp-bitclock');
  bitclock.textContent = done ? '' : `${left} s`;
  bitclock.classList.toggle('tp-bitclock--malo', left <= 3 && running && !countdown);
  tp.querySelector('.tp-pasek i').style.width = `${Math.min(100, elapsedBit / b.dur * 100)}%`;
  const peersEl = tp.querySelector('.tp-peers');
  const peersText = peers > 1 ? `● ${peers} urządzenia` : '';
  if (peersEl.textContent !== peersText) peersEl.textContent = peersText;
  tp.classList.toggle('tp-reading', running && !countdown && controlsIdle >= 2.5);
  tp.querySelector('.tp-main').classList.toggle('tp-main--dim', overlay);
  tp.querySelector('.tp-stan').hidden = !overlay;
  const title = countdown ? String(Math.ceil(countdown)) : '';
  const titleEl = tp.querySelector('.tp-state-title');
  if (titleEl.textContent !== title) titleEl.textContent = title;
  const status = done ? 'Koniec ujęcia' : !running && !initial ? 'Pauza' : '';
  const statusEl = tp.querySelector('.tp-status');
  if (statusEl.textContent !== status) statusEl.textContent = status;
  const toggle = $('#tp-toggle');
  if (toggle.textContent !== label) toggle.textContent = label;
  toggle.title = `${label} (spacja)`;
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
function showControls() {
  controlsIdle = 0;
  $('#pr-teleprompter').classList.remove('tp-reading');
}
for (const event of ['pointermove', 'pointerdown', 'focusin']) {
  $('#pr-teleprompter').addEventListener(event, showControls);
}
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

/* ── synchronizacja między urządzeniami ── */
// Każdy otwarty teleprompter tego samego filmu i wariantu jest równorzędny — bez pilota i bez lidera.
// Akcja użytkownika (start, pauza, ←, →, reset) leci broadcastem do pozostałych, które przyjmują
// dokładnie ten sam stan (fragment po ID, czas, odliczanie). Automatyczne przejścia nie są rozgłaszane:
// zegary biegną lokalnie od wspólnego punktu, a każda ręczna akcja znów je wyrównuje.
// Nowe urządzenie po wejściu wysyła `hello` i dołącza do trwającego czytania. Wyjście nie jest synchronizowane.
let syncCh = null, syncSeq = 0, peers = 1;
const peerId = Math.random().toString(36).slice(2, 10);
const syncChannelName = (id, w) => `prompter-${id}-${w}`;
function syncConnect() {
  if (syncCh || !film || typeof sb.channel !== 'function') return;
  const ch = sb.channel(syncChannelName(film.id, ktory), { config: { broadcast: { self: false }, presence: { key: peerId } } });
  syncCh = ch;
  ch.on('broadcast', { event: 'state' }, ({ payload }) => syncApply(payload));
  ch.on('broadcast', { event: 'hello' }, ({ payload }) => { if (payload?.peer !== peerId) syncSend(); });
  ch.on('presence', { event: 'sync' }, () => {
    peers = Math.max(1, Object.keys(ch.presenceState?.() || {}).length);
    if (!$('#pr-teleprompter').hidden && syncCh === ch) renderTp(true);
  });
  ch.subscribe(async (status) => {
    if (status !== 'SUBSCRIBED' || syncCh !== ch) return;
    try { await ch.track?.({ peer: peerId }); } catch { /* prezencja jest tylko informacyjna */ }
    ch.send({ type: 'broadcast', event: 'hello', payload: { peer: peerId } }).catch(() => {});
  });
}
// Karta w tle ma dławione zegary; po powrocie prosi resztę o aktualny stan i wyrównuje się do niej.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && syncCh) syncCh.send({ type: 'broadcast', event: 'hello', payload: { peer: peerId } }).catch(() => {});
});
function syncDisconnect() {
  const ch = syncCh; syncCh = null; peers = 1;
  if (!ch) return;
  try { ch.untrack?.(); } catch { /* ignore */ }
  setTimeout(() => sb.removeChannel?.(ch), 300);
}
function syncSend() {
  if (!syncCh || $('#pr-teleprompter').hidden || !bity[idx]) return;
  const b = bity[idx];
  syncCh.send({ type: 'broadcast', event: 'state', payload: {
    peer: peerId, seq: ++syncSeq, bitId: b.id, scenaId: b.scenaId, idx, elapsedBit, running, countdown, at: Date.now(),
  } }).catch(() => {});
}
function syncApply(p) {
  if (!p || p.peer === peerId || $('#pr-teleprompter').hidden || !bity.length) return;
  let i = bity.findIndex((b) => b.id === p.bitId && b.scenaId === p.scenaId);
  if (i === -1) i = Math.max(0, Math.min(bity.length - 1, p.idx | 0)); // scenariusz w trakcie edycji — najbliższy fragment
  const el = Math.max(0, Math.min(bity[i].dur, +p.elapsedBit || 0));
  const run = !!p.running, cd = Math.max(0, +p.countdown || 0);
  // Ten sam stan (np. oba urządzenia zrobiły to samo) — nie przerysowuj i nie zeruj zegara.
  if (i === idx && run === running && Math.abs(cd - countdown) < 0.3 && Math.abs(el - elapsedBit) < 0.5) return;
  idx = i; elapsedBit = el; running = run; countdown = cd; controlsIdle = 0;
  if (running || countdown) { if (!timer) timer = setInterval(tick, 100); }
  else { clearInterval(timer); timer = null; }
  renderTp();
}

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
  syncDisconnect();
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
