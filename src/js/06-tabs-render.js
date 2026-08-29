function visibleTabs(){
  return tabOrder().filter(key => key==='all' || key==='daily' || !state.locationEnabled || CATEGORIES[key].locations.includes(state.location));
}

function currentLocation(){
  return state.locations.find(l=>l.id===state.location) || state.locations[0];
}

// Known tabs get a hand-picked line; a custom or renamed tab falls back to
// a stable pick from GENERIC_TAGLINES, keyed off the tab id via hashStr so
// it doesn't change on every render — a real random pick would flicker
// distractingly since this repaints on every render(), not just tab
// switches.
const TAB_TAGLINES = {
  all: 'Every open thread, one place.',
  work: 'Steady work, steady progress.',
  household: 'A well-kept home, one task at a time.',
  personal: "Make time for what's yours.",
  daily: "Today's page, one line at a time."
};
const GENERIC_TAGLINES = [
  'One task at a time.',
  'Small steps, steadily kept.',
  'Clear the page, clear the mind.',
  'Progress worth logging.',
  'Every entry counts.'
];
function hashStr(s){
  let h = 0;
  for(let i=0; i<s.length; i++) h = (h*31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function taglineFor(tabId){
  return TAB_TAGLINES[tabId] || GENERIC_TAGLINES[hashStr(tabId) % GENERIC_TAGLINES.length];
}

function renderLocBadge(){
  const badge = document.getElementById('locBadge');
  badge.style.display = state.locationEnabled ? '' : 'none';
  if(state.locationEnabled) badge.textContent = currentLocation().label;
  // The subheader used to list which tabs the current location was
  // hiding — that read as a warning rather than something useful, and
  // didn't apply when locations were off at all. A tagline is useful
  // (or at least pleasant) regardless of the location feature's state.
  document.getElementById('statusLine').textContent = taglineFor(activeTab);
}

// A checklist tab's count is pending *items* across all its lists, not a
// count of not-done lists — "how much is still left to get" is the more
// useful number for that kind of tab. "All" excludes checklist-owned
// tasks entirely, matching what renderList() actually shows there.
function tabOpenCount(key){
  if(key==='daily'){
    const s = dayItemsSummary(todayStr());
    return s.total - s.done;
  }
  if(key==='all'){
    return state.tasks.filter(t=>{
      if(t.status==='done') return false;
      const cat = CATEGORIES[t.category];
      return !cat || cat.type !== 'checklist';
    }).length;
  }
  if(isChecklistCategory(key)){
    // checklistPendingItems() (13-checklist.js) is the canonical "how many
    // items in this list still count as pending" answer — it already
    // knows a list marked done retires ALL its items from pending
    // regardless of their own individual done flags (see its own comment).
    // This used to re-count !s.done items directly instead, which ignored
    // the list's own status entirely: completing a whole checklist left
    // its still-unchecked items counting toward this tab's badge forever.
    return state.tasks.filter(t=>t.category===key).reduce((sum,t)=>sum+checklistPendingItems(t).length, 0);
  }
  return state.tasks.filter(t => t.category===key && t.status!=='done').length;
}

// Feeds both the overlapSubtags "!" badge and (via tabImportanceRank())
// overlapHoverMode's "fixed order" ranking — a category counts as urgent
// if it has any not-done task that's overdue or High priority. A
// checklist tab has no such fields on its own "tasks" (a checklist's
// task is a whole list — see isChecklistCategory()), so it's never urgent
// by this measure; 'all'/'daily' aren't a single category either and are
// excluded the same way.
function tabHasUrgentTask(key){
  if(key==='all' || key==='daily' || isChecklistCategory(key)) return false;
  return state.tasks.some(t => t.category===key && t.status!=='done' && (isOverdue(t) || t.priority===3));
}

// overlapHoverMode's 'push' variant (see devSettingsFieldsHtml() in
// 01-categories-theme.js) replaces position-based stacking (later tab
// always on top, see --tabidx below) with a FIXED order by how much is
// going on in each category — open task count, with any urgent (overdue/
// High priority) task counting for a lot more than sheer volume — so the
// same tab is always on top no matter which one you last hovered. Ties
// (most commonly every tab tied at zero) fall back to the original
// position, both so the result is deterministic and so an all-empty
// board still fans out sensibly. Returns a key->rank map, 1 = bottom of
// the stack, length(keys) = top.
function tabImportanceRank(keys){
  const scored = keys.map((k, idx) => ({
    k, idx,
    score: tabOpenCount(k) + (tabHasUrgentTask(k) ? 1000 : 0)
  }));
  scored.sort((a,b) => a.score - b.score || a.idx - b.idx);
  const rank = {};
  scored.forEach((item, i) => { rank[item.k] = i + 1; });
  return rank;
}

// overlapSubtags (see devSettingsFieldsHtml()) trades a tab's own inline
// dot+count for a small flag-shaped tag peeking out from behind it — the
// category's own icon glyph plus its open count, plus a "!" when
// tabHasUrgentTask() is true — so it only ever appears when there's
// actually something to say, unlike the always-on inline count it
// replaces (which shows "0" just as prominently as anything else).
// Skipped entirely for a tab with nothing open, and for 'all'/'daily' (no
// single category icon to show). The markup here is just content — its
// pennant shape, "behind the tab" z-index trick, and position all live in
// the .tabsubtag rules in <style>.
function tabSubtagHtml(key, openCount){
  if(key==='all' || key==='daily' || openCount<=0) return '';
  const cat = CATEGORIES[key];
  if(!cat) return '';
  const icon = categoryDotHtml(cat, 'dot');
  // Two independent flags, not one flag with the "!" tucked into a
  // corner of it — the project owner asked for the urgent marker to be
  // its own separate tag, sitting further out at the tab's left edge
  // than the count flag (which stays put where it's always been — see
  // the .tabsubtag/.tabsubtag-urgent rules in <style> for the actual
  // positions). tabHasUrgentTask() can only be true alongside openCount>0
  // (an overdue/High task is itself still open), so no separate guard is
  // needed for it here.
  const countFlag = `<div class="tabsubtag tabsubtag-count">${icon}<span class="tabsubtag-num">${openCount}</span></div>`;
  const urgentFlag = tabHasUrgentTask(key) ? `<div class="tabsubtag tabsubtag-urgent">!</div>` : '';
  return countFlag + urgentFlag;
}

function renderTabs(){
  const wrap = document.getElementById('tabs');
  const keys = visibleTabs();
  const dev = state.devSettings || {};
  // tabBarDesktopStyle is a desktop-only look (see the body:not(.mobileui-
  // active)[data-tabbar-desktop=…] selectors in <style>) — mirrored here
  // so subtagsOn/pushMode never touch the markup on a phone-ish viewport,
  // where the matching CSS wouldn't be applied to make sense of it either
  // (a shown dot/count is better than an unstyled orphan badge).
  const overlapStyle = dev.tabBarDesktopStyle === 'overlap' && !mobileUiActive();
  const subtagsOn = overlapStyle && !!dev.overlapSubtags;
  const pushMode = overlapStyle && dev.overlapHoverMode === 'push';
  const staggerOn = overlapStyle && !!dev.overlapRankStagger;
  const importanceRank = pushMode ? tabImportanceRank(keys) : null;
  wrap.innerHTML = keys.map((key, idx)=>{
    const openCount = tabOpenCount(key);
    const dot = (subtagsOn || key==='all' || key==='daily') ? '' : categoryDotHtml(CATEGORIES[key], 'dot');
    const label = key==='all' ? 'All' : key==='daily' ? 'Daily' : CATEGORIES[key].label;
    const countHtml = subtagsOn ? '' : `<span class="count">${openCount}</span>`;
    const subtagHtml = subtagsOn ? tabSubtagHtml(key, openCount) : '';
    // --tabhex/--tabtext/--tabedge are only ever read by the EXPERIMENTAL
    // tabBarDesktopStyle "indextabs"/"overlap" looks (see the
    // body:not(.mobileui-active)[data-tabbar-desktop=…] rules in <style>)
    // — harmless to always set, same reasoning as --page-transform
    // elsewhere. --tabtext picks readable text (dark ink vs. cream,
    // reusing the same relLuminance() call the theme itself uses to
    // derive --ink from --paper) since a category's own hex runs the
    // full range from pale gold to near-black; --tabedge is that hex
    // darkened via shadeHex() for "overlap"'s accent border, the same
    // multiplicative-darken helper --desk-dark is built from. 'all'/
    // 'daily' have no category color of their own, so they get none of
    // these three and fall back to <style>'s var(--primary)-based
    // defaults instead. --tabidx (1-based) is "overlap"'s default
    // stacking order — later tabs sit on top of earlier ones until
    // hovered, like a fanned-out stack of index cards — UNLESS
    // overlapHoverMode's 'push' variant is on, in which case it's instead
    // a fixed rank by tabImportanceRank() so the stacking order holds
    // still regardless of hover (see computeOverlapPush() below). --tab-
    // jitter is a small per-tab pseudo-random resting-height offset
    // (hashStr()'d off the tab's own id so it's stable across renders,
    // not truly random — see the .tab transform rules in <style>), there
    // purely so a row of same-height pills reads a little more like a
    // hand-fanned stack of index cards and a little less like a UI
    // component; onmouseenter/leave are only wired up in push mode — the
    // default look still does its lift/reorder in pure CSS via :hover.
    const cat = (key!=='all' && key!=='daily') ? CATEGORIES[key] : null;
    const tabidx = importanceRank ? importanceRank[key] : idx+1;
    const jitter = tabJitterPx(key);
    // --tab-angle is only ever read by .tab.active's own transform (see
    // <style>) — a small stable per-category tilt (same hashStr() idiom as
    // --tab-jitter) so the selected tab reads as a real dog-eared page
    // tucked in slightly crooked, rather than a perfectly square chip.
    // Harmless to set on every tab, same reasoning as --tabidx elsewhere.
    const angle = tabAngleDeg(key);
    // overlapRankStagger (see devSettingsFieldsHtml()): a tab further back
    // in the stack (lower tabidx, whether that's ranked by position or by
    // importance) sits a little higher at rest — proportional to how far
    // back it is, capped at OVERLAP_STAGGER_MAX — so its own label has a
    // better chance of peeking above whichever tab is currently covering
    // it, instead of a covered tab being unreadable until you interact
    // with it. 0 (no offset) for the frontmost tab either way.
    const stagger = staggerOn ? -((keys.length - tabidx) / Math.max(1, keys.length - 1)) * OVERLAP_STAGGER_MAX : 0;
    const hexStyle = cat
      ? ` style="--tabhex:${cat.hex};--tabtext:${relLuminance(cat.hex) > 0.5 ? '#2A2318' : '#F1EAD9'};--tabedge:${shadeHex(cat.hex, -0.25)};--tabidx:${tabidx};--tab-jitter:${jitter}px;--tab-angle:${angle}deg;--tab-stagger:${stagger}px"`
      : ` style="--tabidx:${tabidx};--tab-jitter:${jitter}px;--tab-angle:${angle}deg;--tab-stagger:${stagger}px"`;
    const hoverAttrs = pushMode ? ` onmouseenter="overlapTabHoverStart(${idx})" onmouseleave="overlapTabHoverEnd(${idx})"` : '';
    // Re-clicking the tab you're already on is a genuine no-op everywhere
    // else (switchTab() still runs, mainly to close whatever overlay
    // might be open) — but in overlap style it rebuilds every .tab
    // element from scratch, and re-running solveGapOverlaps()/
    // computeOverlapPush() against fresh DOM occasionally lands a hair's
    // width off the previous pass (sub-pixel measurement noise), which
    // the transform transition then visibly animates through as a small
    // unwanted "pulse" on the neighbors. Overlap style's active tab
    // (and its #tabConnector clone, which copies this same markup) skips
    // the onclick entirely instead of trying to chase that noise down —
    // there's nothing else it needs a click for either, per the same
    // reasoning :hover was already turned off for it.
    // The "Daily" tab jumps straight to today (goToDailyToday(), see
    // 11-daily-core.js) instead of the plain switchTab() every other tab
    // uses — per the project owner's ask, tapping it should always mean
    // "go to today," not "go to wherever Daily was last left."
    const tabAction = key === 'daily' ? 'goToDailyToday()' : `switchTab('${key}')`;
    const clickAttr = (overlapStyle && activeTab===key) ? '' : ` onclick="${tabAction}"`;
    return `<button class="tab ${activeTab===key?'active':''}" data-key="${key}"${hexStyle}${hoverAttrs}${clickAttr}>${dot}<span class="tablabel">${label}</span> ${countHtml}${subtagHtml}</button>`;
  }).join('');
  renderTabRowLines();
  updateTabScrollFade();
  layoutOverlapTabs();
  layoutSidetabsPeek();
}

// ---------- tabBarDesktopStyle "sidetabs": peeking index-tab column ----------
// Called at the end of renderTabs() (mirrors layoutOverlapTabs() just
// above) — a no-op for every other tabBarDesktopStyle, on the Mobile UI Lab
// viewport (neither applies), and for the 'classic'/'classicband'
// appearances, which are the ORIGINAL sidetabs layout (a plain column of
// full-width tabs in normal flex flow beside .leathercover — see the
// body:not(.mobileui-active)[data-tabbar-desktop="sidetabs"][data-
// sidetabs-appearance="classic"] rules in <style>) and never use this
// peeking mechanism at all.
// The clones below DO need one real measurement per tab now (unlike an
// earlier fixed-width pass): a category name has to actually be readable
// once poking out from behind the page, so each tab's own visible "poke"
// width is sized to its own label instead of one guessed constant for
// every tab. Only the TUCK (how far past #appCard's edge it reaches, see
// SIDETAB_TUCK/SIDETAB_TUCK_ACTIVE) stays fixed — see the width/marginLeft
// math below.
const SIDETAB_TUCK = 12;         // px past #appCard's edge every resting tab tucks
const SIDETAB_TUCK_ACTIVE = 18;  // the active tab gets to tuck a bit deeper — its
                                  // own mask-image fade (.tab.active in <style>) is
                                  // what makes that safe to do without it reading
                                  // as covering page content
const SIDETAB_MIN_POKE = 58;     // floor so a short label ("ALL") doesn't shrink
                                  // the tab down to an unreadably small nub
const SIDETAB_MAX_POKE = 112;    // ceiling on how wide a single-line label can push
                                  // a tab — past this it wraps to a second line
                                  // instead (see .two-line in <style>), and past
                                  // that it ellipsizes rather than growing forever
const SIDETAB_HEIGHT_2LINE = 60; // vs. the base 44px — see .sidetabspeek .tab.two-line
// How many px of EXTRA left padding each shape needs — see the comment in
// layoutSidetabsPeek() below on why: clip-path polygon points outside an
// element's own 0..width box (this Browser environment's own limitation,
// confirmed by testing a plain isolated div — a mainstream desktop browser
// renders these fine, but this one silently drops the point and leaves the
// edge flat) don't paint. Every OUTWARD-pointing shape here places its
// point at a NEGATIVE x offset (protruding left past the tab's own edge),
// which never rendered until padded/shifted in-bounds like this. invertedv
// is the different case — a genuine concave notch (a bookmark's own V-cut
// ribbon tail is the mental model, per the project owner) cutting INWARD
// rather than protruding — but it still gets a few px of extra room here:
// "the label should come further out when using this setting" was the
// project owner's own preferred fix once the notch needed to be deep
// enough for a properly wide, same-angle gilded border (see that shape's
// own rule in <style>) rather than the too-thin, mismatched-angle version
// a first pass at this shipped with.
// Padding the box by the same amount the point(s) protrude and shifting
// the whole polygon over by that amount keeps every vertex non-negative
// while the tab's own on-screen position (and thus how far it visually
// pokes out) stays exactly the same — see the .sidetabspeek
// .tab[data-shape="…"] rules in <style> for the actual shifted polygons.
const SIDETAB_SHAPE_EXTRA = { pagetab:14, arrows:20, invertedv:6, sawtooth:7, jagged:13, flat:0 };
function layoutSidetabsPeek(){
  const peek = document.getElementById('sidetabsPeek');
  if(!peek) return;
  const dev = state.devSettings || {};
  const appearance = dev.sidetabsAppearance || 'color';
  const isClassicLayout = appearance === 'classic' || appearance === 'classicband';
  if(mobileUiActive() || dev.tabBarDesktopStyle !== 'sidetabs' || isClassicLayout){
    peek.innerHTML = '';
    return;
  }
  const wrap = document.getElementById('tabs');
  if(!wrap) return;
  const shapeSetting = dev.sidetabsShape || 'pagetab';
  peek.innerHTML = '';
  Array.from(wrap.querySelectorAll('.tab')).forEach(t=>{
    const clone = t.cloneNode(true);
    // Set directly on every clone (not just for 'random'/'iconstyle')
    // rather than leaving <style> to key shape off the dev-setting value
    // on body — keeps the CSS down to one selector shape (.tab[data-
    // shape="…"]) instead of two parallel ones for "fixed" vs "resolved
    // per tab" cases.
    const shape = resolveSidetabShape(t.dataset.key, shapeSetting);
    clone.dataset.shape = shape;
    clone.style.pointerEvents = 'auto';
    // Measure this clone's own natural (unwrapped) content width before
    // pinning it to a fixed px width below — max-content plus nowrap on
    // the label makes getBoundingClientRect() report how wide it actually
    // wants to be, independent of whatever the shared .sidetabspeek .tab
    // rule's own width:84px fallback says.
    clone.style.width = 'max-content';
    const label = clone.querySelector('.tablabel');
    if(label) label.style.whiteSpace = 'nowrap';
    peek.appendChild(clone);
    // Must happen after appending (needs a real computed style to add to)
    // and before measuring below, so the extra room is baked into the
    // natural-width measurement instead of tacked on after — see
    // SIDETAB_SHAPE_EXTRA above.
    const extra = SIDETAB_SHAPE_EXTRA[shape] || 0;
    if(extra){
      const basePad = parseFloat(getComputedStyle(clone).paddingLeft) || 0;
      clone.style.paddingLeft = (basePad + extra) + 'px';
    }
    const natural = clone.getBoundingClientRect().width;
    // Past SIDETAB_MAX_POKE, stop growing the tab for a long label and
    // wrap it onto a second line instead (.two-line — see <style> for the
    // -webkit-line-clamp:2 that does the actual wrapping/measuring). A
    // label that's STILL too long even wrapped to two lines (one
    // pathologically long word, in practice) gets ellipsized by that same
    // line-clamp rather than a third case to handle here.
    const poke = Math.min(SIDETAB_MAX_POKE, Math.max(SIDETAB_MIN_POKE, natural));
    const twoLine = natural > SIDETAB_MAX_POKE;
    if(twoLine){
      clone.classList.add('two-line');
      clone.style.height = SIDETAB_HEIGHT_2LINE + 'px';
      if(label) label.style.whiteSpace = '';
    }
    const tuck = clone.classList.contains('active') ? SIDETAB_TUCK_ACTIVE : SIDETAB_TUCK;
    clone.style.width = (poke + tuck) + 'px';
    clone.style.marginLeft = -poke + 'px';
  });
}

// Shapes eligible for 'random'/'iconstyle' — jagged is deliberately
// excluded from both (per the project owner's own callout: it's the one
// "crazy" shape, not meant to show up unpredictably or get assigned to a
// category that never asked for it).
const SIDETAB_SHAPES_PICKABLE = ['pagetab', 'invertedv', 'arrows', 'sawtooth'];
// 'iconstyle' maps each category's own chosen icon glyph (CATEGORY_ICON_
// GLYPHS, 01-categories-theme.js — Settings lets a category pick one) to a
// shape that echoes it: a literal flag reads as a little pennant (pagetab,
// the same silhouette .pagetag uses elsewhere); sharp icons (star/diamond)
// get the sharp outward arrow; rounder/plainer ones split between the
// softer invertedv and the more geometric sawtooth. This is an editorial
// pairing, not a derived one — there's no principled way to compute it, so
// treat this table as the place to retune it if a specific pairing reads
// wrong once you see it.
const SIDETAB_ICON_SHAPE_MAP = {
  flag:'pagetab', dot:'pagetab',
  star:'arrows', diamond:'arrows',
  house:'invertedv', ring:'invertedv',
  square:'sawtooth', check:'sawtooth'
};
function resolveSidetabShape(key, setting){
  if(setting !== 'random' && setting !== 'iconstyle') return setting;
  if(setting === 'iconstyle'){
    const cat = (key!=='all' && key!=='daily') ? CATEGORIES[key] : null;
    const icon = cat ? (cat.icon || 'dot') : 'dot';
    return SIDETAB_ICON_SHAPE_MAP[icon] || 'pagetab';
  }
  // 'random', stable per tab — same hashStr()-off-the-tab's-own-key idiom
  // as tabJitterPx()/tabAngleDeg() above, so it doesn't reshuffle on every
  // unrelated render.
  return SIDETAB_SHAPES_PICKABLE[hashStr('sidetabshape:'+key) % SIDETAB_SHAPES_PICKABLE.length];
}

// The stable per-tab jitter overlapStyle's resting transform reads (see
// renderTabs() above and the .tab transform rules in <style>) — hashStr()
// off the tab's own id/key so it's the same on every render (no reshuffle
// mid-session) rather than a fresh Math.random() each time, which would
// make the row visibly shiver on every unrelated re-render.
const TAB_JITTER_RANGE = 3; // px each way
function tabJitterPx(key){
  return (hashStr('jitter:'+key) % (TAB_JITTER_RANGE*2+1)) - TAB_JITTER_RANGE;
}

// Same stable-hash idiom as tabJitterPx(), for .tab.active's small resting
// tilt (see the rotate() in that rule in <style>) — a distinct hash salt
// ('angle:' vs 'jitter:') so a tab's height jitter and its tilt-when-
// selected don't end up correlated just because they're hashed off the
// same id.
const TAB_ANGLE_RANGE = 2.5; // degrees each way
function tabAngleDeg(key){
  const steps = 20;
  const raw = (hashStr('angle:'+key) % (steps*2+1)) - steps;
  return (raw / steps) * TAB_ANGLE_RANGE;
}

// ---------- tabBarDesktopStyle "overlap": scrunch, wrap-avoidance, and
// the page-connect nudge ----------
// overlapNaturalRects caches each tab's own settled {left,width} (post
// scrunch, pre any hover/active push) so computeOverlapPush() below always
// has a stable, un-pushed baseline to push away from and clamp against —
// without it, a push computed on top of an already-pushed position would
// compound every time it's recalculated instead of resetting cleanly.
// overlapHoveredIdx tracks which tab (by index into visibleTabs(), the
// same order renderTabs() renders in) is currently under the pointer, so
// a stale overlapTabHoverEnd() from a tab that's since been re-rendered
// away can't clobber a newer hover.
let overlapNaturalRects = null;
let overlapHoveredIdx = null;
// Captured by captureOverlapTabFlip() (called from switchTab(), before it
// reassigns the activeTab global and re-renders) and consumed once by
// layoutOverlapTabs() right after it builds the new #tabConnector clone —
// see both for why a plain CSS transition never had a chance to animate
// this on its own: renderTabs() rebuilds every <button> from scratch on
// every render, and the visible "active" tab is actually a freshly
// re-cloned copy in #tabConnector each time too (see the .tabconnector
// comment in <style>), so neither the outgoing nor incoming element that's
// on screen ever survives from one render to the next for a transition to
// play across. This holds the two before/after screen rects a FLIP
// (First-Last-Invert-Play) needs to fake that continuity instead.
let overlapFlipPending = null;

// Shifts `el` to visually start at `fromRect` (a getBoundingClientRect()
// snapshot from just before el's current styling took effect) and lets it
// transition back to wherever it actually belongs, using .tab's own
// existing `transition: transform` (see <style>) rather than adding a
// second animation system. !important is required to outrank .tab.active's
// own !important transform rule — harmless on the resting-tab case below,
// which has no !important to begin with. Pure translate (no attempt to
// also fake the rotation/scale delta) is enough here: browsers interpolate
// a translate-only start against a rotated/matrix end by decomposing both
// into matrices, which reads as a smooth arc rather than a jump-cut, and
// keeping this to one transform function avoids composing it with
// whatever var()-driven transform the element's class already carries.
// The double rAF (not a synchronous forced-reflow-then-remove, which was
// tried first and silently never animated anything) is load-bearing: `el`
// is very often a brand-new node (the #tabConnector clone is rebuilt from
// scratch every render — see layoutOverlapTabs()) with no style change
// event in its history yet for a transition to key off, so even a forced
// layout read mid-task can't manufacture one — the browser needs an actual
// completed rendering update in between to register the start transform as
// a real "before" frame. One rAF alone can still land before that paint
// commits; two reliably lands after it.
function flipFromRect(el, fromRect){
  if(!el || !fromRect) return;
  const toRect = el.getBoundingClientRect();
  const dx = fromRect.left - toRect.left;
  const dy = fromRect.top - toRect.top;
  if(!dx && !dy) return;
  el.style.setProperty('transform', `translate(${dx}px, ${dy}px)`, 'important');
  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      el.style.removeProperty('transform');
    });
  });
}

