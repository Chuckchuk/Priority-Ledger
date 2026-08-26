// ---------- Calendar view ----------
// A month grid over the exact same state.days/plannedDates data the
// Daily tab lists day-by-day. Nothing here owns or duplicates any data —
// every number on the grid comes straight from dayItemsSummary(), the
// same function Daily's own day-list/day-detail already use, so the two
// views can never disagree about what's on a given day.
//
// Two entry points share this same grid markup (see calendarBodyHtml()):
//   - renderDailyCalendar() — a compact "Calendar" tag on Daily's own day
//     list (see renderDayList() in 11-daily-core.js) opens this, and it
//     wraps in .stackedpage with a plain "Daily" back tag, the same
//     pattern the checklist's list-detail/pending views use. This is the
//     normal way anyone reaches a calendar view.
//   - renderCalendar() — an optional 'calendar' category type
//     (isCalendarCategory() in 01-categories-theme.js), gated behind the
//     calendarTabTypeEnabled dev setting (see devSettingsFieldsHtml() in
//     01-categories-theme.js). Kept working rather than deleted since it
//     was already-functional code, just no longer the primary path.

// Which month is currently browsed — transient UI state, not persisted
// (same idiom as pickerOpen/expandedMonths), so it always starts back on
// the current month on a fresh load. Deliberately NOT reset when the
// calendar view closes: reopening it (either entry point) should still
// show whatever month you were last looking at.
let calendarViewMonth = null;

function calendarMonth(){
  if(!calendarViewMonth) calendarViewMonth = monthKey(todayStr());
  return calendarViewMonth;
}

