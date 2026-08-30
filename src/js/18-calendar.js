// ---------- Calendar view ----------
// A month grid over the exact same state.days/plannedDates data the
// Daily tab lists day-by-day. Nothing here owns or duplicates any data —
// every number on the grid comes straight from dayItemsSummary(), the
// same function Daily's own day-list/day-detail already use, so the two
// views can never disagree about what's on a given day.
//
// Reached via renderDailyCalendar() — a compact "Calendar" tag on Daily's
// own day list (see renderDayList() in 11-daily-core.js). Deliberately
// NOT wrapped in .stackedpage, and its own tag back to the day list is
// compact too (a "Daily" tag, same component as "Calendar"/"Pending") —
// the day list and the calendar are two peer views of the one Daily tab,
// not a page and a drilldown on top of it, so neither should read as
// "stacked over" the other. (An earlier pass also offered 'calendar' as
// its own addable category type, a whole second tab — that path is gone
// now; this compact-tag link was always the one actually used.)

// Which month is currently browsed — transient UI state, not persisted
// (same idiom as expandedMonths), so it always starts back on
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

function calendarShiftMonth(delta){
  calendarViewMonth = shiftMonthKey(calendarMonth(), delta);
  renderDaily();
}

function calendarJumpToday(){
  calendarViewMonth = monthKey(todayStr());
  renderDaily();
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
    cells.push({ blank: false, dateStr, dayNum: d, isToday: dateStr === today, exists: state.days.includes(dateStr), total, done, cats: dayCategoryIds(dateStr) });
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

// Small category-color chips shown above each calendar cell's date — the
// "+ category color dots, above the date" calendarCellStyle was the
// project owner's confirmed choice (an "icons-below" glyph variant used
// to exist alongside it as a dev-only alternative; removed once dots-top
// won). Capped at CALENDAR_CELL_CAT_CAP with a "+N" overflow chip rather
// than wrapping unbounded — a calendar cell is a fixed aspect-ratio:1 box
// (see .calcell in <style>), so more chips than fit would spill past the
// cell's own edges on a narrow (phone-width) card instead of growing it;
// .calcell's own overflow:hidden is the last-resort backstop if this cap
// is ever raised too far.
const CALENDAR_CELL_CAT_CAP = 3;
function calendarCatChipsHtml(cats){
  if(!cats.length) return '';
  const shown = cats.slice(0, CALENDAR_CELL_CAT_CAP);
  const overflow = cats.length - shown.length;
  const chips = shown.map(c => `<span class="calcatchip dot" style="background:${c.hex}"></span>`).join('');
  const overflowHtml = overflow > 0 ? `<span class="calcatchip more">+${overflow}</span>` : '';
  return `<span class="calcatchips">${chips}${overflowHtml}</span>`;
}

function calendarBodyHtml(monthKeyStr){
  const cells = calendarMonthCells(monthKeyStr);
  const summary = calendarMonthSummary(monthKeyStr);
  return `
    <div class="calnav">
      <button class="navarrow" onclick="calendarShiftMonth(-1)" title="Previous month">‹</button>
      <button class="calmonthlabel" onclick="calendarJumpToday()" title="Jump to the current month"><span class="herotext">${monthLabel(monthKeyStr)}</span></button>
      <button class="navarrow" onclick="calendarShiftMonth(1)" title="Next month">›</button>
    </div>
    <div class="calsummary">${summary.total ? `${summary.done} of ${summary.total} done this month` : 'Nothing planned this month yet'}</div>
    <div class="calweekdays">${CALENDAR_WEEKDAY_LABELS.map(d => `<span>${d}</span>`).join('')}</div>
    <div class="calgrid">
      ${cells.map(c => c.blank
        ? `<div class="calcell calblank"></div>`
        : `<button class="calcell ${c.isToday ? 'today' : ''} ${c.exists ? 'exists' : ''}" onclick="openCalendarDay('${c.dateStr}')" title="${c.exists ? 'This day is already logged' : 'Not logged yet'}">
             ${calendarCatChipsHtml(c.cats)}
             <span class="caldatenum">${c.dayNum}</span>
             ${c.total ? `<span class="calratio">${c.done}/${c.total}</span>` : (c.exists ? `<span class="calratio calexistsdot">·</span>` : '')}
           </button>`
      ).join('')}
    </div>
  `;
}

// The normal (and, since the 'calendar' category-type path was removed,
// only) way to reach a calendar view — a compact "Calendar" tag on
// Daily's own day list (renderDayList() in 11-daily-core.js), mirroring
// the checklist overview's "Pending" trigger. Its own tag back to the day
// list is compact too (no .stackedpage) — see the file-header comment
// above for why: the day list and this are peer views of the same Daily
// tab, so both link to each other the same small way, rather than one
// treating the other as a "back" destination out of a drilldown.
function renderDailyCalendar(){
  return `
    ${pageTagHtml('closeDailyCalendar()', 'Daily', true)}
    ${calendarBodyHtml(calendarMonth())}
  `;
}

function openDailyCalendar(){
  dailyCalendarOpen = true;
  setDailyLastView('calendar');
  renderDaily();
}
function closeDailyCalendar(){
  dailyCalendarOpen = false;
  setDailyLastView('list');
  renderDaily();
}

// Clicking any date — whether or not it already has a state.days entry —
// jumps straight into that day's own detail page, same page Daily's own
// day list opens. Mirrors addDay()/addDayByText()'s "only pushUndo if
// this actually creates a new day" rule: ensureDay() itself is a no-op
// (and ends up not calling queueSave()) for a date already in state.days,
// so tracking an undo step for that case would record a change that
// never happened. switchTab('daily') runs before openDay() — not
// clearing dailyCalendarOpen itself first the way this used to (openDay()
// now always does that on its own, see its own comment for why trusting
// a caller to have done it first was exactly what broke this) — and
// openDay(dateStr, true) marks the day as reached from the calendar (see
// dayReturnToCalendar in 02-storage-state.js) so its own back tag — and
// Esc — return to the calendar instead of the plain day list.
async function openCalendarDay(dateStr){
  if(!state.days.includes(dateStr)) pushUndo('Added a day');
  await ensureDay(dateStr);
  switchTab('daily');
  openDay(dateStr, true);
}
