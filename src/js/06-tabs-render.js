function visibleTabs(){
  return tabOrder().filter(key => key==='all' || key==='daily' || !state.locationEnabled || CATEGORIES[key].locations.includes(state.location));
}

function currentLocation(){
  return state.locations.find(l=>l.id===state.location) || state.locations[0];
}

// The Daily tab isn't a real category (no CATEGORIES['daily'] entry, no
// state.categories row of its own — see tabOrder()) so it has no cat.hex
// to draw its dot/tabhex from the way every other tab does. Per the
// project owner's own ask, it uses the live UI Colors Secondary accent
// instead — the same color already used for the checklist "Pending" tag
// and a couple of other secondary-accent spots (see the theming notes in
// CLAUDE.md), so Daily reads as sharing that accent rather than getting a
// one-off color of its own. uiColorPreset() already resolves 'custom'
// against state.theme.customUi internally, same as applyThemeObject()'s
// own `ui` lookup.
function dailyTabHex(){
  return uiColorPreset(state.theme.uiPreset).secondary;
}

function hashStr(s){
  let h = 0;
  for(let i=0; i<s.length; i++) h = (h*31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function renderLocBadge(){
  const badge = document.getElementById('locBadge');
  badge.style.display = state.locationEnabled ? '' : 'none';
  if(state.locationEnabled) badge.textContent = currentLocation().label;
  // The subheader used to list which tabs the current location was
  // hiding, then a rotating decorative tagline — neither carried its
  // weight (a warning nobody needed, then filler text). Today's date is
  // useful regardless of tab or location state, so it lives here now.
  document.getElementById('statusLine').textContent = fmtTodayHeader();
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
// overlapStackMode's "ranked" ordering — a category counts as urgent
// if it has any not-done task that's overdue or High priority. A
// checklist tab has no such fields on its own "tasks" (a checklist's
// task is a whole list — see isChecklistCategory()), so it's never urgent
// by this measure; 'all'/'daily' aren't a single category either and are
// excluded the same way.
function tabHasUrgentTask(key){
  if(key==='all' || key==='daily' || isChecklistCategory(key)) return false;
  return state.tasks.some(t => t.category===key && t.status!=='done' && (isOverdue(t) || t.priority===3));
}

// overlapStackMode's 'ranked' variant (see devSettingsFieldsHtml() in
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
// Skipped entirely for a tab with nothing open, and for 'all' (no single
// category icon to show — 'daily' gets one now, see dailyTabHex() below).
// The markup here is just content — its pennant shape, "behind the tab"
// z-index trick, and position all live in the .tabsubtag rules in <style>.
function tabSubtagHtml(key, openCount){
  if(key==='all' || openCount<=0) return '';
  const cat = CATEGORIES[key];
  if(!cat && key !== 'daily') return '';
  const icon = cat ? categoryDotHtml(cat, 'dot') : categoryDotHtml({ hex: dailyTabHex(), icon:'dot' }, 'dot');
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

// Stacked Tabs (stackedTabsEnabled dev setting, mobile-only — see its own
// comment in defaultDevSettings(), 02-storage-state.js) — folds every
// unpinned category of the same .type into one shared tab spot. Returns
// visibleTabs()'s own key list untouched when the setting's off (or on
// desktop without mobileUiPreviewOnDesktop), so renderTabs() below can
// treat this as a no-op wrapper the rest of the time rather than
// branching on the setting itself. Where it DOES apply, the returned
// array mixes plain string keys (all/daily, a pinned category, or a
// .type with only one member left — nothing to actually stack) with
// `{stack:true, type, members, topKey}` objects marking where a group of
// 2+ collapsed into one spot. renderTabs() tells the two apart with
// typeof rather than needing a second parallel array.
function stackGroupsForTabs(keys){
  const dev = state.devSettings || {};
  if(!mobileUiActive() || !dev.stackedTabsEnabled) return keys;
  const membersByType = {};
  const typeOrder = [];
  keys.forEach(key=>{
    if(key==='all' || key==='daily') return;
    const cat = CATEGORIES[key];
    if(!cat || cat.pinned) return;
    const type = cat.type || 'standard';
    if(!membersByType[type]){ membersByType[type] = []; typeOrder.push(type); }
    membersByType[type].push(key);
  });
  const collapsedTypes = typeOrder.filter(type => membersByType[type].length > 1);
  if(!collapsedTypes.length) return keys;
  const stackedTabsTop = dev.stackedTabsTop || {};
  const emittedTypes = new Set();
  const result = [];
  keys.forEach(key=>{
    if(key==='all' || key==='daily'){ result.push(key); return; }
    const cat = CATEGORIES[key];
    const type = cat ? (cat.type || 'standard') : null;
    if(!cat || cat.pinned || !collapsedTypes.includes(type)){ result.push(key); return; }
    if(emittedTypes.has(type)) return; // this group's one spot is already in `result`
    emittedTypes.add(type);
    const members = membersByType[type];
    const pickedTop = stackedTabsTop[type];
    const topKey = members.includes(pickedTop) ? pickedTop : members[0];
    result.push({ stack:true, type, members, topKey });
  });
  return result;
}

// Long-press-then-drag menu for a Stacked Tabs group — same shared
// #ctxMenu/ctxMenuDragMove/ctxMenuDragEnd engine as every other long-press
// menu in the app (see the header comment on that engine in
// 08-render-core.js), just this feature's own flavor of it. Choosing a
// category (pickTabStackTop() below) makes it that group's new topKey
// AND navigates there, same as tapping a plain tab already does — a
// picker pick is meant to read as "switch to this, and keep it handy,"
// not two separate actions.
let ctxMenuTabStackType = null;
let tabStackPressTimer = null;
let tabStackPressEl = null;
let tabStackPressStartX = 0, tabStackPressStartY = 0;
let tabStackLongPressFired = false;
function tabStackPressStart(e, type, membersJson){
  if(!mobileUiActive()) return;
  tabStackLongPressFired = false;
  const pt = e.touches ? e.touches[0] : e;
  tabStackPressStartX = pt.clientX;
  tabStackPressStartY = pt.clientY;
  tabStackPressEl = e.currentTarget;
  clearTimeout(tabStackPressTimer);
  tabStackPressTimer = setTimeout(() => {
    tabStackPressTimer = null;
    tabStackLongPressFired = true;
    const members = JSON.parse(membersJson);
    const r = tabStackPressEl.getBoundingClientRect();
    renderTabStackMenu(type, members, r.left, r.bottom + 6);
  }, TASK_LONG_PRESS_MS);
}
function tabStackPressMove(e){
  if(tabStackLongPressFired){ if(ctxMenuDragMove(e)) e.preventDefault(); return; }
  if(!tabStackPressTimer) return;
  const pt = e.touches ? e.touches[0] : e;
  const dx = pt.clientX - tabStackPressStartX, dy = pt.clientY - tabStackPressStartY;
  if(Math.hypot(dx, dy) > TASK_LONG_PRESS_TOLERANCE_PX){
    clearTimeout(tabStackPressTimer);
    tabStackPressTimer = null;
  }
}
function tabStackPressEnd(){
  clearTimeout(tabStackPressTimer);
  tabStackPressTimer = null;
  if(tabStackLongPressFired) ctxMenuDragEnd();
}
function renderTabStackMenu(type, members, x, y){
  ctxMenuTabStackType = type;
  const menu = document.getElementById('ctxMenu');
  menu.innerHTML = members.map(key=>{
    const cat = CATEGORIES[key];
    if(!cat) return '';
    return `<button class="ctxmenu-hasicon" onclick="ctxMenuAction(()=>pickTabStackTop('${type}','${key}'))">${escapeHtml(cat.label)}<span class="ctxmenu-icon">${categoryDotHtml(cat, 'dot')}</span></button>`;
  }).join('');
  const zf = zoomFactor();
  menu.style.left = (x/zf) + 'px';
  menu.style.top = (y/zf) + 'px';
  menu.classList.add('open');
  applyDevElementNames();
  requestAnimationFrame(() => {
    const r = menu.getBoundingClientRect();
    if(r.right > window.innerWidth) menu.style.left = (Math.max(8, window.innerWidth - r.width - 8)/zf) + 'px';
    if(r.bottom > window.innerHeight) menu.style.top = (Math.max(8, window.innerHeight - r.height - 8)/zf) + 'px';
  });
}
// Picking a category from the stack's own picker menu both remembers it
// (stackedTabsTop, read by stackGroupsForTabs() above on the next render)
// and switches to it — see this function's own header comment above for
// why those two aren't split into separate steps.
async function pickTabStackTop(type, key){
  const cat = CATEGORIES[key];
  pushUndo(`Set "${cat ? cat.label : key}" as the top of its Stacked Tabs group`);
  state.devSettings.stackedTabsTop[type] = key;
  switchTab(key);
  queueSave();
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
  // overlapStackMode's 'ranked' variant drives BOTH the fixed-by-
  // importance stacking order and the stagger that makes that order
  // visible at rest — pushMode/staggerOn are kept as separate local
  // names (rather than one shared variable) purely because they read
  // clearer at each of their own call sites below, not because they can
  // ever actually differ; they used to be two independent dev settings
  // that could be set incongruently, which is exactly what got merged
  // into overlapStackMode (see defaultDevSettings()'s own comment in
  // 02-storage-state.js).
  const pushMode = overlapStyle && dev.overlapStackMode === 'ranked';
  const staggerOn = pushMode;
  const importanceRank = pushMode ? tabImportanceRank(keys) : null;
  // Stacked Tabs replaces a run of same-.type keys with one spec object —
  // see stackGroupsForTabs()'s own comment above. A no-op array-identity
  // return the rest of the time, so tabItems reads exactly like keys used
  // to everywhere below except the typeof check each iteration now opens
  // with.
  const tabItems = stackGroupsForTabs(keys);
  wrap.innerHTML = tabItems.map((item, idx)=>{
    const isStack = typeof item !== 'string';
    const key = isStack ? item.topKey : item;
    const openCount = tabOpenCount(key);
    const dot = subtagsOn ? '' : key==='all' ? '' : key==='daily' ? categoryDotHtml({ hex: dailyTabHex(), icon:'dot' }, 'dot') : categoryDotHtml(CATEGORIES[key], 'dot');
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
    // multiplicative-darken helper --desk-dark is built from. 'daily'
    // uses dailyTabHex() (the live Secondary accent) here too, same as
    // its dot above — 'all' is the only tab with no color of its own, so
    // it's the only one that falls back to <style>'s var(--primary)-based
    // defaults. --tabidx (1-based) is "overlap"'s default
    // stacking order — later tabs sit on top of earlier ones until
    // hovered, like a fanned-out stack of index cards — UNLESS
    // overlapStackMode's 'ranked' variant is on, in which case it's
    // instead a fixed rank by tabImportanceRank() so the stacking order
    // holds still regardless of hover (see computeOverlapPush() below).
    // --tab-jitter is a small per-tab pseudo-random resting-height offset
    // (hashStr()'d off the tab's own id so it's stable across renders,
    // not truly random — see the .tab transform rules in <style>), there
    // purely so a row of same-height pills reads a little more like a
    // hand-fanned stack of index cards and a little less like a UI
    // component; onmouseenter/leave are only wired up in 'ranked' mode —
    // 'hover' mode still does its lift/reorder in pure CSS via :hover.
    const cat = (key!=='all' && key!=='daily') ? CATEGORIES[key] : null;
    const tabColorHex = cat ? cat.hex : (key==='daily' ? dailyTabHex() : null);
    const tabidx = importanceRank ? importanceRank[key] : idx+1;
    const jitter = tabJitterPx(key);
    // --tab-angle is only ever read by .tab.active's own transform (see
    // <style>) — a small stable per-category tilt (same hashStr() idiom as
    // --tab-jitter) so the selected tab reads as a real dog-eared page
    // tucked in slightly crooked, rather than a perfectly square chip.
    // Harmless to set on every tab, same reasoning as --tabidx elsewhere.
    const angle = tabAngleDeg(key);
    // 'ranked' mode's stagger (staggerOn, tied to the same overlapStackMode
    // choice as pushMode above): a tab further back in the stack (lower
    // tabidx, i.e. less "important") sits a little higher at rest —
    // proportional to how far back it is, capped at OVERLAP_STAGGER_MAX —
    // so its own label has a better chance of peeking above whichever tab
    // is currently covering it, instead of a covered tab being unreadable
    // until you interact with it. 0 (no offset) for the frontmost tab
    // either way, and for every tab at all in 'hover' mode.
    const stagger = staggerOn ? -((tabItems.length - tabidx) / Math.max(1, tabItems.length - 1)) * OVERLAP_STAGGER_MAX : 0;
    const hexStyle = tabColorHex
      ? ` style="--tabhex:${tabColorHex};--tabtext:${relLuminance(tabColorHex) > 0.5 ? '#2A2318' : '#F1EAD9'};--tabedge:${shadeHex(tabColorHex, -0.25)};--tabidx:${tabidx};--tab-jitter:${jitter}px;--tab-angle:${angle}deg;--tab-stagger:${stagger}px"`
      : ` style="--tabidx:${tabidx};--tab-jitter:${jitter}px;--tab-angle:${angle}deg;--tab-stagger:${stagger}px"`;
    const hoverAttrs = pushMode ? ` onmouseenter="overlapTabHoverStart(${idx})" onmouseleave="overlapTabHoverEnd(${idx})"` : '';
    // Re-clicking the tab you're already on now has to actually do
    // something (return to that tab's own master view out of whatever
    // drilldown it might be sitting on — see switchTab()'s own comment),
    // so overlap style's active tab can't skip the onclick the way an
    // earlier pass here did purely to dodge a cosmetic issue: rebuilding
    // every .tab element from scratch re-runs solveGapOverlaps()/
    // computeOverlapPush() against fresh DOM, which occasionally lands a
    // hair's width off the previous pass (sub-pixel measurement noise)
    // that the transform transition then visibly animates through as a
    // small "pulse" on the neighbors. A working return-to-master-view is
    // worth that trade — if the pulse turns out to actually be
    // noticeable in practice, that's a rendering-smoothness bug to chase
    // down on its own terms, not a reason to leave the click dead again.
    // Every tab, "Daily" included, uses the same plain switchTab() —
    // "go to today" belongs on the masthead's dedicated shortcut button
    // instead (#dailyShortcutBtn, goToDailyToday(), see 11-daily-core.js),
    // per the project owner's own correction. This tab landing wherever
    // Daily was last left (the day list, a specific day, the calendar) is
    // exactly the point: it's the tab that remembers, the shortcut button
    // is the one that always means "today."
    const clickAttr = ` onclick="switchTab('${key}')"`;
    // A stack tab's plain tap is identical to any other tab's (switchTab()
    // on its own current topKey) — only the long-press differs, opening
    // the picker (tabStackPressStart() etc. above) instead of this app's
    // usual right-click/long-press context menu, since a tab has no
    // "actions" of its own the way a task/checklist row does. members is
    // passed through as a JSON string attribute (not, say, re-derived
    // from data-key on press) so the picker doesn't need CATEGORIES'
    // current .pinned/.type state to still agree with whatever was true
    // when this button was rendered a moment ago.
    const membersAttr = isStack ? escapeHtml(JSON.stringify(item.members)) : '';
    const stackAttrs = isStack
      ? ` data-stack-type="${item.type}" ontouchstart="tabStackPressStart(event,'${item.type}','${membersAttr}')" ontouchmove="tabStackPressMove(event)" ontouchend="tabStackPressEnd()" ontouchcancel="tabStackPressEnd()" onmousedown="tabStackPressStart(event,'${item.type}','${membersAttr}')" onmouseup="tabStackPressEnd()" onmouseleave="tabStackPressEnd()"`
      : '';
    return `<button class="tab ${activeTab===key?'active':''} ${isStack?'stacktab':''}" data-key="${key}"${hexStyle}${hoverAttrs}${clickAttr}${stackAttrs}>${dot}<span class="tablabel">${label}</span> ${countHtml}${subtagHtml}</button>`;
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
const SIDETAB_TUCK_ACTIVE = 24;  // the active tab gets to tuck a bit deeper — its
                                  // own mask-image fade (.tab.active in <style>) is
                                  // what makes that safe to do without it reading
                                  // as covering page content. Bumped from 18 per the
                                  // project owner's own fix for "the selected tab
                                  // fades into the count number": more of the tab's
                                  // own width now tucks cleanly behind #appCard's
                                  // opaque edge instead of relying on the fade alone
                                  // to hide it, giving the label/count more room
                                  // before the fade zone (still the tab's own last
                                  // ~10px, see .tab.active in <style>) ever starts.
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
const SIDETAB_SHAPE_EXTRA = { pagetab:14, arrows:20, invertedv:6, sawtooth:7, jagged:13, flat:0, swallowtail:24, scallop:10, chevron:14 };
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
const SIDETAB_SHAPES_PICKABLE = ['pagetab', 'invertedv', 'arrows', 'sawtooth', 'swallowtail', 'scallop', 'chevron'];
// 'iconstyle' maps each category's own chosen icon glyph (CATEGORY_ICON_
// GLYPHS, 01-categories-theme.js — Settings lets a category pick one) to a
// shape that echoes it: a literal flag reads as a little pennant (pagetab,
// the same silhouette .pagetag uses elsewhere); sharp icons (star/diamond)
// get the sharp outward arrow; rounder/plainer ones split between the
// softer invertedv and the more geometric sawtooth; a forked cross reads
// well as the forked bookmark-ribbon notch (swallowtail); a many-sided/
// roundish hexagon gets the soft round bump (scallop); a single sharp
// triangle gets the plain single-slant cut (chevron). This is an editorial
// pairing, not a derived one — there's no principled way to compute it, so
// treat this table as the place to retune it if a specific pairing reads
// wrong once you see it. ('ring' isn't a real CATEGORY_ICON_SVG key —
// stale from before icons were finalized — so it's dropped rather than
// carried forward to a shape it can never actually resolve to.)
const SIDETAB_ICON_SHAPE_MAP = {
  flag:'pagetab', dot:'pagetab',
  star:'arrows', diamond:'arrows',
  house:'invertedv',
  square:'sawtooth', check:'sawtooth',
  hexagon:'scallop', triangle:'chevron', cross:'swallowtail'
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
const OVERLAP_STAGGER_MAX = 8;       // overlapStackMode's 'ranked' mode: max lift for the very back-most
                                      // tab. Was 6px — bumped up (the ceiling before eating into .active's
                                      // own -20px dedicated lift, worst-case stacked with jitter's ±3px and
                                      // the -6px two-line bonus, is 11px) since 6px read as barely-there
                                      // next to those other two offsets, part of why 'ranked' mode's own
                                      // effect was easy to miss at rest. Kept a few px under that 11px
                                      // ceiling, not pushed all the way to it, so "selected always highest"
                                      // keeps a real margin rather than a razor's edge.
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

  // 'ranked' mode: the selected tab permanently pushes its own neighbors
  // aside too, not just on hover (per the project owner's ask) — applied
  // here so it's redone on every render (a mutation, a category rename,
  // etc.) not just the next mouse move.
  const activeIdx = tabs.findIndex(t=>t.classList.contains('active'));
  if(dev.overlapStackMode === 'ranked'){
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

// overlapStackMode's 'ranked' variant (see devSettingsFieldsHtml() in
// 01-categories-theme.js): rather than 'hover' mode's hover-lifts-
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
  if(dev.tabBarDesktopStyle !== 'overlap' || dev.overlapStackMode !== 'ranked') return;
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

// Category/Timeframe/Priority in the quick-add bar are all driven by the
// same small pattern now: a hidden native <select> stays the one real
// value source (addTask() reads it directly, unchanged) while a compact
// .quickfieldbtn shows its current value and opens a #ctxMenu-style
// popover to change it (openQuickFieldMenu()/quickFieldMenuHtml()/
// setQuickField() below) — the same custom-menu language every other
// "pick one of a few things" control in this app already uses (Sort,
// "Move to" category), replacing both the plain <select> Category used
// to be and the EXPERIMENTAL fieldPickerStyle pill/progress pickers
// Timeframe/Priority used to opt into here (fieldPickerHtml() itself is
// untouched and still backs the task detail page's own Timeframe/
// Priority fields under that dev setting — this is a separate, permanent
// replacement scoped to just the quick-add bar, not a change to that
// system). No "None" pill to tap for Timeframe/Priority either — same
// click-to-clear idiom as everywhere else: picking the already-active
// option clears it back to unset (quickFieldMenuHtml() below).
function renderQuickCategory(){
  const sel = document.getElementById('quickCategory');
  const btn = document.getElementById('quickCategoryBtn');
  if(activeTab !== 'all'){
    btn.style.display = 'none';
    sel.value = activeTab;
  } else {
    btn.style.display = '';
    // Rebuilding a <select>'s innerHTML always re-selects its first
    // <option> as a side effect, even if .value was already something
    // else — renderQuickCategory() runs on every render() (any unrelated
    // edit anywhere in the app), so without capturing/restoring the
    // in-progress pick across that rebuild, choosing a category would
    // get silently wiped back to "whichever one happens to render first"
    // the instant anything else changed on screen. A real leading empty
    // option is what actually lets "unset" survive the rebuild at all —
    // an unset category is real, required state here (see addTask()'s
    // own validation, 16-task-crud.js), not just "whichever option
    // happened to render first" the way a bare native <select> would
    // otherwise silently default to.
    const entries = standardCategoryEntries();
    const prevVal = entries.some(([k])=>k===sel.value) ? sel.value : '';
    sel.innerHTML = `<option value=""></option>` + entries.map(([k,v])=>`<option value="${k}">${escapeHtml(v.label)}</option>`).join('');
    sel.value = prevVal;
    const cat = sel.value ? CATEGORIES[sel.value] : null;
    btn.innerHTML = cat ? `${categoryDotHtml(cat,'cdot')} ${escapeHtml(cat.label)}` : 'Category';
    btn.classList.toggle('unset', !cat);
  }
  document.getElementById('quickInput').placeholder =
    activeTab==='household' ? 'Log a household task…' :
    activeTab==='work' ? 'Add a work task…' :
    activeTab==='personal' ? 'Add a personal to-do…' : 'What needs doing?';
  const showAdvanced = state.advancedTaskFields;
  document.getElementById('quickAddRow2').style.display = showAdvanced ? '' : 'none';
  if(showAdvanced){
    const tfVal = document.getElementById('quickTimeframe').value;
    const prVal = document.getElementById('quickPriority').value;
    const tfBtn = document.getElementById('quickTimeframeBtn');
    const prBtn = document.getElementById('quickPriorityBtn');
    tfBtn.textContent = tfVal ? TIMEFRAME_STEPS.find(s=>s.v===tfVal).label : 'Timeframe';
    tfBtn.classList.toggle('unset', !tfVal);
    prBtn.textContent = prVal && prVal!=='0' ? PRIORITY_STEPS.find(s=>s.v===prVal).label : 'Priority';
    prBtn.classList.toggle('unset', !prVal || prVal==='0');
  }
}

// Which quick-add field's popover (if any) is currently open — same
// "reuse the shared #ctxMenu, track just enough to know which flavor of
// content it's showing" idiom ctxMenuSortOpen etc. already use, checked
// alongside those in the outside-click/scroll/Esc handlers (20-bootstrap.js).
let ctxMenuQuickFieldKind = null;
function quickFieldMenuHtml(kind){
  if(kind === 'category'){
    return standardCategoryEntries().map(([k,v]) =>
      `<button onclick="ctxMenuAction(()=>setQuickField('category','${k}'))">${categoryDotHtml(v,'cdot')} ${escapeHtml(v.label)}</button>`
    ).join('');
  }
  // Daily's own "add a new task for this day" row (12-daily-tree.js) —
  // same category list as above, but this one always has a real current
  // value (dayQuickCategoryDraft, 11-daily-core.js, defaults to Personal
  // rather than starting unset), so a ✓ on the active one is worth
  // showing here even though the plain 'category' case above never has
  // one to mark.
  if(kind === 'daycategory'){
    return standardCategoryEntries().map(([k,v]) => {
      const active = k === dayQuickCategoryDraft;
      return `<button class="${active?'current':''}" onclick="ctxMenuAction(()=>setQuickField('daycategory','${k}'))">${active?'✓ ':''}${categoryDotHtml(v,'cdot')} ${escapeHtml(v.label)}</button>`;
    }).join('');
  }
  const steps = kind === 'timeframe' ? TIMEFRAME_STEPS : PRIORITY_STEPS;
  const selId = kind === 'timeframe' ? 'quickTimeframe' : 'quickPriority';
  const curVal = document.getElementById(selId).value;
  // Steps past the first ("None") only — tapping the one that's already
  // active clears it back to "None" instead of needing a separate pill
  // for that, same idiom fieldPickerHtml()'s own 'buttons' style uses.
  return steps.slice(1).map(s => {
    const active = s.v === curVal;
    const nextVal = active ? steps[0].v : s.v;
    return `<button class="${active?'current':''}" onclick="ctxMenuAction(()=>setQuickField('${kind}','${nextVal}'))">${active ? '✓ ' : ''}${escapeHtml(s.label)}</button>`;
  }).join('');
}
function renderQuickFieldMenu(kind, x, y){
  ctxMenuQuickFieldKind = kind;
  const menu = document.getElementById('ctxMenu');
  menu.innerHTML = quickFieldMenuHtml(kind);
  const zf = zoomFactor();
  menu.style.left = (x/zf) + 'px';
  menu.style.top = (y/zf) + 'px';
  menu.classList.add('open');
  applyDevElementNames();
  requestAnimationFrame(() => {
    const r = menu.getBoundingClientRect();
    if(r.right > window.innerWidth) menu.style.left = (Math.max(8, window.innerWidth - r.width - 8)/zf) + 'px';
    if(r.bottom > window.innerHeight) menu.style.top = (Math.max(8, window.innerHeight - r.height - 8)/zf) + 'px';
  });
}
function openQuickFieldMenu(el, kind){
  const r = el.getBoundingClientRect();
  renderQuickFieldMenu(kind, r.left, r.bottom + 6);
}
function setQuickField(kind, val){
  if(kind === 'daycategory'){
    dayQuickCategoryDraft = val;
    renderDaily();
    return;
  }
  const selId = kind === 'category' ? 'quickCategory' : kind === 'timeframe' ? 'quickTimeframe' : 'quickPriority';
  document.getElementById(selId).value = val;
  if(kind === 'category' && val) clearQuickCategoryInvalid();
  renderQuickCategory();
}

// Gap between adjacent pips, in the same 1-unit-per-px viewBox
// subProgressHtml() below draws in. Tightened from the old CSS Grid
// version's 1.5px gap for less visible padding between pips, per the
// explicit "remove some padding... more filled out and wider" ask.
const SUBPIP_GAP = 1;

function subProgressHtml(subs){
  if(!subs.length) return '';
  const done = subs.filter(s=>s.done).length;
  const total = subs.length;
  // Threshold raised to 8 (from 6) per the project owner, to match the
  // checklist peg system's own "how many before it stops being legible as
  // individual items" call — even though this is a completely different
  // linear-bar component (.substack/.subpip, not the checklist's curved
  // SVG peg ring), the two limits are meant to line up conceptually.
  if(total <= 8){
    // SVG rects, not individually laid-out CSS Grid <span> children (the
    // old version) — each pip used to be its own independent HTML box,
    // and a plain grid/flex layout rounds every box's own edges to
    // whatever device pixel it lands on, independently of its neighbors.
    // At a non-integer browser (or the "Desktop zoom" dev setting's CSS
    // `zoom`) level, that per-box rounding doesn't stay in sync across
    // pips, so a row meant to read as evenly spaced could visibly drift —
    // pips of "varying lengths," gaps that don't quite match, depending
    // on zoom and on how many pips there were to divide 18px's worth of
    // grid tracks across. One <svg>, rendered as a single vector
    // rasterization pass with real fractional math for each rect's own
    // x/width, doesn't have that problem — same fix already applied to
    // the checklist ring's own pegs, for the same underlying reason.
    const pipW = (18 - SUBPIP_GAP * (total - 1)) / total;
    const pips = subs.map((s,i) => {
      const x = (i * (pipW + SUBPIP_GAP)).toFixed(3);
      return `<rect class="subpip ${s.done?'filled':''}" x="${x}" y="0" width="${pipW.toFixed(3)}" height="5" rx="1"></rect>`;
    }).join('');
    return `<svg class="substack" viewBox="0 0 18 5" title="${done}/${total} steps done">${pips}</svg>`;
  }
  const pct = Math.round(done/total*100);
  return `<div class="substack bar" title="${done}/${total} steps done"><div class="subfill" style="width:${pct}%"></div></div>`;
}

