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
  } else if(checklistTemplatesOpen){
    el.innerHTML = renderChecklistTemplates(activeTab);
  } else if(selectedListId){
    el.innerHTML = renderChecklistDetail(selectedListId);
  } else {
    el.innerHTML = renderChecklistOverview(activeTab);
  }
}

// Sort-mode aware (applySortMode(), 05-dates-sort.js) rather than the
// fixed sortTasks() this used to call unconditionally — same shared
// sortMode global every other list view (category tabs, Daily) already
// reads, per the explicit ask for checklists to get the same SORT
// control with full parity rather than a checklist-only copy of it.
// Most modes degrade harmlessly for a checklist list specifically (no
// due date/priority/timeframe/urgent ever get set on one — see this
// file's own top comment — so 'timeframe'/'priority'/'flagged' just tie
// every list and fall back to array order); 'default'/'mixed'/'newest'/
// 'timestamp'/'recent' all still meaningfully reorder. Every consumer
// (the overview, the cross-list Pending view) picks this up for free.
function checklistLists(categoryId){
  return applySortMode(state.tasks.filter(t=>t.category===categoryId));
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
  // completingTaskIds keeps a just-completed list visible in its original
  // spot through its own linger-then-collapse (see toggleStatus()/
  // scheduleTaskLeave(), 16-task-crud.js) instead of vanishing (or
  // re-sorting to the bottom) the instant its status flips — same
  // categoryVisibleTasks() does for a standard task row.
  const visible = lists.filter(t => showDone || t.status!=='done' || completingTaskIds.has(t.id));
  const doneCount = lists.filter(t=>t.status==='done').length;
  const pendingTotal = lists.reduce((sum,t)=>sum+checklistPendingItems(t).length, 0);
  const templateCount = (state.checklistTemplates||[]).length;
  return `
    ${pendingTotal ? pageTagHtml(`openChecklistPending('${categoryId}')`, `Pending ${pendingTotal}`, true) : ''}
    <div class="quickadd">
      <input type="text" id="checklistQuickInput" placeholder="Name a new list…"
        onkeydown="if(event.key==='Enter') addChecklistList('${categoryId}')">
      <button class="addbtn" onclick="addChecklistList('${categoryId}')">+</button>
    </div>
    <!-- A plain inline link rather than a second .pagetag.compact —
         .pagetag.compact's own top-right corner spot is already spoken
         for by the Pending tag above (both share the exact same CSS
         position, so a second one there would sit right on top of it —
         see .pagetag.compact's own top:2px rule in <style>). Always
         shown, even at 0 templates, since it's also how you'd discover
         the feature exists in the first place — the empty state inside
         explains where "Save as Template" lives. -->
    <div class="checklisttemplateslink">
      <button onclick="openChecklistTemplates('${categoryId}')">Templates${templateCount ? ` (${templateCount})` : ''}</button>
    </div>
    <!-- false, false: no "by Category" option (a single checklist tab's
         own lists are all already this one category, same reasoning a
         non-All standard tab omits it — see sortMenuButtonsHtml()'s own
         comment) and no flag-filter toggle (see sortControlHtml()'s own
         comment on why that specific control would be broken here). -->
    <div class="sortrow">${sortControlHtml(false, false)}</div>
    <ul class="tasks">
      ${visible.length ? visible.map(t=>checklistListRowHtml(t)).join('') : `<div class="empty">${cat ? `No lists in ${escapeHtml(cat.label)} yet.` : 'No lists yet.'} Add one above.</div>`}
    </ul>
    <div class="footer-row"><button onclick="toggleShowDone()">${showDone ? `Hide completed (${doneCount})` : `Show completed (${doneCount})`}</button></div>
  `;
}

// There are always exactly this many peg slots spaced evenly around the
// circle, regardless of item count — a 3-item list only fills the first
// 3 slots and leaves the rest of the ring bare, rather than stretching
// those 3 pegs to fill the whole circle (still true after the switch to
// SVG arc pegs — see pegArcPath()'s own comment further down — this was
// never actually the source of the "still inconsistent size" issue
// reported against the SVG version; each peg's shape is computed once
// at angle 0 and only ever rigidly rotated per slot, which can't change
// its size). This is also the point past which it switches to a smooth
// progress ring instead, since much beyond this many discrete slots
// stops reading as separate pegs. Kept at 12 — a checklist's own item
// count runs higher than a task's subtask count typically does, so it
// keeps a roomier cap than the standard-task threshold in
// subProgressHtml() (06-tabs-render.js), which is a completely separate,
// deliberately lower limit (8) for the unrelated linear .substack bar a
// standard task's own subtasks use — the two were briefly conflated into
// one shared "8" during an earlier pass of this feature; the project
// owner's own follow-up split them back into two independent numbers.
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
// that problem: every peg here is part of one <svg>, rendered as a
// single vector rasterization pass, so they scale together identically
// under any zoom level instead of each being its own independently-
// rounded box. Same 34×34 viewBox as .checkcircle-wrap's own pixel size
// (1 viewBox unit == 1 CSS px at rest), rotated per-slot around that same
// center point via SVG's own transform="rotate(angle cx cy)" instead of
// a wrapping pivot element — see pegArcPath() below for the peg's own
// shape (an annular arc, not a flat rect, as of the pass that added it).
// A peg's own outer/inner edges follow the ring's curvature (an annular
// arc segment — straight radial sides, curved top/bottom) instead of a
// flat-topped rectangle, per the explicit ask to have them read as part
// of the circle they sit around rather than free-floating little boxes.
// Computed with real trigonometry (not hand-typed path coordinates) so
// the curve is exact regardless of radius/angle, and centered on angle 0
// (straight up) — the caller rotates the whole path to a slot's real
// angle the same way the old <rect> did, since rotating a shape that's
// already correct at angle 0 is simpler and less error-prone than
// re-deriving each slot's own corner points directly.
// cx/cy: ring center. rInner/rOuter: radius the peg's near/far edge sits
// at. halfWidthDeg: half the peg's own angular width.
function pegArcPath(cx, cy, rInner, rOuter, halfWidthDeg){
  const toXY = (r, deg) => {
    const rad = deg * Math.PI / 180;
    return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
  };
  const [ox1, oy1] = toXY(rOuter, -halfWidthDeg);
  const [ox2, oy2] = toXY(rOuter, halfWidthDeg);
  const [ix2, iy2] = toXY(rInner, halfWidthDeg);
  const [ix1, iy1] = toXY(rInner, -halfWidthDeg);
  const r3 = n => Math.round(n * 1000) / 1000;
  return `M ${r3(ox1)} ${r3(oy1)} A ${rOuter} ${rOuter} 0 0 1 ${r3(ox2)} ${r3(oy2)} `
       + `L ${r3(ix2)} ${r3(iy2)} A ${rInner} ${rInner} 0 0 0 ${r3(ix1)} ${r3(iy1)} Z`;
}
// Same radial span the old flat peg used (outer edge 14px out from
// center, inner edge 9px out — a 5px-thick band). Half-width widened
// from 12° to 13.5° at the same 30° slot size (CHECKLIST_PEG_LIMIT back
// at 12) — less padding between adjacent pegs, per the explicit ask,
// while keeping each one easily visible: 13.5° half-width is 27° of
// actual peg out of each 30° slot (90% fill) vs. the old 12°-of-30°
// (80% fill) — a bit fuller, not just carried over unchanged.
const PEG_R_OUTER = 14;
const PEG_R_INNER = 9;
const PEG_HALF_WIDTH_DEG = 13.5;
const PEG_PATH_AT_ZERO = pegArcPath(17, 17, PEG_R_INNER, PEG_R_OUTER, PEG_HALF_WIDTH_DEG);

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
      return `<path class="peg ${s.done?'filled':''}" d="${PEG_PATH_AT_ZERO}" transform="rotate(${angle} 17 17)"></path>`;
    }).join('');
    return `<svg class="pegring" viewBox="0 0 34 34">${pegs}</svg>`;
  }
  const pct = Math.round(done/total*100);
  return `<div class="progressring" style="background: conic-gradient(from ${PEG_START_DEG}deg, var(--ink) ${pct}%, var(--line) 0)"></div>`;
}

