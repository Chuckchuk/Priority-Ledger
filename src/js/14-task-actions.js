async function addDayTask(dateStr){
  const input = document.getElementById('dayQuickInput');
  const title = input.value.trim();
  if(!title) return;
  const category = document.getElementById('dayQuickCategory').value;
  pushUndo(`Added "${title}"`);
  await ensureDay(dateStr);
  state.tasks.unshift({
    id: newId('task'),
    title, category, status:'open', urgent:false, dueDate:'', notes:'', subtasks:[], plannedDates:[dateStr], createdAt: todayStr(),
    timeframe:'', priority:0, completedAt:''
  });
  render();
  queueSave();
}

// Shared by both "add to day" picker styles (cascade and tree) — plans a
// whole task (or a whole checklist, since a checklist list is just a
// plain state.tasks entry too) onto a specific day. Additive: a task
// already planned on some other day keeps that day too, rather than
// getting bumped off it — plannedDates is an array specifically so a
// task/checklist can sit on any number of dailies at once (see the
// migration note in normalizeState()). Idempotent against a day it's
// already on, so re-clicking an "Added" tree row can't duplicate the date.
async function planTaskForDay(taskId, dateStr){
  const t = state.tasks.find(t=>t.id===taskId);
  if(!t) return;
  if(!t.plannedDates) t.plannedDates = [];
  if(t.plannedDates.includes(dateStr)) return;
  pushUndo(`Added "${t.title}" to day`);
  t.plannedDates.push(dateStr);
  await ensureDay(dateStr);
  render();
  queueSave();
}

async function unplanTaskFromDay(taskId, dateStr){
  const t = state.tasks.find(t=>t.id===taskId);
  if(!t) return;
  const idx = (t.plannedDates||[]).indexOf(dateStr);
  if(idx===-1) return;
  pushUndo(`Removed "${t.title}" from day`);
  t.plannedDates.splice(idx, 1);
  render();
  reopen(taskId);
  queueSave();
}

// Plans a single step onto a day independently of its parent task's own
// plannedDates — same idea as planTaskForDay, one level down.
async function pullSubtaskToDay(taskId, subId, dateStr){
  const t = state.tasks.find(t=>t.id===taskId);
  const s = t && (t.subtasks||[]).find(s=>s.id===subId);
  if(!s) return;
  if(!s.plannedDates) s.plannedDates = [];
  if(s.plannedDates.includes(dateStr)) return;
  pushUndo(`Added step "${s.text}" to day`);
  s.plannedDates.push(dateStr);
  await ensureDay(dateStr);
  render();
  queueSave();
}

async function unplanSubtaskFromDay(taskId, subId, dateStr){
  const t = state.tasks.find(t=>t.id===taskId);
  const s = t && (t.subtasks||[]).find(s=>s.id===subId);
  if(!s) return;
  const idx = (s.plannedDates||[]).indexOf(dateStr);
  if(idx===-1) return;
  pushUndo(`Removed step "${s.text}" from day`);
  s.plannedDates.splice(idx, 1);
  render();
  queueSave();
}

// Same copy-forward semantics as moveIncompleteToTomorrow, one item at a
// time — keeps the item on the day it started on and additionally plans
// it onto tomorrow, rather than pulling it off today (that's a different
// action the project owner didn't want here). Idempotent: a no-op once
// tomorrow's date is already in plannedDates, so the button can safely be
// left enabled without risking a duplicate — see the taskRowHtml/
// daySubtaskRowHtml render sites for where it's disabled once already added.
async function moveTaskToTomorrow(taskId, dateStr){
  const t = state.tasks.find(t=>t.id===taskId);
  if(!t) return;
  const nextDate = addDaysToDateStr(dateStr, 1);
  if(!t.plannedDates) t.plannedDates = [];
  if(t.plannedDates.includes(nextDate)) return;
  pushUndo(`Also planned "${t.title}" for ${fmtDate(nextDate)}`);
  t.plannedDates.push(nextDate);
  await ensureDay(nextDate);
  render();
  queueSave();
}

async function moveSubtaskToTomorrow(taskId, subId, dateStr){
  const t = state.tasks.find(t=>t.id===taskId);
  const s = t && (t.subtasks||[]).find(s=>s.id===subId);
  if(!s) return;
  const nextDate = addDaysToDateStr(dateStr, 1);
  if(!s.plannedDates) s.plannedDates = [];
  if(s.plannedDates.includes(nextDate)) return;
  pushUndo(`Also planned step "${s.text}" for ${fmtDate(nextDate)}`);
  s.plannedDates.push(nextDate);
  await ensureDay(nextDate);
  render();
  queueSave();
}

// A checklist row inside the Daily view opens into the checklist detail
// page, but that page only ever shows while its own category tab is
// active (see render()'s isChecklist branch) — switching tabs first is
// what actually makes it visible, openChecklistList() alone would just
// set selectedListId behind the still-showing Daily view.
function openChecklistListFromDay(taskId, dateStr){
  const t = state.tasks.find(t=>t.id===taskId);
  if(!t) return;
  switchTab(t.category);
  openChecklistList(taskId, dateStr);
}

// The compact replacement for the old "Plan for Day" date picker — one
// tap, toggles specifically *today's* membership in plannedDates. A task
// already planned on some other day keeps that day too (see the note on
// planTaskForDay) — this button only ever adds/removes today, it never
// touches any other day the task is already planned for.
async function toggleTaskToday(id){
  const t = state.tasks.find(t=>t.id===id);
  if(!t) return;
  if(!t.plannedDates) t.plannedDates = [];
  const today = todayStr();
  const idx = t.plannedDates.indexOf(today);
  const willPlan = idx === -1;
  pushUndo(willPlan ? `Added "${t.title}" to today` : `Removed "${t.title}" from today`);
  if(willPlan) t.plannedDates.push(today); else t.plannedDates.splice(idx, 1);
  if(willPlan) await ensureDay(today);
  render();
  reopen(id);
  queueSave();
}

// Setting timeframe to "today" also plans the task for today's Daily list
// — one-way only. Changing the timeframe away from "today" later doesn't
// auto-unplan it, since the task may since have been deliberately kept on
// that day's list for reasons unrelated to this field; use the existing
// Unplan button for that.
async function updateTimeframe(id, val){
  const t = state.tasks.find(t=>t.id===id);
  if(!t || val === t.timeframe) return;
  pushUndo(`Set timeframe for "${t.title}"`);
  t.timeframe = val;
  if(val === 'today'){
    if(!t.plannedDates) t.plannedDates = [];
    if(!t.plannedDates.includes(todayStr())) t.plannedDates.push(todayStr());
    await ensureDay(todayStr());
  }
  render();
  reopen(id);
  queueSave();
}

async function updatePriority(id, val){
  const t = state.tasks.find(t=>t.id===id);
  if(!t) return;
  const p = parseInt(val, 10) || 0;
  if(p === t.priority) return;
  pushUndo(`Set priority for "${t.title}"`);
  t.priority = p;
  render();
  reopen(id);
  queueSave();
}

