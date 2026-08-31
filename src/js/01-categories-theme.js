// Categories are per-user data (state.categories), not a fixed config, so
// people can add/rename/remove their own tabs. CATEGORIES is a lookup index
// rebuilt from state.categories on every load and mutation — kept as a
// plain id-keyed object (via rebuildCategoriesIndex) so the many existing
// `CATEGORIES[key]` / `Object.entries(CATEGORIES)` call sites didn't need
// to change when categories became dynamic.
const CATEGORY_PALETTE = ['#3C5A45','#3E4A6B','#9C4530','#A9782F','#5B6560','#6B4226','#2F6B5E','#7A4B6B'];
// Used only when a task's category tab has been deleted — the task itself
// is never touched, it just has nothing to look itself up as, and this
// keeps that rendering path from breaking.
const FALLBACK_CATEGORY = { id:'_orphan', label:'Uncategorized', hex:'#5B6560', locations:['home','away'], type:'standard' };
// Generic on purpose — this seeds any brand-new account (see normalizeState()
// below), not just the project owner's, so it stays a broadly relatable
// three-way split (work life / home life / everything else personal)
// rather than the owner's own specific tabs. Household is Home-only (the
// one deliberate exception) so the location feature actually does
// something visible out of the box, the same way "Estate Upkeep only
// applies at MA" did for the owner's own accounts — Work and Personal
// stay at both locations since neither maps to a single place. Hexes are
// CATEGORY_PALETTE[0..2] in order — addCategory() colors a new tab from
// CATEGORY_PALETTE[state.categories.length % length], so leaving these
// three at indices 0-2 keeps a user's first added tab (index 3) from
// landing on a color one of these already uses.
function defaultCategories(){
  return [
    { id:'work',      label:'Work',      hex: CATEGORY_PALETTE[0], locations:['home','away'], type:'standard' },
    { id:'household', label:'Household', hex: CATEGORY_PALETTE[1], locations:['home'],         type:'standard' },
    { id:'personal',  label:'Personal',  hex: CATEGORY_PALETTE[2], locations:['home','away'],  type:'standard' },
    // A checklist-type tab in the defaults, so a new account sees one
    // without having to discover "Settings → add a tab → Checklist"
    // first — "Lists" rather than "Purchase Lists" so it doesn't read as
    // scoped to shopping specifically (packing, chores, anything).
    { id:'lists',     label:'Lists',     hex: CATEGORY_PALETTE[3], locations:['home','away'],  type:'checklist' }
  ];
}
// A category's marker is a single glyph colored via its own hex — 'dot'
// (a plain bullet) is the default and the only option before this feature
// existed, so every pre-existing category (no `.icon` field saved yet)
// renders exactly as it always did. Deliberately plain text-presentation
// symbols, not color emoji: an emoji glyph ignores `color:` in most
// fonts/browsers, which would break "shows in the category's own color"
// for every choice but the default. Order here is the order offered in
// categoryPickerHtml()'s icon row.
const CATEGORY_ICON_ORDER = ['dot','star','flag','house','diamond','square','ring','check'];
const CATEGORY_ICON_GLYPHS = { dot:'●', star:'★', flag:'⚑', house:'⌂', diamond:'◆', square:'■', ring:'○', check:'✓' };
// Single shared renderer for every place a category's marker shows up
// (task rows, the task detail page, the tab bar, the day-tree picker, the
// Settings row) — same reasoning as taskRowHtml being the one place a
// task row renders: edit the glyph logic once, everywhere picks it up.
// `cls` is the site's existing dot class (`cdot` or `dot`) so each call
// site keeps its own layout/spacing rules; only the glyph-vs-background
// rendering is unified here.
function categoryDotHtml(c, cls){
  const glyph = CATEGORY_ICON_GLYPHS[c.icon] || CATEGORY_ICON_GLYPHS.dot;
  return `<span class="${cls}" style="color:${c.hex}">${glyph}</span>`;
}

let CATEGORIES = {};
function rebuildCategoriesIndex(){
  CATEGORIES = {};
  state.categories.forEach(c => { CATEGORIES[c.id] = c; });
}
function tabOrder(){ return ['all', ...state.categories.map(c=>c.id), 'daily']; }

// Category "type" is fixed at creation (see addCategory()) — there's no
// UI to convert one after the fact, since a standard category's tasks
// (due dates, priority) and a checklist's lists (name + items only) don't
// map onto each other. 'standard' is the default/original behavior;
// 'checklist' is the parallel, much simpler view (see the Checklist
// section below) modeled on how the Daily tab is already a parallel view
// rather than a real category.
function isChecklistCategory(id){
  const c = CATEGORIES[id];
  return !!c && c.type === 'checklist';
}
// Category selects used for *standard* tasks (quick-add, "move to
// category", the Daily quick-add) only ever offer standard categories —
// a checklist category's "tasks" are really named lists with no due
// date/priority fields, so dropping a standard task into one would
// produce a hybrid neither view knows how to render.
function standardCategoryEntries(){
  return Object.entries(CATEGORIES).filter(([,v]) => v.type !== 'checklist');
}

// Locations are also per-user: two editable-label entries plus a switch to
// turn the whole feature off. Ids stay fixed ('home'/'away') so category
// .locations arrays never need migrating when someone just renames a
// label — "Home"/"Away" is a generic default that still demonstrates the
// feature immediately (a primary place vs. everywhere else) without
// assuming any particular real-world setup the way "MA"/"B.A." did.
function defaultLocations(){
  return [
    { id:'home', label:'Home' },
    { id:'away', label:'Away' }
  ];
}

// Appearance is per-user data too. Two colors is deliberately the whole
// surface: "bg" (the desk behind everything) and "paper" (the ledger card
// itself, incl. buttons/badges/inputs inside it via the derived -dim
// tone) — not a full palette editor. --ink/--ink-soft/--line are derived
// from "paper"'s lightness rather than user-set, so text stays legible
// against a card color, not just the classic cream default. "gradient"
// and the three textures ("grain"/"pages"/"leather") are independent
// booleans, not a single exclusive choice — they're meant to layer (e.g.
// textured AND pages together).
function defaultTheme(){
  // uiPreset:'rust' (Brass & Rust) is the shipped default — the plain
  // 'classic' brass/brass pairing is still available as its own preset,
  // just no longer what a new account or "Reset to classic colors" lands
  // on. customUi holds a user's own picked Primary/Secondary pair when
  // uiPreset is 'custom' (see uiColorPreset() below) — null until then.
  return { bg:'#28362E', paper:'#F1EAD9', gradient:false, grain:false, pages:false, leather:false, uiPreset:'rust', customUi:null };
}