// Shared by the small icon next to each row in the overview and the
// large header atop a list's own detail page (.checklistheader scales
// this same markup up via CSS transform) — one definition means the two
// can never drift out of sync with each other. `subtle` threads straight
// through to checkGuideClass() exactly the way taskRowHtml()/
// renderTaskDetailPage() pass it for a standard task's own .check: true
// from the overview row (several rows on screen at once), false from the
// detail header (the one dominant action on that whole page). A
// checklist "list" is a plain task under the hood (see this file's own
// top comment), so checkGuideClass()/checkCelebrateClass()
// (08-render-core.js) work here completely unchanged — they only ever
// read t.status/t.id/subs, nothing task-shaped-specifically.
function checklistCheckcircleHtml(t, subtle){
  const subs = t.subtasks || [];
  const done = subs.filter(s=>s.done).length;
  const total = subs.length;
  return `<div class="checkcircle-wrap" title="${total ? `${done}/${total} items` : ''}">
    ${checklistProgressHtml(subs)}
    <div class="checkcircle ${t.status==='done'?'done':''}${t.cancelled?' cancelled':''}${checkGuideClass(t, subs, subtle)}${checkCelebrateClass(t)}" onclick="event.stopPropagation(); toggleStatus('${t.id}')"></div>
  </div>`;
}

function checklistListRowHtml(t){
  return `
  <li class="task" data-task-id="${t.id}" onclick="checklistRowTap(event,'${t.id}')"
    oncontextmenu="return handleChecklistContextMenu(event,'${t.id}')"
    ontouchstart="checklistPressStart(event,'${t.id}')" ontouchmove="checklistPressMove(event)" ontouchend="checklistPressEnd()" ontouchcancel="checklistPressEnd()"
    onmousedown="checklistPressStart(event,'${t.id}')" onmouseup="checklistPressEnd()" onmouseleave="checklistPressEnd()">
    <div class="row">
      ${checklistCheckcircleHtml(t, true)}
      <div class="title ${t.status==='done'?'done':''}">${escapeHtml(t.title)}${t.sharedImport ? ' <span class="badge shared">Shared</span>' : ''}<span class="listdate">${fmtDate(t.createdAt)}</span></div>
    </div>
  </li>`;
}

