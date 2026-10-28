import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const CHROME = "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";
const B = "http://127.0.0.1:8090/";
const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
// desktop + kiválasztott kocsi
const p = await b.newPage({ viewport: { width: 1100, height: 820 } });
await p.goto(B, { waitUntil: "networkidle" });
await p.waitForSelector(".trainbar .car");
// kattints az első ülés-térképes kocsira (Kocsi 1)
const cars = await p.$$(".trainbar .car");
for (const c of cars) { const t = await c.getAttribute("class"); if (!t.includes("loco")) { await c.click(); break; } }
await p.waitForSelector(".seatmap .seat");
await p.screenshot({ path: "/tmp/wagon-desktop.png", fullPage: true });
// mobil
const pm = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
await pm.goto(B, { waitUntil: "networkidle" });
await pm.waitForSelector(".trainbar .car");
const cars2 = await pm.$$(".trainbar .car");
for (const c of cars2) { const t = await c.getAttribute("class"); if (!t.includes("loco")) { await c.click(); break; } }
await pm.waitForSelector(".seatmap .seat");
await pm.screenshot({ path: "/tmp/wagon-mobile.png", fullPage: true });
await b.close();
console.log("kész");