// Called from switchTab() (08-render-core.js) before it changes activeTab
// or re-renders — the last moment the outgoing tab's on-screen stand-in
// (its #tabConnector clone, not the real element, which sits
// visibility:hidden while active) and the incoming tab's current resting-
// or-hovered position are both still on screen to measure.
function captureOverlapTabFlip(nextKey){
  const dev = state.devSettings || {};
  if(mobileUiActive() || dev.tabBarDesktopStyle !== 'overlap') return;
  if(nextKey === activeTab) return;
  const wrap = document.getElementById('tabs');
  if(!wrap) return;
  const nextEl = wrap.querySelector(`.tab[data-key="${nextKey}"]`);
  const connectorClone = document.querySelector('#tabConnector .tab');
  const prevEl = wrap.querySelector(`.tab[data-key="${activeTab}"]`);
  overlapFlipPending = {
    prevKey: activeTab,
    prevRect: (connectorClone || prevEl) ? (connectorClone || prevEl).getBoundingClientRect() : null,
    nextRect: nextEl ? nextEl.getBoundingClientRect() : null
  };
}
// One-line-vs-two-line sizing decisions, keyed by "tab key::label text" and
// persisted across renders (never reset — see layoutOverlapTabs()) rather
// than re-measured fresh every time. A borderline-length label like "House
// Upkeep" sits right at OVERLAP_MAX_LABEL_WIDTH's edge, and re-running the
// same shrink/wrap measurement on a freshly rebuilt element occasionally
// landed a sub-pixel's width on the other side of that edge than last
// time — not a real change, but enough to flip which font-size/wrap
// decision it got, which then visibly "pulsed" on screen even though
// nothing about that tab's content or its neighbors had changed. Caching
// the decision the first time makes it stable by construction: same key
// and label always gets the same answer, every render, forever (until the
// label itself changes, which changes the cache key).
let overlapSizeCache = {};

