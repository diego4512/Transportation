// REA Web Analyzer – magyar eszköz-metaadatok
// Minden adat a REA tényleges product-catalog.json-jából és CLI-jából származik;
// itt csak a magyar nevek/leírások, a kategória- és a weboldalra-alkalmazhatóság
// metaadatai élnek. Semmit nem állítunk működőnek, amíg a `rea capabilities`
// meg nem erősíti (lásd a generátort).

/**
 * Családok (a REA "surface"/family szerint) → magyar kategória + weboldalra
 * való alkalmazhatóság alapértelmezése. A `url` mező jelentése:
 *   "yes"         – egy megadott weboldal URL-re közvetlenül értelmezhető,
 *   "conditional" – weboldalra csak korábbi bizonyíték / második bemenet esetén,
 *   "no"          – más céltípus (bináris/APK/firmware/.NET/macOS/Electron/Node).
 */
export const FAMILIES = {
  direct: {
    category: "Natív kód – közvetlen (disassembler proxy)",
    description:
      "Közvetlen hozzáférés a natív disassembler/decompiler műveletekhez (Ghidra/Hopper/IDA). Bináris célokra való, weboldalra nem.",
    targets: ["Natív bináris (PE/ELF/Mach-O)"],
    url: "no",
  },
  enhanced: {
    category: "Natív kód – kiterjesztett elemzés",
    description:
      "Magasabb szintű natív elemzés: függvény-összegzés, hívási gráf, Obj-C/Swift metaadatok, feature-nyomkövetés.",
    targets: ["Natív bináris (PE/ELF/Mach-O)"],
    url: "no",
  },
  native: {
    category: "Apple/natív provider",
    description:
      "macOS/Apple natív vizsgálat (Mach-O, plist, aláírás, Swift demangling, UI-megfigyelés). macOS gazdagépet igényel.",
    targets: ["Mach-O", "Apple app bundle"],
    url: "no",
  },
  artifact: {
    category: "Artifact (biztonságos kigyűjtés)",
    description:
      "App-bundle artifactok biztonságos kigyűjtése és vizsgálata (storyboard/nib, asset katalógus, keyed archive).",
    targets: ["App bundle", "Apple artifact"],
    url: "no",
  },
  managed: {
    category: ".NET / managed kód",
    description:
      "PE/CLI (.NET) statikus vizsgálat: tagok, aláírások, PInvoke-határok, managed app-gráf.",
    targets: [".NET PE/CLI (.dll/.exe)"],
    url: "no",
  },
  firmware: {
    category: "Firmware",
    description:
      "Firmware-régiók vizsgálata és kigyűjtése (binwalk/unblob). Firmware fájlt igényel.",
    targets: ["Firmware image"],
    url: "no",
  },
  android: {
    category: "Android APK",
    description:
      "APK statikus vizsgálat (JADX): osztályok, metódusok, manifest, referenciák.",
    targets: ["Android APK"],
    url: "no",
  },
  browser: {
    category: "Böngésző / weboldal",
    description:
      "Passzív weboldal-megfigyelés Chrome DevTools Protokollon át: DOM, scriptek, erőforrások, hálózat, bundle-elemzés, képernyőkép, WebMCP felderítés, összehasonlítás.",
    targets: ["Weboldal (http/https)"],
    url: "yes",
  },
  electron: {
    category: "Electron / helyi JS-alkalmazás",
    description:
      "Electron és helyi JavaScript-alkalmazások vizsgálata (file:// oldalak, statikus rekonstrukció, futásidő-egyeztetés).",
    targets: ["Electron app", "Helyi JS alkalmazás"],
    url: "conditional",
  },
  "javascript-runtime": {
    category: "JavaScript futásidő (V8 Inspector)",
    description:
      "Node/Electron V8 Inspector célpontok passzív megfigyelése. Futó Node/Electron inspector-végpontot igényel, nem sima weboldalt.",
    targets: ["Node/Electron V8 Inspector"],
    url: "no",
  },
  application: {
    category: "Alkalmazás-munkafolyamat (JS)",
    description:
      "JavaScript-alkalmazás magasabb szintű munkafolyamatai: exportált scriptek statikus rekonstrukciója, verzió/bundle összehasonlítás, feature- és szemantika-nyomkövetés, rekonstrukciós fedettség.",
    targets: ["Rögzített web/JS bizonyíték", "Exportált scriptek"],
    url: "conditional",
  },
  session: {
    category: "Munkamenet / bizonyíték / összehasonlítás",
    description:
      "Elemzési munkamenet, bizonyíték-csomagok (evidence) kezelése, ismeretlenek (unknowns) rögzítése, rekonstrukció-ellenőrzés, összehasonlítások, folyamat-pillanatképek.",
    targets: ["Evidence bundle", "Munkamenet"],
    url: "conditional",
  },
};

