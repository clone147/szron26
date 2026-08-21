// Aplikacja „X Growth" strefy zamkniętej SZRON — kolejka postów na X (Twitter).
// Drafty generuje skill Claude Code (/x-growth-szron) → tabele strefa.x_posts / strefa.x_targets.
// Tu: zatwierdzanie, edycja, odrzucanie, publikacja przez edge function post-to-x
// (wymaga secrets X_API_* w Supabase; bez nich fallback = kopiuj i wklej ręcznie).
import { getClient } from './supabase.js';
import { $, esc, toast, fmtDateTime, openModal, closeModal } from './strefa-ui.js';

const sb = getClient();

let posts = [];
let targets = [];
let tab = 'draft';
let publishing = null;

const KIND_LABEL = { post: 'Post', thread: 'Wątek', reply: 'Odpowiedź' };
const TABS = [
  ['draft', 'Do zatwierdzenia'],
  ['approved', 'Zatwierdzone'],
  ['posted', 'Opublikowane'],
  ['rejected', 'Odrzucone'],
  ['targets', 'Targety'],
];

/* ── dane ── */
async function load() {
  const [p, t] = await Promise.all([
    sb.from('x_posts').select('*').order('created_at', { ascending: false }),
    sb.from('x_targets').select('*').order('created_at', { ascending: false }),
  ]);
  if (p.error) toast('Błąd', p.error.message, 'error');
  posts = p.data || [];
  targets = t.data || [];
  render();
}

async function setStatus(id, status) {
  const patch = { status, updated_at: new Date().toISOString() };
  if (status === 'posted') patch.posted_at = new Date().toISOString();
  const { error } = await sb.from('x_posts').update(patch).eq('id', id);
  if (error) return toast('Błąd', error.message, 'error');
  const post = posts.find((x) => x.id === id);
  if (post) Object.assign(post, patch);
  render();
}

function postText(p) {
  return p.kind === 'thread' && Array.isArray(p.thread) ? p.thread.join('\n\n') : p.content;
}

async function copyPost(p) {
  await navigator.clipboard.writeText(postText(p));
  toast('Skopiowano', 'Treść w schowku — wklej na x.com');
}

async function publish(p) {
  publishing = p.id;
  render();
  try {
    const { data, error } = await sb.functions.invoke('post-to-x', { body: { post_id: p.id } });
    const payload = data || {};
    if (error || payload.error) {
      if (payload.error === 'X_KEYS_MISSING') {
        toast('Brak kluczy X API', 'Auto-publikacja nieaktywna — użyj „Kopiuj” i wklej na x.com. Klucze: Supabase → Edge Functions → Secrets.', 'error');
      } else {
        toast('Błąd publikacji', String(payload.message || payload.error || error?.message || ''), 'error');
      }
      return;
    }
    Object.assign(p, { status: 'posted', tweet_id: payload.tweet_id, posted_at: new Date().toISOString() });
    toast('Opublikowano na X', payload.url || '');
  } finally {
    publishing = null;
    render();
  }
}