const OVERLAP_MAX_LABEL_WIDTH = 92;  // soft width budget tried before allowing a real 2nd line — kept
                                      // tight on purpose (a category name isn't a sentence) so one long
                                      // name wraps to 2 lines instead of ballooning into a tab twice
                                      // anyone else's width; see the .two-line lift in <style>.
const OVERLAP_MIN_FONT_PX = 8.5;     // floor for the "shrink to fit one line" attempt below that
const OVERLAP_BASE_OVERLAP = 16;     // default -margin-left between tabs, matches the old hardcoded value
const OVERLAP_REVEAL_COMFORT = 24;   // comfortable px of a tab's own width left peeking out at rest
const OVERLAP_REVEAL_HARD = 10;      // relaxed floor tried once comfort alone can't make everything fit
const OVERLAP_REVEAL_ABSOLUTE = 3;   // last-resort floor — "never fully hides a tab" loses to "must fit" past this
const OVERLAP_MIN_HPAD = 5;          // floor for the secondary lever (horizontal padding) below
const OVERLAP_MAX_PRESSURE = 400;    // solveGapOverlaps()'s search ceiling — plenty for any realistic tab count
const OVERLAP_PUSH1_SLACK = 6;       // px of deliberate residual overlap computeOverlapPush() leaves an
                                      // immediate neighbor with, rather than clearing it completely — lands
                                      // in the neighbor's own --tab-hpad padding, not its label text
