// ---------- Drag reordering (Pointer Events) ----------
// Used to be native HTML5 <div draggable> drag-and-drop (dragstart/
// dragover/drop) — which never fires touch-originated drag events at all
// on iOS/Android (both platforms' browsers only ever start a native drag
// session from an actual mouse), so the handle was tappable but reordering
// silently did nothing on a phone. Pointer Events unify mouse and touch
// under one API (pointerdown/pointermove/pointerup all fire for either),
// so this single implementation drives both instead of needing two
// parallel systems to keep in sync.
//
// Main tasks: only draggable in 'default' sort mode (taskRowHtml only
// renders the handle/attributes there in the first place), reordering
// state.tasks directly — the same array applySortMode()'s 'default' case
// reads as-is. Subtasks: always draggable regardless of the main list's
// sort mode, since a task's steps have never had a sort mode of their own
// to lock against — array order is the only order they've ever had.
//
// dragState holds everything one in-progress drag needs: which kind
// (affects which CSS selector/data attribute identifies a valid drop
// target, and which reorder* function actually gets called), the
// dragged item's own id(s), where the gesture started (to distinguish an
// intentional drag from a stray finger jitter before committing to one),
// and the drop target most recently under the pointer.
let dragState = null; // { kind:'task'|'sub', id, taskId?, startX, startY, moved, row, overEl }
const DRAG_MOVE_THRESHOLD_PX = 6;

function dragPointerDown(e, kind, id, taskId){
  if(e.pointerType === 'mouse' && e.button !== 0) return; // left-click/primary only
  const row = e.currentTarget.closest(kind === 'task' ? 'li.task' : '.subrow');
  if(!row) return;
  dragState = { kind, id, taskId, startX: e.clientX, startY: e.clientY, moved: false, row, overEl: null };
  // Pointer capture keeps every subsequent event routed to this exact
  // handle regardless of where the finger/cursor actually wanders —
  // without it, moving off the small handle element mid-drag would stop
  // it from receiving move/up events at all.
  e.currentTarget.setPointerCapture(e.pointerId);
}

// Reused by both kinds — which selector counts as a valid drop target,
// and how to read the id back off whichever element the pointer is
// currently over, differ per kind but the hit-testing/threshold/visual-
// feedback logic underneath is identical either way.
function dragTargetSelector(kind){
  return kind === 'task' ? 'li.task, .dropend' : '.subrow, .subdropend';
}

function dragPointerMove(e){
  if(!dragState) return;
  const dx = e.clientX - dragState.startX, dy = e.clientY - dragState.startY;
  if(!dragState.moved){
    if(Math.hypot(dx, dy) < DRAG_MOVE_THRESHOLD_PX) return;
    dragState.moved = true;
    dragState.row.classList.add('dragging');
  }
  e.preventDefault();
  document.querySelectorAll('.dragover').forEach(el => el.classList.remove('dragover'));
  // elementsFromPoint (not the single-result elementFromPoint) since the
  // pointer is very likely still over the dragged row's own children
  // (its handle, its text) rather than whatever's underneath it — this
  // walks the whole stack at that point and picks the first element that
  // actually matches a valid drop target, dragged row included (dropping
  // back onto your own row/subrow is harmless — reorderTask()/
  // reorderSubtask() already no-op when dragged and target ids match).
  const stack = document.elementsFromPoint(e.clientX, e.clientY);
  const el = stack.find(x => x.matches && x.matches(dragTargetSelector(dragState.kind)));
  if(el){
    el.classList.add('dragover');
    dragState.overEl = el;
  }
}

