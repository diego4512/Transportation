import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useData, useGeolocation, useNow } from '../lib/hooks';
import { store, useStore, type FavoriteStop } from '../lib/store';
import { distanceLabel } from '../lib/format';
import { RouteBadge } from '../components/RouteBadge';
import { DepartureList } from '../components/DepartureList';
import type { StopGroup } from '../lib/types';

function SearchResults({ q }: { q: string }) {
  const [results, setResults] = useState<StopGroup[] | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    const t = setTimeout(() => api.search(q).then((r) => setResults(r.results)).catch(() => setResults([])), 200);
    return () => clearTimeout(t);
  }, [q]);
  if (!results) return null;
  if (!results.length) return <p className="muted">Nincs találat.</p>;
  return (
    <ul className="list">
      {results.map((g) => (
        <li key={g.stopIds.join()}>
          <Link to={`/stop/${g.stopIds[0]}`} className="list-row">
            <div className="list-title">{g.name}</div>
            <div className="badges">{g.routes.slice(0, 14).map((r) => <RouteBadge key={r.id} route={r} small />)}{g.routes.length > 14 && <span className="muted small">+{g.routes.length - 14}</span>}</div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function FavoriteCard({ f }: { f: FavoriteStop }) {
  const now = useNow();
  const { data } = useData(() => api.departures(f.id, true, 60), [f.id], 30_000);
  return (
    <section className="card">
      <Link to={`/stop/${f.id}`} className="card-title-link"><h3>⭐ {f.name}</h3></Link>
      {data ? <DepartureList departures={data.departures} alerts={data.alerts} now={now} limit={4} compact /> : <p className="muted small">Betöltés…</p>}
    </section>
  );
}

function Nearby() {
  const { pos, error } = useGeolocation(true);
  const { data } = useData(() => (pos ? api.nearby(pos.lat, pos.lon, 600) : Promise.resolve(null)), [pos ? `${pos.lat.toFixed(3)},${pos.lon.toFixed(3)}` : null]);
  if (error) return <p className="muted">{error}</p>;
  if (!pos) return <p className="muted">Helymeghatározás…</p>;
  if (!data) return <p className="muted">Betöltés…</p>;
  if (!data.stops.length) return <p className="muted">600 méteren belül nincs megálló.</p>;
  // Az azonos nevű peronokat összevonjuk (a megálló oldala úgyis mindet mutatja).
  const grouped = new Map<string, (typeof data.stops)[number]>();
  for (const s of data.stops) {
    const g = grouped.get(s.name);
    if (!g) grouped.set(s.name, { ...s, routes: [...s.routes] });
    else for (const r of s.routes) if (!g.routes.some((x) => x.id === r.id)) g.routes.push(r);
  }
  return (
    <ul className="list">
      {[...grouped.values()].slice(0, 12).map((s) => (
        <li key={s.id}>
          <Link to={`/stop/${s.id}`} className="list-row">
            <div className="list-title">{s.name} <span className="muted small">{distanceLabel(s.distance)}</span></div>
            <div className="badges">{s.routes.map((r) => <RouteBadge key={r.id} route={r} small />)}</div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Home() {
  const { favorites, recent } = useStore();
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [near, setNear] = useState(params.get('near') === '1');
  const { data: weather } = useData(() => api.weather(), [], 10 * 60_000);
  const w = weather?.weather;

  return (
    <div className="page">
      <input className="search" type="search" placeholder="Megálló keresése…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={!favorites.length} />
      {q ? <SearchResults q={q} /> : (
        <>
          {w && (
            <div className={`weather-banner level-${w.level}`}>
              <span className="weather-temp">{Math.round(w.temperature)}°C</span>
              <span className="small">hőérzet {Math.round(w.apparentTemperature)}° · ☁️ {w.cloudCover}%{w.rain ? ' · 🌧️ eső' : ''}</span>
              {w.advice.map((a) => <div key={a} className="small">{a}</div>)}
            </div>
          )}
          <button className="btn wide" onClick={() => setNear(!near)}>📍 {near ? 'Közeli megállók elrejtése' : 'Közeli megállók'}</button>
          {near && <Nearby />}
          {favorites.map((f) => <FavoriteCard key={f.id} f={f} />)}
          {!favorites.length && <p className="muted">Tipp: a megálló oldalán a ☆ gombbal kedvencet adhatsz hozzá, és itt látod az indulásait.</p>}
          {recent.length > 0 && (
            <>
              <h4 className="section-title">Legutóbbiak</h4>
              <ul className="list">
                {recent.filter((r) => !store.isFavorite(r.id)).map((r) => <li key={r.id}><Link className="list-row" to={`/stop/${r.id}`}><div className="list-title">{r.name}</div></Link></li>)}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