// "Primary" and "Secondary" (Settings → Appearance → UI Colors) are a
// matched PAIR chosen from a fixed set of presets, not two independent
// custom colors — see uiColorPickerHtml() in 09-settings.js for the
// picker UI, styled like categoryPickerHtml()'s icon grid above.
//   Primary covers everywhere the app used to hardcode "brass": page tags
//   (the .pagetag "back" tag), the workspace/location button, the round
//   quick-add "+" button, drag/selection feedback (including the
//   .flashtoggle "added to today" flash), today's date highlight, and
//   every other plain active/accent state.
//   Secondary is for "something's outstanding, tap to see it" indicators
//   — today that's only the checklist pending-items tag (.pagetag.compact),
//   since it's the only element of that kind in the app right now. Any
//   future indicator in the same spirit (a badge you tap to reveal a
//   backlog, not a status label) should reach for --secondary too.
//   Deliberately NOT extended to .badge.overdue / .badge.priority-high
//   (fixed --estate red) — those are a hardcoded "danger" signal, not a
//   themeable accent, and recoloring them to whatever someone picks as
//   Secondary could stop reading as urgent at all.
// 'rust' (Brass & Rust) is the default (see defaultTheme() above) and
// leads the array for that reason — the grid renders presets in this
// order, so the default reads as the obvious first choice rather than
// something you'd have to notice is pre-selected further down the list.
// 'classic' (id kept as-is; only its label changed) reproduces the app's
// original literal brass/brass for both colors (byte-for-byte the old
// --brass/--brass-light hexes) — labeled "Full Brass" now (a single solid
// warm tone throughout, vs. "Brass & Rust"'s two-tone split) rather than
// "Classic", since it stopped being the actual default and that label
// was reading as a claim it no longer made. Every other preset is built
// from colors already used elsewhere in the app (the pre-dynamic
// category accents / the old pendingTagColor dev experiment's own
// choices, since removed) rather than introducing new one-off hues.
const UI_COLOR_PRESETS = [
  { id:'rust',     label:'Brass & Rust',     primary:'#A9782F', primaryLight:'#C99A4E', secondary:'#9C4530', secondaryLight:'#C3563C' },
  { id:'classic',  label:'Full Brass',       primary:'#A9782F', primaryLight:'#C99A4E', secondary:'#A9782F', secondaryLight:'#C99A4E' },
  { id:'forest',   label:'Forest & Brass',   primary:'#3C5A45', primaryLight:'#4B7056', secondary:'#A9782F', secondaryLight:'#C99A4E' },
  { id:'slate',    label:'Slate & Rust',     primary:'#3E4A6B', primaryLight:'#4E5C86', secondary:'#9C4530', secondaryLight:'#C3563C' },
  { id:'charcoal', label:'Charcoal & Brass', primary:'#3A322A', primaryLight:'#483E34', secondary:'#A9782F', secondaryLight:'#C99A4E' }
];
// 'custom' isn't in UI_COLOR_PRESETS (it's user data, not a fixed
// preset) — state.theme.customUi carries its own label/primary/
// primaryLight/secondary/secondaryLight the same shape as a real preset
// entry, written by confirmDualColorCustom() in 09-settings.js.
function uiColorPreset(id){
  if(id==='custom' && state.theme.customUi) return state.theme.customUi;
  return UI_COLOR_PRESETS.find(p=>p.id===id) || UI_COLOR_PRESETS[0];
}

// Desk & Ledger presets (Settings → Appearance) — a quick-start pair for
// state.theme.bg/paper, the same two fields the picker's own "Custom"
// tile edits directly (see dualColorCustomHtml() in 09-settings.js).
// Picking one is just "set both fields to these two values" — there's no
// separate "which preset is active" field to store or migrate, and no
// reason there should be: once picked, bg/paper are exactly as free to
// keep customizing as if they'd been dragged to by hand.
// 'classic' reproduces the app's original literal bg/paper hexes.
const DESK_PAPER_PRESETS = [
  { id:'classic',  label:'Classic',          bg:'#28362E', paper:'#F1EAD9' },
  { id:'oak',      label:'Oak & Ivory',      bg:'#3D2B1F', paper:'#F5EFE0' },
  { id:'navy',     label:'Navy & Parchment', bg:'#1F2937', paper:'#EFDDB0' },
  { id:'plum',     label:'Plum & Linen',     bg:'#3B2A44', paper:'#EDE6DC' },
  { id:'charcoal', label:'Charcoal & Birch', bg:'#26241F', paper:'#F2ECE0' }
];

function clamp255(n){ return Math.max(0, Math.min(255, n)); }

// Darkens (negative percent) or lightens (positive) a hex color by
// scaling each channel multiplicatively rather than adding a flat offset.
// Additive offsets clip dark colors to black almost immediately (e.g. the
// classic desk green's channels are only ~40-54 to start with, so a flat
// -70 offset floors everything to 0) — multiplicative scaling keeps the
// color's own character at any base lightness, which is what makes the
// derived "-dark"/"-dim" shade read as a gentle shade rather than a harsh
// clip to near-black.
function shadeHex(hex, percent){
  const num = parseInt(hex.replace('#',''), 16);
  const factor = 1 + percent;
  const r = clamp255(Math.round(((num >> 16) & 0xFF) * factor));
  const g = clamp255(Math.round(((num >> 8) & 0xFF) * factor));
  const b = clamp255(Math.round((num & 0xFF) * factor));
  return '#' + (0x1000000 + r*0x10000 + g*0x100 + b).toString(16).slice(1);
}

// HSV, not HSL, since that's the natural fit for a "ring picks hue,
// square picks the rest" color wheel (see catWheelPointerDown() in
// 09-settings.js) — value is what a top-to-bottom square axis naturally
// means, and saturation a left-to-right one, matching how that control
// actually works elsewhere (this app's shadeHex()/theme colors stay
// plain hex, no HSV involved outside this one picker).
function hsvToHex(h, s, v){
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); v = Math.max(0, Math.min(1, v));
  const c = v*s, x = c*(1 - Math.abs((h/60) % 2 - 1)), m = v - c;
  let r,g,b;
  if(h < 60){ r=c; g=x; b=0; }
  else if(h < 120){ r=x; g=c; b=0; }
  else if(h < 180){ r=0; g=c; b=x; }
  else if(h < 240){ r=0; g=x; b=c; }
  else if(h < 300){ r=x; g=0; b=c; }
  else { r=c; g=0; b=x; }
  const R = Math.round((r+m)*255), G = Math.round((g+m)*255), B = Math.round((b+m)*255);
  return '#' + [R,G,B].map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
}

function hexToHsv(hex){
  const num = parseInt(hex.replace('#',''), 16);
  const r = ((num>>16)&0xFF)/255, g = ((num>>8)&0xFF)/255, b = (num&0xFF)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max-min;
  let h = 0;
  if(d !== 0){
    if(max === r) h = 60 * (((g-b)/d) % 6);
    else if(max === g) h = 60 * ((b-r)/d + 2);
    else h = 60 * ((r-g)/d + 4);
  }
  if(h < 0) h += 360;
  return { h, s: max===0 ? 0 : d/max, v: max };
}

// The text-input accent (--input-accent, read by .expand textarea/
// .subdateedit/.taskdate & co. in <style>) — computed off the Ledger
// color (state.theme.paper, i.e. --card-bg) so it never needs its own
// setting: whatever "ledger surface" color someone picks, this
// automatically picks a complementary one for the fields that sit inside
// it, rather than the flat --card-bg-dim tint (barely distinguishable
// from the surface itself — see the "very white/square" ask this was
// built for) or a hardcoded accent that could clash with a custom paper
// color. Reuses hexToHsv()/hsvToHex() (the color-wheel picker's own
// conversions, see catWheelPointerDown() in 09-settings.js) rather than
// adding a second HSL-based color space just for this. A straight 180°
// hue rotation of the *paper* color's own saturation/value would barely
// register as different from --card-bg-dim in most cases — paper colors
// are typically light and low-saturation, and rotating the hue of an
// already-desaturated color doesn't move it far in RGB terms. Instead
// only the hue carries over; saturation/value are fixed at levels chosen
// to read clearly as an accent (a border, a placeholder-ish label)
// against any paper lightness, light or dark.
function complementaryAccent(hex){
  const hsv = hexToHsv(hex);
  const hue = (hsv.h + 180) % 360;
  return hsvToHex(hue, 0.48, 0.6);
}

function relLuminance(hex){
  const num = parseInt(hex.replace('#',''), 16);
  const r = (num >> 16) / 255, g = ((num >> 8) & 0xFF) / 255, b = (num & 0xFF) / 255;
  return 0.2126*r + 0.7152*g + 0.0722*b;
}

