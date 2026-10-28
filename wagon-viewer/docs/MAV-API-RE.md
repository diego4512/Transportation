# MÁV jegyértékesítő API – visszafejtési térkép (élő PROD + kliens-bundle)

> Engedélyezett, saját felhasználásra készült elemzés. Az adat a nyilvánosan kiszolgált
> kliens-kódból és a felhasználó engedélyével, **csak-olvasó** élő hívásokból származik.
> Írási végpontokat (rendelés/fizetés/foglalás/regisztráció) NEM hívtunk.

## Alapok
- **API base:** `https://jegy-a.mav.hu/IK_API_PROD`  · dev: `http://je_ik_rel.mav-start.hu/IK_API_DEV` · staging `je-ik-st.mav.hu` (innen elérhetetlen)
- **Verzió:** apiVersion `4.14.0.9`, backend env `PROD`, képszerver `https://jegy.mav.hu/`
- **Hívásmód:** minden végpont **POST**, JSON törzs, `Content-Type: application/json`, `Language: hu|en` fejléc.
- **Bot-védelem:** a kliens `enabledRecaptchaJWTCheck:true` esetén reCAPTCHA v3 → JWT-t fűz a kérésekhez (`getJWT("<ctrl>/<method>")`), DE **a szerver nem kényszeríti ki**: token nélkül is üzleti hibát/adatot ad (nem 401/403). Tehát a referencia-/olvasó végpontok token nélkül működnek.
- **Hiba-formátum:** vagy `"<Method> - kötelező paraméterek hiánya: [...]"` (400), vagy .NET kivétel-objektum (`{message, hResult, ...}`, 500). A hiányzó-paraméter üzenet **kilistázza a kötelező mezőket** – ez a fő visszafejtési fogás.

## Kontrollerek (90 végpont)
`ProfileApi`(30) · `OfferRequestApi`(24) · `OrderAndPaymentApi`(8) · `SocialLoginApi`(6) · `BaseDataApi`(6) · `InformationApi`(5) · `CompensationApi`(5) · `DocumentApi`(4) · `UserFeedbackApi`(1) · `RefundApi`(1)

