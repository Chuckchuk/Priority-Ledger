// ---------- Daily tab ----------

function monthKey(dateStr){ return dateStr.slice(0,7); }

function newId(prefix){ return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2,8); }

function addDaysToDateStr(dateStr, n){
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate()+n);
  return d.toISOString().slice(0,10);
}

// Whether Daily's own calendar view (opened via the "Calendar" tag on
// renderDayList(), see openDailyCalendar()/renderDailyCalendar() in
// 18-calendar.js) is showing in place of the day list — transient UI
// state, not persisted, same idiom as dayAddOpen just below. Deliberately
// NOT reset by openDay()/closeDay(): opening a date from the calendar
// itself sets this back to false (see openCalendarDay()) as part of the
// same navigation, so there's no window where both would be true at once.
let dailyCalendarOpen = false;

// Which of Daily's two peer master views — the day list or the calendar —
// is "home" right now, independent of whatever you're currently drilled
// into. dailyCalendarOpen alone can't answer this: it only means "the
// calendar grid is the literal thing on screen this instant," which is
// already false the moment you open a specific day from it
// (openCalendarDay() explicitly clears it before opening the day). Without
// a separate, more durable tracker, switchTab() away and back — or a page
// reload — had nothing left to tell it a day mid-view was ever reached via
// the calendar in the first place, and always fell back to the plain day
// list. setDailyLastView() (called from openDailyCalendar()/
// closeDailyCalendar() and openDay()'s own fromCalendar branch) is the
// single place this updates; switchTab() reads it to restore
// dailyCalendarOpen whenever you land back on the Daily tab. Persisted to
// plain localStorage (like ledger-last-tab) rather than synced state —
// this is a per-device UI preference, not ledger data — and restored in
// enterApp() (17-auth-ui.js) the same way.
let dailyLastView = localStorage.getItem('ledger-daily-view') === 'calendar' ? 'calendar' : 'list';
function setDailyLastView(view){
  dailyLastView = view;
  localStorage.setItem('ledger-daily-view', view);
}

// "Add to this day" tree picker state — transient UI state, not
// persisted, same idiom as expandedMonths above. Reset by
// resetDayAddPicker() whenever a day is opened or closed.
let dayAddOpen = false;
let dayTreeExpanded = new Set(); // open nodes, keyed 'cat:<id>' / 'task:<id>' / 'cklist:<id>'
// Which row (if any) just got toggled on/off the day, keyed the same way
// as dayTreeExpanded — read at render time to apply a one-shot fade
// animation, then cleared shortly after so an unrelated later re-render
// (which recreates the row's DOM node from scratch) doesn't replay it.
let dayTreeFlashKey = null;

// Which task's full-page detail view (opened from clicking a task or step
// within Daily — see openTaskDetailFromDay()) is showing on top of the
// current day's detail, if any. Transient UI state, reset the same places
// dayAddOpen/dayTreeExpanded are.
let taskDetailId = null;

function monthLabel(key){
  const [y,m] = key.split('-').map(Number);
  return new Date(y, m-1, 1).toLocaleDateString('en-US', { month:'long', year:'numeric' });
}

function dayLabel(dateStr){
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric' });
}

function tasksForDay(dateStr){
  return state.tasks.filter(t=>(t.plannedDates||[]).includes(dateStr));
}

// Of the whole tasks planned onto a day, the checklist lists among them
// render as checklist rows (dayChecklistRowHtml), not standard task rows
// — taskRowHtml doesn't know how to show a checklist's items/fields.
function standardTasksForDay(dateStr){
  return tasksForDay(dateStr).filter(t=>!isChecklistCategory(t.category));
}
function checklistDailyItemsForDay(dateStr){
  return tasksForDay(dateStr).filter(t=>isChecklistCategory(t.category));
}

// Steps planned onto a day independently of their parent task's own
// plannedDates — {task, sub} pairs. Checklist items aren't part of this;
// a checklist is planned onto a day as a whole list, same as a task.
function subDailyItemsForDay(dateStr){
  const out = [];
  state.tasks.forEach(t=>{
    if(isChecklistCategory(t.category)) return;
    (t.subtasks||[]).forEach(s=>{
      if((s.plannedDates||[]).includes(dateStr)) out.push({ task:t, sub:s });
    });
  });
  return out;
}

