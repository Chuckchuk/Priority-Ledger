// Mobile UI Lab — see quickAddMobileStyle in defaultDevSettings()
// (02-storage-state.js). Only the sheet's open/closed state; #quickInput
// and friends are the exact same static DOM nodes in every mode (see
// shell-body.html), so addTask() itself needs no awareness of any of
// this. `force` lets a scrim/close-button/Esc pass an explicit `false`
// rather than every caller having to know the current state to toggle it
// shut. Deliberately does NOT close on a successful add (see addTask()) —
// same "keep typing the next one" idiom as .subadd/#checklistQuickInput
// (see the Conventions note in CLAUDE.md), just via an overlay instead of
// an always-visible field.
function toggleQuickAddSheet(force){
  quickAddOpen = typeof force === 'boolean' ? force : !quickAddOpen;
  document.body.classList.toggle('quickadd-open', quickAddOpen);
  if(quickAddOpen){
    const input = document.getElementById('quickInput');
    if(input) setTimeout(() => input.focus(), 10);
  }
}

// The floating (+) button's own "quick capture" modal (see
// floatingAddButton in defaultDevSettings()) — deliberately a smaller,
// separate form from the main quick-add bar (title + category only, no
// timeframe/priority/urgent), since it has to make sense from views —
// Daily, a checklist, Settings — that don't have a quick-add bar of their
// own at all, not just as another way into the category view's. Category
// defaults to the active tab when that's an actual standard category
// (matching addTask()'s own "current tab wins" rule), otherwise the
// first standard category, so there's always a sensible preselection.
function openFabAdd(){
  fabAddOpen = true;
  document.body.classList.add('fab-open');
  const entries = standardCategoryEntries();
  const sel = document.getElementById('fabAddCategory');
  sel.innerHTML = entries.map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');
  sel.value = entries.some(([k])=>k===activeTab) ? activeTab : (entries[0] ? entries[0][0] : '');
  const input = document.getElementById('fabAddInput');
  setTimeout(() => input && input.focus(), 10);
}
function closeFabAdd(){
  fabAddOpen = false;
  document.body.classList.remove('fab-open');
}
async function submitFabAdd(){
  const input = document.getElementById('fabAddInput');
  const title = input.value.trim();
  if(!title) return;
  const category = document.getElementById('fabAddCategory').value;
  pushUndo(`Added "${title}"`);
  state.tasks.unshift({
    id: newId('task'),
    title, category, status:'open', urgent:false, dueDate:'', notes:'', subtasks: [],
    plannedDates: [], timeframe:'', timeframeManual:false, priority:0, completedAt:'',
    createdAt: todayStr()
  });
  input.value = '';
  render();
  queueSave();
  input.focus();
}

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
    timeframe, timeframeManual: timeframe !== '', priority, completedAt:'',
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

// One-shot: the id of a task whose .check should play the "just
// completed" celebration burst (see the check-celebrate CSS in <style>
// and its use in taskRowHtml()/renderTaskDetailPage(), 08-render-core.js)
// on the very next render only. Set right before that render() call and
// cleared immediately after, so a later, unrelated render() (a background
// refresh, another edit) never replays it — a real DOM flag can't survive
// render() anyway, since render() rebuilds the relevant view's whole
// innerHTML from scratch.
let celebrateCheckTaskId = null;

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
  // Reopening a cancelled task (this checkbox is its only way back to
  // open) clears the flag too — "open and still marked cancelled" isn't
  // a real state, and t.cancelled only ever means anything alongside
  // status==='done' anyway (see markTaskCancelled() below).
  if(!willBeDone) t.cancelled = false;
  celebrateCheckTaskId = willBeDone ? id : null;
  // Completing a task lingers in place for a beat — see scheduleTaskLeave()
  // below — so there's actually time to see the celebration play before
  // the row moves, rather than an instant re-sort/vanish. Applies whether
  // or not completed tasks are currently shown: with showDone off the row
  // leaves the list for good once it collapses; with it on, the row still
  // collapses in its original spot and then reappears at its now-sorted
  // position (the bottom, among the other completed tasks) instead of
  // teleporting straight there. Reopening skips this entirely — nothing
  // to animate away, so it renders immediately like every other edit.
  const willLinger = willBeDone;
  if(willLinger) completingTaskIds.add(id);
  else completingTaskIds.delete(id);
  render();
  celebrateCheckTaskId = null;
  queueSave();
  if(willLinger) scheduleTaskLeave(id);
}

