function toggleExpand(evt, id){
  if(expandedTaskIds.has(id)) expandedTaskIds.delete(id); else expandedTaskIds.add(id);
  const exp = document.getElementById('exp-' + id);
  exp.classList.toggle('open');
}

async function toggleLocation(){
  if(!state.locationEnabled || state.locations.length < 2) return;
  const idx = state.locations.findIndex(l=>l.id===state.location);
  state.location = state.locations[(idx + 1) % state.locations.length].id;
  if(!visibleTabs().includes(activeTab)) activeTab = 'all';
  render();
  queueSave();
}

function toggleAuthMode(){
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  document.getElementById('authSubmitBtn').textContent = authMode === 'signin' ? 'Sign In' : 'Create Account';
  document.getElementById('authModeToggle').textContent =
    authMode === 'signin' ? 'Need an account? Create one' : 'Already have an account? Sign in';
  document.getElementById('authError').textContent = '';
  // Only makes sense while signing in — a brand-new account has no
  // password to forget yet.
  document.getElementById('forgotPasswordRow').style.display = authMode === 'signin' ? '' : 'none';
}

// A dedicated view rather than reusing #authEmail — the sign-in field
// might be empty, might hold an email the person is only *trying* (not
// the account they actually forgot the password to), and reusing it made
// it easy to fire off a reset without realizing which address it'd go to.
function showForgotPassword(){
  document.getElementById('forgotEmail').value = document.getElementById('authEmail').value.trim();
  document.getElementById('forgotError').textContent = '';
  document.getElementById('authShell').style.display = 'none';
  document.getElementById('forgotShell').style.display = '';
  updateForgotSubmitState();
}

function hideForgotPassword(){
  clearTimeout(forgotCooldownTimer);
  document.getElementById('forgotShell').style.display = 'none';
  document.getElementById('authShell').style.display = '';
}

// Supabase's own send limit is a single quota shared across the whole
// project, not per-user — a client-side, per-browser cooldown can't
// enforce that globally, and isn't trying to. What it stops is someone
// mashing this exact button while troubleshooting ("did it send? let me
// try again") and burning through several slots of that shared quota in
// a few seconds, which is exactly what happened here once already.
const PASSWORD_RESET_COOLDOWN_MS = 60000;
let forgotCooldownTimer = null;

function forgotCooldownRemainingMs(){
  const last = Number(localStorage.getItem('ledger-last-reset-request') || 0);
  return Math.max(0, PASSWORD_RESET_COOLDOWN_MS - (Date.now() - last));
}

function updateForgotSubmitState(){
  const btn = document.getElementById('forgotSubmitBtn');
  const remaining = forgotCooldownRemainingMs();
  clearTimeout(forgotCooldownTimer);
  if(remaining > 0){
    btn.disabled = true;
    btn.textContent = `Resend in ${Math.ceil(remaining / 1000)}s`;
    forgotCooldownTimer = setTimeout(updateForgotSubmitState, 1000);
  }else{
    btn.disabled = false;
    btn.textContent = 'Send reset link';
  }
}

// Supabase's /recover endpoint returns 200 whether or not the email
// actually belongs to an account (avoids leaking which emails are
// registered), so the success message here is deliberately generic rather
// than confirming an email was sent to a real account.
async function requestPasswordReset(){
  if(forgotCooldownRemainingMs() > 0) return; // the disabled button already guards this; a queued Enter keypress is the one other way in
  const email = document.getElementById('forgotEmail').value.trim();
  const errEl = document.getElementById('forgotError');
  errEl.textContent = '';
  if(!email){ errEl.textContent = 'Enter an email above.'; return; }
  localStorage.setItem('ledger-last-reset-request', String(Date.now()));
  updateForgotSubmitState();
  try{
    const res = await fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(AUTH_REDIRECT_URL)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email })
    });
    if(!res.ok){
      const data = await res.json().catch(() => ({}));
      errEl.textContent = data.error_description || data.msg || 'Something went wrong.';
      return;
    }
    errEl.textContent = 'If that email has an account, a reset link is on its way.';
  }catch(e){
    errEl.textContent = 'Network error — try again.';
  }
}

