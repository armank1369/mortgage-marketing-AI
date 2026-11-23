// Pure date and grouping helpers for the Calendar page. Kept free of React so they can be
// unit tested with node --test like the rest of src/lib.

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Same shape as a native <input type="date"> value.
export const toDateInputValue = dayKey

export function fromDateInputValue(value) {
  const [y, m, d] = String(value).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

// Six full Sunday-start weeks so the grid never changes height between months.
export function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1)
  const start = addDays(first, -first.getDay())
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export function weekDays(date) {
  const start = addDays(startOfDay(date), -date.getDay())
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

// "8:00 AM" / "12:30 PM" -> minutes after midnight. Untimed or unreadable entries sort last.
export function timeToMinutes(label) {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i.exec((label || '').trim())
  if (!match) return 24 * 60
  const hour = (+match[1] % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0)
  return hour * 60 + (+match[2] || 0)
}

// Native <input type="time"> value ("HH:MM", 24h) -> "8:00 AM", the label format entries use.
export function formatTimeLabel(value) {
  if (!value) return ''
  const [h, m] = value.split(':').map(Number)
  const period = h < 12 ? 'AM' : 'PM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

// "8:00 AM" -> "08:00" for a native time input. Empty for untimed entries.
export function toTimeInputValue(label) {
  const minutes = timeToMinutes(label)
  if (minutes >= 24 * 60) return ''
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export function sortEntries(entries) {
  return [...entries].sort((a, b) => a.date - b.date || timeToMinutes(a.time) - timeToMinutes(b.time) || String(a.topic).localeCompare(String(b.topic)))
}

// Map of dayKey -> entries sorted by time, so each grid cell is a lookup instead of a filter.
export function groupByDay(entries) {
  const groups = new Map()
  for (const entry of sortEntries(entries)) {
    const key = dayKey(entry.date)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(entry)
  }
  return groups
}

export function entryIsPast(entry, now) {
  if (startOfDay(entry.date) < startOfDay(now)) return true
  if (!sameDay(entry.date, now)) return false
  const minutes = timeToMinutes(entry.time)
  return minutes < 24 * 60 && minutes < now.getHours() * 60 + now.getMinutes()
}

// Summary numbers for the strip above the grid: what is planned in the visible month, how
// much is coming up in the next seven days, the next post, the platform mix, and the
// weekdays left in the rest of the month with nothing planned (gaps worth filling).
export function monthStats(entries, viewDate, now) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const inMonth = entries.filter((e) => e.date.getFullYear() === year && e.date.getMonth() === month)
  const weekEnd = addDays(startOfDay(now), 7)
  const upcoming = sortEntries(entries.filter((e) => !entryIsPast(e, now) && e.status !== 'Cancelled'))
  const nextSeven = upcoming.filter((e) => e.date < weekEnd)
  const platforms = {}
  for (const entry of inMonth) platforms[entry.platform || 'Other'] = (platforms[entry.platform || 'Other'] || 0) + 1
  const busy = new Set(inMonth.map((e) => dayKey(e.date)))
  const gaps = []
  const last = new Date(year, month + 1, 0)
  for (let d = new Date(Math.max(new Date(year, month, 1), startOfDay(now))); d <= last; d = addDays(d, 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6 && !busy.has(dayKey(d))) gaps.push(d)
  }
  return {
    total: inMonth.length,
    published: inMonth.filter((e) => e.status === 'Completed').length,
    nextSeven: nextSeven.length,
    next: upcoming[0] || null,
    platforms: Object.entries(platforms).sort((a, b) => b[1] - a[1]),
    gaps,
  }
}

// A short list of suggested times from the full half-hour window, spread across it.
export function suggestTimes(options, count = 4) {
  if (options.length <= count) return options
  const step = (options.length - 1) / (count - 1)
  return Array.from({ length: count }, (_, i) => options[Math.round(i * step)])
}