// ---------- a checklist list's own right-click/long-press menu ----------
// Mirrors the standard task menu (taskContextMenuHtml() etc., in
// 08-render-core.js) — same shared #ctxMenu, same ctxMenuTaskId/
// ctxMenuAction/closeCtxMenu plumbing, since a checklist "list" is a
// plain task object under the hood (see this file's own top comment).
// The item set itself is trimmed to what actually applies here: no
// "Toggle urgent"/"Add to today" (neither is ever surfaced anywhere in
// the checklist UI, so there'd be nothing on screen to confirm the
// change), and no "Edit details" (a plain click already opens this
// list's own — and only — detail view, so a menu entry for the same
// destination would just be a slower duplicate of what tapping the row
// already does, unlike a standard task's menu, where "Edit details"
// genuinely reaches a different view than a plain tap's inline preview).
function checklistContextMenuHtml(t){
  return `
    <button onclick="ctxMenuAction(()=>toggleStatus('${t.id}'))">${t.status==='done' ? 'Reopen' : 'Mark complete'}</button>
    ${t.cancelled ? `<button onclick="ctxMenuAction(()=>uncancelTaskToComplete('${t.id}'))">Mark complete</button>` : ''}
    <button onclick="ctxMenuCopyTitle('${t.id}')">Copy title</button>
    <div class="ctxmenu-sep"></div>
    ${t.status!=='done' ? `<button class="ctxmenu-danger" onclick="ctxMenuAction(()=>markTaskCancelled('${t.id}'))">Mark as Cancelled</button>` : ''}
    <button class="ctxmenu-danger" onclick="ctxMenuAction(()=>deleteChecklistList('${t.id}'))">Delete</button>
  `;
}
function renderChecklistContextMenu(taskId, x, y){
  const t = state.tasks.find(x2=>x2.id===taskId);
  if(!t) return;
  ctxMenuTaskId = taskId;
  const menu = document.getElementById('ctxMenu');
  menu.innerHTML = checklistContextMenuHtml(t);
  const zf = zoomFactor();
  menu.style.left = (x/zf) + 'px';
  menu.style.top = (y/zf) + 'px';
  menu.classList.add('open');
  applyDevElementNames();
  requestAnimationFrame(() => {
    const r = menu.getBoundingClientRect();
    if(r.right > window.innerWidth) menu.style.left = (Math.max(8, window.innerWidth - r.width - 8)/zf) + 'px';
    if(r.bottom > window.innerHeight) menu.style.top = (Math.max(8, window.innerHeight - r.height - 8)/zf) + 'px';
  });
}
// Same reasoning as handleTaskContextMenu()'s `return false` (not `true`)
// while mobileUiActive() — see its own comment (08-render-core.js).
function handleChecklistContextMenu(e, taskId){
  if(mobileUiActive()) return false;
  renderChecklistContextMenu(taskId, e.clientX, e.clientY);
  return false;
}
// Long-press-to-menu on mobile — a smaller, self-contained twin of
// taskPressStart()/taskPressMove()/taskPressEnd() (08-render-core.js)
// rather than reusing those directly: that trio branches on
// taskLongPressMode ('split' opens the settings sheet, 'detail' opens a
// row-anchored menu) — a choice about how a *standard task's* plain tap
// should behave that has no checklist equivalent, since a checklist row
// only ever has the one tap destination (openChecklistList()) regardless
// of that setting. Always on whenever mobileUiActive(), reusing the same
// timing constants (TASK_LONG_PRESS_MS/_TOLERANCE_PX) so a checklist
// list and a standard task feel identical to hold down, just simpler
// underneath since there's only one thing a long-press here could mean.
let checklistPressTimer = null;
let checklistPressRow = null;
let checklistPressStartX = 0, checklistPressStartY = 0;
let checklistLongPressFired = false;
function checklistPressStart(e, taskId){
  if(!mobileUiActive()) return;
  checklistLongPressFired = false;
  const pt = e.touches ? e.touches[0] : e;
  checklistPressStartX = pt.clientX;
  checklistPressStartY = pt.clientY;
  checklistPressRow = e.currentTarget;
  checklistPressRow.classList.add('pressing');
  clearTimeout(checklistPressTimer);
  checklistPressTimer = setTimeout(() => {
    checklistPressTimer = null;
    checklistLongPressFired = true;
    if(checklistPressRow) checklistPressRow.classList.remove('pressing');
    const r = checklistPressRow.getBoundingClientRect();
    renderChecklistContextMenu(taskId, r.left, r.bottom + 6);
  }, TASK_LONG_PRESS_MS);
}
function checklistPressMove(e){
  // See taskPressMove()'s own comment (08-render-core.js) — same "long-
  // press already opened the menu, this is drag-to-choose now" branch,
  // shared engine.
  if(checklistLongPressFired){ if(ctxMenuDragMove(e)) e.preventDefault(); return; }
  if(!checklistPressTimer) return;
  const pt = e.touches ? e.touches[0] : e;
  const dx = pt.clientX - checklistPressStartX, dy = pt.clientY - checklistPressStartY;
  if(Math.hypot(dx, dy) > TASK_LONG_PRESS_TOLERANCE_PX){
    clearTimeout(checklistPressTimer);
    checklistPressTimer = null;
    if(checklistPressRow) checklistPressRow.classList.remove('pressing');
  }
}
function checklistPressEnd(){
  clearTimeout(checklistPressTimer);
  checklistPressTimer = null;
  if(checklistPressRow) checklistPressRow.classList.remove('pressing');
  if(checklistLongPressFired) ctxMenuDragEnd();
}
// Swallows the click a touchend fires right after a long-press already
// opened the menu — same "was this actually a long-press just now"
// pattern taskRowTap() (08-render-core.js) uses for the standard row.
function checklistRowTap(e, taskId){
  if(checklistLongPressFired){ checklistLongPressFired = false; e.preventDefault(); return; }
  openChecklistList(taskId);
}

