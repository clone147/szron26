// Aplikacja „X + LinkedIn Growth" strefy zamkniętej SZRON — kolejka postów na X i LinkedIn.
// Drafty generuje skill Claude Code (/x-growth-szron [linkedin]) → tabele strefa.x_posts / strefa.x_targets
// (kolumna platform: x|linkedin). Tu: zatwierdzanie, edycja, odrzucanie, publikacja.
// X: posty/wątki przez edge function post-to-x (secrets X_API_*), reply ręcznie (API blokuje odpowiedzi pod cudze posty).
// LinkedIn: brak API dla konta osobistego — „Kopiuj" + „Otwórz LinkedIn" (prefill edytora) + „Oznacz jako opublikowany".
import { getClient } from './supabase.js';
import { $, esc, toast, fmtDateTime, openModal, closeModal } from './strefa-ui.js';

const sb = getClient();

let posts = [];
let targets = [];
let tab = 'draft';
let platform = 'all';
let publishing = null;

const KIND_LABEL = { post: 'Post', thread: 'Wątek', reply: 'Odpowiedź' };
const KIND_LABEL_LI = { post: 'Post', reply: 'Komentarz' };
const PLATFORMS = [['all', 'Wszystko'], ['x', 'X'], ['linkedin', 'LinkedIn']];
// Limity znaków: post/wątek = limit platformy; reply = celowo krótko (skill: X ≤180, LinkedIn ≤300).
const LIMITS = {
  x: { post: 280, thread: 280, reply: 180 },
  linkedin: { post: 3000, reply: 300 },
};
const LI_FOLD = 200; // ile znaków LinkedIn pokazuje przed „…zobacz więcej"
const plat = (p) => p.platform || 'x';
const kindLabel = (p) => (plat(p) === 'linkedin' ? KIND_LABEL_LI[p.kind] : KIND_LABEL[p.kind]) || p.kind;
const limitFor = (p) => LIMITS[plat(p)]?.[p.kind] ?? 280;
const profileUrl = (t) => (t.platform === 'linkedin' ? `https://www.linkedin.com/in/${t.handle}` : `https://x.com/${t.handle}`);
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
  toast('Skopiowano', `Treść w schowku — wklej na ${plat(p) === 'linkedin' ? 'linkedin.com' : 'x.com'}`);
}

