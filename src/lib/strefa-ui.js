// Wspólne helpery UI stron strefy zamkniętej (Szkolenia / Programiści / Slajdy):
// DOM, formatery, toasty, modale, bazowe ikony i model etapów programisty.

/* ── helpery DOM ── */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── formatery ── */
export const fmtDate = (d, empty = '') => d ? new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d)) : empty;
export const fmtDateTime = (d) => d ? new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : '';
export const todayStr = () => new Date().toISOString().slice(0, 10);
export const telHref = (s) => String(s || '').replace(/[^\d+]/g, ''); // tylko cyfry i + do linku tel:

/* ── toasty ── */
export function toast(title, body = '', kind = '', ms = 3800) {
  const wrap = $('#toasts');
  const t = document.createElement('div');
  t.className = 'strefa-toast' + (kind ? ` strefa-toast--${kind}` : '');
  t.innerHTML = `<strong>${esc(title)}</strong>${body ? `<span>${esc(body)}</span>` : ''}`;
  wrap.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, ms);
}

/* ── modale ── */
let onModalClose = null;
// Hook wywoływany przy KAŻDEJ ścieżce zamknięcia modala (przycisk, scrim, Escape).
export function setOnModalClose(fn) { onModalClose = fn; }
export function openModal(html, drawer = false) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="strefa-modal${drawer ? ' strefa-modal--drawer' : ''}"><div class="strefa-modal__scrim" data-close></div><div class="strefa-modal__box" role="dialog" aria-modal="true">${html}</div></div>`;
  const box = $('.strefa-modal__box', root);
  root.querySelector('[data-close]').addEventListener('click', closeModal);
  const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', onKey);
  root._onKey = onKey;
  return box;
}
export function closeModal() {
  const root = $('#modal-root');
  if (root._onKey) document.removeEventListener('keydown', root._onKey);
  root.innerHTML = '';
  if (onModalClose) onModalClose();
}
export function confirmDialog(message, okLabel = 'Usuń', danger = true) {
  return new Promise((resolve) => {
    const box = openModal(`
      <div class="strefa-modal__body">
        <p style="margin:0 0 var(--space-lg)">${esc(message)}</p>
        <div class="strefa-actions-row">
          <button class="strefa-btn strefa-btn--ghost" data-no>Anuluj</button>
          <button class="strefa-btn ${danger ? 'strefa-btn--danger' : 'strefa-btn--accent'}" data-yes>${esc(okLabel)}</button>
        </div>
      </div>`);
    box.querySelector('[data-no]').addEventListener('click', () => { closeModal(); resolve(false); });
    box.querySelector('[data-yes]').addEventListener('click', () => { closeModal(); resolve(true); });
    box.querySelector('[data-yes]').focus();
  });
}

/* ── bazowe ikony (moduły rozszerzają lokalnie: const ICO = { ...ICONS, … }) ── */
export const ICONS = {
  chev: '<svg class="strefa-tr__chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>',
};

/* ── model etapów programisty (jedno źródło prawdy dla Szkoleń i Programistów) ── */
export const STAGES = [
  { n: 1, name: 'Początkujący', hint: 'Pierwszy kontakt z AI — agent jako asystent, człowiek pyta.' },
  { n: 2, name: 'Kierujący', hint: 'Formułuje intencję (co, po co, kryteria); agent pisze, dev recenzuje.' },
  { n: 3, name: 'Operator', hint: 'Pętle /loop, MCP — agent pracuje obok, człowiek kontroluje.' },
  { n: 4, name: 'Dostrajający', hint: 'CLAUDE.md, własne MCP, dostrajanie per zadanie.' },
  { n: 5, name: 'Autonomiczny', hint: 'Deleguje całe moduły — agent planuje, koduje, testuje.' },
  { n: 6, name: 'Architekt AI', hint: 'Mentoruje innych, projektuje workflow zespołu i strategię agentów.' },
];
// 6 wyraźnie odróżniających się kolorów etapów (różne odcienie + jasność/chroma), czytelne na ciemnym tle
const STAGE_COLORS = ['oklch(68% 0.13 250)', 'oklch(75% 0.13 200)', 'oklch(77% 0.16 150)', 'oklch(83% 0.15 90)', 'oklch(72% 0.19 50)', 'oklch(66% 0.21 330)'];
export const stageColor = (n) => STAGE_COLORS[Math.max(1, Math.min(6, n || 1)) - 1];
export const stageName = (n) => (STAGES[(n || 1) - 1] || STAGES[0]).name;
export const SUBS = ['Claude', 'Gemini', 'ChatGPT', 'Github Copilot', 'Brak'];

/* ── drobny boilerplate init ── */
// Wyszukiwarka z debounce — onQuery dostaje przycięte zapytanie.
export function bindSearch(sel, onQuery, ms = 150) {
  let timer;
  $(sel).addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => onQuery(e.target.value.trim()), ms); });
}
// Przycisk importu → ukryty input[type=file]; reset value pozwala wybrać ten sam plik ponownie.
export function bindFileImport(btnSel, inputSel, onFile) {
  $(btnSel).addEventListener('click', () => $(inputSel).click());
  $(inputSel).addEventListener('change', (e) => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = ''; });
}
// Pobranie obiektu jako pliku JSON (Blob → link → click).
export function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
}
