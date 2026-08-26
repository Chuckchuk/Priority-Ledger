function toggleDayTreeNode(key){
  if(dayTreeExpanded.has(key)) dayTreeExpanded.delete(key); else dayTreeExpanded.add(key);
  renderDaily();
}

// The three toggle* functions below are the only way anything gets
// added to or removed from a day through the tree picker — each wraps
// an existing mutator (which already does its own pushUndo/render/
// queueSave) so the tree can treat "add" and "remove" as one flip of
// the same switch rather than two different code paths, and so a row
// never has to disappear from the tree just because it's already
// planned — it stays put and picks up the "added" mark/flash instead.
// dayTreeFlashKey is set just before the mutator runs (so the render()
// inside it picks up the flash class for this one pass) and cleared
// shortly after — see the flashtoggle CSS and the comment on
// dayTreeFlashKey's declaration above for why the timeout matters.
async function toggleDayTreeTask(taskId, dateStr){
  const t = state.tasks.find(t=>t.id===taskId);
  if(!t) return;
  const key = 'task:'+taskId;
  dayTreeFlashKey = key;
  if((t.plannedDates||[]).includes(dateStr)) await unplanTaskFromDay(taskId, dateStr);
  else await planTaskForDay(taskId, dateStr);
  setTimeout(()=>{ if(dayTreeFlashKey===key) dayTreeFlashKey = null; }, 700);
}

async function toggleDayTreeSub(taskId, subId, dateStr){
  const t = state.tasks.find(t=>t.id===taskId);
  const s = t && (t.subtasks||[]).find(s=>s.id===subId);
  if(!s) return;
  const key = 'sub:'+subId;
  dayTreeFlashKey = key;
  if((s.plannedDates||[]).includes(dateStr)) await unplanSubtaskFromDay(taskId, subId, dateStr);
  else await pullSubtaskToDay(taskId, subId, dateStr);
  setTimeout(()=>{ if(dayTreeFlashKey===key) dayTreeFlashKey = null; }, 700);
}

async function toggleDayTreeChecklist(listId, dateStr){
  const t = state.tasks.find(t=>t.id===listId);
  if(!t) return;
  const key = 'cklist:'+listId;
  dayTreeFlashKey = key;
  if((t.plannedDates||[]).includes(dateStr)) await unplanTaskFromDay(listId, dateStr);
  else await planTaskForDay(listId, dateStr);
  setTimeout(()=>{ if(dayTreeFlashKey===key) dayTreeFlashKey = null; }, 700);
}

function dayTreeTaskHtml(t, dateStr){
  const key = 'task:'+t.id;
  const open = dayTreeExpanded.has(key);
  const subs = t.subtasks || [];
  const alreadyWhole = (t.plannedDates||[]).includes(dateStr);
  const flash = dayTreeFlashKey===key ? ' flashtoggle' : '';
  return `
    <div class="daytreenode sub">
      <div class="daytreetaskrow${flash}">
        <button class="daytreelabel" onclick="toggleDayTreeNode('${key}')">${subs.length ? (open?'▾':'▸') : '·'} ${escapeHtml(t.title)}</button>
        ${alreadyWhole ? `<span class="daytreemark" title="On today's list">✓</span>` : ''}
        <button class="daytreeleaf whole ${alreadyWhole?'added':''}" onclick="toggleDayTreeTask('${t.id}','${dateStr}')">${alreadyWhole?'Added':'+ Whole task'}</button>
      </div>
      ${open && subs.length ? `<div class="daytreechildren">
        ${subs.map(s=>daySubLeafHtml(t, s, dateStr)).join('')}
      </div>` : ''}
    </div>`;
}

function daySubLeafHtml(t, s, dateStr){
  const planned = (s.plannedDates||[]).includes(dateStr);
  const key = 'sub:'+s.id;
  const flash = dayTreeFlashKey===key ? ' flashtoggle' : '';
  return `
    <div class="daytreeleafrow${flash}">
      <button class="daytreeleaf" onclick="toggleDayTreeSub('${t.id}','${s.id}','${dateStr}')">${planned ? '<span class="daytreemark">✓</span> ' : ''}${escapeHtml(s.text)}</button>
      <button class="daytreeaddbtn ${planned?'added':''}" onclick="toggleDayTreeSub('${t.id}','${s.id}','${dateStr}')">${planned?'Added':'+ Add'}</button>
    </div>`;
}

