/**
 * GTFS import: letölti a BKK menetrendi csomagot, és egy kompakt SQLite adatbázisba tölti.
 *
 *   npm run gtfs:import                 # letöltés a GTFS_URL-ről
 *   npm run gtfs:import -- --file x.zip # helyi zip fájlból
 *
 * Az új adatbázis ideiglenes fájlba készül, és csak siker esetén cseréli le a régit.
 */
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import yauzl from 'yauzl';
import { parse } from 'csv-parse';
import { config } from '../config.ts';
import { gtfsDbPath } from '../db.ts';
import { parseGtfsTime } from '../time.ts';
import { normalizeText } from './normalize.ts';

const SCHEMA = `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE routes (
    idx INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, agency TEXT, short_name TEXT, long_name TEXT,
    type INTEGER, color TEXT, text_color TEXT, desc TEXT, sort INTEGER
  );
  CREATE TABLE stops (
    idx INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, name TEXT, name_norm TEXT, lat REAL, lon REAL,
    code TEXT, location_type INTEGER, parent TEXT, wheelchair INTEGER
  );
  CREATE INDEX stops_latlon ON stops(lat, lon);
  CREATE TABLE services (idx INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL);
  CREATE TABLE calendar_dates (service_idx INTEGER, date INTEGER, exception INTEGER);
  CREATE TABLE shape_ids (idx INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL);
  CREATE TABLE shapes (
    shape_idx INTEGER, seq INTEGER, lat REAL, lon REAL, dist REAL,
    PRIMARY KEY (shape_idx, seq)
  ) WITHOUT ROWID;
  CREATE TABLE trips (
    idx INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, route_idx INTEGER, service_idx INTEGER,
    headsign TEXT, direction INTEGER, shape_idx INTEGER, wheelchair INTEGER, bikes INTEGER
  );
  CREATE TABLE stop_times (
    trip_idx INTEGER, seq INTEGER, stop_idx INTEGER, arr INTEGER, dep INTEGER, dist REAL, headsign TEXT,
    PRIMARY KEY (trip_idx, seq)
  ) WITHOUT ROWID;
  CREATE TABLE stop_routes (stop_idx INTEGER, route_idx INTEGER, PRIMARY KEY (stop_idx, route_idx)) WITHOUT ROWID;
`;

const POST_INDEXES = `
  CREATE INDEX calendar_dates_date ON calendar_dates(date);
  CREATE INDEX stop_times_stop_dep ON stop_times(stop_idx, dep);
  CREATE INDEX trips_route ON trips(route_idx);
  INSERT INTO stop_routes SELECT DISTINCT st.stop_idx, t.route_idx FROM stop_times st JOIN trips t ON t.idx = st.trip_idx;
  ANALYZE;
`;

type Row = Record<string, string>;

function openZip(file: string): Promise<{ zip: yauzl.ZipFile; entries: Map<string, yauzl.Entry> }> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: false }, (err, zip) => {
      if (err || !zip) return reject(err);
      const entries = new Map<string, yauzl.Entry>();
      zip.on('entry', (e: yauzl.Entry) => { entries.set(path.basename(e.fileName), e); zip.readEntry(); });
      zip.on('end', () => resolve({ zip, entries }));
      zip.on('error', reject);
      zip.readEntry();
    });
  });
}

async function eachRow(zip: yauzl.ZipFile, entry: yauzl.Entry | undefined, fn: (r: Row) => void) {
  if (!entry) return 0;
  const stream: Readable = await new Promise((res, rej) =>
    zip.openReadStream(entry, (err, s) => (err || !s ? rej(err) : res(s))));
  const parser = stream.pipe(parse({ columns: true, bom: true, relax_quotes: true, skip_empty_lines: true }));
  let n = 0;
  for await (const r of parser) { fn(r as Row); n++; }
  return n;
}

/** Tranzakciókba csomagolt beszúrás – nagy táblákhoz nagyságrendekkel gyorsabb. */
function batched(db: DatabaseSync, stmt: StatementSync, size = 50_000) {
  let n = 0;
  db.exec('BEGIN');
  return {
    run(...args: (string | number | null)[]) {
      stmt.run(...args);
      if (++n % size === 0) { db.exec('COMMIT'); db.exec('BEGIN'); }
    },
    done() { db.exec('COMMIT'); return n; },
  };
}

const num = (s: string | undefined) => (s === undefined || s === '' ? null : Number(s));

async function download(url: string, dest: string) {
  console.log(`Letöltés: ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`GTFS letöltés sikertelen: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(dest));
}

