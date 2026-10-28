<?php
declare(strict_types=1);
// Egyszerű PHP tesztfuttató (külső függőség nélkül). Az UrlGuard SSRF-logikáját,
// a manifest-validációt és a konfigurációt ellenőrzi.

require dirname(__DIR__, 2) . '/api/lib/Config.php';
require dirname(__DIR__, 2) . '/api/lib/UrlGuard.php';
require dirname(__DIR__, 2) . '/api/lib/Plugins.php';

$pass = 0; $fail = 0;
function check(bool $cond, string $msg): void {
    global $pass, $fail;
    echo ($cond ? "✓ " : "✗ ") . $msg . "\n";
    $cond ? $pass++ : $fail++;
}

// --- UrlGuard: tiltott célok ---
check(UrlGuard::check('http://10.0.0.1/')['ok'] === false, 'Privát IP (10.0.0.1) elutasítva');
check(UrlGuard::check('http://192.168.1.5/')['ok'] === false, 'Privát IP (192.168.1.5) elutasítva');
check(UrlGuard::check('http://172.16.0.1/')['ok'] === false, 'Privát IP (172.16.0.1) elutasítva');
check(UrlGuard::check('http://169.254.169.254/latest/meta-data/')['ok'] === false, 'Felhő-metadata (169.254.169.254) elutasítva');
check(UrlGuard::check('http://127.0.0.1/')['ok'] === false, 'Loopback alapból elutasítva');
check(UrlGuard::check('http://127.0.0.1/', true)['ok'] === true, 'Loopback engedélyezett, ha allowLoopback=true');
check(UrlGuard::check('http://[::1]/', false)['ok'] === false, 'IPv6 loopback (::1) elutasítva');
check(UrlGuard::check('ftp://example.com/')['ok'] === false, 'Nem http(s) séma (ftp) elutasítva');
check(UrlGuard::check('file:///etc/passwd')['ok'] === false, 'file:// séma elutasítva');
check(UrlGuard::check('')['ok'] === false, 'Üres URL elutasítva');

// --- UrlGuard: engedélyezett publikus IP ---
$ok = UrlGuard::check('http://8.8.8.8/');
check($ok['ok'] === true, 'Publikus IP (8.8.8.8) engedélyezett');
check(($ok['origin'] ?? '') === 'http://8.8.8.8', 'Origin helyesen normalizálva');

// --- URL normalizálás: userinfo eltávolítás ---
$u = UrlGuard::check('https://user:pass@8.8.8.8/x?y=1#frag');
check($u['ok'] === true && !str_contains($u['url'], 'user:pass'), 'Hitelesítő adatok eltávolítva az URL-ből');
check($u['ok'] === true && !str_contains($u['url'], '#frag'), 'Fragment eldobva');

// --- Séma nélküli bemenet https-re egészül ki ---
$h = UrlGuard::check('8.8.8.8');
check($h['ok'] === true && str_starts_with($h['url'], 'https://'), 'Séma nélküli bemenet https-re egészül ki');

// --- Manifest-validáció ---
check(Plugins::validateManifest(['id' => 'jo-plugin', 'name' => 'Jó', 'version' => '1.0.0'])['ok'] === true, 'Érvényes manifest elfogadva');
check(Plugins::validateManifest(['name' => 'X', 'version' => '1'])['ok'] === false, 'Hiányzó id elutasítva');
check(Plugins::validateManifest(['id' => 'Rossz ID!', 'name' => 'X', 'version' => '1'])['ok'] === false, 'Érvénytelen id elutasítva');
check(Plugins::validateManifest('nem-objektum')['ok'] === false, 'Nem-objektum manifest elutasítva');

// --- Config betölthető ---
try { $cfg = new Config(); check(is_string($cfg->get('rea_cmd')), 'Config betöltődik és rea_cmd elérhető'); }
catch (Throwable $e) { check(false, 'Config betöltés: ' . $e->getMessage()); }

echo "\nPHP tesztek: {$pass} siker, {$fail} hiba\n";
exit($fail > 0 ? 1 : 0);
