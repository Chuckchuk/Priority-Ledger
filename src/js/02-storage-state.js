// Filled in once the project exists — see CLAUDE.md for setup steps.
const SUPABASE_URL = 'https://kyswrzkgiphsniepahje.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5c3dyemtnaXBoc25pZXBhaGplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzk1NTAsImV4cCI6MjEwMjgxNTU1MH0.mvDp9f1KcqAol3Tq4Libi32tODMCrVv8HdD3C9-x30c';
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
// Which theme color's own wheel popover is open — 'bg' | 'paper' | null.
// A separate var from customColorOpen (the category wheel) since it's a
// wholly separate popover anchored to a different trigger; see
// closeAllSettingsPopovers() in 09-settings.js for why only one of any of
// these may be open at once (they share the wheel's DOM ids).
let themeColorWheelKey = null;
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
// Settings section keys currently collapsed (Manage Tabs/Locations/Task
// Fields/Appearance/Claude Access/Dev Settings) — 'dev' starts collapsed
// to match its old default (a plain <details> with no `open` attribute),
// everything else starts expanded. A Set here (not a native <details>
// per section) is what actually fixes a real bug the old <details>-based
// Dev Settings had: renderSettings() rebuilds #settingsView's whole
// innerHTML on every single render (any checkbox flip included), and a
// fresh <details> element has no memory of being open — so the section
// silently collapsed itself back shut after every change made inside it.
// Tracking "which sections are collapsed" here, outside the DOM, is what
// survives that rebuild.
let settingsCollapsedSections = new Set(['dev']);
// Set only while a pointer drag on the hue ring or the SV square is in
// progress — {type:'hue'|'sv', rect}. See catWheelCancelDrag() for why
// this (and the document-level listeners it implies) must be torn down
// whenever the popover closes, not just on pointerup.
let catWheelDragCtx = null;
let session = null; // { access_token, refresh_token, expires_at, user_id, email }
let localOnlyMode = false; // explicit opt-out of an account, chosen on the auth screen
let authMode = 'signin';

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

