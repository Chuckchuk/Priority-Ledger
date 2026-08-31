// The checkbox-nudge picker (appearanceSection() below) options — each
// entry's third slot is the tiny looping example shown next to its own
// label inside the open dropdown (see customSelectHtml()'s own `preview`
// slot). Labels intentionally drop the internal "radial ping" style
// names' parenthetical "(default)" — the checkmark customSelectHtml()
// already draws next to the active option says that on its own.
const CHECK_GUIDE_STYLE_OPTIONS = [
  ['radialping', 'Radial ping'],
  ['wiggle', 'Wiggle'],
  ['sparkle', 'Sparkles'],
  ['glow', 'Warm pulsing glow']
].map(([v, label]) => [v, label, `<span class="check guide-check guide-${v} guide-preview" aria-hidden="true"></span>`]);

// ---------- Manage tabs ----------

function toggleSettings(){
  settingsOpen = !settingsOpen;
  if(settingsOpen){
    claudeView = null;
    // genericTaskDetailId is checked ahead of settingsOpen in render() (it
    // replaces the whole app body from any tab, not just Daily's own
    // taskDetailId) — without clearing it here, opening Settings while
    // that full-page task detail is up would flip settingsOpen on but
    // render() would still short-circuit back to the task detail, making
    // Settings look unreachable. No other overlay needs this: everything
    // else render() branches on (taskDetailId, selectedListId, etc.) only
    // matters *inside* the branches settingsOpen already short-circuits
    // past, so settingsOpen alone is enough to surface Settings over them.
    genericTaskDetailId = null;
  }
  pendingDeleteCategoryId = null;
  closeAllSettingsPopovers();
  render();
}

