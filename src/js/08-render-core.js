// EXPERIMENTAL — fieldPickerStyle (see defaultDevSettings() in
// 02-storage-state.js). Drop-in replacement for a plain <select> when
// stepping through TIMEFRAME_STEPS/PRIORITY_STEPS (02-storage-state.js).
// `onClickFor(v)` returns the onclick handler string for stepping to
// value v — the two call sites need different targets (a task's own
// updateTimeframe/updatePriority vs. the quick-add bar's hidden <select>,
// see syncQuickField() in 06-tabs-render.js), so the caller decides what
// clicking a step actually does; this only renders the control. Returns
// '' for 'default' — callers keep showing their own native <select> in
// that case rather than this function rendering one too.
function fieldPickerHtml(kind, currentValue, onClickFor){
  const steps = kind === 'timeframe' ? TIMEFRAME_STEPS : PRIORITY_STEPS;
  const style = (state.devSettings && state.devSettings.fieldPickerStyle) || 'default';
  if(style === 'default') return '';
  const curStr = String(currentValue==null ? '' : currentValue);
  const idx = steps.findIndex(s => s.v === curStr);
  // "At max" (Urgent / High) is the one step that gets the pulse — see
  // .fieldbtn.atmax / .fieldprogress.atmax in <style>. idx>0 excludes the
  // single-step edge case of a field with only one entry ever reading as
  // simultaneously "unset" and "maxed out".
  const atMax = idx === steps.length - 1 && idx > 0;
  if(style === 'buttons'){
    return `<div class="fieldbuttons">${steps.map(s => `
      <button type="button" class="fieldbtn ${s.v===curStr?'active':''} ${s.v===curStr && atMax?'atmax':''}"
        onclick="${onClickFor(s.v)}">${escapeHtml(s.label)}</button>`).join('')}</div>`;
  }
  // progress: a filled track + one dot per step, each independently
  // clickable (not just draggable) so picking "Long" is still a single
  // tap even though it isn't the endpoint. denom guards the (currently
  // unreachable) 1-step case from a divide-by-zero.
  const denom = Math.max(steps.length - 1, 1);
  const pct = idx <= 0 ? 0 : (idx/denom)*100;
  return `
    <div class="fieldprogress ${atMax?'atmax':''}">
      <div class="fieldprogresstrack">
        <div class="fieldprogressfill" style="width:${pct}%"></div>
        ${steps.map((s,i)=>`<button type="button" class="fieldprogressdot ${i<=idx?'filled':''} ${i===idx?'current':''}"
          style="left:${(i/denom)*100}%" onclick="${onClickFor(s.v)}" title="${escapeHtml(s.label)}"></button>`).join('')}
      </div>
      <div class="fieldprogresslabel">${escapeHtml(idx>=0 ? steps[idx].label : steps[0].label)}</div>
    </div>`;
}

// extraClass is optional — renderTaskDetailPage() passes 'bigtitle' to
// match the checklist detail page's large centered title (see .bigtitle
// in <style>, shared with .titleedit there); every other caller
// (taskManagementFieldsHtml, the inline .expand) omits it and gets the
// normal compact field.
function taskTitleFieldHtml(t, extraClass){
  return `<input type="text" class="titleedit ${extraClass||''}" value="${escapeHtml(t.title)}"
        onblur="updateTitle('${t.id}', this.value)"
        onkeydown="if(event.key==='Enter'){ event.preventDefault(); this.blur(); }">`;
}

// Shared by taskCoreFieldsRowHtml's own today-pin (inside the full task
// detail/edit fields) and taskRowHtml's always-visible row-level one (see
// its own comment) — one tooltip string means the two can't drift apart.
function taskTodayTitle(t){
  const plannedToday = (t.plannedDates||[]).includes(todayStr());
  const otherPlanned = (t.plannedDates||[]).filter(d=>d!==todayStr()).length;
  return plannedToday ? 'Remove from today’s list'
    : otherPlanned ? `Also planned on ${otherPlanned} other day${otherPlanned===1?'':'s'} — tap to add today too`
    : 'Add to today’s list';
}

function taskCoreFieldsRowHtml(t, canRemoveHere){
  const todayTitle = taskTodayTitle(t);
  return `
      <div class="expand-row">
        <select class="catselect" onchange="updateCategory('${t.id}', this.value)">
          ${standardCategoryEntries().map(([k,v])=>`<option value="${k}" ${t.category===k?'selected':''}>${v.label}</option>`).join('')}
        </select>
        <label class="fieldlabel">DUE</label>
        <span class="subdate ${t.dueDate?'':'empty'}" onclick="startEditTaskDueDate(this,'${t.id}')">${t.dueDate ? fmtDateShort(t.dueDate) : 'Date'}</span>
        <div class="expandactions">
          <button class="flagbtn ${t.urgent?'on':''}" onclick="toggleUrgent('${t.id}')" title="Toggle urgent">⚑</button>
          <button class="flagbtn daybtn ${hasCurrentPlan(t.plannedDates)?'on':''}" onclick="toggleTaskToday('${t.id}')" title="${todayTitle}">📌</button>
          ${canRemoveHere ? `<button class="remove" onclick="deleteTask('${t.id}')">Remove</button>` : ''}
        </div>
      </div>`;
}

// Swap-in-a-text-input trick, same as startEditSubtaskDate()
// (15-subtask-edit.js) — natural-language parsing (today, tmrw, 9/1,
// tue…) via parseNaturalDate() instead of a native <input type=date>,
// per the explicit ask to make a task's own due date behave (and look —
// see .subdate/.subdateedit in <style>) like a step's already does,
// rather than the native picker's largely unstyleable white/square
// chrome. An empty input clears the date; unparseable text just reverts
// rather than guessing wrong.
function startEditTaskDueDate(el, taskId){
  const t = state.tasks.find(t=>t.id===taskId);
  if(!t) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'subdateedit';
  input.value = t.dueDate ? fmtDateShort(t.dueDate) : '';
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
      if(t.dueDate) await updateDueDate(taskId, '');
      else { render(); reopen(taskId); }
      return;
    }
    const parsed = parseNaturalDate(raw);
    if(parsed) await updateDueDate(taskId, parsed);
    else { render(); reopen(taskId); } // unparseable — revert, don't save
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => { if(e.key==='Enter'){ e.preventDefault(); input.blur(); } });
}

