/** Indulások: valós idejű (BKK) adat, ha van kulcs – különben / hiba esetén menetrend (GTFS). */
import { hasRealtime } from '../config.ts';
import { realtimeDepartures, activeAlerts } from '../bkk/client.ts';
import { scheduledDepartures, tripDetails } from '../gtfs/queries.ts';
import { attachReliability, recordDelays } from './stats.ts';
import type { Alert, Departure, TripDetails } from '../types.ts';
import { enrichTrip } from '../bkk/client.ts';

export interface DeparturesResult {
  departures: Departure[];
  alerts: Alert[];
  source: 'realtime' | 'schedule';
  warning?: string;
}

export async function departuresFor(stopIds: string[], minutes = 90): Promise<DeparturesResult> {
  if (hasRealtime()) {
    try {
      const { departures, alerts } = await realtimeDepartures(stopIds, minutes);
      try { recordDelays(departures); } catch (e) { console.warn('Késés rögzítése sikertelen', e); }
      return { departures: attachReliability(departures), alerts, source: 'realtime' };
    } catch (e) {
      const deps = scheduledDepartures(stopIds, undefined, minutes * 60);
      return { departures: attachReliability(deps), alerts: [], source: 'schedule', warning: `Valós idejű adat most nem elérhető (${(e as Error).message}), menetrend szerinti időket látsz.` };
    }
  }
  return { departures: attachReliability(scheduledDepartures(stopIds, undefined, minutes * 60)), alerts: [], source: 'schedule' };
}

export async function tripFor(tripId: string, serviceDate?: string): Promise<{ trip: TripDetails; alerts: Alert[]; warning?: string } | null> {
  const trip = tripDetails(tripId, serviceDate);
  if (!trip) return null;
  if (!hasRealtime()) return { trip, alerts: [] };
  try {
    return await enrichTrip(trip);
  } catch (e) {
    return { trip, alerts: [], warning: `Valós idejű adat most nem elérhető (${(e as Error).message}).` };
  }
}

export async function alertsAll(): Promise<Alert[]> {
  if (!hasRealtime()) return [];
  return activeAlerts();
}

/** Késés okának megfogalmazása: hivatalos hír alapján, vagy őszintén jelezzük, hogy nincs megadva. */
export function delayReasonText(delaySec: number, alerts: Alert[]): { text: string; official: boolean } {
  const relevant = alerts[0];
  if (relevant) return { text: `${relevant.reason.emoji} ${relevant.reason.label}: ${relevant.header}`, official: true };
  if (delaySec >= 120) return { text: 'A BKK nem adott meg okot (valószínűleg forgalmi torlódás).', official: false };
  return { text: '', official: false };
}
