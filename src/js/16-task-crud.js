async function addTask(){
  const input = document.getElementById('quickInput');
  const title = input.value.trim();
  if(!title) return;
  const category = activeTab==='all' ? document.getElementById('quickCategory').value : activeTab;
  const timeframe = document.getElementById('quickTimeframe').value;
  const priority = parseInt(document.getElementById('quickPriority').value, 10) || 0;
  pushUndo(`Added "${title}"`);
  if(timeframe === 'today') await ensureDay(todayStr());
  state.tasks.unshift({
    id: newId('task'),
    title, category, status:'open', urgent: urgentDraft, dueDate:'', notes:'', subtasks: [],
    plannedDates: timeframe==='today' ? [todayStr()] : [],
    timeframe, priority, completedAt:'',
    createdAt: todayStr()
  });
  input.value = '';
  urgentDraft = false;
  document.getElementById('urgentToggle').classList.remove('on');
  document.getElementById('quickTimeframe').value = '';
  document.getElementById('quickPriority').value = '0';
  render();
  queueSave();
}

// Completing a task stamps completedAt; reopening it clears that stamp
// entirely rather than keeping a history of past completions — the undo
// stack is already this app's history mechanism for "what did this used
// to be," so a second, per-field log would just be redundant bookkeeping.
async function toggleStatus(id){
  const t = state.tasks.find(t=>t.id===id);
  if(!t) return;
  const willBeDone = t.status !== 'done';
  pushUndo(willBeDone ? `Completed "${t.title}"` : `Reopened "${t.title}"`);
  t.status = willBeDone ? 'done' : 'open';
  t.completedAt = willBeDone ? todayStr() : '';
  render();
  queueSave();
}

async function toggleUrgent(id){
  const t = state.tasks.find(t=>t.id===id);
  if(!t) return;
  const willBeUrgent = !t.urgent;
  pushUndo(willBeUrgent ? `Flagged "${t.title}" urgent` : `Unflagged "${t.title}"`);
  t.urgent = willBeUrgent;
  render();
  reopen(id);
  queueSave();
}

// Setting a due date within isDueWithinDays' 3-day/overdue window also
// plans the task onto that due date's daily — same window the "Add to
// this day" tree already uses to decide what's eligible to pull in, just
// applied automatically instead of waiting for a manual tree add.
// ensureDay() creates that day if it doesn't exist yet. One-way, same as
// updateTimeframe's "today" plan: pushing the due date back out past the
// window later doesn't retroactively unplan it.
async function updateDueDate(id, val){
  const t = state.tasks.find(t=>t.id===id);
  if(!t) return;
  if(val === t.dueDate) return;
  pushUndo(`Changed due date for "${t.title}"`);
  t.dueDate = val;
  if(val && isDueWithinDays(val, 3)){
    if(!t.plannedDates) t.plannedDates = [];
    if(!t.plannedDates.includes(val)){
      t.plannedDates.push(val);
      await ensureDay(val);
    }
  }
  render();
  reopen(id);
  queueSave();
}

function reopen(id){
  const exp = document.getElementById('exp-' + id);
  if(exp) exp.classList.add('open');
}

async function updateTitle(id, val){
  const t = state.tasks.find(t=>t.id===id);
  if(!t) return;
  const newVal = val.trim();
  if(newVal && newVal !== t.title){
    pushUndo(`Renamed task to "${newVal}"`);
    t.title = newVal;
    queueSave();
  }
  render();
  reopen(id);
}

async function updateCategory(id, val){
  const t = state.tasks.find(t=>t.id===id);
  if(!t) return;
  if(val === t.category) return;
  const label = (CATEGORIES[val] || FALLBACK_CATEGORY).label;
  pushUndo(`Moved "${t.title}" to ${label}`);
  t.category = val;
  render();
  reopen(id);
  queueSave();
}

// render() rebuilds the relevant view's whole innerHTML on every
// mutation, which destroys and recreates the "add a step/item" input
// rather than just clearing it in place — so the freshly-typed-into
// input loses focus after every single Enter unless something
// explicitly refocuses whichever new .subadd render() just created.
// Scoped to the currently visible one (offsetParent is null for a
// display:none element) since a hidden task's own .subadd can still be
// in the DOM even when it's not the one the user was just typing into.
function focusVisibleSubadd(){
  for(const el of document.querySelectorAll('.subadd')){
    if(el.offsetParent !== null){ el.focus(); return; }
  }
}

async function addSubtask(taskId, text){
  const val = (text||'').trim();
  if(!val) return;
  const t = state.tasks.find(t=>t.id===taskId);
  if(!t) return;
  pushUndo(`Added step to "${t.title}"`);
  if(!t.subtasks) t.subtasks = [];
  t.subtasks.push({ id: newId('sub'), text: val, done:false, dueDate:'', plannedDates:[] });
  render();
  reopen(taskId);
  focusVisibleSubadd();
  queueSave();
}

async function toggleSubtask(taskId, subId){
  const t = state.tasks.find(t=>t.id===taskId);
  if(!t) return;
  const s = (t.subtasks||[]).find(s=>s.id===subId);
  if(!s) return;
  pushUndo(s.done ? `Unchecked step in "${t.title}"` : `Checked step in "${t.title}"`);
  s.done = !s.done;
  render();
  reopen(taskId);
  queueSave();
}

async function deleteSubtask(taskId, subId){
  const t = state.tasks.find(t=>t.id===taskId);
  if(!t) return;
  pushUndo(`Deleted step from "${t.title}"`);
  t.subtasks = (t.subtasks||[]).filter(s=>s.id!==subId);
  render();
  reopen(taskId);
  queueSave();
}

async function updateNotes(id, val){
  const t = state.tasks.find(t=>t.id===id);
  if(!t) return;
  if(val === t.notes) return;
  pushUndo(`Edited notes for "${t.title}"`);
  t.notes = val;
  queueSave();
}

async function deleteTask(id){
  const t = state.tasks.find(t=>t.id===id);
  pushUndo(`Deleted "${t ? t.title : 'task'}"`);
  state.tasks = state.tasks.filter(t=>t.id!==id);
  render();
  queueSave();
}

