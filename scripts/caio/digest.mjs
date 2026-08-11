// Poranny digest CAIO — zbiera statusy jobów (skan/kwalifikacja) + saldo OpenRouter
// i każe EF caio-agent skomponować oraz wysłać e-mail (Resend zostaje w Supabase).
// Uruchomienie: CAIO_INGEST_SECRET=... [OPENROUTER_API_KEY=...] node scripts/caio/digest.mjs
const AGENT_URL = 'https://sttluvcbucpxzbcsuigw.supabase.co/functions/v1/caio-agent';
const SECRET = process.env.CAIO_INGEST_SECRET;
if (!SECRET) { console.error('Brak CAIO_INGEST_SECRET'); process.exit(1); }

let kredyty_usd = null;
if (process.env.OPENROUTER_API_KEY) {
  try {
    const r = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      signal: AbortSignal.timeout(15000),
    });
    const d = (await r.json())?.data;
    if (d) kredyty_usd = d.total_credits - d.total_usage;
  } catch (e) { console.error('Saldo OpenRouter niedostępne:', e.message); }
}

const res = await fetch(AGENT_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-caio-secret': SECRET },
  body: JSON.stringify({
    action: 'digest',
    statusy: {
      scan: process.env.SCAN_RESULT ?? null,
      qualify: process.env.QUALIFY_RESULT ?? null,
      qualify_info: process.env.QUALIFY_INFO ?? null,
      kredyty_usd,
    },
  }),
  signal: AbortSignal.timeout(60000),
});
const out = await res.json().catch(() => ({}));
if (!res.ok || !out.sent) { console.error('Digest nie wysłany:', res.status, out); process.exit(1); }
console.log(`Digest wysłany: ${out.subject}`);
