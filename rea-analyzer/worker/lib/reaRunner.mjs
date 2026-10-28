// A valódi `rea` CLI biztonságos meghívása. SOHA nincs shell: execFile argumentum-
// tömbbel, így parancsinjektálás kizárt. A kimenet a REA JSON-borítékja.

import { execFile } from "node:child_process";

/**
 * @param {object} cfg  – { reaCmd: string, reaHome: string }
 *   reaCmd pl. "rea" vagy "node /út/rea-src/scripts/rea.mjs"
 * @param {string[]} args – CLI argumentumok (parancs + kapcsolók), külön elemekként
 * @param {object} opts – { timeoutMs, signal }
 * @returns {Promise<{ok:boolean, data?:any, raw:string, error?:object, exitCode:number}>}
 */
export function runRea(cfg, args, opts = {}) {
  const parts = cfg.reaCmd.split(" ").filter(Boolean);
  const bin = parts[0];
  const prefix = parts.slice(1); // pl. ["/.../scripts/rea.mjs"]
  const fullArgs = [...prefix, ...args, "--json"];

  return new Promise((resolve) => {
    const child = execFile(
      bin,
      fullArgs,
      {
        cwd: cfg.reaHome,
        encoding: "utf8",
        timeout: opts.timeoutMs || 120000,
        maxBuffer: 128 * 1024 * 1024,
        signal: opts.signal,
        env: { ...process.env },
      },
      (err, stdout, stderr) => {
        const raw = (stdout || "") + (stderr || "");
        let data = null;
        // A REA a hibát is JSON-ként adja a stdout-ra; próbáljuk a stdout-ot elsőként.
        const tryParse = (s) => {
          try {
            return JSON.parse(s);
          } catch {
            return null;
          }
        };
        data = tryParse(stdout) || tryParse(raw);
        if (data && data.error) {
          return resolve({
            ok: false,
            data,
            raw,
            error: {
              message: data.error,
              code: data.code || null,
              category: data.category || null,
              details: data.details || null,
              remediation: data.remediation || null,
            },
            exitCode: err && typeof err.code === "number" ? err.code : err ? 1 : 0,
          });
        }
        if (err && !data) {
          return resolve({
            ok: false,
            raw,
            error: {
              message: err.killed
                ? "Időtúllépés / megszakítás."
                : (stderr || err.message || "A rea parancs meghiúsult.").slice(0, 600),
              code: err.killed ? "timeout" : "process_error",
              category: "execution",
            },
            exitCode: typeof err.code === "number" ? err.code : 1,
          });
        }
        resolve({ ok: true, data, raw, exitCode: 0 });
      },
    );
    if (opts.onChild) opts.onChild(child);
  });
}

/** Egyszerű, cél nélküli diagnosztikai hívások (version, capabilities). */
export async function reaVersion(cfg) {
  const parts = cfg.reaCmd.split(" ").filter(Boolean);
  return new Promise((resolve) => {
    execFile(parts[0], [...parts.slice(1), "--version"], { cwd: cfg.reaHome, encoding: "utf8", timeout: 30000 }, (err, out) => {
      resolve((out || "").trim() || null);
    });
  });
}
