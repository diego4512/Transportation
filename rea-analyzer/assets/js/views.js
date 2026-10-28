// REA Web Analyzer – nézetek.
(function () {
  const { esc, h, toast, modal, availPill, urlPill, stateDot } = UI;
  let registryCache = null;

  async function getRegistry() {
    if (!registryCache) registryCache = await Api.registry();
    return registryCache;
  }

  const DEPTHS = [
    ["sekely", "Sekély (gyors)"],
    ["kozepes", "Közepes"],
    ["melyseges", "Mélységes (lassabb)"],
  ];

  // ---------- Kezdőlap ----------
  async function dashboard(app) {
    app.innerHTML = `<div class="loading">Kezdőlap betöltése…</div>`;
    let reg, diag, jobs;
    try {
      [reg, diag, jobs] = await Promise.all([getRegistry(), Api.diagnostics(), Api.listJobs()]);
    } catch (e) {
      app.innerHTML = `<div class="card"><h2>Hiba</h2><p>${esc(e.message)}</p><p class="muted">Fut a PHP és a Node worker? Lásd a Diagnosztika oldalt és a TELEPITES.md-t.</p></div>`;
      return;
    }
    const profiles = reg.web_profiles || {};
    const profOpts = Object.entries(profiles)
      .filter(([k]) => k !== "egyeni")
      .map(([k, v]) => `<option value="${esc(k)}">${esc(v.label)}</option>`)
      .join("");
    const c = reg.counts || {};
    const activeEnabled = diag.config && diag.config.active_analysis_enabled;

    app.innerHTML = `
      <div class="card hero">
        <h1>Weboldal elemzése egy kattintással</h1>
        <p>Add meg az URL-t, válassz profilt, és a platform a releváns REA-eszközökkel elemzi az oldalt. Valós REA-motor, nem szimuláció.</p>
        <div class="url-row">
          <input id="url" type="url" placeholder="https://pelda.hu" autocomplete="off" />
          <button class="btn big primary-ink primary" id="go">Teljes elemzés indítása</button>
        </div>
        <div class="controls">
          <label>Profil
            <select id="profile">${profOpts}</select>
          </label>
          <label>Mélység
            <select id="depth">${DEPTHS.map(([k, l]) => `<option value="${k}"${k === "kozepes" ? " selected" : ""}>${l}</option>`).join("")}</select>
          </label>
          <label class="check" title="${activeEnabled ? "Aktív (böngészőt vezérlő) eszközök engedélyezése" : "A konfigurációban letiltva"}">
            <input type="checkbox" id="active" ${activeEnabled ? "" : "disabled"} /> Aktív elemzés
          </label>
        </div>
      </div>

      <div class="grid cols-4">
        <div class="stat"><div class="num">${c.mcp_tools_total ?? "–"}</div><div class="lbl">MCP-eszköz összesen</div></div>
        <div class="stat"><div class="num">${c.available_now ?? "–"}</div><div class="lbl">most elérhető</div></div>
        <div class="stat"><div class="num">${c.url_applicable_tools ?? "–"}</div><div class="lbl">weboldalra alkalmazható</div></div>
        <div class="stat"><div class="num">${c.providers ?? "–"}</div><div class="lbl">provider</div></div>
      </div>

      <div class="grid cols-2">
        <div class="card">
          <h2>Folyamatban / legutóbbi elemzések</h2>
          <div class="list" id="jobs"></div>
        </div>
        <div class="card">
          <h2>Rendszerállapot</h2>
          <div class="list">
            <div class="row"><span class="dot ${diag.worker && diag.worker.worker === "alive" ? "ok" : "err"}"></span><div class="main"><div class="t">Node worker</div><div class="s">${diag.worker && diag.worker.worker === "alive" ? "fut" : "nem fut – indítsd a start-worker szkripttel"}</div></div></div>
            <div class="row"><span class="dot ${reg.source && reg.source.chromium && reg.source.chromium.ready ? "ok" : "err"}"></span><div class="main"><div class="t">Chromium / Chrome</div><div class="s">${reg.source && reg.source.chromium && reg.source.chromium.ready ? esc(reg.source.chromium.path) : "nem található – állítsd be a CHROME_PATH-t"}</div></div></div>
            <div class="row"><span class="dot ${reg.source && reg.source.capabilities_ok ? "ok" : "warn"}"></span><div class="main"><div class="t">REA motor</div><div class="s">v${esc((reg.source && reg.source.rea_version) || "?")} · ${esc((reg.source && reg.source.rea_cmd) || "")}</div></div></div>
          </div>
          <p style="margin-top:.8rem"><a class="btn ghost sm" href="#/diagnosztika">Részletes diagnosztika →</a></p>
        </div>
      </div>
    `;

    renderJobList(app.querySelector("#jobs"), jobs.jobs || []);

    const start = async () => {
      const url = app.querySelector("#url").value.trim();
      if (!url) { toast("Adj meg egy URL-t.", "err"); return; }
      const payload = {
        url,
        profile: app.querySelector("#profile").value,
        depth: app.querySelector("#depth").value,
        active: app.querySelector("#active").checked,
      };
      const btn = app.querySelector("#go");
      btn.disabled = true; btn.textContent = "Indítás…";
      try {
        const r = await Api.analyze(payload);
        location.hash = "#/elemzes/" + r.id;
      } catch (e) {
        toast(e.message, "err");
        btn.disabled = false; btn.textContent = "Teljes elemzés indítása";
      }
    };
    app.querySelector("#go").addEventListener("click", start);
    app.querySelector("#url").addEventListener("keydown", (e) => { if (e.key === "Enter") start(); });
  }

  function renderJobList(container, jobs) {
    if (!jobs.length) { container.innerHTML = `<p class="muted">Még nincs elemzés.</p>`; return; }
    container.innerHTML = jobs
      .map(
        (j) => `<a class="row" href="#/elemzes/${esc(j.id)}" style="text-decoration:none;color:inherit">
          ${stateDot(j.state)}
          <div class="main"><div class="t">${esc(j.url || j.id)}</div>
          <div class="s">${esc(j.profile || "")} · ${esc(j.state)} · ${j.progress ? j.progress.completed + "/" + j.progress.total : ""}</div></div>
        </a>`
      )
      .join("");
  }

  // ---------- Eszközkatalógus ----------
  async function catalog(app) {
    app.innerHTML = `<div class="loading">Katalógus betöltése…</div>`;
    const reg = await getRegistry();
    const tools = (reg.tools || []).concat(reg.plugin_tools || []);
    const cats = [...new Set(tools.map((t) => t.category))].sort();
    app.innerHTML = `
      <div class="card">
        <h2>Eszközkatalógus <span class="muted" style="font-size:.8rem">(${tools.length} eszköz)</span></h2>
        <div class="toolbar">
          <input type="search" id="q" placeholder="Keresés név, azonosító, funkció szerint…" />
          <select id="catf"><option value="">Minden kategória</option>${cats.map((c) => `<option>${esc(c)}</option>`).join("")}</select>
          <select id="urlf"><option value="">Web-alkalmazhatóság: mind</option><option value="yes">weboldalra</option><option value="conditional">feltételes</option><option value="no">nem webes</option></select>
          <select id="avf"><option value="">Állapot: mind</option><option value="yes">elérhető</option><option value="no">nem elérhető</option><option value="unknown">ismeretlen</option></select>
        </div>
        <div class="list" id="tools"></div>
      </div>
    `;
    const listEl = app.querySelector("#tools");
    const render = () => {
      const q = app.querySelector("#q").value.toLowerCase();
      const cf = app.querySelector("#catf").value;
      const uf = app.querySelector("#urlf").value;
      const af = app.querySelector("#avf").value;
      const filtered = tools.filter((t) => {
        if (cf && t.category !== cf) return false;
        if (uf && t.url_applicable !== uf) return false;
        if (af) {
          const a = t.availability ? t.availability.available : null;
          if (af === "yes" && a !== true) return false;
          if (af === "no" && a !== false) return false;
          if (af === "unknown" && a !== null) return false;
        }
        if (q) {
          const hay = (t.id + " " + (t.name_hu || "") + " " + (t.description_hu || "") + " " + t.category).toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      listEl.innerHTML = filtered.length
        ? filtered
            .map(
              (t) => `<div class="row">
                <div class="main">
                  <div class="t">${esc(t.name_hu || t.id)} ${t.source === "plugin" ? '<span class="pill warn">bővítmény</span>' : ""}</div>
                  <div class="s"><code>${esc(t.id)}</code> · ${esc(t.category)}</div>
                </div>
                ${urlPill(t.url_applicable)} ${availPill(t.availability)}
                <button class="btn ghost sm" data-detail="${esc(t.id)}">Részletek</button>
              </div>`
            )
            .join("")
        : `<p class="muted">Nincs találat.</p>`;
      listEl.querySelectorAll("[data-detail]").forEach((b) =>
        b.addEventListener("click", () => toolDetail(tools.find((x) => x.id === b.dataset.detail)))
      );
    };
    ["q", "catf", "urlf", "avf"].forEach((id) => app.querySelector("#" + id).addEventListener("input", render));
    render();
  }

  function toolDetail(t) {
    const av = t.availability || {};
    const providers = (t.providers || []).map((p) => `<div class="row"><div class="main"><div class="t">${esc(p.name || p.id)}</div><div class="s">${esc(p.note || "")} ${p.license ? "· licenc: " + esc(p.license) : ""}</div></div></div>`).join("") || `<p class="muted">Nincs külön provider.</p>`;
    const runnable = t.url_applicable === "yes" && av.available === true && t.source !== "plugin";
    const bg = modal(`
      <h2>${esc(t.name_hu || t.id)}</h2>
      <p class="muted mono">${esc(t.id)}${t.cli_command ? " · CLI: rea " + esc(t.cli_command) : ""}</p>
      <p>${esc(t.description_hu || "")}</p>
      <p>${urlPill(t.url_applicable)} ${availPill(av)} <span class="pill unknown">${esc(t.category)}</span></p>
      <p><strong>Célformátumok:</strong> ${esc((t.target_formats || []).join(", ") || "–")}</p>
      ${av.reason ? `<p class="muted"><strong>Állapot indoka:</strong> ${esc(av.reason)}</p>` : ""}
      ${(av.limitations || []).length ? `<p class="muted"><strong>Korlátok:</strong> ${esc(av.limitations.join(" "))}</p>` : ""}
      <h3>Providerek</h3>${providers}
      <div style="margin-top:1rem;display:flex;gap:.5rem;flex-wrap:wrap">
        ${runnable ? `<button class="btn primary" id="runTool">Futtatás egy URL-en</button>` : `<span class="muted">${t.url_applicable === "yes" ? "Nem elérhető most (lásd az indokot)." : "Ez az eszköz nem weboldalra való – bináris/APK/firmware/.NET/macOS/Electron célt igényel."}</span>`}
        <button class="btn ghost" id="closeM">Bezárás</button>
      </div>
    `);
    bg.querySelector("#closeM").addEventListener("click", () => bg.remove());
    if (runnable) {
      bg.querySelector("#runTool").addEventListener("click", () => {
        bg.remove();
        runSingleTool(t.id);
      });
    }
  }

  function runSingleTool(toolId) {
    const bg = modal(`
      <h2>Eszköz futtatása</h2>
      <p class="muted">Egyéni elemzés egyetlen eszközzel: <code>${esc(toolId)}</code></p>
      <div class="field"><label>Weboldal URL</label><input id="u" type="url" placeholder="https://pelda.hu" /></div>
      <div class="field"><label>Mélység</label><select id="d">${DEPTHS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>
      <div style="display:flex;gap:.5rem"><button class="btn primary" id="run">Indítás</button><button class="btn ghost" id="c">Mégse</button></div>
    `);
    bg.querySelector("#c").addEventListener("click", () => bg.remove());
    bg.querySelector("#run").addEventListener("click", async () => {
      const url = bg.querySelector("#u").value.trim();
      if (!url) { toast("Adj meg egy URL-t.", "err"); return; }
      try {
        const r = await Api.analyze({ url, profile: "egyeni", depth: bg.querySelector("#d").value, tools: [toolId] });
        bg.remove();
        location.hash = "#/elemzes/" + r.id;
      } catch (e) { toast(e.message, "err"); }
    });
  }

  // ---------- Elemzési nézet ----------
  let pollTimer = null;
  async function analysis(app, jobId) {
    if (pollTimer) clearInterval(pollTimer);
    let selected = null;
    const draw = async () => {
      let s;
      try { s = await Api.jobStatus(jobId); } catch (e) { app.innerHTML = `<div class="card"><h2>Hiba</h2><p>${esc(e.message)}</p></div>`; clearInterval(pollTimer); return; }
      const terminal = ["done", "error", "cancelled"].includes(s.state);
      if (terminal && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      const pct = s.progress && s.progress.total ? Math.round((s.progress.completed / s.progress.total) * 100) : 0;
      if (selected === null && s.steps && s.steps.length) selected = s.steps[0].id;

      app.innerHTML = `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem">
            <div><h2 style="margin:0">Elemzés</h2><div class="muted mono">${esc(s.url || jobId)}</div></div>
            <div style="display:flex;gap:.4rem;flex-wrap:wrap">
              ${!terminal ? `<button class="btn danger sm" id="cancel">Megszakítás</button>` : ""}
              ${terminal ? ["json", "md", "csv", "html"].map((f) => `<a class="btn ghost sm" href="${Api.exportUrl(jobId, f)}">${f.toUpperCase()}</a>`).join("") : ""}
            </div>
          </div>
          <div class="progress"><span style="width:${pct}%"></span></div>
          <div class="muted" style="font-size:.82rem">Állapot: <strong>${esc(s.state)}</strong> · ${s.progress ? s.progress.completed + "/" + s.progress.total : ""} lépés · profil: ${esc(s.profile || "")}</div>
          ${s.error ? `<p class="pill err" style="margin-top:.5rem">${esc(s.error.message || "")}</p>` : ""}
          ${(s.dropped || []).length ? `<div class="muted" style="margin-top:.5rem;font-size:.8rem">Kihagyva: ${s.dropped.map((d) => esc(d.id) + " (" + esc(d.reason) + ")").join(", ")}</div>` : ""}
        </div>
        <div class="analysis">
          <div class="card steps">
            <h3>Lépések</h3>
            <div id="stepList"></div>
          </div>
          <div class="card"><div id="detail"></div></div>
        </div>
      `;
      const stepList = app.querySelector("#stepList");
      stepList.innerHTML = (s.steps || [])
        .map(
          (st) => `<div class="step ${st.id === selected ? "sel" : ""}" data-step="${esc(st.id)}">
            ${stateDot(st.state)}<div class="t">${esc(st.name_hu || st.id)}</div>
            ${st.evidence_id ? '<span class="pill ok">ev</span>' : st.error ? '<span class="pill err">hiba</span>' : ""}
          </div>`
        )
        .join("");
      stepList.querySelectorAll("[data-step]").forEach((el) =>
        el.addEventListener("click", () => { selected = el.dataset.step; drawDetail(s); })
      );
      if (!terminal) { /* marad a sel */ }
      drawDetail(s);
      const cancelBtn = app.querySelector("#cancel");
      if (cancelBtn) cancelBtn.addEventListener("click", async () => { try { await Api.cancel(jobId); toast("Megszakítás kérve."); } catch (e) { toast(e.message, "err"); } });
    };

    const drawDetail = (s) => {
      const detail = app.querySelector("#detail");
      if (!detail) return;
      const st = (s.steps || []).find((x) => x.id === selected);
      if (!st) { detail.innerHTML = `<p class="muted">Válassz egy lépést.</p>`; return; }
      detail.innerHTML = `
        <h3>${esc(st.name_hu || st.id)} ${stateDot(st.state)}</h3>
        <p class="muted mono">${esc(st.id)}</p>
        ${st.evidence_id ? `<p><strong>Evidence:</strong> <code>${esc(st.evidence_id)}</code></p>` : ""}
        ${st.facts && Object.keys(st.facts).length ? `<p><strong>Tények:</strong> <code>${esc(JSON.stringify(st.facts))}</code></p>` : ""}
        ${st.error ? `<p class="pill err">${esc(st.error.message || JSON.stringify(st.error))}</p>` : ""}
        ${st.state === "done" ? `<button class="btn ghost sm" id="raw">Nyers eredmény megtekintése</button><pre id="rawOut" hidden></pre>` : ""}
      `;
      const rawBtn = detail.querySelector("#raw");
      if (rawBtn) rawBtn.addEventListener("click", async () => {
        const out = detail.querySelector("#rawOut");
        if (!out.hidden) { out.hidden = true; return; }
        out.hidden = false; out.textContent = "Betöltés…";
        try { const d = await Api.jobStep(jobId, st.id); out.textContent = JSON.stringify(d.result || d, null, 2).slice(0, 20000); }
        catch (e) { out.textContent = "Hiba: " + e.message; }
      });
    };

    await draw();
    if (!pollTimer) pollTimer = setInterval(draw, 1400);
  }

  // ---------- Bővítmények ----------
  async function plugins(app) {
    app.innerHTML = `<div class="loading">Bővítmények betöltése…</div>`;
    let data;
    try { data = await Api.plugins(); } catch (e) { app.innerHTML = `<div class="card"><p>${esc(e.message)}</p></div>`; return; }
    const list = data.plugins || [];
    app.innerHTML = `
      <div class="card">
        <h2>GitHub-bővítmény hozzáadása</h2>
        <p class="muted">A GitHub URL nem jelent automatikus bizalmat. A rendszer rögzített commitot használ, és a bővítmény telepítés után is <strong>alapból letiltva</strong> marad, amíg nem engedélyezed.</p>
        <div class="field"><label>Repository URL (https) vagy helyi abszolút út</label><input id="repo" type="text" placeholder="https://github.com/felhasznalo/rea-bovitmeny" /></div>
        <div class="field"><label>Ref (commit/tag/branch, ajánlott commit)</label><input id="ref" type="text" placeholder="pl. v1.0.0 vagy commit-hash" /></div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn ghost" id="inspect">Ellenőrzés (manifest)</button>
          <button class="btn primary" id="install">Telepítés (letiltva)</button>
        </div>
        <div id="pluginOut" style="margin-top:1rem"></div>
      </div>
      <div class="card"><h2>Telepített bővítmények (${list.length})</h2><div class="list" id="installed"></div></div>
    `;
    const out = app.querySelector("#pluginOut");
    const poll = async (jid, after) => {
      out.innerHTML = `<p class="muted">Feldolgozás…</p>`;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 800));
        const res = await Api.pluginJob(jid);
        if (res && res.state === "done") { after(res); return; }
      }
      out.innerHTML = `<p class="pill err">Időtúllépés a bővítmény-műveletben.</p>`;
    };
    app.querySelector("#inspect").addEventListener("click", async () => {
      const repo = app.querySelector("#repo").value.trim();
      const ref = app.querySelector("#ref").value.trim();
      try {
        const r = await Api.pluginInspect({ repo_url: repo, ref });
        poll(r.job, (res) => {
          if (!res.ok) { out.innerHTML = `<p class="pill err">${esc(res.error || "Ellenőrzés sikertelen")}</p>`; return; }
          const m = res.manifest || {};
          out.innerHTML = `<div class="row"><div class="main">
            <div class="t">${esc(m.name || m.id)} <span class="muted">v${esc(m.version || "?")}</span></div>
            <div class="s">id: <code>${esc(m.id || "")}</code> · commit: <code>${esc((res.commit || "").slice(0, 12) || "n/a")}</code> · eszközök: ${(m.tools || []).length} · jogosultságok: ${esc(((m.permissions || []).join(", ")) || "nincs")}</div>
            <div class="s">${res.validation && res.validation.ok ? '<span class="pill ok">manifest OK</span>' : '<span class="pill err">manifest hibák: ' + esc((res.validation.errors || []).join("; ")) + "</span>"}</div>
          </div></div><p class="muted" style="font-size:.8rem">${esc(res.note || "")}</p>`;
        });
      } catch (e) { out.innerHTML = `<p class="pill err">${esc(e.message)}</p>`; }
    });
    app.querySelector("#install").addEventListener("click", async () => {
      const repo = app.querySelector("#repo").value.trim();
      const ref = app.querySelector("#ref").value.trim();
      try {
        const r = await Api.pluginInstall({ repo_url: repo, ref });
        poll(r.job, (res) => {
          if (!res.ok) { out.innerHTML = `<p class="pill err">${esc(res.error || "Telepítés sikertelen")}</p>`; return; }
          out.innerHTML = `<p class="pill ok">Telepítve: ${esc(res.id)} (commit ${esc((res.commit || "").slice(0, 12) || "n/a")}) – LETILTVA</p>`;
          toast("Bővítmény telepítve (letiltva). Engedélyezd a listában.", "ok");
          setTimeout(() => plugins(app), 900);
        });
      } catch (e) { out.innerHTML = `<p class="pill err">${esc(e.message)}</p>`; }
    });

    const inst = app.querySelector("#installed");
    inst.innerHTML = list.length
      ? list
          .map((p) => {
            const m = p.manifest || {};
            return `<div class="row">
              <span class="dot ${p.enabled ? "ok" : "unknown"}"></span>
              <div class="main"><div class="t">${esc(m.name || p.id)} <span class="muted">v${esc(m.version || "?")}</span> ${p.enabled ? '<span class="pill ok">engedélyezve</span>' : '<span class="pill unknown">letiltva</span>'}</div>
              <div class="s">id: <code>${esc(p.id)}</code> · eszközök: ${(m.tools || []).length} · commit: <code>${esc(((p.source || {}).commit || "").slice(0, 12) || "n/a")}</code></div></div>
              <button class="btn ghost sm" data-act="${p.enabled ? "disable" : "enable"}" data-id="${esc(p.id)}">${p.enabled ? "Letiltás" : "Engedélyezés"}</button>
              <button class="btn danger sm" data-act="uninstall" data-id="${esc(p.id)}">Eltávolítás</button>
            </div>`;
          })
          .join("")
      : `<p class="muted">Még nincs telepített bővítmény.</p>`;
    inst.querySelectorAll("[data-act]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (b.dataset.act === "uninstall" && !confirm("Biztosan eltávolítod?")) return;
        try { await Api.pluginAction(b.dataset.id, b.dataset.act); toast("Kész.", "ok"); plugins(app); }
        catch (e) { toast(e.message, "err"); }
      })
    );
  }

  // ---------- Diagnosztika ----------
  async function diagnostics(app) {
    app.innerHTML = `<div class="loading">Diagnosztika betöltése…</div>`;
    let d, reg;
    try { [d, reg] = await Promise.all([Api.diagnostics(), getRegistry()]); } catch (e) { app.innerHTML = `<div class="card"><p>${esc(e.message)}</p></div>`; return; }
    const src = d.registry_source || {};
    const prov = (d.providers || [])
      .map((p) => `<div class="row"><div class="main"><div class="t">${esc(p.name || p.id)} ${p.version ? '<span class="muted">v' + esc(p.version) + "</span>" : ""}</div>
        <div class="s">képességek: ${(p.capabilities || []).length} · ${esc(p.note || "")} ${p.license ? "· licenc: " + esc(p.license) : ""}</div></div></div>`)
      .join("");
    const fams = (d.families || [])
      .map((f) => `<div class="row"><div class="main"><div class="t">${esc(f.category || f.id)}</div><div class="s">${f.count} eszköz · ${urlPill(f.url || "no")}</div></div></div>`)
      .join("");
    app.innerHTML = `
      <div class="card">
        <h2>Diagnosztika</h2>
        <div class="grid cols-4">
          <div class="stat"><div class="num">${(d.counts || {}).mcp_tools_total ?? "–"}</div><div class="lbl">MCP-eszköz</div></div>
          <div class="stat"><div class="num">${(d.counts || {}).available_now ?? "–"}</div><div class="lbl">elérhető</div></div>
          <div class="stat"><div class="num">${(d.counts || {}).unavailable_now ?? "–"}</div><div class="lbl">nem elérhető</div></div>
          <div class="stat"><div class="num">${(d.counts || {}).unknown_now ?? "–"}</div><div class="lbl">ismeretlen</div></div>
        </div>
        <div class="list" style="margin-top:1rem">
          <div class="row"><span class="dot ${d.worker && d.worker.worker === "alive" ? "ok" : "err"}"></span><div class="main"><div class="t">Node worker</div><div class="s">${d.worker ? esc(JSON.stringify(d.worker).slice(0, 200)) : "nem fut"}</div></div></div>
          <div class="row"><span class="dot ${src.chromium && src.chromium.ready ? "ok" : "err"}"></span><div class="main"><div class="t">Chromium</div><div class="s">${src.chromium ? esc(src.chromium.path || "nincs") + " (" + esc(src.chromium.source) + ")" : "ismeretlen"}</div></div></div>
          <div class="row"><span class="dot ${src.capabilities_ok ? "ok" : "warn"}"></span><div class="main"><div class="t">REA capabilities</div><div class="s">v${esc(src.rea_version || "?")} · ${src.capabilities_ok ? "lekérdezve" : "hiba: " + esc(src.capabilities_error || "")}</div></div></div>
          <div class="row"><span class="dot ok"></span><div class="main"><div class="t">PHP</div><div class="s">${esc((d.php || {}).version || "")}</div></div></div>
        </div>
        <p class="muted" style="font-size:.8rem;margin-top:.6rem">Konfiguráció: ${esc(JSON.stringify(d.config || {}))}</p>
      </div>
      <div class="grid cols-2">
        <div class="card"><h2>Providerek (${(d.providers || []).length})</h2><div class="list">${prov}</div></div>
        <div class="card"><h2>Eszközcsaládok</h2><div class="list">${fams}</div></div>
      </div>
    `;
  }

  window.Views = { dashboard, catalog, plugins, diagnostics, analysis, _clearPoll: () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } } };
})();
