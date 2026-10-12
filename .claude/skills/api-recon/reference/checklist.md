# Recon-ellenőrzőlista és findings-sablon

## Felderítési lépések
- [ ] Route-lista a forrásból (`extract-routes.mjs`) — hiteles alap.
- [ ] Prefix tisztázva (`BASE_PATH`, pl. `/utas/` Apache mögött; közvetlenül `/`).
- [ ] Futó app szondázva (`probe.mjs`) — státusz, content-type, hibaüzenetek.
- [ ] Nem-`/api` utak: SPA fallback (`index.html`) vs. valós 404 elkülönítve.
- [ ] Statikus kiszolgálás vizsgálva (`@fastify/static` — csak `web/dist`, a
      `.env`/`data/` a `.htaccess` miatt nem szolgálható ki; ellenőrizd élesben is).

## Végpont-tábla (töltsd ki)
| Metódus | Út | Út-param | Query/Body | Auth | Megjegyzés |
|---|---|---|---|---|---|
| GET | /api/status | – | – | nincs | realtime+gtfs meta szivárog |
| GET | /api/stops/search | – | q | nincs | |
| GET | /api/stops/nearby | – | lat,lon,radius | nincs | radius clamp 2000 |
| GET | /api/stops/:id | id | – | nincs | 404 ha nincs |
| GET | /api/stops/:id/departures | id | group,minutes | nincs | minutes clamp 240 |
| GET | /api/trips/:id | id | date | nincs | |
| GET | /api/trips/:id/sun | id | from,to,pref,date | nincs | |
| GET | /api/routes/:id | id | – | nincs | |
| GET | /api/vehicles | – | routeId,lat,lon,radius | nincs | radius clamp 5000 |
| GET | /api/alerts | – | – | nincs | |
| GET | /api/weather | – | lat,lon | nincs | külső időjárás proxy |
| GET | /api/push/key | – | – | nincs | VAPID public key |
| POST | /api/push/subscribe | – | subscription | nincs | állapotot hoz létre |
| DELETE | /api/push/:sub | sub | – | gyenge (sub) | IDOR-gyanú |
| GET | /api/push/:sub/watches | sub | – | gyenge (sub) | IDOR-gyanú |
| POST | /api/push/:sub/watches | sub | kind,params | gyenge (sub) | |
| DELETE | /api/push/:sub/watches/:id | sub,id | – | gyenge (sub) | |

## Attack-surface megállapítások (sablon)
- **Auth**: minden `/api/*` publikus, nincs token/session. → Kockázat: ?
- **CORS**: `origin: true` — minden origin + credential. → Kockázat: ?
- **IDOR**: `:sub` az egyetlen tulajdonjog a push/watch végpontokon. Vizsgáld a
  `sub` generálását (`server/src/services/push.ts`): kitalálható? enumerálható?
- **Információszivárgás**: beszédes 400/404 üzenetek, `/api/status` metaadat.
- **Rate limiting**: van-e? (Fastify alapból nincs.) → Kockázat: ?
- **Input clamp**: radius/minutes felső korlát — szándékos, nem hiba.

> Minden megállapításhoz: hol (fájl:sor), miért kockázat, javasolt enyhítés.
> A felderítés non-destruktív — ne hozz létre valós push-feliratkozásokat.
