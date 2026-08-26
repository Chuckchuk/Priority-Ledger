function toggleExpand(evt, id){
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
}

async function submitAuth(){
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errEl = document.getElementById('authError');
  errEl.textContent = '';
  if(!email || !password){ errEl.textContent = 'Enter an email and password.'; return; }
  const endpoint = authMode === 'signin'
    ? `${SUPABASE_URL}/auth/v1/token?grant_type=password`
    : `${SUPABASE_URL}/auth/v1/signup`;
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
  pendingDeleteCategoryId = null;
  pendingDeleteLocationId = null;
  openCategoryPickerId = null;
  undoStack = [];
  redoStack = [];
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
  claudeView = null;
  selectedListId = null;
  checklistPendingOpen = false;
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

