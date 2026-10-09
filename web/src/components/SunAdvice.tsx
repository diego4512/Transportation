import type { SunResponse } from '../lib/types';
import { fmtTime, sideHu } from '../lib/format';

/** Felülnézeti jármű-ábra: a javasolt oldal kiemelve, a nap iránya jelölve. */
function SeatDiagram({ side, sunny }: { side: 'left' | 'right' | null; sunny: 'left' | 'right' | null }) {
  const seat = (s: 'left' | 'right', y: number) => (
    <rect key={`${s}${y}`} x={s === 'left' ? 14 : 58} y={y} width="28" height="18" rx="4"
      className={side === s ? 'seat seat-good' : sunny === s ? 'seat seat-sun' : 'seat'} />
  );
  return (
    <svg viewBox="0 0 100 200" className="seat-diagram" role="img" aria-label="Ülésajánlás ábra">
      <path d="M10 42 Q50 16 90 42 L90 192 Q50 200 10 192 Z" className="vehicle-body" />
      <text x="50" y="9" textAnchor="middle" className="diagram-label">▲ menetirány</text>
      {[52, 76, 100, 124, 148, 172].flatMap((y) => [seat('left', y), seat('right', y)])}
      {sunny && <text x={sunny === 'left' ? 2 : 98} y="117" textAnchor={sunny === 'left' ? 'start' : 'end'} fontSize="16">☀️</text>}
    </svg>
  );
}

const SIDE_TEXT: Record<string, string> = { left: 'bal oldalra süt', right: 'jobb oldalra süt', front: 'szemből süt', back: 'hátulról süt', none: 'nem süt be' };

export function SunAdvice({ data }: { data: SunResponse }) {
  const a = data.advice;
  const sunny = a.recommendedSide ? (a.preference === 'avoid' ? (a.recommendedSide === 'left' ? 'right' : 'left') : a.recommendedSide) : null;
  return (
    <section className="card sun-card">
      <h3>☀️ Hova ülj?</h3>
      <div className="sun-layout">
        <SeatDiagram side={a.recommendedSide} sunny={sunny} />
        <div>
          <p className="sun-summary">{a.summary}</p>
          {a.recommendedSide && (
            <p className="big-advice">
              {a.preference === 'avoid' ? 'Árnyékos oldal' : 'Napos oldal'}: <b>{sideHu[a.recommendedSide]}</b>
            </p>
          )}
          <p className="muted small">
            {data.from} → {data.to}
            {a.avgAltitudeDeg !== null && ` · napmagasság ~${a.avgAltitudeDeg}°${a.avgAltitudeDeg < 25 ? ' (alacsony nap, mélyen besüt)' : ''}`}
          </p>
          {data.weather && (
            <p className="small">
              🌡️ {Math.round(data.weather.temperature)}°C (hőérzet {Math.round(data.weather.apparentTemperature)}°C) · ☁️ {data.weather.cloudCover}%
            </p>
          )}
          <p className="small">
            {data.ac.value === true ? '❄️ Klímás jármű' : data.ac.value === false ? '🥵 Nincs klíma' : '❔ Klíma: nem tudjuk'}
            {data.ac.source === 'model' && ' (járműtípus alapján)'}
            {data.ac.note && <span className="muted"> – {data.ac.note}</span>}
          </p>
        </div>
      </div>
      {a.segments.length > 1 && !a.underground && (
        <details>
          <summary>Szakaszonként</summary>
          <ul className="sun-segments">
            {a.segments.map((s, i) => (
              <li key={i} className={`seg seg-${s.sunnySide}`}>
                <span className="muted small">{fmtTime(s.start)}</span> {s.fromStop} → {s.toStop}: <b>{SIDE_TEXT[s.sunnySide]}</b>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