// A day's tasks/steps/checklist-lists reduced to the actual countable/
// movable "leaf units" — what dayItemsSummary()'s total/done counts, and
// what moveIncompleteForward()/moveDayUnfinishedToToday() actually move.
// Naively counting every whole task *and* every step separately double-
// counts a task that has its own steps planned the same day — a task
// with 2 steps (one done, one not) would read as "2 unfinished" (the
// task plus the open step) instead of the 1 real thing still open. The
// rule: a standard task with steps also planned on this same day isn't
// its own unit while any of those steps is still open *and the task
// itself hasn't been marked done* — each step is the unit instead. Two
// ways out of that: once every one of those steps is done, the parent's
// own checkbox becomes the one remaining unit (a finished step list with
// an unchecked parent is "one thing left to close out," not zero and not
// a phantom extra); or the parent gets checked off directly — from
// anywhere, not necessarily this day's own view — which counts as done
// regardless of what its steps say, since checking the parent off is a
// deliberate "I'm calling this whole thing finished" action that
// supersedes the steps-are-the-real-work heuristic, not something the
// heuristic should keep contradicting. Either way, once the parent counts
// as its own unit, its steps stop counting as separate ones — only one of
// "the parent" or "its open-that-day steps" is ever the unit(s) for a
// given task, never both. A step whose parent isn't planned whole on this
// day (an "orphan" step, no row to nest under — see daySubtaskRowHtml's
// `nested` param) always counts on its own, since there's no parent unit
// it could conflict with either way. A checklist list has no such nesting
// to worry about — its own items aren't independently planned onto a day
// the way a standard task's steps are, only the whole list is — so each
// one is simply its own unit, done when the list's own status is.
function dayLeafUnits(dateStr){
  const tasks = standardTasksForDay(dateStr);
  const subs = subDailyItemsForDay(dateStr);
  const lists = checklistDailyItemsForDay(dateStr);
  const byParent = {};
  subs.forEach(x=>{ (byParent[x.task.id] = byParent[x.task.id] || []).push(x); });
  const taskIds = new Set(tasks.map(t=>t.id));

  const units = [];
  tasks.forEach(t=>{
    const kids = byParent[t.id];
    if(!kids || !kids.length || t.status==='done' || kids.every(x=>x.sub.done)){
      units.push({ kind:'task', task:t, done: t.status==='done' });
    } else {
      kids.forEach(x=>units.push({ kind:'sub', task:x.task, sub:x.sub, done: x.sub.done }));
    }
  });
  subs.forEach(x=>{
    if(!taskIds.has(x.task.id)) units.push({ kind:'sub', task:x.task, sub:x.sub, done: x.sub.done });
  });
  lists.forEach(t=>units.push({ kind:'checklist', task:t, done: t.status==='done' }));
  return units;
}

// Unified "how much is on this day, how much of it's done" across all
// three kinds of daily item — used by the day-list ratio badge, the
// day-detail header, and the Daily tab's badge count, so all three agree
// once steps/checklists can be planned onto a day too.
function dayItemsSummary(dateStr){
  const units = dayLeafUnits(dateStr);
  return { total: units.length, done: units.filter(u=>u.done).length };
}

// Distinct categories touching a day, in state.categories' own display
// order (not task-insertion order, so the same category always shows in
// the same relative position regardless of which of its tasks happens to
// be first) — feeds the Calendar's category-color chips (see
// calendarCatChipsHtml() in 18-calendar.js). A step's own category is its
// parent task's, same as everywhere else steps are treated as belonging
// to that task rather than tracked separately.
function dayCategoryIds(dateStr){
  const ids = new Set();
  standardTasksForDay(dateStr).forEach(t=>ids.add(t.category));
  checklistDailyItemsForDay(dateStr).forEach(t=>ids.add(t.category));
  subDailyItemsForDay(dateStr).forEach(x=>ids.add(x.task.category));
  return state.categories.filter(c=>ids.has(c.id));
}

