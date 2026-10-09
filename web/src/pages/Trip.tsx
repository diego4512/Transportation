import { lazy, Suspense, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useData, useNow } from '../lib/hooks';
import { useStore } from '../lib/store';
import { addWatch } from '../lib/push';
import { delayLabel, fmtTime, ROUTE_TYPE_NAME } from '../lib/format';
import { RouteBadge } from '../components/RouteBadge';
import { AlertCard } from '../components/AlertCard';
import { SunAdvice } from '../components/SunAdvice';

const MapView = lazy(() => import('../components/MapView'));

const OCCUPANCY: Record<string, string> = {
  EMPTY: 'üres', MANY_SEATS_AVAILABLE: 'sok szabad hely', FEW_SEATS_AVAILABLE: 'kevés szabad ülőhely',
  STANDING_ROOM_ONLY: 'csak állóhely', CRUSHED_STANDING_ROOM_ONLY: 'zsúfolt', FULL: 'tele',
};

export function Trip() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const date = params.get('date') ?? undefined;
  const now = useNow(10_000);
  const { settings } = useStore();
  const { data, error } = useData(() => api.trip(id, date), [id, date], 15_000);
  const trip = data?.trip;
  const fromId = params.get('from') ?? trip?.stops[0]?.stopId;
  const fromStop = trip?.stops.find((s) => s.stopId === fromId) ?? trip?.stops[0];
  const [toId, setToId] = useState<string | null>(null);
  const after = trip?.stops.filter((s) => fromStop && s.sequence > fromStop.sequence) ?? [];
  const toStop = after.find((s) => s.stopId === toId) ?? after[after.length - 1];
  const [msg, setMsg] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);

  const pref = settings.sunPreference === 'auto' ? undefined : settings.sunPreference;
  const { data: sun } = useData(
    () => (trip && fromStop && toStop ? api.sun(id, { date: trip.serviceDate, from: fromStop.stopId, to: toStop.stopId, pref }) : Promise.resolve(null)),
    [id, trip?.serviceDate, fromStop?.stopId, toStop?.stopId, pref], 5 * 60_000,
  );
  const { data: routeInfo } = useData(() => (trip ? api.route(trip.route.id) : Promise.resolve(null)), [trip?.route.id]);

  const vehicleIdx = useMemo(() => {
    const seq = trip?.vehicle?.stopSequence;
    return seq != null && trip ? trip.stops.findIndex((s) => s.sequence >= seq) : -1;
  }, [trip]);

  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!trip || !fromStop) return <div className="page"><p className="muted">Betöltés…</p></div>;

  const depTime = fromStop.predictedDeparture ?? fromStop.scheduledDeparture;
  const delay = fromStop.predictedDeparture ? fromStop.predictedDeparture - fromStop.scheduledDeparture : null;
  const dl = delayLabel(delay);
  const hour = Number(new Date(depTime * 1000).toLocaleString('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Budapest' }));
  const profile = routeInfo?.delayProfile.find((p) => p.hour === hour);

  const watch = async (kind: string, extra: Record<string, unknown>, okText: string) => {
    try {
      await addWatch(kind, { tripId: trip.tripId, serviceDate: trip.serviceDate, stopId: fromStop.stopId, ...extra });
      setMsg(okText);
    } catch (e) { setMsg(`⚠️ ${(e as Error).message}`); }
  };

  const share = async () => {
    const url = location.href;
    const text = `${trip.route.shortName} ▸ ${trip.headsign}, ${toStop ? `érkezés ${toStop.name} kb. ${fmtTime(toStop.predictedArrival ?? toStop.scheduledArrival)}` : ''}`;
    if (navigator.share) await navigator.share({ title: 'Úton vagyok', text, url }).catch(() => null);
    else { await navigator.clipboard.writeText(`${text} ${url}`); setMsg('Link kimásolva.'); }
  };

  const v = trip.vehicle;
  return (
    <div className="page">
      <header className="page-head trip-head">
        <RouteBadge route={trip.route} />
        <div>
          <h2>{trip.headsign}</h2>
          <div className="muted small">{ROUTE_TYPE_NAME[trip.route.type] ?? ''} · {trip.realtime ? <><span className="rt-dot" /> valós idejű</> : 'menetrend szerint'}</div>
        </div>
      </header>

      <section className="card">
        <div className="trip-summary">
          <div>
            <div className="muted small">Indulás innen: {fromStop.name}</div>
            <div className="big-time">{fmtTime(depTime)} {dl && <span className={`small ${dl.cls}`}>{dl.text}</span>}</div>
            <div className="small muted">{Math.max(0, Math.round((depTime - now) / 60))} perc múlva</div>
          </div>
          {toStop && (
            <div className="right">
              <div className="muted small">Érkezés</div>
              <div className="big-time">{fmtTime(toStop.predictedArrival ?? toStop.scheduledArrival)}</div>
              <div className="small muted">{Math.round(((toStop.predictedArrival ?? toStop.scheduledArrival) - depTime) / 60)} perc út</div>
            </div>
          )}
        </div>
        <label className="form-inline">Hol szállsz le?
          <select value={toStop?.stopId ?? ''} onChange={(e) => setToId(e.target.value)}>
            {after.map((s) => <option key={s.stopId} value={s.stopId}>{s.name} ({fmtTime(s.scheduledArrival)})</option>)}
          </select>
        </label>
        {profile && profile.samples >= 5 && (
          <p className="small">📊 Ebben az órában átlagosan <b>{Math.round(profile.avgDelaySec / 60)} perc</b> késés ({profile.samples} megfigyelés)</p>
        )}
      </section>

      {data.warning && <p className="info small">ℹ️ {data.warning}</p>}
      {data.alerts.map((a) => <AlertCard key={a.id} alert={a} compact />)}
      {delay !== null && delay >= 120 && !data.alerts.length && <p className="info small">⏱ A járat késik; a BKK nem adott meg hivatalos okot.</p>}

      {sun && <SunAdvice data={sun} />}

      {v && (
        <section className="card">
          <h3>🚌 A jármű</h3>
          <p className="small">
            {v.model && <>Típus: <b>{v.model}</b> · </>}
            {v.licensePlate && <>Rendszám: {v.licensePlate} · </>}
            {v.wheelchair !== null && (v.wheelchair ? '♿ alacsony padlós · ' : 'nem akadálymentes · ')}
            {v.airConditioning.value === true ? '❄️ klímás' : v.airConditioning.value === false ? '🥵 nincs klíma' : 'klíma: ismeretlen'}
            {v.occupancy && OCCUPANCY[v.occupancy] && <> · 👥 {OCCUPANCY[v.occupancy]}</>}
          </p>
          {v.lastUpdate && <p className="muted small">Utolsó pozíció: {fmtTime(v.lastUpdate)}</p>}
        </section>
      )}

      <section className="card actions">
        <h3>🔔 Értesítések</h3>
        <button className="btn" onClick={() => watch('delay', { thresholdMin: settings.delayThresholdMin }, `Rendben, szólok, ha ${settings.delayThresholdMin} percnél többet késik (az okkal együtt, ha ismert).`)}>⏱ Szólj, ha késik</button>
        <button className="btn" onClick={() => watch('leave', { walkMin: settings.walkMin, bufferMin: settings.bufferMin }, `Rendben, szólok, amikor indulnod kell (${settings.walkMin} perc gyaloglás + ${settings.bufferMin} perc ráhagyás).`)}>🚶 Szólj, mikor induljak</button>
        {toStop && <button className="btn" onClick={() => watch('alight', { destStopId: toStop.stopId, stopsBefore: 1 }, `Rendben, szólok a leszállás előtt (${toStop.name}).`)}>🛎️ Szólj, mielőtt leszállok</button>}
        <button className="btn" onClick={share}>📤 Megosztom, hol járok</button>
        {msg && <p className="small">{msg}</p>}
      </section>

      <button className="btn wide" onClick={() => setShowMap(!showMap)}>🗺️ {showMap ? 'Térkép elrejtése' : 'Térkép'}</button>
      {showMap && (
        <Suspense fallback={<p className="muted">Térkép betöltése…</p>}>
          <MapView fitShape shape={trip.shape.map(([a, b]) => [a, b])} shapeColor={trip.route.color}
            stops={trip.stops.map((s) => ({ id: s.stopId, name: s.name, lat: s.lat, lon: s.lon }))}
            vehicles={v ? [{ ...v, color: trip.route.color, routeName: trip.route.shortName }] : []} />
        </Suspense>
      )}

      <ol className="timeline">
        {trip.stops.map((s, i) => {
          const t = s.predictedDeparture ?? s.scheduledDeparture;
          const passed = vehicleIdx >= 0 ? i < vehicleIdx : t < now - 30;
          const cls = [passed ? 'passed' : '', s.stopId === fromStop.stopId ? 'from' : '', s.stopId === toStop?.stopId ? 'to' : '', i === vehicleIdx ? 'vehicle-here' : ''].join(' ');
          return (
            <li key={s.sequence} className={cls}>
              <span className="tl-time">{fmtTime(t)}</span>
              <span className="tl-dot" />
              <span className="tl-name">{s.name}{i === vehicleIdx && <span className="vehicle-pin"> 🚍</span>}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
