// ---------- Manage tabs ----------

function toggleSettings(){
  settingsOpen = !settingsOpen;
  if(settingsOpen) claudeView = null;
  pendingDeleteCategoryId = null;
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
      <span class="cdot" style="background:${c.hex}"></span>
      <input type="text" class="catedit" value="${escapeHtml(c.label)}"
        onblur="renameCategory('${c.id}', this.value)"
        onkeydown="if(event.key==='Enter'){ event.preventDefault(); this.blur(); }">
      ${c.type==='checklist' ? '<span class="badge timeframe">Checklist</span>' : ''}
      ${deleteControls}
      ${locChecks}
    </div>`;
  }).join('');

  const locationSection = `
    <div class="settingslabel">Locations</div>
    <label class="catlocchk" style="margin-bottom:10px;">
      <input type="checkbox" ${state.locationEnabled?'checked':''} onchange="toggleLocationFeature(this.checked)">
      Use multiple locations
    </label>
    ${state.locationEnabled ? state.locations.map(l=>`
    <div class="catrow">
      <input type="text" class="catedit" value="${escapeHtml(l.label)}"
        onblur="renameLocation('${l.id}', this.value)"
        onkeydown="if(event.key==='Enter'){ event.preventDefault(); this.blur(); }">
    </div>`).join('') : ''}
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

  // EXPERIMENTAL — see defaultDevSettings() above. Kept in its own
  // <details> specifically so it's obscured by default rather than
  // sitting in the main settings flow.
  const dev = state.devSettings || defaultDevSettings();
  const devSection = `
    <details class="devsettings">
      <summary>Dev Settings</summary>
      <label class="catlocchk" style="margin-bottom:10px;">
        <input type="checkbox" ${dev.tagSeam?'checked':''} onchange="toggleDevSetting('tagSeam', this.checked)">
        Page tag: seam shadow (tip reads as receding behind the label)
      </label>
      <label class="catlocchk" style="margin-bottom:10px;">
        <input type="checkbox" ${dev.tagOutline?'checked':''} onchange="toggleDevSetting('tagOutline', this.checked)">
        Page tag: full outline
      </label>
      <label class="catlocchk" style="margin-bottom:10px;">
        Pending-items tag style
        <select onchange="setDevPendingTagStyle(this.value)">
          <option value="default" ${dev.pendingTagStyle==='default'?'selected':''}>Default (small page tag)</option>
          <option value="jetout" ${dev.pendingTagStyle==='jetout'?'selected':''}>Redder, jets out further</option>
          <option value="sidebar" ${dev.pendingTagStyle==='sidebar'?'selected':''}>Vertical sidebar strip</option>
        </select>
      </label>
      <label class="catlocchk" style="margin-bottom:10px;">
        <input type="checkbox" ${dev.showListDates?'checked':''} onchange="toggleDevSetting('showListDates', this.checked)">
        Show a faded created-date next to each checklist's title
      </label>
      <label class="catlocchk" style="margin-bottom:10px;">
        <input type="checkbox" ${dev.dayTreeCatBubble?'checked':''} onchange="toggleDevSetting('dayTreeCatBubble', this.checked)">
        "Add to day" tree: pill-shaped category bubbles (like the tab bar)
      </label>
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
  state.categories.push({ id: newId('cat'), label, hex, locations: state.locations.map(l=>l.id), type: type==='checklist' ? 'checklist' : 'standard' });
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

