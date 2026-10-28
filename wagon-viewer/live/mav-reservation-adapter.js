// MÁV élő ülés-térkép adapter
// ----------------------------------------------------------------------------
// Bemenet: egy VALÓDI `GetGraphicalPlaceReservationMap` válasz, amit a felhasználó
// a saját, bejelentkezett böngészőjéből ment ki (jegy.mav.hu → F12 → Network).
// A választ NEM innen (felhőből) kérjük le: a MÁV `GetOfferRequest` és
// `GetGraphicalPlaceReservationMap` hívásokhoz reCAPTCHA v3 → JWT kell a `jwt`
// fejlécben, amit megkerülés nélkül nem lehet előállítani. A referencia-végpontok
// (állomások, kedvezmények, szolgáltatások) ellenben token nélkül is mennek.
//
// A valós válasz szerkezete a `graphical-place-reservation` chunk (olvasható
// forrás) alapján:
//   resp.reservationMap.train = {
//     trainServiceNames: [...],
//     carriages: [{
//        number, carriageNumber, availableSeatsCount,
//        feeCodes:[{serviceCodes:[...], uicCode}],
//        placeServices:[{uicCode, description, uiText:[{language, description}]}],
//        layoutPathVertical, layoutPathHorizontal,   // SVG string
//        seats:[{number, feeCodes:[...]}],
//        compartments:[{placeServices:[...], seats:[{number}]}]
//     }]
//   }
// Egy ülés akkor NEM foglalható (foglalt/tiltott), ha az SVG-ben a
//   <g id="ules_NNN" class="..."> osztálya tartalmazza:
//   seat-disabled | seat-forbidden | bicycleSeat
// Szabad minden más `ules_` csoport.  (seatSelector: g[id^="ules_"])
// ----------------------------------------------------------------------------
(function (root) {
  "use strict";

  // uicCode → piktogram a nézőhöz (placeServices alapján)
  var UIC_FAC = {
    "52": "quiet",      // csendes szakasz
    "10": "family",     // családi
    "11": "family",
    "106": "bike",      // kerékpár
    "107": "wheelchair",// mozgáskorlátozott
    "108": "wheelchair",
    "B": "power"        // konnektor (ha szerepel)
  };

  // Egy SVG-réteg ülés-csoportjainak kiolvasása: {number, reserved, cls}
  function parseSeatsFromSvg(svg) {
    if (!svg || typeof svg !== "string") return [];
    var out = [];
    // <g ... id="ules_123" ... class="...">  (az attribútumok sorrendje változhat)
    var re = /<g\b[^>]*\bid="ules_(\d+)"[^>]*>/gi;
    var m;
    while ((m = re.exec(svg)) !== null) {
      var tag = m[0];
      var num = m[1];
      // csoport/szekció jelölőket kihagyjuk (a kliens seatSelectora is kizárja)
      if (/csoport|szekcio/i.test(tag)) continue;
      var clsMatch = tag.match(/class="([^"]*)"/i);
      var cls = clsMatch ? clsMatch[1] : "";
      var reserved = /\bseat-disabled\b|\bseat-forbidden\b|\bbicycleSeat\b/i.test(cls);
      out.push({ no: Number(num), reserved: reserved, cls: cls });
    }
    // duplikátumok (ha több rétegen szerepel) → egy példány számonként
    var seen = {};
    return out.filter(function (s) {
      if (seen[s.no]) return false;
      seen[s.no] = 1;
      return true;
    });
  }

  // placeServices → facilities tömb a nézőhöz
  function facilitiesFromCarriage(car) {
    var facs = {};
    (car.placeServices || []).forEach(function (ps) {
      var f = UIC_FAC[String(ps.uicCode)];
      if (f) facs[f] = 1;
    });
    (car.feeCodes || []).forEach(function (fc) {
      var f = UIC_FAC[String(fc.uicCode)];
      if (f) facs[f] = 1;
    });
    return Object.keys(facs);
  }

  // Telítettség-szín a MÁV logika szellemében (szabad helyek aránya)
  //   zöld = sok szabad, narancs = közepes, piros = kevés/0
  function fullnessOf(freeCount, total) {
    if (total <= 0 || freeCount == null) return { level: 0, color: "#9ca3af", label: "nincs adat" };
    var ratio = freeCount / total;
    if (freeCount <= 0) return { level: 4, color: "#dc2626", label: "megtelt" };
    if (ratio < 0.15) return { level: 4, color: "#dc2626", label: "nagy telítettség" };
    if (ratio < 0.45) return { level: 3, color: "#f59e0b", label: "közepes telítettség" };
    return { level: 2, color: "#16a34a", label: "alacsony telítettség" };
  }

  // Fő leképezés: valódi válasz → néző-modell
  function mavReservationMapToTrain(resp, meta) {
    meta = meta || {};
    var train =
      (resp && resp.reservationMap && resp.reservationMap.train) ||
      (resp && resp.train) ||
      resp;
    if (!train || !train.carriages) {
      throw new Error("Nem találom a reservationMap.train.carriages mezőt a válaszban.");
    }

    var cars = train.carriages.map(function (car, i) {
      var num = car.number != null ? car.number : (car.carriageNumber != null ? car.carriageNumber : i + 1);
      var svg = car.layoutPathHorizontal || car.layoutPathVertical || "";
      var seats = parseSeatsFromSvg(svg);

      // ha az SVG nem adott ülést, essünk vissza a seats[] tömbre (státusz nélkül)
      if (!seats.length && Array.isArray(car.seats)) {
        seats = car.seats.map(function (s) {
          return { no: Number(s.number), reserved: s.reserved === true || s.isReserved === true || s.isAvailable === false, cls: "" };
        });
      }

      var total = seats.length;
      var reservedNos = seats.filter(function (s) { return s.reserved; }).map(function (s) { return s.no; });
      var free = (car.availableSeatsCount != null && car.availableSeatsCount >= 0)
        ? car.availableSeatsCount
        : (total - reservedNos.length);
      var full = fullnessOf(free, total);

      return {
        kind: total > 0 ? "coach" : "other",
        number: num,
        label: String(num),
        type: (car.carriageType || car.type || "").toString(),
        facilities: facilitiesFromCarriage(car),
        availableSeatsCount: free,
        total: total,
        reserved: reservedNos,        // foglalt ülésszámok
        seats: seats,                 // teljes lista (sorrend az SVG szerint)
        fullness: full,               // {level,color,label}
        svgHorizontal: car.layoutPathHorizontal || "",
        svgVertical: car.layoutPathVertical || ""
      };
    });

    return {
      id: meta.id || "LIVE",
      name: meta.name || (train.trainName || ("Vonat " + (meta.trainId || ""))),
      from: meta.from || train.startStationName || "",
      to: meta.to || train.endStationName || "",
      date: meta.date || train.travelDate || "",
      services: train.trainServiceNames || [],
      cars: cars,
      _live: true
    };
  }

  var api = {
    mavReservationMapToTrain: mavReservationMapToTrain,
    parseSeatsFromSvg: parseSeatsFromSvg,
    fullnessOf: fullnessOf
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MAVAdapter = api;
})(typeof window !== "undefined" ? window : this);
