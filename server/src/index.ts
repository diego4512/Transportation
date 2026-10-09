import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import { config, hasRealtime } from './config.ts';
import { apiRoutes } from './routes/api.ts';
import { gtfsReady } from './gtfs/queries.ts';
import { startWatcher } from './services/watcher.ts';
import { vapidKeys } from './services/push.ts';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

await app.register(cors, { origin: true });

app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
  const status = err.statusCode ?? 500;
  if (status >= 500) app.log.error(err);
  reply.status(status).send({ error: err.message });
});

await app.register(apiRoutes);

// Éles módban a lefordított webappot is a szerver szolgálja ki (SPA fallback-kel).
if (fs.existsSync(config.webDist)) {
  await app.register(fastifyStatic, {
    root: config.webDist,
    // A hash-elt assetek örökre gyorsítótárazhatók; az index.html és a service worker soha.
    setHeaders(res, file) {
      res.setHeader('Cache-Control', /[\\/]assets[\\/]/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'Nincs ilyen végpont' });
    return reply.sendFile('index.html');
  });
}

vapidKeys();
startWatcher();

await app.listen({ port: config.port, host: config.host });
app.log.info(`Valós idejű adat: ${hasRealtime() ? 'BE (BKK API kulcs megadva)' : 'KI – csak menetrend (állítsd be a BKK_API_KEY-t)'}`);
if (!gtfsReady()) app.log.warn('A GTFS menetrend még nincs betöltve – futtasd: npm run gtfs:import');
