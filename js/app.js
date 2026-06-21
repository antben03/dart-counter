"use strict";

/* ================= STATE ================= */
let S = {
  view: "home",       // home | setup-match | setup-tournament | tournament | prematch | match | match-paused | match-result | stats
  t: null,            // tournament object (null outside tournament mode)
  activeMatch: null,  // match ID in tournament mode
  singleMatch: null,  // match object in quick-match mode
  adminMode: false
};

/* ================= CONSTANTS ================= */
const LETTERS = ["A", "B"];
const GROUP_NAMES = { A: "Group A", B: "Group B" };
const STAGE_LABELS = { sf1: "Semi-final 1", sf2: "Semi-final 2", bronze: "Third Place 🥉", final: "Final 🏆" };
const OUT_LABELS = { single: "Single out", double: "Double out", double5: "Double out (max 5 attempts)" };

/* ================= HELPERS ================= */
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const needed = (bestOf) => Math.ceil(bestOf / 2);

function pName(id) {
  if (S.t) { const p = S.t.players.find(p => p.id === id); return p ? p.name : "?"; }
  if (S.singleMatch) return S.singleMatch.names[id] ?? "Player " + (id + 1);
  return "Player " + (id + 1);
}

/* ================= FORMAT ================= */
function formatFor(n) {
  if (n <= 5) return { groups: 1, qual: n === 3 ? 2 : 4 };
  return { groups: 2, qual: 2 };
}

/* ================= TOURNAMENT ENGINE ================= */
function newMatch(p1, p2, stage, group, settings, extra = {}) {
  const id = S.t ? S.t.nextId++ : 0;
  return Object.assign({
    id, stage, group, p1, p2,
    settings: clone(settings), status: "pending", winner: null, live: null, log: [], result: null
  }, extra);
}

function createTournament(playerData, stageDefaults, bronze) {
  const n = playerData.length;
  const fmt = formatFor(n);
  const players = playerData.map((p, i) => ({ id: i, name: p.name.trim() }));
  const order = shuffle(players.map(p => p.id));
  const letters = LETTERS.slice(0, fmt.groups);
  const groups = {};
  letters.forEach(L => groups[L] = []);
  order.forEach((id, i) => groups[letters[i % fmt.groups]].push(id));

  S.t = {
    name: "Dart Tournament",
    players, groups, letters, format: fmt,
    stageDefaults: clone(stageDefaults), bronze,
    tiebreaks: [],
    matches: [], nextId: 0,
    playoffsStarted: false, champion: null, version: 3
  };

  const t = S.t;
  for (const L of letters) {
    const g = groups[L];
    for (let i = 0; i < g.length; i++)
      for (let j = i + 1; j < g.length; j++)
        t.matches.push(newMatch(g[i], g[j], "group", L, stageDefaults.group));
  }
}

function legCount(m) {
  let p1 = 0, p2 = 0;
  for (const e of m.log) if (e.legWon) { e.player === 0 ? p1++ : p2++; }
  return { p1, p2 };
}

function tiebreakBetween(a, b) {
  for (let i = S.t.tiebreaks.length - 1; i >= 0; i--) {
    const r = S.t.tiebreaks[i];
    if ((r.winner === a && r.loser === b) || (r.winner === b && r.loser === a)) return r.winner;
  }
  return null;
}

function groupStanding(g) {
  const ids = S.t.groups[g];
  const rows = ids.map(id => ({ id, played: 0, wins: 0, lf: 0, la: 0, unresolved: null }));
  const get = id => rows.find(r => r.id === id);
  for (const m of S.t.matches) {
    if (m.stage !== "group" || m.group !== g || m.status !== "done") continue;
    const legs = legCount(m);
    const sides = [[m.p1, legs.p1, legs.p2], [m.p2, legs.p2, legs.p1]];
    for (const [pid, lf, la] of sides) {
      const r = get(pid); if (!r) continue;
      r.played++; r.lf += lf; r.la += la;
      if (m.winner === pid) r.wins++;
    }
  }
  rows.sort((a, b) => b.wins - a.wins);
  const out = [];
  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (j < rows.length && rows[j].wins === rows[i].wins) j++;
    const block = rows.slice(i, j);
    if (block.length > 1) {
      const inBlock = new Set(block.map(r => r.id));
      const h = {}; block.forEach(r => h[r.id] = { w: 0, d: 0 });
      for (const m of S.t.matches) {
        if (m.stage !== "group" || m.group !== g || m.status !== "done") continue;
        if (!inBlock.has(m.p1) || !inBlock.has(m.p2)) continue;
        const lc = legCount(m);
        h[m.p1].d += lc.p1 - lc.p2; h[m.p2].d += lc.p2 - lc.p1;
        if (m.winner !== null) h[m.winner].w++;
      }
      block.forEach(r => { r.key = [h[r.id].w, h[r.id].d, r.lf - r.la, r.lf]; });
      block.sort((a, b) => {
        for (let k = 0; k < 4; k++) if (a.key[k] !== b.key[k]) return b.key[k] - a.key[k];
        const tb = tiebreakBetween(a.id, b.id);
        if (tb !== null) return tb === a.id ? -1 : 1;
        return 0;
      });
      for (let k = 0; k < block.length - 1; k++) {
        const a = block[k], b = block[k + 1];
        if (a.key.join() === b.key.join() && tiebreakBetween(a.id, b.id) === null) a.unresolved = b.id;
      }
    }
    out.push(...block); i = j;
  }
  return out;
}

function groupStageDone() { return S.t.matches.filter(m => m.stage === "group").every(m => m.status === "done"); }
function pendingTiebreaks() { return S.t.matches.filter(m => m.stage === "tiebreak" && m.status !== "done"); }

function neededTiebreaks() {
  if (!groupStageDone()) return [];
  const t = S.t, needs = [];
  const bound = t.format.groups === 1 ? t.format.qual : 2;
  for (const L of t.letters) {
    const s = groupStanding(L);
    for (let k = 0; k < bound && k + 1 < s.length; k++) {
      if (s[k].unresolved === s[k + 1].id) {
        const exists = t.matches.some(m => m.stage === "tiebreak" && m.status !== "done" &&
          ((m.p1 === s[k].id && m.p2 === s[k + 1].id) || (m.p1 === s[k + 1].id && m.p2 === s[k].id)));
        if (!exists) needs.push({ g: L, a: s[k].id, b: s[k + 1].id });
      }
    }
  }
  return needs;
}

