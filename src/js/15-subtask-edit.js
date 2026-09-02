function startEditSubtask(el, taskId, subId){
  const t = state.tasks.find(t=>t.id===taskId);
  const s = t && (t.subtasks||[]).find(s=>s.id===subId);
  if(!s) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'subedit';
  input.value = s.text;
  el.replaceWith(input);
  input.focus();
  input.select();
  let committed = false;
  const commit = async () => {
    if(committed) return;
    committed = true;
    const val = input.value.trim();
    if(val && val !== s.text){
      pushUndo(`Renamed step to "${val}"`);
      s.text = val;
      queueSave();
    }
    render();
    reopen(taskId);
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => { if(e.key==='Enter'){ e.preventDefault(); input.blur(); } });
}

// Same swap-in-a-text-input trick as startEditSubtask(), but the typed
// value goes through parseNaturalDate() rather than being saved as-is.
// An empty input clears the date; a non-empty value that fails to parse
// just reverts to whatever was there before — silently guessing wrong
// would be worse than making the user retype it.
function startEditSubtaskDate(el, taskId, subId){
  const t = state.tasks.find(t=>t.id===taskId);
  const s = t && (t.subtasks||[]).find(s=>s.id===subId);
  if(!s) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'datefieldedit';
  input.value = s.dueDate ? fmtDateShort(s.dueDate) : '';
  input.placeholder = 'today, tmrw, 9/1, tue…';
  el.replaceWith(input);
  input.focus();
  input.select();
  let committed = false;
  const commit = async () => {
    if(committed) return;
    committed = true;
    const raw = input.value.trim();
    if(!raw){
      if(s.dueDate) await updateSubtaskDueDate(taskId, subId, '');
      else { render(); reopen(taskId); }
      return;
    }
    const parsed = parseNaturalDate(raw);
    if(parsed) await updateSubtaskDueDate(taskId, subId, parsed);
    else { render(); reopen(taskId); } // unparseable — revert, don't save
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => { if(e.key==='Enter'){ e.preventDefault(); input.blur(); } });
}

// Same auto-plan-onto-its-due-day behavior as updateDueDate — see the
// comment there, including sweepDueSoonPlanning() catching up a date
// that drifts into the window later on its own.
async function updateSubtaskDueDate(taskId, subId, dueDate){
  const t = state.tasks.find(t=>t.id===taskId);
  const s = t && (t.subtasks||[]).find(s=>s.id===subId);
  if(!s) return;
  pushUndo(dueDate ? `Dated step "${s.text}"` : `Cleared date for step "${s.text}"`);
  s.dueDate = dueDate;
  if(dueDate && isDueWithinDays(dueDate, 3) && !s.done && !s.cancelled){
    if(!s.plannedDates) s.plannedDates = [];
    if(!s.plannedDates.includes(dueDate)){
      s.plannedDates.push(dueDate);
      await ensureDay(dueDate);
    }
  }
  render();
  reopen(taskId);
  queueSave();
}

async function toggleSubtaskToday(taskId, subId){
  const t = state.tasks.find(t=>t.id===taskId);
  const s = t && (t.subtasks||[]).find(s=>s.id===subId);
  if(!s) return;
  if(!s.plannedDates) s.plannedDates = [];
  const today = todayStr();
  const idx = s.plannedDates.indexOf(today);
  const willPlan = idx === -1;
  pushUndo(willPlan ? `Added step "${s.text}" to today` : `Removed step "${s.text}" from today`);
  if(willPlan) s.plannedDates.push(today); else s.plannedDates.splice(idx, 1);
  if(willPlan) await ensureDay(today);
  render();
  reopen(taskId);
  queueSave();
}

