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

const WEEKDAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const MONTH_NAMES = ['january','february','march','april','may','june','july','august','september','october','november','december'];

// Rudimentary natural-language date detection for steps — deliberately
// covers only the handful of shorthands actually asked for (today/
// tomorrow, weekday names, M/D[/YY], "Month Day") rather than a general
// date-parsing library. Returns '' rather than guessing when nothing
// matches, so a typo never silently saves the wrong date.
function parseNaturalDate(raw){
  const str = (raw||'').trim().toLowerCase().replace(/\b(\d+)(st|nd|rd|th)\b/,'$1');
  if(!str) return '';
  const today = new Date(todayStr()+'T00:00:00');
  if(str==='today') return todayStr();
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

function sortTasks(list){
  return list.slice().sort((a,b)=>{
    if((a.status==='done') !== (b.status==='done')) return a.status==='done' ? 1 : -1;
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
const SORT_MODE_LABELS = { default:'My Order', mixed:'Mixed', timeframe:'Timeframe', newest:'Newest First', timestamp:'Oldest First', priority:'Priority', category:'Category' };
const TIMEFRAME_ORDER = { urgent:0, today:1, short:2, medium:3, long:4, '':5 };

function setSortMode(val){
  sortMode = val;
  render();
}

function applySortMode(list){
  const doneLast = (a,b) => (a.status==='done') !== (b.status==='done') ? (a.status==='done'?1:-1) : 0;
  switch(sortMode){
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
function sortModeOptionsHtml(includeCategory){
  return Object.entries(SORT_MODE_LABELS)
    .filter(([k])=> includeCategory || k !== 'category')
    .map(([k,label])=>`<option value="${k}" ${sortMode===k?'selected':''}>${label}</option>`).join('');
}