function createTiebreak(g, a, b) {
  const gs = S.t.stageDefaults.group;
  S.t.matches.push(newMatch(a, b, "tiebreak", g, { game: gs.game, out: gs.out, sets: 1, legs: 1 }));
}

function stageDef(stage) {
  const sd = S.t.stageDefaults;
  if (stage.startsWith("sf")) return clone(sd.sf || sd.group);
  return clone(sd[stage] || sd.group);
}

function startPlayoffs() {
  const t = S.t;
  if (t.playoffsStarted || !groupStageDone() || neededTiebreaks().length || pendingTiebreaks().length) return;
  const st = {}; for (const L of t.letters) st[L] = groupStanding(L);
  const mk = (p1, p2, stage) => t.matches.push(newMatch(p1, p2, stage, null, stageDef(stage)));
  if (t.format.groups === 1) {
    const s = st.A;
    if (t.format.qual === 2) mk(s[0].id, s[1].id, "final");
    else { mk(s[0].id, s[3].id, "sf1"); mk(s[1].id, s[2].id, "sf2"); }
  } else {
    mk(st.A[0].id, st.B[1].id, "sf1");
    mk(st.B[0].id, st.A[1].id, "sf2");
  }
  t.playoffsStarted = true;
}

function maybeAdvancePlayoffs() {
  const t = S.t;
  const find = s => t.matches.find(m => m.stage === s);
  const mk = (p1, p2, stage) => t.matches.push(newMatch(p1, p2, stage, null, stageDef(stage)));
  const sf1 = find("sf1"), sf2 = find("sf2");
  if (sf1 && sf2 && sf1.status === "done" && sf2.status === "done" && !find("final")) {
    const l1 = sf1.p1 === sf1.winner ? sf1.p2 : sf1.p1;
    const l2 = sf2.p1 === sf2.winner ? sf2.p2 : sf2.p1;
    mk(sf1.winner, sf2.winner, "final");
    if (t.bronze) mk(l1, l2, "bronze");
  }
  const f = find("final");
  if (f && f.status === "done") t.champion = f.winner;
}

/* ================= ADMIN ================= */
function forfeitMatch(matchId, winnerPlayerId) {
  const m = S.t.matches.find(x => x.id === matchId);
  if (!m || m.status === "done") return;
  if (m.status === "live") { m.live = null; }
  m.status = "done";
  m.winner = winnerPlayerId;
  m.result = { sets: [0, 0], forfeit: true };
  m.log = [];
  if (m.stage === "tiebreak") {
    S.t.tiebreaks.push({ winner: m.winner, loser: m.winner === m.p1 ? m.p2 : m.p1 });
  } else {
    maybeAdvancePlayoffs();
  }
  if (S.activeMatch === matchId) S.activeMatch = null;
  render();
}

function resetMatch(matchId) {
  const m = S.t.matches.find(x => x.id === matchId);
  if (!m) return;
  if (m.stage === "sf1" || m.stage === "sf2") {
    S.t.matches = S.t.matches.filter(x => x.stage !== "final" && x.stage !== "bronze");
    S.t.champion = null;
  } else if (m.stage === "final") {
    S.t.champion = null;
  } else if (m.stage === "tiebreak") {
    S.t.tiebreaks = S.t.tiebreaks.filter(tb =>
      !((tb.winner === m.p1 || tb.winner === m.p2) && (tb.loser === m.p1 || tb.loser === m.p2))
    );
  }
  m.status = "pending";
  m.winner = null;
  m.result = null;
  m.live = null;
  m.log = [];
  if (S.activeMatch === matchId) { S.activeMatch = null; S.view = "tournament"; }
  render();
}

function savePlayerNames() {
  document.querySelectorAll(".admin-name-input").forEach(input => {
    const id = parseInt(input.dataset.pid);
    const p = S.t.players.find(p => p.id === id);
    if (p && input.value.trim()) p.name = input.value.trim();
  });
  render();
}

/* ================= MATCH ENGINE ================= */
function startMatchLive(m) {
  m.status = "live";
  m.live = {
    setsWon: [0, 0], legsWon: [0, 0], legNo: 0,
    scores: [m.settings.game, m.settings.game],
    turn: 0, turnDarts: [], turnStart: m.settings.game,
    dblAtt: [0, 0], mult: 1, history: [], over: false
  };
  m.log = [];
}

const isDoublePos = s => s === 50 || (s >= 2 && s <= 40 && s % 2 === 0);

function effOut(m, idx) {
  const o = m.settings.out;
  if (o !== "double5") return o;
  return m.live.dblAtt[idx] >= 5 ? "single" : "double";
}

function snapshot(m) {
  m.live.history.push(JSON.stringify({ live: { ...m.live, history: [] }, log: m.log }));
  if (m.live.history.length > 120) m.live.history.shift();
}

function undo(m) {
  const lv = m.live;
  if (!lv || !lv.history.length) return;
  const snap = JSON.parse(lv.history.pop());
  const hist = lv.history;
  m.live = snap.live; m.live.history = hist;
  m.log = snap.log;
  render();
}