// Timeframe/Priority both fall back to a plain <select> built straight
// from the same TIMEFRAME_STEPS/PRIORITY_STEPS list fieldPickerHtml()
// reads (02-storage-state.js), so the option set/order can never drift
// between the two — only how they're *drawn* differs.
function taskAdvancedFieldsRowHtml(t){
  if(!state.advancedTaskFields) return '';
  const timeframePicker = fieldPickerHtml('timeframe', t.timeframe, v=>`updateTimeframe('${t.id}','${v}')`)
    || `<select class="catselect" onchange="updateTimeframe('${t.id}', this.value)">
          ${TIMEFRAME_STEPS.map(s=>`<option value="${s.v}" ${(t.timeframe||'')===s.v?'selected':''}>${s.label}</option>`).join('')}
        </select>`;
  const priorityPicker = fieldPickerHtml('priority', t.priority, v=>`updatePriority('${t.id}','${v}')`)
    || `<select class="catselect" onchange="updatePriority('${t.id}', this.value)">
          ${PRIORITY_STEPS.map(s=>`<option value="${s.v}" ${String(t.priority||0)===s.v?'selected':''}>${s.label}</option>`).join('')}
        </select>`;
  return `
      <div class="expand-row">
        <label class="fieldlabel">TIMEFRAME</label>
        ${timeframePicker}
        <label class="fieldlabel">PRIORITY</label>
        ${priorityPicker}
      </div>`;
}

function taskNotesAndMetaHtml(t){
  let metaLine = `Created ${fmtDate(t.createdAt)}`;
  if(t.status==='done' && t.completedAt){
    metaLine += ` · Completed ${fmtDate(t.completedAt)} (${daysBetween(t.createdAt, t.completedAt)}d)`;
  } else {
    const age = daysBetween(t.createdAt, todayStr());
    if(age > 0) metaLine += ` · Open ${age}d`;
  }
  return `
      <textarea class="notesfield" placeholder="Notes…" onblur="updateNotes('${t.id}', this.value)">${escapeHtml(t.notes||'')}</textarea>
      <div class="taskmeta">${metaLine}</div>`;
}

// Factored out specifically so a short tap in taskLongPressMode's "split"
// variant (see taskRowHtml() below) can show just this — the one part of
// a task's detail worth glancing at on every tap — without the rest of
// taskManagementFieldsHtml() coming along with it.
function taskSubtasksHtml(t){
  const subs = t.subtasks || [];
  return `
      <div class="subwrap">
        <div class="sublabel">Steps</div>
        ${subs.map(s=>{
          const subPlannedToday = (s.plannedDates||[]).includes(todayStr());
          const subOtherPlanned = (s.plannedDates||[]).filter(d=>d!==todayStr()).length;
          const subTodayTitle = subPlannedToday ? 'Remove from today’s list'
            : subOtherPlanned ? `Also planned on ${subOtherPlanned} other day${subOtherPlanned===1?'':'s'} — tap to add today too`
            : 'Add to today’s list';
          return `
          <div class="subrow" ondragover="subDragOver(event)" ondrop="subDrop(event,'${t.id}','${s.id}')">
            <span class="draghandle sub" draggable="true" ondragstart="subDragStart(event,'${t.id}','${s.id}')" ondragend="subDragEnd()" title="Drag to reorder">⠿</span>
            <div class="subcheck ${s.done?'done':''}" onclick="toggleSubtask('${t.id}','${s.id}')"></div>
            <div class="subtext ${s.done?'done':''}" onclick="startEditSubtask(this,'${t.id}','${s.id}')">${escapeHtml(s.text)}</div>
            <div class="subrowactions">
              <div class="subdate ${s.dueDate?'':'empty'}" onclick="startEditSubtaskDate(this,'${t.id}','${s.id}')">${s.dueDate ? fmtDateShort(s.dueDate) : 'Date'}</div>
              <button class="flagbtn daybtn ${hasCurrentPlan(s.plannedDates)?'on':''}" onclick="event.stopPropagation(); toggleSubtaskToday('${t.id}','${s.id}')" title="${subTodayTitle}">📌</button>
              <button class="subdel" onclick="deleteSubtask('${t.id}','${s.id}')">×</button>
            </div>
          </div>`;
        }).join('')}
        ${subDropEndHtml(t.id, subs)}
        <!-- onblur also commits (addSubtask() no-ops on an empty string,
             so tabbing/tapping away from an untouched field is still a
             no-op) — iOS's own keyboard toolbar "Done" button only blurs
             a field, it never fires a keydown Enter the way a hardware
             keyboard does, so without this, dismissing the keyboard that
             way silently threw away whatever was typed. The keydown
             handler clears this.value BEFORE calling addSubtask() (not
             after) specifically because addSubtask() calls render()
             synchronously, which replaces this very input out from under
             itself and blurs it as a side effect — clearing first is what
             makes that implicit blur's own addSubtask() call see an empty
             string and no-op, instead of re-submitting the same step
             twice. -->
        <input type="text" class="subadd" placeholder="+ add a step, enter to save"
          onkeydown="if(event.key==='Enter'){ const v=this.value; this.value=''; addSubtask('${t.id}', v); }"
          onblur="addSubtask('${t.id}', this.value)">
      </div>`;
}

// Everything EXCEPT Steps — the long-press settings sheet's own content
// (openTaskSettingsSheet() in 08-render-core.js, taskLongPressMode
// 'split') is just this, since Steps already got its own short-tap view.
function taskManagementFieldsHtml(t, canRemoveHere){
  return `${taskTitleFieldHtml(t)}${taskCoreFieldsRowHtml(t, canRemoveHere)}${taskAdvancedFieldsRowHtml(t)}${taskNotesAndMetaHtml(t)}`;
}

// Everything a task's own detail shows below its row header — title,
// category/due/urgent/today fields, timeframe/priority, steps, notes,
// meta line. Shared by the inline .expand under a normal row (default
// taskLongPressMode) and the full-page task detail opened from Daily
// (renderTaskDetailPage) so the two can never drift out of sync — edit
// once, both places update.
function taskExpandFieldsHtml(t, canRemoveHere, titleClass){
  return `${taskTitleFieldHtml(t, titleClass)}${taskCoreFieldsRowHtml(t, canRemoveHere)}${taskAdvancedFieldsRowHtml(t)}${taskSubtasksHtml(t)}${taskNotesAndMetaHtml(t)}`;
}

