// The checkbox-nudge picker (appearanceSection() below) options — each
// entry's third slot is the tiny looping example shown next to its own
// label inside the open dropdown (see customSelectHtml()'s own `preview`
// slot). Labels intentionally drop the internal "radial ping" style
// names' parenthetical "(default)" — the checkmark customSelectHtml()
// already draws next to the active option says that on its own.
// 'none' gets a plain, static preview (no guide-check/guide-${v} classes
// at all) rather than running it through the same map() as the real
// animated styles below — there's no "off" animation to loop, the point
// is showing exactly what an ordinary, un-nudged checkbox looks like.
// 'sparkle' relabeled "Shimmer" (was "Sparkles") per the project owner's
// own ask — internal value unchanged, only the displayed name.
const CHECK_GUIDE_STYLE_OPTIONS = [
  ['none', 'Off — no nudge', `<span class="check" aria-hidden="true"></span>`],
  ...[
    ['radialping', 'Radial ping'],
    ['glow', 'Warm pulsing glow'],
    ['sparkle', 'Shimmer'],
    ['wiggle', 'Wiggle']
  ].map(([v, label]) => [v, label, `<span class="check guide-check guide-${v} guide-preview" aria-hidden="true"></span>`])
];

// A standard map-pin glyph (not DAYPIN_ICON_SVG — that's the "add to
// today" pin used on task rows, a different concept entirely that just
// happens to also be called a "pin") for the per-category Locations
// popover trigger (catLocPickerHtml() below) — same hand-authored 24×24
// viewBox/fill="currentColor" idiom as CATEGORY_ICON_SVG.
const LOCATION_PIN_ICON_SVG = '<svg viewBox="0 0 24 24" width="1em" height="1em" style="display:block"><path d="M12,2 C7.58,2 4,5.58 4,10 C4,16 12,22 12,22 C12,22 20,16 20,10 C20,5.58 16.42,2 12,2 Z M12,13 C10.34,13 9,11.66 9,10 C9,8.34 10.34,7 12,7 C13.66,7 15,8.34 15,10 C15,11.66 13.66,13 12,13 Z" fill="currentColor"/></svg>';

// ---------- Manage tabs ----------