function editPost(p) {
  const isThread = p.kind === 'thread';
  const val = isThread && Array.isArray(p.thread) ? p.thread.join('\n---\n') : p.content;
  const box = openModal(`
    <div class="strefa-modal__body">
      <h3 style="margin-top:0">Edycja: ${esc(KIND_LABEL[p.kind] || p.kind)}${isThread ? ' <small>(tweety rozdzielaj linią „---”)</small>' : ''}</h3>
      <textarea class="strefa-input" id="x-edit" rows="12" style="width:100%;font:inherit;line-height:1.5;resize:vertical">${esc(val)}</textarea>
      <p class="x-count" id="x-count"></p>
      <div class="strefa-actions-row">
        <button class="strefa-btn strefa-btn--ghost" data-no>Anuluj</button>
        <button class="strefa-btn strefa-btn--accent" data-save>Zapisz</button>
      </div>
    </div>`);
  const ta = $('#x-edit', box);
  const count = $('#x-count', box);
  const refreshCount = () => {
    if (isThread) {
      const parts = ta.value.split(/\n---\n/).map((s) => s.trim()).filter(Boolean);
      const over = parts.filter((s) => s.length > 280).length;
      count.textContent = `${parts.length} tweetów${over ? ` — ${over} przekracza 280 znaków!` : ''}`;
      count.classList.toggle('is-over', over > 0);
    } else {
      count.textContent = `${ta.value.length}/280 znaków`;
      count.classList.toggle('is-over', ta.value.length > 280);
    }
  };
  refreshCount();
  ta.addEventListener('input', refreshCount);
  box.querySelector('[data-no]').addEventListener('click', closeModal);
  box.querySelector('[data-save]').addEventListener('click', async () => {
    const thread = isThread ? ta.value.split(/\n---\n/).map((s) => s.trim()).filter(Boolean) : null;
    const content = isThread ? (thread[0] || '') : ta.value.trim();
    const { error } = await sb.from('x_posts').update({ content, thread, updated_at: new Date().toISOString() }).eq('id', p.id);
    if (error) return toast('Błąd', error.message, 'error');
    Object.assign(p, { content, thread });
    closeModal();
    toast('Zapisano', 'Treść zaktualizowana');
    render();
  });
}

async function setTargetStatus(id, status) {
  const { error } = await sb.from('x_targets').update({ status }).eq('id', id);
  if (error) return toast('Błąd', error.message, 'error');
  const t = targets.find((x) => x.id === id);
  if (t) t.status = status;
  render();
}

/* ── render ── */
function badge(text, cls = '') {
  return `<span class="x-badge ${cls}">${esc(text)}</span>`;
}

function postCard(p) {
  const body = p.kind === 'thread' && Array.isArray(p.thread)
    ? `<ol class="x-thread">${p.thread.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`
    : `<p class="x-content">${esc(p.content)}</p>`;
  const actions = [];
  if (p.status === 'draft') {
    actions.push(`<button class="strefa-btn strefa-btn--accent" data-act="approve">Zatwierdź</button>`);
    actions.push(`<button class="strefa-btn strefa-btn--ghost" data-act="edit">Edytuj</button>`);
    actions.push(`<button class="strefa-btn strefa-btn--ghost" data-act="reject">Odrzuć</button>`);
  } else if (p.status === 'approved') {
    actions.push(`<button class="strefa-btn strefa-btn--accent" data-act="publish"${publishing === p.id ? ' disabled' : ''}>${publishing === p.id ? 'Publikuję…' : 'Publikuj na X'}</button>`);
    actions.push(`<button class="strefa-btn strefa-btn--ghost" data-act="copy">Kopiuj</button>`);
    actions.push(`<button class="strefa-btn strefa-btn--ghost" data-act="edit">Edytuj</button>`);
    actions.push(`<button class="strefa-btn strefa-btn--ghost" data-act="undraft">Cofnij</button>`);
    actions.push(`<button class="strefa-btn strefa-btn--ghost" data-act="mark-posted" title="Bez wysyłki przez API — gdy wklejasz ręcznie">Oznacz jako opublikowany</button>`);
  } else if (p.status === 'posted') {
    if (p.tweet_id) actions.push(`<a class="strefa-btn strefa-btn--ghost" href="https://x.com/i/status/${esc(p.tweet_id)}" target="_blank" rel="noreferrer">Zobacz na X</a>`);
    else actions.push(`<button class="strefa-btn strefa-btn--ghost" data-act="copy">Kopiuj</button>`);
  } else if (p.status === 'rejected') {
    actions.push(`<button class="strefa-btn strefa-btn--ghost" data-act="undraft">Przywróć</button>`);
  }
  return `<article class="x-card" data-id="${p.id}">
    <div class="x-card__meta">
      ${badge(KIND_LABEL[p.kind] || p.kind, 'x-badge--kind')}
      ${p.hook_type ? badge(`huk: ${p.hook_type}`) : ''}
      ${p.target_segment ? badge(p.target_segment) : ''}
      <span class="x-card__date">${esc(fmtDateTime(p.created_at))}</span>
    </div>
    ${body}
    ${p.reply_to_url ? `<a class="x-reply-to" href="${esc(p.reply_to_url)}" target="_blank" rel="noreferrer">↳ odpowiedź do: ${esc(p.reply_to_url)}</a>` : ''}
    ${p.notes ? `<p class="x-notes">${esc(p.notes)}</p>` : ''}
    <div class="x-card__actions">${actions.join('')}</div>
  </article>`;
}