// Applies a theme object to the live page via CSS custom properties, plus
// the texture classes on #appCard. Takes a plain object (not necessarily
// state.theme) so signOut() can restore the classic look without needing
// a logged-in state to read it from.
function applyThemeObject(t){
  const root = document.documentElement.style;
  root.setProperty('--desk', t.bg);
  // -0.30 multiplicatively on the classic desk green reproduces the
  // original hand-picked --desk-dark almost exactly — this is "the same
  // gradient it always had," not a new, more intense one.
  const deskDark = t.gradient ? shadeHex(t.bg, -0.30) : t.bg;
  root.setProperty('--desk-dark', deskDark);
  // Keeps the <meta name="theme-color"> tag (shell-head.html) — and, via
  // html's own `background: var(--desk-dark)` rule in <style>, the strip
  // behind a phone's notch/status bar and home-indicator in standalone
  // "Add to Home Screen" mode — tracking whatever background color the
  // user has actually chosen, instead of the hardcoded default it ships
  // with. Only the CSS var actually needs updating for that html rule to
  // pick it up; this direct DOM write is purely for theme-color, which
  // browsers read once from the live meta tag rather than a CSS custom
  // property. manifest.json's own theme_color/background_color can't be
  // updated this way (a linked file, fixed at "Add to Home Screen" time,
  // not re-read from live DOM state) — it stays the app's default green,
  // which only shows for the brief pre-JS splash before this ever runs.
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if(themeColorMeta) themeColorMeta.setAttribute('content', deskDark);
  root.setProperty('--card-bg', t.paper);
  root.setProperty('--card-bg-dim', shadeHex(t.paper, -0.06));
  root.setProperty('--input-accent', complementaryAccent(t.paper));
  const ui = uiColorPreset(t.uiPreset);
  root.setProperty('--primary', ui.primary);
  root.setProperty('--primary-light', ui.primaryLight);
  root.setProperty('--secondary', ui.secondary);
  root.setProperty('--secondary-light', ui.secondaryLight);
  const dark = relLuminance(t.paper) < 0.5;
  root.setProperty('--ink', dark ? '#F1EAD9' : '#2A2318');
  root.setProperty('--ink-soft', dark ? 'rgba(241,234,217,0.65)' : '#7A6E58');
  root.setProperty('--line', dark ? 'rgba(241,234,217,0.18)' : 'rgba(42,35,24,0.16)');

  const appCard = document.getElementById('appCard');
  if(appCard){
    appCard.classList.toggle('texture-grain', !!t.grain);
    appCard.classList.toggle('texture-pages', !!t.pages);
  }
  const leatherCover = document.getElementById('leatherCover');
  if(leatherCover) leatherCover.classList.toggle('leather-on', !!t.leather);
}

function applyTheme(){ applyThemeObject(state.theme); }

// EXPERIMENTAL, see defaultDevSettings() above — toggles a body class the
// body.devtag-seam CSS reads, rather than a per-element inline style,
// since .pagetag is used from several different render functions and a
// body-level class lets all of them pick it up without each one having
// to know this setting exists.
function applyDevSettings(){
  const d = state.devSettings || defaultDevSettings();
  document.body.classList.toggle('devtag-seam', !!d.tagSeam);
  document.body.dataset.pendingTagStyle = d.pendingTagStyle || 'default';
  document.body.classList.toggle('devlist-dates', !!d.showListDates);
  // Read by the --leather-* custom property overrides in <style> (see
  // :root and the body[data-leather-inset="…"] blocks) — 'classic' needs
  // no matching selector since its values are the plain :root defaults.
  document.body.dataset.leatherInset = d.leatherInsetPreset || 'classic';
  // Same idea for .stackedpage's own --stackpage-* vars — see the
  // body[data-stackedpage-inset="…"] blocks in <style>.
  document.body.dataset.stackedpageInset = d.stackedPageInsetPreset || 'classic';
  // The floating side panel (see renderDevPanel()/toggleDevPanel() below)
  // is itself gated behind a dev setting now, rather than always available
  // whenever the viewport is wide enough — sidePanelEnabled defaults to
  // false, so it stays fully out of the way until someone opts in from
  // the normal Settings panel's Dev Settings section (the only place this
  // checkbox lives; there'd be no way to turn the panel back on from
  // inside itself once hidden). This runs on every enterApp()/undo/redo/
  // dev-setting-change, so the panel's visibility can never go stale.
  const panel = document.getElementById('devPanel');
  if(panel) panel.style.display = d.sidePanelEnabled ? '' : 'none';
  // Mobile UI Lab — see defaultDevSettings() for what each field means.
  // The style choices are plain data attributes (not classes) since CSS
  // needs to key off the specific variant, not just "some variant is on";
  // floatingAddButton is a class since it's a true on/off. All of them are
  // additionally gated behind body.mobileui-active (refreshed below and on
  // resize, see 19-bootstrap.js) so none has any effect until an actual
  // phone-ish viewport — or mobileUiPreviewOnDesktop — makes it relevant.
  document.body.dataset.quickaddMode = d.quickAddMobileStyle || 'bottomsheet';
  // quickAddTriggerPosition: 'bottom' (default) is the fixed, always-
  // reachable bar built for the "sticky" ask; 'top' instead restores the
  // trigger to its original spot in the normal flow, right under the tab
  // bar, but held there via position:sticky (see the [data-quickadd-
  // trigger-pos] rules in <style>) rather than the plain static
  // positioning it had before any of this — so it's still "sticky" in
  // the sense asked for, just anchored at the top of the screen instead
  // of the bottom, for whichever placement reads better in daily use.
  document.body.dataset.quickaddTriggerPos = d.quickAddTriggerPosition || 'bottom';
  document.body.dataset.taskrowMobile = d.taskRowMobileStyle || 'default';
  document.body.dataset.taskdetailMobile = d.taskDetailMobileStyle || 'default';
  document.body.classList.toggle('fab-on', !!d.floatingAddButton);
  document.body.dataset.tabbarMobile = d.tabBarMobileStyle || 'default';
  document.body.dataset.tabbarDesktop = d.tabBarDesktopStyle || 'default';
  // stickyTabBar (EXPERIMENTAL) — see the body.dev-stickytabs rule in
  // <style>. Not gated by mobileUiActive(): "Daily scrolled out of reach"
  // is just as real a complaint on a tall desktop window with many tasks
  // on screen, so this applies everywhere once turned on, same reasoning
  // as fieldPickerStyle above.
  document.body.classList.toggle('dev-stickytabs', !!d.stickyTabBar);
  // Read by the .tab:hover rules in <style> — push mode's hovered tab must
  // NOT jump to a blanket top z-index the way the default look's does: a
  // fixed order is the whole point of "push" (see tabImportanceRank()),
  // and blanket-topping a hovered tab let it leap above tabs it doesn't
  // normally beat, hiding a *third*, unrelated tab sandwiched behind it
  // that was visible a moment before — exactly the "small tag gets lost"
  // bug the project owner hit. Push mode reveals a hovered tab by moving
  // its covering neighbor away (computeOverlapPush() in 06-tabs-render.js)
  // instead, so it never needs to reorder at all.
  document.body.dataset.overlapHoverMode = d.overlapHoverMode || 'default';
  // Read by the .sidetabspeek/[data-tabbar-desktop="sidetabs"] rules in
  // <style>, and by resolveSidetabShape() in 06-tabs-render.js for the
  // 'random'/'iconstyle' cases.
  document.body.dataset.sidetabsAppearance = d.sidetabsAppearance || 'color';
  document.body.dataset.sidetabsShape = d.sidetabsShape || 'pagetab';
  document.body.dataset.settingsrowMobile = d.settingsRowMobileStyle || 'default';
  // Not gated by mobileui-active (see the comment on fieldPickerStyle in
  // defaultDevSettings()) — read directly by fieldPickerHtml() in
  // 08-render-core.js as plain state, and by <style> for the atmax pulse.
  document.body.dataset.fieldpickerStyle = d.fieldPickerStyle || 'default';
  refreshMobileUiActive();
}

