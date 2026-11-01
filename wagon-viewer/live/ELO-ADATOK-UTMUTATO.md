# Élő MÁV ülés-térkép – hogyan kerül bele valódi adat

Ez az oldal (`live.html`) **valódi MÁV ülés-térképet** jelenít meg: minden kocsi
a tényleges `availableSeatsCount` szerinti telítettség-színnel (zöld/narancs/piros),
és egy kocsira kattintva a MÁV **saját SVG ülés-képe** jelenik meg – zöld = szabad,
piros = foglalt hely.

## Miért nem tölti le magától a felhőből?

Végigjártam az API-t. A helyzet pontosan ez:

- A **referencia-végpontok token nélkül mennek** innen is (állomáslista, kedvezmények,
  szolgáltatások, modalitások) – ezeket le is kérdeztem élesben.
- De a **`GetOfferRequest`** és a **`GetGraphicalPlaceReservationMap`** (maga az
  ülés-térkép) egy **reCAPTCHA v3 → JWT** tokent vár a `jwt` fejlécben. A kliens ezt
  úgy állítja elő, hogy lefuttatja a Google reCAPTCHA-t a saját oldalon, a kapott
  `ResponseToken`-t elküldi a `GetJWT`-nek, és az így kapott JWT megy a kéréssel.
- Ezt a tokent **felhőből, böngésző és valódi reCAPTCHA nélkül nem lehet előállítani**,
  és szándékosan **nem kerülöm meg** a bot-védelmet (üres/hamis token küldését a
  rendszer helyesen blokkolja).

Ezért az ülés-térkép adatát a **saját, bejelentkezett böngésződből** kell egyszer
kimenteni – ott a reCAPTCHA már lefutott, a kérés jogos. Utána az oldal változatlanul,
offline is megjeleníti.

## Lépésről lépésre (kb. 1 perc)

1. Nyisd meg a **https://jegy.mav.hu** oldalt, és keress rá egy konkrét vonatra
   (honnan–hová, dátum), amin van helyjegy/helybiztosítás.
2. Lépj be az **ülőhely-választásba** (a kocsitérkép megjelenik a MÁV oldalán).
3. Nyomd meg az **F12**-t → **Network / Hálózat** fül. A szűrőbe írd: `Reservation`
   (vagy `Graphical`).
4. Kattints egy kocsira a MÁV térképén – megjelenik egy
   **`GetGraphicalPlaceReservationMap`** kérés a listában.
5. Kattints rá → **Response / Válasz** fül → jobbklikk → **Copy response**
   (vagy jelöld ki és másold ki az egész JSON-t).
6. Illeszd be az oldalunkon (`live.html`) a felső mezőbe, és nyomd a
   **„Beillesztett JSON betöltése"** gombot.
   - Vagy mentsd a választ a **`wagon-viewer/data/live-reservation.json`** fájlba –
     az oldal induláskor automatikusan betölti.

Ennyi: a kocsik és az ülések a **valódi foglaltsággal** jelennek meg.

## Mit vár az oldal (a valódi válasz szerkezete)

Élő mintán ellenőrizve (204-es vonat, Budapest-Kelenföld → Balatonlelle, 2026-10-28,
mentve: `data/live-reservation.json`):

```
{ "reservationMap": { "seatCount": 0, "train": {
    "number": "204", "departure": "Budapest-Kelenf.", "destination": "Balatonlelle",
    "startTime": "2026-10-28T15:42:00+01:00", "arrivalTime": "...",
    "trainServiceNames": ["Helyjegy váltása kötelező", ...],
    "carriages": [ {
        "number": "424", "availableSeatsCount": 31, "physicalOrder": 1, "sellingOrder": 1,
        "placeServices": [ { "uicCode": "02", "name": "Termeskocsi" } ],   // 01 = fülkés, 02 = termes
        "feeCodes": [ { "uicCode": "B" } ],                                 // OB = kerékpárhely
        "layoutPathHorizontal": "<svg>…</svg>",   // lehet ÜRES string is!
        "layoutPathVertical":   "<svg>…</svg>",
        "compartments": [ { "number": "01", "seats": [ ... ] } ],
        "seats": [ { "number": "015", "reservation": 0,
                     "placePositionService": "positionOfSeatSeatWindow" } ]
    } ]
} } }
```

- **Ülés-állapot:** `seats[].reservation` – `0` = szabad, `1` = foglalt, `2` = nem
  foglalható. A `0`-k száma pontosan egyezik az `availableSeatsCount`-tal.
- **SVG:** minden `<g id="ules_NNN">` alatt négy réteg van – `foglalhato`, `foglalt`,
  `kijelolt`, `nem_foglalhato` –, ebből mindig csak az állapotnak megfelelő látszik.
  Az adapter `data-state` attribútumot ír a csoportra, a CSS ez alapján rejt el.
  (Osztály nincs az üléseken; régi/demó SVG-nél a `seat-disabled` / `seat-forbidden` /
  `bicycleSeat` osztály a tartalék.)
- **Ha nincs SVG** (a mintában a 423-as és a 3-as kocsinál üres): az oldal a
  `compartments[]` alapján fülkénkénti rácsot rajzol; kerékpárhelyes kocsinál 🚲 jelöléssel.
- Keskeny kijelzőn (≤ 700 px) a függőleges (`layoutPathVertical`) rajz jelenik meg.

> Demó szerkezet (régi, osztály-alapú): `data/demo-reservation.json`.

## Fontos, őszinte korlátok

- A „foglalt" itt **foglalási** állapot (reservation), nem élő fizikai jelenlét.
- A token rövid életű és a te session-ödhöz kötött – ezért nem is „örökölhető" a felhőbe;
  a kimentett **válasz** viszont statikus, nyugodtan újra betölthető.
- Semmilyen bot-védelmet nem kerülünk meg; az adat a te jogos hozzáférésedből származik.