// Reached only from the right-click/long-press menu (taskContextMenuHtml(),
// 08-render-core.js) — deliberately no dedicated button anywhere else,
// per the explicit ask. Functionally identical to completing a task
// (status:'done', same completingTaskIds linger + scheduleTaskLeave(),
// same sort/sub-total/Show-Completed treatment — everything that reads
// status==='done' can't tell the difference), with t.cancelled the one
// extra bit that only ever changes how it's *drawn* (checkGuideClass()/
// an X instead of a check, red strike-through — see taskRowHtml()'s own
// comment). No celebration burst (celebrateCheckTaskId stays untouched)
// — that's this app's one deliberate "you did it" moment, and cancelling
// something isn't that.
async function markTaskCancelled(id){
  const t = state.tasks.find(t=>t.id===id);
  if(!t) return;
  pushUndo(`Marked "${t.title}" cancelled`);
  t.status = 'done';
  t.cancelled = true;
  t.completedAt = todayStr();
  completingTaskIds.add(id);
  render();
  queueSave();
  scheduleTaskLeave(id);
}

// Reached only from a cancelled task's own right-click/long-press menu,
// alongside its existing Reopen — the direct "I actually meant complete,
// not cancelled" fix, per the explicit ask, so correcting a mis-tap
// doesn't take two separate actions (Reopen back to open, then mark
// complete again). t.status was already 'done' the moment it was
// cancelled (see markTaskCancelled() just above) so this only ever
// clears the cancelled flag itself — nothing else about the task's
// completion state actually changes. No celebration burst, same
// reasoning markTaskCancelled() itself skips one: fixing a mislabel
// isn't a new "you did it" moment.
async function uncancelTaskToComplete(id){
  const t = state.tasks.find(t=>t.id===id);
  if(!t || !t.cancelled) return;
  pushUndo(`Marked "${t.title}" complete`);
  t.cancelled = false;
  render();
  queueSave();
}

// How long the just-checked row lingers, fully visible (checkmark,
// strikethrough title, the celebration burst), before it starts actually
// leaving — roughly the celebration burst's own duration
// (check-celebrate-burst in <style>) plus a small buffer so it doesn't
// read as cut off.
const TASK_COMPLETE_LINGER_MS = 650;
// How long the row's own collapse (max-height/opacity/padding/border, all
// animated together — see .task-leaving in <style>) takes once it
// starts. Kept a touch above that rule's own longest transition so the
// final render() below never fires mid-animation.
const TASK_LEAVE_COLLAPSE_MS = 280;