// True on an actual phone-ish viewport/pointer, or whenever
// mobileUiPreviewOnDesktop forces it — the single shared gate every
// Mobile UI Lab feature checks (see defaultDevSettings() in
// 02-storage-state.js) before doing anything. Kept as a real function
// rather than only a body class so JS that has to branch on markup
// (openFabAdd(), for instance) can ask the same question CSS is asking
// via body.mobileui-active.
function mobileUiActive(){
  const d = state.devSettings || {};
  return !!d.mobileUiPreviewOnDesktop || window.matchMedia('(max-width:680px), (pointer:coarse)').matches;
}
function refreshMobileUiActive(){
  document.body.classList.toggle('mobileui-active', mobileUiActive());
}

async function toggleDevSetting(key, checked){
  pushUndo(`${checked ? 'Enabled' : 'Disabled'} dev setting: ${key}`);
  state.devSettings[key] = checked;
  applyDevSettings();
  render();
  queueSave();
}

async function setDevPendingTagStyle(val){
  pushUndo(`Changed dev pending-tag style to "${val}"`);
  state.devSettings.pendingTagStyle = val;
  applyDevSettings();
  render();
  queueSave();
}

async function setDevLeatherInset(val){
  pushUndo(`Changed dev leather cover size to "${val}"`);
  state.devSettings.leatherInsetPreset = val;
  applyDevSettings();
  render();
  queueSave();
}

async function setDevStackedPageInset(val){
  pushUndo(`Changed dev stacked-page size to "${val}"`);
  state.devSettings.stackedPageInsetPreset = val;
  applyDevSettings();
  render();
  queueSave();
}

async function setDevQuickAddMobileStyle(val){
  pushUndo(`Changed dev quick-add mobile style to "${val}"`);
  state.devSettings.quickAddMobileStyle = val;
  applyDevSettings();
  render();
  queueSave();
}

async function setDevQuickAddTriggerPosition(val){
  pushUndo(`Changed dev quick-add trigger position to "${val}"`);
  state.devSettings.quickAddTriggerPosition = val;
  applyDevSettings();
  render();
  queueSave();
}

async function setDevTaskRowMobileStyle(val){
  pushUndo(`Changed dev task row mobile style to "${val}"`);
  state.devSettings.taskRowMobileStyle = val;
  applyDevSettings();
  render();
  queueSave();
}

async function setDevTaskDetailMobileStyle(val){
  pushUndo(`Changed dev task detail mobile style to "${val}"`);
  state.devSettings.taskDetailMobileStyle = val;
  applyDevSettings();
  render();
  queueSave();
}

async function setDevTabBarMobileStyle(val){
  pushUndo(`Changed dev tab bar mobile style to "${val}"`);
  state.devSettings.tabBarMobileStyle = val;
  applyDevSettings();
  render();
  queueSave();
}

async function setDevTabBarDesktopStyle(val){
  pushUndo(`Changed dev tab bar desktop style to "${val}"`);
  state.devSettings.tabBarDesktopStyle = val;
  applyDevSettings();
  render();
  queueSave();
}

async function setDevOverlapHoverMode(val){
  pushUndo(`Changed dev overlap tab hover mode to "${val}"`);
  state.devSettings.overlapHoverMode = val;
  render();
  queueSave();
}

async function setDevSidetabsAppearance(val){
  pushUndo(`Changed dev side-tab appearance to "${val}"`);
  state.devSettings.sidetabsAppearance = val;
  applyDevSettings();
  render();
  queueSave();
}

async function setDevSidetabsShape(val){
  pushUndo(`Changed dev side-tab shape to "${val}"`);
  state.devSettings.sidetabsShape = val;
  applyDevSettings();
  render();
  queueSave();
}

async function setDevSettingsRowMobileStyle(val){
  pushUndo(`Changed dev settings row mobile style to "${val}"`);
  state.devSettings.settingsRowMobileStyle = val;
  applyDevSettings();
  render();
  queueSave();
}

async function setDevFieldPickerStyle(val){
  pushUndo(`Changed dev field picker style to "${val}"`);
  state.devSettings.fieldPickerStyle = val;
  applyDevSettings();
  render();
  queueSave();
}

async function setDevCheckGuideAnimationStyle(val){
  pushUndo(`Changed dev checkbox nudge style to "${val}"`);
  state.devSettings.checkGuideAnimationStyle = val;
  applyDevSettings();
  render();
  queueSave();
}

async function setDevTaskLongPressMode(val){
  pushUndo(`Changed dev task long-press mode to "${val}"`);
  state.devSettings.taskLongPressMode = val;
  render();
  queueSave();
}

// Pure UI chrome, not a content mutation — no pushUndo, and deliberately
// doesn't call render(). See devPanelOpen in 02-storage-state.js for why:
// this is the ONLY thing allowed to touch the .open class, so a dev
// setting toggling (which does call render() -> renderDevPanel()) can
// rebuild the panel's checkboxes without ever collapsing it.
function toggleDevPanel(){
  devPanelOpen = !devPanelOpen;
  const panel = document.getElementById('devPanel');
  if(panel) panel.classList.toggle('open', devPanelOpen);
}

// Shared between the floating side panel (renderDevPanel(), below) and
// the normal Settings panel's own Dev Settings section (renderSettings()
// in 09-settings.js) — the two are just different chrome around the same
// underlying state.devSettings fields, so the fields themselves (and the
// row/select classes they use) live in exactly one place. `rowClass`/
// `fieldClass`/`captionClass`/`selectClass` let each host supply its own
// styling (the side panel's narrow `.devpanel*` classes vs. Settings'
// existing `.catlocchk`) without duplicating the markup or the values.
// `includeSidePanelToggle` (default true) leaves out the "Show the
// floating dev panel" checkbox for the panel itself — Settings is the
// only place that field belongs, since unchecking it from inside the
// panel it controls immediately hides the very checkbox you'd need to
// turn it back on again, and was a real recurring mis-click.
// A visibly stronger divider than a plain field ${captionClass} (which
// also labels individual dropdowns like "Compact tag style" below it —
// using the same look for both a section break and a single field's
// label was a big part of why this whole list used to read as one
// undifferentiated wall of settings, per the project owner's own
// "clean it up" callout). One shared class regardless of host (side
// panel vs Settings' own section) since a header's look doesn't need to
// vary the way a row/select's does — see .devsectionhead in <style>.
function devSectionHeadHtml(label){
  return `<div class="devsectionhead">${escapeHtml(label)}</div>`;
}

// The outer General/Desktop/Mobile grouping (see devSettingsFieldsHtml()
// below) — collapsible via the same settingsCollapsedSections Set every
// other Settings section already uses (toggleSettingsSection() doesn't
// care whether a key belongs to a top-level section or one of these
// nested groups, it's just a string key either way).
function devGroupHtml(key, title, bodyHtml){
  const collapsed = settingsCollapsedSections.has(key);
  return `
    <div class="devgroup">
      <button class="devgrouphead" onclick="toggleSettingsSection('${key}')">
        <span>${title}</span>
        <span class="devgroupchevron">${collapsed ? '▸' : '▾'}</span>
      </button>
      ${collapsed ? '' : `<div class="devgroupbody">${bodyHtml}</div>`}
    </div>`;
}

