#!/usr/bin/env node
// REA Web Analyzer – eszközregiszter generátor.
//
// Előállítja a tool-registry.json-t a REA TÉNYLEGES forrásaiból:
//   1) <REA_HOME>/docs/product-catalog.json  – hiteles eszköz/provider/CLI leltár
//   2) `rea capabilities --json`              – futásidejű elérhetőség + mellékhatások
//   3) bin/tool-metadata.mjs                  – magyar nevek/leírások, kategóriák
//
// Használat:
//   node bin/generate-tool-registry.mjs [--rea-home <út>] [--rea-cmd "<parancs>"] [--out <fájl>]
// Alapértelmezések a config/config.php-ból jöhetnek; itt env/argumentum vezérel.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveChromium } from "./chromium.mjs";

import { FAMILIES, PROVIDERS, TOOLS_HU, WEB_PROFILES } from "./tool-metadata.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const REA_HOME = resolve(arg("--rea-home", process.env.REA_HOME || "/home/user/rea-src"));
// A rea hívható parancs: vagy globális `rea`, vagy `node <REA_HOME>/scripts/rea.mjs`.
const REA_CMD = arg("--rea-cmd", process.env.REA_CMD || `node ${join(REA_HOME, "scripts", "rea.mjs")}`);
const OUT = resolve(arg("--out", join(ROOT, "tool-registry.json")));

function fail(msg) {
  console.error(`[generate-tool-registry] HIBA: ${msg}`);
  process.exit(1);
}

// 1) product-catalog.json
const catalogPath = join(REA_HOME, "docs", "product-catalog.json");
if (!existsSync(catalogPath)) {
  fail(
    `Nem találom a REA product-catalog.json-t itt: ${catalogPath}. Add meg a --rea-home kapcsolóval a REA gyökerét.`,
  );
}
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));

// 2) rea capabilities --json  (ha nem fut, üres elérhetőséggel folytatjuk, de jelezzük)
let capabilities = [];
let capabilitiesError = null;
try {
  const [bin, ...rest] = REA_CMD.split(" ");
  const out = execFileSync(bin, [...rest, "capabilities", "--json"], {
    cwd: REA_HOME,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120000,
  });
  const parsed = JSON.parse(out);
  capabilities = parsed.capabilities || [];
} catch (err) {
  capabilitiesError = String(err && err.message ? err.message : err).slice(0, 400);
  console.error(`[generate-tool-registry] figyelmeztetés: a 'rea capabilities' nem futott: ${capabilitiesError}`);
}

const capByOp = new Map();
for (const c of capabilities) capByOp.set(c.operation, c);

// Böngésző-készültség valós próbája: a REA build megvan (ezt a capabilities futása
// implikálja), a web-eszközökhöz Chromium/Chrome kell. Ez a user gépén futva az ő
// környezetét tükrözi, nem állítunk vakon működést.
const chrome = resolveChromium(arg("--chrome", process.env.CHROME_PATH || null));
const browserReady = Boolean(chrome.path);
const BROWSER_FAMILY_IDS = new Set(["browser"]);

// provider-index capability → provider[] (melyik motor tudja az adott műveletet)
const providersByCap = new Map();
for (const p of catalog.providers || []) {
  for (const cap of p.capabilities || []) {
    if (!providersByCap.has(cap)) providersByCap.set(cap, []);
    providersByCap.get(cap).push(p.id);
  }
}

// CLI parancs leképezés: snake_case tool → kebab-case CLI (ha létezik)
const cliSet = new Set(catalog.cli?.commands || []);
function cliFor(toolName) {
  const kebab = toolName.replace(/_/g, "-");
  return cliSet.has(kebab) ? kebab : null;
}

// 3) eszközök összeállítása
const familyByTool = new Map();
for (const fam of catalog.tools.families) {
  for (const t of fam.tools) familyByTool.set(t, fam);
}

