// ---------- Checklist category type ----------
// A checklist category's "tasks" are named lists (still plain state.tasks
// entries — same id/category/status/createdAt shape as everything else,
// which is what lets the Claude digest, undo, and save/load all keep
// working on them for free) whose subtasks array holds "items" instead of
// steps. Two-level drill-down modeled directly on the Daily tab: an
// overview of all lists in the category, and a single list's own detail
// view — selectedListId plays the same role selectedDay does there.
// Deliberately minimal: no due date, priority, timeframe, or notes: those
// fields still exist on the task object (every task has them) but are
// simply never shown or set for a checklist list, matching the "just a
// name and items" brief.

function renderChecklist(){
  const el = document.getElementById('checklistView');
  // Guards against a stale selectedListId left over from a different
  // checklist category (only one global "currently open list" exists,
  // same as selectedDay) — falls back to the overview rather than
  // showing another category's list under this tab's header.
  if(selectedListId){
    const t = state.tasks.find(t=>t.id===selectedListId);
    if(!t || t.category !== activeTab) selectedListId = null;
  }
  if(checklistPendingOpen){
    el.innerHTML = renderChecklistPending(activeTab);
  } else if(selectedListId){
    el.innerHTML = renderChecklistDetail(selectedListId);
  } else {
    el.innerHTML = renderChecklistOverview(activeTab);
  }
}

function checklistLists(categoryId){
  return sortTasks(state.tasks.filter(t=>t.category===categoryId));
}

// A list marked done overrides its items' individual done flags for
// "pending" purposes — once the whole list is checked off complete,
// leftover unchecked items inside it shouldn't keep counting toward (or
// showing up in) the cross-list pending view.
function checklistPendingItems(t){
  if(t.status === 'done') return [];
  return (t.subtasks || []).filter(s=>!s.done);
}

function renderChecklistOverview(categoryId){
  const cat = CATEGORIES[categoryId];
  const lists = checklistLists(categoryId);
  const visible = lists.filter(t => showDone || t.status!=='done');
  const doneCount = lists.filter(t=>t.status==='done').length;
  const pendingTotal = lists.reduce((sum,t)=>sum+checklistPendingItems(t).length, 0);
  return `
    ${pendingTotal ? pageTagHtml(`openChecklistPending('${categoryId}')`, `Pending ${pendingTotal}`, true) : ''}
    <div class="quickadd">
      <input type="text" id="checklistQuickInput" placeholder="Name a new list…"
        onkeydown="if(event.key==='Enter') addChecklistList('${categoryId}')">
      <button class="addbtn" onclick="addChecklistList('${categoryId}')">+</button>
    </div>
    <ul class="tasks">
      ${visible.length ? visible.map(t=>checklistListRowHtml(t)).join('') : `<div class="empty">${cat ? `No lists in ${escapeHtml(cat.label)} yet.` : 'No lists yet.'} Add one above.</div>`}
    </ul>
    <div class="footer-row"><button onclick="toggleShowDone()">${showDone ? `Hide completed (${doneCount})` : `Show completed (${doneCount})`}</button></div>
  `;
}

// There are always exactly this many peg slots spaced evenly around the
// circle, regardless of item count — a 3-item list only fills the first
// 3 slots and leaves the rest of the ring bare, rather than stretching
// those 3 pegs to fill the whole circle. This is also the point past
// which it switches to a smooth progress ring instead, since much
// beyond this many discrete slots stops reading as separate pegs.
const CHECKLIST_PEG_LIMIT = 12;
const PEG_SLOT_DEG = 360 / CHECKLIST_PEG_LIMIT;
// Both the first peg slot and the progress ring's 0% point start here:
// top-left rather than dead center-top. Kept as a multiple of
// PEG_SLOT_DEG (30°) on purpose — since 90° (the gap between the four
// cardinal directions) is exactly 3 slots, that's what guarantees the
// slots nearest top/right/bottom/left land exactly on those axes
// instead of sitting at an off-angle. -25 (nearer the "25° left of top"
// originally asked for) would have thrown that off.
const PEG_START_DEG = -30;