const OVERLAP_PUSH2_FRACTION = 0.4;  // how much of a distance-2 tab's own edge gap it gets pushed by —
                                      // noticeably less than a distance-1 neighbor's push, per the ask
const OVERLAP_STAGGER_MAX = 6;       // overlapRankStagger's max lift for the very back-most tab — kept well
                                      // under .active's own dedicated lift (see the .tab.active rule in
                                      // <style>) so "selected always highest" still holds even stacked with
                                      // the worst-case jitter + two-line bonus a resting tab can also have.
const OVERLAP_CONNECT_MIN = 7;       // px the active tab's tail must overlap #appCard's top edge by, at minimum —
                                      // enough to read as "the page is open here," not a flap resting on top,
                                      // without the deeper 14-30px band this started at, which read as the
                                      // clone dipping distractingly far into the card
const OVERLAP_CONNECT_MAX = 16;      // ...and at most, so a 2-3 line label doesn't dip too far into the card

// Solves each gap's own overlap independently, capped by that ONE gap's
// two neighboring tab widths — not a single value derived from the
// narrowest tab anywhere in the row — so scrunching a wide tab further
// never comes at a narrow neighbor's expense. `floor` is how many px of a
// tab's own width must stay peeking out past its neighbor's overlap;
// layoutOverlapTabs() tries OVERLAP_REVEAL_COMFORT first and only relaxes
// it if that alone can't fit the row. Works by walking a single shared
// "pressure" up from the default spacing, capping each gap's actual
// overlap at min(pressure, the two neighbors' widths minus floor) — so
// pressure only ever *adds* overlap where a gap can actually afford it.
function solveGapOverlaps(widths, available, floor){
  const n = widths.length;
  const gaps = new Array(Math.max(0, n - 1)).fill(0);
  if(n <= 1) return { gaps, displayed: widths[0] || 0 };
  let displayed = widths.reduce((a,b)=>a+b, 0);
  for(let pressure = OVERLAP_BASE_OVERLAP; pressure <= OVERLAP_MAX_PRESSURE; pressure++){
    displayed = widths[0];
    for(let i = 1; i < n; i++){
      const cap = Math.max(0, Math.min(widths[i - 1], widths[i]) - floor);
      const g = Math.min(pressure, cap);
      gaps[i - 1] = g;
      displayed += widths[i] - g;
    }
    if(displayed <= available) break;
  }
  return { gaps, displayed };
}

