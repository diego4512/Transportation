import { useState } from 'react';
import { api } from '../lib/api';
import { useData } from '../lib/hooks';
import { AlertCard } from '../components/AlertCard';

export function Alerts() {
  const { data, error, loading } = useData(() => api.alerts(), [], 120_000);
  const [q, setQ] = useState('');
  const list = (data?.alerts ?? []).filter((a) => !q || `${a.header} ${a.description}`.toLowerCase().includes(q.toLowerCase()));
  const now = Date.now() / 1000;
  const current = list.filter((a) => !a.start || a.start <= now);
  const upcoming = list.filter((a) => a.start && a.start > now);
  return (
    <div className="page">
      <h2>Forgalmi hírek</h2>
      {data && !data.realtime && <p className="info small">A forgalmi hírekhez BKK API kulcs szükséges.</p>}
      <input className="search" type="search" placeholder="Szűrés (pl. 4-6, M3, pótlóbusz)…" value={q} onChange={(e) => setQ(e.target.value)} />
      {loading && <p className="muted">Betöltés…</p>}
      {error && <p className="error">{error}</p>}
      {current.length > 0 && <h4 className="section-title">Most érvényes</h4>}
      {current.map((a) => <AlertCard key={a.id} alert={a} compact />)}
      {upcoming.length > 0 && <h4 className="section-title">Hamarosan</h4>}
      {upcoming.map((a) => <AlertCard key={a.id} alert={a} compact />)}
      {data?.realtime && !list.length && <p className="muted">Nincs forgalmi hír. 🎉</p>}
    </div>
  );
}
