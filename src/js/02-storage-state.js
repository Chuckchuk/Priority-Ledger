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
  return { tagSeam:false, tagOutline:false, pendingTagStyle:'default', pendingTagColor:'theme', showListDates:false, dayTreeCatBubble:false, sidePanelEnabled:false, calendarTabTypeEnabled:false, calendarCellStyle:'ratio', calendarTodayOrnate:false };
}

function defaultState(){
  return {
    location: 'home',
    days: [],
    tasks: [],
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