function shiftMonthKey(key, n){
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Re-renders whichever host is currently showing a calendar — at most one
// of the two is ever active at once (dailyCalendarOpen vs. the active tab
// being a calendar category), so checking dailyCalendarOpen first and
// falling back to the category-tab renderer covers both without the nav
// buttons needing to know which one opened them.
function rerenderCalendarHost(){
  if(dailyCalendarOpen) renderDaily();
  else renderCalendar();
}

function calendarShiftMonth(delta){
  calendarViewMonth = shiftMonthKey(calendarMonth(), delta);
  rerenderCalendarHost();
}

function calendarJumpToday(){
  calendarViewMonth = monthKey(todayStr());
  rerenderCalendarHost();
}

// One cell per calendar day in the visible month, padded with blank
// leading/trailing cells so the grid always fills complete weeks (a
// ragged final row reads as a bug, not a design choice). Every day's
// total/done comes from dayItemsSummary() regardless of whether that
// date happens to be in state.days yet — a date with nothing planned
// just comes back {total:0, done:0}. `exists` is tracked separately
// (state.days.includes(dateStr)) specifically so an already-logged-but-
// empty day can still be told apart from one that's never been touched —
// clicking either currently creates the day via ensureDay() (see
// openCalendarDay() below), which was the exact ambiguity that made
// clicking around "just to check" feel like it was cluttering the Daily
// list by accident.
function calendarMonthCells(monthKeyStr){
  const [y, m] = monthKeyStr.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startWeekday = new Date(y, m - 1, 1).getDay();
  const today = todayStr();
  const cells = [];
  for(let i = 0; i < startWeekday; i++) cells.push({ blank: true });
  for(let d = 1; d <= daysInMonth; d++){
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const { total, done } = dayItemsSummary(dateStr);
    cells.push({ blank: false, dateStr, dayNum: d, isToday: dateStr === today, exists: state.days.includes(dateStr), total, done });
  }
  while(cells.length % 7 !== 0) cells.push({ blank: true });
  return cells;
}

function calendarMonthSummary(monthKeyStr){
  const [y, m] = monthKeyStr.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  let total = 0, done = 0;
  for(let d = 1; d <= daysInMonth; d++){
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const s = dayItemsSummary(dateStr);
    total += s.total; done += s.done;
  }
  return { total, done };
}

const CALENDAR_WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// The nav row + summary + grid — everything both hosts share. Neither
// host's own page-tag(s) live in here, since those differ per host (a
// compact forward tag for the category-tab overview vs. a plain back tag
// for the Daily-embedded stacked page).
function calendarBodyHtml(monthKeyStr){
  const cells = calendarMonthCells(monthKeyStr);
  const summary = calendarMonthSummary(monthKeyStr);
  return `
    <div class="calnav">
      <button class="navarrow" onclick="calendarShiftMonth(-1)" title="Previous month">‹</button>
      <button class="calmonthlabel" onclick="calendarJumpToday()" title="Jump to the current month">${monthLabel(monthKeyStr)}</button>
      <button class="navarrow" onclick="calendarShiftMonth(1)" title="Next month">›</button>
    </div>
    <div class="calsummary">${summary.total ? `${summary.done} of ${summary.total} done this month` : 'Nothing planned this month yet'}</div>
    <div class="calweekdays">${CALENDAR_WEEKDAY_LABELS.map(d => `<span>${d}</span>`).join('')}</div>
    <div class="calgrid">
      ${cells.map(c => c.blank
        ? `<div class="calcell calblank"></div>`
        : `<button class="calcell ${c.isToday ? 'today' : ''} ${c.exists ? 'exists' : ''}" onclick="openCalendarDay('${c.dateStr}')" title="${c.exists ? 'This day is already logged' : 'Not logged yet'}">
             <span class="caldatenum">${c.dayNum}</span>
             ${c.total ? `<span class="calratio">${c.done}/${c.total}</span>` : (c.exists ? `<span class="calratio calexistsdot">·</span>` : '')}
           </button>`
      ).join('')}
    </div>
  `;
}

// Reached only when the (dev-only) 'calendar' category type is enabled
// and a tab of that type exists — see toggleDevSetting('calendarTabTypeEnabled', ...)
// in the Dev Settings section. Not the normal path any more (that's
// renderDailyCalendar() below) but kept working since the rendering code
// underneath (calendarBodyHtml() etc.) is the same either way.
function renderCalendar(){
  const el = document.getElementById('calendarView');
  const todayOpen = tabOpenCount('daily');
  // A compact page tag, same component the checklist overview's "Pending"
  // trigger uses — matched purely by sharing the .pagetag.compact class,
  // so it automatically picks up whatever dev pendingTagStyle/
  // pendingTagColor is set, no calendar-specific wiring needed.
  el.innerHTML = `
    ${pageTagHtml(`openCalendarDay('${todayStr()}')`, todayOpen > 0 ? `Today · ${todayOpen}` : 'Today', true)}
    ${calendarBodyHtml(calendarMonth())}
  `;
}

// The normal way to reach a calendar view — a compact "Calendar" tag on
// Daily's own day list (renderDayList() in 11-daily-core.js), mirroring
// the checklist overview's "Pending" trigger. Wrapped in .stackedpage
// with a plain back tag to Daily, same pattern renderChecklistPending()
// uses — one page-tag per page, unlike renderCalendar() above (which is
// itself a base view, not a drilldown, so its compact tag is a forward
// shortcut rather than a "back").
function renderDailyCalendar(){
  return `
    <div class="stackedpage">
      ${pageTagHtml('closeDailyCalendar()', 'Daily')}
      ${calendarBodyHtml(calendarMonth())}
    </div>
  `;
}

function openDailyCalendar(){
  dailyCalendarOpen = true;
  renderDaily();
}
function closeDailyCalendar(){
  dailyCalendarOpen = false;
  renderDaily();
}

// Clicking any date — whether or not it already has a state.days entry —
// jumps straight into that day's own detail page, same page Daily's own
// day list opens. Mirrors addDay()/confirmPickDate()'s "only pushUndo if
// this actually creates a new day" rule: ensureDay() itself is a no-op
// (and ends up not calling queueSave()) for a date already in state.days,
// so tracking an undo step for that case would record a change that
// never happened. Always closes dailyCalendarOpen (harmless if it was
// already false, e.g. reached via the category-tab path instead) and
// switches to 'daily' — both hosts land on the exact same day-detail
// page this way, which is what "opens up the Page for the Daily" asked
// for either way you got here.
async function openCalendarDay(dateStr){
  if(!state.days.includes(dateStr)) pushUndo('Added a day');
  await ensureDay(dateStr);
  dailyCalendarOpen = false;
  switchTab('daily');
  openDay(dateStr);
}
