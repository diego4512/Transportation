// Elemzési tervkészítő: profil (vagy egyéni eszközlista) + mélység → rendezett,
// szűrt lépéslista. Csak a weboldalra ténylegesen alkalmazható ÉS a regiszterben
// elérhető eszközök kerülnek be. Az aktív (böngészőt vezérlő) eszközök csak akkor,
// ha a felhasználó az aktív módot kifejezetten megerősítette.

// A worker executora ezeket az eszközöket ismeri (weboldal-elemzés):
export const PASSIVE_CDP_TOOLS = [
  "inspect_web_page",
  "analyze_web_bundle",
  "discover_webmcp_tools",
  "observe_web_session",
  "capture_web_screenshot",
];
export const POST_TOOLS = ["export_web_scripts"]; // korábbi capture-re épül
export const ACTIVE_TOOLS = ["capture_browser_scenario"]; // Playwright, aktív

// Rögzített, értelmes végrehajtási sorrend
const ORDER = [
  "list_browser_targets",
  "inspect_web_page",
  "analyze_web_bundle",
  "discover_webmcp_tools",
  "observe_web_session",
  "capture_web_screenshot",
  "export_web_scripts",
  "capture_browser_scenario",
];

const SUPPORTED = new Set(["list_browser_targets", ...PASSIVE_CDP_TOOLS, ...POST_TOOLS, ...ACTIVE_TOOLS]);

export function depthParams(depth) {
  switch (depth) {
    case "sekely":
      return { observationMs: 500, sessionMs: 4000, includeAll: false, fetchSourceMaps: false };
    case "melyseges":
      return { observationMs: 2500, sessionMs: 15000, includeAll: true, fetchSourceMaps: true };
    case "kozepes":
    default:
      return { observationMs: 1200, sessionMs: 8000, includeAll: true, fetchSourceMaps: false };
  }
}

/**
 * @param {object} args
 *   profiles – WEB_PROFILES objektum a regiszterből
 *   profileId – pl. "teljes", vagy "egyeni"
 *   customTools – egyéni esetben kiválasztott tool id-k
 *   registry – tool-registry.json
 *   active – aktív mód engedélyezve?
 * @returns {{steps:string[], dropped:Array<{id:string,reason:string}>}}
 */
export function buildPlan({ profiles, profileId, customTools, registry, active }) {
  const availById = new Map(registry.tools.map((t) => [t.id, t]));
  let requested;
  if (profileId === "egyeni") {
    requested = Array.isArray(customTools) ? customTools.slice() : [];
  } else {
    const p = profiles[profileId];
    requested = p ? p.tools.slice() : [];
  }

  const dropped = [];
  const chosen = new Set();
  for (const id of requested) {
    if (!SUPPORTED.has(id)) {
      dropped.push({ id, reason: "Nem weboldal-elemző eszköz (a webes futtató nem támogatja)." });
      continue;
    }
    const t = availById.get(id);
    if (t && t.availability && t.availability.available === false) {
      dropped.push({ id, reason: t.availability.reason || "Nem elérhető (hiányzó függőség)." });
      continue;
    }
    if (ACTIVE_TOOLS.includes(id) && !active) {
      dropped.push({ id, reason: "Aktív eszköz – külön megerősítés (aktív mód) szükséges." });
      continue;
    }
    chosen.add(id);
  }

  // Ha bármely CDP/post eszköz kell, a list_browser_targets kötelező első lépés.
  const needsEndpoint = [...chosen].some((id) => PASSIVE_CDP_TOOLS.includes(id) || POST_TOOLS.includes(id));
  if (needsEndpoint) chosen.add("list_browser_targets");

  // export_web_scripts csak akkor, ha van előzetes capture (inspect vagy analyze)
  if (chosen.has("export_web_scripts") && !chosen.has("inspect_web_page") && !chosen.has("analyze_web_bundle")) {
    chosen.add("inspect_web_page"); // automatikusan hozzávesszük a capture-forrást
  }

  const steps = ORDER.filter((id) => chosen.has(id));
  return { steps, dropped };
}
