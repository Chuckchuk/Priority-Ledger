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
// SVG, not individually rotated/positioned HTML divs — an earlier version
// used a zero-size ".pegpivot" per peg (position:absolute + rotate) with a
// translateZ(0) hack to force every pivot onto its own GPU-composited
// layer, on the theory that a peg landing on rotate(0deg) — any slot on a
// cardinal axis — could otherwise get treated as an identity transform
// and rendered via the plain layout path instead, snapping to a different
// sub-pixel grid than its genuinely-rotated siblings at non-100% browser
// zoom. That turned out not to be the whole story: browser zoom (unlike
// devicePixelRatio) can scale a page by a non-integer factor, and once
// that scaling makes even nominally "whole-pixel" CSS values (this
// container is an even 34px, its center a whole-number 17px) land on
// fractional device pixels, *every* pivot's layout-vs-compositor path can
// round slightly differently from every other, not just the 0° one —
// each HTML element is still its own independent layout/paint unit
// regardless of how many get a compositing layer. SVG shapes don't have
// that problem: every <rect> here is part of one <svg>, rendered as a
// single vector rasterization pass, so they scale together identically
// under any zoom level instead of each being its own independently-
// rounded box. Same 34×34 viewBox as .checkcircle-wrap's own pixel size
// (1 viewBox unit == 1 CSS px at rest), so the coordinates below are the
// exact same numbers the old absolutely-positioned peg used relative to
// its pivot: a peg 6 wide, 5 tall, sitting 14px out from center (17,17),
// rotated per-slot around that same center point via SVG's own
// transform="rotate(angle cx cy)" instead of a wrapping pivot element.
function checklistProgressHtml(subs){
  if(!subs.length) return '';
  const done = subs.filter(s=>s.done).length;
  const total = subs.length;
  if(total <= CHECKLIST_PEG_LIMIT){
    // Painted in "unfilled first, filled last" order (not slot order) so
    // a filled peg always paints over an unfilled neighbor at their
    // slightly-overlapping corners — SVG has no z-index to lean on here
    // the way each pegpivot's own stacking context used to provide, just
    // plain document order, so the order themselves have to carry it.
    // Angle still comes from the peg's real slot index `i`, not its
    // position in this reordered list, so sorting doesn't move anything.
    const ordered = subs.map((s,i)=>({s,i})).sort((a,b)=>(a.s.done?1:0)-(b.s.done?1:0));
    const pegs = ordered.map(({s,i})=>{
      const angle = PEG_START_DEG + i*PEG_SLOT_DEG;
      return `<rect class="peg ${s.done?'filled':''}" x="14" y="3" width="6" height="5" rx="1" transform="rotate(${angle} 17 17)"></rect>`;
    }).join('');
    return `<svg class="pegring" viewBox="0 0 34 34">${pegs}</svg>`;
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
      <input type="text" class="titleedit bigtitle" value="${escapeHtml(t.title)}"
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
  // renderChecklist() checks checklistPendingOpen before selectedListId
  // (see its own comment), so without clearing this here, opening a list
  // from the pending view — clicking an item's own text, which calls
  // this — set selectedListId but kept rendering the pending view right
  // over it: clicking looked like it did nothing at all, with no visible
  // sign you'd actually left the pending view.
  checklistPendingOpen = false;
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

