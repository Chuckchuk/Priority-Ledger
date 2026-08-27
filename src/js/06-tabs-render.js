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

function renderTabs(){
  const wrap = document.getElementById('tabs');
  wrap.innerHTML = visibleTabs().map(key=>{
    const openCount = tabOpenCount(key);
    const dot = (key==='all'||key==='daily') ? '' : categoryDotHtml(CATEGORIES[key], 'dot');
    const label = key==='all' ? 'All' : key==='daily' ? 'Daily' : CATEGORIES[key].label;
    // --tabhex is only ever read by the EXPERIMENTAL tabBarDesktopStyle
    // "indextabs" look (see the body:not(.mobileui-active)[data-tabbar-
    // desktop="indextabs"] rules in <style>) — harmless to always set,
    // same reasoning as --page-transform elsewhere. 'all'/'daily' have no
    // category color of their own, so they fall back to var(--primary)
    // in CSS instead of getting this property at all.
    const hexStyle = (key!=='all' && key!=='daily' && CATEGORIES[key]) ? ` style="--tabhex:${CATEGORIES[key].hex}"` : '';
    return `<button class="tab ${activeTab===key?'active':''}"${hexStyle} onclick="switchTab('${key}')">${dot}${label} <span class="count">${openCount}</span></button>`;
  }).join('');
  renderTabRowLines();
  updateTabScrollFade();
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
  document.getElementById('quickTimeframe').style.display = state.advancedTaskFields ? '' : 'none';
  document.getElementById('quickPriority').style.display = state.advancedTaskFields ? '' : 'none';
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

