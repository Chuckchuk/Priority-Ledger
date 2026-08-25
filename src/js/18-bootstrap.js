// Esc: close whatever's most local first (a task's expanded detail, then
// the Settings panel), and only fall back to jumping to the All tab if
// neither of those was open. Cmd/Ctrl+Z / Shift+Z (or Ctrl+Y) drive
// undo/redo, but only when focus isn't in a text field — typing needs its
// own native undo, not this app's content-level one.
document.addEventListener('keydown', (e) => {
  const appShell = document.getElementById('appShell');
  if(!appShell || appShell.style.display === 'none') return;

  if(e.key === 'Escape'){
    if(claudeView){ closeClaudeView(); return; }
    if(settingsOpen){ toggleSettings(); return; }
    if(checklistPendingOpen){ closeChecklistPending(); return; }
    if(selectedListId){ closeChecklistList(); return; }
    if(taskDetailId){ closeTaskDetail(); return; }
    const openExpand = document.querySelector('.expand.open');
    if(openExpand){ openExpand.classList.remove('open'); return; }
    if(activeTab !== 'all'){ switchTab('all'); }
    return;
  }

  const target = document.activeElement;
  const inField = target && ['INPUT','TEXTAREA','SELECT'].includes(target.tagName);
  if(inField) return;

  const meta = e.metaKey || e.ctrlKey;
  if(meta && e.key.toLowerCase()==='z'){
    e.preventDefault();
    if(e.shiftKey) redo(); else undo();
  } else if(meta && e.key.toLowerCase()==='y'){
    e.preventDefault();
    redo();
  }
});

// Resizing the window can change how tabs wrap into rows even with no
// state change (nothing else calls render() in that case), which would
// leave renderTabRowLines()'s shelf lines stale — so re-measure on resize.
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderTabRowLines, 120);
});

// saveState() now retries indefinitely rather than dropping a failed save,
// but that only helps while the tab stays open — closing it mid-retry
// would still lose the edit silently. This is the last line of defense:
// the browser's native "leave site?" prompt, gated on unsavedChanges so it
// only appears when there's actually something not yet confirmed saved.
window.addEventListener('beforeunload', (e) => {
  if(!unsavedChanges) return;
  e.preventDefault();
  e.returnValue = '';
});

// Dev-only bypass: ?localdev=1 skips straight past the login screen into
// local-only mode (localStorage, same as clicking "Continue without an
// account"). Gated to localhost/file:// so it can never do anything on
// the real hosted site — it's purely a shortcut for testing this file
// directly, not a feature for real users.
function isLocalDevHost(){
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:';
}

(async function init(){
  if(window.storage){ await enterApp(); return; }
  if(isLocalDevHost() && new URLSearchParams(location.search).has('localdev')){
    localOnlyMode = true;
    await enterApp();
    return;
  }
  session = loadSession();
  if(session && await ensureFreshSession()){ await enterApp(); return; }
  document.getElementById('authShell').style.display = '';
})();
