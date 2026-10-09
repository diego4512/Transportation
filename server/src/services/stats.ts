/**
 * Megbízhatósági statisztika: minden valós idejű lekérdezésnél elmentjük a megfigyelt késést,
 * így idővel kiderül, hogy pl. "a 7-es reggel 8-kor átlagosan 4 percet késik".
 */
import { appDb } from '../db.ts';
import { localHourDow } from '../time.ts';
import type { Departure, Reliability } from '../types.ts';

export function recordDelays(deps: Departure[]) {
  const db = appDb();
  const stmt = db.prepare(`
    INSERT INTO delay_obs (route_id, trip_id, service_date, stop_id, hour, dow, delay_sec, observed_at)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(trip_id, service_date, stop_id) DO UPDATE SET delay_sec = excluded.delay_sec, observed_at = excluded.observed_at
  `);
  const now = Math.floor(Date.now() / 1000);
  db.exec('BEGIN');
  try {
    for (const d of deps) {
      if (!d.realtime || d.delaySec === null || !d.serviceDate) continue;
      // Csak a közeli (10 percen belüli) indulásokat rögzítjük – ezek az előrejelzések már pontosak.
      if ((d.predicted ?? d.scheduled) - now > 600) continue;
      const { hour, dow } = localHourDow(d.scheduled);
      stmt.run(d.route.id, d.tripId, d.serviceDate, d.stopId, hour, dow, d.delaySec, now);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Járat megbízhatósága az adott órában (±1 óra), az elmúlt 60 nap adataiból. */
export function reliability(routeId: string, hour: number): Reliability | null {
  const since = Math.floor(Date.now() / 1000) - 60 * 86400;
  const r = appDb().prepare(`
    SELECT COUNT(*) AS n, AVG(delay_sec) AS avg, SUM(CASE WHEN delay_sec < 180 THEN 1 ELSE 0 END) AS ontime
    FROM delay_obs WHERE route_id = ? AND hour BETWEEN ? AND ? AND observed_at > ?
  `).get(routeId, hour - 1, hour + 1, since) as { n: number; avg: number | null; ontime: number | null };
  if (!r.n || r.n < 5) return null;
  return { samples: r.n, avgDelaySec: Math.round(r.avg ?? 0), onTimePct: Math.round(((r.ontime ?? 0) / r.n) * 100) };
}

/** Egy járat óránkénti átlagos késése (a megbízhatósági grafikonhoz). */
export function routeDelayProfile(routeId: string) {
  const since = Math.floor(Date.now() / 1000) - 60 * 86400;
  return appDb().prepare(`
    SELECT hour, COUNT(*) AS samples, ROUND(AVG(delay_sec)) AS avgDelaySec
    FROM delay_obs WHERE route_id = ? AND observed_at > ? GROUP BY hour ORDER BY hour
  `).all(routeId, since) as { hour: number; samples: number; avgDelaySec: number }[];
}

export function attachReliability(deps: Departure[]) {
  const cache = new Map<string, Reliability | null>();
  for (const d of deps) {
    const { hour } = localHourDow(d.scheduled);
    const k = `${d.route.id}:${hour}`;
    if (!cache.has(k)) cache.set(k, reliability(d.route.id, hour));
    d.reliability = cache.get(k) ?? null;
  }
  return deps;
}
