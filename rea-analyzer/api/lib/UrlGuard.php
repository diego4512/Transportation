<?php
declare(strict_types=1);

/**
 * SSRF-védelem a PHP oldalon (első védelmi vonal; a worker újra-ellenőrzi).
 * Normalizál, sémát ellenőriz, DNS-t felold, és minden IP-t priváthálózat/
 * loopback/link-local/metadata ellen szűr.
 */
final class UrlGuard
{
    /** @return array{ok:bool, url?:string, origin?:string, host?:string, resolved?:array, error?:string} */
    public static function check(string $raw, bool $allowLoopback = false): array
    {
        $raw = trim($raw);
        if ($raw === '') return ['ok' => false, 'error' => 'Üres URL.'];
        if (!preg_match('#^[a-zA-Z][a-zA-Z0-9+.\-]*://#', $raw)) {
            $raw = 'https://' . $raw;
        }
        $p = parse_url($raw);
        if ($p === false || empty($p['scheme']) || empty($p['host'])) {
            return ['ok' => false, 'error' => 'Érvénytelen URL.'];
        }
        $scheme = strtolower($p['scheme']);
        if ($scheme !== 'http' && $scheme !== 'https') {
            return ['ok' => false, 'error' => "Nem engedélyezett protokoll: {$scheme}"];
        }
        $host = $p['host'];
        $port = isset($p['port']) ? (int)$p['port'] : ($scheme === 'https' ? 443 : 80);
        $path = $p['path'] ?? '/';
        $query = isset($p['query']) ? '?' . $p['query'] : '';
        // userinfo + fragment eldobása
        $origin = $scheme . '://' . strtolower($host) . (
            ($scheme === 'https' && $port === 443) || ($scheme === 'http' && $port === 80) ? '' : ':' . $port
        );
        $normalized = $origin . $path . $query;

        $ips = self::resolve($host);
        if (empty($ips)) {
            return ['ok' => false, 'error' => "DNS-feloldás sikertelen: {$host}"];
        }
        foreach ($ips as $ip) {
            $blocked = self::ipBlocked($ip);
            if ($blocked !== null) {
                $isLoop = str_contains($blocked, 'loopback');
                if (!($allowLoopback && $isLoop)) {
                    return ['ok' => false, 'error' => "{$host} tiltott címre mutat: {$ip} ({$blocked})"];
                }
            }
        }
        return ['ok' => true, 'url' => $normalized, 'origin' => $origin, 'host' => $host, 'resolved' => $ips];
    }

    private static function resolve(string $host): array
    {
        // Közvetlen IP?
        if (filter_var($host, FILTER_VALIDATE_IP)) return [$host];
        if (strtolower($host) === 'localhost') return ['127.0.0.1'];
        $ips = [];
        $a = @gethostbynamel($host);
        if (is_array($a)) $ips = array_merge($ips, $a);
        $aaaa = @dns_get_record($host, DNS_AAAA);
        if (is_array($aaaa)) {
            foreach ($aaaa as $rec) {
                if (!empty($rec['ipv6'])) $ips[] = $rec['ipv6'];
            }
        }
        return array_values(array_unique($ips));
    }

    /** @return string|null  blokkolás oka, vagy null ha engedélyezett */
    private static function ipBlocked(string $ip): ?string
    {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $parts = array_map('intval', explode('.', $ip));
            [$a, $b] = [$parts[0], $parts[1] ?? 0];
            if ($a === 0) return 'ez-a-hoszt (0/8)';
            if ($a === 127) return 'loopback (127/8)';
            if ($a === 10) return 'privát (10/8)';
            if ($a === 169 && $b === 254) return 'link-local / felhő-metadata (169.254/16)';
            if ($a === 172 && $b >= 16 && $b <= 31) return 'privát (172.16/12)';
            if ($a === 192 && $b === 168) return 'privát (192.168/16)';
            if ($a === 100 && $b >= 64 && $b <= 127) return 'CGNAT (100.64/10)';
            if ($a >= 224) return 'multicast/foglalt (>=224)';
            return null;
        }
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            $low = strtolower($ip);
            if ($low === '::1') return 'loopback (::1)';
            if ($low === '::') return 'unspecified (::)';
            if (str_starts_with($low, 'fe80')) return 'link-local (fe80::/10)';
            if (str_starts_with($low, 'fc') || str_starts_with($low, 'fd')) return 'unique-local (fc00::/7)';
            if (str_starts_with($low, 'ff')) return 'multicast (ff00::/8)';
            if (preg_match('/::ffff:(\d+\.\d+\.\d+\.\d+)$/', $low, $m)) return self::ipBlocked($m[1]);
            return null;
        }
        return 'ismeretlen IP-forma';
    }
}
