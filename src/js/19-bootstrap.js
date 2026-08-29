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
    if(ctxMenuTaskId){ closeTaskContextMenu(); return; }
    if(taskSettingsOpenId){ closeTaskSettingsSheet(); return; }
    if(quickAddOpen){ toggleQuickAddSheet(false); return; }
    if(claudeView){ closeClaudeView(); return; }
    if(settingsOpen){ toggleSettings(); return; }
    if(checklistPendingOpen){ closeChecklistPending(); return; }
    if(selectedListId){ closeChecklistList(); return; }
    if(mobileTaskDetailId){ closeMobileTaskDetail(); return; }
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

let swipeGesture = null; // { mode:'day'|'month'|'back', card, backTag?, label?, labelText?, incomingEl?, incomingDir?, startX, startY, startT, lastX, axis:null|'x'|'y' }

const SWIPE_AXIS_PX = 10;      // movement before committing to horizontal vs. vertical
const SWIPE_COMMIT_PX = 90;    // drag distance that commits the action on release
const SWIPE_COMMIT_VPX = 0.55; // px/ms — a fast short flick commits even under that distance
const SWIPE_DIAL_OFFSET_PX = 46; // fallback when text-width measurement isn't available

// .herotext is `position:absolute; inset:0`, so its own offsetWidth is
// always just the (much wider) label container's width, not the text's —
// measuring that gave every incoming label the same huge starting offset
// regardless of how short its word was, and for two short words centered
// in one wide box a too-small gap read as them overlapping. Canvas
// measureText() gives the actual rendered glyph width instead, so the
// gap in swipeApplyDialDrag() below can be sized to the words themselves.
function swipeTextWidth(text, font){
  const ctx = swipeTextWidth._ctx || (swipeTextWidth._ctx = document.createElement('canvas').getContext('2d'));
  ctx.font = font;
  return ctx.measureText(text).width;
}

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
    return { mode:'day', card: daynav.parentElement, label: daynav.querySelector('.dayhero') };
  }
  const calnav = document.querySelector('.calnav');
  if(calnav && (dev.fullPageSwipeNav || calnav.contains(target))){
    return { mode:'month', card: calnav.parentElement, label: calnav.querySelector('.calmonthlabel') };
  }
  const stackedpage = target.closest('.stackedpage');
  if(stackedpage){
    const backTag = stackedpage.querySelector('.pagetag:not(.compact)');
    if(backTag) return { mode:'back', card: stackedpage, backTag };
  }
  return null;
}

// Follows the finger 1:1 — translateX plus a light rotate/fade so the
// card reads as a physical thing being pushed, not just sliding. Only
// used for 'back' (swipe-right-to-go-back) — day/month nav uses
// swipeApplyDialDrag() below instead, which moves just the nav label.
function swipeApplyDrag(g, dx){
  if(g.mode !== 'back'){ swipeApplyDialDrag(g, dx); return; }
  const eff = dx < 0 ? dx * 0.15 : dx;
  g.card.style.transform = `translateX(${eff}px) rotate(${eff / 26}deg)`;
  g.card.style.opacity = String(Math.max(1 - Math.abs(eff) / 700, 0.55));
}

// Day/month swipe nav feedback: a padlock-dial style swap of just the
// nav label text (.dayhero's or .calmonthlabel's .herotext span) — the
// arrows, list, everything else under it stays completely still. The
// outgoing label follows the finger 1:1 with a fade; once the drag
// direction is known, an "incoming" label (the next/previous day or
// month's own text) is created as a sibling and slides in from the
// opposite edge, fading in as the outgoing one fades out. Re-created if
// the user reverses direction mid-drag. At the end of the day list (no
// adjacent day that direction — month nav has no such end) there's
// nothing to bring in, so the outgoing label just fades on its own and
// snaps back on release, same as it would past SWIPE_COMMIT_PX with an
// insufficient drag.
function swipeApplyDialDrag(g, dx){
  if(!g.labelText) return;
  const dir = dx < 0 ? 1 : -1;
  const canGo = g.mode === 'month' || !!adjacentDayStr(selectedDay, dir);
  g.labelText.style.transform = `translateX(${dx}px)`;
  g.labelText.style.opacity = String(Math.max(1 - Math.abs(dx) / SWIPE_COMMIT_PX, 0));
  if(!canGo){
    if(g.incomingEl){ g.incomingEl.remove(); g.incomingEl = null; g.incomingDir = null; }
    return;
  }
  if(g.incomingDir !== dir){
    if(g.incomingEl) g.incomingEl.remove();
    const info = swipeIncomingLabel(g, dir);
    const el = document.createElement('span');
    el.className = 'herotext' + (info.today ? ' today' : '');
    el.textContent = info.text;
    g.label.appendChild(el);
    g.incomingEl = el;
    g.incomingDir = dir;
    // Half the combined rendered width of both words, plus a fixed gap —
    // so at rest (dx=0) the two labels' nearest edges sit apart with
    // daylight between them, however short or long either word is,
    // instead of both being centered in the same box a fixed few px
    // apart (which for two short words read as them overlapping).
    const outW = swipeTextWidth(g.labelText.textContent, getComputedStyle(g.labelText).font);
    const inW = swipeTextWidth(el.textContent, getComputedStyle(el).font);
    g.dialOffset = Math.max((outW + inW) / 2 + 24, SWIPE_DIAL_OFFSET_PX);
  }
  g.incomingEl.style.transform = `translateX(${dx + dir * g.dialOffset}px)`;
  g.incomingEl.style.opacity = String(Math.min(Math.abs(dx) / SWIPE_COMMIT_PX, 1));
}