// The <Template>: <Name> title on a list linked to a still-existing
// template splits into a fixed, boxed "<Template>:" label (see
// .templatetitleprefix in <style> for the "little bounding box," per the
// explicit ask) plus a plain input for just the editable <Name> half —
// per the explicit ask to stop the whole "<Template>: <Name>" string
// being freely rewritable, which could silently break the naming
// convention (or drift the list away from the template it's actually
// linked to) with a single careless edit. Falls back to the plain,
// fully-editable title field for a list with no template link, or one
// whose title has since been hand-edited away from starting with
// "<Template>: " (nothing stops that at the character level; this only
// renders the split UI when the title still visibly matches).
// Always the autogrowTextarea() <textarea> swap (see taskTitleFieldHtml()'s
// own comment, 08-render-core.js, for why a <textarea> is safe here —
// updateTitle()/updateTemplatedTitle() both collapse newlines back out),
// on desktop as well as mobile — a checklist's own title is ALWAYS the
// big page-header variant (there's no compact one to fall back to the
// way a standard task's title has), so there's no narrower context here
// where a plain single-line <input> would ever be the better fit.
function checklistTitleFieldHtml(t){
  const tpl = t.templateId ? (state.checklistTemplates||[]).find(tp=>tp.id===t.templateId) : null;
  const prefix = tpl ? `${tpl.name}: ` : null;
  if(prefix && t.title.startsWith(prefix)){
    const suffix = t.title.slice(prefix.length);
    const commitAttrs = `onblur="updateTemplatedTitle('${t.id}', this.value)"
          onkeydown="if(event.key==='Enter'){ event.preventDefault(); this.blur(); }"`;
    return `
      <div class="templatetitlerow">
        <span class="templatetitleprefix">${escapeHtml(tpl.name)}:</span>
        <textarea class="titleedit bigtitle templatetitlesuffix autogrowtext" rows="1"
          oninput="autogrowTextarea(this)" onfocus="autogrowTextarea(this)" ${commitAttrs}>${escapeHtml(suffix)}</textarea>
      </div>`;
  }
  const commitAttrs = `onblur="updateTitle('${t.id}', this.value)"
    onkeydown="if(event.key==='Enter'){ event.preventDefault(); this.blur(); }"`;
  return `<textarea class="titleedit bigtitle autogrowtext" rows="1"
      oninput="autogrowTextarea(this)" onfocus="autogrowTextarea(this)" ${commitAttrs}>${escapeHtml(t.title)}</textarea>`;
}
// suffixVal empty falls back to today's date — same reasoning as
// confirmSaveListAsTemplate()/confirmCreateFromTemplate() below: an
// empty <Name> half would otherwise save as "<Template>: " with nothing
// after the colon, which reads as broken rather than intentional. Today's
// date (not the literal "New List") per the explicit ask, since a
// template gets reused repeatedly — "Packing list: Sep 3" tells the two
// instances apart from each other later, "Packing list: New List" (or
// worse, several of them) doesn't.
async function updateTemplatedTitle(id, suffixVal){
  const t = state.tasks.find(t=>t.id===id);
  if(!t) return;
  const tpl = t.templateId ? (state.checklistTemplates||[]).find(tp=>tp.id===t.templateId) : null;
  if(!tpl) return updateTitle(id, suffixVal);
  const suffix = suffixVal.trim() || fmtDate(todayStr());
  await updateTitle(id, `${tpl.name}: ${suffix}`);
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
  // "Move item(s) to another list" — see the transient vars' own comment
  // (02-storage-state.js). Only ever true for the one list currently open
  // (moveModeListId is reset whenever this view is left, see
  // closeChecklistList()), so there's no risk of two lists somehow both
  // reading as "in move mode" at once.
  const inMoveMode = moveModeListId === t.id;
  return `
    <div class="stackedpage">
      ${pageTagHtml('closeChecklistList()', backLabel)}
      <div class="checklistsharewrap">${shareButtonHtml(t.id)}</div>
      <div class="checklistheader">${checklistCheckcircleHtml(t, false)}</div>
      ${t.sharedImport ? `<div class="sharedbadge inline">Shared</div>` : ''}
      ${checklistTitleFieldHtml(t)}
      <div class="taskmeta checklistmeta">Created ${fmtDate(t.createdAt)}</div>
      <div class="subwrap">
        ${subs.map(s=>{
          const movable = !s.done && !s.cancelled;
          const selected = inMoveMode && moveModeSelectedIds.has(s.id);
          // Right-click/long-press menu (Reopen/Mark as Cancelled, same
          // as a standard task's own steps — see subtaskContextMenuHtml(),
          // 08-render-core.js) is suppressed while in move mode, same as
          // the plain checkbox/edit-tap actions just below: every click on
          // an eligible item's row should mean exactly one thing right
          // now — toggle it into/out of the batch — not fight with a
          // second, unrelated tap target.
          const subMenuAttrs = inMoveMode ? '' : ` oncontextmenu="return handleSubtaskContextMenu(event,'${t.id}','${s.id}')"
            ontouchstart="subtaskPressStart(event,'${t.id}','${s.id}')" ontouchmove="subtaskPressMove(event)" ontouchend="subtaskPressEnd()" ontouchcancel="subtaskPressEnd()"
            onmousedown="subtaskPressStart(event,'${t.id}','${s.id}')" onmouseup="subtaskPressEnd()" onmouseleave="subtaskPressEnd()"`;
          const rowClass = `subrow ${t.status==='done'?'listdone':''}${inMoveMode?' movemode':''}${selected?' moveselected':''}${inMoveMode && !movable?' moveineligible':''}`;
          const rowClick = inMoveMode && movable ? ` onclick="toggleMoveItemSelected('${s.id}')"` : '';
          return `
          <div class="${rowClass}" data-sub-id="${s.id}"${rowClick}>
            <span class="draghandle sub" onpointerdown="subHandlePointerDown(event,'${t.id}','${s.id}')" title="Drag to reorder">⠿</span>
            <div class="subcheck circle ${s.done?'done':''}${s.cancelled?' cancelled':''}" ${inMoveMode?'':`onclick="toggleSubtask('${t.id}','${s.id}')"`}></div>
            ${inMoveMode ? `
            <div class="subtext ${s.done?'done':''}${s.cancelled?' cancelled':''}"${subMenuAttrs} ${inMoveMode?'':`onclick="subtextTap(event,this,'${t.id}','${s.id}')"`}>${escapeHtml(s.text)}</div>
            ${movable ? `<div class="moveitemcheck ${selected?'on':''}"></div>` : ''}
            ` : `
            <!-- subtextwrap: same "float the actions against the text
                 instead of always giving them a full row" trick as a
                 standard task's own step rows (taskSubtasksHtml(),
                 08-render-core.js) — see that markup's own comment for the
                 full reasoning. Only used outside move mode: move mode's
                 own .moveitemcheck is a small fixed-size control, not a
                 row of buttons wide enough to need this. -->
            <div class="subtextwrap">
              <div class="subtext ${s.done?'done':''}${s.cancelled?' cancelled':''}"${subMenuAttrs} onclick="subtextTap(event,this,'${t.id}','${s.id}')">${escapeHtml(s.text)}</div>
              <div class="subrowactions">
                ${movable ? `<button class="moveitembtn" onclick="event.stopPropagation(); startMoveItem('${t.id}','${s.id}')" title="Move to another list">Move</button>` : ''}
                <button class="subdel" onclick="deleteSubtask('${t.id}','${s.id}')">×</button>
              </div>
            </div>
            `}
          </div>`;
        }).join('')}
        ${inMoveMode ? '' : subDropEndHtml(t.id, subs)}
        <!-- onblur commit + clear-before-call on Enter — same fix, same
             reasoning, as taskSubtasksHtml()'s own .subadd in
             08-render-core.js (both add to a task's subtasks via the same
             addSubtask(), a checklist "item" being just that under the
             hood). Keep the two in sync if this ever changes. -->
        ${inMoveMode ? '' : `<input type="text" class="subadd" placeholder="+ add an item, enter to save"
          onkeydown="if(event.key==='Enter'){ const v=this.value; this.value=''; addSubtask('${t.id}', v); }"
          onblur="addSubtask('${t.id}', this.value)">`}
      </div>
      ${inMoveMode ? `
        <div class="movemodebar">
          <span class="movemodebarcount">${moveModeSelectedIds.size} selected</span>
          <div class="movemodebaractions">
            <button class="movemodebarcancel" onclick="cancelMoveMode()">Cancel</button>
            <button class="movemodebarconfirm" onclick="openMoveTargetPicker()">Move…</button>
          </div>
        </div>
      ` : `
        <div class="footer-row">
          ${checklistTemplateFooterHtml(t)}
          ${checklistSaveTemplateTaskId === t.id ? '' : `<button class="remove" onclick="deleteChecklistList('${t.id}')">Delete list</button>`}
        </div>
      `}
    </div>
  `;
}

