// Undo/redo — whole-state snapshots rather than hand-written inverse
// operations per action. This app's entire content is already one JSON
// blob (`state`), so cloning it before each mutation is cheap and, unlike
// per-action-type inverses, can't drift out of sync with a mutation that
// forgets to update it. Every user-facing content change calls
// pushUndo(label) as its first step (before mutating state); pure
// navigation (switching tabs, toggling which location you're viewing,
// opening a day) is deliberately NOT on the undo stack — undo is for
// content you changed, not where you were looking.
let undoStack = [];
let redoStack = [];
const UNDO_LIMIT = 50;

function pushUndo(label){
  undoStack.push({ label, snapshot: JSON.parse(JSON.stringify(state)) });
  if(undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack = [];
}

function showUndoStatus(text){
  const el = document.getElementById('undoStatus');
  if(!el) return;
  el.textContent = text;
  clearTimeout(showUndoStatus._t);
  showUndoStatus._t = setTimeout(()=>{ if(el.textContent===text) el.textContent=''; }, 2500);
}

function refreshUndoButtons(){
  const u = document.getElementById('undoBtn');
  const r = document.getElementById('redoBtn');
  if(u) u.disabled = undoStack.length===0;
  if(r) r.disabled = redoStack.length===0;
}

// Runs after restoring a snapshot, since the restored state may no longer
// match transient UI state that isn't itself part of the undo history
// (e.g. you're viewing a day that undo just un-created).
function afterStateRestore(){
  rebuildCategoriesIndex();
  applyTheme();
  applyDevSettings();
  if(!visibleTabs().includes(activeTab)) activeTab = 'all';
  if(selectedDay && !state.days.includes(selectedDay)) selectedDay = null;
  if(selectedListId && !state.tasks.some(t=>t.id===selectedListId)) selectedListId = null;
  pendingDeleteCategoryId = null;
  pendingDeleteLocationId = null;
  openCategoryPickerId = null;
}

function undo(){
  if(undoStack.length===0) return;
  const entry = undoStack.pop();
  redoStack.push({ label: entry.label, snapshot: JSON.parse(JSON.stringify(state)) });
  state = entry.snapshot;
  afterStateRestore();
  render();
  queueSave();
  showUndoStatus('Undid: ' + entry.label);
}

function redo(){
  if(redoStack.length===0) return;
  const entry = redoStack.pop();
  undoStack.push({ label: entry.label, snapshot: JSON.parse(JSON.stringify(state)) });
  state = entry.snapshot;
  afterStateRestore();
  render();
  queueSave();
  showUndoStatus('Redid: ' + entry.label);
}