async function ensureDay(dateStr){
  if(!state.days.includes(dateStr)){
    state.days.unshift(dateStr);
    queueSave();
  }
}

// Today, or the next day after that not yet in state.days — what the
// quick-add button in renderDayList() targets and labels itself after
// (see showQuickAddBtn/quickAddLabel there), shared here so the two can
// never disagree about which day is next.
function nextOpenDay(){
  let d = todayStr();
  while(state.days.includes(d)) d = addDaysToDateStr(d, 1);
  return d;
}

async function addDay(){
  const dateStr = nextOpenDay();
  pushUndo('Added a day');
  await ensureDay(dateStr);
  selectedDay = dateStr;
  render();
}

// The masthead's own "Today" shortcut (#dailyShortcutBtn, top of the
// screen next to the settings gear — see shell-body.html), not the
// "Daily" tab itself: the tab uses the plain switchTab('daily') every
// other tab does, landing wherever Daily was last left (the day list, a
// specific day, the calendar view); this button always jumps straight to
// today's own day-detail page regardless. switchTab() still runs first
// for everything else it does (closing Settings/the Claude view/overlays,
// resetting per-tab UI state); dailyCalendarOpen is cleared explicitly
// since openDay() alone wouldn't override it — renderDaily() checks that
// before selectedDay. Mirrors openCalendarDay()'s "only pushUndo if this
// actually creates a new day" rule, not addDay()'s unconditional one,
// since unlike addDay() (which only ever targets a day that doesn't exist
// yet) today may already be logged.
async function goToDailyToday(){
  switchTab('daily');
  dailyCalendarOpen = false;
  const today = todayStr();
  if(!state.days.includes(today)) pushUndo('Added a day');
  await ensureDay(today);
  openDay(today);
}

// Replaces the old "Pick a date…" toggle + native <input type=date> +
// separate "Add this day" button with a single always-visible text field,
// parsed the same way a step's own due date is (see parseNaturalDate() in
// 05-dates-sort.js and startEditSubtaskDate() in 15-subtask-edit.js) —
// "tmrw", "tue", "9/1" all work, not just a literal calendar click.
// The Calendar view (openDailyCalendar()) is the click-through-a-grid
// alternative now, so this doesn't need to also cover that case itself.
// Unparseable input is left in the field rather than cleared or guessed
// at, same reasoning the subtask date editor already uses — the field
// simply isn't cleared because render() never runs to replace it.
async function addDayByText(){
  const input = document.getElementById('dayAddTextInput');
  const raw = input ? input.value.trim() : '';
  if(!raw) return;
  const parsed = parseNaturalDate(raw);
  if(!parsed) return;
  if(!state.days.includes(parsed)) pushUndo('Added a day');
  await ensureDay(parsed);
  selectedDay = parsed;
  render();
}

// Replaces the old whole-day reschedule + "copy unfinished as new tasks"
// pair — the project owner found the "Move this Day To" date-picker
// distracting and wanted it gone, with the copy-forward behavior kept but
// changed to actually carry the *same* task/step forward (via the
// plannedDates array — see the migration note in normalizeState()) rather
// than minting duplicate task objects. An item already carrying tomorrow's
// date is skipped, so mashing this button repeatedly can't pile up
// duplicate entries on tomorrow's list the way the old copy did.
// Shared by moveIncompleteForward() and moveDayUnfinishedToToday() —
// copies every unfinished leaf unit (see dayLeafUnits()) from `dateStr`
// onto `targetDate`, additively (plannedDates gains targetDate, dateStr's
// own entry is untouched) and idempotently (a unit already carrying
// targetDate is skipped, so re-running this can't pile up duplicates).
// Checklist lists move right along with tasks/steps here — same
// plannedDates-carrying object as a 'task' unit, just sourced from
// checklistDailyItemsForDay() instead of standardTasksForDay() (see
// dayLeafUnits()).
async function copyDayUnfinishedTo(dateStr, targetDate, undoLabel){
  const unfinished = dayLeafUnits(dateStr).filter(u=>!u.done);
  if(unfinished.length===0) return false;
  pushUndo(undoLabel);
  await ensureDay(targetDate);
  unfinished.forEach(u=>{
    const obj = u.kind==='sub' ? u.sub : u.task;
    if(!obj.plannedDates) obj.plannedDates = [];
    if(!obj.plannedDates.includes(targetDate)) obj.plannedDates.push(targetDate);
  });
  render();
  queueSave();
  return true;
}

