# The Ledger

A single-file task tracker built as a Claude.ai artifact, styled like a ledger book. Tracks four priorities — Family Business, Game & Software, Estate Upkeep, and Personal/Misc — plus a Daily tab for day-by-day priority lists.

## What this is

- **One file**: `priority-ledger.html`. No build step, no dependencies.
- **No framework**: vanilla HTML/CSS/JS.
- **Storage**: uses Claude.ai's artifact storage API (`window.storage`) to persist data across sessions and devices when opened as a Claude.ai artifact. Falls back to `localStorage` automatically when that API isn't present (see "Local development" below).

## Features

- Four categories, two of them location-aware (MA vs. Argentina)
- Steps (sub-checklists) per task, editable inline
- A Daily tab: add days, they group into months once the month passes, pull existing tasks into a day or create new ones there
- Locked/lockable days: today and future days can be rescheduled; past days lock and offer a one-click "copy unfinished tasks to tomorrow"

## Using this as a Claude.ai artifact

This is the primary way it's meant to run. Open a conversation with Claude, upload or paste `priority-ledger.html`, and ask Claude to render it as an artifact. Data saves automatically via Claude's artifact storage and persists across sessions.

## Local development (with Claude Code)

You can open this repo with Claude Code to make changes, preview them, and iterate before bringing them back to Claude.ai.

```
cd priority-ledger
claude
```

To preview the file locally, just open `priority-ledger.html` directly in a browser, or serve it:

```
python3 -m http.server 8000
```

Since `window.storage` doesn't exist outside claude.ai, the app automatically falls back to `localStorage` for local testing (see the `storage` adapter near the top of the `<script>` block). This is local-only — it does not affect how the file behaves as a real Claude.ai artifact.

## Getting local changes back into Claude.ai

Editing here with Claude Code does **not** automatically update the artifact in any Claude.ai conversation — the two aren't connected. After making changes locally:

1. Commit and push your changes (see below).
2. Start a new Claude.ai conversation (or continue an existing one).
3. Upload the updated `priority-ledger.html`, or paste its contents in, and ask Claude to render it as an artifact again.

## Project structure

```
priority-ledger/
├── priority-ledger.html   # the whole app
├── README.md               # this file
└── CLAUDE.md                # instructions for Claude Code sessions
```
