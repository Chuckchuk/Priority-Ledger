// Filled in once the project exists — see CLAUDE.md for setup steps.
const SUPABASE_URL = 'https://kyswrzkgiphsniepahje.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5c3dyemtnaXBoc25pZXBhaGplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzk1NTAsImV4cCI6MjEwMjgxNTU1MH0.mvDp9f1KcqAol3Tq4Libi32tODMCrVv8HdD3C9-x30c';
// Where a signup-confirmation or password-recovery email should land the
// user — NOT wherever Supabase's dashboard "Site URL" happens to be set
// (that's what sent confirmation links to localhost:8000 before this
// existed). Must also be added to Supabase's Authentication > URL
// Configuration > Redirect URLs allow-list, or GoTrue silently ignores it
// and falls back to Site URL anyway. welcome.html forwards straight into
// priority-ledger.html, carrying along whatever hash GoTrue attached
// (e.g. the #access_token&type=recovery pair init() looks for below).
const AUTH_REDIRECT_URL = 'https://chuckchuk.github.io/Priority-Ledger/welcome.html';
const EMPTY_MSG = {
  all: "The ledger's empty. Start logging what needs doing.",
  work: "Nothing on your plate at work. Add a task above.",
  household: "Nothing to take care of around the house. Add one above.",
  personal: "Nothing personal pending yet. Add one above.",
};

// Priority (0-3) and timeframe are both optional, advanced-mode-only task
// fields — separate from and independent of the existing `urgent` flag,
// which stays the always-available "simple" way to mark importance
// (state.advancedTaskFields just controls whether these show in the UI).
const PRIORITY_LABELS = { 0:'None', 1:'Low', 2:'Medium', 3:'High' };
const TIMEFRAME_LABELS = { today:'Today', short:'Short', medium:'Medium', long:'Long', urgent:'Urgent' };

// Ordered step lists backing both the plain <select> (fieldPickerStyle
// 'default') and the two custom pickers (fieldPickerHtml() in
// 08-render-core.js) — a single source of truth so all three ever show
// the same options in the same order. Last step in each list is treated
// as that field's "max" (Long / High) for the pulse animation.
// 'today' and 'urgent' were both removed from the SELECTABLE list per the
// project owner's own ask — both already duplicated an existing, separate
// concept (the "add to today" pin, and the `urgent` flag itself — see the
// comment right above these constants, which already called this overlap
// out before it was actually acted on) rather than adding anything a
// timeframe of "short/medium/long" doesn't already cover. TIMEFRAME_LABELS
// keeps both entries (below) so any task that already has one saved (from
// before this change) still renders a real label on its own badge instead
// of "undefined" — this list is just what's offered going forward.
const TIMEFRAME_STEPS = [
  { v:'', label:'None' },
  { v:'short', label:'Short' },
  { v:'medium', label:'Medium' },
  { v:'long', label:'Long' }
];
const PRIORITY_STEPS = [
  { v:'0', label:'None' },
  { v:'1', label:'Low' },
  { v:'2', label:'Medium' },
  { v:'3', label:'High' }
];

