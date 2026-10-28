import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://127.0.0.1:8080";
const OUT = process.argv[3] || "/tmp";
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";

const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto(BASE + "/", { waitUntil: "networkidle" });
await p.waitForSelector("#go");
await p.screenshot({ path: OUT + "/01-kezdolap.png", fullPage: true });
await p.goto(BASE + "/#/katalogus", { waitUntil: "networkidle" });
await p.waitForSelector("#tools .row");
await p.screenshot({ path: OUT + "/02-katalogus.png", fullPage: false });
await p.goto(BASE + "/#/diagnosztika", { waitUntil: "networkidle" });
await p.waitForSelector(".stat");
await p.screenshot({ path: OUT + "/03-diagnosztika.png", fullPage: true });
// legutóbbi elemzés megnyitása
const jobs = await (await fetch(BASE + "/api/jobs")).json();
if (jobs.jobs && jobs.jobs[0]) {
  await p.goto(BASE + "/#/elemzes/" + jobs.jobs[0].id, { waitUntil: "networkidle" });
  await p.waitForSelector(".analysis", { timeout: 10000 }).catch(() => {});
  await p.screenshot({ path: OUT + "/04-elemzes.png", fullPage: true });
}
// mobil nézet
const pm = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
await pm.goto(BASE + "/", { waitUntil: "networkidle" });
await pm.waitForSelector("#go");
await pm.screenshot({ path: OUT + "/05-mobil.png", fullPage: true });
await b.close();
console.log("screenshots kész:", OUT);