// showListDates (Settings → Dev Settings) reuses the same .listdate class
// checklistListRowHtml() uses for a list's created-date — always rendered,
// just hidden by CSS unless that dev toggle is on, same idiom.
function dayTreeChecklistLeafHtml(t, dateStr){
  const planned = (t.plannedDates||[]).includes(dateStr);
  const key = 'cklist:'+t.id;
  const flash = dayTreeFlashKey===key ? ' flashtoggle' : '';
  return `
    <div class="daytreeleafrow${flash}">
      <button class="daytreeleaf" onclick="toggleDayTreeChecklist('${t.id}','${dateStr}')">${planned ? '<span class="daytreemark">✓</span> ' : ''}${escapeHtml(t.title)}<span class="listdate">${fmtDate(t.createdAt)}</span></button>
      <button class="daytreeaddbtn ${planned?'added':''}" onclick="toggleDayTreeChecklist('${t.id}','${dateStr}')">${planned?'Added':'+ Add'}</button>
    </div>`;
}

function renderAddToDayPicker(dateStr){
  if(!dayAddOpen){
    return `<button class="pullbtn dayaddtoggle" onclick="toggleDayAdd()">+ Add to this day</button>`;
  }
  const taskCatsHtml = standardCategoryEntries().map(([k,v])=>{
    const key = 'cat:'+k;
    const open = dayTreeExpanded.has(key);
    const tasks = dayCandidateTasks(dateStr, k);
    return `
      <div class="daytreenode">
        <button class="daytreelabel daytreecat" onclick="toggleDayTreeNode('${key}')">
          <span class="daytreetriangle">${open?'▾':'▸'}</span>${categoryDotHtml(v, 'dot')}${escapeHtml(v.label)}
        </button>
        ${open ? `<div class="daytreechildren">
          ${tasks.length ? tasks.map(t=>dayTreeTaskHtml(t, dateStr)).join('') : `<div class="empty" style="padding:4px 0;">Nothing eligible here.</div>`}
        </div>` : ''}
      </div>`;
  }).join('');

  const checklistCatsHtml = Object.entries(CATEGORIES).filter(([,v])=>v.type==='checklist').map(([k,v])=>{
    const key = 'cklist:'+k;
    const open = dayTreeExpanded.has(key);
    // A completed list has nothing left to add to a day, same reasoning
    // dayCandidateTasks already applies to standard tasks.
    const lists = checklistLists(k).filter(t=>t.status!=='done');
    return `
      <div class="daytreenode">
        <button class="daytreelabel daytreecat" onclick="toggleDayTreeNode('${key}')">
          <span class="daytreetriangle">${open?'▾':'▸'}</span>${categoryDotHtml(v, 'dot')}${escapeHtml(v.label)}
        </button>
        ${open ? `<div class="daytreechildren">
          ${lists.length ? lists.map(t=>dayTreeChecklistLeafHtml(t, dateStr)).join('') : `<div class="empty" style="padding:4px 0;">No lists here.</div>`}
        </div>` : ''}
      </div>`;
  }).join('');

  return `
    <div class="dayaddpanel">
      <div class="dayaddhead">
        <div class="daylistlabel" style="margin:0;">Add to this day</div>
        <button class="dayaddclose" onclick="toggleDayAdd()" title="Close">×</button>
      </div>
      ${taskCatsHtml}
      <div class="daytreesection">Checklists</div>
      ${checklistCatsHtml}
    </div>
  `;
}

