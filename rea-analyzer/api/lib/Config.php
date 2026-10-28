<?php
declare(strict_types=1);

/** A config/config.json betöltése (ugyanaz, amit a Node worker is olvas). */
final class Config
{
    private array $data;
    private string $root;

    public function __construct()
    {
        // api/lib/Config.php → projekt gyökér két szinttel feljebb
        $this->root = dirname(__DIR__, 2);
        $path = $this->root . '/config/config.json';
        if (!is_file($path)) {
            $sample = $this->root . '/config/config.sample.json';
            throw new RuntimeException(
                'Hiányzik a config/config.json. Másold le a config.sample.json-t: ' . $sample
            );
        }
        $json = json_decode((string)file_get_contents($path), true);
        if (!is_array($json)) {
            throw new RuntimeException('A config/config.json érvénytelen JSON.');
        }
        $this->data = $json;
    }

    public function root(): string { return $this->root; }

    public function get(string $key, $default = null)
    {
        return $this->data[$key] ?? $default;
    }

    public function storageDir(): string
    {
        $s = (string)($this->data['storage_dir'] ?? 'storage');
        // abszolút vagy a gyökérhez relatív
        if ($s !== '' && ($s[0] === '/' || preg_match('/^[A-Za-z]:[\\\\\\/]/', $s))) {
            return rtrim($s, '/\\');
        }
        return $this->root . '/' . trim($s, '/\\');
    }

    public function jobsDir(): string { return $this->storageDir() . '/jobs'; }
    public function pluginsDir(): string { return $this->storageDir() . '/plugins'; }
    public function logsDir(): string { return $this->storageDir() . '/logs'; }
    public function registryPath(): string { return $this->root . '/tool-registry.json'; }
}