// ---------- Move item(s) to another list ----------
// Lets a nearly-finished list's own leftover item(s) get reassigned to a
// different (still-open) list instead of forcing a delete-here/re-type-
// there round trip — the explicit grocery-store scenario this was built
// for: everything's checked off except one item, and that item belongs
// on next week's list, not this one. A "moved" item is marked done+
// cancelled in the list it came from (same markSubtaskCancelled() shape,
// so it reads exactly like any other cancelled step — see .subcheck.
// cancelled/.subtext.cancelled in <style>) and a fresh copy (new id,
// done:false) is appended to the target list; nothing about the source
// item is deleted, so undo/Recently-Deleted-style recovery isn't needed
// for this specifically — reopening a "moved" item like any other
// cancelled one un-cancels it right back in place, it just won't also
// remove the copy that was already dropped into the target list (moving
// something and then undoing your mind on the source is rare enough,
// and cheap enough to clean up by hand, not to warrant a linked-item
// system for).
//
// startMoveItem() enters "move mode" scoped to the one list currently
// open (moveModeListId) with that item pre-selected; toggleMoveItemSelected()
// lets you add more of that same list's own not-done/not-cancelled items
// to the batch before confirming. Only one list can be "in move mode" at
// once, same as selectedListId only ever pointing at one list — there's
// no cross-list batch (you always finish or cancel one list's move
// before opening another).
function startMoveItem(taskId, subId){
  const t = state.tasks.find(x=>x.id===taskId);
  const movableCount = t ? (t.subtasks||[]).filter(s=>!s.done && !s.cancelled).length : 0;
  moveModeListId = taskId;
  moveModeSelectedIds = new Set([subId]);
  render();
  // The item just tapped is the only eligible one in the whole list —
  // there's nothing left to add to a batch, so the selection step (which
  // would just show one already-checked item and a Move… button) is
  // pure friction. Straight to the picker instead, per the explicit ask.
  // render() above still puts the list itself into move mode first, so
  // if the picker gets cancelled it falls back to that one-item selection
  // rather than to nothing.
  if(movableCount <= 1) openMoveTargetPicker();
}
function toggleMoveItemSelected(subId){
  if(!moveModeSelectedIds) return;
  if(moveModeSelectedIds.has(subId)) moveModeSelectedIds.delete(subId);
  else moveModeSelectedIds.add(subId);
  render();
}
function cancelMoveMode(){
  moveModeListId = null;
  moveModeSelectedIds = null;
  closeMoveTargetPicker();
}

// ---- the target-list picker modal ----
// A real modal (not a #ctxMenu popover, unlike most other "pick one of a
// few things" menus in this app) — the destination list is picked from
// potentially many lists spread across every checklist tab, plus an
// inline "create a new list" form, which doesn't fit a small anchored
// popover the way a short fixed button list does. Structured after
// #shareImportModal (19-sharing.js/<style>) for the desktop look — same
// scrim+card idiom — with its own mobile override (see .moveitem in
// <style>) that docks it to the bottom of the screen instead, per the
// explicit ask, so there's still room on screen to keep tapping other
// items into the batch if you back out to adjust the selection.
function openMoveTargetPicker(){
  if(!moveModeSelectedIds || !moveModeSelectedIds.size) return;
  moveTargetOpen = true;
  moveTargetFilter = '';
  moveTargetNewOpen = false;
  moveTargetTemplateOpen = false;
  moveTargetTemplatePickId = null;
  renderMoveTargetModal();
}
// Closes just the picker, not the whole move mode — lets you back out to
// tap a couple more items into the batch and reopen it, rather than
// starting the selection over from scratch. cancelMoveMode() is the one
// that also calls this, for the "abandon entirely" path.
function closeMoveTargetPicker(){
  moveTargetOpen = false;
  moveTargetNewOpen = false;
  moveTargetTemplateOpen = false;
  moveTargetTemplatePickId = null;
  const el = document.getElementById('moveItemModal');
  if(el){ el.classList.remove('open'); el.innerHTML = ''; }
}
function updateMoveTargetFilter(val){
  moveTargetFilter = val;
  renderMoveTargetModal();
}
function openMoveTargetNewForm(){
  moveTargetNewOpen = true;
  moveTargetTemplateOpen = false;
  renderMoveTargetModal();
  document.getElementById('moveTargetNewNameInput')?.focus();
}
function openMoveTargetTemplatePicker(){
  moveTargetTemplateOpen = true;
  moveTargetNewOpen = false;
  moveTargetTemplatePickId = null;
  renderMoveTargetModal();
}
function closeMoveTargetSubforms(){
  moveTargetNewOpen = false;
  moveTargetTemplateOpen = false;
  moveTargetTemplatePickId = null;
  renderMoveTargetModal();
}
// Expands the naming form (moveTargetTemplateListHtml() below) inline
// under the chosen template, same "pick, then name" two-step
// startCreateFromTemplate()/confirmCreateFromTemplate() already use on
// the real Templates page — picking a template here shouldn't
// immediately create+move under a generic "<Template>: New List" title
// with no chance to say what this particular list actually is.
function startMoveTargetTemplateName(templateId){
  moveTargetTemplatePickId = templateId;
  renderMoveTargetModal();
  document.getElementById('moveTargetTemplateNameInput')?.focus();
}
function cancelMoveTargetTemplateName(){
  moveTargetTemplatePickId = null;
  renderMoveTargetModal();
}

