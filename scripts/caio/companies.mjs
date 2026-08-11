// Firmy docelowe CAIO (z planu wykonawczego, B.1).
// WYKLUCZONE firmy z rynku transportu publicznego (zapis w umowie z R&G):
// Newag, Pesa, Solaris, Medcom (napędy trakcyjne), Pixel (systemy informacji pasażerskiej).
// aliases — warianty nazwy do dopasowania w ofertach/newsach (lowercase, substring match).
export const COMPANIES = [
  { name: 'WB Group / Flytronic', tier: 1, aliases: ['wb electronics', 'wb group', 'flytronic'] },
  { name: 'Apator', tier: 1, aliases: ['apator'] },
  { name: 'Aptiv', tier: 1, aliases: ['aptiv'] },
  { name: 'Sonel', tier: 1, aliases: ['sonel'] },
  { name: 'Lumel', tier: 1, aliases: ['lumel'] },
  { name: 'Creotech', tier: 1, aliases: ['creotech'] },
  { name: 'Satel', tier: 1, aliases: ['satel'] },
  { name: 'Fibaro', tier: 1, aliases: ['fibaro', 'fibar group'] },
  { name: 'Amica', tier: 2, aliases: ['amica'] },
  { name: 'Zamel', tier: 2, aliases: ['zamel'] },
  { name: 'Relpol', tier: 2, aliases: ['relpol'] },
  { name: 'Pro-Plus', tier: 2, aliases: ['pro-plus'] },
  { name: 'Comarch Healthcare', tier: 2, aliases: ['comarch healthcare'] },
  { name: 'Nokia (Wrocław/Kraków)', tier: 2, aliases: ['nokia'] },
  { name: 'Spartaqs', tier: 2, aliases: ['spartaqs'] },
  { name: 'APS Gdynia', tier: 2, aliases: ['aps energia', 'aps s.a', 'aps gdynia'] },
  { name: 'Aerobits', tier: 2, aliases: ['aerobits'] },
  { name: 'PIT-RADWAR', tier: 3, aliases: ['pit-radwar', 'pit radwar'] },
  { name: 'Ursus', tier: 3, aliases: ['ursus'] },
  { name: 'Pronar', tier: 3, aliases: ['pronar'] },
  { name: 'Pozyton', tier: 3, aliases: ['pozyton'] },
  { name: 'Astor', tier: 3, aliases: ['astor'] },
  { name: 'Elmark', tier: 3, aliases: ['elmark'] },
];

// Słowa kluczowe sygnału zakupowego w ofertach pracy (lowercase).
// EMB/AI osobno — jobWaga liczy z nich wagę (AI+embedded = 3, embedded = 2, reszta = 1).
export const EMB_KEYWORDS = [
  'embedded', 'c++', 'firmware', 'stm32', 'qt', 'rtos', 'freertos', 'zephyr',
  'yocto', 'mikrokontroler', 'microcontroller', 'bare metal', 'bare-metal',
  'esp32', 'nrf52', 'cortex-m', 'fpga', 'vhdl', 'kicad', 'altium', 'modbus',
];
// '*' na końcu = rdzeń (dopasuje też odmiany: sztuczn* → „sztucznej inteligencji").
export const AI_KEYWORDS = ['ai', 'machine learning', ' ml ', 'computer vision', 'sztuczn*', 'llm'];
export const JOB_KEYWORDS = [...EMB_KEYWORDS, ...AI_KEYWORDS];

// ODKRYWANIE nowych firm: oferta od firmy spoza listy liczy się tylko, gdy trafia
// w rdzeń embedded (samo C++/Qt/AI to za szeroko — łapałoby każdy softwarehouse).
export const DISCOVERY_CORE = [
  'embedded', 'firmware', 'stm32', 'mikrokontroler', 'microcontroller', 'rtos',
  'freertos', 'zephyr', 'yocto', 'bare metal', 'bare-metal', 'embedded linux',
  'esp32', 'nrf52', 'cortex-m', 'fpga', 'vhdl',
];

// Firmy pomijane przy odkrywaniu (regex, word boundary, lowercase):
// transport publiczny (umowa R&G), softwarehousy/outsourcing/body-leasing (to nie klienci
// docelowi — sami sprzedają programistów), agencje rekrutacyjne (oferta nie mówi, czyja),
// globalne korporacje (za duże na CAIO as a service).
export const DISCOVERY_EXCLUDE = [
  // transport publiczny — zakaz umowny
  'newag', 'pesa', 'solaris', 'medcom', 'pixel', 'thales',
  // softwarehousy / outsourcing / body-leasing
  'sii', 'luxoft', 'globallogic', 'capgemini', 'accenture', 'epam', 'infosys',
  'dxc', 'cognizant', 'atos', 'eviden', 'comarch', 'asseco', 'mobica', 'spyrosoft',
  'transition technologies', 'n-ix', 'softserve', 'intive', 'tietoevry', 'etteplan',
  'akkodis', 'alten', 'gft', 'sollers', 'billennium', 'britenet', 'euvic',
  'netguru', 'stx next', 'boldare', 'miquido', '10clouds', 'grid dynamics',
  'andersen', 'hiqo', 'sigma software', 'klika tech', 'power media', 'edge one',
  'int2code', 'emerge soft', 'optiveum', 'conclusive engineering', 'embevity',
  'avenga', 'scalo', 'jit team', 'happy team', 'sourcingnow', 'square one',
  'dcg', 'bytesbakers', 'toyota', 'jeronimo martins', 'hebe',
  // agencje rekrutacyjne / pośrednicy
  'hays', 'randstad', 'adecco', 'manpower', 'michael page', 'antal', 'devire',
  'experis', 'emagine', '7n', 'bergman engineering', 'verita', 'grafton',
  'cyclad', 'link group', 'connectis', 'huntly', 'talent place', 'kevin edward',
  // globalne korpo
  'nokia', 'ericsson', 'intel', 'samsung', 'huawei', 'motorola', 'ibm', 'google',
  'microsoft', 'amazon', 'siemens', 'bosch', 'continental', 'aptiv', 'zf', 'valeo',
];

// Keywords wag dla newsów: 3 = regulacje, 2 = inwestycje/AI/R&D.
export const NEWS_W3 = ['cra', 'cyber resilience', 'nis2', 'ai act', 'podatnoś*', 'cyberbezpiecz*'];
export const NEWS_W2 = ['sztuczn*', ' ai ', 'r&d', 'inwestyc*', 'rekrutuj*', 'cto', 'automatyzac*', 'modernizac*'];

// Branżowe RSS (portale AVT o polskiej elektronice/automatyce) — dopasowanie do znanych firm.
export const BRANCH_RSS = [
  { url: 'https://elektronikab2b.pl/rss', zrodlo: 'elektronikab2b.pl' },
  { url: 'https://automatykab2b.pl/rss', zrodlo: 'automatykab2b.pl' },
];
