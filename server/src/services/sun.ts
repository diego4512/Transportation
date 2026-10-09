/**
 * "Hova üljek, hogy ne süssön a nap?"
 *
 * Az útvonal minden szakaszára kiszámoljuk a jármű haladási irányát (a GTFS shape alapján)
 * és a nap helyzetét (azimut, magasság) abban a pillanatban, amikor a jármű ott lesz.
 * Ha a nap a menetiránytól jobbra van, a jobb oldali ablakon süt be – és fordítva.
 * A szakaszok idejét összegezve megmondjuk, melyik oldal az árnyékos (vagy napos, ha valaki télen azt keresi).
 */
import SunCalc from 'suncalc';
import type { TripDetails } from '../types.ts';

export type Side = 'left' | 'right';

export interface SunSegment {
  fromStop: string;
  toStop: string;
  /** epoch s */
  start: number;
  end: number;
  sunnySide: Side | 'front' | 'back' | 'none';
}

export interface SunAdvice {
  /** Az ajánlott oldal a menetirányhoz képest. null: mindegy. */
  recommendedSide: Side | null;
  preference: 'avoid' | 'seek';
  /** Hány másodpercig süt a nap a bal/jobb oldalra, illetve szemből/hátulról. */
  seconds: { left: number; right: number; front: number; back: number; none: number };
  /** A napos szakaszok aránya az utazás teljes idejéhez (0–1). */
  sunnyShare: number;
  /** Átlagos napmagasság a napos szakaszokon – alacsony nap = mélyen besüt az ablakon. */
  avgAltitudeDeg: number | null;
  segments: SunSegment[];
  summary: string;
  underground: boolean;
}

const toRad = Math.PI / 180;

export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = lat1 * toRad, φ2 = lat2 * toRad, Δλ = (lon2 - lon1) * toRad;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) / toRad + 360) % 360;
}

function distM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const x = (lon2 - lon1) * toRad * Math.cos(((lat1 + lat2) / 2) * toRad);
  const y = (lat2 - lat1) * toRad;
  return Math.sqrt(x * x + y * y) * 6371000;
}

/** Nap azimut (0 = észak, óramutató szerint) és magasság fokban. */
export function sunPosition(epochSec: number, lat: number, lon: number) {
  const p = SunCalc.getPosition(new Date(epochSec * 1000), lat, lon);
  // A SunCalc azimutja délről mér, nyugat felé pozitív – átváltjuk északi alapra.
  const azimuth = (p.azimuth / toRad + 180 + 360) % 360;
  return { azimuth, altitude: p.altitude / toRad };
}

/**
 * A nap relatív helyzete a menetirányhoz képest.
 * rel ∈ (-180, 180]: pozitív = jobbra, negatív = balra.
 */
export function sunSide(vehicleBearing: number, sunAzimuth: number, altitude: number): SunSegment['sunnySide'] {
  if (altitude < 2) return 'none'; // lemenő/felkelő nap épületek mögött – gyakorlatilag nem süt be
  let rel = sunAzimuth - vehicleBearing;
  rel = ((rel + 540) % 360) - 180;
  // Nagyon magas napnál (>60°) inkább a tetőt éri, oldalra alig süt be.
  if (altitude > 62) return 'none';
  if (Math.abs(rel) < 20) return 'front';
  if (Math.abs(rel) > 160) return 'back';
  return rel > 0 ? 'right' : 'left';
}

/**
 * @param fromSeq felszállási megálló sorszáma
 * @param toSeq leszállási megálló sorszáma
 * @param cloudCover 0–100 (%); ha borult az idő, jelezzük, hogy mindegy
 */
