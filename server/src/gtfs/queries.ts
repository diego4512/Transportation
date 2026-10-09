/** Lekérdezések a helyi GTFS adatbázisból (menetrend, megállók, útvonal-geometria). */
import { gtfsDb } from '../db.ts';
import { addDays, nowSec, serviceDayStart, ymd } from '../time.ts';
import { normalizeText } from './normalize.ts';
import type { Departure, RouteInfo, StopInfo, TripDetails, TripStop } from '../types.ts';

function db() {
  const d = gtfsDb();
  if (!d) throw Object.assign(new Error('A menetrend még nincs betöltve. Futtasd: npm run gtfs:import'), { statusCode: 503 });
  return d;
}

export const gtfsReady = () => gtfsDb() !== null;

export function feedMeta(): Record<string, string> {
  const d = gtfsDb();
  if (!d) return {};
  const rows = d.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// ---- Járatok (routes) ----

type RouteRow = { idx: number; id: string; short_name: string; long_name: string; type: number; color: string | null; text_color: string | null; desc: string | null };

const routeCache = new Map<number, RouteInfo>();
function toRoute(r: RouteRow): RouteInfo {
  return {
    id: r.id, shortName: r.short_name, longName: r.long_name || r.desc || '', type: r.type,
    color: r.color ? `#${r.color}` : '#555555', textColor: r.text_color ? `#${r.text_color}` : '#ffffff',
  };
}
function routeByIdx(idx: number): RouteInfo {
  let r = routeCache.get(idx);
  if (!r) {
    r = toRoute(db().prepare('SELECT * FROM routes WHERE idx = ?').get(idx) as RouteRow);
    routeCache.set(idx, r);
  }
  return r;
}
export function routeById(id: string): RouteInfo | null {
  const row = db().prepare('SELECT * FROM routes WHERE id = ?').get(id) as RouteRow | undefined;
  return row ? toRoute(row) : null;
}

// ---- Megállók ----

type StopRow = { idx: number; id: string; name: string; lat: number; lon: number; code: string | null; location_type: number; parent: string | null; wheelchair: number | null };

function routesForStopIdx(idx: number): RouteInfo[] {
  const rows = db().prepare('SELECT route_idx FROM stop_routes WHERE stop_idx = ?').all(idx) as { route_idx: number }[];
  return rows.map((r) => routeByIdx(r.route_idx)).sort(compareRoutes);
}

function compareRoutes(a: RouteInfo, b: RouteInfo) {
  return a.type - b.type || a.shortName.localeCompare(b.shortName, 'hu', { numeric: true });
}

function toStop(r: StopRow, withRoutes = true, distance?: number): StopInfo {
  return {
    id: r.id, name: r.name, lat: r.lat, lon: r.lon, code: r.code, parent: r.parent,
    wheelchair: r.wheelchair === 1 ? true : r.wheelchair === 2 ? false : null,
    routes: withRoutes ? routesForStopIdx(r.idx) : [],
    ...(distance !== undefined ? { distance: Math.round(distance) } : {}),
  };
}

export function stopById(id: string): StopInfo | null {
  const r = db().prepare('SELECT * FROM stops WHERE id = ?').get(id) as StopRow | undefined;
  return r ? toStop(r) : null;
}

/**
 * Megállókeresés név alapján. Az azonos nevű peronokat egy csoportba vonja,
 * így a "Deák Ferenc tér" egyszer jelenik meg, az összes járatával.
 */
export function searchStops(q: string, limit = 20) {
  const n = normalizeText(q);
  if (n.length < 2) return [];
  const rows = db().prepare(`
    SELECT * FROM stops
    WHERE location_type = 0 AND (name_norm LIKE ? OR name_norm LIKE ?)
    ORDER BY (name_norm LIKE ?) DESC, length(name) LIMIT 400
  `).all(`${n}%`, `% ${n}%`, `${n}%`) as StopRow[];
  // Előre a névvel kezdődő találatok, azon belül a több járattal rendelkező (fontosabb) csomópontok.
  return groupStops(rows)
    .sort((a, b) => Number(normalizeText(b.name).startsWith(n)) - Number(normalizeText(a.name).startsWith(n)) || b.routes.length - a.routes.length)
    .slice(0, limit);
}

export function nearbyStops(lat: number, lon: number, radius = 500, limit = 30) {
  const dLat = radius / 111_320;
  const dLon = radius / (111_320 * Math.cos((lat * Math.PI) / 180));
  const rows = db().prepare(`
    SELECT * FROM stops WHERE location_type = 0 AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
  `).all(lat - dLat, lat + dLat, lon - dLon, lon + dLon) as StopRow[];
  return rows
    .map((r) => ({ r, d: haversine(lat, lon, r.lat, r.lon) }))
    .filter((x) => x.d <= radius)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map(({ r, d }) => toStop(r, true, d));
}

/** Azonos nevű, egymáshoz közeli peronok csoportosítása. */
function groupStops(rows: StopRow[]) {
  const groups = new Map<string, { name: string; lat: number; lon: number; stopIds: string[]; routes: Map<string, RouteInfo> }>();
  for (const r of rows) {
    const key = r.name;
    let g = groups.get(key);
    if (!g) { g = { name: r.name, lat: r.lat, lon: r.lon, stopIds: [], routes: new Map() }; groups.set(key, g); }
    g.stopIds.push(r.id);
    for (const rt of routesForStopIdx(r.idx)) g.routes.set(rt.id, rt);
  }
  return [...groups.values()]
    .filter((g) => g.routes.size > 0)
    .map((g) => ({ name: g.name, lat: g.lat, lon: g.lon, stopIds: g.stopIds, routes: [...g.routes.values()].sort(compareRoutes) }));
}

/** Egy megálló "testvér" peronjai (azonos név, 300 m-en belül) – a csoportos indulási táblához. */
export function siblingStops(stopId: string): string[] {
  const s = db().prepare('SELECT * FROM stops WHERE id = ?').get(stopId) as StopRow | undefined;
  if (!s) return [];
  const rows = db().prepare('SELECT id, lat, lon FROM stops WHERE name = ? AND location_type = 0').all(s.name) as StopRow[];
  return rows.filter((r) => haversine(s.lat, s.lon, r.lat, r.lon) < 300).map((r) => r.id);
}

// ---- Menetrend szerinti indulások ----

const servicesCache = new Map<number, Set<number>>();
/** Az adott napon közlekedő szolgáltatások (calendar_dates alapján). */
export function activeServices(date: number): Set<number> {
  let s = servicesCache.get(date);
  if (s) return s;
  const rows = db().prepare('SELECT service_idx, exception FROM calendar_dates WHERE date = ?').all(date) as { service_idx: number; exception: number }[];
  s = new Set();
  for (const r of rows) if (r.exception === 1) s.add(r.service_idx);
  for (const r of rows) if (r.exception === 2) s.delete(r.service_idx);
  servicesCache.set(date, s);
  if (servicesCache.size > 10) servicesCache.delete(servicesCache.keys().next().value!);
  return s;
}

/** Menetrend szerinti indulások egy vagy több megállóból a [from, from+windowSec] időablakban. */
export function scheduledDepartures(stopIds: string[], from = nowSec() - 60, windowSec = 90 * 60, limit = 60): Departure[] {
  const d = db();
  const stopIdx = stopIds
    .map((id) => (d.prepare('SELECT idx FROM stops WHERE id = ?').get(id) as { idx: number } | undefined)?.idx)
    .filter((x): x is number => x !== undefined);
  if (!stopIdx.length) return [];
  const today = ymd(from * 1000);
  const out: Departure[] = [];
  const q = d.prepare(`
    SELECT st.trip_idx, st.seq, st.dep, st.headsign AS st_headsign, s.id AS stop_id,
           t.id AS trip_id, t.route_idx, t.service_idx, t.headsign, t.wheelchair,
           (SELECT MAX(seq) FROM stop_times x WHERE x.trip_idx = st.trip_idx) AS last_seq
    FROM stop_times st JOIN trips t ON t.idx = st.trip_idx JOIN stops s ON s.idx = st.stop_idx
    WHERE st.stop_idx = ? AND st.dep BETWEEN ? AND ?
  `);
  // A tegnapi szolgáltatási nap éjfél utáni (24:xx) indulásait is figyelembe vesszük.
  for (const date of [addDays(today, -1), today, addDays(today, 1)]) {
    const base = serviceDayStart(date);
    const svc = activeServices(date);
    if (!svc.size) continue;
    for (const si of stopIdx) {
      const rows = q.all(si, from - base, from + windowSec - base) as {
        trip_idx: number; seq: number; dep: number; st_headsign: string | null; stop_id: string; trip_id: string;
        route_idx: number; service_idx: number; headsign: string; wheelchair: number | null; last_seq: number;
      }[];
      for (const r of rows) {
        if (!svc.has(r.service_idx) || r.seq === r.last_seq) continue; // végállomásról nem "indul"
        const route = routeByIdx(r.route_idx);
        out.push({
          tripId: r.trip_id, serviceDate: String(date), stopId: r.stop_id, stopSequence: r.seq,
          route, headsign: r.st_headsign || r.headsign,
          scheduled: base + r.dep, predicted: null, delaySec: null, realtime: false,
          wheelchair: r.wheelchair === 1, alertIds: [],
        });
      }
    }
  }
  return out.sort((a, b) => a.scheduled - b.scheduled).slice(0, limit);
}

// ---- Járat (trip) részletei ----

export function tripDetails(tripId: string, serviceDate?: string): TripDetails | null {
  const d = db();
  const t = d.prepare('SELECT * FROM trips WHERE id = ?').get(tripId) as
    { idx: number; id: string; route_idx: number; headsign: string; direction: number; shape_idx: number | null; wheelchair: number | null; service_idx: number } | undefined;
  if (!t) return null;
  const date = serviceDate ? Number(serviceDate) : ymd(Date.now());
  const base = serviceDayStart(date);
  const stops = d.prepare(`
    SELECT st.seq, st.arr, st.dep, st.dist, s.id, s.name, s.lat, s.lon
    FROM stop_times st JOIN stops s ON s.idx = st.stop_idx WHERE st.trip_idx = ? ORDER BY st.seq
  `).all(t.idx) as { seq: number; arr: number; dep: number; dist: number | null; id: string; name: string; lat: number; lon: number }[];
  const shape = t.shape_idx
    ? (d.prepare('SELECT lat, lon, dist FROM shapes WHERE shape_idx = ? ORDER BY seq').all(t.shape_idx) as { lat: number; lon: number; dist: number | null }[])
    : stops.map((s) => ({ lat: s.lat, lon: s.lon, dist: s.dist }));
  return {
    tripId: t.id, serviceDate: String(date), route: routeByIdx(t.route_idx), headsign: t.headsign,
    directionId: t.direction, wheelchair: t.wheelchair === 1,
    stops: stops.map<TripStop>((s) => ({
      stopId: s.id, name: s.name, lat: s.lat, lon: s.lon, sequence: s.seq, distance: s.dist,
      scheduledArrival: base + s.arr, scheduledDeparture: base + s.dep, predictedArrival: null, predictedDeparture: null,
    })),
    shape: shape.map((p) => [p.lat, p.lon, p.dist ?? null] as [number, number, number | null]),
    vehicle: null, alertIds: [], realtime: false,
  };
}

/** Egy járat menetrend szerinti indulásai a következő órákban egy adott megállóban (nem valós idejű). */
export function routeTripsAtStop(routeId: string, stopId: string, from: number, windowSec: number) {
  return scheduledDepartures([stopId], from, windowSec, 200).filter((d) => d.route.id === routeId);
}

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000, toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