// What the incoming dial label should read — the same text the actual
// destination day/month would render as its own .dayhero/.calmonthlabel,
// computed ahead of navigating there so the preview matches exactly.
function swipeIncomingLabel(g, dir){
  if(g.mode === 'day'){
    const target = adjacentDayStr(selectedDay, dir);
    const tag = target ? dayHeaderTag(target) : null;
    return { text: tag ? tag.text : '', today: !!(tag && tag.today) };
  }
  return { text: monthLabel(shiftMonthKey(calendarMonth(), dir)), today: false };
}

function swipeSnapBack(card, g){
  card.style.transition = 'transform 220ms cubic-bezier(.2,.8,.3,1), opacity 220ms ease';
  card.style.transform = '';
  card.style.opacity = '';
  setTimeout(() => { card.style.transition = ''; }, 220);
  if(g) swipeBackGhostHide(g);
}

// A back-swipe drags the .stackedpage away to reveal whatever's under
// it — but the real view underneath has already had its content cleared
// (render() wipes an inactive view's innerHTML to avoid duplicate task-
// row ids, see the comment there), so without this there's genuinely
// nothing behind the page as it slides: just #appCard's bare background.
//
// Two things a first pass at this got wrong, both because it exactly
// matched the real page's own box: (1) .stackedpage's own background is
// only a 5% white mix over --card-bg — nearly the same tone as
// #appCard's bare background already behind it, so even fully visible it
// barely read as "a page"; (2) sized/positioned identically to the real
// page, it stayed *completely* covered by it until the drag had actually
// moved the real page a real distance, so on a normal quick swipe there
// was only a sliver of a moment it could ever show at all. Fixed here by
// (1) .swipebackghost overriding to the more clearly-distinct
// --card-bg-dim plus a stronger shadow (see <style>), and (2) offsetting
// the ghost down-right by SWIPE_BACK_GHOST_PEEK_PX so a visible sliver
// peeks out along the bottom/right edge from the very start of the drag,
// like the next sheet in a stack, rather than needing the top page to
// move first. Fades in fast (120ms, not 220ms) so it's visible well
// before a normal decisive swipe has already committed and flown away.
const SWIPE_BACK_GHOST_PEEK_PX = 7;

// The real destination content, sanitized — see swipeBackPreviewHtml()
// below for how this is actually obtained. `id="..."` attributes are
// stripped so nothing here can collide with the real document's ids
// (e.g. `exp-<taskId>` on an expand block) even though this markup
// briefly sits in the live DOM; every inline event-handler attribute
// (onclick, onchange, ondragstart, ...) is stripped too, so the preview
// is genuinely inert — exactly the "locked version... no actions linked
// to it" the project owner asked for — on top of the ghost's own
// pointer-events:none already blocking mouse interaction regardless.
function sanitizeGhostHtml(html){
  return html.replace(/\sid="[^"]*"/g, '').replace(/\son[a-z]+="[^"]*"/gi, '');
}

// Some of swipeBackPreviewHtml()'s cases (renderDayDetail(),
// renderChecklistDetail() when reached via checklistReturnDay) return
// markup that's normally itself a drilldown, so it comes wrapped in its
// own `<div class="stackedpage">` — inserted as-is, that would nest a
// second .stackedpage (padding, background, shadow, radius, all doubled)
// inside the ghost's own. Since the ghost element itself already carries
// the .stackedpage class, this strips exactly that one outer wrapper
// (safe no-op for every other case, which never starts with it) so the
// content sits directly in the ghost's own single padding/background,
// same as any of the other cases that were never wrapped to begin with.
function unwrapStackedPage(html){
  const trimmed = html.trim();
  const prefix = '<div class="stackedpage">';
  if(!trimmed.startsWith(prefix)) return html;
  const inner = trimmed.slice(prefix.length);
  const lastClose = inner.lastIndexOf('</div>');
  return lastClose === -1 ? html : inner.slice(0, lastClose);
}

