import type { RouteInfo } from '../lib/types';

export function RouteBadge({ route, small }: { route: RouteInfo; small?: boolean }) {
  return (
    <span className={`badge ${small ? 'badge-sm' : ''}`} style={{ background: route.color, color: route.textColor }} title={route.longName}>
      {route.shortName || '?'}
    </span>
  );
}