export async function importGtfs(opts: { file?: string } = {}) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  let zipFile = opts.file;
  if (!zipFile) {
    zipFile = path.join(config.dataDir, 'gtfs.zip');
    await download(config.gtfsUrl, zipFile);
  }
  const tmp = gtfsDbPath() + '.tmp';
  fs.rmSync(tmp, { force: true });
  const db = new DatabaseSync(tmp);
  db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA temp_store = MEMORY; PRAGMA cache_size = -200000;');
  db.exec(SCHEMA);

  const { zip, entries } = await openZip(zipFile);
  const t0 = Date.now();
  const log = (what: string, n: number) => console.log(`  ${what}: ${n.toLocaleString('hu-HU')} sor (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

  // routes
  const routeIdx = new Map<string, number>();
  {
    const b = batched(db, db.prepare('INSERT INTO routes VALUES (?,?,?,?,?,?,?,?,?,?)'));
    await eachRow(zip, entries.get('routes.txt'), (r) => {
      const idx = routeIdx.size + 1; routeIdx.set(r.route_id, idx);
      b.run(idx, r.route_id, r.agency_id ?? null, r.route_short_name ?? '', r.route_long_name ?? '', num(r.route_type),
        r.route_color || null, r.route_text_color || null, r.route_desc || null, num(r.route_sort_order));
    });
    log('routes', b.done());
  }
  // stops
  const stopIdx = new Map<string, number>();
  {
    const b = batched(db, db.prepare('INSERT INTO stops VALUES (?,?,?,?,?,?,?,?,?,?)'));
    await eachRow(zip, entries.get('stops.txt'), (r) => {
      const idx = stopIdx.size + 1; stopIdx.set(r.stop_id, idx);
      b.run(idx, r.stop_id, r.stop_name, normalizeText(r.stop_name), Number(r.stop_lat), Number(r.stop_lon),
        r.stop_code || null, num(r.location_type) ?? 0, r.parent_station || null, num(r.wheelchair_boarding));
    });
    log('stops', b.done());
  }
  // calendar_dates (+ calendar.txt, ha van)
  const serviceIdx = new Map<string, number>();
  const svc = (id: string) => {
    let i = serviceIdx.get(id);
    if (!i) { i = serviceIdx.size + 1; serviceIdx.set(id, i); }
    return i;
  };
  {
    const b = batched(db, db.prepare('INSERT INTO calendar_dates VALUES (?,?,?)'));
    await eachRow(zip, entries.get('calendar.txt'), (r) => {
      // calendar.txt kibontása napi bejegyzésekre, hogy egyetlen lekérdezési út legyen
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const s = r.start_date, e = r.end_date;
      let d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
      const end = new Date(Date.UTC(+e.slice(0, 4), +e.slice(4, 6) - 1, +e.slice(6, 8)));
      for (; d <= end; d = new Date(d.getTime() + 86400_000)) {
        if (r[days[d.getUTCDay()]] === '1') {
          b.run(svc(r.service_id), d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(), 1);
        }
      }
    });
    await eachRow(zip, entries.get('calendar_dates.txt'), (r) => b.run(svc(r.service_id), Number(r.date), Number(r.exception_type)));
    log('calendar_dates', b.done());
  }
  // shapes
  const shapeIdx = new Map<string, number>();
  {
    const b = batched(db, db.prepare('INSERT INTO shapes VALUES (?,?,?,?,?)'));
    await eachRow(zip, entries.get('shapes.txt'), (r) => {
      let idx = shapeIdx.get(r.shape_id);
      if (!idx) { idx = shapeIdx.size + 1; shapeIdx.set(r.shape_id, idx); }
      b.run(idx, Number(r.shape_pt_sequence), Number(r.shape_pt_lat), Number(r.shape_pt_lon), num(r.shape_dist_traveled));
    });
    log('shapes', b.done());
  }
  // trips
  const tripIdx = new Map<string, number>();
  {
    const b = batched(db, db.prepare('INSERT INTO trips VALUES (?,?,?,?,?,?,?,?,?)'));
    await eachRow(zip, entries.get('trips.txt'), (r) => {
      const idx = tripIdx.size + 1; tripIdx.set(r.trip_id, idx);
      b.run(idx, r.trip_id, routeIdx.get(r.route_id) ?? null, svc(r.service_id), r.trip_headsign ?? '',
        num(r.direction_id), r.shape_id ? (shapeIdx.get(r.shape_id) ?? null) : null, num(r.wheelchair_accessible), num(r.bikes_allowed));
    });
    log('trips', b.done());
  }
  // stop_times – a legnagyobb tábla (~ több millió sor)
  {
    const b = batched(db, db.prepare('INSERT INTO stop_times VALUES (?,?,?,?,?,?,?)'), 100_000);
    await eachRow(zip, entries.get('stop_times.txt'), (r) => {
      const t = tripIdx.get(r.trip_id), s = stopIdx.get(r.stop_id);
      if (!t || !s) return;
      const arr = r.arrival_time ? parseGtfsTime(r.arrival_time) : null;
      const dep = r.departure_time ? parseGtfsTime(r.departure_time) : arr;
      b.run(t, Number(r.stop_sequence), s, arr ?? dep, dep, num(r.shape_dist_traveled), r.stop_headsign || null);
    });
    log('stop_times', b.done());
  }
  const feed: Row = {};
  await eachRow(zip, entries.get('feed_info.txt'), (r) => Object.assign(feed, r));
  zip.close();

  console.log('Indexek építése…');
  db.exec(POST_INDEXES);
  const meta = db.prepare('INSERT INTO meta VALUES (?,?)');
  meta.run('imported_at', String(Date.now()));
  meta.run('feed_version', feed.feed_version ?? '');
  meta.run('feed_start_date', feed.feed_start_date ?? '');
  meta.run('feed_end_date', feed.feed_end_date ?? '');
  db.close();
  fs.renameSync(tmp, gtfsDbPath());
  console.log(`Kész: ${gtfsDbPath()} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // `--file x.zip` vagy egyszerűen egy .zip útvonal (az npm néha elnyeli a kapcsolót)
  const i = process.argv.indexOf('--file');
  const file = i > 0 ? process.argv[i + 1] : process.argv.slice(2).find((a) => a.endsWith('.zip'));
  importGtfs({ file: file ? path.resolve(file) : undefined }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
