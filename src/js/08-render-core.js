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
// Plain SVG pin icon, not the 📌 emoji it replaces in every .flagbtn.daybtn
// button below (and .rowpin — see taskRowHtml()'s own use of this same
// constant) — an emoji glyph ignores CSS `color` entirely and always
// paints its own fixed multi-color image, which is why the "add to today"
// button used to look visually inconsistent next to its neighbors (⚑ flag,
// the share icon below), both plain glyphs that DO pick up .flagbtn's own
// color/tint (including the white .on state — see .daybtn.on/.rowpin.on in
// <style>). fill="currentColor" / 1em-sized, same idiom CATEGORY_ICON_SVG's
// own 'house' override already uses (01-categories-theme.js) for the
// identical reason.
// A classic pushpin silhouette — flat pin head over a thin shaft down to a
// point — rather than the map/location-pin teardrop a first pass used, or
// the geometric circle-and-triangle abstraction a second pass tried: still
// closer to the original 📌 emoji's own actual shape (which the project
// owner specifically liked and asked to keep recognizable), just as one
// flat color instead of a multi-tone illustration or an over-simplified
// abstraction of it. This is the widely-used Material Symbols "push_pin"
// glyph (one continuous path, no separate pieces with a seam between them
// to break down at this button's actual ~13px size — see the two earlier,
// discarded attempts' own history for why that matters here) rather than
// hand-authored path coordinates.
// One shared constant (not four separate inline copies) so the header's,
// the inline expand-row's, a subtask row's, and a row's own compact pin
// button can't drift apart from each other.
const DAYPIN_ICON_SVG = '<svg viewBox="0 0 24 24" width="1em" height="1em" style="display:block"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" fill="currentColor"/></svg>';

// Same calendar glyph #dailyShortcutBtn (shell-body.html) uses for "jump
// to today," minus its solid today-marker dot — kept deliberately
// separate from that one rather than sharing a constant with it (there's
// no JS home for that button's own markup to read a shared constant from
// anyway, since it's static HTML), and the dot specifically means
// "today," which would be the wrong signal on a menu item about setting
// an arbitrary date rather than jumping to a fixed one.
const DATE_ICON_SVG = '<svg viewBox="0 0 24 24" width="1em" height="1em" style="display:block" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>';

