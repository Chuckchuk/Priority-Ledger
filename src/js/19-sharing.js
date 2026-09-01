// ---------- Sharing: Supabase REST + RPC calls ----------
// A "share" is metadata only — shared_items rows are just { owner_id,
// item_id }, never a content snapshot — stored server-side via the
// authenticated owner's own session, same fetch idiom storage.get/set()
// use in 02-storage-state.js. See supabase/shared_items.sql for the
// table/RLS/RPC this depends on (run by hand in the Supabase dashboard;
// this repo has no tracked migrations).
//
// A checklist "list" is a plain task under the hood (see 13-checklist.js's
// own top comment) — sharing a task and sharing a checklist are the exact
// same operation here, keyed off the same task id, with `isChecklist`
// (derived server-side from the source category's type) only affecting
// how the recipient's views choose to render it.
//
// Re-opening Share on the same task reuses its existing non-revoked row
// rather than minting a new link every time, so there's only ever one
// "the" link for a given task at once, until it's explicitly revoked.
async function getOrCreateShareId(taskId){
  if(window.storage || localOnlyMode) return null;
  const s = await ensureFreshSession();
  if(!s) return null;
  const headers = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${s.access_token}` };
  const existing = await fetch(
    `${SUPABASE_URL}/rest/v1/shared_items?owner_id=eq.${s.user_id}&item_id=eq.${taskId}&revoked=eq.false&select=id&limit=1`,
    { headers }
  );
  if(existing.ok){
    const rows = await existing.json();
    if(rows.length) return rows[0].id;
  }
  const created = await fetch(`${SUPABASE_URL}/rest/v1/shared_items`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify({ owner_id: s.user_id, item_id: taskId })
  });
  if(!created.ok) return null;
  const rows2 = await created.json();
  return rows2.length ? rows2[0].id : null;
}

async function revokeShareForTask(taskId){
  if(window.storage || localOnlyMode) return false;
  const s = await ensureFreshSession();
  if(!s) return false;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/shared_items?owner_id=eq.${s.user_id}&item_id=eq.${taskId}&revoked=eq.false`,
    {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${s.access_token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ revoked: true })
    }
  );
  return res.ok;
}

