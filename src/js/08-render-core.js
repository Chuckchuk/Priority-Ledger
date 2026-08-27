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

function taskTitleFieldHtml(t){
  return `<input type="text" class="titleedit" value="${escapeHtml(t.title)}"
        onblur="updateTitle('${t.id}', this.value)"
        onkeydown="if(event.key==='Enter'){ event.preventDefault(); this.blur(); }">`;
}

function taskCoreFieldsRowHtml(t, canRemoveHere){
  const plannedToday = (t.plannedDates||[]).includes(todayStr());
  const otherPlanned = (t.plannedDates||[]).filter(d=>d!==todayStr()).length;
  const todayTitle = plannedToday ? 'Remove from today’s list'
    : otherPlanned ? `Also planned on ${otherPlanned} other day${otherPlanned===1?'':'s'} — tap to add today too`
    : 'Add to today’s list';
  return `
      <div class="expand-row">
        <select class="catselect" onchange="updateCategory('${t.id}', this.value)">
          ${standardCategoryEntries().map(([k,v])=>`<option value="${k}" ${t.category===k?'selected':''}>${v.label}</option>`).join('')}
        </select>
        <label class="fieldlabel">DUE</label>
        <input type="date" value="${t.dueDate||''}" onchange="updateDueDate('${t.id}', this.value)">
        <div class="expandactions">
          <button class="flagbtn ${t.urgent?'on':''}" onclick="toggleUrgent('${t.id}')" title="Toggle urgent">⚑</button>
          <button class="flagbtn daybtn ${(t.plannedDates||[]).length?'on':''}" onclick="toggleTaskToday('${t.id}')" title="${todayTitle}">📌</button>
          ${canRemoveHere ? `<button class="remove" onclick="deleteTask('${t.id}')">Remove</button>` : ''}
        </div>
      </div>`;
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
      <textarea placeholder="Notes…" onblur="updateNotes('${t.id}', this.value)">${escapeHtml(t.notes||'')}</textarea>
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
            <div class="subdate ${s.dueDate?'':'empty'}" onclick="startEditSubtaskDate(this,'${t.id}','${s.id}')">${s.dueDate ? fmtDateShort(s.dueDate) : 'Date'}</div>
            <button class="flagbtn daybtn small ${(s.plannedDates||[]).length?'on':''}" onclick="event.stopPropagation(); toggleSubtaskToday('${t.id}','${s.id}')" title="${subTodayTitle}">📌</button>
            <button class="subdel" onclick="deleteSubtask('${t.id}','${s.id}')">×</button>
          </div>`;
        }).join('')}
        ${subDropEndHtml(t.id, subs)}
        <input type="text" class="subadd" placeholder="+ add a step, enter to save" onkeydown="if(event.key==='Enter'){ addSubtask('${t.id}', this.value); }">
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
function taskExpandFieldsHtml(t, canRemoveHere){
  return `${taskTitleFieldHtml(t)}${taskCoreFieldsRowHtml(t, canRemoveHere)}${taskAdvancedFieldsRowHtml(t)}${taskSubtasksHtml(t)}${taskNotesAndMetaHtml(t)}`;
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
  // inline — everywhere else it's the usual inline .expand toggle, routed
  // through taskRowTap() so a long-press that just fired (taskLongPressMode
  // 'split', see below) can swallow the click a touchend/mouseup would
  // otherwise also produce, rather than both firing.
  const rowClick = inDaily ? `openTaskDetailFromDay('${t.id}')` : `taskRowTap(event,'${t.id}')`;
  // 'split' only applies outside Daily — a Daily row already opens its
  // own full page on a plain tap, so there's no "everything at once" tap
  // target here to split in the first place. Gated by mobileUiActive()
  // (touch-first — see the taskLongPressMode comment in
  // defaultDevSettings(), 02-storage-state.js) so a short tap keeps
  // opening the *entire* .expand on desktop, where there's no long-press
  // gesture to reach the rest with.
  const useSplitPress = !inDaily && state.devSettings && state.devSettings.taskLongPressMode === 'split' && mobileUiActive();
  const pressAttrs = useSplitPress
    ? ` ontouchstart="taskPressStart(event,'${t.id}')" ontouchmove="taskPressMove(event)" ontouchend="taskPressEnd()" ontouchcancel="taskPressEnd()" onmousedown="taskPressStart(event,'${t.id}')" onmouseup="taskPressEnd()" onmouseleave="taskPressEnd()"`
    : '';
  const expandInner = useSplitPress ? taskSubtasksHtml(t) : taskExpandFieldsHtml(t, canRemoveHere);
  const onTomorrow = inDaily && (t.plannedDates||[]).includes(addDaysToDateStr(dayDate, 1));
  return `
  <li class="task" ${dragTargetAttrs}>
    <div class="row"${pressAttrs} onclick="${rowClick}">
      ${dragHandle}
      <div class="checkwrap" onclick="event.stopPropagation()">
        <div class="check ${t.status==='done'?'done':''}" onclick="toggleStatus('${t.id}')"></div>
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
      ` : ''}
    </div>
    ${inDaily ? '' : `<div class="expand ${expandedTaskIds.has(t.id)?'open':''}" id="exp-${t.id}">${expandInner}</div>`}
  </li>`;
}

