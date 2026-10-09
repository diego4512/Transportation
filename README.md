# BP Utas – budapesti közlekedési PWA

Valós idejű indulások (BKK Futár / Budapest GO API) + teljes menetrend (BKK GTFS), extrákkal:

| Funkció | Állapot |
| --- | --- |
| Megállókereső (ékezet nélkül is), közeli megállók, kedvencek, legutóbbiak | ✅ |
| Indulási tábla – valós idő, késés, megbízhatóság („általában 85% pontos”) | ✅ (valós idő kulccsal) |
| Járat nézet: megállók idővonala, jármű helyzete, térkép | ✅ |
| ☀️ **Hova ülj?** – napos/árnyékos oldal szakaszonként (útvonal-geometria + napállás + felhőzet) | ✅ |
| ❄️ **Ne süljek meg** – klíma a járművön (típus alapján), hőség/eső tanácsok (Open-Meteo) | ✅ |
| 🔔 Késés értesítés **okkal** (BKK forgalmi hír alapján, kategorizálva) | ✅ (kulccsal) |
| 🚶 „Indulj most” értesítés gyaloglási idő alapján | ✅ |
| 🛎️ Leszállás-figyelő | ✅ |
| 📅 Rendszeres út figyelése (pl. hétköznap 7:30) – csak gond esetén szól | ✅ |
| 📰 Forgalmi hírek (most / hamarosan), értesítés a kedvenc járatokról | ✅ (kulccsal) |
| 🔲 Widget nézet (`/widget/<megálló>`) – kezdőképernyőre tűzhető | ✅ |
| 📤 „Úton vagyok” megosztás | ✅ |
| 🎫 Bérlet-lejárat emlékeztető | ✅ |
| Offline mód (utolsó adatok, térképcsempék gyorsítótárban) | ✅ |
| Útvonaltervezés, telítettség-becslés, közösségi jelzések | ⏳ következő kör |
| Android APK + natív widget / élő értesítés (Capacitor) | ⏳ később |

## Indítás

```bash
cp .env.example .env          # ide jön majd a BKK_API_KEY
npm install
npm run gtfs:import           # letölti és betölti a BKK menetrendet (~1 perc, ~470 MB SQLite)
npm run dev                   # szerver: :8787, webapp: :5173 (Vite, /api proxy)
```

Éles mód: `npm run build && npm start` – ekkor a szerver a lefordított webappot is kiszolgálja a 8787-es porton.

**BKK API kulcs nélkül** is működik: ilyenkor menetrend szerinti időket mutat, a valós idejű funkciók
(késés, járművek, forgalmi hírek) a kulcs megadása után kapcsolnak be – kódváltoztatás nélkül.

A menetrendet érdemes naponta frissíteni (pl. cron: `0 4 * * * npm run gtfs:import`), a szerver újraindítása után az új adatot használja.

## Futtatás XAMPP alatt, Tailscale-en keresztül (Windows)

Az app egy Node szerver (menetrend-adatbázis, értesítések, háttérfigyelő), amit az Apache (XAMPP) proxyz ki egy alútvonalon.

1. **Node.js 22.13+** telepítése (https://nodejs.org, LTS).
2. A projekt mappája lehet bárhol, nem kell a `htdocs`-ba tenni (pl. `C:\bp-utas`).
3. `.env` létrehozása a `.env.example` alapján – ide kerül a **`BKK_API_KEY=...`** (ez a fájl nem megy fel a GitHubra).
   A `BASE_PATH=/utas/` mondja meg, milyen címen fut az Apache alatt.
4. Telepítés és build (a projekt mappájában):
   ```bat
   npm install
   npm run gtfs:import
   npm run build
   ```
5. **Apache:** másold a `deploy\xampp\bp-utas.conf` fájlt a `C:\xampp\apache\conf\extra\` mappába, és a fájl elején leírt
   módon kapcsold be (`Include` sor + `mod_proxy`, `mod_proxy_http`). Apache újraindítás.
6. **Node szerver:** `deploy\xampp\start-server.bat` (tartósan futtatáshoz: Feladatütemező „Rendszerindításkor”, vagy NSSM/pm2 szolgáltatásként).
7. Kipróbálás a gépen: http://localhost/utas/

### Tailscale – HTTPS kell!

A telepíthető PWA, a service worker, a **push értesítések** és a **helymeghatározás** csak HTTPS-en működnek
(kivéve `localhost`). A sima `http://100.x.y.z/utas/` Tailscale IP-címen ezek **nem** fognak menni. Megoldás:

1. Tailscale admin → **DNS** → MagicDNS és **HTTPS Certificates** bekapcsolása.
2. A szerver gépen (rendszergazdai parancssor):
   ```bat
   tailscale serve --bg 80
   ```
3. Az app ezután a tailneten itt érhető el, érvényes tanúsítvánnyal:
   `https://<gépnév>.<tailnet>.ts.net/utas/`

A push értesítések a böngészőgyártók szerverein (Google/Apple/Mozilla) keresztül érkeznek, ehhez a telefonnak nem kell a tailneten lennie –
az app megnyitásához és a feliratkozáshoz viszont igen.

## Felépítés

```
deploy/   XAMPP (Apache proxy) konfiguráció, Windows indító scriptek
server/   Node 22 + Fastify + node:sqlite (TypeScript, tsx)
  src/gtfs/       GTFS import és lekérdezések (menetrend, megállók, shape)
  src/bkk/        BKK Futár API kliens, késés-ok felismerés
  src/services/   napos oldal, klíma/időjárás, statisztika, web push, háttérfigyelő
  src/routes/     REST API (/api/...)
web/      React + Vite + vite-plugin-pwa + MapLibre
  src/pages/      Kezdőlap, Megálló, Járat, Térkép, Hírek, Beállítások, Widget
  src/sw.ts       service worker: offline gyorsítótár + push értesítések
data/     (git-ignored) gtfs.sqlite, app.sqlite, vapid.json
```

### Hogyan számol a „Hova ülj?”

A járat GTFS útvonal-geometriáját a felszállás és leszállás között kis szakaszokra bontjuk. Minden szakaszhoz
kiszámoljuk a haladási irányt és azt, hogy (a menetrend vagy a valós idejű előrejelzés szerint) mikor ér oda a jármű;
abban a pillanatban a nap azimutja és magassága megmondja, melyik oldalon süt be. Az időket összegezve ajánljuk az
árnyékos (hidegben – vagy kérésre – a napos) oldalt. Metrónál, borult időben, nagyon magas vagy lenyugvó napnál jelezzük, hogy mindegy.

### Fontos korlátok

- **Késés oka:** csak akkor írunk okot, ha a BKK forgalmi hírt adott ki rá. Ha nincs hír, ezt őszintén jelezzük.
- **Klíma:** a BKK API-ban nincs megbízható klíma mező; a járműtípus alapján becsülünk (`server/src/services/comfort.ts`, bővíthető tábla).
- **Push iPhone-on:** csak kezdőképernyőre telepített PWA-ból (iOS 16.4+).
- A Futár API kvótája ~100 hívás/perc/kulcs – a szerver gyorsítótáraz, nagyobb forgalomhoz érdemes a GTFS-RT feedre átállni.

## Tesztek

```bash
npm test            # napállás, ülésoldal, késés-ok felismerés
npm run typecheck
```
