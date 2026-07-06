#!/usr/bin/env bash
# Regeneruje files.ts (pliki skilla stm32f429-disco osadzone w base64) i redeployuje
# Edge Function stm32-skill-build. Uruchamiać po KAŻDEJ zmianie skilla źródłowego.
set -euo pipefail

SKILL_DIR="${SKILL_DIR:-/Users/tomek/Desktop/Hot/RG/STM32Skill-disco/stm32f429-disco}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FN_DIR="$REPO_DIR/supabase/functions/stm32-skill-build"
PROJECT_REF="sttluvcbucpxzbcsuigw"

[ -f "$SKILL_DIR/SKILL.md" ] || { echo "Brak skilla w $SKILL_DIR"; exit 1; }

echo "1/3 Regeneruję files.ts z $SKILL_DIR"
node -e '
const fs = require("fs"), path = require("path");
const root = process.argv[1], out = process.argv[2];
const files = [];
(function walk(d, rel) {
  for (const e of fs.readdirSync(d).sort()) {
    if (e === ".DS_Store") continue;
    const p = path.join(d, e), r = rel ? rel + "/" + e : e;
    fs.statSync(p).isDirectory() ? walk(p, r) : files.push([r, fs.readFileSync(p)]);
  }
})(root, "");
let src = "// Wygenerowane przez scripts/deploy-stm32-skill-fn.sh — nie edytować ręcznie.\nexport const SKILL_FILES: Record<string,string> = {\n";
for (const [r, buf] of files) src += `  ${JSON.stringify(r)}: ${JSON.stringify(buf.toString("base64"))},\n`;
fs.writeFileSync(out, src + "};\n");
console.log("  " + files.map(f => f[0]).join("\n  "));
' "$SKILL_DIR" "$FN_DIR/files.ts"

echo "2/3 Deploy funkcji ($PROJECT_REF)"
cd "$REPO_DIR"
supabase functions deploy stm32-skill-build --project-ref "$PROJECT_REF" --no-verify-jwt --use-api

echo "3/3 Smoke test (oczekiwane 401 bez tokena)"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "https://$PROJECT_REF.supabase.co/functions/v1/stm32-skill-build" \
  -H "Content-Type: application/json" -d '{"variant":"original"}')
[ "$CODE" = "401" ] && echo "OK (401)" || { echo "NIEOCZEKIWANY STATUS: $CODE"; exit 1; }
