<?php
declare(strict_types=1);

/**
 * GitHub-bővítménykezelő (PHP oldal). Biztonsági elvek:
 *  - A GitHub URL nem jelent automatikus bizalmat.
 *  - A klónozást/verifikációt a Node worker végzi (PHP sosem indít folyamatot).
 *  - Rögzített commit; nem követjük automatikusan a main ágat.
 *  - Új bővítmény alapból LETILTVA, amíg a felhasználó nem engedélyezi.
 *  - Nem futtatunk tetszőleges telepítőszkriptet; csak manifestet olvasunk + fájlt másolunk.
 */
final class Plugins
{
    public function __construct(private Config $cfg) {}

    private function dir(): string { return $this->cfg->pluginsDir(); }
    private function jobsDir(): string { return $this->cfg->storageDir() . '/plugin-jobs'; }

    public static function validateManifest($m): array
    {
        $errors = [];
        if (!is_array($m)) return ['ok' => false, 'errors' => ['A plugin.json nem objektum.']];
        foreach (['id', 'name', 'version'] as $req) {
            if (empty($m[$req]) || !is_string($m[$req])) $errors[] = "Hiányzó/érvénytelen mező: {$req}";
        }
        if (!empty($m['id']) && !preg_match('/^[a-z0-9][a-z0-9_\-]{1,48}$/', (string)$m['id'])) {
            $errors[] = 'Az id csak kisbetű/szám/kötőjel/aláhúzás lehet (2-49 karakter).';
        }
        if (isset($m['tools']) && !is_array($m['tools'])) $errors[] = 'A tools mezőnek tömbnek kell lennie.';
        if (isset($m['permissions']) && !is_array($m['permissions'])) $errors[] = 'A permissions mezőnek tömbnek kell lennie.';
        return ['ok' => empty($errors), 'errors' => $errors];
    }

    public function listInstalled(): array
    {
        $base = $this->dir();
        if (!is_dir($base)) return [];
        $out = [];
        foreach (scandir($base) ?: [] as $name) {
            if ($name === '.' || $name === '..') continue;
            $pdir = $base . '/' . $name;
            if (!is_dir($pdir)) continue;
            $manifest = $this->readJson($pdir . '/plugin.json');
            $state = $this->readJson($pdir . '/state.json') ?? [];
            if ($manifest === null) continue;
            $out[] = [
                'id' => $name,
                'manifest' => $manifest,
                'enabled' => (bool)($state['enabled'] ?? false),
                'source' => $state['source'] ?? null,
                'installed_at' => $state['installed_at'] ?? null,
                'status' => $state['status'] ?? 'installed',
            ];
        }
        return $out;
    }

    public function setEnabled(string $id, bool $enabled): array
    {
        $id = $this->safeId($id);
        if ($id === null) return ['ok' => false, 'error' => 'Érvénytelen bővítmény-azonosító.'];
        $pdir = $this->dir() . '/' . $id;
        if (!is_dir($pdir) || !is_file($pdir . '/plugin.json')) {
            return ['ok' => false, 'error' => 'Nincs ilyen telepített bővítmény.'];
        }
        $state = $this->readJson($pdir . '/state.json') ?? [];
        $state['enabled'] = $enabled;
        $this->writeJson($pdir . '/state.json', $state);
        return ['ok' => true, 'id' => $id, 'enabled' => $enabled];
    }

    public function uninstall(string $id): array
    {
        $id = $this->safeId($id);
        if ($id === null) return ['ok' => false, 'error' => 'Érvénytelen bővítmény-azonosító.'];
        $pdir = $this->dir() . '/' . $id;
        if (!is_dir($pdir)) return ['ok' => false, 'error' => 'Nincs ilyen telepített bővítmény.'];
        $this->rrmdir($pdir);
        return ['ok' => true, 'id' => $id];
    }

    /** inspect | install bővítmény-job sorba állítása a worker számára. */
    public function enqueueJob(string $action, array $params): array
    {
        if (!in_array($action, ['inspect', 'install'], true)) {
            return ['ok' => false, 'error' => 'Ismeretlen művelet.'];
        }
        $repo = (string)($params['repo_url'] ?? '');
        $ref = (string)($params['ref'] ?? '');
        // Csak https github(-szerű) URL vagy helyi abszolút út (teszteléshez).
        $isHttps = preg_match('#^https://[a-zA-Z0-9.\-]+/[\w.\-]+/[\w.\-]+/?#', $repo) === 1;
        $isLocal = ($repo !== '' && ($repo[0] === '/' || preg_match('#^[A-Za-z]:[\\\\/]#', $repo)));
        if (!$isHttps && !$isLocal) {
            return ['ok' => false, 'error' => 'A repo_url csak https URL vagy helyi abszolút út lehet.'];
        }
        if ($ref !== '' && !preg_match('/^[\w.\-\/]{1,100}$/', $ref)) {
            return ['ok' => false, 'error' => 'Érvénytelen ref (commit/tag/branch).'];
        }
        $jid = date('Ymd-His') . '-' . bin2hex(random_bytes(3));
        $dir = $this->jobsDir() . '/' . $jid;
        if (!@mkdir($dir, 0775, true) && !is_dir($dir)) {
            return ['ok' => false, 'error' => 'Nem sikerült a plugin-job létrehozása.'];
        }
        $this->writeJson($dir . '/req.json', [
            'action' => $action,
            'repo_url' => $repo,
            'ref' => $ref,
            'created_at' => date('c'),
        ]);
        return ['ok' => true, 'id' => $jid];
    }

    public function jobResult(string $id): ?array
    {
        $id = $this->safeId($id);
        if ($id === null) return null;
        return $this->readJson($this->jobsDir() . '/' . $id . '/result.json');
    }

    private function safeId(string $id): ?string
    {
        return preg_match('/^[A-Za-z0-9_\-]{2,80}$/', $id) ? $id : null;
    }

    private function readJson(string $path): ?array
    {
        if (!is_file($path)) return null;
        $d = json_decode((string)file_get_contents($path), true);
        return is_array($d) ? $d : null;
    }

    private function writeJson(string $path, array $data): void
    {
        $tmp = $path . '.tmp';
        file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        rename($tmp, $path);
    }

    private function rrmdir(string $dir): void
    {
        foreach (scandir($dir) ?: [] as $f) {
            if ($f === '.' || $f === '..') continue;
            $p = $dir . '/' . $f;
            is_dir($p) ? $this->rrmdir($p) : @unlink($p);
        }
        @rmdir($dir);
    }
}
