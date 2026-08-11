// Poranny digest CAIO — zbiera statusy jobów (skan/kwalifikacja) i każe EF caio-agent
// skomponować oraz wysłać e-mail (Resend zostaje w Supabase).
// Kwalifikacja idzie przez subskrypcję Claude (Max) — brak kosztów per token do pilnowania.
// Uruchomienie: CAIO_INGEST_SECRET=... node scripts/caio/digest.mjs
const AGENT_URL = 'https://sttluvcbucpxzbcsuigw.supabase.co/functions/v1/caio-agent';
const SECRET = process.env.CAIO_INGEST_SECRET;
if (!SECRET) { console.error('Brak CAIO_INGEST_SECRET'); process.exit(1); }

const res = await fetch(AGENT_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-caio-secret': SECRET },
  body: JSON.stringify({
    action: 'digest',
    statusy: {
      scan: process.env.SCAN_RESULT ?? null,
      qualify: process.env.QUALIFY_RESULT ?? null,
      qualify_info: process.env.QUALIFY_INFO ?? null,
    },
  }),
  signal: AbortSignal.timeout(60000),
});
const out = await res.json().catch(() => ({}));
if (!res.ok || !out.sent) { console.error('Digest nie wysłany:', res.status, out); process.exit(1); }
console.log(`Digest wysłany: ${out.subject}`);
