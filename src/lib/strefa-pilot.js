// Strefa / Pilot — sterowanie prezentacją slajdów z drugiego urządzenia.
// Broadcast Supabase Realtime na kanale `slajdy-pilot-<trainingId>` (patrz strefa-slajdy.js):
// pilot wysyła `cmd` {next|prev|go|exit|hello}, prezentacja odsyła `state` {idx, step, total}.
import { getClient, getTeamUser } from './supabase.js';
import { $, esc, toast } from './strefa-ui.js';

const sb = getClient();
const trainingId = new URLSearchParams(location.search).get('t');
let slides = [];          // { id, position, text, notes }
let state = { idx: -1, step: 0, total: 0 };
let ch = null, lastSeen = 0, hello;

function send(cmd, extra = {}) {
  if (!ch) return;
  ch.send({ type: 'broadcast', event: 'cmd', payload: { cmd, ...extra } }).catch(() => {});
  flash(cmd);
}
function flash(cmd) {
  const el = cmd === 'prev' ? $('#pilot-prev') : cmd === 'next' ? $('#pilot-next-btn') : null;
  if (!el) return;
  el.classList.remove('is-hit'); void el.offsetWidth; el.classList.add('is-hit');
}

function setStatus(kind, txt) {
  const st = $('#pilot-status'); st.dataset.kind = kind; $('#pilot-status-txt').textContent = txt;
}

function render() {
  const live = state.idx >= 0;
  const s = live ? slides[state.idx] : null;
  $('#pilot-count').textContent = live ? `${state.idx + 1} / ${state.total || slides.length}` : `— / ${slides.length}`;
  $('#pilot-text').textContent = live
    ? (s?.text || '(slajd bez tekstu)')
    : 'Uruchom prezentację na iPadzie (▶ Prezentacja) — pilot podłączy się sam.';
  const notes = $('#pilot-notes');
  notes.hidden = !(live && s?.notes); notes.textContent = s?.notes || '';
  const nx = $('#pilot-next'); const n = live ? slides[state.idx + 1] : null;
  nx.hidden = !live;
  nx.innerHTML = live ? `<span class="pilot__label">Następny</span>${n ? esc((n.text || '(bez tekstu)').split('\n')[0].slice(0, 120)) : '— koniec —'}` : '';
  $('#pilot-prev').disabled = !live || (state.idx === 0 && state.step === 0);
  $('#pilot-next-btn').disabled = !live;
  $('#pilot-strip').innerHTML = slides.map((_, i) =>
    `<button type="button" class="pilot__chip ${i === state.idx ? 'is-current' : ''}" data-go="${i}" aria-label="Slajd ${i + 1}">${i + 1}</button>`).join('');
  $('#pilot-strip').querySelector('.is-current')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
}

async function connect() {
  try { const { data } = await sb.auth.getSession(); if (data?.session) sb.realtime.setAuth(data.session.access_token); } catch (_) { /* ignore */ }
  ch = sb.channel(`slajdy-pilot-${trainingId}`, { config: { broadcast: { self: false } } });
  ch.on('broadcast', { event: 'state' }, ({ payload }) => {
    lastSeen = Date.now();
    state = { idx: payload.idx ?? -1, step: payload.step || 0, total: payload.total || slides.length };
    setStatus(state.idx >= 0 ? 'live' : 'idle', state.idx >= 0 ? 'Połączono z prezentacją' : 'Czekam na start prezentacji');
    render();
  });
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') { setStatus('idle', 'Czekam na start prezentacji'); send('hello'); }
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setStatus('err', 'Brak połączenia — odśwież');
  });
  // ping co 5 s: gdy prezentacja milczy > 12 s, pokaż że czekamy (np. zamknięto pełny ekran)
  hello = setInterval(() => {
    if (!ch) return;
    ch.send({ type: 'broadcast', event: 'cmd', payload: { cmd: 'hello' } }).catch(() => {});
    if (state.idx >= 0 && Date.now() - lastSeen > 12000) { state.idx = -1; setStatus('idle', 'Prezentacja nie odpowiada'); render(); }
  }, 5000);
}

function bind() {
  $('#pilot-prev').addEventListener('click', () => send('prev'));
  $('#pilot-next-btn').addEventListener('click', () => send('next'));
  $('#pilot-strip').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) send('go', { idx: +b.dataset.go }); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); send('next'); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); send('prev'); }
  });
  // nie zasypiaj podczas prezentacji
  navigator.wakeLock?.request('screen').catch(() => {});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { navigator.wakeLock?.request('screen').catch(() => {}); send('hello'); } });
}

async function init() {
  if (!(await getTeamUser())) return;
  if (!trainingId) { location.replace('/strefa/szkolenia'); return; }
  const { data: t } = await sb.from('trainings').select('id,name').eq('id', trainingId).single();
  if (!t) { toast('Nie znaleziono', 'Szkolenie nie istnieje lub brak dostępu', 'err'); return; }
  $('#pilot-title').textContent = t.name;
  const { data: s } = await sb.from('training_slides').select('id,position,text,notes').eq('training_id', trainingId).order('position').order('created_at');
  slides = s || [];
  bind(); render();
  connect();
}
init();