export function computeSunAdvice(trip: TripDetails, fromSeq: number, toSeq: number, opts: { preference?: 'avoid' | 'seek'; cloudCover?: number | null } = {}): SunAdvice {
  const preference = opts.preference ?? 'avoid';
  const stops = trip.stops.filter((s) => s.sequence >= fromSeq && s.sequence <= toSeq);
  const seconds = { left: 0, right: 0, front: 0, back: 0, none: 0 };
  const segments: SunSegment[] = [];
  const underground = trip.route.type === 1; // a budapesti metróvonalak (szinte teljesen) föld alatt járnak
  let altSum = 0, altW = 0;

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    const t0 = a.predictedDeparture ?? a.scheduledDeparture;
    const t1 = Math.max(t0 + 1, b.predictedArrival ?? b.scheduledArrival);
    const pts = shapeBetween(trip, a, b);
    // A szakasz idejét a megtett távolság arányában osztjuk szét az alszakaszok között.
    const lens = pts.slice(1).map((p, k) => distM(pts[k][0], pts[k][1], p[0], p[1]));
    const total = lens.reduce((x, y) => x + y, 0) || 1;
    let acc = 0;
    for (let k = 0; k < lens.length; k++) {
      if (lens[k] < 1) continue;
      const tStart = t0 + ((t1 - t0) * acc) / total;
      acc += lens[k];
      const tEnd = t0 + ((t1 - t0) * acc) / total;
      const dt = tEnd - tStart;
      if (underground) { seconds.none += dt; continue; }
      const brg = bearing(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]);
      const sun = sunPosition((tStart + tEnd) / 2, pts[k][0], pts[k][1]);
      const side = sunSide(brg, sun.azimuth, sun.altitude);
      seconds[side] += dt;
      if (side === 'left' || side === 'right') { altSum += sun.altitude * dt; altW += dt; }
      const last = segments[segments.length - 1];
      if (last && last.sunnySide === side) { last.end = tEnd; last.toStop = b.name; }
      else segments.push({ fromStop: a.name, toStop: b.name, start: tStart, end: tEnd, sunnySide: side });
    }
  }

  // Apró (<45 s) szakaszok beolvasztása a szomszédba, hogy olvasható maradjon.
  const merged: SunSegment[] = [];
  for (const s of segments) {
    const prev = merged[merged.length - 1];
    if (prev && (s.end - s.start < 45 || prev.sunnySide === s.sunnySide)) { prev.end = s.end; prev.toStop = s.toStop; }
    else if (prev && prev.end - prev.start < 45) { prev.end = s.end; prev.toStop = s.toStop; prev.sunnySide = s.sunnySide; }
    else merged.push({ ...s });
  }
  for (const s of merged) { s.start = Math.round(s.start); s.end = Math.round(s.end); }

  const totalTime = Object.values(seconds).reduce((x, y) => x + y, 0) || 1;
  const sideSun = seconds.left + seconds.right;
  const sunnyShare = sideSun / totalTime;
  const overcast = (opts.cloudCover ?? 0) >= 85;
  let recommendedSide: Side | null = null;
  if (!underground && !overcast && sunnyShare > 0.1 && Math.abs(seconds.left - seconds.right) > 60) {
    const sunnier: Side = seconds.left > seconds.right ? 'left' : 'right';
    recommendedSide = preference === 'avoid' ? (sunnier === 'left' ? 'right' : 'left') : sunnier;
  }

  const hu = { left: 'bal', right: 'jobb' } as const;
  let summary: string;
  if (underground) summary = 'A metró nagyrészt a föld alatt jár, a nap nem zavar.';
  else if (overcast) summary = 'Borult az ég, a nap nem fog besütni – bármelyik oldalra ülhetsz.';
  else if (sunnyShare <= 0.1) summary = 'Ezen az úton alig süt be a nap oldalról – mindegy, hova ülsz.';
  else if (!recommendedSide) summary = 'A nap nagyjából egyenlően süt mindkét oldalra – mindegy, hova ülsz.';
  else {
    const pct = Math.round((Math.max(seconds.left, seconds.right) / sideSun) * 100);
    summary = preference === 'avoid'
      ? `Ülj a menetirány szerinti ${hu[recommendedSide]} oldalra – a napos idő ${pct}%-ában a másik oldalra süt.`
      : `Ülj a menetirány szerinti ${hu[recommendedSide]} oldalra – a napos idő ${pct}%-ában oda süt a nap.`;
  }

  return {
    recommendedSide, preference, seconds: roundAll(seconds), sunnyShare: Math.round(sunnyShare * 100) / 100,
    avgAltitudeDeg: altW ? Math.round(altSum / altW) : null, segments: merged, summary, underground,
  };
}

function roundAll<T extends Record<string, number>>(o: T): T {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)])) as T;
}

/** A shape pontjai két megálló között (shape_dist_traveled alapján, ennek hiányában legközelebbi pont). */
function shapeBetween(trip: TripDetails, a: TripDetails['stops'][number], b: TripDetails['stops'][number]): [number, number][] {
  const shape = trip.shape;
  let i0: number, i1: number;
  if (a.distance !== null && b.distance !== null && shape.length && shape[0][2] !== null) {
    i0 = shape.findIndex((p) => (p[2] ?? 0) >= a.distance!);
    i1 = shape.findIndex((p) => (p[2] ?? 0) >= b.distance!);
    if (i1 < 0) i1 = shape.length - 1;
  } else {
    i0 = nearest(shape, a.lat, a.lon);
    i1 = nearest(shape, b.lat, b.lon, i0);
  }
  const pts: [number, number][] = [[a.lat, a.lon]];
  if (i0 >= 0 && i1 > i0) for (let i = i0; i <= i1; i++) pts.push([shape[i][0], shape[i][1]]);
  pts.push([b.lat, b.lon]);
  return pts;
}

function nearest(shape: TripDetails['shape'], lat: number, lon: number, from = 0) {
  let best = -1, bd = Infinity;
  for (let i = Math.max(0, from); i < shape.length; i++) {
    const d = (shape[i][0] - lat) ** 2 + (shape[i][1] - lon) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
