function toggleExpand(evt, id){
  if(expandedTaskIds.has(id)) expandedTaskIds.delete(id); else expandedTaskIds.add(id);
  const exp = document.getElementById('exp-' + id);
  exp.classList.toggle('open');
}

async function toggleLocation(){
  if(!state.locationEnabled || state.locations.length < 2) return;
  const idx = state.locations.findIndex(l=>l.id===state.location);
  const prevCategory = CATEGORIES[activeTab];
  state.location = state.locations[(idx + 1) % state.locations.length].id;
  if(!visibleTabs().includes(activeTab)){
    // The category we were on just disappeared from view (it's not shown
    // at the new location). If another category shares its exact name —
    // e.g. two separate "Errands" categories, one per location — jump to
    // that one instead of bailing out to "All": same-named categories
    // read as "the same tab, filtered per location" to the person using
    // them, even though they're unrelated category records underneath.
    const sibling = prevCategory && state.categories.find(c =>
      c.id !== prevCategory.id && c.label === prevCategory.label && visibleTabs().includes(c.id));
    activeTab = sibling ? sibling.id : 'all';
  }
  render();
  queueSave();
}

// ---- Auth error/feedback system ----
// Centralizes "show this error to the person" for all three auth forms
// (sign-in/sign-up, forgot-password, set-new-password) so the mapping
// from a raw Supabase/network failure to plain language lives in one
// place instead of being copied at each call site.

const AUTH_FETCH_TIMEOUT_MS = 15000;

// Wraps fetch with a hard timeout. A stalled connection otherwise never
// resolves or rejects at all — no error, no success, just silence, which
// is exactly what "I hit sign in and nothing happened" looks like from
// the outside. Past AUTH_FETCH_TIMEOUT_MS this aborts, and the caller's
// catch block sees a plain AbortError, same shape as any other network
// failure.
async function authFetch(url, opts){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_FETCH_TIMEOUT_MS);
  try{
    return await fetch(url, { ...opts, signal: controller.signal });
  }finally{
    clearTimeout(timer);
  }
}

// Maps a Supabase GoTrue error body to a specific, plain-language
// message. Matched by substring against GoTrue's own message text rather
// than an error_code field, since error_code isn't present on every
// GoTrue version/endpoint but the wording has been stable. Falls back to
// GoTrue's own raw text (still better than a generic "something went
// wrong") when nothing here matches.
function humanizeAuthError(data, status){
  const raw = (data && (data.error_description || data.msg || data.error || data.message)) || '';
  const m = raw.toLowerCase();
  if(m.includes('invalid login credentials')) return "That email or password isn't right.";
  if(m.includes('email not confirmed')) return "You haven't confirmed this email yet — check your inbox for the confirmation link.";
  if(m.includes('already registered') || m.includes('already exists')) return 'An account with that email already exists — try signing in instead.';
  if(m.includes('rate limit')) return 'Too many attempts — wait a few minutes and try again.';
  if(m.includes('invalid email') || m.includes('unable to validate email')) return "That doesn't look like a valid email address.";
  if(m.includes('password')) return raw; // Supabase's own wording (e.g. minimum length) is already specific and actionable
  if(status === 429) return 'Too many attempts — wait a few minutes and try again.';
  if(status >= 500) return "Something's wrong on the server right now — try again in a moment.";
  return raw || 'Something went wrong. Please try again.';
}

// Same idea for a fetch that never got a response at all.
function humanizeAuthNetworkError(e){
  if(e && e.name === 'AbortError') return "That's taking too long — check your connection and try again.";
  return "Can't reach the server — check your internet connection and try again.";
}

// Puts a message on screen for one of the three auth forms. A real error
// (not an informational next-step like "check your email") shakes the
// form and outlines whichever fields the message is about — see the CSS
// comment on .authform input.autherr-field for why the outline is a
// separate class from the shake. Omit fieldIds for a form-level failure
// (network/timeout/server) that isn't any one field's fault.
function authFeedback(errElId, formEl, message, { isError = true, fieldIds = [] } = {}){
  const errEl = document.getElementById(errElId);
  errEl.textContent = message;
  errEl.classList.remove('err', 'info');
  errEl.classList.add(isError ? 'err' : 'info');
  formEl.querySelectorAll('input.autherr-field').forEach(el => el.classList.remove('autherr-field'));
  if(isError){
    fieldIds.forEach(id => document.getElementById(id).classList.add('autherr-field'));
    // Remove, force a reflow, then re-add — a class that's already
    // present doesn't restart a CSS animation, so without this a second
    // failure in a row wouldn't shake again.
    formEl.classList.remove('authshake');
    void formEl.offsetWidth;
    formEl.classList.add('authshake');
  }
}

function clearAuthFeedback(errElId, formEl){
  const errEl = document.getElementById(errElId);
  errEl.textContent = '';
  errEl.classList.remove('err', 'info');
  formEl.querySelectorAll('input.autherr-field').forEach(el => el.classList.remove('autherr-field'));
}

