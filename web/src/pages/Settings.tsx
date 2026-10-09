import { useState } from 'react';
import { api } from '../lib/api';
import { store, useStore } from '../lib/store';
import { ensurePushSubscription, isIosBrowser, pushSupported, addWatch } from '../lib/push';
import { useData } from '../lib/hooks';

const KIND_LABEL: Record<string, string> = {
  delay: '⏱ Késésfigyelés', leave: '🚶 Indulás-emlékeztető', alight: '🛎️ Leszállás-figyelő',
  'route-daily': '📅 Rendszeres út', 'route-alerts': '📰 Forgalmi hírek', reminder: '🎫 Emlékeztető',
};

function Watches({ sub }: { sub: string }) {
  const { data, reload } = useData(() => api.watches(sub), [sub]);
  if (!data) return null;
  if (!data.watches.length) return <p className="muted small">Nincs aktív figyelés.</p>;
  return (
    <ul className="list">
      {data.watches.map((w) => (
        <li key={w.id} className="list-row row-between">
          <div>
            <div>{KIND_LABEL[w.kind] ?? w.kind}</div>
            <div className="muted small">{w.params.label ?? w.params.title ?? w.params.time ?? ''}</div>
          </div>
          <button className="icon-btn" aria-label="Törlés" onClick={() => api.deleteWatch(sub, w.id).then(reload)}>🗑️</button>
        </li>
      ))}
    </ul>
  );
}

export function Settings() {
  const { settings } = useStore();
  const [msg, setMsg] = useState<string | null>(null);
  const { data: status } = useData(() => api.status(), []);
  const num = (k: 'walkMin' | 'bufferMin' | 'delayThresholdMin') => (e: React.ChangeEvent<HTMLInputElement>) =>
    store.updateSettings({ [k]: Math.max(0, Number(e.target.value) || 0) });

  const enablePush = async () => {
    try { await ensurePushSubscription(); setMsg('Értesítések bekapcsolva ✅'); } catch (e) { setMsg((e as Error).message); }
  };

  const savePass = async (date: string) => {
    store.updateSettings({ passExpiry: date || null });
    if (!date) return;
    const at = new Date(`${date}T09:00:00`).getTime() / 1000 - 2 * 86400;
    try {
      await addWatch('reminder', { at, title: '🎫 Lejár a bérleted', body: `A bérleted ${date}-én lejár. Ne felejtsd el megújítani!`, label: `Bérlet: ${date}` });
      setMsg('Két nappal a lejárat előtt szólok.');
    } catch (e) { setMsg((e as Error).message); }
  };

  return (
    <div className="page">
      <h2>Beállítások</h2>

      <section className="card">
        <h3>🔔 Értesítések</h3>
        {!pushSupported() && <p className="small">{isIosBrowser() ? 'iPhone-on a Safari Megosztás → „Főképernyőhöz adás” után működnek az értesítések.' : 'Ez a böngésző nem támogatja a push értesítéseket.'}</p>}
        {pushSupported() && !settings.pushSubscriptionId && <button className="btn primary" onClick={enablePush}>Értesítések bekapcsolása</button>}
        {settings.pushSubscriptionId && <><p className="small">Aktív figyelések:</p><Watches sub={settings.pushSubscriptionId} /></>}
        <label>Késés értesítés küszöbe (perc) <input type="number" min={1} value={settings.delayThresholdMin} onChange={num('delayThresholdMin')} /></label>
        <label>Gyaloglás a megállóig (perc) <input type="number" min={0} value={settings.walkMin} onChange={num('walkMin')} /></label>
        <label>Ráhagyás (perc) <input type="number" min={0} value={settings.bufferMin} onChange={num('bufferMin')} /></label>
        {msg && <p className="small">{msg}</p>}
      </section>

      <section className="card">
        <h3>☀️ Kényelem</h3>
        <label>Napsütés
          <select value={settings.sunPreference} onChange={(e) => store.updateSettings({ sunPreference: e.target.value as never })}>
            <option value="auto">Automatikus (hidegben napos, melegben árnyékos oldal)</option>
            <option value="avoid">Mindig az árnyékos oldal</option>
            <option value="seek">Mindig a napos oldal</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={settings.wheelchair} onChange={(e) => store.updateSettings({ wheelchair: e.target.checked })} /> Akadálymentes járatok előnyben</label>
      </section>

      <section className="card">
        <h3>🎫 Bérlet emlékeztető</h3>
        <label>Lejárat napja <input type="date" value={settings.passExpiry ?? ''} onChange={(e) => savePass(e.target.value)} /></label>
        <p className="muted small">Két nappal előtte push értesítést kapsz. Jegyet/bérletet az app nem árusít.</p>
      </section>

      <section className="card">
        <h3>📲 Telepítés</h3>
        <p className="small">Androidon/Chrome-ban: menü → „Alkalmazás telepítése”. iPhone-on: Safari → Megosztás → „Főképernyőhöz adás”.</p>
        <p className="small">Widgetnek nyisd meg egy megálló 🔲 nézetét, és add hozzá a kezdőképernyőhöz.</p>
      </section>

      <section className="card">
        <h3>ℹ️ Adatforrás</h3>
        <p className="small">
          Valós idejű adat: {status?.realtime ? '✅ BKK Futár API' : '❌ nincs (BKK API kulcs szükséges)'}<br />
          Menetrend: {status?.gtfs ? `BKK GTFS ${status.gtfs.feed_version} (${status.gtfs.feed_start_date}–${status.gtfs.feed_end_date})` : 'nincs betöltve'}<br />
          Időjárás: Open-Meteo · Térkép: OpenFreeMap / © OpenStreetMap
        </p>
      </section>
    </div>
  );
}
