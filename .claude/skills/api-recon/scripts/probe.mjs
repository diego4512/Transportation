#!/usr/bin/env node
// Non-destruktív live szonda a forrásból ismert route-okra.
// CSAK felhatalmazott/saját célon! Alapból csak GET-eket küld.
//
// Használat:
//   node probe.mjs <baseUrl> [--base /utas] [--delay 200] [--writes]
// Pl.:
//   node probe.mjs http://127.0.0.1:8787
//   node probe.mjs http://gep --base /utas
//
// --writes: engedélyezi a POST/DELETE próbát is (jól formált, egyetlen hívás).
//           Alapból KI van kapcsolva, hogy ne hozzon létre/töröljön állapotot.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const baseUrl = (process.argv[2] ?? '').replace(/\/$/, '');
if (!baseUrl || baseUrl.startsWith('--')) {
  console.error('Add meg a cél baseUrl-t, pl.: node probe.mjs http://127.0.0.1:8787');
  process.exit(1);
}
const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const basePath = (arg('--base', '') || '').replace(/\/$/, '');
const delayMs = Number(arg('--delay', '200'));
const allowWrites = process.argv.includes('--writes');

// Route-ok a statikus kinyerőből (így egyben marad az igazság forrása).
const extractor = resolve(here, 'extract-routes.mjs');
const res = spawnSync(process.execPath, [extractor], { encoding: 'utf8' });
if (res.status !== 0) { console.error(res.stderr); process.exit(1); }
const { routes } = JSON.parse(res.stdout);

// Ártalmatlan minta-értékek út-paraméterekhez (nem valós adat → 404/400 várható,
// ami épp a felderítés célja: létezik-e az út, milyen hibát ad).
const sample = { id: 'PROBE', sub: 'PROBE', q: 'test' };
const fillPath = (p) => p.replace(/:([A-Za-z0-9_]+)/g, (_, k) => sample[k] ?? 'PROBE');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const trunc = (s, n = 160) => (s.length > n ? s.slice(0, n) + '…' : s);

console.log(`# Cél: ${baseUrl}${basePath}  (writes: ${allowWrites ? 'ON' : 'off'})\n`);

for (const r of routes) {
  if (r.method !== 'GET' && !allowWrites) {
    console.log(`SKIP  ${r.method.padEnd(6)} ${r.path}  (writes off)`);
    continue;
  }
  const url = `${baseUrl}${basePath}${fillPath(r.path)}`;
  try {
    const started = Date.now();
    const resp = await fetch(url, {
      method: r.method,
      headers: r.method === 'GET' ? {} : { 'content-type': 'application/json' },
      // Üres body → szándékosan kiváltja a validációs hibaüzenetet (paraméter-felderítés).
      body: r.method === 'GET' ? undefined : '{}',
      redirect: 'manual',
    });
    const text = await resp.text();
    const ct = resp.headers.get('content-type') ?? '';
    let hint = '';
    if (ct.includes('application/json')) {
      try { const j = JSON.parse(text); if (j.error) hint = ` err="${trunc(j.error, 80)}"`; } catch {}
    } else if (ct.includes('text/html')) {
      hint = ' (SPA fallback / HTML)';
    }
    const ms = Date.now() - started;
    console.log(`${String(resp.status).padEnd(4)} ${r.method.padEnd(6)} ${r.path}  [${resp.status} ${ct.split(';')[0]} ${text.length}b ${ms}ms]${hint}`);
  } catch (e) {
    console.log(`ERR  ${r.method.padEnd(6)} ${r.path}  ${e.message}`);
  }
  await sleep(delayMs);
}