function renderSettings(){
  const el = document.getElementById('settingsView');
  const rows = state.categories.map((c, idx)=>{
    const count = state.tasks.filter(t=>t.category===c.id).length;
    const confirming = pendingDeleteCategoryId === c.id;
    const deleteControls = confirming
      ? `<span class="catwarn">${count ? `${count} task${count===1?'':'s'} will move to All.` : 'No tasks in this tab.'}</span>
         <button class="catdeleteconfirm" onclick="deleteCategory('${c.id}')">Yes, delete</button>
         <button class="catcancel" onclick="cancelDeleteCategory()">Cancel</button>`
      : `<button class="catdelete" ${state.categories.length<=1?'disabled title="At least one tab must stay"':''} onclick="askDeleteCategory('${c.id}')">Delete</button>`;
    const locChecks = state.locationEnabled ? `
      <div class="catlocs">
        ${state.locations.map(l=>`
          <label class="catlocchk">
            <input type="checkbox" ${c.locations.includes(l.id)?'checked':''} onchange="toggleCategoryLocation('${c.id}','${l.id}', this.checked)">
            ${escapeHtml(l.label)}
          </label>`).join('')}
      </div>` : '';
    return `
    <div class="catrow">
      <div class="catidentity">
        <div class="catmove">
          <button class="catmovebtn" ${idx===0?'disabled':''} onclick="moveCategory('${c.id}', -1)" title="Move up">▲</button>
          <button class="catmovebtn" ${idx===state.categories.length-1?'disabled':''} onclick="moveCategory('${c.id}', 1)" title="Move down">▼</button>
        </div>
        <span class="catdotwrap">
          <button class="catdotbtn" onclick="toggleCategoryPicker('${c.id}')" title="Change color & icon">${categoryDotHtml(c, 'cdot')}</button>
          ${openCategoryPickerId === c.id ? categoryPickerHtml(c) : ''}
        </span>
        <input type="text" class="catedit" value="${escapeHtml(c.label)}"
          onblur="renameCategory('${c.id}', this.value)"
          onkeydown="if(event.key==='Enter'){ event.preventDefault(); this.blur(); }">
        ${c.type==='checklist' ? '<span class="badge timeframe">Checklist</span>' : ''}
        ${c.type==='calendar' ? '<span class="badge timeframe">Calendar</span>' : ''}
      </div>
      <div class="catdeletewrap">${deleteControls}</div>
      ${locChecks}
    </div>`;
  }).join('');

  const locationBubbles = state.locations.map(l=>`
    <span class="locbubblewrap">
      <button class="locbubble" onclick="toggleLocationEditor('${l.id}')">${escapeHtml(l.label)}</button>
      ${locationEditorOpenId === l.id ? locationEditorHtml(l) : ''}
    </span>`
  ).join('');

  const locationSection = `
    <label class="catlocchk" style="margin-bottom:10px;">
      <input type="checkbox" ${state.locationEnabled?'checked':''} onchange="toggleLocationFeature(this.checked)">
      Use multiple locations
    </label>
    ${state.locationEnabled ? `
      <div class="locbubblerow">
        ${locationBubbles}
        <span class="locbubblewrap">
          <button class="locbubble locbubbleadd" onclick="toggleLocationEditor('_new')" title="Add a location">+</button>
          ${locationEditorOpenId === '_new' ? newLocationEditorHtml() : ''}
        </span>
      </div>
    ` : ''}
  `;

  const taskFieldsSection = `
    <label class="catlocchk" style="margin-bottom:10px;">
      <input type="checkbox" ${state.advancedTaskFields?'checked':''} onchange="toggleAdvancedTaskFields(this.checked)">
      Show timeframe & priority (uncheck for the simpler flag-only view)
    </label>
  `;

  const activeUiPreset = uiColorPreset(state.theme.uiPreset);
  // onclick lives on the label text too now, not just the small round
  // swatch — the swatch stays the visually obvious target, but the whole
  // row (including "UI Colors — Brass & Rust" itself) is meant to be a
  // clickable area, not just its own 26px circle.
  const uiColorSection = `
    <div class="uicolorrow">
      <span class="uicolorwrap">
        <button class="uicolorswatch" onclick="toggleUiColorPicker()" title="Change UI colors">
          <span class="uicolorhalf" style="background:${activeUiPreset.primary}"></span>
          <span class="uicolorhalf" style="background:${activeUiPreset.secondary}"></span>
        </button>
        ${uiColorPickerOpen ? uiColorPickerHtml() : ''}
      </span>
      <span class="uicolorlabel clickable" onclick="toggleUiColorPicker()">UI Colors — ${escapeHtml(activeUiPreset.label)}</span>
      ${state.theme.uiPreset==='custom' ? `<button class="uicolorquicklink" onclick="openDualColorCustomDirect('ui')" title="Edit your custom colors">✎</button>` : ''}
    </div>
  `;

  const deskPaperSection = `
    <div class="uicolorrow">
      <span class="uicolorwrap">
        <button class="uicolorswatch" onclick="toggleDeskPaperPicker()" title="Desk & Ledger presets">
          <span class="uicolorhalf" style="background:${state.theme.bg}"></span>
          <span class="uicolorhalf" style="background:${state.theme.paper}"></span>
        </button>
        ${deskPaperPickerOpen ? deskPaperPickerHtml() : ''}
      </span>
      <span class="uicolorlabel clickable" onclick="toggleDeskPaperPicker()">Desk & Ledger — ${escapeHtml(activeDeskPaperPresetLabel())}</span>
      ${activeDeskPaperPresetLabel()==='Custom' ? `<button class="uicolorquicklink" onclick="openDualColorCustomDirect('desk')" title="Edit your custom colors">✎</button>` : ''}
    </div>
  `;

  // Desktop: colors stacked on the left, color-related options (today
  // just Background gradient) on the right — see .colorsplit in <style>,
  // gated the same body:not(.mobileui-active) way every other Desktop-
  // vs-Mobile split in this app already is. Mobile: the two sides just
  // stack in document order (colorsplit-colors then colorsplit-options),
  // reproducing the single-column row-per-control layout this always
  // had — no separate mobile markup needed, only different CSS.
  // Reset to Classic Colors moved below the split (still above Textured/
  // Pages/Leather) and the dotted .settingsdivider moved to *after* it —
  // per the project owner: gradient and Reset are both squarely "part of
  // the color section," same as the swatches themselves, so the divider
  // marking where that section ends belongs past both of them, not
  // between the swatches and gradient the way it used to sit.
  const colorSplit = `
    <div class="colorsplit">
      <div class="colorsplit-colors">
        ${deskPaperSection}
        ${uiColorSection}
      </div>
      <div class="colorsplit-options">
        <label class="catlocchk">
          <input type="checkbox" ${state.theme.gradient?'checked':''} onchange="toggleThemeGradient(this.checked)">
          Background gradient
        </label>
      </div>
    </div>
    <button class="resetthemebtn" onclick="resetTheme()">Reset to classic colors</button>
  `;

  // Graduated out of Dev Settings (was checkGuideAnimationStyle there) —
  // a real, always-visible Appearance choice now rather than an
  // experimental toggle, renamed for a reader who's never heard the
  // internal "guide-check"/"nudge" terms. Still the same
  // state.devSettings.checkGuideAnimationStyle field (see
  // checkGuideClass() in 08-render-core.js for the actual mechanism) —
  // only the field it's still stored under didn't move, not what it
  // means or where it's controlled from. The live swatch on the right
  // (a bare .check with guide-preview forcing --guide-iter:infinite —
  // see <style> — instead of the real 3-play limit) plays continuously
  // so it's still demonstrating something the moment you look at it,
  // and each option in the dropdown itself carries its own tiny looping
  // copy for the same reason, per the project owner's own ask.
  const checkGuideVal = state.devSettings.checkGuideAnimationStyle || 'radialping';
  const checkGuideSection = `
    <div class="checkguiderow">
      <div class="checkguidetext">
        <span class="uicolorlabel">Checkbox nudge — plays once everything inside is checked off</span>
        ${customSelectHtml('appearance:checkGuideStyle', CHECK_GUIDE_STYLE_OPTIONS, checkGuideVal, 'setDevCheckGuideAnimationStyle')}
      </div>
      <div class="checkguideexample" title="Live example">
        <span class="check guide-check guide-${checkGuideVal} guide-preview"></span>
      </div>
    </div>
  `;

  const appearanceSection = `
    ${colorSplit}
    <div class="settingsdivider"></div>
    <div class="texturerow">
      <button class="texturebtn ${state.theme.grain?'active':''}" onclick="toggleThemeTexture('grain')">Textured</button>
      <button class="texturebtn ${state.theme.pages?'active':''}" onclick="toggleThemeTexture('pages')">Pages</button>
      <button class="texturebtn ${state.theme.leather?'active':''}" onclick="toggleThemeTexture('leather')">Leather</button>
    </div>
    <div class="settingsdivider"></div>
    ${checkGuideSection}
  `;

  const claudeSection = `
    <button class="resetthemebtn" onclick="openClaudeView('digest')">Open Claude-readable view</button>
  `;

  // EXPERIMENTAL — see defaultDevSettings() in 02-storage-state.js. Its
  // own section here (collapsed by default — 'dev' starts in
  // settingsCollapsedSections, see that var's comment) AND in the
  // floating side panel (see renderDevPanel() in 01-categories-theme.js)
  // — the side panel is the one that lets a toggle be checked against the
  // live page underneath it, but it only exists once "Show the floating
  // dev panel" (the first field below) is turned on, and this section is
  // the only place that checkbox lives, so it always needs to stay
  // reachable from here even when the panel itself is off.
  // devSettingsFieldsHtml() is the single shared source for both hosts'
  // fields.
  const devSection = devSettingsFieldsHtml('catlocchk devsettingsrow', 'devpanelfield', 'devpanelcaption', 'devpanelselect');

  const tabsSection = `
    ${rows}
    <div class="catrow">
      <input type="text" class="catedit" placeholder="+ add a new tab, enter to save" id="newCatNameInput"
        onkeydown="if(event.key==='Enter'){ addCategory(this.value, newCatTypeDraft); this.value=''; newCatTypeDraft='standard'; }">
      <span title="Standard tabs track due dates, priority, and timeframe. Checklist tabs are simple named lists of items — good for groceries, packing, shopping, anything you just need to check off.">
        ${customSelectHtml('newCatType', [['standard','Standard'],['checklist','Checklist']], newCatTypeDraft, 'setNewCatTypeDraft', 'catselect')}
      </span>
    </div>
  `;

  el.innerHTML = `
    <div class="stackedpage">
      ${pageTagHtml('toggleSettings()', 'Done')}
      ${settingsSectionHtml('tabs', 'Manage Tabs', tabsSection)}
      ${settingsSectionHtml('locations', 'Locations', locationSection)}
      ${settingsSectionHtml('taskFields', 'Task Fields', taskFieldsSection)}
      ${settingsSectionHtml('appearance', 'Appearance', appearanceSection)}
      ${settingsSectionHtml('claude', 'Claude Access', claudeSection)}
      ${settingsSectionHtml('dev', 'Dev Settings', devSection)}
    </div>
  `;
}

// Each of Settings' areas (Manage Tabs, Locations, ...) gets its own
// card with a clickable header, both so it visually reads as its own
// section at a glance and so it can be collapsed independently — see
// settingsCollapsedSections in 02-storage-state.js for why that state
// lives outside the DOM (a native <details> per section would reset
// itself shut on every render(), which is exactly the bug Dev Settings
// used to have).
function settingsSectionHtml(key, title, bodyHtml){
  const collapsed = settingsCollapsedSections.has(key);
  return `
    <div class="settingssection">
      <button class="settingssectionhead" onclick="toggleSettingsSection('${key}')">
        <span class="settingssectiontitle">${title}</span>
        <span class="settingssectionchevron">${collapsed ? '▸' : '▾'}</span>
      </button>
      ${collapsed ? '' : `<div class="settingssectionbody">${bodyHtml}</div>`}
    </div>`;
}