/**
 * Providerek → magyar leírás + külső függőség/licenc megjegyzés.
 * A brief kifejezett kérése: a Ghidra/Hopper/IDA stb. NEM tekinthető
 * automatikusan telepítettnek vagy ingyenesnek.
 */
export const PROVIDERS = {
  binwalk: { note: "Külső eszköz (telepítendő): binwalk.", license: "nyílt forrás" },
  unblob: { note: "Külső eszköz (telepítendő): unblob.", license: "nyílt forrás" },
  ghidra: {
    note: "Külső motor, külön telepítés szükséges (REA Ghidra bridge).",
    license: "ingyenes, nyílt forrás (NSA Ghidra)",
  },
  hopper: {
    note: "Külső motor, külön telepítés + licenc szükséges.",
    license: "kereskedelmi (Hopper)",
  },
  ida: {
    note: "Külső motor, külön telepítés + licenc szükséges (IDA Pro MCP adapter).",
    license: "kereskedelmi (IDA Pro)",
  },
  jadx: { note: "Külső eszköz (telepítendő): JADX headless.", license: "nyílt forrás" },
  "native-macos": {
    note: "macOS gazdagépet és Xcode toolchaint igényel.",
    license: "platformfüggő (macOS)",
  },
  "rea-artifact-graph": { note: "Beépített REA provider.", license: "MIT (REA)" },
  "rea-cdp-browser": {
    note: "Beépített REA provider + Chrome/Chromium böngésző (CDP loopback).",
    license: "MIT (REA) + Chromium",
  },
  "rea-cdp-electron": {
    note: "Beépített REA provider + Electron alkalmazás.",
    license: "MIT (REA)",
  },
  "rea-dotnet-static": { note: "Beépített REA provider (.NET statikus).", license: "MIT (REA)" },
  "rea-dotnet-workflows": { note: "Beépített REA provider (.NET workflow).", license: "MIT (REA)" },
  "rea-javascript-application": { note: "Beépített REA provider (JS app).", license: "MIT (REA)" },
  "rea-javascript-application-workflows": { note: "Beépített REA provider (JS workflow).", license: "MIT (REA)" },
  "rea-javascript-runtime-reconciliation": { note: "Beépített REA provider (JS futásidő-egyeztetés).", license: "MIT (REA)" },
  "rea-playwright-browser-scenario": {
    note: "Beépített REA provider + Playwright/Chromium.",
    license: "MIT (REA) + Chromium",
  },
  "rea-playwright-electron-active": {
    note: "Beépített REA provider + Playwright + Electron.",
    license: "MIT (REA)",
  },
  "rea-v8-inspector": { note: "Beépített REA provider + futó Node/Electron inspector.", license: "MIT (REA)" },
  "rea-web-script-export": { note: "Beépített REA provider (script-export).", license: "MIT (REA)" },
};

/**
 * Eszközönkénti magyar név + leírás. A kulcs a REA MCP-eszköz neve.
 * A leírások a REA saját CLI/katalógus-leírásaiból származnak.
 */
