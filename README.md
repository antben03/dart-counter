# Dart Counter

A browser-based dart scorer and tournament manager. No install, no server, no dependencies – just open `index.html`.

## Features

- **Quick Match** – score a one-on-one 501/301 match with full stats tracking
- **Tournament mode** – 3–16 players, automatic group draw, knockout playoffs
- **Flexible format** – 501 or 301, single/double/double-out (with max-5-attempt rule), configurable sets and legs per stage
- **Checkout suggestions** – shows the optimal finish path as you play
- **Undo** – step back dart by dart
- **Tiebreaks** – sudden-death leg when the group table is level
- **Admin mode** – edit player names, forfeit matches, and reset results mid-tournament
- **Export / Import** – save and restore tournaments as JSON

## Running locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just open `index.html` directly in any modern browser.

## Structure

```
index.html        # Shell
css/style.css     # All styling
js/app.js         # All logic (tournament engine, match scorer, views)
favicon.svg
```

All tournament data lives in memory. Use **Export JSON** to save progress and **Import JSON** to resume later.

## License

MIT – see [LICENSE](LICENSE).
