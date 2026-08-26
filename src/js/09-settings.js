// ---------- Manage tabs ----------

function toggleSettings(){
  settingsOpen = !settingsOpen;
  if(settingsOpen) claudeView = null;
  pendingDeleteCategoryId = null;
  pendingDeleteLocationId = null;
  openCategoryPickerId = null;
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

  const appearanceSection = `
    <div class="settingslabel">Appearance</div>
    <div class="themerow">
      <label class="themeswatch">
        <input type="color" value="${state.theme.bg}" onchange="updateThemeColor('bg', this.value)">
        Background
      </label>
      <label class="themeswatch">
        <input type="color" value="${state.theme.paper}" onchange="updateThemeColor('paper', this.value)">
        Ledger
      </label>
    </div>
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

  el.innerHTML = `
    <div class="stackedpage">
      ${pageTagHtml('toggleSettings()', 'Done')}
      <div class="daylistlabel">Manage Tabs</div>
      ${rows}
      <div class="catrow">
        <input type="text" class="catedit" placeholder="+ add a new tab, enter to save" id="newCatNameInput"
          onkeydown="if(event.key==='Enter'){ addCategory(this.value, document.getElementById('newCatTypeSelect').value); this.value=''; }">
        <select class="catselect" id="newCatTypeSelect" title="Standard tabs track due dates, priority, and timeframe. Checklist tabs are simple named lists of items — good for groceries, packing, shopping, anything you just need to check off.">
          <option value="standard">Standard</option>
          <option value="checklist">Checklist</option>
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
  state.categories.push({ id: newId('cat'), label, hex, locations: [state.location], type: type==='checklist' ? 'checklist' : 'standard' });
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
  const swatches = CATEGORY_PALETTE.map(hex=>`
    <button class="catswatch ${c.hex.toLowerCase()===hex.toLowerCase()?'active':''}" style="background:${hex}" onclick="setCategoryColor('${c.id}','${hex}')" title="${hex}"></button>`
  ).join('');
  const icons = CATEGORY_ICON_ORDER.map(id=>`
    <button class="caticonbtn ${(c.icon||'dot')===id?'active':''}" onclick="setCategoryIcon('${c.id}','${id}')" title="${id}" style="color:${c.hex}">${CATEGORY_ICON_GLYPHS[id]}</button>`
  ).join('');
  return `
    <div class="catpicker">
      <button class="catpickerclose" onclick="toggleCategoryPicker('${c.id}')" title="Close">×</button>
      <div class="catpickerlabel">Color</div>
      <div class="catswatchrow">
        ${swatches}
        <label class="catswatch catswatchcustom" style="background:${c.hex}" title="Custom color">
          <input type="color" value="${c.hex}" onchange="setCategoryColor('${c.id}', this.value)">
        </label>
      </div>
      <div class="catpickerlabel">Icon</div>
      <div class="caticonrow">${icons}</div>
    </div>`;
}

// Pure UI navigation, like askDeleteCategory — no pushUndo, opening/
// closing the popover isn't a content change. Reset alongside
// pendingDeleteCategoryId everywhere that already resets that (see
// toggleSettings(), afterStateRestore(), openClaudeView(), signOut()).
function toggleCategoryPicker(id){
  openCategoryPickerId = openCategoryPickerId === id ? null : id;
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
  if(state.theme[key] === val) return;
  pushUndo(key === 'bg' ? 'Changed background color' : 'Changed ledger color');
  state.theme[key] = val;
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

async function resetTheme(){
  pushUndo('Reset to classic colors');
  state.theme = defaultTheme();
  applyTheme();
  render();
  queueSave();
}

