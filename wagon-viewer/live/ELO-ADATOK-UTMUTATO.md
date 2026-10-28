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

A `GetGraphicalPlaceReservationMap` válasz így néz ki (a kliens-forrásból visszafejtve):

```
{ "reservationMap": { "train": {
    "trainServiceNames": ["InterCity", ...],
    "carriages": [
      {
        "number": 21,
        "availableSeatsCount": 22,
        "placeServices": [ { "uicCode": "52", ... } ],   // 52=csendes, 106=bicikli, 107/108=akadálymentes
        "layoutPathHorizontal": "<svg> ... <g id=\"ules_5\" class=\"seat-disabled\">...</g> ... </svg>",
        "layoutPathVertical":   "<svg> ... </svg>",
        "seats": [ { "number": "5", "feeCodes": [...] } ]
      }
    ]
} } }
```

- A **foglalt** ülést az SVG-ben a `<g id="ules_NNN">` elem **osztálya** jelzi:
  `seat-disabled` / `seat-forbidden` / `bicycleSeat` → foglalt/nem foglalható.
  Minden más `ules_` csoport **szabad**.
- Ha nincs SVG a válaszban, az oldal a `seats[]` tömbből rajzol rácsot.

> Minta a pontos szerkezetre: `data/demo-reservation.json` (a „Demó adat" gomb ezt tölti).

## Fontos, őszinte korlátok

- A „foglalt" itt **foglalási** állapot (reservation), nem élő fizikai jelenlét.
- A token rövid életű és a te session-ödhöz kötött – ezért nem is „örökölhető" a felhőbe;
  a kimentett **válasz** viszont statikus, nyugodtan újra betölthető.
- Semmilyen bot-védelmet nem kerülünk meg; az adat a te jogos hozzáférésedből származik.
