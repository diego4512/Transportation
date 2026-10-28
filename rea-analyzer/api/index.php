<?php
declare(strict_types=1);

// REA Web Analyzer – PHP API front controller.
// A PHP SOHA nem indít folyamatot; csak fájlalapú job-okat ír, és a worker által
// írt állapotot/eredményt olvassa. Minden POST CSRF-tokent igényel.

error_reporting(E_ALL);
ini_set('display_errors', '0');

require __DIR__ . '/lib/Config.php';
require __DIR__ . '/lib/Http.php';
require __DIR__ . '/lib/UrlGuard.php';
require __DIR__ . '/lib/Store.php';
require __DIR__ . '/lib/Plugins.php';
require __DIR__ . '/lib/Report.php';

set_exception_handler(function (Throwable $e) {
    Http::error('Szerverhiba: ' . $e->getMessage(), 500);
});

$cfg = new Config();
$store = new Store($cfg);
$plugins = new Plugins($cfg);

// Útvonal feloldása: .htaccess ?_path=... vagy PATH_INFO
$path = $_GET['_path'] ?? ($_SERVER['PATH_INFO'] ?? '');
$path = trim((string)$path, '/');
$seg = $path === '' ? [] : explode('/', $path);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// CSRF minden állapotváltó kérésre
$needsCsrf = in_array($method, ['POST', 'PUT', 'DELETE'], true);
$csrfOk = !$needsCsrf || Http::requireCsrf();

function seg(array $s, int $i): ?string { return $s[$i] ?? null; }

$r0 = seg($seg, 0);

