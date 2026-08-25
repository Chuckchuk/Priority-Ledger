// ---------- Drag reordering ----------
// Main tasks: only draggable in 'default' sort mode (taskRowHtml only
// renders the handle/attributes there in the first place), reordering
// state.tasks directly — the same array applySortMode()'s 'default' case
// reads as-is. Subtasks: always draggable regardless of the main list's
// sort mode, since a task's steps have never had a sort mode of their own
// to lock against — array order is the only order they've ever had.
let draggedTaskId = null;
let draggedSubtask = null; // { taskId, subId }

function taskDragStart(e, id){
  draggedTaskId = id;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.closest('li.task').classList.add('dragging');
}

function taskDragOver(e){
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('li.task.dragover, .dropend.dragover').forEach(el=>el.classList.remove('dragover'));
  e.currentTarget.classList.add('dragover');
}

function taskDrop(e, targetId){
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');
  if(draggedTaskId && draggedTaskId !== targetId){
    const rect = e.currentTarget.getBoundingClientRect();
    reorderTask(draggedTaskId, targetId, (e.clientY - rect.top) < rect.height/2);
  }
  draggedTaskId = null;
}

function taskDragEnd(){
  document.querySelectorAll('li.task.dragging, li.task.dragover, .dropend.dragover').forEach(el=>el.classList.remove('dragging','dragover'));
  draggedTaskId = null;
}

// A dedicated trailing target, appended after the last row whenever the
// list is in 'default' sort mode — rather than requiring a drop to land
// in exactly the bottom half of the last row's own (fairly short) bounds
// to reach "the end," this gives that same outcome a large, unambiguous
// target immediately below the list.
function taskDropEnd(e, lastId){
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');
  if(draggedTaskId) reorderTask(draggedTaskId, lastId, false);
  draggedTaskId = null;
}

function dropEndHtml(visible){
  if(sortMode !== 'default' || !visible.length) return '';
  const lastId = visible[visible.length-1].id;
  return `<li class="dropend" ondragover="taskDragOver(event)" ondrop="taskDropEnd(event,'${lastId}')"></li>`;
}

function reorderTask(draggedId, targetId, before){
  // Reached via taskDropEnd() when the dragged task is already the last
  // row: draggedId===targetId here, which would otherwise splice the
  // dragged item out, then fail to re-find "itself" as the target and
  // fall back to index 0 — silently yanking it to the front instead of
  // leaving it exactly where it already was.
  if(draggedId === targetId) return;
  const fromIdx = state.tasks.findIndex(t=>t.id===draggedId);
  const targetExists = state.tasks.some(t=>t.id===targetId);
  if(fromIdx===-1 || !targetExists) return;
  const item = state.tasks[fromIdx];
  pushUndo(`Reordered "${item.title}"`);
  state.tasks.splice(fromIdx, 1);
  let toIdx = state.tasks.findIndex(t=>t.id===targetId);
  if(!before) toIdx += 1;
  state.tasks.splice(toIdx, 0, item);
  // render() replaces the dragged <li> with a brand-new DOM node via
  // innerHTML — doing that synchronously inside the drop handler yanks
  // the element the browser's native drag session is still tracking out
  // from under it, before dragend has even fired on it. That corrupts the
  // browser's own drag-state bookkeeping and is what made *later* drags
  // in the same session increasingly unreliable. Deferring to the next
  // tick lets the drag session finish (dragend included) before the DOM
  // underneath it changes. queueSave() doesn't touch the DOM, so it can
  // fire right away against the already-mutated state.
  setTimeout(render, 0);
  queueSave();
}

function subDragStart(e, taskId, subId){
  draggedSubtask = { taskId, subId };
  e.dataTransfer.effectAllowed = 'move';
  e.stopPropagation();
  e.currentTarget.closest('.subrow').classList.add('dragging');
}

function subDragOver(e){
  e.preventDefault();
  e.stopPropagation();
  document.querySelectorAll('.subrow.dragover, .subdropend.dragover').forEach(el=>el.classList.remove('dragover'));
  e.currentTarget.classList.add('dragover');
}

function subDrop(e, taskId, subId){
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('dragover');
  // Reordering only within the same task's own steps — dragging a step
  // onto a different task is silently ignored rather than moving it
  // there, since that's a distinct feature nobody asked for here.
  if(draggedSubtask && draggedSubtask.taskId===taskId && draggedSubtask.subId!==subId){
    const rect = e.currentTarget.getBoundingClientRect();
    reorderSubtask(taskId, draggedSubtask.subId, subId, (e.clientY - rect.top) < rect.height/2);
  }
  draggedSubtask = null;
}

function subDragEnd(){
  document.querySelectorAll('.subrow.dragging, .subrow.dragover, .subdropend.dragover').forEach(el=>el.classList.remove('dragging','dragover'));
  draggedSubtask = null;
}

// Same reasoning as dropEndHtml() above, one level down: a dedicated
// trailing target below a task's own steps (or a checklist's own items),
// so dropping at "the very end" doesn't depend on landing in exactly the
// bottom half of the last (fairly short) .subrow's bounds.
function subDropEnd(e, taskId, lastSubId){
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('dragover');
  if(draggedSubtask && draggedSubtask.taskId===taskId) reorderSubtask(taskId, draggedSubtask.subId, lastSubId, false);
  draggedSubtask = null;
}

function subDropEndHtml(taskId, subs){
  if(!subs.length) return '';
  const lastId = subs[subs.length-1].id;
  return `<div class="subdropend" ondragover="subDragOver(event)" ondrop="subDropEnd(event,'${taskId}','${lastId}')"></div>`;
}

function reorderSubtask(taskId, draggedSubId, targetSubId, before){
  // Same reasoning as reorderTask()'s identical guard — reached via
  // subDropEnd() when the dragged step is already the last one.
  if(draggedSubId === targetSubId) return;
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
  // Same reasoning as reorderTask() — defer past the still-active native
  // drag session on the dragged .subrow rather than yanking it out from
  // under itself.
  setTimeout(()=>{ render(); reopen(taskId); }, 0);
  queueSave();
}