// The "check-guide" nudge: once every step is done but the task itself
// isn't checked off yet, the checkbox calls attention to itself — the
// assumption being that all-steps-done usually IS task-done, so this
// nudges toward actually checking it rather than leaving it sitting
// finished-but-unmarked. Purely derived from current state (not a flag
// set at the moment a step is checked) so it reappears on every render
// for as long as the condition holds and disappears the instant it
// doesn't — no timer, nothing to clean up. Gated to subs.length >= 1 so
// a subtask-less task never gets it (nothing to have "just finished").
// 2+ subtasks gets the full looping animation (guide-full); exactly 1
// gets a couple of quick pulses only (guide-quick) — a single step
// finishing doesn't carry the same "you just cleared the whole list"
// weight, so it only needs a brief nod, not an insistent loop. `subtle`
// (true in a task-list row, false on the full task detail page) tones
// the same animation down via the --guide-scale/--guide-opacity custom
// properties the CSS reads, rather than forking a second set of
// keyframes per context.
function checkGuideClass(t, subs, subtle){
  if(t.status==='done' || !subs.length || !subs.every(s=>s.done)) return '';
  const style = (state.devSettings && state.devSettings.checkGuideAnimationStyle) || 'spin';
  const intensity = subs.length >= 2 ? 'guide-full' : 'guide-quick';
  return ` guide-check guide-${style} ${intensity}${subtle ? ' guide-subtle' : ''}`;
}

// The payoff: a one-shot celebration burst when a task is actually
// checked off (see celebrateCheckTaskId, 16-task-crud.js) — separate from
// the guide nudge above and not user-configurable, since it's meant to
// read as this app's one fixed "you did it" moment rather than a style
// someone tunes.
function checkCelebrateClass(t){
  return t.id === celebrateCheckTaskId ? ' celebrate-check' : '';
}

function taskRowHtml(t, showDot, inDaily, dayDate){
  const cat = CATEGORIES[t.category] || FALLBACK_CATEGORY;
  const canRemoveHere = !inDaily || t.category==='misc';
  const overdue = isOverdue(t);
  let badge = '';
  if(overdue) badge = `<span class="badge overdue">Overdue</span>`;
  else if(t.dueDate) badge = `<span class="badge due">${fmtDate(t.dueDate)}</span>`;
  // Priority/timeframe badges only render when actually set (both default
  // to "unset") and only in advanced mode — a task nobody has triaged
  // stays exactly as uncluttered as it always was.
  let priorityBadge = '';
  if(state.advancedTaskFields && t.priority){
    const pClass = t.priority===3 ? 'priority-high' : t.priority===2 ? 'priority-medium' : 'priority-low';
    priorityBadge = `<span class="badge ${pClass}">${PRIORITY_LABELS[t.priority]}</span>`;
  }
  let timeframeBadge = '';
  if(state.advancedTaskFields && t.timeframe){
    timeframeBadge = `<span class="badge timeframe">${TIMEFRAME_LABELS[t.timeframe]}</span>`;
  }
  const dotHtml = showDot ? categoryDotHtml(cat, 'cdot') : '';
  const subs = t.subtasks || [];
  // Drag-to-reorder is only meaningful in 'default' sort mode — every
  // other mode derives the row's position from a sort key, so a drag
  // there would just snap back on the next render. No handle, no drag
  // attributes at all outside 'default', rather than a handle that's
  // present but silently does nothing.
  const draggableMain = sortMode === 'default';
  const dragHandle = draggableMain
    ? `<span class="draghandle" draggable="true" ondragstart="taskDragStart(event,'${t.id}')" ondragend="taskDragEnd()" onclick="event.stopPropagation()" title="Drag to reorder">⠿</span>`
    : '';
  const dragTargetAttrs = draggableMain
    ? `ondragover="taskDragOver(event)" ondrop="taskDrop(event,'${t.id}')"`
    : '';
  // Within Daily, clicking a task opens its own full page (see
  // openTaskDetailFromDay/renderTaskDetailPage) rather than expanding
  // inline — everywhere else it's routed through taskRowTap(), which reads
  // taskLongPressMode itself to decide between the inline .expand toggle
  // ('default'/'split', and 'detail' on desktop, where there's no
  // long-press gesture to reach the full page with) and jumping straight
  // to the full page (mobile 'detail' — a plain tap works like a
  // home-screen icon there, since swipe-back makes returning cheap; see
  // the "task quick/detail views" note in the taskLongPressMode dev
  // setting's own comment for why desktop stays on the inline toggle
  // instead), and also swallows the click a touchend/mouseup produces
  // right after a long-press just fired rather than double-handling it.
  const rowClick = inDaily ? `openTaskDetailFromDay('${t.id}')` : `taskRowTap(event,'${t.id}')`;
  // 'split' and 'detail' both only apply outside Daily — a Daily row
  // already opens its own full page on a plain tap, so there's no
  // long-press gesture to add here in the first place.
  const usePressGesture = !inDaily && state.devSettings &&
    (state.devSettings.taskLongPressMode === 'split' || state.devSettings.taskLongPressMode === 'detail') &&
    mobileUiActive();
  const pressAttrs = usePressGesture
    ? ` ontouchstart="taskPressStart(event,'${t.id}')" ontouchmove="taskPressMove(event)" ontouchend="taskPressEnd()" ontouchcancel="taskPressEnd()" onmousedown="taskPressStart(event,'${t.id}')" onmouseup="taskPressEnd()" onmouseleave="taskPressEnd()"`
    : '';
  // The inline .expand is a *quick* view — Steps only, always, on every
  // platform and every taskLongPressMode — never the full edit fields
  // (category/due/timeframe/priority/notes) taskExpandFieldsHtml() would
  // otherwise show. Those now live only on the full task detail page,
  // reached via the always-visible ⛶ button below (or, on mobile under
  // 'detail', a plain tap — see rowClick's comment above) — a task row
  // used to fall back to showing *everything* inline on desktop (nothing
  // there ever gated it the way usePressGesture gates mobile), which is
  // exactly the "quick view" cluttered with edit options this replaced.
  const expandInner = taskSubtasksHtml(t);
  // The right-click menu (desktop-only, see handleTaskContextMenu()
  // below) — scoped to !inDaily for the same reason usePressGesture is: a
  // Daily row already has its own click behavior and canRemoveHere rules
  // that don't map cleanly onto this.
  const ctxMenuAttr = inDaily ? '' : ` oncontextmenu="return handleTaskContextMenu(event,'${t.id}')"`;
  const onTomorrow = inDaily && (t.plannedDates||[]).includes(addDaysToDateStr(dayDate, 1));
  return `
  <li class="task" data-task-id="${t.id}" ${dragTargetAttrs}>
    <div class="row"${pressAttrs}${ctxMenuAttr} onclick="${rowClick}">
      ${dragHandle}
      <div class="checkwrap" onclick="event.stopPropagation()">
        <div class="check ${t.status==='done'?'done':''}${checkGuideClass(t, subs, true)}${checkCelebrateClass(t)}" onclick="toggleStatus('${t.id}')"></div>
        ${subProgressHtml(subs)}
      </div>
      ${dotHtml}
      <div class="titlewrap">
        <div class="title ${t.status==='done'?'done':''}">${escapeHtml(t.title)}${t.urgent && t.status!=='done' ? ' ⚑' : ''}</div>
        <div class="meta">${priorityBadge}${timeframeBadge}${badge}</div>
      </div>
      ${inDaily ? `
        <button class="movetmrw" ${onTomorrow?'disabled':''} onclick="event.stopPropagation(); moveTaskToTomorrow('${t.id}','${dayDate}')" title="${onTomorrow ? 'Already planned for tomorrow' : 'Also plan for tomorrow'}">→</button>
        <button class="dayremove" onclick="event.stopPropagation(); unplanTaskFromDay('${t.id}','${dayDate}')" title="Remove from this day">×</button>
      ` : `
        <button class="rowpin ${hasCurrentPlan(t.plannedDates)?'on':''}" onclick="event.stopPropagation(); toggleTaskToday('${t.id}')" title="${taskTodayTitle(t)}">📌</button>
        <button class="rowexpand" onclick="event.stopPropagation(); openMobileTaskDetail('${t.id}')" title="Open full task page">⛶</button>
      `}
    </div>
    ${inDaily ? '' : `<div class="expand ${expandedTaskIds.has(t.id)?'open':''}" id="exp-${t.id}">${expandInner}</div>`}
  </li>`;
}

