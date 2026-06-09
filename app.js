/* ============================================================
   Accountability Tracker
   ------------------------------------------------------------
   Data layer auto-selects:
     • SHARED mode  — Firebase Firestore (real-time, all players
       share one leaderboard) when config.js has real keys.
     • LOCAL mode   — browser localStorage fallback so the app
       still works before Firebase is configured.

   Rendering reads from the in-memory `players` / `entries`
   arrays, which both modes keep up to date.
   ============================================================ */

import { firebaseConfig } from "./config.js";

// ---------- Storage keys (local mode + per-device identity) ----------
const K_PLAYERS = "pat_players";
const K_ENTRIES = "pat_entries";
const K_CURRENT = "pat_current_player"; // always per-device: who am I?

// ---------- Category config ----------
const CATEGORIES = [
  { id: "pre_meal",  name: "Pre-Training Meal",  icon: "🍳", points: 10, requirePhoto: true, perDay: 1 },
  { id: "post_meal", name: "Post-Training Meal", icon: "🍗", points: 10, requirePhoto: true, perDay: 1 },
  { id: "workout",   name: "Workout Session",    icon: "💪", points: 15, requirePhoto: true, perDay: 1 },
  { id: "protein",   name: "Protein Intake",     icon: "🥩", points: 10, requirePhoto: true, perDay: 1, note: "Goal: 1g of protein per lb of body weight" },
  { id: "water",     name: "Water Bottle",       icon: "💧", points: 3,  requirePhoto: true, perDay: 4, note: "1 log = one 32 oz bottle finished" },
  { id: "sleep",     name: "Sleep Check-In",     icon: "😴", points: 10, requirePhoto: true, perDay: 1, allowGallery: true, note: "7.5 hr minimum — screenshot your sleep tracker or phone bedtime/alarm" },
];
const CAT_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

// Team roster — auto-added to the shared database the first time the connected
// app loads with no players yet. (Two Emmas disambiguated by last initial.)
const DEFAULT_ROSTER = [
  "Lynette", "Mia", "Kristina", "Ava", "Emma C", "Astyn", "Adeleine",
  "Baylea", "Ayla", "Skyler", "Emma E", "Jayley", "Analiese", "Breanna",
  "Alexandria", "Harumi", "Naomi", "Abigail", "Brynn", "Grace", "Sabrina",
  "Natalie", "Sophia", "Hannah",
];

// ---------- State ----------
let players = [];
let entries = [];
let currentPlayerId = load(K_CURRENT, null);
let boardWeekOffset = 0;
let pendingCategoryId = null;

// ---------- DATA LAYER --------------------------------------
let fb = null; // Firestore handles when in shared mode; null in local mode.

async function initStore() {
  const configured =
    firebaseConfig && firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith("PASTE");

  if (configured) {
    try {
      const appMod = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
      const fsMod = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      const app = appMod.initializeApp(firebaseConfig);
      const db = fsMod.getFirestore(app);
      fb = { db, ...fsMod };
      setStatus("connected", "● Live");
      fsMod.onSnapshot(
        fsMod.collection(db, "players"),
        (snap) => {
          players = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          maybeSeedRoster();
          renderAll();
        },
        () => setStatus("error", "● Sync error")
      );
      fsMod.onSnapshot(
        fsMod.collection(db, "entries"),
        (snap) => { entries = snap.docs.map((d) => ({ id: d.id, ...d.data() })); renderAll(); },
        () => setStatus("error", "● Sync error")
      );
      return;
    } catch (err) {
      console.error("Firebase init failed, falling back to local:", err);
      setStatus("error", "● Offline");
    }
  }

  // Local fallback
  players = load(K_PLAYERS, []);
  entries = load(K_ENTRIES, []);
  setStatus("local", "● Local only");
  renderAll();
}

// One-time auto-seed of the team roster when the shared DB is empty.
let seedAttempted = false;
async function maybeSeedRoster() {
  if (seedAttempted || !fb) return;
  seedAttempted = true;
  if (players.length > 0) return;                        // roster already exists
  if (localStorage.getItem("pat_roster_seeded")) return; // this device already seeded
  try {
    for (const name of DEFAULT_ROSTER) await storeAddPlayer(name);
    localStorage.setItem("pat_roster_seeded", "1");      // only mark done on success
    toast(`Loaded ${DEFAULT_ROSTER.length}-player roster`);
  } catch (err) {
    console.error("Roster seed failed:", err);
    setStatus("error", "● Sync error");
    toast("Couldn't reach database — check Firestore setup");
  }
}

