// Konfigurator skilla stm32f429-disco: stan formularza, podgląd, auth, pobieranie ZIP.
// Auth: dowolne konto Google (bez allowlisty zespołu — gate tylko „zalogowany").
import { getClient, getSessionUser, waitForSession, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';

const FN_URL = `${SUPABASE_URL}/functions/v1/stm32-skill-build`;

export const FIELDS = [
  { group: 'Nazwa skilla', items: [
    { id: 'skillName', label: 'Nazwa (slug) skilla', def: 'stm32f429-disco', hint: 'małe litery, cyfry, myślniki' },
    { id: 'targetName', label: 'Nazwa płytki / targetu Keil', def: 'STM32F429I-Discovery' },
  ]},
  { group: 'MCU', items: [
    { id: 'mcuModel', label: 'Model MCU', def: 'STM32F429ZITx' },
    { id: 'core', label: 'Rdzeń', def: 'Cortex-M4F' },
    { id: 'sysclkMhz', label: 'SYSCLK [MHz]', def: '168' },
    { id: 'hseMhz', label: 'HSE [MHz]', def: '25' },
    { id: 'flashSize', label: 'Flash', def: '2MB' },
    { id: 'ramDesc', label: 'RAM (opis)', def: '192KB RAM + 64KB CCM' },
  ]},
  { group: 'Pamięć', items: [
    { id: 'flashTotalHex', label: 'Rozmiar Flash (hex, do backupu)', def: '0x200000' },
    { id: 'configSector', label: 'Sektor konfiguracji', def: '13' },
    { id: 'configAddr', label: 'Adres konfiguracji', def: '0x08104000' },
    { id: 'heapSizeHex', label: 'Heap_Size (hex)', def: '0x10000' },
    { id: 'startupFile', label: 'Plik startup', def: 'startup_stm32f429xx.s' },
  ]},
  { group: 'Toolchain i projekt', items: [
    { id: 'projectDir', label: 'Katalog projektu (Windows)', def: 'C:\\Users\\Tomek\\Desktop\\Hot\\LTDC_RTOS_CYCLE_24_http_no_label\\LTDC_RTOS_CYCLE_24_http_no_label\\LTDC_Display_2Layers', wide: true },
    { id: 'uv4Path', label: 'Ścieżka UV4.exe (Keil)', def: 'C:\\Keil_v5\\UV4\\UV4.exe', wide: true },
    { id: 'compilerDesc', label: 'Kompilator (opis)', def: 'ARM Compiler 5.06u7 (Keil MDK 5.37)' },
    { id: 'programmerCli', label: 'Ścieżka STM32_Programmer_CLI.exe', def: 'C:\\Program Files\\STMicroelectronics\\STM32Cube\\STM32CubeProgrammer\\bin\\STM32_Programmer_CLI.exe', wide: true },
    { id: 'outputHex', label: 'Plik wynikowy (.hex)', def: 'lcd_config.hex' },
    { id: 'versionFile', label: 'Plik z bannerem wersji buildu', def: 'Src/lcd64x64.c' },
  ]},
  { group: 'Sieć', toggle: 'networkEnabled', toggleLabel: 'Płytka ma stos sieciowy (Ethernet)', items: [
    { id: 'deviceIp', label: 'Statyczne IP urządzenia', def: '10.10.1.131' },
    { id: 'phy', label: 'Układ PHY', def: 'DP83848' },
    { id: 'netStack', label: 'RTOS / stos TCP', def: 'FreeRTOS + CycloneTCP 1.7.2 (Oryx)' },
  ]},
  { group: 'Wyświetlacz', toggle: 'displayEnabled', toggleLabel: 'Płytka ma wyświetlacz / matrycę', items: [
    { id: 'displayType', label: 'Typ wyświetlacza', def: 'Matryca HUB75' },
    { id: 'displayRes', label: 'Rozdzielczość', def: '64x64' },
  ]},
];

export function readConfig(root) {
  const cfg = {};
  for (const g of FIELDS) {
    if (g.toggle) cfg[g.toggle] = root.querySelector(`#f-${g.toggle}`)?.checked !== false;
    for (const f of g.items) {
      const el = root.querySelector(`#f-${f.id}`);
      cfg[f.id] = (el?.value || f.def).trim();
    }
  }
  return cfg;
}

// Podgląd — tabela „Environment facts" wygenerowanego SKILL.md
export function renderPreview(cfg) {
  const rows = [
    ['Project', cfg.projectDir],
    ['Keil project', `MDK-ARM\\Project.uvprojx, target ${cfg.targetName}, output MDK-ARM\\Output_file\\${cfg.outputHex}`],
    ['MCU', `${cfg.mcuModel}, ${cfg.core} @ ${cfg.sysclkMhz} MHz (HSE ${cfg.hseMhz} MHz), ${cfg.flashSize} Flash, ${cfg.ramDesc}`],
    ['Compiler', `${cfg.compilerDesc}, ${cfg.uv4Path}`],
    ['Programmer', `${cfg.programmerCli}, ST-Link`],
  ];
  if (cfg.networkEnabled) {
    rows.push(['Device IP', `${cfg.deviceIp} (static, Flash sector ${cfg.configSector} @ ${cfg.configAddr})`]);
    rows.push(['RTOS / stack', cfg.netStack]);
  }
  if (cfg.displayEnabled) rows.push(['Display', `${cfg.displayType} ${cfg.displayRes}`]);
  const w = Math.max(...rows.map(r => r[0].length));
  return `---\nname: ${cfg.skillName}\n---\n\n# ${cfg.targetName} Application Builder\n\n## Environment facts\n\n` +
    rows.map(([k, v]) => `| ${k.padEnd(w)} | ${v} |`).join('\n') +
    (cfg.networkEnabled ? '' : '\n\n(sekcje sieciowe i references/network-apps.md usunięte)');
}

export async function currentUser() {
  return await getSessionUser();
}

// Logowanie Google z powrotem prosto na /stm32-skill (bez callbacku strefy — brak allowlisty).
export async function signInForDownload() {
  const { error } = await getClient().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/stm32-skill?logged=1`,
      queryParams: { prompt: 'select_account' },
    },
  });
  return { error: error?.message || null };
}

export async function finishLoginIfReturning() {
  if (!new URLSearchParams(window.location.search).has('logged')) return null;
  const user = await waitForSession(25);
  history.replaceState(null, '', window.location.pathname);
  return user;
}

export async function downloadSkill(variant, cfg) {
  const { data } = await getClient().auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return { error: 'auth' };
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(variant === 'custom' ? { variant, config: cfg } : { variant }),
  });
  if (res.status === 401) return { error: 'auth' };
  if (!res.ok) {
    let msg = `Błąd serwera (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
    return { error: msg };
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const name = /filename="([^"]+)"/.exec(cd)?.[1] || 'stm32-skill.zip';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { error: null, name };
}
