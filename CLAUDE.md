# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this project is

`priority-ledger.html` is a single self-contained file (HTML + CSS + JS, no build step, no npm dependencies) that runs two ways: hosted on **GitHub Pages** as the primary, day-to-day app (cross-device, login-gated, synced via Supabase), and it can still be pasted into a **Claude.ai** conversation and rendered as an artifact for quick previewing. It's a personal task tracker for the project owner: four categories (Family Business, Game & Software, Estate Upkeep, Personal/Misc), plus a Daily tab for day-by-day priority lists.

Keep it a single file unless explicitly asked to split it up. That constraint is intentional — it's what lets it be pasted back into a Claude.ai conversation and rendered as an artifact in one shot, and it keeps the GitHub Pages deploy to "just push the file."

## Architecture (read before editing)

- **State** lives in one in-memory object: `state = { location, tasks: [], days: [], categories: [], locations: [], locationEnabled }`. Everything persists as one JSON blob under a single storage key (`tracker-state`) — don't split it into multiple keys.
- **Storage**: all reads/writes go through the `storage` adapter defined near the top of the `<script>` block, not `window.storage` directly. Always call `storage.get`/`storage.set` — never bypass the adapter. It tries three sources in priority order:
  1. `window.storage` — the real Claude.ai artifact storage, present only when pasted into a claude.ai conversation.
  2. Supabase (Postgres + Auth + REST, via plain `fetch` — no supabase-js dependency) — the primary path for the hosted app. Each signed-in user has exactly one row in the `ledger_state` table, keyed by `user_id`, protected by a Row Level Security policy (`auth.uid() = user_id`) so the same public anon key can't be used to read/write another user's data. Auth tokens are refreshed via `ensureFreshSession()` before every call; if refresh fails, `forceReauth()` clears the session and kicks back to the login screen rather than silently degrading storage.
  3. `localStorage` — **only** when the user explicitly picks "Continue without an account" on the login screen (`localOnlyMode = true`). This is single-device local testing, not a network-failure fallback — storage never silently drops from Supabase to `localStorage` on its own, since that would mean data quietly stops syncing without the user knowing.
- **Auth**: `SUPABASE_URL` / `SUPABASE_ANON_KEY` near the top of the script hold the project's public config (safe to be public — RLS is what actually protects data, not the key). Login/signup UI lives in `#authShell`; the app itself lives in `#appShell`; `init()` decides which to show on load.
- **Categories are per-user data, not config**: `state.categories` is an array of `{ id, label, hex, locations }` (`locations` here is which location ids the tab shows under). `CATEGORIES` is a plain id-keyed lookup object rebuilt from `state.categories` by `rebuildCategoriesIndex()` on every load and every category mutation — call sites still read it as `CATEGORIES[key]` / `Object.entries(CATEGORIES)` like before, they just can't assume it's static. `defaultCategories()` seeds new accounts (and migrates pre-existing accounts that predate this feature, via `normalizeState()`) with the original five. Deleting a category never touches tasks — a task keeps whatever `category` id it already had, and once no tab matches that id it just falls back to showing under "All" only, styled via `FALLBACK_CATEGORY` in `taskRowHtml`. That's the whole safety mechanism against losing tasks to a deletion; don't add a separate "reassign tasks" step, it's redundant. `tabOrder()` (not a fixed array) builds the tab list as `['all', ...categories, 'daily']`.
- **Locations are also per-user data**: `state.locations` is a fixed-size array of `{ id, label }` (ids stay `'MA'`/`'Argentina'` forever so category `.locations` arrays never need migrating — only `label` is user-editable), plus `state.locationEnabled` to turn the whole feature off. When disabled, `visibleTabs()` ignores per-category `locations` entirely and the location badge (`#locBadge`) is hidden — don't add a second code path for "no locations configured," disabled IS that path.
- **Settings** (gear icon, `#settingsBtn`, top-left of the masthead) is a single panel (`renderSettings()` → `#settingsView`) covering both tab management (add/rename/delete, delete gated behind an explicit "N tasks will move to All" confirm) and location config (enable toggle + label editing) together — it replaced an earlier "⚙ Tabs" entry that lived in the tab row itself; keep both concerns in this one panel rather than re-splitting them out.
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

`window.storage` won't exist outside claude.ai, so you'll land on the login screen. Either sign in with a real Supabase test account, or click "Continue without an account" to exercise the `localStorage` fallback — this is expected and is not something to "fix."

## After making changes

**GitHub Pages** (primary): this repo's `main` branch is served directly by GitHub Pages. Pushing `priority-ledger.html` to `main` updates the live app at `https://chuckchuk.github.io/Priority-Ledger/priority-ledger.html` — always confirm with the project owner before pushing, since it's a real GitHub remote and the live site both users rely on.

**Claude.ai artifact** (secondary): pushing to this repo does not update anything in a Claude.ai conversation. To preview a change as an artifact, the project owner needs to upload or paste the updated `priority-ledger.html` into a conversation and ask Claude to render it. Mention this if a change is worth previewing that way before it goes live on Pages.
