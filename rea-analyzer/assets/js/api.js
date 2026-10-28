// REA Web Analyzer – API réteg. Alútvonal-érzékeny (XAMPP /rea-analyzer/ alatt is).
(function () {
  const dir = location.pathname.replace(/\/[^/]*$/, "/");
  const API = dir + "api";
  let csrf = null;

  async function req(path, opts = {}) {
    const res = await fetch(API + path, {
      credentials: "same-origin",
      ...opts,
      headers: { ...(opts.headers || {}) },
    });
    const ct = res.headers.get("content-type") || "";
    const isJson = ct.includes("application/json");
    const data = isJson ? await res.json() : await res.text();
    if (!res.ok) {
      const msg = isJson && data && data.error ? data.error : `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function ensureCsrf() {
    if (csrf) return csrf;
    const d = await req("/csrf");
    csrf = d.csrf;
    return csrf;
  }

  async function post(path, body) {
    const token = await ensureCsrf();
    return req(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
      body: JSON.stringify(body || {}),
    });
  }

  window.Api = {
    base: API,
    health: () => req("/health"),
    registry: () => req("/registry"),
    diagnostics: () => req("/diagnostics"),
    listJobs: () => req("/jobs"),
    jobStatus: (id) => req("/jobs/" + encodeURIComponent(id)),
    jobResult: (id) => req("/jobs/" + encodeURIComponent(id) + "/result"),
    jobStep: (id, tool) => req("/jobs/" + encodeURIComponent(id) + "/step/" + encodeURIComponent(tool)),
    exportUrl: (id, fmt) => API + "/jobs/" + encodeURIComponent(id) + "/export?format=" + fmt,
    analyze: (payload) => post("/analyze", payload),
    cancel: (id) => post("/jobs/" + encodeURIComponent(id) + "/cancel", {}),
    plugins: () => req("/plugins"),
    pluginInspect: (payload) => post("/plugins/inspect", payload),
    pluginInstall: (payload) => post("/plugins/install", payload),
    pluginJob: (jid) => req("/plugins/job/" + encodeURIComponent(jid)),
    pluginAction: (id, action) => post("/plugins/" + encodeURIComponent(id) + "/" + action, {}),
  };
})();