// Pure UI navigation, like every other Settings toggle — no pushUndo.
function toggleSettingsSection(key){
  if(settingsCollapsedSections.has(key)) settingsCollapsedSections.delete(key);
  else settingsCollapsedSections.add(key);
  render();
}

async function renameCategory(id, val){
  const c = state.categories.find(c=>c.id===id);
  if(!c) return;
  const newVal = val.trim();
  // render() always runs (even on a no-op edit) so a cleared-then-blurred
  // field snaps back to the real label instead of staying blank — but
  // undo/save are skipped unless something actually changed.
  if(newVal && newVal !== c.label){
    pushUndo(`Renamed tab to "${newVal}"`);
    c.label = newVal;
    rebuildCategoriesIndex();
    queueSave();
  }
  render();
}

function askDeleteCategory(id){
  pendingDeleteCategoryId = id;
  render();
}

function cancelDeleteCategory(){
  pendingDeleteCategoryId = null;
  render();
}

async function deleteCategory(id){
  if(state.categories.length <= 1) return;
  const c = state.categories.find(c=>c.id===id);
  pushUndo(`Deleted tab "${c ? c.label : ''}"`);
  // Tasks keep whatever category id they already had — with no tab left
  // that matches it, they simply stop appearing under a specific tab and
  // only show under "All" (styled via the CATEGORIES-lookup fallback in
  // taskRowHtml). Nothing about the tasks themselves is touched, so this
  // is safe even if the tab being deleted has a lot of tasks in it.
  state.categories = state.categories.filter(c=>c.id!==id);
  pendingDeleteCategoryId = null;
  rebuildCategoriesIndex();
  if(activeTab === id) activeTab = 'all';
  render();
  queueSave();
}

// Pure UI draft, not a content mutation — no pushUndo, same as any other
// not-yet-submitted form field. See newCatTypeDraft's own comment in
// 02-storage-state.js.
function setNewCatTypeDraft(val){
  newCatTypeDraft = val;
  render();
}

// Type is fixed at creation — there's no UI to convert a tab afterward
// (see isChecklistCategory() above for why).
async function addCategory(text, type){
  const label = (text||'').trim();
  if(!label) return;
  pushUndo(`Added tab "${label}"`);
  const hex = CATEGORY_PALETTE[state.categories.length % CATEGORY_PALETTE.length];
  // Only the workspace you're currently in gets checked by default — you
  // add a tab while thinking about the location you're actually at, and
  // can check any others afterward the same way you would for an
  // existing tab (toggleCategoryLocation). Irrelevant when locations are
  // off (visibleTabs() ignores .locations entirely in that case), so no
  // need to branch on state.locationEnabled here.
  const catType = type==='checklist' ? 'checklist' : type==='calendar' ? 'calendar' : 'standard';
  state.categories.push({ id: newId('cat'), label, hex, locations: [state.location], type: catType });
  rebuildCategoriesIndex();
  render();
  queueSave();
}

function moveCategory(id, direction){
  const idx = state.categories.findIndex(c=>c.id===id);
  const newIdx = idx + direction;
  if(idx===-1 || newIdx<0 || newIdx>=state.categories.length) return;
  pushUndo('Reordered tabs');
  const [c] = state.categories.splice(idx, 1);
  state.categories.splice(newIdx, 0, c);
  rebuildCategoriesIndex();
  render();
  queueSave();
}

async function toggleCategoryLocation(catId, locId, checked){
  const c = state.categories.find(c=>c.id===catId);
  if(!c) return;
  pushUndo(`Updated "${c.label}" locations`);
  if(checked){
    if(!c.locations.includes(locId)) c.locations.push(locId);
  } else {
    c.locations = c.locations.filter(id=>id!==locId);
  }
  rebuildCategoriesIndex();
  render();
  queueSave();
}

// The whole popover this row's .cdot button opens (see the catrow
// template above) — a small in-place card, not a real page like
// .stackedpage, since it belongs to one specific row and should feel
// anchored to the dot you clicked, not a full drilldown. Only one can be
// open at a time (openCategoryPickerId is a single id, not a Set), so
// opening a different row's picker implicitly closes whichever was open.
function categoryPickerHtml(c){
  if(customColorOpen) return customColorWheelHtml(c);
  const swatches = CATEGORY_PALETTE.map(hex=>`
    <button class="catswatch ${c.hex.toLowerCase()===hex.toLowerCase()?'active':''}" style="background:${hex}" onclick="setCategoryColor('${c.id}','${hex}')" title="${hex}"></button>`
  ).join('');
  // A permanent little rainbow, not a preview of the current color (that
  // would fight with .catswatch.active's own border-based "you're here"
  // signal when the current hex already matches this exactly) — its
  // .active state (a preset can never equal it) is what actually shows
  // "your color right now isn't one of the presets."
  const customIsActive = !CATEGORY_PALETTE.some(hex=>hex.toLowerCase()===c.hex.toLowerCase());
  const icons = CATEGORY_ICON_ORDER.map(id=>`
    <button class="caticonbtn ${(c.icon||'dot')===id?'active':''}" onclick="setCategoryIcon('${c.id}','${id}')" title="${id}" style="color:${c.hex}">${CATEGORY_ICON_GLYPHS[id]}</button>`
  ).join('');
  return `
    <div class="catpicker">
      <button class="catpickerclose" onclick="toggleCategoryPicker('${c.id}')" title="Close">×</button>
      <div class="catpickerlabel">Color</div>
      <div class="catswatchrow">
        ${swatches}
        <button class="catswatch catswatchcustom ${customIsActive?'active':''}" onclick="openCustomColor('${c.id}')" title="Custom color"></button>
      </div>
      <div class="catpickerlabel">Icon</div>
      <div class="caticonrow">${icons}</div>
    </div>`;
}

// Pure UI navigation, like askDeleteCategory — no pushUndo, opening/
// closing the popover isn't a content change. See closeAllSettingsPopovers()
// below for why every popover in Settings closes all the others first.
function toggleCategoryPicker(id){
  const wasOpen = openCategoryPickerId === id;
  closeAllSettingsPopovers();
  if(!wasOpen) openCategoryPickerId = id;
  render();
}

