/* ============================================================
   Accountability Tracker — vanilla JS, no dependencies.
   Data persists in localStorage so it works fully offline.
   See README.md for how to swap localStorage for a shared backend.
   ============================================================ */

(function () {
  "use strict";

  // ---------- Storage keys ----------
  const K_PLAYERS = "pat_players";
  const K_ENTRIES = "pat_entries";
  const K_CURRENT = "pat_current_player";

  // ---------- Category config ----------
  // Each check-in category. `requirePhoto` enforces a photo before points score.
  const CATEGORIES = [
    { id: "pre_meal",  name: "Pre-Training Meal",  icon: "🍳", points: 10, requirePhoto: true,  perDay: 1 },
    { id: "post_meal", name: "Post-Training Meal", icon: "🍗", points: 10, requirePhoto: true,  perDay: 1 },
    { id: "workout",   name: "Workout Session",    icon: "💪", points: 15, requirePhoto: true,  perDay: 2 },
    { id: "protein",   name: "Protein Intake",     icon: "🥩", points: 10, requirePhoto: true,  perDay: 1 },
    { id: "water",     name: "Water Bottle",       icon: "💧", points: 5,  requirePhoto: true,  perDay: 4 },
    { id: "sleep",     name: "Sleep Check-In",     icon: "😴", points: 10, requirePhoto: true,  perDay: 1 },
  ];
  const CAT_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

  // ---------- State ----------
  let players = load(K_PLAYERS, []);
  let entries = load(K_ENTRIES, []);
  let currentPlayerId = load(K_CURRENT, null);
  let boardWeekOffset = 0; // 0 = this week, -1 = last week, etc.
  let pendingCategoryId = null; // category awaiting a photo

  // ---------- Helpers ----------
  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }
  function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function $(sel) { return document.querySelector(sel); }

  // Monday-based week start for a given date.
  function weekStart(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = (d.getDay() + 6) % 7; // 0 = Monday
    d.setDate(d.getDate() - day);
    return d;
  }
  function weekRange(offset) {
    const start = weekStart(new Date());
    start.setDate(start.getDate() + offset * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start: start.getTime(), end: end.getTime() };
  }
  function fmtWeek(offset) {
    const { start } = weekRange(offset);
    const s = new Date(start);
    const e = new Date(start); e.setDate(e.getDate() + 6);
    const opt = { month: "short", day: "numeric" };
    let label = `${s.toLocaleDateString(undefined, opt)} – ${e.toLocaleDateString(undefined, opt)}`;
    if (offset === 0) label += " (this week)";
    return label;
  }
  function isSameDay(ts, ref) {
    const a = new Date(ts), b = new Date(ref);
    return a.toDateString() === b.toDateString();
  }
  function timeAgo(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + "m ago";
    const h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  function currentPlayer() { return players.find((p) => p.id === currentPlayerId) || null; }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add("hidden"), 2200);
  }

  // ---------- Photo handling: downscale + compress to keep storage small ----------
  function compressImage(file, maxDim = 900, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > height && width > maxDim) { height = height * maxDim / width; width = maxDim; }
          else if (height > maxDim) { width = width * maxDim / height; height = maxDim; }
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ============================================================
  //  RENDERING
  // ============================================================
  function renderPlayerSelect() {
    const sel = $("#playerSelect");
    if (players.length === 0) {
      sel.innerHTML = `<option>No players yet</option>`;
      return;
    }
    sel.innerHTML = players
      .map((p) => `<option value="${p.id}" ${p.id === currentPlayerId ? "selected" : ""}>${escapeHtml(p.name)}</option>`)
      .join("");
  }

  function entriesFor(playerId, predicate) {
    return entries.filter((e) => e.playerId === playerId && (!predicate || predicate(e)));
  }

  function renderCategories() {
    const grid = $("#categoryGrid");
    const pid = currentPlayerId;
    grid.innerHTML = CATEGORIES.map((c) => {
      const todayCount = pid ? entriesFor(pid, (e) => e.category === c.id && isSameDay(e.timestamp, Date.now())).length : 0;
      const done = todayCount >= c.perDay;
      const countLabel = c.perDay > 1 ? `${todayCount}/${c.perDay} today` : (done ? "Logged today" : "Not logged");
      return `
        <button class="cat-card ${done ? "done" : ""}" data-cat="${c.id}">
          <span class="cat-check">✅</span>
          <span class="cat-icon">${c.icon}</span>
          <span class="cat-name">${c.name}</span>
          <span class="cat-pts">+${c.points} pts${c.perDay > 1 ? ` ×${c.perDay}` : ""}</span>
          <span class="cat-count">${countLabel}</span>
        </button>`;
    }).join("");
  }

  function renderToday() {
    const pid = currentPlayerId;
    const wrap = $("#todayProgress");
    const list = $("#todayEntries");
    if (!pid) { wrap.innerHTML = ""; list.innerHTML = emptyMsg("Add a player to get started."); return; }

    const todays = entriesFor(pid, (e) => isSameDay(e.timestamp, Date.now()));
    const scored = todays.reduce((s, e) => s + e.points, 0);
    const maxPossible = CATEGORIES.reduce((s, c) => s + c.points * c.perDay, 0);
    const pct = Math.min(100, Math.round((scored / maxPossible) * 100));

    wrap.innerHTML = `
      <div class="progress-top">
        <div class="progress-score">${scored} <small>/ ${maxPossible} pts</small></div>
        <div class="progress-pct">${pct}%</div>
      </div>
      <div class="bar"><span style="width:${pct}%"></span></div>`;

    list.innerHTML = todays.length
      ? todays.sort((a, b) => b.timestamp - a.timestamp).map(entryRow).join("")
      : emptyMsg("No check-ins yet today. Head to the Log tab!");
  }

  function renderHistory() {
    const pid = currentPlayerId;
    const list = $("#historyEntries");
    if (!pid) { list.innerHTML = emptyMsg("Add a player to get started."); return; }
    const mine = entriesFor(pid).sort((a, b) => b.timestamp - a.timestamp);
    list.innerHTML = mine.length ? mine.map(entryRow).join("") : emptyMsg("No history yet.");
  }

  function entryRow(e) {
    const c = CAT_BY_ID[e.category] || { name: e.category, icon: "❓" };
    const img = e.photo
      ? `<img src="${e.photo}" data-photo="${e.id}" alt="proof" />`
      : `<div style="width:52px;height:52px;border-radius:8px;background:var(--bg-soft);display:flex;align-items:center;justify-content:center;font-size:24px;">${c.icon}</div>`;
    return `
      <div class="entry">
        ${img}
        <div class="entry-info">
          <div class="e-name">${c.icon} ${escapeHtml(c.name)}</div>
          <div class="e-time">${timeAgo(e.timestamp)}</div>
        </div>
        <div class="e-pts">+${e.points}</div>
        <button class="e-del" data-del="${e.id}" title="Delete">🗑️</button>
      </div>`;
  }

  function renderLeaderboard() {
    const { start, end } = weekRange(boardWeekOffset);
    $("#boardWeekLabel").textContent = fmtWeek(boardWeekOffset);

    const totals = players.map((p) => {
      const wk = entries.filter((e) => e.playerId === p.id && e.timestamp >= start && e.timestamp < end);
      return {
        id: p.id,
        name: p.name,
        points: wk.reduce((s, e) => s + e.points, 0),
        count: wk.length,
      };
    }).sort((a, b) => b.points - a.points || b.count - a.count);

    const board = $("#leaderboard");
    if (totals.length === 0) { board.innerHTML = emptyMsg("No players yet."); }
    else {
      const medals = ["🥇", "🥈", "🥉"];
      board.innerHTML = totals.map((t, i) => `
        <div class="lb-row ${t.id === currentPlayerId ? "me" : ""}">
          <div class="lb-rank">${medals[i] || i + 1}</div>
          <div class="lb-name">${escapeHtml(t.name)}<small>${t.count} check-in${t.count === 1 ? "" : "s"}</small></div>
          <div class="lb-pts">${t.points}<small> pts</small></div>
        </div>`).join("");
    }

    // Category breakdown for current player this week.
    const bd = $("#categoryBreakdown");
    if (!currentPlayerId) { bd.innerHTML = emptyMsg("Select a player."); return; }
    const mine = entries.filter((e) => e.playerId === currentPlayerId && e.timestamp >= start && e.timestamp < end);
    const maxCat = Math.max(1, ...CATEGORIES.map((c) => mine.filter((e) => e.category === c.id).reduce((s, e) => s + e.points, 0)));
    bd.innerHTML = CATEGORIES.map((c) => {
      const pts = mine.filter((e) => e.category === c.id).reduce((s, e) => s + e.points, 0);
      const w = Math.round((pts / maxCat) * 100);
      return `
        <div class="bd-row">
          <div class="bd-label">${c.icon} ${escapeHtml(c.name)}</div>
          <div class="bar"><span style="width:${w}%"></span></div>
          <div class="bd-val">${pts}</div>
        </div>`;
    }).join("");
  }

  function emptyMsg(text) { return `<div class="empty">${escapeHtml(text)}</div>`; }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  function renderAll() {
    renderPlayerSelect();
    renderCategories();
    renderToday();
    renderHistory();
    renderLeaderboard();
    $("#weekLabel").textContent = currentPlayer()
      ? `Tracking ${currentPlayer().name} · ${fmtWeek(0)}`
      : "Add a player to begin tracking the week.";
  }

  // ============================================================
  //  ACTIONS
  // ============================================================
  function startCheckIn(catId) {
    if (!currentPlayerId) { toast("Add a player first"); openManagePlayers(); return; }
    pendingCategoryId = catId;
    const cat = CAT_BY_ID[catId];
    if (cat.requirePhoto) {
      $("#photoInput").value = "";
      $("#photoInput").click(); // opens camera / file picker
    } else {
      recordEntry(catId, null);
    }
  }

  async function onPhotoChosen(file) {
    if (!file || !pendingCategoryId) return;
    const cat = CAT_BY_ID[pendingCategoryId];
    toast("Processing photo…");
    let dataUrl;
    try { dataUrl = await compressImage(file); }
    catch { toast("Couldn't read that photo"); return; }
    openConfirmModal(cat, dataUrl);
  }

  function openConfirmModal(cat, dataUrl) {
    $("#modalBody").innerHTML = `
      <h3>${cat.icon} ${escapeHtml(cat.name)}</h3>
      <p class="hint">Confirm your proof to bank <b>+${cat.points} points</b>.</p>
      <img class="modal-preview" src="${dataUrl}" alt="preview" />
      <button class="btn btn-primary" id="confirmEntry">Log it · +${cat.points} pts</button>`;
    showModal();
    $("#confirmEntry").onclick = () => {
      recordEntry(cat.id, dataUrl);
      hideModal();
    };
  }

  function recordEntry(catId, photo) {
    const cat = CAT_BY_ID[catId];
    entries.push({
      id: uid(),
      playerId: currentPlayerId,
      category: catId,
      points: cat.points,
      photo: photo || null,
      timestamp: Date.now(),
    });
    save(K_ENTRIES, entries);
    pendingCategoryId = null;
    renderAll();
    toast(`+${cat.points} points! 🎉`);
  }

  function deleteEntry(id) {
    entries = entries.filter((e) => e.id !== id);
    save(K_ENTRIES, entries);
    renderAll();
    toast("Entry removed");
  }

  // ---------- Player management ----------
  function openManagePlayers() {
    const rows = players.map((p) => `
      <div class="player-manage-row">
        <span>${escapeHtml(p.name)}</span>
        <button class="icon-btn" data-makecurrent="${p.id}" title="Set active">👤</button>
        <button class="icon-btn" data-removeplayer="${p.id}" title="Remove">🗑️</button>
      </div>`).join("") || `<p class="hint">No players yet — add your first athlete below.</p>`;

    $("#modalBody").innerHTML = `
      <h3>Players</h3>
      <p class="hint">Add each athlete. Tap 👤 to switch who you're logging for.</p>
      <div id="playerRows">${rows}</div>
      <div class="field">
        <label for="newPlayerName">Add player</label>
        <input type="text" id="newPlayerName" placeholder="e.g. Jordan M." autocomplete="off" />
      </div>
      <button class="btn btn-primary" id="addPlayerBtn">Add player</button>`;
    showModal();

    $("#addPlayerBtn").onclick = () => {
      const name = $("#newPlayerName").value.trim();
      if (!name) return;
      const p = { id: uid(), name, createdAt: Date.now() };
      players.push(p);
      if (!currentPlayerId) currentPlayerId = p.id;
      save(K_PLAYERS, players);
      save(K_CURRENT, currentPlayerId);
      openManagePlayers();
      renderAll();
    };
    $("#newPlayerName").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#addPlayerBtn").click(); });

    $("#playerRows").onclick = (e) => {
      const mk = e.target.closest("[data-makecurrent]");
      const rm = e.target.closest("[data-removeplayer]");
      if (mk) {
        currentPlayerId = mk.dataset.makecurrent;
        save(K_CURRENT, currentPlayerId);
        renderAll(); toast("Active player switched");
        openManagePlayers();
      } else if (rm) {
        const id = rm.dataset.removeplayer;
        const p = players.find((x) => x.id === id);
        if (!confirm(`Remove ${p ? p.name : "this player"} and all their entries?`)) return;
        players = players.filter((x) => x.id !== id);
        entries = entries.filter((x) => x.playerId !== id);
        if (currentPlayerId === id) currentPlayerId = players[0]?.id || null;
        save(K_PLAYERS, players); save(K_ENTRIES, entries); save(K_CURRENT, currentPlayerId);
        openManagePlayers(); renderAll();
      }
    };
  }

  // ---------- Modal helpers ----------
  function showModal() { $("#modal").classList.remove("hidden"); }
  function hideModal() { $("#modal").classList.add("hidden"); }

  function openPhotoViewer(entryId) {
    const e = entries.find((x) => x.id === entryId);
    if (!e || !e.photo) return;
    const c = CAT_BY_ID[e.category] || { name: e.category, icon: "" };
    $("#modalBody").innerHTML = `
      <h3>${c.icon} ${escapeHtml(c.name)}</h3>
      <p class="hint">${new Date(e.timestamp).toLocaleString()} · +${e.points} pts</p>
      <img class="fullimg" src="${e.photo}" alt="proof" />`;
    showModal();
  }

  // ============================================================
  //  EVENT WIRING
  // ============================================================
  function switchTab(tab) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tabbtn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    $("#tab-" + tab).classList.add("active");
    if (tab === "board") renderLeaderboard();
    if (tab === "today") renderToday();
    if (tab === "history") renderHistory();
    window.scrollTo(0, 0);
  }

  function init() {
    // Seed a friendly default if totally empty.
    if (players.length === 0) {
      // leave empty; prompt user to add players
    }
    renderAll();

    // Tab bar
    document.querySelector(".tabbar").addEventListener("click", (e) => {
      const btn = e.target.closest(".tabbtn");
      if (btn) switchTab(btn.dataset.tab);
    });

    // Category cards
    $("#categoryGrid").addEventListener("click", (e) => {
      const card = e.target.closest(".cat-card");
      if (card) startCheckIn(card.dataset.cat);
    });

    // Photo input
    $("#photoInput").addEventListener("change", (e) => onPhotoChosen(e.target.files[0]));

    // Player select + manage
    $("#playerSelect").addEventListener("change", (e) => {
      currentPlayerId = e.target.value;
      save(K_CURRENT, currentPlayerId);
      renderAll();
    });
    $("#managePlayersBtn").addEventListener("click", openManagePlayers);

    // Week nav
    $("#prevWeek").addEventListener("click", () => { boardWeekOffset--; renderLeaderboard(); });
    $("#nextWeek").addEventListener("click", () => { if (boardWeekOffset < 0) { boardWeekOffset++; renderLeaderboard(); } });

    // Delegated: delete entries + photo viewer (works across Today + History)
    $("#main").addEventListener("click", (e) => {
      const del = e.target.closest("[data-del]");
      const photo = e.target.closest("[data-photo]");
      if (del) deleteEntry(del.dataset.del);
      else if (photo) openPhotoViewer(photo.dataset.photo);
    });

    // Modal close
    $("#modalClose").addEventListener("click", hideModal);
    $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") hideModal(); });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