// ---------- taskLongPressMode 'split': long-press gesture + settings sheet ----------
// touchstart/mousedown arms a timer; touchend/mouseup/mouseleave (a plain
// tap, or the finger/mouse lifting before the timer fires) cancels it;
// touchmove past a small tolerance also cancels it, so scrolling the page
// with a finger that happens to start on a task row can't be mistaken for
// a long-press. If the timer *does* fire, taskLongPressFired is left set
// so the click event a touchend/mouseup produces right after (real on
// mobile, synthetic on some browsers) gets swallowed by taskRowTap()
// instead of also toggling the short-tap view.
const TASK_LONG_PRESS_MS = 500;
const TASK_LONG_PRESS_TOLERANCE_PX = 10;

function taskPressStart(e, taskId){
  if(!mobileUiActive()) return;
  taskLongPressFired = false;
  const pt = e.touches ? e.touches[0] : e;
  taskPressStartX = pt.clientX;
  taskPressStartY = pt.clientY;
  clearTimeout(taskPressTimer);
  taskPressTimer = setTimeout(() => {
    taskPressTimer = null;
    taskLongPressFired = true;
    openTaskSettingsSheet(taskId);
  }, TASK_LONG_PRESS_MS);
}
function taskPressMove(e){
  if(!taskPressTimer) return;
  const pt = e.touches ? e.touches[0] : e;
  const dx = pt.clientX - taskPressStartX, dy = pt.clientY - taskPressStartY;
  if(Math.hypot(dx, dy) > TASK_LONG_PRESS_TOLERANCE_PX){
    clearTimeout(taskPressTimer);
    taskPressTimer = null;
  }
}
function taskPressEnd(){
  clearTimeout(taskPressTimer);
  taskPressTimer = null;
}
function taskRowTap(e, taskId){
  if(taskLongPressFired){ taskLongPressFired = false; e.preventDefault(); return; }
  toggleExpand(e, taskId);
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

// Full-page task detail, opened by clicking a task or step within Daily
// (see openTaskDetailFromDay) — same shared fields as the inline .expand,
// wrapped in the "stacked page" pattern with a page tag back to the day
// it was opened from, rather than expanding inline the way it does
// everywhere else.
function renderTaskDetailPage(taskId, dateStr){
  const t = state.tasks.find(t=>t.id===taskId);
  const cat = CATEGORIES[t.category] || FALLBACK_CATEGORY;
  const canRemoveHere = t.category==='misc';
  return `
    <div class="stackedpage">
      ${pageTagHtml('closeTaskDetail()', 'Daily')}
      <div class="taskdetailhead">
        <div class="check ${t.status==='done'?'done':''}" onclick="toggleStatus('${t.id}')"></div>
        ${categoryDotHtml(cat, 'cdot')}
      </div>
      ${taskExpandFieldsHtml(t, canRemoveHere)}
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

function renderList(){
  // Checklist lists don't carry due dates/priority and open into their
  // own dedicated view rather than an inline expand, so taskRowHtml can't
  // render them sensibly — they're excluded from "All" entirely rather
  // than shown with fields that don't apply. Orphaned tasks (category id
  // matches nothing current) still fall through to "All" as always.
  const list = state.tasks.filter(t => {
    if(activeTab !== 'all') return t.category === activeTab;
    const cat = CATEGORIES[t.category];
    return !cat || cat.type !== 'checklist';
  });
  const visible = applySortMode(list).filter(t => showDone || t.status!=='done');
  const doneCount = list.filter(t=>t.status==='done').length;

  document.getElementById('sortRow').innerHTML = `
    <label class="fieldlabel">SORT</label>
    <select onchange="setSortMode(this.value)">${sortModeOptionsHtml(activeTab==='all')}</select>
  `;

  const el = document.getElementById('taskList');
  if(visible.length===0){
    el.innerHTML = `<div class="empty">${EMPTY_MSG[activeTab] || 'Nothing here yet.'}</div>`;
  } else {
    el.innerHTML = visible.map(t=>taskRowHtml(t, activeTab==='all', false)).join('') + dropEndHtml(visible);
  }

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

function render(){
  renderDevPanel();
  renderTaskSettingsSheet();
  renderLocBadge();
  renderTabs();
  refreshUndoButtons();
  document.getElementById('settingsBtn').classList.toggle('on', settingsOpen);
  const catView = document.getElementById('categoryView');
  const dayView = document.getElementById('dailyView');
  const chkView = document.getElementById('checklistView');
  const calView = document.getElementById('calendarView');
  const setView = document.getElementById('settingsView');
  const cldView = document.getElementById('claudeView');
  if(claudeView){
    catView.style.display = 'none';
    dayView.style.display = 'none';
    chkView.style.display = 'none';
    calView.style.display = 'none';
    setView.style.display = 'none';
    cldView.style.display = '';
    renderClaudeView();
    document.getElementById('taskList').innerHTML = ''; // avoid stale duplicate ids
    dayView.innerHTML = '';
    chkView.innerHTML = '';
    calView.innerHTML = '';
    setView.innerHTML = '';
    return;
  }
  cldView.style.display = 'none';
  cldView.innerHTML = '';
  if(settingsOpen){
    catView.style.display = 'none';
    dayView.style.display = 'none';
    chkView.style.display = 'none';
    calView.style.display = 'none';
    setView.style.display = '';
    renderSettings();
    document.getElementById('taskList').innerHTML = ''; // avoid stale duplicate ids
    dayView.innerHTML = '';
    chkView.innerHTML = '';
    calView.innerHTML = '';
    return;
  }
  setView.style.display = 'none';
  setView.innerHTML = '';
  const isDaily = activeTab==='daily';
  const isChecklist = isChecklistCategory(activeTab);
  const isCalendar = isCalendarCategory(activeTab);
  catView.style.display = (isDaily || isChecklist || isCalendar) ? 'none' : '';
  dayView.style.display = isDaily ? '' : 'none';
  chkView.style.display = isChecklist ? '' : 'none';
  calView.style.display = isCalendar ? '' : 'none';
  if(isDaily){
    renderDaily();
    document.getElementById('taskList').innerHTML = ''; // avoid stale duplicate ids
    chkView.innerHTML = '';
    calView.innerHTML = '';
  } else if(isChecklist){
    renderChecklist();
    document.getElementById('taskList').innerHTML = ''; // avoid stale duplicate ids
    dayView.innerHTML = '';
    calView.innerHTML = '';
  } else if(isCalendar){
    renderCalendar();
    document.getElementById('taskList').innerHTML = ''; // avoid stale duplicate ids
    dayView.innerHTML = '';
    chkView.innerHTML = '';
  } else {
    renderQuickCategory();
    renderList();
    dayView.innerHTML = ''; // avoid stale duplicate ids
    chkView.innerHTML = '';
    calView.innerHTML = '';
  }
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