// At or under the threshold: one fixed-size .peg per item, in list
// order, at slot i's angle — so an item's peg always sits at the same
// slot and never resizes or moves as items are added elsewhere in the
// list, it just adds one more peg at the next slot. Past the threshold,
// a single smooth conic-gradient sweep instead (same start angle, via
// conic-gradient's `from`), since that many discrete slots would read as
// clutter rather than countable pegs.
function checklistProgressHtml(subs){
  if(!subs.length) return '';
  const done = subs.filter(s=>s.done).length;
  const total = subs.length;
  if(total <= CHECKLIST_PEG_LIMIT){
    // translateZ(0) alongside the rotate is a no-op visually, but it's
    // there specifically so every pegpivot gets promoted to its own
    // GPU-composited layer the same way, regardless of angle. Without
    // it, rotate(0deg) — which a peg lands on exactly whenever a slot
    // falls on a cardinal axis — can get treated by the browser as an
    // identity transform and rendered via the plain CPU layout/paint
    // path instead, snapped to a different sub-pixel grid than its
    // genuinely-rotated siblings. That mismatch is invisible at 100%
    // zoom but shows up as that one peg being a slightly different
    // size at other browser zoom levels, since layout-snapped and
    // compositor-positioned elements round fractional device pixels
    // differently once the CSS-px-to-device-px ratio isn't 1:1.
    return subs.map((s,i)=>{
      const angle = PEG_START_DEG + i*PEG_SLOT_DEG;
      return `<span class="pegpivot ${s.done?'filled':''}" style="transform:rotate(${angle}deg) translateZ(0)"><span class="peg"></span></span>`;
    }).join('');
  }
  const pct = Math.round(done/total*100);
  return `<div class="progressring" style="background: conic-gradient(from ${PEG_START_DEG}deg, var(--ink) ${pct}%, var(--line) 0)"></div>`;
}

// Shared by the small icon next to each row in the overview and the
// large header atop a list's own detail page (.checklistheader scales
// this same markup up via CSS transform) — one definition means the two
// can never drift out of sync with each other.
function checklistCheckcircleHtml(t){
  const subs = t.subtasks || [];
  const done = subs.filter(s=>s.done).length;
  const total = subs.length;
  return `<div class="checkcircle-wrap" title="${total ? `${done}/${total} items` : ''}">
    ${checklistProgressHtml(subs)}
    <div class="checkcircle ${t.status==='done'?'done':''}" onclick="event.stopPropagation(); toggleStatus('${t.id}')"></div>
  </div>`;
}

function checklistListRowHtml(t){
  return `
  <li class="task" onclick="openChecklistList('${t.id}')">
    <div class="row">
      ${checklistCheckcircleHtml(t)}
      <div class="title ${t.status==='done'?'done':''}">${escapeHtml(t.title)}<span class="listdate">${fmtDate(t.createdAt)}</span></div>
    </div>
  </li>`;
}

function renderChecklistDetail(taskId){
  const t = state.tasks.find(t=>t.id===taskId);
  const cat = CATEGORIES[t.category];
  const subs = t.subtasks || [];
  // Opened from a day's Checklists section (see openChecklistListFromDay)
  // — the back tag should return there, not to this list's own category
  // overview, and say so rather than showing a label ("Lists") that no
  // longer matches where closeChecklistList() is actually about to go.
  const backLabel = checklistReturnDay ? 'Daily' : (cat ? cat.label : 'Lists');
  return `
    <div class="stackedpage">
      ${pageTagHtml('closeChecklistList()', backLabel)}
      <div class="checklistheader">${checklistCheckcircleHtml(t)}</div>
      <input type="text" class="titleedit checklisttitle" value="${escapeHtml(t.title)}"
        onblur="updateTitle('${t.id}', this.value)"
        onkeydown="if(event.key==='Enter'){ event.preventDefault(); this.blur(); }">
      <div class="taskmeta checklistmeta">Created ${fmtDate(t.createdAt)}</div>
      <div class="subwrap">
        ${subs.map(s=>`
          <div class="subrow ${t.status==='done'?'listdone':''}" ondragover="subDragOver(event)" ondrop="subDrop(event,'${t.id}','${s.id}')">
            <span class="draghandle sub" draggable="true" ondragstart="subDragStart(event,'${t.id}','${s.id}')" ondragend="subDragEnd()" title="Drag to reorder">⠿</span>
            <div class="subcheck circle ${s.done?'done':''}" onclick="toggleSubtask('${t.id}','${s.id}')"></div>
            <div class="subtext ${s.done?'done':''}" onclick="startEditSubtask(this,'${t.id}','${s.id}')">${escapeHtml(s.text)}</div>
            <button class="subdel" onclick="deleteSubtask('${t.id}','${s.id}')">×</button>
          </div>`).join('')}
        ${subDropEndHtml(t.id, subs)}
        <!-- onblur commit + clear-before-call on Enter — same fix, same
             reasoning, as taskSubtasksHtml()'s own .subadd in
             08-render-core.js (both add to a task's subtasks via the same
             addSubtask(), a checklist "item" being just that under the
             hood). Keep the two in sync if this ever changes. -->
        <input type="text" class="subadd" placeholder="+ add an item, enter to save"
          onkeydown="if(event.key==='Enter'){ const v=this.value; this.value=''; addSubtask('${t.id}', v); }"
          onblur="addSubtask('${t.id}', this.value)">
      </div>
      <div class="footer-row"><button class="remove" onclick="deleteChecklistList('${t.id}')">Delete list</button></div>
    </div>
  `;
}

