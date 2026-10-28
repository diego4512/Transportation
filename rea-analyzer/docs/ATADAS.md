# REA Web Analyzer – átadási jelentés

Készült: 2026-10-28 · REA motor: **v4.1.0** (`rea-agents`, `io.github.morluto/rea`)

Ez a dokumentum őszintén rögzíti, mi működik ténylegesen, mit mértem fel a
forráskódban, mi futtatható, és mi igényel külön telepítést vagy nem valósítható
meg közvetlenül XAMPP alatt. A brief kifejezett kérése volt a valós állapot
bemutatása (nem „mind a 170 eszköz működik" állítás).

---

## 1. Fontos kiindulási eltérés

- A megadott munkakönyvtár (`/home/user/Transportation`, `github.com/diego4512/Transportation`)
  **nem a REA-kódbázis volt**, hanem egy budapesti közlekedési PWA (`bp-transit`).
- Egyeztetés után a REA-t (`github.com/teonett/Reverse-Engineer-Anything`) külön
  behoztuk referenciaként (`/home/user/rea-src`), és az elemzőt erre építettük.
  A `Transportation` repó kódját nem módosítottam; az új platform külön mappában
  él: **`rea-analyzer/`**.
- A futtatókörnyezet itt **Linux** (nem Windows). A XAMPP lényege Apache + PHP;
  **ugyanaz a PHP-kód** fut a user gépén XAMPP/Apache alatt, amit itt a beépített
  PHP-kiszolgálóval végig **futtattam és teszteltem**. Magát az Apache/XAMPP
  indítást Windowson a felhasználónak kell igazolnia (PHP 8.3-mal itt verifikálva).

---

## 2. Eszközleltár (a forráskódból, géppel ellenőrizve)

A `product-catalog.json` + `rea capabilities --json` + Chromium-próba alapján
(`tool-registry.json`):

| Mutató | Érték |
|---|---:|
| **MCP-eszköz összesen** | **126** |
| CLI-parancs | 81 |
| MCP-prompt | 6 |
| Provider | 19 |
| **Weboldalra közvetlenül alkalmazható** | **9** |
| Most elérhető (ebben a tesztkörnyezetben) | 16 |
| Nem elérhető (ebben a tesztkörnyezetben) | 9 |
| Ismeretlen (célpontot/providert igényel) | 101 |

> A brief „~170 eszköz" száma **nem igazolódott**: a valós szám **126 MCP-eszköz**
> (+ 81 CLI-parancs). A katalógusban mind a 126 megjelenik valós állapottal.

**Eszközcsaládok:** direct 41, enhanced 14, native 7, artifact 5, managed 7,
firmware 2, android 5, browser 9, electron 5, javascript-runtime 2,
application 8, session 21.

---

## 3. Mi működik ténylegesen (itt tesztelve, végpontig)

A teljes lánc **PHP API → fájl-job → Node worker → valódi `rea` CLI → Chromium (CDP)
→ bizonyíték → jelentés** bizonyítottan működik. Egy helyi tesztoldalon az összes
alábbi eszköz **valós `evidence_id`-t** adott:

| Eszköz | Állapot |
|---|---|
| `list_browser_targets` | ✅ fut |
| `inspect_web_page` (DOM, scriptek, hálózat, JSON/WS alakok) | ✅ fut |
| `analyze_web_bundle` (chunk/route/endpoint/vendor) | ✅ fut |
| `discover_webmcp_tools` | ✅ fut |
| `observe_web_session` | ✅ fut |
| `capture_web_screenshot` (PNG) | ✅ fut |
| `export_web_scripts` (statikus JS-export) | ✅ fut |
| `capture_browser_scenario` (aktív, Playwright) | ✅ elérhető (aktív mód szükséges) |

Ez a **8 weboldal-elemző eszköz** futtatható a platformból (az egykattintásos
„teljes" profil ezeket a passzívakat futtatja; a `capture_browser_scenario`
csak aktív mód engedélyezésekor).

**Egyéb, itt elérhetőként felmért eszközök** (a `rea capabilities` szerint, nem
weboldalra): `extract_artifact`, `inspect_artifact`, `inspect_keyed_archive`,
`decode_interface_builder`, `inspect_managed_artifact/members/native_boundaries`.
Ezek bináris/artifact/.NET bemenetet igényelnek, így az URL-alapú folyamatban nem
indulnak, de a katalógusban láthatók.

---

## 4. Mi igényel külön telepítést vagy licencet

Ezek **nem** kellenek a weboldal-elemzéshez, és NEM feltételezzük telepítettnek:

| Provider | Cél | Telepítés / licenc |
|---|---|---|
| **Ghidra** | natív bináris | külön telepítés (ingyenes, nyílt) |
| **IDA Pro** | natív bináris | külön telepítés + **kereskedelmi licenc** |
| **Hopper** | natív bináris | külön telepítés + **kereskedelmi licenc** |
| **JADX** | Android APK | külön telepítés (nyílt) |
| **binwalk / unblob** | firmware | külön telepítés (nyílt) |
| **macOS natív eszközök** | Mach-O/plist/Swift/UI | **csak macOS** gazdagépen |

A 9 „nem elérhető" eszköz mindegyike macOS-t igényel (`unsupported_host`) – ezek
Windows/XAMPP alatt sem fognak elindulni, és a Diagnosztika ezt jelzi is.

---

## 5. Mi nem valósítható meg közvetlenül Windows/XAMPP alatt

- **macOS-függő eszközök** (7+2 db): kizárólag macOS-en futnak.
- **Natív/.NET/APK/firmware elemzés**: csak a megfelelő külső motor telepítése
  (és egyes esetben licenc) után; ezek nem is weboldalra valók.
- **A PHP nem futtat hosszú elemzést egyetlen HTTP-kérésben** – ezt szándékosan a
  Node worker + fájl-job + állapotlekérdezés oldja meg (így XAMPP alatt is stabil).
- **A Node worker külön folyamat**: a XAMPP önmagában nem indítja; a
  `start-worker.bat`-tal (vagy pm2/NSSM szolgáltatásként) kell futtatni.

---

## 6. Telepítés és indítás (röviden)

Részletek: **[TELEPITES.md](TELEPITES.md)**.

1. `npm install -g rea-agents` (vagy forrásból build) → `rea` elérhető.
2. A `rea-analyzer` mappa `C:\xampp\htdocs\rea-analyzer` alá.
3. `copy config\config.sample.json config\config.json` → útvonalak beállítása.
4. `node bin\generate-tool-registry.mjs --rea-home ...`
5. `deploy\xampp\start-worker.bat` (worker folyamatosan fut).
6. XAMPP Apache indítása → **http://localhost/rea-analyzer/**

---

## 7. Lefuttatott tesztek és eredményük

A `bash tests/run-all.sh` teljes készlet **ebben a környezetben SIKERES**:

| Teszt | Eredmény |
|---|---|
| REA épség (`rea capabilities`) | ✅ |
| `tool-registry.json` regenerálás (126 eszköz) | ✅ |
| PHP szintaxis (minden fájl) | ✅ |
| PHP egységtesztek (SSRF, manifest, config) | ✅ 20/20 |
| API integrációs tesztek (SSRF, CSRF, profil, boldog út) | ✅ 11/11 |
| UI füst-teszt (valódi böngésző, teljes elemzés „done"-ig) | ✅ 7/7 |

A tesztek valós futásokat ellenőriznek; a sikerüzenetek nem kézzel beírtak.

---

## 8. Biztonsági összefoglaló

- **SSRF:** séma-ellenőrzés, DNS-feloldás, privát/loopback/link-local/metadata
  blokkolás (PHP és worker oldalon is).
- **CSRF:** session-token minden állapotváltó kéréshez.
- **Parancsinjektálás:** a `rea` és a `git` hívása mindig argumentum-tömbbel,
  soha nem shell-összefűzéssel.
- **Böngésző:** izolált profil, efemer loopback CDP-port; a REA web-eszközei
  passzívak (nincs `Runtime.evaluate`, navigáció vagy input-vezérlés).
- **Bővítmények:** alapból letiltva, rögzített commit, nincs automatikus
  telepítőszkript-futtatás, nincs automatikus fájlrendszer-/titok-hozzáférés.
- **Naplózás:** az `api.log`/`worker.log` nem ír titkokat; az URL-ekből a
  hitelesítő adatok eltávolításra kerülnek.

---

## 9. Ismert korlátok / következő lépések

- A `capture_browser_scenario` jelenleg minimális (navigálás + beállás) aktív
  forgatókönyvvel fut; bővíthető interakciós lépésekkel.
- A bővítmény-eszközök a katalógusban megjelennek, de tényleges futtatásukhoz
  kompatibilis adapter kell (a manifest `adapter` mezője) – ez szándékosan
  jelölt („plugin_adapter_required"), nem hamisított működés.
- A `compare_*` web-eszközök két capture-t igényelnek; az egykattintásos
  folyamat egy célpontot elemez, ezért ezek az „összehasonlítás" munkamenethez
  valók (jövőbeli: két elemzés összevetése a felületről).