function toggleSettings(){
  setSettingsOpen(!settingsOpen);
  if(settingsOpen){
    claudeView = null;
    // genericTaskDetailId is checked ahead of settingsOpen in render() (it
    // replaces the whole app body from any tab, Daily included) — without
    // clearing it here, opening Settings while that full-page task detail
    // is up would flip settingsOpen on but render() would still
    // short-circuit back to the task detail, making Settings look
    // unreachable. No other overlay needs this: everything else render()
    // branches on (selectedListId, etc.) only matters *inside* the
    // branches settingsOpen already short-circuits past, so settingsOpen
    // alone is enough to surface Settings over them.
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
      // .cattabdelete (on top of the shared .catdelete look every other
      // Delete button uses) is what lets mobile shrink JUST this one down
      // to a bare "×" matching .catpinbtn/.catlocbtn's own icon-button
      // weight, without touching the plain text Delete button
      // locationEditorHtml() below uses for a location bubble — same
      // markup either way (both a label span and an "×" span, one of
      // which display:none hides per body.mobileui-active, see <style>)
      // so there's no separate mobile-only template to keep in sync.
      : `<button class="catdelete cattabdelete" ${state.categories.length<=1?'disabled title="At least one tab must stay"':''} onclick="askDeleteCategory('${c.id}')">
          <span class="catdeletelabel">Delete</span><span class="catdeletex" aria-hidden="true">×</span>
        </button>`;
    // Which locations this category currently shows under, as small
    // pills next to its label — replaces the old always-visible row of
    // location checkboxes below every category row (see catLocPickerHtml()
    // below for where that control moved to), which was a full extra
    // line per category regardless of whether anyone was actually about
    // to change it. Reads state.locations (not just the raw id) so a
    // location the project owner has since deleted can't leave a
    // dangling badge with no label to show.
    const locBadges = state.locationEnabled ? c.locations
      .map(locId => state.locations.find(l=>l.id===locId))
      .filter(Boolean)
      .map(l => `<span class="catlocbadge">${escapeHtml(l.label)}</span>`)
      .join('') : '';
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
        <!-- Groups the label input with its own type/location badges into
             one shared underline (see .catlabelline in <style>) rather
             than the input's own border-bottom — per the explicit ask,
             badges should sit right next to the label, not get pushed
             all the way to the row's right edge the way a flex:1 input
             followed by fixed-width badge siblings otherwise does, while
             the dashed line itself still needs to visually reach the
             full row width regardless of how little of it the label +
             badges actually use. Putting the border on this wrapper
             (flex:1, so IT stretches the full width) instead of the
             input itself is what decouples those two: the input can stay
             a modest fixed-ish width with the badges hugging it, while
             the wrapper's own bottom border still spans all the way to
             wherever the pin/location buttons start. -->
        <span class="catlabelline">
          <input type="text" class="catedit" value="${escapeHtml(c.label)}"
            onblur="renameCategory('${c.id}', this.value)"
            onkeydown="if(event.key==='Enter'){ event.preventDefault(); this.blur(); }">
        </span>
        <!-- A sibling of .catlabelline now (not nested inside it) — see
             .catbadgerow in <style> for why: on mobile this needs to drop
             to its own full-width row BELOW the pin/location buttons (per
             the explicit ask), which a flex "order" trick can only pull
             off from a shared parent with those buttons, not from one
             nested a level deeper inside the label's own box. Guarded so
             an empty span (no locations, no type badge) never renders at
             all rather than leaving a stray empty underline on desktop. -->
        ${(locBadges || c.type==='checklist' || c.type==='calendar') ? `
        <span class="catbadgerow">
          ${locBadges}
          ${c.type==='checklist' ? '<span class="badge timeframe">Checklist</span>' : ''}
          ${c.type==='calendar' ? '<span class="badge timeframe">Calendar</span>' : ''}
        </span>` : ''}
        <!-- Only shown while the Stacked Tabs dev setting (01-categories-
             theme.js) is on — pinning has no effect at all otherwise, so
             surfacing the control the rest of the time would just be a
             button that does nothing. Pinned means "always its own tab,
             never folded into that type's shared stack" — see
             stackGroupsForTabs() in 06-tabs-render.js. -->
        ${(state.devSettings||{}).stackedTabsEnabled ? `
        <button class="catpinbtn ${c.pinned?'on':''}" onclick="togglePinCategory('${c.id}')" title="${c.pinned?'Unpin — fold back into its Stacked Tabs group':'Pin — always its own tab, never folded into a stack'}">${DAYPIN_ICON_SVG}</button>
        ` : ''}
        <!-- Per the explicit ask: a single trigger (right of the label,
             right of the pin button) opening a small popover to choose
             this category's locations, rather than a full-width row of
             checkboxes under every category regardless of whether anyone
             was about to touch it. Only rendered while locations are on
             at all — same "disabled IS the no-locations-configured path"
             rule the rest of the location feature already follows (see
             CLAUDE.md's own note on state.locationEnabled). -->
        ${state.locationEnabled ? `
        <span class="catlocwrap">
          <button class="catlocbtn" onclick="toggleCatLocPicker('${c.id}')" title="Choose which locations show this tab">${LOCATION_PIN_ICON_SVG}</button>
          ${openCatLocPickerId === c.id ? catLocPickerHtml(c) : ''}
        </span>` : ''}
      </div>
      ${deleteControls}
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
      <!-- stopPropagation matters here: this button sits outside .uicolorwrap
           (it's a sibling, not nested inside it), and the global "click
           outside the wheel confirms/closes it" listener (20-bootstrap.js)
           treats anything outside .uicolorwrap as an outside click. Without
           this, the very click that opens the wheel (setting
           dualColorCustomOpen=true) also bubbles to that listener, which
           immediately sees dualColorCustomOpen already true and a target
           outside .uicolorwrap, and confirms/closes it right back — the
           wheel never actually stays open. Same reasoning as the ✎/× pair
           on a saved template's own tile (customPresetTileHtml() below),
           which already stops propagation for the same kind of reason. -->
      ${state.theme.uiPreset==='custom' ? `<button class="uicolorquicklink" onclick="event.stopPropagation(); openDualColorCustomDirect('ui')" title="Edit your custom colors">✎</button>` : ''}
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
      <!-- See the matching comment on UI Colors' own quicklink above —
           same outside-.uicolorwrap/outside-click-confirm bug, same fix. -->
      ${activeDeskPaperPresetLabel()==='Custom' ? `<button class="uicolorquicklink" onclick="event.stopPropagation(); openDualColorCustomDirect('desk')" title="Edit your custom colors">✎</button>` : ''}
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
        <!-- Graduated out of Dev Settings (was pastelInkStyle there,
             gated to only when a Pastel palette was active) — a real,
             always-available Appearance choice now, right under
             Background gradient since both live in "options about the
             color section" rather than being colors themselves. See
             applyThemeObject()'s own inkFromUi comment (01-categories-
             theme.js) for the actual color math, unchanged from the
             Pastel-only version — only the gating and the Primary/
             Secondary choice are new. -->
        <div class="inkfromuirow">
          <label class="catlocchk" title="Especially good for Pastel palettes — keeps text and lines from blending into soft colors. Works with any color scheme.">
            <input type="checkbox" ${state.theme.inkFromUi?'checked':''} onchange="toggleInkFromUi(this.checked)">
            Text & lines match UI Color <span style="color:${state.theme.inkFromUiSource==='secondary' ? activeUiPreset.secondary : activeUiPreset.primary}">(Good for Pastel)</span>
          </label>
          ${state.theme.inkFromUi ? `
          <div class="inksrctabs">
            <button class="inksrctab ${state.theme.inkFromUiSource!=='secondary'?'active':''}" onclick="setInkFromUiSource('primary')">Primary</button>
            <button class="inksrctab ${state.theme.inkFromUiSource==='secondary'?'active':''}" onclick="setInkFromUiSource('secondary')">Secondary</button>
          </div>` : ''}
        </div>
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
        <span class="check${checkGuideVal==='none' ? '' : ` guide-check guide-${checkGuideVal} guide-preview`}"></span>
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
    <div class="settingsdivider"></div>
    ${stylePresetsSectionHtml()}
  `;

  const claudeSection = `
    <button class="resetthemebtn" onclick="openClaudeView('digest')">Open Claude-readable view</button>
  `;

  const trashSection = trashSectionHtml();

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
      ${settingsSectionHtml('locations', 'Locations', locationSection)}
      ${settingsSectionHtml('tabs', 'Manage Tabs', tabsSection)}
      ${settingsSectionHtml('taskFields', 'Task Fields', taskFieldsSection)}
      ${settingsSectionHtml('appearance', 'Appearance', appearanceSection)}
      ${settingsSectionHtml('trash', 'Recently Deleted', trashSection, (state.trash||[]).length ? 'trashhasitems' : '')}
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
function settingsSectionHtml(key, title, bodyHtml, extraClass){
  const collapsed = settingsCollapsedSections.has(key);
  return `
    <div class="settingssection ${extraClass||''}">
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
  persistSettingsCollapsedSections();
  render();
}

// ---------- Recently Deleted (state.trash) ----------
// purgeOldTrash() (02-storage-state.js) runs here too, not just at
// load — so a session left open past the 2-day mark still shows an
// accurate list the next time this section is actually looked at,
// rather than only catching up on the next full reload.
function trashSectionHtml(){
  purgeOldTrash();
  const trash = state.trash || [];
  if(!trash.length){
    return `<div class="trashempty">Nothing here — deleted tasks and lists stick around for about 2 days before they're gone for good.</div>`;
  }
  return `
    <div class="trashnote">Deleted tasks and lists stay here for about 2 days, then they're gone for good.</div>
    ${trash.map(entry=>{
      const t = entry.task;
      const cat = CATEGORIES[t.category] || FALLBACK_CATEGORY;
      const kind = cat.type === 'checklist' ? 'List' : 'Task';
      return `
      <div class="trashrow">
        <div class="trashrowmain">
          ${categoryDotHtml(cat, 'cdot')}
          <span class="trashtitle">${escapeHtml(t.title)}</span>
          <span class="trashmeta">${kind} · deleted ${fmtDate(entry.deletedAt.slice(0,10))}</span>
        </div>
        <div class="trashactions">
          <button onclick="restoreFromTrash('${t.id}')">Restore</button>
          <button class="trashforget" onclick="permanentlyDeleteFromTrash('${t.id}')">Delete Forever</button>
        </div>
      </div>`;
    }).join('')}
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
  // First palette color not already in use by an existing tab, rather
  // than a blind CATEGORY_PALETTE[length % length] walk — that used to
  // be collision-safe for free only because defaultCategories()'s 4 seed
  // colors happened to sit at the array's own first 4 indices; now that
  // CATEGORY_PALETTE is ordered by hue for browsing instead (see its own
  // comment) and defaultCategories() picks its 4 colors explicitly
  // rather than positionally, an index-based walk can no longer promise
  // that on its own. Falls back to the old modulo pick only once every
  // palette color is already in use somewhere.
  const usedHexes = new Set(state.categories.map(c=>c.hex.toLowerCase()));
  const hex = CATEGORY_PALETTE.find(h=>!usedHexes.has(h.toLowerCase())) || CATEGORY_PALETTE[state.categories.length % CATEGORY_PALETTE.length];
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

// Stacked Tabs' own per-category override (01-categories-theme.js's own
// stackedTabsEnabled dev setting) — a pinned category always gets its own
// tab, regardless of how many other same-.type categories exist to share
// a stack with. Meaningless with the setting off, but harmless to leave
// set on state.categories either way (stackGroupsForTabs() only ever
// reads .pinned when stackedTabsEnabled is true), so this needs no
// migration/cleanup if the setting is later turned back off.
async function togglePinCategory(id){
  const c = state.categories.find(c=>c.id===id);
  if(!c) return;
  pushUndo(c.pinned ? `Unpinned "${c.label}"` : `Pinned "${c.label}"`);
  c.pinned = !c.pinned;
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

// The whole popover this row's .catlocbtn opens — a small in-place card,
// same reasoning/chrome as categoryPickerHtml() just below (reuses
// .catpicker/.catpickerclose/.catpickerlabel directly rather than
// duplicating that look) — just a plain checkbox list instead of a
// swatch/icon grid. Replaces the old always-visible row of location
// checkboxes under every category row.
function catLocPickerHtml(c){
  const rows = state.locations.map(l => `
    <label class="catlocchk">
      <input type="checkbox" ${c.locations.includes(l.id)?'checked':''} onchange="toggleCategoryLocation('${c.id}','${l.id}', this.checked)">
      ${escapeHtml(l.label)}
    </label>`
  ).join('');
  return `
    <div class="catpicker catlocpicker">
      <button class="catpickerclose" onclick="toggleCatLocPicker('${c.id}')" title="Close">×</button>
      <div class="catpickerlabel">Locations</div>
      ${rows}
    </div>`;
}

// Pure UI navigation, same "close everything else first" reasoning as
// toggleCategoryPicker() below.
function toggleCatLocPicker(id){
  const wasOpen = openCatLocPickerId === id;
  closeAllSettingsPopovers();
  if(!wasOpen) openCatLocPickerId = id;
  render();
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
  // User-saved colors (state.customCategoryColors, see
  // saveCurrentCategoryColorToCustom() below) always render after every
  // default swatch above, never interleaved with them — per the project
  // owner's own ask, so "my own colors" reads as its own trailing group.
  // Each gets a small × overlay (customPresetTileHtml's ✎/× pair below
  // is for the *named* Desk & Ledger/UI Colors templates — a single
  // saved hex has no name to edit, so a plain single-color swatch here
  // only ever needs "remove," not "edit": editing one just means picking
  // it via the wheel again and saving the new value alongside it.
  const customSwatches = (state.customCategoryColors||[]).map((hex,i)=>`
    <span class="catswatchcustomwrap">
      <button class="catswatch ${c.hex.toLowerCase()===hex.toLowerCase()?'active':''}" style="background:${hex}" onclick="setCategoryColor('${c.id}','${hex}')" title="${hex}"></button>
      <button class="catswatchremove" onclick="event.stopPropagation(); deleteCustomCategoryColor(${i})" title="Remove from your colors">×</button>
    </span>`
  ).join('');
  // A permanent little rainbow, not a preview of the current color (that
  // would fight with .catswatch.active's own border-based "you're here"
  // signal when the current hex already matches this exactly) — its
  // .active state (nothing above can ever equal it) is what actually
  // shows "your color right now isn't one of the presets or your own
  // saved colors."
  const customIsActive = !CATEGORY_PALETTE.some(hex=>hex.toLowerCase()===c.hex.toLowerCase())
    && !(state.customCategoryColors||[]).some(hex=>hex.toLowerCase()===c.hex.toLowerCase());
  // Same CATEGORY_ICON_SVG every icon shows up through everywhere else
  // (categoryDotHtml()) — no per-glyph scale correction needed here
  // either now that every icon is a hand-authored SVG in a shared
  // viewBox rather than a raw text glyph, so the picker's own preview
  // just is what picking it actually looks like, unscaled.
  const icons = CATEGORY_ICON_ORDER.map(id => `
    <button class="caticonbtn ${(c.icon||'dot')===id?'active':''}" onclick="setCategoryIcon('${c.id}','${id}')" title="${id}" style="color:${c.hex}">${CATEGORY_ICON_SVG[id]}</button>`
  ).join('');
  return `
    <div class="catpicker">
      <button class="catpickerclose" onclick="toggleCategoryPicker('${c.id}')" title="Close">×</button>
      ${paletteTabsHtml(CATEGORY_PALETTE_SETS, state.categoryPaletteId, 'setCategoryPaletteSet')}
      <div class="catpickerlabel">Color</div>
      <div class="catswatchrow">
        ${swatches}${customSwatches}
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
  openCatLocPickerId = null;
  customColorOpen = false;
  uiColorPickerOpen = false;
  deskPaperPickerOpen = false;
  dualColorCustomOpen = false;
  editingDualColorPresetId = null;
  dualColorSaveTemplateOpen = false;
  stylePresetSaveOpen = false;
  editingStylePresetId = null;
  editStylePresetSection = null;
  seasonalPresetsBrowserOpen = false;
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
      <button class="dualcolorcopy" onclick="saveCurrentCategoryColorToCustom()">+ Save to Colors</button>
    </div>`;
}

// Saves whatever the wheel is currently showing into the user's own
// color list (state.customCategoryColors), available from every
// category's picker from then on — reads the same authoritative hex
// field confirmCustomColor() does. Purely additive: doesn't apply this
// color to the category whose wheel happens to be open, or close the
// wheel, so "save this to try on other tabs later" and "apply it to
// this tab right now" stay two separate actions you can do in either
// order (or just one of them).
function saveCurrentCategoryColorToCustom(){
  const input = document.getElementById('catCustomHexInput');
  const hex = normalizeHexInput(input ? input.value : '');
  if(!hex) return;
  if(!Array.isArray(state.customCategoryColors)) state.customCategoryColors = [];
  if(state.customCategoryColors.some(h=>h.toLowerCase()===hex.toLowerCase())) return;
  pushUndo('Saved a custom color');
  state.customCategoryColors.push(hex);
  render();
  queueSave();
}

async function deleteCustomCategoryColor(index){
  const hex = (state.customCategoryColors||[])[index];
  if(hex === undefined) return;
  pushUndo('Removed a saved color');
  state.customCategoryColors.splice(index, 1);
  render();
  queueSave();
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

// Switches which of CATEGORY_PALETTE_SETS is active (01-categories-
// theme.js) — a global choice, not per-category — and remaps every
// category currently showing one of the *old* set's colors to whichever
// color sits at that same slot index in the new set. A category not
// currently showing one of the old set's colors — a custom wheel pick,
// or one of state.customCategoryColors' own saved swatches — is left
// alone, per the project owner's own explicit rule.
//   This only works as a plain by-*value* lookup (oldColors.findIndex(...))
// specifically because a category never stores *which slot* it was
// picked from, only the literal hex — the simplest option that doesn't
// touch the category data shape at all, and every other part of the app
// that reads c.hex directly keeps working completely unchanged.
//   A version of this briefly matched by nearest actual color instead of
// by index (more robust on paper — works even if two sets are different
// lengths), but the project owner explicitly called it out as a
// regression: matching against a category's CURRENT color rather than a
// fixed slot means the result can drift a little further off on every
// hop, so switching to a palette and back doesn't reliably return you to
// where you started. By-index switching is a clean no-op on A→B→A, which
// is what matters here — the real fix for the length-mismatch bug this
// was chasing is CATEGORY_PALETTE_SETS' own now-enforced invariant that
// every set is exactly 12 colors, hand-ordered so index N is the same
// hue family everywhere (see its own comment, 01-categories-theme.js) —
// not a smarter remap. newSet.colors[idx] is still guarded here even so,
// as cheap insurance against that invariant ever slipping.
async function setCategoryPaletteSet(id){
  const newSet = CATEGORY_PALETTE_SETS[id];
  if(!newSet || state.categoryPaletteId === id) return;
  const oldColors = CATEGORY_PALETTE; // still the outgoing set at this point
  pushUndo(`Changed category colors to "${newSet.label}"`);
  state.categories.forEach(c=>{
    const idx = oldColors.findIndex(hex=>hex.toLowerCase()===c.hex.toLowerCase());
    if(idx !== -1 && newSet.colors[idx]) c.hex = newSet.colors[idx];
  });
  state.categoryPaletteId = id;
  rebuildCategoryPalette();
  rebuildCategoriesIndex();
  render();
  queueSave();
}

// Shared tab-bar markup for switching which whole preset set is active —
// used by categoryPickerHtml() (CATEGORY_PALETTE_SETS), deskPaperPickerHtml()
// (DESK_PAPER_PRESET_SETS), and uiColorPickerHtml() (UI_COLOR_PRESET_SETS).
// Renders nothing at all when there's only one set to choose from (UI
// Colors today, until a second set exists there) rather than showing a
// single tab with nothing to switch to.
function paletteTabsHtml(sets, activeId, switchFn){
  const entries = Object.values(sets);
  if(entries.length < 2) return '';
  return `<div class="palettetabs">${entries.map(set=>
    `<button class="palettetab ${activeId===set.id?'active':''}" onclick="${switchFn}('${set.id}')">${set.label}</button>`
  ).join('')}</div>`;
}

// Switches which of DESK_PAPER_PRESET_SETS is active — a global choice,
// isolated from the UI Colors and Category Colors palette switches (each
// has its own state.*PaletteId, see defaultState() in 02-storage-state.js).
// Unlike setCategoryPaletteSet(), there's only ever one "current" thing to
// re-map (state.theme.bg/paper itself, not N categories) — if it currently
// matches a preset in the outgoing set exactly, the matching same-index
// preset in the new set is applied; otherwise (a custom bg/paper, or a
// saved custom template — deskPaperPresetActive() can't match either
// against the built-in array) it's left alone, same "custom stays fixed"
// rule the category version follows.
async function setDeskPaletteSet(id){
  const newSet = DESK_PAPER_PRESET_SETS[id];
  if(!newSet || state.deskPaletteId === id) return;
  const oldPresets = DESK_PAPER_PRESETS; // still the outgoing set at this point
  const idx = oldPresets.findIndex(deskPaperPresetActive);
  pushUndo(`Changed desk & ledger palette to "${newSet.label}"`);
  state.deskPaletteId = id;
  state.theme.deskLabel = null;
  rebuildDeskPaperPresets();
  if(idx !== -1 && DESK_PAPER_PRESETS[idx]){
    state.theme.bg = DESK_PAPER_PRESETS[idx].bg;
    state.theme.paper = DESK_PAPER_PRESETS[idx].paper;
  } else if(newSet.defaultId){
    // No same-index preset to carry over (most commonly: bg/paper was a
    // custom pick) — land on this set's own designated default (see the
    // set's own defaultId comment in 01-categories-theme.js) instead of
    // silently leaving the old custom colors in place under the new
    // palette's label.
    const def = DESK_PAPER_PRESETS.find(p=>p.id===newSet.defaultId);
    if(def){ state.theme.bg = def.bg; state.theme.paper = def.paper; }
  }
  applyTheme();
  render();
  queueSave();
}

// Same idea as setDeskPaletteSet(), for UI_COLOR_PRESET_SETS — except the
// "currently active preset" is a stored id (state.theme.uiPreset), not a
// value match, so the re-map looks up that id's index in the outgoing set
// rather than comparing colors. 'custom' is never in the array, so it
// naturally falls through to the defaultId branch below.
async function setUiPaletteSet(id){
  const newSet = UI_COLOR_PRESET_SETS[id];
  if(!newSet || state.uiPaletteId === id) return;
  const oldPresets = UI_COLOR_PRESETS; // still the outgoing set at this point
  const idx = oldPresets.findIndex(p=>p.id===state.theme.uiPreset);
  pushUndo(`Changed UI colors palette to "${newSet.label}"`);
  state.uiPaletteId = id;
  rebuildUiColorPresets();
  if(idx !== -1 && UI_COLOR_PRESETS[idx]){
    state.theme.uiPreset = UI_COLOR_PRESETS[idx].id;
  } else if(newSet.defaultId && UI_COLOR_PRESETS.some(p=>p.id===newSet.defaultId)){
    // Same reasoning as setDeskPaletteSet()'s own defaultId fallback above.
    state.theme.uiPreset = newSet.defaultId;
  }
  applyTheme();
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
  // Reached this wheel via a saved template's own ✎ (editingDualColorPresetId
  // set, see openDualColorTemplateEdit() below): no name to ask for again,
  // "Update Template" just overwrites the same entry in place. Otherwise:
  // the plain "+ Save as Template" button expands an inline name form
  // (dualColorSaveTemplateOpen) — same .templatesaveform markup/styling
  // the checklist template system already uses (startSaveListAsTemplate(),
  // 13-checklist.js), reused here rather than inventing a second look for
  // the same idea. Either path both saves AND applies (see
  // confirmSaveDualColorTemplate()) — "Done" and "Done, and remember
  // this" are the same action once you're naming it.
  const saveHtml = editingDualColorPresetId
    ? `<button class="dualcolorcopy" onclick="confirmSaveDualColorTemplate('${kind}')">Update Template</button>`
    : dualColorSaveTemplateOpen
      ? `<div class="templatesaveform">
           <input type="text" id="dualColorTemplateNameInput" placeholder="Name this template" maxlength="40"
             onkeydown="if(event.key==='Enter'){ event.preventDefault(); confirmSaveDualColorTemplate('${kind}'); }">
           <div class="templatesaveformactions">
             <button class="templatecreateconfirm" onclick="confirmSaveDualColorTemplate('${kind}')">Save</button>
             <button class="templatecreatecancel" onclick="cancelSaveDualColorTemplate()">Cancel</button>
           </div>
         </div>`
      : `<button class="dualcolorcopy" onclick="startSaveDualColorTemplate()">+ Save as Template</button>`;
  return `
    <div class="catpicker">
      <button class="catpickerclose" onclick="${isDesk?'toggleDeskPaperPicker':'toggleUiColorPicker'}()" title="Close">×</button>
      ${tabsHtml}
      ${copyPrimaryHtml}
      ${colorWheelInnerHtml('closeDualColorCustom()', '‹ Presets', 'confirmDualColorCustom()')}
      ${saveHtml}
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
// storage needed), or uiColorPreset(state.theme.uiPreset) for UI Colors,
// which resolves to whatever's actually active: a named preset's own
// primary/secondary, or (if state.theme.uiPreset is already 'custom')
// state.theme.customUi itself. Per the explicit ask — pick a preset you
// like, hit Custom to nudge it, and the wheel should open already
// showing that preset's own colors, not some unrelated starting point —
// this used to fall back to a hardcoded Brass & Rust seed whenever
// customUi hadn't been set yet, which is exactly the common case (any
// account that's only ever picked named presets, never saved a custom
// one): opening Custom from, say, Sky & Rose silently dropped you onto
// Brass & Rust instead of Sky & Rose's own colors.
function openDualColorCustom(){
  if(deskPaperPickerOpen){
    dualColorDraft = { bg: hexToHsv(state.theme.bg), paper: hexToHsv(state.theme.paper) };
    dualColorField = 'bg';
  } else if(uiColorPickerOpen){
    const seed = uiColorPreset(state.theme.uiPreset);
    dualColorDraft = { primary: hexToHsv(seed.primary), secondary: hexToHsv(seed.secondary) };
    dualColorField = 'primary';
  } else {
    return;
  }
  customColorDraft = dualColorDraft[dualColorField];
  dualColorCustomOpen = true;
  // Not editing any specific saved template — a fresh, unsaved custom
  // pick. openDualColorTemplateEdit() below is the only other way into
  // this wheel, and it sets this itself right after calling here.
  editingDualColorPresetId = null;
  dualColorSaveTemplateOpen = false;
  render();
}

// Opens the wheel pre-loaded with a saved template's own colors, for
// tweaking — the ✎ on a customPresetTileHtml() tile. Reuses
// openDualColorCustom() for the actual wheel-opening (same seeding idiom,
// same render()) and then overwrites its draft with the template's own
// values instead of whatever the live theme currently has, plus marks
// which template this is so dualColorCustomHtml()'s "Update Template"
// button knows to overwrite it in place rather than asking for a new name.
function openDualColorTemplateEdit(kind, id){
  closeAllSettingsPopovers();
  if(kind === 'desk') deskPaperPickerOpen = true; else uiColorPickerOpen = true;
  const list = kind === 'desk' ? state.customDeskPresets : state.customUiPresets;
  const tpl = (list||[]).find(t=>t.id===id);
  if(!tpl) return;
  openDualColorCustom();
  dualColorDraft = kind === 'desk'
    ? { bg: hexToHsv(tpl.bg), paper: hexToHsv(tpl.paper) }
    : { primary: hexToHsv(tpl.primary), secondary: hexToHsv(tpl.secondary) };
  dualColorField = kind === 'desk' ? 'bg' : 'primary';
  customColorDraft = dualColorDraft[dualColorField];
  editingDualColorPresetId = id;
  render();
}

async function deleteDualColorTemplate(kind, id){
  const key = kind === 'desk' ? 'customDeskPresets' : 'customUiPresets';
  const list = state[key] || [];
  const idx = list.findIndex(t=>t.id===id);
  if(idx === -1) return;
  pushUndo(`Removed "${list[idx].label}" template`);
  list.splice(idx, 1);
  if(editingDualColorPresetId === id) editingDualColorPresetId = null;
  render();
  queueSave();
}

function startSaveDualColorTemplate(){
  dualColorSaveTemplateOpen = true;
  render();
  document.getElementById('dualColorTemplateNameInput')?.focus();
}
function cancelSaveDualColorTemplate(){
  dualColorSaveTemplateOpen = false;
  render();
}

// The one moment a Desk & Ledger or UI Colors *template* actually saves
// — both applies it (same commit confirmDualColorCustom() does) and
// either pushes a new named entry or, if opened via a template's own ✎
// (editingDualColorPresetId), overwrites that entry in place. Reads the
// active tab's hex from the input field first (same "typed hex wins"
// rule confirm*() follows) and syncs it into dualColorDraft before
// reading *both* fields back out of dualColorDraft, so the entry is
// always built from the freshest values regardless of which tab
// happened to be showing.
async function confirmSaveDualColorTemplate(kind){
  const hexInput = document.getElementById('catCustomHexInput');
  const activeHex = normalizeHexInput(hexInput ? hexInput.value : '') || dualColorHexOf(dualColorField);
  dualColorDraft[dualColorField] = hexToHsv(activeHex);
  const key = kind === 'desk' ? 'customDeskPresets' : 'customUiPresets';
  if(!Array.isArray(state[key])) state[key] = [];
  let entry;
  if(kind === 'desk'){
    const bg = dualColorHexOf('bg'), paper = dualColorHexOf('paper');
    entry = { bg, paper };
    state.theme.bg = bg;
    state.theme.paper = paper;
    state.theme.deskLabel = null;
  } else {
    const primary = dualColorHexOf('primary'), secondary = dualColorHexOf('secondary');
    entry = { primary, primaryLight: shadeHex(primary, 0.35), secondary, secondaryLight: shadeHex(secondary, 0.35) };
    state.theme.customUi = { label: 'Custom', ...entry };
    state.theme.uiPreset = 'custom';
  }
  if(editingDualColorPresetId){
    const existing = state[key].find(t=>t.id===editingDualColorPresetId);
    if(existing){
      pushUndo(`Updated "${existing.label}" template`);
      Object.assign(existing, entry);
      if(kind === 'ui') state.theme.customUi.label = existing.label;
    }
  } else {
    const nameInput = document.getElementById('dualColorTemplateNameInput');
    const name = (nameInput ? nameInput.value.trim() : '') || (kind==='desk' ? 'My Desk & Ledger' : 'My UI Colors');
    pushUndo(`Saved "${name}" as a template`);
    state[key].push({ id: newId('tpl'), label: name, ...entry });
    if(kind === 'ui') state.theme.customUi.label = name;
  }
  dualColorCustomOpen = false;
  editingDualColorPresetId = null;
  dualColorSaveTemplateOpen = false;
  catWheelCancelDrag();
  applyTheme();
  render();
  queueSave();
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
      state.theme.deskLabel = null;
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
// Everything INSIDE the Desk & Ledger popover except its own outer
// .catpicker/close-× chrome — split out specifically so
// editStylePresetPopoverHtml() below can embed the exact same picker
// (palette tabs, grid, "Custom" tile, and its own wheel sub-view) inside
// its own accordion row instead of forking a second copy of this markup.
// deskPaperPickerHtml() is now a thin wrapper around this for its own
// original standalone-popover use.
function deskPaperPickerBodyHtml(){
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
  const customSaved = (state.customDeskPresets||[]).map(p=>
    customPresetTileHtml('desk', p, deskPaperPresetActive(p))
  ).join('');
  // "Custom" only reads active when nothing above — built-in or one of
  // your own saved templates — already matches exactly; a saved
  // template's own tile is what lights up once you've actually named
  // and kept a color, so this one goes back to being just the "start
  // fresh" entry point instead of two tiles both claiming to be active.
  const customTile = `
    <button class="uipresetbtn customtile ${activeDeskPaperPresetLabel()==='Custom'?'active':''}" onclick="openDualColorCustom()">
      <span class="uipresetswatches">
        <span class="uipresetswatch" style="background:${state.theme.bg}"></span>
        <span class="uipresetswatch" style="background:${state.theme.paper}"></span>
      </span>
      <span class="uipresetlabel">Custom</span>
    </button>`;
  return `
    ${paletteTabsHtml(DESK_PAPER_PRESET_SETS, state.deskPaletteId, 'setDeskPaletteSet')}
    <div class="catpickerlabel">Desk & Ledger</div>
    <div class="uipresetgrid">${options}${customSaved}${customTile}</div>
  `;
}

function deskPaperPickerHtml(){
  return `
    <div class="catpicker uicolorpicker">
      <button class="catpickerclose" onclick="toggleDeskPaperPicker()" title="Close">×</button>
      ${deskPaperPickerBodyHtml()}
    </div>`;
}

function deskPaperPresetActive(p){
  return state.theme.bg.toLowerCase()===p.bg.toLowerCase() && state.theme.paper.toLowerCase()===p.paper.toLowerCase();
}

// A saved custom template's own tile (Desk & Ledger's customDeskPresets
// or UI Colors' customUiPresets) — same .uipresetbtn shape and click-to-
// apply behavior as a built-in preset, plus a small ✎ (reopen the wheel
// loaded with these colors — openDualColorTemplateEdit()) and × (remove
// — deleteDualColorTemplate()) pair in the corner that a built-in preset
// doesn't get, since those can't be edited or deleted. Both stop
// propagation so tapping either one doesn't also fire the tile's own
// apply-this-preset click underneath it.
function customPresetTileHtml(kind, tpl, isActive){
  const swatches = kind === 'desk' ? [tpl.bg, tpl.paper] : [tpl.primary, tpl.secondary];
  const applyFn = kind === 'desk' ? 'applyCustomDeskPreset' : 'applyCustomUiPreset';
  return `
    <span class="uipresettilewrap">
      <button class="uipresetbtn ${isActive?'active':''}" onclick="${applyFn}('${tpl.id}')">
        <span class="uipresetswatches">
          <span class="uipresetswatch" style="background:${swatches[0]}"></span>
          <span class="uipresetswatch" style="background:${swatches[1]}"></span>
        </span>
        <span class="uipresetlabel">${escapeHtml(tpl.label)}</span>
      </button>
      <span class="uipresettileactions">
        <button class="uipresetedit" onclick="event.stopPropagation(); openDualColorTemplateEdit('${kind}','${tpl.id}')" title="Edit template">✎</button>
        <button class="uipresetremove" onclick="event.stopPropagation(); deleteDualColorTemplate('${kind}','${tpl.id}')" title="Remove template">×</button>
      </span>
    </span>`;
}

async function applyCustomDeskPreset(id){
  const p = (state.customDeskPresets||[]).find(t=>t.id===id);
  if(!p || deskPaperPresetActive(p)) return;
  pushUndo(`Changed desk & ledger colors to "${p.label}"`);
  state.theme.bg = p.bg;
  state.theme.paper = p.paper;
  state.theme.deskLabel = null;
  applyTheme();
  render();
  queueSave();
}

// Same "— <name>" trigger-label pattern as UI Colors, even though (unlike
// UI Colors) there's no stored preset id to read back — bg/paper are
// freely editable on their own, so this just checks whether they
// currently happen to match one of the presets exactly.
// Falls back to state.theme.deskLabel (set by applyStylePresetColors()
// when the current bg/paper came from applying a Style Preset) before
// the generic 'Custom' — the equivalent of how UI Colors already shows a
// Style Preset's own name via state.theme.customUi.label instead of a
// bare "Custom". Every OTHER path that changes bg/paper away from a
// Style Preset (setDeskPaperPreset(), applyCustomDeskPreset(),
// setDeskPaletteSet(), confirmDualColorCustom()'s desk branch) clears
// deskLabel back to null, so a stale preset name can never linger once
// the pair no longer actually matches it.
function activeDeskPaperPresetLabel(){
  const match = DESK_PAPER_PRESETS.find(deskPaperPresetActive) || (state.customDeskPresets||[]).find(deskPaperPresetActive);
  if(match) return match.label;
  return state.theme.deskLabel || 'Custom';
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
  state.theme.deskLabel = null;
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

async function toggleInkFromUi(checked){
  pushUndo(checked ? 'Enabled text & lines matching UI color' : 'Disabled text & lines matching UI color');
  state.theme.inkFromUi = checked;
  applyTheme();
  render();
  queueSave();
}

async function setInkFromUiSource(source){
  if(state.theme.inkFromUiSource === source) return;
  pushUndo(`Changed text & lines color source to "${source}"`);
  state.theme.inkFromUiSource = source;
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
// Everything INSIDE the popover except the outer .catpicker/close-×
// chrome — split out so editStylePresetPopoverHtml() below can embed
// this exact same picker inside its own accordion row, same reasoning as
// deskPaperPickerBodyHtml() above.
function uiColorPickerBodyHtml(){
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
  const customSaved = (state.customUiPresets||[]).map(p=>
    customPresetTileHtml('ui', p, state.theme.uiPreset==='custom' && !!state.theme.customUi
      && state.theme.customUi.primary.toLowerCase()===p.primary.toLowerCase()
      && state.theme.customUi.secondary.toLowerCase()===p.secondary.toLowerCase())
  ).join('');
  const customPreview = state.theme.customUi || uiColorPreset('rust');
  // Only reads active when the live pair isn't literally a saved
  // template's own colors too — same "don't double-highlight" reasoning
  // as Desk & Ledger's own customTile above.
  const blankCustomActive = state.theme.uiPreset==='custom'
    && !(state.customUiPresets||[]).some(p=>p.primary.toLowerCase()===customPreview.primary.toLowerCase() && p.secondary.toLowerCase()===customPreview.secondary.toLowerCase());
  const customTile = `
    <button class="uipresetbtn customtile ${blankCustomActive?'active':''}" onclick="openDualColorCustom()">
      <span class="uipresetswatches">
        <span class="uipresetswatch" style="background:${customPreview.primary}"></span>
        <span class="uipresetswatch" style="background:${customPreview.secondary}"></span>
      </span>
      <span class="uipresetlabel">Custom</span>
    </button>`;
  return `
    ${paletteTabsHtml(UI_COLOR_PRESET_SETS, state.uiPaletteId, 'setUiPaletteSet')}
    <div class="catpickerlabel">UI Colors</div>
    <div class="uipresetgrid">${options}${customSaved}${customTile}</div>
  `;
}

function uiColorPickerHtml(){
  return `
    <div class="catpicker uicolorpicker">
      <button class="catpickerclose" onclick="toggleUiColorPicker()" title="Close">×</button>
      ${uiColorPickerBodyHtml()}
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

// A saved custom pair applies as its own clone (not a live reference to
// the template list entry) so later editing or deleting that template
// can't retroactively change whatever's already applied — same reasoning
// confirmSaveDualColorTemplate() follows for the write in the other
// direction.
async function applyCustomUiPreset(id){
  const p = (state.customUiPresets||[]).find(t=>t.id===id);
  if(!p) return;
  if(state.theme.uiPreset==='custom' && state.theme.customUi
    && state.theme.customUi.primary.toLowerCase()===p.primary.toLowerCase()
    && state.theme.customUi.secondary.toLowerCase()===p.secondary.toLowerCase()) return;
  pushUndo(`Changed UI colors to "${p.label}"`);
  state.theme.customUi = { ...p };
  state.theme.uiPreset = 'custom';
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

// ---------- Style Presets (Settings → Appearance) ----------
// A whole saved look — every Appearance field plus each existing
// category's own color/icon — as one named entry, rather than the
// piecemeal customDeskPresets/customUiPresets a "Custom" tile already
// saves one pair at a time. See defaultStylePresets() in
// 02-storage-state.js for the seeded "Halloween" example and stylePresets'
// own comment in defaultState() there for the full field list.
function stylePresetsSectionHtml(){
  const tiles = (state.stylePresets||[]).map(sp => stylePresetTileHtml(sp)).join('');
  // Unlike openDualColorTemplateEdit()'s single color pair, there's no
  // dedicated "whole theme" editor to open here — Appearance and Manage
  // Tabs (both already live, ordinary Settings UI) ARE that editor, so
  // ✎ (editStylePreset()) applies the preset and opens a compact
  // accordion popover ANCHORED TO ITS OWN TILE (editStylePresetPopoverHtml(),
  // rendered inside stylePresetTileHtml() itself) with Name/Desk &
  // Ledger/UI Colors rows, each embedding the real pickers rather than a
  // forked copy — see that function's own comment. This saveForm here is
  // ONLY for creating a brand-new preset from scratch
  // ("+ Save current look as a preset"); renaming/re-coloring an
  // EXISTING one happens entirely inside its own tile's popover now.
  const saveForm = stylePresetSaveOpen
    ? `<div class="templatesaveform">
         <input type="text" id="stylePresetNameInput" placeholder="Name this preset" maxlength="40"
           onkeydown="if(event.key==='Enter'){ event.preventDefault(); confirmSaveStylePreset(); }">
         <div class="templatesaveformactions">
           <button class="templatecreateconfirm" onclick="confirmSaveStylePreset()">Save</button>
           <button class="templatecreatecancel" onclick="cancelSaveStylePreset()">Cancel</button>
         </div>
       </div>`
    // The trigger button itself lives in the always-visible action row
    // below (outside the collapsible tile grid) — this branch only ever
    // renders the actual inline name form once that's active.
    : '';
  // A saved account's own stylePresets never auto-updates once seeded
  // (see cloneStylePresetBlueprint()'s own comment in 02-storage-state.js)
  // — this popover (same .catpicker chrome as Desk & Ledger/UI Colors'
  // own pickers, anchored to .stylepresetbrowsewrap below) is the
  // deliberate, opt-in way to pull a fresh copy of a built-in preset in
  // later, e.g. after that preset's own colors have been improved since
  // your account was created, without silently overwriting whatever
  // you've already customized it into.
  //
  // The tile grid itself is the only part that collapses (settingsSectionHtml()
  // — same nested-collapsible chrome as the top-level Settings sections,
  // 'stylePresets' starts collapsed by default, see settingsCollapsedSections
  // in 02-storage-state.js) — "Save current look"/"Browse Seasonal
  // Presets" stay outside it and always visible, since collapsing the
  // section shouldn't also hide the one button most people actually want
  // to find. Browse comes first (left) and Save current second (right),
  // with Save current's border deliberately heavier — it's the action
  // that's easy to miss/most worth surfacing, Browse is more of a
  // secondary "go discover something" action.
  return `
    ${settingsSectionHtml('stylePresets', 'Style Presets', `<div class="stylepresetgrid">${tiles}</div>`)}
    <div class="stylepresetactionsrow">
      <div class="stylepresetbrowsewrap">
        <button class="resetthemebtn" onclick="toggleSeasonalPresetsBrowser()">☆ Browse Seasonal Presets</button>
        ${seasonalPresetsBrowserOpen ? seasonalPresetsBrowserHtml() : ''}
      </div>
      <button class="resetthemebtn stylepresetsavebtn" onclick="startSaveStylePreset()">+ Save current look as a preset</button>
    </div>
    ${saveForm}
  `;
}

// Same shape as customPresetTileHtml() (a swatch + label + action
// buttons, click-to-apply) plus a row of small category-color dots — per
// the explicit ask to work some of the actual category colors into a
// preset's own visual, not just its bg/paper pair, since those are as
// much a part of "the look" this feature saves as the desk/ledger colors
// are. The bg/paper circle also carries its own small primary/secondary
// UI-color circle layered over its bottom-right corner (.stylepresetuiswatch)
// rather than a third swatch in a row, since a preset's "look" reads as
// desk & ledger with the UI accent colors sitting on top of it, not three
// independent, unrelated colors — and a border around the bg/paper circle
// itself, since without one a preset whose ledger color happens to match
// this very panel's own background would otherwise visually vanish into
// it (the app's own current paper color IS one of the panel's own
// background colors, so a preset built around a similar paper tone has
// nothing else to visually separate it).
// sp.fromCatalogId (set by cloneStylePresetBlueprint(), 02-storage-state.js)
// marks a preset that started as a copy of a built-in catalog entry — it
// gets a small ★ badge before its name; sp.edited (flipped true by
// confirmSaveStylePreset()'s rename branch and updateStylePresetLook())
// appends "*" after the name once it's actually been changed since that
// copy, while the ★ itself stays regardless — it's still "started from a
// Theme Preset," just no longer identical to it. .uipresettilewrap is
// the position:relative anchor editStylePresetPopoverHtml()'s own
// position:absolute needs, same idiom as .uicolorwrap/.stylepresetbrowsewrap
// elsewhere — it's the shared wrap class every preset-tile shape already
// uses, so this is a global CSS addition, not a Style-Preset-only one.
function stylePresetTileHtml(sp){
  const dots = (sp.categories||[]).slice(0, 6).map(c=>
    `<span class="stylepresetdot" style="background:${c.hex}"></span>`
  ).join('');
  const ui = stylePresetUiColors(sp);
  const badge = sp.fromCatalogId ? `<span class="stylepreseticon" title="Started from a built-in Theme Preset" aria-hidden="true">★</span>` : '';
  const labelText = escapeHtml(sp.label) + (sp.fromCatalogId && sp.edited ? ' *' : '');
  return `
    <span class="uipresettilewrap">
      <button class="uipresetbtn stylepresetbtn"
        onmouseenter="previewSavedStylePreset('${sp.id}', true)" onmouseleave="previewSavedStylePreset('${sp.id}', false)"
        onclick="applyStylePreset('${sp.id}')">
        <span class="stylepresetswatches">
          <span class="uipresetswatches">
            <span class="uipresetswatch" style="background:${sp.theme.bg}"></span>
            <span class="uipresetswatch" style="background:${sp.theme.paper}"></span>
          </span>
          <span class="stylepresetuiswatch">
            <span class="stylepresetuiswatchhalf" style="background:${ui.primary}"></span>
            <span class="stylepresetuiswatchhalf" style="background:${ui.secondary}"></span>
          </span>
        </span>
        <span class="stylepresetdots">${dots}</span>
        ${badge}<span class="uipresetlabel">${labelText}</span>
      </button>
      <span class="uipresettileactions">
        <button class="uipresetedit" onclick="event.stopPropagation(); editStylePreset('${sp.id}')" title="Edit this preset">✎</button>
        <button class="uipresetremove" onclick="event.stopPropagation(); deleteStylePreset('${sp.id}')" title="Remove preset">×</button>
      </span>
      ${editingStylePresetId===sp.id ? editStylePresetPopoverHtml(sp) : ''}
    </span>`;
}

// The "Browse Seasonal Presets" popover trigger — same toggle idiom as
// toggleDeskPaperPicker()/toggleCategoryPicker(), routed through
// closeAllSettingsPopovers() so it can't be open alongside any other
// Settings popover. Resets the season filter to 'all' on every fresh
// open (never opens mid-filter from a previous visit), and stops any
// in-flight preview crossfade + snaps back to the real committed look on
// close — a safety net for the rare case a popover close doesn't go
// through an actual mouseleave on the tile that started the preview
// (e.g. Esc while still hovering).
function toggleSeasonalPresetsBrowser(){
  const wasOpen = seasonalPresetsBrowserOpen;
  closeAllSettingsPopovers();
  if(!wasOpen){
    seasonalPresetsBrowserOpen = true;
    seasonalPresetsFilterSeason = 'all';
  } else {
    stopStylePreviewTween();
    applyTheme();
    renderTabs();
  }
  render();
}

// Season filter tabs (seasonalPresetSeasonTabsHtml() below) — same
// toggle-and-render idiom as every other Settings filter/tab switch.
function setSeasonalPresetsFilterSeason(season){
  seasonalPresetsFilterSeason = season;
  render();
}

const SEASONAL_PRESET_SEASON_TABS = [
  { id:'all', label:'All' },
  { id:'fall', label:'Fall' },
  { id:'winter', label:'Winter' },
  { id:'spring', label:'Spring' },
  { id:'summer', label:'Summer' }
];

// Reuses .palettetabs/.palettetab (paletteTabsHtml()'s own classes) —
// same small n-way switch visual as the Desk & Ledger/UI Colors/
// Category Colors picker's own palette-SET tabs, just filtering
// SEASONAL_STYLE_PRESETS by its `season` field instead of switching
// which array is active.
function seasonalPresetSeasonTabsHtml(){
  return `<div class="palettetabs">${SEASONAL_PRESET_SEASON_TABS.map(s=>
    `<button class="palettetab ${seasonalPresetsFilterSeason===s.id?'active':''}" onclick="setSeasonalPresetsFilterSeason('${s.id}')">${s.label}</button>`
  ).join('')}</div>`;
}

// The popover itself — same .catpicker chrome (close ×, label, a plain
// vertical .uipresetgrid of tiles) as deskPaperPickerHtml()/
// uiColorPickerOpen's own picker, plus the season filter tabs above the
// label (same position paletteTabsHtml() sits at in those other
// pickers), filtering which of the fixed SEASONAL_STYLE_PRESETS catalog
// entries show.
function seasonalPresetsBrowserHtml(){
  const filtered = seasonalPresetsFilterSeason === 'all'
    ? SEASONAL_STYLE_PRESETS
    : SEASONAL_STYLE_PRESETS.filter(p => p.season === seasonalPresetsFilterSeason);
  const tiles = filtered.map(p => seasonalPresetTileHtml(p)).join('');
  return `
    <div class="catpicker seasonalpresetpicker">
      <button class="catpickerclose" onclick="toggleSeasonalPresetsBrowser()" title="Close">×</button>
      ${seasonalPresetSeasonTabsHtml()}
      <div class="catpickerlabel">Seasonal Presets</div>
      <div class="uipresetgrid">${tiles}</div>
    </div>`;
}

// A catalog entry's own tile — same swatch/badge/dots visual as
// stylePresetTileHtml() (via the shared .stylepresetbtn class, so it
// gets the same border/layered-badge treatment). Two different click
// targets, two different actions: clicking the tile itself both adds
// AND immediately switches to it (addAndApplySeasonalStylePreset()) —
// the common case, "I want this look" — while the trailing "+" is the
// narrower "just add a copy to my list without touching my current
// look" escape hatch (addSeasonalStylePreset()), for browsing/collecting
// without committing. Hovering either previews the whole thing live
// (previewSeasonalPreset()) so you can see it before picking either.
function seasonalPresetTileHtml(p){
  const dots = (p.categories||[]).slice(0, 6).map(c=>
    `<span class="stylepresetdot" style="background:${c.hex}"></span>`
  ).join('');
  const ui = stylePresetUiColors(p);
  return `
    <button class="uipresetbtn stylepresetbtn"
      onmouseenter="previewSeasonalPreset('${p.catalogId}', true)" onmouseleave="previewSeasonalPreset('${p.catalogId}', false)"
      onclick="addAndApplySeasonalStylePreset('${p.catalogId}')" title="Add to my presets and switch to it">
      <span class="stylepresetswatches">
        <span class="uipresetswatches">
          <span class="uipresetswatch" style="background:${p.theme.bg}"></span>
          <span class="uipresetswatch" style="background:${p.theme.paper}"></span>
        </span>
        <span class="stylepresetuiswatch">
          <span class="stylepresetuiswatchhalf" style="background:${ui.primary}"></span>
          <span class="stylepresetuiswatchhalf" style="background:${ui.secondary}"></span>
        </span>
      </span>
      <span class="stylepresetdots">${dots}</span>
      <span class="uipresetlabel">${escapeHtml(p.label)}</span>
      <span class="seasonaladdicon" aria-hidden="true" onclick="event.stopPropagation(); addSeasonalStylePreset('${p.catalogId}')" title="Add to my presets without switching to it">+</span>
    </button>`;
}

// ---------- Seasonal preset hover-preview crossfade ----------
// An earlier version snapped straight to the preview colors on
// mouseenter/mouseleave — reported as too rapid, and disorienting-to-
// the-point-of-a-seizure-risk on a light<->dark preset pair (Frost's
// pale ledger right next to Halloween's near-black one, say). This
// tweens between colors instead. Plain JS (rAF + linear RGB
// interpolation, no color-space conversion) rather than a CSS
// `transition` on every element that consumes --desk/--card-bg/
// --primary/--secondary/--tabhex/etc. throughout the whole app: those
// custom properties are read by a LOT of unrelated selectors app-wide
// (every button, badge, tab...), so a global transition would also
// animate every OTHER theme change everywhere, not just this preview —
// a much bigger blast radius than what was actually asked for, and one
// that could make ordinary (already-instant, already-expected) clicks
// elsewhere feel sluggish. The actual runtime cost of the tween itself
// is negligible either way: a handful of hex<->RGB conversions per
// frame for ~280ms (well under 20 frames total) — nothing a browser
// notices.
const STYLE_PREVIEW_TWEEN_MS = 280;
let stylePreviewTweenFrame = null;

// Cheap, good-enough-for-a-quick-crossfade RGB lerp — no perceptual
// color-space conversion, just channel-by-channel.
function lerpHexColor(a, b, t){
  const pa = parseInt(a.replace('#',''), 16), pb = parseInt(b.replace('#',''), 16);
  const ar=(pa>>16)&0xFF, ag=(pa>>8)&0xFF, ab=pa&0xFF;
  const br=(pb>>16)&0xFF, bg=(pb>>8)&0xFF, bb=pb&0xFF;
  const r = Math.round(ar + (br-ar)*t), g = Math.round(ag + (bg-ag)*t), b2 = Math.round(ab + (bb-ab)*t);
  return '#' + (0x1000000 + clamp255(r)*0x10000 + clamp255(g)*0x100 + clamp255(b2)).toString(16).slice(1);
}

// Stops whatever crossfade is currently mid-flight — called before
// starting a new one (re-hovering a different tile before the first
// fade finished) and before any instant/committed theme change, so a
// stray rAF loop can never keep fighting a render() that already
// happened for an unrelated reason.
function stopStylePreviewTween(){
  if(stylePreviewTweenFrame){ cancelAnimationFrame(stylePreviewTweenFrame); stylePreviewTweenFrame = null; }
}

// Sets one live tab's own preview colors — the exact same --tabhex/
// --tabtext/--tabedge formula renderTabs() itself uses (06-tabs-render.js),
// so the tween's final frame lands pixel-identical to a real render.
function setTabPreviewHex(catId, hex){
  const el = document.querySelector(`.tab[data-key="${catId}"]`);
  if(!el) return;
  el.style.setProperty('--tabhex', hex);
  el.style.setProperty('--tabtext', relLuminance(hex) > 0.5 ? '#2A2318' : '#F1EAD9');
  el.style.setProperty('--tabedge', shadeHex(hex, -0.25));
}

// Crossfades toward a style-preset-shaped object (`{theme, uiPaletteId,
// categories}` — either a SEASONAL_STYLE_PRESETS entry, or, for
// reverting, a throwaway object built straight from live state, see
// previewSeasonalPreset() below) FROM whatever's actually on screen
// right now — read straight off the live CSS vars/tab elements rather
// than a remembered "before" value. That's what lets re-hovering a
// different tile mid-crossfade, or un-hovering before one finishes,
// continue smoothly from wherever the fade visually already is instead
// of snapping back to some earlier state first. The target is applied
// EXACTLY (not an interpolated approximation) on the final frame, so the
// end state always matches a plain, un-animated apply bit-for-bit.
function stylePreviewTweenTo(sp){
  stopStylePreviewTween();
  const targetTheme = { ...sp.theme, customUi: sp.theme.customUi ? { ...sp.theme.customUi } : null };
  const targetUi = stylePresetUiColors(sp);
  const targetCategoryHexes = {};
  state.categories.forEach((c, i) => {
    const saved = sp.categories[i];
    if(saved) targetCategoryHexes[c.id] = saved.hex;
  });

  const cs = getComputedStyle(document.documentElement);
  const fromBg = cs.getPropertyValue('--desk').trim() || targetTheme.bg;
  const fromPaper = cs.getPropertyValue('--card-bg').trim() || targetTheme.paper;
  const fromPrimary = cs.getPropertyValue('--primary').trim() || targetUi.primary;
  const fromSecondary = cs.getPropertyValue('--secondary').trim() || targetUi.secondary;
  const fromTabs = {};
  Object.keys(targetCategoryHexes).forEach(key => {
    const el = document.querySelector(`.tab[data-key="${key}"]`);
    fromTabs[key] = (el && el.style.getPropertyValue('--tabhex')) || targetCategoryHexes[key];
  });

  const start = performance.now();
  function frame(now){
    const t = Math.min(1, (now - start) / STYLE_PREVIEW_TWEEN_MS);
    if(t >= 1){
      applyThemeObject(targetTheme);
      Object.keys(targetCategoryHexes).forEach(key => setTabPreviewHex(key, targetCategoryHexes[key]));
      stylePreviewTweenFrame = null;
      return;
    }
    // easeOutCubic — fast start, gentle settle, reads as a "slide" into
    // place rather than a flat linear cross-dissolve.
    const eased = 1 - Math.pow(1 - t, 3);
    const primary = lerpHexColor(fromPrimary, targetUi.primary, eased);
    const secondary = lerpHexColor(fromSecondary, targetUi.secondary, eased);
    applyThemeObject({
      ...targetTheme,
      bg: lerpHexColor(fromBg, targetTheme.bg, eased),
      paper: lerpHexColor(fromPaper, targetTheme.paper, eased),
      uiPreset: 'custom',
      customUi: { label:'', primary, primaryLight: shadeHex(primary, 0.35), secondary, secondaryLight: shadeHex(secondary, 0.35) }
    });
    Object.keys(targetCategoryHexes).forEach(key => {
      setTabPreviewHex(key, lerpHexColor(fromTabs[key], targetCategoryHexes[key], eased));
    });
    stylePreviewTweenFrame = requestAnimationFrame(frame);
  }
  stylePreviewTweenFrame = requestAnimationFrame(frame);
}

// Shared un-hover target for both preview flavors below — crossfades
// back to whatever's REALLY committed in state right now (not a cached
// "before" snapshot), shaped the same way a real Style Preset is so it
// can go through the same tween function.
function revertStylePreviewTween(){
  stylePreviewTweenTo({ theme: state.theme, uiPaletteId: state.uiPaletteId, categories: state.categories.map(c => ({ hex: c.hex, icon: c.icon })) });
}

// Hover preview for a seasonal catalog tile — never touches state, same
// "draft, not committed" idiom updateCatWheelUI()'s own live drag-
// preview already uses for a single color pair, just crossfaded instead
// of snapped (see stylePreviewTweenTo() above).
function previewSeasonalPreset(catalogId, on){
  if(!on){ revertStylePreviewTween(); return; }
  const p = SEASONAL_STYLE_PRESETS.find(s=>s.catalogId===catalogId);
  if(!p) return;
  stylePreviewTweenTo(p);
}

// Same hover-preview crossfade, for a tile in your OWN saved Style
// Presets list (stylePresetTileHtml()) rather than the seasonal catalog
// — an existing stylePresets entry is already preset-shaped
// ({theme, uiPaletteId, categories}), so it goes through the exact same
// stylePreviewTweenTo() with no extra work.
function previewSavedStylePreset(presetId, on){
  if(!on){ revertStylePreviewTween(); return; }
  const sp = (state.stylePresets||[]).find(s=>s.id===presetId);
  if(!sp) return;
  stylePreviewTweenTo(sp);
}

// The actual mutation shared by applyStylePreset() (an existing saved
// preset) and addAndApplySeasonalStylePreset() (a catalog entry, right
// after copying it in) — split out so the "copy + apply" path can do
// both under a single pushUndo snapshot instead of two, and so neither
// caller duplicates this logic. Deliberately doesn't call applyTheme()/
// render()/queueSave() itself — every caller owns that part, since
// addAndApplySeasonalStylePreset() also needs to close the browser
// popover in between.
//
// Sets the theme fields wholesale and the three palette-SET pointers (so
// the right tab shows active next time each picker opens), then matches
// each stored category color/icon back onto today's live categories BY
// POSITION — entry 0 → state.categories[0], etc. — not by id. A preset
// can carry more stored colors than this account has categories (the
// extras are simply unused) or fewer (the categories past the end are
// left completely untouched); neither is a bug, it's what lets one
// preset's color set usefully cover accounts with very different
// numbers of tabs.
function applyStylePresetColors(sp){
  // deskLabel: sp.label is the Desk & Ledger equivalent of what
  // customUi.label already does for UI Colors — activeDeskPaperPresetLabel()
  // (09-settings.js) shows it instead of a bare "Custom" whenever this
  // preset's bg/paper doesn't happen to exactly match a real named
  // preset. Every other bg/paper-changing path clears it back to null.
  state.theme = { ...sp.theme, customUi: sp.theme.customUi ? { ...sp.theme.customUi } : null, deskLabel: sp.label };
  state.deskPaletteId = sp.deskPaletteId;
  state.uiPaletteId = sp.uiPaletteId;
  state.categoryPaletteId = sp.categoryPaletteId;
  rebuildDeskPaperPresets();
  rebuildUiColorPresets();
  rebuildCategoryPalette();
  // c.icon is only ever touched when `saved.icon` is actually present —
  // a plain `{ hex }` entry (every current Style Preset) leaves whatever
  // icon a category already has completely alone. See SEASONAL_STYLE_PRESETS'
  // own comment in 02-storage-state.js for why.
  (sp.categories||[]).forEach((saved, i) => {
    const c = state.categories[i];
    if(!c || !saved) return;
    c.hex = saved.hex;
    if(saved.icon) c.icon = saved.icon;
  });
  rebuildCategoriesIndex();
}

// Copies a catalog entry into this account's own stylePresets WITHOUT
// switching to it — always a fresh newId('style') (never the catalog's
// own catalogId), so adding the same seasonal preset more than once, or
// on top of one you've since deleted, never collides with anything.
// stopStylePreviewTween()+applyTheme()+renderTabs() up front undoes
// whatever the hover preview left on screen — this path never touches
// state.theme/categories itself, so without that the document-level
// --desk/--primary/etc CSS vars (not part of what render() below
// rebuilds) would otherwise stay stuck on the previewed colors even
// though nothing about the live look actually changed.
async function addSeasonalStylePreset(catalogId){
  const p = SEASONAL_STYLE_PRESETS.find(s=>s.catalogId===catalogId);
  if(!p) return;
  stopStylePreviewTween();
  applyTheme();
  renderTabs();
  pushUndo(`Added "${p.label}" seasonal preset`);
  if(!Array.isArray(state.stylePresets)) state.stylePresets = [];
  state.stylePresets.push(cloneStylePresetBlueprint(p, newId('style')));
  seasonalPresetsBrowserOpen = false;
  render();
  queueSave();
}

// The tile's own main click — copies a catalog entry in AND switches to
// it in one motion, one undo step (pushUndo covers both the new
// stylePresets entry and the applied colors, so undoing this reverts
// both at once rather than needing two undos). stopStylePreviewTween()
// up front cancels any in-flight crossfade immediately, so a queued rAF
// frame can't paint one more stale interpolated color after the real
// applyTheme() below already committed the final one.
async function addAndApplySeasonalStylePreset(catalogId){
  const p = SEASONAL_STYLE_PRESETS.find(s=>s.catalogId===catalogId);
  if(!p) return;
  stopStylePreviewTween();
  pushUndo(`Switched to "${p.label}" seasonal preset`);
  if(!Array.isArray(state.stylePresets)) state.stylePresets = [];
  const copy = cloneStylePresetBlueprint(p, newId('style'));
  state.stylePresets.push(copy);
  applyStylePresetColors(copy);
  seasonalPresetsBrowserOpen = false;
  applyTheme();
  render();
  queueSave();
}

// Resolves a style preset's own primary/secondary UI colors WITHOUT
// touching live state — sp.uiPaletteId names which UI_COLOR_PRESET_SETS
// entry its own uiPreset id has to be looked up in, since that set isn't
// necessarily the one currently active (state.uiPaletteId /
// UI_COLOR_PRESETS may point somewhere else entirely while just
// rendering this tile). Used by stylePresetTileHtml() and
// seasonalPresetTileHtml() for the layered swatch preview only.
function stylePresetUiColors(sp){
  if(sp.theme.uiPreset === 'custom' && sp.theme.customUi) return sp.theme.customUi;
  const set = UI_COLOR_PRESET_SETS[sp.uiPaletteId] || UI_COLOR_PRESET_SETS.classic;
  return set.presets.find(p=>p.id===sp.theme.uiPreset) || set.presets[0];
}

// Everything a Style Preset actually captures, read fresh off live state
// — Appearance's own fields (theme, plus which named Desk & Ledger/UI
// Colors/Category Colors SET was active, so a preset also restores which
// picker tab shows as current) and each existing category's own color/
// icon, in display order. Deliberately NOT categories' labels/types/
// locations/order/ids — this is a color/appearance snapshot, not a
// tab-structure one, so applying a preset can never rename, retype, or
// reorder anyone's actual tabs, and dropping id in favor of array
// position is what lets applyStylePreset() below recolor "however many
// categories this account actually has" instead of only ones matching a
// fixed set of ids from whenever the preset was saved.
function buildStylePresetSnapshot(name){
  return {
    label: name,
    theme: {
      bg: state.theme.bg, paper: state.theme.paper,
      gradient: state.theme.gradient, grain: state.theme.grain, pages: state.theme.pages, leather: state.theme.leather,
      uiPreset: state.theme.uiPreset,
      customUi: state.theme.customUi ? { ...state.theme.customUi } : null,
      inkFromUi: state.theme.inkFromUi, inkFromUiSource: state.theme.inkFromUiSource
    },
    deskPaletteId: state.deskPaletteId,
    uiPaletteId: state.uiPaletteId,
    categoryPaletteId: state.categoryPaletteId,
    // hex only, never icon — a Style Preset is "just the colors," see
    // SEASONAL_STYLE_PRESETS' own comment in 02-storage-state.js. This
    // applies even to a preset built from YOUR OWN current look, not
    // just the catalog ones — saving a preset should never risk baking
    // in "and also change my category icons back" as a side effect.
    categories: state.categories.map(c => ({ hex: c.hex }))
  };
}

// Applies a saved preset's whole look via applyStylePresetColors() (the
// theme fields wholesale, the three palette-SET pointers so the right
// tab shows active next time each picker opens, then each stored
// category color/icon matched back onto today's live categories BY
// POSITION — entry 0 → state.categories[0], etc., not by id — see that
// function's own comment for why). This is the only place an EXISTING
// saved Style Preset is meant to touch the live look — editStylePreset()/
// deleteStylePreset() deliberately do NOT call this, see their own
// comments. addAndApplySeasonalStylePreset() (a catalog entry, right
// after copying it in) is the other caller of applyStylePresetColors()
// itself, for the same reason under a single combined pushUndo.
async function applyStylePreset(id){
  const sp = (state.stylePresets||[]).find(s=>s.id===id);
  if(!sp) return;
  stopStylePreviewTween();
  pushUndo(`Applied "${sp.label}" style preset`);
  applyStylePresetColors(sp);
  applyTheme();
  render();
  queueSave();
}

async function deleteStylePreset(id){
  const list = state.stylePresets || [];
  const idx = list.findIndex(s=>s.id===id);
  if(idx === -1) return;
  pushUndo(`Removed "${list[idx].label}" style preset`);
  list.splice(idx, 1);
  if(editingStylePresetId === id){ editingStylePresetId = null; stylePresetSaveOpen = false; }
  render();
  queueSave();
}

function startSaveStylePreset(){
  stylePresetSaveOpen = true;
  editingStylePresetId = null;
  render();
  document.getElementById('stylePresetNameInput')?.focus();
}
function cancelSaveStylePreset(){
  stylePresetSaveOpen = false;
  editingStylePresetId = null;
  render();
}

// The ✎ on a saved preset's own tile — opens the compact edit popover
// (editStylePresetPopoverHtml() below) AND applies the preset live. An
// earlier version of this button did a plain rename ONLY and deliberately
// didn't apply anything, specifically because back then ✎ had no other
// job — clicking it to just rename silently swapping your whole live
// look read as it "doing something it shouldn't." Now that ✎ opens a
// real "edit everything about this preset" menu (Name/Desk & Ledger/UI
// Colors, each reusing the real pickers, plus a "Save changes" action),
// applying the preset first is the CORRECT, expected behavior again —
// you're not just renaming, you're about to look at and change its
// actual colors, so seeing them applied is the whole point.
async function editStylePreset(id){
  const sp = (state.stylePresets||[]).find(s=>s.id===id);
  if(!sp) return;
  closeAllSettingsPopovers();
  editingStylePresetId = id;
  editStylePresetSection = null;
  await applyStylePreset(id);
}

// Accordion toggle for the edit popover's own rows — expanding one
// collapses whichever else was open, per the explicit ask.
function toggleEditStylePresetSection(section){
  editStylePresetSection = (editStylePresetSection === section) ? null : section;
  render();
}

// Closes the edit popover without touching the live theme — any tweaks
// made via its embedded Desk & Ledger/UI Colors rows already committed
// to state.theme directly (the same real pickers, same real commit
// functions), exactly as if you'd made them from Appearance's own
// controls; this just stops looking at them through this popover. The
// live look stays changed either way — closing without hitting "Save
// changes to preset" just means the SAVED preset itself doesn't pick up
// those tweaks, same as walking away from the old ⟳ flow without
// pressing it.
function closeEditStylePreset(){
  editingStylePresetId = null;
  editStylePresetSection = null;
  render();
}

// The compact edit popover itself — a small accordion of Name/Desk &
// Ledger/UI Colors rows, each embedding the EXACT same picker markup
// used everywhere else in Settings (deskPaperPickerBodyHtml()/
// uiColorPickerBodyHtml(), including their own "Custom" tile and wheel
// sub-view) rather than a second, forked copy of that UI. Only one row's
// body renders at a time (editStylePresetSection), per the explicit
// "collapsible fields that open one at a time" ask. There's
// deliberately no "Category Colors" row — nothing like "edit every
// category's color from one central place" exists elsewhere to reuse
// (a category's own color still comes from its own dot in Manage Tabs),
// and building a brand-new picker for that here would be exactly the
// kind of forked, one-off UI this whole approach was chosen to avoid.
function editStylePresetPopoverHtml(sp){
  const nameOpen = editStylePresetSection === 'name';
  const deskOpen = editStylePresetSection === 'desk';
  const uiOpen = editStylePresetSection === 'ui';
  const nameBody = nameOpen ? `
    <div class="editpresetsectionbody">
      <div class="templatesaveform">
        <input type="text" id="stylePresetNameInput" placeholder="Name this preset" maxlength="40" value="${escapeHtml(sp.label)}"
          onkeydown="if(event.key==='Enter'){ event.preventDefault(); confirmSaveStylePreset(); }">
        <div class="templatesaveformactions">
          <button class="templatecreateconfirm" onclick="confirmSaveStylePreset()">Rename</button>
        </div>
      </div>
    </div>` : '';
  const deskBody = deskOpen ? `<div class="editpresetsectionbody">${deskPaperPickerBodyHtml()}</div>` : '';
  const uiBody = uiOpen ? `<div class="editpresetsectionbody">${uiColorPickerBodyHtml()}</div>` : '';
  return `
    <div class="catpicker editpresetpicker">
      <button class="catpickerclose" onclick="closeEditStylePreset()" title="Close">×</button>
      <div class="catpickerlabel">Edit "${escapeHtml(sp.label)}"</div>
      <div class="editpresetsection">
        <button class="editpresetsectionhead ${nameOpen?'active':''}" onclick="toggleEditStylePresetSection('name')">Name</button>
        ${nameBody}
      </div>
      <div class="editpresetsection">
        <button class="editpresetsectionhead ${deskOpen?'active':''}" onclick="toggleEditStylePresetSection('desk')">Desk &amp; Ledger — ${escapeHtml(activeDeskPaperPresetLabel())}</button>
        ${deskBody}
      </div>
      <div class="editpresetsection">
        <button class="editpresetsectionhead ${uiOpen?'active':''}" onclick="toggleEditStylePresetSection('ui')">UI Colors — ${escapeHtml(uiColorPreset(state.theme.uiPreset).label)}</button>
        ${uiBody}
      </div>
      <button class="templatecreateconfirm editpresetsavebtn" onclick="updateStylePresetLook('${sp.id}'); closeEditStylePreset();">Save changes to preset</button>
    </div>`;
}

// The "Save changes to preset" action at the bottom of the edit popover
// — re-snapshots whatever the live app looks like right now into this
// preset in place, keeping its id and label. Reached via ✎ → tweak Desk
// & Ledger/UI Colors inline (or Manage Tabs' own per-category color
// dots, still outside this popover — there's no "edit every category's
// color" picker to reuse here yet) → this action folds those tweaks back
// into the same saved preset. Also callable directly (kept as its own
// function rather than folded into closeEditStylePreset()) in case a
// future entry point wants "update the look" without going through the
// popover at all.
async function updateStylePresetLook(id){
  const sp = (state.stylePresets||[]).find(s=>s.id===id);
  if(!sp) return;
  pushUndo(`Updated "${sp.label}" style preset`);
  Object.assign(sp, buildStylePresetSnapshot(sp.label));
  // buildStylePresetSnapshot() doesn't return id/fromCatalogId/edited, so
  // this Object.assign leaves those alone — sp.fromCatalogId survives
  // untouched (still "started from a Theme Preset"), and this is exactly
  // the "actually changed since that copy" moment stylePresetTileHtml()'s
  // "*" is meant to flag.
  sp.edited = true;
  render();
  queueSave();
}

// The one moment a Style Preset's NAME actually saves (a brand-new
// preset instead goes through its `else` branch, capturing a fresh
// snapshot since there's nothing saved yet to preserve) — editing an
// existing one here only ever renames it in place, it never touches its
// stored colors; see updateStylePresetLook() for that.
async function confirmSaveStylePreset(){
  const nameInput = document.getElementById('stylePresetNameInput');
  const name = (nameInput ? nameInput.value.trim() : '') || 'Untitled';
  if(editingStylePresetId){
    const existing = (state.stylePresets||[]).find(s=>s.id===editingStylePresetId);
    if(existing){
      pushUndo(`Renamed "${existing.label}" style preset to "${name}"`);
      existing.label = name;
      // A rename still counts as "edited" for the "*" badge, even though
      // it didn't touch colors — see stylePresetTileHtml()'s own comment.
      existing.edited = true;
    }
    // Collapses the Name row only, NOT the whole edit popover — unlike
    // the "create a brand-new preset" branch below, this happens inside
    // editStylePresetPopoverHtml()'s own accordion, which may still have
    // Desk & Ledger/UI Colors left to tweak in the same sitting.
    editStylePresetSection = null;
  } else {
    pushUndo(`Saved "${name}" style preset`);
    const snapshot = buildStylePresetSnapshot(name);
    if(!Array.isArray(state.stylePresets)) state.stylePresets = [];
    state.stylePresets.push({ ...snapshot, id: newId('style') });
    stylePresetSaveOpen = false;
  }
  render();
  queueSave();
}