// What's actually behind this specific .stackedpage — computed from the
// exact same state each real closeX() function already reads to decide
// where to go, just read here instead of acted on, and building HTML
// via a pure function instead of writing to the real DOM. Keyed off
// which container the dragged page lives in (not global flags alone —
// e.g. selectedDay can stay set while Settings is open over top of a
// day, which must not be mistaken for "this is the day-detail page's
// own back-swipe") so it always matches what render() itself treats as
// "behind" that specific container:
//   #settingsView / #mobileTaskDetailView -> currentTabBodyHtml()
//     (both float over activeTab's own view unchanged underneath)
//   #dailyView -> a task detail (taskDetailId set) backs to its day's
//     own detail page; the day detail itself backs to the day list or
//     the calendar, matching dayReturnToCalendar exactly like closeDay()
//   #checklistView -> a list opened from a specific day (checklistReturnDay,
//     see openChecklistListFromDay()) backs to that day; otherwise back
//     to the category's own checklist overview
// #claudeView is deliberately left unhandled (falls through to null,
// the content-shaped fallback below) — it backs to Settings, which isn't
// a pure function today, and Claude view is rare enough not to be worth
// its own carve-out. Wrapped by the caller in a try/catch: these are the
// app's real render functions, running slightly outside their usual
// context (mid-gesture, not from render() itself), so a bad edge case
// here must never break the actual swipe.
function swipeBackPreviewHtml(card){
  const containerId = card.parentElement && card.parentElement.id;
  if(containerId === 'settingsView' || containerId === 'mobileTaskDetailView'){
    return currentTabBodyHtml();
  }
  if(containerId === 'dailyView'){
    if(taskDetailId) return renderDayDetail(selectedDay);
    return dayReturnToCalendar ? renderDailyCalendar() : renderDayList();
  }
  if(containerId === 'checklistView'){
    if(selectedListId && checklistReturnDay) return renderDayDetail(checklistReturnDay);
    return renderChecklistOverview(activeTab);
  }
  return null;
}

// Content-*shaped* filler for when swipeBackPreviewHtml() can't say what
// the real destination is (the #claudeView case above, or a real render
// call throwing) — real .stackedpage-shaped structure (a checkbox circle
// + title bar per row, occasional tag pill) with blurred/muted
// placeholder bars standing in for actual text, so it reads as "a page
// with some items on it" rather than an empty box, instead of nothing at
// all. Row count scales with the real page's own height (SWIPE_GHOST_ROW_PX
// per row) so a tall page doesn't look sparse and a short one doesn't
// look overstuffed. The one genuinely real detail included is the label
// off `g.backTag` itself — the actual name of wherever this swipe is
// headed (e.g. "Daily", "All Days") — since that's already sitting right
// there for free.
const SWIPE_GHOST_ROW_PX = 46;
const SWIPE_GHOST_ROW_WIDTHS = [92, 68, 100, 78, 85, 60, 95, 72];
function swipeBackGhostContentHtml(g, heightPx){
  const labelEl = g.backTag && g.backTag.querySelector('.pagetaglabel');
  const label = labelEl ? labelEl.textContent : '';
  const rowCount = Math.max(3, Math.min(8, Math.round((heightPx - 90) / SWIPE_GHOST_ROW_PX)));
  let rowsHtml = '';
  for(let i = 0; i < rowCount; i++){
    const w = SWIPE_GHOST_ROW_WIDTHS[i % SWIPE_GHOST_ROW_WIDTHS.length];
    const withTag = i % 3 === 1;
    rowsHtml += `
      <div class="ghostrow">
        <span class="ghostcheck"></span>
        <span class="ghosttext ghosttitle" style="width:${w}%;"></span>
        ${withTag ? '<span class="ghosttext ghosttag"></span>' : ''}
      </div>`;
  }
  return `
    ${label ? `<div class="ghostlabel">${escapeHtml(label)}</div>` : ''}
    <div class="ghostheading"></div>
    <div class="ghostactions"><span class="ghostpill"></span><span class="ghostpill short"></span></div>
    ${rowsHtml}
  `;
}

