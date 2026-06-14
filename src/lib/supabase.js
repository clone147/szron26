// Klient Supabase dla strefy zamkniętej SZRON.
// Ten sam projekt co szron.tech (sttluvcbucpxzbcsuigw), ale dane mieszkają w izolowanym
// schemacie `strefa` chronionym RLS — domyślny schema klienta to właśnie `strefa`.
// Logowanie: Google OAuth (PKCE) + e-mail/hasło, tak jak w starym szron.tech.
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://sttluvcbucpxzbcsuigw.supabase.co';
// Klucz anon jest publiczny z założenia (RLS pilnuje dostępu). Ten sam, którego używał szron.tech.
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0dGx1dmNidWNweHpiY3N1aWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI5MzgzMzEsImV4cCI6MjA1ODUxNDMzMX0.m0BzQUhQL4mDkkm_VPrZjoGsJplDCmRtW1UePb4PVzw';

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

// Logowanie e-mail/hasło
export async function signInPassword(email, password) {
  const { data, error } = await getClient().auth.signInWithPassword({
    email: String(email).trim(),
    password,
  });
  if (error) return { error: error.message };
  if (!isAllowed(data.user?.email)) {
    await getClient().auth.signOut();
    return { error: 'To konto nie ma dostępu do strefy SZRON.' };
  }
  return { error: null, user: data.user };
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