// ---------- taskLongPressMode 'split'/'detail': long-press gesture ----------
// touchstart/mousedown arms a timer and adds a 'pressing' class to the row
// (see .row.pressing in <style>) — otherwise the 500ms hold gives no
// feedback at all until either the timer fires or the finger lifts, which
// reads as unresponsive. touchend/mouseup/mouseleave (a plain tap, or the
// finger/mouse lifting before the timer fires) cancels it; touchmove past
// a small tolerance also cancels it, so scrolling the page with a finger
// that happens to start on a task row can't be mistaken for a long-press.
// If the timer *does* fire, taskLongPressFired is left set so the click
// event a touchend/mouseup produces right after (real on mobile, synthetic
// on some browsers) gets swallowed by taskRowTap() instead of also
// running its own tap behavior. Which of the two modes is active only
// changes what a tap and a fired long-press each do — the gesture
// detection itself is identical either way.
const TASK_LONG_PRESS_MS = 500;
const TASK_LONG_PRESS_TOLERANCE_PX = 10;

function taskPressStart(e, taskId){
  if(!mobileUiActive()) return;
  taskLongPressFired = false;
  const pt = e.touches ? e.touches[0] : e;
  taskPressStartX = pt.clientX;
  taskPressStartY = pt.clientY;
  taskPressRow = e.currentTarget;
  taskPressRow.classList.add('pressing');
  clearTimeout(taskPressTimer);
  taskPressTimer = setTimeout(() => {
    taskPressTimer = null;
    taskLongPressFired = true;
    if(taskPressRow) taskPressRow.classList.remove('pressing');
    // 'detail': a quick-actions menu anchored to the row — see
    // openTaskContextMenuForRow() below. 'split': the full-field bottom
    // sheet, same as ever.
    if(state.devSettings.taskLongPressMode === 'detail') openTaskContextMenuForRow(taskId, taskPressRow);
    else openTaskSettingsSheet(taskId);
  }, TASK_LONG_PRESS_MS);
}
function taskPressMove(e){
  if(!taskPressTimer) return;
  const pt = e.touches ? e.touches[0] : e;
  const dx = pt.clientX - taskPressStartX, dy = pt.clientY - taskPressStartY;
  if(Math.hypot(dx, dy) > TASK_LONG_PRESS_TOLERANCE_PX){
    clearTimeout(taskPressTimer);
    taskPressTimer = null;
    if(taskPressRow) taskPressRow.classList.remove('pressing');
  }
}
function taskPressEnd(){
  clearTimeout(taskPressTimer);
  taskPressTimer = null;
  if(taskPressRow) taskPressRow.classList.remove('pressing');
}
// Mobile 'detail': a plain tap jumps straight to the full task page —
// same platform-standard split as a home-screen icon (tap to open,
// long-press for quick actions), and cheap to back out of via swipe-back.
// Every other case (desktop regardless of mode, or mobile under
// 'default'/'split') falls through to toggleExpand()'s inline Steps-only
// quick view instead — desktop has no swipe-back, so jumping to a full
// page on every tap would make "just glance at the steps" the expensive
// path instead of the cheap one.
//
// A quick double-tap jumps straight to the full task page too — timed by
// hand here (lastRowTap below) rather than a native `ondblclick`, whose
// timing threshold is the OS/browser's own double-click speed (often
// 400-500ms+, sometimes more). That was loose enough that two genuinely
// separate, just moderately-quick taps meaning "open the quick view, then
// close it again" could get mistaken for one double-tap — this window is
// deliberately tighter, so only an actually-fast double-tap counts.
const ROW_DOUBLE_TAP_MS = 280;
let lastRowTap = null; // { taskId, time } | null — the most recent single tap's own taskRowTap() call, for comparing against the next one
function taskRowTap(e, taskId){
  if(taskLongPressFired){ taskLongPressFired = false; e.preventDefault(); return; }
  const now = Date.now();
  if(lastRowTap && lastRowTap.taskId === taskId && now - lastRowTap.time < ROW_DOUBLE_TAP_MS){
    lastRowTap = null;
    openMobileTaskDetail(taskId);
    return;
  }
  lastRowTap = { taskId, time: now };
  if(mobileUiActive() && state.devSettings.taskLongPressMode === 'detail'){ openMobileTaskDetail(taskId); return; }
  toggleExpand(e, taskId);
}

