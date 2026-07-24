// Klient Supabase dla strefy zamkniętej SZRON.
// Ten sam projekt co szron.tech (sttluvcbucpxzbcsuigw), ale dane mieszkają w izolowanym
// schemacie `strefa` chronionym RLS — domyślny schema klienta to właśnie `strefa`.
// Logowanie: Google OAuth (PKCE) + e-mail/hasło, tak jak w starym szron.tech.
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://sttluvcbucpxzbcsuigw.supabase.co';
// Klucz publishable (nowy system kluczy Supabase — projekt podpisuje access_tokeny ES256).
// Publiczny z założenia (RLS pilnuje dostępu). WYMAGANY dla Realtime: legacy anon (HS256) dawał
// :signature_error. Działa też dla REST/auth/edge functions.
export const SUPABASE_ANON_KEY = 'sb_publishable_X5xi2HxbmVnbxmCNd8us4Q_Dr6eXvo0';

// Allowlista zespołu SZRON — MUSI być zgodna z polityką RLS `strefa.is_team()`.
export const ALLOWLIST = [
  'eveo.tomek@gmail.com',
  'admin@szron.tech',
  'test-admin@szron.tech',
  'tw@szron.tech',
];

// UUID „workspace'u" SZRON w starych tabelach public.szron_* (zaszyty admin ze starej apki).
// Stąd import pobiera dane do migracji.
export const LEGACY_OWNER_ID = '85e7f3d4-2e8f-4b3a-9c5d-1a2b3c4d5e6f';

let _client = null;
export function getClient() {
  if (_client) return _client;
  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'szron-strefa-auth',
    },
    db: { schema: 'strefa' },
  });
  return _client;
}

export function isAllowed(email) {
  return !!email && ALLOWLIST.includes(String(email).toLowerCase());
}

export async function getSessionUser() {
  const { data } = await getClient().auth.getSession();
  return data?.session?.user ?? null;
}

// Poczekaj na ustanowienie sesji (zdarzenie onAuthStateChange lub polling co 200 ms) —
// po powrocie z OAuth/linku resetu wymiana kodu na sesję może jeszcze trwać. Zwraca usera lub null.
export async function waitForSession(maxTries = 20) {
  await new Promise((resolve) => {
    const { data } = getClient().auth.onAuthStateChange((_e, session) => { if (session) resolve(); });
    let tries = 0;
    const iv = setInterval(async () => {
      if (await getSessionUser() || ++tries > maxTries) { clearInterval(iv); data.subscription.unsubscribe(); resolve(); }
    }, 200);
  });
  return getSessionUser();
}

// Logowanie e-mail/hasło. Dowolne konto z projektu może się zalogować (klienci
// Akademii); `team` mówi, czy to konto zespołu z dostępem do Strefy (allowlista).
export async function signInPassword(email, password) {
  const { data, error } = await getClient().auth.signInWithPassword({
    email: String(email).trim(),
    password,
  });
  if (error) return { error: error.message };
  return { error: null, user: data.user, team: isAllowed(data.user?.email) };
}

// Logowanie Google (OAuth, PKCE) — powrót na /strefa/auth/callback
export async function signInGoogle(redirectPath = '/strefa') {
  const origin = window.location.origin;
  const callback = `${origin}/strefa/auth/callback?next=${encodeURIComponent(redirectPath)}`;
  const { data, error } = await getClient().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callback,
      queryParams: { access_type: 'offline', prompt: 'select_account' },
    },
  });
  if (error) return { error: error.message };
  if (data?.url) window.location.href = data.url;
  return { error: null };
}

export async function signOut() {
  await getClient().auth.signOut();
}

// Reset hasła — wyślij link e-mail. Gate'owane do allowlisty zespołu (to wspólny projekt
// Supabase, nie chcemy wysyłać resetów do kont innych aplikacji). Komunikat w UI jednolity.
export async function sendPasswordReset(email) {
  const e = String(email).trim().toLowerCase();
  if (!isAllowed(e)) return { error: null, gated: true };
  const redirectTo = `${window.location.origin}/strefa/auth/reset`;
  const { error } = await getClient().auth.resetPasswordForEmail(e, { redirectTo });
  return { error: error ? error.message : null };
}