// Called at the end of renderTabs() (and on resize, see 19-bootstrap.js) —
// a no-op for every tabBarDesktopStyle except "overlap", and for the
// Mobile UI Lab viewport where that style never applies anyway. Does four
// things, in order, each depending on the last: (1) tries to keep every
// label on one line, shrinking font-size before ever falling back to a
// real wrap; (2) figures out how much tabs need to overlap each other to
// all fit in the row without running past its right edge ("scrunch" per
// the project owner's report, rather than silently overflowing); (3)
// caches the resulting settled positions for computeOverlapPush() to push
// away from; (4) nudges the active tab vertically so its own tail always
// overlaps #appCard's top edge by a small, consistent amount regardless
// of how tall its label rendered — measured directly rather than assumed,
// since actual font metrics/line count aren't reliably knowable ahead of
// time (see the .tab.active transform rule in <style> for how the result,
// --tab-connect, gets used).
function layoutOverlapTabs(){
  overlapHoveredIdx = null;
  overlapNaturalRects = null;
  const dev = state.devSettings || {};
  const wrap = document.getElementById('tabs');
  if(!wrap) return;
  // #tabs and #tabConnector are both static elements (renderTabs() only
  // ever replaces #tabs' innerHTML, never #tabConnector's own — that's
  // solely this function's job) so an inline #tabs height, or a cloned
  // active tab left sitting in #tabConnector, from the one render overlap
  // style was on would otherwise persist as stale leftovers after
  // switching to any other tabBarDesktopStyle: none of which expect #tabs
  // to have an explicit height, or expect a ghost clone of whatever was
  // active back when overlap style was last on to still be floating over
  // #appCard.
  if(mobileUiActive() || dev.tabBarDesktopStyle !== 'overlap'){
    wrap.style.height = '';
    const connector = document.getElementById('tabConnector');
    if(connector) connector.innerHTML = '';
    return;
  }
  const tabs = Array.from(wrap.querySelectorAll('.tab'));
  if(!tabs.length) return;

  // Reset leftover inline sizing from a previous pass before measuring
  // fresh. renderTabs() rebuilds fresh <button> elements every render, so
  // in practice this only matters for a resize-triggered re-layout.
  tabs.forEach(t=>{
    t.style.fontSize = '';
    t.classList.remove('two-line');
    t.style.removeProperty('--tab-dx');
    t.style.removeProperty('--tab-connect');
    const label = t.querySelector('.tablabel');
    if(label){ label.style.whiteSpace = 'nowrap'; label.style.maxWidth = ''; }
  });

  // Every tab is at base font size, single-line, right after the reset
  // above and before anything below has a chance to shrink or wrap one of
  // them — the one moment they're all guaranteed to share the exact same
  // padding/line-height. Grabbed here (from whichever isn't .active, since
  // that one alone has a taller padding-bottom) rather than sampled from
  // whatever the *actual* tabs end up at post-shrink/wrap: sampling from
  // real tabs meant #tabs' own pinned height (step 1b below) came out too
  // short whenever a label needed heavy shrinking to fit, or too tall
  // whenever one wrapped — reported both ways, tabs sitting "too low" (a
  // 2-line label's second line clipped) and tabs "hovering" with a gap
  // above the card, depending on which tabs happened to be in the row.
  const restingProbe = tabs.find(t => !t.classList.contains('active')) || tabs[0];
  const referenceTabHeight = restingProbe.offsetHeight;

  // ---- 1. One line if at all possible ----
  const baseFontPx = parseFloat(getComputedStyle(tabs[0]).fontSize) || 11.2;
  tabs.forEach(t=>{
    const label = t.querySelector('.tablabel');
    // t.textContent, not just the label's — overlapSubtags toggling the
    // inline dot+count on/off, or the open count digit itself changing,
    // both affect t.scrollWidth (what actually decides shrink/wrap) just
    // as much as the label text does, and a key that missed either would
    // silently reuse a decision measured under different content.
    const cacheKey = (t.dataset.key || '') + '::' + t.textContent;
    const cached = overlapSizeCache[cacheKey];
    if(cached){
      t.style.fontSize = cached.fontPx + 'px';
      if(cached.twoLine && label){
        label.style.whiteSpace = 'normal';
        label.style.maxWidth = OVERLAP_MAX_LABEL_WIDTH + 'px';
        t.classList.add('two-line');
      }
      return;
    }
    let px = baseFontPx;
    while(t.scrollWidth > OVERLAP_MAX_LABEL_WIDTH && px > OVERLAP_MIN_FONT_PX){
      px -= 0.5;
      t.style.fontSize = px + 'px';
    }
    let twoLine = false;
    if(t.scrollWidth > OVERLAP_MAX_LABEL_WIDTH){
      // Shrinking alone couldn't fit it on one line — wrap instead, but
      // back at the BASE font size, not whatever floor the shrink attempt
      // above bottomed out at. A 2-line label reads properly sized at
      // normal font; leaving it at OVERLAP_MIN_FONT_PX just because THAT
      // was tried first made a wrapped tab like "House Upkeep" look
      // needlessly tiny even though it now has two full lines' worth of
      // room to say the same thing.
      px = baseFontPx;
      t.style.fontSize = px + 'px';
      if(label){
        const oneLineHeight = label.getBoundingClientRect().height;
        label.style.whiteSpace = 'normal';
        label.style.maxWidth = OVERLAP_MAX_LABEL_WIDTH + 'px';
        if(label.getBoundingClientRect().height > oneLineHeight * 1.4){
          twoLine = true;
          t.classList.add('two-line');
        } else {
          // Wrapping didn't actually trigger (measurement was conservative) —
          // no point paying for a wrap that didn't happen.
          label.style.whiteSpace = 'nowrap';
          label.style.maxWidth = '';
        }
      }
    }
    overlapSizeCache[cacheKey] = { fontPx: px, twoLine };
  });

  // ---- 1b. Pin #tabs' own height to referenceTabHeight (captured above,
  // before any tab could have shrunk or wrapped) regardless of what the
  // ACTUAL tabs in this row end up at — a flex container otherwise auto-
  // sizes to its tallest child, which would grow #tabs' own contribution
  // to the page's normal flow and, since #appCard's position is "wherever
  // #tabs' negative bottom margin lands," push #appCard down to match
  // (every *resting* tab's own vertical offset is fixed regardless of
  // #tabs' height, position:relative, not tied to the container's box —
  // so a taller #tabs without this pin left every resting tab with LESS
  // of its tail actually tucked behind the now-lower card, up to a
  // visible gap). Sampling the height from real (possibly shrunk or
  // wrapped) tabs instead of this fixed reference was its own bug in the
  // other direction: whichever tab happened to need the heaviest shrink
  // to fit made the sampled height too SHORT, pulling #appCard up and
  // clipping every other tab's text closer to the card than intended —
  // "House Upkeep getting cut off," tabs sitting "too low" in general. ----
  wrap.style.height = referenceTabHeight + 'px';

  // ---- 2. Scrunch to fit: solve for how much each individual GAP needs to
  // overlap to keep the row within its actual available width, instead of
  // letting it run past the right edge. This used to be one shared overlap
  // value applied to every gap alike, capped by the single narrowest tab
  // in the whole row — which meant a merely-smallish tab (Misc, Design)
  // got squeezed by the same aggressive amount needed to protect the
  // narrowest one (All), and once even that cap wasn't enough the leftover
  // overflow surfaced wherever it landed (the last tab, "Daily," peeking
  // past the edge). solveGapOverlaps() instead caps each gap by its own
  // two neighbors' widths, so scrunching a wide tab further never comes at
  // a narrow neighbor's expense elsewhere in the row. Horizontal padding
  // (--tab-hpad) is tried first as a cheaper, uniform lever; only once
  // that's exhausted does the reveal floor itself relax (comfort -> hard
  // -> absolute) — the project owner's explicit priority is "no tab may
  // run past the row's edge," which beats "every tab keeps a comfortable
  // 24px peeking out." ----
  const n = tabs.length;
  const available = wrap.clientWidth;
  let widths, hpad = 14;
  wrap.style.setProperty('--tab-hpad', hpad + 'px');
  let solved = { gaps: new Array(Math.max(0, n - 1)).fill(OVERLAP_BASE_OVERLAP), displayed: Infinity };
  for(let iter = 0; iter < 6; iter++){
    widths = tabs.map(t=>t.offsetWidth);
    solved = solveGapOverlaps(widths, available, OVERLAP_REVEAL_COMFORT);
    if(solved.displayed <= available || hpad <= OVERLAP_MIN_HPAD) break;
    hpad = Math.max(OVERLAP_MIN_HPAD, hpad - 2);
    wrap.style.setProperty('--tab-hpad', hpad + 'px');
  }
  if(solved.displayed > available) solved = solveGapOverlaps(widths, available, OVERLAP_REVEAL_HARD);
  if(solved.displayed > available) solved = solveGapOverlaps(widths, available, OVERLAP_REVEAL_ABSOLUTE);
  tabs.forEach((t, i)=>{
    t.style.marginLeft = i === 0 ? '0px' : (-solved.gaps[i - 1]) + 'px';
  });

  // ---- 3. Cache settled positions for computeOverlapPush() ----
  overlapNaturalRects = tabs.map(t=>({ left: t.offsetLeft, width: t.offsetWidth }));

  // Push mode: the selected tab permanently pushes its own neighbors
  // aside too, not just on hover (per the project owner's ask) — applied
  // here so it's redone on every render (a mutation, a category rename,
  // etc.) not just the next mouse move.
  const activeIdx = tabs.findIndex(t=>t.classList.contains('active'));
  if(dev.overlapHoverMode === 'push'){
    computeOverlapPush(activeIdx>=0 ? [activeIdx] : []);
  }

  // ---- 4. Connect the active tab to the page ----
  const card = document.getElementById('appCard');
  const connector = document.getElementById('tabConnector');
  if(connector) connector.innerHTML = '';
  if(activeIdx >= 0){
    const activeTabEl = tabs[activeIdx];
    activeTabEl.style.visibility = '';
    if(card){
      const cardRect = card.getBoundingClientRect();
      const tabRect = activeTabEl.getBoundingClientRect();
      let nudge = 0;
      if(tabRect.bottom < cardRect.top + OVERLAP_CONNECT_MIN) nudge = (cardRect.top + OVERLAP_CONNECT_MIN) - tabRect.bottom;
      else if(tabRect.bottom > cardRect.top + OVERLAP_CONNECT_MAX) nudge = (cardRect.top + OVERLAP_CONNECT_MAX) - tabRect.bottom;
      if(nudge) activeTabEl.style.setProperty('--tab-connect', nudge + 'px');
      // See the .tabconnector comment in <style> for *why* this clone
      // exists instead of trying (again) to make the real element itself
      // outrank #appCard: it structurally can't, because .tabs' own
      // stacking context traps it. This is the actual fix the project
      // owner asked for — "just make a copy of the selected tab and put
      // it on top" — not a decoy: cloneNode(true) copies every class,
      // inline style (--tabhex, the --tab-connect nudge just set above,
      // the rest), and child (label, count, subtag) the real one has, so
      // the exact same CSS rules (.tab, .tab.active, .tabsubtag, …)
      // render it identically — right down to the deep connect overlap
      // and the per-category tilt. Positioned via left/top computed from
      // the real tab's PRE-transform layout box (.tabs' own screen origin
      // + offsetLeft/Top, which unlike getBoundingClientRect() ignores
      // the CSS transform) — the clone then picks up that identical
      // transform itself (also copied) and lands in the exact same
      // on-screen spot the original would have painted in, had it been
      // able to. The original is hidden (visibility:hidden, not
      // display:none — it still needs to occupy its layout box for
      // push-mode math and its own :hover) so there's only ever one copy
      // actually visible at a time.
      if(connector){
        const tabsRect = wrap.getBoundingClientRect();
        const clone = activeTabEl.cloneNode(true);
        clone.style.position = 'absolute';
        clone.style.margin = '0';
        clone.style.left = (tabsRect.left + activeTabEl.offsetLeft - cardRect.left) + 'px';
        clone.style.top = (tabsRect.top + activeTabEl.offsetTop - cardRect.top) + 'px';
        clone.style.pointerEvents = 'auto';
        // --tab-hpad lives on #tabs itself (see step 2 above), not on any
        // individual .tab — inherited by the real tabs, but the clone is
        // about to move to a #appCard subtree that isn't a descendant of
        // #tabs at all, so it would otherwise fall back to the padding
        // rule's own 14px default regardless of how tight the actual
        // scrunch is, sizing the clone differently from the real tab it's
        // meant to be standing in for.
        clone.style.setProperty('--tab-hpad', getComputedStyle(wrap).getPropertyValue('--tab-hpad'));
        connector.appendChild(clone);
        activeTabEl.style.visibility = 'hidden';
        // Consume the FLIP captured by captureOverlapTabFlip() (see above),
        // if this render is the result of an actual tab switch: the new
        // clone glides in from wherever the tab was on screen before the
        // click (hover-lifted or resting) instead of popping straight into
        // its connected position, and the tab that was active a moment ago
        // (now a plain resting element in `tabs`) glides back down from
        // where its own clone used to be instead of popping to rest.
        if(overlapFlipPending){
          const flip = overlapFlipPending;
          overlapFlipPending = null;
          if(flip.nextRect) flipFromRect(clone, flip.nextRect);
          const settledEl = tabs.find(t => t.dataset.key === flip.prevKey);
          if(settledEl && flip.prevRect) flipFromRect(settledEl, flip.prevRect);
        }
      }
    }
  }
  overlapFlipPending = null;
}

