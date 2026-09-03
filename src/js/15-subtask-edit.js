// Mobile edits through a <textarea> (autogrowTextarea(), 08-render-core.js)
// instead of a plain <input> — same reasoning as a task/list's own title
// field (taskTitleFieldHtml()'s own comment): a long step's text
// otherwise has to be edited through a small horizontally-scrolling
// window instead of just being visible, wrapped, on screen. Sized once
// immediately after insertion (an input event alone wouldn't fire until
// something is actually typed, so a long existing value would start
// clipped) as well as on every subsequent input.
function startEditSubtask(el, taskId, subId){
  const t = state.tasks.find(t=>t.id===taskId);
  const s = t && (t.subtasks||[]).find(s=>s.id===subId);
  if(!s) return;
  const mobile = mobileUiActive();
  const input = document.createElement(mobile ? 'textarea' : 'input');
  if(mobile){ input.className = 'subedit autogrowtext'; input.rows = 1; }
  else { input.type = 'text'; input.className = 'subedit'; }
  input.value = s.text;
  el.replaceWith(input);
  if(mobile) autogrowTextarea(input);
  input.focus();
  input.select();
  if(mobile) input.addEventListener('input', () => autogrowTextarea(input));
  let committed = false;
  const commit = async () => {
    if(committed) return;
    committed = true;
    // Collapse embedded newlines back to spaces — Enter itself commits
    // rather than inserting one (below), but a textarea (mobile) still
    // lets a pasted multi-line value in verbatim, unlike a plain <input>.
    const val = input.value.replace(/\s*\n+\s*/g, ' ').trim();
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

// "Add Date" in a dateless step's own long-press menu (subtaskContextMenuHtml(),
// 08-render-core.js) — the field itself still exists in the DOM even
// while empty (see .datefield.empty in <style>, hidden but not removed),
// so this just finds that same element and hands it to
// startEditSubtaskDate() exactly as its own onclick already would if it
// were visible and tapped directly. No separate date-picker UI needed.
function startAddSubtaskDate(taskId, subId){
  const row = document.querySelector(`.subrow[data-sub-id="${subId}"]`);
  const el = row && row.querySelector('.datefield');
  if(el) startEditSubtaskDate(el, taskId, subId);
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

