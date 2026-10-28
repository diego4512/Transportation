// REA Web Analyzer – router + bootstrap.
(function () {
  const app = document.getElementById("app");
  const nav = document.getElementById("nav");

  function setActive(route) {
    document.querySelectorAll("#nav a").forEach((a) => {
      const base = "#" + route;
      a.classList.toggle("active", a.getAttribute("href") === base || (route.startsWith("/elemzes") && a.dataset.route === "/"));
    });
  }

  async function route() {
    const hash = location.hash.replace(/^#/, "") || "/";
    Views._clearPoll();
    nav.classList.remove("open");
    try {
      if (hash === "/" || hash === "") { setActive("/"); await Views.dashboard(app); }
      else if (hash === "/katalogus") { setActive("/katalogus"); await Views.catalog(app); }
      else if (hash === "/bovitmenyek") { setActive("/bovitmenyek"); await Views.plugins(app); }
      else if (hash === "/diagnosztika") { setActive("/diagnosztika"); await Views.diagnostics(app); }
      else if (hash.startsWith("/elemzes/")) { setActive("/elemzes"); await Views.analysis(app, decodeURIComponent(hash.slice("/elemzes/".length))); }
      else { app.innerHTML = `<div class="card"><h2>Nincs ilyen oldal</h2><p><a href="#/">Vissza a kezdőlapra</a></p></div>`; }
    } catch (e) {
      app.innerHTML = `<div class="card"><h2>Hiba a nézet betöltésekor</h2><p>${UI.esc(e.message)}</p></div>`;
    }
    window.scrollTo(0, 0);
  }

  document.getElementById("hamburger").addEventListener("click", () => nav.classList.toggle("open"));
  window.addEventListener("hashchange", route);
  window.addEventListener("DOMContentLoaded", route);
  route();
})();