// The day-detail page's own bulk "Move N incomplete → [date]" button (see
// renderDayDetail(), 12-daily-tree.js) — targets moveForwardTarget()'s
// target (14-task-actions.js), same "today if dateStr's already passed,
// tomorrow otherwise" rule the per-row .movenext button uses, rather than
// always dateStr+1. That naive +1 used to land a past day's leftovers on
// some other past (or barely-past) day instead of anywhere actually
// actionable — the exact bug .movenext had before it was fixed the same
// way. Renamed from moveIncompleteToTomorrow() since it was never really
// always tomorrow, same reasoning .movetmrw was renamed to .movenext.
async function moveIncompleteForward(dateStr){
  const target = moveForwardTarget(dateStr);
  const label = target===todayStr() ? 'Moved incomplete items to today' : 'Moved incomplete items to tomorrow';
  await copyDayUnfinishedTo(dateStr, target, label);
}

// The day-list's own per-past-day "N unfinished" marker (see
// dayItemHtml()) — copies that day's unfinished leaf units onto *today*
// unconditionally, regardless of how far in the past the day is. Reached
// from a different surface than moveIncompleteForward() above (the plain
// day list vs. a day's own detail page), but the two necessarily agree
// once a day's in the past, since that's exactly what
// moveForwardTarget() resolves to there too. Same copy (not remove)
// semantics either way: the original day keeps its full history, today
// just also picks up whatever's still open.
async function moveDayUnfinishedToToday(dateStr){
  await copyDayUnfinishedTo(dateStr, todayStr(), 'Moved unfinished items to today');
}

function resetDayAddPicker(){
  dayAddOpen = false;
  dayTreeExpanded = new Set();
  dayTreeFlashKey = null;
  taskDetailId = null;
}

// `fromCalendar` is optional — only openCalendarDay() (and goToAdjacentDay(),
// threading the already-open day's own value through) ever pass it.
// Every other call site (the plain day-list row, "+ Add a Day", the date
// picker) omits it, which resets dayReturnToCalendar to false even if an
// earlier day had left it true, so "opened from the calendar" can never
// leak into an unrelated later day the way checklistReturnDay guards
// against the same thing for checklist lists.
function openDay(dateStr, fromCalendar){
  selectedDay = dateStr;
  dayReturnToCalendar = !!fromCalendar;
  setDailyLastView(fromCalendar ? 'calendar' : 'list');
  // Always false here, regardless of whatever it was set to a moment ago —
  // opening a specific day always means the day *detail* is what should
  // render, never the grid (renderDaily() checks dailyCalendarOpen before
  // selectedDay), and this can't safely assume a caller already cleared
  // it. openCalendarDay() used to rely on exactly that assumption (setting
  // dailyCalendarOpen = false itself, one line before calling
  // switchTab('daily')) — but switchTab() now restores dailyCalendarOpen
  // from dailyLastView on every call (see its own comment), and
  // dailyLastView is still 'calendar' at that point (this call hasn't run
  // yet to update it), so that switchTab() call was clobbering the false
  // right back to true before this function ever got a chance to run —
  // new days opened from the calendar were creating the day correctly but
  // landing back on the calendar grid instead of the day itself. Owning
  // this line here instead of trusting the caller closes that gap for
  // good, regardless of what any future caller does or doesn't clear
  // first.
  dailyCalendarOpen = false;
  resetDayAddPicker();
  render();
}
function closeDay(){
  selectedDay = null;
  resetDayAddPicker();
  if(dayReturnToCalendar){
    dayReturnToCalendar = false;
    dailyCalendarOpen = true;
    setDailyLastView('calendar');
  }
  render();
}