// EXPERIMENTAL — Settings → Dev Settings. Two alternate .pagetag looks
// being tried out (see applyDevSettings()/toggleDevSetting() and the
// body.devtag-seam/body.devtag-outline CSS) so the project owner can
// compare them live and decide which, if either, to keep. Isolated in
// its own state key and its own commit specifically so it's trivial to
// rip out later without touching anything else.
function defaultDevSettings(){
  // pendingTagColor:'theme' means "no override" — the real Secondary
  // color (state.theme.uiPreset, see UI_COLOR_PRESETS in
  // 01-categories-theme.js) shows through untouched. See the CSS comment
  // on .pagetag.compact's base rule for how the override rules relate.
  // calendarTabTypeEnabled: 'Calendar' started as its own category type
  // (a whole addable tab), but the actual ask turned out to be a compact
  // pagetag linking Daily's own day-list to a calendar view — see
  // openDailyCalendar()/renderDailyCalendar() in 18-calendar.js, which is
  // what a normal user reaches now. The category-type path still works
  // (renderCalendar(), isCalendarCategory()) and is worth keeping rather
  // than deleting working code, but it's gated behind this flag so it
  // doesn't show up as a real option in Settings' "add a new tab" select
  // unless explicitly opted into here.
  // calendarCellStyle: how much a calendar cell shows beyond the plain
  // done/total ratio — 'ratio' (the original, still the default) shows
  // nothing more; 'dots-top'/'icons-below' add a row of that day's
  // category chips (see dayCategoryIds() in 11-daily-core.js and
  // calendarCatChipsHtml() in 18-calendar.js) above or below the existing
  // content. calendarTodayOrnate is a separate, independent toggle (like
  // tagSeam/tagOutline above) for a double-line border on today's cell,
  // not tied to any particular calendarCellStyle choice.
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
  // can be non-classic at once.
  // fullPageSwipeNav: widens the day/month swipe-nav gesture (see
  // classifySwipeZone() in 19-bootstrap.js) from its default reserved
  // strip — .daynavrow / .calnav, the row the prev/next arrows and the
  // Today/weekday label sit in — to the entire day-detail or calendar
  // page. Off by default because that same whole-page area is also where
  // swipe-right-to-go-back (any .stackedpage's own non-compact .pagetag)
  // normally lives; turning this on makes day/month nav win that contest
  // everywhere on those two pages specifically, rather than the two
  // gestures fighting over the same touch.
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
  // 6-control row that wraps into three lines on a phone) is reached —
  // 'default' leaves it exactly as it's always been (always-visible
  // inline row); 'topsheet'/'bottomsheet' replace it with a single
  // "+ Add Task" trigger that opens the real bar as a full-width overlay
  // sheet sliding in from that edge; 'inline' keeps the trigger in the
  // document's normal flow and expands the bar open right beneath it
  // (no overlay, tab bar never covered).
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
  // taskLongPressMode: 'default' leaves a task row's single tap/click
  // toggling the *entire* .expand block (every field at once, see
  // taskExpandFieldsHtml() in 08-render-core.js). 'split' — gated by
  // mobileUiActive(), touch-first — divides that in two: a short tap
  // toggles a trimmed .expand showing just its Steps (taskSubtasksHtml()),
  // since that's the thing worth glancing at most often, while a genuine
  // long-press (taskPressStart() et al.) opens the rest — category, due
  // date, urgent/today flags, timeframe/priority, notes — as its own
  // bottom sheet (openTaskSettingsSheet()), out of the way until you
  // actually reach for it.
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
  // customContextMenu (desktop-only — see mobileUiActive() gating in
  // handleTaskContextMenu(), 08-render-core.js): replaces the browser's
  // own right-click menu on a task row with a small app-specific one
  // (toggle complete/urgent/today, edit, copy title, delete) instead of
  // the generic Back/Reload/Inspect/"Look Up" chrome no web app actually
  // wants. Off by default since silently swallowing right-click
  // everywhere is a meaningfully different (and less reversible-feeling)
  // change than the rest of this file's purely visual toggles. Right-
  // clicking inside an actual text field (input/textarea) always keeps
  // the native menu regardless of this setting — Copy/Paste/spellcheck
  // there is exactly the "some of it is still useful" case the project
  // owner asked to keep.
  return { tagSeam:false, tagOutline:false, pendingTagStyle:'default', pendingTagColor:'theme', showListDates:false, dayTreeCatBubble:false, sidePanelEnabled:false, calendarTabTypeEnabled:false, calendarCellStyle:'ratio', calendarTodayOrnate:false, leatherInsetPreset:'classic', stackedPageInsetPreset:'classic', fullPageSwipeNav:false, mobileUiPreviewOnDesktop:false, quickAddMobileStyle:'default', taskRowMobileStyle:'default', taskDetailMobileStyle:'default', floatingAddButton:false, tabBarMobileStyle:'default', tabBarDesktopStyle:'overlap', overlapSubtags:true, overlapHoverMode:'default', overlapRankStagger:false, settingsRowMobileStyle:'default', fieldPickerStyle:'default', taskLongPressMode:'default', customContextMenu:false };
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
  const mk = (title, category) => ({
    id: newId('task'), title, category, status:'open', urgent:false, dueDate:'', notes:'',
    subtasks: [], plannedDates: [], timeframe:'', priority:0, completedAt:'', createdAt: todayStr()
  });
  const list = mk('Packing list', 'lists');
  list.subtasks = [
    { id:newId('sub'), text:'Passport', done:false, dueDate:'', plannedDates:[] },
    { id:newId('sub'), text:'Phone charger', done:false, dueDate:'', plannedDates:[] },
    { id:newId('sub'), text:'Toothbrush', done:true, dueDate:'', plannedDates:[] }
  ];
  return [
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
  if(typeof state.theme.uiPreset !== 'string' || !UI_COLOR_PRESETS.some(p=>p.id===state.theme.uiPreset)) state.theme.uiPreset = 'classic';
  if(typeof state.advancedTaskFields !== 'boolean') state.advancedTaskFields = true;
  if(!state.devSettings) state.devSettings = defaultDevSettings();
  if(typeof state.devSettings.tagSeam !== 'boolean') state.devSettings.tagSeam = false;
  if(typeof state.devSettings.tagOutline !== 'boolean') state.devSettings.tagOutline = false;
  if(typeof state.devSettings.pendingTagStyle !== 'string') state.devSettings.pendingTagStyle = 'default';
  if(typeof state.devSettings.pendingTagColor !== 'string') state.devSettings.pendingTagColor = 'theme';
  if(typeof state.devSettings.showListDates !== 'boolean') state.devSettings.showListDates = false;
  if(typeof state.devSettings.dayTreeCatBubble !== 'boolean') state.devSettings.dayTreeCatBubble = false;
  if(typeof state.devSettings.sidePanelEnabled !== 'boolean') state.devSettings.sidePanelEnabled = false;
  if(typeof state.devSettings.calendarTabTypeEnabled !== 'boolean') state.devSettings.calendarTabTypeEnabled = false;
  if(typeof state.devSettings.calendarCellStyle !== 'string') state.devSettings.calendarCellStyle = 'ratio';
  if(typeof state.devSettings.calendarTodayOrnate !== 'boolean') state.devSettings.calendarTodayOrnate = false;
  if(typeof state.devSettings.leatherInsetPreset !== 'string') state.devSettings.leatherInsetPreset = 'classic';
  if(typeof state.devSettings.stackedPageInsetPreset !== 'string') state.devSettings.stackedPageInsetPreset = 'classic';
  if(typeof state.devSettings.fullPageSwipeNav !== 'boolean') state.devSettings.fullPageSwipeNav = false;
  if(typeof state.devSettings.mobileUiPreviewOnDesktop !== 'boolean') state.devSettings.mobileUiPreviewOnDesktop = false;
  if(typeof state.devSettings.quickAddMobileStyle !== 'string') state.devSettings.quickAddMobileStyle = 'default';
  if(typeof state.devSettings.taskRowMobileStyle !== 'string') state.devSettings.taskRowMobileStyle = 'default';
  if(typeof state.devSettings.taskDetailMobileStyle !== 'string') state.devSettings.taskDetailMobileStyle = 'default';
  if(typeof state.devSettings.floatingAddButton !== 'boolean') state.devSettings.floatingAddButton = false;
  if(typeof state.devSettings.tabBarMobileStyle !== 'string') state.devSettings.tabBarMobileStyle = 'default';
  if(typeof state.devSettings.tabBarDesktopStyle !== 'string') state.devSettings.tabBarDesktopStyle = 'default';
  if(typeof state.devSettings.overlapSubtags !== 'boolean') state.devSettings.overlapSubtags = false;
  if(typeof state.devSettings.overlapHoverMode !== 'string') state.devSettings.overlapHoverMode = 'default';
  if(typeof state.devSettings.overlapRankStagger !== 'boolean') state.devSettings.overlapRankStagger = false;
  if(typeof state.devSettings.settingsRowMobileStyle !== 'string') state.devSettings.settingsRowMobileStyle = 'default';
  if(typeof state.devSettings.fieldPickerStyle !== 'string') state.devSettings.fieldPickerStyle = 'default';
  if(typeof state.devSettings.taskLongPressMode !== 'string') state.devSettings.taskLongPressMode = 'default';
  if(typeof state.devSettings.customContextMenu !== 'boolean') state.devSettings.customContextMenu = false;
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

