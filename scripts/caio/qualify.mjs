// Kwalifikacja odkrytych firm (tier 4) — research przez Claude Code headless (subskrypcja Max,
// NIE API per token). Auth: CLAUDE_CODE_OAUTH_TOKEN (z `claude setup-token`) w env / GH secrets;
// lokalnie wystarczy zalogowany Claude Code. Research: wbudowane WebSearch + WebFetch.
// Wyniki (werdykt produkt/uslugi/agencja + hak + decydenci) zapisuje EF caio-agent.
//
// Uruchomienie: CAIO_INGEST_SECRET=... node scripts/caio/qualify.mjs [--limit N]
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

const AGENT_URL = 'https://sttluvcbucpxzbcsuigw.supabase.co/functions/v1/caio-agent';
const SECRET = process.env.CAIO_INGEST_SECRET;
if (!SECRET) { console.error('Brak CAIO_INGEST_SECRET'); process.exit(1); }
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

Zbadaj w internecie (WebSearch, w razie potrzeby WebFetch na stronę firmy / rejestr.io): co firma naprawdę robi (własny produkt? jaki?), gdzie ma siedzibę, jaka jest skala (zatrudnienie), kto nią kieruje (zarząd z KRS/rejestr.io, CTO/Head of R&D z LinkedIn — tylko dane publiczne).

Na końcu wypisz WYŁĄCZNIE poprawny JSON (bez markdown, bez komentarzy):
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

// Jedno wywołanie Claude Code headless na firmę: tylko research webowy, bez dostępu do dysku.
// Dwie próby — mało znane firmy potrafią wymagać długiego researchu (13.08: 7-minutowy
// timeout uciął kwalifikację tuż przed końcem).
async function askClaude(firma, signals) {
  const args = [
    '-p', prompt(firma, signals),
    '--model', 'opus',
    '--output-format', 'json',
    '--allowedTools', 'WebSearch WebFetch',
    '--disallowedTools', 'Bash Edit Write Read Glob Grep',
    '--max-turns', '25',
  ];
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { stdout } = await run('claude', args, { timeout: 660000, maxBuffer: 16 * 1024 * 1024 });
      const out = JSON.parse(stdout);
      if (out.is_error) throw new Error(`claude: ${String(out.result).slice(0, 200)}`);
      return parseJSON(out.result ?? '');
    } catch (e) {
      lastErr = new Error(String(e.message).slice(0, 200));
      if (attempt === 1) console.error(`  ↻ ${firma}: próba 1 padła (${lastErr.message.slice(0, 80)}…) — ponawiam`);
    }
  }
  throw lastErr;
}

const { firms, pending_total } = await agent({ action: 'pending', limit: LIMIT });
console.log(`Do kwalifikacji: ${firms.length} (w kolejce łącznie: ${pending_total})`);
let ok = 0; const fails = [];
for (const { firma, signals } of firms) {
  try {
    const v = await askClaude(firma, signals);
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
