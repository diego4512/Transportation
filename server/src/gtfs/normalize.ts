/** Kisbetűs, ékezet nélküli alak kereséshez ("Széll Kálmán tér" -> "szell kalman ter"). */
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