// Reached from the day-context-menu (see dayContextMenuHtml() in
// 08-render-core.js) — removes the day itself from state.days and un-plans
// every task/step that had it in their own plannedDates (their
// plannedDates just loses that one date; the task/step itself, and any
// other days it's still planned on, are untouched). Without this cleanup
// a deleted day would leave orphaned dates behind that ensureDay() would
// silently resurrect the moment anything referencing them got touched
// again. Checklist lists go through the same plannedDates field as
// standard tasks (see tasksForDay()), so the one loop below already
// covers them too — no separate pass needed. Closes the day-detail page
// first if you were looking at the very day being deleted (same as
// clicking "All Days"/Esc would), rather than leaving it open on a day
// that no longer exists.
async function deleteDay(dateStr){
  pushUndo(`Deleted ${dayLabel(dateStr)}`);
  state.tasks.forEach(task=>{
    if(task.plannedDates && task.plannedDates.includes(dateStr)){
      task.plannedDates = task.plannedDates.filter(d=>d!==dateStr);
    }
    (task.subtasks||[]).forEach(s=>{
      if(s.plannedDates && s.plannedDates.includes(dateStr)){
        s.plannedDates = s.plannedDates.filter(d=>d!==dateStr);
      }
    });
  });
  state.days = state.days.filter(d=>d!==dateStr);
  if(selectedDay === dateStr) closeDay(); else render();
  queueSave();
}

// Chronological, not state.days' own insertion order (state.days.unshift()
// in ensureDay() means the array itself is newest-first) — "previous"/
// "next" on a day-detail page should mean the closest earlier/later day
// you've actually logged, matching what the left/right arrows visually
// promise, not whichever day happened to be added most recently.
function sortedDayList(){ return state.days.slice().sort((a,b)=>a.localeCompare(b)); }

// null when `dateStr` isn't in state.days at all, or sits at either end
// of the list — both cases the day-detail page's arrow just renders
// disabled rather than erroring or wrapping around.
function adjacentDayStr(dateStr, dir){
  const days = sortedDayList();
  const idx = days.indexOf(dateStr);
  if(idx === -1) return null;
  const target = days[idx + dir];
  return target === undefined ? null : target;
}

// Pure navigation (openDay() itself isn't undo-tracked either) — moving
// to an adjacent day you've already logged isn't a content change, same
// reasoning switchTab()/toggleLocation() already lean on elsewhere.
function goToAdjacentDay(dir){
  const target = adjacentDayStr(selectedDay, dir);
  if(!target) return;
  openDay(target, dayReturnToCalendar);
}

function toggleMonthGroup(key){
  if(expandedMonths.has(key)) expandedMonths.delete(key); else expandedMonths.add(key);
  renderDaily();
}

function renderDaily(){
  const el = document.getElementById('dailyView');
  if(taskDetailId && !state.tasks.find(t=>t.id===taskDetailId)) taskDetailId = null;
  if(dailyCalendarOpen){
    el.innerHTML = renderDailyCalendar();
  } else if(selectedDay && taskDetailId){
    el.innerHTML = renderTaskDetailPage(taskDetailId, 'closeTaskDetail()', 'Daily');
  } else {
    el.innerHTML = selectedDay ? renderDayDetail(selectedDay) : renderDayList();
  }
}

// Spells out small numbers ("Two Weeks", not "2 Weeks") for the coarser
// bands of dayHeaderTag() below — exact counts (8-13 days) stay digits,
// since "Nine Days" doesn't read any better than "9 Days" and would need
// a much longer word list.
const DAY_TAG_NUMBER_WORDS = ['Zero','One','Two','Three','Four','Five','Six'];
function dayTagNumberWord(n){
  return DAY_TAG_NUMBER_WORDS[n] || String(n);
}