// Settings can have several independent popovers (a category's color/
// icon picker and its own custom-wheel sub-view, the UI Colors preset
// picker, the Desk & Ledger preset picker, and a theme swatch's own
// wheel) — but only one may ever be open at once, since the wheel's
// markup uses fixed DOM ids (#catWheelRing etc., see colorWheelInnerHtml()
// below) that would collide if two wheel instances existed in the page
// at the same time. Every toggle-open function calls this first, and
// it's also what the 4 spots that already reset pendingDeleteCategoryId
// (toggleSettings(), afterStateRestore(), openClaudeView(), signOut())
// call instead of listing each of these vars individually.
function closeAllSettingsPopovers(){
  openCategoryPickerId = null;
  customColorOpen = false;
  uiColorPickerOpen = false;
  deskPaperPickerOpen = false;
  dualColorCustomOpen = false;
  locationEditorOpenId = null;
  pendingDeleteLocationId = null;
  customSelectOpenKey = null;
  catWheelCancelDrag();
}

// ---------- Custom dropdown (replaces a native <select> in Settings) ----------
// Built on the same popup styling as the app's right-click menus
// (.ctxmenu — see openTaskContextMenu() in 08-render-core.js), per the
// project owner's own suggestion to use that as a base, but as its own
// separate component: it anchors under its own trigger (position:relative/
// absolute, the same idiom every other Settings popover here already
// uses — .uicolorwrap/.catpicker etc.) rather than at a click point, and
// tracks which instance is open via customSelectOpenKey
// (02-storage-state.js) instead of the task/day menu's own
// ctxMenuTaskId/ctxMenuDayStr/ctxMenuMoveTaskId, so the two systems never
// fight over the same state despite sharing a look.
//   key: a string unique to this one control (see devFieldHtml() in
//     01-categories-theme.js for how Dev Settings' many instances build
//     theirs).
//   options: [[value, label, previewHtml?], ...] in display order —
//     previewHtml (optional) renders after the label, for an animated
//     example of what picking that option actually looks like (see the
//     checkbox-nudge picker in appearanceSection() for the one place
//     that's used today).
//   value: the currently selected value.
//   onChangeFn: the setter function's own name (a global function),
//     called with the newly picked value — interpolated directly into
//     the option button's onclick, the same "literal function-name
//     string" idiom every onclick= attribute in this codebase uses.
//   btnClass: optional extra class(es) on the trigger button, for a host
//     that wants its own sizing (mirrors the old selectClass parameter
//     devSettingsFieldsHtml() callers used to pass a native <select>).
function customSelectHtml(key, options, value, onChangeFn, btnClass){
  const current = options.find(o=>o[0]===value) || options[0];
  const open = customSelectOpenKey === key;
  return `
    <span class="customselectwrap">
      <button type="button" class="customselectbtn ${btnClass||''} ${open?'open':''}" onclick="toggleCustomSelect('${key}')">
        <span class="customselectvalue">${current ? escapeHtml(current[1]) : ''}</span>
        <span class="customselectcaret">▾</span>
      </button>
      ${open ? `
        <div class="ctxmenu customselectmenu open">
          ${options.map(([v,label,preview])=>`
            <button type="button" class="${v===value?'customselectactive':''}" onclick="customSelectOpenKey=null; ${onChangeFn}('${v}')">
              <span class="customselectopttext">${escapeHtml(label)}</span>
              ${preview||''}
              ${v===value?'<span class="customselectcheck">✓</span>':''}
            </button>
          `).join('')}
        </div>` : ''}
    </span>`;
}

// Pure UI navigation, like every other Settings popover toggle — mutually
// exclusive with all of them via closeAllSettingsPopovers().
function toggleCustomSelect(key){
  const wasOpen = customSelectOpenKey === key;
  closeAllSettingsPopovers();
  customSelectOpenKey = wasOpen ? null : key;
  render();
}

// ---------- Custom color wheel ----------
// A hue ring (drag around it to pick a hue) with a saturation/value
// square inscribed in its hole (drag within it for the rest) — the
// classic "ring + square" picker shape, built from scratch rather than
// the browser's native <input type=color> so it can actually match the
// app's look (the native picker is a totally different, OS-drawn dialog
// with zero styling hooks). Shared by every color this app lets you pick
// freely — a category's color, and the Background/Ledger theme colors —
// via colorWheelInnerHtml() below; only the "back"/"Done" actions differ
// per host. Dragging updates customColorDraft and repaints specific DOM
// nodes directly via updateCatWheelUI() — NOT the app's own render() —
// since render() would tear down and rebuild the very elements being
// dragged, breaking the gesture mid-drag. Nothing commits to real state
// until a host's own confirm function runs (Done, or Enter in the hex
// field), which is the one moment this goes through the normal
// pushUndo/render/queueSave path like any other mutation.
const CAT_WHEEL_SIZE = 140, CAT_WHEEL_BAND = 16, CAT_WHEEL_HOLE = CAT_WHEEL_SIZE - CAT_WHEEL_BAND*2;
const CAT_WHEEL_CENTER = CAT_WHEEL_SIZE/2, CAT_WHEEL_RADIUS = CAT_WHEEL_CENTER - CAT_WHEEL_BAND/2;
// CAT_WHEEL_HOLE (108) is the circular hole's own diameter — a square
// sized to fill it edge-to-edge has corners that poke *outside* that
// circle (a square's diagonal is longer than its side), so the SV
// square used to get its corners silently clip-path'd away, along with
// any knob dragged out into one (it just vanished under the ring at
// high-saturation/extreme-value corners). CAT_WHEEL_SQ_PAD is the gap
// .catwheelsquarewrap now keeps on every side (see its CSS) so the
// actual square — CAT_WHEEL_SQUARE — is small enough that its corners
// stay inside the circle instead: side = hole/√2 ≈ 76.4px fits exactly,
// 16px of padding each side lands just inside that (76px), a small
// safety margin rather than cutting it exactly to the theoretical edge.
const CAT_WHEEL_SQ_PAD = 16, CAT_WHEEL_SQUARE = CAT_WHEEL_HOLE - CAT_WHEEL_SQ_PAD*2;

// `backOnclick`/`backLabel` are optional (pass null/'' to omit the back
// link entirely) — the category picker uses it to drop back to the
// swatch/icon row without fully closing the popover; a theme swatch's
// wheel has no "back" destination of its own, just its "×" close.
function colorWheelInnerHtml(backOnclick, backLabel, doneOnclick){
  const { h, s, v } = customColorDraft;
  const hex = hsvToHex(h, s, v);
  const rad = (h - 90) * Math.PI/180;
  const hueX = CAT_WHEEL_CENTER + CAT_WHEEL_RADIUS*Math.cos(rad);
  const hueY = CAT_WHEEL_CENTER + CAT_WHEEL_RADIUS*Math.sin(rad);
  const svX = s * CAT_WHEEL_SQUARE, svY = (1-v) * CAT_WHEEL_SQUARE;
  const backHtml = backOnclick ? `<button class="catwheelback" onclick="${backOnclick}">${backLabel}</button>` : '';
  return `
    ${backHtml}
    <div class="catwheelring" id="catWheelRing" onpointerdown="catWheelPointerDown(event,'hue')">
      <div class="catwheelknob" id="catWheelHueKnob" style="left:${hueX}px; top:${hueY}px;"></div>
      <div class="catwheelsquarewrap" onpointerdown="event.stopPropagation()">
        <div class="catwheelsquare" id="catWheelSquare" style="background-color:hsl(${h},100%,50%);" onpointerdown="catWheelPointerDown(event,'sv')">
          <div class="catwheelsvknob" id="catWheelSvKnob" style="left:${svX}px; top:${svY}px;"></div>
        </div>
      </div>
    </div>
    <div class="catcustomrow">
      <span class="catcustomswatch" id="catCustomPreview" style="background:${hex}"></span>
      <input type="text" class="catcustomhex" id="catCustomHexInput" value="${hex}" maxlength="7"
        oninput="wheelHexInput(this.value)"
        onkeydown="if(event.key==='Enter'){ event.preventDefault(); ${doneOnclick} }">
      <button class="catcustomdone" onclick="${doneOnclick}">Done</button>
    </div>`;
}

