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
// 'calendar' is a third type (see renderCalendar() in 18-calendar.js) —
// unlike 'checklist', a calendar tab doesn't own any tasks of its own
// (there's no `t.category === thisId` data anywhere); it's a whole
// second view onto the same global state.days/plannedDates data the
// Daily tab already reads, just gridded by month instead of listed by
// day. Made a real category type (rather than a second fixed tab like
// Daily itself) specifically so it's addable/renameable/reorderable/
// deletable/colorable the same way a checklist tab is, instead of being
// permanently pinned into every account whether or not someone wants it.
function isCalendarCategory(id){
  const c = CATEGORIES[id];
  return !!c && c.type === 'calendar';
}
// Category selects used for *standard* tasks (quick-add, "move to
// category", the Daily quick-add) only ever offer standard categories —
// a checklist category's "tasks" are really named lists with no due
// date/priority fields (and a calendar category has no tasks of its own
// at all), so dropping a standard task into either would produce a
// hybrid neither view knows how to render, or vanish into a tab with no
// task list at all.
function standardCategoryEntries(){
  return Object.entries(CATEGORIES).filter(([,v]) => v.type !== 'checklist' && v.type !== 'calendar');
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
  return { bg:'#28362E', paper:'#F1EAD9', gradient:false, grain:false, pages:false, leather:false, uiPreset:'classic' };
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
// 'classic' reproduces the app's original literal brass/brass for both
// colors (byte-for-byte the old --brass/--brass-light hexes) so nothing
// changes for anyone who's never opened this picker. Every other preset
// is built from colors already used elsewhere in the app (the pre-dynamic
// category accents / the pendingTagColor dev experiment's own choices)
// rather than introducing new one-off hues.
const UI_COLOR_PRESETS = [
  { id:'classic',  label:'Classic',          primary:'#A9782F', primaryLight:'#C99A4E', secondary:'#A9782F', secondaryLight:'#C99A4E' },
  { id:'rust',     label:'Brass & Rust',     primary:'#A9782F', primaryLight:'#C99A4E', secondary:'#9C4530', secondaryLight:'#C3563C' },
  { id:'forest',   label:'Forest & Brass',   primary:'#3C5A45', primaryLight:'#4B7056', secondary:'#A9782F', secondaryLight:'#C99A4E' },
  { id:'slate',    label:'Slate & Rust',     primary:'#3E4A6B', primaryLight:'#4E5C86', secondary:'#9C4530', secondaryLight:'#C3563C' },
  { id:'charcoal', label:'Charcoal & Brass', primary:'#3A322A', primaryLight:'#483E34', secondary:'#A9782F', secondaryLight:'#C99A4E' }
];
function uiColorPreset(id){ return UI_COLOR_PRESETS.find(p=>p.id===id) || UI_COLOR_PRESETS[0]; }

// Desk & Ledger presets (Settings → Appearance) — a quick-start pair for
// state.theme.bg/paper, the same two fields the individual Background/
// Ledger wheels edit directly (see themeSwatchHtml() in 09-settings.js).
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

// EXPERIMENTAL, see defaultDevSettings() above — toggles body classes
// the body.devtag-seam/body.devtag-outline CSS reads, rather than a
// per-element inline style, since .pagetag is used from several
// different render functions and a body-level class lets all of them
// pick it up without each one having to know these settings exist.
function applyDevSettings(){
  const d = state.devSettings || defaultDevSettings();
  document.body.classList.toggle('devtag-seam', !!d.tagSeam);
  document.body.classList.toggle('devtag-outline', !!d.tagOutline);
  document.body.dataset.pendingTagStyle = d.pendingTagStyle || 'default';
  document.body.dataset.pendingTagColor = d.pendingTagColor || 'theme';
  document.body.classList.toggle('devlist-dates', !!d.showListDates);
  document.body.classList.toggle('devtreebubble', !!d.dayTreeCatBubble);
  // calendarCellStyle is read directly by calendarBodyHtml() in
  // 18-calendar.js instead of going through a body class/CSS selector —
  // unlike a boolean toggle, its variants need genuinely different markup
  // per cell (icon glyphs vs. plain color chips), not just a CSS-level
  // show/hide of markup that's always rendered the same way.
  document.body.classList.toggle('devtoday-ornate', !!d.calendarTodayOrnate);
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

async function setDevPendingTagColor(val){
  pushUndo(`Changed dev pending-tag color to "${val}"`);
  state.devSettings.pendingTagColor = val;
  applyDevSettings();
  render();
  queueSave();
}

async function setDevCalendarCellStyle(val){
  pushUndo(`Changed dev calendar cell style to "${val}"`);
  state.devSettings.calendarCellStyle = val;
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
function devSettingsFieldsHtml(rowClass, fieldClass, captionClass, selectClass, includeSidePanelToggle){
  const dev = state.devSettings || defaultDevSettings();
  const sidePanelToggleHtml = includeSidePanelToggle === false ? '' : `
    <label class="${rowClass}">
      <input type="checkbox" ${dev.sidePanelEnabled?'checked':''} onchange="toggleDevSetting('sidePanelEnabled', this.checked)">
      Show the floating dev panel (left edge, desktop only)
    </label>`;
  return `
    ${sidePanelToggleHtml}
    <label class="${rowClass}">
      <input type="checkbox" ${dev.tagSeam?'checked':''} onchange="toggleDevSetting('tagSeam', this.checked)">
      Page tag: seam shadow (tip reads as receding behind the label)
    </label>
    <label class="${rowClass}">
      <input type="checkbox" ${dev.tagOutline?'checked':''} onchange="toggleDevSetting('tagOutline', this.checked)">
      Page tag: full outline
    </label>
    <!-- "Compact tag" is the general name for .pagetag.compact — the
         small variant used for Checklist's "Pending", Daily's "Calendar",
         and Calendar's "Daily"/"Today" tags, as opposed to a full-size
         "Page Tag" (.pagetag without .compact), which is always a "back"
         out of an actual drilldown (Settings' "Done", a task detail's
         "Daily", etc.). Internal field names (pendingTagStyle/
         pendingTagColor, setDevPendingTagStyle()/setDevPendingTagColor())
         still say "pending" since that was the original, single use case
         these settings were built for — left as-is rather than renamed
         throughout, since only the user-facing label needed to stop
         implying "just for Checklist's Pending tag." -->
    <div class="${fieldClass}">
      <span class="${captionClass}">Compact tag style</span>
      <select class="${selectClass}" onchange="setDevPendingTagStyle(this.value)">
        <option value="default" ${dev.pendingTagStyle==='default'?'selected':''}>Default (small page tag)</option>
        <option value="jetout" ${dev.pendingTagStyle==='jetout'?'selected':''}>Redder, jets out further</option>
        <option value="sidebar" ${dev.pendingTagStyle==='sidebar'?'selected':''}>Vertical sidebar strip</option>
        <option value="booktab" ${dev.pendingTagStyle==='booktab'?'selected':''}>Left edge, overlapping up into the tab row</option>
        <option value="cornerpeek" ${dev.pendingTagStyle==='cornerpeek'?'selected':''}>Left edge, square (no tip)</option>
      </select>
    </div>
    <div class="${fieldClass}">
      <span class="${captionClass}">Compact tag color override</span>
      <select class="${selectClass}" onchange="setDevPendingTagColor(this.value)">
        <option value="theme" ${dev.pendingTagColor==='theme'?'selected':''}>Default (use Secondary color)</option>
        <option value="brass" ${dev.pendingTagColor==='brass'?'selected':''}>Force Primary</option>
        <option value="rust" ${dev.pendingTagColor==='rust'?'selected':''}>Force rust</option>
        <option value="forest" ${dev.pendingTagColor==='forest'?'selected':''}>Force forest green</option>
        <option value="slate" ${dev.pendingTagColor==='slate'?'selected':''}>Force slate blue</option>
        <option value="charcoal" ${dev.pendingTagColor==='charcoal'?'selected':''}>Force charcoal</option>
      </select>
    </div>
    <label class="${rowClass}">
      <input type="checkbox" ${dev.showListDates?'checked':''} onchange="toggleDevSetting('showListDates', this.checked)">
      Show a faded created-date next to each checklist's title
    </label>
    <label class="${rowClass}">
      <input type="checkbox" ${dev.dayTreeCatBubble?'checked':''} onchange="toggleDevSetting('dayTreeCatBubble', this.checked)">
      "Add to day" tree: pill-shaped category bubbles (like the tab bar)
    </label>
    <label class="${rowClass}">
      <input type="checkbox" ${dev.calendarTabTypeEnabled?'checked':''} onchange="toggleDevSetting('calendarTabTypeEnabled', this.checked)">
      Offer "Calendar" as an addable tab type (the normal way to reach it is the "Calendar" tag on Daily's own day list)
    </label>
    <div class="${fieldClass}">
      <span class="${captionClass}">Calendar cell info</span>
      <select class="${selectClass}" onchange="setDevCalendarCellStyle(this.value)">
        <option value="ratio" ${dev.calendarCellStyle==='ratio'?'selected':''}>Default (just the done/total ratio)</option>
        <option value="dots-top" ${dev.calendarCellStyle==='dots-top'?'selected':''}>+ category color dots, above the date</option>
        <option value="icons-below" ${dev.calendarCellStyle==='icons-below'?'selected':''}>+ category icons, listed below</option>
      </select>
    </div>
    <label class="${rowClass}">
      <input type="checkbox" ${dev.calendarTodayOrnate?'checked':''} onchange="toggleDevSetting('calendarTodayOrnate', this.checked)">
      Calendar: ornate (double-line) border on today's cell
    </label>
    <label class="${rowClass}">
      <input type="checkbox" ${dev.fullPageSwipeNav?'checked':''} onchange="toggleDevSetting('fullPageSwipeNav', this.checked)">
      Swipe day/month nav: whole page (not just the arrows row) — competes with swipe-right-to-go-back on those two pages; day/month nav wins when this is on
    </label>
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
         do that no matter how far a preset reclaims elsewhere. -->
    <div class="${fieldClass}">
      <span class="${captionClass}">Stacked-page size (Settings, day/task detail, etc.)</span>
      <select class="${selectClass}" onchange="setDevStackedPageInset(this.value)">
        <option value="classic" ${dev.stackedPageInsetPreset==='classic'?'selected':''}>Default</option>
        <option value="roomier" ${dev.stackedPageInsetPreset==='roomier'?'selected':''}>Roomier — thinner frame all around</option>
        <option value="leftheavy" ${dev.stackedPageInsetPreset==='leftheavy'?'selected':''}>Left-heavy — wide left margin, thin top</option>
        <option value="slim" ${dev.stackedPageInsetPreset==='slim'?'selected':''}>Slim — nearly flush with #appCard</option>
      </select>
    </div>
  `;
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


