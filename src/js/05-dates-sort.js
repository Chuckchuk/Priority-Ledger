function isOverdue(t){
  return t.dueDate && t.status !== 'done' && new Date(t.dueDate) < new Date(todayStr());
}

// Used to decide whether a due task is worth surfacing in a day's "pull
// in an existing task" list — due today, already overdue (no lower
// bound: overdue is exactly the case you'd most want to catch up on),
// or due within the next `days`. A task due further out than that isn't
// urgent enough yet to clutter a specific day's plan.
function isDueWithinDays(dueDate, days){
  const diffMs = new Date(dueDate) - new Date(todayStr());
  return diffMs / 86400000 <= days;
}

// Whether a task/step's plannedDates includes today or any day still to
// come — the pin button's pressed ("on") look reads this instead of a
// plain .length check, so a task pinned to a day that's since passed
// doesn't keep looking pressed once that day is gone. Plain string
// comparison works since plannedDates are always YYYY-MM-DD, same
// lexicographic-order trick isPast/isOverdue already lean on elsewhere.
function hasCurrentPlan(plannedDates){
  const today = todayStr();
  return (plannedDates||[]).some(d => d >= today);
}

// Maps a due date to the Timeframe value it implies, per the project
// owner's own thresholds — used by updateDueDate() (16-task-crud.js) to
// auto-fill an unset (or previously auto-set) Timeframe field whenever
// the due date changes. Deliberately returns null (no opinion, leave
// Timeframe alone) for two cases: no due date at all, and the 2-week-to-
// a-month gap, which the project owner explicitly asked to leave
// ambiguous rather than guessing which side of "short-ish project" vs
// "long-ish but not quite Long" a task in that range falls on. Overdue
// dates fold into the <=1 bucket alongside today/tomorrow — none of
// those found a mention in the original ask, and treating "already due"
// as anything less urgent than "due tomorrow" would be a stranger
// reading than folding it in here.
function deriveTimeframeFromDueDate(dueDate){
  if(!dueDate) return null;
  const days = daysBetween(todayStr(), dueDate);
  if(days <= 1) return 'short';   // overdue, today, or tomorrow
  if(days <= 13) return 'medium'; // "within a week or two"
  if(days <= 30) return null;     // 2 weeks to a month — left ambiguous on purpose
  return 'long';                  // over a month out
}

function fmtDate(d){
  if(!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month:'short', day:'numeric' });
}

// Discreet display format for a step's own date — M/D/YY, distinct from
// fmtDate()'s "Sep 1" used everywhere else, per the explicit ask for
// mm/dd/yy-style step dates.
function fmtDateShort(d){
  if(!d) return '';
  const dt = new Date(d + 'T00:00:00');
  const yy = String(dt.getFullYear()).slice(-2);
  return `${dt.getMonth()+1}/${dt.getDate()}/${yy}`;
}

