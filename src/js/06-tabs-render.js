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
  // A calendar tab has no tasks of its own to count (see
  // isCalendarCategory()'s comment) — today's own open count is the most
  // relevant single number to show on its tab, same reasoning as 'daily'
  // itself, and the two intentionally share this branch rather than each
  // recomputing it.
  if(key==='daily' || isCalendarCategory(key)){
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
    return state.tasks.filter(t=>t.category===key).reduce((sum,t)=>sum+(t.subtasks||[]).filter(s=>!s.done).length, 0);
  }
  return state.tasks.filter(t => t.category===key && t.status!=='done').length;
}

// Feeds both the overlapSubtags "!" badge and (via tabImportanceRank())
// overlapHoverMode's "fixed order" ranking — a category counts as urgent
// if it has any not-done task that's overdue or High priority. Checklist/
// calendar tabs have no such fields on their own "tasks" (a checklist's
// task is a whole list, a calendar tab has none at all — see
// isChecklistCategory()/isCalendarCategory()), so they're never urgent by
// this measure; 'all'/'daily' aren't a single category either and are
// excluded the same way.
function tabHasUrgentTask(key){
  if(key==='all' || key==='daily' || isChecklistCategory(key) || isCalendarCategory(key)) return false;
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
// dot+count for a small badge floating above it — the category's own icon
// glyph plus its open count, plus a "!" when tabHasUrgentTask() is true —
// so it only ever appears when there's actually something to say, unlike
// the always-on inline count it replaces (which shows "0" just as
// prominently as anything else). Skipped entirely for a tab with nothing
// open, and for 'all'/'daily' (no single category icon to show).
function tabSubtagHtml(key, openCount){
  if(key==='all' || key==='daily' || openCount<=0) return '';
  const cat = CATEGORIES[key];
  if(!cat) return '';
  const icon = categoryDotHtml(cat, 'dot');
  const urgent = tabHasUrgentTask(key);
  return `<div class="tabsubtag">${icon}<span class="tabsubtag-count">${openCount}</span>${urgent ? '<span class="tabsubtag-urgent">!</span>' : ''}</div>`;
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
    const hexStyle = cat
      ? ` style="--tabhex:${cat.hex};--tabtext:${relLuminance(cat.hex) > 0.5 ? '#2A2318' : '#F1EAD9'};--tabedge:${shadeHex(cat.hex, -0.25)};--tabidx:${tabidx};--tab-jitter:${jitter}px"`
      : ` style="--tabidx:${tabidx};--tab-jitter:${jitter}px"`;
    const hoverAttrs = pushMode ? ` onmouseenter="overlapTabHoverStart(${idx})" onmouseleave="overlapTabHoverEnd(${idx})"` : '';
    return `<button class="tab ${activeTab===key?'active':''}"${hexStyle}${hoverAttrs} onclick="switchTab('${key}')">${dot}<span class="tablabel">${label}</span> ${countHtml}${subtagHtml}</button>`;
  }).join('');
  renderTabRowLines();
  updateTabScrollFade();
  layoutOverlapTabs();
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

