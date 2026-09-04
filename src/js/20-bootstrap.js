// Esc: close whatever's most local first — a Settings popover (a
// category's color/icon picker incl. its own custom-wheel sub-view, or
// UI Colors/Desk & Ledger incl. either one's own "Custom" tile sub-view —
// see closeAllSettingsPopovers() in 09-settings.js) beats the Settings panel
// itself beats a task's expanded detail beats an open day (closeDay(),
// which returns to the calendar instead of the plain day list when the
// day was reached that way — see dayReturnToCalendar in
// 02-storage-state.js) beats the calendar view itself, and only falls
// back to jumping to the All tab if none of those was open. Whenever a
// color wheel specifically is the thing that's open (customColorOpen for
// a category's own wheel, dualColorCustomOpen for UI Colors/Desk &
// Ledger's "Custom" tile), Enter and Escape stop being the same action:
// Enter commits — literally calls the same confirm*() function the
// wheel's own "Done" button does — and Escape cancels back to the
// preset/swatch row, same as its own "‹" back link, rather than either
// one just closing the whole popover outright. Checked before the
// inField guard below, since the wheel's own hex field is itself a text
// input and needs both keys to reach here too; its own onkeydown already
// calls the same confirm function for Enter (no stopPropagation), so by
// the time this runs for that path the color's already committed and
// confirm*()'s own no-op-if-nothing-changed guard keeps a second call
// from doing anything. Cmd/Ctrl+Z / Shift+Z (or Ctrl+Y) drive undo/redo,
// but only when focus isn't in a text field — typing needs its own
// native undo, not this app's content-level one.
document.addEventListener('keydown', (e) => {
  const appShell = document.getElementById('appShell');
  if(!appShell || appShell.style.display === 'none') return;

  const popoverOpen = openCategoryPickerId || uiColorPickerOpen || deskPaperPickerOpen || locationEditorOpenId || customSelectOpenKey;

  if(e.key === 'Escape' || e.key === 'Enter'){
    if(customColorOpen && openCategoryPickerId){
      if(e.key === 'Enter') confirmCustomColor(openCategoryPickerId);
      else closeCustomColor();
      return;
    }
    if(dualColorCustomOpen){
      if(e.key === 'Enter') confirmDualColorCustom();
      else closeDualColorCustom();
      return;
    }
    if(popoverOpen){ closeAllSettingsPopovers(); render(); return; }
    if(e.key !== 'Escape') return; // Enter has nothing else to do app-wide
    // Shake-to-undo's own menu (04-undo.js) floats above literally
    // everything, same reasoning as the Mobile UI Lab overlays checked
    // right below — it can pop up over any screen in the app.
    if(shakeUndoOpen){ closeShakeUndoMenu(); return; }
    if(shareImportId){ closeShareImportDialog(); return; }
    if(shareMenuTaskId){ closeShareMenu(); return; }
    if(ctxMenuTaskId || ctxMenuDayStr || ctxMenuMoveTaskId || ctxMenuSortOpen || ctxMenuQuickFieldKind){ closeCtxMenu(); return; }
    if(quickAddOpen){ toggleQuickAddSheet(false); return; }
    if(claudeView){ closeClaudeView(); return; }
    if(settingsOpen){ toggleSettings(); return; }
    if(checklistPendingOpen){ closeChecklistPending(); return; }
    if(checklistTemplatesOpen){ closeChecklistTemplates(); return; }
    if(moveTargetOpen){ closeMoveTargetPicker(); return; }
    if(moveModeListId){ cancelMoveMode(); return; }
    if(selectedListId){ closeChecklistList(); return; }
    if(genericTaskDetailId){ closeGenericTaskDetail(); return; }
    if(sharedItemsOpen){ closeSharedItems(); return; }
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
  // (rather than enumerating every overlay flag — settingsOpen,
  // genericTaskDetailId, selectedListId, dailyCalendarOpen, etc. — that could otherwise be
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
// "back" action, mirroring a tap on the tag itself. classifySwipeZone()
// below is the single place that decides which (if either) a given touch
// belongs to.

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
// own nav row (.calnav) claim the gesture when the touch actually started
// inside that row. Only once neither claims it does swipe-right-to-
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
  // A touch that starts inside a text field is trying to position a
  // cursor or extend a text selection, never to swipe the page away —
  // per the explicit ask, this has to opt out of every swipe zone below
  // (back, day-nav, month-nav), not just the ones that happen to overlap
  // a text field in practice, since editing text should never fight a
  // page gesture regardless of where on the page it happens. Mirrors the
  // identical guard pullRefreshEligible() already has for the same
  // reason. A plain vertical scroll starting here is untouched either
  // way — returning null here means swipeGesture never gets set, so the
  // touchmove listener below bails immediately and never calls
  // preventDefault(), leaving native scroll/selection completely alone.
  if(target.closest('input, textarea, select, [contenteditable="true"]')) return null;
  if(openCategoryPickerId || uiColorPickerOpen || deskPaperPickerOpen || locationEditorOpenId || customSelectOpenKey) return null;
  const daynav = document.querySelector('.daynavrow');
  if(daynav && daynav.contains(target)){
    return { mode:'day', card: daynav.parentElement, label: daynav.querySelector('.dayhero') };
  }
  const calnav = document.querySelector('.calnav');
  if(calnav && calnav.contains(target)){
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
  // The revealed page fades in step with the drag itself, every frame —
  // not a fixed-timing fade-in that finishes early regardless of how far
  // you've actually dragged (see swipeBackGhostShow()'s own comment for
  // why that changed). Reaches full opacity at the same SWIPE_COMMIT_PX
  // distance that would commit the swipe on release, so letting go right
  // around there never has to visibly "catch up." Dragging back toward 0
  // fades it back out in the same lockstep, not just as a release-time
  // snap-back — reversing mid-drag reverses the fade mid-drag too.
  if(g.ghost) g.ghost.style.opacity = String(Math.min(Math.abs(eff) / SWIPE_COMMIT_PX, 1));
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
// Sized and positioned to #appCard's own rect — the same box every base
// view (a category tab, the day list, the checklist overview) naturally
// fills, and also, give or take .stackedpage's own few-pixel negative
// margins, what a real destination stackedpage fills too. Earlier passes
// sized this to the *outgoing* .stackedpage's own (smaller, offset) rect
// instead, plus a fixed pixel offset so a sliver would peek out from the
// very start of the drag: that's what made a master-view destination
// visibly jump into a differently-framed box the instant the ghost
// resolved into the real thing, and it's also no longer needed for early
// visibility now that opacity itself ramps up with drag distance (see
// swipeApplyDrag()) rather than fading in on a fixed timer — the ghost
// is already partway visible from the first pixel of drag, so there's
// nothing left for a positional peek to do.


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
//   #settingsView / #genericTaskDetailView -> currentTabBodyHtml()
//     (both float over activeTab's own view unchanged underneath — a
//     task detail opened from within Daily also lands here now, backing
//     to currentTabBodyHtml()'s own selectedDay check, i.e. the day
//     detail it was opened from, same as every other tab)
//   #dailyView -> the day detail itself backs to the day list or the
//     calendar, matching dayReturnToCalendar exactly like closeDay()
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
  if(containerId === 'settingsView' || containerId === 'genericTaskDetailView' || containerId === 'sharedItemsView'){
    return currentTabBodyHtml();
  }
  if(containerId === 'dailyView'){
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
  const appCardEl = document.getElementById('appCard');
  const r = (appCardEl || card).getBoundingClientRect();
  const ghost = document.createElement('div');
  let realHtml = null;
  // swipeBackPreviewHtml()'s cases come back two shapes: some are
  // themselves a drilldown (their own `<div class="stackedpage">`
  // wrapper — a day detail reached via checklistReturnDay, etc.), others
  // are a tab's plain top-level view (currentTabBodyHtml(), the day
  // list, the checklist overview) with no such wrapper at all. Applying
  // the .stackedpage look unconditionally used to mean a swipe back to a
  // *top-level* page still rendered the ghost with a drilldown's own
  // frame — reserved top padding for a page tag, rounder corners, a
  // different background tint — none of which the real page underneath
  // actually has, so the moment the ghost faded and the real page took
  // over, everything visibly jumped into a different layout. Checking
  // for that wrapper before stripping it (unwrapStackedPage()) is what
  // lets the ghost pick the matching frame instead of always assuming one.
  let isSubpage = true;
  try {
    realHtml = swipeBackPreviewHtml(card);
    if(realHtml){
      isSubpage = /^\s*<div class="stackedpage">/.test(realHtml);
      realHtml = unwrapStackedPage(realHtml);
    }
  } catch(e) { realHtml = null; }
  // .skeleton (the flex/gap layout the placeholder rows need) only
  // applies to the fallback content — real content already carries its
  // own real layout/spacing via the exact same classes the actual page
  // uses (it's built by the actual page's own render function), so
  // forcing a flex gap onto its top-level children here would just
  // introduce spacing that doesn't match the real thing. The fallback
  // (realHtml still null — swipeBackPreviewHtml() couldn't say, e.g. the
  // Claude view) keeps assuming a sub-page frame, since every case that
  // currently falls through to it backs onto one (Settings).
  const frameClass = isSubpage ? 'stackedpage' : 'toplevelghost';
  ghost.className = realHtml ? `${frameClass} swipebackghost` : 'stackedpage swipebackghost skeleton';
  // No transition here — opacity is driven directly, every touchmove
  // frame, by swipeApplyDrag() instead, so it tracks the finger 1:1 the
  // same way the outgoing card's own transform/opacity already do.
  // swipeBackGhostHide() adds its own transition when the gesture ends
  // without committing.
  ghost.style.cssText = `position:fixed; margin:0; left:${r.left}px; top:${r.top}px; width:${r.width}px; height:${r.height}px; opacity:0; pointer-events:none;`;
  ghost.innerHTML = realHtml ? sanitizeGhostHtml(realHtml) : swipeBackGhostContentHtml(g, r.height);
  card.parentElement.insertBefore(ghost, card);
  g.ghost = ghost;
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
// Forced to '1' explicitly (not just assumed already there from
// swipeApplyDrag()'s per-drag fade) since a commit can also fire on
// velocity alone (SWIPE_COMMIT_VPX) — a fast short flick can commit well
// before dx has covered SWIPE_COMMIT_PX, which without this would fly
// the outgoing page away over a still-partly-faded reveal underneath.
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
  if(g && g.ghost) g.ghost.style.opacity = '1';
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
// an ordinary vertical scroll starting anywhere in a swipe zone behaves
// exactly as if this listener didn't exist.
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

// ---------- Swipe-left row actions (task/checklist master-view rows) ----------
// EXPERIMENTAL — swipeActionsEnabled dev setting (02-storage-state.js),
// mobile-only like every other Mobile UI Lab setting. Same idea as
// swipe-to-archive in a mail app: dragging a row left slides its own
// content out of the way to reveal a few quick actions underneath,
// entirely independent of that row's normal tap (which opens the task/
// list, or — for a step/list item, NOT wired up here yet, see the note on
// ROWSWIPE_ACTION_WIDTH below — toggles it done). A completely separate
// gesture system from the page-level back-swipe above: that one drags a
// whole .stackedpage to reveal the page behind it; this one drags one
// row's own .row child sideways to reveal a sibling .swipeactions div
// that was sitting behind it (under it in paint order, not in flow) the
// whole time — see taskRowHtml()'s (08-render-core.js) and
// checklistListRowHtml()'s (13-checklist.js) own comments on that
// markup. Only one row open at a time, like the real thing.
//
// ROWSWIPE_ACTION_WIDTH is keyed by "kind" (a task's own 3 actions vs a
// checklist's 2) rather than measured live off the actual rendered
// .swipeactions width — has to match the CSS driving that div's real
// width (see .swipeactions/.swipeactions-task/.swipeactions-checklist in
// <style>) exactly, or the row either stops short of fully covering its
// own actions or overshoots into empty space past them. Not yet extended
// to a task's own steps or a checklist's own items — noted for later,
// per the project owner's own explicit "hold off for now."
const ROWSWIPE_AXIS_PX = 10;
const ROWSWIPE_ACTION_WIDTH = { task: 138, checklist: 92 };
const ROWSWIPE_COMMIT_FRACTION = 0.4; // fraction of the full reveal a drag has to pass to snap open on release
let rowSwipeOpenId = null;   // data-task-id of the one row (if any) currently revealed
let rowSwipeOpenKind = null; // 'task' | 'checklist' — which ROWSWIPE_ACTION_WIDTH applies, needed by reapplyRowSwipeState() (08-render-core.js) since a fresh render() rebuilds the row from scratch with no transform of its own
let rowSwipeGesture = null;  // { id, kind, row, startX, startY, axis, currentTotal } while a touch is dragging one
// A checklist's swipe-revealed Delete needs a second, deliberate tap
// before it actually deletes anything — per the explicit ask that this
// one specifically shouldn't be easy to trigger by accident, unlike
// Flag/Pin/Share which are all harmlessly reversible. Set by
// confirmSwipeDeleteChecklist() (13-checklist.js) on the first tap
// (re-rendering that one row's own .swipeactions to show "Confirm?"
// instead of "Delete"), cleared by closeRowSwipe() above so an armed
// delete can never survive its own row closing back up.
let swipeDeleteConfirmId = null;

function rowSwipeRowEl(taskId){
  const li = document.querySelector(`.task[data-task-id="${taskId}"]`);
  return li && li.querySelector(':scope > .row');
}

// Snaps the currently-open row back closed — called on its own tap (see
// the rowSwipeOpenId guard atop taskRowTap()/checklistRowTap()), on
// opening a DIFFERENT row, and after any swipe-revealed action runs.
// Also clears swipeDeleteConfirmId (08-render-core.js) — a pending
// "tap again to actually delete" arm shouldn't survive the row it belongs
// to closing back up, since there'd be nothing left on screen showing it
// was ever armed.
function closeRowSwipe(){
  if(rowSwipeOpenId == null) return;
  const row = rowSwipeRowEl(rowSwipeOpenId);
  rowSwipeOpenId = null;
  rowSwipeOpenKind = null;
  swipeDeleteConfirmId = null;
  if(row){
    row.style.transition = 'transform 180ms ease';
    row.style.transform = '';
    setTimeout(() => { row.style.transition = ''; }, 180);
  }
}

function rowSwipeStart(e, taskId, kind){
  if(!mobileUiActive() || !(state.devSettings||{}).swipeActionsEnabled) return;
  const row = e.currentTarget.querySelector(':scope > .row');
  if(!row) return;
  const pt = e.touches ? e.touches[0] : e;
  rowSwipeGesture = {
    id: taskId, kind, row, startX: pt.clientX, startY: pt.clientY, axis: null,
    // Starting drag distance already accounts for this same row already
    // being open (a drag on an open row adjusts it, doesn't have to
    // start over from 0) — everything else starts fresh.
    currentTotal: rowSwipeOpenId === taskId ? -ROWSWIPE_ACTION_WIDTH[kind] : 0,
  };
}
function rowSwipeMove(e){
  const g = rowSwipeGesture;
  if(!g) return;
  const pt = e.touches ? e.touches[0] : e;
  const dx = pt.clientX - g.startX;
  const dy = pt.clientY - g.startY;
  if(g.axis === null){
    if(Math.abs(dx) < ROWSWIPE_AXIS_PX && Math.abs(dy) < ROWSWIPE_AXIS_PX) return;
    g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if(g.axis === 'y'){ rowSwipeGesture = null; return; } // hand off to native scroll, same as the page-level system
    if(rowSwipeOpenId != null && rowSwipeOpenId !== g.id) closeRowSwipe();
  }
  if(g.axis !== 'x') return;
  e.preventDefault();
  const maxOpen = -ROWSWIPE_ACTION_WIDTH[g.kind];
  // Clamped to [maxOpen, 0] — no rubber-band past fully open or back past
  // fully closed, unlike the page-level back-swipe's own eased overshoot;
  // there's nothing further to reveal past "all the actions are visible."
  const total = Math.max(maxOpen, Math.min(0, g.currentTotal + dx));
  g.row.style.transition = 'none';
  g.row.style.transform = `translateX(${total}px)`;
  g.liveTotal = total;
}
function rowSwipeEnd(){
  const g = rowSwipeGesture;
  rowSwipeGesture = null;
  if(!g || g.axis !== 'x') return;
  const maxOpen = -ROWSWIPE_ACTION_WIDTH[g.kind];
  const shouldOpen = (g.liveTotal||0) < maxOpen * ROWSWIPE_COMMIT_FRACTION;
  g.row.style.transition = 'transform 180ms ease';
  g.row.style.transform = shouldOpen ? `translateX(${maxOpen}px)` : '';
  setTimeout(() => { g.row.style.transition = ''; }, 180);
  if(shouldOpen){ rowSwipeOpenId = g.id; rowSwipeOpenKind = g.kind; }
  else if(rowSwipeOpenId === g.id) closeRowSwipe();
}
document.addEventListener('touchend', rowSwipeEnd);
document.addEventListener('touchcancel', rowSwipeEnd);
// Tapping literally anywhere outside the currently-open row closes it —
// same "outside click dismisses" idiom every other popover in the app
// already follows (color wheels, the share menu, etc.), just via
// touchstart instead of click since this only ever matters on mobile.
// Capture phase so this runs (and can close the row) BEFORE whatever the
// tapped element's own touchstart/onclick would otherwise do.
document.addEventListener('touchstart', (e) => {
  if(rowSwipeOpenId == null) return;
  if(e.target.closest && e.target.closest(`.task[data-task-id="${rowSwipeOpenId}"]`)) return;
  closeRowSwipe();
}, { capture: true, passive: true });

// ---------- Pull-to-refresh ----------
// The standalone "Add to Home Screen" install (manifest.json/shell-head.html)
// has no browser chrome at all — no reload button, no pull-to-refresh of
// its own — so a stale cached view otherwise only clears up by fully
// quitting and reopening the app, and per the project owner even that
// doesn't reliably fix it. This adds a from-scratch pull gesture that
// just calls location.reload(). PULL_REFRESH_TRIGGER_PX is deliberately
// large (a real fraction of a phone screen's height, not a light nudge)
// so an ordinary "scrolled to the top, bounced a little" overscroll can
// never accidentally reload the page out from under someone mid-edit —
// and if there IS an unsaved edit in flight, reload() still triggers the
// beforeunload prompt below same as any other navigation would, so it
// can't silently eat one either way.
// Mostly independent of the swipeGesture system above — that system
// already bails ("hand off to native scroll") the moment a touch locks
// onto the vertical axis, so there's normally no shared state to
// coordinate with here. The one exception is pullRefreshEligible() below,
// which opts out entirely of a touch that starts in one of
// classifySwipeZone()'s own zones — see its own comment for why.
const PULL_REFRESH_TRIGGER_PX = 96;
const PULL_REFRESH_DRAG_MAX_PX = 80; // how far #appShell itself visually drags down, damped
// { baseY, dy, armed } while a touch is potentially pulling, or null once
// it's clearly not (touchend/touchcancel, or an ineligible touchstart).
// baseY is deliberately NOT fixed at the touch's original start position —
// see touchmove below for why: it has to reset every time the page
// actually returns to scrollY 0, not just once at the very start of the
// gesture, or a touch that scrolls up first and then back down to the
// top would never be able to arm a refresh (reported as "scroll up then
// down doesn't refresh").
let pullRefreshGesture = null;

function pullRefreshEligible(target){
  // Once actually signed in (nothing stale to refresh on the login
  // screen), and never starting inside a text field — a drag meant to
  // reposition a cursor or select text shouldn't also arm a page reload.
  // Deliberately NOT gated on scrollY here (unlike an earlier version) —
  // see touchmove below.
  const appShell = document.getElementById('appShell');
  if(!appShell || appShell.style.display === 'none') return false;
  if(target.closest && target.closest('input, textarea, select')) return false;
  // A touch that starts in one of classifySwipeZone()'s own zones (day-
  // nav, month-nav, or a drilldown's own back-swipe area) shouldn't also
  // be able to arm a pull-to-refresh — per the explicit ask, starting a
  // swipe there was sometimes also visibly dragging #appShell down toward
  // a refresh at the same time, since this system and the one above
  // otherwise react to the exact same touch independently (see this
  // function's own header comment on why that used to be fine: it
  // assumed the two could never meaningfully conflict, which held right
  // up until a swipe zone specifically was involved). Re-derives the zone
  // rather than reading the swipeGesture global directly, so this stays
  // correct regardless of which of the two touchstart listeners happens
  // to run first.
  if(classifySwipeZone(target)) return false;
  return true;
}

function pullRefreshApply(dy, armed){
  const drag = Math.min(PULL_REFRESH_DRAG_MAX_PX, dy * 0.45);
  const appShell = document.getElementById('appShell');
  const indicator = document.getElementById('pullRefresh');
  appShell.classList.add('pulldragging');
  appShell.style.transform = `translateY(${drag}px)`;
  indicator.classList.add('dragging');
  indicator.classList.toggle('armed', armed);
  indicator.style.opacity = String(Math.min(1, drag / PULL_REFRESH_DRAG_MAX_PX));
}
function pullRefreshReset(){
  const appShell = document.getElementById('appShell');
  const indicator = document.getElementById('pullRefresh');
  appShell.classList.remove('pulldragging');
  appShell.style.transform = '';
  indicator.classList.remove('dragging', 'armed', 'refreshing');
  indicator.style.opacity = '';
}

document.addEventListener('touchstart', (e) => {
  if(e.touches.length !== 1 || !pullRefreshEligible(e.touches[0].target)){ pullRefreshGesture = null; return; }
  // baseY starts set only if already at the top; otherwise left null
  // until touchmove below finds scrollY actually at 0.
  pullRefreshGesture = { baseY: window.scrollY === 0 ? e.touches[0].clientY : null, dy: 0, armed: false };
}, { passive: true });

// Not passive — once a pull is actually underway (dy>0 at the very top of
// the page) this is the one gesture in the app deliberately overriding
// the browser's own overscroll/bounce, the same way the swipe system
// above overrides horizontal scroll once locked to the x-axis. The
// gesture object is kept alive even while scrollY>0 (just not actively
// pulling) rather than being torn down, specifically so scrolling away
// from the top and back again within the same touch can still re-arm a
// pull once the finger is back at scrollY 0 — torn down only on an
// actual touchend/touchcancel.
document.addEventListener('touchmove', (e) => {
  if(!pullRefreshGesture) return;
  const y = e.touches[0].clientY;
  if(window.scrollY > 0){
    pullRefreshGesture.baseY = null; // re-baseline next time we're back at the top
    pullRefreshReset();
    return;
  }
  if(pullRefreshGesture.baseY === null) pullRefreshGesture.baseY = y;
  const dy = y - pullRefreshGesture.baseY;
  if(dy <= 0){ pullRefreshGesture.dy = 0; pullRefreshReset(); return; }
  e.preventDefault();
  pullRefreshGesture.dy = dy;
  pullRefreshGesture.armed = dy >= PULL_REFRESH_TRIGGER_PX;
  pullRefreshApply(dy, pullRefreshGesture.armed);
}, { passive: false });

function pullRefreshEnd(){
  if(!pullRefreshGesture) return;
  const armed = pullRefreshGesture.armed;
  pullRefreshGesture = null;
  if(!armed){ pullRefreshReset(); return; }
  const appShell = document.getElementById('appShell');
  const indicator = document.getElementById('pullRefresh');
  appShell.classList.remove('pulldragging'); // let the last bit settle via #appShell's own transition
  appShell.style.transform = `translateY(${PULL_REFRESH_DRAG_MAX_PX}px)`;
  indicator.classList.remove('dragging');
  indicator.classList.add('refreshing');
  indicator.style.opacity = '1';
  setTimeout(() => location.reload(), 260);
}
document.addEventListener('touchend', pullRefreshEnd);
document.addEventListener('touchcancel', () => { pullRefreshGesture = null; pullRefreshReset(); });

// ---------- Shake-to-undo/redo: kick off the permission request ----------
// See requestShakePermission()'s own comment in 04-undo.js for why this
// has to wait for a real tap: iOS's motion-permission prompt only fires
// from inside a user gesture, so the very first tap anywhere in the app —
// whatever it's actually for — is reused to also ask for motion access,
// once, so shake detection is live moments after the app opens without a
// dedicated "enable shake" tap of its own. { once: true } means this
// listener discards itself after that first tap; requestShakePermission()
// itself is also a no-op on any later call once a definite answer exists.
document.addEventListener('pointerdown', requestShakePermission, { once: true });

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
  if((ctxMenuTaskId || ctxMenuDayStr || ctxMenuMoveTaskId || ctxMenuSortOpen || ctxMenuQuickFieldKind) && !e.target.closest('#ctxMenu')) closeCtxMenu();
});
document.addEventListener('scroll', () => { if(ctxMenuTaskId || ctxMenuDayStr || ctxMenuMoveTaskId || ctxMenuSortOpen || ctxMenuQuickFieldKind) closeCtxMenu(); }, { capture:true, passive:true });
// The note hover tip (08-render-core.js) has no per-instance id to check
// the way #ctxMenu's ctxMenuTaskId/etc. do — noteHoverEnd() is always
// safe to call regardless of whether anything's actually showing, so a
// scroll just clears it unconditionally rather than needing its own
// tracked "is this open" flag. A render() rebuilding a row's own DOM
// (toggling its expand, moving it after a status change, etc.) already
// drops that row's mouseenter/mouseleave listeners for free by replacing
// the element, but wouldn't otherwise dismiss an already-open tip left
// pointing at the old one — the click that triggers most such renders
// lands here too.
document.addEventListener('click', () => noteHoverEnd());
document.addEventListener('scroll', () => noteHoverEnd(), { capture:true, passive:true });
// Same "click away to dismiss" as #ctxMenu above, for the share menu
// (19-sharing.js). shareButtonHtml()'s own onclick already stops
// propagation, so this only ever fires for a genuine outside click.
document.addEventListener('click', (e) => {
  if(shareMenuTaskId && !e.target.closest('#shareMenu')) closeShareMenu();
});
// Same idea for a custom dropdown (customSelectHtml(), 09-settings.js) —
// it stands in for a native <select>, and a native select always
// dismisses on an outside click — closest('.customselectwrap') covers
// both the trigger and its own dropdown, so picking an option (which
// already closes it via its own onclick) doesn't also trip this a second
// time.
document.addEventListener('click', (e) => {
  if(customSelectOpenKey && !e.target.closest('.customselectwrap')){ customSelectOpenKey = null; render(); }
});
// Every other Settings popover (category color/icon picker, UI Colors/
// Desk & Ledger grids, location editor) gets the same "click away to
// dismiss" a native picker would have — these used to only close via an
// explicit ×/back/Esc, which read as broken next to the customSelect
// dropdown above. A color wheel specifically (customColorOpen/
// dualColorCustomOpen) treats an outside click as Done/confirm — it
// literally calls the same confirm*() the "Done" button does, which is
// safe because a drag has already been live-previewing the real color
// the whole time (see updateCatWheelUI()'s own comment) — rather than a
// plain close, mirroring how Enter already behaves for it. Every other
// popover here has no pending draft to commit, so an outside click there
// is just a close, same as Escape. Checked before the generic branch so
// a wheel mid-drag doesn't also get caught by it.
document.addEventListener('click', (e) => {
  if(customColorOpen && openCategoryPickerId && !e.target.closest('.catdotwrap')){
    confirmCustomColor(openCategoryPickerId);
    return;
  }
  if(dualColorCustomOpen && !e.target.closest('.uicolorwrap')){
    confirmDualColorCustom();
    return;
  }
  if((openCategoryPickerId || uiColorPickerOpen || deskPaperPickerOpen || locationEditorOpenId)
     && !e.target.closest('.catdotwrap') && !e.target.closest('.uicolorwrap') && !e.target.closest('.locbubblewrap')){
    closeAllSettingsPopovers();
    render();
  }
});

// ---------- Keeping the Supabase session alive through long idle stretches ----------
// ensureFreshSession() (02-storage-state.js) only actually hits the
// network when a storage call is about to happen and the access token is
// already stale — fine for active use, but it means a session that's
// just sitting open (the standalone install backgrounded, or simply not
// touched for a while) never refreshes until the next edit. Two habits
// that reduce how often that turns into an unwanted bounce back to
// login: refresh proactively on a timer, so an idle-but-open tab keeps
// its token current instead of letting it go stale for however long;
// and refresh the moment the app becomes visible again, since iOS
// suspends a backgrounded standalone PWA outright — worth finding out
// right away whether the session survived rather than waiting for
// whatever the user happens to do first. Skipped for window.storage/
// localOnlyMode, which have no Supabase session to refresh at all.
const SESSION_PROACTIVE_REFRESH_MS = 15 * 60 * 1000;
function maybeRefreshSession(){
  if(session && !localOnlyMode && !window.storage) ensureFreshSession();
}
setInterval(maybeRefreshSession, SESSION_PROACTIVE_REFRESH_MS);
document.addEventListener('visibilitychange', () => { if(!document.hidden) maybeRefreshSession(); });

// Catches a due date drifting into sweepDueSoonPlanning()'s auto-plan
// window (11-daily-core.js) while the app was simply left open/
// backgrounded across a day boundary, rather than only re-checking on the
// next full reload — that function's own lastDueSweepDate guard already
// makes repeat calls here free on every tab-refocus that isn't actually a
// new day. appEntered guards against running before enterApp() has
// loaded any state to sweep in the first place, same reasoning
// refreshFromServer() (03-sync-save.js) guards on it too.
document.addEventListener('visibilitychange', () => { if(!document.hidden && appEntered) sweepDueSoonPlanning(); });

// Supabase rotates the refresh token on every use, so one tab/window
// refreshing invalidates whatever refresh_token any other open tab of
// the same browser is still holding in memory. ensureFreshSession() only
// ever checks its own in-memory `session` copy, so a second tab that
// hasn't refreshed yet would try to reuse an already-rotated token on
// its next save and get bounced to login even though the first tab is
// still perfectly signed in. The browser's own 'storage' event fires in
// every OTHER tab whenever localStorage changes, so this just keeps
// every tab's in-memory `session` in sync with whichever one last
// refreshed, instead of each tab racing its own refresh independently.
window.addEventListener('storage', (e) => {
  if(e.key !== 'ledger-auth') return;
  try{ session = e.newValue ? JSON.parse(e.newValue) : null; }catch(err){ /* leave session as-is on a malformed write */ }
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

// The Fraunces/IBM Plex <link> in shell-head.html loads with
// `display=swap` (see that comment there), so on a cold cache an
// autogrowTextarea() call inside render() can run against a temporary
// FALLBACK font before the real webfont arrives — its line-height/glyph
// metrics differ enough from Fraunces that the textarea's height (an
// explicit inline px value set from scrollHeight, not `height:auto` — it
// doesn't recompute itself) can get locked in at the wrong size. When the
// real font then swaps in and the text re-flows inside that now-stale
// fixed-height box, the visible glyphs shift without anything prompting
// a remeasure. document.fonts.ready resolves once every requested face
// has actually loaded and applied; re-running autogrow then catches the
// swap whenever it happens to land. Calling .then() on an
// already-resolved Promise (the common case once a face is warm in
// cache) still fires the callback on the next microtask, so this is
// harmless — not just a cold-cache-only fix.
if(document.fonts && document.fonts.ready){
  document.fonts.ready.then(() => {
    document.querySelectorAll('.autogrowtext').forEach(autogrowTextarea);
  });
}

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
  // ?share=<id> (see 19-sharing.js): stashed now, consumed once — either
  // by enterApp() (below, once a session exists) or by
  // showShareStandalone() at the very end of this function if none does.
  const shareParam = new URLSearchParams(location.search).get('share');
  if(shareParam) pendingShareId = shareParam;

  if(window.storage){ await enterApp(); return; }
  if(isLocalDevHost() && new URLSearchParams(location.search).has('localdev')){
    localOnlyMode = true;
    await enterApp();
    return;
  }
  session = loadSession();
  if(session && await ensureFreshSession()){ await enterApp(); return; }
  if(pendingShareId){ await showShareStandalone(pendingShareId); return; }
  document.getElementById('authShell').style.display = '';
})();