try {
    // ---- GET végpontok ----
    if ($method === 'GET' && $r0 === 'health') {
        Http::json(['ok' => true, 'service' => 'rea-web-analyzer', 'time' => date('c')]);
        return;
    }
    if ($method === 'GET' && $r0 === 'csrf') {
        Http::json(['csrf' => Http::csrfToken()]);
        return;
    }
    if ($method === 'GET' && $r0 === 'registry') {
        $reg = $store->registry();
        // bővítmények (engedélyezett) tooljainak megjelölése külön forrásként
        $merged = $reg;
        $pluginTools = [];
        foreach ($plugins->listInstalled() as $p) {
            if (!$p['enabled']) continue;
            foreach ((array)($p['manifest']['tools'] ?? []) as $t) {
                if (empty($t['id'])) continue;
                $pluginTools[] = [
                    'id' => 'plugin:' . $p['id'] . ':' . $t['id'],
                    'name_hu' => $t['name_hu'] ?? ($t['name'] ?? $t['id']),
                    'description_hu' => $t['description'] ?? '',
                    'family' => 'plugin',
                    'category' => 'Bővítmény: ' . ($p['manifest']['name'] ?? $p['id']),
                    'source' => 'plugin',
                    'plugin_id' => $p['id'],
                    'url_applicable' => $t['url_applicable'] ?? 'conditional',
                    'availability' => ['available' => null, 'reason' => 'Bővítmény – futtatáshoz kompatibilis adapter szükséges.', 'code' => 'plugin_adapter_required'],
                ];
            }
        }
        $merged['plugin_tools'] = $pluginTools;
        Http::json($merged);
        return;
    }
    if ($method === 'GET' && $r0 === 'diagnostics') {
        $reg = $store->registry();
        Http::json([
            'generated_at' => date('c'),
            'registry_source' => $reg['source'] ?? null,
            'counts' => $reg['counts'] ?? null,
            'worker' => $store->workerHeartbeat(),
            'providers' => $reg['providers'] ?? [],
            'families' => $reg['families'] ?? [],
            'php' => ['version' => PHP_VERSION],
            'config' => [
                'allow_loopback_targets' => (bool)$cfg->get('allow_loopback_targets', false),
                'active_analysis_enabled' => (bool)$cfg->get('active_analysis_enabled', false),
                'plugins_enabled' => (bool)$cfg->get('plugins_enabled', true),
                'base_path' => $cfg->get('base_path', '/'),
            ],
        ]);
        return;
    }
    if ($method === 'GET' && $r0 === 'jobs' && seg($seg, 1) === null) {
        Http::json(['jobs' => $store->listJobs(30)]);
        return;
    }
    if ($method === 'GET' && $r0 === 'jobs' && seg($seg, 1) !== null) {
        $id = (string)seg($seg, 1);
        $sub = seg($seg, 2);
        if ($sub === null) {
            $s = $store->jobStatus($id);
            $s === null ? Http::error('Nincs ilyen job.', 404) : Http::json($s);
            return;
        }
        if ($sub === 'result') {
            $res = $store->jobResult($id);
            $res === null ? Http::error('Nincs eredmény (még fut, vagy nincs ilyen job).', 404) : Http::json($res);
            return;
        }
        if ($sub === 'step' && seg($seg, 3) !== null) {
            $st = $store->jobStep($id, (string)seg($seg, 3));
            $st === null ? Http::error('Nincs ilyen lépés.', 404) : Http::json($st);
            return;
        }
        if ($sub === 'export') {
            $res = $store->jobResult($id);
            if ($res === null) { Http::error('Nincs eredmény.', 404); return; }
            $fmt = preg_replace('/[^a-z]/', '', strtolower((string)($_GET['format'] ?? 'json')));
            $out = Report::render($res, $fmt);
            http_response_code(200);
            header('Content-Type: ' . $out['ctype']);
            header('Content-Disposition: attachment; filename="rea-jelentes-' . preg_replace('/[^A-Za-z0-9_\-]/', '', $id) . '.' . $fmt . '"');
            echo $out['body'];
            return;
        }
        Http::error('Ismeretlen job-alútvonal.', 404);
        return;
    }
    if ($method === 'GET' && $r0 === 'plugins' && seg($seg, 1) === null) {
        Http::json(['plugins' => $plugins->listInstalled()]);
        return;
    }
    if ($method === 'GET' && $r0 === 'plugins' && seg($seg, 1) === 'job' && seg($seg, 2) !== null) {
        $res = $plugins->jobResult((string)seg($seg, 2));
        $res === null ? Http::json(['state' => 'pending']) : Http::json($res);
        return;
    }

    // ---- POST végpontok (CSRF kötelező) ----
    if ($needsCsrf && !$csrfOk) {
        Http::error('Hiányzó vagy érvénytelen CSRF-token.', 403);
        return;
    }

    if ($method === 'POST' && $r0 === 'analyze') {
        $body = Http::body();
        $res = $store->createJob($body);
        if (!$res['ok']) { Http::error($res['error'], 400); return; }
        Http::log($cfg, 'analyze enqueue: ' . ($res['id'] ?? ''));
        Http::json(['ok' => true, 'id' => $res['id']], 201);
        return;
    }
    if ($method === 'POST' && $r0 === 'jobs' && seg($seg, 2) === 'cancel') {
        $ok = $store->cancelJob((string)seg($seg, 1));
        $ok ? Http::json(['ok' => true]) : Http::error('Nincs ilyen job.', 404);
        return;
    }
    if ($method === 'POST' && $r0 === 'plugins' && seg($seg, 1) === 'inspect') {
        $res = $plugins->enqueueJob('inspect', Http::body());
        $res['ok'] ? Http::json(['ok' => true, 'job' => $res['id']]) : Http::error($res['error'], 400);
        return;
    }
    if ($method === 'POST' && $r0 === 'plugins' && seg($seg, 1) === 'install') {
        $res = $plugins->enqueueJob('install', Http::body());
        $res['ok'] ? Http::json(['ok' => true, 'job' => $res['id']]) : Http::error($res['error'], 400);
        return;
    }
    if ($method === 'POST' && $r0 === 'plugins' && seg($seg, 2) !== null) {
        $id = (string)seg($seg, 1);
        $action = (string)seg($seg, 2);
        if ($action === 'enable') { $res = $plugins->setEnabled($id, true); }
        elseif ($action === 'disable') { $res = $plugins->setEnabled($id, false); }
        elseif ($action === 'uninstall') { $res = $plugins->uninstall($id); }
        else { Http::error('Ismeretlen bővítmény-művelet.', 404); return; }
        $res['ok'] ? Http::json($res) : Http::error($res['error'], 400);
        return;
    }

    Http::error('Ismeretlen végpont.', 404);
} catch (Throwable $e) {
    Http::error('Szerverhiba: ' . $e->getMessage(), 500);
}
