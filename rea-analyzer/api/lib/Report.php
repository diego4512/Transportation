<?php
declare(strict_types=1);

/** Jelentés-export: JSON / Markdown / CSV / HTML. A megfigyelt tényeket, a
 *  következtetéseket és az ismeretleneket elkülönítve mutatja; nem állít
 *  teljes forrás-helyreállítást bizonyíték nélkül. */
final class Report
{
    public static function render(array $result, string $format): array
    {
        return match ($format) {
            'json' => ['ctype' => 'application/json; charset=utf-8', 'body' => json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)],
            'md' => ['ctype' => 'text/markdown; charset=utf-8', 'body' => self::md($result)],
            'csv' => ['ctype' => 'text/csv; charset=utf-8', 'body' => self::csv($result)],
            'html' => ['ctype' => 'text/html; charset=utf-8', 'body' => self::html($result)],
            default => ['ctype' => 'application/json; charset=utf-8', 'body' => json_encode(['error' => 'Ismeretlen formátum'], JSON_UNESCAPED_UNICODE)],
        };
    }

    private static function md(array $r): string
    {
        $o = [];
        $o[] = '# REA Web Analyzer jelentés';
        $o[] = '';
        $o[] = '- **URL:** ' . ($r['url'] ?? '');
        $o[] = '- **Origin:** ' . ($r['origin'] ?? '');
        $o[] = '- **Profil:** ' . ($r['profile'] ?? '') . ' · **Mélység:** ' . ($r['depth'] ?? '');
        $o[] = '- **Készült:** ' . ($r['generated_at'] ?? '');
        $c = $r['counts'] ?? [];
        $o[] = '- **Lépések:** ' . ($c['steps'] ?? 0) . ' · siker: ' . ($c['succeeded'] ?? 0) . ' · hiba: ' . ($c['failed'] ?? 0) . ' · bizonyíték: ' . ($c['evidence'] ?? 0);
        $o[] = '';
        $o[] = '## Megfigyelt tények (eszközönként)';
        foreach ($r['observed_facts'] ?? [] as $f) {
            $o[] = '- **' . $f['tool'] . '** — evidence: `' . ($f['evidence_id'] ?? '-') . '` — ' . json_encode($f['facts'] ?? [], JSON_UNESCAPED_UNICODE);
        }
        $o[] = '';
        $o[] = '## Következtetések';
        $o[] = $r['inferences'] ?? false ? '' : '_A következtetéseket a nyers bizonyítékokból (evidence) kell levezetni; a platform a tényeket és az ismeretleneket különíti el._';
        $o[] = '';
        $o[] = '## Ismeretlenek';
        if (empty($r['unknowns'])) {
            $o[] = '_Nincs külön rögzített ismeretlen._';
        } else {
            foreach ($r['unknowns'] as $u) $o[] = '- [' . ($u['tool'] ?? '') . '] ' . json_encode($u['item'] ?? $u, JSON_UNESCAPED_UNICODE);
        }
        $o[] = '';
        $o[] = '## Korlátok';
        foreach ($r['limitations'] ?? [] as $l) $o[] = '- [' . ($l['tool'] ?? '') . '] ' . ($l['note'] ?? '');
        $o[] = '';
        $o[] = '## Hibák / nem futtatható eszközök';
        foreach ($r['errors'] ?? [] as $e) $o[] = '- [' . ($e['tool'] ?? '') . '] ' . (($e['error']['message'] ?? '') ?: json_encode($e['error'] ?? [], JSON_UNESCAPED_UNICODE));
        foreach ($r['dropped'] ?? [] as $d) $o[] = '- [kihagyva: ' . ($d['id'] ?? '') . '] ' . ($d['reason'] ?? '');
        $o[] = '';
        return implode("\n", $o) . "\n";
    }

    private static function csv(array $r): string
    {
        $rows = [['tool', 'state', 'evidence_id', 'facts']];
        foreach ($r['steps'] ?? [] as $s) {
            $rows[] = [$s['id'] ?? '', $s['state'] ?? '', $s['evidence_id'] ?? '', json_encode($s['facts'] ?? [], JSON_UNESCAPED_UNICODE)];
        }
        $out = fopen('php://temp', 'r+');
        foreach ($rows as $row) fputcsv($out, $row);
        rewind($out);
        return (string)stream_get_contents($out);
    }

    private static function html(array $r): string
    {
        $e = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
        $h = '<!doctype html><html lang="hu"><head><meta charset="utf-8">';
        $h .= '<meta name="viewport" content="width=device-width, initial-scale=1">';
        $h .= '<title>REA jelentés – ' . $e($r['origin'] ?? '') . '</title>';
        $h .= '<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#0f172a}'
            . 'h1{font-size:1.4rem}h2{font-size:1.1rem;margin-top:1.5rem;border-bottom:1px solid #e2e8f0;padding-bottom:.3rem}'
            . 'table{border-collapse:collapse;width:100%}td,th{border:1px solid #e2e8f0;padding:.4rem;text-align:left;font-size:.85rem}'
            . 'code{background:#f1f5f9;padding:.1rem .3rem;border-radius:4px}.muted{color:#64748b}</style></head><body>';
        $h .= '<h1>REA Web Analyzer jelentés</h1>';
        $h .= '<p><strong>URL:</strong> ' . $e($r['url'] ?? '') . '<br><strong>Készült:</strong> ' . $e($r['generated_at'] ?? '') . '</p>';
        $h .= '<h2>Megfigyelt tények (eszközönként)</h2><table><tr><th>Eszköz</th><th>Állapot</th><th>Evidence</th><th>Tények</th></tr>';
        foreach ($r['steps'] ?? [] as $s) {
            $h .= '<tr><td>' . $e($s['name_hu'] ?? $s['id']) . '</td><td>' . $e($s['state'] ?? '') . '</td><td><code>' . $e($s['evidence_id'] ?? '-') . '</code></td><td>' . $e(json_encode($s['facts'] ?? [], JSON_UNESCAPED_UNICODE)) . '</td></tr>';
        }
        $h .= '</table>';
        $h .= '<h2>Ismeretlenek</h2>';
        if (empty($r['unknowns'])) $h .= '<p class="muted">Nincs külön rögzített ismeretlen.</p>';
        else { $h .= '<ul>'; foreach ($r['unknowns'] as $u) $h .= '<li>' . $e(json_encode($u, JSON_UNESCAPED_UNICODE)) . '</li>'; $h .= '</ul>'; }
        $h .= '<h2>Korlátok</h2><ul>';
        foreach ($r['limitations'] ?? [] as $l) $h .= '<li>[' . $e($l['tool'] ?? '') . '] ' . $e($l['note'] ?? '') . '</li>';
        $h .= '</ul>';
        $h .= '<h2>Hibák / kihagyott eszközök</h2><ul>';
        foreach ($r['errors'] ?? [] as $x) $h .= '<li>[' . $e($x['tool'] ?? '') . '] ' . $e($x['error']['message'] ?? '') . '</li>';
        foreach ($r['dropped'] ?? [] as $d) $h .= '<li class="muted">[kihagyva: ' . $e($d['id'] ?? '') . '] ' . $e($d['reason'] ?? '') . '</li>';
        $h .= '</ul>';
        $h .= '<p class="muted">A jelentés a ténylegesen megfigyelt bizonyítékokon alapul. A platform nem állít teljes eredeti forráskód-helyreállítást bizonyíték nélkül.</p>';
        $h .= '</body></html>';
        return $h;
    }
}