// Every dev setting sorted into exactly one of three groups (see
// devGroupHtml() above) by where it actually takes effect, since before
// this they were grouped purely by FEATURE AREA (Page Tags, Daily &
// Calendar, ...) — which said nothing about whether a given field was a
// universal choice, a phone/touch-only variant gated behind
// mobileUiActive(), or a desktop-only one, and those were interleaved
// within the same feature-area subsections. The feature-area subsections
// (devSectionHeadHtml()) still exist *within* each group; only the outer
// sort is new.
//   GENERAL — takes effect regardless of device/viewport.
//   DESKTOP — only visible/active when mobileUiActive() is false.
//   MOBILE  — the "Mobile UI Lab": only visible/active when
//     mobileUiActive() is true (phone-width or coarse-pointer, or
//     mobileUiPreviewOnDesktop forcing it) — see mobileUiActive() above.
// One field moved groups in the process, worth calling out:
// stickyTabBar lived under "Mobile UI Lab" before, but its own CSS
// (body.dev-stickytabs, not scoped inside .mobileui-active) was never
// actually gated to mobile — it works, and reads just as useful, at any
// width. It's in General now, not because it was moved for this pass,
// but because that's where its real behavior always put it; the old
// grouping had just been wrong about it.
// tabBarMobileStyle (Mobile) and tabBarDesktopStyle (Desktop) are the
// one pair genuinely worth keeping mentally linked despite being split
// across groups — they're two independent, per-viewport answers to the
// *same* underlying question ("what should the tab bar look like"), and
// each links to the other via a small .devgroupnote below its own select
// so that's discoverable without having to remember it.
// developmentMode's own toggle always renders, regardless of its own
// value — every other field in here (and the floating side panel's
// "Show the floating dev panel" checkbox, includeSidePanelToggle's own
// row) is gated behind it, so this has to sit outside that gate or
// turning the mode off would mean no way back on from the UI. Off by
// default: this Settings section used to just be permanently visible
// (collapsed, but always there — see the 'dev' key in
// settingsCollapsedSections), which was fine while this app only ever
// had one user who was also its developer, but "allow for the dev
// settings" behind an explicit mode is what the project owner actually
// asked for once that stopped being assumed. Turning it on also enables
// applyDevElementNames() (below) — the two share one flag on purpose,
// since both are squarely "I'm poking at this app's own internals" mode,
// not two things someone would want independently.
function devSettingsFieldsHtml(rowClass, fieldClass, captionClass, selectClass, includeSidePanelToggle){
  const dev = state.devSettings || defaultDevSettings();
  const devModeToggleHtml = `
    <label class="${rowClass}">
      <input type="checkbox" ${dev.developmentMode?'checked':''} onchange="toggleDevSetting('developmentMode', this.checked)">
      Development mode — unlocks every dev setting below, plus an element-name tooltip on hover throughout the app
    </label>`;
  if(!dev.developmentMode) return devModeToggleHtml;
  const sidePanelToggleHtml = includeSidePanelToggle === false ? '' : `
    <label class="${rowClass}">
      <input type="checkbox" ${dev.sidePanelEnabled?'checked':''} onchange="toggleDevSetting('sidePanelEnabled', this.checked)">
      Show the floating dev panel (left edge, desktop only)
    </label>`;

  const generalBody = `
    ${devSectionHeadHtml('Page Tags')}
    <label class="${rowClass}">
      <input type="checkbox" ${dev.tagSeam?'checked':''} onchange="toggleDevSetting('tagSeam', this.checked)">
      Page tag: seam shadow (tip reads as receding behind the label)
    </label>
    <!-- "Compact tag" is the general name for .pagetag.compact — the
         small variant used for Checklist's "Pending", Daily's "Calendar",
         and Calendar's "Daily"/"Today" tags, as opposed to a full-size
         "Page Tag" (.pagetag without .compact), which is always a "back"
         out of an actual drilldown (Settings' "Done", a task detail's
         "Daily", etc.). Internal field name (pendingTagStyle,
         setDevPendingTagStyle()) still says "pending" since that was the
         original, single use case this setting was built for — left
         as-is rather than renamed throughout, since only the user-facing
         label needed to stop implying "just for Checklist's Pending
         tag." The old per-style color override (pendingTagColor) is gone
         — a compact tag just always follows the real Secondary color now;
         custom UI colors live in the UI Colors picker below instead (see
         its own "Custom" tile). -->
    <div class="${fieldClass}">
      <span class="${captionClass}">Compact tag style</span>
      <select class="${selectClass}" onchange="setDevPendingTagStyle(this.value)">
        <option value="default" ${dev.pendingTagStyle==='default'?'selected':''}>Default (small page tag)</option>
        <option value="jetout" ${dev.pendingTagStyle==='jetout'?'selected':''}>Jets out further</option>
        <option value="sidebar" ${dev.pendingTagStyle==='sidebar'?'selected':''}>Vertical sidebar strip</option>
        <option value="booktab" ${dev.pendingTagStyle==='booktab'?'selected':''}>Left edge, overlapping up into the tab row</option>
      </select>
    </div>

    ${devSectionHeadHtml('Checklist')}
    <label class="${rowClass}">
      <input type="checkbox" ${dev.showListDates?'checked':''} onchange="toggleDevSetting('showListDates', this.checked)">
      Show a faded created-date next to each checklist's title
    </label>

    ${devSectionHeadHtml('Cover & Page Sizing')}
    <div class="${fieldClass}">
      <span class="${captionClass}">Leather cover size</span>
      <select class="${selectClass}" onchange="setDevLeatherInset(this.value)">
        <option value="classic" ${dev.leatherInsetPreset==='classic'?'selected':''}>Default</option>
        <option value="roomier" ${dev.leatherInsetPreset==='roomier'?'selected':''}>Roomier — thinner cover all around</option>
        <option value="leftheavy" ${dev.leatherInsetPreset==='leftheavy'?'selected':''}>Left-heavy — wide left margin, thin top</option>
        <option value="slim" ${dev.leatherInsetPreset==='slim'?'selected':''}>Slim — barely a lip of leather</option>
      </select>
    </div>
    <!-- The .stackedpage analog of the leather-cover setting above — how
         big a drilldown page (Settings, checklist detail, a day's own
         detail, etc.) reads relative to #appCard, independent of whether
         Leather itself is on. Same four preset names/meanings, same
         "left gets more room than right/bottom, top gets least" idea for
         leftheavy, deliberately keeping a left-side floor across every
         preset (see the --stackpage-* comment in <style>) so .pagetag —
         which juts left out of the page's own edge — always has room to
         do that no matter how far a preset reclaims elsewhere. Left-heavy
         is the default for now (see defaultDevSettings() in
         02-storage-state.js) — its own left margin was widened further
         since the default page tag was reading as too close to
         #appCard's outer edge to comfortably read. -->
    <div class="${fieldClass}">
      <span class="${captionClass}">Stacked-page size (Settings, day/task detail, etc.)</span>
      <select class="${selectClass}" onchange="setDevStackedPageInset(this.value)">
        <option value="leftheavy" ${dev.stackedPageInsetPreset==='leftheavy'?'selected':''}>Left-heavy — wide left margin, thin top (default)</option>
        <option value="classic" ${dev.stackedPageInsetPreset==='classic'?'selected':''}>Classic</option>
        <option value="roomier" ${dev.stackedPageInsetPreset==='roomier'?'selected':''}>Roomier — thinner frame all around</option>
        <option value="slim" ${dev.stackedPageInsetPreset==='slim'?'selected':''}>Slim — nearly flush with #appCard</option>
      </select>
    </div>

    ${devSectionHeadHtml('Task Fields')}
    <div class="${fieldClass}">
      <span class="${captionClass}" title="Still debating a progress-bar picker — the fun high-value animation is worth keeping around for, but the interaction itself needs real rework before it's usable. Starred as a reminder to come back to it, not to delete it.">★ Timeframe & Priority picker</span>
      <select class="${selectClass}" onchange="setDevFieldPickerStyle(this.value)">
        <option value="default" ${dev.fieldPickerStyle==='default'?'selected':''}>Default (dropdown)</option>
        <option value="buttons" ${dev.fieldPickerStyle==='buttons'?'selected':''}>Row of buttons</option>
        <option value="progress" ${dev.fieldPickerStyle==='progress'?'selected':''}>Stylized progress bar</option>
      </select>
    </div>
    <!-- checkGuideAnimationStyle — see the "check-guide" comment in
         08-render-core.js for the full mechanism: this only picks which
         visual language plays on the main checkbox (and a checklist
         list's own .checkcircle — see checklistCheckcircleHtml(),
         13-checklist.js) while every step is done but the task/list
         itself isn't checked off yet, guiding you to it. Lives in
         General (not the mobile-gated "Task Rows & Detail" group above)
         since the guide shows on whichever checkbox is on screen — list
         row or full detail page, desktop or mobile — not just under the
         Mobile UI Lab. Default is 'radialping' (per the project owner's
         own call) rather than the first option here; 'wiggle' replaced
         a former 'spin' style (a rotating gradient square) that didn't
         read as a nudge and, being hardcoded square, couldn't work for
         .checkcircle's own round shape either — see the migration note
         on checkGuideAnimationStyle in normalizeState(),
         02-storage-state.js. -->
    <div class="${fieldClass}">
      <span class="${captionClass}">"All steps done" checkbox nudge</span>
      <select class="${selectClass}" onchange="setDevCheckGuideAnimationStyle(this.value)">
        <option value="radialping" ${dev.checkGuideAnimationStyle==='radialping'?'selected':''}>Radial ping (default)</option>
        <option value="wiggle" ${dev.checkGuideAnimationStyle==='wiggle'?'selected':''}>Wiggle</option>
        <option value="sparkle" ${dev.checkGuideAnimationStyle==='sparkle'?'selected':''}>Sparkles</option>
        <option value="glow" ${dev.checkGuideAnimationStyle==='glow'?'selected':''}>Warm pulsing glow</option>
      </select>
    </div>

    ${devSectionHeadHtml('Tab Bar')}
    <label class="${rowClass}">
      <input type="checkbox" ${dev.stickyTabBar?'checked':''} onchange="toggleDevSetting('stickyTabBar', this.checked)">
      Sticky tab bar — pins the tabs (and the Daily tab within them) to the top of the screen while scrolling
    </label>
  `;

  const desktopBody = `
    ${devSectionHeadHtml('Tab Bar')}
    <div class="${fieldClass}">
      <span class="${captionClass}">Tab bar style</span>
      <select class="${selectClass}" onchange="setDevTabBarDesktopStyle(this.value)">
        <option value="overlap" ${dev.tabBarDesktopStyle==='overlap'?'selected':''}>Overlapping color tabs (default)</option>
        <option value="default" ${dev.tabBarDesktopStyle==='default'?'selected':''}>Classic (horizontal pill row)</option>
        <option value="sidetabs" ${dev.tabBarDesktopStyle==='sidetabs'?'selected':''}>Vertical tabs down the left side</option>
        <option value="indextabs" ${dev.tabBarDesktopStyle==='indextabs'?'selected':''}>Staggered, color-edged index tabs</option>
      </select>
    </div>
    <div class="devgroupnote">See also Tab Bar under Mobile — this is the same underlying choice, answered separately per viewport.</div>
    ${dev.tabBarDesktopStyle==='overlap' ? `
    <label class="${rowClass}">
      <input type="checkbox" ${dev.overlapSubtags?'checked':''} onchange="toggleDevSetting('overlapSubtags', this.checked)">
      Overlap tabs: floating count badge instead of inline icon/number (only shown when a category has open tasks; adds "!" for anything overdue or High priority)
    </label>
    <div class="${fieldClass}">
      <span class="${captionClass}">Overlap tabs: hover/select behavior</span>
      <select class="${selectClass}" onchange="setDevOverlapHoverMode(this.value)">
        <option value="default" ${dev.overlapHoverMode==='default'?'selected':''}>Default (hover reorders to the front)</option>
        <option value="push" ${dev.overlapHoverMode==='push'?'selected':''}>Fixed order — hovering/selecting pushes neighbors aside instead</option>
      </select>
    </div>
    <label class="${rowClass}">
      <input type="checkbox" ${dev.overlapRankStagger?'checked':''} onchange="toggleDevSetting('overlapRankStagger', this.checked)">
      Overlap tabs: stagger by stacking rank (a covered tab sits a little higher at rest so its own label still peeks over the one covering it)
    </label>
    ` : ''}
    ${dev.tabBarDesktopStyle==='sidetabs' ? `
    <div class="${fieldClass}">
      <span class="${captionClass}">Side tabs: appearance</span>
      <select class="${selectClass}" onchange="setDevSidetabsAppearance(this.value)">
        <option value="color" ${dev.sidetabsAppearance==='color'?'selected':''}>Colored label (default)</option>
        <option value="translucentpill" ${dev.sidetabsAppearance==='translucentpill'?'selected':''}>Translucent pill, with icon</option>
        <option value="edge" ${dev.sidetabsAppearance==='edge'?'selected':''}>Left edge color only, no icon</option>
        <option value="classic" ${dev.sidetabsAppearance==='classic'?'selected':''}>Classic (original full-width column)</option>
        <option value="classicband" ${dev.sidetabsAppearance==='classicband'?'selected':''}>Classic + color band (no icon)</option>
      </select>
    </div>
    <div class="${fieldClass}">
      <span class="${captionClass}">Side tabs: shape (Colored/Translucent Pill/Edge only)</span>
      <select class="${selectClass}" onchange="setDevSidetabsShape(this.value)">
        <option value="pagetab" ${dev.sidetabsShape==='pagetab'?'selected':''}>Page-tab point (default)</option>
        <option value="invertedv" ${dev.sidetabsShape==='invertedv'?'selected':''}>Inverted V</option>
        <option value="arrows" ${dev.sidetabsShape==='arrows'?'selected':''}>Arrows out</option>
        <option value="jagged" ${dev.sidetabsShape==='jagged'?'selected':''}>Jagged edge</option>
        <option value="sawtooth" ${dev.sidetabsShape==='sawtooth'?'selected':''}>Clean sawtooth</option>
        <option value="flat" ${dev.sidetabsShape==='flat'?'selected':''}>Flat (no point)</option>
        <option value="random" ${dev.sidetabsShape==='random'?'selected':''}>Random (stable per tab)</option>
        <option value="iconstyle" ${dev.sidetabsShape==='iconstyle'?'selected':''}>Depending on icon style</option>
      </select>
    </div>
    ` : ''}
  `;

  const mobileBody = `
    <label class="${rowClass}">
      <input type="checkbox" ${dev.mobileUiPreviewOnDesktop?'checked':''} onchange="toggleDevSetting('mobileUiPreviewOnDesktop', this.checked)">
      Preview everything below on desktop too (it's phone/touch-only by default)
    </label>

    ${devSectionHeadHtml('Quick-Add Bar')}
    <div class="${fieldClass}">
      <span class="${captionClass}">"+ Add Task" button position</span>
      <select class="${selectClass}" onchange="setDevQuickAddTriggerPosition(this.value)">
        <option value="bottom" ${(dev.quickAddTriggerPosition||'bottom')==='bottom'?'selected':''}>Bottom of the screen (sticky)</option>
        <option value="top" ${dev.quickAddTriggerPosition==='top'?'selected':''}>Top of the page, under the tabs (sticky)</option>
      </select>
    </div>
    <div class="${fieldClass}">
      <span class="${captionClass}">"+ Add Task" button opens…</span>
      <select class="${selectClass}" onchange="setDevQuickAddMobileStyle(this.value)">
        <option value="topsheet" ${dev.quickAddMobileStyle==='topsheet'?'selected':''}>"+ Add Task" button opens a top sheet</option>
        <option value="bottomsheet" ${dev.quickAddMobileStyle==='bottomsheet'?'selected':''}>"+ Add Task" button opens a bottom sheet</option>
        <option value="inline" ${dev.quickAddMobileStyle==='inline'?'selected':''}>"+ Add Task" button expands it in place</option>
      </select>
    </div>

    ${devSectionHeadHtml('Task Rows & Detail')}
    <div class="${fieldClass}">
      <span class="${captionClass}">Task row layout</span>
      <select class="${selectClass}" onchange="setDevTaskRowMobileStyle(this.value)">
        <option value="default" ${dev.taskRowMobileStyle==='default'?'selected':''}>Default (badges squeeze the title)</option>
        <option value="stacked" ${dev.taskRowMobileStyle==='stacked'?'selected':''}>Stacked — badges drop below the title</option>
        <option value="minimal" ${dev.taskRowMobileStyle==='minimal'?'selected':''}>Minimal — hide drag handle & category dot</option>
      </select>
    </div>
    <div class="${fieldClass}">
      <span class="${captionClass}">Task detail fields</span>
      <select class="${selectClass}" onchange="setDevTaskDetailMobileStyle(this.value)">
        <option value="default" ${dev.taskDetailMobileStyle==='default'?'selected':''}>Default (one cramped wrapping row)</option>
        <option value="stacked" ${dev.taskDetailMobileStyle==='stacked'?'selected':''}>Stacked — one full-width field per row</option>
        <option value="grouped" ${dev.taskDetailMobileStyle==='grouped'?'selected':''}>Grouped — 2-column fields + an even action row</option>
      </select>
    </div>
    <div class="${fieldClass}">
      <!-- Only affects mobile's long-press, and mobile's tap under
           'detail' — every other tap (desktop always, mobile under
           'default'/'split') opens the inline Steps-only quick view
           regardless of this setting; see taskRowTap()/taskRowHtml()'s
           own comments in 08-render-core.js. -->
      <span class="${captionClass}">Task tap/long-press (mobile)</span>
      <select class="${selectClass}" onchange="setDevTaskLongPressMode(this.value)">
        <option value="detail" ${dev.taskLongPressMode==='detail'?'selected':''}>Detail (default) — mobile tap opens the full task page; long-press shows a quick-actions menu</option>
        <option value="split" ${dev.taskLongPressMode==='split'?'selected':''}>Split — tap opens Steps; mobile long-press opens a full-fields bottom sheet</option>
        <option value="default" ${dev.taskLongPressMode==='default'?'selected':''}>Classic — tap opens Steps; no long-press action</option>
      </select>
    </div>

    ${devSectionHeadHtml('Quick Capture')}
    <label class="${rowClass}">
      <input type="checkbox" ${dev.floatingAddButton?'checked':''} onchange="toggleDevSetting('floatingAddButton', this.checked)">
      Floating (+) button to add a task from any tab
    </label>

    ${devSectionHeadHtml('Tab Bar')}
    <div class="${fieldClass}">
      <span class="${captionClass}">Tab bar style</span>
      <select class="${selectClass}" onchange="setDevTabBarMobileStyle(this.value)">
        <option value="default" ${dev.tabBarMobileStyle==='default'?'selected':''}>Default (wraps to a 2nd row)</option>
        <option value="scroll" ${dev.tabBarMobileStyle==='scroll'?'selected':''}>Scrolls sideways, one row</option>
      </select>
    </div>
    <div class="devgroupnote">See also Tab Bar under Desktop — this is the same underlying choice, answered separately per viewport.</div>

    ${devSectionHeadHtml('Settings Panel')}
    <div class="${fieldClass}">
      <span class="${captionClass}">Settings category rows</span>
      <select class="${selectClass}" onchange="setDevSettingsRowMobileStyle(this.value)">
        <option value="default" ${dev.settingsRowMobileStyle==='default'?'selected':''}>Default (everything one flat row)</option>
        <option value="grouped" ${dev.settingsRowMobileStyle==='grouped'?'selected':''}>Grouped — Delete moves to its own quiet row</option>
      </select>
    </div>
  `;

  return `
    ${devModeToggleHtml}
    ${sidePanelToggleHtml}
    ${devGroupHtml('dev-general', 'General', generalBody)}
    ${devGroupHtml('dev-desktop', 'Desktop', desktopBody)}
    ${devGroupHtml('dev-mobile', 'Mobile', mobileBody)}
  `;
}