function throwDart(m, value, isDouble, label) {
  const lv = m.live;
  if (!lv || lv.over) return;
  snapshot(m);
  const cur = lv.turn;
  const before = lv.scores[cur];
  const eff = effOut(m, cur);
  const dOut = eff === "double";
  if (m.settings.out === "double5" && dOut && isDoublePos(before)) lv.dblAtt[cur]++;
  const ns = before - value;
  lv.turnDarts.push(label);
  lv.mult = 1;

  const bust = ns < 0 || (dOut && ns === 1) || (ns === 0 && dOut && !isDouble);

  if (ns === 0 && !bust) {
    const pts = lv.turnStart;
    m.log.push({ player: cur, points: pts, darts: lv.turnDarts.length, bust: false, checkout: pts, legWon: true });
    if (pts === 180) flash180();
    winLeg(m, cur);
    return;
  }
  if (bust) {
    m.log.push({ player: cur, points: 0, darts: lv.turnDarts.length, bust: true, legWon: false });
    endTurn(m, true);
    render();
    return;
  }
  lv.scores[cur] = ns;
  if (lv.turnDarts.length === 3) {
    const pts = lv.turnStart - ns;
    m.log.push({ player: cur, points: pts, darts: 3, bust: false, legWon: false });
    if (pts === 180) flash180();
    endTurn(m, false);
  }
  render();
}

function endTurn(m, wasBust) {
  const lv = m.live;
  if (wasBust) lv.scores[lv.turn] = lv.turnStart;
  lv.turn = 1 - lv.turn;
  lv.turnDarts = [];
  lv.turnStart = lv.scores[lv.turn];
}

function winLeg(m, cur) {
  const lv = m.live;
  lv.legsWon[cur]++;
  if (lv.legsWon[cur] >= needed(m.settings.legs)) {
    lv.setsWon[cur]++;
    lv.legsWon = [0, 0];
    if (lv.setsWon[cur] >= needed(m.settings.sets)) { finishMatch(m, cur); return; }
  }
  lv.legNo++;
  lv.scores = [m.settings.game, m.settings.game];
  lv.turn = lv.legNo % 2;
  lv.turnDarts = [];
  lv.turnStart = m.settings.game;
  lv.dblAtt = [0, 0];
  render();
}

function finishMatch(m, cur) {
  m.status = "done";
  m.winner = cur === 0 ? m.p1 : m.p2;
  m.result = { sets: m.live.setsWon.slice() };
  m.live = null;

  if (!S.t) {
    S.view = "match-result";
    render();
    return;
  }

  if (m.stage === "tiebreak") {
    S.t.tiebreaks.push({ winner: m.winner, loser: m.winner === m.p1 ? m.p2 : m.p1 });
  } else {
    maybeAdvancePlayoffs();
  }
  S.view = "tournament";
  S.activeMatch = null;
  render();
}

/* ================= CHECKOUT SUGGESTIONS ================= */
const _options = (() => {
  const o = [];
  for (let n = 20; n >= 1; n--) o.push({ v: n * 3, l: "T" + n, d: false });
  o.push({ v: 50, l: "Bull", d: true });
  for (let n = 20; n >= 1; n--) o.push({ v: n * 2, l: "D" + n, d: true });
  for (let n = 20; n >= 1; n--) o.push({ v: n, l: String(n), d: false });
  o.push({ v: 25, l: "25", d: false });
  return o;
})();
const _coCache = {};
function checkoutPath(score, dartsLeft, dOut) {
  const key = score + "|" + dartsLeft + "|" + dOut;
  if (key in _coCache) return _coCache[key];
  function rec(s, n) {
    if (s <= 0) return null;
    if (n === 1) {
      for (const o of _options) if (o.v === s && (!dOut || o.d)) return [o.l];
      return null;
    }
    const direct = rec(s, 1);
    if (direct) return direct;
    for (const o of _options) {
      if (o.v >= s) continue;
      const rest = rec(s - o.v, n - 1);
      if (rest) return [o.l, ...rest];
    }
    return null;
  }
  const r = rec(score, dartsLeft);
  _coCache[key] = r;
  return r;
}

/* ================= STATISTICS ================= */
function computeStats() {
  const st = {};
  for (const p of S.t.players) st[p.id] = { name: p.name, darts: 0, points: 0, t180: 0, t140: 0, t100: 0, high: 0, bestCo: 0, legs: 0, mWins: 0 };
  for (const m of S.t.matches) {
    const ids = [m.p1, m.p2];
    for (const e of m.log) {
      const s = st[ids[e.player]];
      if (!s) continue;
      s.darts += e.darts; s.points += e.points;
      if (e.points === 180) s.t180++;
      else if (e.points >= 140) s.t140++;
      else if (e.points >= 100) s.t100++;
      if (e.points > s.high) s.high = e.points;
      if (e.checkout && e.checkout > s.bestCo) s.bestCo = e.checkout;
      if (e.legWon) s.legs++;
    }
    if (m.status === "done" && m.stage !== "tiebreak" && !m.result?.forfeit && m.winner != null)
      st[m.winner].mWins++;
  }
  return Object.values(st)
    .map(s => ({ ...s, avg: s.darts ? s.points / s.darts * 3 : 0 }))
    .sort((a, b) => b.mWins - a.mWins || b.avg - a.avg);
}

/* ================= EXPORT / IMPORT ================= */
function exportJSON() {
  const blob = new Blob([JSON.stringify(S.t)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "dart-tournament.json";
  a.click();
  URL.revokeObjectURL(a.href);
}
function migrate(t) {
  if (!t.letters) t.letters = Object.keys(t.groups);
  if (!t.format) t.format = { groups: t.letters.length, qual: 2 };
  if (!t.tiebreaks) t.tiebreaks = [];
  if (!t.stageDefaults) t.stageDefaults = { group: t.defaults, sf: t.defaults, bronze: t.defaults, final: t.defaults };
  return t;
}
function importJSON(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const t = JSON.parse(r.result);
      if (!t || !t.players || !t.matches) throw new Error("invalid");
      S.t = migrate(t); S.singleMatch = null; S.view = "tournament"; S.activeMatch = null; S.adminMode = false;
      render();
    } catch (e) { alert("Could not read the file – is this a valid Dart Counter JSON file?"); }
  };
  r.readAsText(file);
}

/* ================= 180 FLASH ================= */
function flash180() {
  const d = document.createElement("div");
  d.className = "flash";
  d.innerHTML = '<div class="big">180!</div><div class="lbl">🎯 Maximum 🎯</div>';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1450);
}

/* ================= SHARED UI HELPERS ================= */
function outSelect(id, sel) {
  return `<select id="${id}">${["double", "double5", "single"].map(o =>
    `<option value="${o}" ${sel === o ? "selected" : ""}>${OUT_LABELS[o]}</option>`).join("")}</select>`;
}

