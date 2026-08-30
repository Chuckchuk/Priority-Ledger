// Undo/redo — whole-state snapshots rather than hand-written inverse
// operations per action. This app's entire content is already one JSON
// blob (`state`), so cloning it before each mutation is cheap and, unlike
// per-action-type inverses, can't drift out of sync with a mutation that
// forgets to update it. Every user-facing content change calls
// pushUndo(label) as its first step (before mutating state); pure
// navigation (switching tabs, toggling which location you're viewing,
// opening a day) is deliberately NOT on the undo stack — undo is for
// content you changed, not where you were looking.
let undoStack = [];
let redoStack = [];
const UNDO_LIMIT = 50;

function pushUndo(label){
  undoStack.push({ label, snapshot: JSON.parse(JSON.stringify(state)) });
  if(undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack = [];
}

function showUndoStatus(text){
  const el = document.getElementById('undoStatus');
  if(!el) return;
  el.textContent = text;
  clearTimeout(showUndoStatus._t);
  showUndoStatus._t = setTimeout(()=>{ if(el.textContent===text) el.textContent=''; }, 2500);
}

function refreshUndoButtons(){
  const u = document.getElementById('undoBtn');
  const r = document.getElementById('redoBtn');
  if(u) u.disabled = undoStack.length===0;
  if(r) r.disabled = redoStack.length===0;
}

// Runs after restoring a snapshot, since the restored state may no longer
// match transient UI state that isn't itself part of the undo history
// (e.g. you're viewing a day that undo just un-created).
function afterStateRestore(){
  rebuildCategoriesIndex();
  applyTheme();
  applyDevSettings();
  if(!visibleTabs().includes(activeTab)) activeTab = 'all';
  if(selectedDay && !state.days.includes(selectedDay)) selectedDay = null;
  if(!selectedDay) dayReturnToCalendar = false;
  if(selectedListId && !state.tasks.some(t=>t.id===selectedListId)) selectedListId = null;
  pendingDeleteCategoryId = null;
  closeAllSettingsPopovers();
}

function undo(){
  if(undoStack.length===0) return;
  const entry = undoStack.pop();
  redoStack.push({ label: entry.label, snapshot: JSON.parse(JSON.stringify(state)) });
  state = entry.snapshot;
  afterStateRestore();
  render();
  queueSave();
  showUndoStatus('Undid: ' + entry.label);
}

function redo(){
  if(redoStack.length===0) return;
  const entry = redoStack.pop();
  undoStack.push({ label: entry.label, snapshot: JSON.parse(JSON.stringify(state)) });
  state = entry.snapshot;
  afterStateRestore();
  render();
  queueSave();
  showUndoStatus('Redid: ' + entry.label);
}

// ---------- Shake-to-undo/redo ----------
// Mirrors iOS's own system-level "shake to undo," but a web page can only
// approximate it: iOS 13+ Safari/WKWebView gates the devicemotion event
// itself behind DeviceMotionEvent.requestPermission(), and that call only
// resolves (rather than silently rejecting) when made from inside a real
// user gesture — a tap, never a timer or page-load script. That means an
// iOS web app has no way to listen for a shake before *something* has
// been tapped, and no way to detect "the user just tried to shake" before
// permission exists either — there's nothing to catch it with yet. The
// closest a web page gets is requestShakePermission() below, fired once
// from the very first tap anywhere in the app (see the one-time
// 'pointerdown' listener in 19-bootstrap.js) — so in practice it's live
// within one tap of opening the app, no separate settings toggle or
// visible "enable shake" banner needed. Browsers that never gate this
// (most non-Safari mobile browsers) just start listening immediately,
// same call path, no prompt shown.
let shakeMotionPermissionState = 'unknown'; // 'unknown' | 'granted' | 'denied' | 'unsupported'
let shakeLastMagnitude = null;
let shakePeakTimes = [];
const SHAKE_DELTA_THRESHOLD = 14; // m/s^2 jump between consecutive samples to count as one "peak"
const SHAKE_WINDOW_MS = 1200;     // peaks must all land within this span of each other
const SHAKE_PEAKS_REQUIRED = 3;   // this many qualifying peaks inside the window = a shake
const SHAKE_COOLDOWN_MS = 1500;   // ignore further peaks right after a shake fires, so the tail end of the same shake can't immediately reopen the menu
let shakeCooldownUntil = 0;

function handleDeviceMotion(e){
  const acc = e.accelerationIncludingGravity || e.acceleration;
  if(!acc || acc.x === null) return;
  const magnitude = Math.sqrt((acc.x||0)**2 + (acc.y||0)**2 + (acc.z||0)**2);
  const now = Date.now();
  if(shakeLastMagnitude !== null && now >= shakeCooldownUntil
     && Math.abs(magnitude - shakeLastMagnitude) > SHAKE_DELTA_THRESHOLD){
    shakePeakTimes = shakePeakTimes.filter(t => now - t < SHAKE_WINDOW_MS);
    shakePeakTimes.push(now);
    if(shakePeakTimes.length >= SHAKE_PEAKS_REQUIRED){
      shakePeakTimes = [];
      shakeCooldownUntil = now + SHAKE_COOLDOWN_MS;
      onShakeDetected();
    }
  }
  shakeLastMagnitude = magnitude;
}

function startShakeListening(){
  if(shakeMotionPermissionState === 'granted') return; // already listening
  shakeMotionPermissionState = 'granted';
  window.addEventListener('devicemotion', handleDeviceMotion);
}

// Called from the one-time first-tap listener in 19-bootstrap.js. Safe to
// call more than once (e.g. a stray second registration) — it only acts
// while the state is still 'unknown', so a definite answer either way
// sticks rather than re-prompting.
function requestShakePermission(){
  if(shakeMotionPermissionState !== 'unknown') return;
  if(typeof DeviceMotionEvent === 'undefined'){ shakeMotionPermissionState = 'unsupported'; return; }
  if(typeof DeviceMotionEvent.requestPermission !== 'function'){ startShakeListening(); return; }
  DeviceMotionEvent.requestPermission().then(result => {
    if(result === 'granted') startShakeListening();
    else shakeMotionPermissionState = 'denied';
  }).catch(() => { shakeMotionPermissionState = 'denied'; });
}

let shakeUndoOpen = false;

function onShakeDetected(){
  if(shakeUndoOpen) return;
  const appShell = document.getElementById('appShell');
  if(!appShell || appShell.style.display === 'none') return; // not signed in yet
  openShakeUndoMenu();
}

function shakeUndoMenuHtml(){
  const undoLabel = undoStack.length ? undoStack[undoStack.length-1].label : null;
  const redoLabel = redoStack.length ? redoStack[redoStack.length-1].label : null;
  return `
    <div class="shakeundo-title">Undo or redo?</div>
    <div class="shakeundo-actions">
      <button ${undoLabel ? '' : 'disabled'} onclick="shakeUndoAction(undo)">Undo${undoLabel ? ': ' + escapeHtml(undoLabel) : ''}</button>
      <button ${redoLabel ? '' : 'disabled'} onclick="shakeUndoAction(redo)">Redo${redoLabel ? ': ' + escapeHtml(redoLabel) : ''}</button>
    </div>
  `;
}

// Nothing to undo AND nothing to redo (e.g. a brand-new account, or right
// after signing in with no edits yet this session) — a shake in that
// state has nothing useful to offer, so it's a silent no-op rather than
// popping an empty-looking menu.
function openShakeUndoMenu(){
  if(undoStack.length === 0 && redoStack.length === 0) return;
  shakeUndoOpen = true;
  document.body.classList.add('shakeundo-open');
  document.getElementById('shakeUndoBody').innerHTML = shakeUndoMenuHtml();
  if(navigator.vibrate) navigator.vibrate(30);
}

function closeShakeUndoMenu(){
  shakeUndoOpen = false;
  document.body.classList.remove('shakeundo-open');
}

function shakeUndoAction(fn){
  closeShakeUndoMenu();
  fn();
}