// Large "which day is this" label shown centered atop a day's detail
// page — distinct from the h2 (which always shows the full weekday+date).
// Graduated from exact (today/tomorrow/yesterday, a weekday name) to
// increasingly rounded the further out a date is, on both sides of today:
//   0/±1 day     Today / Tomorrow / Yesterday
//   2-6 days     a weekday name — "Friday" / "Last Monday"
//   7 days       One Week / Last Week — a bare weekday would just repeat
//                today's own, which reads oddly ("last Wednesday" when
//                today already is Wednesday)
//   8-13 days    exact day count — "9 Days" / "9 Days Ago"
//   14-27 days   rounded to the nearest week — "Two Weeks" / "Three Weeks Ago"
//   ~1-6 months  rounded to the nearest ~30-day month — "Next Month" /
//                "Two Months Away" / "Three Months Ago"
//   beyond that  nothing — a date far enough out that a rounded label
//                stops being useful context, same as the original 7-day
//                cutoff this replaces.
function dayHeaderTag(dateStr){
  const diffDays = Math.round((new Date(dateStr+'T00:00:00') - new Date(todayStr()+'T00:00:00')) / 86400000);
  if(diffDays === 0) return { text:'Today', today:true };
  if(diffDays === 1) return { text:'Tomorrow', today:false };
  if(diffDays === -1) return { text:'Yesterday', today:false };

  const future = diffDays > 0;
  const abs = Math.abs(diffDays);
  const weekday = () => new Date(dateStr+'T00:00:00').toLocaleDateString('en-US', { weekday:'long' });

  if(abs <= 6) return { text: future ? weekday() : `Last ${weekday()}`, today:false };
  if(abs === 7) return { text: future ? 'One Week' : 'Last Week', today:false };
  if(abs <= 13) return { text: future ? `${abs} Days` : `${abs} Days Ago`, today:false };
  if(abs < 28){
    const w = dayTagNumberWord(Math.round(abs / 7));
    return { text: future ? `${w} Weeks` : `${w} Weeks Ago`, today:false };
  }
  const months = Math.round(abs / 30);
  if(months >= 1 && months <= 6){
    if(months === 1) return { text: future ? 'Next Month' : 'Last Month', today:false };
    const w = dayTagNumberWord(months);
    return { text: future ? `${w} Months Away` : `${w} Months Ago`, today:false };
  }
  return null;
}

