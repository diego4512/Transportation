import { useCallback, useEffect, useRef, useState } from 'react';

/** Adat betöltése + opcionális automatikus frissítés (ms). Látható lapon frissít csak. */
export function useData<T>(load: () => Promise<T>, deps: unknown[], refreshMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    try {
      const d = await loadRef.current();
      setData(d);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setData(null);
    reload();
    if (!refreshMs) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, refreshMs);
    const onVis = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload };
}

/** Másodpercenként frissülő "most" – a visszaszámlálókhoz. */
export function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useGeolocation(enabled: boolean) {
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (!('geolocation' in navigator)) { setError('A böngésző nem támogatja a helymeghatározást'); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => setError(e.code === 1 ? 'A helymeghatározás nincs engedélyezve' : 'Nem sikerült meghatározni a helyzeted'),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);
  return { pos, error };
}
