export const fmtTime = (t: number) =>
  new Date(t * 1000).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Budapest' });

export function minutesUntil(t: number, now = Date.now() / 1000) {
  return Math.round((t - now) / 60);
}

/** "most", "3 perc", "14:05" */
export function relTime(t: number, now = Date.now() / 1000) {
  const m = minutesUntil(t, now);
  if (m <= 0) return 'most';
  if (m < 60) return `${m}′`;
  return fmtTime(t);
}

export function delayLabel(delaySec: number | null) {
  if (delaySec === null) return null;
  const m = Math.round(delaySec / 60);
  if (m >= 1) return { text: `+${m} perc`, cls: m >= 5 ? 'late-bad' : 'late' };
  if (m <= -1) return { text: `${m} perc`, cls: 'early' };
  return { text: 'pontos', cls: 'ontime' };
}

export function distanceLabel(m?: number) {
  if (m === undefined) return '';
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

export const ROUTE_TYPE_NAME: Record<number, string> = {
  0: 'villamos', 1: 'metró', 2: 'vasút', 3: 'busz', 4: 'hajó', 7: 'fogaskerekű', 11: 'troli', 109: 'HÉV',
};

export const sideHu = { left: 'bal', right: 'jobb' } as const;
