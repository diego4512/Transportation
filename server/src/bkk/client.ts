/**
 * BKK Futár / Budapest GO valós idejű API kliens.
 * Dokumentáció: https://opendata.bkk.hu/data-sources
 *
 * A BKK azonosítók "BKK_" előtaggal érkeznek (pl. BKK_F01111), a GTFS-ben előtag nélkül.
 * Kifelé mindig a GTFS-alakot adjuk, így a két forrás összefésülhető.
 */
import { config, hasRealtime } from '../config.ts';
import type { Alert, Departure, RouteInfo, TripDetails, VehicleInfo } from '../types.ts';
import { classifyReason } from './reasons.ts';
import { acFor } from '../services/comfort.ts';

const strip = (id: string | undefined | null) => (id ? id.replace(/^BKK_/, '') : null);
const withPrefix = (id: string) => (id.startsWith('BKK_') ? id : `BKK_${id}`);

type Json = Record<string, any>;

// Egyszerű gyorsítótár, hogy a percenkénti kvótát (~100 hívás/perc kulcsonként) ne lépjük túl.
const cache = new Map<string, { at: number; data: Json }>();
const inflight = new Map<string, Promise<Json>>();

export class BkkError extends Error {
  constructor(message: string, public statusCode = 502) { super(message); }
}

async function call(method: string, params: Record<string, string | number | boolean | undefined>, ttlSec = 15): Promise<Json> {
  if (!hasRealtime()) throw new BkkError('Nincs BKK API kulcs beállítva', 503);
  const qs = new URLSearchParams({ key: config.bkkApiKey, version: '4', appVersion: 'bp-transit-0.1', includeReferences: 'true' });
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  const url = `${config.bkkBaseUrl}/${method}.json?${qs}`;
  const key = url;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlSec * 1000) return hit.data;
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new BkkError(`BKK API hiba: HTTP ${res.status}`, res.status === 401 ? 503 : 502);
    const body = (await res.json()) as Json;
    if (body.code && body.code !== 200) throw new BkkError(`BKK API hiba: ${body.code} ${body.text ?? ''}`);
    cache.set(key, { at: Date.now(), data: body });
    if (cache.size > 2000) for (const [k, v] of cache) if (Date.now() - v.at > 120_000) cache.delete(k);
    return body;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// ---- Normalizálók ----

/** A BKK szövegmezői néha {translations: {hu, en}} alakúak. */
function text(v: unknown, lang = 'hu'): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  const o = v as Json;
  if (o.translations) return o.translations[lang] ?? o.translations.hu ?? Object.values(o.translations)[0] ?? '';
  return o.someTranslation ?? '';
}

const stripHtml = (s: string) => s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

function route(refs: Json, id: string | undefined): RouteInfo {
  const r = (id && refs?.routes?.[id]) || {};
  return {
    id: strip(id) ?? '', shortName: r.shortName ?? '', longName: r.longName ?? r.description ?? '',
    type: routeType(r.type), color: r.color ? `#${r.color}` : '#555555', textColor: r.textColor ? `#${r.textColor}` : '#ffffff',
  };
}

function routeType(t: string | number | undefined): number {
  if (typeof t === 'number') return t;
  switch (t) {
    case 'TRAM': return 0;
    case 'SUBWAY': return 1;
    case 'RAIL': return 109;
    case 'BUS': return 3;
    case 'FERRY': return 4;
    case 'TROLLEYBUS': return 11;
    default: return 3;
  }
}

export function normalizeAlert(a: Json): Alert {
  const header = text(a.header);
  const description = stripHtml(text(a.description));
  return {
    id: a.id,
    header,
    description,
    url: text(a.url) || null,
    start: a.start ?? null,
    end: a.end ?? null,
    routeIds: (a.routeIds ?? []).map(strip),
    stopIds: (a.stopIds ?? []).map(strip),
    reason: classifyReason(`${header}\n${description}`, a.cause),
  };
}

function normalizeVehicle(v: Json, refs?: Json): VehicleInfo {
  const model = v.model ?? v.vehicleModel ?? null;
  return {
    vehicleId: v.vehicleId,
    tripId: strip(v.tripId),
    routeId: strip(v.routeId),
    route: refs?.routes?.[v.routeId] ? route(refs, v.routeId) : null,
    lat: v.location?.lat,
    lon: v.location?.lon,
    bearing: v.bearing ?? null,
    label: v.label ?? null,
    licensePlate: v.licensePlate ?? null,
    model,
    stopId: strip(v.stopId),
    stopSequence: v.stopSequence ?? null,
    status: v.status ?? null,
    stopDistancePercent: v.stopDistancePercent ?? null,
    wheelchair: v.wheelchairAccessible ?? null,
    occupancy: v.occupancy?.status ?? v.occupancy?.occupancyStatus ?? (typeof v.occupancy === 'string' ? v.occupancy : null),
    lastUpdate: v.lastUpdateTime ?? null,
    airConditioning: acFor({ model, label: v.label, licensePlate: v.licensePlate, apiValue: v.airConditioned ?? v.airConditioning ?? null }),
  };
}

