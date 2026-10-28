// Chromium/Chrome feloldó – a generátor és a worker is használja.
// Sorrend: explicit path (arg/env) → Playwright bundled → rendszer-chrome/chromium.
// Windows (XAMPP) és Linux útvonalakat egyaránt próbál. Nem indít semmit, csak keres.

import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const WIN = process.platform === "win32";

function fromWhich(name) {
  try {
    const cmd = WIN ? "where" : "which";
    const out = execFileSync(cmd, [name], { encoding: "utf8", timeout: 5000 });
    const line = out.split(/\r?\n/).find((l) => l.trim());
    return line && existsSync(line.trim()) ? line.trim() : null;
  } catch {
    return null;
  }
}

/**
 * @param {string|null} explicit – config/env által megadott pontos útvonal
 * @returns {{path:string|null, source:string}}
 */
export function resolveChromium(explicit) {
  if (explicit && existsSync(explicit)) return { path: explicit, source: "config" };

  const envPath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
  if (envPath && existsSync(envPath)) return { path: envPath, source: "env" };

  const candidates = WIN
    ? [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      ]
    : [
        "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/snap/bin/chromium",
      ];
  for (const c of candidates) if (existsSync(c)) return { path: c, source: "known-path" };

  // Playwright által letöltött böngésző (bármely verzió) – csak Linux/common
  if (!WIN) {
    for (const base of ["/opt/pw-browsers", `${process.env.HOME || ""}/.cache/ms-playwright`]) {
      try {
        const dirs = execFileSync("sh", ["-c", `ls -d ${base}/chromium-*/chrome-linux*/chrome 2>/dev/null | head -1`], {
          encoding: "utf8",
          timeout: 5000,
        }).trim();
        if (dirs && existsSync(dirs)) return { path: dirs, source: "playwright" };
      } catch {
        /* ignore */
      }
    }
  }

  for (const name of WIN ? ["chrome.exe", "msedge.exe"] : ["google-chrome", "chromium", "chromium-browser"]) {
    const p = fromWhich(name);
    if (p) return { path: p, source: "PATH" };
  }
  return { path: null, source: "none" };
}
