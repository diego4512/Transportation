# Vonat-összeállítás néző (külön app)

Önálló kis alkalmazás: egy vonat **teljes összeállítása** (mozdony + kocsik sorrendben),
és egy kocsira kattintva az **ülés-térkép** (zöld = szabad, piros = foglalt). Később
integrálható a bp-transitba vagy a MÁV-folyamatba.

## Mi fut most
- `index.html` + `assets/app.js` + `data/sample-train.js` → **minta-adattal azonnal fut**,
  keretrendszer és backend nélkül. Nyisd meg böngészőben, vagy futtasd:
  ```bash
  cd wagon-viewer && python3 -m http.server 8090
  # majd: http://127.0.0.1:8090/
  ```

## Adatforrások (valós használathoz)
A néző két dolgot vár, amit egy adapter tölt fel a `data/sample-train.js` szerkezetébe:

1. **Kocsi-sorrend + kocsiképek — WagonWeb.**
   A WagonWeb **Cloudflare-védett**, ezért **felhőből nem tölthető le automatikusan**
   (bot-védelmet nem kerülünk meg). A képeket a **saját böngésződből** mentsd le
   (jobbklikk → kép mentése, kíméletesen), tedd a `data/assets/` mappába, és a kocsi
   `image` mezőjébe írd az útvonalat (pl. `"data/assets/bmz.png"`). Ha nincs kép, a néző
   emoji-sziluettet mutat.

2. **Ülésenkénti foglalt/szabad — MÁV.**
   A `GetGraphicalPlaceReservationMap` válaszából képezd le a kocsik `rows/cols/reserved`
   (vagy közvetlen ülés-lista) mezőire. Ezt a **saját, engedélyezett MÁV-hozzáféréseddel**,
   a saját környezetedben hívd (itt az éles API-t nem hívom).

## Adatmodell (egyszerű, adapter-barát)
```js
{ id, name, from, to, date, cars: [
  { kind:"loco", label, sub },
  { kind:"coach", label, travelClass, type, facilities:["bike"|"wheelchair"|"quiet"|...],
    rows, cols, windowCols:[...], reserved:[ülésszámok], image? },
  { kind:"dining", label, type, facilities:["dining"] }  // ülés-térkép nélkül
] }
```

## Integráció később
- A `data/sample-train.js` helyére egy **adapter** kerül, ami:
  - a WagonWeb mentett oldalából kiolvassa a kocsi-sorrendet (lásd `import/`),
  - a MÁV ülés-térkép választ a fenti modellre képezi,
  - és ugyanezt a `window.TRAINS` szerkezetet állítja elő — a néző változatlan marad.

## Őszinte korlátok
- Ez a demó **minta-adaton** fut; a valós adat a te forrásaidból jön.
- A „foglalt" **foglalási** állapot (reservation), nem élő fizikai jelenlét.
- A WagonWeb-letöltés a te böngésződből/engedélyeddel történik, nem innen.
