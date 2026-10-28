#!/usr/bin/env node
// REA Web Analyzer – perzisztens Node worker.
// Figyeli a storage/jobs sort, és minden "queued" jobot feldolgoz:
//   URL újra-ellenőrzés (SSRF) → Chromium indítása → célpont kiválasztása →
//   a profil szerinti REA web-eszközök futtatása (shell nélkül, arg-tömbbel) →
//   bizonyíték-gyűjtés → eredmény + jelentés összeállítása.
//
// A PHP SOHA nem indít folyamatot; csak job.json-t ír. A folyamatindítás itt,
// a nem webre kitett workerben történik, szigorú validációval.

import { readFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

import { JobStore } from "./lib/jobStore.mjs";
import { guardUrl } from "./lib/urlGuard.mjs";
import { runRea } from "./lib/reaRunner.mjs";
import { BrowserSession } from "./lib/browserSession.mjs";
import { buildPlan, depthParams } from "./lib/planner.mjs";
import { resolveChromium } from "../bin/chromium.mjs";
import { inspectPlugin, installPlugin } from "./lib/pluginRunner.mjs";
import { readdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadConfig() {
  const p = join(ROOT, "config", "config.json");
  if (!existsSync(p)) {
    console.error(`[worker] Hiányzik a config: ${p}. Másold a config.sample.json-ból.`);
    process.exit(1);
  }
  const cfg = JSON.parse(readFileSync(p, "utf8"));
  cfg.storage_dir = resolve(ROOT, cfg.storage_dir || "storage");
  cfg.rea_home = resolve(cfg.rea_home);
  return cfg;
}

const cfg = loadConfig();
const store = new JobStore(join(cfg.storage_dir, "jobs"));
const chrome = resolveChromium(cfg.chrome_path || null);
const reaCfg = { reaCmd: cfg.rea_cmd, reaHome: cfg.rea_home };
const registry = JSON.parse(readFileSync(join(ROOT, "tool-registry.json"), "utf8"));
const TOOL_HU = new Map(registry.tools.map((t) => [t.id, t.name_hu]));

function logLine(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try {
    mkdirSync(join(cfg.storage_dir, "logs"), { recursive: true });
    appendFileSync(join(cfg.storage_dir, "logs", "worker.log"), line);
  } catch {
    /* ignore */
  }
}

// ---- Eszköz-végrehajtók (weboldal) ----
// Mindegyik egy REA-borítékot ad vissza futtatás után; a ctx tartja az endpoint-ot,
// a targetId-t, a mélység-paramétereket és a capture-útvonalakat.

async function execTool(toolId, ctx, signal) {
  const d = ctx.depth;
  const { endpoint, targetId } = ctx;
  const timeoutMs = Math.min(cfg.max_tool_runtime_ms || 60000, cfg.max_job_runtime_ms || 180000);
  const common = { timeoutMs, signal };

  switch (toolId) {
    case "list_browser_targets":
      return runRea(reaCfg, ["list-browser-targets", endpoint], common);

    case "inspect_web_page": {
      const args = ["inspect-web-page", endpoint, targetId, "--observation-ms", String(d.observationMs)];
      // Web-elemzéshez értékes, de nem titok-szivárogtató mezők:
      args.push("--include-script-sources", "--include-json-body-shapes", "--include-websocket-shapes");
      if (d.includeAll) args.push("--include-accessibility-text", "--include-storage-keys");
      const r = await runRea(reaCfg, args, { ...common, timeoutMs: timeoutMs });
      if (r.ok && r.data) writeFileSync(join(ctx.captures, "inspect_web_page.json"), JSON.stringify(r.data), "utf8");
      return r;
    }

    case "analyze_web_bundle": {
      const args = ["analyze-web-bundle", endpoint, targetId];
      if (d.fetchSourceMaps) args.push("--fetch-source-maps");
      const r = await runRea(reaCfg, args, common);
      if (r.ok && r.data) writeFileSync(join(ctx.captures, "analyze_web_bundle.json"), JSON.stringify(r.data), "utf8");
      return r;
    }

    case "discover_webmcp_tools":
      return runRea(reaCfg, ["discover-webmcp-tools", endpoint, targetId, "--observation-ms", "400"], common);

    case "observe_web_session":
      return runRea(reaCfg, ["observe-web-session", endpoint, targetId, "--observation-ms", String(d.sessionMs)], {
        ...common,
        timeoutMs: d.sessionMs + 15000,
      });

    case "capture_web_screenshot":
      return runRea(reaCfg, ["capture-web-screenshot", endpoint, targetId], common);

    case "export_web_scripts": {
      // Mentett capture kell (inspect vagy analyze). Üres kimeneti könyvtár.
      const cap = ["inspect_web_page.json", "analyze_web_bundle.json"]
        .map((f) => join(ctx.captures, f))
        .find((p) => existsSync(p));
      if (!cap) {
        return { ok: false, error: { message: "Nincs korábbi capture az export-web-scripts számára.", code: "no_capture" } };
      }
      const outDir = join(ctx.captures, `exported-scripts-${Date.now()}`);
      return runRea(reaCfg, ["export-web-scripts", cap, outDir], common);
    }

    case "capture_browser_scenario": {
      // Aktív út: minimális, érvényes forgatókönyv – a REA saját böngészőt indít/zár.
      const scenario = {
        browser: { mode: "launch", executable_path: chrome.path },
        start_url: { url: ctx.url },
        actions: [{ step_id: "settle", action: "wait_for_timeout", duration_ms: Math.min(d.observationMs, 2000) }],
        capture: { at_end: ["dom", "accessibility", "url"] },
      };
      const sp = join(ctx.captures, "scenario.json");
      writeFileSync(sp, JSON.stringify(scenario), "utf8");
      return runRea(reaCfg, ["capture-browser-scenario", sp], { ...common, timeoutMs: 90000 });
    }

    default:
      return { ok: false, error: { message: `Ismeretlen/nem támogatott eszköz: ${toolId}`, code: "unsupported" } };
  }
}

// Egy step normalizált kivonata az eredmény-aggregációhoz
function stepSummary(toolId, r) {
  if (!r.ok) {
    return { evidence_id: null, error: r.error || { message: "Ismeretlen hiba." }, facts: {} };
  }
  const n = (r.data && r.data.normalized_result) || {};
  const facts = {};
  if (Array.isArray(n.scripts)) facts.scripts = n.scripts.length;
  if (Array.isArray(n.resources)) facts.resources = n.resources.length;
  if (Array.isArray(n.targets)) facts.targets = n.targets.length;
  if (n.observations) facts.observations = Array.isArray(n.observations) ? n.observations.length : Object.keys(n.observations).length;
  if (Array.isArray(n.inferences)) facts.inferences = n.inferences.length;
  if (Array.isArray(n.unknowns)) facts.unknowns = n.unknowns.length;
  return {
    evidence_id: (r.data && r.data.evidence_id) || null,
    provider: (r.data && r.data.provider && r.data.provider.id) || null,
    completeness: n.completeness || null,
    limitations: n.limitations || [],
    unknowns: n.unknowns || [],
    facts,
    error: null,
  };
}

async function processJob(id) {
  const job = store.readJson(id, "job.json");
  if (!job) return;
  const now = () => new Date().toISOString();

  const status = {
    id,
    url: job.url,
    profile: job.profile,
    depth: job.depth,
    active: Boolean(job.active),
    state: "running",
    created_at: job.created_at || now(),
    started_at: now(),
    finished_at: null,
    plan: [],
    dropped: [],
    progress: { total: 0, completed: 0 },
    steps: [],
    error: null,
  };
  const save = () => store.writeJson(id, "status.json", status);

  const log = (m) => logLine(`[job ${id}] ${m}`);
  log(`indul: profil=${job.profile} mélység=${job.depth} aktív=${job.active}`);
  save();

  // 1) SSRF újra-ellenőrzés
  const guard = await guardUrl(job.url, { allowLoopback: Boolean(cfg.allow_loopback_targets) });
  if (!guard.ok) {
    status.state = "error";
    status.error = { message: `URL elutasítva: ${guard.error}`, code: "ssrf_blocked" };
    status.finished_at = now();
    save();
    log(`URL elutasítva: ${guard.error}`);
    return;
  }
  status.url = guard.url;
  status.origin = guard.origin;

  // 2) Terv
  const plan = buildPlan({
    profiles: registry.web_profiles,
    profileId: job.profile,
    customTools: job.tools,
    registry,
    active: Boolean(job.active),
  });
  status.plan = plan.steps;
  status.dropped = plan.dropped;
  status.progress.total = plan.steps.length;
  status.steps = plan.steps.map((tid) => ({
    id: tid,
    name_hu: TOOL_HU.get(tid) || tid,
    state: "pending",
    started_at: null,
    finished_at: null,
    evidence_id: null,
    summary: null,
    error: null,
  }));
  save();

  if (!plan.steps.length) {
    status.state = "error";
    status.error = { message: "A kiválasztott profil/eszközök egyike sem futtatható weboldalra.", code: "empty_plan" };
    status.finished_at = now();
    save();
    return;
  }

  // 3) Böngésző indítása
  const session = new BrowserSession(chrome.path, log);
  const controller = new AbortController();
  const deadline = Date.now() + (cfg.max_job_runtime_ms || 180000);
  const ctx = { url: guard.url, origin: guard.origin, depth: depthParams(job.depth), captures: store.capturesDir(id) };

  try {
    await session.launch(guard.url, { navTimeoutMs: 20000 });
    ctx.endpoint = session.endpoint;
    ctx.targetId = await session.pickTarget(guard.origin);
    log(`célpont: ${ctx.targetId} @ ${ctx.endpoint}`);
  } catch (e) {
    status.state = "error";
    status.error = { message: `Böngésző indítása sikertelen: ${String(e.message || e)}`, code: "browser_launch_failed" };
    status.finished_at = now();
    save();
    await session.close();
    return;
  }

  // 4) Lépések futtatása
  const results = [];
  for (let i = 0; i < plan.steps.length; i++) {
    const toolId = plan.steps[i];
    const step = status.steps[i];

    if (store.isCancelled(id)) {
      step.state = "skipped";
      step.error = { message: "Megszakítva a felhasználó által." };
      status.state = "cancelled";
      continue;
    }
    if (Date.now() > deadline) {
      step.state = "skipped";
      step.error = { message: "Globális időkeret kimerült." };
      status.state = "error";
      status.error = status.error || { message: "Időtúllépés.", code: "timeout" };
      continue;
    }

    step.state = "running";
    step.started_at = now();
    save();
    log(`→ ${toolId}`);

    let r;
    try {
      r = await execTool(toolId, ctx, controller.signal);
    } catch (e) {
      r = { ok: false, error: { message: String(e.message || e), code: "exec_error" } };
    }

    const summary = stepSummary(toolId, r);
    store.writeStep(id, toolId, { tool: toolId, ok: r.ok, result: r.data || null, error: r.error || null });
    step.finished_at = now();
    step.evidence_id = summary.evidence_id;
    step.summary = summary.facts;
    if (r.ok) {
      step.state = "done";
    } else {
      step.state = "error";
      step.error = r.error || { message: "Ismeretlen hiba." };
    }
    status.progress.completed = i + 1;
    results.push({ toolId, ...summary });
    save();
  }

  await session.close();

  // 5) Eredmény + jelentés aggregálása
  const unknowns = [];
  const limitations = [];
  const errors = [];
  const evidenceIds = [];
  for (const res of results) {
    if (res.evidence_id) evidenceIds.push(res.evidence_id);
    for (const u of res.unknowns || []) unknowns.push({ tool: res.toolId, item: u });
    for (const l of res.limitations || []) limitations.push({ tool: res.toolId, note: l });
    if (res.error) errors.push({ tool: res.toolId, error: res.error });
  }
  const result = {
    id,
    url: guard.url,
    origin: guard.origin,
    profile: job.profile,
    depth: job.depth,
    generated_at: now(),
    counts: {
      steps: plan.steps.length,
      succeeded: results.filter((r) => !r.error).length,
      failed: errors.length,
      evidence: evidenceIds.length,
    },
    steps: status.steps.map((s) => ({ id: s.id, name_hu: s.name_hu, state: s.state, evidence_id: s.evidence_id, facts: s.summary, error: s.error })),
    observed_facts: results.filter((r) => !r.error).map((r) => ({ tool: r.toolId, evidence_id: r.evidence_id, facts: r.facts, completeness: r.completeness })),
    unknowns,
    limitations,
    errors,
    evidence_ids: evidenceIds,
    dropped: plan.dropped,
  };
  store.writeJson(id, "result.json", result);

  if (status.state !== "cancelled" && status.state !== "error") status.state = "done";
  status.finished_at = now();
  save();
  log(`kész: állapot=${status.state} siker=${result.counts.succeeded}/${result.counts.steps}`);
}

// ---- Bővítmény-jobok ----
function pluginJobsDir() {
  return join(cfg.storage_dir, "plugin-jobs");
}
async function processPluginJob(jid) {
  const dir = join(pluginJobsDir(), jid);
  const reqPath = join(dir, "req.json");
  if (!existsSync(reqPath)) return;
  let req;
  try {
    req = JSON.parse(readFileSync(reqPath, "utf8"));
  } catch {
    return;
  }
  const write = (obj) => {
    const tmp = join(dir, ".result.json.tmp");
    writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
    import("node:fs").then((fs) => fs.renameSync(tmp, join(dir, "result.json")));
  };
  logLine(`[plugin ${jid}] ${req.action} ${req.repo_url}`);
  try {
    let res;
    if (req.action === "inspect") res = await inspectPlugin(cfg, req);
    else if (req.action === "install") res = await installPlugin(cfg, req, join(cfg.storage_dir, "plugins"));
    else res = { ok: false, error: "Ismeretlen művelet." };
    write({ state: "done", ...res });
  } catch (e) {
    write({ state: "done", ok: false, error: String(e.message || e).slice(0, 400) });
  }
}
function tickPlugins() {
  const base = pluginJobsDir();
  if (!existsSync(base)) return;
  for (const jid of readdirSync(base)) {
    const dir = join(base, jid);
    if (!existsSync(join(dir, "req.json"))) continue;
    if (existsSync(join(dir, "result.json"))) continue;
    if (existsSync(join(dir, "claimed"))) continue;
    try {
      writeFileSync(join(dir, "claimed"), "", { flag: "wx" });
    } catch {
      continue;
    }
    processPluginJob(jid).catch((e) => logLine(`[plugin ${jid}] hiba: ${String(e)}`));
  }
}

// ---- Fő ciklus ----
let running = 0;
async function tick() {
  if (running >= (cfg.max_concurrent_jobs || 1)) return;
  for (const id of store.listIds()) {
    const job = store.readJson(id, "job.json");
    const status = store.readJson(id, "status.json");
    const alreadyHandled = status && status.state && status.state !== "queued";
    if (!job || alreadyHandled) continue;
    if (store.exists(id, "claimed")) continue;
    if (!store.tryClaim(id)) continue;
    running++;
    processJob(id)
      .catch((e) => logLine(`[job ${id}] feldolgozási hiba: ${String(e.stack || e)}`))
      .finally(() => {
        running--;
      });
    if (running >= (cfg.max_concurrent_jobs || 1)) break;
  }
}

function writeDiagnosticsHeartbeat() {
  try {
    store; // noop
    const diag = {
      updated_at: new Date().toISOString(),
      worker: "alive",
      chromium: { path: chrome.path, source: chrome.source, ready: Boolean(chrome.path) },
      rea_home: cfg.rea_home,
      rea_cmd: cfg.rea_cmd,
    };
    writeFileSync(join(cfg.storage_dir, "worker-heartbeat.json"), JSON.stringify(diag, null, 2), "utf8");
  } catch {
    /* ignore */
  }
}

logLine(`REA Web Analyzer worker indul. REA_HOME=${cfg.rea_home} chrome=${chrome.path || "NINCS"} (${chrome.source})`);
writeDiagnosticsHeartbeat();
setInterval(() => {
  writeDiagnosticsHeartbeat();
  tick().catch((e) => logLine(`tick hiba: ${String(e)}`));
  if (cfg.plugins_enabled !== false) {
    try {
      tickPlugins();
    } catch (e) {
      logLine(`plugin tick hiba: ${String(e)}`);
    }
  }
}, cfg.poll_interval_ms || 1000);
