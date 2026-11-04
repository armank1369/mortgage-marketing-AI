export function loadSchedule(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key))
    return /^\d+$/.test(data?.revision) && Array.isArray(data?.entries) && Array.isArray(data?.campaigns) ? data : null
  } catch { return null }
}

export function calendarEntry(row) {
  // The Calendar grid shows the wall date in the event's scheduling zone.
  const instant = new Date(row.scheduled_for)
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: row.timezone, year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(instant).map(({ type, value }) => [type, value]))
  return { ...row, date: new Date(+parts.year, +parts.month - 1, +parts.day),
    time: row.untimed ? '' : instant.toLocaleTimeString('en-US', { timeZone: row.timezone, hour: 'numeric', minute: '2-digit' }),
    status: ({ planned: 'Scheduled', published: 'Completed', ready: 'Ready', cancelled: 'Cancelled' })[row.status] || row.status }
}

function localInstant(entry) {
  const date = new Date(entry.date)
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec((entry.time || '').trim())
  if (!match && entry.time) throw Error('Choose an explicit posting time before saving.')
  const [, h = '0', m = '0', period] = match || []
  if (+m > 59 || +h > (period ? 12 : 23) || (period && !+h)) throw Error('Invalid posting time.')
  const hour = period ? +h % 12 + (period.toUpperCase() === 'PM' ? 12 : 0) : +h
  date.setHours(hour, +m, 0, 0)
  if (date.getHours() !== hour) throw Error('That local time does not exist. Choose another time.')
  return date.toISOString()
}

export function wireEntry(entry) {
  return { topic: entry.topic, platform: entry.platform, format: entry.format, details: entry.details,
    localId: entry.id == null ? undefined : String(entry.id), batchId: entry.batchId, status: entry.status, untimed: entry.original?.untimed ?? !entry.time,
    scheduled_for: entry.original?.scheduled_for || localInstant(entry),
    timezone: entry.original?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone }
}
