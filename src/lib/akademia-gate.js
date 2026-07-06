// Bramka treści Akademii: niezalogowani widzą ~połowę sekcji, reszta ukryta
// za kartą logowania. Sesja = ta sama co Strefa (wspólny klient Supabase),
// ale bez allowlisty zespołu — wystarczy dowolne zalogowane konto.
import { getClient, getSessionUser, waitForSession } from './supabase.js';

const HIDDEN_CLASS = 'agate-hidden';

function buildGateBox() {
  const box = document.createElement('section');
  box.className = 'sect agate';
  box.innerHTML = `
    <div class="container">
      <div class="agate__card rv">
        <p class="eyebrow">Akademia SZRON · pełna treść</p>
        <h2>Dalsza część szkolenia jest dla zalogowanych.</h2>
        <p>Konto jest darmowe — logujesz się i czytasz całość wszystkich szkoleń Akademii.</p>
        <div class="agate__actions">
          <button type="button" class="btn" data-agate-login>Zaloguj przez Google</button>
        </div>
        <p class="agate__status" data-agate-status role="status"></p>
      </div>
    </div>`;
  return box;
}

export async function initGate() {
  const sections = [...document.querySelectorAll('.page-body--interior section.sect')];
  if (sections.length < 2) return;

  // pokaż ~połowę (zaokrąglenie w górę), resztę schowaj
  const visibleCount = Math.ceil(sections.length / 2);
  const hidden = sections.slice(visibleCount);
  hidden.forEach((s) => s.classList.add(HIDDEN_CLASS));
  sections[visibleCount - 1]?.classList.add('agate-fade');

  const gateBox = buildGateBox();
  hidden[0].before(gateBox);

  const reveal = () => {
    hidden.forEach((s) => s.classList.remove(HIDDEN_CLASS));
    sections[visibleCount - 1]?.classList.remove('agate-fade');
    gateBox.remove();
  };

  gateBox.querySelector('[data-agate-login]').addEventListener('click', async () => {
    const status = gateBox.querySelector('[data-agate-status]');
    status.textContent = 'Przekierowuję do logowania…';
    const { error } = await getClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${window.location.pathname}?logged=1`,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) status.textContent = `Błąd logowania: ${error.message}`;
  });

  // powrót z OAuth → poczekaj na wymianę kodu PKCE; inaczej zwykły check sesji
  let user;
  if (new URLSearchParams(window.location.search).has('logged')) {
    user = await waitForSession(25);
    history.replaceState(null, '', window.location.pathname);
  } else {
    user = await getSessionUser();
  }
  if (user) reveal();
}