let state = { location: 'home', tasks: [], days: [], categories: [], locations: [], locationEnabled: true };
let activeTab = 'all';
let showDone = false;
let urgentDraft = false;
let selectedDay = null;
// True when the currently-open day (selectedDay) was reached via a
// calendar date click (openCalendarDay() in 18-calendar.js) rather than
// the plain day list or "+ Add a Day" — lets the day-detail page's own
// back tag (and Esc) return to the calendar view it came from instead of
// always landing on "All Days". Same idiom as checklistReturnDay just
// below (a boolean here rather than a stored date, since there's only
// one calendar view to return to, not a specific day). Threaded through
// goToAdjacentDay()'s own openDay() call so browsing via the prev/next
// arrows stays inside the same "came from the calendar" context.
let dayReturnToCalendar = false;
let selectedListId = null; // id of the checklist "list" (a task) currently drilled into, or null for the overview
// Set only when a list was opened via openChecklistList's optional second
// argument (currently just openChecklistListFromDay) — the dateStr of the
// day to return to. Lets the checklist detail's own back tag skip the
// category overview and go straight back to that day instead. Cleared by
// switchTab() on every tab change so it can never survive into an
// unrelated later visit to the same checklist list.
let checklistReturnDay = null;
let checklistPendingOpen = false; // showing the "all pending items" view for the active checklist category
let checklistTemplatesOpen = false; // showing the Templates view for the active checklist category
// Which template's own "New List" naming step (see startCreateFromTemplate(),
// 13-checklist.js) is currently expanded inline within the Templates
// view — null when none is. Only one at a time, same "one thing open"
// idiom as selectedListId/checklistPendingOpen above.
let checklistTemplateCreateId = null;
// Which list's own "Save as Template" naming step (startSaveListAsTemplate(),
// 13-checklist.js) is expanded inline in its detail page's footer — null
// when none is. A separate flag from checklistTemplateCreateId above:
// that one names a *template* being turned into a new list, this one
// names the *list* being turned into a template — inverse directions,
// never open at the same time in practice, but distinct enough concepts
// to keep as two names rather than one overloaded id.
let checklistSaveTemplateTaskId = null;
// Which tasks' inline .expand rows are open — render() rebuilds every row's
// markup from scratch on every mutation (see taskRowHtml), which would
// otherwise silently collapse every *other* expanded task back to closed
// the moment you acted on any one of them, since a plain DOM
// classList.toggle() doesn't survive its element being torn down and
// recreated. Tracking which ids are open here (independent of any single
// task's own action) is what lets several stay expanded at once.
// switchTab() clears this on an actual tab change (not a re-click of the
// already-active tab, which can happen while closing an overlay) —
// leaving a category is meant to reset every task in it back to collapsed.
let expandedTaskIds = new Set();
// Task ids currently in the brief window between "just checked off" and
// "actually gone from the visible list" — see toggleStatus()/
// scheduleTaskLeave() in 16-task-crud.js. Treated as still-open by
// sortTasks()/applySortMode()'s own done-last ordering (05-dates-sort.js)
// and by categoryVisibleTasks()'s showDone filter (08-render-core.js), so
// a task lingers in its original spot — checkmark, strikethrough, and the
// celebration burst all visible — instead of instantly jumping to the
// bottom or vanishing the moment its status flips. Purely transient UI
// state, same as expandedTaskIds; never persisted.
let completingTaskIds = new Set();
let expandedMonths = new Set();
// Persisted like ledger-last-tab/ledger-daily-view — a per-device UI
// preference, not ledger data, restored in enterApp() (17-auth-ui.js) so
// refreshing mid-Settings doesn't unceremoniously dump you back to the
// task list. setSettingsOpen() is the only place that should ever write
// to this — every settingsOpen = ... assignment elsewhere (toggleSettings()
// in 09-settings.js, switchTab() in 08-render-core.js, openClaudeView()/
// closeClaudeView() in 10-claudeview.js, signOut() in 17-auth-ui.js) goes
// through it instead of touching the variable directly, so localStorage
// can never drift stale relative to what's actually on screen.
let settingsOpen = false;
function setSettingsOpen(val){
  settingsOpen = val;
  try { localStorage.setItem('ledger-settings-open', val ? '1' : '0'); } catch(e){}
}
// Pure UI chrome for the floating dev panel (see renderDevPanel()/
// toggleDevPanel() in 01-categories-theme.js) — deliberately NOT reset by
// switchTab()/toggleSettings()/Esc the way settingsOpen/claudeView are.
// The whole point of the panel is that it stays open while you navigate
// around the app checking a toggle's effect, so only an explicit click on
// its own tab (toggleDevPanel()) may change this. Never persisted —
// always starts closed on a fresh load, and signOut() resets it.
let devPanelOpen = false;
let claudeView = null; // null | 'digest' | 'full' — a plain-text view meant for a page-reading agent, not a category/day view
let pendingDeleteCategoryId = null;
let pendingDeleteLocationId = null;
// The "add a new tab" row's type picker (Standard/Checklist) — used to be
// a native <select> whose live DOM value addCategory() read directly at
// Enter-press time; now a custom dropdown (customSelectHtml(),
// 09-settings.js), which has no DOM element with a .value of its own, so
// the picked type has to live in real state instead. Reset to 'standard'
// right alongside clearing the name field on a successful add (see
// tabsSection() in renderSettings()), same "start fresh for the next
// one" reasoning that clearing the text input already followed.
let newCatTypeDraft = 'standard';
// Quick-add bar open/closed state (see toggleQuickAddSheet() in
// 16-task-crud.js) — pure UI chrome, never persisted, same as the other
// open/closed flags on this page.
let quickAddOpen = false;
// Which task's own Steps section (taskSubtasksHtml(), 08-render-core.js)
// has its "+ Add step" input expanded, while that task still has zero
// steps — see openStepsAdd()'s own comment for the full reasoning.
let stepsAddOpenId = null;
// "Move item(s) to another list" — see the block of functions in
// 13-checklist.js this backs. moveModeListId is the checklist list
// currently showing selection checkboxes on its items (null the rest of
// the time); moveModeSelectedIds is the Set of that list's own subtask
// ids currently checked for the batch. moveTargetOpen/moveTargetFilter/
// moveTargetNewOpen/moveTargetTemplateOpen are all about the target-list
// picker modal that opens once you confirm a selection — kept separate
// from the two above so closing just the picker (to go back and adjust
// the selection) doesn't also drop the selection itself.
let moveModeListId = null;
let moveModeSelectedIds = null;
let moveTargetOpen = false;
let moveTargetFilter = '';
let moveTargetNewOpen = false;
let moveTargetTemplateOpen = false;
// Which template (inside the "From template" list within moveTargetTemplateOpen)
// currently has its own inline naming form expanded, mirroring
// checklistTemplateCreateId's own role on the real Templates page —
// picking a template shouldn't immediately create+move with a generic
// name, it should offer the same "<Template>: <specific>" naming step
// the Templates page's own "New List" button already gives.
let moveTargetTemplatePickId = null;
let taskPressTimer = null;
let taskLongPressFired = false;
let taskPressStartX = 0;
let taskPressStartY = 0;
let taskPressRow = null;
// id of the category whose color/icon popover (see categoryPickerHtml() in
// 01-categories-theme.js) is currently open, or null — only one open at a
// time, same "single id, not a Set" pattern as pendingDeleteCategoryId.
let openCategoryPickerId = null;
// Same idea for a category's own Locations popover (catLocPickerHtml(),
// 09-settings.js) — replaced the old always-visible row of location
// checkboxes under every category row, which was the actual source of
// Settings' "too vertical" complaint (a full extra row per category,
// every time). Only one open at a time, same pattern as
// openCategoryPickerId right above.
let openCatLocPickerId = null;
// Whether the Appearance section's UI Colors (Primary/Secondary preset
// pairs) popover is open — a single boolean, not a per-id map like
// openCategoryPickerId, since there's only ever one of these in Settings.
let uiColorPickerOpen = false;
// Same idea for the Desk & Ledger (Background/Ledger) preset-pair popover.
let deskPaperPickerOpen = false;
// Whichever of deskPaperPickerOpen/uiColorPickerOpen is open can show its
// "Custom" tile's own two-tab wheel editor in place of the preset grid —
// see dualColorCustomHtml()/openDualColorCustom() in 09-settings.js.
// dualColorField is which tab is currently showing in the shared wheel
// ('bg'|'paper' for Desk & Ledger, 'primary'|'secondary' for UI Colors);
// dualColorDraft holds HSV drafts for BOTH fields at once (keyed by
// field name) so switching tabs doesn't lose whichever one isn't showing
// — the wheel itself only ever edits customColorDraft (the shared single-
// color state every wheel popover uses), copied in/out of dualColorDraft
// on each tab switch.
let dualColorCustomOpen = false;
let dualColorField = null;
let dualColorDraft = {};
// Whichever saved custom template (state.customDeskPresets/customUiPresets)
// the wheel is currently mid-edit of, or null when it's just building a
// brand new one — see openDualColorTemplateEdit()/confirmSaveDualColorTemplate()
// in 09-settings.js. Set null again by anything that closes/confirms the
// wheel, same lifecycle as dualColorCustomOpen itself.
let editingDualColorPresetId = null;
// Showing the inline "name this template" form inside the wheel — see
// startSaveDualColorTemplate() in 09-settings.js. Only meaningful while
// dualColorCustomOpen is also true.
let dualColorSaveTemplateOpen = false;
// Same pair of ideas, for Style Presets (Settings → Appearance) — see
// startSaveStylePreset()/editStylePreset() in 09-settings.js.
// stylePresetSaveOpen is the plain "+ Save current look as a preset"
// inline name form; editingStylePresetId (mutually exclusive with it,
// same as editingDualColorPresetId/dualColorSaveTemplateOpen above) is
// set instead when a saved preset's own ✎ was used, so confirming
// overwrites that entry in place rather than creating a new one.
let stylePresetSaveOpen = false;
let editingStylePresetId = null;
// The "Browse Seasonal Presets" popover (toggleSeasonalPresetsBrowser()/
// seasonalPresetsBrowserHtml() in 09-settings.js) — same anchored-
// popover chrome (.catpicker) as the Desk & Ledger/UI Colors pickers,
// not an inline expanding section, so it behaves like every other
// "custom menu" in Settings.
let seasonalPresetsBrowserOpen = false;
// The category color/icon popover's "Custom" sub-panel (a hue ring + a
// saturation/value square, see catWheelPointerDown() in 09-settings.js) —
// only meaningful while openCategoryPickerId names a category.
// customColorDraft is deliberately NOT applied to state.categories while
// dragging (see updateCatWheelUI() — it only touches specific DOM nodes
// directly, never calls render()); confirmCustomColor() is the one place
// that actually commits it via setCategoryColor(), on "Done" or Enter.
let customColorOpen = false;
let customColorDraft = { h:0, s:0, v:0 };
// Which location's little edit popover is open (its id, or the '_new'
// sentinel for the "+" bubble's own add-a-location popover), or null.
// Same single-value/mutual-exclusion treatment as the other Settings
// popovers — see closeAllSettingsPopovers() in 09-settings.js.
let locationEditorOpenId = null;
// Which custom dropdown (see customSelectHtml() in 09-settings.js — the
// app's own styled replacement for a native <select>, built on the same
// .ctxmenu visual language as the task/day right-click menus) is
// currently open, or null. A single string key rather than a boolean
// like customColorOpen/dualColorCustomOpen, since Settings has many of
// these on screen (mostly in Dev Settings) and only one may be open at a
// time — each customSelectHtml() call is given its own unique key (see
// devFieldHtml() in 01-categories-theme.js) so opening one always closes
// whichever other one was open, the same mutual-exclusion every other
// Settings popover already follows.
let customSelectOpenKey = null;
// Settings section keys currently collapsed (Manage Tabs/Locations/Task
// Fields/Appearance/Claude Access/Dev Settings, plus the three device
// groups nested inside Dev Settings — 'dev-general'/'dev-desktop'/
// 'dev-mobile', see devGroupHtml() in 01-categories-theme.js) — 'dev'
// starts collapsed to match its old default (a plain <details> with no
// `open` attribute), everything else starts expanded, EXCEPT the Desktop
// and Mobile dev groups: with General/Desktop/Mobile all expanded by
// default the list is exactly as long as before grouping, defeating the
// point, and General is the one most worth seeing without an extra
// click (it's not tied to a device, so it's relevant regardless of what
// you're testing on). A Set here (not a native <details> per section) is
// what actually fixes a real bug the old <details>-based Dev Settings
// had: renderSettings() rebuilds #settingsView's whole innerHTML on
// every single render (any checkbox flip included), and a fresh
// <details> has no memory of being open — so the section silently
// collapsed itself back shut after every change made inside it. Tracking
// "which sections are collapsed" here, outside the DOM, is what survives
// that rebuild.
//   Persisted to plain localStorage (like ledger-last-tab/ledger-settings-
// open) — a per-device UI preference, not ledger data — so it survives a
// page refresh too, not just a same-session render(). Before this, every
// reload silently reset every section back to the hardcoded default below
// regardless of what you'd actually left open/closed, which is exactly
// the "Desktop/Mobile always come back collapsed, General always comes
// back open" bug the project owner reported. toggleSettingsSection()
// (09-settings.js) is the only place that mutates this Set, and it calls
// persistSettingsCollapsedSections() right after every mutation.
let settingsCollapsedSections = (() => {
  try {
    const raw = localStorage.getItem('ledger-settings-collapsed');
    if(raw !== null) return new Set(JSON.parse(raw));
  } catch(e){}
  return new Set(['dev', 'dev-desktop', 'dev-mobile']);
})();
function persistSettingsCollapsedSections(){
  try { localStorage.setItem('ledger-settings-collapsed', JSON.stringify([...settingsCollapsedSections])); } catch(e){}
}
// Set only while a pointer drag on the hue ring or the SV square is in
// progress — {type:'hue'|'sv', rect}. See catWheelCancelDrag() for why
// this (and the document-level listeners it implies) must be torn down
// whenever the popover closes, not just on pointerup.
let catWheelDragCtx = null;
let session = null; // { access_token, refresh_token, expires_at, user_id, email }
let localOnlyMode = false; // explicit opt-out of an account, chosen on the auth screen
let authMode = 'signin';
// Set by init() when the page loads with a #access_token&type=recovery
// hash (a password-recovery email link, forwarded through welcome.html) —
// { access_token, refresh_token, expires_in }. Non-null is what tells
// enterApp()'s caller to show #resetShell instead of the normal sign-in
// form; cleared once submitPasswordReset() succeeds.
let recoverySession = null;