// ---------- Development mode: element-name tooltips ----------
// The Name half of each tooltip is the selector itself — literally how
// it'd be typed in a grep or a CSS rule, i.e. "however you actually
// reference it in code," per the project owner's own ask (not prose like
// "Page Tag"). Checked in order via Element.matches(), first match wins,
// so a more specific selector (an element with an extra modifier class)
// has to sit above the more general one it would otherwise also match —
// e.g. '.pagetag.compact' before plain '.pagetag', since a compact tag's
// own element still carries the base .pagetag class too. Not exhaustive —
// covers the elements most likely to actually come up, not every single
// div in the DOM — but "most" the way the project owner asked for, and
// new entries are cheap to add as more come up in conversation.
//
// `dest`, where present, is what actually clicking the element navigates
// to — resolved from the SAME render functions/view names used
// throughout this codebase's own comments (renderDayList(),
// currentTabBodyHtml(), etc.), not a separate vocabulary. A plain string
// when an element's destination never varies; a function(el) when it
// does — most of these read live app state the same way the element's
// own onclick handler would decide it for real (e.g. a Page Tag's own
// onclick attribute, or dayReturnToCalendar/checklistReturnDay), so the
// tooltip always describes where THIS click, right now, actually goes.
// Only elements that are genuinely a "link" get one at all — a checkbox
// or a text field doesn't, since it doesn't take you anywhere.
function resolvePageTagDest(el){
  const oc = el.getAttribute('onclick') || '';
  if(oc.includes('closeDay(')) return dayReturnToCalendar ? 'renderDailyCalendar()' : 'renderDayList()';
  if(oc.includes('toggleSettings(')) return 'currentTabBodyHtml()';
  if(oc.includes('closeClaudeView(')) return 'renderSettings()';
  if(oc.includes('closeChecklistPending(')) return 'renderChecklistOverview()';
  if(oc.includes('closeChecklistList(')) return checklistReturnDay ? 'renderDayDetail()' : 'renderChecklistOverview()';
  if(oc.includes('closeTaskDetail(')) return 'renderDayDetail()';
  if(oc.includes('closeGenericTaskDetail(')) return 'currentTabBodyHtml()';
  return null;
}
function resolveCompactTagDest(el){
  const oc = el.getAttribute('onclick') || '';
  if(oc.includes('openDailyCalendar(')) return 'renderDailyCalendar()';
  if(oc.includes('openChecklistPending(')) return 'renderChecklistPending()';
  if(oc.includes('closeDailyCalendar(')) return 'renderDayList()';
  return null;
}
function resolveTabDest(el){
  const key = el.dataset.key;
  if(!key) return null;
  if(key === 'daily') return dailyLastView === 'calendar' ? 'renderDailyCalendar()' : 'renderDayList()';
  const cat = CATEGORIES[key];
  if(cat && cat.type === 'checklist') return 'renderChecklistOverview()';
  return 'categoryListHtml()';
}
function resolveTaskRowDest(el){
  const oc = el.getAttribute('onclick') || '';
  if(oc.includes('openChecklistList(')) return 'renderChecklistDetail()';
  if(oc.includes('openTaskDetailFromDay(')) return 'renderTaskDetailPage()';
  return null; // taskRowTap(): usually toggles the inline .expand in place, not a real navigation
}

