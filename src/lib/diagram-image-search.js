// Wyszukiwarka obrazków dla edytora diagramów — kilka źródeł za jednym interfejsem.
// Każde źródło zwraca listę { key, title, thumb, url, ext, source, credit }:
//   thumb — mały podgląd do siatki wyników, url — plik wstawiany na kanwę.
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

/* ── logotypy marek: Simple Icons (jednokolorowe SVG, ~3,5 tys. marek) ── */
const SI_DATA = 'https://cdn.jsdelivr.net/npm/simple-icons@16/data/simple-icons.json';
const SI_FILE = (slug, hex) => `https://cdn.simpleicons.org/${slug}/${hex}`;
let siList = null;
async function simpleIcons() {
  if (!siList) siList = getJSON(SI_DATA).catch(() => { siList = null; return []; });
  return siList;
}
async function searchLogos(q) {
  const list = await simpleIcons();
  const words = terms(q).map((w) => w.toLowerCase().replace(/[^a-z0-9+.]/g, ''));
  const needle = words.join('') || q.toLowerCase().replace(/\s+/g, '');
  const score = (i) => {
    const t = i.title.toLowerCase().replace(/\s+/g, '');
    const hay = [t, i.slug, ...(i.aliases?.aka || []).map((a) => a.toLowerCase().replace(/\s+/g, ''))];
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

/* ── Wikimedia Commons: zdjęcia, schematy, diagramy (wolne licencje) ── */
async function searchCommons(q) {
  const p = new URLSearchParams({
    action: 'query', format: 'json', origin: '*',
    generator: 'search', gsrsearch: `filetype:bitmap|drawing ${terms(q).join(' ') || q}`,
    gsrnamespace: '6', gsrlimit: '24',
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '320',
  });
  const r = await getJSON(`https://commons.wikimedia.org/w/api.php?${p}`);
  const pages = Object.values(r?.query?.pages || {});
  return pages
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .filter((pg) => /^image\/(png|jpeg|gif|webp|svg)/.test(pg.imageinfo?.[0]?.mime || ''))
    .map((pg) => {
      const ii = pg.imageinfo[0];
      const artist = ii.extmetadata?.Artist?.value?.replace(/<[^>]*>/g, '').trim();
      return {
        key: `wm:${pg.pageid}`, title: pg.title.replace(/^File:/, ''),
        ext: ii.mime.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg'),
        thumb: ii.thumburl || ii.url, url: ii.thumburl?.replace(/\/\d+px-/, '/1024px-') || ii.url,
        source: 'Wikimedia Commons', credit: [artist, 'Wikimedia Commons'].filter(Boolean).join(' — '),
      };
    });
}

/* ── Openverse: agregat obrazów na wolnych licencjach (Flickr, Nappy, Wikimedia…) ── */
async function searchOpenverse(q) {
  const p = new URLSearchParams({ q, page_size: '20', mature: 'false' }); // 20 = limit zapytań bez klucza
  const r = await getJSON(`https://api.openverse.org/v1/images/?${p}`);
  return (r?.results || []).map((i) => ({
    key: `ov:${i.id}`, title: i.title || q,
    ext: (i.filetype || 'jpg').replace('jpeg', 'jpg'),
    thumb: i.thumbnail || i.url, url: i.url,
    source: 'Openverse', credit: [i.creator, i.license?.toUpperCase()].filter(Boolean).join(' — '),
  }));
}

const PROVIDERS = { logo: searchLogos, wiki: searchCommons, open: searchOpenverse };
export const PROVIDER_LIST = [
  { k: 'all', label: 'Wszystko' },
  { k: 'logo', label: 'Logotypy' },
  { k: 'wiki', label: 'Wikimedia' },
  { k: 'open', label: 'Openverse' },
];
export const providerKeys = (k) => (k === 'all' ? Object.keys(PROVIDERS) : [k]);

// jedno źródło; błąd/timeout = pusta lista (UI pokazuje wyniki pozostałych źródeł od ręki)
export async function searchProvider(key, q) {
  const query = q.trim();
  if (!query || !PROVIDERS[key]) return [];
  try {
    return (await PROVIDERS[key](query)) || [];
  } catch (e) {
    console.warn(`[diagramy] źródło ${key} nie odpowiedziało:`, e);
    return [];
  }
}

// SVG z samym viewBox (tak wygląda Simple Icons) nie ma wymiarów własnych — Firefox/Safari
// odmawiają wtedy narysowania go na canvasie, więc dopisujemy width/height z viewBoxa
function svgSized(svg) {
  if (/<svg[^>]*\bwidth=/i.test(svg)) return svg;
  const vb = svg.match(/viewBox\s*=\s*"([^"]+)"/i);
  if (!vb) return svg;
  const [, , w, h] = vb[1].trim().split(/[\s,]+/).map(Number);
  if (!w || !h) return svg;
  return svg.replace(/<svg\b/i, `<svg width="${w}" height="${h}"`);
}

// wynik → adres do zapisania w diagramie: logo osadzamy jako data URI (nie zgnije, waży ~1 kB),
// resztę kopiujemy do bucketu strefy; gdy się nie uda — zostaje adres źródłowy.
export async function materialize(item, upload) {
  try {
    const res = await fetch(item.url, { mode: 'cors', signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(res.status);
    let blob = await res.blob();
    if (item.ext === 'svg' || blob.type === 'image/svg+xml') {
      const svg = svgSized(await blob.text());
      if (svg.length < 40_000) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      blob = new Blob([svg], { type: 'image/svg+xml' }); // duży SVG → do bucketu, ale już z wymiarami
    }
    return (await upload(blob, item)) || item.url;
  } catch (e) {
    console.warn('[diagramy] nie udało się pobrać pliku, zostaje adres źródłowy:', e);
    return item.url;
  }
}