function customColorWheelHtml(c){
  return `
    <div class="catpicker">
      <button class="catpickerclose" onclick="toggleCategoryPicker('${c.id}')" title="Close">×</button>
      ${colorWheelInnerHtml(`closeCustomColor()`, '‹ Presets', `confirmCustomColor('${c.id}')`)}
    </div>`;
}

function openCustomColor(id){
  const c = state.categories.find(c=>c.id===id);
  if(!c) return;
  customColorDraft = hexToHsv(c.hex);
  customColorOpen = true;
  render();
}

// Drops back to the swatch/icon row without closing the popover itself
// (openCategoryPickerId is untouched) — unlike closeAllSettingsPopovers(),
// deliberately.
function closeCustomColor(){
  customColorOpen = false;
  catWheelCancelDrag();
  render();
}

function catWheelPointerDown(evt, type){
  evt.preventDefault();
  // The SV square sits DOM-inside the ring (visually inscribed in its
  // hole), so a pointerdown on the square would otherwise bubble up and
  // also fire the ring's own 'hue' handler — stopPropagation is what
  // keeps the two controls independent despite the nesting.
  evt.stopPropagation();
  catWheelDragCtx = { type, rect: evt.currentTarget.getBoundingClientRect() };
  catWheelHandleMove(evt);
  document.addEventListener('pointermove', catWheelHandleMove);
  document.addEventListener('pointerup', catWheelPointerUp);
}

function catWheelHandleMove(evt){
  if(!catWheelDragCtx) return;
  const { type, rect } = catWheelDragCtx;
  if(type === 'hue'){
    const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
    customColorDraft.h = (Math.atan2(evt.clientY-cy, evt.clientX-cx) * 180/Math.PI + 90 + 360) % 360;
  } else {
    customColorDraft.s = Math.max(0, Math.min(1, (evt.clientX-rect.left)/rect.width));
    customColorDraft.v = Math.max(0, Math.min(1, 1 - (evt.clientY-rect.top)/rect.height));
  }
  updateCatWheelUI();
}

function catWheelPointerUp(){
  catWheelCancelDrag();
}

// The only thing allowed to remove these document-level listeners — must
// run whenever the wheel panel can disappear out from under a drag
// (closeCustomColor, toggleCategoryPicker, confirmCustomColor, and every
// other spot that resets openCategoryPickerId/customColorOpen), not just
// on a normal pointerup, or a drag started right before e.g. Settings
// closes would leave a dangling listener updating DOM nodes that no
// longer exist.
function catWheelCancelDrag(){
  catWheelDragCtx = null;
  document.removeEventListener('pointermove', catWheelHandleMove);
  document.removeEventListener('pointerup', catWheelPointerUp);
}

// Repaints the wheel's own knobs/preview/hex field directly — see the
// big comment above customColorWheelHtml() for why this can't go through
// the app's normal render(). ALSO live-previews the real effect of the
// color being dragged — the actual desk/ledger/UI accent colors, or (for
// a category) that category's own tab-bar pill and Settings-row dot —
// without writing to state at all, so the preview can't outlive the
// popover: Escape/"‹ Presets" just calls render() (category — nothing
// was ever mutated, so the real state paints right back) or applyTheme()
// (theme — re-derives the CSS vars from the real, untouched state.theme)
// to snap back, and only confirmCustomColor()/confirmDualColorCustom()
// (Done, Enter, or clicking outside the popover — see the document click
// listener in 19-bootstrap.js) ever actually commits it.
function updateCatWheelUI(){
  const ring = document.getElementById('catWheelRing');
  if(!ring) return; // popover closed out from under an in-flight drag
  const { h, s, v } = customColorDraft;
  const hex = hsvToHex(h, s, v);
  const rad = (h - 90) * Math.PI/180;
  const hueKnob = document.getElementById('catWheelHueKnob');
  if(hueKnob){
    hueKnob.style.left = (CAT_WHEEL_CENTER + CAT_WHEEL_RADIUS*Math.cos(rad)) + 'px';
    hueKnob.style.top = (CAT_WHEEL_CENTER + CAT_WHEEL_RADIUS*Math.sin(rad)) + 'px';
  }
  const square = document.getElementById('catWheelSquare');
  if(square) square.style.backgroundColor = `hsl(${h},100%,50%)`;
  const svKnob = document.getElementById('catWheelSvKnob');
  if(svKnob){
    svKnob.style.left = (s*CAT_WHEEL_SQUARE) + 'px';
    svKnob.style.top = ((1-v)*CAT_WHEEL_SQUARE) + 'px';
  }
  const preview = document.getElementById('catCustomPreview');
  if(preview) preview.style.background = hex;
  const hexInput = document.getElementById('catCustomHexInput');
  // Never stomp on the field while it's actively focused (typing) — only
  // a drag on the ring/square should push a value into it live.
  if(hexInput && document.activeElement !== hexInput) hexInput.value = hex;

  if(dualColorCustomOpen){
    if(deskPaperPickerOpen){
      const bg = dualColorField==='bg' ? hex : dualColorHexOf('bg');
      const paper = dualColorField==='paper' ? hex : dualColorHexOf('paper');
      applyThemeObject({ ...state.theme, bg, paper });
    } else if(uiColorPickerOpen){
      const primary = dualColorField==='primary' ? hex : dualColorHexOf('primary');
      const secondary = dualColorField==='secondary' ? hex : dualColorHexOf('secondary');
      applyThemeObject({ ...state.theme, uiPreset:'custom',
        customUi:{ label:'Custom', primary, primaryLight: shadeHex(primary,0.35), secondary, secondaryLight: shadeHex(secondary,0.35) } });
    }
  } else if(customColorOpen && openCategoryPickerId){
    const tab = document.querySelector(`.tab[data-key="${openCategoryPickerId}"]`);
    if(tab){
      tab.style.setProperty('--tabhex', hex);
      tab.style.setProperty('--tabtext', relLuminance(hex) > 0.5 ? '#2A2318' : '#F1EAD9');
      tab.style.setProperty('--tabedge', shadeHex(hex, -0.25));
    }
    const rowDot = document.querySelector(`.catdotbtn[onclick="toggleCategoryPicker('${openCategoryPickerId}')"] .cdot`);
    if(rowDot) rowDot.style.color = hex;
  }
}