// Fires TASK_COMPLETE_LINGER_MS after a task is marked done (see
// toggleStatus() above). Rather than a second render() removing (or
// re-sorting) the row outright, this measures the row's own current
// height and animates it down to 0 directly on its real DOM node — a
// genuine layout collapse, not just a fade, so the rows below it slide up
// to close the gap as a natural side effect of that collapse instead of
// needing a separate "slide up" animation of their own. Only once the
// collapse has actually finished does completingTaskIds let go and a real
// render() reflect the task's real, now-sorted position for good — with
// showDone off that means it's gone from the list entirely; with it on,
// it reappears at the bottom among the other completed tasks, in the
// same spot it would've landed in immediately before this existed. Either
// way, by the time that render() runs the row is already visually
// flattened to nothing, so the swap itself is invisible.
function scheduleTaskLeave(id){
  setTimeout(() => {
    // The task may have been reopened or deleted in the meantime (undo, a
    // second click) — either means there's nothing left to animate away,
    // so just drop the now-pointless linger entry and let the next
    // render() reflect reality normally instead of forcing a collapse
    // that no longer applies. Unlike an earlier version of this, showDone
    // being on is no longer one of these bail-out cases — see toggleStatus()'s
    // own comment for why completing now lingers either way.
    const t = state.tasks.find(t=>t.id===id);
    if(!t || t.status !== 'done'){ completingTaskIds.delete(id); return; }
    const row = document.querySelector(`li.task[data-task-id="${id}"]`);
    if(!row){ completingTaskIds.delete(id); render(); return; }
    row.style.maxHeight = row.scrollHeight + 'px';
    row.style.overflow = 'hidden';
    // A separate frame from the height-lock above — the transition
    // .task-leaving declares needs a real "before" value already painted
    // to interpolate away from, not the same frame it's applied in.
    requestAnimationFrame(() => {
      row.classList.add('task-leaving');
      row.style.maxHeight = '0px';
    });
    setTimeout(() => {
      completingTaskIds.delete(id);
      render();
    }, TASK_LEAVE_COLLAPSE_MS);
  }, TASK_COMPLETE_LINGER_MS);
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
// plans the task onto that due date's daily, the moment the date is
// typed — the same window sweepDueSoonPlanning() (11-daily-core.js) later
// re-checks on its own as today's date moves forward, catching a due
// date that was too far out to qualify here but has since drifted into
// the window with nobody touching this field again. ensureDay() creates
// that day if it doesn't exist yet. One-way, same as updateTimeframe's
// "today" plan: pushing the due date back out past the window later
// doesn't retroactively unplan it. Skipped entirely for an already-done
// (or cancelled) task — there's no "coming up" left to plan for.
//
// One-shot, same idiom as celebrateCheckTaskId just below — which task's
// Timeframe field (see taskAdvancedFieldsRowHtml(), 08-render-core.js)
// should flash on the very next render, and which of the two flashes:
// 'auto' (the due-date change just filled/updated Timeframe for you) or
// 'conflict' (the due date implied a different Timeframe than what's
// there, but a manual pick is protecting it, so nothing actually
// changed). Set right before the render() call below and cleared
// immediately after, for the same reason celebrateCheckTaskId is —
// render() rebuilds the relevant view from scratch each time, so a DOM
// class alone can't survive it, and a later unrelated render() must
// never replay a flash that isn't its own.
let timeframeFlashTaskId = null;
let timeframeFlashKind = null; // 'auto' | 'conflict'
async function updateDueDate(id, val){
  const t = state.tasks.find(t=>t.id===id);
  if(!t) return;
  if(val === t.dueDate) return;
  pushUndo(`Changed due date for "${t.title}"`);
  t.dueDate = val;
  if(val && isDueWithinDays(val, 3) && t.status!=='done' && !t.cancelled){
    if(!t.plannedDates) t.plannedDates = [];
    if(!t.plannedDates.includes(val)){
      t.plannedDates.push(val);
      await ensureDay(val);
    }
  }
  // See deriveTimeframeFromDueDate()'s own comment (05-dates-sort.js) for
  // the actual thresholds/ambiguous-zone reasoning. Only ever fires when
  // the derived value would be a real *change* from the current one —
  // re-deriving the same value the field already holds isn't worth
  // flashing over, auto or manual either way.
  timeframeFlashTaskId = null;
  timeframeFlashKind = null;
  const derivedTimeframe = deriveTimeframeFromDueDate(val);
  if(derivedTimeframe && derivedTimeframe !== t.timeframe){
    if(!t.timeframeManual){
      t.timeframe = derivedTimeframe;
      timeframeFlashTaskId = id;
      timeframeFlashKind = 'auto';
    } else {
      timeframeFlashTaskId = id;
      timeframeFlashKind = 'conflict';
    }
  }
  render();
  reopen(id);
  timeframeFlashTaskId = null;
  timeframeFlashKind = null;
  queueSave();
}

function reopen(id){
  expandedTaskIds.add(id);
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
  // Same reasoning as toggleStatus()'s own reopen case — unchecking a
  // cancelled step is its only way back to not-done, so it stops being
  // "cancelled" at the same time rather than leaving that flag orphaned.
  if(!s.done) s.cancelled = false;
  render();
  reopen(taskId);
  queueSave();
}
// Reached only from a step's own right-click/long-press menu
// (subtaskContextMenuHtml() etc., 08-render-core.js) — same "identical
// functionality to complete, different only in how it's drawn" idea as
// markTaskCancelled() above, just one level down: s.done is what every
// existing consumer (subProgressHtml()'s pip fill, checkGuideClass()'s
// "all steps done" check, etc.) already reads, so setting it true here
// is all the functional side needs; s.cancelled only changes rendering.
async function markSubtaskCancelled(taskId, subId){
  const t = state.tasks.find(t=>t.id===taskId);
  if(!t) return;
  const s = (t.subtasks||[]).find(s=>s.id===subId);
  if(!s) return;
  pushUndo(`Marked a step in "${t.title}" cancelled`);
  s.done = true;
  s.cancelled = true;
  render();
  reopen(taskId);
  queueSave();
}
// Same "fix a mislabel directly" shortcut as uncancelTaskToComplete()
// above, one level down — reused as-is by a checklist item's own context
// menu too (subtaskContextMenuHtml() is shared by both, a checklist
// "item" being just a subtask under the hood).
async function uncancelSubtaskToComplete(taskId, subId){
  const t = state.tasks.find(t=>t.id===taskId);
  if(!t) return;
  const s = (t.subtasks||[]).find(s=>s.id===subId);
  if(!s || !s.cancelled) return;
  pushUndo(`Marked a step in "${t.title}" complete`);
  s.cancelled = false;
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

// Shared by deleteTask() and deleteChecklistList() (13-checklist.js) — a
// checklist "list" is a plain task object under the hood, so both kinds
// of delete land in the same state.trash array (see purgeOldTrash(),
// 02-storage-state.js) and Recently Deleted (trashSectionHtml(),
// 09-settings.js) doesn't need to know or care which one it's looking
// at. Called *after* the item has already been spliced out of
// state.tasks by the caller — this only handles archiving it.
function moveTaskToTrash(t){
  if(!Array.isArray(state.trash)) state.trash = [];
  state.trash.unshift({ task: t, deletedAt: new Date().toISOString() });
}
async function deleteTask(id){
  const idx = state.tasks.findIndex(t=>t.id===id);
  if(idx === -1) return;
  const t = state.tasks[idx];
  pushUndo(`Deleted "${t.title}"`);
  state.tasks.splice(idx, 1);
  moveTaskToTrash(t);
  render();
  queueSave();
}
// Restore/permanent-delete both live here rather than 09-settings.js
// (where Recently Deleted actually renders) — same reasoning as every
// other *action* function in this app sitting apart from the render
// function that calls it.
async function restoreFromTrash(id){
  const idx = (state.trash||[]).findIndex(e=>e.task.id===id);
  if(idx === -1) return;
  const entry = state.trash[idx];
  pushUndo(`Restored "${entry.task.title}"`);
  state.trash.splice(idx, 1);
  state.tasks.push(entry.task);
  render();
  queueSave();
}
async function permanentlyDeleteFromTrash(id){
  const idx = (state.trash||[]).findIndex(e=>e.task.id===id);
  if(idx === -1) return;
  pushUndo(`Permanently deleted "${state.trash[idx].task.title}"`);
  state.trash.splice(idx, 1);
  render();
  queueSave();
}

