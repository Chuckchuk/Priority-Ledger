// ---------- Manage tabs ----------

function toggleSettings(){
  settingsOpen = !settingsOpen;
  if(settingsOpen) claudeView = null;
  pendingDeleteCategoryId = null;
  pendingDeleteLocationId = null;
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
      ${deleteControls}
      ${locChecks}
    </div>`;
  }).join('');

  const locationRows = state.locations.map(l=>{
    const confirmingLoc = pendingDeleteLocationId === l.id;
    const locDeleteControls = confirmingLoc
      ? `<span class="catwarn">Any tab checked for it just stops offering it as an option.</span>
         <button class="catdeleteconfirm" onclick="deleteLocation('${l.id}')">Yes, delete</button>
         <button class="catcancel" onclick="cancelDeleteLocation()">Cancel</button>`
      : `<button class="catdelete" ${state.locations.length<=1?'disabled title="At least one location must stay"':''} onclick="askDeleteLocation('${l.id}')">Delete</button>`;
    return `
    <div class="catrow">
      <input type="text" class="catedit" value="${escapeHtml(l.label)}"
        onblur="renameLocation('${l.id}', this.value)"
        onkeydown="if(event.key==='Enter'){ event.preventDefault(); this.blur(); }">
      ${locDeleteControls}
    </div>`;
  }).join('');

  const locationSection = `
    <div class="settingslabel">Locations</div>
    <label class="catlocchk" style="margin-bottom:10px;">
      <input type="checkbox" ${state.locationEnabled?'checked':''} onchange="toggleLocationFeature(this.checked)">
      Use multiple locations
    </label>
    ${state.locationEnabled ? `
      ${locationRows}
      <div class="catrow">
        <input type="text" class="catedit" placeholder="+ add a location, enter to save" id="newLocNameInput"
          onkeydown="if(event.key==='Enter'){ addLocation(this.value); this.value=''; }">
      </div>
    ` : ''}
  `;

  const taskFieldsSection = `
    <div class="settingslabel">Task Fields</div>
    <label class="catlocchk" style="margin-bottom:10px;">
      <input type="checkbox" ${state.advancedTaskFields?'checked':''} onchange="toggleAdvancedTaskFields(this.checked)">
      Show timeframe & priority (uncheck for the simpler flag-only view)
    </label>
  `;

  const activeUiPreset = uiColorPreset(state.theme.uiPreset);
  const uiColorSection = `
    <div class="uicolorrow">
      <span class="uicolorwrap">
        <button class="uicolorswatch" onclick="toggleUiColorPicker()" title="Change UI colors">
          <span class="uicolorhalf" style="background:${activeUiPreset.primary}"></span>
          <span class="uicolorhalf" style="background:${activeUiPreset.secondary}"></span>
        </button>
        ${uiColorPickerOpen ? uiColorPickerHtml() : ''}
      </span>
      <span class="uicolorlabel">UI Colors — ${escapeHtml(activeUiPreset.label)}</span>
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
      <span class="uicolorlabel">Desk & Ledger Presets</span>
    </div>
  `;

  const appearanceSection = `
    <div class="settingslabel">Appearance</div>
    <div class="themerow">
      ${themeSwatchHtml('bg', 'Background')}
      ${themeSwatchHtml('paper', 'Ledger')}
    </div>
    ${deskPaperSection}
    ${uiColorSection}
    <label class="catlocchk" style="margin-bottom:10px;">
      <input type="checkbox" ${state.theme.gradient?'checked':''} onchange="toggleThemeGradient(this.checked)">
      Background gradient
    </label>
    <div class="texturerow">
      <button class="texturebtn ${state.theme.grain?'active':''}" onclick="toggleThemeTexture('grain')">Textured</button>
      <button class="texturebtn ${state.theme.pages?'active':''}" onclick="toggleThemeTexture('pages')">Pages</button>
      <button class="texturebtn ${state.theme.leather?'active':''}" onclick="toggleThemeTexture('leather')">Leather</button>
    </div>
    <button class="resetthemebtn" onclick="resetTheme()">Reset to classic colors</button>
  `;

  const claudeSection = `
    <div class="settingslabel">Claude Access</div>
    <button class="resetthemebtn" onclick="openClaudeView('digest')">Open Claude-readable view</button>
  `;

  // EXPERIMENTAL — see defaultDevSettings() in 02-storage-state.js. Back
  // in a <details> here (collapsed by default, native browser disclosure)
  // AND in the floating side panel (see renderDevPanel() in
  // 01-categories-theme.js) — the side panel is the one that lets a
  // toggle be checked against the live page underneath it, but it only
  // exists once "Show the floating dev panel" (the last field below) is
  // turned on, and this section is the only place that checkbox lives, so
  // it always needs to stay reachable from here even when the panel
  // itself is off. devSettingsFieldsHtml() is the single shared source
  // for both hosts' fields.
  const devSection = `
    <details class="devsettings">
      <summary>Dev Settings</summary>
      ${devSettingsFieldsHtml('catlocchk devsettingsrow', 'devpanelfield', 'devpanelcaption', 'devpanelselect')}
    </details>
  `;

  // "Calendar" only shows as an addable type when the matching dev
  // setting is on (see defaultDevSettings() in 02-storage-state.js) — the
  // normal way to reach a calendar view is the "Calendar" tag on Daily's
  // own day list (openDailyCalendar(), see 18-calendar.js), not a tab of
  // its own.
  const calendarTabTypeOption = state.devSettings.calendarTabTypeEnabled ? '<option value="calendar">Calendar</option>' : '';
  const newCatTypeTooltip = "Standard tabs track due dates, priority, and timeframe. Checklist tabs are simple named lists of items — good for groceries, packing, shopping, anything you just need to check off."
    + (state.devSettings.calendarTabTypeEnabled ? " Calendar tabs show a month grid of your Daily pages, with at-a-glance counts of what's due and done each day." : '');

  el.innerHTML = `
    <div class="stackedpage">
      ${pageTagHtml('toggleSettings()', 'Done')}
      <div class="daylistlabel">Manage Tabs</div>
      ${rows}
      <div class="catrow">
        <input type="text" class="catedit" placeholder="+ add a new tab, enter to save" id="newCatNameInput"
          onkeydown="if(event.key==='Enter'){ addCategory(this.value, document.getElementById('newCatTypeSelect').value); this.value=''; }">
        <select class="catselect" id="newCatTypeSelect" title="${newCatTypeTooltip}">
          <option value="standard">Standard</option>
          <option value="checklist">Checklist</option>
          ${calendarTabTypeOption}
        </select>
      </div>
      ${locationSection}
      ${taskFieldsSection}
      ${appearanceSection}
      ${claudeSection}
      ${devSection}
    </div>
  `;
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
  themeColorWheelKey = null;
  catWheelCancelDrag();
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
  const svX = s * CAT_WHEEL_HOLE, svY = (1-v) * CAT_WHEEL_HOLE;
  const backHtml = backOnclick ? `<button class="catwheelback" onclick="${backOnclick}">${backLabel}</button>` : '';
  return `
    ${backHtml}
    <div class="catwheelring" id="catWheelRing" onpointerdown="catWheelPointerDown(event,'hue')">
      <div class="catwheelknob" id="catWheelHueKnob" style="left:${hueX}px; top:${hueY}px;"></div>
      <div class="catwheelsquarewrap">
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
// the app's normal render().
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
    svKnob.style.left = (s*CAT_WHEEL_HOLE) + 'px';
    svKnob.style.top = ((1-v)*CAT_WHEEL_HOLE) + 'px';
  }
  const preview = document.getElementById('catCustomPreview');
  if(preview) preview.style.background = hex;
  const hexInput = document.getElementById('catCustomHexInput');
  // Never stomp on the field while it's actively focused (typing) — only
  // a drag on the ring/square should push a value into it live.
  if(hexInput && document.activeElement !== hexInput) hexInput.value = hex;
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
  if(state.location === id) state.location = state.locations[0].id;
  if(!visibleTabs().includes(activeTab)) activeTab = 'all';
  render();
  queueSave();
}

