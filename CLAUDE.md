# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this project is

`priority-ledger.html` is a single self-contained file (HTML + CSS + JS, no build step, no dependencies) meant to run as a **Claude.ai artifact**. It's a personal task tracker for the project owner: four categories (Family Business, Game & Software, Estate Upkeep, Personal/Misc), plus a Daily tab for day-by-day priority lists.

Keep it a single file unless explicitly asked to split it up. That constraint is intentional — it's what lets it be pasted back into a Claude.ai conversation and rendered as an artifact in one shot.

## Architecture (read before editing)

- **State** lives in one in-memory object: `state = { location, tasks: [], days: [] }`. Everything persists as one JSON blob under a single storage key (`tracker-state`) — don't split it into multiple keys.
- **Storage**: all reads/writes go through the `storage` adapter defined near the top of the `<script>` block, not `window.storage` directly. That adapter uses the real Claude.ai artifact storage when available and falls back to `localStorage` for local testing. Always call `storage.get`/`storage.set` — never call `window.storage` directly, or local dev breaks.
- **Categories**: defined once in the `CATEGORIES` config object, including a `locations` array (`['MA']`, `['MA','Argentina']`, etc.) that controls which tabs show depending on the location toggle. Add new categories there, not by hardcoding strings elsewhere.
- **Rendering**: no framework, just template strings + `innerHTML`. `taskRowHtml(task, showDot, inDaily)` is the single shared renderer for a task row — used both by the normal category tabs and by the Daily day-detail view. Edit it once, both places update. Don't fork it.
- **The Daily tab** is a parallel view, not a category. `render()` branches between `#categoryView` and `#dailyView` based on `activeTab`. Both containers stay in the DOM; whichever one is inactive gets its `innerHTML` cleared on each render to avoid duplicate element IDs (task rows use `id="exp-<taskId>"`, which must stay unique).
- **IDs**: use the `newId(prefix)` helper for anything created in a loop (e.g. duplicating tasks) to avoid `Date.now()` collisions. Simple one-off creations can still use `newId(...)` for consistency.

## Conventions

- No inline `style=` attributes for anything reused more than once — add a class instead.
- Keep the ledger/estate visual identity (Fraunces serif for display text, IBM Plex Sans/Mono for UI, the parchment-on-desk palette in `:root`). Don't introduce a generic Tailwind-style look.
- Buttons that mutate state are `async` and call `saveState()` then `render()` (or a more targeted render function) — follow that pattern for new mutations rather than mutating `state` without persisting.
- `sortTasks()` is the canonical sort (urgent first, then due date, done tasks last). Reuse it rather than re-sorting inline.

## Testing locally

Open `priority-ledger.html` directly in a browser, or:

```
python3 -m http.server 8000
```

`window.storage` won't exist outside claude.ai, so the storage adapter automatically uses `localStorage` instead — this is expected and is not something to "fix."

## After making changes

This repo is not connected to any live Claude.ai artifact — pushing here does not update anything in a conversation. To get changes back into Claude.ai, the project owner needs to upload or paste the updated `priority-ledger.html` into a conversation and ask Claude to render it as an artifact. Mention this if you make a change that the owner will want to see live.