const DEV_ELEMENT_NAME_RULES = [
  // Masthead
  { sel: '.settingsbtn', dest: () => settingsOpen ? 'currentTabBodyHtml()' : 'renderSettings()' },
  { sel: '.dailyshortcut', dest: 'renderDayDetail() [today]' },
  { sel: '.locbadge' },
  { sel: '.signoutbtn2', dest: '#authShell' },
  { sel: '#statusLine' },
  { sel: '.masthead h1' },
  // Tab bar
  { sel: '.tab', dest: resolveTabDest },
  { sel: '.tabs' },
  // Stacked-page pattern
  { sel: '.pagetag.compact', dest: resolveCompactTagDest },
  { sel: '.pagetag', dest: resolvePageTagDest },
  { sel: '.stackedpage' },
  { sel: '#appCard' },
  { sel: '.leathercover' },
  { sel: '.bookmark' },
  // Task rows (master view / quick view / detail page)
  { sel: 'li.task', dest: resolveTaskRowDest },
  { sel: '.rowexpand', dest: 'renderTaskDetailPage()' },
  { sel: '.expand' },
  { sel: '.taskdetailhead' },
  { sel: '.taskdetailhead .checkwrap' },
  { sel: '.check.celebrate-check' },
  { sel: '.check.guide-check' },
  { sel: '.check' },
  { sel: '.checkwrap' },
  { sel: '.substack' },
  { sel: '.subpip' },
  { sel: '.rowpin' },
  { sel: '.movetmrw' },
  { sel: '.dayremove' },
  { sel: '.draghandle' },
  { sel: '.title' },
  { sel: '.meta' },
  { sel: '.badge.overdue' },
  { sel: '.badge.due' },
  { sel: '.badge.timeframe' },
  { sel: '.badge' },
  { sel: '.daybtn' },
  { sel: '.flagbtn' },
  { sel: '.catselect' },
  { sel: '.expand-row .remove' },
  { sel: '.titleedit.bigtitle' },
  { sel: '.titleedit' },
  { sel: '.notesfield' },
  { sel: '.taskmeta.checklistmeta' },
  { sel: '.taskmeta' },
  { sel: '.subwrap' },
  { sel: '.sublabel' },
  { sel: '.subrow' },
  { sel: '.subcheck.circle' },
  { sel: '.subcheck' },
  { sel: '.subtext' },
  { sel: '.subdate' },
  { sel: '.subadd' },
  { sel: '.subdel' },
  { sel: '.quickadd' },
  { sel: '.addbtn' },
  { sel: '.sortrow select' },
  { sel: '.footer-row button' },
  { sel: '.empty' },
  // Checklist
  { sel: '.checklistheader' },
  { sel: '.checkcircle-wrap' },
  { sel: '.checkcircle' },
  { sel: '.pegpivot' },
  { sel: '.progressring' },
  { sel: '.listdate' },
  // Daily
  { sel: '.daynavrow' },
  { sel: '.navarrow' },
  { sel: '.dayhero' },
  { sel: '.todaytag' },
  { sel: '.daylistlabel' },
  { sel: '.dayitem', dest: 'renderDayDetail()' },
  { sel: '.dayaddtoggle' },
  { sel: '.dayaddpanel' },
  { sel: '.dayaddclose' },
  // Calendar
  { sel: '.calnav' },
  { sel: '.calmonthlabel' },
  { sel: '.calcell.today', dest: 'renderDayDetail()' },
  { sel: '.calcell', dest: 'renderDayDetail()' },
  { sel: '.calcatchip' },
  // Settings
  { sel: '.settingssectionhead' },
  { sel: '.catrow' },
  { sel: '.catedit' },
  { sel: '.cdot' },
  { sel: '.resetthemebtn' },
  { sel: '.texturebtn' },
  // Dev panel
  { sel: '.devpaneltab' },
  { sel: '.devgrouphead' },
  // Context menu
  { sel: '.ctxmenu-danger' },
  { sel: '.ctxmenu button' },
];