const OVERLAP_MAX_LABEL_WIDTH = 150; // soft width budget tried before allowing a real 2nd line
const OVERLAP_MIN_FONT_PX = 8.5;     // floor for the "shrink to fit one line" attempt below that
const OVERLAP_BASE_OVERLAP = 16;     // default -margin-left between tabs, matches the old hardcoded value
const OVERLAP_MIN_TAB_REVEAL = 24;   // comfortable px of a tab's own width left peeking out at max scrunch
const OVERLAP_HARD_MIN_REVEAL = 8;   // last-resort floor — never fully hides a tab, but "must fit" wins past this
const OVERLAP_MIN_HPAD = 5;          // floor for the secondary lever (horizontal padding) below
const OVERLAP_PUSH1 = 16;            // how far an immediate neighbor scoots away from a hovered/selected tab
const OVERLAP_PUSH2 = 7;             // same, for the neighbor one further out
const OVERLAP_CONNECT_MIN = 4;       // px the active tab's tail must overlap #appCard's top edge by, at minimum
const OVERLAP_CONNECT_MAX = 16;      // ...and at most, so a 2-3 line label doesn't dip deep into the card

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
  if(!wrap || mobileUiActive() || dev.tabBarDesktopStyle !== 'overlap') return;
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

  // ---- 1. One line if at all possible ----
  const baseFontPx = parseFloat(getComputedStyle(tabs[0]).fontSize) || 11.2;
  tabs.forEach(t=>{
    let px = baseFontPx;
    while(t.scrollWidth > OVERLAP_MAX_LABEL_WIDTH && px > OVERLAP_MIN_FONT_PX){
      px -= 0.5;
      t.style.fontSize = px + 'px';
    }
    if(t.scrollWidth > OVERLAP_MAX_LABEL_WIDTH){
      const label = t.querySelector('.tablabel');
      if(!label) return;
      const oneLineHeight = label.getBoundingClientRect().height;
      label.style.whiteSpace = 'normal';
      label.style.maxWidth = OVERLAP_MAX_LABEL_WIDTH + 'px';
      if(label.getBoundingClientRect().height > oneLineHeight * 1.4){
        t.classList.add('two-line');
      } else {
        // Wrapping didn't actually trigger (measurement was conservative) —
        // no point paying for a wrap that didn't happen.
        label.style.whiteSpace = 'nowrap';
        label.style.maxWidth = '';
      }
    }
  });

  // ---- 2. Scrunch to fit: solve for how much overlap is needed to keep
  // every tab's settled (post font-shrink) width within the row's actual
  // available width, instead of letting the row run past its right edge.
  // Overlap alone (capped at OVERLAP_MIN_TAB_REVEAL of comfortable reveal
  // per tab) isn't always enough — a wide category list in a narrow window
  // can need more scrunching than that cap comfortably allows — so this
  // also leans on a second lever, shrinking each tab's own horizontal
  // padding (--tab-hpad, read by the .tab padding rule in <style>), before
  // finally just accepting a tighter reveal (down to OVERLAP_HARD_MIN_
  // REVEAL) as a last resort: the project owner's explicit priority is "no
  // tab may run past the row's edge," which beats "every tab keeps a
  // comfortable 24px peeking out." ----
  const n = tabs.length;
  const available = wrap.clientWidth;
  let widths, overlap = OVERLAP_BASE_OVERLAP;
  let hpad = 14;
  wrap.style.setProperty('--tab-hpad', hpad + 'px');
  for(let iter = 0; iter < 6; iter++){
    widths = tabs.map(t=>t.offsetWidth);
    const total = widths.reduce((a,b)=>a+b, 0);
    overlap = OVERLAP_BASE_OVERLAP;
    if(n > 1 && total > available){
      const needed = (total - available) / (n - 1) + OVERLAP_BASE_OVERLAP;
      const comfortableMax = Math.max(OVERLAP_BASE_OVERLAP, Math.min(...widths) - OVERLAP_MIN_TAB_REVEAL);
      overlap = Math.min(needed, comfortableMax);
    }
    const displayed = total - (n - 1) * overlap;
    if(displayed <= available || hpad <= OVERLAP_MIN_HPAD) break;
    hpad = Math.max(OVERLAP_MIN_HPAD, hpad - 2);
    wrap.style.setProperty('--tab-hpad', hpad + 'px');
  }
  // Padding/font shrinking exhausted and it still doesn't fit — drop the
  // comfortable-reveal cap down to the hard floor rather than let the row
  // run past the card's edge.
  if(n > 1){
    const total = widths.reduce((a,b)=>a+b, 0);
    if(total - (n - 1) * overlap > available){
      const needed = (total - available) / (n - 1) + OVERLAP_BASE_OVERLAP;
      const hardMax = Math.max(OVERLAP_BASE_OVERLAP, Math.min(...widths) - OVERLAP_HARD_MIN_REVEAL);
      overlap = Math.min(needed, hardMax);
    }
  }
  wrap.style.setProperty('--tab-overlap', (-overlap) + 'px');

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
  if(activeIdx >= 0 && card){
    const activeTabEl = tabs[activeIdx];
    const cardTop = card.getBoundingClientRect().top;
    const tabBottom = activeTabEl.getBoundingClientRect().bottom;
    let nudge = 0;
    if(tabBottom < cardTop + OVERLAP_CONNECT_MIN) nudge = (cardTop + OVERLAP_CONNECT_MIN) - tabBottom;
    else if(tabBottom > cardTop + OVERLAP_CONNECT_MAX) nudge = (cardTop + OVERLAP_CONNECT_MAX) - tabBottom;
    if(nudge) activeTabEl.style.setProperty('--tab-connect', nudge + 'px');
  }
}

// overlapHoverMode's 'push' variant (see devSettingsFieldsHtml() in
// 01-categories-theme.js): rather than the default look's hover-lifts-
// above-everything trick, a hovered or selected tab instead shoves its
// immediate neighbor(s) sideways, away from it, revealing more of itself
// without needing to reorder the (now fixed, see tabImportanceRank())
// stack. `sources` is the set of tab indices currently pushing (the
// active tab always, plus whichever tab is hovered) — each contributes an
// independent push to every other tab based on distance, and the results
// simply add together where they overlap (e.g. hovering a tab right next
// to the active one). Pushes are applied as a `transform: translateX()`
// (via --tab-dx, combined with the vertical lift/jitter transform — see
// the .tab rules in <style>) rather than by touching margins, so pushing
// tab N can never cascade into shifting every tab after it — each tab's
// own displacement is independent and computed from its ORIGINAL
// (overlapNaturalRects) position every time, not the current one.
// Finally, each tab's target position is clamped to stay within the row's
// own width — the project owner's explicit ask that a pushed end tab
// never scoots off the page — which can only ever pull a push *in*, never
// send a tab further out than the row itself.
function computeOverlapPush(sources){
  const wrap = document.getElementById('tabs');
  if(!wrap || !overlapNaturalRects) return;
  const tabs = Array.from(wrap.querySelectorAll('.tab'));
  const containerWidth = wrap.clientWidth;
  const srcs = sources.filter(s => s != null && s >= 0);
  tabs.forEach((t, i)=>{
    let dx = 0;
    srcs.forEach(s=>{
      if(s === i) return;
      const dist = i - s;
      const mag = Math.abs(dist) === 1 ? OVERLAP_PUSH1 : Math.abs(dist) === 2 ? OVERLAP_PUSH2 : 0;
      dx += Math.sign(dist) * mag;
    });
    const rect = overlapNaturalRects[i];
    if(rect && dx !== 0){
      const clampedLeft = Math.max(0, Math.min(containerWidth - rect.width, rect.left + dx));
      dx = clampedLeft - rect.left;
    }
    t.style.setProperty('--tab-dx', dx + 'px');
  });
}

function overlapActiveIdx(tabs){
  return tabs.findIndex(t=>t.classList.contains('active'));
}

function overlapTabHoverStart(idx){
  const dev = state.devSettings || {};
  if(dev.tabBarDesktopStyle !== 'overlap' || dev.overlapHoverMode !== 'push') return;
  overlapHoveredIdx = idx;
  const tabs = Array.from(document.getElementById('tabs').querySelectorAll('.tab'));
  computeOverlapPush([overlapActiveIdx(tabs), idx]);
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

