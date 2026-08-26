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

// Unified "how much is on this day, how much of it's done" across all
// three kinds of daily item — used by the day-list ratio badge, the
// day-detail header, and the Daily tab's badge count, so all three agree
// once steps/checklists can be planned onto a day too.
function dayItemsSummary(dateStr){
  const tasks = standardTasksForDay(dateStr);
  const subs = subDailyItemsForDay(dateStr);
  const lists = checklistDailyItemsForDay(dateStr);
  return {
    total: tasks.length + subs.length + lists.length,
    done: tasks.filter(t=>t.status==='done').length
      + subs.filter(x=>x.sub.done).length
      + lists.filter(t=>t.status==='done').length
  };
}

// Distinct categories touching a day, in state.categories' own display
// order (not task-insertion order, so the same category always shows in
// the same relative position regardless of which of its tasks happens to
// be first) — EXPERIMENTAL, feeds the Calendar's dev-only calendarCellStyle
// variants (see calendarCatChipsHtml() in 18-calendar.js). A step's own
// category is its parent task's, same as everywhere else steps are
// treated as belonging to that task rather than tracked separately.
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
async function moveIncompleteToTomorrow(dateStr){
  const nextDate = addDaysToDateStr(dateStr, 1);
  // Checklist lists excluded — a whole named list doesn't have the
  // "incomplete" urgency a standard task/step does, same reasoning the
  // old cascade used.
  const tasks = standardTasksForDay(dateStr).filter(t=>t.status!=='done');
  const subs = subDailyItemsForDay(dateStr).filter(x=>!x.sub.done);
  if(tasks.length===0 && subs.length===0) return;
  pushUndo('Moved incomplete items to tomorrow');
  await ensureDay(nextDate);
  tasks.forEach(t=>{
    if(!t.plannedDates) t.plannedDates = [];
    if(!t.plannedDates.includes(nextDate)) t.plannedDates.push(nextDate);
  });
  subs.forEach(({sub})=>{
    if(!sub.plannedDates) sub.plannedDates = [];
    if(!sub.plannedDates.includes(nextDate)) sub.plannedDates.push(nextDate);
  });
  render();
  queueSave();
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
  resetDayAddPicker();
  render();
}
function closeDay(){
  selectedDay = null;
  resetDayAddPicker();
  if(dayReturnToCalendar){
    dayReturnToCalendar = false;
    dailyCalendarOpen = true;
  }
  render();
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
    el.innerHTML = renderTaskDetailPage(taskDetailId, selectedDay);
  } else {
    el.innerHTML = selectedDay ? renderDayDetail(selectedDay) : renderDayList();
  }
}

// Large "which day is this" label shown centered atop a day's detail page
// — distinct from the h2 (which always shows the full weekday+date). Today
// and yesterday/tomorrow are unambiguous by name; 2-7 days out only reads
// as a weekday, since "in 5 days" doesn't have a name people reach for;
// beyond that window (or more than a day in the past) there's nothing
// clarifying to say, so it renders nothing at all.
function dayHeaderTag(dateStr){
  const diffDays = Math.round((new Date(dateStr+'T00:00:00') - new Date(todayStr()+'T00:00:00')) / 86400000);
  if(diffDays === 0) return { text:'Today', today:true };
  if(diffDays === 1) return { text:'Tomorrow', today:false };
  if(diffDays === -1) return { text:'Yesterday', today:false };
  if(diffDays >= 2 && diffDays <= 7) return { text: new Date(dateStr+'T00:00:00').toLocaleDateString('en-US', { weekday:'long' }), today:false };
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
  const quickAddLabel = quickAddDiffDays === 0 ? '+ Add Today' : '+ Add Tomorrow';
  html += `
    <div class="adddayrow">
      ${showQuickAddBtn ? `<button class="addday" onclick="addDay()">${quickAddLabel}</button>` : ''}
      <input type="text" class="dayaddtext" id="dayAddTextInput" placeholder="Add a day… (today, tmrw, 9/1, tue…)" onkeydown="if(event.key==='Enter') addDayByText()">
    </div>
  `;

  if(days.length===0){
    html += `<div class="empty">No days logged yet. Add today and start a priority list.</div>`;
    return html;
  }

  const curKey = monthKey(todayStr());
  const currentDays = days.filter(d=>monthKey(d)===curKey);
  const pastDays = days.filter(d=>monthKey(d)!==curKey);
  const pastGroups = {};
  pastDays.forEach(d=>{ const k=monthKey(d); (pastGroups[k]=pastGroups[k]||[]).push(d); });
  const pastKeys = Object.keys(pastGroups).sort((a,b)=>b.localeCompare(a));

  html += `<div class="daylistlabel">This Month</div>`;
  html += currentDays.length
    ? currentDays.map(dayItemHtml).join('')
    : `<div class="empty" style="padding:14px 4px;">Nothing logged yet this month.</div>`;

  pastKeys.forEach(k=>{
    const open = expandedMonths.has(k);
    html += `
      <div class="monthgroup">
        <button class="monthhead" onclick="toggleMonthGroup('${k}')">
          <span>${monthLabel(k)}</span>
          <span class="count">${pastGroups[k].length} day${pastGroups[k].length===1?'':'s'} ${open?'▾':'▸'}</span>
        </button>
        ${open ? `<div class="monthbody">${pastGroups[k].map(dayItemHtml).join('')}</div>` : ''}
      </div>`;
  });

  return html;
}

function dayItemHtml(dateStr){
  const { total, done } = dayItemsSummary(dateStr);
  const ratio = total ? `<span class="badge subcount">${done}/${total}</span>` : `<span class="badge due">Empty</span>`;
  const isToday = dateStr === todayStr();
  return `
    <button class="dayitem" onclick="openDay('${dateStr}')">
      <span class="daydate">${dayLabel(dateStr)}${isToday ? '<span class="todaytag">Today</span>' : ''}</span>
      ${ratio}
    </button>`;
}

// A step or a whole checklist is a candidate to add to a day the same
// way a whole task is: not done, and — if due-dated — due today,
// overdue, or due within 3 days (a dateless task/step stays eligible
// unconditionally). Scoped to one category at a time since both picker
// styles browse category-first.
function dayCandidateTasks(dateStr, categoryId){
  return state.tasks.filter(t=>
    t.category===categoryId && t.status!=='done' && !isChecklistCategory(t.category) &&
    (!t.dueDate || isDueWithinDays(t.dueDate, 3))
  );
}

function toggleDayAdd(){
  dayAddOpen = !dayAddOpen;
  renderDaily();
}

