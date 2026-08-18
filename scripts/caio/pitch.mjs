// Backfill pitcha dla już zakwalifikowanych firm-produkt (kolumna caio_companies.pitch):
// 3-4 zdania — czym firma może być zainteresowana i który film SZRON pokazać jej w mailu
// zaczepiającym. Nowe firmy dostają pitch od razu w qualify.mjs; ten skrypt uzupełnia braki.
// Uruchomienie: CAIO_INGEST_SECRET=... node scripts/caio/pitch.mjs [--limit N]
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

const AGENT_URL = 'https://sttluvcbucpxzbcsuigw.supabase.co/functions/v1/caio-agent';
const SECRET = process.env.CAIO_INGEST_SECRET;
if (!SECRET) { console.error('Brak CAIO_INGEST_SECRET'); process.exit(1); }
const limIx = process.argv.indexOf('--limit');
const LIMIT = limIx > -1 ? +process.argv[limIx + 1] : 25;

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

function prompt(c, filmy) {
  return `Jesteś researcherem B2B pracującym dla SZRON (szron.tech) — jednoosobowej firmy Tomasza Wojciechowskiego z Rzeszowa, która wdraża programowanie agentowe AI (Claude Code) w polskich firmach tworzących urządzenia elektroniczne z własnym firmware (embedded).

Firma-cel (już zakwalifikowana jako potencjalny klient): "${c.firma}"${c.www ? ` (${c.www})` : ''}
Kwalifikacja: ${c.kwalifikacja ?? 'brak'}
${c.dossier ? `Dossier:\n${c.dossier}\n` : ''}
Filmy Tomka na YouTube (tytuł — teza):
${filmy.map((f) => `- ${f.title} — ${f.teza}`).join('\n')}

W razie potrzeby doprecyzuj wiedzę o firmie przez WebSearch/WebFetch (strona firmowa).

Na końcu wypisz WYŁĄCZNIE poprawny JSON (bez markdown):
{
  "pitch": "3-4 zdania po polsku: czym ta firma/jej decydenci mogą być realnie zainteresowani w kontekście oferty SZRON i KTÓRY film z listy najlepiej pokazać im w mailu zaczepiającym (podaj tytuł) — z krótkim uzasadnieniem, co konkretnie na tym filmie odpowiada ich problemowi"
}
Nie zmyślaj faktów o firmie — opieraj się na kwalifikacji, dossier i tym, co znajdziesz w sieci.`;
}

function parseJSON(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('brak JSON w odpowiedzi');
  return JSON.parse(m[0]);
}

async function askClaude(c, filmy) {
  const args = [
    '-p', prompt(c, filmy),
    '--model', 'opus',
    '--output-format', 'json',
    '--allowedTools', 'WebSearch WebFetch',
    '--disallowedTools', 'Bash Edit Write Read Glob Grep',
    '--max-turns', '15',
  ];
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { stdout } = await run('claude', args, { timeout: 420000, maxBuffer: 16 * 1024 * 1024 });
      const out = JSON.parse(stdout);
      if (out.is_error) throw new Error(`claude: ${String(out.result).slice(0, 200)}`);
      return parseJSON(out.result ?? '');
    } catch (e) {
      lastErr = new Error(String(e.message).slice(0, 200));
      if (attempt === 1) console.error(`  ↻ ${c.firma}: próba 1 padła — ponawiam`);
    }
  }
  throw lastErr;
}

const { firms, pending_total, filmy } = await agent({ action: 'pitch_pending', limit: LIMIT });
console.log(`Bez pitcha: ${firms.length} (łącznie: ${pending_total}); filmów w katalogu: ${filmy.length}`);
let ok = 0;
for (const c of firms) {
  try {
    const { pitch } = await askClaude(c, filmy);
    if (!pitch) throw new Error('pusty pitch');
    await agent({ action: 'pitch_save', firma: c.firma, pitch });
    ok++;
    console.log(`  ✔ ${c.firma}: ${String(pitch).slice(0, 100)}…`);
  } catch (e) {
    console.error(`  ✖ ${c.firma}: ${e.message}`);
  }
}
console.log(`Uzupełniono ${ok}/${firms.length}`);
if (firms.length && !ok) process.exit(1);