// Manual roster load (button in Players screen). Dedupe-aware, reports result.
async function loadDefaultRoster() {
  const seen = new Set(players.map((p) => p.name.toLowerCase()));
  let added = 0, skipped = 0, firstId = null;
  try {
    for (const name of DEFAULT_ROSTER) {
      if (seen.has(name.toLowerCase())) { skipped++; continue; }
      seen.add(name.toLowerCase());
      const id = await storeAddPlayer(name);
      if (!firstId) firstId = id;
      added++;
    }
    localStorage.setItem("pat_roster_seeded", "1");
    if (!currentPlayerId && firstId) { currentPlayerId = firstId; save(K_CURRENT, currentPlayerId); }
    renderAll();
    openManagePlayers();
    toast(`Loaded ${added} player${added === 1 ? "" : "s"}${skipped ? `, skipped ${skipped}` : ""}`);
  } catch (err) {
    console.error("Roster load failed:", err);
    toast("Load failed — is Firestore database created?");
  }
}

async function storeAddPlayer(name) {
  const p = { name, createdAt: Date.now() };
  if (fb) { const ref = await fb.addDoc(fb.collection(fb.db, "players"), p); return ref.id; }
  const id = uid(); players.push({ id, ...p }); save(K_PLAYERS, players); renderAll(); return id;
}

async function storeRemovePlayer(id) {
  if (fb) {
    await fb.deleteDoc(fb.doc(fb.db, "players", id));
    const q = fb.query(fb.collection(fb.db, "entries"), fb.where("playerId", "==", id));
    const snap = await fb.getDocs(q);
    await Promise.all(snap.docs.map((d) => fb.deleteDoc(fb.doc(fb.db, "entries", d.id))));
    return;
  }
  players = players.filter((p) => p.id !== id);
  entries = entries.filter((e) => e.playerId !== id);
  save(K_PLAYERS, players); save(K_ENTRIES, entries); renderAll();
}

async function storeAddEntry(entry) {
  if (fb) { await fb.addDoc(fb.collection(fb.db, "entries"), entry); return; }
  entries.push({ id: uid(), ...entry }); save(K_ENTRIES, entries); renderAll();
}

async function storeDeleteEntry(id) {
  if (fb) { await fb.deleteDoc(fb.doc(fb.db, "entries", id)); return; }
  entries = entries.filter((e) => e.id !== id); save(K_ENTRIES, entries); renderAll();
}

function setStatus(cls, label) {
  const pill = $("#connStatus");
  if (!pill) return;
  pill.textContent = label;
  pill.className = "conn-pill show conn-" + cls;
}

// ---------- Helpers ----------
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function $(sel) { return document.querySelector(sel); }

function weekStart(date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d;
}
function weekRange(offset) {
  const start = weekStart(new Date()); start.setDate(start.getDate() + offset * 7);
  const end = new Date(start); end.setDate(end.getDate() + 7);
  return { start: start.getTime(), end: end.getTime() };
}
function fmtWeek(offset) {
  const { start } = weekRange(offset);
  const s = new Date(start); const e = new Date(start); e.setDate(e.getDate() + 6);
  const opt = { month: "short", day: "numeric" };
  let label = `${s.toLocaleDateString(undefined, opt)} – ${e.toLocaleDateString(undefined, opt)}`;
  if (offset === 0) label += " (this week)";
  return label;
}
function isSameDay(ts, ref) {
  return new Date(ts).toDateString() === new Date(ref).toDateString();
}
function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function currentPlayer() { return players.find((p) => p.id === currentPlayerId) || null; }

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), 2200);
}

