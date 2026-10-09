import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { StopInfo, VehicleInfo } from '../lib/types';

export interface MapViewProps {
  center?: [number, number]; // [lat, lon]
  zoom?: number;
  stops?: Pick<StopInfo, 'id' | 'name' | 'lat' | 'lon'>[];
  vehicles?: (VehicleInfo & { color?: string; routeName?: string })[];
  shape?: [number, number][];
  shapeColor?: string;
  highlight?: [number, number] | null;
  me?: { lat: number; lon: number } | null;
  onStopClick?: (id: string) => void;
  onMoveEnd?: (center: { lat: number; lon: number }, zoom: number) => void;
  fitShape?: boolean;
  className?: string;
}

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const empty = () => ({ type: 'FeatureCollection' as const, features: [] });

export default function MapView(p: MapViewProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const props = useRef(p);
  props.current = p;

  useEffect(() => {
    const m = new maplibregl.Map({
      container: el.current!,
      style: STYLE,
      center: p.center ? [p.center[1], p.center[0]] : [19.0402, 47.4979],
      zoom: p.zoom ?? 14,
      attributionControl: { compact: true },
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    m.on('load', () => {
      m.addSource('shape', { type: 'geojson', data: empty() });
      m.addLayer({ id: 'shape', type: 'line', source: 'shape', paint: { 'line-color': ['get', 'color'], 'line-width': 5, 'line-opacity': 0.85 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      m.addSource('stops', { type: 'geojson', data: empty() });
      m.addLayer({ id: 'stops', type: 'circle', source: 'stops', paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-color': '#5b2a86', 'circle-stroke-width': 2.5 } });
      m.addLayer({ id: 'stops-label', type: 'symbol', source: 'stops', minzoom: 15, layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.2], 'text-anchor': 'top' }, paint: { 'text-halo-color': '#fff', 'text-halo-width': 1.5 } });
      m.addSource('vehicles', { type: 'geojson', data: empty() });
      m.addLayer({ id: 'vehicles', type: 'circle', source: 'vehicles', paint: { 'circle-radius': 11, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      m.addLayer({ id: 'vehicles-label', type: 'symbol', source: 'vehicles', layout: { 'text-field': ['get', 'label'], 'text-size': 10, 'text-allow-overlap': true }, paint: { 'text-color': '#fff' } });
      m.addSource('me', { type: 'geojson', data: empty() });
      m.addLayer({ id: 'me', type: 'circle', source: 'me', paint: { 'circle-radius': 8, 'circle-color': '#1a73e8', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
      ready.current = true;
      sync();
    });
    m.on('click', 'stops', (e) => {
      const id = e.features?.[0]?.properties?.id;
      if (id) props.current.onStopClick?.(id);
    });
    m.on('mouseenter', 'stops', () => { m.getCanvas().style.cursor = 'pointer'; });
    m.on('mouseleave', 'stops', () => { m.getCanvas().style.cursor = ''; });
    m.on('moveend', () => {
      const c = m.getCenter();
      props.current.onMoveEnd?.({ lat: c.lat, lon: c.lng }, m.getZoom());
    });
    return () => { ready.current = false; m.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fitted = useRef(false);
  function sync() {
    const m = map.current;
    if (!m || !ready.current) return;
    const { stops = [], vehicles = [], shape = [], shapeColor = '#5b2a86', me } = props.current;
    (m.getSource('stops') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: stops.map((s) => ({ type: 'Feature', properties: { id: s.id, name: s.name }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } })),
    });
    (m.getSource('vehicles') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: vehicles.filter((v) => v.lat && v.lon).map((v) => ({
        type: 'Feature', properties: { color: v.color ?? '#333', label: v.routeName ?? '' },
        geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
      })),
    });
    (m.getSource('shape') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: shape.length > 1 ? [{ type: 'Feature', properties: { color: shapeColor }, geometry: { type: 'LineString', coordinates: shape.map(([la, lo]) => [lo, la]) } }] : [],
    });
    (m.getSource('me') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: me ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [me.lon, me.lat] } }] : [],
    });
    if (props.current.fitShape && shape.length > 1 && !fitted.current) {
      const b = new maplibregl.LngLatBounds();
      shape.forEach(([la, lo]) => b.extend([lo, la]));
      m.fitBounds(b, { padding: 40, duration: 0 });
      fitted.current = true;
    }
  }

  useEffect(sync, [p.stops, p.vehicles, p.shape, p.me, p.shapeColor]);

  useEffect(() => {
    if (p.highlight && map.current) map.current.easeTo({ center: [p.highlight[1], p.highlight[0]] });
  }, [p.highlight?.[0], p.highlight?.[1]]);

  return <div ref={el} className={p.className ?? 'map'} />;
}
