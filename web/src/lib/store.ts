/** Helyi beállítások és kedvencek (localStorage) – egyszerű React hookkal. */
import { useSyncExternalStore } from 'react';

export interface FavoriteStop { id: string; name: string; routes?: string[] }
export interface Settings {
  walkMin: number;
  bufferMin: number;
  delayThresholdMin: number;
  sunPreference: 'auto' | 'avoid' | 'seek';
  preferAc: boolean;
  wheelchair: boolean;
  pushSubscriptionId: string | null;
  passExpiry: string | null;
}

const DEFAULTS: Settings = {
  walkMin: 5, bufferMin: 2, delayThresholdMin: 3, sunPreference: 'auto', preferAc: false, wheelchair: false,
  pushSubscriptionId: null, passExpiry: null,
};

type State = { favorites: FavoriteStop[]; settings: Settings; recent: FavoriteStop[] };

function load(): State {
  try {
    const raw = JSON.parse(localStorage.getItem('bp-utas') ?? '{}');
    return { favorites: raw.favorites ?? [], recent: raw.recent ?? [], settings: { ...DEFAULTS, ...(raw.settings ?? {}) } };
  } catch {
    return { favorites: [], recent: [], settings: DEFAULTS };
  }
}

let state = load();
const listeners = new Set<() => void>();
function set(next: Partial<State>) {
  state = { ...state, ...next };
  try { localStorage.setItem('bp-utas', JSON.stringify(state)); } catch { /* privát mód */ }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export function useStore() {
  return useSyncExternalStore(subscribe, () => state);
}

export const store = {
  get: () => state,
  toggleFavorite(f: FavoriteStop) {
    const exists = state.favorites.some((x) => x.id === f.id);
    set({ favorites: exists ? state.favorites.filter((x) => x.id !== f.id) : [...state.favorites, f] });
  },
  isFavorite: (id: string) => state.favorites.some((x) => x.id === id),
  addRecent(f: FavoriteStop) {
    set({ recent: [f, ...state.recent.filter((x) => x.id !== f.id)].slice(0, 8) });
  },
  updateSettings(s: Partial<Settings>) {
    set({ settings: { ...state.settings, ...s } });
  },
};
