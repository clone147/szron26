// Wyszukiwarka obrazków dla edytora diagramów — kilka źródeł za jednym interfejsem.
// Każde źródło zwraca listę { key, title, thumb, url, ext, source, credit, tint?, resolve? }:
//   thumb — mały podgląd do siatki wyników, url — plik wstawiany na kanwę,
//   tint  — grafika jednokolorowa (czarny tusz), którą edytor barwi kolorem kreski jak własne ikony,
//   resolve() — leniwe dociągnięcie adresu w pełnym rozmiarze (Wikimedia generuje miniatury na żądanie).
// Wszystkie API są bezkluczowe i wysyłają CORS (*), więc lecą prosto z przeglądarki.
// Każde zapytanie ma własny limit czasu — jedno zamulone źródło nie może zablokować reszty.

const TIMEOUT = 8000;
const getJSON = (url) => fetch(url, { signal: AbortSignal.timeout(TIMEOUT) }).then((r) => {
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
});

// „docker logo”, „ikona bazy danych” — słowa opisujące sam fakt szukania grafiki tylko psują trafność
const NOISE = /^(logo|logotyp|logotypy|ikona|ikonka|icon|obraz|obrazek|grafika|png|svg|zdj[eę]cie)$/i;
const terms = (q) => q.split(/[\s,]+/).filter((w) => w && !NOISE.test(w));
const clean = (q) => terms(q).join(' ') || q;

/* ── 1. Iconify: ~200 tys. ikon ze 150+ zestawów, w tym kolorowe logotypy technologii ── */
const ICONIFY = 'https://api.iconify.design';
const SET_LOGOS = ['logos', 'devicon', 'skill-icons', 'vscode-icons', 'catppuccin', 'flat-color-icons'];
const SET_UI = ['mdi', 'lucide', 'tabler', 'ph', 'carbon', 'material-symbols', 'fluent', 'solar', 'hugeicons'];
const SET_EMOJI = ['twemoji', 'noto', 'fluent-emoji-flat', 'openmoji', 'emojione'];
// mono = ikona rysowana currentColorem (czarna) → edytor pomaluje ją kolorem kreski diagramu
async function iconify(q, prefixes, mono) {
  const p = new URLSearchParams({ query: clean(q), limit: '32', prefixes: prefixes.join(',') });
  const r = await getJSON(`${ICONIFY}/search?${p}`);
  return (r?.icons || []).map((id) => {
    const [prefix, name] = id.split(':');
    const set = r.collections?.[prefix]?.name || prefix;
    return {
      key: `ic:${id}`, title: name.replace(/-/g, ' '), ext: 'svg', source: set, tint: mono,
      thumb: `${ICONIFY}/${prefix}/${name}.svg?height=64`,
      url: `${ICONIFY}/${prefix}/${name}.svg?height=512`,
      credit: `${name} — ${set} (Iconify)`,
    };
  });
}
const searchIconLogos = (q) => iconify(q, SET_LOGOS, false);
const searchIconUI = (q) => iconify(q, SET_UI, true);
const searchEmoji = (q) => iconify(q, SET_EMOJI, false);

