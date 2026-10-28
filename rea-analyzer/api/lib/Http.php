<?php
declare(strict_types=1);

/** Kérés/válasz segédek + CSRF + egyszerű naplózás (titkok nélkül). */
final class Http
{
    public static function json($data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: no-referrer');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public static function error(string $message, int $status = 400, array $extra = []): void
    {
        self::json(array_merge(['error' => $message], $extra), $status);
    }

    public static function body(): array
    {
        $raw = file_get_contents('php://input') ?: '';
        if ($raw === '') return [];
        $d = json_decode($raw, true);
        return is_array($d) ? $d : [];
    }

    public static function startSession(): void
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_set_cookie_params([
                'httponly' => true,
                'samesite' => 'Strict',
                'secure' => (($_SERVER['HTTPS'] ?? '') !== ''),
            ]);
            session_start();
        }
    }

    public static function csrfToken(): string
    {
        self::startSession();
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['csrf'];
    }

    public static function requireCsrf(): bool
    {
        self::startSession();
        $hdr = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        $tok = $_SESSION['csrf'] ?? '';
        return $tok !== '' && is_string($hdr) && hash_equals($tok, $hdr);
    }

    /** Biztonságos napló: titkokat sosem írunk; az üzenetet hossz-korlátozzuk. */
    public static function log(Config $cfg, string $line): void
    {
        $dir = $cfg->logsDir();
        if (!is_dir($dir)) @mkdir($dir, 0775, true);
        $msg = '[' . date('c') . '] ' . substr($line, 0, 500) . "\n";
        @file_put_contents($dir . '/api.log', $msg, FILE_APPEND);
    }
}