function loadSession(){
  const raw = localStorage.getItem('ledger-auth');
  if(!raw) return null;
  try{ return JSON.parse(raw); }catch(e){ return null; }
}

function saveSession(s){
  session = s;
  if(s) localStorage.setItem('ledger-auth', JSON.stringify(s));
  else localStorage.removeItem('ledger-auth');
}

// Refreshes the Supabase session if the access token is expired or about to
// be — auth tokens are short-lived, so this runs before every storage call
// while logged in. Returns null (and clears the stored session) if the
// refresh token itself is no longer valid, which sends the user back to login.
async function ensureFreshSession(){
  if(!session) return null;
  if(Date.now() < session.expires_at - 60000) return session;
  try{
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    if(!res.ok) throw new Error('refresh failed');
    const data = await res.json();
    const fresh = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
      user_id: data.user.id,
      email: data.user.email
    };
    saveSession(fresh);
    return fresh;
  }catch(e){
    saveSession(null);
    return null;
  }
}

// Forces a re-login when a Supabase session can't be refreshed mid-use —
// storage must never silently drop to localStorage in this case, or a task
// added believing it's synced to the cloud would quietly stop being so.
function forceReauth(){
  saveSession(null);
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('authShell').style.display = '';
  const errEl = document.getElementById('authError');
  if(errEl) errEl.textContent = 'Your session expired — please sign in again.';
}

// Tracks the server's updated_at for whatever we last actually loaded or
// saved — lets refreshFromServer() ask "has anything changed?" with a
// request for just this one column (a few bytes) instead of pulling the
// whole state blob on every poll. Only meaningful for the Supabase path;
// stays null in window.storage/localOnlyMode, which refreshFromServer()
// never polls anyway.
let lastKnownUpdatedAt = null;

