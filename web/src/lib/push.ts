import { api } from './api';
import { store } from './store';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** iOS-en a push csak kezdőképernyőre telepített PWA-ból működik. */
export const isIosBrowser = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !(navigator as any).standalone;

function b64ToUint8(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Engedélykérés + feliratkozás; a szerveroldali azonosítót elmentjük. */
export async function ensurePushSubscription(): Promise<string> {
  if (!pushSupported()) throw new Error(isIosBrowser() ? 'iPhone-on előbb add hozzá az appot a kezdőképernyőhöz (Megosztás → Főképernyőhöz adás).' : 'Ez a böngésző nem támogatja az értesítéseket.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Az értesítések nincsenek engedélyezve.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await api.pushKey();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(publicKey) });
  }
  const { id } = await api.pushSubscribe(sub.toJSON());
  store.updateSettings({ pushSubscriptionId: id });
  return id;
}

export async function addWatch(kind: string, params: Record<string, unknown>) {
  const sub = await ensurePushSubscription();
  return api.addWatch(sub, kind, params);
}