// Every not-yet-complete list across every checklist-type category
// except the one the item(s) are currently in — "not complete" (t.status
// !== 'done') already covers a cancelled list too, since markTaskCancelled()
// always sets status to 'done' alongside t.cancelled. Grouped by category
// (per the project owner's own call — an item should be movable to any
// list anywhere, not just ones in the current tab), with group headers
// only shown once there's more than one checklist category actually
// offering a candidate, so the single-checklist-tab account this app
// defaults new users to doesn't see a redundant one-item-group header.
function moveTargetCandidateGroups(){
  const q = moveTargetFilter.trim().toLowerCase();
  const groups = state.categories
    .filter(c => c.type === 'checklist')
    .map(c => ({
      cat: c,
      lists: checklistLists(c.id).filter(t =>
        t.id !== moveModeListId && t.status !== 'done' &&
        (!q || t.title.toLowerCase().includes(q))
      )
    }))
    .filter(g => g.lists.length);
  return groups;
}
function moveTargetGroupsHtml(){
  const groups = moveTargetCandidateGroups();
  if(!groups.length) return `<div class="ctxmenu-label">No matching lists</div>`;
  const showHeaders = groups.length > 1;
  return groups.map(g => `
    ${showHeaders ? `<div class="ctxmenu-label">${escapeHtml(g.cat.label)}</div>` : ''}
    ${g.lists.map(t => `<button onclick="confirmMoveItemsToList('${t.id}')">${escapeHtml(t.title)}</button>`).join('')}
  `).join('');
}
function moveTargetNewFormHtml(){
  return `
    <div class="movetargetnewform">
      <input type="text" id="moveTargetNewNameInput" placeholder="New list name…"
        onkeydown="if(event.key==='Enter'){ confirmMoveItemsToNewList(this.value); } else if(event.key==='Escape'){ closeMoveTargetSubforms(); }">
      <button class="templatecreatecancel" onclick="closeMoveTargetSubforms()">Cancel</button>
    </div>`;
}
function moveTargetTemplateListHtml(){
  const templates = state.checklistTemplates || [];
  if(!templates.length) return `<div class="ctxmenu-label">No templates yet</div>`;
  return templates.map(tpl => {
    // Same inline "<Template>: <specific>" naming row the real Templates
    // page uses (.templatecreaterow etc., renderChecklistTemplates()) —
    // reused verbatim rather than reinvented, so picking a template here
    // reads as the same action, just reached from a different door.
    if(moveTargetTemplatePickId === tpl.id){
      return `
        <div class="templatecreaterow">
          <span class="templatenameprefix">${escapeHtml(tpl.name)}: </span>
          <input type="text" id="moveTargetTemplateNameInput" placeholder="${fmtDate(todayStr())}"
            onkeydown="if(event.key==='Enter'){ confirmMoveItemsToTemplateList('${tpl.id}', this.value); } else if(event.key==='Escape'){ cancelMoveTargetTemplateName(); }">
          <button class="templatecreateconfirm" onclick="confirmMoveItemsToTemplateList('${tpl.id}')">Create</button>
          <button class="templatecreatecancel" onclick="cancelMoveTargetTemplateName()">Cancel</button>
        </div>`;
    }
    return `<button onclick="startMoveTargetTemplateName('${tpl.id}')">${escapeHtml(tpl.name)} <span class="templatemeta">${tpl.items.length} item${tpl.items.length===1?'':'s'}</span></button>`;
  }).join('');
}
function renderMoveTargetModal(){
  const el = document.getElementById('moveItemModal');
  if(!el) return;
  if(!moveTargetOpen || !moveModeListId || !moveModeSelectedIds || !moveModeSelectedIds.size){
    el.classList.remove('open'); el.innerHTML = ''; return;
  }
  el.classList.add('open');
  const n = moveModeSelectedIds.size;
  el.innerHTML = `
    <div class="shareimport-scrim" onclick="closeMoveTargetPicker()"></div>
    <div class="moveitem-card">
      <div class="quickaddsheethead moveitem-sheethead">
        <div class="quickaddsheetgrabber"></div>
        <button class="quickaddsheetclose" onclick="closeMoveTargetPicker()">×</button>
      </div>
      <div class="shareimport-heading">Move ${n} item${n===1?'':'s'} to…</div>
      <input type="text" class="moveitem-search" placeholder="Search lists…" value="${escapeHtml(moveTargetFilter)}"
        oninput="updateMoveTargetFilter(this.value)">
      ${moveTargetNewOpen ? moveTargetNewFormHtml() : moveTargetTemplateOpen ? `
        <div class="moveitem-newrow">
          <button class="movetargetbacklink" onclick="closeMoveTargetSubforms()">‹ Back</button>
        </div>
      ` : `
        <div class="moveitem-newrow">
          <button class="moveitem-newbtn" onclick="openMoveTargetNewForm()">+ New list</button>
          ${(state.checklistTemplates||[]).length ? `<button class="moveitem-newbtn" onclick="openMoveTargetTemplatePicker()">From template</button>` : ''}
        </div>
      `}
      <div class="moveitem-list">
        <div class="ctxmenu ctxmenu-embedded open">
          ${moveTargetTemplateOpen ? `
            <div class="ctxmenu-label">Choose a template</div>
            ${moveTargetTemplateListHtml()}
          ` : moveTargetGroupsHtml()}
        </div>
      </div>
      <div class="footer-row"><button onclick="closeMoveTargetPicker()">Cancel</button></div>
    </div>`;
}

