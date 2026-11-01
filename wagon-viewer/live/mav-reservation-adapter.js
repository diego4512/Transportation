// MÁV élő ülés-térkép adapter
// ----------------------------------------------------------------------------
// Bemenet: egy VALÓDI `GetGraphicalPlaceReservationMap` válasz, amit a felhasználó
// a saját, bejelentkezett böngészőjéből ment ki (jegy.mav.hu → F12 → Network).
// A választ NEM innen (felhőből) kérjük le: a MÁV `GetOfferRequest` és
// `GetGraphicalPlaceReservationMap` hívásokhoz reCAPTCHA v3 → JWT kell a `jwt`
// fejlécben, amit megkerülés nélkül nem lehet előállítani. A referencia-végpontok
// (állomások, kedvezmények, szolgáltatások) ellenben token nélkül is mennek.
//
// A valós válasz szerkezete (élő mintán ellenőrizve, 204-es vonat, 2026-10-28):
//   resp.reservationMap = { seatCount, train: {
//     number, departure, destination, startTime, arrivalTime,
//     trainServiceNames: [...],
//     carriages: [{
//        number, availableSeatsCount, physicalOrder, sellingOrder,
//        feeCodes:[{uicCode, serviceCodes, graphicalReservationEnabled, imageName}],
//        placeServices:[{uicCode, name, imageName, uiText:[{language, name}]}],
//        layoutPathHorizontal, layoutPathVertical,   // SVG string – lehet üres!
//        seats:[{number, reservation, placePositionService, feeCodes, placeServices}],
//        compartments:[{number, placeServices, seats:[...]}]
//     }]
//   } }
//
// Ülés-állapot: seats[].reservation
//   0 = szabad (darabszáma = availableSeatsCount), 1 = foglalt, 2 = nem foglalható
// Az SVG-ben minden <g id="ules_NNN"> alatt négy réteg van, ebből a kliens
// mindig egyet mutat: foglalhato | foglalt | kijelolt | nem_foglalhato.
// Az adapter a csoportra `data-state` attribútumot ír, a CSS ez alapján
// rejti el a nem odaillő rétegeket.
// Régebbi/demó SVG-nél (rétegek nélkül) a csoport osztálya dönt:
//   seat-disabled | seat-forbidden | bicycleSeat → foglalt.
// ----------------------------------------------------------------------------
(function (root) {
  "use strict";

  // uicCode → piktogram a nézőhöz (placeServices / feeCodes alapján)
  var UIC_FAC = {
    "52": "quiet",      // csendes szakasz
    "10": "family",     // családi
    "11": "family",
    "106": "bike",      // kerékpár
    "OB": "bike",       // kerékpárhely-foglalás (díjkód)
    "107": "wheelchair",// mozgáskorlátozott
    "108": "wheelchair",
    "05": "table"       // asztalnál
  };

  var RESERVATION_STATE = { 0: "free", 1: "reserved", 2: "unavailable" };

  var POSITION = {
    positionOfSeatSeatWindow: "ablak melletti",
    positionOfSeatSeatMiddle: "középső hely",
    positionOfSeatSeatGangway: "folyosó melletti"
  };

  function seatKey(no) { return String(Number(no)); }

  function huName(ps) {
    var t = (ps.uiText || []).filter(function (u) { return u.language === "hu"; })[0];
    return (t && t.name) || ps.name || "";
  }

  // Egy SVG-réteg ülés-csoportjainak kiolvasása: {no, reserved, cls}
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

  // Az SVG ülés-csoportjaira data-state kerül (free | reserved | unavailable)
  function annotateSvg(svg, stateByNo) {
    if (!svg) return "";
    return svg.replace(/<g\b([^>]*\bid="ules_(\d+)"[^>]*)>/gi, function (tag, attrs, num) {
      var st = stateByNo[seatKey(num)];
      if (!st) {
        var cls = (attrs.match(/class="([^"]*)"/i) || [])[1] || "";
        st = /\bseat-disabled\b|\bseat-forbidden\b|\bbicycleSeat\b/i.test(cls) ? "reserved" : "free";
      }
      return '<g' + attrs + ' data-state="' + st + '" data-seat="' + num + '">';
    });
  }

  // placeServices → facilities tömb a nézőhöz
  function facilitiesFromCarriage(car) {
    var facs = {};
    function add(list) {
      (list || []).forEach(function (x) {
        var f = UIC_FAC[String(x.uicCode)];
        if (f) facs[f] = 1;
      });
    }
    add(car.placeServices);
    add(car.feeCodes);
    (car.seats || []).forEach(function (s) { add(s.placeServices); add(s.feeCodes); });
    return Object.keys(facs);
  }

  function isBikeCarriage(car) {
    return (car.feeCodes || []).some(function (fc) {
      return fc.uicCode === "OB" || /bike/i.test(fc.imageName || "");
    });
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

  function seatFromApi(s, compartmentNo, bike, svgState) {
    var state = RESERVATION_STATE[s.reservation];
    if (!state && (s.reserved === true || s.isReserved === true || s.isAvailable === false)) state = "reserved";
    if (!state) state = svgState[seatKey(s.number)] || "free";
    return {
      no: Number(s.number),
      label: String(s.number),
      state: state,
      reserved: state !== "free",
      position: POSITION[s.placePositionService] || "",
      compartment: compartmentNo || "",
      bike: bike || (s.feeCodes || []).some(function (fc) { return fc.uicCode === "OB"; }),
      services: (s.placeServices || []).map(huName).filter(Boolean),
      cls: ""
    };
  }

  function timeOf(iso) {
    var m = /T(\d\d:\d\d)/.exec(iso || "");
    return m ? m[1] : "";
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
      var bike = isBikeCarriage(car);
      var rawSvg = car.layoutPathHorizontal || car.layoutPathVertical || "";
      var svgSeats = parseSeatsFromSvg(rawSvg);
      var svgState = {};
      svgSeats.forEach(function (s) { svgState[seatKey(s.no)] = s.reserved ? "reserved" : "free"; });

      // 1) elsődleges forrás: compartments[] / seats[] a reservation kóddal
      var seats = [];
      if (Array.isArray(car.compartments) && car.compartments.length) {
        car.compartments.forEach(function (c) {
          (c.seats || []).forEach(function (s) { seats.push(seatFromApi(s, c.number, bike, svgState)); });
        });
      } else if (Array.isArray(car.seats)) {
        seats = car.seats.map(function (s) { return seatFromApi(s, "", bike, svgState); });
      }

      // 2) ha nincs ülés-lista, de van SVG (régi/demó formátum): az osztályból
      if (!seats.length && svgSeats.length) {
        seats = svgSeats.map(function (s) {
          return { no: s.no, label: String(s.no), state: s.reserved ? "reserved" : "free", reserved: s.reserved,
                   position: "", compartment: "", bike: false, services: [], cls: s.cls };
        });
      }

      var stateByNo = {};
      seats.forEach(function (s) { stateByNo[seatKey(s.no)] = s.state; });

      var total = seats.length;
      var reservedNos = seats.filter(function (s) { return s.state === "reserved"; }).map(function (s) { return s.no; });
      var unavailableNos = seats.filter(function (s) { return s.state === "unavailable"; }).map(function (s) { return s.no; });
      var counted = seats.filter(function (s) { return s.state === "free"; }).length;
      var free = (car.availableSeatsCount != null && car.availableSeatsCount >= 0)
        ? car.availableSeatsCount
        : counted;

      var typeNames = (car.placeServices || []).map(huName).filter(Boolean);
      var type = bike ? "Kerékpárhely" : (typeNames.join(", ") || (car.carriageType || car.type || "").toString());

      return {
        kind: bike ? "bike" : (total > 0 ? "coach" : "other"),
        number: num,
        label: String(num),
        type: type,
        facilities: facilitiesFromCarriage(car),
        availableSeatsCount: free,
        countedFree: counted,         // seats[]-ből számolt szabad (ellenőrzéshez)
        total: total,
        reserved: reservedNos,        // foglalt ülésszámok
        unavailable: unavailableNos,  // nem foglalható ülésszámok
        seats: seats,
        fullness: fullnessOf(free, total),
        physicalOrder: car.physicalOrder,
        sellingOrder: car.sellingOrder,
        svgHorizontal: annotateSvg(car.layoutPathHorizontal || "", stateByNo),
        svgVertical: annotateSvg(car.layoutPathVertical || "", stateByNo)
      };
    });

    var date = (train.startTime || "").slice(0, 10);
    return {
      id: meta.id || "LIVE",
      name: meta.name || train.trainName || (train.number ? train.number + ". sz. vonat" : "Vonat"),
      from: meta.from || train.departure || train.startStationName || "",
      to: meta.to || train.destination || train.endStationName || "",
      departureTime: timeOf(train.startTime),
      arrivalTime: timeOf(train.arrivalTime),
      date: meta.date || date || train.travelDate || "",
      services: train.trainServiceNames || [],
      cars: cars,
      _live: true
    };
  }

  var api = {
    mavReservationMapToTrain: mavReservationMapToTrain,
    parseSeatsFromSvg: parseSeatsFromSvg,
    annotateSvg: annotateSvg,
    fullnessOf: fullnessOf
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MAVAdapter = api;
})(typeof window !== "undefined" ? window : this);