// The exact overlap currently sitting between a source tab and ONE of its
// immediate neighbors, in overlapNaturalRects' un-pushed coordinate space
// — i.e. exactly how far the neighbor would need to move to clear the
// source's edge with nothing left over. Used by computeOverlapPush() so a
// pushed neighbor "scoots only till the edge of the selected tag" (the
// project owner's own words), never further, rather than a flat guessed
// distance that could either undershoot (leaving overlap behind) or
// overshoot (shoving it needlessly far, which is exactly what was
// compounding into neighbors two tabs away shoving each other closer
// together instead of apart — see the comment on computeOverlapPush()).
function overlapEdgeGap(sourceIdx, neighborIdx){
  const s = overlapNaturalRects[sourceIdx], t = overlapNaturalRects[neighborIdx];
  if(!s || !t) return 0;
  return neighborIdx < sourceIdx
    ? Math.max(0, (t.left + t.width) - s.left)
    : Math.max(0, (s.left + s.width) - t.left);
}

// overlapHoverMode's 'push' variant (see devSettingsFieldsHtml() in
// 01-categories-theme.js): rather than the default look's hover-lifts-
// above-everything trick, a hovered or selected tab instead shoves its
// immediate neighbor(s) sideways, away from it, revealing itself without
// needing to reorder the (now fixed, see tabImportanceRank()) stack.
// `sources` is the set of tab indices currently pushing (the active tab
// always, plus whichever tab is hovered) — each pushes only its own two
// immediate neighbors (not a wider fan-out — see overlapEdgeGap() above
// for why going further caused more harm than good), and results from
// multiple sources simply add together where they overlap (e.g. hovering
// a tab right next to the active one). Pushes are applied as a
// `transform: translateX()` (via --tab-dx, combined with the vertical
// lift/jitter transform — see the .tab rules in <style>) rather than by
// touching margins, so pushing tab N can never cascade into shifting
// every tab after it — each tab's own displacement is independent and
// computed from its ORIGINAL (overlapNaturalRects) position every time,
// not the current one. Finally, each tab's target position is clamped to
// stay within the row's own width — the project owner's explicit ask that
// a pushed end tab never scoots off the page — which can only ever pull a
// push *in*, never send a tab further out than the row itself.
// The active tab itself never receives a push (dx forced to 0 below) even
// when it happens to be a neighbor of whatever else is pushing — per the
// project owner: it's already the one every other tab is scooting out of
// the way for, so it should read as the fixed, settled point everything
// else moves around, not another thing that shifts. It can still lift
// vertically on hover (a plain CSS :hover rule, untouched by this).
function computeOverlapPush(sources){
  const wrap = document.getElementById('tabs');
  if(!wrap || !overlapNaturalRects) return;
  const tabs = Array.from(wrap.querySelectorAll('.tab'));
  const containerWidth = wrap.clientWidth;
  const srcs = sources.filter(s => s != null && s >= 0);
  const dx = new Array(tabs.length).fill(0);
  srcs.forEach(s=>{
    // Distance-1 neighbors get pushed clear of the source, minus
    // OVERLAP_PUSH1_SLACK — leaving a few px of deliberate residual
    // overlap rather than clearing it completely. That residual only
    // ever eats into the neighbor's own --tab-hpad padding, never its
    // label text (the label sits inboard of the padding on both sides),
    // so it costs nothing to look at while meaningfully shortening how
    // far the neighbor visibly travels. Distance-2 gets a fraction of ITS
    // OWN edge gap with the source instead — smaller both because
    // OVERLAP_PUSH2_FRACTION < 1 and because a tab two away typically
    // overlaps the source less to begin with, if at all (overlapEdgeGap
    // returns 0 once they don't overlap in their natural resting
    // positions, so this is a genuine no-op past wherever the row
    // actually stops overlapping that far).
    [[s - 1, false], [s + 1, false], [s - 2, true], [s + 2, true]].forEach(([n, dist2])=>{
      if(n < 0 || n >= tabs.length) return;
      const gap = overlapEdgeGap(s, n);
      const amt = dist2 ? gap * OVERLAP_PUSH2_FRACTION : Math.max(0, gap - OVERLAP_PUSH1_SLACK);
      dx[n] += (n < s ? -1 : 1) * amt;
    });
  });
  tabs.forEach((t, i)=>{
    let d = t.classList.contains('active') ? 0 : dx[i];
    const rect = overlapNaturalRects[i];
    if(rect && d !== 0){
      const clampedLeft = Math.max(0, Math.min(containerWidth - rect.width, rect.left + d));
      d = clampedLeft - rect.left;
    }
    t.style.setProperty('--tab-dx', d + 'px');
  });
}

