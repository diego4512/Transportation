/**
 * "Ne süljek meg" – klíma a járművön + időjárás (Open-Meteo, kulcs nélkül).
 *
 * A BKK API-ban nincs megbízható klíma mező, ezért a járműtípus (model) alapján becsülünk.
 * A táblázat a budapesti flotta ismert típusait tartalmazza; a bizonytalan tételeket
 * `null`-lal jelöljük. Bővítsd nyugodtan – a kulcs kisbetűs részszöveg a típusnévben.
 */
import type { AcInfo, RouteInfo } from '../types.ts';

const MODEL_AC: { match: RegExp; ac: boolean | null; note?: string }[] = [
  // Villamosok
  { match: /urbos|caf/i, ac: true },
  { match: /combino/i, ac: true, note: 'Utastér-hűtés van, de csúcsban gyengébb' },
  { match: /tatra|t5c5|kcsv|csmg|ganz|tw ?6000|duewag|düwag/i, ac: false },
  // Trolibuszok
  { match: /trollino|solaris.*troll|skoda.*(24|27)tr|škoda.*(24|27)tr/i, ac: true },
  { match: /412t|435t|411t|280t/i, ac: false },
  // Autóbuszok
  { match: /citaro|conecto|intouro|lion'?s ?city|urbino|modulo|credo|volvo ?7(7|9)00|solaris|ebusz|e-?bus|man ?a(21|23|37|40)|mercedes/i, ac: true },
  { match: /ikarus ?(260|280|412|415|435)|ik ?(260|280|412|415|435)/i, ac: false },
  // Metró
  { match: /metropolis|alstom/i, ac: true },
  { match: /81-71[47]|metrovagonmash|mvm|ev3|ezs|ev ?3/i, ac: true, note: 'A felújított M3-as kocsik klímásak' },
  // HÉV
  { match: /mix\/?a|mxa|ll ?xv|lhev/i, ac: false },
];

/** Vonalszintű alapértelmezés, ha a jármű típusa ismeretlen (pl. csak menetrendi adat van). */
export function routeAc(route: RouteInfo): AcInfo {
  if (route.type === 1) {
    if (route.shortName === 'M1') return { value: false, source: 'model', note: 'A kisföldalatti kocsijai nem klímásak' };
    return { value: true, source: 'model', note: 'A metrókocsik klímásak' };
  }
  if (route.type === 109 || route.type === 2) return { value: false, source: 'model', note: 'A HÉV-szerelvények többsége nem klímás' };
  return { value: null, source: 'unknown' };
}

export function acFor(v: { model?: string | null; label?: string | null; licensePlate?: string | null; apiValue?: boolean | null }): AcInfo {
  if (typeof v.apiValue === 'boolean') return { value: v.apiValue, source: 'api' };
  const s = `${v.model ?? ''} ${v.label ?? ''}`;
  if (s.trim()) {
    for (const m of MODEL_AC) if (m.match.test(s)) return { value: m.ac, source: 'model', ...(m.note ? { note: m.note } : {}) };
  }
  return { value: null, source: 'unknown' };
}

// ---- Időjárás ----

export interface Weather {
  temperature: number;
  apparentTemperature: number;
  cloudCover: number;
  precipitation: number;
  uvIndex: number | null;
  isDay: boolean;
  /** 'hot' ≥ 30°C hőérzet, 'warm' ≥ 25, 'cold' ≤ 0, egyébként 'mild' */
  level: 'hot' | 'warm' | 'mild' | 'cold';
  rain: boolean;
  advice: string[];
  fetchedAt: number;
}

let weatherCache: { at: number; data: Weather } | null = null;

export async function currentWeather(lat = 47.4979, lon = 19.0402): Promise<Weather | null> {
  if (weatherCache && Date.now() - weatherCache.at < 10 * 60_000) return weatherCache.data;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
      '&current=temperature_2m,apparent_temperature,cloud_cover,precipitation,uv_index,is_day&timezone=Europe%2FBudapest';
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return weatherCache?.data ?? null;
    const c = ((await res.json()) as { current: Record<string, number> }).current;
    const apparent = c.apparent_temperature ?? c.temperature_2m;
    const level: Weather['level'] = apparent >= 30 ? 'hot' : apparent >= 25 ? 'warm' : apparent <= 0 ? 'cold' : 'mild';
    const rain = (c.precipitation ?? 0) > 0.2;
    const advice: string[] = [];
    if (level === 'hot') advice.push('Hőség van: válassz klímás járatot, és ülj az árnyékos oldalra.');
    if (level === 'warm') advice.push('Meleg van: érdemes az árnyékos oldalra ülni.');
    if (level === 'cold') advice.push('Hideg van: télen a napos oldal kellemesebb lehet.');
    if (rain) advice.push('Esik az eső: a kevesebb gyaloglással járó útvonal most jobb választás.');
    if ((c.uv_index ?? 0) >= 6) advice.push('Erős az UV-sugárzás, kerüld a napos ablakot.');
    const data: Weather = {
      temperature: c.temperature_2m, apparentTemperature: apparent, cloudCover: c.cloud_cover,
      precipitation: c.precipitation, uvIndex: c.uv_index ?? null, isDay: c.is_day === 1, level, rain, advice,
      fetchedAt: Date.now(),
    };
    weatherCache = { at: Date.now(), data };
    return data;
  } catch {
    return weatherCache?.data ?? null;
  }
}
