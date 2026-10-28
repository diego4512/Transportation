// Böngésző-munkamenet: a worker INDÍTJA a Chromiumot egy izolált profillal és
// efemer, loopback távoli-hibakeresési porttal, ránavigál a (már SSRF-ellenőrzött)
// URL-re, majd a REA passzív CDP-eszközei ehhez csatlakoznak. A böngészőt kizárólag
// ez a modul birtokolja és állítja le.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";

function httpGetJson(url, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class BrowserSession {
  constructor(chromePath, logFn = () => {}) {
    this.chromePath = chromePath;
    this.log = logFn;
    this.proc = null;
    this.profileDir = null;
    this.port = null;
    this.endpoint = null;
  }

  async launch(targetUrl, { navTimeoutMs = 20000 } = {}) {
    if (!this.chromePath || !existsSync(this.chromePath)) {
      throw new Error("Nem található Chromium/Chrome. Állítsd be a CHROME_PATH-t.");
    }
    this.profileDir = mkdtempSync(join(tmpdir(), "rea-profile-"));
    const args = [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      "--remote-debugging-port=0", // efemer port; a DevToolsActivePort fájlból olvassuk ki
      `--user-data-dir=${this.profileDir}`,
      targetUrl, // már normalizált + SSRF-ellenőrzött URL, argumentumként (nincs shell)
    ];
    this.log(`Chromium indítása: ${this.chromePath}`);
    this.proc = spawn(this.chromePath, args, { stdio: ["ignore", "pipe", "pipe"] });
    this.proc.stderr.on("data", () => {}); // dbus-zaj elnyelése
    this.proc.on("exit", (code) => this.log(`Chromium kilépett (code=${code}).`));

    // Port kiolvasása a DevToolsActivePort fájlból
    const portFile = join(this.profileDir, "DevToolsActivePort");
    const deadline = Date.now() + navTimeoutMs;
    while (Date.now() < deadline) {
      if (existsSync(portFile)) {
        const txt = readFileSync(portFile, "utf8").trim().split("\n");
        this.port = parseInt(txt[0], 10);
        if (this.port > 0) break;
      }
      await sleep(150);
    }
    if (!this.port) throw new Error("A böngésző nem nyitott távoli-hibakeresési portot időben.");
    this.endpoint = `http://127.0.0.1:${this.port}`;

    // Várjuk, amíg a CDP /json/version válaszol
    while (Date.now() < deadline) {
      try {
        await httpGetJson(`${this.endpoint}/json/version`);
        break;
      } catch {
        await sleep(150);
      }
    }
    this.log(`CDP-végpont kész: ${this.endpoint}`);
    // Rövid idő a célnavigáció beindulására (a REA maga is megfigyeli)
    await sleep(800);
    return this.endpoint;
  }

  /** A cél-URL origójához tartozó page célpont megkeresése a /json listából. */
  async pickTarget(targetOrigin) {
    const deadline = Date.now() + 10000;
    let last = [];
    while (Date.now() < deadline) {
      try {
        const list = await httpGetJson(`${this.endpoint}/json`);
        last = list.filter((t) => t.type === "page");
        const match = last.find((t) => {
          try {
            return new URL(t.url).origin === targetOrigin;
          } catch {
            return false;
          }
        });
        if (match) return match.id;
        if (last.length) return last[0].id; // van page, de még navigál – az elsőt visszaadjuk
      } catch {
        /* retry */
      }
      await sleep(300);
    }
    if (last.length) return last[0].id;
    throw new Error("Nem található page-célpont a böngészőben.");
  }

  async close() {
    try {
      if (this.proc && !this.proc.killed) this.proc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    await sleep(300);
    try {
      if (this.proc && !this.proc.killed) this.proc.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    if (this.profileDir) {
      try {
        rmSync(this.profileDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}
