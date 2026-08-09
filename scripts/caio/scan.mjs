// Skaner sygnałów CAIO — oferty pracy (JustJoin.it, NoFluffJobs) + newsy (Google News RSS)
// dla firm z companies.mjs. Wyniki POST-uje do Edge Function caio-ingest (upsert po URL),
// skąd trafiają na /strefa/sygnaly.
//
// Uruchomienie:  CAIO_INGEST_SECRET=... node scripts/caio/scan.mjs [--dry] [--no-news] [--no-jobs]
// --dry: tylko wypisz sygnały, bez wysyłki. Kod wyjścia != 0 przy błędzie krytycznym.
import { COMPANIES, JOB_KEYWORDS, NEWS_W3, NEWS_W2 } from './companies.mjs';

const INGEST_URL = 'https://sttluvcbucpxzbcsuigw.supabase.co/functions/v1/caio-ingest';
const DRY = process.argv.includes('--dry');
const SECRET = process.env.CAIO_INGEST_SECRET;
if (!DRY && !SECRET) { console.error('Brak CAIO_INGEST_SECRET w env'); process.exit(1); }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

function matchCompany(text) {
  const t = ` ${String(text).toLowerCase()} `;
  return COMPANIES.find((c) => c.aliases.some((a) => t.includes(a)));
}
function matchedKeywords(text, keywords) {
  const t = ` ${String(text).toLowerCase()} `;
  return keywords.filter((k) => t.includes(k)).map((k) => k.trim());
}
function jobWaga(kws) {
  const hasAI = kws.some((k) => ['ai', 'machine learning', 'ml', 'computer vision', 'sztuczn'].includes(k));
  const hasEmb = kws.some((k) => ['embedded', 'c++', 'firmware', 'stm32', 'qt', 'rtos'].includes(k));
  return hasAI && hasEmb ? 3 : hasEmb ? 2 : 1;
}

async function getJSON(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, Accept: 'application/json', ...opts.headers }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

// --- JustJoin.it: pełny skan wszystkich stron (API nie filtruje po firmie), dopasowanie po nazwie ---
async function scanJustJoin(signals) {
  for (let page = 1; page <= 200; page++) {
    const data = await getJSON(`https://api.justjoin.it/v2/user-panel/offers?page=${page}&perPage=100&sortBy=published&orderBy=DESC`, { headers: { Version: '2' } });
    const offers = data?.data ?? [];
    if (!offers.length) break;
    matchJJOffers(offers, signals);
    if (!data?.meta?.nextPage) break;
  }
}
function matchJJOffers(offers, signals) {
    for (const o of offers) {
      const company = matchCompany(o.companyName);
      if (!company) continue;
      const hay = `${o.title} ${(o.requiredSkills ?? []).join(' ')}`;
      const kws = matchedKeywords(hay, JOB_KEYWORDS);
      if (!kws.length) continue;
      signals.push({
        typ: 'praca', firma: company.name, tier: company.tier,
        tytul: `${o.title} — ${o.companyName}`,
        url: `https://justjoin.it/job-offer/${o.slug}`,
        zrodlo: 'justjoin.it', waga: jobWaga(kws),
        opis: `Dopasowane: ${kws.join(', ')}${o.city ? ` · ${o.city}` : ''}`,
        posted_at: o.publishedAt ?? null,
      });
    }
}

// --- NoFluffJobs: pełna lista postingów jednym requestem ---
async function scanNoFluff(signals) {
  const data = await getJSON('https://nofluffjobs.com/api/posting');
  for (const p of data?.postings ?? []) {
    const company = matchCompany(p.name);
    if (!company) continue;
    const hay = `${p.title} ${(p.technology ?? '')} ${(p.tiles?.values ?? []).map((v) => v.value).join(' ')}`;
    const kws = matchedKeywords(hay, JOB_KEYWORDS);
    if (!kws.length) continue;
    signals.push({
      typ: 'praca', firma: company.name, tier: company.tier,
      tytul: `${p.title} — ${p.name}`,
      url: `https://nofluffjobs.com/pl/job/${p.url}`,
      zrodlo: 'nofluffjobs.com', waga: jobWaga(kws),
      opis: `Dopasowane: ${kws.join(', ')}`,
      posted_at: p.posted ? new Date(p.posted).toISOString() : null,
    });
  }
}

// --- Google News RSS per firma (okno 7 dni) ---
async function scanNews(signals) {
  for (const c of COMPANIES) {
    const q = encodeURIComponent(`"${c.aliases[0]}" when:7d`);
    const url = `https://news.google.com/rss/search?q=${q}&hl=pl&gl=PL&ceid=PL:pl`;
    let xml;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      xml = await res.text();
    } catch (e) { console.error(`news ${c.name}: ${e.message}`); continue; }
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 10);
    for (const [, item] of items) {
      const pick = (tag) => (item.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`)) ?? [])[1]?.trim() ?? '';
      const title = pick('title'); const link = pick('link'); const pub = pick('pubDate');
      if (!title || !link) continue;
      const w3 = matchedKeywords(title, NEWS_W3); const w2 = matchedKeywords(title, NEWS_W2);
      if (!w3.length && !w2.length) continue; // zwykłe wzmianki pomijamy — tylko sygnały
      signals.push({
        typ: 'news', firma: c.name, tier: c.tier, tytul: title, url: link,
        zrodlo: 'Google News', waga: w3.length ? 3 : 2,
        opis: `Dopasowane: ${[...w3, ...w2].join(', ')}`,
        posted_at: pub ? new Date(pub).toISOString() : null,
      });
    }
    await new Promise((r) => setTimeout(r, 400)); // grzeczne tempo wobec Google
  }
}

const signals = [];
const errors = [];
if (!process.argv.includes('--no-jobs')) {
  await scanJustJoin(signals).catch((e) => errors.push(`justjoin: ${e.message}`));
  await scanNoFluff(signals).catch((e) => errors.push(`nofluff: ${e.message}`));
}
if (!process.argv.includes('--no-news')) await scanNews(signals);
errors.forEach((e) => console.error('BŁĄD:', e));

console.log(`Sygnałów znalezionych: ${signals.length}`);
for (const s of signals) console.log(`  [${s.typ}/w${s.waga}] ${s.firma}: ${s.tytul}`);

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
if (errors.length === 2 && !process.argv.includes('--no-jobs')) process.exit(1); // oba job-źródła padły