async function updateThemeColor(key, val){
  // Case-insensitive: the wheel always emits uppercase hex (hsvToHex()),
  // but a color saved from the old native <input type=color> (always
  // lowercase) or typed by hand could be either — without this, clicking
  // a Desk & Ledger preset that already matches the current color by eye
  // could still register as a "change" and push a no-op undo entry.
  if(state.theme[key].toLowerCase() === val.toLowerCase()) return;
  pushUndo(key === 'bg' ? 'Changed background color' : 'Changed ledger color');
  state.theme[key] = val;
  applyTheme();
  render();
  queueSave();
}

// The Background/Ledger swatches (Settings → Appearance) — same wheel as
// a category's custom color, just a separate popover instance (its own
// themeColorWheelKey state) since it isn't nested inside a category row.
function themeSwatchHtml(key, label){
  return `
    <span class="themeswatchwrap">
      <button class="themeswatchbtn" onclick="toggleThemeColorWheel('${key}')" title="Change ${label.toLowerCase()} color" style="background:${state.theme[key]}"></button>
      ${themeColorWheelKey === key ? themeColorWheelHtml(key) : ''}
      <span class="themeswatchlabel">${label}</span>
    </span>`;
}

function themeColorWheelHtml(key){
  return `
    <div class="catpicker">
      <button class="catpickerclose" onclick="toggleThemeColorWheel('${key}')" title="Close">×</button>
      ${colorWheelInnerHtml(null, '', `confirmThemeColorWheel('${key}')`)}
    </div>`;
}

