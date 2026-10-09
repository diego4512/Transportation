import { Link } from 'react-router-dom';
import type { Alert, Departure } from '../lib/types';
import { delayLabel, fmtTime, minutesUntil } from '../lib/format';
import { RouteBadge } from './RouteBadge';

export function DepartureList({ departures, alerts, now, limit, compact }: {
  departures: Departure[]; alerts: Alert[]; now: number; limit?: number; compact?: boolean;
}) {
  const list = departures.filter((d) => (d.predicted ?? d.scheduled) >= now - 30).slice(0, limit ?? 40);
  if (!list.length) return <p className="muted">A következő időszakban nincs indulás.</p>;
  const alertById = new Map(alerts.map((a) => [a.id, a]));
  return (
    <ul className="dep-list">
      {list.map((d) => {
        const t = d.predicted ?? d.scheduled;
        const m = minutesUntil(t, now);
        const dl = delayLabel(d.delaySec);
        const depAlerts = d.alertIds.map((id) => alertById.get(id)).filter(Boolean) as Alert[];
        return (
          <li key={`${d.tripId}-${d.stopId}-${d.scheduled}`}>
            <Link to={`/trip/${encodeURIComponent(d.tripId)}?date=${d.serviceDate}&from=${d.stopId}`} className="dep-row">
              <RouteBadge route={d.route} />
              <div className="dep-main">
                <div className="dep-headsign">{d.headsign}</div>
                {!compact && (
                  <div className="dep-meta small">
                    {d.realtime ? <span className="rt-dot" title="Valós idejű" /> : <span className="muted" title="Menetrend szerinti">menetrend</span>}
                    {dl && <span className={dl.cls}>{dl.text}</span>}
                    {d.realtime && d.delaySec !== null && Math.abs(d.delaySec) >= 60 && <span className="muted">({fmtTime(d.scheduled)} helyett)</span>}
                    {d.wheelchair && <span title="Akadálymentes">♿</span>}
                    {d.vehicle?.airConditioning.value === true && <span title="Klímás jármű">❄️</span>}
                    {d.reliability && <span className="muted" title={`${d.reliability.samples} megfigyelés alapján`}>· általában {d.reliability.onTimePct}% pontos</span>}
                    {depAlerts.slice(0, 1).map((a) => <span key={a.id} className="dep-alert">{a.reason.emoji} {a.reason.label}</span>)}
                  </div>
                )}
              </div>
              <div className={`dep-time ${d.realtime ? 'rt' : ''}`}>
                {m <= 0 ? <b>most</b> : m < 60 ? <><b>{m}</b><span className="small">perc</span></> : <b>{fmtTime(t)}</b>}
                {m > 0 && m < 60 && <span className="small muted">{fmtTime(t)}</span>}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
