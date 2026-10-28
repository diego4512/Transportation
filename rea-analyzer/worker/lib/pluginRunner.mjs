// Bővítmény-műveletek a workerben (a PHP sosem indít folyamatot).
// inspect: klón → manifest olvasás → commit feloldás → validáció (nincs telepítés).
// install: klón rögzített commitra → manifest + state (alapból LETILTVA) → fájlmásolás.
// SOHA nem futtatunk tetszőleges telepítőszkriptet; csak olvasunk + másolunk.

import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function git(args, cwd, timeoutMs = 120000) {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, encoding: "utf8", timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (err, out, errOut) => {
      resolve({ ok: !err, out: (out || "").trim(), err: (errOut || "").trim(), code: err ? (err.code ?? 1) : 0 });
    });
  });
}

function validateManifest(m) {
  const errors = [];
  if (!m || typeof m !== "object") return { ok: false, errors: ["A plugin.json nem objektum."] };
  for (const req of ["id", "name", "version"]) {
    if (!m[req] || typeof m[req] !== "string") errors.push(`Hiányzó/érvénytelen mező: ${req}`);
  }
  if (m.id && !/^[a-z0-9][a-z0-9_-]{1,48}$/.test(m.id)) errors.push("Érvénytelen id (kisbetű/szám/kötőjel, 2-49).");
  if (m.tools && !Array.isArray(m.tools)) errors.push("A tools mezőnek tömbnek kell lennie.");
  if (m.permissions && !Array.isArray(m.permissions)) errors.push("A permissions mezőnek tömbnek kell lennie.");
  return { ok: errors.length === 0, errors };
}

async function fetchRepo(repoUrl, ref) {
  const tmp = mkdtempSync(join(tmpdir(), "rea-plugin-"));
  const dest = join(tmp, "repo");
  const isLocal = repoUrl.startsWith("/") || /^[A-Za-z]:[\\/]/.test(repoUrl);

  if (isLocal && !existsSync(join(repoUrl, ".git")) && existsSync(join(repoUrl, "plugin.json"))) {
    // Helyi, nem-git könyvtár: egyszerű másolás (teszteléshez)
    mkdirSync(dest, { recursive: true });
    cpSync(repoUrl, dest, { recursive: true });
    return { tmp, dest, commit: null, source: "local-copy" };
  }

  const clone = await git(["clone", "--depth", "50", repoUrl, dest], tmp);
  if (!clone.ok) {
    rmSync(tmp, { recursive: true, force: true });
    return { error: `git clone sikertelen: ${clone.err.slice(0, 300)}` };
  }
  if (ref) {
    const co = await git(["checkout", ref], dest);
    if (!co.ok) {
      rmSync(tmp, { recursive: true, force: true });
      return { error: `git checkout '${ref}' sikertelen: ${co.err.slice(0, 200)}` };
    }
  }
  const rev = await git(["rev-parse", "HEAD"], dest);
  return { tmp, dest, commit: rev.ok ? rev.out : null, source: isLocal ? "local-git" : "git" };
}

function readManifest(dir) {
  const p = join(dir, "plugin.json");
  if (!existsSync(p)) return { error: "A repository gyökerében nincs plugin.json." };
  try {
    return { manifest: JSON.parse(readFileSync(p, "utf8")) };
  } catch {
    return { error: "A plugin.json érvénytelen JSON." };
  }
}

export async function inspectPlugin(cfg, params) {
  const fetched = await fetchRepo(params.repo_url, params.ref || "");
  if (fetched.error) return { ok: false, error: fetched.error };
  try {
    const mr = readManifest(fetched.dest);
    if (mr.error) return { ok: false, error: mr.error };
    const val = validateManifest(mr.manifest);
    return {
      ok: val.ok,
      action: "inspect",
      manifest: mr.manifest,
      commit: fetched.commit,
      ref: params.ref || null,
      source: fetched.source,
      validation: val,
      note: "A forrást ellenőrizd telepítés előtt. A bővítmény telepítés után is alapból letiltva marad.",
    };
  } finally {
    rmSync(fetched.tmp, { recursive: true, force: true });
  }
}

export async function installPlugin(cfg, params, pluginsDir) {
  const fetched = await fetchRepo(params.repo_url, params.ref || "");
  if (fetched.error) return { ok: false, error: fetched.error };
  try {
    const mr = readManifest(fetched.dest);
    if (mr.error) return { ok: false, error: mr.error };
    const val = validateManifest(mr.manifest);
    if (!val.ok) return { ok: false, error: "Érvénytelen manifest: " + val.errors.join("; ") };

    const id = mr.manifest.id;
    const pdir = join(pluginsDir, id);
    mkdirSync(join(pdir, "src"), { recursive: true });
    // .git nélkül másoljuk (nem követünk élő ágat)
    cpSync(fetched.dest, join(pdir, "src"), {
      recursive: true,
      filter: (s) => !s.split(/[\\/]/).includes(".git"),
    });
    writeFileSync(join(pdir, "plugin.json"), JSON.stringify(mr.manifest, null, 2), "utf8");
    writeFileSync(
      join(pdir, "state.json"),
      JSON.stringify(
        {
          enabled: false, // alapból LETILTVA
          status: "installed",
          installed_at: new Date().toISOString(),
          source: { repo: params.repo_url, ref: params.ref || null, commit: fetched.commit },
        },
        null,
        2,
      ),
      "utf8",
    );
    return { ok: true, action: "install", id, commit: fetched.commit, enabled: false, note: "Telepítve, de LETILTVA. Engedélyezd a felületen a használatához." };
  } finally {
    rmSync(fetched.tmp, { recursive: true, force: true });
  }
}

export { validateManifest };
