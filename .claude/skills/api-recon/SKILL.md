---
name: api-recon
description: >-
  Felhatalmazott biztonsági teszthez: a Transportation (Fastify/Node) backend
  API-végpontjainak hatékony, NON-DESTRUKTÍV felderítése. Két forrásból dolgozik —
  (1) a forráskódból kinyert, hiteles route-lista, (2) a futó app óvatos szondázása.
  Akkor használd, ha fel kell térképezni a HTTP-végpontokat, paramétereiket és
  viselkedésüket a saját / engedélyezett célon (recon, attack-surface mapping,
  OpenAPI vázlat). Triggerek: "végpont felderítés", "endpoint enumeration",
  "attack surface", "API recon", "route lista", "mit szolgál ki az app".
---

# API-végpont felderítés (api-recon)

## Hatókör és szabályok

**Csak felhatalmazott célon.** Ez a skill a saját `transportation` rendszeren
(vagy írásos engedéllyel bíró célon) futó, dokumentációs/audit célú felderítésre
való. Mielőtt bármit a hálózaton szondázol:

- Győződj meg róla, hogy a cél a felhasználó sajátja vagy engedélyezett (az app
  alapértelmezetten `127.0.0.1:8787`-en fut — lásd `.env.example`).
- **Non-destruktív maradj.** Megengedett: `GET` kérések, séma-ellenőrzés, egyetlen
  jól formált `POST`/`DELETE` a saját teszt-adaton. **Tilos**: fuzzing nagy
  sebességgel, DoS, jelszó/token brute-force, valós feliratkozások tömeges
  létrehozása/törlése, idegen cél szkennelése.
- Alacsony kérésszám, egyszálú, késleltetéssel. A cél feltérképezése, nem terhelése.

Ha a cél nem egyértelműen a felhasználóé/engedélyezett, **állj meg és kérdezz rá**.

## Munkamenet

### 1. Forráskódból (elsődleges, gyors, hiteles)

A route-ok a `server/src/routes/api.ts`-ben vannak Fastify dekorátorokként
(`app.get/post/delete(...)`). Ez a leghitelesebb lista — a futó appot nem is
kell elindítani hozzá. Futtasd:

```
node .claude/skills/api-recon/scripts/extract-routes.mjs
```

Ez kigyűjti a metódust, útvonalat, az út-paramétereket (`:id`, `:sub`), és a
kódból kiolvasható query/body mezőket. Ne feledd a **prefixet**: éles módban az
Apache a `BASE_PATH` (pl. `/utas/`) alatt proxyzza, tehát a tényleges URL
`http://<host>/utas/api/...`. Közvetlen futtatáskor a prefix `/`.

### 2. Futó app szondázása (megerősítés + viselkedés)

Indítsd a szervert (`cd server && npm run dev`), majd:

```
node .claude/skills/api-recon/scripts/probe.mjs http://127.0.0.1:8787
```

A szonda a forrásból ismert route-okat próbálja (nem vakon fuzzol):
státuszkód, `content-type`, válaszméret, és a hibaüzenetek (a backend beszédes
400/404 üzeneteket ad vissza, pl. „lat és lon kötelező" — ezek paramétereket
tárnak fel). A `--base /utas` kapcsolóval állítható a prefix.

### 3. Mit figyelj (ennek az appnak a jellemzői)

- **Nincs authentikáció** egyetlen `/api/*` végponton sem — minden publikus.
  A findings közt ez a legfontosabb megállapítás.
- **CORS `origin: true`** (`index.ts`) — minden origin engedélyezett, hitelesítő
  adattal is. Jegyezd fel.
- **IDOR-gyanú**: `/api/push/:sub/...` — a `sub` feliratkozás-azonosító az egyetlen
  „tulajdonjog". Vizsgáld, kitalálható/enumerálható-e (hogyan generálódik a
  `saveSubscription`-ben, `services/push.ts`).
- **Beszédes hibák**: a `bad()` helper 400-at ad leíró üzenettel → paraméter-
  felderítés hibaüzenetből.
- **SPA fallback**: `/api/`-val nem kezdődő ismeretlen út `index.html`-t ad; az
  ismeretlen `/api/...` út `404 {"error":"Nincs ilyen végpont"}`-ot → ez megbízható
  oráklum arra, hogy egy `/api` út létezik-e.
- **Felső korlátok** input-validáción: `radius` max 2000/5000, `minutes` max 240 —
  jegyezd fel mint szándékos clamp (nem hiba, de jó tudni).

### 4. Kimenet

Készíts tömör leletet: végpont-táblázat (metódus, út, paraméterek, auth, észrevétel)
+ attack-surface összefoglaló. A nyers kimeneteket a scratchpadbe tedd, a leletet a
munkakönyvtárba, hogy a felhasználó meg tudja nyitni.

## Fájlok
- `scripts/extract-routes.mjs` — statikus route-kinyerő a forrásból.
- `scripts/probe.mjs` — non-destruktív live szonda a forrásból ismert route-okra.
- `reference/checklist.md` — recon-ellenőrzőlista és findings-sablon.