// The non-active tab's own stored draft, as a hex string — used by
// updateCatWheelUI()'s live preview to know the *other* field's current
// value while only the active one is mid-drag.
function dualColorHexOf(field){
  const c = dualColorDraft[field];
  return hsvToHex(c.h, c.s, c.v);
}

function normalizeHexInput(val){
  const v = (val||'').trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(v) ? ('#' + v.toUpperCase()) : null;
}

// Typing a valid hex live-repositions the wheel to match, same as
// dragging it would — doesn't commit anything (see each host's own
// confirm function for the actual commit), and silently no-ops on a
// partial/invalid value mid-keystroke rather than erroring. Generic
// across every wheel host — it only ever touches the shared draft/DOM.
function wheelHexInput(val){
  const hex = normalizeHexInput(val);
  if(!hex) return;
  customColorDraft = hexToHsv(hex);
  updateCatWheelUI();
}

// The one moment a category's custom color actually applies — Done, or
// Enter in the hex field. Always reads the hex field's current value
// (not customColorDraft's HSV) so a typed hex that was never dragged to
// is still authoritative, and always re-renders even when
// setCategoryColor() itself no-ops (hex unchanged) — otherwise closing
// customColorOpen here would never actually reach the DOM.
async function confirmCustomColor(id){
  const input = document.getElementById('catCustomHexInput');
  const hex = normalizeHexInput(input ? input.value : '');
  if(!hex) return;
  customColorOpen = false;
  catWheelCancelDrag();
  await setCategoryColor(id, hex);
  render();
}

async function setCategoryColor(id, hex){
  const c = state.categories.find(c=>c.id===id);
  if(!c || c.hex.toLowerCase()===hex.toLowerCase()) return;
  pushUndo(`Changed "${c.label}" color`);
  c.hex = hex;
  rebuildCategoriesIndex();
  render();
  queueSave();
}

async function setCategoryIcon(id, icon){
  const c = state.categories.find(c=>c.id===id);
  if(!c || (c.icon||'dot')===icon) return;
  pushUndo(`Changed "${c.label}" icon`);
  c.icon = icon;
  rebuildCategoriesIndex();
  render();
  queueSave();
}

async function toggleLocationFeature(checked){
  pushUndo(checked ? 'Enabled multiple locations' : 'Disabled multiple locations');
  state.locationEnabled = checked;
  render();
  queueSave();
}

// Purely a display toggle — timeframe/priority values already on a task
// are left untouched when hidden, same as a deleted category leaves a
// task's category id alone. Turning this back on just makes them visible
// (and editable) again.
async function toggleAdvancedTaskFields(checked){
  pushUndo(checked ? 'Enabled timeframe & priority fields' : 'Disabled timeframe & priority fields');
  state.advancedTaskFields = checked;
  render();
  queueSave();
}

async function renameLocation(id, val){
  const l = state.locations.find(l=>l.id===id);
  if(!l) return;
  const newVal = val.trim();
  if(newVal && newVal !== l.label){
    pushUndo(`Renamed location to "${newVal}"`);
    l.label = newVal;
    queueSave();
  }
  render();
}

async function addLocation(text){
  const label = (text||'').trim();
  if(!label) return;
  pushUndo(`Added location "${label}"`);
  state.locations.push({ id: newId('loc'), label });
  render();
  queueSave();
}

function askDeleteLocation(id){
  pendingDeleteLocationId = id;
  render();
}

function cancelDeleteLocation(){
  pendingDeleteLocationId = null;
  render();
}

async function deleteLocation(id){
  if(state.locations.length <= 1) return;
  const l = state.locations.find(l=>l.id===id);
  pushUndo(`Deleted location "${l ? l.label : ''}"`);
  // Same "leave dangling references alone, let them just stop matching"
  // approach deleteCategory() takes for tasks' category ids — a category
  // still checked for this location keeps that id in its .locations array
  // untouched; it simply can never match again since state.location can
  // never equal a deleted id (reassigned below if it currently did).
  state.locations = state.locations.filter(l=>l.id!==id);
  pendingDeleteLocationId = null;
  locationEditorOpenId = null;
  if(state.location === id) state.location = state.locations[0].id;
  if(!visibleTabs().includes(activeTab)) activeTab = 'all';
  render();
  queueSave();
}

// ---------- Location bubbles ----------
// Locations show as a horizontal row of small pill buttons (like a
// compact version of .locbadge, the workspace switcher badge) rather
// than the old vertical list of full-width rename-inputs-with-a-Delete-
// button — clicking one opens a little popover (same .catpicker chrome
// as everywhere else in Settings) with the rename field and delete
// control, instead of spending a whole row per location all the time.
function locationEditorHtml(l){
  const confirming = pendingDeleteLocationId === l.id;
  const deleteControls = confirming
    ? `<span class="catwarn">Any tab checked for it just stops offering it as an option.</span>
       <button class="catdeleteconfirm" onclick="deleteLocation('${l.id}')">Yes, delete</button>
       <button class="catcancel" onclick="cancelDeleteLocation()">Cancel</button>`
    : `<button class="catdelete" ${state.locations.length<=1?'disabled title="At least one location must stay"':''} onclick="askDeleteLocation('${l.id}')">Delete</button>`;
  return `
    <div class="catpicker locbubblepicker">
      <button class="catpickerclose" onclick="toggleLocationEditor('${l.id}')" title="Close">×</button>
      <input type="text" class="catcustomhex locbubbleinput" value="${escapeHtml(l.label)}"
        onblur="renameLocation('${l.id}', this.value)"
        onkeydown="if(event.key==='Enter'){ event.preventDefault(); this.blur(); }">
      <div class="locbubbleactions">${deleteControls}</div>
    </div>`;
}

function newLocationEditorHtml(){
  return `
    <div class="catpicker locbubblepicker">
      <button class="catpickerclose" onclick="toggleLocationEditor('_new')" title="Close">×</button>
      <input type="text" class="catcustomhex locbubbleinput" placeholder="Location name" id="newLocBubbleInput"
        onkeydown="if(event.key==='Enter'){ event.preventDefault(); addLocationFromBubble(this.value); }">
    </div>`;
}