// Handles the #resetShell form init() shows when the page loads with a
// password-recovery hash (see init() in 19-bootstrap.js). The recovery
// link's access_token is itself a valid session token, so a successful
// password change logs the user straight in rather than sending them back
// to the sign-in form to re-enter the password they just set.
async function submitPasswordReset(){
  const pw = document.getElementById('resetPassword').value;
  const pw2 = document.getElementById('resetPasswordConfirm').value;
  const errEl = document.getElementById('resetError');
  errEl.textContent = '';
  if(!pw || pw.length < 6){ errEl.textContent = 'Password must be at least 6 characters.'; return; }
  if(pw !== pw2){ errEl.textContent = "Passwords don't match."; return; }
  try{
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${recoverySession.access_token}`
      },
      body: JSON.stringify({ password: pw })
    });
    const data = await res.json();
    if(!res.ok){ errEl.textContent = data.error_description || data.msg || 'Something went wrong.'; return; }
    history.replaceState(null, '', location.pathname + location.search);
    saveSession({
      access_token: recoverySession.access_token,
      refresh_token: recoverySession.refresh_token,
      expires_at: Date.now() + recoverySession.expires_in * 1000,
      user_id: data.id,
      email: data.email
    });
    recoverySession = null;
    document.getElementById('resetShell').style.display = 'none';
    await enterApp();
  }catch(e){
    errEl.textContent = 'Network error — try again.';
  }
}

async function submitAuth(){
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errEl = document.getElementById('authError');
  errEl.textContent = '';
  if(!email || !password){ errEl.textContent = 'Enter an email and password.'; return; }
  const endpoint = authMode === 'signin'
    ? `${SUPABASE_URL}/auth/v1/token?grant_type=password`
    : `${SUPABASE_URL}/auth/v1/signup?redirect_to=${encodeURIComponent(AUTH_REDIRECT_URL)}`;
  try{
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if(!res.ok){ errEl.textContent = data.error_description || data.msg || 'Something went wrong.'; return; }
    if(!data.access_token){
      errEl.textContent = 'Check your email to confirm your account, then sign in.';
      return;
    }
    saveSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
      user_id: data.user.id,
      email: data.user.email
    });
    await enterApp();
  }catch(e){
    errEl.textContent = 'Network error — try again.';
  }
}

function signOut(){
  saveSession(null);
  appEntered = false;
  stopAutoRefresh();
  localOnlyMode = false;
  settingsOpen = false;
  claudeView = null;
  selectedListId = null;
  checklistPendingOpen = false;
  dailyCalendarOpen = false;
  dayReturnToCalendar = false;
  pendingDeleteCategoryId = null;
  closeAllSettingsPopovers();
  undoStack = [];
  redoStack = [];
  expandedTaskIds = new Set();
  devPanelOpen = false;
  applyThemeObject(defaultTheme()); // login screen always shows the classic look
  document.getElementById('authEmail').value = '';
  document.getElementById('authPassword').value = '';
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('authShell').style.display = '';
  const devPanel = document.getElementById('devPanel');
  if(devPanel){ devPanel.style.display = 'none'; devPanel.classList.remove('open'); }
}

function continueLocally(){
  localOnlyMode = true;
  enterApp();
}

async function enterApp(){
  // Undo history is scoped to one login session — it should never let you
  // undo into a different account's data, or across a page reload.
  undoStack = [];
  redoStack = [];
  expandedTaskIds = new Set();
  claudeView = null;
  selectedListId = null;
  checklistPendingOpen = false;
  dailyCalendarOpen = false;
  dayReturnToCalendar = false;
  document.getElementById('authShell').style.display = 'none';
  document.getElementById('appShell').style.display = '';
  const signOutRow = document.getElementById('signOutRow');
  if(signOutRow){
    signOutRow.style.display = (window.storage || !session) ? 'none' : '';
    document.getElementById('authEmailLabel').textContent = session ? session.email : '';
  }
  const refreshBtn = document.getElementById('refreshBtn');
  if(refreshBtn) refreshBtn.style.display = (localOnlyMode || window.storage) ? 'none' : '';
  await loadState();
  // Restore whichever tab was active before the last reload/sign-in, rather
  // than always landing on "All" — visibleTabs() guards against a stale id
  // (a deleted category, or a tab left over from a different account on
  // this device) by falling back to whatever activeTab already is ('all').
  const lastTab = localStorage.getItem('ledger-last-tab');
  if(lastTab && visibleTabs().includes(lastTab)) activeTab = lastTab;
  applyTheme();
  applyDevSettings();
  render();
  appEntered = true;
  startAutoRefresh();
  // A `?claude=1` (or `?claude=full`) URL lets an agent (e.g. the Claude
  // Chrome extension) navigate straight to the plain-text view instead of
  // clicking through Settings, as long as it's using a browser session
  // that's already signed in here.
  const claudeParam = new URLSearchParams(location.search).get('claude');
  if(claudeParam) openClaudeView(claudeParam);
}