export const TOOLS_HU = {
  // --- direct (natív disassembler proxy) ---
  address_name: ["Cím neve", "Egy elemzési címhez tartozó név lekérése."],
  address_to_file_offset: ["Cím → fájl-offszet", "Elemzési cím feloldása az eredeti fájl bájt-offszetjére."],
  annotate_native_function: ["Natív függvény annotálása", "Függvény-annotációk szerkesztése és frissített elemzés visszaadása."],
  comment: ["Megjegyzés", "Megjegyzés lekérése/kezelése egy címen."],
  current_address: ["Aktuális cím", "A disassembler aktuális címének lekérése."],
  current_document: ["Aktuális dokumentum", "A disassembler aktuális dokumentumának lekérése."],
  current_procedure: ["Aktuális eljárás", "Az aktuális eljárás (függvény) lekérése."],
  goto_address: ["Ugrás címre", "A disassembler kurzorának adott címre állítása."],
  inline_comment: ["Soron belüli megjegyzés", "Soron belüli (inline) megjegyzés lekérése/kezelése."],
  inspect_native_data_type: ["Natív adattípus vizsgálata", "Egy helyreállított adatbázis-típus vagy típusos adatobjektum vizsgálata."],
  inspect_native_instruction: ["Natív utasítás vizsgálata", "Egy natív utasítás vizsgálata dekódolt operandus-tényekkel."],
  inspect_native_load_image: ["Betöltött kép vizsgálata", "Betöltött natív bájtok, forrás-leképezések, relokációk és belépési pont ellenőrzése."],
  list_bookmarks: ["Könyvjelzők listája", "A dokumentum könyvjelzőinek listázása."],
  list_documents: ["Dokumentumok listája", "A betöltött dokumentumok listázása."],
  list_names: ["Nevek listája", "Az elemzett nevek (szimbólumok) listázása."],
  list_procedures: ["Eljárások listája", "Az elemzett eljárások (függvények) listázása."],
  list_segments: ["Szegmensek listája", "A bináris szegmenseinek listázása."],
  list_strings: ["Sztringek listája", "Az elemzett sztringek listázása."],
  next_address: ["Következő cím", "Navigáció a következő címre."],
  prev_address: ["Előző cím", "Navigáció az előző címre."],
  procedure_address: ["Eljárás címe", "Egy eljárás (függvény) címének lekérése."],
  procedure_assembly: ["Eljárás assembly", "Egy eljárás assembly-kódjának lekérése."],
  procedure_callees: ["Eljárás hívottjai", "Az eljárás által hívott függvények (callees) listája."],
  procedure_callers: ["Eljárás hívói", "Az eljárást hívó függvények (callers) listája."],
  procedure_info: ["Eljárás-infó", "Egy eljárás metaadatainak lekérése."],
  procedure_pseudo_code: ["Eljárás pszeudokód", "Egy eljárás decompile-olt pszeudokódja."],
  procedure_references: ["Eljárás-referenciák", "Egy eljárásra mutató referenciák listája."],
  read_bytes: ["Bájtok olvasása", "Pontos provider-memóriabájtok olvasása egy elemzési címen."],
  read_function_instructions: ["Függvény utasításai", "Egy függvény összes utasításának olvasása decompile nélkül."],
  resolve_containing_procedure: ["Tartalmazó eljárás feloldása", "Egy címet tartalmazó eljárás feloldása."],
  resolve_native_call_targets: ["Natív hívási célok feloldása", "Egy statikus natív hívási hely céljainak feloldása."],
  search_procedures: ["Eljárás-keresés", "Keresés az elemzett eljárásnevek között."],
  search_strings: ["Sztring-keresés", "Keresés az elemzett sztringek között."],
  set_address_name: ["Cím nevének beállítása", "Egy elemzési cím nevének beállítása."],
  set_addresses_names: ["Címnevek beállítása (köteg)", "Több cím nevének beállítása egyszerre."],
  set_bookmark: ["Könyvjelző beállítása", "Könyvjelző elhelyezése egy címen."],
  set_comment: ["Megjegyzés beállítása", "Megjegyzés beállítása egy címen."],
  set_current_document: ["Aktuális dokumentum beállítása", "A disassembler aktuális dokumentumának beállítása."],
  set_inline_comment: ["Inline megjegyzés beállítása", "Soron belüli megjegyzés beállítása."],
  unset_bookmark: ["Könyvjelző törlése", "Könyvjelző eltávolítása egy címről."],
  xrefs: ["Kereszthivatkozások", "Korlátozott referenciák (xrefs) listázása egy elemzett címre."],

  // --- enhanced ---
  analyze_function: ["Függvény elemzése", "Egy teljes függvény elemzése bizonyítékkal."],
  analyze_swift_types: ["Swift típusok elemzése", "Swift típusmetaadatok elemzése."],
  batch_decompile: ["Kötegelt decompile", "Több függvény egyidejű decompile-ja."],
  binary_overview: ["Bináris áttekintés", "A bináris magas szintű áttekintése."],
  find_xrefs_to_name: ["Xref névre", "Egy névre mutató kereszthivatkozások keresése."],
  get_call_graph: ["Hívási gráf", "A hívási gráf előállítása."],
  get_objc_classes: ["Obj-C osztályok", "Objective-C osztályok kinyerése."],
  get_objc_protocols: ["Obj-C protokollok", "Objective-C protokollok kinyerése."],
  inspect_native_api: ["Natív API-határ vizsgálata", "Egy natív függvény API-határának rekonstrukciója bizonyítékkal."],
  inspect_native_dispatch_metadata: ["Dispatch-metaadat vizsgálata", "Típusos Objective-C és Swift dispatch-metaadatok vizsgálata."],
  trace_call_path: ["Hívási út nyomkövetése", "Hívási út nyomon követése a kódban."],
  trace_feature: ["Feature nyomkövetése", "Egy literál feature nyomon követése az elemzett referenciákon át."],
  trace_native_ui_action: ["Natív UI-akció nyomkövetése", "Lefordított UI-akció-szelektor nyomon követése a natív kezelőig és közvetlen hívottjaiig."],
  trace_native_values: ["Natív értékek nyomkövetése", "Korlátozott natív def-use és hívási függőségek nyomon követése."],

  // --- native (Apple/macOS) ---
  capture_native_ui_scenario: ["Natív UI-forgatókönyv rögzítése", "Forgatókönyv megfigyelése/futtatása egy pontos natív alkalmazásablakban (macOS)."],
  demangle_swift: ["Swift demangling", "Swift szimbólumok demangling-je Hopper nélkül."],
  inspect_macho: ["Mach-O vizsgálata", "Mach-O bináris vizsgálata Hopper indítása nélkül."],
  inspect_plist: ["plist vizsgálata", "App plist-metaadatok elemzése Hopper nélkül."],
  inspect_signature: ["Aláírás vizsgálata", "Kódaláírás vizsgálata Hopper nélkül."],
  list_architectures: ["Architektúrák listája", "Egy bináris architektúráinak listázása Hopper nélkül."],
  observe_native_ui: ["Natív UI megfigyelése", "Forgatókönyv megfigyelése/futtatása egy pontos natív alkalmazásablakban (macOS)."],

  // --- artifact ---
  decode_interface_builder: ["Interface Builder dekódolása", "Lefordított storyboard/nib archívumok dekódolása app-bundle-ből."],
  extract_artifact: ["Artifact kigyűjtése", "Egy artifact összes szabályos tartalmának biztonságos kigyűjtése."],
  inspect_artifact: ["Artifact vizsgálata", "Egy artifact vizsgálata és az elérhető megfigyelések + következő lépések visszaadása."],
  inspect_asset_catalog: ["Asset katalógus vizsgálata", "Lefordított Apple asset-katalógus metaadatainak vizsgálata."],
  inspect_keyed_archive: ["Keyed archive vizsgálata", "Foundation keyed archive vizsgálata objektum-referencia gráfként."],

  // --- managed (.NET) ---
  compare_managed_members: [".NET tagok összehasonlítása", "Managed PE/CLI tag-leltárak összehasonlítása pontos típus/név/aláírás szerint."],
  import_managed_reconstruction: ["Managed rekonstrukció importálása", "Decompiler által előállított managed rekonstrukció importja a statikus tag-bizonyíték ellen."],
  inspect_managed_artifact: ["Managed artifact vizsgálata", "PE/CLI identitás vizsgálata a célkód betöltése nélkül."],
  inspect_managed_members: ["Managed tagok vizsgálata", "PE/CLI metaadat-tagok, aláírások és CIL-horgonyok vizsgálata betöltés nélkül."],
  inspect_managed_native_boundaries: ["Managed natív határok vizsgálata", "PE/CLI PInvoke és natív implementációs határok vizsgálata."],
  project_managed_application_graph: ["Managed app-gráf vetítése", "Hitelesített managed statikus bizonyíték vetítése alkalmazás-gráffá."],
  verify_managed_native_boundaries: ["Managed natív határok ellenőrzése", "Managed P/Invoke deklarációk ellenőrzése hitelesített natív bizonyíték ellen."],

  // --- firmware ---
  extract_firmware: ["Firmware kigyűjtése", "Kiválasztott firmware-bájtok kigyűjtése, ellenőrzött fájlokkal és eredettel."],
  inspect_firmware_regions: ["Firmware-régiók vizsgálata", "Firmware-aláírásjelöltek vizsgálata kigyűjtés nélkül."],

  // --- android ---
  inspect_android_class: ["Android osztály vizsgálata", "Egy pontos APK-osztály tag-leltárának vizsgálata."],
  inspect_android_method: ["Android metódus vizsgálata", "Egy APK-metódus decompile-ja explicit túlterhelés-választással."],
  inspect_android_package: ["Android csomag vizsgálata", "APK-deklarációk és dekódolt manifest vizsgálata futtatás nélkül."],
  search_android_classes: ["Android osztály-keresés", "APK osztálynevek keresése; üres lekérdezés az összeset leltárazza."],
  trace_android_references: ["Android referenciák nyomkövetése", "Bejövő APK-osztály vagy egyedi-metódus referenciák nyomon követése."],

  // --- browser (WEBOLDAL – elsődleges) ---
  analyze_web_bundle: ["Web bundle elemzése", "Oldal-bundle rögzítése és statikus elemzése: chunk-élek, route- és endpoint-jelöltek, vendor-ujjlenyomatok, statikus WebMCP deklarációk, opcionálisan source-map/eredeti forrás."],
  capture_browser_scenario: ["Böngésző-forgatókönyv rögzítése", "Egy korlátozott Playwright böngésző-forgatókönyv lefuttatása és bizonyíték visszaadása (aktív)."],
  capture_web_screenshot: ["Weboldal képernyőkép", "Egy látható viewport tartalomcímzett PNG-képernyőképe."],
  compare_web_captures: ["Web capture-ök összehasonlítása", "Két normalizált passzív capture vagy rögzített böngésző-forgatókönyv összehasonlítása."],
  compare_web_screenshots: ["Képernyőképek összehasonlítása", "Két önellenőrző PNG-artifact pixel-összehasonlítása külső szolgáltatás nélkül."],
  discover_webmcp_tools: ["WebMCP eszközök felderítése", "Az oldal által deklarált WebMCP eszközök passzív felderítése (séma-összegzéssel)."],
  inspect_web_page: ["Weboldal vizsgálata", "Egy oldal passzív vizsgálata CDP-n át: DOM, akadálymentesség, scriptek, erőforrások, hálózat/konzol metaadatok, WebSocket-méretek, tárolókulcsok."],
  list_browser_targets: ["Böngésző célpontok listája", "Egy kiválasztott loopback CDP-böngésző oldal-célpontjainak listázása, opcionális origin-szűréssel."],
  observe_web_session: ["Web-munkamenet megfigyelése", "Megfigyelési ablak egy felhasználó-vezérelt oldalnavigációra: reload, SPA-navigáció, átirányítás, hiba, életciklus."],

  // --- electron ---
  analyze_javascript_application: ["JS-alkalmazás elemzése", "Helyi JavaScript/Electron alkalmazás statikus rekonstrukciója."],
  capture_electron_scenario: ["Electron-forgatókönyv rögzítése", "Egy korlátozott, saját Electron-forgatókönyv lefuttatása."],
  inspect_electron_page: ["Electron oldal vizsgálata", "Egy Electron file:// oldal passzív vizsgálata."],
  list_electron_targets: ["Electron célpontok listája", "A kiválasztott Electron CDP-végpont helyi file-oldalainak listázása."],
  reconcile_javascript_runtime: ["JS futásidő egyeztetése", "Statikus alkalmazás- és passzív futásidő-bizonyíték egyeztetése."],

  // --- javascript-runtime ---
  list_javascript_runtime_targets: ["JS futásidő célpontok", "Node/Electron V8 Inspector célpontok listázása."],
  observe_javascript_runtime: ["JS futásidő megfigyelése", "Egy pontos Node/Electron Inspector-célpont passzív megfigyelése."],

  // --- application (JS workflow) ---
  build_reconstruction_obligation_ledger: ["Rekonstrukciós kötelezettség-főkönyv", "Determinisztikus, bizonyíték-alapú rekonstrukciós kötelezettség-főkönyv oldal generálása."],
  compare_application_versions: ["App-verziók összehasonlítása", "Két hitelesített JavaScript Application Graph verzió összehasonlítása."],
  compare_javascript_export_shapes: ["JS export-alakok összehasonlítása", "Pontos statikus JS export-visszatérési alakok összehasonlítása végrehajtás nélkül."],
  compare_source_to_bundle: ["Forrás ↔ bundle összehasonlítás", "Committelt történeti forrás összevetése hitelesített alkalmazás-bizonyítékkal."],
  evaluate_reconstruction_coverage: ["Rekonstrukciós fedettség értékelése", "Inline, fail-closed rekonstrukciós fedettség kiértékelése."],
  export_web_scripts: ["Web scriptek exportálása", "Megőrzött weboldal-scriptek exportálása egy üres könyvtárba statikus JS-elemzéshez."],
  trace_application_feature: ["App-feature nyomkövetése", "Egy típusos seed nyomon követése a hitelesített alkalmazás-bizonyítékban."],
  trace_javascript_semantics: ["JS-szemantika nyomkövetése", "Korlátozott statikus szemantikai relációk nyomon követése a hitelesített alkalmazás-bizonyítékban."],

  // --- session ---
  binary_session: ["Bináris munkamenet", "Bináris elemzési munkamenet kezelése."],
  build_call_path: ["Hívási út építése", "Hívási út felépítése a bizonyítékból."],
  capture_process_scenario: ["Folyamat-forgatókönyv rögzítése", "Egy hívó által kiválasztott folyamat-forgatókönyv rögzítése."],
  close_binary: ["Bináris bezárása", "A megnyitott bináris bezárása."],
  compare_artifacts: ["Artifactok összehasonlítása", "Két kanonikus bizonyíték-csomag (artifact) összehasonlítása."],
  compare_bundles: ["Bundle-ök összehasonlítása", "Két bundle összehasonlítása."],
  compare_functions: ["Függvények összehasonlítása", "Két függvény összehasonlítása."],
  compare_process_captures: ["Folyamat-capture-ök összehasonlítása", "Két folyamat-capture bizonyíték-JSON összehasonlítása."],
  correlate_static_and_runtime: ["Statikus↔futásidő korreláció", "Statikus és futásidejű bizonyíték korrelálása."],
  export_evidence_bundle: ["Bizonyíték-csomag exportálása", "Kanonikus bizonyíték-JSON ellenőrzése és atomi exportja."],
  find_changed_behavior: ["Változott viselkedés keresése", "Viselkedésbeli változások keresése bizonyítékok közt."],
  get_evidence_bundle: ["Bizonyíték-csomag lekérése", "Egy bizonyíték-csomag lekérése."],
  get_navigation_context: ["Navigációs kontextus", "Az aktuális navigációs kontextus lekérése."],
  import_evidence_bundle: ["Bizonyíték-csomag importálása", "Korlátozott helyi bizonyíték-csomag ellenőrzése és importja."],
  inspect_address_context: ["Cím-kontextus vizsgálata", "Egy cím körüli kontextus vizsgálata."],
  list_unknowns: ["Ismeretlenek listája", "A rögzített ismeretlenek (unknowns) listázása."],
  open_binary: ["Bináris megnyitása", "Egy bináris megnyitása elemzésre."],
  record_unknown: ["Ismeretlen rögzítése", "Egy ismeretlen elem rögzítése a munkamenetben."],
  update_unknown: ["Ismeretlen frissítése", "Egy rögzített ismeretlen frissítése."],
  verify_reconstruction: ["Rekonstrukció ellenőrzése", "Egy rekonstrukció ellenőrzése bizonyíték ellen."],
  verify_unknown_resolution: ["Ismeretlen feloldás ellenőrzése", "Egy ismeretlen feloldásának ellenőrzése."],
};