// ---------- Photo: downscale + compress (keeps Firestore docs < 1MB) ----------
function compressImage(file, maxDim = 800, quality = 0.6) {
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
      img.onerror = reject; img.src = reader.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

// ============================================================
//  RENDERING
// ============================================================
function renderPlayerSelect() {
  const sel = $("#playerSelect");
  if (players.length === 0) { sel.innerHTML = `<option>No players yet</option>`; return; }
  if (currentPlayerId && !players.some((p) => p.id === currentPlayerId)) currentPlayerId = null;
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
        ${c.note ? `<span class="cat-note">${escapeHtml(c.note)}</span>` : ""}
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
    return { id: p.id, name: p.name, points: wk.reduce((s, e) => s + e.points, 0), count: wk.length };
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
    : "Add yourself as a player to begin tracking the week.";
}

// ============================================================
//  ACTIONS
// ============================================================
function startCheckIn(catId) {
  if (!currentPlayerId) { toast("Pick your player first"); openManagePlayers(); return; }
  pendingCategoryId = catId;
  const cat = CAT_BY_ID[catId];
  if (cat.requirePhoto) {
    const input = $("#photoInput");
    input.value = "";
    // Gallery categories (e.g. sleep) need the full picker; others force the live camera.
    if (cat.allowGallery) input.removeAttribute("capture");
    else input.setAttribute("capture", "environment");
    input.click();
  } else {
    recordEntry(catId, null);
  }
}

async function onPhotoChosen(file) {
  if (!file || !pendingCategoryId) return;
  const cat = CAT_BY_ID[pendingCategoryId];
  toast("Processing photo…");
  let dataUrl;
  try { dataUrl = await compressImage(file); } catch { toast("Couldn't read that photo"); return; }
  openConfirmModal(cat, dataUrl);
}

function openConfirmModal(cat, dataUrl) {
  $("#modalBody").innerHTML = `
    <h3>${cat.icon} ${escapeHtml(cat.name)}</h3>
    <p class="hint">Confirm your proof to bank <b>+${cat.points} points</b>.</p>
    ${cat.note ? `<p class="cat-note-modal">📌 ${escapeHtml(cat.note)}</p>` : ""}
    <img class="modal-preview" src="${dataUrl}" alt="preview" />
    <button class="btn btn-primary" id="confirmEntry">Log it · +${cat.points} pts</button>`;
  showModal();
  $("#confirmEntry").onclick = () => { recordEntry(cat.id, dataUrl); hideModal(); };
}

async function recordEntry(catId, photo) {
  const cat = CAT_BY_ID[catId];
  await storeAddEntry({
    playerId: currentPlayerId,
    category: catId,
    points: cat.points,
    photo: photo || null,
    timestamp: Date.now(),
  });
  pendingCategoryId = null;
  toast(`+${cat.points} points! 🎉`);
}

async function deleteEntry(id) {
  await storeDeleteEntry(id);
  toast("Entry removed");
}

// ---------- Player management ----------
function openManagePlayers() {
  const rows = players.map((p) => `
    <div class="player-manage-row">
      <span>${escapeHtml(p.name)}</span>
      <button class="icon-btn" data-makecurrent="${p.id}" title="This is me">👤</button>
      <button class="icon-btn" data-removeplayer="${p.id}" title="Remove">🗑️</button>
    </div>`).join("") || `<p class="hint">No players yet — add the first athlete below.</p>`;

  $("#modalBody").innerHTML = `
    <h3>Players</h3>
    <p class="hint">Add each athlete. On your own phone, tap 👤 to mark which one is you.</p>
    <div id="playerRows">${rows}</div>
    <div class="field">
      <label for="newPlayerName">Add player</label>
      <input type="text" id="newPlayerName" placeholder="e.g. Jordan M." autocomplete="off" />
    </div>
    <button class="btn btn-primary" id="addPlayerBtn">Add player</button>

    <div class="field" style="margin-top:20px;">
      <label for="bulkRoster">Import roster — one name per line (or comma-separated)</label>
      <textarea id="bulkRoster" rows="6" placeholder="Jordan M.&#10;Alex P.&#10;Sam R."></textarea>
    </div>
    <button class="btn btn-ghost" id="importRosterBtn">Import list</button>
    <button class="btn btn-ghost" id="loadRosterBtn" style="margin-top:10px;">⬆️ Load full team roster (${DEFAULT_ROSTER.length})</button>`;
  showModal();

  $("#loadRosterBtn").onclick = loadDefaultRoster;

  $("#addPlayerBtn").onclick = async () => {
    const name = $("#newPlayerName").value.trim();
    if (!name) return;
    const newId = await storeAddPlayer(name);
    if (!currentPlayerId) { currentPlayerId = newId; save(K_CURRENT, currentPlayerId); }
    $("#newPlayerName").value = "";
    renderAll();
    openManagePlayers();
  };
  $("#newPlayerName").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#addPlayerBtn").click(); });

  $("#importRosterBtn").onclick = async () => {
    const names = $("#bulkRoster").value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const seen = new Set(players.map((p) => p.name.toLowerCase()));
    let added = 0, skipped = 0, firstId = null;
    for (const name of names) {
      if (seen.has(name.toLowerCase())) { skipped++; continue; }
      seen.add(name.toLowerCase());
      const id = await storeAddPlayer(name);
      if (!firstId) firstId = id;
      added++;
    }
    if (!currentPlayerId && firstId) { currentPlayerId = firstId; save(K_CURRENT, currentPlayerId); }
    renderAll();
    openManagePlayers();
    toast(`Imported ${added} player${added === 1 ? "" : "s"}${skipped ? `, skipped ${skipped} duplicate` : ""}`);
  };

  $("#playerRows").onclick = async (e) => {
    const mk = e.target.closest("[data-makecurrent]");
    const rm = e.target.closest("[data-removeplayer]");
    if (mk) {
      currentPlayerId = mk.dataset.makecurrent; save(K_CURRENT, currentPlayerId);
      renderAll(); toast("That's you ✔"); openManagePlayers();
    } else if (rm) {
      const id = rm.dataset.removeplayer;
      const p = players.find((x) => x.id === id);
      if (!confirm(`Remove ${p ? p.name : "this player"} and all their entries?`)) return;
      if (currentPlayerId === id) { currentPlayerId = null; save(K_CURRENT, currentPlayerId); }
      await storeRemovePlayer(id);
      renderAll(); openManagePlayers();
    }
  };
}

// ---------- Export weekly records to CSV ----------
function exportCSV() {
  if (!entries.length) { toast("No check-ins to export yet"); return; }

  // Group every entry into its Monday-based week.
  const weeks = {};
  for (const e of entries) {
    const ws = weekStart(e.timestamp).getTime();
    (weeks[ws] = weeks[ws] || []).push(e);
  }

  const rows = [["Week Start", "Week End", "Rank", "Player", "Points", "Check-ins", "Winner"]];
  Object.keys(weeks).map(Number).sort((a, b) => a - b).forEach((ws) => {
    const totals = {};
    for (const e of weeks[ws]) {
      const p = players.find((pl) => pl.id === e.playerId);
      const name = p ? p.name : "(removed player)";
      const t = (totals[e.playerId] = totals[e.playerId] || { name, points: 0, count: 0 });
      t.points += e.points; t.count += 1;
    }
    const ranked = Object.values(totals).sort((a, b) => b.points - a.points || b.count - a.count);
    const top = ranked[0] ? ranked[0].points : 0;
    const wsDate = new Date(ws);
    const weDate = new Date(ws); weDate.setDate(weDate.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    ranked.forEach((t, i) => {
      rows.push([fmt(wsDate), fmt(weDate), i + 1, t.name, t.points, t.count,
        (t.points === top && top > 0) ? "WINNER" : ""]);
    });
  });

  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  downloadFile(`accountability-records-${stamp}.csv`, csv, "text/csv;charset=utf-8");
  toast("Records exported");
}
function csvCell(v) {
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ---------- Modal ----------
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
  initStore(); // kicks off Firebase or local; renders when ready

  document.querySelector(".tabbar").addEventListener("click", (e) => {
    const btn = e.target.closest(".tabbtn"); if (btn) switchTab(btn.dataset.tab);
  });
  $("#categoryGrid").addEventListener("click", (e) => {
    const card = e.target.closest(".cat-card"); if (card) startCheckIn(card.dataset.cat);
  });
  $("#photoInput").addEventListener("change", (e) => onPhotoChosen(e.target.files[0]));
  $("#playerSelect").addEventListener("change", (e) => {
    currentPlayerId = e.target.value; save(K_CURRENT, currentPlayerId); renderAll();
  });
  $("#managePlayersBtn").addEventListener("click", openManagePlayers);
  $("#prevWeek").addEventListener("click", () => { boardWeekOffset--; renderLeaderboard(); });
  $("#nextWeek").addEventListener("click", () => { if (boardWeekOffset < 0) { boardWeekOffset++; renderLeaderboard(); } });
  $("#exportBtn").addEventListener("click", exportCSV);
  $("#main").addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]");
    const photo = e.target.closest("[data-photo]");
    if (del) deleteEntry(del.dataset.del);
    else if (photo) openPhotoViewer(photo.dataset.photo);
  });
  $("#modalClose").addEventListener("click", hideModal);
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") hideModal(); });

  renderAll();
}

// The module is injected dynamically (for cache-busting), so DOMContentLoaded
// may have already fired by the time this runs — start immediately if so.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
