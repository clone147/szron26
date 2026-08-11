// Kwalifikacja odkrytych firm (tier 4) — research LLM z web searchem.
// Model: anthropic/claude-opus-5 przez OpenRouter (+ plugin web); fallback: Gemini (darmowy tier).
// Wyniki (werdykt produkt/uslugi/agencja + hak + decydenci) zapisuje EF caio-agent.
//
// Uruchomienie: CAIO_INGEST_SECRET=... OPENROUTER_API_KEY=... [GEMINI_API_KEY=...] node scripts/caio/qualify.mjs [--limit N]
const AGENT_URL = 'https://sttluvcbucpxzbcsuigw.supabase.co/functions/v1/caio-agent';
const SECRET = process.env.CAIO_INGEST_SECRET;
const OR_KEY = process.env.OPENROUTER_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!SECRET) { console.error('Brak CAIO_INGEST_SECRET'); process.exit(1); }
if (!OR_KEY && !GEMINI_KEY) { console.error('Brak OPENROUTER_API_KEY i GEMINI_API_KEY'); process.exit(1); }
const limIx = process.argv.indexOf('--limit');
const LIMIT = limIx > -1 ? +process.argv[limIx + 1] : 8;

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

function prompt(firma, signals) {
  return `Jesteś researcherem B2B pracującym dla SZRON (szron.tech) — jednoosobowej firmy Tomasza Wojciechowskiego z Rzeszowa, która wdraża programowanie agentowe AI (Claude Code) w polskich firmach tworzących urządzenia elektroniczne z własnym firmware (embedded). Klient idealny: polski PRODUCENT sprzętu z własnym zespołem embedded/firmware. NIE-klienci: software house'y / outsourcing / body-leasing (sami sprzedają programistów), agencje rekrutacyjne, oddziały globalnych korporacji.

Zakwalifikuj firmę "${firma}". Znaleźliśmy jej oferty pracy:
${signals.map((s) => `- ${s.tytul} (${s.zrodlo}; ${s.opis ?? ''}) ${s.url}`).join('\n')}

Zbadaj w internecie: co firma naprawdę robi (własny produkt? jaki?), gdzie ma siedzibę, jaka jest skala (zatrudnienie), kto nią kieruje (zarząd z KRS/rejestr.io, CTO/Head of R&D z LinkedIn — tylko dane publiczne).

Zwróć WYŁĄCZNIE poprawny JSON (bez markdown):
{
  "werdykt": "produkt" | "uslugi" | "agencja" | "nieustalone",
  "kwalifikacja": "1-2 zdania po polsku: co robi firma, skala, siedziba",
  "www": "https://... (strona firmowa lub null)",
  "hak": "1 zdanie po polsku — konkretny zaczep do pierwszego kontaktu (np. rekrutacja firmware + termin CRA 11.09)",
  "decydenci": [{"imie": "Imię Nazwisko", "stanowisko": "...", "linkedin_url": "... lub null"}],
  "pewnosc": 1-5,
  "dossier": "krótki markdown (## Produkty, ## Zespół embedded, ## Hak: ..., ## Ryzyka) — max 1500 znaków"
}
Werdykt "produkt" TYLKO gdy firma rozwija własne urządzenia/systemy. Gdy nie możesz ustalić — "nieustalone" i niska pewność. Nie zmyślaj nazwisk ani URL-i.`;
}

function parseJSON(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('brak JSON w odpowiedzi');
  return JSON.parse(m[0]);
}

async function askOpenRouter(firma, signals) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OR_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'anthropic/claude-opus-5',
      plugins: [{ id: 'web', max_results: 5 }],
      reasoning: { effort: 'medium' },
      messages: [{ role: 'user', content: prompt(firma, signals) }],
    }),
    signal: AbortSignal.timeout(180000),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${out?.error?.message ?? ''}`);
  return parseJSON(out.choices?.[0]?.message?.content ?? '');
}

async function askGemini(firma, signals) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt(firma, signals) }] }],
      tools: [{ google_search: {} }],
    }),
    signal: AbortSignal.timeout(120000),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${out?.error?.message ?? ''}`);
  const text = (out.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  return parseJSON(text);
}

const { firms, pending_total } = await agent({ action: 'pending', limit: LIMIT });
console.log(`Do kwalifikacji: ${firms.length} (w kolejce łącznie: ${pending_total})`);
let ok = 0; const fails = [];
for (const { firma, signals } of firms) {
  try {
    let v;
    try { v = OR_KEY ? await askOpenRouter(firma, signals) : await askGemini(firma, signals); }
    catch (e) {
      if (!GEMINI_KEY || !OR_KEY) throw e;
      console.error(`  ${firma}: OpenRouter padł (${e.message}) — próbuję Gemini`);
      v = await askGemini(firma, signals);
    }
    await agent({
      action: 'qualify', firma,
      werdykt: v.werdykt,
      kwalifikacja: [v.kwalifikacja, v.hak ? `Hak: ${v.hak}` : ''].filter(Boolean).join(' · '),
      www: v.www || null,
      dossier: v.dossier || null,
      kontakty: Array.isArray(v.decydenci) ? v.decydenci : [],
    });
    ok++;
    console.log(`  ✔ ${firma}: ${v.werdykt} (pewność ${v.pewnosc ?? '?'}) — ${v.kwalifikacja ?? ''}`);
  } catch (e) {
    fails.push(`${firma}: ${e.message}`);
    console.error(`  ✖ ${firma}: ${e.message}`);
  }
}
console.log(`Zakwalifikowano ${ok}/${firms.length}${fails.length ? `; błędy: ${fails.length}` : ''}`);
// wynik dla jobu digest (GitHub Actions)
if (process.env.GITHUB_OUTPUT) {
  const fs = await import('node:fs');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `info=${ok}/${firms.length} firm, kolejka ${pending_total}\n`);
}
if (firms.length && !ok) process.exit(1); // wszystko padło = błąd jobu (digest to zaraportuje)