## Csak-olvasó referencia-végpontok (élőben igazolt)
| Végpont | Törzs | Válasz / megjegyzés |
|---|---|---|
| `BaseDataApi/GetSwVersions` | `{}` | verzió, `maintenance`, imgServerBaseUrl |
| `BaseDataApi/GetParams` | `{}` | rendszerkonfig: timeoutok, max utas (12), kupon-regex `^[0-9A-Z]{12}$`, társaságok, `enabledRecaptchaJWTCheck:true` |
| `BaseDataApi/GetCurrencies` | `{}` | HUF (alap), EUR |
| `BaseDataApi/GetClientLogLevel` | `{}` | `0` |
| `BaseDataApi/GetGraphInfo` | `{}` | menetrendi időszak: 2026-10-26 → 2027-04-25 |
| `BaseDataApi/GetTaxiStations` | `{}` | taxi-állomások + cacheHash |
| `BaseDataApi/GetExchangeRate` | — | kell: `Key` |
| `InformationApi/GetTrainNumbers` | `{}` | élő vonatszám-lista, pl. `["555","3032","7407",...]` |
| `InformationApi/GetWarningMessages` | `{}` | **élő forgalmi hírek** (`messages:[]` ha nincs) |
| `InformationApi/GetTimetable` | — | kell: `type` (sztring-enum, **pontos érték a fel nem töltött keresési chunkban**) + startStationCode/endStationCode/travelDate |
| `OfferRequestApi/GetStationList` | `{}` | **53 654 állomás** (code/baseCode/név/ország) |
| `OfferRequestApi/GetCountryList` | `{}` | országlista |
| `OfferRequestApi/GetCountyList` | `{}` | megyék |
| `OfferRequestApi/GetModalities` | `{}` | ajánlattípus→modalitás (`100=Vasút`…) |
| `OfferRequestApi/GetOfferKindElements` | `{}` | **OfferKind enum**: InternalTicket, InternalSeasonTicket, InternationalTicket, InternationalSeasonTicket, StartKlubKard, AdministrationCharge, StationServices, … |
| `OfferRequestApi/GetCustomersAndDiscounts` | `{"offerKind":"InternalTicket"}` | **utastípusok + kedvezmények** (pl. „Kisgyerek (0-3) key 110", maxAge/minAge, discountProps) |
| `OfferRequestApi/FrequentDiscountList` | `{}` | gyakori kedvezmények (üres volt) |
| `OfferRequestApi/GetSeasonTicketTypes` | — | kell egy `value`/source (bérlettípus) |
| `OfferRequestApi/GetSeasonTicketValidities` | — | kell: `SeasonTicketId` |
| `OfferRequestApi/GetPreOrderMaxDays` | — | kell: `OfferKindName` |
| `OfferRequestApi/GetOfferRequestScrollingIntervalInHours` | — | kell: `OfferKind` |
| `OfferRequestApi/GetOfferTouchedStations` | — | kell: `StartStationCode, EndStationCode, TrainSchedulerId, StartDate, PlannedStartTime, PlannedEndTime` |
| `OfferRequestApi/GetOfferMapImage` | — | mint GetOfferTouchedStations (útvonal-térkép kép) |
| `ProfileApi/GetRegistrationRegExp` | `{}` | regisztrációs mező-regexek (pl. keresztnév `^(?=.{2,75}$).*`) |
| `ProfileApi/GetPublicPlaceTypes` | `{}` | érték-lista elemek |
| `DocumentApi/AktualisDokumentumLista` | `{}` | aktuális dokumentumok (ÁSZF v633, html/pdf URL: doktar.mavcsoport.hu/node/633) |

## Kulcs-állomáskódok
- Budapest-Nyugati `005510033` (base 269) · Budapest-Keleti `005510017` · Budapest-Déli `005501016` · Debrecen `005513912` (base 1701)

## Az ajánlat- és foglalási lánc (ami a seat-maphez + fullness-hez kell)
A `fullness` (telítettség) és az ülés-térkép az **ajánlat-folyamatból** jön, ami **állapotfüggő**:

1. **Guest-session** → `UserSessionId` fejléc kötelező (`GetOfferRequest` enélkül: „UserSessionId nem található a fejlécben!"). A session a `ProfileApi/GuestCustomerRegistration` körül jön létre (ez **írás + email**, ezért itt nem hívtuk).
2. `OfferRequestApi/GetOfferRequest` (UserSessionId + `searchData{startStation,endStation,passengers,travelClasses,selectedServices,isOneWayTicket,departureDate}`) → ajánlatok, bennük **`trainSchedulerId`, `offerIdentity`, `travelClasses[] → fullness/szabadHelyAllapot`**.
3. `OfferRequestApi/GetServicesAndSearchServices` (kell: `OfferKind`) → szolgáltatások, foglalási módok, `reservationKind`.
4. Kötelező helyjegynél: `GetPlaceReservationParams` (kell: `UserEmail`, `PlaceTicketSerialized`) → paraméterek, majd
5. `GetGraphicalPlaceReservationMap` (requestModel: `startStationCode,endStationCode,travelDate,trainId,offerIdentity,reservationKind,…`) → **SVG kocsi-ülés-térkép, ülésenként foglalt/szabad**.

## Telítettség (`fullness`) – visszafejtett szemantika
- Az **ajánlat-válaszban**, vonat-/kocsiosztály szinten: `fullness` (szám) + `szabadHelyAllapot` + `fullnessStatus`.
- Szintek (kliens-fordítás): `fullness1`=„Telítettség:" · `fullness2`=**alacsony** (zöld) · `fullness3`=**közepes** (narancs) · `fullness4`=**nagy** (piros).
- Megjelenítő: `app-train-line-fullness` / `fullness-indicator` (zöld/`orange-2`/`red`).
- `getNeedToShowFullness`: jellemzően nem-kötelező-helyjegyes vonatoknál mutatja (a kötelező-helyjegyeseknél a per-ülés térkép van).
- Nincs adat: „Nincs telítettségi adat".

## Írási / érzékeny végpontok (NEM hívva)
- `OrderAndPaymentApi/*` (CreateOrder, GetEReceipt, GetTransactionStatus, PartPayment, token…), `RefundApi/CreateRefundOrder`, `CompensationApi/*` (kártérítés), `ProfileApi/*` írások (regisztráció, személyes/számlázási adatok, GuestCustomerRegistration, GetJWT, GetUserToken…), `SocialLoginApi/*`, `UserFeedbackApi/LeaveFeedBack`, `OfferRequestApi/PlaceTicketsReservation` + `GiveUpPlaceTicketsReservation`, `DocumentApi/DokumentumVerzioElfogadas`.

## Mi hiányzik az élő seat-map + fullness-hez (innen)
- A **pontos `searchData` offer-modell** és a `GetTimetable` `type` enum a **fel nem töltött keresési/ajánlat chunkban** van.
- A lánc **guest-session-t** (UserSessionId) igényel, ami írással jár (GuestCustomerRegistration) + email – ezt külön jóváhagyással, a megfelelő adatokkal lehet elindítani.
- Megoldás: töltsd fel a keresési/ajánlat chunkot **vagy** egy valós `GetOfferRequest` + `GetGraphicalPlaceReservationMap` payloadot a böngésződből → innen, token nélkül replikálható.

---

# MÉLY KERESZTREFERENCIA (élő API ↔ összes feltöltött bundle)

## A 54 válasz-modell (kliens type-guardokból, `TypeGuard for response 'X'`)
BaseDataApiModel, SwVersionsResponseModel, GetParamsResponseModel, GetCurrenciesResponseModel, GetClientLogLevelResponseModel, GetGraphInfoResponseModel, GetExchangeRateResponseModel, GetTaxiStationsResponseModel,
StationApiModel, CountryApiModel, CityAndPostalCodesApiModel, ModalityApiModel, PublicPlaceTypeApiModel,
OfferRequestResponseModel, ServicesResponseModel, CanPutToCartResponseModel, CheckCuponCodeResponseModel, CustomerTypesAndDiscountsResponseModel, FrequentDiscountsResponseModel, MapImageResponseModel, TouchedStationsResponseModel,
PlaceReservationParamsResponseModel, TicketPlaceReservationResponseModel,
TimeTableResponseModel, SearchTrainNumberResponseModel, WarningMessagesResponseModel,
AktualisDokumentumListaResponseModel, ElfogadandoDokumentumListaResponseModel,
GetJWTResponseModel, GetUserTokenResponseModel, UserRegistrationResposeModel, RegistrationRegularExpression,
BillingDataResponseModel, AddUserBillingDataResponseModel, UserPersonalDatasResponseModel, HPTDataResponseModel,
CurrentFavouriteDiscountListResponseModel, PreviousPurchasesResponseModel, PreviousPurchaseDetailsResponseModel, GetOpenOrderResponseModel,
OrderCreateResponseModel, PartPaymentResponseModel, TransactionStatusResponseModel, TokenPaymentToolListResponseModel, GetCertificatesImagesResponseModel, GetEReceiptResponseModel, CreateRefundOrderResponseModel,
SocialLogin, SocialRegistration, ConnectSocialAccount, DisconnectSocialAccount, GetSocialAccountsConnections, ModifySocialRegistrationData,
SetOfferInternetPassengersResponseModel.

## Rekonstruált adatmodell-szókincs (type-guardok mező-gyakorisága alapján)
- **Közös boríték:** `maintenance` (minden válaszban), `cacheHash`.
- **Állomás/útvonal:** `startStation`, `endStation`, `distance`, `startTrack`, `startTimeZone`, `closedTrackWay`, `isInternational`, `code`, `name`, `foreignNames`.
- **Ajánlat/vonat:** `offerIdentity` (×29), `travelClasses` (×20), `trainId`, `trainSchedulerId`, `train`, `travelTime`, `offerValidFrom`, `offerKind`.
- **Telítettség/hely:** `reservationMap` (×20), `reservationKind` (×10), `szabadHelyAllapot` (×8), **`fullness`** (×5), `availableSeatsCount`, `placeServices`, `canChangeSelection`.
- **Utas:** `passengerId`, `szuletesiDatum`, `discounts`, `namedAdditionals`, `customerType`, `seasonTicket`, `csoportAzon`.
- **Ár:** `amount`, `amountInDefaultCurrency`, `price`, `tarifa`.

## Rekonstruált KÉRÉS-modellek (élő „kötelező mező" hibákból + kód)
| Végpont | Kötelező / ismert mezők |
|---|---|
| `GetOfferRequest` | **`UserSessionId` fejléc** + `searchData{startStation,endStation,passengers[],travelClasses,selectedServices,isOneWayTicket,departureDate}` |
| `GetServicesAndSearchServices` | `OfferKind` |
| `GetOfferTouchedStations` / `GetOfferMapImage` | `StartStationCode, EndStationCode, TrainSchedulerId, StartDate, PlannedStartTime, PlannedEndTime` |
| `GetPlaceReservationParams` | `UserEmail, PlaceTicketSerialized` |
| `GetGraphicalPlaceReservationMap` | `startStationCode, endStationCode, travelDate, trainId, offerIdentity, reservationKind` (+ offer/utas kontextus) |
| `GetCustomersAndDiscounts` / `GetPreOrderMaxDays` / `GetOfferRequestScrollingIntervalInHours` | `OfferKind` |
| `GetSeasonTicketValidities` | `SeasonTicketId` |
| `GetTimetable` | `type` (sztring-enum, **érték a fel nem töltött keresési chunkban**), `startStationCode, endStationCode, travelDate` |
| `GetExchangeRate` | `Key` |

## Megerősített enumok / kódtáblák
- **OfferKind:** InternalTicket, InternalSeasonTicket, InternationalTicket, InternationalSeasonTicket, StartKlubKard, AdministrationCharge, StationServices, …
- **Modalitás:** `100 = Vasút` (…)
- **Telítettség (fullness):** 1=„Telítettség:" · 2=alacsony(zöld) · 3=közepes(narancs) · 4=nagy(piros) · nincs adat.
- **Pénznem:** HUF (alap), EUR.
- **Dokumentumkódok:** ASZF, ADATKEZELESI_TAJ, NEMZ_SZERZODESES_FELT.

## Még nyitott (csak a hiányzó chunk/payload zárja le)
- `GetTimetable` `type` pontos enum-értéke.
- A teljes `searchData` offer-modell (beágyazott objektum-alakok).
- A `GetGraphicalPlaceReservationMap` válasz pontos SVG/mezőszerkezete (ehhez egy valós válasz kell).

---

# ÉLES ELLENŐRZÉS (2026-10-28) – bizonyított tények

Ezeket **élesben**, a konténerből hívva igazoltam (read-only), majd a bundle
`graphical-place-reservation` chunkjából (olvasható forrás) kiegészítve.

## 1) Helyes útvonal: `/IK_API_PROD/api/...`
A korábbi 404-ek oka: hiányzott az `/api/` szakasz. Helyesen:
`https://jegy-a.mav.hu/IK_API_PROD/api/<Controller>/<Method>`.

## 2) Token NÉLKÜL is működő (referencia) végpontok – HTTP 200, éles
- `OfferRequestApi/GetModalities` `{}` → modalitások (100=Vasút…)
- `OfferRequestApi/GetOfferKindElements` `{}` → OfferKind enum
- `OfferRequestApi/GetStationList` `{}` → **~53 ezer** állomás (code/baseCode/név/ország…)
  - Budapest-Nyugati: `code 005510033`, `baseCode 269`, id 58
  - Debrecen: `code 005513912`, `baseCode 1701`, id 3751
- `OfferRequestApi/GetCustomersAndDiscounts` `{"offerKind":"InternalTicket"}` → utastípusok+kulcsok
  - **Felnőtt kulcs: `HU_44_025-065`** (25–65). További: 110=Kisgyerek(0-3),
    HU_109_003-006, HU_31_006-014, HU_107_014-018_20240301, HU_107_018-025,
    HU_108_065-199 (nyugdíjas), KEREKPAR_106, KUTYA_105.
- `OfferRequestApi/GetServicesAndSearchServices` `{"offerKind":"InternalTicket"}`
  - 14 **kereső-szolgáltatás** (mind opcionális szűrő), mezők: `id, code, value, megnevezes`.
    Pl. 32=IK_CSAK_FELARAK „Csak helyjegyet", 1=ATSZALLAS_NELKUL, 2=HELYBIZTOSITAS_NELKUL,
    31=HELYBIZTOSITASSAL, 33=CSAK_HALO, 34=CSAK_FEKVO. Alap kereséshez üres `[]` is elég.

## 3) A fal: `GetOfferRequest` + `GetGraphicalPlaceReservationMap` reCAPTCHA-JWT kapu
- `UserSessionId` fejléc **kliens-generált GUID** (nincs szerver-oldali session-init):
  a bundle interceptora `sessionStorage.getItem("sessionId")` hiányában `Object(xr.c)()`
  (UUID) értéket generál és tárol. Fejlécben: `headers.set("UserSessionId", <guid>)`.
  → GUID-dal a „UserSessionId nem található" hiba **eltűnik**.
- Ezután viszont a szerver **HTTP 500 `Object reference not set to an instance of an object.`**
  választ ad **minden** törzs-variációra. Ok: a `GetOfferRequest` a `jwt` fejlécet várja.
- A `jwt` fejléc értéke: `requestNewJWT(e)` → `recaptchaV3Service.execute("offerrequest/GetOfferRequest")`
  → `ResponseToken` → `ProfileApi/GetJWT({requestModel:{ResponseToken:<token>}})` → JWT,
  amit `headers.set("jwt", <jwt>)` csatol. **reCAPTCHA v3 kötelező.**
- **Következtetés:** az ülés-térkép lánc reCAPTCHA v3 tokenhez kötött, amit böngésző és
  valódi reCAPTCHA nélkül nem lehet előállítani. A bot-védelmet **nem kerüljük meg**
  (üres ResponseToken küldését a rendszer blokkolja). → élő seat-map a **felhasználó
  böngészőjéből kimentett válaszból** (lásd `live/ELO-ADATOK-UTMUTATO.md`).

## 4) A seat-map válasz PONTOS modellje (olvasható chunk: `b5834f7f-1-graphical-place-reservation.js`)
```
reservationMap.train = {
  trainServiceNames: [ ... ],
  carriages: [ {
     number, carriageNumber, availableSeatsCount,
     feeCodes: [ { serviceCodes:[...], uicCode } ],
     placeServices: [ { uicCode, description, uiText:[{language,description}] } ],
     layoutPathVertical,  layoutPathHorizontal,   // teljes SVG string
     seats: [ { number, feeCodes:[...] } ],
     compartments: [ { placeServices:[...], seats:[{number}] } ]
  } ]
}
```
- Ülés-csoport az SVG-ben: `<g id="ules_NNN">` (selector: `g[id^="ules_"]:not([id*=csoport],[id*=szekcio])`).
- **Foglalt/nem foglalható**, ha az osztály tartalmazza: `seat-disabled | seat-forbidden | bicycleSeat`.
- Szolgáltatás-kódok (placeServices.uicCode): **52=csendes**, 10=családi, 106=kerékpár, 107/108=akadálymentes.
- Kocsi-választás: `car-<number>` DOM id; `availableSeatsCount < 0` → letiltott kocsi.
- Mobil/asztali kép: `isVerticalSize()` (<650px) → `layoutPathVertical`, egyébként `layoutPathHorizontal`.

## 5) Mi épült ebből
- `wagon-viewer/live/mav-reservation-adapter.js` – valódi választ → néző-modellre képez
  (SVG-ből foglalt/szabad, `availableSeatsCount` → telítettség zöld/narancs/piros, piktogramok).
- `wagon-viewer/live.html` – beilleszt/betölt egy valódi választ, a MÁV **saját SVG**-jét rendereli.
- `wagon-viewer/data/demo-reservation.json` – a pontos szerkezet mintája (a „Demó adat" gomb ezt tölti).
