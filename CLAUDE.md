# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running locally

No build step, no dependencies. Open `index.html` directly in a browser, or:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Architecture

Pure vanilla HTML/CSS/JS — no framework, no bundler, no npm. Three files hold everything:

- `index.html` — shell with `#app` mount point, nav bar, and music overlay
- `css/style.css` — all styling
- `js/app.js` — all logic: state, tournament engine, match engine, checkout calculator, views, event binding

### State

A single global object `S` holds all runtime state:

```js
let S = { view: "setup", t: null, activeMatch: null };
```

`S.t` is the tournament object (null until created). It holds `players`, `groups`, `matches`, `stageDefaults`, `tiebreaks`, `format`, and `champion`.

### Render loop

Every state change calls `render()`, which replaces `#app` innerHTML with the output of the current view function (`vSetup`, `vTournament`, `vPrematch`, `vMatch`, `vStats`), then calls `bind()` to re-attach all event listeners. There is no virtual DOM or diffing — the whole page re-renders.

### Tournament flow

1. **Setup** (`vSetup`) — collect players and per-stage format settings, call `createTournament()` which shuffles players into 1 or 2 groups and generates round-robin group matches.
2. **Group stage** — each match goes through `vPrematch` (settings confirmation) → `vMatch` (live scorer). `throwDart()` → `endTurn()` / `winLeg()` → `finishMatch()`.
3. **Tiebreaks** — `neededTiebreaks()` detects unresolved ties after group stage is done; sudden-death legs created via `createTiebreak()`.
4. **Playoffs** — `startPlayoffs()` creates sf1/sf2; `maybeAdvancePlayoffs()` (called from `finishMatch`) creates bronze/final when semis are done and sets `t.champion`.

### Match engine key functions

- `throwDart(m, value, isDouble, label)` — core dart-scoring logic; handles bust detection, 3-dart turn end, leg win, set win, match win.
- `snapshot(m)` / `undo(m)` — history stored as JSON strings in `m.live.history` (capped at 120 entries).
- `checkoutPath(score, dartsLeft, dOut)` — recursive checkout suggestion with memoization in `_coCache`.
- `effOut(m, idx)` — resolves `double5` rule (switches to single after 5 double attempts).

### Data persistence

All data lives in memory. `exportJSON()` downloads `S.t` as a JSON file; `importJSON(file)` restores it via `migrate()` which handles forward-compatibility for older saved files. The `version` field on `S.t` is currently `3`.

### Tiebreak resolution order (groupStanding)

Within a win-tied block: head-to-head wins → head-to-head leg difference → overall leg difference → overall legs won → `tiebreakBetween()` (sudden-death result). If still unresolved, `unresolved` is set on the row to trigger tiebreak match creation.
