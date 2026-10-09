/**
 * "Mi miatt késik?" – a BKK forgalmi hírek szövegéből (és ha van, a GTFS-RT cause mezőből)
 * kategorizáljuk az okot. Ha nincs hivatalos hír, NEM találunk ki okot – azt a hívó jelzi.
 */
import type { AlertReason } from '../types.ts';
import { normalizeText } from '../gtfs/normalize.ts';

const RULES: { code: string; label: string; emoji: string; words: string[] }[] = [
  { code: 'accident', label: 'Baleset', emoji: '💥', words: ['baleset', 'utkozes', 'gazolas', 'elutott'] },
  { code: 'technical', label: 'Műszaki hiba', emoji: '🔧', words: ['muszaki hiba', 'jarmuhiba', 'meghibasod', 'jarmu hiba', 'aramszunet', 'felsovezetek', 'vaganyhiba', 'jelzohiba', 'biztositoberendezes', 'lift', 'mozgolepcso'] },
  { code: 'medical', label: 'Rosszullét / mentés', emoji: '🚑', words: ['rosszullet', 'mentes', 'mentok', 'utasbaleset'] },
  { code: 'police', label: 'Rendőri intézkedés', emoji: '🚓', words: ['rendori', 'rendorseg', 'bombariado', 'gyanus csomag', 'tuzoltosag', 'tuzeset', 'tuz '] },
  { code: 'demonstration', label: 'Demonstráció / lezárás', emoji: '📢', words: ['demonstracio', 'tuntetes', 'felvonulas', 'megemlekezes', 'allami unnep', 'vip'] },
  { code: 'event', label: 'Rendezvény', emoji: '🎉', words: ['rendezveny', 'futoverseny', 'maraton', 'koncert', 'meccs', 'fesztival', 'sporteseny', 'tuzijatek', 'forma-1', 'forma 1'] },
  { code: 'construction', label: 'Felújítás / építkezés', emoji: '🚧', words: ['felujitas', 'karbantartas', 'munkalat', 'epitkezes', 'palyafelujitas', 'vaganyzar', 'csotores', 'kozmu', 'aszfaltozas', 'utfelujitas'] },
  { code: 'weather', label: 'Időjárás', emoji: '🌧️', words: ['idojaras', 'havazas', 'ho miatt', 'jegesedes', 'vihar', 'szelvihar', 'kidolt fa', 'aradas', 'aradas', 'hoseg', 'arviz', 'dunai vizallas', 'magas vizallas'] },
  { code: 'traffic', label: 'Forgalmi torlódás', emoji: '🚗', words: ['torlodas', 'forgalmi akadaly', 'dugo', 'forgalomkorlatozas', 'lassu forgalom', 'sav lezaras', 'savlezaras'] },
  { code: 'diversion', label: 'Terelés', emoji: '↪️', words: ['terel', 'pótlo', 'potlo', 'potlobusz', 'nem kozlekedik', 'rovidítve', 'roviditve', 'modositott utvonal'] },
];

const CAUSE_MAP: Record<string, string> = {
  ACCIDENT: 'accident', TECHNICAL_PROBLEM: 'technical', CONSTRUCTION: 'construction', MAINTENANCE: 'construction',
  WEATHER: 'weather', HOLIDAY: 'event', DEMONSTRATION: 'demonstration', POLICE_ACTIVITY: 'police',
  MEDICAL_EMERGENCY: 'medical', STRIKE: 'demonstration',
};

export function classifyReason(text: string, cause?: string | null): AlertReason {
  if (cause && CAUSE_MAP[cause]) {
    const r = RULES.find((x) => x.code === CAUSE_MAP[cause])!;
    return { code: r.code, label: r.label, emoji: r.emoji };
  }
  const t = normalizeText(text);
  for (const r of RULES) if (r.words.some((w) => t.includes(normalizeText(w)))) return { code: r.code, label: r.label, emoji: r.emoji };
  return { code: 'other', label: 'Forgalmi változás', emoji: 'ℹ️' };
}