function stageSettingsBlock(prefix, label, def) {
  return `${label ? `<div class="stage-label" style="margin-top:14px">${label}</div>` : ""}
    <div class="row">
      <div class="field"><label>Game</label>
        <select id="${prefix}-game">
          <option value="501" ${def.game === 501 ? "selected" : ""}>501</option>
          <option value="301" ${def.game === 301 ? "selected" : ""}>301</option>
        </select>
      </div>
      <div class="field"><label>Out</label>${outSelect(prefix + "-out", def.out)}</div>
    </div>
    <div class="row">
      <div class="field"><label>Sets (best of)</label>
        <select id="${prefix}-sets">${[1, 3, 5].map(v => `<option ${def.sets === v ? "selected" : ""}>${v}</option>`).join("")}</select>
      </div>
      <div class="field"><label>Legs per set (best of)</label>
        <select id="${prefix}-legs">${[1, 3, 5].map(v => `<option ${def.legs === v ? "selected" : ""}>${v}</option>`).join("")}</select>
      </div>
    </div>`;
}

function readStageSettings(prefix) {
  return {
    game: parseInt($("#" + prefix + "-game").value),
    out: $("#" + prefix + "-out").value,
    sets: parseInt($("#" + prefix + "-sets").value),
    legs: parseInt($("#" + prefix + "-legs").value)
  };
}

/* ================= VIEWS ================= */

/* --- Home --- */
function vHome() {
  const resumeHtml = S.singleMatch?.status === "live"
    ? `<button class="btn btn-red" id="resume-single-btn">
        🎯 Resume: ${esc(S.singleMatch.names[0])} vs ${esc(S.singleMatch.names[1])}
      </button><div style="height:10px"></div>`
    : "";
  return `<div class="wrap">
    <div class="hero">
      <div class="board"></div>
      <h1>Dart <span class="accent">Counter</span></h1>
      <div class="sub">Score · Tournament · Stats</div>
    </div>
    ${resumeHtml}
    <div class="mode-grid">
      <button class="mode-card" id="quick-match-btn">
        <div class="mode-icon">🎯</div>
        <div class="mode-title">Quick Match</div>
        <div class="mode-desc">One-on-one match with full scoring</div>
      </button>
      <button class="mode-card" id="tournament-btn">
        <div class="mode-icon">🏆</div>
        <div class="mode-title">Tournament</div>
        <div class="mode-desc">Group stage + knockout, 3–16 players</div>
      </button>
    </div>
    <div style="height:10px"></div>
    <button class="btn btn-ghost" id="import-home-btn">⬆ Load saved tournament (JSON)</button>
    <input type="file" id="import-home-file" accept=".json,application/json" class="hidden">
  </div>`;
}

/* --- Quick Match Setup --- */
function vSetupMatch() {
  const prev = S.singleMatch;
  const def = prev?.settings || { game: 501, out: "double", sets: 1, legs: 3 };
  const p1 = prev?.names?.[0] || "";
  const p2 = prev?.names?.[1] || "";
  return `<div class="wrap">
    <div class="hero" style="padding-top:20px">
      <h1>Quick <span class="accent">Match</span></h1>
    </div>
    <div class="card"><h2>Players</h2>
      <div class="field"><label>Player 1</label>
        <input id="qm-p1" maxlength="20" placeholder="Name..." value="${esc(p1)}"></div>
      <div class="field"><label>Player 2</label>
        <input id="qm-p2" maxlength="20" placeholder="Name..." value="${esc(p2)}"></div>
    </div>
    <div class="card"><h2>Format</h2>
      ${stageSettingsBlock("qm", "", def)}
    </div>
    <button class="btn btn-red" id="qm-start-btn">🎯 Start Match</button>
    <div style="height:8px"></div>
    <button class="btn btn-ghost" id="qm-back-btn">← Back</button>
  </div>`;
}

/* --- Tournament Setup --- */
function playerRowHTML(name) {
  return `<div class="prow">
    <input class="pname-in" maxlength="20" placeholder="Name..." value="${esc(name || "")}">
    <button class="px" data-del title="Remove">✕</button>
  </div>`;
}

function vSetupTournament() {
  let rows = "";
  for (let i = 0; i < 4; i++) rows += playerRowHTML("");
  return `<div class="wrap">
    <div class="hero" style="padding-top:20px">
      <h1>New <span class="accent">Tournament</span></h1>
    </div>
    <div class="card"><h2>Players</h2>
      <div id="players">${rows}</div>
      <button class="btn btn-ghost" id="add-player">+ Add player</button>
      <p class="note">3–5 players → one group (top 4 to semi-finals) · 6+ → two groups, top 2 from each to semi-finals. Uneven groups play one fewer match.</p>
    </div>
    <div class="card"><h2>Format per stage</h2>
      ${stageSettingsBlock("g", "Group Stage", { game: 501, out: "double", sets: 1, legs: 3 })}
      ${stageSettingsBlock("s", "Semi-finals", { game: 501, out: "double", sets: 1, legs: 3 })}
      ${stageSettingsBlock("b", "Third Place", { game: 501, out: "double", sets: 1, legs: 3 })}
      ${stageSettingsBlock("f", "Final", { game: 501, out: "double", sets: 1, legs: 5 })}
      <label class="check"><input type="checkbox" id="def-bronze" checked>
        <span>Play third place match</span></label>
      <p class="note">Ties are broken by sudden death (1 leg, group format). Settings can be adjusted before each match.</p>
    </div>
    <button class="btn btn-red" id="create-btn">🎯 Draw groups & start</button>
    <div style="height:10px"></div>
    <button class="btn btn-ghost" id="back-to-home-btn">← Back</button>
  </div>`;
}

