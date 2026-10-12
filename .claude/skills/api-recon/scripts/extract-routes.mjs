#!/usr/bin/env node
// Statikus route-kinyerő a Fastify forrásból. Nem futtatja az appot.
// Használat: node extract-routes.mjs [server/src/routes/api.ts]
// Kimenet: JSON a stdout-ra (metódus, út, út-paraméterek, query/body kulcsok).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..', '..');
const fileArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const file = fileArg ?? resolve(repoRoot, 'server/src/routes/api.ts');

const src = readFileSync(file, 'utf8');
const lines = src.split('\n');

// app.get('/api/...', async (req) => { ... })  →  blokkonként
const routeRe = /app\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/;
const routes = [];

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(routeRe);
  if (!m) continue;
  const [, method, path] = m;

  // A handler törzsét durván a következő route-ig / fájl végéig olvassuk.
  let j = i + 1;
  let body = lines[i];
  for (; j < lines.length && !routeRe.test(lines[j]); j++) body += '\n' + lines[j];

  const pathParams = [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((x) => x[1]);

  // Query kulcsok: q.<key>, req.query as { key?: ... }, destrukturálás.
  const query = new Set();
  for (const x of body.matchAll(/\bq\.([A-Za-z0-9_]+)/g)) query.add(x[1]);
  for (const x of body.matchAll(/query as \{([^}]*)\}/g)) {
    for (const k of x[1].matchAll(/([A-Za-z0-9_]+)\s*\??:/g)) query.add(k[1]);
  }
  for (const x of body.matchAll(/const \{([^}]*)\} = req\.query/g)) {
    for (const k of x[1].split(',')) { const t = k.trim(); if (t) query.add(t); }
  }

  // Body kulcsok: req.body as { ... }, body?.<key>, params?.<key>.
  const bodyKeys = new Set();
  if (method !== 'get') {
    for (const x of body.matchAll(/body as \{([^}]*)\}/g)) {
      for (const k of x[1].matchAll(/([A-Za-z0-9_]+)\s*\??:/g)) bodyKeys.add(k[1]);
    }
    for (const x of body.matchAll(/\bparams[.?]+([A-Za-z0-9_]+)/g)) bodyKeys.add(x[1]);
  }

  routes.push({
    method: method.toUpperCase(),
    path,
    pathParams,
    query: [...query].sort(),
    body: [...bodyKeys].sort(),
  });
}

const out = {
  source: file.replace(repoRoot + '/', ''),
  note: 'Éles módban a BASE_PATH (pl. /utas) prefixet add az út elé.',
  count: routes.length,
  routes,
};

if (process.argv.includes('--table')) {
  for (const r of routes) {
    const p = r.pathParams.length ? ` {path: ${r.pathParams.join(', ')}}` : '';
    const q = r.query.length ? ` {query: ${r.query.join(', ')}}` : '';
    const b = r.body.length ? ` {body: ${r.body.join(', ')}}` : '';
    console.log(`${r.method.padEnd(6)} ${r.path}${p}${q}${b}`);
  }
} else {
  console.log(JSON.stringify(out, null, 2));
}
