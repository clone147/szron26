// Skleja CSS design systemu w jeden płaski plik (cssEntry nie może mieć @import —
// jego treść trafia verbatim do _ds_bundle.css). Źródło prawdy: src/styles/ strony.
// Fonty: kopiuje woff2 z public/fonts do styles/fonts/ (wewnątrz pakietu — konwerter
// nie wynosi plików spoza ds/) i przepisuje url(/fonts/…) → url(./fonts/…).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const stripImports = (css) => css.replace(/^@import[^\n]*\n/gm, '');

// woff2 → styles/fonts/ (gitignorowane; regenerowane każdym buildem)
const fontsDir = join(here, 'styles/fonts');
mkdirSync(fontsDir, { recursive: true });
const pub = join(here, '../public/fonts');
for (const f of readdirSync(pub)) if (f.endsWith('.woff2')) copyFileSync(join(pub, f), join(fontsDir, f));

const fontsCss = readFileSync(join(here, '../src/styles/fonts.css'), 'utf8')
  .replaceAll('url(/fonts/', 'url(./fonts/');

const out = [
  ['tokens (src/styles/tokens.css)', readFileSync(join(here, '../src/styles/tokens.css'), 'utf8')],
  ['fonts (src/styles/fonts.css, url → ./fonts/)', fontsCss],
  ['main (src/styles/main.css, bez @import)', stripImports(readFileSync(join(here, '../src/styles/main.css'), 'utf8'))],
  ['components DS (styles/components.css)', readFileSync(join(here, 'styles/components.css'), 'utf8')],
].map(([label, css]) => `/* ═══ ${label} ═══ */\n` + css).join('\n\n');

writeFileSync(join(here, 'styles/compiled.css'), out);
console.log(`styles/compiled.css: ${(out.length / 1024).toFixed(0)} KB`);
