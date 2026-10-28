#!/usr/bin/env bash
# REA Web Analyzer – teljes tesztkészlet.
#   1) REA épség (rea capabilities fut-e)
#   2) tool-registry.json regenerálás + ellenőrzés
#   3) PHP szintaxis
#   4) PHP egységtesztek
#   5) API integrációs tesztek (futó PHP szerver + worker kell)
#   6) UI füst-teszt (futó szerver + Chromium kell)
# Használat a projekt gyökeréből: bash tests/run-all.sh [baseUrl]
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BASE="${1:-http://127.0.0.1:8080}"
REA_HOME="$(node -e "console.log(require('./config/config.json').rea_home)" 2>/dev/null)"
RC=0

echo "### 1) REA épség (capabilities) ###"
REA_CMD="$(node -e "console.log(require('./config/config.json').rea_cmd)")"
$REA_CMD capabilities --json >/dev/null 2>&1 && echo "✓ rea capabilities fut" || { echo "✗ rea capabilities HIBA"; RC=1; }

echo; echo "### 2) tool-registry.json regenerálás ###"
node bin/generate-tool-registry.mjs --rea-home "$REA_HOME" >/dev/null 2>&1 && echo "✓ regiszter generálva" || { echo "✗ regiszter generálás HIBA"; RC=1; }
node -e "const r=require('./tool-registry.json'); if(r.counts.mcp_tools_total!==126){console.log('✗ nem 126 eszköz');process.exit(1)} console.log('✓ 126 MCP-eszköz a regiszterben')" || RC=1

echo; echo "### 3) PHP szintaxis ###"
SYN=0; for f in api/index.php api/lib/*.php; do php -l "$f" >/dev/null 2>&1 || { echo "✗ $f"; SYN=1; }; done
[ "$SYN" = "0" ] && echo "✓ minden PHP szintaktikailag helyes" || RC=1

echo; echo "### 4) PHP egységtesztek ###"
php tests/php/run-tests.php || RC=1

echo; echo "### 5) API integrációs tesztek ###"
if curl -s -o /dev/null -m 3 "$BASE/api/health"; then
  bash tests/api-tests.sh "$BASE" || RC=1
else
  echo "… kihagyva: a PHP szerver nem fut ($BASE). Indítsd: php -S 127.0.0.1:8080 deploy/router.php"
fi

echo; echo "### 6) UI füst-teszt ###"
if curl -s -o /dev/null -m 3 "$BASE/api/health"; then
  node tests/js/ui-smoke.mjs "$BASE" || RC=1
else
  echo "… kihagyva (nincs futó szerver)"
fi

echo; echo "========================================"
[ "$RC" = "0" ] && echo "ÖSSZESÍTÉS: MINDEN TESZT SIKERES" || echo "ÖSSZESÍTÉS: VAN SIKERTELEN TESZT"
exit $RC
