import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';

export const gtfsDbPath = () => path.join(config.dataDir, 'gtfs.sqlite');
export const appDbPath = () => path.join(config.dataDir, 'app.sqlite');

let gtfs: DatabaseSync | null = null;
let app: DatabaseSync | null = null;

/** A GTFS menetrend adatbázis (csak olvasásra). Null, ha még nem volt import. */
export function gtfsDb(): DatabaseSync | null {
  if (gtfs) return gtfs;
  if (!fs.existsSync(gtfsDbPath())) return null;
  gtfs = new DatabaseSync(gtfsDbPath(), { readOnly: true });
  return gtfs;
}

/** Import után újranyitjuk az új fájlt. */
export function reopenGtfsDb() {
  gtfs?.close();
  gtfs = null;
  return gtfsDb();
}

/** Az alkalmazás saját adatai: push feliratkozások, figyelések, késés-statisztika. */
export function appDb(): DatabaseSync {
  if (app) return app;
  fs.mkdirSync(config.dataDir, { recursive: true });
  app = new DatabaseSync(appDbPath());
  app.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      endpoint TEXT UNIQUE NOT NULL,
      json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS watches (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      params TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT '{}',
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS watches_sub ON watches(subscription_id);
    CREATE TABLE IF NOT EXISTS delay_obs (
      route_id TEXT NOT NULL,
      trip_id TEXT NOT NULL,
      service_date TEXT NOT NULL,
      stop_id TEXT NOT NULL,
      hour INTEGER NOT NULL,
      dow INTEGER NOT NULL,
      delay_sec INTEGER NOT NULL,
      observed_at INTEGER NOT NULL,
      PRIMARY KEY (trip_id, service_date, stop_id)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS delay_obs_route ON delay_obs(route_id, hour);
  `);
  return app;
}
