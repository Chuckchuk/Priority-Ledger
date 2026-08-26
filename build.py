#!/usr/bin/env python3
"""Assembles src/ into priority-ledger.html, the file GitHub Pages serves.

priority-ledger.html is generated output, not source — never hand-edit it.
Edit the files under src/ instead, then run this script:

    python3 build.py

No dependencies beyond the standard library, matching the project's
no-build-tooling philosophy: this is a plain concatenation, not a bundler.
"""
import pathlib

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / 'src'
OUT = ROOT / 'priority-ledger.html'

# Order matters here: JS is one shared <script> scope, so function
# declarations can live in any module (hoisting), but top-level side
# effects must stay in their original relative order — in particular
# 19-bootstrap.js (event listeners + the init() IIFE) must stay last.
JS_MODULES = [
    '01-categories-theme.js',
    '02-storage-state.js',
    '03-sync-save.js',
    '04-undo.js',
    '05-dates-sort.js',
    '06-tabs-render.js',
    '07-drag.js',
    '08-render-core.js',
    '09-settings.js',
    '10-claudeview.js',
    '11-daily-core.js',
    '12-daily-tree.js',
    '13-checklist.js',
    '14-task-actions.js',
    '15-subtask-edit.js',
    '16-task-crud.js',
    '17-auth-ui.js',
    '18-calendar.js',
    '19-bootstrap.js',
]

def read(path):
    return path.read_text()

# Injected at the top of the file itself and again right at the start of
# the <style> and <script> blocks, so the warning is visible whichever
# section someone (or an agent) jumps to first — e.g. via grep landing
# mid-file — not just to someone who reads from line 1. This file has been
# hand-edited directly at least twice despite CLAUDE.md saying not to
# (see the "Deployed HTML drift incident" — those edits were silently
# clobbered by the next real build), so the warning lives in-file too.
WARN_HTML = (
    "<!--\n"
    "  GENERATED FILE — DO NOT EDIT DIRECTLY.\n"
    "  This is built from src/ by build.py. Any change made only here will be\n"
    "  silently overwritten by the next `python3 build.py` run. Edit the\n"
    "  matching file under src/ instead (see CLAUDE.md), then rebuild.\n"
    "-->\n"
)
WARN_CSS = (
    "/* GENERATED — edit src/styles.css, not this file. See CLAUDE.md. */\n"
)
WARN_JS = (
    "// GENERATED — edit src/js/*.js, not this file. See CLAUDE.md.\n"
)

def main():
    parts = [
        WARN_HTML,
        read(SRC / 'shell-head.html'),
        WARN_CSS,
        read(SRC / 'styles.css'),
        read(SRC / 'shell-body.html'),
        WARN_JS,
    ]
    for name in JS_MODULES:
        parts.append(read(SRC / 'js' / name))
    parts.append(read(SRC / 'shell-foot.html'))
    OUT.write_text(''.join(parts))
    print(f'Wrote {OUT} ({sum(p.count(chr(10)) for p in parts)} lines)')

if __name__ == '__main__':
    main()
