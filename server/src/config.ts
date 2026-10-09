import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '0.0.0.0',
  bkkApiKey: process.env.BKK_API_KEY?.trim() || '',
  bkkBaseUrl: process.env.BKK_BASE_URL ?? 'https://futar.bkk.hu/api/query/v1/ws/otp/api/where',
  dataDir: path.resolve(root, process.env.DATA_DIR ?? './data'),
  gtfsUrl: process.env.GTFS_URL ?? 'https://go.bkk.hu/api/static/v1/public-gtfs/budapest_gtfs.zip',
  vapidSubject: process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com',
  webDist: path.join(root, 'web', 'dist'),
  /** Ennyi másodpercenként fut a háttérfigyelő (késés-, leszállás-, indulás-értesítések). */
  watcherIntervalSec: Number(process.env.WATCHER_INTERVAL_SEC ?? 30),
};

export const hasRealtime = () => config.bkkApiKey.length > 0;