// Shared by all three confirm paths below (existing list / brand-new list
// / new-from-template) — the part that actually mutates the source list:
// cancels every selected item in place (same fields markSubtaskCancelled()
// sets, so it renders identically to any other cancelled step) and hands
// back plain {text} copies for the caller to push onto whatever target
// list it's building. One pushUndo covers the whole operation (source
// cancellation + target append together), per this app's whole-state-
// snapshot undo model — see the Undo/redo bullet in CLAUDE.md.
function extractSelectedMoveItems(t){
  const items = (t.subtasks||[]).filter(s=>moveModeSelectedIds.has(s.id));
  items.forEach(s=>{ s.done = true; s.cancelled = true; });
  return items.map(s => ({ id:newId('sub'), text:s.text, done:false, dueDate:'', plannedDates:[] }));
}
function finishMoveItems(){
  moveModeListId = null;
  moveModeSelectedIds = null;
  closeMoveTargetPicker();
  render();
  queueSave();
}
async function confirmMoveItemsToList(targetId){
  const t = state.tasks.find(x=>x.id===moveModeListId);
  const target = state.tasks.find(x=>x.id===targetId);
  if(!t || !target || !moveModeSelectedIds || !moveModeSelectedIds.size) return;
  const n = moveModeSelectedIds.size;
  pushUndo(`Moved ${n} item${n===1?'':'s'} to "${target.title}"`);
  const newItems = extractSelectedMoveItems(t);
  if(!target.subtasks) target.subtasks = [];
  target.subtasks.push(...newItems);
  finishMoveItems();
}
async function confirmMoveItemsToNewList(nameFromEnter){
  const input = document.getElementById('moveTargetNewNameInput');
  const title = (nameFromEnter !== undefined ? nameFromEnter : (input ? input.value : '')).trim();
  if(!title) return;
  const t = state.tasks.find(x=>x.id===moveModeListId);
  if(!t || !moveModeSelectedIds || !moveModeSelectedIds.size) return;
  const n = moveModeSelectedIds.size;
  pushUndo(`Moved ${n} item${n===1?'':'s'} to a new list "${title}"`);
  const newItems = extractSelectedMoveItems(t);
  // Created in the source list's own category — the picker offers every
  // checklist tab as a *destination*, but a brand-new list born out of
  // this flow has no destination of its own to pick from, so it defaults
  // to sitting alongside the list it was split off from rather than
  // surfacing a whole extra category-choice step for what's meant to be
  // a quick "spin off the leftovers" action.
  state.tasks.unshift({
    id: newId('task'), title, category: t.category, status:'open', urgent:false, dueDate:'',
    notes:'', plannedDates:[], timeframe:'', priority:0, completedAt:'', createdAt: todayStr(),
    subtasks: newItems
  });
  finishMoveItems();
}
async function confirmMoveItemsToTemplateList(templateId, nameFromEnter){
  const tpl = (state.checklistTemplates||[]).find(tp=>tp.id===templateId);
  const t = state.tasks.find(x=>x.id===moveModeListId);
  if(!tpl || !t || !moveModeSelectedIds || !moveModeSelectedIds.size) return;
  const input = document.getElementById('moveTargetTemplateNameInput');
  const specific = (nameFromEnter !== undefined ? nameFromEnter : (input ? input.value : '')).trim() || fmtDate(todayStr());
  const n = moveModeSelectedIds.size;
  const title = `${tpl.name}: ${specific}`;
  pushUndo(`Moved ${n} item${n===1?'':'s'} to a new "${tpl.name}" list`);
  const movedItems = extractSelectedMoveItems(t);
  const templateItems = tpl.items.map(text => ({ id:newId('sub'), text, done:false, dueDate:'', plannedDates:[] }));
  state.tasks.unshift({
    id: newId('task'), title, category: t.category, status:'open', urgent:false, dueDate:'',
    notes:'', plannedDates:[], timeframe:'', priority:0, completedAt:'', createdAt: todayStr(), templateId: tpl.id,
    subtasks: [...templateItems, ...movedItems]
  });
  finishMoveItems();
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
  // Leaving the list mid-move (Esc, the back tag, or its own "Daily"
  // return) drops whatever selection/picker state was in progress — same
  // reasoning checklistSaveTemplateTaskId etc. never survive a navigate-
  // away either, there's no "resume this later" concept for any of them.
  moveModeListId = null;
  moveModeSelectedIds = null;
  closeMoveTargetPicker();
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
  const idx = state.tasks.findIndex(t=>t.id===id);
  if(idx === -1) return;
  const t = state.tasks[idx];
  pushUndo(`Deleted list "${t.title}"`);
  state.tasks.splice(idx, 1);
  moveTaskToTrash(t);
  selectedListId = null;
  render();
  queueSave();
}

