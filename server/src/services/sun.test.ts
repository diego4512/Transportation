import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearing, sunSide, sunPosition, computeSunAdvice } from './sun.ts';
import type { TripDetails } from '../types.ts';

test('bearing: északra 0°, keletre 90°', () => {
  assert.ok(Math.abs(bearing(47.5, 19.0, 47.6, 19.0) - 0) < 0.5);
  assert.ok(Math.abs(bearing(47.5, 19.0, 47.5, 19.1) - 90) < 0.5);
});

test('napállás: budapesti nyári dél körül délen, magasan', () => {
  // 2026-06-21 13:00 helyi idő (11:00 UTC) – ekkor delel a nap Budapesten
  const p = sunPosition(Date.UTC(2026, 5, 21, 11, 0) / 1000, 47.5, 19.04);
  assert.ok(Math.abs(p.azimuth - 180) < 10, `azimut ${p.azimuth}`);
  assert.ok(p.altitude > 60, `magasság ${p.altitude}`);
});

test('sunSide: északra haladva a keleti nap jobbról süt', () => {
  assert.equal(sunSide(0, 90, 20), 'right');
  assert.equal(sunSide(0, 270, 20), 'left');
  assert.equal(sunSide(0, 5, 20), 'front');
  assert.equal(sunSide(0, 180, 20), 'back');
  assert.equal(sunSide(0, 90, -5), 'none');
});

test('computeSunAdvice: délutáni nyugati nap, északra tartó jármű → jobb oldal az árnyékos', () => {
  // 2026-09-01 17:00 helyi (15:00 UTC): a nap nyugat-délnyugaton áll
  const t0 = Date.UTC(2026, 8, 1, 15, 0) / 1000;
  const stops = [0, 1, 2, 3].map((i) => ({
    stopId: `S${i}`, name: `Megálló ${i}`, lat: 47.48 + i * 0.01, lon: 19.05, sequence: i + 1, distance: null,
    scheduledArrival: t0 + i * 120, scheduledDeparture: t0 + i * 120, predictedArrival: null, predictedDeparture: null,
  }));
  const trip: TripDetails = {
    tripId: 'T', serviceDate: '20260901', route: { id: 'R', shortName: '4', longName: '', type: 0, color: '#ff0', textColor: '#000' },
    headsign: 'Észak', directionId: 0, wheelchair: true, stops, shape: stops.map((s) => [s.lat, s.lon, null]),
    vehicle: null, alertIds: [], realtime: false,
  };
  const a = computeSunAdvice(trip, 1, 4, { preference: 'avoid' });
  assert.equal(a.recommendedSide, 'right');
  assert.ok(a.seconds.left > 300);
  const seek = computeSunAdvice(trip, 1, 4, { preference: 'seek' });
  assert.equal(seek.recommendedSide, 'left');
  const metro = computeSunAdvice({ ...trip, route: { ...trip.route, type: 1 } }, 1, 4);
  assert.equal(metro.recommendedSide, null);
  assert.ok(metro.underground);
});