// LinkedIn: otwiera edytor nowego posta z wklejoną treścią (shareActive + text).
function openLinkedIn(p) {
  const url = p.kind === 'reply' && p.reply_to_url
    ? p.reply_to_url
    : `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(postText(p))}`;
  window.open(url, '_blank', 'noreferrer');
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
  const limit = limitFor(p);
  const val = isThread && Array.isArray(p.thread) ? p.thread.join('\n---\n') : p.content;
  const box = openModal(`
    <div class="strefa-modal__body">
      <h3 style="margin-top:0">Edycja: ${esc(kindLabel(p))} <small>(${plat(p) === 'linkedin' ? 'LinkedIn' : 'X'})</small>${isThread ? ' <small>(tweety rozdzielaj linią „---”)</small>' : ''}</h3>
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
      const over = parts.filter((s) => s.length > limit).length;
      count.textContent = `${parts.length} tweetów${over ? ` — ${over} przekracza ${limit} znaków!` : ''}`;
      count.classList.toggle('is-over', over > 0);
    } else {
      const len = ta.value.length;
      let txt = `${len}/${limit} znaków`;
      if (p.kind === 'reply') txt += ' (krótko: jedna myśl, bez wstępu)';
      else if (plat(p) === 'linkedin') txt += ` · przed „zobacz więcej” widać ~${LI_FOLD}: „${ta.value.slice(0, LI_FOLD).replace(/\s+/g, ' ').trim().slice(-40)}”`;
      count.textContent = txt;
      count.classList.toggle('is-over', len > limit);
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
    if (plat(p) === 'linkedin') {
      // LinkedIn nie daje API dla konta osobistego — publikacja ręczna
      actions.push(`<button class="strefa-btn strefa-btn--accent" data-act="copy">Kopiuj treść</button>`);
      actions.push(`<button class="strefa-btn strefa-btn--ghost" data-act="open-li">${p.kind === 'reply' ? 'Otwórz post' : 'Otwórz LinkedIn'}</button>`);
    } else if (p.kind === 'reply') {
      // X API nie pozwala odpowiadać pod cudze posty — reply publikuje się ręcznie
      actions.push(`<button class="strefa-btn strefa-btn--accent" data-act="copy">Kopiuj treść</button>`);
        if (p.reply_to_url) actions.push(`<a class="strefa-btn strefa-btn--ghost" href="${esc(p.reply_to_url)}" target="_blank" rel="noreferrer">Otwórz tweet</a>`);
    } else {
      actions.push(`<button class="strefa-btn strefa-btn--accent" data-act="publish"${publishing === p.id ? ' disabled' : ''}>${publishing === p.id ? 'Publikuję…' : 'Publikuj na X'}</button>`);
      actions.push(`<button class="strefa-btn strefa-btn--ghost" data-act="copy">Kopiuj</button>`);
    }
    actions.push(`<button class="strefa-btn strefa-btn--ghost" data-act="edit">Edytuj</button>`);
    actions.push(`<button class="strefa-btn strefa-btn--ghost" data-act="undraft">Cofnij</button>`);
    actions.push(`<button class="strefa-btn strefa-btn--ghost" data-act="mark-posted" title="Bez wysyłki przez API — gdy wklejasz ręcznie">Oznacz jako opublikowany</button>`);
  } else if (p.status === 'posted') {
    if (plat(p) === 'linkedin' && p.reply_to_url) actions.push(`<a class="strefa-btn strefa-btn--ghost" href="${esc(p.reply_to_url)}" target="_blank" rel="noreferrer">Zobacz na LinkedIn</a>`);
    else if (p.tweet_id) actions.push(`<a class="strefa-btn strefa-btn--ghost" href="https://x.com/i/status/${esc(p.tweet_id)}" target="_blank" rel="noreferrer">Zobacz na X</a>`);
    else actions.push(`<button class="strefa-btn strefa-btn--ghost" data-act="copy">Kopiuj</button>`);
  } else if (p.status === 'rejected') {
    actions.push(`<button class="strefa-btn strefa-btn--ghost" data-act="undraft">Przywróć</button>`);
  }
  const len = postText(p).length;
  const limit = limitFor(p);
  const over = p.kind === 'thread'
    ? (p.thread || []).some((t) => t.length > limit)
    : len > limit;
  return `<article class="x-card x-card--${plat(p)}" data-id="${p.id}">
    <div class="x-card__meta">
      ${badge(plat(p) === 'linkedin' ? 'LinkedIn' : 'X', `x-badge--plat x-badge--plat-${plat(p)}`)}
      ${badge(kindLabel(p), 'x-badge--kind')}
      ${over ? badge(`za długie: ${len}/${limit}`, 'x-badge--over') : ''}
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
      ${badge(t.platform === 'linkedin' ? 'LinkedIn' : 'X', `x-badge--plat x-badge--plat-${t.platform || 'x'}`)}
      <a class="x-handle" href="${esc(profileUrl(t))}" target="_blank" rel="noreferrer">${t.platform === 'linkedin' ? '' : '@'}${esc(t.handle)}</a>
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
  const onPlat = (x) => platform === 'all' || (x.platform || 'x') === platform;
  const vPosts = posts.filter(onPlat);
  const vTargets = targets.filter(onPlat);
  const counts = { targets: vTargets.length };
  for (const p of vPosts) counts[p.status] = (counts[p.status] || 0) + 1;
  tabsEl.innerHTML = TABS.map(([key, label]) =>
    `<button class="strefa-btn ${tab === key ? 'strefa-btn--accent' : 'strefa-btn--ghost'}" data-tab="${key}">${label} (${counts[key] || 0})</button>`
  ).join('') + `<span class="x-plat-switch">${PLATFORMS.map(([key, label]) =>
    `<button class="strefa-btn ${platform === key ? 'strefa-btn--accent' : 'strefa-btn--ghost'}" data-plat="${key}">${label}</button>`
  ).join('')}</span>`;
  if (tab === 'targets') {
    listEl.innerHTML = vTargets.length
      ? vTargets.map(targetRow).join('')
      : `<div class="dgrid-empty"><p>Brak targetów. Skill <code>/x-growth-szron</code> (lub <code>/x-growth-szron linkedin</code>) dodaje tu konta pasujące do targetu Szronu.</p></div>`;
  } else {
    const items = vPosts.filter((p) => p.status === tab);
    listEl.innerHTML = items.length
      ? items.map(postCard).join('')
      : `<div class="dgrid-empty"><p>Brak wpisów. Uruchom <code>/x-growth-szron</code> w Claude Code, żeby wygenerować drafty.</p></div>`;
  }
}

/* ── zdarzenia ── */
document.addEventListener('click', (e) => {
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) { tab = tabBtn.dataset.tab; render(); return; }
  const platBtn = e.target.closest('[data-plat]');
  if (platBtn) { platform = platBtn.dataset.plat; render(); return; }
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
    else if (act === 'open-li') openLinkedIn(p);
    return;
  }
  const tactBtn = e.target.closest('[data-tact]');
  if (tactBtn) {
    const id = tactBtn.closest('[data-tid]')?.dataset.tid;
    if (id) setTargetStatus(id, tactBtn.dataset.tact);
  }
});

load();