function overlapActiveIdx(tabs){
  return tabs.findIndex(t=>t.classList.contains('active'));
}

function overlapTabHoverStart(idx){
  const dev = state.devSettings || {};
  if(dev.tabBarDesktopStyle !== 'overlap' || dev.overlapHoverMode !== 'push') return;
  const tabs = Array.from(document.getElementById('tabs').querySelectorAll('.tab'));
  const activeIdx = overlapActiveIdx(tabs);
  // Hovering the already-active tab (including its #tabConnector clone,
  // which carries this same handler — see layoutOverlapTabs()) isn't a
  // new source of push: it's already permanently pushing its neighbors
  // (see layoutOverlapTabs()'s own computeOverlapPush([activeIdx]) call),
  // and passing it twice here doubled that push on each neighbor —
  // reported as hovering the selected tab "still scooches other tabs
  // unnecessarily." A no-op guard here is simpler and more correct than
  // deduping the sources list.
  if(idx === activeIdx) return;
  overlapHoveredIdx = idx;
  computeOverlapPush([activeIdx, idx]);
}

function overlapTabHoverEnd(idx){
  if(overlapHoveredIdx !== idx) return;
  overlapHoveredIdx = null;
  const tabs = Array.from(document.getElementById('tabs').querySelectorAll('.tab'));
  computeOverlapPush([overlapActiveIdx(tabs)]);
}