function dragPointerEnd(e){
  if(!dragState) return;
  const d = dragState;
  dragState = null;
  document.querySelectorAll('.dragging, .dragover').forEach(el => el.classList.remove('dragging', 'dragover'));
  if(!d.moved || !d.overEl) return;
  const rect = d.overEl.getBoundingClientRect();
  const before = (e.clientY - rect.top) < rect.height / 2;
  if(d.kind === 'task'){
    if(d.overEl.classList.contains('dropend')) reorderTask(d.id, d.overEl.dataset.lastId, false);
    else reorderTask(d.id, d.overEl.dataset.taskId, before);
  } else {
    if(d.overEl.classList.contains('subdropend')) reorderSubtask(d.taskId, d.id, d.overEl.dataset.lastSubId, false);
    else reorderSubtask(d.taskId, d.id, d.overEl.dataset.subId, before);
  }
}
document.addEventListener('pointermove', dragPointerMove);
document.addEventListener('pointerup', dragPointerEnd);
document.addEventListener('pointercancel', dragPointerEnd);

function taskHandlePointerDown(e, id){
  dragPointerDown(e, 'task', id);
}

// A dedicated trailing target, appended after the last row whenever the
// list is in 'default' sort mode — rather than requiring a drop to land
// in exactly the bottom half of the last row's own (fairly short) bounds
// to reach "the end," this gives that same outcome a large, unambiguous
// target immediately below the list. data-last-id is what
// dragPointerEnd() reads back to know which real task to reorder after.
function dropEndHtml(visible){
  if(sortMode !== 'default' || !visible.length) return '';
  const lastId = visible[visible.length-1].id;
  return `<li class="dropend" data-last-id="${lastId}"></li>`;
}

function reorderTask(draggedId, targetId, before){
  // Reached when the dragged task is already the last row (dropped on
  // its own trailing .dropend) or dropped back onto itself: draggedId
  // ===targetId here, which would otherwise splice the dragged item out,
  // then fail to re-find "itself" as the target and fall back to index
  // 0 — silently yanking it to the front instead of leaving it exactly
  // where it already was.
  if(!draggedId || !targetId || draggedId === targetId) return;
  const fromIdx = state.tasks.findIndex(t=>t.id===draggedId);
  const targetExists = state.tasks.some(t=>t.id===targetId);
  if(fromIdx===-1 || !targetExists) return;
  const item = state.tasks[fromIdx];
  pushUndo(`Reordered "${item.title}"`);
  state.tasks.splice(fromIdx, 1);
  let toIdx = state.tasks.findIndex(t=>t.id===targetId);
  if(!before) toIdx += 1;
  state.tasks.splice(toIdx, 0, item);
  render();
  queueSave();
}

function subHandlePointerDown(e, taskId, subId){
  e.stopPropagation();
  dragPointerDown(e, 'sub', subId, taskId);
}

// Same reasoning as dropEndHtml() above, one level down: a dedicated
// trailing target below a task's own steps (or a checklist's own items),
// so dropping at "the very end" doesn't depend on landing in exactly the
// bottom half of the last (fairly short) .subrow's bounds.
function subDropEndHtml(taskId, subs){
  if(!subs.length) return '';
  const lastId = subs[subs.length-1].id;
  return `<div class="subdropend" data-last-sub-id="${lastId}"></div>`;
}

function reorderSubtask(taskId, draggedSubId, targetSubId, before){
  // Same reasoning as reorderTask()'s identical guard.
  if(!draggedSubId || !targetSubId || draggedSubId === targetSubId) return;
  const t = state.tasks.find(t=>t.id===taskId);
  if(!t) return;
  const fromIdx = t.subtasks.findIndex(s=>s.id===draggedSubId);
  const targetExists = t.subtasks.some(s=>s.id===targetSubId);
  if(fromIdx===-1 || !targetExists) return;
  const item = t.subtasks[fromIdx];
  pushUndo(`Reordered a step in "${t.title}"`);
  t.subtasks.splice(fromIdx, 1);
  let toIdx = t.subtasks.findIndex(s=>s.id===targetSubId);
  if(!before) toIdx += 1;
  t.subtasks.splice(toIdx, 0, item);
  render();
  reopen(taskId);
  queueSave();
}
