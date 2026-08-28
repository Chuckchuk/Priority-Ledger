// ---------- Calendar view ----------
// A month grid over the exact same state.days/plannedDates data the
// Daily tab lists day-by-day. Nothing here owns or duplicates any data —
// every number on the grid comes straight from dayItemsSummary(), the
// same function Daily's own day-list/day-detail already use, so the two
// views can never disagree about what's on a given day.
//
// Two entry points share this same grid markup (see calendarBodyHtml()):
//   - renderDailyCalendar() — a compact "Calendar" tag on Daily's own day
//     list (see renderDayList() in 11-daily-core.js) opens this. Deliberately
//     NOT wrapped in .stackedpage, and its own tag back to the day list is
//     compact too (a "Daily" tag, same component as "Calendar"/"Pending") —
//     the day list and the calendar are two peer views of the one Daily
//     tab, not a page and a drilldown on top of it, so neither should read
//     as "stacked over" the other. This is the normal way anyone reaches a
//     calendar view.
//   - renderCalendar() — an optional 'calendar' category type
//     (isCalendarCategory() in 01-categories-theme.js), gated behind the
//     calendarTabTypeEnabled dev setting (see devSettingsFieldsHtml() in
//     01-categories-theme.js). Kept working rather than deleted since it
//     was already-functional code, just no longer the primary path.

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
  // dayCategoryIds() is only worth computing when the active
  // calendarCellStyle actually shows category chips — the default
  // ('ratio') never reads `cats`, so there's no reason to pay for it on
  // every cell for every real user who hasn't opted into the dev variant.
  const needsCats = (state.devSettings.calendarCellStyle || 'ratio') !== 'ratio';
  const cells = [];
  for(let i = 0; i < startWeekday; i++) cells.push({ blank: true });
  for(let d = 1; d <= daysInMonth; d++){
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const { total, done } = dayItemsSummary(dateStr);
    cells.push({ blank: false, dateStr, dayNum: d, isToday: dateStr === today, exists: state.days.includes(dateStr), total, done, cats: needsCats ? dayCategoryIds(dateStr) : [] });
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

// Small category chips for the calendar's dev-only calendarCellStyle
// variants — 'dots-top' (plain color swatches) or 'icons-below' (colored
// glyphs, the same CATEGORY_ICON_GLYPHS every other category marker in
// the app uses). Capped at CALENDAR_CELL_CAT_CAP with a "+N" overflow
// chip rather than wrapping unbounded — a calendar cell is a fixed
// aspect-ratio:1 box (see .calcell in <style>), so more chips than fit
// would spill past the cell's own edges on a narrow (phone-width) card
// instead of growing it; .calcell's own overflow:hidden is the last-
// resort backstop if this cap is ever raised too far.
const CALENDAR_CELL_CAT_CAP = 3;
function calendarCatChipsHtml(cats, iconMode){
  if(!cats.length) return '';
  const shown = cats.slice(0, CALENDAR_CELL_CAT_CAP);
  const overflow = cats.length - shown.length;
  const chips = shown.map(c => iconMode
    ? `<span class="calcatchip icon" style="color:${c.hex}">${CATEGORY_ICON_GLYPHS[c.icon] || CATEGORY_ICON_GLYPHS.dot}</span>`
    : `<span class="calcatchip dot" style="background:${c.hex}"></span>`
  ).join('');
  const overflowHtml = overflow > 0 ? `<span class="calcatchip more">+${overflow}</span>` : '';
  return `<span class="calcatchips">${chips}${overflowHtml}</span>`;
}

// The nav row + summary + grid — everything both hosts share. Neither
// host's own tag(s) live in here, since the label/action differs per host
// (a compact "Today" shortcut for the category-tab overview vs. a compact
// "Daily" tag back to the day list for the normal, Daily-embedded path).
function calendarBodyHtml(monthKeyStr){
  const cells = calendarMonthCells(monthKeyStr);
  const summary = calendarMonthSummary(monthKeyStr);
  const cellStyle = state.devSettings.calendarCellStyle || 'ratio';
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
             ${cellStyle==='dots-top' ? calendarCatChipsHtml(c.cats, false) : ''}
             <span class="caldatenum">${c.dayNum}</span>
             ${c.total ? `<span class="calratio">${c.done}/${c.total}</span>` : (c.exists ? `<span class="calratio calexistsdot">·</span>` : '')}
             ${cellStyle==='icons-below' ? calendarCatChipsHtml(c.cats, true) : ''}
           </button>`
      ).join('')}
    </div>
  `;
}

// Reached only when the (dev-only) 'calendar' category type is enabled
// and a tab of that type exists — see toggleDevSetting('calendarTabTypeEnabled', ...)
// in the Dev Settings section. Not the normal path any more (that's
// renderDailyCalendar() below) but kept working since the rendering code
// underneath (calendarBodyHtml() etc.) is the same either way. Pure
// (reads global state, no DOM writes) so currentTabBodyHtml() in
// 08-render-core.js — used to preview a tab's real content behind a
// back-swipe (see swipeBackPreviewHtml() in 19-bootstrap.js) — can call
// it directly rather than duplicating this markup.
function calendarTabBodyHtml(){
  const todayOpen = tabOpenCount('daily');
  // A compact page tag, same component the checklist overview's "Pending"
  // trigger uses — matched purely by sharing the .pagetag.compact class,
  // so it automatically picks up whatever dev pendingTagStyle/
  // pendingTagColor is set, no calendar-specific wiring needed.
  return `
    ${pageTagHtml(`openCalendarDay('${todayStr()}')`, todayOpen > 0 ? `Today · ${todayOpen}` : 'Today', true)}
    ${calendarBodyHtml(calendarMonth())}
  `;
}
function renderCalendar(){
  document.getElementById('calendarView').innerHTML = calendarTabBodyHtml();
}

// The normal way to reach a calendar view — a compact "Calendar" tag on
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
  renderDaily();
}
function closeDailyCalendar(){
  dailyCalendarOpen = false;
  renderDaily();
}

// Clicking any date — whether or not it already has a state.days entry —
// jumps straight into that day's own detail page, same page Daily's own
// day list opens. Mirrors addDay()/addDayByText()'s "only pushUndo if
// this actually creates a new day" rule: ensureDay() itself is a no-op
// (and ends up not calling queueSave()) for a date already in state.days,
// so tracking an undo step for that case would record a change that
// never happened. Always closes dailyCalendarOpen (harmless if it was
// already false, e.g. reached via the category-tab path instead) and
// switches to 'daily' — both hosts land on the exact same day-detail
// page this way, which is what "opens up the Page for the Daily" asked
// for either way you got here. openDay(dateStr, true) marks the day as
// reached from the calendar (see dayReturnToCalendar in
// 02-storage-state.js) so its own back tag — and Esc — return to the
// calendar instead of the plain day list.
async function openCalendarDay(dateStr){
  if(!state.days.includes(dateStr)) pushUndo('Added a day');
  await ensureDay(dateStr);
  dailyCalendarOpen = false;
  switchTab('daily');
  openDay(dateStr, true);
}
