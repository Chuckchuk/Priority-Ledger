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
// as that field's "max" (urgent / High) for the pulse animation.
const TIMEFRAME_STEPS = [
  { v:'', label:'None' },
  { v:'today', label:'Today' },
  { v:'short', label:'Short' },
  { v:'medium', label:'Medium' },
  { v:'long', label:'Long' },
  { v:'urgent', label:'Urgent' }
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
let settingsOpen = false;
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
// Mobile UI Lab overlay state (see defaultDevSettings() above and
// toggleQuickAddSheet()/openFabAdd() in 16-task-crud.js) — pure UI chrome,
// never persisted, same as the other open/closed flags on this page.
let quickAddOpen = false;
let fabAddOpen = false;
// taskLongPressMode's "split" variant (see defaultDevSettings() below and
// taskPressStart()/openTaskSettingsSheet() in 08-render-core.js) — which
// task (if any) has its management-fields sheet open, plus the shared
// long-press timer/gesture-tracking state. All pure UI chrome, same as
// the rest of this block.
let taskSettingsOpenId = null;
let taskPressTimer = null;
let taskLongPressFired = false;
let taskPressStartX = 0;
let taskPressStartY = 0;
let taskPressRow = null;
// id of the category whose color/icon popover (see categoryPickerHtml() in
// 01-categories-theme.js) is currently open, or null — only one open at a
// time, same "single id, not a Set" pattern as pendingDeleteCategoryId.
let openCategoryPickerId = null;
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
let settingsCollapsedSections = new Set(['dev', 'dev-desktop', 'dev-mobile']);
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
  // quickAddMobileStyle/taskRowMobileStyle/taskDetailMobileStyle/
  // floatingAddButton are all gated behind mobileUiActive() (see
  // 01-categories-theme.js) rather than a plain body class each reads
  // directly — every one of them exists to fix a *phone-width* cramming
  // problem (the quick-add bar wrapping into three rows, a task row's
  // badges squeezing its title, the expand-row reading like a dense
  // form), so by default they stay completely inert on desktop even when
  // turned on. mobileUiPreviewOnDesktop is the one shared escape hatch —
  // it forces mobileUiActive() true regardless of viewport/pointer, so
  // the project owner can preview any of these on a desktop browser
  // without narrowing the window. One shared flag rather than a
  // per-feature "also on desktop" checkbox, since the ask was to preview
  // the whole lab on desktop, not any one piece of it in isolation.
  // quickAddMobileStyle: how the main category quick-add bar (the
  // 6-control row that wraps into three lines on a phone) is reached on
  // mobile — always via a single "+ Add Task" trigger now (see
  // .quickaddtrigger in <style>), never the old always-visible inline
  // row: that 'default' variant is gone entirely (see the removed option
  // in devSettingsFieldsHtml(), 01-categories-theme.js, and its migration
  // in normalizeState() below), replaced by the sticky trigger itself
  // (position depends on quickAddTriggerPosition just below) — per the
  // project owner's own ask, rather than scrolling away at the top of
  // the list the way the inline row always did. This setting now only
  // controls what tapping that trigger actually opens: 'topsheet'/
  // 'bottomsheet' open the real bar as a full-width overlay sheet sliding
  // in from that edge, with a dimming scrim behind it; 'inline' instead
  // grows the bar open right next to the trigger with no scrim — which
  // direction it grows (up, if the trigger is docked at the bottom; down,
  // if it's docked at the top) follows quickAddTriggerPosition too, see
  // the [data-quickadd-trigger-pos][data-quickadd-mode="inline"] rules in
  // <style>.
  // quickAddTriggerPosition: where that trigger docks — 'bottom' (the
  // default) pins it position:fixed to the bottom of the screen, which is
  // what "sticky" originally meant here; 'top' instead restores it to its
  // pre-sticky spot in the normal flow, right under the tab bar, but held
  // there via position:sticky rather than plain static positioning, so it
  // no longer scrolls away with the list either — both are genuinely
  // sticky, just anchored at opposite ends of the screen. Added as a
  // choice (not a straight replacement) once it turned out "at the
  // bottom" wasn't what the project owner actually had in mind by
  // "sticky" — the original ask was for the top-docked trigger to stop
  // scrolling away, not to relocate it.
  // taskRowMobileStyle: 'default' leaves a task row's title fighting its
  // priority/timeframe/due badges for space on one line; 'stacked' moves
  // the badges onto their own line below the title (see .titlewrap in
  // taskRowHtml) so the title always gets the row's full width; 'minimal'
  // instead reclaims width by hiding the drag handle and category dot on
  // a row (touch drag-reorder is marginal anyway, and the dot is
  // redundant once you're already inside that category's own tab).
  // taskDetailMobileStyle: 'default' leaves the expand-row's category
  // select/due date/action buttons crammed into one wrapping line;
  // 'stacked' puts each field on its own full-width line with the three
  // action buttons (urgent/today-pin/remove) grouped into their own even
  // row via .expandactions; 'grouped' instead grids category+due date
  // into an even two-column row (dropping their text labels) with the
  // action buttons in a second, evenly-spaced row — a middle ground
  // between the cramped default and fully stacked.
  // floatingAddButton: a persistent (+) button, always on screen
  // regardless of which tab is active (Daily, checklist, Settings,
  // everywhere) — a lightweight "quick capture" (title + category only,
  // see openFabAdd()/submitFabAdd() in 16-task-crud.js), not the full
  // quick-add bar, since it has to make sense from views that don't have
  // a quick-add bar of their own at all.
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
  // settingsRowMobileStyle: 'default' leaves a category row in Settings
  // as one flat wrapping line — reorder buttons, the color/icon picker,
  // the label you're editing, and the destructive Delete button all at
  // the same visual weight, competing with the label for the row's
  // ~120px-min-width floor on a phone (see .catedit). 'grouped' moves
  // Delete (or its warning+confirm+cancel trio, via .catdeletewrap in
  // 09-settings.js) onto its own right-aligned line and mutes its resting
  // look — the label gets the whole top line to itself, and the one
  // dangerous control on the row reads as deliberately secondary instead
  // of same-weight as everything else.
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
  // taskLongPressMode: a task row's single tap/click always toggles the
  // inline .expand showing just Steps (taskSubtasksHtml()) now — never
  // the full field set (category, due date, urgent/today, timeframe/
  // priority, notes), which used to fall out of this same tap on desktop
  // (nothing ever gated that the way mobileUiActive() gates the rest of
  // this setting) and read as "quick view" cluttered with edit options
  // that took a real decision to reach. Those fields live only on the
  // full-page task detail now (renderTaskDetailPage()), reached via the
  // row's own always-visible .rowexpand button (taskRowHtml(),
  // 08-render-core.js) or the desktop right-click menu's "Edit details" —
  // both call openGenericTaskDetail() directly, independent of this
  // setting. This setting only changes what's *additionally* true on
  // mobile (gated by mobileUiActive(), touch-first), which arms a
  // long-press timer (taskPressStart() et al.) on top of the tap above:
  //   'split':  long-press opens the full field set as its own bottom
  //             sheet (openTaskSettingsSheet()) — Steps are left out,
  //             already visible via the plain tap above.
  //   'detail': a plain tap jumps straight past the inline quick view,
  //             straight to the full-page task detail (openGenericTaskDetail(),
  //             same page Daily's own taskDetailId uses); long-press
  //             instead opens a quick-actions menu (mark complete/urgent/
  //             today, delete — same component as the desktop right-click
  //             menu, see taskContextMenuHtml()/openTaskContextMenuForRow())
  //             anchored to the row. This is the platform-standard split
  //             (tap to go there, long-press to act on it without leaving,
  //             swipe-back to return cheaply) and is the default — see
  //             defaultDevSettings()'s taskLongPressMode value below.
  //   'default': no long-press action at all — the plain tap's Steps-only
  //             quick view is the only thing this mode adds over desktop.
  // overlapSubtags / overlapHoverMode are two further EXPERIMENTAL
  // sub-options of tabBarDesktopStyle's "overlap" look specifically —
  // only ever offered in the UI while that style is the current pick
  // (see devSettingsFieldsHtml() in 01-categories-theme.js). overlapSubtags
  // swaps each tab's inline dot+count for a small floating badge above it
  // (only rendered when that category actually has open tasks, plus a "!"
  // when one is overdue or High priority — see tabSubtagHtml() in
  // 06-tabs-render.js), freeing width for tighter scrunching.
  // overlapHoverMode's 'push' variant replaces hover-to-reorder with a
  // fixed stacking order (by open-task "importance", see
  // tabImportanceRank()) plus neighbors sliding away from whichever tab is
  // hovered or selected instead (see computeOverlapPush()) — both in
  // 06-tabs-render.js. overlapRankStagger is independent of hover mode —
  // a further-back tab (lower --tabidx, whether that's ranked by position
  // or by importance) sits a little higher at rest, just enough that its
  // own label peeks above whichever tab is currently covering it, rather
  // than a covered tab being unreadable until you interact with it.
  // sidetabsAppearance / sidetabsShape are two further EXPERIMENTAL sub-
  // options of tabBarDesktopStyle's "sidetabs" look specifically — only
  // ever offered in the UI while that style is the current pick (see
  // devSettingsFieldsHtml() in 01-categories-theme.js), same pattern as
  // overlapSubtags/overlapHoverMode above.
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
  // (CATEGORY_ICON_GLYPHS, set in Settings) instead of a hash — flag
  // categories read as literal little flags (pagetab), sharp icons (star/
  // diamond) get the arrow shape, round/plain ones (house/ring/square/
  // check/dot) get invertedv/sawtooth — see resolveSidetabShape() for the
  // exact mapping.
  // The custom right-click menu (toggle complete/urgent/today, edit, copy
  // title, delete — see handleTaskContextMenu() in 08-render-core.js) used
  // to be a dev setting here (customContextMenu); graduated to the real,
  // always-on desktop behavior, so there's no field for it anymore.
  return { tagSeam:false, pendingTagStyle:'default', showListDates:false, sidePanelEnabled:false, leatherInsetPreset:'classic', stackedPageInsetPreset:'leftheavy', mobileUiPreviewOnDesktop:false, quickAddMobileStyle:'bottomsheet', quickAddTriggerPosition:'bottom', taskRowMobileStyle:'default', taskDetailMobileStyle:'default', floatingAddButton:false, tabBarMobileStyle:'default', tabBarDesktopStyle:'overlap', overlapSubtags:true, overlapHoverMode:'default', overlapRankStagger:false, sidetabsAppearance:'color', sidetabsShape:'pagetab', settingsRowMobileStyle:'default', fieldPickerStyle:'default', taskLongPressMode:'detail', stickyTabBar:false, checkGuideAnimationStyle:'radialping', developmentMode:false, categoryLabelStyle:'tab', expandGroupingStyle:'rail', taskDetailActionsPosition:'side' };
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
  const list = mk('Packing list', 'lists');
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
    mk("Reply to that email you've been putting off", 'work'),
    mk('Fix the squeaky door', 'household'),
    mk('Book a dentist appointment', 'personal'),
    list
  ];
}