/* --- Tournament Overview --- */
function matchRow(m) {
  const adm = S.adminMode && S.t;
  const n1 = esc(pName(m.p1)), n2 = esc(pName(m.p2));
  let right;
  if (m.status === "done") {
    const wo = m.result?.forfeit ? ' <span class="badge">W/O</span>' : "";
    right = `<span class="res">${m.result.sets[0]}–${m.result.sets[1]}${wo}</span>`;
  } else if (m.status === "live") {
    right = `<button class="btn btn-sm btn-red" data-resume="${m.id}">Resume</button>`;
  } else {
    right = `<button class="btn btn-sm btn-green" data-play="${m.id}">Play</button>`;
  }
  const w1 = m.status === "done" && m.winner === m.p1 ? ' style="color:var(--green)"' : "";
  const w2 = m.status === "done" && m.winner === m.p2 ? ' style="color:var(--green)"' : "";

  let adminRow = "";
  if (adm) {
    if (m.status !== "done") {
      adminRow = `<div class="admin-actions">
        <span class="admin-label">Forfeit win to:</span>
        <button class="btn btn-sm" data-forfeit="${m.id}|${m.p1}">${esc(pName(m.p1))}</button>
        <button class="btn btn-sm" data-forfeit="${m.id}|${m.p2}">${esc(pName(m.p2))}</button>
      </div>`;
    } else {
      adminRow = `<div class="admin-actions">
        <button class="btn btn-sm btn-ghost" data-reset="${m.id}">↩ Reset result</button>
      </div>`;
    }
  }

  return `<div class="mrow-wrap">
    <div class="mrow">
      <div class="names"><span${w1}>${n1}</span><span class="vs">vs</span><span${w2}>${n2}</span></div>
      ${right}
    </div>${adminRow}
  </div>`;
}

function vTournament() {
  const t = S.t;
  const adm = S.adminMode;
  let html = `<div class="wrap">
    <div class="tour-header">
      <h1 class="small-title">Dart <span class="accent">Tournament</span></h1>
      <button class="btn btn-sm ${adm ? "btn-brass" : ""}" id="admin-toggle">
        ${adm ? "🔓 Admin On" : "🔒 Admin"}
      </button>
    </div>`;

  if (t.champion !== null) {
    html += `<div class="champ"><div class="t">🏆 Champion 🏆</div><div class="n">${esc(pName(t.champion))}</div></div>`;
  }

  if (adm) {
    html += `<div class="card admin-panel"><h2>Edit Player Names</h2>`;
    for (const p of t.players) {
      html += `<div class="field"><label>Player ${p.id + 1}</label>
        <input class="admin-name-input" data-pid="${p.id}" value="${esc(p.name)}" maxlength="20"></div>`;
    }
    html += `<button class="btn btn-sm btn-green" id="save-names-btn" style="width:100%">Save Names</button></div>`;
  }

  const qual = t.format.groups === 1 ? t.format.qual : 2;
  for (const L of t.letters) {
    const rows = groupStanding(L);
    html += `<div class="card"><h2>${GROUP_NAMES[L]}</h2>
      <table>
        <tr><th>Player</th><th class="num">P</th><th class="num">W</th><th class="num">Legs</th><th class="num">+/−</th></tr>`;
    rows.forEach((r, i) => {
      html += `<tr${i < qual ? ' class="qual"' : ""}><td>${esc(pName(r.id))}</td>
        <td class="num">${r.played}</td><td class="num">${r.wins}</td>
        <td class="num">${r.lf}–${r.la}</td>
        <td class="num">${r.lf - r.la > 0 ? "+" : ""}${r.lf - r.la}</td></tr>`;
    });
    html += `</table></div>`;
  }

  html += `<div class="card"><h2>Group Stage</h2>`;
  for (const L of t.letters) {
    if (t.letters.length > 1) html += `<div class="stage-label">${GROUP_NAMES[L]}</div>`;
    for (const m of t.matches.filter(m => m.stage === "group" && m.group === L)) html += matchRow(m);
  }
  const tbMatches = t.matches.filter(m => m.stage === "tiebreak");
  if (tbMatches.length) {
    html += `<div class="stage-label">Tiebreak – sudden death</div>`;
    for (const m of tbMatches) html += matchRow(m);
  }
  html += `</div>`;

  html += `<div class="card"><h2>Playoffs</h2>`;
  if (!t.playoffsStarted) {
    if (!groupStageDone()) {
      html += `<p class="note">Playoffs unlock when all group matches are played.</p>`;
    } else {
      const needs = neededTiebreaks();
      const pend = pendingTiebreaks();
      if (needs.length || pend.length) {
        html += `<p class="warn">⚖️ Standings require a tiebreak before playoffs can start:</p>`;
        for (const n of needs) {
          html += `<div class="mrow"><div class="names">${esc(pName(n.a))}<span class="vs">vs</span>${esc(pName(n.b))}</div>
            <button class="btn btn-sm btn-brass" data-tiebreak="${n.g}|${n.a}|${n.b}">Create sudden death</button></div>`;
        }
        if (pend.length) html += `<p class="note">Play the tiebreak matches above.</p>`;
      } else {
        html += `<button class="btn btn-green" id="playoff-btn">Start Playoffs</button>`;
      }
    }
  } else {
    for (const st of ["sf1", "sf2", "bronze", "final"]) {
      const m = t.matches.find(x => x.stage === st);
      if (!m) continue;
      html += `<div class="stage-label">${STAGE_LABELS[st]}</div>` + matchRow(m);
    }
    if (!t.matches.find(x => x.stage === "final")) {
      html += `<p class="note">Next round is created automatically when the current one finishes.</p>`;
    }
  }
  html += `</div>`;

  html += `<div class="card"><h2>Save / Load</h2>
    <p class="note" style="margin:0 0 10px">Data only lives in memory – export before closing the browser!</p>
    <div class="row">
      <button class="btn btn-sm" id="export-btn" style="width:100%">⬇ Export JSON</button>
      <button class="btn btn-sm" id="import-btn" style="width:100%">⬆ Import JSON</button>
    </div>
    <input type="file" id="import-file" accept=".json,application/json" class="hidden">
    <div style="height:10px"></div>
    <button class="btn btn-ghost" id="end-tournament-btn">End tournament & go home</button>
  </div>`;

  html += `</div>`;
  return html;
}