// Ustaw nowe hasło (działa w sesji recovery utworzonej z linku e-mail).
export async function updatePassword(password) {
  const { error } = await getClient().auth.updateUser({ password });
  return { error: error ? error.message : null };
}

// Bucket na obrazki slajdów i tła (public read; zapis tylko dla zespołu — RLS storage.objects).
export const SLIDES_BUCKET = 'strefa-slajdy';

// Upload pliku do bucketa slajdów pod zadany prefix. Zwraca { url, path } albo { error }.
async function uploadToSlides(file, prefix) {
  const ext = (file.name?.split('.').pop() || 'png').toLowerCase();
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const sb = getClient();
  const { error } = await sb.storage.from(SLIDES_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || 'image/png' });
  if (error) return { error: error.message };
  const { data } = sb.storage.from(SLIDES_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

// Obrazek slajdu. `kind`: 'slides' (obrazek slajdu) lub 'bg' (tło decku).
export const uploadSlideImage = (file, trainingId, kind = 'slides') => uploadToSlides(file, `${trainingId}/${kind}`);

// Obrazek notatki programisty (ten sam bucket, prefix dev-notes/{devId}).
export const uploadNoteImage = (file, developerId) => uploadToSlides(file, `dev-notes/${developerId}`);

// Usuń obiekty ze storage (bucket strefa-slajdy) po ścieżkach. Zwraca { error }.
export async function removeStoragePaths(paths) {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return { error: null };
  const { error } = await getClient().storage.from(SLIDES_BUCKET).remove(list);
  return { error: error ? error.message : null };
}

// Strażnik strony strefy: jeśli brak sesji lub e-mail spoza allowlisty → redirect na login.
// Zwraca usera, gdy dostęp OK (albo nic nie zwraca i przekierowuje).
export async function requireAuth(loginPath = '/strefa/login') {
  const user = await getSessionUser();
  if (!user || !isAllowed(user.email)) {
    const next = window.location.pathname + window.location.search;
    window.location.replace(`${loginPath}?next=${encodeURIComponent(next)}`);
    return null;
  }
  return user;
}

// Jak requireAuth, ale bez przekierowania (redirect robi layout) — strażnik skryptów stron strefy.
export async function getTeamUser() {
  const user = await getSessionUser();
  return user && isAllowed(user.email) ? user : null;
}

/* ── realtime: wspólny wzorzec stron strefy ── */
// Strażnik cichego auto-odświeżania: pomiń, gdy zakładka w tle, otwarty jest dialog/drawer,
// albo user jest aktywny w kontenerze `rootId` (fokus w siatce).
export function pollBlocked(rootId) {
  if (document.hidden) return true;
  if (document.getElementById('modal-root')?.children.length) return true;
  const root = document.getElementById(rootId);
  return !!(root && root.contains(document.activeElement));
}

// Subskrypcja kanału postgres_changes (schema `strefa`) ze wspólnym debounce 400 ms
// (JEDEN timer na kanał — ostatni event w oknie wygrywa, także między handlerami per tabela),
// odświeżeniem przy SUBSCRIBED, bezpiecznikiem setInterval 60 s (zerwany socket)
// i syncem po powrocie do zakładki. `handlersByTable` nadpisuje handler dla wybranych tabel.
export async function startRealtime(sb, channelName, tables, refresh, handlersByTable = {}) {
  // Przekaż token sesji do Realtime (RLS) — pewność, że jest ustawiony przed subskrypcją.
  try { const { data } = await sb.auth.getSession(); if (data?.session) sb.realtime.setAuth(data.session.access_token); } catch (e) { /* ignore */ }
  let debounce;
  const ch = sb.channel(channelName);
  for (const table of tables) {
    const handler = handlersByTable[table] || refresh;
    ch.on('postgres_changes', { event: '*', schema: 'strefa', table }, () => { clearTimeout(debounce); debounce = setTimeout(handler, 400); });
  }
  ch.subscribe((status) => { if (status === 'SUBSCRIBED') refresh(); });
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}
