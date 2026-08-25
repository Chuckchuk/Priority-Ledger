// ---------- Claude view ----------
// A plain-text view meant to be read by an agent (e.g. the Claude Chrome
// extension) via its page-text tools, instead of screenshotting the
// visual ledger. Pure navigation like switchTab/toggleSettings, so it's
// not on the undo stack and isn't itself state — it just renders a text
// snapshot of the current in-memory `state` on demand.

function openClaudeView(mode){
  claudeView = mode === 'full' ? 'full' : 'digest';
  settingsOpen = false;
  pendingDeleteCategoryId = null;
  render();
}

// The only way into the Claude view is the "Open Claude-readable view"
// button inside Settings (or the ?claude= URL param, which a page-reading
// agent wouldn't be clicking a tag or pressing Esc from anyway) — so
// closing it, whether via the page tag or Esc, goes back to Settings
// rather than whatever category tab happened to be active underneath.
function closeClaudeView(){
  claudeView = null;
  settingsOpen = true;
  render();
}

function toggleClaudeViewMode(){
  claudeView = claudeView === 'full' ? 'digest' : 'full';
  render();
}

// One line per task, plain enough for an LLM to parse without any markup:
// a checkbox-style status, urgent flag, due date (flagged if overdue),
// step progress, then notes and each subtask step on their own indented
// lines so nothing stays hidden the way it does in the collapsed UI.
function claudeTaskLine(t, withCategory){
  const cat = CATEGORIES[t.category] || FALLBACK_CATEGORY;
  const bits = ['-', t.urgent ? '[URGENT]' : '[ ]', t.title];
  if(withCategory) bits.push(`(${cat.label})`);
  if(t.priority) bits.push(`priority:${PRIORITY_LABELS[t.priority].toLowerCase()}`);
  if(t.timeframe) bits.push(`timeframe:${t.timeframe}`);
  if(t.dueDate) bits.push(isOverdue(t) ? `— OVERDUE ${fmtDate(t.dueDate)}` : `— due ${fmtDate(t.dueDate)}`);
  if(t.subtasks && t.subtasks.length){
    const done = t.subtasks.filter(s=>s.done).length;
    bits.push(`(${done}/${t.subtasks.length} steps)`);
  }
  // Age is the whole point of this digest for a "what's been sitting
  // around" read — every open line gets one, not just old ones, so an LLM
  // can compare across the list without guessing at missing data.
  const age = daysBetween(t.createdAt, todayStr());
  bits.push(`(open ${age}d)`);
  let line = bits.join(' ');
  if(t.notes && t.notes.trim()) line += `\n    note: ${t.notes.trim().replace(/\s*\n\s*/g,' ')}`;
  (t.subtasks||[]).forEach(s=>{ line += `\n    · [${s.done?'x':' '}] ${s.text}`; });
  return line;
}

// Curated for "what should I work on next" — open tasks only, grouped by
// tab in the same order the tabs themselves appear, plus today's and any
// upcoming Daily plans. Ignores the location filter deliberately: an
// agent reading this wants the whole picture, not just what's visible
// while standing in one location.
function claudeDigestText(){
  const lines = ['THE LEDGER — Claude priority digest', `Generated ${new Date().toLocaleString()}`];
  if(state.locationEnabled) lines.push(`Currently at: ${currentLocation().label}`);
  lines.push('');
  const knownIds = new Set(state.categories.map(c=>c.id));
  state.categories.forEach(c=>{
    const open = sortTasks(state.tasks.filter(t=>t.category===c.id && t.status!=='done'));
    const locNote = state.locationEnabled
      ? ` (${c.locations.map(id=>(state.locations.find(l=>l.id===id)||{label:id}).label).join(', ')})`
      : '';
    lines.push(`== ${c.label}${locNote} — ${open.length} open ==`);
    lines.push(open.length ? open.map(t=>claudeTaskLine(t)).join('\n') : '(nothing open)');
    lines.push('');
  });
  const orphaned = sortTasks(state.tasks.filter(t=>!knownIds.has(t.category) && t.status!=='done'));
  if(orphaned.length){
    lines.push(`== Uncategorized — ${orphaned.length} open ==`);
    lines.push(orphaned.map(t=>claudeTaskLine(t)).join('\n'));
    lines.push('');
  }
  lines.push('== Daily plan ==');
  const today = todayStr();
  const todayTasks = sortTasks(tasksForDay(today).filter(t=>t.status!=='done'));
  lines.push(`-- Today, ${dayLabel(today)} --`);
  lines.push(todayTasks.length ? todayTasks.map(t=>claudeTaskLine(t, true)).join('\n') : '(nothing planned)');
  state.days.filter(d=>d>today).sort().forEach(d=>{
    const dt = sortTasks(tasksForDay(d).filter(t=>t.status!=='done'));
    if(!dt.length) return;
    lines.push('');
    lines.push(`-- ${dayLabel(d)} --`);
    lines.push(dt.map(t=>claudeTaskLine(t, true)).join('\n'));
  });
  return lines.join('\n');
}

// Complete, structured, and trivial for an LLM to parse — the entire
// state object as-is, not a curated subset like the digest above.
function claudeFullDumpText(){
  return JSON.stringify(state, null, 2);
}

function renderClaudeView(){
  const el = document.getElementById('claudeView');
  const text = claudeView === 'full' ? claudeFullDumpText() : claudeDigestText();
  el.innerHTML = `
    <div class="stackedpage">
      ${pageTagHtml('closeClaudeView()', 'Back')}
      <div class="daylistlabel">Claude-readable ${claudeView==='full' ? 'raw data (JSON)' : 'priority digest'}</div>
      <div class="lockednote">Point your assistant here directly by adding <b>?claude=1</b> (digest) or <b>?claude=full</b> (raw data) to this page's URL — it can read the text below without screenshotting the app.</div>
      <div class="claudeviewrow">
        <button class="pullbtn" onclick="toggleClaudeViewMode()">${claudeView==='full' ? 'Show digest' : 'Show full raw data'}</button>
        <button class="pullbtn" onclick="copyClaudeView(this)">Copy to clipboard</button>
      </div>
      <pre class="claudepre" id="claudeViewText">${escapeHtml(text)}</pre>
    </div>
  `;
}

async function copyClaudeView(btn){
  const text = document.getElementById('claudeViewText').textContent;
  try{
    await navigator.clipboard.writeText(text);
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(()=>{ if(btn.textContent==='Copied!') btn.textContent = original; }, 1500);
  }catch(e){
    console.error('Clipboard copy failed', e);
  }
}