// Flat "what's still left" across every list in the category — the
// explicit ask was a way to see all pending items at once without
// opening each list one by one. Grouped by list (not a single flat pile)
// so an item still has context for which list it's from.
function renderChecklistPending(categoryId){
  const cat = CATEGORIES[categoryId];
  const groups = checklistLists(categoryId)
    .map(t => ({ list: t, pending: checklistPendingItems(t) }))
    .filter(g => g.pending.length);
  return `
    <div class="stackedpage">
      ${pageTagHtml('closeChecklistPending()', cat ? cat.label : 'Lists')}
      <div class="daylistlabel">All pending items</div>
      ${groups.length ? groups.map(g => `
        <div class="pendinggroup">
          <div class="sublabel">${escapeHtml(g.list.title)}</div>
          ${g.pending.map(s=>`
            <div class="subrow">
              <div class="subcheck circle" onclick="toggleSubtask('${g.list.id}','${s.id}')"></div>
              <div class="subtext" onclick="openChecklistList('${g.list.id}')">${escapeHtml(s.text)}</div>
            </div>`).join('')}
        </div>`).join('') : `<div class="empty">Nothing pending — everything's checked off.</div>`}
    </div>
  `;
}

// returnDay is optional — only openChecklistListFromDay passes it. Every
// other call site (the normal overview row click) omits it, which resets
// checklistReturnDay to null even if some earlier visit had left it set,
// so "opened from Daily" can never leak into an unrelated later open.
function openChecklistList(id, returnDay){
  checklistReturnDay = returnDay || null;
  selectedListId = id;
  render();
}
function closeChecklistList(){
  selectedListId = null;
  if(checklistReturnDay){
    const d = checklistReturnDay;
    checklistReturnDay = null;
    selectedDay = d;
    switchTab('daily');
    return;
  }
  render();
}
function openChecklistPending(categoryId){ checklistPendingOpen = true; render(); }
function closeChecklistPending(){ checklistPendingOpen = false; render(); }

async function addChecklistList(categoryId){
  const input = document.getElementById('checklistQuickInput');
  const title = input.value.trim();
  if(!title) return;
  pushUndo(`Added list "${title}"`);
  state.tasks.unshift({
    id: newId('task'), title, category: categoryId, status:'open', urgent:false, dueDate:'',
    notes:'', subtasks:[], plannedDates:[], timeframe:'', priority:0, completedAt:'', createdAt: todayStr()
  });
  render();
  // render() just rebuilt #checklistQuickInput from scratch (same
  // reason addSubtask() needs focusVisibleSubadd()) — refocus it so
  // adding several lists in a row doesn't drop focus after each Enter.
  document.getElementById('checklistQuickInput')?.focus();
  queueSave();
}

async function deleteChecklistList(id){
  const t = state.tasks.find(t=>t.id===id);
  pushUndo(`Deleted list "${t ? t.title : ''}"`);
  state.tasks = state.tasks.filter(t=>t.id!==id);
  selectedListId = null;
  render();
  queueSave();
}

