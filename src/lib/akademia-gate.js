// Bramka treści Akademii: niezalogowani widzą ~połowę sekcji, reszta ukryta
// za kartą logowania e-mail/hasło. Sesja = ta sama co Strefa (wspólny klient
// Supabase), ale bez allowlisty zespołu — wystarczy dowolne konto z projektu.
import { signInPassword, getSessionUser, waitForSession } from './supabase.js';

const HIDDEN_CLASS = 'agate-hidden';

function buildGateBox() {
  const box = document.createElement('section');
  box.className = 'sect agate';
  box.innerHTML = `
    <div class="container">
      <div class="agate__card rv">
        <p class="eyebrow">Akademia SZRON · pełna treść</p>
        <h2>Dalsza część szkolenia jest dla zalogowanych.</h2>
        <p>Zaloguj się swoim kontem, a odblokujesz całość wszystkich szkoleń Akademii.</p>
        <form class="agate__form" data-agate-form>
          <input class="agate__input" type="email" name="email" placeholder="E-mail" autocomplete="username" required />
          <input class="agate__input" type="password" name="password" placeholder="Hasło" autocomplete="current-password" required />
          <button type="submit" class="btn" data-agate-login>Zaloguj</button>
        </form>
        <p class="agate__status" data-agate-status role="status"></p>
        <p class="agate__aux"><a href="/strefa/reset">Nie pamiętasz hasła? Ustaw nowe</a></p>
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

  gateBox.querySelector('[data-agate-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = gateBox.querySelector('[data-agate-status]');
    const btn = gateBox.querySelector('[data-agate-login]');
    btn.disabled = true;
    status.textContent = 'Logowanie…';
    const form = e.currentTarget;
    const { error } = await signInPassword(form.email.value, form.password.value);
    if (error) {
      status.textContent = `Błąd logowania: ${error}`;
      btn.disabled = false;
      return;
    }
    status.textContent = '';
    reveal();
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
