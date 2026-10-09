import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useData, useNow } from '../lib/hooks';
import { RouteBadge } from '../components/RouteBadge';
import { fmtTime, minutesUntil } from '../lib/format';

/** Kompakt, nagy betűs, automatikusan frissülő nézet – kezdőképernyőre tűzhető "élő widget". */
export function Widget() {
  const { id = '' } = useParams();
  const now = useNow(5_000);
  const { data: stop } = useData(() => api.stop(id), [id]);
  const { data } = useData(() => api.departures(id, true, 60), [id], 15_000);
  const deps = (data?.departures ?? []).filter((d) => (d.predicted ?? d.scheduled) >= now - 30).slice(0, 6);
  return (
    <div className="widget">
      <Link to={`/stop/${id}`} className="widget-title">{stop?.stop.name ?? '…'}</Link>
      {deps.map((d) => {
        const t = d.predicted ?? d.scheduled;
        const m = minutesUntil(t, now);
        return (
          <div key={`${d.tripId}-${d.scheduled}`} className="widget-row">
            <RouteBadge route={d.route} />
            <span className="widget-head">{d.headsign}</span>
            <span className={`widget-min ${d.realtime ? 'rt' : ''}`}>{m <= 0 ? 'most' : m < 60 ? `${m}′` : fmtTime(t)}</span>
          </div>
        );
      })}
      {data && !deps.length && <p className="muted">Nincs indulás a következő órában.</p>}
      <div className="widget-foot muted small">{data?.source === 'realtime' ? '● valós idő' : 'menetrend'} · {fmtTime(now)}</div>
    </div>
  );
}
