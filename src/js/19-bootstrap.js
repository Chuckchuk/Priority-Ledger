// Esc: close whatever's most local first — a Settings popover (a
// category's color/icon picker incl. its own custom-wheel sub-view, UI
// Colors, Desk & Ledger, or a theme swatch's wheel — see
// closeAllSettingsPopovers() in 09-settings.js) beats the Settings panel
// itself beats a task's expanded detail beats an open day (closeDay(),
// which returns to the calendar instead of the plain day list when the
// day was reached that way — see dayReturnToCalendar in
// 02-storage-state.js) beats the calendar view itself, and only falls
// back to jumping to the All tab if none of those was open. Enter does the same one
// thing Esc does for a popover specifically (closes it) — checked before
// the inField guard below, since the wheel's own hex field is itself a
// text input and needs Enter to reach here too; its own onkeydown
// already commits the color first (no stopPropagation), so by the time
// this runs the popover is just along for the ride, closing on top of
// that. Cmd/Ctrl+Z / Shift+Z (or Ctrl+Y) drive undo/redo, but only when
// focus isn't in a text field — typing needs its own native undo, not
// this app's content-level one.
document.addEventListener('keydown', (e) => {
  const appShell = document.getElementById('appShell');
  if(!appShell || appShell.style.display === 'none') return;

  const popoverOpen = openCategoryPickerId || uiColorPickerOpen || deskPaperPickerOpen || themeColorWheelKey;

  if(e.key === 'Escape' || e.key === 'Enter'){
    if(popoverOpen){ closeAllSettingsPopovers(); render(); return; }
    if(e.key !== 'Escape') return; // Enter has nothing else to do app-wide
    if(claudeView){ closeClaudeView(); return; }
    if(settingsOpen){ toggleSettings(); return; }
    if(checklistPendingOpen){ closeChecklistPending(); return; }
    if(selectedListId){ closeChecklistList(); return; }
    if(taskDetailId){ closeTaskDetail(); return; }
    if(selectedDay){ closeDay(); return; }
    if(dailyCalendarOpen){ closeDailyCalendar(); return; }
    const openExpand = document.querySelector('.expand.open');
    if(openExpand){
      expandedTaskIds.delete(openExpand.id.replace('exp-', ''));
      openExpand.classList.remove('open');
      return;
    }
    if(activeTab !== 'all'){ switchTab('all'); }
    return;
  }

  const target = document.activeElement;
  const inField = target && ['INPUT','TEXTAREA','SELECT'].includes(target.tagName);
  if(inField) return;

  // Left/right steps to the adjacent logged day, mirroring the .navarrow
  // pair in .daynavrow — gated on that row actually being on screen
  // (rather than enumerating every overlay flag — settingsOpen, taskDetailId,
  // selectedListId, dailyCalendarOpen, etc. — that could otherwise be
  // hiding the day-detail page even while selectedDay is still set from
  // before) so the keys only ever act on the day you're actually looking
  // at. goToAdjacentDay() itself already no-ops at either end of your
  // logged days, same as clicking a disabled arrow would.
  if(e.key === 'ArrowLeft' || e.key === 'ArrowRight'){
    if(document.querySelector('.daynavrow')){
      goToAdjacentDay(e.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
  }

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