function fieldPickerHtml(kind, currentValue, onClickFor){
  const steps = kind === 'timeframe' ? TIMEFRAME_STEPS : PRIORITY_STEPS;
  const style = (state.devSettings && state.devSettings.fieldPickerStyle) || 'default';
  if(style === 'default') return '';
  const curStr = String(currentValue==null ? '' : currentValue);
  const idx = steps.findIndex(s => s.v === curStr);
  // The one step that gets the pulse — see .fieldbtn.atmax/.fieldprogress
  // .atmax in <style>. For Priority that's the LAST step (High — most
  // urgent sits at the end of Low/Medium/High). Timeframe reads the
  // opposite way: its urgency runs the other direction along the same
  // array (None/Short/Medium/Long), so the step that should actually grab
  // attention is the FIRST real one (Short, index 1) — a long runway
  // isn't what needs a pulse, a short one is. Per the project owner's own
  // catch: this used to always pulse the last step regardless of kind,
  // which meant Timeframe was pulsing "Long," backwards from what it
  // should highlight. Applies to both 'buttons' and 'progress' below —
  // the same field pulsing on opposite ends depending only on which
  // *style* happened to be picked would be its own new inconsistency.
  const atMaxIdx = kind === 'timeframe' ? 1 : steps.length - 1;
  const atMax = idx === atMaxIdx && idx > 0;
  // 'buttons': compact pills, one per REAL step — steps[0] is always the
  // "None"/unset entry (see TIMEFRAME_STEPS/PRIORITY_STEPS above) and
  // never gets its own pill here, per the project owner's own call: with
  // no separate "None" pill to tap, clicking the pill that's ALREADY
  // active is what clears a field back to unset instead — the same
  // toggle-off-by-tapping-again idiom .flagbtn/.rowpin/.rowflag already
  // use elsewhere in this exact header, so it isn't a new interaction to
  // learn, just this control adopting one that was already established.
  // Fewer, smaller pills (3 for Timeframe, 3 for Priority, vs. the
  // original 6-and-4) is the other half of "still pretty noisy" — this
  // was always meant to be a compact alternative to a dropdown, not
  // another full-size control sitting next to it.
  if(style === 'buttons'){
    const noneValue = steps[0].v;
    const realSteps = steps.slice(1);
    return `<div class="fieldbuttons compact">${realSteps.map(s => {
      const isActive = s.v === curStr;
      const clickValue = isActive ? noneValue : s.v;
      return `
      <button type="button" class="fieldbtn ${isActive?'active':''} ${isActive && atMax?'atmax':''}"
        onclick="${onClickFor(clickValue)}" title="${isActive ? 'Click to clear' : escapeHtml(s.label)}">${escapeHtml(s.label)}</button>`;
    }).join('')}</div>`;
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

// Grows a <textarea> to fit whatever it currently holds — the mobile
// stand-in for a plain <input>'s (never-wrapping, horizontally-scrolling)
// single line, used by every "edit this normally-one-line text field"
// spot in the app (a task/list's own title, growableTitleFieldHtml()
// below; a step's own text, startEditSubtask(), 15-subtask-edit.js) so a
// long value gets to actually show on screen across visible lines
// instead of being edited through a small scrolling window. Wired to
// oninput (as you type), onfocus (the moment you tap in — makes an
// already-long value show in full immediately, not only after the first
// keystroke changes it), AND re-run on every render() (see its own tail
// call) — the last one is what lets every one of these fields start at
// rows="1" rather than needing a taller fixed baseline "just in case": a
// genuinely short value now actually measures short (rows="1"'s real
// height), which taskDetailActionsPosition's 'headerline' variant
// (positionHeaderlineActions() below) depends on to tell a short title
// apart from a long one in the first place.
function autogrowTextarea(el){
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// extraClass is optional — renderTaskDetailPage() passes 'bigtitle' to
// match the checklist detail page's large centered title (see .bigtitle
// in <style>, shared with .titleedit there); every other caller
// (taskManagementFieldsHtml, the inline .expand) omits it and gets the
// normal compact field. Swaps the plain <input> for an
// autogrowTextarea()-driven <textarea> (see its own comment above) on
// mobile always, and on desktop too for 'bigtitle' specifically — a long
// title there used to just horizontally-scroll inside a single-line
// input, showing whatever portion happened to be scrolled into view
// rather than the actual title, which is exactly as "lost/unclean" on a
// mouse-driven desktop as the same field was on a phone (per the
// explicit ask, reported against BOTH). The small inline/compact
// variant (no extraClass — the long-press settings sheet, inline task
// management fields) stays desktop's plain <input>: that context is
// cramped enough already that turning it multi-line everywhere wasn't
// what broke, so there's no reason to touch it there. Same onblur/Enter-
// commits behavior either way; updateTitle() itself collapses any
// embedded newlines a textarea uniquely allows in (a pasted multi-line
// value, since Enter itself is intercepted below before it can insert
// one) back to spaces, so a title can never actually end up multi-line
// data regardless of which element edited it.
function taskTitleFieldHtml(t, extraClass){
  const commitAttrs = `onblur="updateTitle('${t.id}', this.value)"
        onkeydown="if(event.key==='Enter'){ event.preventDefault(); this.blur(); }"`;
  if(mobileUiActive() || extraClass === 'bigtitle'){
    return `<textarea class="titleedit ${extraClass||''} autogrowtext" rows="1"
        oninput="autogrowTextarea(this)" onfocus="autogrowTextarea(this)" ${commitAttrs}>${escapeHtml(t.title)}</textarea>`;
  }
  return `<input type="text" class="titleedit ${extraClass||''}" value="${escapeHtml(t.title)}" ${commitAttrs}>`;
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

// hideCategory/hideActions are both true only from the full task detail
// page (renderTaskDetailPage(), via taskExpandFieldsHtml()) — hideCategory
// because that page now shows the category as a tab-styled label in its
// own header instead (categoryLabelHtml(), further below), and
// hideActions because that same header already carries its own urgent
// flag + today-pin (see renderTaskDetailPage()'s own actionsHtml) — a
// second copy right below, next to the date field, was showing the exact
// same two buttons twice on one page. The long-press bottom sheet
// (taskManagementFieldsHtml()) has no header to hold either of those, so
// it keeps the <select> and the flag/pin exactly as it always has
// (both params omitted, default falsy). hideActions now also drops
// "Delete Task" from .expandactions — the full detail page renders its
// own copy in a .footer-row at the bottom instead (see
// renderTaskDetailPage()'s own comment), matching where a checklist's
// "Delete list" already sits; the settings sheet keeps it here exactly
// as before, since it has no footer of its own to move it to.
function taskCoreFieldsRowHtml(t, canRemoveHere, hideCategory, hideActions){
  const todayTitle = taskTodayTitle(t);
  return `
      <div class="expand-row${hideActions ? ' hideactions' : ''}">
        ${hideCategory ? '' : `
        <select class="catselect" onchange="updateCategory('${t.id}', this.value)">
          ${standardCategoryEntries().map(([k,v])=>`<option value="${k}" ${t.category===k?'selected':''}>${v.label}</option>`).join('')}
        </select>`}
        <!-- The "DUE" caption is only dropped on the full detail page
             (hideActions) — it's the one context where the date field
             already claims its own full row (see the .taskdate rule in
             <style>) and had nothing else nearby it could be confused
             with, so the label was pure unused space. The empty-state
             placeholder swaps to "Due Date" there instead, so the field
             still says what it is without the caption's help; the
             long-press settings sheet (hideActions omitted) keeps both
             exactly as before, since its own date field sits crowded
             next to the category select and flag/pin buttons. Uses
             fmtDateFull() (not fmtDateShort(), a step's own format) —
             the one date field the app gives a whole boxed row to reads
             better spelled all the way out ("Tuesday, September 2,
             2026") than abbreviated. -->
        ${hideActions ? '' : `<label class="fieldlabel">DUE</label>`}
        <span class="datefield taskdate ${t.dueDate?'':'empty'}" onclick="startEditTaskDueDate(this,'${t.id}')">${t.dueDate ? fmtDateFull(t.dueDate) : (hideActions ? 'Due Date' : 'Date')}</span>
        <div class="expandactions">
          ${hideActions ? '' : `
          <button class="flagbtn ${t.urgent?'on':''}" onclick="toggleUrgent('${t.id}')" title="Toggle flag">⚑</button>
          <button class="flagbtn daybtn ${hasCurrentPlan(t.plannedDates)?'on':''}" onclick="toggleTaskToday('${t.id}')" title="${todayTitle}">${DAYPIN_ICON_SVG}</button>`}
          ${canRemoveHere && !hideActions ? `<button class="remove" onclick="deleteTask('${t.id}')">Remove</button>` : ''}
        </div>
      </div>`;
}

// Swap-in-a-text-input trick, same as startEditSubtaskDate()
// (15-subtask-edit.js) — natural-language parsing (today, tmrw, 9/1,
// tue…) via parseNaturalDate() instead of a native <input type=date>,
// per the explicit ask to make a task's own due date behave (and look —
// see .datefield/.datefieldedit in <style>) like a step's already does,
// rather than the native picker's largely unstyleable white/square
// chrome. An empty input clears the date; unparseable text just reverts
// rather than guessing wrong.
function startEditTaskDueDate(el, taskId){
  const t = state.tasks.find(t=>t.id===taskId);
  if(!t) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'datefieldedit taskdateedit';
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
  // One-shot highlight after a due-date change (see timeframeFlashTaskId,
  // 16-task-crud.js): 'auto' (green) when this field was just filled/
  // updated for you, 'conflict' (red) when the date implied a different
  // value but a manual pick protected the field, so nothing actually
  // changed here — the flash is the only signal that a conflict even
  // happened. .timeframewrap wraps whichever picker markup actually
  // rendered above (a plain <select>, .fieldbuttons, or .fieldprogress,
  // depending on fieldPickerStyle) rather than threading a class through
  // fieldPickerHtml() itself, since that function is also shared by the
  // quick-add bar's own timeframe field (syncQuickField(),
  // 06-tabs-render.js), which this flash has no business touching.
  const timeframeFlash = timeframeFlashTaskId === t.id
    ? (timeframeFlashKind === 'conflict' ? ' timeframe-flash-conflict' : ' timeframe-flash-auto')
    : '';
  // Per the explicit ask: Timeframe and Priority used to sit directly
  // next to each other in one flat flex row, which on desktop read as
  // harder to tell apart (nothing marks where one field ends and the
  // other begins) and on mobile wrapped oddly — the two pill groups
  // aren't independent of each other in a single flex-wrap row, so a
  // group could end up split across lines in whatever order happened to
  // run out of width, rather than each field's own pills staying
  // together as one wrapping block. .fieldsrow (justify-content:
  // space-between) plus one .fieldgroup wrapper per field fixes both:
  // desktop keeps Timeframe pinned left and Priority pinned right with
  // real daylight between them, and each group now wraps its own pills
  // independently of the other's, so Timeframe running out of room never
  // pushes part of Priority (or vice versa) into a confusing spot.
  return `
      <div class="expand-row fieldsrow">
        <div class="fieldgroup">
          <label class="fieldlabel">TIMEFRAME</label>
          <span class="timeframewrap${timeframeFlash}">${timeframePicker}</span>
        </div>
        <div class="fieldgroup">
          <label class="fieldlabel">PRIORITY</label>
          ${priorityPicker}
        </div>
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
  // .empty (t.notes falsy at render time) drops the field's own resting
  // min-height way down — see that class's own comment in <style> for why
  // an always-120px-tall empty box was part of what read as "noisy" on an
  // otherwise-sparse task. The oninput auto-grow (plain scrollHeight
  // technique, no library) is what keeps that shrink from working AGAINST
  // you while actually typing a real note: height:auto first so
  // scrollHeight reflects the content that's there NOW rather than
  // whatever the box's previous explicit height was (scrollHeight of a
  // box already taller than its content just reports that stale height
  // back), then set to match — content genuinely too tall to fit still
  // grows the field instead of scrolling inside a stuck-small box. Only
  // ever grows (never shrinks back down mid-edit, matching a plain
  // textarea's own natural resize-by-dragging behavior, which also never
  // auto-shrinks) — the class re-evaluates fresh on the next real render
  // (e.g. after blur commits via updateNotes()) if it's empty again.
  return `
      <textarea class="notesfield ${t.notes ? '' : 'empty'}" placeholder="Notes…"
        oninput="this.style.height='auto'; this.style.height=this.scrollHeight+'px';"
        onblur="updateNotes('${t.id}', this.value)">${escapeHtml(t.notes||'')}</textarea>
      <div class="taskmeta">${metaLine}</div>`;
}

// Factored out specifically so a short tap in taskLongPressMode's "split"
// variant (see taskRowHtml() below) can show just this — the one part of
// a task's detail worth glancing at on every tap — without the rest of
// taskManagementFieldsHtml() coming along with it.
// Collapses to a single "+ Add step" link when there are no steps yet,
// instead of always showing the "Steps" label plus the dashed add-input —
// per the project owner's own callout that an empty task detail page
// feels noisy/tightly-packed even though it has nothing in it. Clicking
// the link sets stepsAddOpenId (02-storage-state.js) so THIS render pass
// shows the real add-input instead — same "click to reveal" idiom
// renderAddToDayPicker()'s own dayAddOpen already uses. Once a real step
// gets added, subs.length>0 takes over rendering the full section
// regardless of stepsAddOpenId, so there's nothing to reset on the
// success path; openGenericTaskDetail() resets it on the way IN instead,
// so a task's own add-input doesn't stay stuck open from a previous visit
// where it was opened but nothing was ever typed.
function openStepsAdd(taskId){
  stepsAddOpenId = taskId;
  render();
  focusVisibleSubadd();
}
function taskSubtasksHtml(t){
  const subs = t.subtasks || [];
  if(subs.length===0 && stepsAddOpenId!==t.id){
    return `
      <div class="subwrap">
        <button class="addsteplink" onclick="openStepsAdd('${t.id}')">+ Add step</button>
      </div>`;
  }
  // Per the explicit ask: once ANY step on this task has a real due date,
  // the (otherwise hidden-while-empty, mobile-only — see .datefield.empty
  // in <style>) Date field shows for every step here, dated or not, and
  // Remove ("×") comes back alongside it. A task that's never used dates
  // on its steps stays fully decluttered; the moment it does, the
  // affordance stops being invisible everywhere else in that same task,
  // rather than only ever being discoverable one step at a time through
  // each one's own long-press menu.
  const stepsDated = subs.some(s=>!!s.dueDate);
  return `
      <div class="subwrap${stepsDated ? ' stepsdated' : ''}">
        <div class="sublabel">Steps</div>
        ${subs.map(s=>{
          const subPlannedToday = (s.plannedDates||[]).includes(todayStr());
          const subOtherPlanned = (s.plannedDates||[]).filter(d=>d!==todayStr()).length;
          const subTodayTitle = subPlannedToday ? 'Remove from today’s list'
            : subOtherPlanned ? `Also planned on ${subOtherPlanned} other day${subOtherPlanned===1?'':'s'} — tap to add today too`
            : 'Add to today’s list';
          // Always wired up now — a done/cancelled step still has Reopen
          // to offer (see subtaskContextMenuHtml()'s own comment for why
          // this used to be conditional on !s.done, and why that was
          // wrong: Reopen is exactly the thing a done step needs a menu
          // for, since there's no dedicated button for it the way a
          // standard task's own checkbox click already handles reopening).
          const subMenuAttrs = ` oncontextmenu="return handleSubtaskContextMenu(event,'${t.id}','${s.id}')"
            ontouchstart="subtaskPressStart(event,'${t.id}','${s.id}')" ontouchmove="subtaskPressMove(event)" ontouchend="subtaskPressEnd()" ontouchcancel="subtaskPressEnd()"
            onmousedown="subtaskPressStart(event,'${t.id}','${s.id}')" onmouseup="subtaskPressEnd()" onmouseleave="subtaskPressEnd()"`;
          return `
          <div class="subrow" data-sub-id="${s.id}">
            <span class="draghandle sub" onpointerdown="subHandlePointerDown(event,'${t.id}','${s.id}')" title="Drag to reorder">⠿</span>
            <div class="subcheck ${s.done?'done':''}${s.cancelled?' cancelled':''}" onclick="toggleSubtask('${t.id}','${s.id}')"></div>
            <!-- subtextwrap: display:contents on desktop (see that rule in
                 <style>) — invisible to layout there, so .subtext and
                 .subrowactions stay direct participants in .subrow's own
                 flex row exactly as before this wrapper existed. On mobile
                 it becomes a real block box instead, which is what lets
                 .subrowactions float against .subtext's own text (see the
                 body.mobileui-active rules in <style>) rather than always
                 claiming a full row of its own regardless of how short the
                 text is — a long step's text can now flow right up to
                 wherever Date/Remove actually sit on their shared last
                 line, instead of stopping short everywhere just to leave
                 them a clear lane down the whole height of the row. -->
            <div class="subtextwrap">
              <div class="subtext ${s.done?'done':''}${s.cancelled?' cancelled':''}"${subMenuAttrs} onclick="subtextTap(event,this,'${t.id}','${s.id}')">${escapeHtml(s.text)}</div>
              <!-- stepsactions (see body.mobileui-active .stepsactions in
                   <style>) — the modifier that lets the mobile-only rule
                   below hide just the pin/remove buttons here, now that
                   they're also reachable from this row's own long-press menu
                   (subtaskContextMenuHtml() above), without touching a
                   checklist item's own .subrowactions (13-checklist.js),
                   which never had a pin button and still needs its inline
                   "×" since it has no long-press "Pin to Today" of its own
                   to make Remove Item feel any less like its one obvious
                   delete affordance. -->
              <div class="subrowactions stepsactions">
                <div class="datefield ${s.dueDate?'':'empty'}" onclick="startEditSubtaskDate(this,'${t.id}','${s.id}')">${s.dueDate ? fmtDateShort(s.dueDate) : 'Date'}</div>
                <button class="flagbtn daybtn ${hasCurrentPlan(s.plannedDates)?'on':''}" onclick="event.stopPropagation(); toggleSubtaskToday('${t.id}','${s.id}')" title="${subTodayTitle}">${DAYPIN_ICON_SVG}</button>
                <button class="subdel" onclick="deleteSubtask('${t.id}','${s.id}')">×</button>
              </div>
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
// meta line. Only ever called from renderTaskDetailPage() now (the
// inline .expand under a normal row is Steps-only these days — see
// taskSubtasksHtml()'s own comment); still its own function rather than
// folded into that one call site, since "everything a task's detail page
// shows below the header" reads clearly as its own unit either way.
// hideCategory passes straight through to taskCoreFieldsRowHtml() — see
// its own comment for why the detail page hides the plain category
// <select> now.
// hideCategory doubles as taskCoreFieldsRowHtml()'s hideActions too —
// this function only ever has one caller (renderTaskDetailPage(), always
// passing hideCategory=true), and on that page the two conditions are
// the same condition: "this is the full detail page, which already has
// its own header for both the category label and the urgent/pin
// buttons." No case exists yet where one would be true without the
// other, so a second formal parameter here would just be a second name
// for the same signal.
function taskExpandFieldsHtml(t, canRemoveHere, titleClass, hideCategory){
  return `${taskTitleFieldHtml(t, titleClass)}${taskCoreFieldsRowHtml(t, canRemoveHere, hideCategory, hideCategory)}${taskAdvancedFieldsRowHtml(t)}${taskSubtasksHtml(t)}${taskNotesAndMetaHtml(t)}`;
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
// Every style plays exactly 3 times then settles to nothing showing (see
// the --guide-iter comment in <style>) regardless of subtask count —
// 1 vs 2+ subtasks used to change how many times this played (a quick
// couple of pulses vs. an open-ended loop); now it's the same fixed 3 for
// either, so there's no intensity split left to compute here. `subtle`
// (true in a task-list row, false on the full task/list detail page)
// tones the same animation down via the --guide-scale/--guide-opacity
// custom properties the CSS reads, rather than forking a second set of
// keyframes per context. Worth noting: since this is recomputed fresh on
// every render() (by design — see above), an unrelated render while the
// condition is still true (editing a different row, say) does restart
// the 3-play count from zero, the trade-off for staying flag-free. Rare
// enough in practice — the common case is nothing else changes while
// you're looking at the one row — not to be worth reintroducing a
// timer/counter just to close that gap.
function checkGuideClass(t, subs, subtle){
  if(t.status==='done' || !subs.length || !subs.every(s=>s.done)) return '';
  const style = (state.devSettings && state.devSettings.checkGuideAnimationStyle) || 'radialping';
  if(style === 'none') return '';
  return ` guide-check guide-${style}${subtle ? ' guide-subtle' : ''}`;
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
  // Permanent provenance marker for a task imported via a share link —
  // see confirmShareImport() (19-sharing.js) for where sharedImport gets
  // set. Not gated on advancedTaskFields — unlike priority/timeframe,
  // this isn't a triage field someone opted into, it's just a fact about
  // where the task came from.
  const sharedBadge = t.sharedImport ? `<span class="badge shared">Shared</span>` : '';
  // Leads .meta rather than sitting inline after the title text — per the
  // explicit ask, a flagged task's own flag should read as the first of
  // this row's badges, not a suffix on the title itself. Its own
  // .metaflag class (not .badge) is what keeps a flag-only row from
  // costing as much vertical space as a real badge would: .meta's height
  // is driven by its tallest child, and .badge's own vertical padding is
  // what makes a real badge tall — a bare, unpadded glyph here is short
  // enough that a flag-only row barely grows past the title's own line,
  // while still sitting flush at normal badge height (align-items:center)
  // whenever a real badge actually is present alongside it.
  const flagMeta = (t.urgent && t.status!=='done') ? `<span class="metaflag">⚑</span>` : '';
  const dotHtml = showDot ? categoryDotHtml(cat, 'cdot') : '';
  const subs = t.subtasks || [];
  // Drag-to-reorder is only meaningful in 'default' sort mode — every
  // other mode derives the row's position from a sort key, so a drag
  // there would just snap back on the next render. No handle, no drag
  // attributes at all outside 'default', rather than a handle that's
  // present but silently does nothing.
  const draggableMain = sortMode === 'default';
  const dragHandle = draggableMain
    ? `<span class="draghandle" onpointerdown="taskHandlePointerDown(event,'${t.id}')" onclick="event.stopPropagation()" title="Drag to reorder">⠿</span>`
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
  // below) — right-click and the row's own left-click navigation
  // (rowClick above) are different events, so there's no actual conflict
  // wiring this up regardless of inDaily; per the explicit ask, a Daily
  // row should offer Mark complete/Mark as Cancelled/etc. the same way
  // every other row does. "Edit details" still routes to
  // openGenericTaskDetail() here too (not Daily's own taskDetailId) —
  // its own "Back" tag rather than "Daily" is a pre-existing, harmless
  // quirk of that path, not something inDaily introduces.
  const ctxMenuAttr = ` oncontextmenu="return handleTaskContextMenu(event,'${t.id}')"`;
  // Hover-preview of a task's own Notes — only wired up at all when there
  // are actually notes to show, so a task without any never pays for (or
  // could ever trigger) the hover machinery in the first place. See
  // noteHoverStart()'s own comment further down for the delay/desktop-
  // only reasoning.
  const noteHoverAttrs = t.notes ? ` onmouseenter="noteHoverStart(event,'${t.id}')" onmouseleave="noteHoverEnd()"` : '';
  const onMoveTarget = inDaily && (t.plannedDates||[]).includes(moveForwardTarget(dayDate));
  return `
  <li class="task" data-task-id="${t.id}">
    <div class="row"${pressAttrs}${ctxMenuAttr}${noteHoverAttrs} onclick="${rowClick}">
      ${dragHandle}
      <div class="checkwrap" onclick="event.stopPropagation()">
        <div class="check ${t.status==='done'?'done':''}${t.cancelled?' cancelled':''}${checkGuideClass(t, subs, true)}${checkCelebrateClass(t)}" onclick="toggleStatus('${t.id}')"></div>
        ${subProgressHtml(subs)}
      </div>
      ${dotHtml}
      <div class="titlewrap">
        <div class="title ${t.status==='done'?'done':''}">${escapeHtml(t.title)}</div>
        <div class="meta">${flagMeta}${priorityBadge}${timeframeBadge}${sharedBadge}${badge}</div>
      </div>
      ${inDaily ? `
        <button class="movenext" ${onMoveTarget?'disabled':''} onclick="event.stopPropagation(); moveTaskForward('${t.id}','${dayDate}')" title="${onMoveTarget ? (dayDate<todayStr()?'Already planned for today':'Already planned for tomorrow') : (dayDate<todayStr()?'Also plan for today':'Also plan for tomorrow')}">→</button>
        <button class="dayremove" onclick="event.stopPropagation(); unplanTaskFromDay('${t.id}','${dayDate}')" title="Remove from this day">×</button>
      ` : `
        <button class="rowflag ${t.urgent?'on':''}" onclick="event.stopPropagation(); toggleUrgent('${t.id}')" title="Toggle flag">⚑</button>
        <button class="rowpin ${hasCurrentPlan(t.plannedDates)?'on':''}" onclick="event.stopPropagation(); toggleTaskToday('${t.id}')" title="${taskTodayTitle(t)}">${DAYPIN_ICON_SVG}</button>
        <button class="rowexpand" onclick="event.stopPropagation(); openGenericTaskDetail('${t.id}')" title="Open full task page">⛶</button>
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
  // Long-press already fired (menu's open) — from here on this is a
  // drag-to-choose gesture, not "did the finger move far enough to
  // cancel the long-press" any more. See ctxMenuDragMove()'s own comment.
  if(taskLongPressFired){ if(ctxMenuDragMove(e)) e.preventDefault(); return; }
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
  // Only meaningful once the long-press actually opened a menu — see
  // ctxMenuDragEnd()'s own comment. A no-op the rest of the time
  // (ctxMenuDragTarget can only be set by ctxMenuDragMove(), which itself
  // only ever runs once taskLongPressFired is true).
  if(taskLongPressFired) ctxMenuDragEnd();
}
// Mobile: a plain tap always jumps straight to the full task page —
// same platform-standard split as a home-screen icon (tap to open,
// long-press for quick actions), and cheap to back out of via swipe-back.
// Unconditional on mobile regardless of taskLongPressMode now — that dev
// setting only ever decided what a *long press* does ('split' opens a
// bottom sheet, 'detail' opens the same context menu 'default' does; see
// usePressGesture above), never what a plain tap should do. An earlier
// version also gated the plain tap on taskLongPressMode==='detail'
// specifically, so 'default'/'split' on mobile fell through to
// toggleExpand()'s inline quick view below (the desktop-only interaction
// two paragraphs down) — that's what let the inline view sometimes end
// up already toggled open (in expandedTaskIds) on a row you'd never
// intentionally expanded, then flash open again on returning to the list
// from that row's own full detail page. Desktop (mobileUiActive() false)
// always falls through to toggleExpand()'s inline Steps-only quick view
// instead, regardless of taskLongPressMode — desktop has no swipe-back,
// so jumping to a full page on every tap would make "just glance at the
// steps" the expensive path instead of the cheap one.
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
    openGenericTaskDetail(taskId);
    return;
  }
  lastRowTap = { taskId, time: now };
  if(mobileUiActive()){ openGenericTaskDetail(taskId); return; }
  toggleExpand(e, taskId);
}

// ---------- a task's own right-click menu ----------
// Returned directly from a row's oncontextmenu attribute (see taskRowHtml()
// above) — `return false` there is the inline-handler equivalent of
// e.preventDefault(), which is what actually keeps the browser's native
// menu from also showing. The app's own popup only ever opens on a real
// desktop (mobileUiActive() false) — on mobile the long-press flow
// (taskPressStart et al.) is this row's actual menu trigger instead. But
// still `return false` (not `true`) while mobileUiActive(): a genuine
// touch device has no mouse to right-click with, so this never fires
// there anyway, while mobileUiPreviewOnDesktop previews mobile UI with a
// perfectly real mouse — returning true there let the OS's own native
// menu pop up on every right-click, purely an annoyance while debugging
// that mode, since nothing in-app was relying on it staying enabled. Was
// a dev setting (customContextMenu); graduated to the real, always-on
// behavior.
function handleTaskContextMenu(e, taskId){
  if(mobileUiActive()) return false;
  openTaskContextMenu(taskId, e.clientX, e.clientY);
  return false;
}

let ctxMenuTaskId = null;

// includeEdit is false for the mobile 'detail' long-press menu
// (openTaskContextMenuForRow() below) — a plain tap there already opens
// the full task page, so "Edit details" would just be a slower way to do
// what the tap already does. Desktop's right-click menu keeps it (routed
// to openGenericTaskDetail(), same full page — not toggleExpand(), whose
// inline .expand is Steps-only now and has no edit fields to open), since
// desktop's own row already has a .rowexpand button for this too, but a
// right-click menu that's already open is one less click than reaching
// for it.
// ctxmenu-hasicon/.ctxmenu-icon (see <style>) puts the same pin glyph
// this task's own row already uses for pinning to today (DAYPIN_ICON_SVG)
// on the right edge of this one menu row too, per the explicit ask —
// scoped to just this item rather than every row, since it's the one
// action here that already has an established icon language elsewhere in
// the app to borrow; the rest (Mark complete, Mark as Cancelled, Mark
// urgent, Edit details, Copy title, Delete) have no equivalent icon
// button anywhere else to stay consistent with.
function taskContextMenuHtml(t, includeEdit){
  const plannedToday = (t.plannedDates||[]).includes(todayStr());
  return `
    <button onclick="ctxMenuAction(()=>toggleStatus('${t.id}'))">${t.status==='done' ? 'Reopen' : 'Mark complete'}</button>
    ${t.cancelled ? `<button onclick="ctxMenuAction(()=>uncancelTaskToComplete('${t.id}'))">Mark complete</button>` : ''}
    ${t.status!=='done' ? `<button class="ctxmenu-danger" onclick="ctxMenuAction(()=>markTaskCancelled('${t.id}'))">Mark as Cancelled</button>` : ''}
    <button onclick="ctxMenuAction(()=>toggleUrgent('${t.id}'))">${t.urgent ? 'Unmark urgent' : 'Mark urgent'}</button>
    <button class="ctxmenu-hasicon" onclick="ctxMenuAction(()=>toggleTaskToday('${t.id}'))">${plannedToday ? 'Remove from today' : 'Add to today'}<span class="ctxmenu-icon">${DAYPIN_ICON_SVG}</span></button>
    ${includeEdit ? `<button onclick="ctxMenuAction(()=>openGenericTaskDetail('${t.id}'))">Edit details</button>` : ''}
    <button onclick="ctxMenuCopyTitle('${t.id}')">Copy title</button>
    <div class="ctxmenu-sep"></div>
    <button class="ctxmenu-danger" onclick="ctxMenuAction(()=>deleteTask('${t.id}'))">Delete</button>
  `;
}

// The "Desktop zoom" dev setting (state.devSettings.desktopZoom, applied
// via CSS `zoom` on #appShell — see applyDevSettings()'s own comment in
// 01-categories-theme.js for why `zoom` and not transform/font-size)
// broke every position:fixed popover in the app the moment it's anything
// but 100%: a position:fixed element's own inline top/left get re-scaled
// a SECOND time by a zoomed ANCESTOR (confirmed empirically — this isn't
// documented/consistent browser behavior, it was tested directly), on top
// of the already-correct, already-in-true-viewport-pixels values
// getBoundingClientRect() reports (zoom doesn't need any compensation
// there — only for values ASSIGNED back via inline style on a
// position:fixed element). Dividing by the same factor before assigning
// cancels it out. Every position:fixed popover positioned by JS in this
// app (task/day/subtask/category-move/sort context menus below, the
// checklist context menu in 13-checklist.js, the share menu in
// 19-sharing.js, the note hover tip below) needs this — position:absolute
// placements elsewhere (the category color wheel's knobs in 09-settings.js,
// the overlap tab-bar's clones in 06-tabs-render.js) do NOT, since those
// resolve relative to a normal positioned ancestor already inside the
// same zoomed subtree, which stays internally consistent under `zoom`
// with no cross-boundary mismatch to correct for.
function zoomFactor(){
  const shell = document.getElementById('appShell');
  const z = shell ? parseFloat(getComputedStyle(shell).zoom) : 1;
  return z && !isNaN(z) ? z : 1;
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

// ---------- a step's own right-click/long-press menu ----------
// Steps had no context menu at all before this — the one thing worth
// putting in it (Mark as Cancelled, per the explicit ask) doesn't fit
// anywhere else: there's no dedicated button for it by design, and it's
// not a natural fit for the inline checkbox/date/pin/delete controls
// already crammed into a .subrow. Scoped to .subtext specifically (not
// the whole .subrow) rather than reusing taskPressStart()'s whole-row
// approach — .subrow already has its own onpointerdown on .draghandle.sub
// for reorder-dragging (see subHandlePointerDown(), 07-drag.js); wiring a
// second long-press system to the same row risked the two fighting over
// the same touch. .subtext already owns tap-to-edit, so a menu trigger
// living there too is one more reason to press-and-hold text specifically,
// not a new place entirely. Always wired up regardless of s.done now —
// Reopen (mirroring a standard task's own Mark complete/Reopen menu
// item, per the explicit ask for parity) is exactly what a done/
// cancelled step needs a menu for, even though the checkbox already
// does the same toggle directly; Mark as Cancelled only makes sense
// while the step isn't done yet.
// Pin to Today / Remove Item were added per the explicit ask, once a
// standard task's own step row started dropping its always-visible
// Pin/Remove buttons on mobile (see the .stepsactions comment in
// taskSubtasksHtml() below and body.mobileui-active .stepsactions in
// <style>) — this menu is now the only way to reach either on a phone.
// Pin to Today / Add Date are both gated off for a checklist list's own
// items (isChecklistCategory(t.category)) rather than shown everywhere
// this function is shared: a checklist item never had a "planned for
// today" concept OR a date field exposed anywhere in its UI before this
// menu existed, so silently granting either here would be a new
// capability nobody asked for, not just a relocated one. Remove Item has
// no such asymmetry — a checklist item's inline "×" already does the
// exact same delete, so offering it here too for both flavors is just a
// second path to something already possible either way. Add Date is
// further gated on !s.dueDate — once a step has one, the (now visible
// again) inline Date field IS the edit affordance, same tap-to-edit it
// always was; this menu item only exists to give a dateless step its
// first one, since the field itself is hidden while empty (see
// .datefield.empty in <style>) and so isn't there to tap.
function subtaskContextMenuHtml(t, s){
  const plannedToday = (s.plannedDates||[]).includes(todayStr());
  const isChecklistItem = isChecklistCategory(t.category);
  return `
    <button onclick="ctxMenuAction(()=>toggleSubtask('${t.id}','${s.id}'))">${s.done ? 'Reopen' : 'Mark Complete'}</button>
    ${s.cancelled ? `<button onclick="ctxMenuAction(()=>uncancelSubtaskToComplete('${t.id}','${s.id}'))">Mark Complete</button>` : ''}
    ${!s.done ? `<button class="ctxmenu-danger" onclick="ctxMenuAction(()=>markSubtaskCancelled('${t.id}','${s.id}'))">Mark as Cancelled</button>` : ''}
    ${!isChecklistItem ? `<button class="ctxmenu-hasicon" onclick="ctxMenuAction(()=>toggleSubtaskToday('${t.id}','${s.id}'))">${plannedToday ? 'Remove from Today' : 'Pin to Today'}<span class="ctxmenu-icon">${DAYPIN_ICON_SVG}</span></button>` : ''}
    ${!isChecklistItem && !s.dueDate ? `<button class="ctxmenu-hasicon" onclick="ctxMenuAction(()=>startAddSubtaskDate('${t.id}','${s.id}'))">Add Date<span class="ctxmenu-icon">${DATE_ICON_SVG}</span></button>` : ''}
    <div class="ctxmenu-sep"></div>
    <button class="ctxmenu-danger" onclick="ctxMenuAction(()=>deleteSubtask('${t.id}','${s.id}'))">Remove Item</button>
  `;
}
function renderSubtaskContextMenu(taskId, subId, x, y){
  const t = state.tasks.find(x2=>x2.id===taskId);
  const s = t && (t.subtasks||[]).find(x2=>x2.id===subId);
  if(!t || !s) return;
  // Reuses ctxMenuTaskId (not a dedicated flag) — every consumer of that
  // var only ever treats it as "is a task-flavored #ctxMenu open right
  // now" for the outside-click/scroll/Esc dismissal logic, never reads
  // it expecting it to name the exact task the menu's content describes,
  // so a step's menu sharing it with its parent task's own is harmless.
  ctxMenuTaskId = taskId;
  const menu = document.getElementById('ctxMenu');
  menu.innerHTML = subtaskContextMenuHtml(t, s);
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
// Same reasoning as handleTaskContextMenu() above for `return false`
// (not `true`) while mobileUiActive() — see its own comment.
function handleSubtaskContextMenu(e, taskId, subId){
  if(mobileUiActive()) return false;
  renderSubtaskContextMenu(taskId, subId, e.clientX, e.clientY);
  return false;
}
// Mobile long-press twin, same shape as checklistPressStart() etc.
// (13-checklist.js) — its own small state rather than reusing
// taskPressStart()'s (which branches on taskLongPressMode, a choice
// about a *row's* tap behavior that has no meaning for one step's text).
let subtaskPressTimer = null;
let subtaskPressRow = null;
// The whole .subrow (not subtaskPressRow itself, which stays .subtext —
// see below) to dim during the hold — same .pressing feedback a standard
// task row already gives instantly on touchstart (see taskPressStart()'s
// own comment on .row.pressing in <style>), per the explicit ask for
// "something is happening" feedback on every long-pressable item, not
// just task rows. Kept as its own variable rather than re-deriving via
// closest() in three places.
let subtaskPressWholeRow = null;
let subtaskPressStartX = 0, subtaskPressStartY = 0;
let subtaskLongPressFired = false;
function subtaskPressStart(e, taskId, subId){
  if(!mobileUiActive()) return;
  subtaskLongPressFired = false;
  const pt = e.touches ? e.touches[0] : e;
  subtaskPressStartX = pt.clientX;
  subtaskPressStartY = pt.clientY;
  // subtaskPressRow stays .subtext itself (the touch target) — its own
  // getBoundingClientRect() below is what anchors the menu, and that's
  // always meant to hug the text specifically, not the whole row.
  subtaskPressRow = e.currentTarget;
  subtaskPressWholeRow = subtaskPressRow.closest('.subrow');
  if(subtaskPressWholeRow) subtaskPressWholeRow.classList.add('pressing');
  clearTimeout(subtaskPressTimer);
  subtaskPressTimer = setTimeout(() => {
    subtaskPressTimer = null;
    subtaskLongPressFired = true;
    if(subtaskPressWholeRow) subtaskPressWholeRow.classList.remove('pressing');
    const r = subtaskPressRow.getBoundingClientRect();
    renderSubtaskContextMenu(taskId, subId, r.left, r.bottom + 6);
  }, TASK_LONG_PRESS_MS);
}
function subtaskPressMove(e){
  // See taskPressMove()'s own comment — same "long-press already opened
  // the menu, this is drag-to-choose now" branch, shared engine.
  if(subtaskLongPressFired){ if(ctxMenuDragMove(e)) e.preventDefault(); return; }
  if(!subtaskPressTimer) return;
  const pt = e.touches ? e.touches[0] : e;
  const dx = pt.clientX - subtaskPressStartX, dy = pt.clientY - subtaskPressStartY;
  if(Math.hypot(dx, dy) > TASK_LONG_PRESS_TOLERANCE_PX){
    clearTimeout(subtaskPressTimer);
    subtaskPressTimer = null;
    if(subtaskPressWholeRow) subtaskPressWholeRow.classList.remove('pressing');
  }
}
function subtaskPressEnd(){
  clearTimeout(subtaskPressTimer);
  subtaskPressTimer = null;
  if(subtaskPressWholeRow) subtaskPressWholeRow.classList.remove('pressing');
  if(subtaskLongPressFired) ctxMenuDragEnd();
}
// Swallows the click a touchend fires right after a long-press already
// opened the menu — same pattern taskRowTap()/checklistRowTap() use.
// startEditSubtask (15-subtask-edit.js) is .subtext's normal tap action
// (swap to an inline edit field); this is now the attribute that reaches
// it instead of calling it directly.
function subtextTap(e, el, taskId, subId){
  if(subtaskLongPressFired){ subtaskLongPressFired = false; e.preventDefault(); return; }
  startEditSubtask(el, taskId, subId);
}

// ---------- the full detail page's own big checkbox: long-press-to-menu ----------
// Own small state, same shape as subtaskPressStart() etc. above — not
// reused directly since it's anchoring a different element (the detail
// page's big .check, not a .subtext) for a different taskId shape (no
// subId to thread through).
let taskDetailCheckPressTimer = null;
let taskDetailCheckPressEl = null;
let taskDetailCheckPressStartX = 0, taskDetailCheckPressStartY = 0;
let taskDetailCheckLongPressFired = false;
function taskDetailCheckPressStart(e, taskId){
  if(!mobileUiActive()) return;
  taskDetailCheckLongPressFired = false;
  const pt = e.touches ? e.touches[0] : e;
  taskDetailCheckPressStartX = pt.clientX;
  taskDetailCheckPressStartY = pt.clientY;
  taskDetailCheckPressEl = e.currentTarget;
  // Opacity, not the .pressing background/scale treatment a row gets —
  // this element already carries its own scale(2.2) transform (see
  // .taskdetailhead .checkwrap in <style>), and a second transform
  // declaration would just replace the first rather than combine with
  // it, undoing that sizing for as long as the hold lasts.
  taskDetailCheckPressEl.classList.add('pressing');
  clearTimeout(taskDetailCheckPressTimer);
  taskDetailCheckPressTimer = setTimeout(() => {
    taskDetailCheckPressTimer = null;
    taskDetailCheckLongPressFired = true;
    taskDetailCheckPressEl.classList.remove('pressing');
    openTaskContextMenuForRow(taskId, taskDetailCheckPressEl);
  }, TASK_LONG_PRESS_MS);
}
function taskDetailCheckPressMove(e){
  // See taskPressMove()'s own comment — same shared drag-to-choose engine.
  if(taskDetailCheckLongPressFired){ if(ctxMenuDragMove(e)) e.preventDefault(); return; }
  if(!taskDetailCheckPressTimer) return;
  const pt = e.touches ? e.touches[0] : e;
  const dx = pt.clientX - taskDetailCheckPressStartX, dy = pt.clientY - taskDetailCheckPressStartY;
  if(Math.hypot(dx, dy) > TASK_LONG_PRESS_TOLERANCE_PX){
    clearTimeout(taskDetailCheckPressTimer);
    taskDetailCheckPressTimer = null;
    if(taskDetailCheckPressEl) taskDetailCheckPressEl.classList.remove('pressing');
  }
}
function taskDetailCheckPressEnd(){
  clearTimeout(taskDetailCheckPressTimer);
  taskDetailCheckPressTimer = null;
  if(taskDetailCheckPressEl) taskDetailCheckPressEl.classList.remove('pressing');
  if(taskDetailCheckLongPressFired) ctxMenuDragEnd();
}
function taskDetailCheckTap(e, taskId){
  if(taskDetailCheckLongPressFired){ taskDetailCheckLongPressFired = false; e.preventDefault(); return; }
  toggleStatus(taskId);
}
// Shared by the task menu above, the day menu below, the category
// "Move to" menu further down, and the Sort menu (renderSortMenu() below)
// — only one #ctxMenu exists, so only one of ctxMenuTaskId/ctxMenuDayStr/
// ctxMenuMoveTaskId/ctxMenuSortOpen is ever set at a time; closing always
// clears all four regardless of which one's actually set, rather than
// needing a caller to know which kind of menu is currently open.
function closeCtxMenu(){
  ctxMenuTaskId = null;
  ctxMenuDayStr = null;
  ctxMenuMoveTaskId = null;
  ctxMenuSortOpen = false;
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

// ---------- long-press-then-drag menu selection (touch only) ----------
// Native iOS/Android context menus let you keep your finger down after a
// long-press, drag onto the option you want, and lift to choose it —
// without this, choosing anything took two separate touches (long-press
// to open, then a second tap on a button). This reproduces that for
// #ctxMenu generically, since every long-press menu in the app (a task
// row, a step, a checklist row) already funnels into that one shared
// element (see ctxMenuTaskId's own comment above) — one implementation
// covers all three flavors. Wired into each row-type's own *PressMove/
// *PressEnd, gated on that row's own *LongPressFired flag (only true once
// its long-press actually opened the menu) — see taskPressMove() for the
// exact hookup. If the finger lifts while resting on a button, that
// button is chosen, same as tapping it; if it lifts anywhere else (never
// dragged onto an option, or dragged back off one), the menu is left open
// exactly as it already was before any of this existed — a plain tap
// still picks an option, per the explicit ask to keep that path
// untouched. Mouse never reaches this: a row's own onmousedown/onmouseup
// only ever call *PressStart/*PressEnd, never *PressMove (no
// onmousemove attribute on any row) — ctxMenuDragMove() is the only place
// ctxMenuDragTarget ever gets set, so it's structurally touch-only.
let ctxMenuDragTarget = null;

// Called from *PressMove once *LongPressFired is true. Returns true
// whenever the finger's still down over an open menu at all (regardless
// of whether it's landed on a button yet) — callers use that to decide
// whether to preventDefault() and lock page scroll for the rest of this
// touch, not just for the moments it happens to be directly over a
// button, since the whole point is the screen no longer scrolling out
// from under the gesture once the menu is up.
function ctxMenuDragMove(e){
  const menu = document.getElementById('ctxMenu');
  if(!menu.classList.contains('open') || !e.touches) return false;
  const pt = e.touches[0];
  const el = document.elementFromPoint(pt.clientX, pt.clientY);
  const btn = el && el.closest('#ctxMenu button');
  if(btn !== ctxMenuDragTarget){
    if(ctxMenuDragTarget) ctxMenuDragTarget.classList.remove('ctxmenu-armed');
    ctxMenuDragTarget = btn || null;
    if(ctxMenuDragTarget) ctxMenuDragTarget.classList.add('ctxmenu-armed');
  }
  return true;
}
// Called from *PressEnd once *LongPressFired is true (i.e. every finger
// lift that followed a long-press, whether or not it ever actually
// dragged). Clicking the armed button reuses that button's own onclick —
// same ctxMenuAction()/closeCtxMenu() path a plain tap already goes
// through — rather than duplicating its action here.
function ctxMenuDragEnd(){
  const target = ctxMenuDragTarget;
  ctxMenuDragTarget = null;
  if(target){ target.classList.remove('ctxmenu-armed'); target.click(); }
}

// ---------- a task row's Notes hover preview ----------
// Only wired up on rows that actually have notes (see taskRowHtml()'s own
// noteHoverAttrs) — a task with none never even attaches the listeners
// that would trigger this. Desktop-only (mobileUiActive() bails out
// immediately): there's no hover on a touch device, and even where a
// stray synthetic mouseenter fires from a tap, showing a popup nobody
// asked for on every row with notes would be exactly the noisiness this
// was designed to avoid. Delayed rather than instant — a quick pass of
// the cursor across several rows (scanning the list, not actually
// pausing on any one of them) shouldn't flash a popup per row; only
// genuinely lingering on one does.
const NOTE_HOVER_DELAY_MS = 900;
let noteHoverTimer = null;
function noteHoverStart(e, taskId){
  if(mobileUiActive()) return;
  clearTimeout(noteHoverTimer);
  const rowEl = e.currentTarget;
  if(!rowEl) return;
  noteHoverTimer = setTimeout(() => {
    noteHoverTimer = null;
    // rowEl.isConnected guards against the 900ms delay outliving the row
    // itself — render() rebuilding the list (a status toggle, a reorder,
    // switching tabs) detaches the old element from the document without
    // ever firing its mouseleave, so without this a still-pending timer
    // from a row that's since been replaced would call
    // getBoundingClientRect() on an orphaned node instead of just doing
    // nothing.
    if(!rowEl.isConnected) return;
    const t = state.tasks.find(x=>x.id===taskId);
    if(!t || !t.notes) return;
    showNoteHoverTip(rowEl, t.notes);
  }, NOTE_HOVER_DELAY_MS);
}
// Shared by the mouseleave below and anything else that should dismiss
// the tip outright (a click on the row, closeCtxMenu()'s own callers,
// etc. — not currently needed elsewhere, but cheap to keep general).
function noteHoverEnd(){
  clearTimeout(noteHoverTimer);
  noteHoverTimer = null;
  hideNoteHoverTip();
}
function showNoteHoverTip(rowEl, notes){
  const tip = document.getElementById('noteHoverTip');
  if(!tip) return;
  tip.textContent = notes;
  tip.classList.add('open');
  // Left-aligned to the title text itself, not the row's own left edge
  // (the drag handle/checkbox/category dot all sit further left) — per
  // the explicit ask, the tip reads more clearly as "about this text"
  // lined up with where the title actually starts rather than the
  // row's leftmost, mostly-decorative edge. Falls back to the row's own
  // rect if .title somehow isn't found.
  const titleEl = rowEl.querySelector('.title');
  const r = (titleEl || rowEl).getBoundingClientRect();
  const zf = zoomFactor();
  tip.style.left = (r.left/zf) + 'px';
  // Anchored to the title text's own bottom (not the whole row's), and a
  // smaller gap than before — the row's bottom sits further down than
  // the text itself (badges/meta below it, row padding), which read as
  // too much empty space between the title and the tip. 4px keeps them
  // visibly close without the tip touching the text.
  tip.style.top = ((r.bottom + 4)/zf) + 'px';
  // Same post-layout nudge-back-onscreen pass renderTaskContextMenu() and
  // renderCategoryMoveMenu() already use — the tip's own width/height
  // aren't knowable until the browser has actually laid it out with real
  // content in it.
  requestAnimationFrame(() => {
    const tr = tip.getBoundingClientRect();
    if(tr.right > window.innerWidth) tip.style.left = (Math.max(8, window.innerWidth - tr.width - 8)/zf) + 'px';
    if(tr.bottom > window.innerHeight) tip.style.top = (Math.max(8, r.top - tr.height - 6)/zf) + 'px';
  });
}
function hideNoteHoverTip(){
  const tip = document.getElementById('noteHoverTip');
  if(tip) tip.classList.remove('open');
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
// Same reasoning as handleTaskContextMenu() above for `return false`
// (not `true`) while mobileUiActive() — see its own comment.
function handleDayContextMenu(e, dateStr){
  if(mobileUiActive()) return false;
  renderDayContextMenu(dateStr, e.clientX, e.clientY);
  return false;
}

// ---------- Task category "Move to" menu ----------
// Same #ctxMenu popup the task/day menus above use — see closeCtxMenu()'s
// own comment for why this is a third sibling flag rather than a new
// popup element of its own. Opened from the task detail page's own
// category label (categoryLabelHtml() above) — moving a task between
// categories is common enough while looking at its own detail page to
// deserve a dedicated, always-reachable control there instead of only
// the long-press/right-click quick-actions menu. standardCategoryEntries()
// (same filter taskCoreFieldsRowHtml()'s old <select> used) excludes
// checklist-type categories — a standard task moving into one wouldn't
// make structural sense there — and the task's own current category is
// left out too, since "move to where it already is" isn't a real option.
let ctxMenuMoveTaskId = null;
function categoryMoveMenuHtml(t){
  const options = standardCategoryEntries().filter(([k])=>k!==t.category);
  return `
    <div class="ctxmenu-label">Move to</div>
    ${options.length ? options.map(([k,v])=>`
      <button onclick="ctxMenuAction(()=>moveTaskCategoryFollowingTab('${t.id}','${k}'))">${categoryDotHtml(v,'cdot')} ${escapeHtml(v.label)}</button>
    `).join('') : `<div class="ctxmenu-label">No other tabs to move to</div>`}
  `;
}
// Only this Move-to menu follows the task to its new tab — the plain
// .catselect <select> (taskCoreFieldsRowHtml(), inline row expand) still
// calls updateCategory() directly and stays put, since that's an
// in-place list edit, not a "take me there" action the way this menu is.
// "Only if you were on that specific category tab" (the explicit ask)
// reduces to this one activeTab check: a category tab only ever lists
// tasks whose own category matches it, so reaching this menu from a real
// category tab already means activeTab === the task's old category —
// 'all' and 'daily' are the only tabs that can show a task without
// matching its category, and both are excluded here by name. Sets
// activeTab directly rather than calling switchTab(newCat) — switchTab()
// also tears down genericTaskDetailId (see its own comment), which would
// slam the task detail page you just moved *from* shut; this only needs
// to swap which tab is waiting underneath for whenever you do back out.
// Order matters here: activeTab must be updated BEFORE updateCategory()
// runs, not after. updateCategory() calls render() synchronously (it's
// declared async but never actually awaits anything, so it runs to
// completion immediately) — setting activeTab afterward left that
// render() painting the OLD tab as active, with nothing to repaint it a
// second time until some unrelated future render happened to run, by
// which point THIS move's activeTab change would finally show up
// alongside whatever the NEXT move had just done to state — the exact
// "one move behind" glitch this order fixes.
function moveTaskCategoryFollowingTab(taskId, newCat){
  const shouldFollow = activeTab !== 'all' && activeTab !== 'daily';
  if(shouldFollow) activeTab = newCat;
  updateCategory(taskId, newCat);
}
function renderCategoryMoveMenu(taskId, x, y){
  const t = state.tasks.find(x2=>x2.id===taskId);
  if(!t) return;
  ctxMenuMoveTaskId = taskId;
  const menu = document.getElementById('ctxMenu');
  menu.innerHTML = categoryMoveMenuHtml(t);
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
// Anchored under the label itself (el) rather than a click coordinate —
// the label's a small fixed target in a page corner, not a wide row
// where "wherever the finger happens to be" matters the way it does for
// openTaskContextMenuForRow()'s own row-anchored menu.
function openCategoryMoveMenu(el, taskId){
  const r = el.getBoundingClientRect();
  renderCategoryMoveMenu(taskId, r.right, r.bottom + 6);
}

// Sort menu — same #ctxMenu popup, same anchored-under-the-trigger idiom
// as openCategoryMoveMenu() just above (the Sort button is exactly the
// same kind of small fixed corner target the category label is), replacing
// the plain native <select> renderList()/renderDayDetail() used to render
// (see sortMenuButtonsHtml(), 05-dates-sort.js) with the same kind of
// custom popover every other "pick one of a few things" control in this
// app already uses.
let ctxMenuSortOpen = false;
function renderSortMenu(x, y, includeCategory){
  ctxMenuSortOpen = true;
  const menu = document.getElementById('ctxMenu');
  menu.innerHTML = `<div class="ctxmenu-label">Sort by</div>${sortMenuButtonsHtml(includeCategory)}`;
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
function openSortMenu(el, includeCategory){
  const r = el.getBoundingClientRect();
  renderSortMenu(r.left, r.bottom + 6, includeCategory);
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
// (openGenericTaskDetail below, backs to "Back" — there's no single named
// destination since it could be any tab). backOnclick/backLabel are
// passed in rather than hardcoded so the two never have to fork this
// function to get their own back tag.
function renderTaskDetailPage(taskId, backOnclick, backLabel){
  const t = state.tasks.find(t=>t.id===taskId);
  // Always true — matches the long-press settings sheet's own "always
  // true here" rule (see openTaskSettingsSheet()'s comment). Used to be
  // gated to t.category==='misc', a category id from before categories
  // became per-user dynamic data (see CATEGORY_PALETTE's own comment) —
  // 'misc' hasn't been a real category on a fresh account in a long
  // time, so this was silently hiding Delete Task on every category
  // except whichever one an old account happened to still have named
  // that. Deleting a task doesn't touch anything category-specific in
  // the first place, so there was never a real reason to gate it by
  // category at all.
  const canRemoveHere = true;
  const subs = t.subtasks || [];
  // Urgent flag + today-pin live in this header row (right of the big
  // checkbox) rather than inline with the title below, or down in the
  // fields row further down the page the way every other task view keeps
  // them — the project owner specifically didn't want them inline with
  // the title (it threw off the title's own centering) and wanted them
  // reachable without adding any new vertical space on mobile, so this
  // row (already reserved for the checkbox, already at the very top)
  // absorbs them instead of a row of its own. Share sits apart from them
  // on the opposite (right) side of the row rather than grouped in with
  // flag/pin — per the project owner's own ask, since it's a fundamentally
  // different kind of action (handing this task to someone else) from the
  // two personal-organization toggles beside it. .taskdetailhead is a
  // 3-column CSS grid (see <style>) specifically so the checkbox in the
  // middle column stays centered regardless of how wide the left (flag/
  // pin) and right (share) content are — no matching invisible spacer
  // needed the way a flex-based "both real items on one side" layout
  // would have required.
  const leftActionsHtml = `
    <button class="flagbtn ${t.urgent?'on':''}" onclick="toggleUrgent('${t.id}')" title="Toggle flag">⚑</button>
    <button class="flagbtn daybtn ${hasCurrentPlan(t.plannedDates)?'on':''}" onclick="toggleTaskToday('${t.id}')" title="${taskTodayTitle(t)}">${DAYPIN_ICON_SVG}</button>`;
  return `
    <div class="stackedpage">
      ${pageTagHtml(backOnclick, backLabel)}
      ${categoryLabelHtml(t)}
      <div class="taskdetailhead">
        <div class="titleactions">${leftActionsHtml}</div>
        <div class="checkwrap">
          <!-- Right-click/long-press here reuses the exact same task
               context menu the row-list version opens — per the explicit
               ask for a way to reach Mark as Cancelled from the detail
               page itself, not just a list row. includeEdit:false (see
               openTaskContextMenuForRow()/handleTaskContextMenu(), both
               08-render-core.js) since "Edit details" would just point
               back at this same page. taskDetailCheckTap() swallows the
               plain click a touchend fires right after a long-press
               already opened the menu, same pattern as subtextTap(). -->
          <div class="check ${t.status==='done'?'done':''}${t.cancelled?' cancelled':''}${checkGuideClass(t, subs, false)}${checkCelebrateClass(t)}"
            onclick="taskDetailCheckTap(event,'${t.id}')"
            oncontextmenu="return handleTaskContextMenu(event,'${t.id}')"
            ontouchstart="taskDetailCheckPressStart(event,'${t.id}')" ontouchmove="taskDetailCheckPressMove(event)" ontouchend="taskDetailCheckPressEnd()" ontouchcancel="taskDetailCheckPressEnd()"
            onmousedown="taskDetailCheckPressStart(event,'${t.id}')" onmouseup="taskDetailCheckPressEnd()" onmouseleave="taskDetailCheckPressEnd()"></div>
          ${subProgressHtml(subs)}
        </div>
        <div class="taskdetailshare">${shareButtonHtml(t.id)}</div>
      </div>
      ${t.sharedImport ? `<div class="sharedbadge inline">Shared</div>` : ''}
      ${taskExpandFieldsHtml(t, canRemoveHere, 'bigtitle', true)}
      <!-- Moved down here from .expandactions (see taskCoreFieldsRowHtml()'s
           own comment) and renamed from "Remove" to match the checklist
           detail page's own "Delete list" — same .footer-row/.remove
           pairing, same bottom-of-page position, per the explicit ask to
           keep the two consistent with each other. -->
      <div class="footer-row"><button class="remove" onclick="deleteTask('${t.id}')">Delete Task</button></div>
    </div>
  `;
}

// The task's own category, as a small tab-styled label pinned to the top
// right corner of the detail page (position:absolute against
// .stackedpage — same trick .pagetag uses top-left, mirrored, so it
// costs no flow space of its own: "the header area, on the top right,
// without adding any new space," per the explicit ask). Replaces the
// plain .catselect <select> that used to sit down in the fields row
// (taskCoreFieldsRowHtml() hides it there now via hideCategory — see its
// own comment) — same background color and contrasting text-color math
// renderTabs() (06-tabs-render.js) already uses for a real tab's
// --tabhex/--tabtext, so this reads as "the same tab, just parked here"
// rather than an unrelated new color choice. Deliberately doesn't chase
// every tabBarDesktopStyle's own exact geometry (sidetabs' shaped
// peeking edges, overlap's stacking, etc.) — those are tightly coupled
// to their own specific layouts (peeking ::before/::after positioned
// against a vertical column, an overlap stacking order keyed to tab
// index...) and reusing them here blind risked exactly the kind of
// multi-round geometry correction CLAUDE.md already warns about; color +
// icon is the one visual thread every style actually shares. Clicking it
// opens the "Move to" menu (openCategoryMoveMenu()) instead of a native
// <select> popup. categoryLabelStyle 'tape' (EXPERIMENTAL, see
// defaultDevSettings()) swaps in a rotated, translucent "washi tape"
// look instead of the flat tab-colored one — see .categorylabel-tape in
// <style>.
function categoryLabelHtml(t){
  const cat = CATEGORIES[t.category] || FALLBACK_CATEGORY;
  const textColor = relLuminance(cat.hex) > 0.5 ? '#2A2318' : '#F1EAD9';
  const glyph = CATEGORY_ICON_SVG[cat.icon] || CATEGORY_ICON_SVG.dot;
  const tape = state.devSettings && state.devSettings.categoryLabelStyle === 'tape';
  return `<button class="categorylabel${tape ? ' categorylabel-tape' : ''}" style="--catlabel-hex:${cat.hex}; --catlabel-text:${textColor}" onclick="event.stopPropagation(); openCategoryMoveMenu(this,'${t.id}')" title="Move to another category">${glyph} ${escapeHtml(cat.label)}</button>`;
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
let genericTaskDetailId = null;
function openGenericTaskDetail(taskId){
  genericTaskDetailId = taskId;
  stepsAddOpenId = null;
  render();
}
function closeGenericTaskDetail(){
  genericTaskDetailId = null;
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
  return applySortMode(categoryMatchingTasks())
    .filter(t => showDone || t.status!=='done' || completingTaskIds.has(t.id))
    .filter(t => !flaggedOnly || t.urgent);
}

// Just the <ul class="tasks"> markup (or the empty-state div) — pure,
// same reason as categoryVisibleTasks() above.
function categoryListHtml(){
  const visible = categoryVisibleTasks();
  if(visible.length===0){
    // Same reasoning as renderDayDetail()'s own emptyMsg (12-daily-tree.js):
    // flaggedOnly hiding everything needs its own message, not the tab's
    // normal empty-state copy, or it reads as "this tab has nothing in it"
    // rather than "the flagged-only filter has nothing to show right now."
    const msg = flaggedOnly ? 'No flagged tasks here.' : (EMPTY_MSG[activeTab] || 'Nothing here yet.');
    return `<div class="empty">${msg}</div>`;
  }
  return visible.map(t=>taskRowHtml(t, activeTab==='all', false)).join('') + dropEndHtml(visible);
}

function renderList(){
  const doneCount = categoryMatchingTasks().filter(t=>t.status==='done').length;

  document.getElementById('sortRow').innerHTML = sortControlHtml(activeTab==='all');

  document.getElementById('taskList').innerHTML = categoryListHtml();

  const btn = document.getElementById('showDoneBtn');
  btn.textContent = showDone ? `Hide completed (${doneCount})` : `Show completed (${doneCount})`;
  btn.style.display = doneCount>0 ? '' : 'none';

  // Scoped to All specifically (not every tab) — a shared-imported item
  // could be filed under any category, so All is the one place "find
  // everything anyone's shared with me" actually means something; see
  // openSharedItems() (19-sharing.js).
  const sharedCount = activeTab === 'all' ? sharedImportedTasks().length : 0;
  document.getElementById('sharedTagSlot').innerHTML = sharedCount
    ? pageTagHtml('openSharedItems()', `Shared ${sharedCount}`, true)
    : '';
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

// 'headerline' (EXPERIMENTAL taskDetailActionsPosition, see
// devSettingsFieldsHtml()'s own comment in 01-categories-theme.js) rests
// the flag/pin/share buttons a few px above the title's own underline —
// unlike corner/topleft (anchored to #appCard's own fixed corners, which
// never move), that line's actual Y position is exactly as variable as
// the title text above it: a long title wrapping to 3-4 lines pushes it
// much further down than a short one- or two-line title does. The old
// fixed CSS `top` (one number for desktop, one for mobile — see the
// body[data-taskdetail-actions="headerline"] rules in <style>) was
// measured against a short test title, so a genuinely long one left the
// buttons overlapping mid-title instead of resting below it — exactly
// the "buttons lost behind the title, looks unclean" bug reported. This
// measures the title's actual current bottom edge after every render
// (regardless of how many lines it wrapped to) and repositions both
// buttons relative to that, in JS, rather than trying to keep guessing a
// better fixed number. The CSS values remain as the pre-JS fallback (so
// there's no flash of unpositioned buttons before this first runs).
// No overlap fallback needed here any more: .titleedit.bigtitle gets a
// dedicated padding-bottom under headerline mode specifically (see that
// rule in <style>, right next to the CSS fallback `top` values) sized to
// fit exactly this gap + a button's own height, so the spot right above
// the underline is ALWAYS genuinely empty regardless of the title's
// length or line count — this can just bottom-anchor unconditionally.
const HEADERLINE_GAP_PX = 4;
function positionHeaderlineActions(){
  if((state.devSettings||{}).taskDetailActionsPosition !== 'headerline') return;
  const title = document.querySelector('#genericTaskDetailView .titleedit.bigtitle');
  const stackedpage = title && title.closest('.stackedpage');
  if(!title || !stackedpage) return;
  const titleRect = title.getBoundingClientRect();
  const containerTop = stackedpage.getBoundingClientRect().top;
  const relTitleBottom = titleRect.bottom - containerTop;
  ['titleactions', 'taskdetailshare'].forEach(cls => {
    const el = document.querySelector(`#genericTaskDetailView .${cls}`);
    if(!el) return;
    el.style.top = (relTitleBottom - HEADERLINE_GAP_PX - el.offsetHeight) + 'px';
  });
}

function render(){
  // Sizes every mobile autogrowTextarea() field (a task/list's own title,
  // a step's text mid-edit) to fit its current content on the next
  // frame, after whichever branch below actually paints — needed because
  // a freshly re-rendered <textarea> only knows its correct height once
  // asked (see autogrowTextarea()'s own comment), and this function has
  // several early `return`s below for different views, so a single tail
  // call at the end of render() itself wouldn't run for most of them.
  // Cheap even when nothing needs it: 0 matches on desktop, and a plain
  // querySelectorAll the rest of the time. positionHeaderlineActions()
  // rides along on the same next-frame pass for the same reason (needs
  // the title's post-render, post-autogrow layout to measure against).
  requestAnimationFrame(() => {
    document.querySelectorAll('.autogrowtext').forEach(autogrowTextarea);
    positionHeaderlineActions();
  });
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
  const gtdView = document.getElementById('genericTaskDetailView');
  // taskLongPressMode 'detail' (see openGenericTaskDetail() below) — a
  // full-page task detail reachable from a plain tap on ANY category
  // tab's row, not just Daily's own taskDetailId. Highest priority of the
  // view-swapping branches here, same tier as claudeView/settingsOpen
  // (replaces the whole app body, not a floating overlay on top of it —
  // those live outside #appCard entirely, see the Esc handler's Mobile UI
  // Lab overlay comment in 19-bootstrap.js).
  if(genericTaskDetailId && !state.tasks.find(x=>x.id===genericTaskDetailId)) genericTaskDetailId = null;
  if(genericTaskDetailId){
    catView.style.display = 'none';
    dayView.style.display = 'none';
    chkView.style.display = 'none';
    setView.style.display = 'none';
    cldView.style.display = 'none';
    gtdView.style.display = '';
    gtdView.innerHTML = renderTaskDetailPage(genericTaskDetailId, 'closeGenericTaskDetail()', 'Back');
    document.getElementById('taskList').innerHTML = ''; // avoid stale duplicate ids
    dayView.innerHTML = '';
    chkView.innerHTML = '';
    setView.innerHTML = '';
    cldView.innerHTML = '';
    applyDevElementNames();
    return;
  }
  gtdView.style.display = 'none';
  gtdView.innerHTML = '';
  const shdView = document.getElementById('sharedItemsView');
  if(sharedItemsOpen){
    catView.style.display = 'none';
    dayView.style.display = 'none';
    chkView.style.display = 'none';
    setView.style.display = 'none';
    cldView.style.display = 'none';
    shdView.style.display = '';
    shdView.innerHTML = renderSharedItemsPage();
    document.getElementById('taskList').innerHTML = ''; // avoid stale duplicate ids
    dayView.innerHTML = '';
    chkView.innerHTML = '';
    setView.innerHTML = '';
    cldView.innerHTML = '';
    applyDevElementNames();
    return;
  }
  shdView.style.display = 'none';
  shdView.innerHTML = '';
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
  setSettingsOpen(false);
  // A tab switch mid-add should close the quick-add sheet rather than
  // leave it floating over whatever you just navigated to.
  if(quickAddOpen) toggleQuickAddSheet(false);
  // Same idea for the taskLongPressMode settings sheet — its task belongs
  // to whichever tab you were just on, so it shouldn't linger open over
  // a different one.
  if(taskSettingsOpenId) closeTaskSettingsSheet();
  // Same idea again for taskLongPressMode 'detail's full-page task
  // detail — tied to one specific task from whichever tab you were on.
  if(genericTaskDetailId) genericTaskDetailId = null;
  // ...and once more for whichever stackedpage drilldown a tab's own
  // content might be sitting on — a checklist list's own detail page
  // (selectedListId), its "all pending items" view (checklistPendingOpen),
  // or Daily's own day/task detail (selectedDay/taskDetailId,
  // dayReturnToCalendar along with it). Clicking any tab, including the
  // one you're already on, should always land on that tab's own master
  // view, not strand you on a drilldown left open from the last time you
  // were there.
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