/* --- Pre-match --- */
function vPrematch() {
  const m = S.t ? S.t.matches.find(x => x.id === S.activeMatch) : S.singleMatch;
  if (!m) return vNoMatch();
  const s = m.settings;
  const names = S.t ? [pName(m.p1), pName(m.p2)] : m.names;
  return `<div class="wrap">
    <h2 class="small-title">${esc(names[0])} <span class="accent">vs</span> ${esc(names[1])}</h2>
    ${m.stage === "tiebreak" ? '<p class="warn" style="text-align:center">⚖️ Sudden death – one leg decides!</p>' : ""}
    <div class="card"><h2>Match Settings</h2>
      ${stageSettingsBlock("m", "", s)}
    </div>
    <button class="btn btn-red" id="start-match-btn">🎯 Start Match</button>
    <div style="height:10px"></div>
    <button class="btn btn-ghost" id="back-btn">← Back</button>
  </div>`;
}

function vNoMatch() {
  if (S.t) {
    const live = S.t.matches.find(m => m.status === "live");
    if (live) { S.activeMatch = live.id; return vMatch(); }
  }
  return `<div class="wrap"><div class="card" style="text-align:center;padding:30px">
    <h2 style="margin-bottom:8px">No active match</h2>
    <p class="note">Select a match to play from the tournament view.</p>
  </div></div>`;
}

/* --- Live Match Scorer --- */
function vMatch() {
  const m = S.t ? S.t.matches.find(x => x.id === S.activeMatch) : S.singleMatch;
  if (!m || !m.live) return vNoMatch();
  const lv = m.live, s = m.settings;
  const names = S.t ? [pName(m.p1), pName(m.p2)] : m.names;
  const dartsLeft = 3 - lv.turnDarts.length;

  let sbs = "";
  for (const i of [0, 1]) {
    const active = lv.turn === i;
    let dbl = "";
    if (s.out === "double5") {
      dbl = lv.dblAtt[i] >= 5
        ? `<div class="dbl">Single out applies</div>`
        : `<div class="dbl">Double attempts: ${lv.dblAtt[i]}/5</div>`;
    }
    sbs += `<div class="sb ${active ? "active" : ""}">
      ${active ? '<div class="turnmark"></div>' : ""}
      <div class="pname">${esc(names[i])}</div>
      <div class="pscore">${lv.scores[i]}</div>
      <div class="meta">Set ${lv.setsWon[i]} · Legs ${lv.legsWon[i]}</div>${dbl}
    </div>`;
  }

  let co = "";
  const score = lv.scores[lv.turn];
  const eff = effOut(m, lv.turn);
  if (score <= (eff === "single" ? 180 : 170)) {
    const path = checkoutPath(score, dartsLeft, eff === "double");
    if (path) co = `<span>Checkout: ${path.join(" · ")}</span>`;
  }

  let slots = "";
  for (let i = 0; i < 3; i++) {
    const v = lv.turnDarts[i];
    slots += `<div class="dart-slot ${v !== undefined ? "filled" : ""}">${v !== undefined ? esc(v) : "–"}</div>`;
  }

  let nums = "";
  for (let n = 1; n <= 20; n++) nums += `<button data-num="${n}">${n}</button>`;

  const starter = lv.legNo % 2;
  return `<div class="scorer">
    <div class="match-head">
      <div class="fmt">${s.game} · ${OUT_LABELS[s.out]} · Best of ${s.sets} sets · ${s.legs} legs/set${m.stage === "tiebreak" ? " · SUDDEN DEATH" : ""}</div>
      <div class="fmt" style="color:var(--brass)">Leg ${lv.legNo + 1} – ${esc(names[starter])} throws first</div>
    </div>
    <div class="scoreboards">${sbs}</div>
    <div class="checkout">${co}</div>
    <div class="darts">${slots}</div>
    <div class="mults">
      <button data-mult="1" class="${lv.mult === 1 ? "on" : ""}">Single</button>
      <button data-mult="2" class="${lv.mult === 2 ? "on" : ""}">Double</button>
      <button data-mult="3" class="${lv.mult === 3 ? "on" : ""}">Triple</button>
    </div>
    <div class="numpad">
      ${nums}
      <button class="special" data-special="25">25</button>
      <button class="special" data-special="bull">Bull</button>
      <button class="special miss" data-special="miss">Miss</button>
      <button class="special" data-undo ${lv.history.length ? "" : "disabled"}>↶ Undo</button>
      <button class="special" data-leave>Pause</button>
    </div>
  </div>`;
}

/* --- Match Paused (quick match only) --- */
function vMatchPaused() {
  const m = S.singleMatch;
  if (!m || !m.live) { S.view = "home"; return vHome(); }
  return `<div class="wrap">
    <div class="result-card">
      <div class="result-label">Match Paused</div>
      <div class="result-players">${esc(m.names[0])} vs ${esc(m.names[1])}</div>
      <div class="result-score">${m.live.setsWon[0]} – ${m.live.setsWon[1]}</div>
      <div class="result-loser">Sets · Leg ${m.live.legNo + 1}</div>
    </div>
    <button class="btn btn-red" id="resume-match-btn">🎯 Resume Match</button>
    <div style="height:8px"></div>
    <button class="btn btn-ghost" id="quit-match-btn">✕ Quit Match</button>
  </div>`;
}

/* --- Match Result (quick match only) --- */
function vMatchResult() {
  const m = S.singleMatch;
  if (!m || m.status !== "done") { S.view = "home"; return vHome(); }
  const wi = m.winner;
  const [s0, s1] = m.result.sets;
  return `<div class="wrap">
    <div class="result-card">
      <div class="result-label">Winner</div>
      <div class="result-winner">${esc(m.names[wi])}</div>
      <div class="result-score">${s0} – ${s1}</div>
      <div class="result-loser">${esc(m.names[1 - wi])}</div>
    </div>
    <button class="btn btn-red" id="rematch-btn">🎯 Rematch</button>
    <div style="height:8px"></div>
    <button class="btn btn-ghost" id="new-match-btn">Change Settings</button>
    <div style="height:8px"></div>
    <button class="btn btn-ghost" id="home-result-btn">← Home</button>
  </div>`;
}

