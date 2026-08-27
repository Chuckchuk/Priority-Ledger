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

  const popoverOpen = openCategoryPickerId || uiColorPickerOpen || deskPaperPickerOpen || themeColorWheelKey || locationEditorOpenId;

  if(e.key === 'Escape' || e.key === 'Enter'){
    if(popoverOpen){ closeAllSettingsPopovers(); render(); return; }
    if(e.key !== 'Escape') return; // Enter has nothing else to do app-wide
    // Mobile UI Lab overlays (see 01-categories-theme.js/16-task-crud.js) —
    // both float above literally everything else including Settings, so
    // they're checked before any of it.
    if(fabAddOpen){ closeFabAdd(); return; }
    if(quickAddOpen){ toggleQuickAddSheet(false); return; }
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

// ---------- Swipe navigation (touch) ----------
// A left/right finger drag steps between days (Daily) or months
// (Calendar), mirroring the ArrowLeft/ArrowRight handling above; a
// rightward drag on any drilldown page triggers that page's own .pagetag
// "back" action, mirroring a tap on the tag itself. See
// defaultDevSettings()'s fullPageSwipeNav comment in 02-storage-state.js
// for how the day/month-nav zone and the swipe-back zone are kept from
// fighting over the same touch — classifySwipeZone() below is the single
// place that decides which (if either) a given touch belongs to.

let swipeGesture = null; // { mode:'day'|'month'|'back', card, backTag?, startX, startY, startT, lastX, axis:null|'x'|'y' }

const SWIPE_AXIS_PX = 10;      // movement before committing to horizontal vs. vertical
const SWIPE_COMMIT_PX = 90;    // drag distance that commits the action on release
const SWIPE_COMMIT_VPX = 0.55; // px/ms — a fast short flick commits even under that distance

// Checked in this order: the day-nav row (.daynavrow) or the calendar's
// own nav row (.calnav) claim the gesture either when the touch actually
// started inside that row, or — with fullPageSwipeNav on — anywhere on
// that page at all. Only once neither claims it does swipe-right-to-
// go-back get a chance, and only against a *non-compact* .pagetag (see
// the Page Tag vs. Compact Tag distinction in devSettingsFieldsHtml()'s
// comment in 01-categories-theme.js) — a compact tag links two peer
// views (Daily's day-list<->Calendar, a checklist's own Pending view),
// not a "back" out of a drilldown, so a directional swipe doesn't have
// one obvious meaning there the way it does for a real back tag. A
// Settings popover (color wheel, icon/location picker) opts out entirely
// — those are their own drag surfaces and shouldn't have a page-level
// swipe competing with them.
function classifySwipeZone(target){
  if(!target || !target.closest) return null;
  if(openCategoryPickerId || uiColorPickerOpen || deskPaperPickerOpen || themeColorWheelKey || locationEditorOpenId) return null;
  const dev = state.devSettings || {};
  const daynav = document.querySelector('.daynavrow');
  if(daynav && (dev.fullPageSwipeNav || daynav.contains(target))){
    return { mode:'day', card: daynav.parentElement };
  }
  const calnav = document.querySelector('.calnav');
  if(calnav && (dev.fullPageSwipeNav || calnav.contains(target))){
    return { mode:'month', card: calnav.parentElement };
  }
  const stackedpage = target.closest('.stackedpage');
  if(stackedpage){
    const backTag = stackedpage.querySelector('.pagetag:not(.compact)');
    if(backTag) return { mode:'back', card: stackedpage, backTag };
  }
  return null;
}

// Follows the finger 1:1 — translateX plus a light rotate/fade so the
// card reads as a physical thing being pushed, not just sliding. A
// back-swipe only means anything moving right; dragging the wrong way
// gives a little rubber-band resistance instead of doing nothing, so the
// card still feels attached to your finger either direction.
function swipeApplyDrag(g, dx){
  const eff = (g.mode === 'back' && dx < 0) ? dx * 0.15 : dx;
  g.card.style.transform = `translateX(${eff}px) rotate(${eff / 26}deg)`;
  g.card.style.opacity = String(Math.max(1 - Math.abs(eff) / 700, 0.55));
}

function swipeSnapBack(card){
  card.style.transition = 'transform 220ms cubic-bezier(.2,.8,.3,1), opacity 220ms ease';
  card.style.transform = '';
  card.style.opacity = '';
  setTimeout(() => { card.style.transition = ''; }, 220);
}

// Continues the card the rest of the way off-screen in the direction it
// was already being dragged, then hands off to `after` (the actual
// navigation) once it's clear. Clears the inline style back off *before*
// calling `after`, not just after — for 'day'/'back' the card (.stackedpage)
// gets discarded by the next render anyway so this is a no-op, but for
// 'month' the card is #dailyView/#calendarView itself, which render()
// only ever replaces the *contents* of, never the element — left
// untouched, the fly-off transform/opacity would still be sitting on
// that element when the new month's markup lands inside it a moment
// later, hiding it off-screen exactly like the swipe never ended.
function swipeFlyAway(card, dir, after){
  card.style.transition = 'transform 200ms ease-in, opacity 200ms ease-in';
  card.style.transform = `translateX(${dir * Math.max(window.innerWidth, 320)}px) rotate(${dir * 12}deg)`;
  card.style.opacity = '0';
  setTimeout(() => {
    card.style.transition = '';
    card.style.transform = '';
    card.style.opacity = '';
    after();
  }, 200);
}

document.addEventListener('touchstart', (e) => {
  const appShell = document.getElementById('appShell');
  if(!appShell || appShell.style.display === 'none' || e.touches.length !== 1){
    swipeGesture = null;
    return;
  }
  const zone = classifySwipeZone(e.touches[0].target);
  if(!zone){ swipeGesture = null; return; }
  const t = e.touches[0];
  swipeGesture = { ...zone, startX: t.clientX, startY: t.clientY, lastX: t.clientX, startT: Date.now(), axis: null };
}, { passive: true });

// Not passive — once a gesture has locked onto the horizontal axis this
// needs to preventDefault() so the page doesn't also scroll/rubber-band
// underneath the drag. Before that lock, nothing is prevented at all, so
// an ordinary vertical scroll starting anywhere in a swipe zone (the
// day-detail task list, most obviously, once fullPageSwipeNav is on)
// behaves exactly as if this listener didn't exist.
document.addEventListener('touchmove', (e) => {
  if(!swipeGesture) return;
  const t = e.touches[0];
  const dx = t.clientX - swipeGesture.startX;
  const dy = t.clientY - swipeGesture.startY;
  if(swipeGesture.axis === null){
    if(Math.abs(dx) < SWIPE_AXIS_PX && Math.abs(dy) < SWIPE_AXIS_PX) return;
    swipeGesture.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if(swipeGesture.axis === 'y'){ swipeGesture = null; return; } // hand off to native scroll
    swipeGesture.card.style.transition = 'none';
  }
  if(swipeGesture.axis !== 'x') return;
  e.preventDefault();
  swipeGesture.lastX = t.clientX;
  swipeApplyDrag(swipeGesture, dx);
}, { passive: false });

function swipeEnd(){
  const g = swipeGesture;
  swipeGesture = null;
  if(!g || g.axis !== 'x') return;
  const dx = g.lastX - g.startX;
  const elapsed = Math.max(Date.now() - g.startT, 1);
  const committed = Math.abs(dx) > SWIPE_COMMIT_PX || Math.abs(dx) / elapsed > SWIPE_COMMIT_VPX;

  if(g.mode === 'back'){
    if(committed && dx > 0) swipeFlyAway(g.card, 1, () => g.backTag.click());
    else swipeSnapBack(g.card);
    return;
  }

  // Swipe left (negative dx) advances forward, same convention as a
  // photo carousel — swipe right steps back. This is the opposite sign
  // from the ArrowLeft/ArrowRight keys above on purpose: a right *arrow
  // key* means "go right, i.e. forward," but a right *swipe* pushes the
  // current card away to reveal the previous one, same direction .pagetag
  // back-swipes already use above.
  const dir = dx < 0 ? 1 : -1;
  const canGo = g.mode === 'month' || !!adjacentDayStr(selectedDay, dir);
  if(committed && canGo){
    swipeFlyAway(g.card, dir, () => {
      if(g.mode === 'day') goToAdjacentDay(dir);
      else calendarShiftMonth(dir);
    });
  } else {
    swipeSnapBack(g.card);
  }
}

document.addEventListener('touchend', swipeEnd);
document.addEventListener('touchcancel', swipeEnd);

// Resizing the window can change how tabs wrap into rows even with no
// state change (nothing else calls render() in that case), which would
// leave renderTabRowLines()'s shelf lines stale — so re-measure on resize.
// Also re-checks the Mobile UI Lab's mobileUiActive() gate (01-categories-
// theme.js), since dragging a desktop browser window narrower/wider is the
// other way (besides mobileUiPreviewOnDesktop) that gate's answer changes
// without any state mutation to trigger it.
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { renderTabRowLines(); refreshMobileUiActive(); }, 120);
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