// Full weekday/month/day/year form for a task's own due date on the full
// detail page (.datefield.taskdate) — per the explicit ask, "9/2/26" read
// as too terse for the one date field that page gives a whole boxed row
// of its own; every other date field in the app (a step's own date,
// badges) stays on fmtDate()/fmtDateShort()'s compact forms.
function fmtDateFull(d){
  if(!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
}

// Full weekday/month/day form for the masthead's own subheader (distinct
// from fmtDate()'s compact "Sep 1" used on task badges) — replaced a
// rotating decorative tagline the project owner found more filler than
// useful.
function fmtTodayHeader(){
  const dt = new Date(todayStr()+'T00:00:00');
  return dt.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
}

const WEEKDAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const MONTH_NAMES = ['january','february','march','april','may','june','july','august','september','october','november','december'];

// Every word/phrase that currently means "today" — this app doesn't
// track a time of day yet, so "tonight," "this evening," and a bare
// "morning" all collapse to the same plain date today does. If time-of-
// day tracking ever gets added, this is the list to split apart: each of
// these would need to carry its own approximate time instead of just
// resolving to todayStr() the way they all do now. Not attempting to
// detect an actual clock time (e.g. "2pm") at all — there's nowhere to
// put one yet, so parsing one now would just be silently thrown away.
const TODAY_WORDS = ['today','tday','2day','tonight','tonite','morning','afternoon','evening','night','this morning','this afternoon','this evening'];

// Rudimentary natural-language date detection for steps — deliberately
// covers only the handful of shorthands actually asked for (today/
// tomorrow, weekday names, M/D[/YY], "Month Day") rather than a general
// date-parsing library. Returns '' rather than guessing when nothing
// matches, so a typo never silently saves the wrong date.
function parseNaturalDate(raw){
  const str = (raw||'').trim().toLowerCase().replace(/\b(\d+)(st|nd|rd|th)\b/,'$1');
  if(!str) return '';
  const today = new Date(todayStr()+'T00:00:00');
  if(TODAY_WORDS.includes(str)) return todayStr();
  if(str==='tomorrow' || str==='tmrw' || str==='tmr' || str==='tmrrw') return addDaysToDateStr(todayStr(), 1);
  if(str==='yesterday') return addDaysToDateStr(todayStr(), -1);

  for(let i=0;i<WEEKDAY_NAMES.length;i++){
    const name = WEEKDAY_NAMES[i];
    if(str===name || str===name.slice(0,3)){
      let delta = (i - today.getDay() + 7) % 7; // today itself counts as a match
      return addDaysToDateStr(todayStr(), delta);
    }
  }

  let m = str.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if(m){
    const month = parseInt(m[1],10), day = parseInt(m[2],10);
    if(month>=1 && month<=12 && day>=1 && day<=31){
      let year;
      if(m[3]){
        year = parseInt(m[3],10);
        if(m[3].length===2) year += 2000;
      } else {
        year = today.getFullYear();
      }
      let iso = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      if(!m[3] && isDueWithinDays(iso, -30)) iso = `${year+1}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      return iso;
    }
  }

  m = str.match(/^([a-z]+)\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
  if(m){
    // Prefix match (not just the strict 3-letter abbreviation) so common
    // 4-letter forms like "sept" or "jan." also resolve — month names are
    // distinct enough at 3+ characters that this can't collide.
    const monthIdx = MONTH_NAMES.findIndex(name => name===m[1] || (m[1].length>=3 && name.startsWith(m[1])));
    const day = parseInt(m[2],10);
    if(monthIdx>=0 && day>=1 && day<=31){
      const year = m[3] ? parseInt(m[3],10) : today.getFullYear();
      let iso = `${year}-${String(monthIdx+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      if(!m[3] && isDueWithinDays(iso, -30)) iso = `${year+1}-${String(monthIdx+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      return iso;
    }
  }

  return '';
}

// A task mid-completingTaskIds' linger (see its own comment,
// 02-storage-state.js) sorts as though it were still open — otherwise it
// would jump straight to the bottom of the list the instant its status
// flips to 'done', before the celebration animation and collapse ever get
// a chance to play in its original spot.
function isDoneForSort(t){
  return t.status==='done' && !completingTaskIds.has(t.id);
}

function sortTasks(list){
  return list.slice().sort((a,b)=>{
    if(isDoneForSort(a) !== isDoneForSort(b)) return isDoneForSort(a) ? 1 : -1;
    if(a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    // Priority slots in between the urgent flag and due date — tasks that
    // never set it (the default, 0) tie here and fall through to due date
    // exactly as before, so this is a no-op for anyone not using the field.
    const ap = a.priority||0, bp = b.priority||0;
    if(ap !== bp) return bp - ap;
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    if(ad !== bd) return ad - bd;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function daysBetween(a, b){ return Math.round((new Date(b) - new Date(a)) / 86400000); }

// ---------- Sort modes ----------
// state.tasks' own array order IS "My Order" — dragging a task in
// 'default' mode splices it to a new spot in that array directly (see
// reorderTask() below), so there's no separate manual-order field to
// store or migrate; the order that's always been there just becomes a
// first-class, always-available view. Every other mode is a single sort
// key layered on top of the same "done sinks to the bottom" rule that
// sortTasks() already enforced, so switching modes never hides anything,
// just re-orders it. Ties fall back to array order since Array#sort is
// spec-guaranteed stable — that's what keeps 'default' mode a pure
// reflection of array order with only the done/open split imposed on it.
let sortMode = 'default';
// 'flagged' slots in right after 'default' — reordering-only, same as
// every other mode (see the big comment above), just keyed on t.urgent
// instead of a date/timeframe/category field. Distinct from flaggedOnly
// below: this only ever REORDERS (flagged tasks float to the top, nothing
// is ever hidden), consistent with every other sort mode here.
const SORT_MODE_LABELS = { default:'My Order', flagged:'Flagged First', mixed:'Mixed', timeframe:'Timeframe', newest:'Newest First', timestamp:'Oldest First', priority:'Priority', category:'Category' };
const TIMEFRAME_ORDER = { urgent:0, today:1, short:2, medium:3, long:4, '':5 };

function setSortMode(val){
  sortMode = val;
  render();
}

function applySortMode(list){
  const doneLast = (a,b) => isDoneForSort(a) !== isDoneForSort(b) ? (isDoneForSort(a)?1:-1) : 0;
  switch(sortMode){
    case 'flagged': return list.slice().sort((a,b)=> doneLast(a,b) || (a.urgent!==b.urgent ? (a.urgent?-1:1) : 0));
    case 'mixed': return sortTasks(list);
    case 'timeframe': return list.slice().sort((a,b)=> doneLast(a,b) || (TIMEFRAME_ORDER[a.timeframe||''] - TIMEFRAME_ORDER[b.timeframe||'']));
    case 'timestamp': return list.slice().sort((a,b)=> doneLast(a,b) || (new Date(a.createdAt) - new Date(b.createdAt)));
    case 'newest': return list.slice().sort((a,b)=> doneLast(a,b) || (new Date(b.createdAt) - new Date(a.createdAt)));
    case 'priority': return list.slice().sort((a,b)=> doneLast(a,b) || ((b.priority||0) - (a.priority||0)));
    case 'category': {
      const order = state.categories.map(c=>c.id);
      return list.slice().sort((a,b)=> doneLast(a,b) || (order.indexOf(a.category) - order.indexOf(b.category)));
    }
    default: return list.slice().sort(doneLast);
  }
}

// `includeCategory` gates the "Category" option — meaningful only where a
// list can mix multiple categories at once (the "All" tab, Daily's day
// detail). Inside a single category tab every visible task already shares
// that one category, so sorting "by category" is a silent no-op — omit
// the option there rather than offer a sort that does nothing.
// Renders as buttons for the #ctxMenu-based sort popover (see
// openSortMenu()/renderSortMenu(), 08-render-core.js) rather than
// <option> tags — the "custom menu, not a native <select>" the project
// owner asked for, matching the "Move to" category menu's own look
// (categoryMoveMenuHtml()). The current mode gets a leading ✓ rather than
// a CSS-only highlight, since a menu of plain-text buttons has no other
// obvious place to show "this one's already selected." 'flagged' is the
// one option with its own leading glyph (⚑, matching the flag button
// itself) regardless of current/not-current, called out per the project
// owner's own ask to mark it visually.
function sortMenuButtonsHtml(includeCategory){
  return Object.entries(SORT_MODE_LABELS)
    .filter(([k])=> includeCategory || k !== 'category')
    .map(([k,label])=>{
      const mark = sortMode===k ? '✓ ' : '';
      const flag = k==='flagged' ? '⚑ ' : '';
      return `<button class="${sortMode===k?'current':''}" onclick="ctxMenuAction(()=>setSortMode('${k}'))">${mark}${flag}${label}</button>`;
    }).join('');
}

// A pure FILTER (hides non-flagged tasks entirely), deliberately separate
// from the 'flagged' sort mode above rather than folded into it — the two
// answer different questions ("what order" vs. "what's even shown") and
// composing them (any sort mode, optionally flagged-only on top) is more
// useful than forcing a choice between "flagged floated to the top" and
// "flagged and nothing else," which a single mixed option could only ever
// offer one of at a time. Its own toggle button lives next to the sort
// button rather than inside the sort menu for the same reason: it isn't a
// sort option, so it doesn't belong in a menu of mutually-exclusive ones.
let flaggedOnly = false;
function toggleFlaggedOnly(){
  flaggedOnly = !flaggedOnly;
  render();
}

// The whole "SORT [button ▾] [flag toggle]" row — one shared definition
// (matching shareButtonHtml()'s own "one place, not per-call-site copies"
// reasoning, 19-sharing.js) so renderList()'s category/All-tab list and
// renderDayDetail()'s own day list (08-render-core.js/12-daily-tree.js —
// the two places a flat task list has its own sort control at all; the
// "add existing task to this day" tree picker doesn't sort linearly, so
// it never had one) can't drift apart. The sort button's own label always
// leads with ⚑ when 'flagged' is the active mode, same as the menu's own
// leading glyph for that option.
function sortControlHtml(includeCategory){
  const label = (sortMode==='flagged' ? '⚑ ' : '') + (SORT_MODE_LABELS[sortMode] || SORT_MODE_LABELS.default);
  return `
    <label class="fieldlabel">SORT</label>
    <button class="sortbtn" onclick="event.stopPropagation(); openSortMenu(this, ${includeCategory})">${label} <span class="sortcaret">▾</span></button>
    <button class="flagfilterbtn ${flaggedOnly?'on':''}" onclick="toggleFlaggedOnly()" title="${flaggedOnly ? 'Show all tasks' : 'Show flagged tasks only'}">⚑</button>
  `;
}

