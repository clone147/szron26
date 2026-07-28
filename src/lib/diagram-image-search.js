// Wyszukiwarka obrazków dla edytora diagramów — kilka źródeł za jednym interfejsem.
// Każde źródło zwraca listę { key, title, thumb, url, ext, source, credit }:
//   thumb — mały podgląd do siatki wyników, url — plik wstawiany na kanwę.
// Wszystkie API są bezkluczowe i wysyłają CORS (*), więc lecą prosto z przeglądarki.

/* ── logotypy marek: Simple Icons (jednokolorowe SVG, ~3,5 tys. marek) ── */
const SI_DATA = 'https://cdn.jsdelivr.net/npm/simple-icons@16/data/simple-icons.json';
const SI_FILE = (slug, hex) => `https://cdn.simpleicons.org/${slug}/${hex}`;
let siList = null;
async function simpleIcons() {
  if (!siList) siList = fetch(SI_DATA).then((r) => r.json()).catch(() => []);
  return siList;
}
async function searchLogos(q) {
  const list = await simpleIcons();
  const needle = q.toLowerCase().replace(/\s+/g, '');
  const score = (i) => {
    const t = i.title.toLowerCase().replace(/\s+/g, '');
    if (t === needle || i.slug === needle) return 0;
    if (t.startsWith(needle) || i.slug.startsWith(needle)) return 1;
    if (t.includes(needle) || i.slug.includes(needle)) return 2;
    return (i.aliases?.aka || []).some((a) => a.toLowerCase().replace(/\s+/g, '').includes(needle)) ? 3 : 9;
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
    generator: 'search', gsrsearch: `filetype:bitmap|drawing ${q}`, gsrnamespace: '6', gsrlimit: '24',
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '320',
  });
  const r = await fetch(`https://commons.wikimedia.org/w/api.php?${p}`).then((x) => x.json());
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
  const p = new URLSearchParams({ q, page_size: '20', mature: 'false' }); // 20 = limit dla zapytań bez klucza
  const r = await fetch(`https://api.openverse.org/v1/images/?${p}`).then((x) => x.json());
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

// zapytanie do jednego źródła albo do wszystkich naraz (wyniki przeplatane, źródło po źródle)
export async function searchImages(q, provider = 'all') {
  const query = q.trim();
  if (!query) return [];
  if (provider !== 'all') return (await PROVIDERS[provider](query).catch(() => [])) || [];
  const packs = (await Promise.allSettled(Object.values(PROVIDERS).map((f) => f(query))))
    .map((r) => (r.status === 'fulfilled' ? r.value : []));
  const out = [];
  for (let i = 0; i < Math.max(...packs.map((p) => p.length), 0); i++)
    for (const p of packs) if (p[i]) out.push(p[i]);
  return out.slice(0, 48);
}

// wynik → adres do zapisania w diagramie: logo osadzamy jako data URI (nie zgnije, waży ~1 kB),
// resztę kopiujemy do bucketu strefy; gdy się nie uda — zostaje adres źródłowy.
export async function materialize(item, upload) {
  try {
    const res = await fetch(item.url, { mode: 'cors' });
    if (!res.ok) throw new Error(res.status);
    const blob = await res.blob();
    if (item.ext === 'svg' && blob.size < 24_000) {
      const svg = await blob.text();
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }
    return (await upload(blob, item)) || item.url;
  } catch {
    return item.url;
  }
}