// Storage adapter — tries sources in order, all behind the same
// storage.get/storage.set contract:
//   1. window.storage — the real Claude.ai artifact storage, present only
//      when this file is pasted into a claude.ai conversation as an artifact.
//   2. localStorage — ONLY when localOnlyMode was explicitly chosen on the
//      auth screen, for local testing without a Supabase account.
//   3. Supabase — the hosted app's durable, per-user cloud storage, used
//      whenever someone is logged in. If the session can't be refreshed,
//      this forces a re-login rather than silently falling back to
//      localStorage, so data never "goes local" without the user knowing.
const storage = {
  async get(key){
    if(window.storage) return window.storage.get(key);
    if(localOnlyMode){
      const raw = localStorage.getItem('ledger-local:' + key);
      if(raw === null){ throw new Error('not found'); }
      return { key, value: raw, shared: false };
    }
    const s = await ensureFreshSession();
    if(!s){ forceReauth(); throw new Error('session expired'); }
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ledger_state?user_id=eq.${s.user_id}&select=data,updated_at`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${s.access_token}` } }
    );
    if(!res.ok) throw new Error('supabase get failed: ' + res.status);
    const rows = await res.json();
    if(!rows.length){ throw new Error('not found'); }
    // updated_at comes back for free alongside data in this same request —
    // stashing it here means refreshFromServer()'s cheap poll always has
    // an up-to-date baseline to compare against after any full load.
    lastKnownUpdatedAt = rows[0].updated_at;
    return { key, value: JSON.stringify(rows[0].data), shared: false };
  },
  async set(key, value){
    if(window.storage) return window.storage.set(key, value);
    if(localOnlyMode){
      localStorage.setItem('ledger-local:' + key, value);
      return { key, value, shared: false };
    }
    const s = await ensureFreshSession();
    if(!s){ forceReauth(); throw new Error('session expired'); }
    const nowIso = new Date().toISOString();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ledger_state`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${s.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({ user_id: s.user_id, data: JSON.parse(value), updated_at: nowIso })
    });
    if(!res.ok) throw new Error('supabase set failed: ' + res.status);
    // Keeps the lightweight refresh check from mistaking our own save for
    // a change made elsewhere — without this, the very next poll would
    // see its own updated_at bump as "different" and do a full fetch for
    // no reason.
    lastKnownUpdatedAt = nowIso;
    return { key, value, shared: false };
  }
};

function todayStr(){ return new Date().toISOString().slice(0,10); }

// EXPERIMENTAL — Settings → Dev Settings. Remaining fields here are all
// still-open style experiments. Several that had clearly "won" have
// already graduated into permanent, always-on behavior with their dev
// setting removed entirely: the custom desktop right-click context menu,
// the day-tree category bubbles, the calendar's category-color-dot cells
// and ornate today border, and the whole 'calendar' category-type path
// (calendarTabTypeEnabled) — see git history for what those looked like
// as toggles before graduating.
function defaultDevSettings(){
  // leatherInsetPreset: how much leather cover shows around #appCard when
  // "Leather" is on — 'classic' (the original amount) needs no CSS
  // override (see :root's --leather-* vars in <style>); 'roomier',
  // 'leftheavy' (per the project owner's own suggestion — more margin on
  // the left than the right/bottom, and less on top than either), and
  // 'slim' each swap in a smaller/differently-balanced set of those vars
  // via body[data-leather-inset="…"]. Independent of texture-grain/
  // texture-pages/leather themselves — it only affects how big #appCard
  // reads *within* the leather cover, not whether any of them are on.
  // Named leather- specifically (this field was briefly called
  // pageInsetPreset) to stay unambiguous from stackedPageInsetPreset
  // below, which is the unrelated *inner* drilldown pages (Settings,
  // checklist detail, a day's own detail — .stackedpage), not this outer
  // cover — "inner page" in conversation turned out to mean the latter.
  // stackedPageInsetPreset: the .stackedpage analog of the above — how
  // far a drilldown page's own edge sits from #appCard's edge (see the
  // --stackpage-* vars in <style>). Same four preset names/meanings as
  // leatherInsetPreset, and also fully independent of it — one governs
  // the leather cover around the whole master view, the other governs
  // stacked pages layered on top of that view; either, both, or neither
  // can be non-classic at once. 'leftheavy' is the current default (per
  // the project owner, "for now" — tabBarDesktopStyle's own comment below
  // covers the parallel "which look actually won" question for the tab
  // bar); the option formerly just labeled "Default" is 'classic', now
  // labeled plainly as that instead, since it's no longer the one picked
  // automatically.
  // ---- "Mobile UI Lab" (2026-08 mobile-friendliness pass) ----
  // tabBarMobileStyle is gated behind mobileUiActive() (see
  // 01-categories-theme.js) rather than a plain body class it reads
  // directly — it exists to fix a *phone-width* cramming problem (the tab
  // bar wrapping to a second row), so by default it stays completely inert
  // on desktop even when turned on. mobileUiPreviewOnDesktop is the shared
  // escape hatch — it forces mobileUiActive() true regardless of
  // viewport/pointer, so the project owner can preview it on a desktop
  // browser without narrowing the window.
  // The main category quick-add bar (the 6-control row that wraps into
  // three lines on a phone) is reached on mobile via a single "+ Add Task"
  // trigger (see .quickaddtrigger in <style>) — quickAddBarStyle picks
  // where that trigger docks and what tapping it does. 'top' (the
  // default) docks it under the tab bar via position:sticky so it never
  // scrolls away, and tapping it grows the bar open right in place below
  // the trigger, pushing the task list down. 'bottom' instead pins the
  // trigger position:fixed to the bottom of the screen, and tapping it
  // opens the bar as a full-width bottom sheet with a dimming scrim
  // behind it — the two were separate settings once (trigger position and
  // what tapping it opened, independently selectable) but only ever made
  // sense picked together in practice, so they're one setting now with
  // two matched presets. See the body[data-quickadd-bar=…] rules in
  // <style>.
  // A task row on mobile stacks its priority/timeframe/due badges onto
  // their own line below the title (see .titlewrap in taskRowHtml) so the
  // title always gets the row's full width; the task detail page's own
  // category/due date/action fields keep their default cramped-wrapping
  // layout — alternate stacked/grouped mobile layouts for both were tried
  // and dropped.
  // tabBarMobileStyle: 'default' leaves the tab bar wrapping to a second
  // row once there isn't room for every tab (see renderTabRowLines() in
  // 06-tabs-render.js) — real chrome height spent before any task is on
  // screen. 'scroll' instead keeps it one row and lets it scroll
  // horizontally (with scroll-snap and a trailing fade hinting there's
  // more), the standard native-mobile tab pattern. Gated by
  // mobileUiActive() same as the rest of this lab.
  // tabBarDesktopStyle is the desktop-only counterpart, gated the other
  // way (only when mobileUiActive() is FALSE — see the body:not(
  // .mobileui-active) selectors in <style> — so shrinking the window to
  // phone width always falls back to the plain horizontal bar rather
  // than trying to cram a vertical column or index-tab staggering into a
  // narrow card). 'default' is today's horizontal wrapping pill row;
  // 'sidetabs' moves the whole bar into a vertical column down the
  // card's left edge (#appMain becomes a row — see .appmain in
  // shell-body.html — with #tabs as a tall, narrow left column) so every
  // label stays visible at once with no hover/tap-to-reveal step, the
  // most literal read of "tabs down the side of a ledger"; 'indextabs'
  // is a pure restyle of the existing horizontal row — each tab gets a
  // top border in its own category color (--tabhex, set inline by
  // renderTabs()) and a slight per-tab height stagger, so it reads more
  // like protruding book-index tabs than flat pills, with zero change to
  // click/wrap behavior.
  // fieldPickerStyle: 'default' keeps the plain <select> for Timeframe/
  // Priority (both in the main quick-add bar and a task's own detail
  // fields — see fieldPickerHtml() in 08-render-core.js). 'buttons' swaps
  // in a row of small pill buttons, one per step; 'progress' swaps in a
  // stylized filled track with a dot per step, plus a subtle pulse
  // animation once the field is at its top step (Urgent / High) — see
  // the .fieldprogress.atmax / .fieldbtn.atmax rules in <style>. NOT
  // gated by mobileUiActive() like the rest of this file's dev settings:
  // a nicer tap target beats a dropdown on desktop too, so this one
  // applies everywhere once picked, not just on a phone-ish viewport.
  // A task row's single tap/click always toggles the inline .expand
  // showing just Steps (taskSubtasksHtml()) on desktop — never the full
  // field set (category, due date, urgent/today, timeframe/priority,
  // notes), which used to fall out of this same tap and read as "quick
  // view" cluttered with edit options that took a real decision to reach.
  // Those fields live only on the full-page task detail now
  // (renderTaskDetailPage()), reached via the row's own always-visible
  // .rowexpand button (taskRowHtml(), 08-render-core.js) or the desktop
  // right-click menu's "Edit details" — both call openGenericTaskDetail()
  // directly. On mobile (mobileUiActive(), touch-first) a plain tap jumps
  // straight past the inline quick view to that same full-page task
  // detail; long-press instead opens a quick-actions menu (mark complete/
  // urgent/today, delete — same component as the desktop right-click
  // menu, see taskContextMenuHtml()/openTaskContextMenuForRow()) anchored
  // to the row. This is the platform-standard split (tap to go there,
  // long-press to act on it without leaving, swipe-back to return
  // cheaply) — see taskRowTap()/taskPressStart() in 08-render-core.js.
  // overlapSubtags / overlapStackMode are two further EXPERIMENTAL
  // sub-options of tabBarDesktopStyle's "overlap" look specifically —
  // only ever offered in the UI while that style is the current pick
  // (see devSettingsFieldsHtml() in 01-categories-theme.js). overlapSubtags
  // swaps each tab's inline dot+count for a small floating badge above it
  // (only rendered when that category actually has open tasks, plus a "!"
  // when one is overdue or High priority — see tabSubtagHtml() in
  // 06-tabs-render.js), freeing width for tighter scrunching.
  //   overlapStackMode used to be two separate fields (overlapHoverMode
  // 'default'/'push', plus an independent overlapRankStagger boolean) —
  // merged into one after the project owner pointed out the two were a
  // matched pair in practice: 'push' fixes the stack in a rank-by-
  // importance order (see tabImportanceRank()) instead of hover-to-
  // reorder, and the old separate stagger checkbox was the only thing
  // that made that fixed order actually *visible* at rest (a covered
  // tab's label peeking out further the more "important" it is) — push
  // without stagger looked nearly identical to the default at rest, and
  // stagger without push just staggered by plain tab position, which
  // read as "I checked a box and nothing happened." One field now:
  // 'hover' (default) is the original hover-to-reorder behavior with no
  // stagger; 'ranked' is push + stagger together, so the two effects
  // that only made sense combined can no longer be set independently.
  // See renderTabs()/computeOverlapPush()/overlapTabHoverStart() in
  // 06-tabs-render.js for the mechanism.
  // sidetabsAppearance / sidetabsShape are two further EXPERIMENTAL sub-
  // options of tabBarDesktopStyle's "sidetabs" look specifically — only
  // ever offered in the UI while that style is the current pick (see
  // devSettingsFieldsHtml() in 01-categories-theme.js), same pattern as
  // overlapSubtags/overlapStackMode above.
  // sidetabsAppearance splits into two families. 'classic'/'classicband'
  // are the ORIGINAL sidetabs look, unchanged: a plain fixed-width column
  // of full-width tabs sitting beside .leathercover (real #tabs content,
  // in normal flex flow — see the body:not(.mobileui-active)[data-tabbar-
  // desktop="sidetabs"][data-sidetabs-appearance="classic"] rules in
  // <style>), translucent when resting and --card-bg when active, from
  // the same base .tab/.tab.active rules every other tab style already
  // uses — no shape, no color band, no peeking. 'classicband' is the same
  // layout with the icon glyph swapped for a colored left-edge stripe.
  // 'color'/'translucentpill'/'edge' are the newer look: colored index-
  // tab-style labels that live BEHIND #appCard and OVER .leathercover,
  // each mostly tucked under the page with just enough poking out past
  // its left edge to read and click (see layoutSidetabsPeek() in
  // 06-tabs-render.js and the .sidetabspeek rules in <style> for the
  // mechanics — same clone-into-a-real-#appCard-sibling trick
  // tabBarDesktopStyle "overlap" uses for its own #tabConnector, since a
  // plain z-index on the real .tab elements can never outrank #appCard
  // from outside .leathercover's own stacking order). 'color' fills each
  // tab with its own category color (--tabhex); 'translucentpill' is the
  // same peeking mechanics with a plain translucent fill and rounded
  // pill-shaped end instead (this used to be called 'classic' before
  // 'classic' got reclaimed for the original layout above — no migration
  // for anyone with the old value saved, this is dev-only tooling under
  // active iteration); 'edge' drops the fill to --card-bg and the icon
  // too, leaving only the color band.
  // sidetabsShape (only meaningful for the peeking family — the classic
  // family ignores it entirely) picks the silhouette of the edge that
  // actually pokes out past the page — see the .sidetabspeek
  // .tab[data-shape="…"] rules. 'random' resolves to one of pagetab/
  // invertedv/arrows/sawtooth (never jagged — deliberately excluded, see
  // resolveSidetabShape() in 06-tabs-render.js) via the same stable
  // hashStr()-off-the-tab's-own-key idiom the overlap look's --tab-jitter
  // uses, so it doesn't reshuffle on every render. 'iconstyle' resolves
  // the same way but keyed off each category's own chosen icon glyph
  // (CATEGORY_ICON_SVG, set in Settings) instead of a hash — flag
  // categories read as literal little flags (pagetab), sharp icons (star/
  // diamond) get the arrow shape, round/plain ones (house/ring/square/
  // check/dot) get invertedv/sawtooth — see resolveSidetabShape() for the
  // exact mapping.
  // The custom right-click menu (toggle complete/urgent/today, edit, copy
  // title, delete — see handleTaskContextMenu() in 08-render-core.js) used
  // to be a dev setting here (customContextMenu); graduated to the real,
  // always-on desktop behavior, so there's no field for it anymore.
  // stackedTabsEnabled (mobile-only, like everything else this Mobile
  // section gates — see renderTabs()'s own stackedTabs branch in
  // 06-tabs-render.js) collapses every unpinned category of the same
  // .type (standard/checklist/calendar — see addCategory()) into one
  // shared tab, tap-through to whichever one is "on top," long-press for
  // a picker among the rest. stackedTabsTop remembers which category is
  // on top *per type* ({ standard:'work', checklist:'lists', ... }) —
  // deliberately its own map here rather than reordering state.categories
  // itself (moveCategory()'s own approach elsewhere), so picking a new top
  // for the mobile stack can never also reshuffle the plain, unstacked tab
  // order everyone else (including this same account on desktop, or with
  // the setting off) sees. A type with no entry yet just falls back to its
  // first member in state.categories order — see stackGroupsForTabs() in
  // 06-tabs-render.js.
  // tabBarMobileStyle/mobileColoredTabs/stackedTabsEnabled default to
  // 'scroll'/true/true (not 'default'/false/false like every other
  // EXPERIMENTAL field here) per the project owner's own ask — these
  // three graduated to being the actual default *behavior*, while
  // staying real Dev Settings (not promoted to permanent, ungated
  // features) so they can still be turned back off if that call changes.
  return { tagSeam:false, pendingTagStyle:'default', sidePanelEnabled:false, leatherInsetPreset:'classic', stackedPageInsetPreset:'leftheavy', mobileUiPreviewOnDesktop:false, quickAddBarStyle:'top', tabBarMobileStyle:'scroll', tabBarDesktopStyle:'overlap', overlapSubtags:true, overlapStackMode:'hover', sidetabsAppearance:'color', sidetabsShape:'pagetab', fieldPickerStyle:'default', checkGuideAnimationStyle:'radialping', developmentMode:false, categoryLabelStyle:'tab', taskDetailActionsPosition:'side', desktopZoom:'100', stackedTabsEnabled:true, stackedTabsTop:{}, stackedTabsStyle:'cards', swipeActionsEnabled:false, mobileColoredTabs:true };
}

// A brand new account's task list starts with a few illustrative examples
// instead of a blank "Nothing here yet." everywhere — shows what a task
// (and, for Lists, a checklist with a couple of steps) actually looks
// like without making anyone type one first, and doubles as a quick
// sanity check while testing: fresh accounts land with real content
// already sitting in a few different tabs. None carry a due date on
// purpose — they're only here to look at, not to imply an actual
// deadline. Uses the same shape addTask()/addChecklistList()/addSubtask()
// build (see 16-task-crud.js) rather than a trimmed-down one, so nothing
// downstream has to special-case an example task as different from a
// real one.
function defaultTasks(){
  const mk = (title, category, extra) => ({
    id: newId('task'), title, category, status:'open', urgent:false, dueDate:'', notes:'',
    subtasks: [], plannedDates: [], timeframe:'', priority:0, completedAt:'', createdAt: todayStr(),
    ...extra
  });
  // Titled "<Template>: <Name>" from the start, and linked to a template
  // (seeded alongside it — see defaultState() below) rather than a plain
  // "Packing list" — per the explicit ask: a bare-titled example list
  // would demonstrate the wrong convention for a feature whose whole
  // point is that every real list ends up "<Template>: <Name>" shaped.
  const list = mk('Packing list: Madrid Trip', 'lists', { templateId: newId('tpl') });
  list.subtasks = [
    { id:newId('sub'), text:'Passport', done:false, dueDate:'', plannedDates:[] },
    { id:newId('sub'), text:'Phone charger', done:false, dueDate:'', plannedDates:[] },
    { id:newId('sub'), text:'Toothbrush', done:true, dueDate:'', plannedDates:[] }
  ];
  return [
    // High priority + a short timeframe, with wording that reads as
    // urgent on its own — so a fresh account has at least one example of
    // what that combination actually looks like (the overlap tab bar's
    // "!" flag included) without needing a due date to explain why.
    mk("Call the client back — they're waiting", 'work', { priority:3, timeframe:'short' }),
    // One step cancelled (not just done) — a fresh account otherwise has
    // no way to discover that steps/tasks can be marked cancelled at all
    // (it's a right-click/long-press menu item, not a button — see
    // markSubtaskCancelled(), 16-task-crud.js), per the explicit ask to
    // demonstrate it up front.
    mk("Reply to that email you've been putting off", 'work', { subtasks: [
      { id:newId('sub'), text:'Draft a reply', done:false, dueDate:'', plannedDates:[] },
      { id:newId('sub'), text:'Follow up about the old proposal', done:true, cancelled:true, dueDate:'', plannedDates:[] }
    ] }),
    mk('Fix the squeaky door', 'household'),
    mk('Book a dentist appointment', 'personal'),
    list
  ];
}

// The canonical Style Preset catalog — genuine demos of what the
// feature actually captures, not placeholders. This is the ONE place
// their color data is authored; both defaultStylePresets() (what a
// brand-new account's own stylePresets list starts out as) and the
// "Browse Seasonal Presets" picker (seasonalPresetsBrowserHtml() in
// 09-settings.js, letting an EXISTING account pull in a fresh copy of
// one of these at any time) read from this same array, so the two can
// never drift out of sync with each other.
//
// Each entry's `catalogId` is fixed and stable (used only to look an
// entry up from the picker, e.g. addSeasonalStylePreset('seasonal-
// halloween')) — it's never the id a copy actually gets once it lands
// in someone's stylePresets, since defaultStylePresets() and
// addSeasonalStylePreset() both mint their own id for that (see
// cloneStylePresetBlueprint() below), so two different accounts', or
// two separate adds of the same seasonal entry, never collide.
//
// `categories` is applied POSITIONALLY wherever a Style Preset gets
// applied (see applyStylePreset() in 09-settings.js), not by id: entry N
// recolors whichever category currently sits at index N in
// state.categories, regardless of that category's own id/label. That's
// what lets one preset safely cover both a fresh 4-category account and
// an account with many more tabs — a preset with fewer live categories
// than stored colors just leaves the extra colors unused, and one with
// more categories than stored colors leaves the extras untouched,
// neither is a bug. Every preset here stores a full 12 colors
// specifically so it still has something to offer a heavily-customized
// account, not just the default four — 12 isn't a hard cap on
// categories, just the amount this seed data bothers to plan for.
const SEASONAL_STYLE_PRESETS = [{
    catalogId: 'seasonal-halloween',
    label: 'Halloween',
    theme: {
      bg: '#0D0710', paper: '#1C0F22',
      gradient: true, grain: true, pages: false, leather: false,
      uiPreset: 'custom',
      customUi: { label:'Halloween', primary:'#E07A1E', primaryLight:'#F0A050', secondary:'#7B3FA0', secondaryLight:'#9C6BC0' },
      inkFromUi: true, inkFromUiSource: 'primary'
    },
    // Deep near-black violet desk under a dark purple-black ledger
    // (paper stays under the 0.5 relLuminance line, same "real dark
    // mode" mechanism every dark Desk & Ledger preset in
    // 01-categories-theme.js uses) with Text & Lines Match UI Color on
    // (Primary) — per the explicit "make sure the text is a cool color"
    // ask, this is what actually produces the glowing pumpkin-orange ink
    // against the dark purple paper, not a separate hardcoded text color.
    deskPaletteId: 'midnight',
    uiPaletteId: 'classic',
    categoryPaletteId: 'classic',
    categories: [
      { hex:'#D9720E', icon:'dot' }, // pumpkin orange
      { hex:'#6B3FA0', icon:'dot' }, // witch purple
      { hex:'#8C2331', icon:'dot' }, // blood red
      { hex:'#4E8B4A', icon:'dot' }, // slime green
      { hex:'#D9A017', icon:'dot' }, // candy corn yellow
      { hex:'#2A3A6B', icon:'dot' }, // midnight blue
      { hex:'#3A3A3E', icon:'dot' }, // bat charcoal
      { hex:'#B85C1E', icon:'dot' }, // rust amber
      { hex:'#4A8C86', icon:'dot' }, // ghostly teal
      { hex:'#5C2140', icon:'dot' }, // plum wine
      { hex:'#9C9284', icon:'dot' }, // bone ash
      { hex:'#5E5468', icon:'dot' }  // spider grey-violet
    ]
  }, {
    catalogId: 'seasonal-meadow',
    label: 'Meadow',
    theme: {
      bg: '#4F6B4A', paper: '#F3ECD9',
      gradient: true, grain: true, pages: true, leather: false,
      uiPreset: 'custom',
      customUi: { label:'Meadow', primary:'#5C8A52', primaryLight:'#7CBA6F', secondary:'#D98A73', secondaryLight:'#FFBA9B' },
      inkFromUi: false, inkFromUiSource: 'primary'
    },
    // The light-mode counterpart to Halloween's dark one — a bright
    // sage-green desk under a warm cream ledger, leaf-green/coral UI
    // colors, and ordinary paper-derived ink (inkFromUi off) rather than
    // a glowing tinted one, so the two seeded presets also demo the two
    // different "Text & Lines Match UI Color" states, not just two color
    // schemes.
    deskPaletteId: 'classic',
    uiPaletteId: 'classic',
    categoryPaletteId: 'pastel',
    categories: [
      { hex:'#5C8A52', icon:'dot' }, // leaf green
      { hex:'#D98A73', icon:'dot' }, // coral pink
      { hex:'#6FA8C0', icon:'dot' }, // sky blue
      { hex:'#D9B04C', icon:'dot' }, // buttercup yellow
      { hex:'#9C86C0', icon:'dot' }, // lavender
      { hex:'#D98CA0', icon:'dot' }, // blush rose
      { hex:'#7A8C4E', icon:'dot' }, // moss
      { hex:'#B8663E', icon:'dot' }, // terracotta
      { hex:'#7A8AC0', icon:'dot' }, // periwinkle
      { hex:'#D9A22E', icon:'dot' }, // sunflower
      { hex:'#6FBFA0', icon:'dot' }, // mint
      { hex:'#A0699C', icon:'dot' }  // plum blossom
    ]
}];

// Deep-copies a SEASONAL_STYLE_PRESETS entry (or, from addSeasonalStylePreset()
// in 09-settings.js, an entry pulled in from the picker) into a real
// stylePresets entry with the given id — never shares theme.customUi or
// the categories array by reference with the catalog, so editing a copy
// later (updateStylePresetLook()) can never mutate the canonical catalog
// data itself.
function cloneStylePresetBlueprint(p, id){
  return {
    id,
    label: p.label,
    theme: { ...p.theme, customUi: p.theme.customUi ? { ...p.theme.customUi } : null },
    deskPaletteId: p.deskPaletteId,
    uiPaletteId: p.uiPaletteId,
    categoryPaletteId: p.categoryPaletteId,
    categories: p.categories.map(c => ({ ...c }))
  };
}

// A brand-new account's own starting stylePresets list — fixed, stable
// ids (rather than newId()) purely so they're recognizable/debuggable as
// "the seeded ones," though they're just as freely editable/deletable as
// any other saved preset from here on; nothing else assumes these ids
// stay put.
function defaultStylePresets(){
  return SEASONAL_STYLE_PRESETS.map(p => cloneStylePresetBlueprint(p, 'style-' + p.catalogId.replace('seasonal-','')));
}

function defaultState(){
  const tasks = defaultTasks();
  // The example "Packing list: Madrid Trip" list (defaultTasks() above)
  // is seeded already linked to a templateId — build the matching
  // template entry from its own items here, so a fresh account's
  // Templates view isn't empty either. Keeps the id-generation for that
  // link in the one place (defaultTasks()) rather than duplicating it.
  const list = tasks.find(t => t.category === 'lists' && t.templateId);
  const checklistTemplates = list ? [{
    id: list.templateId,
    name: 'Packing list',
    items: list.subtasks.map(s => s.text),
    createdAt: todayStr()
  }] : [];
  return {
    location: 'home',
    days: [],
    tasks,
    categories: defaultCategories(),
    locations: defaultLocations(),
    locationEnabled: true,
    theme: defaultTheme(),
    advancedTaskFields: true,
    devSettings: defaultDevSettings(),
    trash: [],
    checklistTemplates,
    // User-saved color templates (Desk & Ledger / UI Colors) and single
    // saved icon colors — separate from the fixed DESK_PAPER_PRESETS/
    // UI_COLOR_PRESETS/CATEGORY_PALETTE arrays in 01-categories-theme.js,
    // which are shipped defaults nobody can edit or delete. See
    // dualColorCustomHtml()/confirmSaveDualColorTemplate() and
    // categoryPickerHtml()/saveCurrentCategoryColorToCustom() in
    // 09-settings.js for where these are written.
    customDeskPresets: [],
    customUiPresets: [],
    customCategoryColors: [],
    // Whole-look Style Presets (Settings → Appearance → Style Presets) —
    // a step up from customDeskPresets/customUiPresets above: those each
    // save one piece (a bg/paper pair, a primary/secondary pair), this
    // saves the ENTIRE look at once — every Appearance field (including
    // Background gradient/grain/pages/leather and Text & Lines Match UI
    // Color + its Primary/Secondary choice) plus each existing category's
    // own color/icon — see buildStylePresetSnapshot()/applyStylePreset()
    // in 09-settings.js. Seeded with one built-in "Halloween" preset (see
    // defaultStylePresets() below) so the feature isn't an empty list the
    // first time anyone opens it.
    stylePresets: defaultStylePresets(),
    // Which of CATEGORY_PALETTE_SETS (01-categories-theme.js) is active —
    // 'classic' is the original set, so that's the default for both a
    // brand-new account and rebuildCategoryPalette()'s own fallback.
    categoryPaletteId: 'classic',
    // Same idea, one each for the Desk & Ledger and UI Colors pickers —
    // kept as two separate fields (not reusing categoryPaletteId) since
    // switching one is explicitly NOT meant to affect the other two.
    deskPaletteId: 'classic',
    uiPaletteId: 'classic'
  };
}

// How long a deleted task or checklist list sticks around in
// state.trash (Settings → Recently Deleted) before purgeOldTrash()
// removes it for good — per the explicit ask, prompted by losing a task
// with no way to get it back. A full timestamp (not just a date string,
// the way most of this app's other dates work) since "about 2 days"
// means a real ~48-hour window, not "however much of today plus today
// minus 2" a date-only comparison would give.
const TRASH_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;
// Called on every load (see normalizeState()) and every time the
// Recently Deleted section itself renders (trashSectionHtml(),
// 09-settings.js) — cheap enough to just always re-check rather than
// scheduling a timer, and the second call site is what keeps a
// long-running session (app left open across the 2-day mark) accurate
// without needing a reload to notice.
function purgeOldTrash(){
  if(!Array.isArray(state.trash)){ state.trash = []; return; }
  const cutoff = Date.now() - TRASH_RETENTION_MS;
  const before = state.trash.length;
  state.trash = state.trash.filter(entry => new Date(entry.deletedAt).getTime() > cutoff);
  if(state.trash.length !== before) queueSave();
}

function normalizeState(){
  if(!Array.isArray(state.days)) state.days = [];
  if(!Array.isArray(state.trash)) state.trash = [];
  purgeOldTrash();
  if(!Array.isArray(state.checklistTemplates)) state.checklistTemplates = [];
  if(!Array.isArray(state.customDeskPresets)) state.customDeskPresets = [];
  if(!Array.isArray(state.customUiPresets)) state.customUiPresets = [];
  if(!Array.isArray(state.customCategoryColors)) state.customCategoryColors = [];
  // Same seed-once idea as defaultCategories()'s own migration below —
  // an account saved before Style Presets existed gets the same built-in
  // "Halloween" preset a brand-new account starts with, rather than an
  // empty list.
  if(!Array.isArray(state.stylePresets)) state.stylePresets = defaultStylePresets();
  // 'greyscale' was consolidated into 'noir' across all three palette
  // systems (see CATEGORY_PALETTE_SETS/UI_COLOR_PRESET_SETS/
  // DESK_PAPER_PRESET_SETS, 01-categories-theme.js) — an account that had
  // it selected lands on the new merged set rather than silently falling
  // all the way back to 'classic' the way an unrecognized id normally
  // would just below.
  if(state.categoryPaletteId === 'greyscale') state.categoryPaletteId = 'noir';
  if(state.deskPaletteId === 'greyscale') state.deskPaletteId = 'noir';
  if(state.uiPaletteId === 'greyscale') state.uiPaletteId = 'noir';
  if(typeof state.categoryPaletteId !== 'string' || !CATEGORY_PALETTE_SETS[state.categoryPaletteId]) state.categoryPaletteId = 'classic';
  if(typeof state.deskPaletteId !== 'string' || !DESK_PAPER_PRESET_SETS[state.deskPaletteId]) state.deskPaletteId = 'classic';
  if(typeof state.uiPaletteId !== 'string' || !UI_COLOR_PRESET_SETS[state.uiPaletteId]) state.uiPaletteId = 'classic';
  // Rebuild both pointers before anything below (e.g. the theme.uiPreset
  // validation just past this) reads UI_COLOR_PRESETS/DESK_PAPER_PRESETS —
  // they need to reflect this account's own deskPaletteId/uiPaletteId, not
  // whatever a previous account left them pointing at.
  rebuildDeskPaperPresets();
  rebuildUiColorPresets();
  // Accounts saved before tabs became editable won't have a categories
  // array yet — seed it with the same set they've always seen so nothing
  // about their existing tasks' categories changes. Same idea for
  // locations, added alongside per-tab location editing, and theme,
  // added alongside custom colors/texture.
  if(!Array.isArray(state.categories) || !state.categories.length) state.categories = defaultCategories();
  // Accounts saved before category types existed only ever had the
  // 'standard' behavior, so that's the correct backfill.
  state.categories.forEach(c => { if(!c.type) c.type = 'standard'; });
  // 'calendar' was a short-lived third category type (a whole addable
  // tab) — the calendarTabTypeEnabled dev setting that gated it, and the
  // renderCalendar()/isCalendarCategory() code path itself, are both gone
  // now (the real way to reach a calendar view is the "Calendar" tag on
  // Daily's own day list). Any account that had actually created one
  // falls back to 'standard' rather than pointing at a type nothing
  // renders any more.
  state.categories.forEach(c => { if(c.type === 'calendar') c.type = 'standard'; });
  // 'ring' (a hollow-circle icon) was replaced outright by 'hexagon' — a
  // filled shape, not just a filled-in circle, since a solid circle would
  // have only duplicated 'dot' — see CATEGORY_ICON_SVG's own comment in
  // 01-categories-theme.js. Any account that had a category actually set
  // to 'ring' picks up the new icon automatically rather than pointing at
  // a glyph that no longer exists.
  state.categories.forEach(c => { if(c.icon === 'ring') c.icon = 'hexagon'; });
  // Heals a category left with c.hex = undefined by the (now-fixed)
  // setCategoryPaletteSet() bug — switching to a shorter palette set
  // (the 9-color Dark Mode sets vs every 12-color light set) could wipe
  // a category's color entirely for any category that had been sitting
  // in one of the slots the shorter set doesn't have, and that bad value
  // would already be saved to this account's real state by the time the
  // fix landed. Falls back to FALLBACK_CATEGORY's own hex — the same
  // color an orphaned (deleted-tab) task already renders under — rather
  // than leaving an invalid CSS value in place.
  state.categories.forEach(c => { if(!c.hex) c.hex = FALLBACK_CATEGORY.hex; });
  if(!Array.isArray(state.locations) || !state.locations.length) state.locations = defaultLocations();
  if(typeof state.locationEnabled !== 'boolean') state.locationEnabled = true;
  if(!state.theme) state.theme = defaultTheme();
  // Migrate the short-lived single-choice `texture: 'flat'|'grain'|'pages'`
  // shape (texture used to be exclusive) to the current independent
  // grain/pages booleans (now layerable).
  if(state.theme.texture !== undefined){
    state.theme.grain = state.theme.texture === 'grain';
    state.theme.pages = state.theme.texture === 'pages';
    delete state.theme.texture;
  }
  if(typeof state.theme.gradient !== 'boolean') state.theme.gradient = false;
  if(typeof state.theme.grain !== 'boolean') state.theme.grain = false;
  if(typeof state.theme.pages !== 'boolean') state.theme.pages = false;
  if(typeof state.theme.leather !== 'boolean') state.theme.leather = false;
  if(typeof state.theme.inkFromUi !== 'boolean') state.theme.inkFromUi = false;
  if(state.theme.inkFromUiSource !== 'primary' && state.theme.inkFromUiSource !== 'secondary') state.theme.inkFromUiSource = 'primary';
  const uiPresetIsCustom = state.theme.uiPreset === 'custom' && !!state.theme.customUi;
  if(typeof state.theme.uiPreset !== 'string' || (!uiPresetIsCustom && !UI_COLOR_PRESETS.some(p=>p.id===state.theme.uiPreset))) state.theme.uiPreset = 'rust';
  if(typeof state.advancedTaskFields !== 'boolean') state.advancedTaskFields = true;
  if(!state.devSettings) state.devSettings = defaultDevSettings();
  if(typeof state.devSettings.tagSeam !== 'boolean') state.devSettings.tagSeam = false;
  if(typeof state.devSettings.pendingTagStyle !== 'string') state.devSettings.pendingTagStyle = 'default';
  // 'cornerpeek' was removed as a pendingTagStyle option — any account
  // that had it selected falls back to 'default' rather than pointing at
  // a style nothing renders any more.
  if(state.devSettings.pendingTagStyle === 'cornerpeek') state.devSettings.pendingTagStyle = 'default';
  if(typeof state.devSettings.sidePanelEnabled !== 'boolean') state.devSettings.sidePanelEnabled = false;
  if(typeof state.devSettings.leatherInsetPreset !== 'string') state.devSettings.leatherInsetPreset = 'classic';
  if(typeof state.devSettings.stackedPageInsetPreset !== 'string') state.devSettings.stackedPageInsetPreset = 'leftheavy';
  if(typeof state.devSettings.mobileUiPreviewOnDesktop !== 'boolean') state.devSettings.mobileUiPreviewOnDesktop = false;
  if(typeof state.devSettings.stackedTabsEnabled !== 'boolean') state.devSettings.stackedTabsEnabled = false;
  if(typeof state.devSettings.stackedTabsTop !== 'object' || !state.devSettings.stackedTabsTop) state.devSettings.stackedTabsTop = {};
  if(typeof state.devSettings.stackedTabsStyle !== 'string') state.devSettings.stackedTabsStyle = 'cards';
  if(typeof state.devSettings.swipeActionsEnabled !== 'boolean') state.devSettings.swipeActionsEnabled = false;
  if(typeof state.devSettings.mobileColoredTabs !== 'boolean') state.devSettings.mobileColoredTabs = false;
  if(state.devSettings.quickAddBarStyle !== 'top' && state.devSettings.quickAddBarStyle !== 'bottom') state.devSettings.quickAddBarStyle = 'top';
  if(typeof state.devSettings.tabBarMobileStyle !== 'string') state.devSettings.tabBarMobileStyle = 'default';
  if(typeof state.devSettings.tabBarDesktopStyle !== 'string') state.devSettings.tabBarDesktopStyle = 'default';
  if(typeof state.devSettings.desktopZoom !== 'string') state.devSettings.desktopZoom = '100';
  if(typeof state.devSettings.overlapSubtags !== 'boolean') state.devSettings.overlapSubtags = false;
  if(state.devSettings.overlapStackMode !== 'hover' && state.devSettings.overlapStackMode !== 'ranked') state.devSettings.overlapStackMode = 'hover';
  if(typeof state.devSettings.sidetabsAppearance !== 'string') state.devSettings.sidetabsAppearance = 'color';
  // 'textured' was removed (a plain noise-filter overlay, not a real
  // material texture — didn't hold up). Only ever reachable by an account
  // that had it selected before the removal, so falling it back to the
  // plain colored look is the same "point at something that still
  // renders" idea as the calendar-type migration above.
  if(state.devSettings.sidetabsAppearance === 'textured') state.devSettings.sidetabsAppearance = 'color';
  if(typeof state.devSettings.sidetabsShape !== 'string') state.devSettings.sidetabsShape = 'pagetab';
  if(typeof state.devSettings.fieldPickerStyle !== 'string') state.devSettings.fieldPickerStyle = 'default';
  if(typeof state.devSettings.checkGuideAnimationStyle !== 'string') state.devSettings.checkGuideAnimationStyle = 'radialping';
  // 'spin' (a rotating conic-gradient square behind the checkbox) was
  // replaced by 'wiggle' (the checkbox itself rotating back and forth) —
  // the old style just didn't read as a shake-to-get-attention nudge, and
  // being a hardcoded square it couldn't work for the checklist's round
  // .checkcircle either. An account with 'spin' already picked migrates
  // to its direct replacement rather than silently landing on whatever
  // the new default happens to be.
  if(state.devSettings.checkGuideAnimationStyle === 'spin') state.devSettings.checkGuideAnimationStyle = 'wiggle';
  if(typeof state.devSettings.developmentMode !== 'boolean') state.devSettings.developmentMode = false;
  if(typeof state.devSettings.categoryLabelStyle !== 'string') state.devSettings.categoryLabelStyle = 'tab';
  if(typeof state.devSettings.taskDetailActionsPosition !== 'string') state.devSettings.taskDetailActionsPosition = 'side';
  state.tasks.forEach(t=>{
    if(t.subtasks===undefined) t.subtasks = [];
    // plannedDate (one day, exclusive) migrated to plannedDates (an array)
    // so a task can sit on more than one day's list at once — see the
    // note on planTaskForDay() for why exclusivity was actually a bug.
    if(t.plannedDates===undefined) t.plannedDates = t.plannedDate ? [t.plannedDate] : [];
    delete t.plannedDate;
    // Steps didn't used to carry their own dates — dueDate (typed/parsed,
    // informational) and plannedDates (which days' lists this step is on,
    // independent of the parent task's own plannedDates) both default to
    // "unset" for every pre-existing step.
    (t.subtasks||[]).forEach(s=>{
      if(s.dueDate===undefined) s.dueDate = '';
      if(s.plannedDates===undefined) s.plannedDates = s.plannedDate ? [s.plannedDate] : [];
      delete s.plannedDate;
    });
    // Bookkeeping (createdAt already existed) plus the optional advanced
    // fields — timeframe/priority default to "unset" rather than any
    // particular value, and completedAt is only ever set by toggleStatus().
    if(t.timeframe===undefined) t.timeframe = '';
    if(t.priority===undefined) t.priority = 0;
    if(t.completedAt===undefined) t.completedAt = '';
    // timeframeManual: whether the current t.timeframe came from an
    // explicit pick (updateTimeframe(), 14-task-actions.js) rather than
    // being auto-derived from the due date (deriveTimeframeFromDueDate(),
    // 05-dates-sort.js) — protects a deliberate choice from later being
    // silently overwritten when the due date changes. Pre-existing tasks
    // predate this flag entirely, so there's no real record of which way
    // any of them got their value; defaulting to "manual" whenever a
    // timeframe is already set is the safe reading — it means this
    // feature only ever starts auto-filling *forward* from here, never
    // reaches back and starts rewriting an established task's already-set
    // field the first time this ships. A task with no timeframe yet has
    // nothing to protect either way, so it defaults to auto-eligible.
    if(typeof t.timeframeManual !== 'boolean') t.timeframeManual = !!t.timeframe;
  });
  rebuildCategoriesIndex();
  rebuildCategoryPalette();
}

async function loadState(){
  // Retry once before giving up — a single failed request (e.g. a network
  // blip) should never be mistaken for "no saved data" and wipe the ledger.
  for(let attempt=0; attempt<2; attempt++){
    try{
      const res = await storage.get('tracker-state', false);
      if(res && res.value){ state = JSON.parse(res.value); normalizeState(); return; }
      break; // request succeeded and genuinely found nothing saved yet
    }catch(e){
      if(attempt===0){ await new Promise(r=>setTimeout(r,500)); continue; }
      console.error('Could not load saved ledger after retry, starting fresh locally', e);
    }
  }
  // Use the default in memory, but do NOT write it to storage here — only
  // save once you actually interact, so a load failure can never overwrite
  // real saved data with a blank slate.
  state = defaultState();
  normalizeState();
}