function swipeBackGhostShow(g){
  const card = g.card;
  const r = card.getBoundingClientRect();
  const peek = SWIPE_BACK_GHOST_PEEK_PX;
  const ghost = document.createElement('div');
  let realHtml = null;
  try { realHtml = swipeBackPreviewHtml(card); if(realHtml) realHtml = unwrapStackedPage(realHtml); } catch(e) { realHtml = null; }
  // .skeleton (the flex/gap layout the placeholder rows need) only
  // applies to the fallback content — real content already carries its
  // own real layout/spacing via the exact same classes the actual page
  // uses (it's built by the actual page's own render function), so
  // forcing a flex gap onto its top-level children here would just
  // introduce spacing that doesn't match the real thing.
  ghost.className = realHtml ? 'stackedpage swipebackghost' : 'stackedpage swipebackghost skeleton';
  ghost.style.cssText = `position:fixed; margin:0; left:${r.left + peek}px; top:${r.top + peek}px; width:${r.width}px; height:${r.height}px; opacity:0; transition:opacity 120ms ease; pointer-events:none;`;
  ghost.innerHTML = realHtml ? sanitizeGhostHtml(realHtml) : swipeBackGhostContentHtml(g, r.height);
  card.parentElement.insertBefore(ghost, card);
  g.ghost = ghost;
  requestAnimationFrame(() => { if(g.ghost) g.ghost.style.opacity = '1'; });
}

function swipeBackGhostHide(g){
  if(!g.ghost) return;
  const ghost = g.ghost;
  g.ghost = null;
  ghost.style.transition = 'opacity 200ms ease';
  ghost.style.opacity = '0';
  setTimeout(() => ghost.remove(), 200);
}

// Dial-drag counterpart of swipeSnapBack()/swipeFlyAway() — animates the
// nav label elements instead of the whole card. swipeDialCommit finishes
// the outgoing label off past the clipped edge (overflow:hidden on
// .dayhero/.calmonthlabel does the actual hiding, this distance just has
// to clear it) while the incoming label settles to center, then hands
// off to `after` (the actual day/month change, which triggers a fresh
// render and discards both elements along with the rest of the old nav
// row). swipeDialSnapBack reverses both back to their resting spots and
// removes the now-unneeded incoming element once it's faded out.
function swipeDialCommit(g, dir, after){
  const dur = 180;
  g.labelText.style.transition = `transform ${dur}ms ease-in, opacity ${dur}ms ease-in`;
  g.labelText.style.transform = `translateX(${dir * SWIPE_COMMIT_PX * 1.4}px)`;
  g.labelText.style.opacity = '0';
  g.incomingEl.style.transition = `transform ${dur}ms ease-out, opacity ${dur}ms ease-out`;
  g.incomingEl.style.transform = 'translateX(0px)';
  g.incomingEl.style.opacity = '1';
  setTimeout(after, dur);
}

function swipeDialSnapBack(g){
  if(!g.labelText) return;
  const dur = 200;
  const easing = `${dur}ms cubic-bezier(.2,.8,.3,1)`;
  g.labelText.style.transition = `transform ${easing}, opacity ${dur}ms ease`;
  g.labelText.style.transform = '';
  g.labelText.style.opacity = '';
  setTimeout(() => { g.labelText.style.transition = ''; }, dur);
  if(g.incomingEl){
    const el = g.incomingEl;
    el.style.transition = `transform ${easing}, opacity ${dur}ms ease`;
    el.style.transform = `translateX(${g.incomingDir * (g.dialOffset || SWIPE_DIAL_OFFSET_PX)}px)`;
    el.style.opacity = '0';
    setTimeout(() => el.remove(), dur);
  }
}