function renderDayList(){
  const days = state.days.slice().sort((a,b)=> b.localeCompare(a));
  // Compact page tag, same component the checklist overview's "Pending"
  // trigger uses — see openDailyCalendar()/renderDailyCalendar() in
  // 18-calendar.js. Always shown (not gated behind "only if there's
  // something to see," unlike the checklist's Pending count), since a
  // calendar view is useful even for a currently-empty month.
  let html = pageTagHtml('openDailyCalendar()', 'Calendar', true);
  // The quick-add button only ever targets today or tomorrow (see
  // nextOpenDay()) — once both are already logged, it would otherwise
  // silently jump to whatever day comes after tomorrow, which is exactly
  // the "vague, doesn't say what it'll actually do" problem the plain
  // "+ Add a Day" label had. Simplest fix is to just stop offering it
  // past that point rather than trying to keep labeling it accurately
  // for an ever-further-out target — the text field below still covers
  // any day, named or not.
  const quickAddDate = nextOpenDay();
  const quickAddDiffDays = Math.round((new Date(quickAddDate) - new Date(todayStr())) / 86400000);
  const showQuickAddBtn = quickAddDiffDays <= 1;
  const todayMissing = quickAddDiffDays === 0;
  const quickAddLabel = todayMissing ? '+ Add Today' : '+ Add Tomorrow';
  // .solo — once both today and tomorrow are already logged,
  // showQuickAddBtn goes false and this field is the only way left to add
  // a day at all, so it picks up the same Primary treatment the button it
  // just lost would have had (see .dayaddtext.solo in <style>).
  const textField = `<input type="text" class="dayaddtext ${showQuickAddBtn?'':'solo'}" id="dayAddTextInput" placeholder="Add a day… (today, tmrw, 9/1, tue…)" onkeydown="if(event.key==='Enter') addDayByText()">`;
  // Today missing entirely gets its own oversized, attention-grabbing
  // button on a row by itself — sharing a row with the day-text-field the
  // way "+ Add Tomorrow" (today already logged) does would cramp it back
  // down to ordinary-button size. Per the project owner's explicit ask:
  // this is the one state on this page worth interrupting the normal scan
  // for, since every other view in Daily assumes today already exists.
  html += todayMissing ? `
    <div class="addtodayrow"><button class="addday addtodayhero" onclick="addDay()">${quickAddLabel}</button></div>
    <div class="adddayrow">${textField}</div>
  ` : `
    <div class="adddayrow">
      ${showQuickAddBtn ? `<button class="addday" onclick="addDay()">${quickAddLabel}</button>` : ''}
      ${textField}
    </div>
  `;

  if(days.length===0){
    html += `<div class="empty">No days logged yet. Add today and start a priority list.</div>`;
    return html;
  }

  const curKey = monthKey(todayStr());
  const currentDays = days.filter(d=>monthKey(d)===curKey);
  const otherDays = days.filter(d=>monthKey(d)!==curKey);
  const otherGroups = {};
  otherDays.forEach(d=>{ const k=monthKey(d); (otherGroups[k]=otherGroups[k]||[]).push(d); });
  // Descending (newest month first) throughout, same direction days
  // within a single month already sort in — a future month is just a
  // continuation of that same "newest first" order, not a special case,
  // so it has to land *above* "This Month" (closest future month
  // directly above it), not lumped in with past months below just
  // because both used to share one "not the current month" bucket.
  const otherKeys = Object.keys(otherGroups).sort((a,b)=>b.localeCompare(a));
  const futureKeys = otherKeys.filter(k=>k>curKey);
  const pastKeys = otherKeys.filter(k=>k<curKey);

  const monthGroupHtml = (k) => {
    const open = expandedMonths.has(k);
    return `
      <div class="monthgroup">
        <button class="monthhead" onclick="toggleMonthGroup('${k}')">
          <span>${monthLabel(k)}</span>
          <span class="count">${otherGroups[k].length} day${otherGroups[k].length===1?'':'s'} ${open?'▾':'▸'}</span>
        </button>
        ${open ? `<div class="monthbody">${otherGroups[k].map(dayItemHtml).join('')}</div>` : ''}
      </div>`;
  };

  html += futureKeys.map(monthGroupHtml).join('');
  html += `<div class="daylistlabel">This Month</div>`;
  html += currentDays.length
    ? currentDays.map(dayItemHtml).join('')
    : `<div class="empty" style="padding:14px 4px;">Nothing logged yet this month.</div>`;
  html += pastKeys.map(monthGroupHtml).join('');

  return html;
}

function dayItemHtml(dateStr){
  const { total, done } = dayItemsSummary(dateStr);
  const ratio = total ? `<span class="badge subcount">${done}/${total}</span>` : `<span class="badge due">Empty</span>`;
  const isToday = dateStr === todayStr();
  const isPast = dateStr < todayStr();
  // Only worth computing/showing on days that have already happened —
  // dayLeafUnits() is the same leaf-counting rule dayItemsSummary()'s own
  // total/done use (see the comment there), so this count and the ratio
  // badge above it can never disagree about what "1 unfinished" means.
  const unfinishedCount = isPast ? dayLeafUnits(dateStr).filter(u=>!u.done).length : 0;
  // A <button> can't nest another interactive <button> (the "move to
  // today" action), so the row is a wrapping div with .dayitem as the
  // main clickable button and this as a sibling — border-bottom lives on
  // the wrapper now so the divider still spans the whole grouped row
  // whether or not the second line is present.
  return `
    <div class="dayitemgroup">
      <button class="dayitem ${isToday ? 'today' : ''}" onclick="openDay('${dateStr}')" oncontextmenu="return handleDayContextMenu(event,'${dateStr}')">
        <span class="daydate">${dayLabel(dateStr)}${isToday ? '<span class="todaytag">Today</span>' : ''}</span>
        ${ratio}
      </button>
      ${unfinishedCount>0 ? `
      <button class="dayunfinished" onclick="event.stopPropagation(); moveDayUnfinishedToToday('${dateStr}')" title="Copy ${unfinishedCount} unfinished item${unfinishedCount===1?'':'s'} onto today's list">
        ${unfinishedCount} unfinished → Today
      </button>` : ''}
    </div>`;
}