/* ── 2. Simple Icons: logotypy marek jednym kolorem (kolor firmowy) ── */
const SI_DATA = 'https://cdn.jsdelivr.net/npm/simple-icons@16/data/simple-icons.json';
const SI_FILE = (slug, hex) => `https://cdn.simpleicons.org/${slug}/${hex}`;
let siList = null;
async function simpleIconsData() {
  if (!siList) siList = getJSON(SI_DATA).catch(() => { siList = null; return []; });
  return siList;
}
async function searchSimpleIcons(q) {
  const list = await simpleIconsData();
  const words = terms(q).map((w) => w.toLowerCase().replace(/[^a-z0-9+.]/g, ''));
  const needle = words.join('') || q.toLowerCase().replace(/\s+/g, '');
  const score = (i) => {
    const hay = [i.title.toLowerCase().replace(/\s+/g, ''), i.slug,
      ...(i.aliases?.aka || []).map((a) => a.toLowerCase().replace(/\s+/g, ''))];
    if (hay.some((h) => h === needle)) return 0;
    if (hay.some((h) => h.startsWith(needle))) return 1;
    if (hay.some((h) => h.includes(needle))) return 2;
    // wielosłowne zapytanie („visual studio code”) — dopasowanie po każdym słowie z osobna
    if (words.length > 1 && words.every((w) => hay.some((h) => h.includes(w)))) return 3;
    return 9;
  };
  return list
    .map((i) => ({ i, s: score(i) }))
    .filter((x) => x.s < 9)
    .sort((a, b) => a.s - b.s || a.i.title.length - b.i.title.length)
    .slice(0, 24)
    .map(({ i }) => ({
      key: `si:${i.slug}`, title: i.title, ext: 'svg', source: 'Simple Icons',
      thumb: SI_FILE(i.slug, i.hex), url: SI_FILE(i.slug, i.hex), credit: `${i.title} — Simple Icons (CC0)`,
    }));
}

/* ── 3. svgl.app: kolorowe logotypy nowszych marek (AI, dev-tooling), których nie ma gdzie indziej ── */
let svglList = null;
async function svglData() {
  if (!svglList) svglList = getJSON('https://api.svgl.app').catch(() => { svglList = null; return []; });
  return svglList;
}
async function searchSvgl(q) {
  const list = await svglData();
  const needle = clean(q).toLowerCase();
  const pick = (route) => (typeof route === 'string' ? route : route?.light || route?.dark);
  return list
    .filter((i) => i.title.toLowerCase().includes(needle))
    .sort((a, b) => a.title.length - b.title.length)
    .slice(0, 16)
    .map((i) => ({
      key: `svgl:${i.id}`, title: i.title, ext: 'svg', source: 'svgl.app',
      thumb: pick(i.route), url: pick(i.route), credit: `${i.title} — svgl.app`,
    }))
    .filter((i) => i.url);
}

/* ── 4. Wikimedia Commons: zdjęcia, schematy, zrzuty ekranu (wolne licencje) ── */
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
// upload.wikimedia.org oddaje TYLKO te szerokości miniatur, które już ma — własne przepisywanie
// adresu (np. na „1024px-”) kończy się błędem 400. Poprawnie: poprosić API o konkretną szerokość.
async function commonsUrl(title, width) {
  const p = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', titles: title,
    prop: 'imageinfo', iiprop: 'url', iiurlwidth: String(width),
  });
  const r = await getJSON(`${COMMONS}?${p}`);
  const ii = Object.values(r?.query?.pages || {})[0]?.imageinfo?.[0];
  return ii?.thumburl || ii?.url || null;
}
async function searchCommons(q) {
  const p = new URLSearchParams({
    action: 'query', format: 'json', origin: '*',
    generator: 'search', gsrsearch: `filetype:bitmap|drawing ${clean(q)}`, gsrnamespace: '6', gsrlimit: '24',
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '320',
  });
  const r = await getJSON(`${COMMONS}?${p}`);
  return Object.values(r?.query?.pages || {})
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .filter((pg) => /^image\/(png|jpeg|gif|webp|svg)/.test(pg.imageinfo?.[0]?.mime || ''))
    .map((pg) => {
      const ii = pg.imageinfo[0];
      const artist = ii.extmetadata?.Artist?.value?.replace(/<[^>]*>/g, '').trim();
      return {
        key: `wm:${pg.pageid}`, title: pg.title.replace(/^File:/, ''),
        ext: ii.mime.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg'),
        thumb: ii.thumburl || ii.url,
        url: ii.thumburl || ii.url,
        resolve: () => commonsUrl(pg.title, 1200), // pełny rozmiar dopiero przy wstawianiu
        source: 'Wikimedia Commons', credit: [artist, 'Wikimedia Commons'].filter(Boolean).join(' — '),
      };
    });
}

