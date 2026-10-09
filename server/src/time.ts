/** Időkezelés Budapest helyi idejében, függetlenül a szerver időzónájától. */

export const TZ = 'Europe/Budapest';

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
});

function parts(epochMs: number) {
  const p: Record<string, string> = {};
  for (const { type, value } of partsFmt.formatToParts(new Date(epochMs))) p[type] = value;
  return {
    y: Number(p.year), m: Number(p.month), d: Number(p.day),
    h: Number(p.hour), mi: Number(p.minute), s: Number(p.second),
  };
}

/** A budapesti időeltolódás (ms) az adott pillanatban, pl. +7200000 nyáron. */
export function tzOffsetMs(epochMs: number): number {
  const p = parts(epochMs);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

/** YYYYMMDD szám a budapesti naptári napra. */
export function ymd(epochMs: number): number {
  const p = parts(epochMs);
  return p.y * 10000 + p.m * 100 + p.d;
}

export function addDays(ymdNum: number, days: number): number {
  const y = Math.floor(ymdNum / 10000), m = Math.floor(ymdNum / 100) % 100, d = ymdNum % 100;
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
}

/**
 * A GTFS szolgáltatási nap kezdete (epoch másodperc): helyi dél mínusz 12 óra.
 * Így a nyári/téli időszámítás váltásakor is helyes.
 */
export function serviceDayStart(ymdNum: number): number {
  const y = Math.floor(ymdNum / 10000), m = Math.floor(ymdNum / 100) % 100, d = ymdNum % 100;
  const noonUtcGuess = Date.UTC(y, m - 1, d, 12);
  const noonLocal = noonUtcGuess - tzOffsetMs(noonUtcGuess);
  return Math.round(noonLocal / 1000) - 12 * 3600;
}

export function parseGtfsTime(s: string): number {
  const [h, m, sec] = s.split(':').map(Number);
  return h * 3600 + m * 60 + (sec || 0);
}

export const nowSec = () => Math.floor(Date.now() / 1000);

/** Helyi óra (0–23), perc és a hét napja (0 = vasárnap) egy epoch másodpercre. */
export function localHourDow(epochSec: number) {
  const p = parts(epochSec * 1000);
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return { hour: p.h, minute: p.mi, dow };
}
