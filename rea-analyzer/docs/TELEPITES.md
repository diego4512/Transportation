# REA Web Analyzer – telepítés és indítás (Windows / XAMPP)

Ez az útmutató végigvezet a telepítésen Windows alatt, XAMPP (Apache + PHP)
kiszolgálóval. A rendszer három részből áll:

1. **Frontend + PHP API** – az Apache (XAMPP) szolgálja ki.
2. **Node worker** – külön folyamat, amely a valódi `rea` CLI-t futtatja.
3. **REA motor (`rea`)** – a tényleges elemzőeszköz (Node alapú).

> A PHP sosem indít folyamatot: csak fájlalapú job-okat ír. A böngészőt és a
> `rea` CLI-t kizárólag a Node worker indítja, szigorú validációval.

---

## 1. Előfeltételek

| Komponens | Verzió | Megjegyzés |
|---|---|---|
| **XAMPP** | Apache + **PHP 8.1+** | A PHP-ben legyen `mbstring`, `json` (alap). |
| **Node.js** | **22.19+ / 24.11+ / 26+** | A REA ezt írja elő (`rea-src/.nvmrc` → 24.x). |
| **Chrome / Chromium / Edge** | friss | A weboldal-elemzéshez. |
| **git** | bármely | Csak a GitHub-bővítményekhez. |

Ellenőrzés parancssorból: `node -v`, `php -v`, `git --version`.

---

## 2. A REA motor telepítése

Két lehetőség:

**A) Globális npm-csomag (ajánlott):**
```bat
npm install -g rea-agents
rea --version
```
Ekkor a `config.json`-ban: `"rea_cmd": "rea"`.

**B) Forrásból buildelve** (ha a `rea-src` mappát is magad hozod):
```bat
cd C:\xampp\htdocs\rea-analyzer\rea-src
npm ci
npm run build
```
Ekkor a `config.json`-ban:
`"rea_cmd": "node C:/xampp/htdocs/rea-analyzer/rea-src/scripts/rea.mjs"`
és `"rea_home": "C:/xampp/htdocs/rea-analyzer/rea-src"`.

> A **külső motorok** (Ghidra, IDA, Hopper, JADX, binwalk, unblob, macOS-eszközök)
> NEM részei ennek, és NEM szükségesek a weboldal-elemzéshez. Ezek bináris/APK/
> firmware/.NET/Apple célokra valók, külön telepítést (és egyes esetben licencet)
> igényelnek. A Diagnosztika oldal pontosan megmutatja, mi érhető el.

---

## 3. A projekt elhelyezése

Másold a teljes `rea-analyzer` mappát ide: `C:\xampp\htdocs\rea-analyzer`

Így az app a **http://localhost/rea-analyzer/** címen lesz elérhető.
(A gyökérben lévő `.htaccess` elvégzi a routingot; a `mod_rewrite` és `mod_headers`
modulok legyenek bekapcsolva a XAMPP Apache-ban.)

---

## 4. Konfiguráció

Másold a mintát, és szerkeszd:
```bat
copy config\config.sample.json config\config.json
```

Fontos mezők:

```jsonc
{
  "base_path": "/rea-analyzer/",
  "rea_home": "C:/xampp/htdocs/rea-analyzer/rea-src",   // vagy ahova a rea települt
  "rea_cmd": "rea",                                      // vagy "node .../scripts/rea.mjs"
  "chrome_path": null,                                   // null = automatikus keresés
  "allow_loopback_targets": false,                       // true csak helyi tesztoldalhoz
  "active_analysis_enabled": false                       // aktív (böngészővezérlő) eszközök
}
```

Ha a Chrome nem szabványos helyen van, add meg:
`"chrome_path": "C:/Program Files/Google/Chrome/Application/chrome.exe"`

---

## 5. Az eszközleltár legenerálása

A `tool-registry.json` a te gépeden felmért valós állapotot tükrözi:
```bat
cd C:\xampp\htdocs\rea-analyzer
node bin\generate-tool-registry.mjs --rea-home C:\xampp\htdocs\rea-analyzer\rea-src
```
Ez kiírja, hány eszköz érhető el, és melyik hiányzik.

---

## 6. A Node worker indítása

A workernek folyamatosan futnia kell, amíg elemzel:
```bat
deploy\xampp\start-worker.bat
```
(Tartós futtatáshoz: Windows Feladatütemező „Rendszerindításkor", vagy
`pm2` / `NSSM` szolgáltatásként.)

---

## 7. Apache indítása és az app megnyitása

1. A XAMPP vezérlőpultban indítsd az **Apache**-ot.
2. Nyisd meg: **http://localhost/rea-analyzer/**
3. A **Diagnosztika** oldalon ellenőrizd, hogy a worker „fut", a Chromium
   „elérhető", és a REA motor rendben van.

Most már beírhatsz egy URL-t, és a **Teljes elemzés indítása** gombbal egy
kattintással elemezhetsz.

---

## 8. Fejlesztői futtatás XAMPP nélkül (Linux/teszt)

Ugyanaz a PHP-kód fut a beépített PHP-kiszolgálóval is:
```bash
# 1) worker
node worker/worker.mjs &
# 2) PHP szerver a dev routerrel
php -S 127.0.0.1:8080 deploy/router.php
# 3) böngésző: http://127.0.0.1:8080/
```

---

## 9. Tesztek futtatása

```bash
# teljes készlet (futó PHP szerver + worker mellett)
bash tests/run-all.sh http://127.0.0.1:8080

# vagy külön:
php tests/php/run-tests.php
bash tests/api-tests.sh http://127.0.0.1:8080
node tests/js/ui-smoke.mjs http://127.0.0.1:8080
```

---

## 10. Hibaelhárítás

| Tünet | Megoldás |
|---|---|
| „Node worker nem fut" | Indítsd a `start-worker.bat`-ot; nézd a `storage/logs/worker.log`-ot. |
| „Chromium nem található" | Állítsd be a `chrome_path`-t a `config.json`-ban. |
| Minden elemzés „queued" marad | A worker nem fut, vagy nem éri el a `storage/` mappát (jogosultság). |
| 403 az API-n | A frontend előbb kér CSRF-tokent; töltsd újra az oldalt. |
| „URL elutasítva" | SSRF-védelem: privát/loopback/metadata cél. Éles módban ez helyes. |
| 500-as hiba | Nézd a `storage/logs/api.log`-ot és a `config.json` helyességét. |
