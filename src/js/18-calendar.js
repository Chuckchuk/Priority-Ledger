// ---------- Calendar category type ----------
// A calendar category's whole "content" is a month grid over the exact
// same state.days/plannedDates data the Daily tab lists day-by-day — see
// isCalendarCategory()'s comment in 01-categories-theme.js for why this
// is a category type rather than a second fixed tab. Nothing here owns
// or duplicates any data; every number on the grid comes straight from
// dayItemsSummary(), the same function Daily's own day-list/day-detail
// already use, so the two views can never disagree about what's on a
// given day.

// Which month is currently browsed — transient UI state, not persisted
// (same idiom as pickerOpen/expandedMonths), so it always starts back on
// the current month on a fresh load. Deliberately NOT reset by
// switchTab(): coming back to a calendar tab after a detour to some day's
// detail page should still show whatever month you were last looking at.
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

function calendarShiftMonth(delta){
  calendarViewMonth = shiftMonthKey(calendarMonth(), delta);
  renderCalendar();
}

function calendarJumpToday(){
  calendarViewMonth = monthKey(todayStr());
  renderCalendar();
}

// One cell per calendar day in the visible month, padded with blank
// leading/trailing cells so the grid always fills complete weeks (a
// ragged final row reads as a bug, not a design choice). Every day's
// total/done comes from dayItemsSummary() regardless of whether that
// date happens to be in state.days yet — a date with nothing planned
// just comes back {total:0, done:0}, no separate "does this day exist"
// branch needed.
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
    cells.push({ blank: false, dateStr, dayNum: d, isToday: dateStr === today, total, done });
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

function renderCalendar(){
  const el = document.getElementById('calendarView');
  const monthKeyStr = calendarMonth();
  const cells = calendarMonthCells(monthKeyStr);
  const summary = calendarMonthSummary(monthKeyStr);
  const todayOpen = tabOpenCount('daily');
  // A compact page tag, same component the checklist overview's "Pending"
  // trigger uses — matched purely by sharing the .pagetag.compact class,
  // so it automatically picks up whatever dev pendingTagStyle/
  // pendingTagColor is set, no calendar-specific wiring needed (this is
  // the "linked dev options" the tag styling was asked for). Doubles as
  // a genuine "jump to today" shortcut, which a month grid benefits from
  // more than a single overview list does — you can be several months
  // away from today after browsing.
  el.innerHTML = `
    ${pageTagHtml(`openCalendarDay('${todayStr()}')`, todayOpen > 0 ? `Today · ${todayOpen}` : 'Today', true)}
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
        : `<button class="calcell ${c.isToday ? 'today' : ''} ${c.total ? 'hasdata' : ''}" onclick="openCalendarDay('${c.dateStr}')">
             <span class="caldatenum">${c.dayNum}</span>
             ${c.total ? `<span class="calratio">${c.done}/${c.total}</span>` : ''}
           </button>`
      ).join('')}
    </div>
  `;
}

// Clicking any date — whether or not it already has a state.days entry —
// jumps straight into that day's own detail page, same page Daily's own
// day list opens. Mirrors addDay()/confirmPickDate()'s "only pushUndo if
// this actually creates a new day" rule: ensureDay() itself is a no-op
// (and ends up not calling queueSave()) for a date already in state.days,
// so tracking an undo step for that case would record a change that
// never happened. Actually switching tabs to 'daily' (rather than
// building a calendar-local day-detail path) is deliberate — it's what
// the prev/next day arrows, "move incomplete to tomorrow", and every
// other piece of the day-detail page already assume they're running
// under, so reusing it here for free is both less code and exactly what
// "opens up the Page for the Daily" describes.
async function openCalendarDay(dateStr){
  if(!state.days.includes(dateStr)) pushUndo('Added a day');
  await ensureDay(dateStr);
  switchTab('daily');
  openDay(dateStr);
}