// tabBarMobileStyle's "scroll" variant (see defaultDevSettings() in
// 02-storage-state.js) hints "more tabs this way" with a fade on
// whichever edge(s) actually have more content past them — never a fade
// sitting there regardless of scroll position. Harmless to call whenever
// #tabs' content or size might have changed (re-render, resize) or
// whenever it's actually scrolled — see the 'scroll' listener attached
// once in 19-bootstrap.js — since it's a no-op unless .tabswrap.fade-left/
// .fade-right end up matching a rule (they only do anything under
// body.mobileui-active[data-tabbar-mobile="scroll"], see <style>).
function updateTabScrollFade(){
  const tabs = document.getElementById('tabs');
  const wrap = tabs && tabs.closest('.tabswrap');
  if(!tabs || !wrap) return;
  // A small dead zone (not >0/<maxScroll) absorbs scroll-snap's own tiny
  // rest offset — with .tabs' left padding also acting as a snap target,
  // the browser's natural "resting" scrollLeft at either end lands a few
  // px shy of the true 0/maxScroll rather than exactly on it, which
  // without this would flicker a fade on at rest for a row that hasn't
  // actually been scrolled at all.
  const maxScroll = tabs.scrollWidth - tabs.clientWidth;
  const DEAD_ZONE = 12;
  wrap.classList.toggle('fade-left', tabs.scrollLeft > DEAD_ZONE);
  wrap.classList.toggle('fade-right', tabs.scrollLeft < maxScroll - DEAD_ZONE);
}

// Row membership depends on how the tab labels happen to wrap at the
// current container width, which CSS alone has no hook for (no ::row
// selector) — so this measures each tab's actual offsetTop after layout,
// groups tabs sharing a top into a row, and draws a .tabrow-line under
// every row but the last (which already rests directly on the card).
function renderTabRowLines(){
  const wrap = document.getElementById('tabs');
  wrap.querySelectorAll('.tabrow-line').forEach(el=>el.remove());
  // The "which tabs share a row" measurement below only means anything
  // for a horizontally-wrapping bar. tabBarDesktopStyle's "sidetabs"
  // variant (see defaultDevSettings() in 02-storage-state.js) turns #tabs
  // into a vertical column instead — every tab would measure a different
  // offsetTop there, which without this guard would misread as "every
  // tab is its own row" and draw a stray horizontal line under each one.
  if(state.devSettings && state.devSettings.tabBarDesktopStyle === 'sidetabs' && !mobileUiActive()) return;
  const tabs = Array.from(wrap.querySelectorAll('.tab'));
  if(!tabs.length) return;
  const rows = [];
  tabs.forEach(t=>{
    const top = t.offsetTop;
    let row = rows.find(r=>Math.abs(r.top-top)<2);
    if(!row){ row = { top, bottom:0 }; rows.push(row); }
    row.bottom = Math.max(row.bottom, t.offsetTop + t.offsetHeight);
  });
  if(rows.length < 2) return;
  rows.sort((a,b)=>a.top-b.top);
  rows.slice(0,-1).forEach(row=>{
    const line = document.createElement('div');
    line.className = 'tabrow-line';
    line.style.top = (row.bottom + 3) + 'px';
    wrap.appendChild(line);
  });
}

function renderQuickCategory(){
  const sel = document.getElementById('quickCategory');
  if(activeTab !== 'all'){
    sel.style.display = 'none';
    sel.value = activeTab;
  } else {
    sel.style.display = '';
    sel.innerHTML = standardCategoryEntries().map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');
  }
  document.getElementById('quickInput').placeholder =
    activeTab==='household' ? 'Log a household task…' :
    activeTab==='work' ? 'Add a work task…' :
    activeTab==='personal' ? 'Add a personal to-do…' : 'What needs doing?';
  // fieldPickerStyle (see defaultDevSettings() in 02-storage-state.js):
  // the native <select>s stay in the DOM either way (addTask() reads
  // their .value directly, see 16-task-crud.js) — 'default' shows them
  // as always; a custom style hides them and shows a synced picker next
  // to each instead (syncQuickField() below writes back to the hidden
  // select so addTask() needs no changes at all).
  const showAdvanced = state.advancedTaskFields;
  const pickerStyle = (state.devSettings && state.devSettings.fieldPickerStyle) || 'default';
  const useCustomPicker = showAdvanced && pickerStyle !== 'default';
  const tfSel = document.getElementById('quickTimeframe');
  const prSel = document.getElementById('quickPriority');
  const tfPicker = document.getElementById('quickTimeframePicker');
  const prPicker = document.getElementById('quickPriorityPicker');
  tfSel.style.display = showAdvanced && !useCustomPicker ? '' : 'none';
  prSel.style.display = showAdvanced && !useCustomPicker ? '' : 'none';
  tfPicker.style.display = useCustomPicker ? '' : 'none';
  prPicker.style.display = useCustomPicker ? '' : 'none';
  if(useCustomPicker){
    tfPicker.innerHTML = fieldPickerHtml('timeframe', tfSel.value, v=>`syncQuickField('timeframe','${v}')`);
    prPicker.innerHTML = fieldPickerHtml('priority', prSel.value, v=>`syncQuickField('priority','${v}')`);
  }
}

// fieldPickerStyle's custom pickers write straight back to the hidden
// native <select> (whichever addTask()/renderQuickCategory() already
// treat as the real value) rather than keeping their own parallel piece
// of state — one source of truth, and addTask() needed zero changes.
// Re-renders just the two picker containers (not a full render()) so
// picking a step doesn't touch anything else on screen.
function syncQuickField(kind, val){
  const selId = kind === 'timeframe' ? 'quickTimeframe' : 'quickPriority';
  document.getElementById(selId).value = val;
  renderQuickCategory();
}

function subProgressHtml(subs){
  if(!subs.length) return '';
  const done = subs.filter(s=>s.done).length;
  const total = subs.length;
  if(total <= 6){
    const pips = subs.map(s=>`<span class="subpip ${s.done?'filled':''}"></span>`).join('');
    return `<div class="substack" title="${done}/${total} steps done">${pips}</div>`;
  }
  const pct = Math.round(done/total*100);
  return `<div class="substack bar" title="${done}/${total} steps done"><div class="subfill" style="width:${pct}%"></div></div>`;
}