/* --- Stats --- */
function vStats() {
  const st = computeStats();
  let rows = "";
  for (const s of st) {
    rows += `<tr>
      <td>${esc(s.name)}</td>
      <td class="num">${s.mWins}</td>
      <td class="num">${s.legs}</td>
      <td class="num">${s.avg ? s.avg.toFixed(1) : "–"}</td>
      <td class="num">${s.high || "–"}</td>
      <td class="num">${s.t180}</td>
      <td class="num">${s.t140}</td>
      <td class="num">${s.t100}</td>
      <td class="num">${s.bestCo || "–"}</td>
    </tr>`;
  }
  return `<div class="wrap">
    <h1 class="small-title">Stats 📊</h1>
    <div class="card">
      <div class="scrollx"><table>
        <tr>
          <th>Player</th><th class="num">W</th><th class="num">Legs</th>
          <th class="num">Avg</th><th class="num">High</th>
          <th class="num">180</th><th class="num">140+</th><th class="num">100+</th>
          <th class="num">Best CO</th>
        </tr>
        ${rows}
      </table></div>
      <p class="note">Avg = 3-dart average. Best CO = best checkout. Forfeits and tiebreaks excluded from match wins.</p>
    </div>
  </div>`;
}

/* ================= RENDER ================= */
function render() {
  const app = $("#app");
  const nav = $("#nav");

  const inTournament = S.t && ["tournament", "prematch", "match", "stats"].includes(S.view);
  const inSingleMatch = S.singleMatch && ["match", "match-paused", "match-result"].includes(S.view);

  nav.classList.toggle("hidden", !(inTournament || inSingleMatch));

  if (inTournament) {
    nav.innerHTML = `
      <button data-v="tournament"><span class="ico">🏆</span>Tournament</button>
      <button data-v="match"><span class="ico">🎯</span>Match</button>
      <button data-v="stats"><span class="ico">📊</span>Stats</button>`;
    nav.querySelectorAll("button").forEach(b => {
      b.classList.toggle("on", b.dataset.v === S.view ||
        (b.dataset.v === "match" && (S.view === "match" || S.view === "prematch")));
    });
  } else if (inSingleMatch) {
    nav.innerHTML = `<button data-v="match" class="${S.view === "match" ? "on" : ""}"><span class="ico">🎯</span>Match</button>`;
  }

  if (S.view === "home")                app.innerHTML = vHome();
  else if (S.view === "setup-match")    app.innerHTML = vSetupMatch();
  else if (S.view === "setup-tournament") app.innerHTML = vSetupTournament();
  else if (S.view === "tournament")     app.innerHTML = vTournament();
  else if (S.view === "prematch")       app.innerHTML = vPrematch();
  else if (S.view === "match")          app.innerHTML = vMatch();
  else if (S.view === "match-paused")   app.innerHTML = vMatchPaused();
  else if (S.view === "match-result")   app.innerHTML = vMatchResult();
  else if (S.view === "stats")          app.innerHTML = vStats();

  bind();
}

