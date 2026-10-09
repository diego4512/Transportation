import type { FastifyInstance } from 'fastify';
import { hasRealtime } from '../config.ts';
import {
  feedMeta, gtfsReady, nearbyStops, routeById, searchStops, siblingStops, stopById,
} from '../gtfs/queries.ts';
import { departuresFor, tripFor, alertsAll } from '../services/departures.ts';
import { computeSunAdvice } from '../services/sun.ts';
import { currentWeather, routeAc } from '../services/comfort.ts';
import { routeDelayProfile } from '../services/stats.ts';
import { vehiclesNear, vehiclesForRoute } from '../bkk/client.ts';
import { vapidKeys, saveSubscription, deleteSubscription, subscriptionExists } from '../services/push.ts';
import { createWatch, deleteWatch, listWatches, type WatchKind } from '../services/watcher.ts';
import { nowSec } from '../time.ts';

const num = (v: unknown, d?: number) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== '' && v !== undefined ? n : d;
};

function bad(message: string) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export async function apiRoutes(app: FastifyInstance) {
  app.get('/api/status', async () => ({
    realtime: hasRealtime(),
    gtfs: gtfsReady() ? feedMeta() : null,
    time: nowSec(),
  }));

  // ---- Megállók ----
  app.get('/api/stops/search', async (req) => {
    const { q } = req.query as { q?: string };
    return { results: searchStops(q ?? '') };
  });

  app.get('/api/stops/nearby', async (req) => {
    const q = req.query as Record<string, string>;
    const lat = num(q.lat), lon = num(q.lon);
    if (lat === undefined || lon === undefined) throw bad('lat és lon kötelező');
    return { stops: nearbyStops(lat, lon, Math.min(num(q.radius, 500)!, 2000)) };
  });

  app.get('/api/stops/:id', async (req) => {
    const { id } = req.params as { id: string };
    const stop = stopById(id);
    if (!stop) throw Object.assign(new Error('Nincs ilyen megálló'), { statusCode: 404 });
    return { stop, siblings: siblingStops(id).filter((s) => s !== id).map(stopById).filter(Boolean) };
  });

  /** Indulások; ?group=1 esetén az azonos nevű közeli peronokkal együtt. */
  app.get('/api/stops/:id/departures', async (req) => {
    const { id } = req.params as { id: string };
    const q = req.query as Record<string, string>;
    const ids = q.group === '1' ? siblingStops(id) : id.split(',');
    return departuresFor(ids.length ? ids : [id], Math.min(num(q.minutes, 90)!, 240));
  });

  // ---- Járatok ----
  app.get('/api/trips/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { date } = req.query as { date?: string };
    const res = await tripFor(id, date);
    if (!res) throw Object.assign(new Error('Nincs ilyen járat'), { statusCode: 404 });
    const ac = res.trip.vehicle?.airConditioning ?? routeAc(res.trip.route);
    return { ...res, ac };
  });

  /** Napos oldal: ?from=<stopId>&to=<stopId>&pref=avoid|seek */
  app.get('/api/trips/:id/sun', async (req) => {
    const { id } = req.params as { id: string };
    const q = req.query as Record<string, string>;
    const res = await tripFor(id, q.date);
    if (!res) throw Object.assign(new Error('Nincs ilyen járat'), { statusCode: 404 });
    const { trip } = res;
    const from = trip.stops.find((s) => s.stopId === q.from) ?? trip.stops[0];
    const to = trip.stops.find((s) => s.stopId === q.to && s.sequence > from.sequence) ?? trip.stops[trip.stops.length - 1];
    const weather = await currentWeather(from.lat, from.lon);
    const pref = q.pref === 'seek' ? 'seek' : q.pref === 'avoid' ? 'avoid' : weather?.level === 'cold' ? 'seek' : 'avoid';
    return {
      advice: computeSunAdvice(trip, from.sequence, to.sequence, { preference: pref, cloudCover: weather?.cloudCover ?? null }),
      weather,
      ac: trip.vehicle?.airConditioning ?? routeAc(trip.route),
      from: from.name, to: to.name,
    };
  });

  app.get('/api/routes/:id', async (req) => {
    const { id } = req.params as { id: string };
    const route = routeById(id);
    if (!route) throw Object.assign(new Error('Nincs ilyen járat'), { statusCode: 404 });
    return { route, ac: routeAc(route), delayProfile: routeDelayProfile(id) };
  });

  // ---- Járművek, forgalmi hírek, időjárás ----
  app.get('/api/vehicles', async (req) => {
    if (!hasRealtime()) return { vehicles: [], realtime: false };
    const q = req.query as Record<string, string>;
    if (q.routeId) return { vehicles: await vehiclesForRoute(q.routeId), realtime: true };
    const lat = num(q.lat), lon = num(q.lon);
    if (lat === undefined || lon === undefined) throw bad('lat/lon vagy routeId kötelező');
    return { vehicles: await vehiclesNear(lat, lon, Math.min(num(q.radius, 1500)!, 5000)), realtime: true };
  });

  app.get('/api/alerts', async () => ({ alerts: await alertsAll(), realtime: hasRealtime() }));

  app.get('/api/weather', async (req) => {
    const q = req.query as Record<string, string>;
    return { weather: await currentWeather(num(q.lat), num(q.lon)) };
  });

  // ---- Push értesítések és figyelések ----
  app.get('/api/push/key', async () => ({ publicKey: vapidKeys().publicKey }));

  app.post('/api/push/subscribe', async (req) => {
    const body = req.body as { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } };
    const s = body?.subscription;
    if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth || !/^https:\/\//.test(s.endpoint)) throw bad('Érvénytelen feliratkozás');
    return { id: saveSubscription(s as never) };
  });

  app.delete('/api/push/:sub', async (req) => {
    deleteSubscription((req.params as { sub: string }).sub);
    return { ok: true };
  });

  app.get('/api/push/:sub/watches', async (req) => {
    const { sub } = req.params as { sub: string };
    if (!subscriptionExists(sub)) throw Object.assign(new Error('Ismeretlen feliratkozás'), { statusCode: 404 });
    return { watches: listWatches(sub) };
  });

  app.post('/api/push/:sub/watches', async (req) => {
    const { sub } = req.params as { sub: string };
    if (!subscriptionExists(sub)) throw Object.assign(new Error('Ismeretlen feliratkozás'), { statusCode: 404 });
    const { kind, params } = req.body as { kind: WatchKind; params: Record<string, any> };
    const now = nowSec();
    let expires: number;
    switch (kind) {
      case 'delay':
      case 'leave':
      case 'alight':
        if (!params?.tripId || !params?.serviceDate) throw bad('tripId és serviceDate kötelező');
        params.thresholdMin = Math.max(1, num(params.thresholdMin, 3)!);
        params.walkMin = Math.max(0, num(params.walkMin, 5)!);
        expires = now + 6 * 3600;
        break;
      case 'route-daily':
        if (!params?.stopId || !params?.routeId || !/^\d{1,2}:\d{2}$/.test(params.time ?? '') || !Array.isArray(params.days)) throw bad('stopId, routeId, time (HH:MM), days kötelező');
        params.thresholdMin = Math.max(1, num(params.thresholdMin, 3)!);
        expires = now + 365 * 86400;
        break;
      case 'route-alerts':
        if (!Array.isArray(params?.routeIds) || !params.routeIds.length) throw bad('routeIds kötelező');
        expires = now + 365 * 86400;
        break;
      case 'reminder':
        if (!num(params?.at) || !params?.title) throw bad('at és title kötelező');
        expires = num(params.at)! + 3600;
        break;
      default:
        throw bad('Ismeretlen figyelés típus');
    }
    return { id: createWatch(sub, kind, params, expires) };
  });

  app.delete('/api/push/:sub/watches/:id', async (req) => {
    const { sub, id } = req.params as { sub: string; id: string };
    deleteWatch(sub, id);
    return { ok: true };
  });
}
