import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Home } from './pages/Home';
import { Stop } from './pages/Stop';
import { Trip } from './pages/Trip';
import { MapPage } from './pages/MapPage';
import { Alerts } from './pages/Alerts';
import { Settings } from './pages/Settings';
import { Widget } from './pages/Widget';
import { useEffect, useState } from 'react';

function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    addEventListener('online', on); addEventListener('offline', off);
    return () => { removeEventListener('online', on); removeEventListener('offline', off); };
  }, []);
  return online ? null : <div className="offline">Nincs internet – a legutóbb betöltött adatokat látod.</div>;
}

export function App() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/widget/')) return <Routes><Route path="/widget/:id" element={<Widget />} /></Routes>;
  return (
    <div className="app">
      <OfflineBanner />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/stop/:id" element={<Stop />} />
          <Route path="/trip/:id" element={<Trip />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<div className="page"><p>Nincs ilyen oldal.</p></div>} />
        </Routes>
      </main>
      <nav className="tabbar">
        <NavLink to="/" end>🏠<span>Indulások</span></NavLink>
        <NavLink to="/map">🗺️<span>Térkép</span></NavLink>
        <NavLink to="/alerts">📰<span>Hírek</span></NavLink>
        <NavLink to="/settings">⚙️<span>Beállítások</span></NavLink>
      </nav>
    </div>
  );
}
