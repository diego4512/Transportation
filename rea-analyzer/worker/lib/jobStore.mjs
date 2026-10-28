// Fájlalapú job-tár. A PHP enqueue-kor létrehozza a job.json-t (state=queued);
// a worker atomian igényli (claim), feldolgozza, és state/result fájlokat ír.
// Minden írás ideiglenes fájlba + rename (atomi), hogy a PHP sose olvasson fél adatot.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync, openSync, closeSync } from "node:fs";
import { join } from "node:path";

export class JobStore {
  constructor(jobsDir) {
    this.jobsDir = jobsDir;
    mkdirSync(jobsDir, { recursive: true });
  }

  dir(id) {
    return join(this.jobsDir, id);
  }

  listIds() {
    try {
      return readdirSync(this.jobsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      return [];
    }
  }

  readJson(id, file) {
    const p = join(this.dir(id), file);
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  }

  writeJson(id, file, obj) {
    const d = this.dir(id);
    mkdirSync(d, { recursive: true });
    const tmp = join(d, `.${file}.${process.pid}.tmp`);
    writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
    renameSync(tmp, join(d, file));
  }

  exists(id, file) {
    return existsSync(join(this.dir(id), file));
  }

  isCancelled(id) {
    return existsSync(join(this.dir(id), "cancel"));
  }

  /** Atomian igényli a job-ot: wx flaggel létrehoz egy claim fájlt. */
  tryClaim(id) {
    const p = join(this.dir(id), "claimed");
    try {
      const fd = openSync(p, "wx"); // O_CREAT|O_EXCL – ha létezik, dob
      closeSync(fd);
      return true;
    } catch {
      return false;
    }
  }

  stepPath(id, toolId) {
    const d = join(this.dir(id), "steps");
    mkdirSync(d, { recursive: true });
    return join(d, `${toolId}.json`);
  }

  writeStep(id, toolId, obj) {
    const p = this.stepPath(id, toolId);
    const tmp = `${p}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
    renameSync(tmp, p);
  }

  capturesDir(id) {
    const d = join(this.dir(id), "captures");
    mkdirSync(d, { recursive: true });
    return d;
  }
}