/* ── 5. Openverse: agregat zdjęć na wolnych licencjach (Flickr, Nappy, muzea…) ── */
async function searchOpenverse(q) {
  const p = new URLSearchParams({ q: clean(q), page_size: '20', mature: 'false' }); // 20 = limit bez klucza
  const r = await getJSON(`https://api.openverse.org/v1/images/?${p}`);
  return (r?.results || []).map((i) => ({
    key: `ov:${i.id}`, title: i.title || q,
    ext: (i.filetype || 'jpg').replace('jpeg', 'jpg'),
    thumb: i.thumbnail || i.url, url: i.url,
    source: 'Openverse', credit: [i.creator, i.license?.toUpperCase()].filter(Boolean).join(' — '),
  }));
}

/* ── źródła i zakładki, w kolejności przydatności w diagramie technicznym ── */
const SOURCES = {
  iconLogos: searchIconLogos,   // kolorowe logo technologii — najczęstsza potrzeba
  simple: searchSimpleIcons,    // logo jednokolorowe, spójne z kreską
  svgl: searchSvgl,             // świeże marki (AI, dev-tooling)
  iconUI: searchIconUI,         // ikony interfejsu, barwione tuszem diagramu
  emoji: searchEmoji,           // emoji
  commons: searchCommons,       // zdjęcia i schematy
  openverse: searchOpenverse,   // zdjęcia CC
};
const TABS = {
  all: ['iconLogos', 'simple', 'svgl', 'iconUI', 'commons', 'openverse'], // bez emoji — zaszumiałyby wyniki
  logo: ['iconLogos', 'simple', 'svgl'],
  icon: ['iconUI'],
  emoji: ['emoji'],
  photo: ['commons', 'openverse'],
};
export const PROVIDER_LIST = [
  { k: 'all', label: 'Wszystko' },
  { k: 'logo', label: 'Logotypy' },
  { k: 'icon', label: 'Ikony' },
  { k: 'emoji', label: 'Emoji' },
  { k: 'photo', label: 'Zdjęcia' },
];
export const providerKeys = (tab) => TABS[tab] || TABS.all;

// jedno źródło; błąd/timeout = pusta lista (UI pokazuje wyniki pozostałych źródeł od ręki)
export async function searchProvider(key, q) {
  const query = q.trim();
  if (!query || !SOURCES[key]) return [];
  try {
    return (await SOURCES[key](query)) || [];
  } catch (e) {
    console.warn(`[diagramy] źródło ${key} nie odpowiedziało:`, e);
    return [];
  }
}

// SVG bywa opisany w „em” (Iconify) albo bez wymiarów (Simple Icons) — canvas rysuje wtedy
// rozmyto albo wcale, więc normalizujemy wymiary do pikseli z viewBoxa (dłuższy bok 512 px)
function svgNormalized(svg) {
  const vb = svg.match(/viewBox\s*=\s*"([^"]+)"/i);
  if (!vb) return svg;
  const [, , w, h] = vb[1].trim().split(/[\s,]+/).map(Number);
  if (!w || !h) return svg;
  const k = 512 / Math.max(w, h);
  return svg
    .replace(/\s(width|height)\s*=\s*"[^"]*"/gi, '')
    .replace(/<svg\b/i, `<svg width="${Math.round(w * k)}" height="${Math.round(h * k)}"`);
}

// wynik → adres do zapisania w diagramie: grafikę wektorową osadzamy jako data URI (nie zgnije,
// waży ~1–3 kB), rastry kopiujemy do bucketu strefy; gdy się nie uda — zostaje adres źródłowy.
export async function materialize(item, upload) {
  let src = item.url;
  try {
    if (item.resolve) src = (await item.resolve()) || item.url;
    const res = await fetch(src, { mode: 'cors', signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(res.status);
    let blob = await res.blob();
    if (item.ext === 'svg' || blob.type === 'image/svg+xml') {
      const svg = svgNormalized(await blob.text());
      if (svg.length < 40_000) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      blob = new Blob([svg], { type: 'image/svg+xml' }); // duży SVG → do bucketu, ale już z wymiarami
    }
    return (await upload(blob, item)) || src;
  } catch (e) {
    console.warn('[diagramy] nie udało się pobrać pliku, zostaje adres źródłowy:', e);
    return src;
  }
}