// A task is a candidate to manually add to a day as long as it's simply
// not done — a due date, near or far, no longer restricts what shows up
// here (it used to require due-today/overdue/within-3-days, which meant a
// task due further out just silently didn't appear in the tree at all,
// with no way to plan it onto an earlier day on purpose). The due-date
// window still matters for *automatic* planning — see
// sweepDueSoonPlanning() below — this is only about what a manual "Add to
// this day" pick offers. Scoped to one category at a time since both
// picker styles browse category-first.
function dayCandidateTasks(categoryId){
  return state.tasks.filter(t=>
    t.category===categoryId && t.status!=='done' && !isChecklistCategory(t.category)
  );
}

// Catches a due date up with today's own date moving forward — without
// this, updateDueDate()/updateSubtaskDueDate()'s auto-plan-onto-the-due-
// day only ever fires the instant a due date is *typed*. A date set days
// or weeks ahead of time, when it was still outside isDueWithinDays' 3-
// day/overdue window, would sit there forever with nothing re-checking it
// as the calendar actually caught up to it — the exact case the project
// owner reported (a step dated for "today" a few days after being set,
// never auto-planned since nobody touched that field again in between).
// Called once at login/reload (enterApp(), 17-auth-ui.js) and again
// whenever the calendar date itself has changed since the last run (see
// the visibilitychange listener in 20-bootstrap.js) — gated on
// lastDueSweepDate so it's a no-op on every other tick, since nothing new
// could have entered the window without today's own date moving.
//
// Purely additive and idempotent, same guarantees as the edit-time
// version: a due date already in plannedDates is skipped, and a task/step
// that's already done or cancelled is never swept in — a step finished
// before its due day ever arrived isn't "coming up" anymore, it's just
// done, so there's nothing left to plan for. But once a still-open item
// *has* been swept onto a day, completing it afterward never pulls it
// back off — same one-way rule the edit-time version follows — so a step
// you finished ahead of an approaching deadline still shows as
// accomplished on the day it was due, not silently removed for having
// been checked off "too early."
//
// Deliberately not pushUndo()'d — this runs on its own, not in response
// to a single user gesture, so there's no one action for Cmd+Z to
// sensibly hand back; the mutation itself (plannedDates/state.days) still
// gets queueSave()'d and rendered like any other change.
let lastDueSweepDate = null;
async function sweepDueSoonPlanning(){
  const today = todayStr();
  if(lastDueSweepDate === today) return;
  lastDueSweepDate = today;
  const newDays = new Set();
  let changed = false;
  state.tasks.forEach(t=>{
    if(isChecklistCategory(t.category)) return;
    if(t.status!=='done' && !t.cancelled && t.dueDate && isDueWithinDays(t.dueDate, 3)){
      if(!t.plannedDates) t.plannedDates = [];
      if(!t.plannedDates.includes(t.dueDate)){
        t.plannedDates.push(t.dueDate);
        newDays.add(t.dueDate);
        changed = true;
      }
    }
    (t.subtasks||[]).forEach(s=>{
      if(s.done || s.cancelled || !s.dueDate || !isDueWithinDays(s.dueDate, 3)) return;
      if(!s.plannedDates) s.plannedDates = [];
      if(!s.plannedDates.includes(s.dueDate)){
        s.plannedDates.push(s.dueDate);
        newDays.add(s.dueDate);
        changed = true;
      }
    });
  });
  if(!changed) return;
  for(const d of newDays) await ensureDay(d);
  render();
  queueSave();
}

function toggleDayAdd(){
  dayAddOpen = !dayAddOpen;
  renderDaily();
}

