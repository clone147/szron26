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
export const JOB_KEYWORDS = [
  'embedded', 'c++', 'firmware', 'stm32', 'qt', 'rtos',
  'ai', 'machine learning', ' ml ', 'computer vision', 'sztuczn',
];

// Keywords wag dla newsów: 3 = regulacje, 2 = inwestycje/AI/R&D.
export const NEWS_W3 = ['cra', 'cyber resilience', 'nis2', 'ai act', 'podatnoś', 'cyberbezpiecz'];
export const NEWS_W2 = ['sztuczn', ' ai ', 'r&d', 'inwestyc', 'rekrutuj', 'cto', 'automatyzac', 'modernizac'];
