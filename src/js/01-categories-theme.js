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
// date/priority fields, so dropping a standard task into one (or vice
// versa) would produce a hybrid that neither view knows how to render.
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
  return { bg:'#28362E', paper:'#F1EAD9', gradient:false, grain:false, pages:false, leather:false };
}

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
  root.setProperty('--desk-dark', t.gradient ? shadeHex(t.bg, -0.30) : t.bg);
  root.setProperty('--card-bg', t.paper);
  root.setProperty('--card-bg-dim', shadeHex(t.paper, -0.06));
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
  document.body.classList.toggle('devlist-dates', !!d.showListDates);
  document.body.classList.toggle('devtreebubble', !!d.dayTreeCatBubble);
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
function devSettingsFieldsHtml(rowClass, fieldClass, captionClass, selectClass){
  const dev = state.devSettings || defaultDevSettings();
  return `
    <label class="${rowClass}">
      <input type="checkbox" ${dev.sidePanelEnabled?'checked':''} onchange="toggleDevSetting('sidePanelEnabled', this.checked)">
      Show the floating dev panel (left edge, desktop only)
    </label>
    <label class="${rowClass}">
      <input type="checkbox" ${dev.tagSeam?'checked':''} onchange="toggleDevSetting('tagSeam', this.checked)">
      Page tag: seam shadow (tip reads as receding behind the label)
    </label>
    <label class="${rowClass}">
      <input type="checkbox" ${dev.tagOutline?'checked':''} onchange="toggleDevSetting('tagOutline', this.checked)">
      Page tag: full outline
    </label>
    <div class="${fieldClass}">
      <span class="${captionClass}">Pending-items tag style</span>
      <select class="${selectClass}" onchange="setDevPendingTagStyle(this.value)">
        <option value="default" ${dev.pendingTagStyle==='default'?'selected':''}>Default (small page tag)</option>
        <option value="jetout" ${dev.pendingTagStyle==='jetout'?'selected':''}>Redder, jets out further</option>
        <option value="sidebar" ${dev.pendingTagStyle==='sidebar'?'selected':''}>Vertical sidebar strip</option>
        <option value="booktab" ${dev.pendingTagStyle==='booktab'?'selected':''}>Left edge, overlapping up into the tab row</option>
        <option value="cornerpeek" ${dev.pendingTagStyle==='cornerpeek'?'selected':''}>Left edge, bigger diamond tip</option>
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
    ${devSettingsFieldsHtml('devpanelrow', 'devpanelfield', 'devpanelcaption', 'devpanelselect')}
  `;
}


