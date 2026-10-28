// UI segédek: DOM-építés, escape, toast, modal, jelvények.
(function () {
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function h(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  let toastTimer = null;
  function toast(msg, kind = "") {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.className = "toast " + kind;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 4000);
  }

  function modal(innerHtml) {
    const bg = h(`<div class="modal-bg"><div class="modal">${innerHtml}</div></div>`);
    bg.addEventListener("click", (e) => {
      if (e.target === bg) bg.remove();
    });
    document.body.appendChild(bg);
    return bg;
  }

  function availPill(av) {
    if (!av) return `<span class="pill unknown">ismeretlen</span>`;
    if (av.available === true) return `<span class="pill ok">● elérhető</span>`;
    if (av.available === false) return `<span class="pill err">● nem elérhető</span>`;
    return `<span class="pill unknown">● ismeretlen</span>`;
  }

  function urlPill(u) {
    if (u === "yes") return `<span class="pill yes">weboldalra</span>`;
    if (u === "conditional") return `<span class="pill cond">feltételes</span>`;
    return `<span class="pill no">nem webes</span>`;
  }

  function stateDot(state) {
    const map = { done: "ok", error: "err", running: "running", pending: "pending", skipped: "skipped", queued: "pending", cancelled: "skipped" };
    return `<span class="dot ${map[state] || "unknown"}"></span>`;
  }

  window.UI = { esc, h, toast, modal, availPill, urlPill, stateDot };
})();
