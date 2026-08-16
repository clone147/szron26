// Skaner sygnałów CAIO — oferty pracy (JustJoin.it, RocketJobs, NoFluffJobs, Bulldogjob)
// + newsy (Google News RSS, branżowe RSS elektroniki/automatyki) dla firm z companies.mjs
// ORAZ firm-produkt zakwalifikowanych w bazie (akcja `targets` w EF caio-agent) — odkrycia
// wchodzą do stałego monitoringu zamiast znikać po kwalifikacji.
// Dodatkowo ODKRYWA nowe firmy: oferta embedded od firmy spoza listy → sygnał tier 4.
// Wyniki POST-uje do Edge Function caio-ingest (upsert po URL), skąd trafiają na /strefa/sygnaly.
//
// Uruchomienie:  CAIO_INGEST_SECRET=... node scripts/caio/scan.mjs [--dry] [--no-news] [--no-jobs]
// --dry: tylko wypisz sygnały, bez wysyłki. Kod wyjścia != 0 przy błędzie krytycznym.
import {
  COMPANIES, JOB_KEYWORDS, EMB_KEYWORDS, AI_KEYWORDS,
  DISCOVERY_CORE, DISCOVERY_EXCLUDE, NEWS_W3, NEWS_W2, BRANCH_RSS,
} from './companies.mjs';

const INGEST_URL = 'https://sttluvcbucpxzbcsuigw.supabase.co/functions/v1/caio-ingest';
const DRY = process.argv.includes('--dry');
const SECRET = process.env.CAIO_INGEST_SECRET;
if (!DRY && !SECRET) { console.error('Brak CAIO_INGEST_SECRET w env'); process.exit(1); }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const MAX_DISCOVERY = 60; // limit odkryć na jeden run — nadmiar logowany, nie gubiony po cichu