// Disables the submit button and swaps its label for the duration of an
// in-flight auth request, restoring both afterward regardless of outcome
// — the visible "something is happening" state that keeps a slow request
// from reading as the button having done nothing.
async function withAuthBusy(btnId, busyLabel, fn){
  const btn = document.getElementById(btnId);
  if(btn.disabled) return; // already mid-request — ignore a double Enter/click
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = busyLabel;
  try{
    await fn();
  }finally{
    btn.disabled = false;
    btn.textContent = original;
  }
}

function toggleAuthMode(){
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  document.getElementById('authSubmitBtn').textContent = authMode === 'signin' ? 'Sign In' : 'Create Account';
  document.getElementById('authModeToggle').textContent =
    authMode === 'signin' ? 'Need an account? Create one' : 'Already have an account? Sign in';
  // Same field either way (see authForm in shell-body.html) — the
  // autocomplete hint is what tells Safari/iCloud Keychain whether to
  // offer an existing saved password (signing in) or treat whatever gets
  // typed as a new credential worth saving (signing up), rather than
  // trying to match it against an old one.
  document.getElementById('authPassword').setAttribute('autocomplete', authMode === 'signin' ? 'current-password' : 'new-password');
  clearAuthFeedback('authError', document.querySelector('#authShell .authform'));
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
  clearAuthFeedback('forgotError', document.querySelector('#forgotShell .authform'));
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
  const formEl = document.querySelector('#forgotShell .authform');
  if(!email){ authFeedback('forgotError', formEl, 'Enter an email above.', { fieldIds: ['forgotEmail'] }); return; }
  localStorage.setItem('ledger-last-reset-request', String(Date.now()));
  updateForgotSubmitState();
  try{
    const res = await authFetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(AUTH_REDIRECT_URL)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email })
    });
    if(!res.ok){
      const data = await res.json().catch(() => ({}));
      authFeedback('forgotError', formEl, humanizeAuthError(data, res.status), { fieldIds: ['forgotEmail'] });
      return;
    }
    authFeedback('forgotError', formEl, 'If that email has an account, a reset link is on its way.', { isError: false });
  }catch(e){
    authFeedback('forgotError', formEl, humanizeAuthNetworkError(e), {});
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
  const formEl = document.querySelector('#resetShell .authform');
  if(!pw || pw.length < 6){ authFeedback('resetError', formEl, 'Password must be at least 6 characters.', { fieldIds: ['resetPassword'] }); return; }
  if(pw !== pw2){ authFeedback('resetError', formEl, "Passwords don't match.", { fieldIds: ['resetPassword', 'resetPasswordConfirm'] }); return; }
  await withAuthBusy('resetSubmitBtn', 'Saving…', async () => {
    try{
      const res = await authFetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${recoverySession.access_token}`
        },
        body: JSON.stringify({ password: pw })
      });
      const data = await res.json().catch(() => ({}));
      if(!res.ok){ authFeedback('resetError', formEl, humanizeAuthError(data, res.status), { fieldIds: ['resetPassword'] }); return; }
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
      authFeedback('resetError', formEl, humanizeAuthNetworkError(e), {});
    }
  });
}

async function submitAuth(){
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const formEl = document.querySelector('#authShell .authform');
  if(!email || !password){
    authFeedback('authError', formEl, 'Enter both an email and a password.', {
      fieldIds: [!email && 'authEmail', !password && 'authPassword'].filter(Boolean)
    });
    return;
  }
  const endpoint = authMode === 'signin'
    ? `${SUPABASE_URL}/auth/v1/token?grant_type=password`
    : `${SUPABASE_URL}/auth/v1/signup?redirect_to=${encodeURIComponent(AUTH_REDIRECT_URL)}`;
  await withAuthBusy('authSubmitBtn', authMode === 'signin' ? 'Signing in…' : 'Creating account…', async () => {
    try{
      const res = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json().catch(() => ({}));
      if(!res.ok){
        authFeedback('authError', formEl, humanizeAuthError(data, res.status), { fieldIds: ['authEmail', 'authPassword'] });
        return;
      }
      if(!data.access_token){
        authFeedback('authError', formEl, 'Check your email to confirm your account, then sign in.', { isError: false });
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
      authFeedback('authError', formEl, humanizeAuthNetworkError(e), {});
    }
  });
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
  closeShareMenu();
  shareImportId = null;
  shareImportData = null;
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
  const signOutBtn = document.getElementById('signOutBtn');
  if(signOutBtn){
    signOutBtn.style.display = (window.storage || !session) ? 'none' : '';
    signOutBtn.title = session ? `Sign out (${session.email})` : 'Sign out';
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
  // A ?share=<id> link opened with a session available (either already
  // signed in, or just signed in from the standalone share page's own
  // CTA — see showShareAuthPrompt(), 19-sharing.js) shows the "add this
  // to a category" import dialog once the real app is up.
  if(pendingShareId){
    const shareId = pendingShareId;
    pendingShareId = null;
    openShareImportDialog(shareId);
  }
}