// `id` is either a real location's id or the '_new' sentinel for the "+"
// bubble's own popover. Focuses the new-location field on open, same
// reasoning focusVisibleSubadd()/#checklistQuickInput's own refocus have
// elsewhere — render() just replaced this input, so nothing has focus
// yet unless something explicitly gives it some.
function toggleLocationEditor(id){
  const wasOpen = locationEditorOpenId === id;
  closeAllSettingsPopovers();
  if(!wasOpen) locationEditorOpenId = id;
  render();
  if(!wasOpen && id === '_new'){
    const input = document.getElementById('newLocBubbleInput');
    if(input) input.focus();
  }
}

async function addLocationFromBubble(val){
  await addLocation(val);
  locationEditorOpenId = null;
  render();
}

// ---------- "Custom" tile shared by Desk & Ledger and UI Colors ----------
// Both preset pickers below need a way to set two colors at once (bg+
// paper, or primary+secondary) — rather than two separate wheel popovers
// bolted on next to the preset grid (the old design: a "Background"
// swatch and a "Ledger" swatch sitting outside the Desk & Ledger picker
// entirely), the grid itself gets one more tile, "Custom", which swaps
// the whole popover body for this two-tab wheel editor. Tabs switch which
// field the *shared* colorWheelInnerHtml()/customColorDraft is currently
// showing — dualColorDraft holds HSV for both fields at once so the one
// not currently shown doesn't lose its in-progress edit on switch.
function dualColorCustomHtml(kind){
  const isDesk = kind === 'desk';
  const fields = isDesk ? [['bg','Background'],['paper','Ledger']] : [['primary','Primary'],['secondary','Secondary']];
  const tabsHtml = `<div class="dualcolortabs">${fields.map(([f,label])=>
    `<button class="dualcolortab ${dualColorField===f?'active':''}" onclick="setDualColorField('${f}')">${label}</button>`
  ).join('')}</div>`;
  // Only UI Colors' Secondary tab gets this — "make it match" only makes
  // sense for a matched accent pair. Desk & Ledger's Background/Ledger
  // are a background-vs-surface pair, not accents, so "copy" wouldn't be
  // a thing anyone reaches for there.
  const copyPrimaryHtml = (!isDesk && dualColorField==='secondary')
    ? `<button class="dualcolorcopy" onclick="copyPrimaryToSecondary()">= Copy Primary</button>` : '';
  return `
    <div class="catpicker">
      <button class="catpickerclose" onclick="${isDesk?'toggleDeskPaperPicker':'toggleUiColorPicker'}()" title="Close">×</button>
      ${tabsHtml}
      ${copyPrimaryHtml}
      ${colorWheelInnerHtml('closeDualColorCustom()', '‹ Presets', 'confirmDualColorCustom()')}
    </div>`;
}

// Copies Primary's current draft straight into Secondary's — for anyone
// who wants both to match rather than picking two separate hues. Only
// ever called while dualColorField is already 'secondary' (see the
// button above), so writing into .secondary and repointing
// customColorDraft at it is safe without checking kind again. Cloned
// (not the same object reference) so a later drag on either tab can't
// silently move the other one along with it.
function copyPrimaryToSecondary(){
  dualColorDraft.secondary = { ...dualColorDraft.primary };
  customColorDraft = dualColorDraft.secondary;
  updateCatWheelUI();
}

// Seeds dualColorDraft from whatever's live right now — the actual bg/
// paper for Desk & Ledger (already free-form fields, no separate "custom"
// storage needed), or the existing customUi pair if there is one for UI
// Colors, falling back to Brass & Rust as a reasonable starting point
// otherwise (state.theme.customUi is null until a custom pair is
// actually confirmed once).
function openDualColorCustom(){
  if(deskPaperPickerOpen){
    dualColorDraft = { bg: hexToHsv(state.theme.bg), paper: hexToHsv(state.theme.paper) };
    dualColorField = 'bg';
  } else if(uiColorPickerOpen){
    const seed = state.theme.customUi || uiColorPreset('rust');
    dualColorDraft = { primary: hexToHsv(seed.primary), secondary: hexToHsv(seed.secondary) };
    dualColorField = 'primary';
  } else {
    return;
  }
  customColorDraft = dualColorDraft[dualColorField];
  dualColorCustomOpen = true;
  render();
}

// Shortcut for when Custom is already the active selection and you want
// to tweak it again — skips the preset grid entirely and jumps straight
// into the two-tab wheel, rather than making you reopen the grid just to
// click the one tile you're already on. Only offered (see its
// uicolorquicklink button in renderSettings()) when Custom is actually
// selected — with a named preset active there's no "back to my custom
// colors" to shortcut yet.
function openDualColorCustomDirect(kind){
  closeAllSettingsPopovers();
  if(kind === 'desk') deskPaperPickerOpen = true;
  else uiColorPickerOpen = true;
  openDualColorCustom();
}

// Drops back to the preset grid without closing the popover itself, same
// "back" idiom as closeCustomColor() for a category's own wheel.
// applyTheme() (not just render()) is what actually undoes
// updateCatWheelUI()'s live drag-preview here — state.theme itself was
// never touched, so re-deriving the CSS vars from it wipes out whatever
// throwaway {...state.theme, bg/paper/customUi:...} object the preview
// last applied.
function closeDualColorCustom(){
  dualColorCustomOpen = false;
  catWheelCancelDrag();
  applyTheme();
  render();
}

// Switching tabs saves whatever the wheel is currently showing into
// dualColorDraft before moving the wheel over to the other field's own
// draft — a plain render() (not updateCatWheelUI()) is fine here since
// this only ever runs from a click, never mid-drag.
function setDualColorField(field){
  dualColorDraft[dualColorField] = customColorDraft;
  dualColorField = field;
  customColorDraft = dualColorDraft[field];
  render();
}

// The one moment a custom Desk & Ledger or UI Colors pair actually
// applies. Reads the hex field for whichever tab is currently showing
// (same "typed hex is authoritative" rule confirmCustomColor() follows)
// and the other tab's color from its own stored draft.
async function confirmDualColorCustom(){
  const input = document.getElementById('catCustomHexInput');
  const activeHex = normalizeHexInput(input ? input.value : '')
    || hsvToHex(dualColorDraft[dualColorField].h, dualColorDraft[dualColorField].s, dualColorDraft[dualColorField].v);
  dualColorDraft[dualColorField] = hexToHsv(activeHex);
  if(deskPaperPickerOpen){
    const bg = hsvToHex(dualColorDraft.bg.h, dualColorDraft.bg.s, dualColorDraft.bg.v);
    const paper = hsvToHex(dualColorDraft.paper.h, dualColorDraft.paper.s, dualColorDraft.paper.v);
    if(bg.toLowerCase() !== state.theme.bg.toLowerCase() || paper.toLowerCase() !== state.theme.paper.toLowerCase()){
      pushUndo('Changed desk & ledger colors to "Custom"');
      state.theme.bg = bg;
      state.theme.paper = paper;
    }
  } else if(uiColorPickerOpen){
    const primary = hsvToHex(dualColorDraft.primary.h, dualColorDraft.primary.s, dualColorDraft.primary.v);
    const secondary = hsvToHex(dualColorDraft.secondary.h, dualColorDraft.secondary.s, dualColorDraft.secondary.v);
    pushUndo('Changed UI colors to "Custom"');
    state.theme.customUi = { label:'Custom', primary, primaryLight: shadeHex(primary, 0.35), secondary, secondaryLight: shadeHex(secondary, 0.35) };
    state.theme.uiPreset = 'custom';
  }
  dualColorCustomOpen = false;
  catWheelCancelDrag();
  applyTheme();
  render();
  queueSave();
}