// A step planned onto a day, shown "TASK > STEP" with the step's own
// small square .subcheck — deliberately a different shape from a whole
// task's big .check or a checklist's round .checkcircle, so a step-daily
// reads at a glance as a lighter-weight item than either.
// `nested` is true when this step's parent task is also planned whole
// onto the same day — renderDayDetail groups it directly under the
// parent's own row in that case (see the nestedByParent grouping there),
// so the "TASK > " prefix would be redundant and it gets an indent
// instead. An "orphan" step (parent not itself on this day) stays flat
// with the prefix, same as before, since there's no parent row nearby to
// read it as nested under.
function daySubtaskRowHtml(task, sub, dateStr, nested){
  const nextDate = addDaysToDateStr(dateStr, 1);
  const onTomorrow = (sub.plannedDates||[]).includes(nextDate);
  // Matches the invisible-when-not-draggable spacer taskRowHtml reserves
  // for its own .draghandle, so an orphan step's checkbox lines up under
  // a whole task's — see the .checkwrap.daysub / .draghandle comment in
  // <style>. Skipped when nested: indentation already reads as "under its
  // parent" without also needing to sit on the same checkbox column.
  const draggableMain = sortMode === 'default';
  const spacer = (!nested && draggableMain)
    ? `<span class="draghandle" style="visibility:hidden" aria-hidden="true">⠿</span>`
    : '';
  // Always "TASK > step", nested or not — an orphan step (parent not on
  // this day) and a nested one (parent's own row sitting right above it)
  // used to read differently depending on which day you were looking at,
  // which was the actual complaint: the same step could show as bare
  // "step" on one day and "TASK > step" on another. Nesting still gets
  // its indent (below) as an *additional* cue, it just isn't the only one.
  const label = `<span class="daysubparent">${escapeHtml(task.title)} &gt; </span>${escapeHtml(sub.text)}`;
  return `
  <li class="task ${nested ? 'daysubnested' : ''}">
    <div class="row" onclick="openTaskDetailFromDay('${task.id}')">
      ${spacer}
      <div class="checkwrap daysub" onclick="event.stopPropagation()">
        <div class="subcheck ${sub.done?'done':''}" onclick="toggleSubtask('${task.id}','${sub.id}')"></div>
      </div>
      <div class="title ${sub.done?'done':''}">${label}</div>
      <button class="movetmrw" ${onTomorrow?'disabled':''} onclick="event.stopPropagation(); moveSubtaskToTomorrow('${task.id}','${sub.id}','${dateStr}')" title="${onTomorrow ? 'Already planned for tomorrow' : 'Also plan for tomorrow'}">→</button>
      <button class="dayremove" onclick="event.stopPropagation(); unplanSubtaskFromDay('${task.id}','${sub.id}','${dateStr}')" title="Remove from this day">×</button>
    </div>
  </li>`;
}

function dayChecklistRowHtml(t, dateStr){
  return `
  <li class="task">
    <div class="row" onclick="openChecklistListFromDay('${t.id}','${dateStr}')">
      ${checklistCheckcircleHtml(t)}
      <div class="title ${t.status==='done'?'done':''}">${escapeHtml(t.title)}</div>
      <button class="dayremove" onclick="event.stopPropagation(); unplanTaskFromDay('${t.id}','${dateStr}')" title="Remove from this day">×</button>
    </div>
  </li>`;
}