function alertsFromRefs(refs: Json): Alert[] {
  return Object.values(refs?.alerts ?? {}).map((a) => normalizeAlert(a as Json));
}

// ---- Nyilvános függvények ----

export async function realtimeDepartures(stopIds: string[], minutesAfter = 90): Promise<{ departures: Departure[]; alerts: Alert[] }> {
  const results = await Promise.all(stopIds.slice(0, 8).map((id) =>
    call('arrivals-and-departures-for-stop', { stopId: withPrefix(id), minutesBefore: 1, minutesAfter, onlyDepartures: true, limit: 60 })));
  const departures: Departure[] = [];
  const alerts = new Map<string, Alert>();
  for (const body of results) {
    const refs = body.data?.references ?? {};
    for (const a of alertsFromRefs(refs)) alerts.set(a.id, a);
    const vehiclesByTrip = new Map<string, Json>();
    for (const v of Object.values(refs.vehicles ?? {}) as Json[]) if (v.tripId) vehiclesByTrip.set(v.tripId, v);
    for (const st of body.data?.entry?.stopTimes ?? []) {
      const trip = refs.trips?.[st.tripId] ?? {};
      const scheduled = st.departureTime ?? st.arrivalTime;
      const predicted = st.predictedDepartureTime ?? st.predictedArrivalTime ?? null;
      const v = vehiclesByTrip.get(st.tripId);
      departures.push({
        tripId: strip(st.tripId)!,
        serviceDate: st.serviceDate ?? trip.serviceDate ?? '',
        stopId: strip(st.stopId)!,
        stopSequence: st.stopSequence ?? null,
        route: route(refs, trip.routeId),
        headsign: st.stopHeadsign ?? trip.tripHeadsign ?? '',
        scheduled,
        predicted,
        delaySec: predicted ? predicted - scheduled : null,
        realtime: predicted !== null,
        wheelchair: st.wheelchairAccessible ?? trip.wheelchairAccessible ?? false,
        alertIds: st.alertIds ?? [],
        vehicle: v ? normalizeVehicle(v, refs) : null,
      });
    }
  }
  departures.sort((a, b) => (a.predicted ?? a.scheduled) - (b.predicted ?? b.scheduled));
  return { departures, alerts: [...alerts.values()] };
}

/** Valós idejű adatokkal kiegészíti a GTFS-ből épített járatrészleteket. */
export async function enrichTrip(trip: TripDetails): Promise<{ trip: TripDetails; alerts: Alert[] }> {
  const body = await call('trip-details', { tripId: withPrefix(trip.tripId), date: trip.serviceDate }, 10);
  const entry = body.data?.entry ?? {};
  const refs = body.data?.references ?? {};
  const byStop = new Map<string, Json>();
  for (const st of entry.stopTimes ?? []) byStop.set(strip(st.stopId)!, st);
  for (const s of trip.stops) {
    const st = byStop.get(s.stopId);
    if (!st) continue;
    s.predictedArrival = st.predictedArrivalTime ?? null;
    s.predictedDeparture = st.predictedDepartureTime ?? st.predictedArrivalTime ?? null;
  }
  trip.vehicle = entry.vehicle ? normalizeVehicle(entry.vehicle, refs) : null;
  trip.alertIds = (entry.alertIds ?? []).map(String);
  trip.realtime = trip.stops.some((s) => s.predictedDeparture !== null) || trip.vehicle !== null;
  return { trip, alerts: alertsFromRefs(refs) };
}

export async function vehiclesNear(lat: number, lon: number, radius = 1500): Promise<VehicleInfo[]> {
  const span = radius / 111_320;
  const body = await call('vehicles-for-location', { lat, lon, latSpan: span, lonSpan: span * 1.5 }, 10);
  const refs = body.data?.references ?? {};
  return (body.data?.list ?? []).map((v: Json) => normalizeVehicle(v, refs)).filter((v: VehicleInfo) => v.lat && v.lon);
}

export async function vehiclesForRoute(routeId: string): Promise<VehicleInfo[]> {
  const body = await call('vehicles-for-route', { routeId: withPrefix(routeId) }, 10);
  const refs = body.data?.references ?? {};
  return (body.data?.list ?? []).map((v: Json) => normalizeVehicle(v, refs));
}

export async function activeAlerts(): Promise<Alert[]> {
  const now = Math.floor(Date.now() / 1000);
  const body = await call('alert-search', { start: now, end: now + 3 * 86400, minResult: 1 }, 120);
  return alertsFromRefs(body.data?.references ?? {}).sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
}