// Desk & Ledger: a quick-start pair, same reasoning as UI Colors below —
// setDeskPaperPreset() just writes both state.theme.bg/paper directly, so
// picking one is exactly as free to keep customizing afterward as the
// "Custom" tile's own wheel is.
function deskPaperPickerHtml(){
  if(dualColorCustomOpen) return dualColorCustomHtml('desk');
  const options = DESK_PAPER_PRESETS.map(p=>`
    <button class="uipresetbtn ${deskPaperPresetActive(p)?'active':''}" onclick="setDeskPaperPreset('${p.id}')">
      <span class="uipresetswatches">
        <span class="uipresetswatch" style="background:${p.bg}"></span>
        <span class="uipresetswatch" style="background:${p.paper}"></span>
      </span>
      <span class="uipresetlabel">${escapeHtml(p.label)}</span>
    </button>`
  ).join('');
  const customTile = `
    <button class="uipresetbtn customtile ${activeDeskPaperPresetLabel()==='Custom'?'active':''}" onclick="openDualColorCustom()">
      <span class="uipresetswatches">
        <span class="uipresetswatch" style="background:${state.theme.bg}"></span>
        <span class="uipresetswatch" style="background:${state.theme.paper}"></span>
      </span>
      <span class="uipresetlabel">Custom</span>
    </button>`;
  return `
    <div class="catpicker uicolorpicker">
      <button class="catpickerclose" onclick="toggleDeskPaperPicker()" title="Close">×</button>
      <div class="catpickerlabel">Desk & Ledger</div>
      <div class="uipresetgrid">${options}${customTile}</div>
    </div>`;
}

function deskPaperPresetActive(p){
  return state.theme.bg.toLowerCase()===p.bg.toLowerCase() && state.theme.paper.toLowerCase()===p.paper.toLowerCase();
}

// Same "— <name>" trigger-label pattern as UI Colors, even though (unlike
// UI Colors) there's no stored preset id to read back — bg/paper are
// freely editable on their own, so this just checks whether they
// currently happen to match one of the presets exactly.
function activeDeskPaperPresetLabel(){
  const match = DESK_PAPER_PRESETS.find(deskPaperPresetActive);
  return match ? match.label : 'Custom';
}

function toggleDeskPaperPicker(){
  const wasOpen = deskPaperPickerOpen;
  closeAllSettingsPopovers();
  if(!wasOpen) deskPaperPickerOpen = true;
  render();
}

async function setDeskPaperPreset(id){
  const p = DESK_PAPER_PRESETS.find(p=>p.id===id) || DESK_PAPER_PRESETS[0];
  if(deskPaperPresetActive(p)) return;
  pushUndo(`Changed desk & ledger colors to "${p.label}"`);
  state.theme.bg = p.bg;
  state.theme.paper = p.paper;
  applyTheme();
  render();
  queueSave();
}

async function toggleThemeGradient(checked){
  pushUndo(checked ? 'Enabled background gradient' : 'Disabled background gradient');
  state.theme.gradient = checked;
  applyTheme();
  render();
  queueSave();
}

const TEXTURE_TOGGLE_LABEL = { grain:'textured', pages:'pages', leather:'leather journal' };
async function toggleThemeTexture(key){
  const val = !state.theme[key];
  pushUndo(`${val ? 'Enabled' : 'Disabled'} ${TEXTURE_TOGGLE_LABEL[key]} look`);
  state.theme[key] = val;
  applyTheme();
  render();
  queueSave();
}

// UI Colors: fixed presets, plus a "Custom" tile (see dualColorCustomHtml()
// above) for a freely picked Primary/Secondary pair — see UI_COLOR_PRESETS
// in 01-categories-theme.js for what Primary/Secondary each fixed preset
// touches. Same small in-place popover pattern as categoryPickerHtml()
// (reuses its .catpicker/.catpickerclose/.catpickerlabel chrome), just
// with a grid of preset swatch-pairs instead of a color row + icon row.
function uiColorPickerHtml(){
  if(dualColorCustomOpen) return dualColorCustomHtml('ui');
  const options = UI_COLOR_PRESETS.map(p=>`
    <button class="uipresetbtn ${state.theme.uiPreset===p.id?'active':''}" onclick="setUiColorPreset('${p.id}')">
      <span class="uipresetswatches">
        <span class="uipresetswatch" style="background:${p.primary}"></span>
        <span class="uipresetswatch" style="background:${p.secondary}"></span>
      </span>
      <span class="uipresetlabel">${escapeHtml(p.label)}</span>
    </button>`
  ).join('');
  const customPreview = state.theme.customUi || uiColorPreset('rust');
  const customTile = `
    <button class="uipresetbtn customtile ${state.theme.uiPreset==='custom'?'active':''}" onclick="openDualColorCustom()">
      <span class="uipresetswatches">
        <span class="uipresetswatch" style="background:${customPreview.primary}"></span>
        <span class="uipresetswatch" style="background:${customPreview.secondary}"></span>
      </span>
      <span class="uipresetlabel">Custom</span>
    </button>`;
  return `
    <div class="catpicker uicolorpicker">
      <button class="catpickerclose" onclick="toggleUiColorPicker()" title="Close">×</button>
      <div class="catpickerlabel">UI Colors</div>
      <div class="uipresetgrid">${options}${customTile}</div>
    </div>`;
}

// Pure UI navigation, like toggleCategoryPicker — no pushUndo.
function toggleUiColorPicker(){
  const wasOpen = uiColorPickerOpen;
  closeAllSettingsPopovers();
  if(!wasOpen) uiColorPickerOpen = true;
  render();
}

async function setUiColorPreset(id){
  if(state.theme.uiPreset === id) return;
  const p = uiColorPreset(id);
  pushUndo(`Changed UI colors to "${p.label}"`);
  state.theme.uiPreset = id;
  applyTheme();
  render();
  queueSave();
}

async function resetTheme(){
  pushUndo('Reset to classic colors');
  state.theme = defaultTheme();
  applyTheme();
  render();
  queueSave();
}