const tools = [];
for (const fam of catalog.tools.families) {
  const famMeta = FAMILIES[fam.id] || {
    category: fam.id,
    description: "",
    targets: [],
    url: "no",
  };
  for (const toolName of fam.tools) {
    const [nameHu, descHu] = TOOLS_HU[toolName] || [toolName, ""];
    let cap = capByOp.get(toolName);
    // A böngésző-család elérhetőségét a Chromium-próba adja (a capabilities nem sorolja).
    if (!cap && BROWSER_FAMILY_IDS.has(fam.id)) {
      cap = browserReady
        ? {
            operation: toolName,
            available: true,
            reason: `Chromium elérhető (${chrome.source}: ${chrome.path})`,
            availability_code: "ready",
            effects: { launches_process: true, may_access_network: true },
            limitations: ["A célpontot a worker indítja távoli hibakeresésű böngészőben; csak loopback CDP-végpont engedélyezett."],
          }
        : {
            operation: toolName,
            available: false,
            reason: "Nem található Chromium/Chrome. Telepítsd, vagy állítsd be a CHROME_PATH-t a config-ban.",
            availability_code: "missing_dependency",
            effects: null,
            limitations: [],
          };
    }
    const providerIds = providersByCap.get(toolName) || [];
    const providerNotes = providerIds.map((id) => ({
      id,
      name: (catalog.providers.find((p) => p.id === id) || {}).name || id,
      ...(PROVIDERS[id] || {}),
    }));
    tools.push({
      id: toolName,
      name_en: toolName,
      name_hu: nameHu,
      description_hu: descHu,
      family: fam.id,
      surface: fam.surface,
      category: famMeta.category,
      target_formats: famMeta.targets,
      url_applicable: famMeta.url, // yes | conditional | no
      cli_command: cliFor(toolName),
      providers: providerNotes,
      // futásidejű állapot a rea capabilities-ből:
      availability: cap
        ? {
            available: cap.available === true,
            reason: cap.reason || null,
            code: cap.availability_code || null,
            effects: cap.effects || null,
            limitations: cap.limitations || [],
          }
        : {
            available: null, // ismeretlen (a capabilities nem adott adatot erre)
            reason: capabilitiesError ? "A 'rea capabilities' nem futott." : "Nincs capability-adat erre a műveletre.",
            code: null,
            effects: null,
            limitations: [],
          },
    });
  }
}

// weboldalra alkalmazható + elérhető eszközök gyors halmaza (a frontend/worker is használja)
const urlTools = tools.filter((t) => t.url_applicable === "yes");

const registry = {
  generated_at: new Date().toISOString(),
  source: {
    rea_home: REA_HOME,
    rea_cmd: REA_CMD,
    rea_version: catalog.package?.version || null,
    product_catalog_sha_present: Boolean(catalog.runtime_catalog?.digests?.tools_sha256),
    capabilities_ok: capabilitiesError === null,
    capabilities_error: capabilitiesError,
    chromium: { path: chrome.path, source: chrome.source, ready: browserReady },
  },
  counts: {
    mcp_tools_total: catalog.tools.total,
    cli_commands: catalog.cli?.primary_count ?? (catalog.cli?.commands || []).length,
    mcp_prompts: catalog.runtime_catalog?.counts?.mcp_prompts ?? null,
    providers: (catalog.providers || []).length,
    url_applicable_tools: urlTools.length,
    available_now: tools.filter((t) => t.availability.available === true).length,
    unavailable_now: tools.filter((t) => t.availability.available === false).length,
    unknown_now: tools.filter((t) => t.availability.available === null).length,
  },
  families: catalog.tools.families.map((f) => ({
    id: f.id,
    surface: f.surface,
    count: f.count,
    ...(FAMILIES[f.id] || {}),
  })),
  providers: (catalog.providers || []).map((p) => ({
    ...p,
    ...(PROVIDERS[p.id] || {}),
  })),
  web_profiles: WEB_PROFILES,
  tools,
};

writeFileSync(OUT, JSON.stringify(registry, null, 2) + "\n", "utf8");
console.log(
  `[generate-tool-registry] kész: ${OUT}\n` +
    `  MCP eszközök: ${registry.counts.mcp_tools_total} | CLI parancsok: ${registry.counts.cli_commands} | providerek: ${registry.counts.providers}\n` +
    `  elérhető most: ${registry.counts.available_now} | nem elérhető: ${registry.counts.unavailable_now} | ismeretlen: ${registry.counts.unknown_now}\n` +
    `  weboldalra alkalmazható: ${registry.counts.url_applicable_tools}` +
    (capabilitiesError ? `\n  FIGYELEM: capabilities hiba: ${capabilitiesError}` : ""),
);
