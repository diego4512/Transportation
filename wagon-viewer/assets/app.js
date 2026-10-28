// Vonat-összeállítás néző – megjelenítő logika (keretrendszer nélkül).
// Adatforrás: window.TRAINS (minta). A valós adatot az adapter tölti ide:
//  - kocsi-sorrend + kocsiképek: WagonWeb mentett oldalából (import/)
//  - foglalt/szabad ülések: MÁV GetGraphicalPlaceReservationMap
(function () {
  const FAC = { bike: "🚲", wheelchair: "♿", quiet: "🤫", dining: "🍽️", power: "🔌" };
  const KIND_ICON = { loco: "🚆", coach: "🚃", dining: "🍽️", bike: "🚲" };

  const trainSel = document.getElementById("trainSel");
  const trainbar = document.getElementById("trainbar");
  const trainInfo = document.getElementById("trainInfo");
  const panel = document.getElementById("panel");
  const note = document.getElementById("note");

  const trains = window.TRAINS || [];
  let current = null;
  let selectedCarIdx = null;

  // Ülés-leltár előállítása egy kocsihoz (szám, sor, oszlop, ablak, foglalt)
  function buildSeats(car) {
    if (!car.rows || !car.cols) return [];
    const reserved = new Set(car.reserved || []);
    const win = new Set(car.windowCols || []);
    const seats = [];
    let n = 0;
    for (let r = 0; r < car.rows; r++) {
      for (let c = 0; c < car.cols; c++) {
        n++;
        seats.push({ no: n, row: r + 1, col: c, window: win.has(c), reserved: reserved.has(n) });
      }
    }
    return seats;
  }

  function occupancy(car) {
    const total = (car.rows || 0) * (car.cols || 0);
    const res = (car.reserved || []).length;
    return { total, res, free: total - res, pct: total ? Math.round((res / total) * 100) : 0 };
  }

  function carHasSeats(car) {
    return car.kind === "coach" && car.rows && car.cols;
  }

  function renderTrainbar() {
    trainbar.innerHTML = "";
    current.cars.forEach((car, idx) => {
      const occ = carHasSeats(car) ? occupancy(car) : null;
      const el = document.createElement("div");
      el.className = "car" + (car.kind === "loco" ? " loco" : "") + (idx === selectedCarIdx ? " sel" : "");
      el.setAttribute("role", "listitem");
      if (carHasSeats(car)) {
        el.tabIndex = 0;
        el.setAttribute("aria-label", `${car.type || "Kocsi"} ${car.label}, ${occ.free} szabad, ${occ.res} foglalt`);
      }
      const facIcons = (car.facilities || []).map((f) => FAC[f] || "").join(" ");
      const img = car.image
        ? `<img src="${car.image}" alt="" style="max-height:30px;max-width:100%"/>`
        : KIND_ICON[car.kind] || "🚃";
      el.innerHTML =
        `<div class="silhouette">${img}</div>` +
        `<div class="lbl">${car.kind === "loco" ? "Mozdony" : "Kocsi " + car.label}</div>` +
        `<div class="meta">${car.sub || car.type || ""}</div>` +
        (facIcons ? `<div class="fac">${facIcons}</div>` : "") +
        (occ ? `<div class="occ" title="${occ.pct}% foglalt"><span style="width:${occ.pct}%"></span></div>` : "");
      if (carHasSeats(car)) {
        el.addEventListener("click", () => selectCar(idx));
        el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectCar(idx); } });
      }
      trainbar.appendChild(el);
    });
  }

  function selectCar(idx) {
    selectedCarIdx = idx;
    renderTrainbar();
    renderPanel(current.cars[idx]);
  }

  function renderPanel(car) {
    if (!carHasSeats(car)) {
      panel.innerHTML = `<div class="empty">Ehhez a kocsihoz nincs ülés-térkép (${car.type || car.kind}).</div>`;
      return;
    }
    const seats = buildSeats(car);
    const occ = occupancy(car);
    const byRow = {};
    seats.forEach((s) => { (byRow[s.row] = byRow[s.row] || []).push(s); });

    let rowsHtml = "";
    Object.keys(byRow).forEach((r) => {
      const rowSeats = byRow[r].sort((a, b) => a.col - b.col);
      const half = Math.ceil(car.cols / 2);
      let cells = "";
      rowSeats.forEach((s, i) => {
        if (i === half) cells += `<div class="aisle"></div>`; // folyosó középen
        cells += `<div class="seat ${s.reserved ? "reserved" : "free"}${s.window ? " window" : ""}" title="${s.no}. hely – ${s.reserved ? "foglalt" : "szabad"}${s.window ? ", ablak" : ""}">${s.no}</div>`;
      });
      rowsHtml += `<div class="srow"><span class="rownum">${r}.</span>${cells}</div>`;
    });

    panel.innerHTML =
      `<h2>Kocsi ${car.label} – ülés-térkép</h2>` +
      `<div class="psub">${car.type || ""}${(car.facilities || []).length ? " · " + car.facilities.map((f) => FAC[f] + " " + f).join(" · ") : ""}</div>` +
      `<div class="seatmap">${rowsHtml}</div>` +
      `<div class="counts">` +
      `<span class="pill free">● ${occ.free} szabad</span>` +
      `<span class="pill res">● ${occ.res} foglalt</span>` +
      `<span style="color:var(--muted)">összesen ${occ.total} hely · ${occ.pct}% foglalt</span>` +
      `</div>`;
  }

  function loadTrain(id) {
    current = trains.find((t) => t.id === id) || trains[0];
    selectedCarIdx = null;
    trainInfo.textContent = `${current.from} → ${current.to} · ${current.date}`;
    renderTrainbar();
    panel.innerHTML = `<div class="empty">Válassz egy kocsit a fenti sorból az ülés-térképhez.</div>`;
  }

  // init
  trains.forEach((t) => {
    const o = document.createElement("option");
    o.value = t.id; o.textContent = t.name;
    trainSel.appendChild(o);
  });
  trainSel.addEventListener("change", () => loadTrain(trainSel.value));

  note.innerHTML =
    "<strong>Adatforrás (valós használathoz):</strong> a kocsi-sorrend és a kocsiképek a WagonWeb " +
    "általad lementett oldalából jönnek (jobbklikk → kép mentése; a mentett fájlok a <code>data/assets/</code> mappába, " +
    "a sorrend az <code>import/</code> segítségével a <code>data/sample-train.js</code> szerkezetébe). A foglalt/szabad " +
    "ülések a MÁV <code>GetGraphicalPlaceReservationMap</code> válaszából. Ez a demó minta-adattal fut. " +
    "A WagonWeb Cloudflare-védett, ezért innen (felhő) nem tölthető automatikusan – a képeket a saját böngésződből mentsd.";

  if (trains.length) loadTrain(trains[0].id);
  else panel.innerHTML = `<div class="empty">Nincs betöltött vonat-adat.</div>`;
})();