function renderDayDetail(dateStr){
  const allTasks = standardTasksForDay(dateStr);
  const sorted = applySortMode(allTasks);
  const subItems = subDailyItemsForDay(dateStr);
  const checklistItems = checklistDailyItemsForDay(dateStr);
  const { total, done } = dayItemsSummary(dateStr);
  // What moveIncompleteToTomorrow() actually moves is unfinished standard
  // tasks and steps — this count has to match that exactly, not the
  // unified day total, or the button's label would promise more than it
  // delivers.
  const unfinishedTasks = allTasks.filter(t=>t.status!=='done');
  const unfinishedSubs = subItems.filter(x=>!x.sub.done);
  const unfinishedCount = unfinishedTasks.length + unfinishedSubs.length;
  const isPast = dateStr < todayStr();
  const nextDate = addDaysToDateStr(dateStr, 1);
  const headerTag = dayHeaderTag(dateStr);
  // For the prev/next arrows flanking the h2 below — null when this day
  // sits at either end of your logged days (see adjacentDayStr()), which
  // just renders as a disabled arrow rather than wrapping or erroring.
  const prevDayStr = adjacentDayStr(dateStr, -1);
  const nextDayStr = adjacentDayStr(dateStr, 1);

  // Whole tasks and steps share one list — a step planned onto a day is
  // just as much "on today's list" as a whole task is, so there's no
  // separate "Steps" section splitting them apart. Checklists stay their
  // own group below: a whole named list is a different enough kind of
  // thing (opens into its own page, has no due date/priority) that
  // lumping it in with tasks/steps would be more confusing than helpful.
  // Every task shows, including completed ones — completed just render
  // crossed out, so you can see the whole day's shape at a glance.
  //
  // A step whose parent task is *also* planned whole onto this day
  // renders directly under that task's own row (nested, no "TASK > "
  // prefix — see daySubtaskRowHtml) instead of out in the flat list, so
  // the day reads as an actual outline rather than every step floating
  // independently next to its own task. A step whose parent isn't itself
  // on this day (only the step was pulled in) has no row to nest under,
  // so it stays a flat "TASK > step" row same as before.
  const sortedIds = new Set(sorted.map(t=>t.id));
  const nestedSteps = {};
  const orphanSteps = [];
  subItems.forEach(x=>{
    if(sortedIds.has(x.task.id)) (nestedSteps[x.task.id] = nestedSteps[x.task.id] || []).push(x);
    else orphanSteps.push(x);
  });
  const mainCount = sorted.length + subItems.length;
  const mainListHtml = mainCount ? `
    <ul class="tasks">${
      sorted.map(t => taskRowHtml(t, true, true, dateStr) +
        (nestedSteps[t.id] ? nestedSteps[t.id].map(x=>daySubtaskRowHtml(x.task, x.sub, dateStr, true)).join('') : '')
      ).join('') +
      orphanSteps.map(x=>daySubtaskRowHtml(x.task, x.sub, dateStr, false)).join('') +
      dropEndHtml(sorted)
    }</ul>
  ` : '';
  // Only claim "nothing planned" when the day is truly empty across all
  // three kinds of item — a day with only a checklist planned (no tasks,
  // no steps) shouldn't say nothing's planned right above that checklist.
  const emptyMsg = total ? '' : `<div class="empty">Nothing planned for this day yet.</div>`;
  const checklistsBlock = checklistItems.length ? `
    <div class="daylistlabel">Checklists</div>
    <ul class="tasks">${checklistItems.map(t=>dayChecklistRowHtml(t, dateStr)).join('')}</ul>
  ` : '';

  return `
    <div class="stackedpage">
      ${pageTagHtml('closeDay()', dayReturnToCalendar ? 'Calendar' : 'All Days')}
      ${headerTag ? `<div class="dayherorow"><span class="dayhero ${headerTag.today?'today':''}">${headerTag.text}</span></div>` : ''}
      <div class="daydetailhead">
        <div class="daynav">
          <button class="navarrow" ${prevDayStr ? `onclick="goToAdjacentDay(-1)"` : 'disabled'} title="Previous day">‹</button>
          <h2>${dayLabel(dateStr)}</h2>
          <button class="navarrow" ${nextDayStr ? `onclick="goToAdjacentDay(1)"` : 'disabled'} title="Next day">›</button>
        </div>
        <div class="daydetailheadright">
          <div class="dayprogress">${total ? `${done} of ${total} done` : 'Nothing planned yet'}</div>
          ${unfinishedCount>0 && dateStr<=todayStr() ? `<button class="pullbtn" onclick="moveIncompleteToTomorrow('${dateStr}')">Move ${unfinishedCount} incomplete → ${fmtDate(nextDate)}</button>` : ''}
        </div>
      </div>
      ${isPast ? `<div class="lockednote"><span>🔒 This day has passed</span></div>` : ''}
      <div class="quickadd">
        <input type="text" id="dayQuickInput" placeholder="Add a new task for this day…" onkeydown="if(event.key==='Enter') addDayTask('${dateStr}')">
        <select id="dayQuickCategory">
          ${standardCategoryEntries().map(([k,v])=>`<option value="${k}" ${k==='personal'?'selected':''}>${v.label}</option>`).join('')}
        </select>
        <button class="addbtn" onclick="addDayTask('${dateStr}')">+</button>
      </div>
      ${renderAddToDayPicker(dateStr)}
      <div class="sortrow">
        <label class="fieldlabel">SORT</label>
        <select onchange="setSortMode(this.value)">${sortModeOptionsHtml(true)}</select>
      </div>
      ${emptyMsg}
      ${mainListHtml}
      ${checklistsBlock}
    </div>
  `;
}

