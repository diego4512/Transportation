#!/usr/bin/env bash
# REA Web Analyzer – API integrációs tesztek.
# Elvárás: fut a PHP szerver (alap: 127.0.0.1:8080) és a Node worker.
# A boldog-út teszthez fut egy helyi tesztoldal a 127.0.0.1:3000-en ÉS a
# config allow_loopback_targets=true. Használat: bash tests/api-tests.sh [baseUrl]
set -u
BASE="${1:-http://127.0.0.1:8080}"
CJ="$(mktemp)"
PASS=0; FAIL=0
ok(){ echo "✓ $1"; PASS=$((PASS+1)); }
no(){ echo "✗ $1"; FAIL=$((FAIL+1)); }

code(){ curl -s -o /dev/null -w "%{http_code}" "$@"; }

# health
[ "$(code "$BASE/api/health")" = "200" ] && ok "health 200" || no "health 200"

# registry 126
curl -s "$BASE/api/registry" | grep -Eq '"mcp_tools_total": ?126' && ok "registry 126 eszköz" || no "registry 126 eszköz"

# CSRF token
TOK=$(curl -s -c "$CJ" "$BASE/api/csrf" | sed -n 's/.*"csrf":"\([^"]*\)".*/\1/p')
[ -n "$TOK" ] && ok "CSRF token kiadva" || no "CSRF token kiadva"

post(){ # $1=json  -> http kód
  curl -s -o /dev/null -w "%{http_code}" -b "$CJ" -X POST "$BASE/api/analyze" \
    -H "Content-Type: application/json" -H "X-CSRF-Token: $TOK" -d "$1"
}

# CSRF hiánya → 403
[ "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/analyze" -H "Content-Type: application/json" -d '{"url":"http://8.8.8.8/"}')" = "403" ] && ok "CSRF nélkül 403" || no "CSRF nélkül 403"

# SSRF: privát IP → 400
[ "$(post '{"url":"http://10.0.0.1/","profile":"gyors-web"}')" = "400" ] && ok "SSRF privát IP 400" || no "SSRF privát IP 400"
# SSRF: metadata → 400
[ "$(post '{"url":"http://169.254.169.254/","profile":"gyors-web"}')" = "400" ] && ok "SSRF metadata 400" || no "SSRF metadata 400"
# tiltott séma → 400
[ "$(post '{"url":"ftp://example.com/","profile":"gyors-web"}')" = "400" ] && ok "tiltott séma 400" || no "tiltott séma 400"
# ismeretlen profil → 400
[ "$(post '{"url":"http://8.8.8.8/","profile":"nincs-ilyen"}')" = "400" ] && ok "ismeretlen profil 400" || no "ismeretlen profil 400"
# ismeretlen mélység → 400
[ "$(post '{"url":"http://8.8.8.8/","profile":"gyors-web","depth":"xxx"}')" = "400" ] && ok "ismeretlen mélység 400" || no "ismeretlen mélység 400"

# Boldog út (loopback tesztoldal), ha elérhető
if curl -s -o /dev/null -m 2 "http://127.0.0.1:3000/"; then
  RESP=$(curl -s -b "$CJ" -X POST "$BASE/api/analyze" -H "Content-Type: application/json" -H "X-CSRF-Token: $TOK" -d '{"url":"http://127.0.0.1:3000/","profile":"gyors-web","depth":"sekely"}')
  JID=$(echo "$RESP" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
  if [ -n "$JID" ]; then
    ok "boldog út: elemzés sorba állítva ($JID)"
    STATE=""
    for i in $(seq 1 40); do
      sleep 1
      STATE=$(curl -s "$BASE/api/jobs/$JID" | sed -n 's/.*"state":"\([^"]*\)".*/\1/p' | head -1)
      [ "$STATE" = "done" ] || [ "$STATE" = "error" ] && break
    done
    [ "$STATE" = "done" ] && ok "boldog út: állapot=done" || no "boldog út: állapot=$STATE"
  else
    no "boldog út: nem jött jobId ($RESP)"
  fi
else
  echo "… boldog út kihagyva (nincs 127.0.0.1:3000 tesztoldal)"
fi

rm -f "$CJ"
echo
echo "API tesztek: $PASS siker, $FAIL hiba"
[ "$FAIL" -eq 0 ]