// ---------- Checklist templates ----------
// A template (state.checklistTemplates: {id, name, items:[text,...],
// createdAt}) is born from a real list, not authored blank — there's no
// separate "new template" editor. "Save as Template" (renderChecklistDetail(),
// its own comment) copies the list's current items (text only — none of
// their done/date state, since a template is always a fresh starting
// point) into a new entry, and links the list back to it via t.templateId
// so the SAME list offers "Update Template" from then on instead of
// spawning a fresh duplicate every time it's saved again.
function openChecklistTemplates(categoryId){
  checklistTemplatesOpen = true;
  checklistTemplateCreateId = null;
  render();
}
function closeChecklistTemplates(){
  checklistTemplatesOpen = false;
  checklistTemplateCreateId = null;
  render();
}
// Expands an inline naming form in the list's own footer (checklistSaveTemplateTaskId
// — see renderChecklistDetail()'s own comment) rather than saving
// straight off the list's current title, per the explicit ask: without
// this, the list you actually built the template from kept its plain
// original title forever, reading as some kind of permanent "master"
// list rather than an ordinary instance — indistinguishable, at a
// glance in the overview, from a mistake or a leftover. Asking for both
// names up front and renaming *this* list to "<Template>: <Name>" in
// the same action is what keeps every list you ever see in the overview
// in the same "<Template>: <Name>" shape once it's linked to a template,
// with no special-cased exception for the original.
function startSaveListAsTemplate(taskId){
  checklistSaveTemplateTaskId = taskId;
  render();
  document.getElementById('templateSaveNameInput')?.focus();
}
function cancelSaveListAsTemplate(){
  checklistSaveTemplateTaskId = null;
  render();
}
async function confirmSaveListAsTemplate(taskId){
  const t = state.tasks.find(t=>t.id===taskId);
  if(!t) return;
  const nameInput = document.getElementById('templateSaveNameInput');
  const specificInput = document.getElementById('templateSaveSpecificInput');
  const templateName = (nameInput ? nameInput.value.trim() : '') || t.title;
  const specific = (specificInput ? specificInput.value.trim() : '') || fmtDate(todayStr());
  pushUndo(`Saved "${templateName}" as a template`);
  if(!Array.isArray(state.checklistTemplates)) state.checklistTemplates = [];
  const tpl = { id: newId('tpl'), name: templateName, items: (t.subtasks||[]).map(s=>s.text), createdAt: todayStr() };
  state.checklistTemplates.push(tpl);
  t.templateId = tpl.id;
  t.title = `${templateName}: ${specific}`;
  checklistSaveTemplateTaskId = null;
  render();
  queueSave();
}
async function updateTemplateFromList(taskId){
  const t = state.tasks.find(t=>t.id===taskId);
  if(!t || !t.templateId) return;
  const tpl = (state.checklistTemplates||[]).find(tp=>tp.id===t.templateId);
  if(!tpl) return;
  pushUndo(`Updated template "${tpl.name}" from "${t.title}"`);
  tpl.items = (t.subtasks||[]).map(s=>s.text);
  render();
  queueSave();
}
// The one footer control that changes shape three ways: the inline
// "Save as Template" naming form while checklistSaveTemplateTaskId
// points at this list, a disabled "Update Template" once its linked
// template's items already match its own (nothing to push), or an
// enabled one otherwise. linkedTemplate guards against a stale
// t.templateId pointing at a template that's since been deleted —
// falls back to "Save as Template" (which re-links it to a fresh one)
// rather than offering "Update" on something that no longer exists.
function checklistTemplateFooterHtml(t){
  if(checklistSaveTemplateTaskId === t.id){
    return `
      <div class="templatesaveform">
        <label class="templatesaveformlabel">Template name</label>
        <input type="text" id="templateSaveNameInput" value="${escapeHtml(t.title)}">
        <label class="templatesaveformlabel">This list's own name <span class="templatesaveformhint">e.g. "Packing List: Madrid Trip"</span></label>
        <input type="text" id="templateSaveSpecificInput" placeholder="${fmtDate(todayStr())}">
        <div class="templatesaveformactions">
          <button class="templatecreateconfirm" onclick="confirmSaveListAsTemplate('${t.id}')">Save</button>
          <button class="templatecreatecancel" onclick="cancelSaveListAsTemplate()">Cancel</button>
        </div>
      </div>`;
  }
  const linkedTemplate = t.templateId ? (state.checklistTemplates||[]).find(tpl=>tpl.id===t.templateId) : null;
  if(linkedTemplate){
    const itemsChanged = JSON.stringify((t.subtasks||[]).map(s=>s.text)) !== JSON.stringify(linkedTemplate.items);
    return `<button class="templatesavebtn" ${itemsChanged?'':'disabled'} onclick="updateTemplateFromList('${t.id}')"
      title="${itemsChanged ? `Overwrite &quot;${escapeHtml(linkedTemplate.name)}&quot; with this list's current items` : 'No changes to update'}">Update Template</button>`;
  }
  return `<button class="templatesavebtn" onclick="startSaveListAsTemplate('${t.id}')" title="Save this list's items as a reusable template">Save as Template</button>`;
}
async function deleteChecklistTemplate(id){
  const idx = (state.checklistTemplates||[]).findIndex(tp=>tp.id===id);
  if(idx === -1) return;
  pushUndo(`Deleted template "${state.checklistTemplates[idx].name}"`);
  state.checklistTemplates.splice(idx, 1);
  if(checklistTemplateCreateId === id) checklistTemplateCreateId = null;
  render();
  queueSave();
}
// Expands the naming step inline within that template's own row
// (checklistTemplateCreateId — see renderChecklistTemplates() below)
// rather than a separate page, same "confirm inline" idiom as a
// category's own delete confirmation in Settings.
function startCreateFromTemplate(templateId){
  checklistTemplateCreateId = templateId;
  render();
  // render() just rebuilt the input from scratch — same refocus-after-
  // render idiom as .subadd/#checklistQuickInput.
  document.getElementById('templateNameInput')?.focus();
}
function cancelCreateFromTemplate(){
  checklistTemplateCreateId = null;
  render();
}
// Builds "<Template Name>: <specific>" per the explicit ask (the grayed
// prefix shown alongside the input, see .templatenameprefix in <style>,
// is the same string this reads back off the template — the two can
// never drift apart since neither is hand-typed twice). Opens the new
// list immediately afterward rather than leaving you on the Templates
// view, since that's the obvious next thing you'd want. An empty name
// falls back to today's date, same as everywhere else a "<specific>"
// half of a templated title can be left blank (updateTemplatedTitle(),
// confirmSaveListAsTemplate()) — a template gets reused repeatedly, so
// "Packing list: Sep 3" actually tells this instance apart from the
// next one later; the field no longer just silently no-ops on empty.
async function confirmCreateFromTemplate(templateId, categoryId){
  const tpl = (state.checklistTemplates||[]).find(tp=>tp.id===templateId);
  if(!tpl) return;
  const input = document.getElementById('templateNameInput');
  const specific = (input ? input.value.trim() : '') || fmtDate(todayStr());
  const title = `${tpl.name}: ${specific}`;
  pushUndo(`Created "${title}" from template`);
  const newTask = {
    id: newId('task'), title, category: categoryId, status:'open', urgent:false, dueDate:'',
    notes:'', plannedDates:[], timeframe:'', priority:0, completedAt:'', createdAt: todayStr(), templateId: tpl.id,
    subtasks: tpl.items.map(text => ({ id:newId('sub'), text, done:false, dueDate:'', plannedDates:[] }))
  };
  state.tasks.unshift(newTask);
  checklistTemplatesOpen = false;
  checklistTemplateCreateId = null;
  selectedListId = newTask.id;
  render();
  queueSave();
}
function renderChecklistTemplates(categoryId){
  const cat = CATEGORIES[categoryId];
  const templates = state.checklistTemplates || [];
  return `
    <div class="stackedpage">
      ${pageTagHtml('closeChecklistTemplates()', cat ? cat.label : 'Lists')}
      <div class="daylistlabel">Templates</div>
      ${templates.length ? templates.map(tpl => `
        <div class="templaterow">
          <div class="templaterowmain">
            <span class="templatename">${escapeHtml(tpl.name)}</span>
            <span class="templatemeta">${tpl.items.length} item${tpl.items.length===1?'':'s'}</span>
          </div>
          ${checklistTemplateCreateId === tpl.id ? `
            <div class="templatecreaterow">
              <span class="templatenameprefix">${escapeHtml(tpl.name)}: </span>
              <input type="text" id="templateNameInput" placeholder="${fmtDate(todayStr())}"
                onkeydown="if(event.key==='Enter'){ confirmCreateFromTemplate('${tpl.id}','${categoryId}'); } else if(event.key==='Escape'){ cancelCreateFromTemplate(); }">
              <button class="templatecreateconfirm" onclick="confirmCreateFromTemplate('${tpl.id}','${categoryId}')">Create</button>
              <button class="templatecreatecancel" onclick="cancelCreateFromTemplate()">Cancel</button>
            </div>
          ` : `
            <div class="templaterowactions">
              <button onclick="startCreateFromTemplate('${tpl.id}')">New List</button>
              <button class="templatedelete" onclick="deleteChecklistTemplate('${tpl.id}')">Delete</button>
            </div>
          `}
        </div>
      `).join('') : `<div class="empty">No templates yet. Open any list and tap "Save as Template" to create one from its current items.</div>`}
    </div>
  `;
}