function defaultState(){
  return {
    location: 'home',
    days: [],
    tasks: defaultTasks(),
    categories: defaultCategories(),
    locations: defaultLocations(),
    locationEnabled: true,
    theme: defaultTheme(),
    advancedTaskFields: true,
    devSettings: defaultDevSettings()
  };
}

function normalizeState(){
  if(!Array.isArray(state.days)) state.days = [];
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
  if(typeof state.devSettings.showListDates !== 'boolean') state.devSettings.showListDates = false;
  if(typeof state.devSettings.sidePanelEnabled !== 'boolean') state.devSettings.sidePanelEnabled = false;
  if(typeof state.devSettings.leatherInsetPreset !== 'string') state.devSettings.leatherInsetPreset = 'classic';
  if(typeof state.devSettings.stackedPageInsetPreset !== 'string') state.devSettings.stackedPageInsetPreset = 'leftheavy';
  if(typeof state.devSettings.mobileUiPreviewOnDesktop !== 'boolean') state.devSettings.mobileUiPreviewOnDesktop = false;
  // 'default' (the old always-visible inline row) is no longer a valid
  // value — see the quickAddMobileStyle comment above — so an account
  // saved before this change migrates to the new floor behavior's own
  // default, same as a genuinely missing/malformed value would.
  if(typeof state.devSettings.quickAddMobileStyle !== 'string' || state.devSettings.quickAddMobileStyle === 'default') state.devSettings.quickAddMobileStyle = 'bottomsheet';
  if(typeof state.devSettings.quickAddTriggerPosition !== 'string') state.devSettings.quickAddTriggerPosition = 'bottom';
  if(typeof state.devSettings.taskRowMobileStyle !== 'string') state.devSettings.taskRowMobileStyle = 'default';
  if(typeof state.devSettings.taskDetailMobileStyle !== 'string') state.devSettings.taskDetailMobileStyle = 'default';
  if(typeof state.devSettings.floatingAddButton !== 'boolean') state.devSettings.floatingAddButton = false;
  if(typeof state.devSettings.tabBarMobileStyle !== 'string') state.devSettings.tabBarMobileStyle = 'default';
  if(typeof state.devSettings.tabBarDesktopStyle !== 'string') state.devSettings.tabBarDesktopStyle = 'default';
  if(typeof state.devSettings.overlapSubtags !== 'boolean') state.devSettings.overlapSubtags = false;
  if(typeof state.devSettings.overlapHoverMode !== 'string') state.devSettings.overlapHoverMode = 'default';
  if(typeof state.devSettings.overlapRankStagger !== 'boolean') state.devSettings.overlapRankStagger = false;
  if(typeof state.devSettings.sidetabsAppearance !== 'string') state.devSettings.sidetabsAppearance = 'color';
  // 'textured' was removed (a plain noise-filter overlay, not a real
  // material texture — didn't hold up). Only ever reachable by an account
  // that had it selected before the removal, so falling it back to the
  // plain colored look is the same "point at something that still
  // renders" idea as the calendar-type migration above.
  if(state.devSettings.sidetabsAppearance === 'textured') state.devSettings.sidetabsAppearance = 'color';
  if(typeof state.devSettings.sidetabsShape !== 'string') state.devSettings.sidetabsShape = 'pagetab';
  if(typeof state.devSettings.settingsRowMobileStyle !== 'string') state.devSettings.settingsRowMobileStyle = 'default';
  if(typeof state.devSettings.fieldPickerStyle !== 'string') state.devSettings.fieldPickerStyle = 'default';
  if(typeof state.devSettings.taskLongPressMode !== 'string') state.devSettings.taskLongPressMode = 'detail';
  if(typeof state.devSettings.stickyTabBar !== 'boolean') state.devSettings.stickyTabBar = false;
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
  if(typeof state.devSettings.expandGroupingStyle !== 'string') state.devSettings.expandGroupingStyle = 'rail';
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

