// UI füst-teszt: valódi böngészőben betölti az appot, ellenőrzi a JS-hibákat,
// a kezdőlap kitöltődését, majd végigfuttat egy elemzést a felületről.
// Használat: node tests/js/ui-smoke.mjs [baseUrl]  (alap: http://127.0.0.1:8080)
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8080";
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";

let failed = false;
const assert = (cond, msg) => {
  console.log((cond ? "✓ " : "✗ ") + msg);
  if (!cond) failed = true;
};

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

try {
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForSelector("#go", { timeout: 10000 });
  const bodyText = await page.textContent("body");
  assert(bodyText.includes("126"), "Kezdőlap mutatja a 126 MCP-eszközt (registry betöltve)");
  assert(bodyText.includes("weboldalra alkalmazható"), "Statisztikák megjelennek");
  assert(errors.length === 0, "Nincs JS konzol-/oldalhiba a kezdőlapon" + (errors.length ? ": " + errors.join(" | ") : ""));

  // Katalógus
  await page.goto(BASE + "/#/katalogus", { waitUntil: "networkidle" });
  await page.waitForSelector("#tools .row", { timeout: 10000 });
  const toolCount = await page.$$eval("#tools .row", (els) => els.length);
  assert(toolCount > 50, `Katalógus listáz eszközöket (${toolCount} sor)`);

  // Diagnosztika
  await page.goto(BASE + "/#/diagnosztika", { waitUntil: "networkidle" });
  await page.waitForSelector(".stat", { timeout: 10000 });
  const diagText = await page.textContent("body");
  assert(diagText.includes("PHP"), "Diagnosztika mutatja a PHP-t");

  // Teljes elemzés a felületről (loopback tesztoldal)
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.fill("#url", "http://127.0.0.1:3000/");
  await page.selectOption("#profile", "gyors-web");
  await page.selectOption("#depth", "sekely");
  await page.click("#go");
  await page.waitForFunction(() => location.hash.startsWith("#/elemzes/"), { timeout: 10000 });
  assert(true, "Elemzés indítása után átnavigál az elemzési nézetre");
  // Megvárjuk a befejezést
  await page.waitForFunction(
    () => document.body.textContent.includes("Állapot: done") || document.body.textContent.includes("Állapot: error"),
    { timeout: 60000 },
  );
  const finalText = await page.textContent("body");
  assert(finalText.includes("Állapot: done"), "Az elemzés a felületen sikeresen befejeződött (done)");
} catch (e) {
  console.log("✗ Kivétel: " + e.message);
  failed = true;
} finally {
  await browser.close();
}
console.log(failed ? "\nEREDMÉNY: SIKERTELEN" : "\nEREDMÉNY: SIKERES");
process.exit(failed ? 1 : 0);