// Continues the card the rest of the way off-screen in the direction it
// was already being dragged, then hands off to `after` (the actual
// navigation) once it's clear. Only used for 'back' now (day/month nav
// uses swipeDialCommit() instead) — the card (.stackedpage) gets
// discarded by the next render anyway, so clearing the inline style
// before calling `after` is mostly just tidiness.
//
// The swipe-back ghost (see swipeBackGhostShow()) stays fully opaque for
// this entire 200ms fly-off — it's the page being *revealed*, so it
// shouldn't fade while the real page on top of it is still visibly
// departing. `after()` renders the real destination underneath the
// (still fully opaque) ghost — invisibly, since the ghost covers the
// exact same box — and only *then* does swipeBackGhostHide() fade the
// ghost away, so what the eye actually sees is the ghost gracefully
// dissolving to reveal the real page that's already sitting there,
// rather than popping out of existence the instant the drag ends.
//
// The ghost has to be re-parented to <body> right before `after()` runs:
// it's currently a sibling of `card` inside whatever container the real
// destination's own render() call is about to overwrite wholesale via
// `el.innerHTML = ...` (see the "avoid stale duplicate ids" comment on
// render() in 08-render-core.js) — left in place, that wipe would
// silently destroy the ghost mid-fade along with everything else that
// used to be in there. An explicit z-index is what keeps it visually on
// top of the freshly-rendered real content once it's no longer sitting
// naturally above it in the DOM.
function swipeFlyAway(card, dir, after, g){
  card.style.transition = 'transform 200ms ease-in, opacity 200ms ease-in';
  card.style.transform = `translateX(${dir * Math.max(window.innerWidth, 320)}px) rotate(${dir * 12}deg)`;
  card.style.opacity = '0';
  setTimeout(() => {
    card.style.transition = '';
    card.style.transform = '';
    card.style.opacity = '';
    if(g && g.ghost){
      g.ghost.style.zIndex = '80';
      document.body.appendChild(g.ghost);
    }
    after();
    if(g) swipeBackGhostHide(g);
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
  if(swipeGesture.label) swipeGesture.labelText = swipeGesture.label.querySelector('.herotext');
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
    if(swipeGesture.mode === 'back'){
      swipeGesture.card.style.transition = 'none';
      swipeBackGhostShow(swipeGesture);
    }
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
    if(committed && dx > 0) swipeFlyAway(g.card, 1, () => g.backTag.click(), g);
    else swipeSnapBack(g.card, g);
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
  const nav = () => { if(g.mode === 'day') goToAdjacentDay(dir); else calendarShiftMonth(dir); };
  if(committed && canGo && g.incomingEl){
    swipeDialCommit(g, dir, nav);
  } else if(committed && canGo){
    nav(); // no incoming label was ever built (shouldn't normally happen) — just navigate
  } else {
    swipeDialSnapBack(g);
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
  resizeTimer = setTimeout(() => { renderTabRowLines(); refreshMobileUiActive(); updateTabScrollFade(); layoutOverlapTabs(); layoutSidetabsPeek(); }, 120);
});

// #tabs itself is a static element (renderTabs() only ever replaces its
// innerHTML, see 06-tabs-render.js) so this listener is safe to attach
// once here rather than re-attaching on every render. A no-op whenever
// tabBarMobileStyle's "scroll" variant isn't active — see the comment on
// updateTabScrollFade() for why.
document.getElementById('tabs').addEventListener('scroll', updateTabScrollFade, { passive:true });

// ---------- customContextMenu: app-wide right-click suppression ----------
// A task row's own oncontextmenu (see taskRowHtml() in 08-render-core.js)
// already handles the one case with a real replacement menu; this is the
// fallback for right-clicking literally anywhere else in the app (blank
// card space, a tab, Settings, a button) — once the setting is on, the
// browser's generic Back/Reload/Inspect/"Look Up" menu doesn't belong
// anywhere in what's supposed to read as an app, not a page, so it's
// suppressed there too rather than only on tasks. input/textarea/select
// are the one exception (spellcheck/Copy/Paste is still genuinely useful
// while actually editing text) — mirrors the same exception
// -webkit-user-select carves out in <style> for the long-press callout.
document.addEventListener('contextmenu', (e) => {
  if(!state.devSettings || !state.devSettings.customContextMenu || mobileUiActive()) return;
  const appShell = document.getElementById('appShell');
  if(!appShell || appShell.style.display === 'none') return;
  if(e.target.closest('input, textarea, select')) return;
  if(e.target.closest('.row')) return; // that row's own handler already decided
  e.preventDefault();
});
// A plain left-click anywhere outside the menu closes it, same as a
// native context menu would — checked via closest() rather than an exact
// id match so clicking one of the menu's own buttons (which already
// closes it via ctxMenuAction()) doesn't also trip this a second time
// pointlessly.
document.addEventListener('click', (e) => {
  if(ctxMenuTaskId && !e.target.closest('#ctxMenu')) closeTaskContextMenu();
});
document.addEventListener('scroll', () => { if(ctxMenuTaskId) closeTaskContextMenu(); }, { capture:true, passive:true });

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
  // A password-recovery email link lands here as
  // #access_token=...&refresh_token=...&expires_in=...&type=recovery
  // (GoTrue's implicit-flow redirect, forwarded through welcome.html) —
  // takes priority over every other path below, including an existing
  // session, since clicking that link is always meant to open the
  // set-new-password form, not silently sign into whatever was already
  // logged in on this device.
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  if(hashParams.get('type') === 'recovery' && hashParams.get('access_token')){
    recoverySession = {
      access_token: hashParams.get('access_token'),
      refresh_token: hashParams.get('refresh_token'),
      expires_in: Number(hashParams.get('expires_in')) || 3600
    };
    document.getElementById('resetShell').style.display = '';
    return;
  }
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
