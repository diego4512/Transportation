import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useGeolocation } from '../lib/hooks';
import type { StopInfo, VehicleInfo } from '../lib/types';

const MapView = lazy(() => import('../components/MapView'));

export function MapPage() {
  const nav = useNavigate();
  const { pos } = useGeolocation(true);
  const [center, setCenter] = useState<{ lat: number; lon: number } | null>(null);
  const [zoom, setZoom] = useState(15);
  const [stops, setStops] = useState<StopInfo[]>([]);
  const [vehicles, setVehicles] = useState<(VehicleInfo & { color?: string; routeName?: string })[]>([]);
  const [realtime, setRealtime] = useState(true);

  useEffect(() => { if (pos && !center) setCenter(pos); }, [pos]);

  const load = useCallback(async (c: { lat: number; lon: number }, z: number) => {
    if (z < 13.5) { setStops([]); return; }
    api.nearby(c.lat, c.lon, z > 16 ? 600 : 1200).then((r) => setStops(r.stops)).catch(() => null);
    api.vehiclesNear(c.lat, c.lon, 2000).then((r) => {
      setRealtime(r.realtime);
      setVehicles(r.vehicles.map((v) => ({ ...v, color: v.route?.color ?? '#5b2a86', routeName: v.route?.shortName ?? '' })));
    }).catch(() => null);
  }, []);

  useEffect(() => {
    const c = center ?? { lat: 47.4979, lon: 19.0402 };
    load(c, zoom);
    const t = setInterval(() => document.visibilityState === 'visible' && load(c, zoom), 15_000);
    return () => clearInterval(t);
  }, [center, zoom, load]);

  return (
    <div className="map-page">
      {!realtime && <div className="map-note small">Járművek csak BKK API kulccsal láthatók.</div>}
      <Suspense fallback={<p className="muted">Térkép betöltése…</p>}>
        <MapView className="map-full" center={pos ? [pos.lat, pos.lon] : undefined} zoom={15}
          stops={stops} vehicles={vehicles} me={pos}
          onStopClick={(id) => nav(`/stop/${id}`)}
          onMoveEnd={(c, z) => { setCenter(c); setZoom(z); }} />
      </Suspense>
    </div>
  );
}
