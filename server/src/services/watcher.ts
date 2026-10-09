/**
 * Háttérfigyelő: a felhasználók által kért figyeléseket ellenőrzi és push értesítést küld.
 *
 *  - delay:        a járat késik a felszállási megállóban (okkal együtt, ha van hivatalos hír)
 *  - leave:        "Indulj most!" – gyaloglási idő + ráhagyás alapján
 *  - alight:       "Készülj, a következő megállóban szállj le!"
 *  - route-daily:  kedvenc útvonal napi ellenőrzése (pl. hétköznap 7:30), csak gond esetén szól
 *  - route-alerts: új forgalmi hír a kedvenc járataimon (pl. jövő heti pótlóbusz)
 *  - reminder:     egyszeri emlékeztető (pl. lejáró bérlet)
 */
import crypto from 'node:crypto';
import { appDb } from '../db.ts';
import { config, hasRealtime } from '../config.ts';
import { nowSec, localHourDow, ymd } from '../time.ts';
import { tripFor, departuresFor, alertsAll, delayReasonText } from './departures.ts';
import { sendPush } from './push.ts';
import type { Alert } from '../types.ts';

export type WatchKind = 'delay' | 'leave' | 'alight' | 'route-daily' | 'route-alerts' | 'reminder';

interface WatchRow { id: string; subscription_id: string; kind: WatchKind; params: string; state: string; expires_at: number }

const MAX_WATCHES_PER_SUB = 50;

export function createWatch(subscriptionId: string, kind: WatchKind, params: Record<string, any>, expiresAt: number) {
  const db = appDb();
  const n = (db.prepare('SELECT COUNT(*) AS n FROM watches WHERE subscription_id = ?').get(subscriptionId) as { n: number }).n;
  if (n >= MAX_WATCHES_PER_SUB) throw Object.assign(new Error('Túl sok aktív figyelés'), { statusCode: 429 });
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO watches (id, subscription_id, kind, params, state, expires_at, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, subscriptionId, kind, JSON.stringify(params), '{}', expiresAt, nowSec());
  return id;
}

export function listWatches(subscriptionId: string) {
  return (appDb().prepare('SELECT * FROM watches WHERE subscription_id = ? ORDER BY created_at DESC').all(subscriptionId) as unknown as WatchRow[])
    .map((w) => ({ id: w.id, kind: w.kind, params: JSON.parse(w.params), expiresAt: w.expires_at }));
}

export function deleteWatch(subscriptionId: string, id: string) {
  appDb().prepare('DELETE FROM watches WHERE id = ? AND subscription_id = ?').run(id, subscriptionId);
}

const fmtTime = (t: number) => new Date(t * 1000).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Budapest' });

