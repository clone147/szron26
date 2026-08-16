// E-maile decydentów firm-produkt — Prospeo enrich-person (LinkedIn URL albo imię+domena).
// Plan FREE: 100 kredytów/mies. (naliczane tylko za trafienia), ostry rate limit → odstępy i retry.
// Zapis przez EF caio-agent (contact_email); digest pokazuje świeże adresy.
//
// Uruchomienie: CAIO_INGEST_SECRET=... PROSPEO_API_KEY=... node scripts/caio/enrich.mjs [--limit N]
const AGENT_URL = 'https://sttluvcbucpxzbcsuigw.supabase.co/functions/v1/caio-agent';
const SECRET = process.env.CAIO_INGEST_SECRET;
const PROSPEO = process.env.PROSPEO_API_KEY;
if (!SECRET) { console.error('Brak CAIO_INGEST_SECRET'); process.exit(1); }
if (!PROSPEO) { console.error('Brak PROSPEO_API_KEY'); process.exit(1); }
const limIx = process.argv.indexOf('--limit');
const LIMIT = limIx > -1 ? +process.argv[limIx + 1] : 8;
const RESERVE = 10; // zostaw kredyty na ręczne akcje
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function agent(body) {
  const res = await fetch(AGENT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-caio-secret': SECRET },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`caio-agent ${body.action}: HTTP ${res.status} ${out?.error ?? ''}`);
  return out;
}
async function prospeo(path, body) {
  const res = await fetch(`https://api.prospeo.io/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-KEY': PROSPEO },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  return res.json().catch(() => ({ error: true, error_code: `HTTP ${res.status}` }));
}
const domainOf = (www) => { try { return new URL(www).hostname.replace(/^www\./, ''); } catch { return null; } };

/* — fallback: zgadnij e-mail z wzorca domenowego znanych adresów tej firmy, zweryfikuj w Prospeo —
   Przykład: znamy p.zelazek@hertznt.pl → wzorzec „i.nazwisko" → z.trzaskowski@hertznt.pl. */
const deakcent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'l').toLowerCase();
function wykryjWzorzec(imie, email) {
  const [local, domena] = String(email).toLowerCase().split('@');
  const czesci = deakcent(imie.trim()).split(/\s+/);
  if (czesci.length < 2 || !domena) return null;
  const f = czesci[0], l = czesci.at(-1);
  const WZORCE = {
    'imie.nazwisko': `${f}.${l}`, 'imienazwisko': `${f}${l}`, 'i.nazwisko': `${f[0]}.${l}`,
    'inazwisko': `${f[0]}${l}`, 'nazwisko.imie': `${l}.${f}`, 'imie': f, 'nazwisko': l,
    'imie_nazwisko': `${f}_${l}`, 'imie.n': `${f}.${l[0]}`,
  };
  const nazwa = Object.keys(WZORCE).find((k) => WZORCE[k] === local);
  return nazwa ? { nazwa, domena } : null;
}
function zastosujWzorzec(nazwa, domena, imie) {
  const czesci = deakcent(imie.trim()).split(/\s+/);
  if (czesci.length < 2) return null;
  const f = czesci[0], l = czesci.at(-1);
  const local = {
    'imie.nazwisko': `${f}.${l}`, 'imienazwisko': `${f}${l}`, 'i.nazwisko': `${f[0]}.${l}`,
    'inazwisko': `${f[0]}${l}`, 'nazwisko.imie': `${l}.${f}`, 'imie': f, 'nazwisko': l,
    'imie_nazwisko': `${f}_${l}`, 'imie.n': `${f}.${l[0]}`,
  }[nazwa];
  return local ? `${local}@${domena}` : null;
}
// Gdy nie znamy żadnego adresu w domenie — domain-search (1 kredyt/firmę, cache per run)
// daje przykładowe adresy osobowe, z których czytamy wzorzec.
const dsCache = new Map();
async function domainKnown(domena) {
  if (!domena) return [];
  if (dsCache.has(domena)) return dsCache.get(domena);
  const out = await prospeo('domain-search', { company: domena, limit: 20 });
  const pary = out.error ? [] : (out.response?.email_list ?? [])
    .filter((e) => e.email && e.first_name && e.last_name)
    .map((e) => ({ imie: `${e.first_name} ${e.last_name}`, email: e.email }));
  dsCache.set(domena, pary);
  return pary;
}
async function guessEmail(k, znane) {
  if (!znane?.length) znane = await domainKnown(domainOf(k.www));
  for (const kn of znane ?? []) {
    const w = wykryjWzorzec(kn.imie, kn.email);
    if (!w) continue;
    const kandydat = zastosujWzorzec(w.nazwa, w.domena, k.imie);
    if (!kandydat) continue;
    const out = await prospeo('email-verifier', { email: kandydat });
    const status = out?.response?.email_status ?? out?.email_status;
    if (!out.error && ['VALID', 'DELIVERABLE'].includes(String(status).toUpperCase())) {
      return { email: kandydat, status: `wzorzec ${w.nazwa}, ${status}` };
    }
  }
  return null;
}

async function findEmail(k) {
  const [first, ...rest] = k.imie.trim().split(/\s+/);
  const data = k.linkedin_url
    ? { linkedin_url: k.linkedin_url }
    : { first_name: first, last_name: rest.at(-1), company_website: domainOf(k.www) };
  if (!k.linkedin_url && !data.company_website) throw new Error('brak domeny');
  for (let attempt = 1; attempt <= 3; attempt++) {
    const out = await prospeo('enrich-person', { only_verified_email: false, data });
    if (!out.error) {
      const em = out.person?.email ?? out.response?.email ?? null;
      return em?.email ? { email: em.email, status: em.status ?? '?' } : null;
    }
    if (out.error_code === 'NO_MATCH') return null;
    if (String(out.error_code).toLowerCase().includes('rate')) { await sleep(20000 * attempt); continue; }
    throw new Error(out.error_code ?? 'Prospeo error');
  }
  throw new Error('rate limit (3 próby)');
}

// saldo — nie schodzimy poniżej rezerwy
const acc = await fetch('https://api.prospeo.io/account-information', { headers: { 'X-KEY': PROSPEO }, signal: AbortSignal.timeout(15000) }).then((r) => r.json()).catch(() => null);
let credits = acc?.response?.remaining_credits ?? null;
console.log(`Prospeo: plan ${acc?.response?.current_plan ?? '?'}, kredyty ${credits ?? '?'}`);

const { contacts, pending_total, known } = await agent({ action: 'contacts_pending', limit: LIMIT });
console.log(`Do wzbogacenia: ${contacts.length} (w kolejce łącznie: ${pending_total})`);
let found = 0, misses = 0; const fails = [];
for (const k of contacts) {
  if (typeof credits === 'number' && credits <= RESERVE) { console.log(`Stop: kredyty przy rezerwie (${credits})`); break; }
  try {
    let em = await findEmail(k);
    if (!em) em = await guessEmail(k, known?.[k.firma]); // NO_MATCH → wzorzec domenowy + weryfikacja
    if (em) {
      await agent({ action: 'contact_email', firma: k.firma, imie: k.imie, email: em.email });
      found++; if (typeof credits === 'number') credits--;
      console.log(`  ✔ ${k.firma}: ${k.imie} — ${em.email} (${em.status})`);
    } else { misses++; console.log(`  ∅ ${k.firma}: ${k.imie} — brak w Prospeo i brak wzorca`); }
  } catch (e) { fails.push(`${k.firma}/${k.imie}: ${e.message}`); console.error(`  ✖ ${k.firma}: ${k.imie} — ${e.message}`); }
  await sleep(12000); // rate limit planu FREE
}
console.log(`Znaleziono ${found}, brak dopasowania ${misses}, błędy ${fails.length}`);
if (process.env.GITHUB_OUTPUT) {
  const fs = await import('node:fs');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `info=${found} nowych, ${misses} bez dopasowania, kolejka ${pending_total}\n`);
  if (typeof credits === 'number') fs.appendFileSync(process.env.GITHUB_OUTPUT, `credits=${credits}\n`);
}
if (contacts.length && !found && fails.length === contacts.length) process.exit(1); // wszystko padło
