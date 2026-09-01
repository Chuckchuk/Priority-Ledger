// Categories are per-user data (state.categories), not a fixed config, so
// people can add/rename/remove their own tabs. CATEGORIES is a lookup index
// rebuilt from state.categories on every load and mutation — kept as a
// plain id-keyed object (via rebuildCategoriesIndex) so the many existing
// `CATEGORIES[key]` / `Object.entries(CATEGORIES)` call sites didn't need
// to change when categories became dynamic.
// Three whole 12-color sets to choose between (Settings → a category's
// own color popover — see its own little tab row in categoryPickerHtml(),
// 09-settings.js), not just one fixed palette — 'classic' is the original
// set (unchanged), 'greyscale' and 'pastel' are two entirely different
// moods. Each set is ordered by hue the same way 'classic' always was
// (see its own comment below) — sage/stone-type "muted" entries sit with
// their nearest real hue family rather than being pulled out as their
// own category. Switching which set is active (setCategoryPaletteSet(),
// 09-settings.js) remaps every category currently showing a color from
// the *old* active set to the same slot index in the new one — see that
// function's own comment for why a plain by-value swap (not a stored
// index) is what actually implements that.
const CATEGORY_PALETTE_SETS = {
  classic: {
    id: 'classic', label: 'Classic',
    colors: ['#9C4530','#6B4226','#A9782F','#8C7A1E','#3C5A45','#5B6560','#2F6B5E','#2C5C7A','#3E4A6B','#7A4B6B','#B5677A','#7A2E35']
  },
  // "Moody whites/blacks/grays/browns... sterile" per the project
  // owner's own brief — a plain lightness ramp of neutral grays (near-
  // black to pale silver) followed by a parallel ramp of warm-neutral
  // browns/taupes (dark espresso to sandy greige), ending on one true
  // off-white so there's a "lightest" entry to match 'classic' having
  // brass as its brightest. Deliberately NOT colorful at all — that's
  // what makes it read as its own distinct mood, not a desaturated
  // version of 'classic'.
  greyscale: {
    id: 'greyscale', label: 'Greyscale',
    colors: ['#1F1F1F','#3A3A3A','#545454','#6E6E6E','#8A8A8A','#A8A8A8','#C4C4C4','#4A3F38','#6B5D4F','#8C7B68','#A79A85','#D6D0C4']
  },
  // A full hue sweep at pastel lightness/saturation (soft coral through
  // peach, yellow, green, mint, blue, lavender, to rose) — same "spread
  // around the wheel" idea 'classic' itself follows, just at a
  // uniformly lighter, softer value across every entry instead of the
  // mixed mid-to-dark tones 'classic'/'greyscale' both use.
  pastel: {
    id: 'pastel', label: 'Pastel',
    colors: ['#E8998D','#F0B27A','#F0DC82','#C9DB8C','#A8D8A8','#9EDBC8','#93C9D0','#97BEE0','#A3AEE0','#C3A8E0','#E0A8CC','#E8AEB7']
  }
};
// The currently-active set's own colors — a `let`, not a `const`, same
// "rebuilt on load/mutation, plain array everywhere else reads it"
// pattern CATEGORIES itself already uses (see rebuildCategoriesIndex()
// below): every existing `CATEGORY_PALETTE.map()`/`.find()`/`.some()`
// call site throughout the app keeps working unchanged, since this is
// still just a plain array of hex strings at read time — only which
// array it happens to point at changes.
let CATEGORY_PALETTE = CATEGORY_PALETTE_SETS.classic.colors;
function rebuildCategoryPalette(){
  CATEGORY_PALETTE = (CATEGORY_PALETTE_SETS[state.categoryPaletteId] || CATEGORY_PALETTE_SETS.classic).colors;
}
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
// stay at both locations since neither maps to a single place. Colors
// are the same forest/slate/rust/brass spread this app has always
// started a new account with — spelled out as their own literal hexes
// (not CATEGORY_PALETTE[0..3]) specifically so CATEGORY_PALETTE stays
// free to reorder for browsing (see its own comment) without quietly
// changing what a new account's first four tabs look like.
function defaultCategories(){
  return [
    { id:'work',      label:'Work',      hex: '#3C5A45', locations:['home','away'], type:'standard' },
    { id:'household', label:'Household', hex: '#3E4A6B', locations:['home'],         type:'standard' },
    { id:'personal',  label:'Personal',  hex: '#9C4530', locations:['home','away'], type:'standard' },
    // A checklist-type tab in the defaults, so a new account sees one
    // without having to discover "Settings → add a tab → Checklist"
    // first — "Lists" rather than "Purchase Lists" so it doesn't read as
    // scoped to shopping specifically (packing, chores, anything).
    { id:'lists',     label:'Lists',     hex: '#A9782F', locations:['home','away'],  type:'checklist' }
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
// triangle/cross added later, same "plain text-presentation glyph, not
// color emoji" rule as the original 8 — both are ordinary Unicode
// symbols with no registered emoji presentation, so they're safe to add
// without re-checking every font this app might render in.
// 'house' and 'ring' both used to be hollow/outline glyphs (⌂, ○) — per
// the project owner's own callout, every icon here should read as a
// solid, filled shape (like 'star' always has), not a mix of filled and
// outline. 'house' keeps its id (still reads as "a house," just now a
// filled pentagon — a square base + triangular roof silhouette — instead
// of the outline glyph); 'ring' is gone entirely rather than just filled
// in, since a filled circle would only duplicate 'dot' — 'hexagon' takes
// its place in the same array position instead, a genuinely different
// filled silhouette. See the icon migration in normalizeState()
// (02-storage-state.js) for accounts that had 'ring' saved already, and
// CATEGORY_ICON_SCALE below for why each glyph also carries its own
// visual-size correction now.
const CATEGORY_ICON_ORDER = ['dot','star','flag','house','diamond','square','hexagon','check','triangle','cross'];
const CATEGORY_ICON_GLYPHS = { dot:'●', star:'★', flag:'⚑', house:'⬟', diamond:'◆', square:'■', hexagon:'⬢', check:'✓', triangle:'▲', cross:'✚' };
// SVG override for icons a plain Unicode glyph can't represent well —
// today just 'house': the pentagon glyph above (⬟) read as too close to
// a plain hexagon rather than an actual house silhouette, per the
// project owner's own callout, and there's no reliable filled "square +
// triangle roof" text-presentation character to swap in instead (real
// house pictographs are emoji-only, which ignores `color:` styling —
// see CATEGORY_ICON_GLYPHS' own comment on why that's a hard rule here).
// fill="currentColor" is what lets this still pick up a category's own
// hex the exact same way every glyph-based icon does via its wrapping
// span's own `color:`. A plain house pentagon (wall corners + a centered
// roof peak) in a 24×24 box, confirmed by eye in the running app rather
// than assumed correct from the coordinates alone.
const CATEGORY_ICON_SVG = {
  house: '<svg viewBox="0 0 24 24" width="1em" height="1em" style="display:block"><polygon points="12,2 21,10 21,21 3,21 3,10" fill="currentColor"/></svg>'
};
// Per-glyph visual-size correction, applied as a CSS transform:scale()
// (not font-size — that would compose wrongly with each call site's own
// differently-sized base class, .dot/.cdot/.caticonbtn/etc., since an
// inline font-size fully replaces rather than multiplies the class's
// own). Different Unicode symbols at the identical font-size cover very
// different fractions of their own box — a thin glyph like '✓' or '▲'
// visually reads noticeably smaller than a filled disc like '●' at the
// same nominal size. These values were measured, not eyeballed: each
// glyph rendered to an offscreen canvas at a fixed size, its actual
// opaque-pixel bounding box measured, then scaled so its own covered
// area matches 'star' — the reference the project owner pointed at —
// rather than guessing proportions by eye (see the project owner's own
// past feedback on authoring visual geometry blind). 1 means "already
// matches, no correction needed."
const CATEGORY_ICON_SCALE = { dot:1.47, star:1, flag:1.37, house:0.85, diamond:1.48, square:1.62, hexagon:1.12, check:1.58, triangle:0.95, cross:1.06 };
// Single shared renderer for every place a category's marker shows up
// (task rows, the task detail page, the tab bar, the day-tree picker, the
// Settings row) — same reasoning as taskRowHtml being the one place a
// task row renders: edit the glyph logic once, everywhere picks it up.
// `cls` is the site's existing dot class (`cdot` or `dot`) so each call
// site keeps its own layout/spacing rules; only the glyph-vs-background
// rendering is unified here.
function categoryDotHtml(c, cls){
  const icon = c.icon || 'dot';
  const inner = CATEGORY_ICON_SVG[icon] || CATEGORY_ICON_GLYPHS[icon] || CATEGORY_ICON_GLYPHS.dot;
  const scale = CATEGORY_ICON_SCALE[icon] || 1;
  const scaleStyle = scale !== 1 ? `display:inline-block;transform:scale(${scale});` : '';
  return `<span class="${cls}" style="color:${c.hex};${scaleStyle}">${inner}</span>`;
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
// Ordered around the color wheel by Primary's own hue (warm red through
// to the neutral/near-black end) rather than the order each one happened
// to get added in — same pairs sit adjacent to each other (rust/classic
// both brass, forest/forestrust both forest-green, slate/slatebrass/
// copper all slate-blue) since they share a Primary, with the fixed-hue
// trio (forest, teal, slate) sweeping green→cyan→blue between them, and
// charcoal (the one near-neutral, least "colorful" choice) landing last
// rather than in the middle of an otherwise real hue sweep. Secondary is
// always one of a small fixed set of "metal" accents (Brass, Rust, and
// now Copper) rather than a free color — that's deliberate, so re-sort
// against Primary's hue only when adding another entry, per the standing
// rule in CLAUDE.md.
// Wrapped in a sets map (mirrors CATEGORY_PALETTE_SETS/DESK_PAPER_PRESET_SETS
// below) so the UI Colors picker can offer palette-switching tabs the same
// way Category Colors and Desk & Ledger do — see setUiPaletteSet() in
// 09-settings.js. Only 'classic' exists today (nothing has been asked to
// split off yet), so the tab bar stays hidden until a second set is added
// (paletteTabsHtml() only renders when there's more than one to choose
// between) — the map shape is just here so adding one later doesn't need
// a data-shape migration.
const UI_COLOR_PRESET_SETS = {
  classic: {
    id: 'classic', label: 'Classic',
    presets: [
      { id:'burgundy',  label:'Burgundy & Brass',  primary:'#7A2E35', primaryLight:'#A53E48', secondary:'#A9782F', secondaryLight:'#C99A4E' },
      { id:'rust',      label:'Brass & Rust',     primary:'#A9782F', primaryLight:'#C99A4E', secondary:'#9C4530', secondaryLight:'#C3563C' },
      { id:'classic',   label:'Full Brass',       primary:'#A9782F', primaryLight:'#C99A4E', secondary:'#A9782F', secondaryLight:'#C99A4E' },
      { id:'forest',    label:'Forest & Brass',   primary:'#3C5A45', primaryLight:'#4B7056', secondary:'#A9782F', secondaryLight:'#C99A4E' },
      { id:'forestrust', label:'Forest & Rust',    primary:'#3C5A45', primaryLight:'#4B7056', secondary:'#9C4530', secondaryLight:'#C3563C' },
      { id:'slate',     label:'Slate & Rust',     primary:'#3E4A6B', primaryLight:'#4E5C86', secondary:'#9C4530', secondaryLight:'#C3563C' },
      // Copper (#B87333, the standard web/real-world copper reference hex)
      // as a third "metal" Secondary alongside Brass/Rust, per the project
      // owner's own ask — paired with Slate (an existing Primary, not a
      // new one) for a cool-blue-against-warm-copper contrast, and grouped
      // here with the rest of the slate-primary family rather than off on
      // its own.
      { id:'copper',    label:'Slate & Copper',   primary:'#3E4A6B', primaryLight:'#4E5C86', secondary:'#B87333', secondaryLight:'#F89B45' },
      { id:'charcoal',  label:'Charcoal & Brass', primary:'#3A322A', primaryLight:'#483E34', secondary:'#A9782F', secondaryLight:'#C99A4E' }
    ]
  }
};
// Reassignable pointer into the active set's presets — every call site
// still reads it as a flat array (`UI_COLOR_PRESETS.find(...)` etc.), it
// just can't assume it's static any more. Rebuilt by rebuildUiColorPresets()
// in normalizeState()/afterStateRestore(), same idiom as CATEGORY_PALETTE.
let UI_COLOR_PRESETS = UI_COLOR_PRESET_SETS.classic.presets;
function rebuildUiColorPresets(){
  UI_COLOR_PRESETS = (UI_COLOR_PRESET_SETS[state.uiPaletteId] || UI_COLOR_PRESET_SETS.classic).presets;
}
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
// Split into two sets, same shape/reasoning as CATEGORY_PALETTE_SETS/
// UI_COLOR_PRESET_SETS — a palette-tabs bar in the picker (see
// deskPaperPickerHtml() in 09-settings.js) switches between them, and
// setDeskPaletteSet() there re-maps state.theme.bg/paper to the same
// index in the new set IF they currently match a preset in the outgoing
// one; a custom bg/paper (or a saved custom template) never matches by
// definition, so it's untouched by a palette switch, same "custom stays
// fixed" rule the category version follows.
// 'classic' keeps the original warm/saturated spread — 'classic' itself
// reproduces the app's original literal bg/paper hexes, ordered by Ledger
// (paper) color from its own pale cream out to teal's much more
// saturated golden honey at the far end (plum next — its paper is the
// grayest/least-saturated of the bunch — then maroon's blush, then
// barrel and navy's two genuinely parchment/amber-toned papers, per the
// standing re-sort-on-change rule in CLAUDE.md's "Conventions").
// 'greyscale' pulls out the three moodiest, least-saturated near-neutral
// pairs (Espresso & Cream, Charcoal & Birch, and Oak & Ivory) into their
// own set — same "browns count as greyscale too" idea
// CATEGORY_PALETTE_SETS.greyscale already established for category
// colors. Oak & Ivory specifically: its own bg (#3D2B1F) and Barrel &
// Amber's (#2E1D12) are close enough in raw hue that Classic didn't need
// both, and Barrel's much more saturated amber-gold paper gives Classic
// more personality/color-pop than Oak's near-white ivory paper would —
// so Barrel & Amber stays as Classic's one "brownish" entry (per the
// project owner's own ask to keep at least one there) while Oak & Ivory,
// the plainer/more sterile of the two pairings, joins Greyscale instead.
const DESK_PAPER_PRESET_SETS = {
  classic: {
    id: 'classic', label: 'Classic',
    presets: [
      // "Forest & Bone" — a real name in line with every other entry here
      // (was just "Classic"), for the app's own original literal bg/paper
      // hexes. id stays 'classic' (nothing keys off the label text).
      { id:'classic',  label:'Forest & Bone',       bg:'#28362E', paper:'#F1EAD9' },
      { id:'plum',     label:'Plum & Linen',       bg:'#3B2A44', paper:'#EDE6DC' },
      // Deep oxblood/maroon desk, paired with a paper that leans slightly
      // warm-blush rather than the plain creams above — echoes the bg's
      // own warmth (same "contrast, not match" idea Navy & Parchment's
      // cool bg / warm gold-cream paper already follows) without
      // literally matching it. "Vellum" (real bookbinding parchment, not
      // just a color name) rather than "Blush" per the project owner's
      // own ask for a less feminine-reading second word. Values updated
      // to match the project owner's own hand-tuned "Whiskey" custom
      // preset (#4B1F1D/#F2DBC4) — close enough to the original hexes to
      // be visually indistinguishable, so this is a straight merge rather
      // than a new look; the label stays "Maroon & Vellum" since that
      // name still fits (the project owner's own read: "kind of like
      // Wine") and nothing about the mood actually changed.
      { id:'maroon',   label:'Maroon & Vellum',    bg:'#4B1F1D', paper:'#F2DBC4' },
      // A genuinely different, more amber/caramel ledger than Navy's own
      // parchment (not a re-use — see the project owner's own ask that
      // this NOT be "exactly the same as Navy & Parchment"), paired with
      // a warm near-black oak-barrel brown — the "whisky" vibe the
      // project owner asked to try: not a literal whisky-colored swatch,
      // but the mood of one (dark aged wood, warm low amber light on the
      // page), same way Maroon & Vellum's own pairing is about a mood,
      // not a literal match.
      { id:'barrel',   label:'Barrel & Amber',     bg:'#2E1D12', paper:'#E3C79A' },
      { id:'navy',     label:'Navy & Parchment',   bg:'#1F2937', paper:'#EFDDB0' },
      // A different desk again (the project owner's own ask — not
      // espresso a second time) paired with the most saturated, golden
      // "parchment family" ledger of the set — deep teal against warm
      // honey-gold is a classic library/banker's-lamp pairing.
      { id:'teal',     label:'Teal & Honey',       bg:'#1C3D42', paper:'#E6C888' }
    ]
  },
  greyscale: {
    id: 'greyscale', label: 'Greyscale',
    presets: [
      // Kept the original moody near-black espresso-brown desk (the
      // project owner's own favorite part of the old "Espresso &
      // Parchment") but re-paired: parchment's own gold turned out not to
      // suit it as well as hoped, so it pairs with a plain warm cream
      // instead — "Cream" also just reads as the other half of
      // "Espresso," coffee-and-cream. This is NOT the same paper as Navy
      // & Parchment's own.
      { id:'espresso', label:'Espresso & Cream',   bg:'#241812', paper:'#F0E6D6' },
      { id:'charcoal', label:'Charcoal & Birch',   bg:'#26241F', paper:'#F2ECE0' },
      { id:'oak',      label:'Oak & Ivory',        bg:'#3D2B1F', paper:'#F5EFE0' }
    ]
  }
};
// Reassignable pointer into the active set's presets, same idiom as
// CATEGORY_PALETTE/UI_COLOR_PRESETS — every call site still reads it as a
// flat array. Rebuilt by rebuildDeskPaperPresets() in
// normalizeState()/afterStateRestore().
let DESK_PAPER_PRESETS = DESK_PAPER_PRESET_SETS.classic.presets;
function rebuildDeskPaperPresets(){
  DESK_PAPER_PRESETS = (DESK_PAPER_PRESET_SETS[state.deskPaletteId] || DESK_PAPER_PRESET_SETS.classic).presets;
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
  // -0.30 multiplicatively on the classic desk green used to reproduce
  // the original hand-picked --desk-dark almost exactly, back when this
  // constant was chosen mostly sight-unseen — the gradient it fed was
  // centered off the top of the viewport (see body's own comment in
  // <style>) and barely showed at all in practice. Once that positioning
  // bug was fixed and the gradient actually became visible, -0.30 read
  // as heavy rather than atmospheric; -0.20 is the project owner's own
  // call once they could actually see it.
  const deskDark = t.gradient ? shadeHex(t.bg, -0.20) : t.bg;
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
  // t.customUi (not uiColorPreset('custom')'s own read of the *real*
  // state.theme.customUi) is what lets a live drag-preview show a custom
  // pair that hasn't been committed yet — updateCatWheelUI() in
  // 09-settings.js calls this with a throwaway {...state.theme, uiPreset:
  // 'custom', customUi:{...draft}} object while dragging, never touching
  // state.theme itself, so Escape/"‹ Presets" can cleanly revert just by
  // re-running applyTheme() (the real, committed state.theme) afterward.
  const ui = (t.uiPreset === 'custom' && t.customUi) ? t.customUi : uiColorPreset(t.uiPreset);
  root.setProperty('--primary', ui.primary);
  root.setProperty('--primary-light', ui.primaryLight);
  root.setProperty('--secondary', ui.secondary);
  root.setProperty('--secondary-light', ui.secondaryLight);
  // Text-input accent (--input-accent, read by .notesfield/.datefieldedit &
  // co. in <style>) — just --primary itself now, not a computed
  // complementary color off the Ledger/paper hue. A true complement can
  // land anywhere on the color wheel depending on what paper color
  // someone's actually picked (the classic cream's complement is a
  // blue-gray, which is exactly what read as "not in-style with other
  // things in this app" — nothing else here is ever blue). --primary is
  // "in style" by construction, since it's already what every other
  // accent in the app — page tags, the quick-add button, selection
  // feedback — uses.
  root.setProperty('--input-accent', ui.primary);
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
  // EXPERIMENTAL, starred in Settings as a decision still pending (see
  // devSettingsFieldsHtml()'s own comment) — how a task row's inline
  // quick-view steps (.expand.open, taskSubtasksHtml()) visually tie back
  // to the task they belong to. Read by the body[data-expand-grouping=…]
  // rules in <style>; 'none' needs no matching selector since it's just
  // today's plain indent with nothing added.
  document.body.dataset.expandGrouping = d.expandGroupingStyle || 'rail';
  // EXPERIMENTAL, starred in Settings — a few alternate spots for the
  // urgent-flag/today-pin pair in the full Task Detail page's header (see
  // the body[data-taskdetail-actions=…] rules in <style>). 'side' (the
  // default) needs no matching selector, same as 'none' above.
  document.body.dataset.taskdetailActions = d.taskDetailActionsPosition || 'side';
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

async function setDevCategoryLabelStyle(val){
  pushUndo(`Changed dev category label style to "${val}"`);
  state.devSettings.categoryLabelStyle = val;
  render();
  queueSave();
}
async function setDevExpandGroupingStyle(val){
  pushUndo(`Changed dev quick-view steps grouping to "${val}"`);
  state.devSettings.expandGroupingStyle = val;
  applyDevSettings();
  render();
  queueSave();
}
async function setDevTaskDetailActionsPosition(val){
  pushUndo(`Changed dev task detail actions position to "${val}"`);
  state.devSettings.taskDetailActionsPosition = val;
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
  // Shared wrapper for every dropdown field below — all sixteen of these
  // used to repeat the same caption + native <select> markup; now they
  // go through customSelectHtml() (09-settings.js) instead, keyed by
  // rowClass (unique per host: the floating panel vs. Settings' own Dev
  // Settings section) + the setter's own name, so the floating panel and
  // the Settings panel can each have their own dropdown open at once
  // without fighting over the same customSelectOpenKey.
  const devField = (captionHtml, currentVal, options, onChangeFn) => `
    <div class="${fieldClass}">
      <span class="${captionClass}">${captionHtml}</span>
      ${customSelectHtml(rowClass+':'+onChangeFn, options, currentVal, onChangeFn, selectClass)}
    </div>`;
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
    ${devField('Compact tag style', dev.pendingTagStyle, [
      ['default','Default (small page tag)'],
      ['jetout','Jets out further'],
      ['sidebar','Vertical sidebar strip'],
      ['booktab','Left edge, overlapping up into the tab row']
    ], 'setDevPendingTagStyle')}

    ${devSectionHeadHtml('Checklist')}
    <label class="${rowClass}">
      <input type="checkbox" ${dev.showListDates?'checked':''} onchange="toggleDevSetting('showListDates', this.checked)">
      Show a faded created-date next to each checklist's title
    </label>

    ${devSectionHeadHtml('Cover & Page Sizing')}
    ${devField('Leather cover size', dev.leatherInsetPreset, [
      ['classic','Default'],
      ['roomier','Roomier — thinner cover all around'],
      ['leftheavy','Left-heavy — wide left margin, thin top'],
      ['slim','Slim — barely a lip of leather']
    ], 'setDevLeatherInset')}
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
    ${devField('Stacked-page size (Settings, day/task detail, etc.)', dev.stackedPageInsetPreset, [
      ['leftheavy','Left-heavy — wide left margin, thin top (default)'],
      ['classic','Classic'],
      ['roomier','Roomier — thinner frame all around'],
      ['slim','Slim — nearly flush with #appCard']
    ], 'setDevStackedPageInset')}

    ${devSectionHeadHtml('Task Fields')}
    ${devField('<span title="Still debating a progress-bar picker — the fun high-value animation is worth keeping around for, but the interaction itself needs real rework before it\'s usable. Starred as a reminder to come back to it, not to delete it.">★ Timeframe &amp; Priority picker</span>', dev.fieldPickerStyle, [
      ['default','Default (dropdown)'],
      ['buttons','Row of buttons'],
      ['progress','Stylized progress bar']
    ], 'setDevFieldPickerStyle')}
    <!-- categoryLabelStyle — see categoryLabelHtml()'s own comment in
         08-render-core.js: only affects the full task detail page's own
         category label (top-right of the page), not the tab bar itself. -->
    ${devField("Task detail page's category label", dev.categoryLabelStyle, [
      ['tab','Colored tab (default)'],
      ['tape','Washi tape']
    ], 'setDevCategoryLabelStyle')}
    <!-- Starred the same way the Timeframe/Priority picker field above is
         — a real, live option to compare against "none," not a settled
         choice yet. Ties a task row's own inline .expand steps (Steps
         only, quick-view — see taskSubtasksHtml()'s own comment) back to
         the task they belong to once a few rows are open at once and a
         couple of steps have wrapped to multiple lines each; without
         either the parent task reads as "lost" a few lines down. Left
         border is the more contained of the two (a thin rail down the
         steps, same idiom Daily's own nested sub-rows already use);
         background tint groups the whole block more strongly but is the
         louder change of the two. -->
    ${devField('<span title="Comparing against doing nothing here — decide which (if either) actually solves the \'parent task gets lost\' problem once there\'s more real usage to judge it against.">★ Quick-view steps grouping</span>', dev.expandGroupingStyle, [
      ['rail','Left border rail (default)'],
      ['tint','Subtle background tint'],
      ['none','None (today\'s plain indent)']
    ], 'setDevExpandGroupingStyle')}
    <!-- Starred, same "not settled yet" reasoning as the field above —
         a spot to try the urgent-flag/today-pin pair in besides the
         current default. 'side' (today's spot, beside the checkbox) was
         chosen specifically to avoid two things already tried and
         rejected: sharing the title's own row (threw off the title's
         centering) and just picking one new spot unilaterally. 'corner'
         is the explicit swap-with-.categorylabel idea — flag/pin take
         its top-right spot, the category label moves down to roughly
         where flag/pin sit today. 'topleft' tries the one corner nothing
         lives in yet, just under the Back tag, rather than sharing
         either existing corner. -->
    ${devField('<span title="Not settled — a few spots to compare against the current default, including swapping places with the category label entirely.">★ Task detail: flag/pin position</span>', dev.taskDetailActionsPosition, [
      ['side','Beside the checkbox (default)'],
      ['corner','Top-right corner — swaps with the category label'],
      ['topleft','Top-left corner, under the Back tag']
    ], 'setDevTaskDetailActionsPosition')}

    ${devSectionHeadHtml('Tab Bar')}
    <label class="${rowClass}">
      <input type="checkbox" ${dev.stickyTabBar?'checked':''} onchange="toggleDevSetting('stickyTabBar', this.checked)">
      Sticky tab bar — pins the tabs (and the Daily tab within them) to the top of the screen while scrolling
    </label>
  `;

  const desktopBody = `
    ${devSectionHeadHtml('Tab Bar')}
    ${devField('Tab bar style', dev.tabBarDesktopStyle, [
      ['overlap','Overlapping color tabs (default)'],
      ['default','Classic (horizontal pill row)'],
      ['sidetabs','Vertical tabs down the left side'],
      ['indextabs','Staggered, color-edged index tabs']
    ], 'setDevTabBarDesktopStyle')}
    <div class="devgroupnote">See also Tab Bar under Mobile — this is the same underlying choice, answered separately per viewport.</div>
    ${dev.tabBarDesktopStyle==='overlap' ? `
    <label class="${rowClass}">
      <input type="checkbox" ${dev.overlapSubtags?'checked':''} onchange="toggleDevSetting('overlapSubtags', this.checked)">
      Overlap tabs: floating count badge instead of inline icon/number (only shown when a category has open tasks; adds "!" for anything overdue or High priority)
    </label>
    ${devField('Overlap tabs: hover/select behavior', dev.overlapHoverMode, [
      ['default','Default (hover reorders to the front)'],
      ['push','Fixed order — hovering/selecting pushes neighbors aside instead']
    ], 'setDevOverlapHoverMode')}
    <label class="${rowClass}">
      <input type="checkbox" ${dev.overlapRankStagger?'checked':''} onchange="toggleDevSetting('overlapRankStagger', this.checked)">
      Overlap tabs: stagger by stacking rank (a covered tab sits a little higher at rest so its own label still peeks over the one covering it)
    </label>
    ` : ''}
    ${dev.tabBarDesktopStyle==='sidetabs' ? `
    ${devField('Side tabs: appearance', dev.sidetabsAppearance, [
      ['color','Colored label (default)'],
      ['translucentpill','Translucent pill, with icon'],
      ['edge','Left edge color only, no icon'],
      ['classic','Classic (original full-width column)'],
      ['classicband','Classic + color band (no icon)']
    ], 'setDevSidetabsAppearance')}
    ${devField('Side tabs: shape (Colored/Translucent Pill/Edge only)', dev.sidetabsShape, [
      ['pagetab','Page-tab point (default)'],
      ['invertedv','Inverted V'],
      ['arrows','Arrows out'],
      ['jagged','Jagged edge'],
      ['sawtooth','Clean sawtooth'],
      ['flat','Flat (no point)'],
      ['random','Random (stable per tab)'],
      ['iconstyle','Depending on icon style']
    ], 'setDevSidetabsShape')}
    ` : ''}
  `;

  const mobileBody = `
    <label class="${rowClass}">
      <input type="checkbox" ${dev.mobileUiPreviewOnDesktop?'checked':''} onchange="toggleDevSetting('mobileUiPreviewOnDesktop', this.checked)">
      Preview everything below on desktop too (it's phone/touch-only by default)
    </label>

    ${devSectionHeadHtml('Quick-Add Bar')}
    ${devField('"+ Add Task" button position', dev.quickAddTriggerPosition||'bottom', [
      ['bottom','Bottom of the screen (sticky)'],
      ['top','Top of the page, under the tabs (sticky)']
    ], 'setDevQuickAddTriggerPosition')}
    ${devField('"+ Add Task" button opens…', dev.quickAddMobileStyle, [
      ['topsheet','"+ Add Task" button opens a top sheet'],
      ['bottomsheet','"+ Add Task" button opens a bottom sheet'],
      ['inline','"+ Add Task" button expands it in place']
    ], 'setDevQuickAddMobileStyle')}

    ${devSectionHeadHtml('Task Rows & Detail')}
    ${devField('Task row layout', dev.taskRowMobileStyle, [
      ['default','Default (badges squeeze the title)'],
      ['stacked','Stacked — badges drop below the title'],
      ['minimal','Minimal — hide drag handle & category dot']
    ], 'setDevTaskRowMobileStyle')}
    ${devField('Task detail fields', dev.taskDetailMobileStyle, [
      ['default','Default (one cramped wrapping row)'],
      ['stacked','Stacked — one full-width field per row'],
      ['grouped','Grouped — 2-column fields + an even action row']
    ], 'setDevTaskDetailMobileStyle')}
    <!-- Only affects mobile's long-press, and mobile's tap under
         'detail' — every other tap (desktop always, mobile under
         'default'/'split') opens the inline Steps-only quick view
         regardless of this setting; see taskRowTap()/taskRowHtml()'s
         own comments in 08-render-core.js. -->
    ${devField('Task tap/long-press (mobile)', dev.taskLongPressMode, [
      ['detail','Detail (default) — mobile tap opens the full task page; long-press shows a quick-actions menu'],
      ['split','Split — tap opens Steps; mobile long-press opens a full-fields bottom sheet'],
      ['default','Classic — tap opens Steps; no long-press action']
    ], 'setDevTaskLongPressMode')}

    ${devSectionHeadHtml('Quick Capture')}
    <label class="${rowClass}">
      <input type="checkbox" ${dev.floatingAddButton?'checked':''} onchange="toggleDevSetting('floatingAddButton', this.checked)">
      Floating (+) button to add a task from any tab
    </label>

    ${devSectionHeadHtml('Tab Bar')}
    ${devField('Tab bar style', dev.tabBarMobileStyle, [
      ['default','Default (wraps to a 2nd row)'],
      ['scroll','Scrolls sideways, one row']
    ], 'setDevTabBarMobileStyle')}
    <div class="devgroupnote">See also Tab Bar under Desktop — this is the same underlying choice, answered separately per viewport.</div>

    ${devSectionHeadHtml('Settings Panel')}
    ${devField('Settings category rows', dev.settingsRowMobileStyle, [
      ['default','Default (everything one flat row)'],
      ['grouped','Grouped — Delete moves to its own quiet row']
    ], 'setDevSettingsRowMobileStyle')}
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
// A right-click/long-press menu button (renderTaskContextMenu(),
// renderDayContextMenu(), categoryMoveMenuHtml() — all in
// 08-render-core.js) never carries its own authored `title`, so the
// generic orig-title-based label would just be the bare selector with
// nothing else. These buttons' onclick is always the literal command
// itself, wrapped as `ctxMenuAction(()=>command(args))` so closing the
// menu and running the command happen together — stripping that wrapper
// down to `command(args)` is what "what command they run when called"
// actually shows, and is far more useful in a hover tooltip than the
// selector alone. Used as a rule's `cmd` (see applyDevElementNames()),
// not `dest` — this replaces the label half, not the arrow-suffix half.
function ctxMenuButtonCommand(el){
  const oc = el.getAttribute('onclick') || '';
  const m = oc.match(/^ctxMenuAction\(\(\)=>(.+)\)$/);
  return m ? m[1] : oc;
}
// "Where they take you, if they take you somewhere else" — most of these
// commands (toggleStatus, deleteTask, updateCategory/
// moveTaskCategoryFollowingTab, ...) just mutate state in place and
// re-render whatever's already on screen, so they get no arrow suffix at
// all (same "only elements that are genuinely a link get one" rule
// resolvePageTagDest() follows above). Only the two that actually
// navigate somewhere new are listed.
function ctxMenuButtonDest(el){
  const cmd = ctxMenuButtonCommand(el);
  if(cmd.includes('openGenericTaskDetail(')) return 'renderTaskDetailPage()';
  if(cmd.includes('openDay(')) return 'renderDayDetail()';
  return null;
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
  { sel: '.categorylabel' },
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
  { sel: '.datefield' },
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
  // Color wheel (colorWheelInnerHtml(), 09-settings.js) — shared by both
  // the category color picker and the desk/paper & UI-color dual
  // pickers. Previously one of the "rarer standalone popovers" this
  // whole mechanism openly didn't cover; no longer a special case now
  // that these have their own rules like everything else.
  { sel: '.catwheelback' },
  { sel: '.catwheelring' },
  { sel: '.catwheelknob' },
  { sel: '.catwheelsquare' },
  { sel: '.catwheelsvknob' },
  { sel: '.uicolorswatch' },
  { sel: '.uicolorlabel.clickable' },
  { sel: '.uicolorquicklink' },
  { sel: '.dualcolortab' },
  { sel: '.dualcolorcopy' },
  // Dev panel
  { sel: '.devpaneltab' },
  { sel: '.devgrouphead' },
  // Context menu (right-click / long-press, and the category Move-to
  // menu — all share #ctxMenu's markup). cmd/dest here read the button's
  // own onclick instead of the generic orig-title/dest split every other
  // rule above uses, since these buttons never carry an authored title
  // to fall back on — see ctxMenuButtonCommand()'s own comment.
  { sel: '.ctxmenu-danger', cmd: ctxMenuButtonCommand, dest: ctxMenuButtonDest },
  { sel: '.ctxmenu button', cmd: ctxMenuButtonCommand, dest: ctxMenuButtonDest },
];

// Runs after every render() (see its call site in 08-render-core.js) and
// after the right-click/long-press quick-actions menu (renderTaskContextMenu(),
// same file) — the two most common ways this app's DOM actually changes.
// The color wheel (colorWheelInnerHtml(), 09-settings.js) used to be a
// standalone popover this genuinely never covered; it goes through
// render() like everything else in Settings now, so it's covered the
// same way — no separate call site needed for it. Cheap no-op when
// development mode is off (the overwhelming majority of the time).
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
  // ',button' catches the #ctxMenu's own quick-action buttons (renderTask
  // ContextMenu()/renderDayContextMenu()/categoryMoveMenuHtml(), all in
  // 08-render-core.js) — plain `<button onclick="...">Label</button>`
  // with no class or id of their own (only the danger/delete variant
  // carries a class). '.ctxmenu button' as a RULE selector still matches
  // those fine via the ancestor combinator, but this outer query is what
  // decides which elements even get tested against the rule list in the
  // first place, and a class-or-id-less <button> never showed up in it —
  // so every ordinary menu item's tooltip (Mark complete, Toggle urgent,
  // Move to a category, ...) silently never rendered, the exact
  // "clickable menu item shows no command/destination" gap reported.
  for(const el of root.querySelectorAll('[class],[id],button')){
    let rule = null;
    for(const r of DEV_ELEMENT_NAME_RULES){
      if(el.matches(r.sel)){ rule = r; break; }
    }
    if(!rule) continue;
    if(el.dataset.origTitle === undefined) el.dataset.origTitle = el.getAttribute('title') || '';
    // `cmd` (context-menu buttons only, see ctxMenuButtonCommand()) is
    // resolved fresh every pass, same as `dest` below — it's not cached
    // onto dataset.origTitle since these buttons keep no authored title
    // to fall back on anyway, so there's nothing stale to protect it
    // from the way the #ctxMenu-reuse comment above describes for orig.
    const orig = typeof rule.cmd === 'function' ? rule.cmd(el) : el.dataset.origTitle;
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