/* ================= EVENT BINDING ================= */
function bind() {
  // Nav
  $("#nav").querySelectorAll("button[data-v]").forEach(b => {
    b.onclick = () => { S.view = b.dataset.v; render(); };
  });

  // ---- HOME ----
  const resumeSingle = $("#resume-single-btn");
  if (resumeSingle) resumeSingle.onclick = () => { S.view = "match"; render(); };

  const qmb = $("#quick-match-btn");
  if (qmb) qmb.onclick = () => { S.view = "setup-match"; render(); };

  const trnBtn = $("#tournament-btn");
  if (trnBtn) trnBtn.onclick = () => { S.view = "setup-tournament"; render(); };

  const ihb = $("#import-home-btn");
  if (ihb) ihb.onclick = () => $("#import-home-file").click();
  const ihf = $("#import-home-file");
  if (ihf) ihf.onchange = (e) => { if (e.target.files[0]) importJSON(e.target.files[0]); };

  // ---- QUICK MATCH SETUP ----
  const qmStart = $("#qm-start-btn");
  if (qmStart) qmStart.onclick = () => {
    const p1 = $("#qm-p1").value.trim() || "Player 1";
    const p2 = $("#qm-p2").value.trim() || "Player 2";
    if (p1 === p2) { alert("Players cannot have the same name."); return; }
    const settings = readStageSettings("qm");
    S.t = null;
    S.singleMatch = {
      id: 0, stage: "single", group: null, p1: 0, p2: 1,
      names: [p1, p2], settings,
      status: "pending", winner: null, live: null, log: [], result: null
    };
    startMatchLive(S.singleMatch);
    S.view = "match";
    render();
  };

  const qmBack = $("#qm-back-btn");
  if (qmBack) qmBack.onclick = () => { S.view = "home"; render(); };

  // ---- MATCH RESULT ----
  const rematchBtn = $("#rematch-btn");
  if (rematchBtn) rematchBtn.onclick = () => {
    const old = S.singleMatch;
    S.singleMatch = { ...old, status: "pending", winner: null, live: null, log: [], result: null };
    startMatchLive(S.singleMatch);
    S.view = "match";
    render();
  };

  const newMatchBtn = $("#new-match-btn");
  if (newMatchBtn) newMatchBtn.onclick = () => { S.view = "setup-match"; render(); };

  const homeResultBtn = $("#home-result-btn");
  if (homeResultBtn) homeResultBtn.onclick = () => { S.singleMatch = null; S.view = "home"; render(); };

  // ---- MATCH PAUSED ----
  const resumeMatchBtn = $("#resume-match-btn");
  if (resumeMatchBtn) resumeMatchBtn.onclick = () => { S.view = "match"; render(); };

  const quitMatchBtn = $("#quit-match-btn");
  if (quitMatchBtn) quitMatchBtn.onclick = () => { S.singleMatch = null; S.view = "home"; render(); };

  // ---- TOURNAMENT SETUP ----
  const bthb = $("#back-to-home-btn");
  if (bthb) bthb.onclick = () => { S.view = "home"; render(); };

  const players = $("#players");
  if (players) {
    players.onclick = (e) => {
      const btn = e.target.closest("[data-del]");
      if (!btn) return;
      if (players.querySelectorAll(".prow").length > 3) btn.closest(".prow").remove();
      else alert("At least 3 players are required.");
    };
    const ap = $("#add-player");
    if (ap) ap.onclick = () => {
      if (players.querySelectorAll(".prow").length >= 16) { alert("Maximum 16 players."); return; }
      players.insertAdjacentHTML("beforeend", playerRowHTML(""));
    };
    const mo = $("#music-on");
    if (mo) mo.onchange = () => $("#music-fields").classList.toggle("hidden", !mo.checked);
  }

  const cb = $("#create-btn");
  if (cb) cb.onclick = () => {
    const rows = Array.from(document.querySelectorAll("#players .prow"));
    const playerData = [];
    const seen = new Set();
    for (let i = 0; i < rows.length; i++) {
      const name = rows[i].querySelector(".pname-in").value.trim() || "Player " + (i + 1);
      if (seen.has(name)) { alert(`Two players can't have the same name (${name}).`); return; }
      seen.add(name);
      playerData.push({ name });
    }
    if (playerData.length < 3) { alert("At least 3 players are required."); return; }
    const stageDefaults = {
      group: readStageSettings("g"), sf: readStageSettings("s"),
      bronze: readStageSettings("b"), final: readStageSettings("f")
    };
    S.singleMatch = null;
    createTournament(playerData, stageDefaults, $("#def-bronze").checked);
    S.view = "tournament";
    render();
  };

  // ---- TOURNAMENT VIEW ----
  const adminToggle = $("#admin-toggle");
  if (adminToggle) adminToggle.onclick = () => { S.adminMode = !S.adminMode; render(); };

  const saveNames = $("#save-names-btn");
  if (saveNames) saveNames.onclick = savePlayerNames;

  const endTBtn = $("#end-tournament-btn");
  if (endTBtn) endTBtn.onclick = () => {
    if (confirm("End this tournament and return to the home screen?")) {
      S.t = null; S.activeMatch = null; S.adminMode = false; S.view = "home"; render();
    }
  };

  const eb = $("#export-btn"); if (eb) eb.onclick = exportJSON;
  const ib = $("#import-btn"); if (ib) ib.onclick = () => $("#import-file").click();
  const iff = $("#import-file");
  if (iff) iff.onchange = (e) => { if (e.target.files[0]) importJSON(e.target.files[0]); };

  document.querySelectorAll("[data-play]").forEach(b => {
    b.onclick = () => { S.activeMatch = parseInt(b.dataset.play); S.view = "prematch"; render(); };
  });
  document.querySelectorAll("[data-resume]").forEach(b => {
    b.onclick = () => { S.activeMatch = parseInt(b.dataset.resume); S.view = "match"; render(); };
  });
  document.querySelectorAll("[data-tiebreak]").forEach(b => {
    b.onclick = () => {
      const [g, a, bid] = b.dataset.tiebreak.split("|");
      createTiebreak(g, parseInt(a), parseInt(bid));
      render();
    };
  });

  const pb = $("#playoff-btn");
  if (pb) pb.onclick = () => { startPlayoffs(); render(); };

  // Admin actions
  document.querySelectorAll("[data-forfeit]").forEach(b => {
    b.onclick = () => {
      const [mid, pid] = b.dataset.forfeit.split("|");
      const winnerName = pName(parseInt(pid));
      if (confirm(`Award the win to ${winnerName}?`)) forfeitMatch(parseInt(mid), parseInt(pid));
    };
  });
  document.querySelectorAll("[data-reset]").forEach(b => {
    b.onclick = () => {
      const mid = parseInt(b.dataset.reset);
      const m = S.t.matches.find(x => x.id === mid);
      const cascade = (m.stage === "sf1" || m.stage === "sf2")
        ? " Final and third place matches will also be removed." : "";
      if (confirm(`Reset this match result?${cascade}`)) resetMatch(mid);
    };
  });

  // ---- PRE-MATCH ----
  const smb = $("#start-match-btn");
  if (smb) smb.onclick = () => {
    const settings = readStageSettings("m");
    if (S.t) {
      const m = S.t.matches.find(x => x.id === S.activeMatch);
      m.settings = settings;
      startMatchLive(m);
    } else {
      S.singleMatch.settings = settings;
      startMatchLive(S.singleMatch);
    }
    S.view = "match";
    render();
  };

  const bb = $("#back-btn");
  if (bb) bb.onclick = () => {
    S.view = S.t ? "tournament" : "setup-match";
    S.activeMatch = null;
    render();
  };

  // ---- LIVE MATCH ----
  const curMatch = S.t ? S.t.matches.find(x => x.id === S.activeMatch) : S.singleMatch;
  if (curMatch && curMatch.live && S.view === "match") {
    document.querySelectorAll("[data-mult]").forEach(b => {
      b.onclick = () => { curMatch.live.mult = parseInt(b.dataset.mult); render(); };
    });
    document.querySelectorAll("[data-num]").forEach(b => {
      b.onclick = () => {
        const n = parseInt(b.dataset.num);
        const mult = curMatch.live.mult;
        const label = (mult === 2 ? "D" : mult === 3 ? "T" : "") + n;
        throwDart(curMatch, n * mult, mult === 2, label);
      };
    });
    document.querySelectorAll("[data-special]").forEach(b => {
      b.onclick = () => {
        const k = b.dataset.special;
        if (k === "25") throwDart(curMatch, 25, false, "25");
        else if (k === "bull") throwDart(curMatch, 50, true, "Bull");
        else throwDart(curMatch, 0, false, "0");
      };
    });
    const ub = document.querySelector("[data-undo]");
    if (ub) ub.onclick = () => undo(curMatch);
    const lb = document.querySelector("[data-leave]");
    if (lb) lb.onclick = () => { S.view = S.t ? "tournament" : "match-paused"; render(); };
  }
}

render();
