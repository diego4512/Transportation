import type { DeparturesResponse, Status, StopGroup, SunResponse, TripResponse, Weather } from './types';
import type { Alert, StopInfo, VehicleInfo, RouteInfo, AcInfo } from './types';

/** Az app alútvonala (pl. "/utas/"), hogy Apache proxy mögött is jó címre menjenek a hívások. */
const BASE = import.meta.env.BASE_URL;
const url = (path: string) => BASE + path.replace(/^\//, '');

async function get<T>(path: string): Promise<T> {
  const res = await fetch(url(path));
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

async function send<T>(method: string, path: string, data?: unknown): Promise<T> {
  const res = await fetch(url(path), { method, headers: data ? { 'content-type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

const qs = (o: Record<string, string | number | undefined | null>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString();

export const api = {
  status: () => get<Status>('/api/status'),
  search: (q: string) => get<{ results: StopGroup[] }>(`/api/stops/search?${qs({ q })}`),
  nearby: (lat: number, lon: number, radius = 600) => get<{ stops: StopInfo[] }>(`/api/stops/nearby?${qs({ lat, lon, radius })}`),
  stop: (id: string) => get<{ stop: StopInfo; siblings: StopInfo[] }>(`/api/stops/${encodeURIComponent(id)}`),
  departures: (id: string, group = true, minutes = 90) =>
    get<DeparturesResponse>(`/api/stops/${encodeURIComponent(id)}/departures?${qs({ group: group ? 1 : 0, minutes })}`),
  trip: (id: string, date?: string) => get<TripResponse>(`/api/trips/${encodeURIComponent(id)}?${qs({ date })}`),
  sun: (id: string, p: { date?: string; from?: string; to?: string; pref?: string }) =>
    get<SunResponse>(`/api/trips/${encodeURIComponent(id)}/sun?${qs(p)}`),
  route: (id: string) => get<{ route: RouteInfo; ac: AcInfo; delayProfile: { hour: number; samples: number; avgDelaySec: number }[] }>(`/api/routes/${encodeURIComponent(id)}`),
  vehiclesNear: (lat: number, lon: number, radius = 1500) => get<{ vehicles: VehicleInfo[]; realtime: boolean }>(`/api/vehicles?${qs({ lat, lon, radius })}`),
  vehiclesForRoute: (routeId: string) => get<{ vehicles: VehicleInfo[]; realtime: boolean }>(`/api/vehicles?${qs({ routeId })}`),
  alerts: () => get<{ alerts: Alert[]; realtime: boolean }>('/api/alerts'),
  weather: (lat?: number, lon?: number) => get<{ weather: Weather | null }>(`/api/weather?${qs({ lat, lon })}`),
  pushKey: () => get<{ publicKey: string }>('/api/push/key'),
  pushSubscribe: (subscription: PushSubscriptionJSON) => send<{ id: string }>('POST', '/api/push/subscribe', { subscription }),
  pushUnsubscribe: (sub: string) => send('DELETE', `/api/push/${sub}`),
  watches: (sub: string) => get<{ watches: { id: string; kind: string; params: Record<string, any>; expiresAt: number }[] }>(`/api/push/${sub}/watches`),
  addWatch: (sub: string, kind: string, params: Record<string, unknown>) => send<{ id: string }>('POST', `/api/push/${sub}/watches`, { kind, params }),
  deleteWatch: (sub: string, id: string) => send('DELETE', `/api/push/${sub}/watches/${id}`),
};