function toggleThemeColorWheel(key){
  const wasOpen = themeColorWheelKey === key;
  closeAllSettingsPopovers();
  if(!wasOpen){
    customColorDraft = hexToHsv(state.theme[key]);
    themeColorWheelKey = key;
  }
  render();
}

// Unlike confirmCustomColor() (which drops back to the swatch/icon row),
// there's no intermediate view here to return to — Done just closes the
// wheel entirely, same as the "×" would.
async function confirmThemeColorWheel(key){
  const input = document.getElementById('catCustomHexInput');
  const hex = normalizeHexInput(input ? input.value : '');
  if(!hex) return;
  themeColorWheelKey = null;
  catWheelCancelDrag();
  await updateThemeColor(key, hex);
  render();
}

// Desk & Ledger: presets only, same reasoning and popover pattern as UI
// Colors below — a quick-start pair, not a replacement for the
// individual Background/Ledger wheels, which stay just as free-form
// afterward (setDeskPaperPreset() just writes both state.theme.bg/paper
// directly, the same fields those wheels edit — no separate "which
// preset is this" field to keep in sync).
function deskPaperPickerHtml(){
  const options = DESK_PAPER_PRESETS.map(p=>`
    <button class="uipresetbtn ${deskPaperPresetActive(p)?'active':''}" onclick="setDeskPaperPreset('${p.id}')">
      <span class="uipresetswatches">
        <span class="uipresetswatch" style="background:${p.bg}"></span>
        <span class="uipresetswatch" style="background:${p.paper}"></span>
      </span>
      <span class="uipresetlabel">${escapeHtml(p.label)}</span>
    </button>`
  ).join('');
  return `
    <div class="catpicker uicolorpicker">
      <button class="catpickerclose" onclick="toggleDeskPaperPicker()" title="Close">×</button>
      <div class="catpickerlabel">Desk & Ledger</div>
      <div class="uipresetgrid">${options}</div>
    </div>`;
}

function deskPaperPresetActive(p){
  return state.theme.bg.toLowerCase()===p.bg.toLowerCase() && state.theme.paper.toLowerCase()===p.paper.toLowerCase();
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

// UI Colors: presets only (no custom picker here, unlike a category's
// color/icon) — see UI_COLOR_PRESETS in 01-categories-theme.js for what
// Primary/Secondary each preset actually touches. Same small in-place
// popover pattern as categoryPickerHtml() (reuses its .catpicker/
// .catpickerclose/.catpickerlabel chrome), just with a grid of preset
// swatch-pairs instead of a color row + icon row.
function uiColorPickerHtml(){
  const options = UI_COLOR_PRESETS.map(p=>`
    <button class="uipresetbtn ${state.theme.uiPreset===p.id?'active':''}" onclick="setUiColorPreset('${p.id}')">
      <span class="uipresetswatches">
        <span class="uipresetswatch" style="background:${p.primary}"></span>
        <span class="uipresetswatch" style="background:${p.secondary}"></span>
      </span>
      <span class="uipresetlabel">${escapeHtml(p.label)}</span>
    </button>`
  ).join('');
  return `
    <div class="catpicker uicolorpicker">
      <button class="catpickerclose" onclick="toggleUiColorPicker()" title="Close">×</button>
      <div class="catpickerlabel">UI Colors</div>
      <div class="uipresetgrid">${options}</div>
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