// Anonymous, unauthenticated read — get_shared_item() itself is the only
// access check (it runs security definer, see supabase/shared_items.sql),
// so this never sends a viewer's own Authorization token even if they
// happen to be signed in — opening someone else's link shouldn't need to
// prove who you are just to preview it. Returns null (not an error) for
// a revoked/missing share or a since-deleted task — callers treat that
// as "no longer available."
async function fetchSharedItem(shareId){
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_shared_item`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_share_id: shareId })
  });
  if(!res.ok) throw new Error('rpc failed: ' + res.status);
  return res.json();
}

// ---------- Per-viewer offline cache ----------
// Keyed by share id in this browser's own localStorage — not part of the
// app's synced state, just a stale-while-revalidate fallback for when
// fetchSharedItem() can't reach the network. The link stays "live" (see
// fetchSharedItemWithFallback() below, which always tries the network
// first): this cache only ever fills in when a fetch actually fails, not
// merely because it's slow, and there's nothing to fall back to on a
// browser's very first, offline visit to a link — that's a real
// limitation, not a bug, see the "Sharing" section of CLAUDE.md.
function cacheSharedItem(shareId, data){
  try{ localStorage.setItem('ledger-share-cache:' + shareId, JSON.stringify({ data, cachedAt: Date.now() })); }catch(e){}
}
function getCachedSharedItem(shareId){
  try{
    const raw = localStorage.getItem('ledger-share-cache:' + shareId);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
async function fetchSharedItemWithFallback(shareId){
  try{
    const data = await fetchSharedItem(shareId);
    if(data) cacheSharedItem(shareId, data);
    return { data, stale: false };
  }catch(e){
    const cached = getCachedSharedItem(shareId);
    if(cached) return { data: cached.data, stale: true };
    throw e;
  }
}

// ---------- Share button ----------
// One button, reused by both a standard task's detail page and a
// checklist's own detail page (renderTaskDetailPage() in 08-render-core.js,
// renderChecklistDetail() in 13-checklist.js) — sharing either is the same
// operation under the hood (see the top-of-file comment above), so one
// definition keeps the two from drifting apart.
function shareButtonHtml(taskId){
  return `<button class="sharebtn flagbtn" onclick="event.stopPropagation(); openShareMenu(this,'${taskId}')" title="Share">⇪</button>`;
}

let shareMenuTaskId = null;
let shareMenuLoading = false;
let shareMenuLink = null;
let shareMenuError = null;

function closeShareMenu(){
  shareMenuTaskId = null;
  shareMenuLoading = false;
  shareMenuLink = null;
  shareMenuError = null;
  const el = document.getElementById('shareMenu');
  if(el) el.classList.remove('open');
}

function openShareMenu(el, taskId){
  shareMenuTaskId = taskId;
  shareMenuLoading = true;
  shareMenuLink = null;
  shareMenuError = null;
  positionShareMenu(el);
  renderShareMenu();
  if(window.storage || localOnlyMode){
    shareMenuLoading = false;
    renderShareMenu();
    return;
  }
  getOrCreateShareId(taskId).then(id => {
    if(shareMenuTaskId !== taskId) return; // closed, or switched tasks, before this resolved
    shareMenuLoading = false;
    if(id) shareMenuLink = `${location.origin}${location.pathname}?share=${id}`;
    else shareMenuError = "Couldn't create a link — try again.";
    renderShareMenu();
  });
}

// Anchored under the button, same trick openCategoryMoveMenu() uses
// (08-render-core.js) — placed at its bounding rect, then clamped back
// on screen a frame later once the menu's own real size is known.
function positionShareMenu(el){
  const menu = document.getElementById('shareMenu');
  const r = el.getBoundingClientRect();
  menu.style.left = r.right + 'px';
  menu.style.top = (r.bottom + 6) + 'px';
  menu.classList.add('open');
  requestAnimationFrame(() => {
    const mr = menu.getBoundingClientRect();
    if(mr.right > window.innerWidth) menu.style.left = Math.max(8, window.innerWidth - mr.width - 8) + 'px';
    if(mr.bottom > window.innerHeight) menu.style.top = Math.max(8, r.top - mr.height - 6) + 'px';
  });
}

function renderShareMenu(){
  const menu = document.getElementById('shareMenu');
  if(!menu || !shareMenuTaskId) return;
  const t = state.tasks.find(x=>x.id===shareMenuTaskId);
  if(!t){ closeShareMenu(); return; }
  const noAccount = window.storage || localOnlyMode;
  const canSystemShare = !!navigator.share;
  menu.innerHTML = `
    <div class="ctxmenu-label">Share "${escapeHtml(t.title)}"</div>
    ${noAccount ? `
      <div class="sharemenu-note">Sign in with an account to get a shareable link — export still works below.</div>
    ` : shareMenuLoading ? `
      <div class="sharemenu-note">Creating link…</div>
    ` : shareMenuError ? `
      <div class="sharemenu-note">${escapeHtml(shareMenuError)}</div>
    ` : shareMenuLink ? `
      <div class="sharemenu-linkrow">
        <input type="text" readonly value="${escapeHtml(shareMenuLink)}" onclick="this.select()">
        <button onclick="shareCopyLink()">Copy</button>
      </div>
      ${canSystemShare ? `<button onclick="shareViaSystemSheet('${t.id}')">Send to friends…</button>` : ''}
    ` : ''}
    <div class="ctxmenu-sep"></div>
    <button onclick="shareExportJson('${t.id}')">Export as file (.json)</button>
    <button onclick="shareExportText('${t.id}')">Export for Notes app (.txt)</button>
    ${(!noAccount && shareMenuLink) ? `
      <div class="ctxmenu-sep"></div>
      <button class="ctxmenu-danger" onclick="shareStopSharing('${t.id}')">Stop sharing</button>
    ` : ''}
  `;
}

function shareCopyLink(){
  if(shareMenuLink && navigator.clipboard) navigator.clipboard.writeText(shareMenuLink).catch(()=>{});
}

function shareViaSystemSheet(taskId){
  const t = state.tasks.find(x=>x.id===taskId);
  if(!t || !shareMenuLink || !navigator.share) return;
  navigator.share({ title: t.title, url: shareMenuLink }).catch(()=>{});
}

async function shareStopSharing(taskId){
  const ok = await revokeShareForTask(taskId);
  if(shareMenuTaskId !== taskId) return; // menu moved on before this resolved
  if(ok){ shareMenuLink = null; shareMenuError = 'Link removed.'; }
  renderShareMenu();
}

// ---------- File exports ----------
// Both formats strip the same recipient-irrelevant fields the live RPC
// does (see get_shared_item() in supabase/shared_items.sql) —
// timeframe/priority/urgent/plannedDates describe the *sharer's* own
// daily planning, not something to hand to someone else. Purely local:
// no network round-trip, works offline and for localOnlyMode/window.storage
// alike, unlike the link-based actions above.
function shareExportSnapshot(t){
  const cat = CATEGORIES[t.category];
  return {
    title: t.title,
    notes: t.notes || '',
    dueDate: t.dueDate || '',
    status: t.status,
    createdAt: t.createdAt,
    isChecklist: !!(cat && cat.type === 'checklist'),
    subtasks: (t.subtasks || []).map(s => ({ text: s.text, done: !!s.done }))
  };
}

function shareDownloadBlob(filename, content, mime){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function shareSafeFilename(title){
  return (title || 'shared-item').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'shared-item';
}

function shareExportJson(taskId){
  const t = state.tasks.find(x=>x.id===taskId);
  if(!t) return;
  shareDownloadBlob(shareSafeFilename(t.title) + '.json', JSON.stringify(shareExportSnapshot(t), null, 2), 'application/json');
}

// Plain text, Markdown-checklist style — there's no single cross-platform
// "notes app" format, but Apple Notes/Google Keep/Samsung Notes all take
// pasted or imported plain text, so that's the actual common denominator
// rather than targeting any one app specifically.
function shareBuildText(t){
  const snapshot = shareExportSnapshot(t);
  const lines = [snapshot.title, ''];
  if(snapshot.dueDate) lines.push(`Due: ${fmtDate(snapshot.dueDate)}`, '');
  if(snapshot.notes) lines.push(snapshot.notes, '');
  snapshot.subtasks.forEach(s => lines.push(`- [${s.done ? 'x' : ' '}] ${s.text}`));
  return lines.join('\n').trim() + '\n';
}

function shareExportText(taskId){
  const t = state.tasks.find(x=>x.id===taskId);
  if(!t) return;
  shareDownloadBlob(shareSafeFilename(t.title) + '.txt', shareBuildText(t), 'text/plain');
}

// ---------- Opening a share link ----------
// Set from the URL's ?share= param at boot (see init() in
// 20-bootstrap.js) and consumed exactly once: either here, by
// showShareStandalone() when no session is available, or by
// openShareImportDialog(), called from the end of enterApp()
// (17-auth-ui.js) once a session IS available — whichever happens first
// wins, and logging in from the standalone page's own CTA re-arms it
// (showShareAuthPrompt()) so the import dialog still fires once that
// login's enterApp() call completes.
let pendingShareId = null;

async function showShareStandalone(shareId){
  document.getElementById('authShell').style.display = 'none';
  const shell = document.getElementById('shareShell');
  shell.style.display = '';
  shell.innerHTML = `<div class="masthead"><h1>The Ledger</h1><div class="tagline">shared with you</div></div><div class="card"><div class="sharemenu-note">Loading…</div></div>`;
  let result;
  try{
    result = await fetchSharedItemWithFallback(shareId);
  }catch(e){
    renderShareStandaloneError("Can't load this — you're offline and haven't seen this link before.");
    return;
  }
  if(!result.data){
    renderShareStandaloneError('This shared item is no longer available.');
    return;
  }
  renderShareStandaloneContent(shareId, result.data, result.stale);
}

function renderShareStandaloneError(msg){
  const shell = document.getElementById('shareShell');
  shell.innerHTML = `
    <div class="masthead"><h1>The Ledger</h1><div class="tagline">shared with you</div></div>
    <div class="card">
      <div class="sharemenu-note">${escapeHtml(msg)}</div>
      <div class="footer-row"><button onclick="location.href = location.pathname">Open The Ledger</button></div>
    </div>`;
}

// Reuses the real detail pages' own visual language (the big checkbox,
// .bigtitle-style centered title, .taskmeta) rather than a generic card,
// per the explicit ask to make this read as "the detail page" and not a
// stripped-down summary — every piece here is the same class a real
// .check/.checkcircle/.subrow/.subcheck already carries, just without
// the onclick handlers (this view is read-only, there's nothing for a
// tap to do). .sharedbadge deliberately echoes .categorylabel's own
// geometry (top:14px; right:-6px, same tab-shaped pill) — the one spot
// a real detail page always shows *something* in that corner, so
// putting an unmissable "Shared" pill there instead of a category name
// is what makes this unmistakably not the viewer's own task, even
// though everything else now looks exactly like their own detail page
// would. A task with no subtasks omits the items section entirely
// (matches how little emphasis the real pages give an empty steps list)
// — only an actually-empty *checklist* gets a (subtle, .empty-styled)
// callout, since a shared list with zero items is worth noting; a
// zero-subtask task is just the ordinary common case.
function renderShareStandaloneContent(shareId, data, stale){
  const shell = document.getElementById('shareShell');
  const done = data.status === 'done';
  const items = data.subtasks || [];
  const checkHtml = data.isChecklist
    ? `<div class="checkcircle-wrap sharecheck"><div class="checkcircle ${done?'done':''}"></div></div>`
    : `<div class="checkwrap sharecheck"><div class="check ${done?'done':''}"></div></div>`;
  const itemsHtml = items.length
    ? `<div class="subwrap">${items.map(s => `
        <div class="subrow readonly">
          <div class="subcheck ${data.isChecklist ? 'circle' : ''} ${s.done ? 'done' : ''}"></div>
          <div class="subtext ${s.done ? 'done' : ''}">${escapeHtml(s.text)}</div>
        </div>`).join('')}</div>`
    : (data.isChecklist ? `<div class="empty">This list is empty.</div>` : '');
  shell.innerHTML = `
    <div class="masthead"><h1>The Ledger</h1><div class="tagline">shared with you</div></div>
    <div class="card">
      ${stale ? `<div class="sharemenu-note">Offline — showing the last version we saw.</div>` : ''}
      <div class="sharedbadge">Shared</div>
      ${checkHtml}
      <div class="sharestandalone-title ${done ? 'done' : ''}">${escapeHtml(data.title)}</div>
      ${data.dueDate ? `<div class="taskmeta checklistmeta">Due ${fmtDate(data.dueDate)}</div>` : ''}
      ${data.notes ? `<div class="sharestandalone-notes">${escapeHtml(data.notes)}</div>` : ''}
      ${itemsHtml}
      <div class="footer-row"><button onclick="showShareAuthPrompt('${shareId}')">Sign in to add this to your Ledger</button></div>
    </div>`;
}

function showShareAuthPrompt(shareId){
  pendingShareId = shareId;
  document.getElementById('shareShell').style.display = 'none';
  document.getElementById('authShell').style.display = '';
}

// ---------- Import dialog (logged-in) ----------
// A centered modal rather than an anchored popover, since this opens
// right at boot with no button to anchor to. Its category list reuses
// .ctxmenu's own styling (.ctxmenu-embedded in <style> just strips the
// fixed positioning/shadow it normally carries as a standalone popover)
// so it matches the .categorylabel "Move to" menu's look, per the
// explicit ask to keep this feeling like the same category picker rather
// than a new one-off control. Only offers categories whose type matches
// the shared item (standard vs. checklist) — a checklist's "items" don't
// map onto a standard task's due-date/priority fields or vice versa, same
// restriction standardCategoryEntries() already applies elsewhere.
let shareImportId = null;
let shareImportData = null;

async function openShareImportDialog(shareId){
  shareImportId = shareId;
  shareImportData = null;
  renderShareImportModal();
  let result;
  try{
    result = await fetchSharedItemWithFallback(shareId);
  }catch(e){
    if(shareImportId === shareId) renderShareImportModal('offline');
    return;
  }
  if(shareImportId !== shareId) return; // dismissed while loading
  if(!result.data){ renderShareImportModal('gone'); return; }
  shareImportData = result.data;
  renderShareImportModal();
}

function closeShareImportDialog(){
  shareImportId = null;
  shareImportData = null;
  const el = document.getElementById('shareImportModal');
  if(el){ el.classList.remove('open'); el.innerHTML = ''; }
  // The share id was only ever in the URL to trigger this dialog once —
  // drop it so a later reload doesn't reopen it.
  if(history.replaceState) history.replaceState(null, '', location.pathname);
}

function renderShareImportModal(status){
  const el = document.getElementById('shareImportModal');
  if(!shareImportId){ el.classList.remove('open'); el.innerHTML = ''; return; }
  el.classList.add('open');
  let body;
  if(status === 'offline'){
    body = `<div class="sharemenu-note">Can't load this shared item — you're offline.</div>`;
  } else if(status === 'gone'){
    body = `<div class="sharemenu-note">This shared item is no longer available.</div>`;
  } else if(!shareImportData){
    body = `<div class="sharemenu-note">Loading…</div>`;
  } else {
    const d = shareImportData;
    const entries = Object.entries(CATEGORIES).filter(([,v]) => (v.type === 'checklist') === !!d.isChecklist);
    const count = (d.subtasks || []).length;
    body = `
      <div class="shareimport-preview">
        <div class="sharestandalone-title">${escapeHtml(d.title)}</div>
        ${count ? `<div class="taskmeta">${count} item${count===1?'':'s'}</div>` : ''}
      </div>
      <div class="ctxmenu ctxmenu-embedded open">
        <div class="ctxmenu-label">Add to</div>
        ${entries.length ? entries.map(([k,v]) => `
          <button onclick="confirmShareImport('${k}')">${categoryDotHtml(v,'cdot')} ${escapeHtml(v.label)}</button>
        `).join('') : `<div class="ctxmenu-label">No matching tabs to add to</div>`}
      </div>`;
  }
  el.innerHTML = `
    <div class="shareimport-scrim" onclick="closeShareImportDialog()"></div>
    <div class="shareimport-card">
      <div class="shareimport-heading">Someone shared this with you</div>
      ${body}
      <div class="footer-row"><button onclick="closeShareImportDialog()">Not now</button></div>
    </div>`;
}

function confirmShareImport(categoryId){
  const d = shareImportData;
  if(!d) return;
  pushUndo(`Added shared "${d.title}"`);
  state.tasks.push({
    id: newId('task'), title: d.title, category: categoryId, status: d.status === 'done' ? 'done' : 'open',
    urgent: false, dueDate: d.dueDate || '', notes: d.notes || '',
    subtasks: (d.subtasks || []).map(s => ({ id: newId('sub'), text: s.text, done: !!s.done, dueDate: '', plannedDates: [] })),
    plannedDates: [], timeframe: '', priority: 0, completedAt: '', createdAt: todayStr()
  });
  closeShareImportDialog();
  render();
  queueSave();
}