// ---------- a task's own right-click menu ----------
// Returned directly from a row's oncontextmenu attribute (see taskRowHtml()
// above) — `return false` there is the inline-handler equivalent of
// e.preventDefault(), which is what actually keeps the browser's native
// menu from also showing. Desktop-only: on an actual touch device
// there's no right-click to intercept in the first place, and
// mobileUiActive() already covers "acting like a phone" for
// mobileUiPreviewOnDesktop too. Was a dev setting (customContextMenu);
// graduated to the real, always-on behavior.
function handleTaskContextMenu(e, taskId){
  if(mobileUiActive()) return true;
  openTaskContextMenu(taskId, e.clientX, e.clientY);
  return false;
}

let ctxMenuTaskId = null;

// includeEdit is false for the mobile 'detail' long-press menu
// (openTaskContextMenuForRow() below) — a plain tap there already opens
// the full task page, so "Edit details" would just be a slower way to do
// what the tap already does. Desktop's right-click menu keeps it (routed
// to openMobileTaskDetail(), same full page — not toggleExpand(), whose
// inline .expand is Steps-only now and has no edit fields to open), since
// desktop's own row already has a .rowexpand button for this too, but a
// right-click menu that's already open is one less click than reaching
// for it.
function taskContextMenuHtml(t, includeEdit){
  const plannedToday = (t.plannedDates||[]).includes(todayStr());
  return `
    <button onclick="ctxMenuAction(()=>toggleStatus('${t.id}'))">${t.status==='done' ? 'Reopen' : 'Mark complete'}</button>
    <button onclick="ctxMenuAction(()=>toggleUrgent('${t.id}'))">${t.urgent ? 'Unmark urgent' : 'Mark urgent'}</button>
    <button onclick="ctxMenuAction(()=>toggleTaskToday('${t.id}'))">${plannedToday ? 'Remove from today' : 'Add to today'}</button>
    ${includeEdit ? `<button onclick="ctxMenuAction(()=>openMobileTaskDetail('${t.id}'))">Edit details</button>` : ''}
    <button onclick="ctxMenuCopyTitle('${t.id}')">Copy title</button>
    <div class="ctxmenu-sep"></div>
    <button class="ctxmenu-danger" onclick="ctxMenuAction(()=>deleteTask('${t.id}'))">Delete</button>
  `;
}

// Shared by the desktop right-click menu and the mobile 'detail'
// long-press menu — positioned at (x, y), then nudged back onto screen
// after a layout pass, since its own width/height aren't known until the
// browser has actually laid out the menu just rendered into it.
function renderTaskContextMenu(taskId, x, y, includeEdit){
  const t = state.tasks.find(x2=>x2.id===taskId);
  if(!t) return;
  ctxMenuTaskId = taskId;
  const menu = document.getElementById('ctxMenu');
  menu.innerHTML = taskContextMenuHtml(t, includeEdit);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.classList.add('open');
  applyDevElementNames();
  requestAnimationFrame(() => {
    const r = menu.getBoundingClientRect();
    if(r.right > window.innerWidth) menu.style.left = Math.max(8, window.innerWidth - r.width - 8) + 'px';
    if(r.bottom > window.innerHeight) menu.style.top = Math.max(8, window.innerHeight - r.height - 8) + 'px';
  });
}
function openTaskContextMenu(taskId, x, y){
  renderTaskContextMenu(taskId, x, y, true);
}
// taskLongPressMode 'detail': anchored to the row's own bounding rect
// rather than the touch point — the touch point is wherever the finger
// that just triggered this is, which would as often as not spawn the menu
// half-hidden underneath the hand holding the phone.
function openTaskContextMenuForRow(taskId, rowEl){
  const r = rowEl.getBoundingClientRect();
  renderTaskContextMenu(taskId, r.left, r.bottom + 6, false);
}
// Shared by the task menu above and the day menu below — only one
// #ctxMenu exists, so only one of ctxMenuTaskId/ctxMenuDayStr is ever
// non-null at a time; closing always clears both regardless of which
// one's actually set, rather than needing a caller to know which kind of
// menu is currently open.
function closeCtxMenu(){
  ctxMenuTaskId = null;
  ctxMenuDayStr = null;
  document.getElementById('ctxMenu').classList.remove('open');
}
// Every menu item (task or day) routes through this — closes the menu
// first, then runs the actual action, so a slow-ish action (most of these
// call render()) never leaves a stale menu sitting on screen mid-update.
function ctxMenuAction(fn){
  closeCtxMenu();
  fn();
}
function ctxMenuCopyTitle(taskId){
  const t = state.tasks.find(x=>x.id===taskId);
  closeCtxMenu();
  if(t && navigator.clipboard) navigator.clipboard.writeText(t.title).catch(()=>{});
}

