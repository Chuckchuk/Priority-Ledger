// ---------- Cross-device refresh ----------
// There's no realtime subscription and no per-field merge here — storage
// is "replace the whole blob," for saves and for this alike. So this only
// ever pulls in a server copy when there's nothing local it could
// clobber: no unsaved edit in flight, and no field actively focused
// (replacing state re-renders the whole task list via innerHTML, which
// would yank an in-progress, not-yet-blurred keystroke out from under
// someone mid-edit). It's deliberately a simple last-write-wins model,
// same as saving already is — not real conflict resolution. If two
// devices edit within the same window before either refreshes, whichever
// saves last wins, same as it always has.
//
// Bandwidth: most ticks cost a few bytes, not the whole state blob — see
// checkServerUpdatedAt() below, which is exactly why this can afford to
// run every 45s instead of sitting on a longer interval: the overwhelming
// majority of ticks are a single-column REST read that finds nothing new
// and does nothing else. The visibility-change listener already covers
// "I just switched back to this tab" immediately regardless of how long
// the base interval is; this just bounds how stale a *backgrounded* tab
// (one device left open while you edit on another) can silently get.
const REFRESH_INTERVAL_MS = 45000;
let refreshTimer = null;
let refreshInFlight = false;
let appEntered = false; // guards the visibilitychange listener from firing before/after a real login

// Asks for just the updated_at column (a handful of bytes) instead of the
// full data blob, so a poll that finds nothing new — the overwhelmingly
// common case — costs almost nothing. Only the Supabase path has a
// server-side updated_at to compare against; callers already gate out
// window.storage/localOnlyMode before reaching here.
async function checkServerUpdatedAt(){
  const s = await ensureFreshSession();
  if(!s){ forceReauth(); throw new Error('session expired'); }
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/ledger_state?user_id=eq.${s.user_id}&select=updated_at`,
    { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${s.access_token}` } }
  );
  if(!res.ok) throw new Error('supabase updated_at check failed: ' + res.status);
  const rows = await res.json();
  return rows.length ? rows[0].updated_at : null;
}

async function refreshFromServer(manual){
  if(!appEntered || localOnlyMode || window.storage) return; // nothing external to pull from
  if(unsavedChanges || refreshInFlight) return; // don't clobber an in-flight local edit
  if(!manual && document.hidden) return; // only poll while the tab is actually visible
  const active = document.activeElement;
  if(active && ['INPUT','TEXTAREA','SELECT'].includes(active.tagName)) return; // don't interrupt an in-progress edit
  refreshInFlight = true;
  const btn = document.getElementById('refreshBtn');
  if(btn) btn.disabled = true;
  try{
    const serverUpdatedAt = await checkServerUpdatedAt();
    if(serverUpdatedAt !== null && serverUpdatedAt === lastKnownUpdatedAt){
      if(manual) showUndoStatus('Already up to date');
      return;
    }
    // Either something changed, or there's nothing to compare against yet
    // (e.g. no row saved so far) — worth the full fetch either way.
    // storage.get() also refreshes lastKnownUpdatedAt as a side effect.
    const res = await storage.get('tracker-state', false);
    if(res && res.value){
      const incoming = res.value;
      if(incoming !== JSON.stringify(state)){
        state = JSON.parse(incoming);
        normalizeState();
        afterStateRestore();
        render();
        showUndoStatus('Refreshed with new changes');
      } else if(manual){
        showUndoStatus('Already up to date');
      }
    }
  }catch(e){
    console.error('Background refresh failed', e);
  }finally{
    refreshInFlight = false;
    if(btn) btn.disabled = false;
  }
}

function startAutoRefresh(){
  stopAutoRefresh();
  if(!localOnlyMode && !window.storage) refreshTimer = setInterval(() => refreshFromServer(false), REFRESH_INTERVAL_MS);
}
function stopAutoRefresh(){
  if(refreshTimer){ clearInterval(refreshTimer); refreshTimer = null; }
}
// Catches "I switched back to this tab" immediately rather than waiting
// for the next interval tick — appEntered/other guards inside
// refreshFromServer() make this a safe no-op before login or on the auth
// screen.
document.addEventListener('visibilitychange', () => {
  if(!document.hidden) refreshFromServer(false);
});

// Resolves after `ms`, or immediately if the browser reports connectivity
// coming back first — so a save that's mid-backoff after a network blip
// doesn't sit out the rest of a long delay once the connection is actually
// usable again.
function delayOrOnline(ms){
  return new Promise(resolve => {
    const timer = setTimeout(finish, ms);
    function finish(){
      clearTimeout(timer);
      window.removeEventListener('online', finish);
      resolve();
    }
    window.addEventListener('online', finish);
  });
}

// Capped exponential backoff — retries get less frequent but never stop
// entirely while offline, since giving up after N tries would mean the
// edit just silently never reaches Supabase.
const SAVE_RETRY_DELAYS_MS = [1000, 2000, 5000, 10000, 20000, 30000];

let unsavedChanges = false;

// Retries a failed save with backoff instead of dropping the edit after
// one attempt — a single network blip used to mean the change only ever
// existed in memory, with nothing but a small, easy-to-miss status line
// as a warning. This keeps trying (and the caller, via queueSave/saveChain,
// keeps later edits queued behind it) until it either succeeds or the
// session itself is gone. A dead session is the one case worth giving up
// on immediately: storage.set() has already called forceReauth() and sent
// the user back to login by the time that error reaches here, retrying
// against it can't succeed, and the pending edit will be superseded by
// loadState() pulling fresh data on the next login anyway.
async function saveState(){
  const statusEl = document.getElementById('saveStatus');
  let attempt = 0;
  while(true){
    if(statusEl) statusEl.textContent = attempt ? `Saving… (retry ${attempt})` : 'Saving…';
    try{
      await storage.set('tracker-state', JSON.stringify(state), false);
      unsavedChanges = false;
      if(statusEl){
        statusEl.textContent = 'Saved';
        setTimeout(()=>{ if(statusEl.textContent==='Saved') statusEl.textContent=''; }, 1500);
      }
      return;
    }catch(e){
      console.error('Storage save failed', e);
      if(e.message === 'session expired'){
        if(statusEl) statusEl.textContent = 'Signed out — sign back in to keep syncing';
        return;
      }
      const delay = SAVE_RETRY_DELAYS_MS[Math.min(attempt, SAVE_RETRY_DELAYS_MS.length - 1)];
      if(statusEl) statusEl.textContent = `Save failed — retrying in ${Math.round(delay/1000)}s`;
      await delayOrOnline(delay);
      attempt++;
    }
  }
}

// Mutations render immediately against in-memory state and queue the actual
// network save behind whatever's still in flight, rather than making the
// tap wait on a Supabase round-trip to feel responsive. Chaining onto
// saveChain (instead of firing saveState() directly) keeps saves in the
// order they were made — without it, two rapid edits could race and the
// slower request could land second and overwrite the newer one with stale
// data.
let saveChain = Promise.resolve();
function queueSave(){
  unsavedChanges = true;
  saveChain = saveChain.then(() => saveState());
  return saveChain;
}