/**
 * A weboldal-profilokhoz közvetlenül használt eszközök és ajánlott paramétereik.
 * Ez vezérli az egykattintásos elemzés tervkészítőjét (a worker is ezt olvassa).
 */
export const WEB_PROFILES = {
  "gyors-web": {
    label: "Gyors weboldal-felderítés",
    description: "Alap célpont-felderítés, oldalvizsgálat és képernyőkép.",
    tools: ["list_browser_targets", "inspect_web_page", "capture_web_screenshot"],
  },
  "reszletes-web": {
    label: "Részletes webes elemzés",
    description: "Teljes passzív vizsgálat + bundle-elemzés + script-export + WebMCP + munkamenet-megfigyelés.",
    tools: [
      "list_browser_targets",
      "inspect_web_page",
      "analyze_web_bundle",
      "export_web_scripts",
      "discover_webmcp_tools",
      "capture_web_screenshot",
    ],
  },
  javascript: {
    label: "JavaScript-források és modulok",
    description: "Script-források, bundle + source-map, exportált scriptek statikus elemzése.",
    tools: ["list_browser_targets", "inspect_web_page", "analyze_web_bundle", "export_web_scripts"],
  },
  "frontend-arch": {
    label: "Frontend-architektúra és útvonalak",
    description: "Route-/endpoint-jelöltek, vendor-ujjlenyomatok a bundle statikus elemzéséből.",
    tools: ["list_browser_targets", "analyze_web_bundle", "inspect_web_page"],
  },
  "bongeszo-megfigyeles": {
    label: "Böngészőben megfigyelt működés",
    description: "Felhasználó-vezérelt navigáció és böngésző-forgatókönyv megfigyelése.",
    tools: ["list_browser_targets", "observe_web_session", "inspect_web_page"],
  },
  "halozat-eroforras": {
    label: "Hálózati és erőforrás-megfigyelés",
    description: "Hálózati események, JSON-/WebSocket-alakok, erőforrások a passzív vizsgálatból.",
    tools: ["list_browser_targets", "inspect_web_page"],
  },
  teljes: {
    label: "Teljes elemzés (minden releváns web-eszköz)",
    description: "Az összes weboldalra ténylegesen alkalmazható és elérhető eszköz lefuttatása.",
    tools: [
      "list_browser_targets",
      "inspect_web_page",
      "analyze_web_bundle",
      "export_web_scripts",
      "discover_webmcp_tools",
      "observe_web_session",
      "capture_web_screenshot",
    ],
  },
  egyeni: {
    label: "Egyéni elemzés",
    description: "Szabadon kiválasztott, weboldalra alkalmazható eszközök.",
    tools: [],
  },
};