// ---------- a day's own right-click menu ----------
// Same #ctxMenu popup the task menu above uses (see renderTaskContextMenu),
// just with day-flavored content — reached from .dayitem's oncontextmenu
// (dayItemHtml(), 11-daily-core.js) and .dayhero's (renderDayDetail(),
// 12-daily-tree.js), the latter for deleting whichever day you're
// currently looking at. "Open" is included even on .dayhero's own menu
// (where you're already on that day) rather than only showing it from the
// list — harmless there (just re-opens the same day), and keeps this one
// function the single source for both call sites instead of two near-
// duplicate menus.
let ctxMenuDayStr = null;
function dayContextMenuHtml(dateStr){
  return `
    <button onclick="ctxMenuAction(()=>openDay('${dateStr}'))">Open</button>
    <div class="ctxmenu-sep"></div>
    <button class="ctxmenu-danger" onclick="ctxMenuAction(()=>deleteDay('${dateStr}'))">Delete day</button>
  `;
}
function renderDayContextMenu(dateStr, x, y){
  if(!state.days.includes(dateStr)) return;
  ctxMenuDayStr = dateStr;
  const menu = document.getElementById('ctxMenu');
  menu.innerHTML = dayContextMenuHtml(dateStr);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.classList.add('open');
  applyDevElementNames();
  requestAnimationFrame(() => {
    const r = menu.getBoundingClientRect();
    if(r.right > window.innerWidth) menu.style.left = Math.max(8, window.innerWidth - r.width - 8) + 'px';
    if(r.bottom > window.innerHeight) menu.style.top = Math.max(8, window.innerHeight - r.height - 8) + 'px';
  });
}
// Desktop-only, same reasoning as handleTaskContextMenu() above — on an
// actual touch device there's no right-click to intercept, and Mobile UI
// Lab's own preview mode already covers "acting like a phone" either way.
function handleDayContextMenu(e, dateStr){
  if(mobileUiActive()) return true;
  renderDayContextMenu(dateStr, e.clientX, e.clientY);
  return false;
}

// The long-press settings sheet itself — everything taskManagementFieldsHtml()
// covers (title/category/due/urgent/pin/timeframe/priority/notes/meta),
// rendered into the always-in-DOM #taskSettingsSheet (shell-body.html)
// rather than per-task markup, since only one can ever be open at a time.
// canRemoveHere is always true here (matching taskRowHtml()'s own
// !inDaily case, since 'split' never applies inside Daily — see
// useSplitPress above) — no need to re-derive it from a category check.
function openTaskSettingsSheet(taskId){
  taskSettingsOpenId = taskId;
  renderTaskSettingsSheet();
  document.body.classList.add('tasksettings-open');
}
function closeTaskSettingsSheet(){
  taskSettingsOpenId = null;
  document.body.classList.remove('tasksettings-open');
}
// Called from openTaskSettingsSheet() and unconditionally (guarded) from
// render() — see the call near the top of render() below — so an edit
// made *inside* the sheet (which runs the task's normal update*()
// functions, each already calling render()) is reflected immediately
// rather than the sheet showing stale field values until it's reopened.
function renderTaskSettingsSheet(){
  if(!taskSettingsOpenId) return;
  const t = state.tasks.find(x=>x.id===taskSettingsOpenId);
  if(!t){ closeTaskSettingsSheet(); return; }
  document.getElementById('taskSettingsBody').innerHTML = taskManagementFieldsHtml(t, true);
}

// Full-page task detail — same shared fields as the inline .expand,
// wrapped in the "stacked page" pattern with a page tag back to wherever
// it was opened from, rather than expanding inline the way it does
// everywhere else. Two call sites share this: clicking a task or step
// within Daily (openTaskDetailFromDay, backs to "Daily") and a plain tap
// on any category tab's row under taskLongPressMode 'detail'
// (openMobileTaskDetail below, backs to "Back" — there's no single named
// destination since it could be any tab). backOnclick/backLabel are
// passed in rather than hardcoded so the two never have to fork this
// function to get their own back tag.
function renderTaskDetailPage(taskId, backOnclick, backLabel){
  const t = state.tasks.find(t=>t.id===taskId);
  const canRemoveHere = t.category==='misc';
  const subs = t.subtasks || [];
  // Urgent flag + today-pin live in this header row (right of the big
  // checkbox) rather than inline with the title below, or down in the
  // fields row further down the page the way every other task view keeps
  // them — the project owner specifically didn't want them inline with
  // the title (it threw off the title's own centering) and wanted them
  // reachable without adding any new vertical space on mobile, so this
  // row (already reserved for the checkbox, already at the very top)
  // absorbs them instead of a row of its own. The first, invisible copy
  // is a pure spacer — same markup, visibility:hidden — so the checkbox
  // stays visually centered instead of drifting toward the empty left
  // side once real buttons occupy the right (see .taskdetailhead
  // .titleactions.titlespacer in <style>).
  const actionsHtml = `
    <button class="flagbtn ${t.urgent?'on':''}" onclick="toggleUrgent('${t.id}')" title="Toggle urgent">⚑</button>
    <button class="flagbtn daybtn ${hasCurrentPlan(t.plannedDates)?'on':''}" onclick="toggleTaskToday('${t.id}')" title="${taskTodayTitle(t)}">📌</button>`;
  return `
    <div class="stackedpage">
      ${pageTagHtml(backOnclick, backLabel)}
      <div class="taskdetailhead">
        <div class="titleactions titlespacer" aria-hidden="true">${actionsHtml}</div>
        <div class="checkwrap">
          <div class="check ${t.status==='done'?'done':''}${checkGuideClass(t, subs, false)}${checkCelebrateClass(t)}" onclick="toggleStatus('${t.id}')"></div>
          ${subProgressHtml(subs)}
        </div>
        <div class="titleactions">${actionsHtml}</div>
      </div>
      ${taskExpandFieldsHtml(t, canRemoveHere, 'bigtitle')}
    </div>
  `;
}

function openTaskDetailFromDay(taskId){
  taskDetailId = taskId;
  renderDaily();
}
function closeTaskDetail(){
  taskDetailId = null;
  renderDaily();
}

// taskLongPressMode 'detail' — opened by a plain tap (see taskRowTap()
// above), not the long-press (that opens the quick-actions menu instead,
// openTaskContextMenuForRow()). A separate flag from Daily's own
// taskDetailId since this one has to work from any category tab (no
// selectedDay/dailyView to hang off of) and needs its own generic "Back"
// rather than "Daily".
let mobileTaskDetailId = null;
function openMobileTaskDetail(taskId){
  mobileTaskDetailId = taskId;
  render();
}
function closeMobileTaskDetail(){
  mobileTaskDetailId = null;
  render();
}