async function handle(w: WatchRow, alertsCache: { get(): Promise<Alert[]> }): Promise<'keep' | 'done'> {
  const p = JSON.parse(w.params);
  const state = JSON.parse(w.state);
  const now = nowSec();
  const save = () => appDb().prepare('UPDATE watches SET state = ? WHERE id = ?').run(JSON.stringify(state), w.id);
  const push = (title: string, body: string, extra: { tag?: string; url?: string } = {}) =>
    sendPush(w.subscription_id, { title, body, tag: extra.tag ?? w.id, url: extra.url });

  switch (w.kind) {
    case 'reminder': {
      if (now < p.at) return 'keep';
      await push(p.title, p.body, { url: p.url ?? '/' });
      return 'done';
    }

    case 'delay':
    case 'leave':
    case 'alight': {
      const res = await tripFor(p.tripId, p.serviceDate);
      if (!res) return 'done';
      const { trip, alerts } = res;
      const tripUrl = `/trip/${encodeURIComponent(p.tripId)}?date=${p.serviceDate}&from=${p.stopId ?? ''}`;
      const name = `${trip.route.shortName} ▸ ${trip.headsign}`;

      if (w.kind === 'delay') {
        const st = trip.stops.find((s) => s.stopId === p.stopId);
        if (!st) return 'done';
        const sched = st.scheduledDeparture;
        const pred = st.predictedDeparture;
        if ((pred ?? sched) < now - 60) return 'done'; // elment
        if (pred === null) return 'keep';
        const delayMin = Math.round((pred - sched) / 60);
        const last = state.notifiedDelayMin as number | undefined;
        if (delayMin >= p.thresholdMin && (last === undefined || Math.abs(delayMin - last) >= 2)) {
          const relevant = alerts.filter((a) => a.routeIds.includes(trip.route.id) || trip.alertIds.includes(a.id));
          const reason = delayReasonText(pred - sched, relevant);
          await push(`⏱ ${name} – ${delayMin} perc késés`,
            `${st.name}: ${fmtTime(sched)} helyett kb. ${fmtTime(pred)}.${reason.text ? `\nOk: ${reason.text}` : ''}`, { url: tripUrl });
          state.notifiedDelayMin = delayMin; save();
        } else if (last !== undefined && last >= p.thresholdMin && delayMin < p.thresholdMin - 1) {
          await push(`✅ ${name} – behozta a késést`, `${st.name}: indulás kb. ${fmtTime(pred)}.`, { url: tripUrl });
          state.notifiedDelayMin = delayMin; save();
        }
        return 'keep';
      }

      if (w.kind === 'leave') {
        const st = trip.stops.find((s) => s.stopId === p.stopId);
        if (!st) return 'done';
        const dep = st.predictedDeparture ?? st.scheduledDeparture;
        const leaveAt = dep - (p.walkMin + (p.bufferMin ?? 2)) * 60;
        if (now >= leaveAt) {
          const left = Math.max(0, Math.round((dep - now) / 60));
          await push(`🚶 Indulj most! ${name}`, `${left} perc múlva indul innen: ${st.name} (${fmtTime(dep)}${st.predictedDeparture ? ', valós idő' : ', menetrend'}).`, { url: tripUrl });
          return 'done';
        }
        return 'keep';
      }

      // alight
      const destIdx = trip.stops.findIndex((s) => s.stopId === p.destStopId);
      if (destIdx < 0) return 'done';
      const dest = trip.stops[destIdx];
      const before = p.stopsBefore ?? 1;
      const vSeq = trip.vehicle?.stopSequence;
      const vIdx = vSeq != null ? trip.stops.findIndex((s) => s.sequence >= vSeq) : -1;
      const eta = dest.predictedArrival ?? dest.scheduledArrival;
      const trigger = vIdx >= 0 ? vIdx >= destIdx - before : now >= eta - 120;
      if (trigger) {
        await push(`🔔 Készülj a leszálláshoz!`, `${before <= 1 ? 'A következő' : `${before} megálló múlva a`} megállóban szállj le: ${dest.name} (kb. ${fmtTime(eta)}).`, { url: tripUrl });
        return 'done';
      }
      if (now > eta + 600) return 'done';
      return 'keep';
    }

    case 'route-daily': {
      const { hour, minute, dow } = localHourDow(now);
      const [hh, mm] = String(p.time).split(':').map(Number);
      const today = ymd(Date.now());
      const minutesNow = hour * 60 + minute;
      if (!p.days.includes(dow) || state.lastRun === today || minutesNow < hh * 60 + mm || minutesNow > hh * 60 + mm + 30) return 'keep';
      state.lastRun = today; save();
      const { departures, alerts } = await departuresFor([p.stopId], 60);
      const next = departures.filter((d) => d.route.id === p.routeId).slice(0, 3);
      const routeAlerts = alerts.filter((a) => a.routeIds.includes(p.routeId));
      const late = next.filter((d) => (d.delaySec ?? 0) >= p.thresholdMin * 60);
      if (!late.length && !routeAlerts.length) return 'keep'; // minden rendben – nem zavarunk
      const lines = late.map((d) => `${fmtTime(d.scheduled)} → ${fmtTime(d.predicted!)} (+${Math.round(d.delaySec! / 60)} perc)`);
      const reason = routeAlerts[0] ? `\n${routeAlerts[0].reason.emoji} ${routeAlerts[0].header}` : '';
      await push(`⚠️ ${p.label ?? 'Kedvenc útvonal'}: gond van`, `${lines.join('\n') || 'Forgalmi változás a járaton.'}${reason}`, { url: `/stop/${p.stopId}` });
      return 'keep';
    }

    case 'route-alerts': {
      const all = await alertsCache.get();
      const seen: string[] = state.seen ?? [];
      const fresh = all.filter((a) => !seen.includes(a.id) && a.routeIds.some((r) => p.routeIds.includes(r)));
      for (const a of fresh.slice(0, 3)) {
        const when = a.start && a.start > now ? ` (${new Date(a.start * 1000).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric', timeZone: 'Europe/Budapest' })}-tól)` : '';
        await push(`${a.reason.emoji} ${a.header}${when}`, a.description.slice(0, 180), { tag: `alert-${a.id}`, url: '/alerts' });
      }
      if (fresh.length) { state.seen = [...seen, ...fresh.map((a) => a.id)].slice(-300); save(); }
      return 'keep';
    }
  }
  return 'done';
}

let running = false;

export async function runWatchersOnce() {
  if (running) return;
  running = true;
  try {
    const db = appDb();
    const now = nowSec();
    db.prepare('DELETE FROM watches WHERE expires_at < ?').run(now);
    const rows = db.prepare('SELECT * FROM watches').all() as unknown as WatchRow[];
    let alerts: Promise<Alert[]> | null = null;
    const alertsCache = { get: () => (alerts ??= alertsAll().catch(() => [])) };
    for (const w of rows) {
      // Valós idő nélkül a késésfigyelésnek nincs értelme, a többi menetrend alapján is működik.
      if (!hasRealtime() && (w.kind === 'delay' || w.kind === 'route-alerts')) continue;
      try {
        if ((await handle(w, alertsCache)) === 'done') db.prepare('DELETE FROM watches WHERE id = ?').run(w.id);
      } catch (e) {
        console.warn(`Figyelés hiba (${w.kind})`, (e as Error).message);
      }
    }
  } finally {
    running = false;
  }
}

export function startWatcher() {
  const t = setInterval(() => { runWatchersOnce().catch((e) => console.error(e)); }, config.watcherIntervalSec * 1000);
  t.unref();
}
