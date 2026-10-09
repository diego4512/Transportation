import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useData, useNow } from '../lib/hooks';
import { store, useStore } from '../lib/store';
import { addWatch } from '../lib/push';
import { DepartureList } from '../components/DepartureList';
import { AlertCard } from '../components/AlertCard';
import { RouteBadge } from '../components/RouteBadge';

const DAYS = ['V', 'H', 'K', 'Sze', 'Cs', 'P', 'Szo'];

function DailyWatchForm({ stopId, stopName, routes }: { stopId: string; stopName: string; routes: { id: string; shortName: string }[] }) {
  const { settings } = useStore();
  const [routeId, setRouteId] = useState(routes[0]?.id ?? '');
  const [time, setTime] = useState('07:30');
  const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [msg, setMsg] = useState<string | null>(null);
  const submit = async () => {
    try {
      const r = routes.find((x) => x.id === routeId);
      await addWatch('route-daily', { stopId, routeId, time, days, thresholdMin: settings.delayThresholdMin, label: `${r?.shortName} – ${stopName}` });
      await addWatch('route-alerts', { routeIds: [routeId] }).catch(() => null);
      setMsg(`Kész! ${time}-kor ellenőrzöm, és csak akkor szólok, ha késés vagy forgalmi változás van.`);
    } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <details className="card">
      <summary>🔔 Rendszeres utam innen – szólj, ha gond van</summary>
      <div className="form">
        <label>Járat <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>{routes.map((r) => <option key={r.id} value={r.id}>{r.shortName}</option>)}</select></label>
        <label>Időpont <input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        <div className="day-picker">
          {DAYS.map((d, i) => (
            <button key={d} type="button" className={`chip ${days.includes(i) ? 'chip-on' : ''}`} onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i])}>{d}</button>
          ))}
        </div>
        <button className="btn primary" onClick={submit} disabled={!routeId || !days.length}>Figyelés bekapcsolása</button>
        {msg && <p className="small">{msg}</p>}
      </div>
    </details>
  );
}

export function Stop() {
  const { id = '' } = useParams();
  const now = useNow(10_000);
  useStore();
  const { data: stopData, error: stopErr } = useData(() => api.stop(id), [id]);
  const { data, error, loading } = useData(() => api.departures(id, true, 120), [id], 20_000);
  const [routeFilter, setRouteFilter] = useState<string | null>(null);
  const stop = stopData?.stop;

  useEffect(() => { if (stop) store.addRecent({ id: stop.id, name: stop.name }); }, [stop?.id]);

  const routes = useMemo(() => {
    const m = new Map<string, NonNullable<typeof stop>['routes'][number]>();
    stop?.routes.forEach((r) => m.set(r.id, r));
    stopData?.siblings.forEach((s) => s.routes.forEach((r) => m.set(r.id, r)));
    return [...m.values()];
  }, [stopData]);

  if (stopErr) return <div className="page"><p className="error">{stopErr}</p></div>;
  const deps = data?.departures.filter((d) => !routeFilter || d.route.id === routeFilter) ?? [];
  const fav = stop ? store.isFavorite(stop.id) : false;

  return (
    <div className="page">
      <header className="page-head">
        <h2>{stop?.name ?? '…'}</h2>
        <div className="head-actions">
          {stop && <button className="icon-btn" aria-label="Kedvenc" onClick={() => store.toggleFavorite({ id: stop.id, name: stop.name })}>{fav ? '⭐' : '☆'}</button>}
          <Link className="icon-btn" to={`/widget/${id}`} title="Widget nézet">🔲</Link>
        </div>
      </header>
      {stop?.wheelchair && <p className="small muted">♿ Akadálymentes megálló</p>}
      <div className="badges filter-row">
        <button className={`chip ${!routeFilter ? 'chip-on' : ''}`} onClick={() => setRouteFilter(null)}>Mind</button>
        {routes.map((r) => (
          <button key={r.id} className={`chip-badge ${routeFilter === r.id ? 'on' : ''}`} onClick={() => setRouteFilter(routeFilter === r.id ? null : r.id)}>
            <RouteBadge route={r} small />
          </button>
        ))}
      </div>
      {data?.source === 'schedule' && <p className="info small">ℹ️ Menetrend szerinti időket látsz{data.warning ? ` – ${data.warning}` : ' (valós idejű adathoz BKK API kulcs kell).'}</p>}
      {data?.alerts.filter((a) => !routeFilter || a.routeIds.includes(routeFilter)).map((a) => <AlertCard key={a.id} alert={a} compact />)}
      {loading && !data ? <p className="muted">Betöltés…</p> : error ? <p className="error">{error}</p> : <DepartureList departures={deps} alerts={data?.alerts ?? []} now={now} />}
      {stop && routes.length > 0 && <DailyWatchForm stopId={stop.id} stopName={stop.name} routes={routes} />}
    </div>
  );
}
