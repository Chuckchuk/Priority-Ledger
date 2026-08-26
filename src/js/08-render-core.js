// Everything a task's own detail shows below its row header — title,
// category/due/urgent/today fields, timeframe/priority, steps, notes,
// meta line. Shared by the inline .expand under a normal row and the
// full-page task detail opened from Daily (renderTaskDetailPage) so the
// two can never drift out of sync — edit once, both places update.
function taskExpandFieldsHtml(t, canRemoveHere){
  const subs = t.subtasks || [];
  let metaLine = `Created ${fmtDate(t.createdAt)}`;
  if(t.status==='done' && t.completedAt){
    metaLine += ` · Completed ${fmtDate(t.completedAt)} (${daysBetween(t.createdAt, t.completedAt)}d)`;
  } else {
    const age = daysBetween(t.createdAt, todayStr());
    if(age > 0) metaLine += ` · Open ${age}d`;
  }
  const plannedToday = (t.plannedDates||[]).includes(todayStr());
  const otherPlanned = (t.plannedDates||[]).filter(d=>d!==todayStr()).length;
  const todayTitle = plannedToday ? 'Remove from today’s list'
    : otherPlanned ? `Also planned on ${otherPlanned} other day${otherPlanned===1?'':'s'} — tap to add today too`
    : 'Add to today’s list';
  return `
      <input type="text" class="titleedit" value="${escapeHtml(t.title)}"
        onblur="updateTitle('${t.id}', this.value)"
        onkeydown="if(event.key==='Enter'){ event.preventDefault(); this.blur(); }">
      <div class="expand-row">
        <select class="catselect" onchange="updateCategory('${t.id}', this.value)">
          ${standardCategoryEntries().map(([k,v])=>`<option value="${k}" ${t.category===k?'selected':''}>${v.label}</option>`).join('')}
        </select>
        <label class="fieldlabel">DUE</label>
        <input type="date" value="${t.dueDate||''}" onchange="updateDueDate('${t.id}', this.value)">
        <button class="flagbtn ${t.urgent?'on':''}" onclick="toggleUrgent('${t.id}')" title="Toggle urgent">⚑</button>
        <button class="flagbtn daybtn ${(t.plannedDates||[]).length?'on':''}" onclick="toggleTaskToday('${t.id}')" title="${todayTitle}">📌</button>
        ${canRemoveHere ? `<button class="remove" onclick="deleteTask('${t.id}')">Remove</button>` : ''}
      </div>
      ${state.advancedTaskFields ? `
      <div class="expand-row">
        <label class="fieldlabel">TIMEFRAME</label>
        <select class="catselect" onchange="updateTimeframe('${t.id}', this.value)">
          <option value="" ${!t.timeframe?'selected':''}>None</option>
          <option value="today" ${t.timeframe==='today'?'selected':''}>Today</option>
          <option value="short" ${t.timeframe==='short'?'selected':''}>Short</option>
          <option value="medium" ${t.timeframe==='medium'?'selected':''}>Medium</option>
          <option value="long" ${t.timeframe==='long'?'selected':''}>Long</option>
          <option value="urgent" ${t.timeframe==='urgent'?'selected':''}>Urgent</option>
        </select>
        <label class="fieldlabel">PRIORITY</label>
        <select class="catselect" onchange="updatePriority('${t.id}', this.value)">
          <option value="0" ${!t.priority?'selected':''}>None</option>
          <option value="1" ${t.priority===1?'selected':''}>Low</option>
          <option value="2" ${t.priority===2?'selected':''}>Medium</option>
          <option value="3" ${t.priority===3?'selected':''}>High</option>
        </select>
      </div>` : ''}
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
      </div>
      <textarea placeholder="Notes…" onblur="updateNotes('${t.id}', this.value)">${escapeHtml(t.notes||'')}</textarea>
      <div class="taskmeta">${metaLine}</div>
  `;
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
  // inline — everywhere else it's the usual inline .expand toggle.
  const rowClick = inDaily ? `openTaskDetailFromDay('${t.id}')` : `toggleExpand(event,'${t.id}')`;
  const onTomorrow = inDaily && (t.plannedDates||[]).includes(addDaysToDateStr(dayDate, 1));
  return `
  <li class="task" ${dragTargetAttrs}>
    <div class="row" onclick="${rowClick}">
      ${dragHandle}
      <div class="checkwrap" onclick="event.stopPropagation()">
        <div class="check ${t.status==='done'?'done':''}" onclick="toggleStatus('${t.id}')"></div>
        ${subProgressHtml(subs)}
      </div>
      ${dotHtml}
      <div class="title ${t.status==='done'?'done':''}">${escapeHtml(t.title)}${t.urgent && t.status!=='done' ? ' ⚑' : ''}</div>
      <div class="meta">${priorityBadge}${timeframeBadge}${badge}</div>
      ${inDaily ? `
        <button class="movetmrw" ${onTomorrow?'disabled':''} onclick="event.stopPropagation(); moveTaskToTomorrow('${t.id}','${dayDate}')" title="${onTomorrow ? 'Already planned for tomorrow' : 'Also plan for tomorrow'}">→</button>
        <button class="dayremove" onclick="event.stopPropagation(); unplanTaskFromDay('${t.id}','${dayDate}')" title="Remove from this day">×</button>
      ` : ''}
    </div>
    ${inDaily ? '' : `<div class="expand ${expandedTaskIds.has(t.id)?'open':''}" id="exp-${t.id}">${taskExpandFieldsHtml(t, canRemoveHere)}</div>`}
  </li>`;
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
  renderLocBadge();
  renderTabs();
  refreshUndoButtons();
  document.getElementById('settingsBtn').classList.toggle('on', settingsOpen);
  const catView = document.getElementById('categoryView');
  const dayView = document.getElementById('dailyView');
  const chkView = document.getElementById('checklistView');
  const setView = document.getElementById('settingsView');
  const cldView = document.getElementById('claudeView');
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