// Checklist lists don't carry due dates/priority and open into their own
// dedicated view rather than an inline expand, so taskRowHtml can't
// render them sensibly — they're excluded from "All" entirely rather
// than shown with fields that don't apply. Orphaned tasks (category id
// matches nothing current) still fall through to "All" as always. Pure
// (reads global state, no DOM writes) so swipeBackPreviewHtml() in
// 19-bootstrap.js can call it directly to preview a category tab's real
// content behind a back-swipe, without needing renderList() itself to
// actually repaint anything.
function categoryMatchingTasks(){
  return state.tasks.filter(t => {
    if(activeTab !== 'all') return t.category === activeTab;
    const cat = CATEGORIES[t.category];
    return !cat || cat.type !== 'checklist';
  });
}
function categoryVisibleTasks(){
  return applySortMode(categoryMatchingTasks()).filter(t => showDone || t.status!=='done' || completingTaskIds.has(t.id));
}

// Just the <ul class="tasks"> markup (or the empty-state div) — pure,
// same reason as categoryVisibleTasks() above.
function categoryListHtml(){
  const visible = categoryVisibleTasks();
  return visible.length===0
    ? `<div class="empty">${EMPTY_MSG[activeTab] || 'Nothing here yet.'}</div>`
    : visible.map(t=>taskRowHtml(t, activeTab==='all', false)).join('') + dropEndHtml(visible);
}

function renderList(){
  const doneCount = categoryMatchingTasks().filter(t=>t.status==='done').length;

  document.getElementById('sortRow').innerHTML = `
    <label class="fieldlabel">SORT</label>
    <select onchange="setSortMode(this.value)">${sortModeOptionsHtml(activeTab==='all')}</select>
  `;

  document.getElementById('taskList').innerHTML = categoryListHtml();

  const btn = document.getElementById('showDoneBtn');
  btn.textContent = showDone ? `Hide completed (${doneCount})` : `Show completed (${doneCount})`;
  btn.style.display = doneCount>0 ? '' : 'none';
}

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// "Stacked page" pattern (see .stackedpage/.pagetag/.pagetagtip/
// .pagetaglabel in <style>) — a small flag/tag with a rounded-triangle
// tip jutting past the edge of whatever it's anchored to, standing in
// for a plain .backbtn text link on any view that should read as its
// own page stacked on top of what's beneath it. Shared across every
// such view (checklist detail/pending, Settings, and whatever's next)
// so they can't drift into one-off variants — pass `compact` for a tag
// that isn't anchored to a .stackedpage (see .pagetag.compact).
function pageTagHtml(onclick, label, compact){
  return `<button class="pagetag${compact?' compact':''}" onclick="${onclick}"><span class="pagetagtip"></span><span class="pagetaglabel">${escapeHtml(label)}</span></button>`;
}

// What activeTab's own base view currently shows — pure mirror of
// render()'s own isDaily/isChecklist/isCalendar/else dispatch below, and
// of renderDaily()'s/renderChecklist()'s own internal sub-state dispatch,
// but returning a string instead of writing into #dailyView/#checklistView/
// etc. Exists for swipeBackPreviewHtml() in 19-bootstrap.js, which needs
// to preview "whatever's behind Settings/the Claude view/a tapped-open
// task's full-page detail" for a back-swipe ghost — all three back to
// activeTab's own base view unchanged, without going through any of
// those overlays' own state. Not used by render() itself, which still
// writes directly into each view's real DOM element — this is strictly
// an additional read path for a preview that must never touch the real
// document.
function currentTabBodyHtml(){
  if(activeTab === 'daily'){
    if(dailyCalendarOpen) return renderDailyCalendar();
    if(selectedDay && taskDetailId) return renderTaskDetailPage(taskDetailId, 'closeTaskDetail()', 'Daily');
    if(selectedDay) return renderDayDetail(selectedDay);
    return renderDayList();
  }
  if(isChecklistCategory(activeTab)){
    if(checklistPendingOpen) return renderChecklistPending(activeTab);
    if(selectedListId) return renderChecklistDetail(selectedListId);
    return renderChecklistOverview(activeTab);
  }
  return categoryListHtml();
}

function render(){
  renderDevPanel();
  renderTaskSettingsSheet();
  renderLocBadge();
  renderTabs();
  refreshUndoButtons();
  document.getElementById('settingsBtn').classList.toggle('on', settingsOpen);
  document.getElementById('dailyShortcutBtn').classList.toggle('on', activeTab==='daily' && !settingsOpen && !claudeView);
  const catView = document.getElementById('categoryView');
  const dayView = document.getElementById('dailyView');
  const chkView = document.getElementById('checklistView');
  const setView = document.getElementById('settingsView');
  const cldView = document.getElementById('claudeView');
  const mtdView = document.getElementById('mobileTaskDetailView');
  // taskLongPressMode 'detail' (see openMobileTaskDetail() below) — a
  // full-page task detail reachable from a plain tap on ANY category
  // tab's row, not just Daily's own taskDetailId. Highest priority of the
  // view-swapping branches here, same tier as claudeView/settingsOpen
  // (replaces the whole app body, not a floating overlay on top of it —
  // those live outside #appCard entirely, see the Esc handler's Mobile UI
  // Lab overlay comment in 19-bootstrap.js).
  if(mobileTaskDetailId && !state.tasks.find(x=>x.id===mobileTaskDetailId)) mobileTaskDetailId = null;
  if(mobileTaskDetailId){
    catView.style.display = 'none';
    dayView.style.display = 'none';
    chkView.style.display = 'none';
    setView.style.display = 'none';
    cldView.style.display = 'none';
    mtdView.style.display = '';
    mtdView.innerHTML = renderTaskDetailPage(mobileTaskDetailId, 'closeMobileTaskDetail()', 'Back');
    document.getElementById('taskList').innerHTML = ''; // avoid stale duplicate ids
    dayView.innerHTML = '';
    chkView.innerHTML = '';
    setView.innerHTML = '';
    cldView.innerHTML = '';
    applyDevElementNames();
    return;
  }
  mtdView.style.display = 'none';
  mtdView.innerHTML = '';
  if(claudeView){
    catView.style.display = 'none';
    dayView.style.display = 'none';
    chkView.style.display = 'none';
    setView.style.display = 'none';
    cldView.style.display = '';
    renderClaudeView();
    document.getElementById('taskList').innerHTML = ''; // avoid stale duplicate ids
    dayView.innerHTML = '';
    chkView.innerHTML = '';
    setView.innerHTML = '';
    applyDevElementNames();
    return;
  }
  cldView.style.display = 'none';
  cldView.innerHTML = '';
  if(settingsOpen){
    catView.style.display = 'none';
    dayView.style.display = 'none';
    chkView.style.display = 'none';
    setView.style.display = '';
    renderSettings();
    document.getElementById('taskList').innerHTML = ''; // avoid stale duplicate ids
    dayView.innerHTML = '';
    chkView.innerHTML = '';
    applyDevElementNames();
    return;
  }
  setView.style.display = 'none';
  setView.innerHTML = '';
  const isDaily = activeTab==='daily';
  const isChecklist = isChecklistCategory(activeTab);
  catView.style.display = (isDaily || isChecklist) ? 'none' : '';
  dayView.style.display = isDaily ? '' : 'none';
  chkView.style.display = isChecklist ? '' : 'none';
  if(isDaily){
    renderDaily();
    document.getElementById('taskList').innerHTML = ''; // avoid stale duplicate ids
    chkView.innerHTML = '';
  } else if(isChecklist){
    renderChecklist();
    document.getElementById('taskList').innerHTML = ''; // avoid stale duplicate ids
    dayView.innerHTML = '';
  } else {
    renderQuickCategory();
    renderList();
    dayView.innerHTML = ''; // avoid stale duplicate ids
    chkView.innerHTML = '';
  }
  applyDevElementNames();
}

