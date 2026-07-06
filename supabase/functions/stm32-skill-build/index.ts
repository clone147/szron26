// stm32-skill-build — generuje ZIP skilla stm32f429-disco (oryginał lub wersja
// skonfigurowana pod płytkę usera). Tylko dla zalogowanych (JWT w Authorization).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { zipSync, strToU8 } from "https://esm.sh/fflate@0.8.2";
import { SKILL_FILES } from "./files.ts";
import { SKILL_TEMPLATE } from "./template.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Cfg = Record<string, unknown>;

// pole: [default, regex walidacji]
const FIELDS: Record<string, [string, RegExp]> = {
  skillName: ["stm32f429-disco", /^[a-z0-9][a-z0-9-]{1,40}$/],
  mcuModel: ["STM32F429ZITx", /^[\w+-]{4,32}$/],
  core: ["Cortex-M4F", /^[\w .+-]{2,32}$/],
  sysclkMhz: ["168", /^\d{1,4}$/],
  hseMhz: ["25", /^\d{1,3}(\.\d+)?$/],
  flashSize: ["2MB", /^[\w .]{2,16}$/],
  ramDesc: ["192KB RAM + 64KB CCM", /^[\w .+()-]{2,64}$/],
  flashTotalHex: ["0x200000", /^0x[0-9A-Fa-f]{1,8}$/],
  configSector: ["13", /^\d{1,3}$/],
  configAddr: ["0x08104000", /^0x[0-9A-Fa-f]{6,8}$/],
  heapSizeHex: ["0x10000", /^0x[0-9A-Fa-f]{1,8}$/],
  startupFile: ["startup_stm32f429xx.s", /^[\w.-]{3,64}$/],
  projectDir: [
    "C:\\Users\\Tomek\\Desktop\\Hot\\LTDC_RTOS_CYCLE_24_http_no_label\\LTDC_RTOS_CYCLE_24_http_no_label\\LTDC_Display_2Layers",
    /^[^"<>|*?\r\n]{3,260}$/,
  ],
  targetName: ["STM32F429I-Discovery", /^[\w .+-]{2,64}$/],
  outputHex: ["lcd_config.hex", /^[\w.-]{3,64}\.hex$/],
  versionFile: ["Src/lcd64x64.c", /^[\w./\\-]{3,128}$/],
  uv4Path: ["C:\\Keil_v5\\UV4\\UV4.exe", /^[^"<>|*?\r\n]{3,260}$/],
  compilerDesc: ["ARM Compiler 5.06u7 (Keil MDK 5.37)", /^[\w .()+-]{2,64}$/],
  programmerCli: [
    "C:\\Program Files\\STMicroelectronics\\STM32Cube\\STM32CubeProgrammer\\bin\\STM32_Programmer_CLI.exe",
    /^[^"<>|*?\r\n]{3,260}$/,
  ],
  deviceIp: ["10.10.1.131", /^\d{1,3}(\.\d{1,3}){3}$/],
  phy: ["DP83848", /^[\w .+-]{2,32}$/],
  netStack: ["FreeRTOS + CycloneTCP 1.7.2 (Oryx)", /^[\w .()+-]{2,64}$/],
  displayType: ["Matryca HUB75", /^[\w .()+/-]{2,48}$/],
  displayRes: ["64x64", /^\d{1,4}x\d{1,4}$/],
};

const ORIGINAL_VALUES: Record<string, string> = Object.fromEntries(
  Object.entries(FIELDS).map(([k, [d]]) => [k, d]),
);

function b64decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const td = new TextDecoder();

function renderTemplate(cfg: Record<string, string>, network: boolean, display: boolean): string {
  let t = SKILL_TEMPLATE;
  // sekcje warunkowe
  for (const [flag, on] of [["NETWORK", network], ["DISPLAY", display]] as const) {
    const re = new RegExp(`<!-- IF:${flag} -->([\\s\\S]*?)<!-- ENDIF:${flag} -->`, "g");
    t = t.replace(re, on ? "$1" : "");
  }
  const map: Record<string, string> = {
    SKILL_NAME: cfg.skillName, TARGET_NAME: cfg.targetName, MCU_MODEL: cfg.mcuModel,
    CORE: cfg.core, SYSCLK_MHZ: cfg.sysclkMhz, HSE_MHZ: cfg.hseMhz,
    FLASH_SIZE: cfg.flashSize, RAM_DESC: cfg.ramDesc, FLASH_TOTAL_HEX: cfg.flashTotalHex,
    CONFIG_SECTOR: cfg.configSector, CONFIG_ADDR: cfg.configAddr,
    HEAP_SIZE_HEX: cfg.heapSizeHex, STARTUP_FILE: cfg.startupFile,
    PROJECT_DIR: cfg.projectDir, OUTPUT_HEX: cfg.outputHex, VERSION_FILE: cfg.versionFile,
    UV4_PATH: cfg.uv4Path, COMPILER_DESC: cfg.compilerDesc,
    PROGRAMMER_CLI: cfg.programmerCli,
    PROGRAMMER_CLI_NAME: cfg.programmerCli.split("\\").pop() ?? "STM32_Programmer_CLI.exe",
    DEVICE_IP: cfg.deviceIp, NET_STACK: cfg.netStack, PHY: cfg.phy,
    DISPLAY_TYPE: cfg.displayType, DISPLAY_RES: cfg.displayRes,
  };
  return t.replace(/\{\{(\w+)\}\}/g, (_, k) => map[k] ?? "");
}

// Podmiana wartości oryginału na wartości usera w references/ i scripts/.
function adaptText(text: string, cfg: Record<string, string>): string {
  const pairs: [string, string][] = [
    [ORIGINAL_VALUES.projectDir, cfg.projectDir],
    [ORIGINAL_VALUES.uv4Path, cfg.uv4Path],
    [ORIGINAL_VALUES.programmerCli, cfg.programmerCli],
    [ORIGINAL_VALUES.deviceIp, cfg.deviceIp],
    [ORIGINAL_VALUES.outputHex, cfg.outputHex],
    [ORIGINAL_VALUES.configAddr, cfg.configAddr],
    [ORIGINAL_VALUES.startupFile, cfg.startupFile],
    ["0x200000", cfg.flashTotalHex],
    ["freq=168", `freq=${cfg.sysclkMhz}`],
    ["STM32F429ZITx", cfg.mcuModel],
    ["STM32F429I-Discovery", cfg.targetName],
  ];
  for (const [from, to] of pairs) {
    if (from && from !== to) text = text.split(from).join(to);
  }
  return text;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  // Auth — tylko zalogowani userzy Supabase
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
  const { data: { user } } = await supa.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Wymagane logowanie" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  let body: { variant?: string; config?: Cfg } = {};
  try { body = await req.json(); } catch { /* pusty body = oryginał */ }
  const variant = body.variant === "custom" ? "custom" : "original";

  const files: Record<string, Uint8Array> = {};
  let zipName = "stm32f429-disco.zip";

  if (variant === "original") {
    for (const [path, b64] of Object.entries(SKILL_FILES)) {
      files[`stm32f429-disco/${path}`] = b64decode(b64);
    }
  } else {
    // walidacja + defaulty
    const raw = (body.config ?? {}) as Record<string, unknown>;
    const cfg: Record<string, string> = {};
    for (const [key, [def, re]] of Object.entries(FIELDS)) {
      const v = raw[key] === undefined || raw[key] === "" ? def : String(raw[key]).trim();
      if (!re.test(v)) {
        return new Response(JSON.stringify({ error: `Nieprawidłowa wartość pola ${key}` }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      }
      cfg[key] = v;
    }
    const network = raw.networkEnabled !== false;
    const display = raw.displayEnabled !== false;
    const root = cfg.skillName;
    zipName = `${root}.zip`;

    files[`${root}/SKILL.md`] = strToU8(renderTemplate(cfg, network, display));
    for (const [path, b64] of Object.entries(SKILL_FILES)) {
      if (path === "SKILL.md") continue;
      if (!network && (path === "references/network-apps.md" || path === "scripts/stress.ps1")) continue;
      files[`${root}/${path}`] = strToU8(adaptText(td.decode(b64decode(b64)), cfg));
    }
  }

  const zip = zipSync(files, { level: 6 });
  return new Response(zip.slice().buffer, {
    headers: {
      ...CORS,
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
    },
  });
});
