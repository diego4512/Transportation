/** Web Push (VAPID) – a kulcspár első indításkor generálódik a data/vapid.json fájlba. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import webpush, { type PushSubscription } from 'web-push';
import { config } from '../config.ts';
import { appDb } from '../db.ts';

let vapid: { publicKey: string; privateKey: string } | null = null;

export function vapidKeys() {
  if (vapid) return vapid;
  const file = path.join(config.dataDir, 'vapid.json');
  fs.mkdirSync(config.dataDir, { recursive: true });
  if (fs.existsSync(file)) vapid = JSON.parse(fs.readFileSync(file, 'utf8'));
  else {
    vapid = webpush.generateVAPIDKeys();
    fs.writeFileSync(file, JSON.stringify(vapid, null, 2), { mode: 0o600 });
  }
  webpush.setVapidDetails(config.vapidSubject, vapid!.publicKey, vapid!.privateKey);
  return vapid!;
}

export function saveSubscription(sub: PushSubscription): string {
  const db = appDb();
  const existing = db.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?').get(sub.endpoint) as { id: string } | undefined;
  if (existing) {
    db.prepare('UPDATE push_subscriptions SET json = ? WHERE id = ?').run(JSON.stringify(sub), existing.id);
    return existing.id;
  }
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO push_subscriptions (id, endpoint, json, created_at) VALUES (?,?,?,?)').run(id, sub.endpoint, JSON.stringify(sub), Date.now());
  return id;
}

export function subscriptionExists(id: string) {
  return !!appDb().prepare('SELECT 1 FROM push_subscriptions WHERE id = ?').get(id);
}

export function deleteSubscription(id: string) {
  const db = appDb();
  db.prepare('DELETE FROM watches WHERE subscription_id = ?').run(id);
  db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(id);
}

export interface PushMessage {
  title: string;
  body: string;
  /** azonos tag-ű értesítések felülírják egymást (pl. frissülő késés) */
  tag?: string;
  url?: string;
  requireInteraction?: boolean;
}

/** @returns false, ha a feliratkozás megszűnt (ilyenkor töröljük). */
export async function sendPush(subscriptionId: string, msg: PushMessage): Promise<boolean> {
  vapidKeys();
  const row = appDb().prepare('SELECT json FROM push_subscriptions WHERE id = ?').get(subscriptionId) as { json: string } | undefined;
  if (!row) return false;
  try {
    await webpush.sendNotification(JSON.parse(row.json), JSON.stringify(msg), { TTL: 600, urgency: 'high' });
    return true;
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) { deleteSubscription(subscriptionId); return false; }
    console.warn('Push küldési hiba', code, (e as Error).message);
    return true;
  }
}