// Only visible when the "Pages" texture is on, but harmless to always
// set — it's just an unused CSS variable otherwise. Picked from a fixed
// preset list (not fully random per-axis) so the tilt+offset always stay
// a matched, plausible-looking pair rather than occasionally combining
// into something that reads as broken.
const PAGE_TILTS = [
  'rotate(-2deg)',
  'rotate(2.5deg) translate(-2px, 1px)',
  'rotate(-3.5deg) translate(2px, -1px)',
  'rotate(1.5deg) translate(-1px, 2px)',
  'rotate(-1deg) translate(1px, -2px)',
  'rotate(3deg) translate(-1px, -1px)',
];
function randomizePageTilt(){
  const appCard = document.getElementById('appCard');
  if(!appCard) return;
  const t = PAGE_TILTS[Math.floor(Math.random() * PAGE_TILTS.length)];
  appCard.style.setProperty('--page-transform', t);
}

// Clicking a category tab always lands on that category, acting like an
// Esc out of whatever overlay (Settings, the Claude-readable view) was
// showing first — the tab bar stays visible and clickable through both,
// so without this a tap on a tab would silently update activeTab behind
// the still-open overlay instead of visibly taking you anywhere. No
// early-return for key === activeTab: clicking the tab you're already
// "on" while an overlay is open must still exit the overlay.
function switchTab(key){
  // Must run before anything below touches activeTab or the DOM — see
  // captureOverlapTabFlip() in 06-tabs-render.js for why this is the last
  // moment the tab bar's pre-switch on-screen state is still measurable.
  captureOverlapTabFlip(key);
  checklistReturnDay = null;
  claudeView = null;
  settingsOpen = false;
  // A tab switch mid-add should close the quick-add sheet rather than
  // leave it floating over whatever you just navigated to — the FAB
  // modal (openFabAdd()) is deliberately NOT reset here, since its whole
  // point is being reachable regardless of which tab you're on.
  if(quickAddOpen) toggleQuickAddSheet(false);
  // Same idea for the taskLongPressMode settings sheet — its task belongs
  // to whichever tab you were just on, so it shouldn't linger open over
  // a different one (the FAB modal's own exemption above doesn't apply
  // here: this sheet is tied to one specific task, not "reachable from
  // anywhere" the way the FAB is).
  if(taskSettingsOpenId) closeTaskSettingsSheet();
  // Same idea again for taskLongPressMode 'detail's full-page task
  // detail — tied to one specific task from whichever tab you were on.
  if(mobileTaskDetailId) mobileTaskDetailId = null;
  // ...and once more for whichever stackedpage drilldown a tab's own
  // content might be sitting on — a checklist list's own detail page
  // (selectedListId), its "all pending items" view (checklistPendingOpen),
  // or Daily's own day/task detail (selectedDay/taskDetailId,
  // dayReturnToCalendar along with it). None of these get quickAddOpen's
  // FAB exemption either: clicking any tab, including the one you're
  // already on, should always land on that tab's own master view, not
  // strand you on a drilldown left open from the last time you were there.
  selectedListId = null;
  checklistPendingOpen = false;
  selectedDay = null;
  taskDetailId = null;
  dayReturnToCalendar = false;
  // dailyCalendarOpen is the one exception to "always the master view" —
  // Daily has *two* peer master views (the day list and the calendar, see
  // the Daily/Calendar note in CLAUDE.md), not one, so landing on Daily
  // means restoring whichever of those was last "home" rather than always
  // defaulting to the list. dailyLastView (11-daily-core.js) is what
  // remembers that: dailyCalendarOpen itself only ever means "the grid is
  // the literal thing on screen right now," which is already false the
  // moment you open a specific day from it — leaving *it* in charge here
  // is what let a day opened from the calendar forget that heritage the
  // instant you switched to another tab and back, landing on the plain
  // list instead. Recomputed unconditionally (not just when leaving
  // Daily) since it's harmless to set on every switch and cheaper than
  // reasoning about which tab you're coming from.
  dailyCalendarOpen = dailyLastView === 'calendar';
  // Only an actual change of category counts as "leaving" it — re-clicking
  // the tab you're already on (which still runs this whole function, to
  // exit an open overlay per the note above) must not collapse tasks you
  // have expanded right now in that same category.
  if(key !== activeTab) expandedTaskIds = new Set();
  activeTab = key;
  // Device-local only (plain localStorage, not the synced storage adapter)
  // — which tab you're looking at isn't ledger data, so it doesn't belong
  // in state/Supabase. Restored in enterApp() so a reload lands back where
  // you were instead of always snapping to "All".
  localStorage.setItem('ledger-last-tab', key);
  randomizePageTilt();
  render();
}

function toggleShowDone(){ showDone = !showDone; render(); }

function toggleUrgentDraft(){
  urgentDraft = !urgentDraft;
  document.getElementById('urgentToggle').classList.toggle('on', urgentDraft);
}

