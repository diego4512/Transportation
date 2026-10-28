// URL normalizálás + SSRF-védelem a worker oldalon (második védelmi vonal;
// az első a PHP enqueue-kor). A felhasználó által megadott URL-t SOHA nem adjuk
// tovább vakon a böngészőnek: sémát ellenőrzünk, a hosztot DNS-feloldjuk, és
// minden feloldott IP-t priváthálózat/loopback/link-local/metadata ellen szűrünk.

import dns from "node:dns/promises";
import net from "node:net";

const BLOCKED_SCHEMES = new Set([
  "file:", "ftp:", "gopher:", "data:", "javascript:", "ws:", "wss:",
  "chrome:", "about:", "view-source:", "blob:",
]);

/** Normalizálás: séma-kikényszerítés, userinfo eltávolítás, fragment eldobás. */
export function normalizeUrl(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, error: "Üres URL." };
  }
  let input = raw.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input)) input = "https://" + input;

  let u;
  try {
    u = new URL(input);
  } catch {
    return { ok: false, error: "Érvénytelen URL." };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, error: `Nem engedélyezett protokoll: ${u.protocol}` };
  }
  if (BLOCKED_SCHEMES.has(u.protocol)) {
    return { ok: false, error: `Tiltott protokoll: ${u.protocol}` };
  }
  // Hitelesítő adatok eltávolítása az URL-ből (nem naplózzuk, nem adjuk tovább).
  u.username = "";
  u.password = "";
  u.hash = "";
  return { ok: true, url: u.toString(), parsed: u, host: u.hostname, origin: u.origin };
}

function ipIsBlocked(ip) {
  const v = net.isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map(Number);
    if (p[0] === 0) return "ez-a-hoszt (0.0.0.0/8)";
    if (p[0] === 10) return "privát (10/8)";
    if (p[0] === 127) return "loopback (127/8)";
    if (p[0] === 169 && p[1] === 254) return "link-local / felhő-metadata (169.254/16)";
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return "privát (172.16/12)";
    if (p[0] === 192 && p[1] === 168) return "privát (192.168/16)";
    if (p[0] === 192 && p[1] === 0 && p[2] === 0) return "IETF protokoll (192.0.0/24)";
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return "CGNAT (100.64/10)";
    if (p[0] >= 224) return "multicast/reserved (>=224)";
    return null;
  }
  if (v === 6) {
    const low = ip.toLowerCase();
    if (low === "::1") return "loopback (::1)";
    if (low === "::") return "unspecified (::)";
    if (low.startsWith("fe80")) return "link-local (fe80::/10)";
    if (low.startsWith("fc") || low.startsWith("fd")) return "unique-local (fc00::/7)";
    if (low.startsWith("ff")) return "multicast (ff00::/8)";
    // IPv4-mapped (::ffff:a.b.c.d)
    const m = low.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return ipIsBlocked(m[1]);
    if (low.startsWith("fec0")) return "site-local (deprecated)";
    // felhő-metadata IPv6 (fd00:ec2::254 stb.) – a fc/fd már fentebb blokkolt
    return null;
  }
  return "ismeretlen IP-forma";
}

/**
 * Teljes SSRF-ellenőrzés: normalizálás + DNS-feloldás + minden IP szűrése.
 * @param {string} raw
 * @param {{allowLoopback?:boolean}} opts – a beépített helyi tesztoldalhoz engedhető loopback
 */
export async function guardUrl(raw, opts = {}) {
  const norm = normalizeUrl(raw);
  if (!norm.ok) return norm;

  const host = norm.host;

  // Közvetlen IP a hosztban
  if (net.isIP(host)) {
    const blocked = ipIsBlocked(host);
    if (blocked && !(opts.allowLoopback && blocked.startsWith("loopback"))) {
      return { ok: false, error: `Blokkolt cél-IP: ${host} (${blocked})` };
    }
    return { ok: true, ...norm, resolved: [host] };
  }

  if (host.toLowerCase() === "localhost" || host.toLowerCase().endsWith(".localhost")) {
    if (opts.allowLoopback) return { ok: true, ...norm, resolved: ["127.0.0.1"] };
    return { ok: false, error: "A localhost cél nem engedélyezett." };
  }

  // DNS-feloldás – minden visszaadott IP-t ellenőrzünk (DNS-rebinding / több A-rekord ellen)
  let records;
  try {
    records = await dns.lookup(host, { all: true });
  } catch (e) {
    return { ok: false, error: `DNS-feloldás sikertelen: ${host}` };
  }
  if (!records.length) return { ok: false, error: `Nincs feloldható cím: ${host}` };

  for (const r of records) {
    const blocked = ipIsBlocked(r.address);
    if (blocked && !(opts.allowLoopback && blocked.startsWith("loopback"))) {
      return { ok: false, error: `${host} priváthálózati címre mutat: ${r.address} (${blocked})` };
    }
  }
  return { ok: true, ...norm, resolved: records.map((r) => r.address) };
}
