<?php
declare(strict_types=1);

/** Regiszter + fájlalapú job-tár olvasása/írása (a worker a feldolgozó). */
final class Store
{
    public function __construct(private Config $cfg) {}

    public function registry(): array
    {
        $p = $this->cfg->registryPath();
        if (!is_file($p)) {
            throw new RuntimeException('Hiányzik a tool-registry.json. Futtasd: node bin/generate-tool-registry.mjs');
        }
        $d = json_decode((string)file_get_contents($p), true);
        if (!is_array($d)) throw new RuntimeException('Sérült tool-registry.json.');
        return $d;
    }

    private function readJson(string $path): ?array
    {
        if (!is_file($path)) return null;
        $d = json_decode((string)file_get_contents($path), true);
        return is_array($d) ? $d : null;
    }

    /** @return array{ok:bool, id?:string, error?:string} */
    public function createJob(array $req): array
    {
        $reg = $this->registry();
        $profiles = $reg['web_profiles'] ?? [];
        $profile = (string)($req['profile'] ?? 'teljes');
        if (!isset($profiles[$profile])) {
            return ['ok' => false, 'error' => "Ismeretlen profil: {$profile}"];
        }
        $depth = (string)($req['depth'] ?? 'kozepes');
        if (!in_array($depth, ['sekely', 'kozepes', 'melyseges'], true)) {
            return ['ok' => false, 'error' => "Ismeretlen mélység: {$depth}"];
        }
        $active = (bool)($req['active'] ?? false);
        if ($active && !$this->cfg->get('active_analysis_enabled', false)) {
            return ['ok' => false, 'error' => 'Az aktív elemzés le van tiltva a konfigurációban.'];
        }

        $tools = [];
        if ($profile === 'egyeni') {
            $ids = array_column($reg['tools'] ?? [], 'id');
            foreach ((array)($req['tools'] ?? []) as $t) {
                if (in_array($t, $ids, true)) $tools[] = $t;
            }
            if (empty($tools)) return ['ok' => false, 'error' => 'Egyéni profilhoz legalább egy eszköz kell.'];
        }

        $guard = UrlGuard::check((string)($req['url'] ?? ''), (bool)$this->cfg->get('allow_loopback_targets', false));
        if (!$guard['ok']) return ['ok' => false, 'error' => $guard['error']];

        $id = date('Ymd-His') . '-' . bin2hex(random_bytes(4));
        $dir = $this->cfg->jobsDir() . '/' . $id;
        if (!@mkdir($dir, 0775, true) && !is_dir($dir)) {
            return ['ok' => false, 'error' => 'Nem sikerült a job-könyvtár létrehozása.'];
        }
        $job = [
            'url' => $guard['url'],
            'origin' => $guard['origin'],
            'profile' => $profile,
            'depth' => $depth,
            'active' => $active,
            'tools' => $tools,
            'created_at' => date('c'),
        ];
        // state=queued implicit (nincs status.json). Atomi írás.
        $tmp = $dir . '/.job.json.tmp';
        file_put_contents($tmp, json_encode($job, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        rename($tmp, $dir . '/job.json');
        return ['ok' => true, 'id' => $id];
    }

    public function jobStatus(string $id): ?array
    {
        $id = $this->safeId($id);
        if ($id === null) return null;
        $dir = $this->cfg->jobsDir() . '/' . $id;
        $job = $this->readJson($dir . '/job.json');
        if ($job === null) return null;
        $status = $this->readJson($dir . '/status.json');
        if ($status === null) {
            // még nem vette fel a worker
            return [
                'id' => $id, 'url' => $job['url'] ?? null, 'profile' => $job['profile'] ?? null,
                'depth' => $job['depth'] ?? null, 'state' => 'queued',
                'created_at' => $job['created_at'] ?? null,
                'progress' => ['total' => 0, 'completed' => 0], 'steps' => [],
            ];
        }
        return $status;
    }

    public function jobResult(string $id): ?array
    {
        $id = $this->safeId($id);
        if ($id === null) return null;
        return $this->readJson($this->cfg->jobsDir() . '/' . $id . '/result.json');
    }

    public function jobStep(string $id, string $tool): ?array
    {
        $id = $this->safeId($id);
        $tool = preg_replace('/[^a-z0-9_]/', '', $tool);
        if ($id === null || $tool === '') return null;
        return $this->readJson($this->cfg->jobsDir() . '/' . $id . '/steps/' . $tool . '.json');
    }

    public function cancelJob(string $id): bool
    {
        $id = $this->safeId($id);
        if ($id === null) return false;
        $dir = $this->cfg->jobsDir() . '/' . $id;
        if (!is_dir($dir)) return false;
        @file_put_contents($dir . '/cancel', date('c'));
        return true;
    }

    public function listJobs(int $limit = 25): array
    {
        $base = $this->cfg->jobsDir();
        if (!is_dir($base)) return [];
        $out = [];
        foreach (scandir($base) ?: [] as $name) {
            if ($name === '.' || $name === '..') continue;
            $dir = $base . '/' . $name;
            if (!is_dir($dir)) continue;
            $job = $this->readJson($dir . '/job.json');
            if ($job === null) continue;
            $status = $this->readJson($dir . '/status.json');
            $out[] = [
                'id' => $name,
                'url' => $job['url'] ?? null,
                'profile' => $job['profile'] ?? null,
                'state' => $status['state'] ?? 'queued',
                'created_at' => $job['created_at'] ?? null,
                'progress' => $status['progress'] ?? ['total' => 0, 'completed' => 0],
            ];
        }
        usort($out, fn($a, $b) => strcmp((string)$b['created_at'], (string)$a['created_at']));
        return array_slice($out, 0, $limit);
    }

    public function workerHeartbeat(): ?array
    {
        return $this->readJson($this->cfg->storageDir() . '/worker-heartbeat.json');
    }

    private function safeId(string $id): ?string
    {
        return preg_match('/^[A-Za-z0-9_\-]{3,80}$/', $id) ? $id : null;
    }
}
