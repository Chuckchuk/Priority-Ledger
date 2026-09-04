// Categories are per-user data (state.categories), not a fixed config, so
// people can add/rename/remove their own tabs. CATEGORIES is a lookup index
// rebuilt from state.categories on every load and mutation — kept as a
// plain id-keyed object (via rebuildCategoriesIndex) so the many existing
// `CATEGORIES[key]` / `Object.entries(CATEGORIES)` call sites didn't need
// to change when categories became dynamic.
// Six whole 12-color sets to choose between (Settings → a category's own
// color popover — see its own little tab row in categoryPickerHtml(),
// 09-settings.js), not just one fixed palette. Switching which set is
// active (setCategoryPaletteSet(), 09-settings.js) remaps every category
// currently showing a color from the *old* active set to whichever color
// sits at that SAME slot index in the new set — a plain by-index swap.
// An earlier pass tried remapping by nearest actual color match instead
// (more "correct" in isolation, and immune to sets being different
// lengths), but the project owner explicitly called it out as a
// regression: matching against whatever a category's color HAPPENS to be
// right now, rather than a fixed slot, means the match can drift a
// little further off on every hop, and switching to a palette and back
// doesn't reliably land you back where you started. By-index switching
// doesn't have that problem — going A→B→A is always a no-op — so it's
// worth the real constraint it imposes in exchange: every set below MUST
// be exactly 12 colors long, and MUST be hand-ordered so index N is the
// same hue family in every set (rust at 0, brown at 1, gold at 2, and so
// on through burgundy at 11 — see 'classic' below, which fixes that
// order since it's the original/default set). 'classic' and 'pastel'
// both already swept the wheel in that same order coincidentally; the
// rest were deliberately reordered to match once this became a hard
// requirement, not just a nice-to-have.
const CATEGORY_PALETTE_SETS = {
  classic: {
    id: 'classic', label: 'Classic',
    colors: ['#9C4530','#6B4226','#A9782F','#8C7A1E','#3C5A45','#5B6560','#2F6B5E','#2C5C7A','#3E4A6B','#7A4B6B','#B5677A','#7A2E35']
  },
  // Was "Moody whites/blacks/grays/browns... sterile" (a dark-to-light
  // neutral ramp) — swapped with 'noir' below per the project owner's
  // own call after seeing both Dark Mode sets in place: this (lighter,
  // more washed-out) register actually reads better paired with THIS
  // set's own light Desk & Ledger papers, and the other register (see
  // 'noir') reads better against a genuinely dark card. Same colors
  // 'noir' used to hold, not a fresh design — plus 3 new entries to
  // reach 12 (the original 9 skewed too pale on their own for enough
  // range on light paper), all arranged into the warm-taupe / neutral /
  // cool-slate groups below to roughly echo 'classic'/'pastel's own
  // warm→cool→warm-again sweep — an approximation at best (these colors
  // don't carry enough real hue variation for a literal match the way
  // 'midnight' below can), but consistently ordered the same way every
  // other set here is.
  greyscale: {
    id: 'greyscale', label: 'Greyscale',
    colors: ['#A89A88','#8C7F6C','#6E6052','#4A4034','#A0A0A0','#808080','#606060','#9098A0','#767C83','#5A6068','#3E4248','#404040']
  },
  // A full hue sweep at pastel lightness/saturation (soft coral through
  // peach, yellow, green, mint, blue, lavender, to rose) — same "spread
  // around the wheel" idea 'classic' itself follows, just at a
  // uniformly lighter, softer value across every entry instead of the
  // mixed mid-to-dark tones 'classic'/'greyscale' both use.
  pastel: {
    id: 'pastel', label: 'Pastel',
    colors: ['#E8998D','#F0B27A','#F0DC82','#C9DB8C','#A8D8A8','#9EDBC8','#93C9D0','#97BEE0','#A3AEE0','#C3A8E0','#E0A8CC','#E8AEB7']
  },
  // Three Dark Mode sets, per the project owner's own ask — paired with
  // matching Dark Mode sets in UI_COLOR_PRESET_SETS/DESK_PAPER_PRESET_SETS
  // below (same "pick Pastel everywhere for one coordinated look" idea
  // pastel's own comment already established, just for dark moods
  // instead). midnight = cool (blue/teal/indigo/violet), ember = warm
  // (red/rust/amber/olive), noir = near-monochrome grays/taupes/slates —
  // same three-way split 'classic'/'greyscale'/'pastel' already use, for
  // dark surfaces instead.
  //   A first pass at 'midnight' used bright, highly-saturated colors —
  // reads fine as a dot on a dark card in isolation, but sat oddly next
  // to that set's own genuinely moody Desk & Ledger/UI colors, per the
  // project owner's own callout. A second pass tried deep, richly
  // saturated jewel tones ordered to match 'classic's own slot-by-slot
  // hue exactly (rust, brown, gold, olive, ... burgundy), spanning the
  // full wheel the same way 'classic'/'pastel' do — but at matching hue
  // AND matching (dark, rich) value, several slots landed close enough
  // to 'classic's own actual color to barely read as a different
  // palette at all (gold and olive in particular were nearly identical
  // hex values), which the project owner called out directly. Rebuilt a
  // third time as blue/teal/green/violet/purple ONLY, per their own
  // explicit ask — no warm rust/brown/gold/olive/red at all, so nothing
  // here can accidentally converge on a 'classic' color the way the full
  // -wheel version did, and Midnight actually reads as its own distinct
  // cool mood rather than "classic, recolored." Not ordered to match
  // 'classic's own 12 slots any more (there's no warm hue here to put in
  // the rust/brown/gold/olive slots) — a deliberate trade-off, since
  // by-index palette switching (see setCategoryPaletteSet(),
  // 09-settings.js) means Midnight won't feel as "related" to Classic
  // slot-for-slot as the other sets do, but that's the explicit ask.
  midnight: {
    id: 'midnight', label: 'Midnight',
    colors: ['#2E6E4A','#1E7A5E','#1E7A78','#2E7E9A','#3A6C9A','#4258A0','#4E4CA0','#5E48A0','#6E48A0','#8248A0','#8C4880','#804466']
  },
  // Unchanged from the first pass, per the project owner's own explicit
  // "keep Ember as-is for now" — even though it reads a little bright for
  // a dark mode the same way the original 'midnight' did, that's a
  // deliberate, deferred call, not an oversight. All 9 original colors
  // kept at their exact original values; 3 new ones (a deeper terracotta,
  // a true olive-green, and an oxblood/maroon) fill out a 12th-color hue
  // sweep. Ember is warm-only by design (no greens/teals/blues/purples —
  // that's the whole "Ember" identity), so unlike every other set here
  // it CAN'T actually cover 'classic's full 12-slot hue spread — this is
  // just ordered as its own smooth ascending sweep (red through gold
  // through yellow-green, then wrapping to wine/maroon at the end,
  // mirroring where 'classic' itself ends on plum/rose/burgundy) rather
  // than forced into slots it has no real color for.
  ember: {
    id: 'ember', label: 'Ember',
    colors: ['#C15A5A','#C97D6E','#C97244','#D9895A','#B8672E','#A6763E','#E0A458','#C6B15A','#9BAF5E','#7A8C4A','#B1546E','#8C3E42']
  },
  // Was 'greyscale' above, until the project owner's own swap call — this
  // near-black-to-mid-gray register pairs better with an actually-dark
  // card than the lighter one that now lives at 'greyscale' does. Kept
  // the original array's own character (plain neutrals, then warm
  // taupes) but nudged the four darkest entries up a bit — at their
  // original, even-darker values they measured under 1.5:1 contrast
  // against this set's own near-black Desk & Ledger papers, i.e.
  // genuinely invisible as a category dot there, not just moody. Same
  // "warm-taupe / neutral" grouping approach as 'greyscale' above (dark
  // to light within each group here, rather than light to dark, so the
  // darkest — least visible against a dark card — entries land in the
  // earlier slots and the lightest — most visible — land later).
  noir: {
    id: 'noir', label: 'Noir',
    colors: ['#6E6052','#6B5D4F','#8C7B68','#A79A85','#D6D0C4','#585858','#5E5E5E','#666666','#6E6E6E','#8A8A8A','#A8A8A8','#C4C4C4']
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
// A category's marker is a single icon colored via its own hex — 'dot'
// (a plain circle) is the default and the only option before this
// feature existed, so every pre-existing category (no `.icon` field
// saved yet) renders exactly as it always did. Order here is the order
// offered in categoryPickerHtml()'s icon row.
// Every icon is a hand-authored SVG in a shared 24×24 viewBox, not a
// Unicode text glyph — the previous version (CATEGORY_ICON_GLYPHS, a
// per-icon `transform:scale()` correction sized by measuring each
// glyph's own opaque-pixel *area* against 'star' on an offscreen canvas)
// was trying to solve the wrong problem: matching ink *area* across
// glyphs of wildly different shapes means their actual bounding boxes
// end up nothing alike (a thin checkmark needed scale:1.58 to match a
// filled star's ink coverage, a solid square only 1.62 the other way,
// dot 1.47...) — so despite being genuinely measured, not eyeballed,
// icons still visibly render at very different *sizes* next to each
// other, exactly the "some icons appear way bigger than others" the
// project owner kept running into. Every shape below is instead drawn
// to reach roughly the same distance from center (about 8-10 of the 24
// viewBox units each way) regardless of its own shape's ink density —
// same idiom the standalone 'house' SVG already used before this pass,
// just extended to every icon and freed of the scale hack entirely.
// fill="currentColor" (stroke="currentColor" for 'check', the one
// stroke-based shape) is what still picks up a category's own hex via
// the wrapping span's own `color:`, same as before. Centered by the
// geometry itself now, not by a transform whose origin had to line up
// with whatever off-center bounding box a given glyph's font metrics
// happened to produce — see the caticonbtn picker's own "not centered"
// bug this also fixes.
const CATEGORY_ICON_ORDER = ['dot','star','flag','house','diamond','square','hexagon','check','triangle','cross'];
const CATEGORY_ICON_SVG = {
  dot: '<svg viewBox="0 0 24 24" width="1em" height="1em" style="display:block"><circle cx="12" cy="12" r="9" fill="currentColor"/></svg>',
  star: '<svg viewBox="0 0 24 24" width="1em" height="1em" style="display:block"><polygon points="12,2 14.47,8.6 21.51,8.91 15.99,13.3 17.88,20.09 12,16.2 6.12,20.09 8.01,13.3 2.49,8.91 9.53,8.6" fill="currentColor"/></svg>',
  flag: '<svg viewBox="0 0 24 24" width="1em" height="1em" style="display:block"><rect x="4" y="2" width="2.5" height="20" fill="currentColor"/><path d="M6.5,3 L19,7.5 L6.5,12 Z" fill="currentColor"/></svg>',
  house: '<svg viewBox="0 0 24 24" width="1em" height="1em" style="display:block"><polygon points="12,2 21,10 21,21 3,21 3,10" fill="currentColor"/></svg>',
  diamond: '<svg viewBox="0 0 24 24" width="1em" height="1em" style="display:block"><polygon points="12,2 22,12 12,22 2,12" fill="currentColor"/></svg>',
  square: '<svg viewBox="0 0 24 24" width="1em" height="1em" style="display:block"><rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor"/></svg>',
  hexagon: '<svg viewBox="0 0 24 24" width="1em" height="1em" style="display:block"><polygon points="12,2 20.66,7 20.66,17 12,22 3.34,17 3.34,7" fill="currentColor"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="1em" height="1em" style="display:block"><path d="M4,13 L9,18 L20,6" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  triangle: '<svg viewBox="0 0 24 24" width="1em" height="1em" style="display:block"><polygon points="12,3 21,20 3,20" fill="currentColor"/></svg>',
  cross: '<svg viewBox="0 0 24 24" width="1em" height="1em" style="display:block"><path d="M10,3 H14 V10 H21 V14 H14 V21 H10 V14 H3 V10 H10 Z" fill="currentColor"/></svg>'
};
// Single shared renderer for every place a category's marker shows up
// (task rows, the task detail page, the tab bar, the day-tree picker, the
// Settings row) — same reasoning as taskRowHtml being the one place a
// task row renders: edit the icon logic once, everywhere picks it up.
// `cls` is the site's existing dot class (`cdot` or `dot`) so each call
// site keeps its own layout/spacing rules; only the icon-vs-background
// rendering is unified here.
function categoryDotHtml(c, cls){
  const icon = c.icon || 'dot';
  const inner = CATEGORY_ICON_SVG[icon] || CATEGORY_ICON_SVG.dot;
  return `<span class="${cls}" style="color:${c.hex}">${inner}</span>`;
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
  return { bg:'#28362E', paper:'#F1EAD9', gradient:false, grain:false, pages:false, leather:false, uiPreset:'rust', customUi:null, inkFromUi:false, inkFromUiSource:'primary' };
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
// 09-settings.js.
// 'greyscale': five neutral Primary/Secondary pairs, same "browns count as
// greyscale too" idea as the Desk & Ledger and Category Colors greyscale
// sets — ranges from a true near-black neutral (Onyx & Ash) through a
// cool grey-blue (Steel & Bone) to two warm near-black browns (Umber &
// Pewter, Espresso & Taupe), ordered coolest/most-neutral to warmest.
// 'pastel': five Primary/Secondary pairs pulled from the same hue
// families as CATEGORY_PALETTE_SETS.pastel and DESK_PAPER_PRESET_SETS.pastel
// (rose, mint/sage, periwinkle, lavender/lilac, peach, coral, butter,
// orchid, sky) so picking Pastel across all three menus reads as one
// coordinated look — each pair itself is a warm/cool contrast (e.g. Rose
// primary against Sage secondary) rather than two colors from the same
// family, so the two accent colors stay visually distinct against a
// pastel paper instead of blending together. Ordered by Primary's own
// hue, same rule as 'classic', starting near red like Burgundy does there.
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
  },
  greyscale: {
    id: 'greyscale', label: 'Greyscale',
    presets: [
      { id:'onyx',          label:'Onyx & Ash',        primary:'#1C1C1C', primaryLight:'#333333', secondary:'#9C9992', secondaryLight:'#B8B4AC' },
      { id:'graphite',      label:'Graphite & Silver', primary:'#3A3A3A', primaryLight:'#525252', secondary:'#ADADAD', secondaryLight:'#C9C9C9' },
      { id:'steel',         label:'Steel & Bone',      primary:'#4A4E52', primaryLight:'#60656A', secondary:'#D8D3C4', secondaryLight:'#EAE6DA' },
      { id:'umber',         label:'Umber & Pewter',    primary:'#2E2B28', primaryLight:'#453F37', secondary:'#8C8578', secondaryLight:'#A8A192' },
      { id:'espressotaupe', label:'Espresso & Taupe',  primary:'#2B1F18', primaryLight:'#43332A', secondary:'#A08D78', secondaryLight:'#BFAE9B' }
    ]
  },
  pastel: {
    id: 'pastel', label: 'Pastel',
    // defaultId (see setUiPaletteSet(), 09-settings.js) is what a switch
    // to this set falls back to when the outgoing UI preset doesn't map
    // to any slot here (a custom pick, most commonly) — Mint & Coral per
    // the project owner's own ask, rather than leaving a custom pair in
    // place under a "Pastel" label that doesn't actually show anything
    // pastel.
    defaultId: 'mintcoral',
    // Mint & Coral leads the array — same "default means top of the
    // list" convention as Seafoam & Mist above (see
    // DESK_PAPER_PRESET_SETS.pastel's own comment), a deliberate
    // exception to the pure hue-sweep order otherwise used here.
    presets: [
      { id:'mintcoral',       label:'Mint & Coral',       primary:'#5FAE9A', primaryLight:'#82C4B2', secondary:'#E58572', secondaryLight:'#EFA795' },
      { id:'rosesage',        label:'Rose & Sage',        primary:'#C97B84', primaryLight:'#DDA0A7', secondary:'#8FAE83', secondaryLight:'#AECB9F' },
      { id:'periwinklepeach', label:'Periwinkle & Peach', primary:'#7C88C4', primaryLight:'#9CA6D6', secondary:'#E2A671', secondaryLight:'#EFC08F' },
      { id:'lavenderbutter',  label:'Lavender & Butter',  primary:'#9B85C4', primaryLight:'#B7A4D8', secondary:'#D9C367', secondaryLight:'#E8D98C' },
      { id:'orchidsky',       label:'Orchid & Sky',       primary:'#C48BB0', primaryLight:'#D6A9C6', secondary:'#7EB2D6', secondaryLight:'#A0C8E2' }
    ]
  },
  // Three Dark Mode sets — see CATEGORY_PALETTE_SETS' own comment above
  // for the midnight/ember/noir mood split, shared across all three
  // palette systems. Unlike that set (and unlike a first pass at this
  // one), these are NOT brighter/lighter than the light sets' own —
  // primary/secondary do double duty as both a small icon/text color
  // read directly against the (now dark) card AND a solid button
  // background with fixed light text on top (--ink is a flat #F1EAD9 in
  // dark mode, see applyThemeObject() below; .flagbtn.on/.daybtn.on use
  // white directly) — a light, bright accent has great contrast for the
  // first role and terrible contrast for the second, which a first pass
  // at these values got backwards (checked against both a representative
  // dark card and that fixed ink color; several pairs came out under
  // 2:1). Mid-value, richly saturated jewel tones — similar overall
  // lightness to the light sets' own colors, actually — balance
  // reasonably against both extremes, the same way Classic's own colors
  // already do in light mode (a mid-dark tone reads fine as an icon on
  // light paper AND behind light text, because it's roughly the same
  // "medium" distance from both).
  // 'skyrose' and 'tealcoral' are unchanged from the first pass — the
  // project owner explicitly singled both out as already reading right,
  // "just not the mood problem the other three have" — so those two are
  // left exactly as they were rather than darkened along with the rest.
  // The other three (iceamber/mintviolet/periwinklegold) still read as
  // "a little too bright for a dark mode" even after the first
  // brightness pass — mostly the amber/gold and violet secondary/
  // primary tones specifically, which read visually "louder" than a
  // blue/teal/rose of the same raw HSV value does. Darkened further
  // (lower V, and — for the amber/gold entries — slightly lower S too,
  // since a fully-saturated gold reads as more of a "warning" color than
  // a moody accent), re-checked against both the fixed dark-mode ink
  // color and a representative dark card the same way the first pass
  // was, so this doesn't just reintroduce the opposite (invisible-icon)
  // problem the first pass was fixing.
  midnight: {
    id: 'midnight', label: 'Midnight',
    presets: [
      { id:'iceamber',       label:'Ice & Amber',        primary:'#335880', primaryLight:'#4D79A9', secondary:'#7A5B2B', secondaryLight:'#A37E44' },
      { id:'skyrose',        label:'Sky & Rose',         primary:'#2E7DA8', primaryLight:'#4C9BC2', secondary:'#B85068', secondaryLight:'#D07890' },
      { id:'mintviolet',     label:'Mint & Violet',      primary:'#26705C', primaryLight:'#3E9980', secondary:'#624C9E', secondaryLight:'#836AC7' },
      { id:'periwinklegold', label:'Periwinkle & Gold',  primary:'#4A5094', primaryLight:'#686FBD', secondary:'#7A612B', secondaryLight:'#A38544' },
      { id:'tealcoral',      label:'Teal & Coral',       primary:'#237A72', primaryLight:'#3F968D', secondary:'#C25A44', secondaryLight:'#DA7C67' }
    ]
  },
  // Same darkening pass as Midnight's above, applied across the whole
  // set here (no exceptions singled out for Ember) — same reasoning,
  // same before/after contrast checks against the fixed dark-mode ink
  // color and Ember's own dark papers.
  ember: {
    id: 'ember', label: 'Ember',
    presets: [
      { id:'rustgold',     label:'Rust & Gold',        primary:'#804124', primaryLight:'#A95E3C', secondary:'#755D29', secondaryLight:'#9E8142' },
      { id:'emberclay',    label:'Ember & Clay',       primary:'#803726', primaryLight:'#A9523E', secondary:'#7A5331', secondaryLight:'#A3744B' },
      { id:'winerose',     label:'Wine & Rose',        primary:'#8F3C4D', primaryLight:'#B8586B', secondary:'#854B3C', secondaryLight:'#AE6A58' },
      { id:'copperolive',  label:'Copper & Olive',     primary:'#805024', primaryLight:'#A9703C', secondary:'#58662F', secondaryLight:'#7D8F4A' },
      { id:'brickbrass',   label:'Brick & Brass',      primary:'#8F3832', primaryLight:'#B8534C', secondary:'#755A23', secondaryLight:'#9E7D3A' }
    ]
  },
  noir: {
    id: 'noir', label: 'Noir',
    presets: [
      { id:'silverash',     label:'Silver & Ash',      primary:'#6E6E6E', primaryLight:'#8C8C8C', secondary:'#787878', secondaryLight:'#969696' },
      { id:'pearlgraphite', label:'Pearl & Graphite',  primary:'#8A8578', primaryLight:'#A6A296', secondary:'#78715F', secondaryLight:'#968F7C' },
      { id:'platinumsmoke', label:'Platinum & Smoke',  primary:'#7E828A', primaryLight:'#9A9EA5', secondary:'#6D7378', secondaryLight:'#8C9196' },
      { id:'boneink',       label:'Bone & Ink',        primary:'#9A9078', primaryLight:'#B5AC96', secondary:'#6E6555', secondaryLight:'#8C8371' },
      { id:'chromeslate',   label:'Chrome & Slate',    primary:'#6E747A', primaryLight:'#8C9298', secondary:'#5D6368', secondaryLight:'#7B8186' }
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
// 'greyscale' pulls the moodiest, least-saturated near-neutral pairs into
// their own set — same "browns count as greyscale too" idea
// CATEGORY_PALETTE_SETS.greyscale already established for category
// colors, plus three further-out additions (Graphite & Frost, Ink &
// Snow, Driftwood & Fog — see their own comments below) added for real
// range: the original three all sat in a fairly narrow near-black-brown
// band, so the new ones stretch it toward a true cool neutral, the
// starkest possible black/white contrast, and — the one genuine outlier
// — a properly *mid*-toned grey desk rather than another near-black.
// Sorted by paper saturation (max-min channel spread), coolest/most
// neutral to warmest/most brown, same ordering rule as Classic's own
// paper-color sort. Oak & Ivory specifically stays here rather than
// Classic: its own bg (#3D2B1F) and Barrel & Amber's (#2E1D12) are close
// enough in raw hue that Classic didn't need both, and Barrel's much
// more saturated amber-gold paper gives Classic more personality/
// color-pop than Oak's near-white ivory paper would — so Barrel & Amber
// stays as Classic's one "brownish" entry (per the project owner's own
// ask to keep at least one there) while Oak & Ivory, the plainer/more
// sterile of the two pairings, joins Greyscale instead.
// 'pastel' is a genuine style departure from the near-black-desk look
// every Classic/Greyscale entry shares — a soft dusty mid-tone desk
// (rather than another near-black) under a very pale, barely-tinted
// paper, still keeping enough desk/paper contrast to read as a ledger
// rather than a flat wash. Six hues sweep the wheel in the same
// direction/order CATEGORY_PALETTE_SETS.pastel's own 12 colors do (warm
// coral/terracotta round through yellow-green, teal, blue, purple, and
// back to pink) specifically so picking Pastel here and Pastel for
// Category Colors reads as one coordinated look rather than two
// unrelated pastel sets that happen to share a name.
const DESK_PAPER_PRESET_SETS = {
  classic: {
    id: 'classic', label: 'Classic',
    presets: [
      // "Forest & Bone" — a real name in line with every other entry here
      // (was just "Classic"), for the app's own original literal bg/paper
      // hexes. id stays 'classic' (nothing keys off the label text).
      { id:'classic',  label:'Forest & Bone',       bg:'#28362E', paper:'#F1EAD9' },
      { id:'plum',     label:'Plum & Linen',       bg:'#3B2A44', paper:'#EDE6DC' },
      // Deep oxblood desk, paired with a paper that leans slightly
      // warm-blush rather than the plain creams above — echoes the bg's
      // own warmth (same "contrast, not match" idea Navy & Parchment's
      // cool bg / warm gold-cream paper already follows) without
      // literally matching it. "Vellum" (real bookbinding parchment, not
      // just a color name) rather than "Blush" per the project owner's
      // own ask for a less feminine-reading second word. Values match
      // the project owner's own hand-tuned "Whiskey" custom preset
      // (#4B1F1D/#F2DBC4) — close enough to the original "Maroon &
      // Vellum" hexes to be visually indistinguishable, so this was a
      // straight merge rather than a new look. Renamed from "Maroon &
      // Vellum" to "Whiskey & Vellum" per the project owner's own ask for
      // something that reads masculine — "Whiskey" is literally their
      // own name for this color (their custom preset), and fits the
      // oxblood-and-warm-cream mood better than a fruit/flower word would.
      { id:'maroon',   label:'Whiskey & Vellum',    bg:'#4B1F1D', paper:'#F2DBC4' },
      // A genuinely different, more amber/caramel ledger than Navy's own
      // parchment (not a re-use — see the project owner's own ask that
      // this NOT be "exactly the same as Navy & Parchment"), paired with
      // a warm near-black oak-barrel brown — the "whisky" vibe the
      // project owner asked to try: not a literal whisky-colored swatch,
      // but the mood of one (dark aged wood, warm low amber light on the
      // page), same way Whiskey & Vellum's own pairing is about a mood,
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
      // A true cool near-neutral — barely a hint of blue-grey rather than
      // the warm browns everywhere else in this set — for a colder,
      // more clinical-ledger mood than Charcoal & Birch's own warmer take.
      { id:'graphitefrost', label:'Graphite & Frost', bg:'#2E3033', paper:'#E7E9EA' },
      // The starkest possible pairing in the whole app: as close to true
      // black and true white as the ledger aesthetic can take without
      // looking like a plain document instead of a ledger — the
      // "extreme" end of this set, deliberately.
      { id:'inksnow',  label:'Ink & Snow',         bg:'#121212', paper:'#FAFAF7' },
      // The one genuine outlier here: every other Desk & Ledger entry
      // (in every set) uses a near-black desk under a light paper —
      // Driftwood is a real *mid*-toned warm grey desk instead, closer in
      // lightness to its own paper than to any other entry's bg. Still
      // reads as a desk under a ledger (paper stays meaningfully lighter),
      // just a lighter, sun-bleached-wood mood rather than a moody one.
      { id:'driftwood', label:'Driftwood & Fog',    bg:'#6B6558', paper:'#ECE9E2' },
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
  },
  pastel: {
    id: 'pastel', label: 'Pastel',
    // defaultId (see setDeskPaletteSet(), 09-settings.js) is what a
    // switch to this set falls back to when the outgoing bg/paper don't
    // match any slot here (a custom pick, most commonly) — Seafoam &
    // Mist per the project owner's own ask, rather than leaving a custom
    // desk/paper in place under a "Pastel" label that doesn't actually
    // show anything pastel.
    defaultId: 'seafoam',
    // Seafoam & Mist leads the array (per the project owner's own
    // clarification: "default" means "top of the list," same convention
    // UI_COLOR_PRESET_SETS.classic's own comment already uses for 'rust')
    // rather than sitting mid-sweep where the hue-sort alone would put
    // it — a deliberate exception to the pure hue-sweep ordering the rest
    // of this array follows.
    presets: [
      { id:'seafoam',           label:'Seafoam & Mist',        bg:'#4F8177', paper:'#E2F0EA' },
      { id:'terracotta',        label:'Terracotta & Sand',     bg:'#A16A4C', paper:'#F6E4C9' },
      { id:'sagecustard',       label:'Sage & Custard',        bg:'#6C7A5E', paper:'#F1ECD4' },
      { id:'periwinklepowder',  label:'Periwinkle & Powder',   bg:'#5E6B93', paper:'#E7ECF6' },
      { id:'lilaccloud',        label:'Lilac & Cloud',         bg:'#7C6690', paper:'#F0E7F2' },
      { id:'dustyrose',         label:'Dusty Rose & Petal',    bg:'#8C5B67', paper:'#F7E3DE' }
    ]
  },
  // Three Dark Mode sets — see CATEGORY_PALETTE_SETS' own comment above
  // for the midnight/ember/noir mood split. The real enabler of an
  // actual dark *mode* (not just another moody desk under the same
  // always-light paper every set above uses): paper itself goes dark
  // here, for the first time — applyThemeObject() already derives
  // --ink/--ink-soft/--line from `relLuminance(t.paper) < 0.5` (see its
  // own comment, further down this file) and flips to a light, legible
  // ink automatically whenever that's true, so a dark paper "just
  // works" through the exact same mechanism a custom dark pick already
  // would have. paper stays only a little lighter than its own bg in
  // every entry here (unlike every light set's huge bg/paper contrast)
  // — enough for the card to still visibly sit on the desk as its own
  // surface, without one of them reading as a stray light patch against
  // an otherwise dark page.
  midnight: {
    id: 'midnight', label: 'Midnight',
    presets: [
      { id:'inksteel',       label:'Ink & Steel',         bg:'#0B0F14', paper:'#1B2229' },
      { id:'abyssdenim',     label:'Abyss & Denim',       bg:'#0A141F', paper:'#152436' },
      { id:'twilightplum',   label:'Twilight & Plum',     bg:'#130B1D', paper:'#221730' },
      { id:'deeppine',       label:'Deep Teal & Pine',    bg:'#0A1714', paper:'#132621' },
      { id:'obsidianindigo', label:'Obsidian & Indigo',   bg:'#0D0A18', paper:'#1C172B' }
    ]
  },
  ember: {
    id: 'ember', label: 'Ember',
    presets: [
      { id:'charember',    label:'Char & Ember',        bg:'#170D0A', paper:'#2A1912' },
      { id:'coalrust',     label:'Coal & Rust',         bg:'#140C08', paper:'#271710' },
      { id:'smolderumber', label:'Smolder & Umber',     bg:'#190F08', paper:'#2E1C0E' },
      { id:'midnightwine', label:'Midnight & Wine',     bg:'#170A0D', paper:'#2A131A' },
      { id:'cocoacopper',  label:'Cocoa & Copper',      bg:'#140D08', paper:'#26180E' }
    ]
  },
  noir: {
    id: 'noir', label: 'Noir',
    presets: [
      { id:'onyxcharcoal', label:'Onyx & Charcoal',     bg:'#0A0A0A', paper:'#1E1E1E' },
      { id:'ironslate',    label:'Iron & Slate',        bg:'#0F1012', paper:'#212326' },
      { id:'jetgraphite',  label:'Jet & Graphite',      bg:'#050505', paper:'#181818' },
      { id:'basaltash',    label:'Basalt & Ash',        bg:'#111111', paper:'#242424' },
      { id:'voidstone',    label:'Void & Stone',        bg:'#0C0C0C', paper:'#1C1B19' }
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

// hex + alpha -> an rgba() string — used by applyThemeObject()'s
// inkFromUi style to turn a computed hex ink color into a translucent
// line color, same role the hand-written rgba(42,35,24,0.16) plays for
// the fixed default ink.
function hexToRgba(hex, alpha){
  const num = parseInt(hex.replace('#',''), 16);
  const r = (num >> 16) & 0xFF, g = (num >> 8) & 0xFF, b = num & 0xFF;
  return `rgba(${r},${g},${b},${alpha})`;
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
  // t.inkFromUi (Settings → Appearance, right under Background gradient —
  // see appearanceSection() in 09-settings.js) — started as an
  // EXPERIMENTAL Dev Setting scoped to when a Pastel palette was active
  // (pastelModeActive(), since removed), graduated to a real, always-
  // available Appearance choice per the project owner's own ask, since
  // there's nothing pastel-specific about wanting text/lines to echo the
  // UI accent — it can look good in any palette.
  //   The flat neutral ink/line below was picked for the app's original
  // warm-cream paper and never adapts to what's actually on screen. Two
  // earlier approaches tried deriving a tint from the desk *paper* color
  // instead (first a plain hue-preserving darken, then one that boosted
  // paper's saturation first) — both landed too close to one shared
  // charcoal to actually read as tinted, since paper is deliberately
  // washed-out by design (that's what makes it paper). This derives from
  // the current UI Colors PRIMARY or SECONDARY instead (t.inkFromUiSource
  // — a real, deliberately-chosen accent hue, never washed-out the way a
  // paper color is), boosting its saturation and dropping its value to
  // produce a genuinely rich, confident dark tone: Rose & Sage's own
  // dusty-rose primary becomes a deep wine ink, Mint & Coral's becomes a
  // deep teal, and so on — confirmed against the project owner's own test
  // case (Desk & Ledger: Seafoam & Mist, UI Colors: Rose & Sage) as an
  // actual, clearly legible shift rather than "so subtle it's useless."
  // It also means the ink echoes whatever accent color is already doing
  // the most visual work elsewhere on the page (buttons, page tags, the
  // Daily tab's own dot — see dailyTabHex() in 06-tabs-render.js), which
  // reads as more "designed together" than tying it to paper ever did.
  // Only font was NOT touched here — see the project owner's own ask and
  // CLAUDE.md's standing "keep the Fraunces/IBM Plex identity" rule;
  // swapping type families would be a much larger, riskier change (117+
  // hardcoded font-family declarations across styles.css, no existing
  // --font-* variable layer to hook into) for a less certain payoff, so
  // this stayed color-only — the formula/constants themselves are
  // unchanged from the Pastel-only version, just no longer gated on any
  // palette being Pastel.
  const inkFromUi = !dark && !!t.inkFromUi;
  if(inkFromUi){
    const sourceHex = t.inkFromUiSource === 'secondary' ? ui.secondary : ui.primary;
    const sourceHsv = hexToHsv(sourceHex);
    const tintSat = Math.min(0.15 + sourceHsv.s * 1.0, 0.62);
    // Value (0.34/0.58) bumped up from an initial 0.22/0.48 — at 0.22 the
    // result still read as "nearly black" regardless of hue (the project
    // owner's own words) since a color that dark loses most of its
    // perceptible hue no matter how saturated; brighter keeps the same
    // hue/saturation math but actually lets the color read as a color.
    const inkHex = hsvToHex(sourceHsv.h, tintSat, 0.34);
    root.setProperty('--ink', inkHex);
    root.setProperty('--ink-soft', hsvToHex(sourceHsv.h, tintSat, 0.58));
    root.setProperty('--line', hexToRgba(inkHex, 0.16));
  } else {
    root.setProperty('--ink', dark ? '#F1EAD9' : '#2A2318');
    root.setProperty('--ink-soft', dark ? 'rgba(241,234,217,0.65)' : '#7A6E58');
    root.setProperty('--line', dark ? 'rgba(241,234,217,0.18)' : 'rgba(42,35,24,0.16)');
  }

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
  // EXPERIMENTAL — Desktop zoom (Dev Settings → Desktop): reproduces
  // actual browser zoom via CSS `zoom` on #appShell itself, rather than
  // transform:scale() (doesn't affect layout flow, so it breaks anything
  // absolutely-positioned without manual compensation — and this app
  // leans on that heavily: #ctxMenu, #noteHoverTip, #sidetabsPeek, the
  // swipe-gesture math) or bumping the root font-size (only rem/em-sized
  // things would grow; most of this app's own spacing/icon sizing is
  // plain px, so text and boxes would drift apart instead of scaling
  // together). `zoom` is what real browser zoom itself does under the
  // hood, so JS position math that reads getBoundingClientRect() against
  // a zoomed ancestor sees the same already-scaled numbers it would if
  // the user had zoomed their own browser — nothing here needs its own
  // zoom-awareness. Scoped to #appShell specifically (not body/html),
  // which also keeps the PWA safe-area/notch handling on <html> (see
  // CLAUDE.md's own theming notes) out of the scaled subtree entirely.
  // #authShell (the login screen) is deliberately left alone — this is a
  // per-account devSettings value, meaningless before there's an account
  // signed into yet. See the body[data-desktop-zoom="…"] rules in <style>
  // for the actual per-preset values.
  document.body.dataset.desktopZoom = d.desktopZoom || '100';
  document.body.classList.toggle('devtag-seam', !!d.tagSeam);
  document.body.dataset.pendingTagStyle = d.pendingTagStyle || 'default';
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
  // needs to key off the specific variant, not just "some variant is on".
  // All of them are additionally gated behind body.mobileui-active
  // (refreshed below and on resize, see 19-bootstrap.js) so none has any
  // effect until an actual phone-ish viewport — or mobileUiPreviewOnDesktop
  // — makes it relevant.
  document.body.dataset.quickaddBar = d.quickAddBarStyle || 'top';
  document.body.dataset.tabbarMobile = d.tabBarMobileStyle || 'default';
  // Independent of tabBarMobileStyle above (wrap vs. scroll is a separate
  // axis from plain vs. colored) — see the body.mobileui-active[data-
  // tabbar-mobile-colored] rules in <style>.
  document.body.dataset.tabbarMobileColored = d.mobileColoredTabs ? 'on' : '';
  document.body.dataset.tabbarDesktop = d.tabBarDesktopStyle || 'default';
  // Read by the .tab:hover rules in <style> — 'ranked' mode's hovered tab
  // must NOT jump to a blanket top z-index the way 'hover' mode's does: a
  // fixed order is the whole point of 'ranked' (see tabImportanceRank()),
  // and blanket-topping a hovered tab let it leap above tabs it doesn't
  // normally beat, hiding a *third*, unrelated tab sandwiched behind it
  // that was visible a moment before — exactly the "small tag gets lost"
  // bug the project owner hit. 'ranked' mode reveals a hovered tab by
  // moving its covering neighbor away (computeOverlapPush() in
  // 06-tabs-render.js) instead, so it never needs to reorder at all.
  document.body.dataset.overlapStackMode = d.overlapStackMode || 'hover';
  // Read by the .sidetabspeek/[data-tabbar-desktop="sidetabs"] rules in
  // <style>, and by resolveSidetabShape() in 06-tabs-render.js for the
  // 'random'/'iconstyle' cases.
  document.body.dataset.sidetabsAppearance = d.sidetabsAppearance || 'color';
  document.body.dataset.sidetabsShape = d.sidetabsShape || 'pagetab';
  // Not gated by mobileui-active (see the comment on fieldPickerStyle in
  // defaultDevSettings()) — read directly by fieldPickerHtml() in
  // 08-render-core.js as plain state, and by <style> for the atmax pulse.
  document.body.dataset.fieldpickerStyle = d.fieldPickerStyle || 'default';
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
// rather than only a body class so JS that has to branch on markup can
// ask the same question CSS is asking via body.mobileui-active.
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

async function setDevDesktopZoom(val){
  pushUndo(`Changed dev desktop zoom to "${val}%"`);
  state.devSettings.desktopZoom = val;
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

// Unlike most setDev* setters, this one used to skip applyDevSettings()
// (calling only render()) — a real bug, not just an oversight: 'ranked'
// mode's hover behavior is driven by the [data-overlap-stack-mode]
// attribute applyDevSettings() writes to <body> (see its own comment),
// so picking 'ranked' here without that call left hover still behaving
// like 'hover' mode even though the resting stack order (computed fresh
// inside renderTabs() on every render(), no stale attribute involved)
// had already switched — exactly the kind of "changed one thing, nothing
// happened" the project owner reported. Fixed by adding the same
// applyDevSettings() call every other setDev* setter already makes.
async function setDevOverlapStackMode(val){
  pushUndo(`Changed dev overlap tab stacking order to "${val}"`);
  state.devSettings.overlapStackMode = val;
  applyDevSettings();
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
async function setDevTaskDetailActionsPosition(val){
  pushUndo(`Changed dev task detail actions position to "${val}"`);
  state.devSettings.taskDetailActionsPosition = val;
  applyDevSettings();
  render();
  queueSave();
}

async function setDevQuickAddBarStyle(val){
  pushUndo(`Changed dev quick-add bar style to "${val}"`);
  state.devSettings.quickAddBarStyle = val;
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
  // See copyDevSettingsToClipboard()/devSettingsDiffFromDefault() below —
  // one line, only the settings that actually differ from default, so
  // this is quick to paste into a message rather than a wall of text.
  const copyDevSettingsHtml = `
    <button type="button" class="devsettingscopybtn" onclick="copyDevSettingsToClipboard(this)">Copy Selected Dev Settings</button>`;

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
      ['topleft','Top-left corner, under the Back tag'],
      ['headerline','Resting on the title\'s own underline']
    ], 'setDevTaskDetailActionsPosition')}
  `;

  const desktopBody = `
    ${devSectionHeadHtml('Display')}
    ${devField('<span title="Reproduces real browser zoom (CSS zoom on #appShell) rather than a font-size or transform trick — see applyDevSettings()\'s own comment in 01-categories-theme.js for why those two would scale unevenly here.">★ Desktop zoom</span>', dev.desktopZoom, [
      ['100','100% (default)'],
      ['110','110%'],
      ['115','115%'],
      ['125','125%'],
      ['135','135%'],
      ['150','150%']
    ], 'setDevDesktopZoom')}
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
      Overlap tabs: show open-count/urgent-"!" as a small flag peeking out from behind each tab, instead of an inline dot &amp; number (a tab with nothing open shows neither)
    </label>
    <!-- Was two separate controls (a hover-mode dropdown + an
         independent stagger checkbox) — merged per the project owner's
         own callout that they only did anything meaningful together:
         "ranked" without stagger left the fixed order invisible at rest,
         and stagger without "ranked" just staggered by plain tab
         position. See defaultDevSettings()'s own comment in
         02-storage-state.js for the full reasoning. -->
    ${devField('Overlap tabs: stacking order', dev.overlapStackMode, [
      ['hover','Hover lifts a tab to the front (default) — tabs otherwise stay in your own tab order'],
      ['ranked','Busiest/urgent tabs stay pinned on top and peek out further at rest — order never changes on hover']
    ], 'setDevOverlapStackMode')}
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
      ['pagetab','Diamond point (default)'],
      ['invertedv','Inverted V'],
      ['arrows','Arrows out'],
      ['jagged','Jagged edge'],
      ['sawtooth','Clean sawtooth'],
      ['swallowtail','Bookmark fork'],
      ['scallop','Rounded bump'],
      ['chevron','Slanted cut'],
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
    <!-- Was two separate controls (trigger position + what tapping it
         opened, independently selectable) — merged into one after it
         turned out the two only ever made sense picked together: 'top'
         paired with expand-in-place, 'bottom' paired with a bottom sheet.
         See the quickAddBarStyle comment in defaultDevSettings(),
         02-storage-state.js. -->
    ${devField('Quick-add bar', dev.quickAddBarStyle||'top', [
      ['top','Default — "+ Add Task" at the top of the page, expands in place'],
      ['bottom','Bottom of the screen — "+ Add Task" opens a bottom sheet']
    ], 'setDevQuickAddBarStyle')}

    ${devSectionHeadHtml('Tab Bar')}
    ${devField('Tab bar style', dev.tabBarMobileStyle, [
      ['default','Default (wraps to a 2nd row)'],
      ['scroll','Scrolls sideways, one row']
    ], 'setDevTabBarMobileStyle')}
    <div class="devgroupnote">See also Tab Bar under Desktop — this is the same underlying choice, answered separately per viewport.</div>
    <label class="${rowClass}">
      <input type="checkbox" ${dev.mobileColoredTabs?'checked':''} onchange="toggleDevSetting('mobileColoredTabs', this.checked)">
      ★ Colored Tabs: fill each tab with its own category color, like a colored desktop tab, instead of mobile's plain translucent look. Independent of the tab bar style above — wrap/scroll is a separate choice from plain/colored.
    </label>
    <label class="${rowClass}">
      <input type="checkbox" ${dev.stackedTabsEnabled?'checked':''} onchange="toggleDevSetting('stackedTabsEnabled', this.checked)">
      ★ Stacked Tabs: collapse every unpinned category of the same type (standard/checklist/etc.) into one shared tab — tap goes to whichever is on top, long-press picks a different one. Pin a category in the list above to always give it its own tab instead. Works alongside the tab bar style above, not instead of it.
    </label>

    ${devSectionHeadHtml('Rows')}
    <label class="${rowClass}">
      <input type="checkbox" ${dev.swipeActionsEnabled?'checked':''} onchange="toggleDevSetting('swipeActionsEnabled', this.checked)">
      ★ Swipe Actions: dragging a task or checklist row left, in its own category's list, reveals quick actions (flag/pin/share for a task; share/delete for a checklist) — same idea as swipe-to-archive in a mail app. Not yet wired up for a task's own steps or a checklist's own items.
    </label>
  `;

  return `
    ${devModeToggleHtml}
    ${sidePanelToggleHtml}
    ${copyDevSettingsHtml}
    ${devGroupHtml('dev-general', 'General', generalBody)}
    ${devGroupHtml('dev-desktop', 'Desktop', desktopBody)}
    ${devGroupHtml('dev-mobile', 'Mobile', mobileBody)}
  `;
}

// ---------- "Copy Selected Dev Settings" (copyDevSettingsHtml above) ----------
// The project owner's own ask: a quick way to hand over exactly which
// dev settings are active without pasting a wall of text, so a fresh
// conversation (or a later message in this one) knows what's actually
// being tested without asking. Diffs the live state.devSettings against
// defaultDevSettings() rather than listing every key — most of the
// ~20-odd settings sit at their default for any given account at any
// given time, and the ones that don't are the only ones actually worth
// reporting; a full dump of all of them would be exactly the "huge wall
// of text" this was asked to avoid. Reading the key list generically off
// defaultDevSettings() (rather than a separate hand-maintained list of
// "settings worth exporting") is also what keeps this needing zero
// upkeep when a new dev setting is added later — it's covered
// automatically the moment it exists, nothing to remember to update here.
// developmentMode is the one deliberate exclusion: it's always true the
// moment this button is even visible to click, so including it would
// just be a fixed "developmentMode=true" on every single export, adding
// no actual information.
const DEV_SETTINGS_EXPORT_EXCLUDE = new Set(['developmentMode']);
function devSettingsDiffFromDefault(){
  const dev = state.devSettings || {};
  const defaults = defaultDevSettings();
  return Object.keys(defaults)
    .filter(k => !DEV_SETTINGS_EXPORT_EXCLUDE.has(k) && dev[k] !== undefined && dev[k] !== defaults[k])
    .map(k => `${k}=${dev[k]}`);
}
// One line, always — a short "Copied!"/"Copy failed" swap on the button
// itself is the only feedback (reverted after a beat, same one-shot
// timeout idiom as flashQuickCategoryInvalid(), 16-task-crud.js), rather
// than a toast or modal that would be overkill for a plain clipboard copy.
async function copyDevSettingsToClipboard(btn){
  const diffs = devSettingsDiffFromDefault();
  const text = 'Dev Settings: ' + (diffs.length ? diffs.join(', ') : '(all defaults)');
  const original = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Copied!';
  } catch(e){
    btn.textContent = 'Copy failed';
  }
  setTimeout(() => { btn.textContent = original; }, 1500);
}

// ---------- Dev Mode page breadcrumb (#devBreadcrumb, shell-body.html) ----------
// The project owner's own ask: a short, stable name for whatever's on
// screen right now, so a chat message can say "I'm looking at X" instead
// of a screenshot every time — this is exactly what came up mid-session
// once already (a task detail page opened from two different places,
// Daily and everywhere else, with no quick way to say which one a given
// screenshot was). Deliberately never prints a category's own display
// label (cat.label) — that's arbitrary per-account text the project
// owner typed in, not something with any fixed meaning here — activeTab
// itself is the stable id CATEGORIES is keyed by internally regardless
// of what the label currently says, so that's what shows in [brackets]
// instead. Kept to short, code-shaped tokens (colon/arrow-separated, no
// prose) per the explicit "don't make the text too long" ask — this is
// meant to be pasted inline at the top of a message, not read as a
// sentence. "←" marks a genuine drilldown's own origin (a stacked page
// backing to somewhere specific — matches the same state each real
// closeX() function already reads to decide where to go, e.g.
// dayReturnToCalendar/checklistReturnDay), not a peer view like Daily's
// own Calendar (see the Daily/Calendar note in CLAUDE.md) — those get no
// arrow since neither reads as "stacked on top of" the other.
function currentPageBreadcrumb(){
  if(genericTaskDetailId){
    const origin = activeTab === 'daily' ? 'Daily' : activeTab === 'all' ? 'All' : `Cat[${activeTab}]`;
    return `TaskDetail ← ${origin}`;
  }
  if(sharedItemsOpen) return 'SharedItems';
  if(settingsOpen) return 'Settings';
  if(claudeView) return 'ClaudeView ← Settings';
  if(activeTab === 'daily'){
    if(dailyCalendarOpen) return 'Daily:Calendar';
    if(selectedDay) return dayReturnToCalendar ? 'Daily:DayDetail ← Calendar' : 'Daily:DayDetail';
    return 'Daily:List';
  }
  if(isChecklistCategory(activeTab)){
    if(checklistPendingOpen) return `Checklist:Pending[${activeTab}]`;
    if(checklistTemplatesOpen) return `Checklist:Templates[${activeTab}]`;
    if(selectedListId) return checklistReturnDay ? `Checklist:Detail[${activeTab}] ← Daily` : `Checklist:Detail[${activeTab}]`;
    return `Checklist:Overview[${activeTab}]`;
  }
  return activeTab === 'all' ? 'All' : `Category[${activeTab}]`;
}
// Called from render() itself (same tier as renderDevPanel() — always
// kept in sync, not something each view has to remember to update on
// its own). Hidden entirely outside Dev Mode, same gate every other dev-
// only affordance in this app uses.
function renderDevBreadcrumb(){
  const el = document.getElementById('devBreadcrumb');
  if(!el) return;
  const on = !!(state.devSettings && state.devSettings.developmentMode);
  el.style.display = on ? '' : 'none';
  if(on) el.textContent = currentPageBreadcrumb();
}
// "Page: " prefix on the copied text only (not the on-screen label) —
// clear at a glance once pasted into a chat message, same reasoning
// copyDevSettingsToClipboard()'s own "Dev Settings: " prefix has.
// Recomputes fresh rather than reading el.textContent, so a rapid
// double-click can't ever copy an in-flight "Copied!"/"Copy failed"
// label instead of the real breadcrumb.
async function copyDevBreadcrumb(el){
  const text = 'Page: ' + currentPageBreadcrumb();
  const original = el.textContent;
  try {
    await navigator.clipboard.writeText(text);
    el.textContent = 'Copied!';
  } catch(e){
    el.textContent = 'Copy failed';
  }
  setTimeout(() => { el.textContent = original; }, 1200);
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
  if(oc.includes('openGenericTaskDetail(')) return 'renderTaskDetailPage()';
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
  { sel: '.movenext' },
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