function targetRow(t) {
  const btn = (s, label) => `<button class="strefa-btn ${t.status === s ? 'strefa-btn--accent' : 'strefa-btn--ghost'}" data-tact="${s}">${label}</button>`;
  return `<article class="x-card x-card--target" data-tid="${t.id}">
    <div class="x-card__meta">
      <a class="x-handle" href="https://x.com/${esc(t.handle)}" target="_blank" rel="noreferrer">@${esc(t.handle)}</a>
      ${t.name ? `<span>${esc(t.name)}</span>` : ''}
      ${t.segment ? badge(t.segment) : ''}
      ${Number.isFinite(t.followers) ? `<span class="x-card__date">${Number(t.followers).toLocaleString('pl-PL')} obs.</span>` : ''}
    </div>
    ${t.why ? `<p class="x-notes">${esc(t.why)}</p>` : ''}
    <div class="x-card__actions">${btn('engaging', 'Angażuję')}${btn('converted', 'Klient')}${btn('skip', 'Pomiń')}</div>
  </article>`;
}

function render() {
  const tabsEl = $('#x-tabs');
  const listEl = $('#x-list');
  const counts = { targets: targets.length };
  for (const p of posts) counts[p.status] = (counts[p.status] || 0) + 1;
  tabsEl.innerHTML = TABS.map(([key, label]) =>
    `<button class="strefa-btn ${tab === key ? 'strefa-btn--accent' : 'strefa-btn--ghost'}" data-tab="${key}">${label} (${counts[key] || 0})</button>`
  ).join('');
  if (tab === 'targets') {
    listEl.innerHTML = targets.length
      ? targets.map(targetRow).join('')
      : `<div class="dgrid-empty"><p>Brak targetów. Skill <code>/x-growth-szron</code> dodaje tu konta z X pasujące do targetu Szronu.</p></div>`;
  } else {
    const items = posts.filter((p) => p.status === tab);
    listEl.innerHTML = items.length
      ? items.map(postCard).join('')
      : `<div class="dgrid-empty"><p>Brak wpisów. Uruchom <code>/x-growth-szron</code> w Claude Code, żeby wygenerować drafty.</p></div>`;
  }
}

/* ── zdarzenia ── */
document.addEventListener('click', (e) => {
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) { tab = tabBtn.dataset.tab; render(); return; }
  const actBtn = e.target.closest('[data-act]');
  if (actBtn) {
    const id = actBtn.closest('[data-id]')?.dataset.id;
    const p = posts.find((x) => x.id === id);
    if (!p) return;
    const act = actBtn.dataset.act;
    if (act === 'approve') setStatus(id, 'approved');
    else if (act === 'reject') setStatus(id, 'rejected');
    else if (act === 'undraft') setStatus(id, 'draft');
    else if (act === 'mark-posted') { setStatus(id, 'posted'); toast('Oznaczono jako opublikowany', 'Bez wysyłki przez API'); }
    else if (act === 'edit') editPost(p);
    else if (act === 'copy') copyPost(p);
    else if (act === 'publish') publish(p);
    return;
  }
  const tactBtn = e.target.closest('[data-tact]');
  if (tactBtn) {
    const id = tactBtn.closest('[data-tid]')?.dataset.tid;
    if (id) setTargetStatus(id, tactBtn.dataset.tact);
  }
});

load();
