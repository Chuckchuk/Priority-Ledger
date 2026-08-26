// ---------- Daily tab ----------

function monthKey(dateStr){ return dateStr.slice(0,7); }

function newId(prefix){ return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2,8); }

function addDaysToDateStr(dateStr, n){
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate()+n);
  return d.toISOString().slice(0,10);
}

let pickerOpen = false;

// "Add to this day" tree picker state — transient UI state, not
// persisted, same idiom as pickerOpen/expandedMonths above. Reset by
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

async function ensureDay(dateStr){
  if(!state.days.includes(dateStr)){
    state.days.unshift(dateStr);
    queueSave();
  }
}

async function addDay(){
  // Default is today — but if today (and however many days after it) already
  // exist, roll forward to the next day that isn't taken yet, rather than
  // trying to create a duplicate "Today".
  let dateStr = todayStr();
  while(state.days.includes(dateStr)){
    dateStr = addDaysToDateStr(dateStr, 1);
  }
  pushUndo('Added a day');
  await ensureDay(dateStr);
  selectedDay = dateStr;
  render();
}

function togglePicker(){ pickerOpen = !pickerOpen; renderDaily(); }

async function confirmPickDate(){
  const input = document.getElementById('pickDateInput');
  const val = input ? input.value : '';
  if(!val) return;
  pickerOpen = false;
  pushUndo('Added a day');
  await ensureDay(val); // no-op if that day already exists — never duplicates
  selectedDay = val;
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

function openDay(dateStr){ selectedDay = dateStr; resetDayAddPicker(); render(); }
function closeDay(){ selectedDay = null; resetDayAddPicker(); render(); }

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
  openDay(target);
}

function toggleMonthGroup(key){
  if(expandedMonths.has(key)) expandedMonths.delete(key); else expandedMonths.add(key);
  renderDaily();
}

function renderDaily(){
  const el = document.getElementById('dailyView');
  if(taskDetailId && !state.tasks.find(t=>t.id===taskDetailId)) taskDetailId = null;
  if(selectedDay && taskDetailId){
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
  let html = `
    <div class="adddayrow">
      <button class="addday" onclick="addDay()">+ Add a Day</button>
      <button class="pickdatebtn" onclick="togglePicker()">${pickerOpen ? 'Cancel' : 'Pick a date…'}</button>
    </div>
    ${pickerOpen ? `
    <div class="pickerwrap">
      <input type="date" id="pickDateInput" value="${todayStr()}">
      <button class="pullbtn" onclick="confirmPickDate()">Add this day</button>
    </div>` : ''}
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