// Runs after every render() (see its call site in 08-render-core.js) and
// after the right-click/long-press quick-actions menu (renderTaskContextMenu(),
// same file) — the two most common ways this app's DOM actually changes.
// A few rarer standalone popovers (the color wheel, the category/icon
// picker) aren't covered; "most UI elements" per the ask, not literally
// every one. Cheap no-op when development mode is off (the overwhelming
// majority of the time).
//
// dataset.origTitle caches each element's own authored tooltip (or ''
// if it never had one) the first time this runs on it, rather than
// reading title itself fresh every pass — render() rebuilds most of the
// DOM from scratch each time (fresh elements, nothing to cache yet), but
// #ctxMenu is a standalone exception render() never touches (only
// renderTaskContextMenu() does), so its buttons can still be sitting in
// the DOM, already labeled from a previous pass, the next time an
// unrelated render() runs while the menu happens to be open. Re-deriving
// from title directly in that case would prepend the name onto its own
// previous output a second time; deriving from the cached original
// every time avoids that regardless of how many passes an element sees.
// The destination half is always resolved fresh against live state
// though (not cached) — unlike the base name/tooltip, "where this
// specific click goes right now" can genuinely change between passes
// (dayReturnToCalendar, settingsOpen, etc.) even when the element itself
// hasn't been recreated.
function applyDevElementNames(){
  if(!state.devSettings || !state.devSettings.developmentMode) return;
  const root = document.getElementById('appShell');
  if(!root) return;
  for(const el of root.querySelectorAll('[class],[id]')){
    let rule = null;
    for(const r of DEV_ELEMENT_NAME_RULES){
      if(el.matches(r.sel)){ rule = r; break; }
    }
    if(!rule) continue;
    if(el.dataset.origTitle === undefined) el.dataset.origTitle = el.getAttribute('title') || '';
    const orig = el.dataset.origTitle;
    let label = orig ? `${rule.sel} - ${orig}` : rule.sel;
    const dest = typeof rule.dest === 'function' ? rule.dest(el) : rule.dest;
    if(dest) label += ` => ${dest}`;
    el.setAttribute('title', label);
  }
}

// Called unconditionally at the top of render() (see 08-render-core.js) —
// unlike the rest of render()'s branches, this must run no matter which
// view (category/daily/checklist/Settings/Claude view) is active, so the
// panel's checkbox states never go stale regardless of what's on screen.
// Only rebuilds #devPanelBody's innerHTML, never the .open class on
// #devPanel itself (see toggleDevPanel()) — so a checkbox flip in here
// can't collapse the panel it just changed.
function renderDevPanel(){
  const body = document.getElementById('devPanelBody');
  if(!body) return;
  body.innerHTML = `
    <div class="devpanellabel">Dev Settings</div>
    ${devSettingsFieldsHtml('devpanelrow', 'devpanelfield', 'devpanelcaption', 'devpanelselect', false)}
  `;
}


