import { useState } from 'react';
import type { Alert } from '../lib/types';

const fmtDate = (t: number | null) =>
  t ? new Date(t * 1000).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Budapest' }) : '';

export function AlertCard({ alert, compact }: { alert: Alert; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  const future = alert.start && alert.start > Date.now() / 1000;
  return (
    <div className={`alert-card reason-${alert.reason.code}`} onClick={() => setOpen(!open)}>
      <div className="alert-head">
        <span className="alert-emoji" aria-hidden>{alert.reason.emoji}</span>
        <div>
          <div className="alert-title">{alert.header}</div>
          <div className="muted small">
            {alert.reason.label}
            {alert.start ? ` · ${future ? 'Kezdete' : 'Óta'}: ${fmtDate(alert.start)}` : ''}
            {alert.end ? ` · Vége: ${fmtDate(alert.end)}` : ''}
          </div>
        </div>
      </div>
      {open && alert.description && <p className="alert-body">{alert.description}</p>}
      {open && alert.url && <a href={alert.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Részletek a BKK oldalán ↗</a>}
    </div>
  );
}