// Monitorowane firmy = seed z companies.mjs + zakwalifikowane firmy-PRODUKT z bazy.
// Uzupełniane w loadTargets() przed skanami; przy --dry bez sekretu zostaje sam seed.
let ALL_COMPANIES = [...COMPANIES];
async function loadTargets() {
  if (!SECRET) { console.log('targets: brak sekretu — monitoruję tylko seed'); return; }
  try {
    const res = await fetch(INGEST_URL.replace('caio-ingest', 'caio-agent'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-caio-secret': SECRET },
      body: JSON.stringify({ action: 'targets' }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { targets } = await res.json();
    const znane = new Set(ALL_COMPANIES.flatMap((c) => [c.name.toLowerCase(), ...c.aliases]));
    let dodane = 0;
    for (const t of targets ?? []) {
      const alias = String(t.firma).toLowerCase();
      if (znane.has(alias)) continue;
      ALL_COMPANIES.push({ name: t.firma, tier: t.tier ?? 4, aliases: [alias] });
      znane.add(alias);
      dodane++;
    }
    console.log(`targets: +${dodane} firm-produkt z bazy (monitoring łącznie: ${ALL_COMPANIES.length})`);
  } catch (e) { console.error(`targets: ${e.message} — monitoruję tylko seed`); }
}

function matchCompany(text) {
  const t = ` ${String(text).toLowerCase()} `;
  return ALL_COMPANIES.find((c) => c.aliases.some((a) => t.includes(a)));
}
// Dopasowanie keywordów z granicami słów — substring łapał np. 'rtos' w „Bartoszyce"
// czy 'ai' w „maintenance". Granica: nie-litera/nie-cyfra po obu stronach ('c++' OK).
// Keyword z '*' na końcu = rdzeń: bez prawej granicy (sztuczn* → „sztucznej").
const KW_RE = new Map();
const kwName = (k) => k.trim().replace(/\*$/, '');
function kwRegex(k) {
  if (!KW_RE.has(k)) {
    const stem = k.trim().endsWith('*');
    const esc = kwName(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    KW_RE.set(k, new RegExp(`(?<![\\p{L}\\d])${esc}${stem ? '' : '(?![\\p{L}\\d])'}`, 'iu'));
  }
  return KW_RE.get(k);
}
function matchedKeywords(text, keywords) {
  const t = String(text);
  return keywords.filter((k) => kwRegex(k).test(t)).map(kwName);
}
function jobWaga(kws) {
  const hasAI = kws.some((k) => AI_KEYWORDS.map(kwName).includes(k));
  const hasEmb = kws.some((k) => EMB_KEYWORDS.map(kwName).includes(k));
  return hasAI && hasEmb ? 3 : hasEmb ? 2 : 1;
}

/* — odkrywanie: normalizacja nazwy firmy + filtr wykluczeń — */
const EXCLUDE_RE = DISCOVERY_EXCLUDE.map((a) => new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));
function excludedCompany(name) {
  return EXCLUDE_RE.some((re) => re.test(String(name)));
}
// „SATEL Sp. z o.o." → „SATEL"; utrzymuje stabilne grupowanie po firmie w widoku.
// Formy prawne zdejmowane w pętli — „Aco sp. z o.o. sp. komandytowa" ma ich kilka.
const LEGAL_RE = [
  /\s+sp[óo]łka\s+z\s+ograniczon\S+\s+odpowiedzialno\S+$/i,
  /\s+(prosta\s+sp[óo]łka\s+akcyjna|sp[óo]łka\s+akcyjna|sp[óo]łka\s+komandytowa|sp[óo]łka\s+jawna)$/i,
  /\s+(sp\.?\s*z\.?\s*o\.?\s*o\.?|s\.?\s?a\.?|p\.?s\.?a\.?|sp\.?\s*j\.?|sp\.?\s*k\.?|s\.?k\.?a\.?|sp\.?\s*komandytowa|gmbh|ltd\.?|inc\.?|s\.?c\.?)$/i,
];
function normalizeFirma(name) {
  let n = String(name).replace(/\s{2,}/g, ' ').trim();
  for (let i = 0; i < 4; i++) {
    const before = n;
    for (const re of LEGAL_RE) n = n.replace(re, '');
    n = n.replace(/[,.]+\s*$/, '').trim();
    if (n === before) break;
  }
  return n;
}

async function getJSON(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, Accept: 'application/json', ...opts.headers }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}
async function getText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

/* --- JustJoin.it / RocketJobs — ta sama platforma i kształt API; pełny skan stron --- */
async function scanJJLike(apiBase, offerBase, zrodlo, signals, discovered) {
  for (let page = 1; page <= 200; page++) {
    const data = await getJSON(`${apiBase}/v2/user-panel/offers?page=${page}&perPage=100&sortBy=published&orderBy=DESC`, { headers: { Version: '2' } });
    const offers = data?.data ?? [];
    if (!offers.length) break;
    for (const o of offers) {
      matchOffer({
        companyName: o.companyName,
        hay: `${o.title} ${(o.requiredSkills ?? []).join(' ')} ${(o.niceToHaveSkills ?? []).join(' ')}`,
        tytul: o.title,
        url: `${offerBase}/${o.slug}`,
        zrodlo,
        extra: o.city || '',
        posted_at: o.publishedAt ?? null,
      }, signals, discovered);
    }
    if (!data?.meta?.nextPage) break;
  }
}

/* --- NoFluffJobs: pełna lista postingów jednym requestem --- */
async function scanNoFluff(signals, discovered) {
  const data = await getJSON('https://nofluffjobs.com/api/posting');
  for (const p of data?.postings ?? []) {
    matchOffer({
      companyName: p.name,
      hay: `${p.title} ${(p.technology ?? '')} ${(p.tiles?.values ?? []).map((v) => v.value).join(' ')}`,
      tytul: p.title,
      url: `https://nofluffjobs.com/pl/job/${p.url}`,
      zrodlo: 'nofluffjobs.com',
      extra: '',
      posted_at: p.posted ? new Date(p.posted).toISOString() : null,
    }, signals, discovered);
  }
}

/* --- Bulldogjob: publiczny GraphQL, pełny skan stron --- */
async function scanBulldog(signals, discovered) {
  for (let page = 1; page <= 20; page++) {
    const res = await fetch('https://bulldogjob.pl/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ query: `query { searchJobs(country: "PL", language: pl, page: ${page}, perPage: 100) { totalCount nodes { id position company { name } technologyTags publishedAt } } }` }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`bulldogjob -> HTTP ${res.status}`);
    const out = await res.json();
    const nodes = out?.data?.searchJobs?.nodes ?? [];
    if (!nodes.length) break;
    for (const j of nodes) {
      matchOffer({
        companyName: j.company?.name ?? '',
        hay: `${j.position} ${(j.technologyTags ?? []).join(' ')}`,
        tytul: j.position,
        url: `https://bulldogjob.pl/companies/jobs/${j.id}`,
        zrodlo: 'bulldogjob.pl',
        extra: '',
        posted_at: j.publishedAt ? new Date(j.publishedAt).toISOString() : null,
      }, signals, discovered);
    }
    if (page * 100 >= (out?.data?.searchJobs?.totalCount ?? 0)) break;
  }
}

/* — wspólne dopasowanie oferty: znana firma → sygnał; nieznana → kandydat na odkrycie — */
function matchOffer(o, signals, discovered) {
  const company = matchCompany(o.companyName);
  if (company) {
    const kws = matchedKeywords(o.hay, JOB_KEYWORDS);
    if (!kws.length) return;
    signals.push({
      typ: 'praca', firma: company.name, tier: company.tier,
      tytul: `${o.tytul} — ${o.companyName}`,
      url: o.url, zrodlo: o.zrodlo, waga: jobWaga(kws),
      opis: `Dopasowane: ${kws.join(', ')}${o.extra ? ` · ${o.extra}` : ''}`,
      posted_at: o.posted_at,
    });
    return;
  }
  // odkrywanie: rdzeń embedded wymagany, wykluczenia (transport/outsourcing/agencje) odpadają
  const core = matchedKeywords(o.hay, DISCOVERY_CORE);
  if (!core.length || excludedCompany(o.companyName)) return;
  const kws = matchedKeywords(o.hay, JOB_KEYWORDS);
  const firma = normalizeFirma(o.companyName);
  if (!firma) return;
  discovered.push({
    typ: 'praca', firma, tier: 4,
    tytul: `${o.tytul} — ${o.companyName}`,
    url: o.url, zrodlo: o.zrodlo, waga: jobWaga([...new Set([...core, ...kws])]),
    opis: `Dopasowane: ${[...new Set([...core, ...kws])].join(', ')}${o.extra ? ` · ${o.extra}` : ''}`,
    posted_at: o.posted_at,
  });
}

/* — wspólny parser RSS (Google News i portale branżowe) — */
function parseRSS(xml, maxItems = 300) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, maxItems).map(([, item]) => {
    const pick = (tag) => (item.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`)) ?? [])[1]?.trim() ?? '';
    return { title: pick('title'), link: pick('link'), pub: pick('pubDate'), desc: pick('description') };
  }).filter((i) => i.title && i.link);
}

/* --- Google News RSS per firma (okno 7 dni) --- */
async function scanNews(signals) {
  for (const c of ALL_COMPANIES) {
    const q = encodeURIComponent(`"${c.aliases[0]}" when:7d`);
    const url = `https://news.google.com/rss/search?q=${q}&hl=pl&gl=PL&ceid=PL:pl`;
    let xml;
    try { xml = await getText(url); } catch (e) { console.error(`news ${c.name}: ${e.message}`); continue; }
    for (const it of parseRSS(xml, 10)) {
      const w3 = matchedKeywords(it.title, NEWS_W3); const w2 = matchedKeywords(it.title, NEWS_W2);
      if (!w3.length && !w2.length) continue; // zwykłe wzmianki pomijamy — tylko sygnały
      signals.push({
        typ: 'news', firma: c.name, tier: c.tier, tytul: it.title, url: it.link,
        zrodlo: 'Google News', waga: w3.length ? 3 : 2,
        opis: `Dopasowane: ${[...w3, ...w2].join(', ')}`,
        posted_at: it.pub ? new Date(it.pub).toISOString() : null,
      });
    }
    await new Promise((r) => setTimeout(r, 400)); // grzeczne tempo wobec Google
  }
}

/* --- Branżowe RSS (elektronikab2b/automatykab2b): wzmianka o znanej firmie = sygnał ---
   Prasa branżowa rzadko pisze o konkretnej firmie z listy — jak pisze, to znaczące. */
async function scanBranchRSS(signals) {
  const cutoff = Date.now() - 7 * 86400000;
  const seen = new Set(); // ten sam artykuł bywa na obu portalach pod różnymi URL-ami
  for (const src of BRANCH_RSS) {
    let xml;
    try { xml = await getText(src.url); } catch (e) { console.error(`rss ${src.zrodlo}: ${e.message}`); continue; }
    for (const it of parseRSS(xml)) {
      const when = it.pub ? new Date(it.pub).getTime() : NaN;
      if (!Number.isNaN(when) && when < cutoff) continue;
      const company = matchCompany(`${it.title} ${it.desc}`);
      if (!company) continue;
      const key = `${company.name}|${it.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const w3 = matchedKeywords(`${it.title} ${it.desc}`, NEWS_W3);
      signals.push({
        typ: 'news', firma: company.name, tier: company.tier, tytul: it.title, url: it.link,
        zrodlo: src.zrodlo, waga: w3.length ? 3 : 2,
        opis: w3.length ? `Dopasowane: ${w3.join(', ')}` : 'Wzmianka w prasie branżowej',
        posted_at: it.pub ? new Date(it.pub).toISOString() : null,
      });
    }
  }
}

const signals = [];
const discovered = [];
const errors = [];
await loadTargets();
if (!process.argv.includes('--no-jobs')) {
  await scanJJLike('https://api.justjoin.it', 'https://justjoin.it/job-offer', 'justjoin.it', signals, discovered).catch((e) => errors.push(`justjoin: ${e.message}`));
  await scanJJLike('https://api.rocketjobs.pl', 'https://rocketjobs.pl/oferty-pracy', 'rocketjobs.pl', signals, discovered).catch((e) => errors.push(`rocketjobs: ${e.message}`));
  await scanNoFluff(signals, discovered).catch((e) => errors.push(`nofluff: ${e.message}`));
  await scanBulldog(signals, discovered).catch((e) => errors.push(`bulldogjob: ${e.message}`));
}
if (!process.argv.includes('--no-news')) {
  await scanNews(signals);
  await scanBranchRSS(signals);
}
errors.forEach((e) => console.error('BŁĄD:', e));

// odkrycia: dedup po (firma, tytuł) — ta sama oferta bywa multiplikowana per miasto;
// max 2 sygnały na odkrytą firmę na run; potem najcięższe naprzód i globalny limit
const byFirma = new Map();
for (const d of discovered) {
  if (!byFirma.has(d.firma)) byFirma.set(d.firma, []);
  const list = byFirma.get(d.firma);
  if (!list.some((x) => x.tytul === d.tytul)) list.push(d);
}
const deduped = [...byFirma.values()].flatMap((list) => list.sort((a, b) => b.waga - a.waga).slice(0, 2));
deduped.sort((a, b) => b.waga - a.waga || String(b.posted_at).localeCompare(String(a.posted_at)));
const kept = deduped.slice(0, MAX_DISCOVERY);
if (discovered.length > kept.length) console.log(`Odkrycia: ${discovered.length} surowych → ${deduped.length} po dedup (max 2/firmę) → ${kept.length} po limicie ${MAX_DISCOVERY}`);
signals.push(...kept);

console.log(`Sygnałów znalezionych: ${signals.length} (w tym odkrycia nowych firm: ${kept.length})`);
for (const s of signals) console.log(`  [${s.typ}/w${s.waga}${s.tier === 4 ? '/ODKRYTA' : ''}] ${s.firma}: ${s.tytul}`);

if (!DRY && signals.length) {
  const res = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-caio-secret': SECRET },
    body: JSON.stringify({ signals }),
    signal: AbortSignal.timeout(30000),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { console.error('Ingest błąd:', res.status, out); process.exit(1); }
  console.log(`Wysłano do strefy: received=${out.received}, nowych=${out.inserted}`);
}
if (errors.length >= 4 && !process.argv.includes('--no-jobs')) process.exit(1); // wszystkie job-źródła padły
