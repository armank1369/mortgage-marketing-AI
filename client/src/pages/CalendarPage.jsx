import { useState } from 'react'
import { useCalendar } from '../context/CalendarContext'
import ContentBriefCard, { FORMAT_BADGES } from '../components/ContentBriefCard'
import platformBadge from '../components/platformBadge'

const PLATFORMS = ['Instagram', 'LinkedIn', 'Facebook', 'X (Twitter)', 'TikTok', 'YouTube']

const STATUS_STYLES = {
  Completed: 'bg-emerald-100 text-emerald-700',
  Scheduled: 'bg-blue-100 text-blue-700',
  Upcoming: 'bg-slate-100 text-slate-600',
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1)
  const start = new Date(year, month, 1 - firstDay.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

// Converts a native <input type="time"> value ("HH:MM", 24h) into the same "8:00 AM"-style
// label the AI-generated calendar entries already use, so manually added entries read the
// same way on the card.
function formatTimeLabel(value) {
  const [h, m] = value.split(':').map(Number)
  const period = h < 12 ? 'AM' : 'PM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

const inputClass =
  'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50/50'

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
    </svg>
  )
}

function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

// Entries saved from the chat (single posts, or a generated content_calendar) carry a
// `details` payload — script/creative-direction/hashtags — so this modal can show the exact
// same ContentBriefCard breakdown as the source card. A manually added or seed entry has no
// `details`, so it gracefully falls back to just the schedule info (topic/platform/date/time).
function EntryDetailModal({ entry, onClose }) {
  const script = entry.details?.script || null

  const buildCopyText = () => {
    if (script) {
      return script
        .map((line) => (line.slides ? `${line.label}:\n${line.slides.join('\n\n')}` : line.text ? `${line.label}: ${line.text}` : ''))
        .filter(Boolean)
        .join('\n\n')
    }
    return entry.topic
  }

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-10"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-2 flex-wrap">
            {entry.status && (
              <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${STATUS_STYLES[entry.status]}`}>
                {entry.status}
              </span>
            )}
            <span className="text-xs text-slate-500">
              {entry.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              {entry.time && ` · ${entry.time}`}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 p-1 -m-1 rounded-md hover:bg-slate-100 transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-5">
          <ContentBriefCard
            title={entry.topic}
            platform={entry.platform}
            format={entry.format}
            script={script}
            direction={entry.details?.direction}
            details={entry.details?.quickDetails}
            hashtags={entry.details?.hashtags}
            onCopyText={buildCopyText}
          />
        </div>
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const { entries, addEntry, removeEntry } = useCalendar()
  const today = new Date()
  // The month currently on screen — starts on today's month but moves independently once the
  // user navigates, while `today` above stays fixed to the real date for the "today" highlight
  // and the "+ New Entry" form's default date.
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const monthName = viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const grid = buildMonthGrid(viewDate.getFullYear(), viewDate.getMonth())

  const [showForm, setShowForm] = useState(false)
  const [formTopic, setFormTopic] = useState('')
  const [formPlatform, setFormPlatform] = useState(PLATFORMS[0])
  const [formDate, setFormDate] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`)
  const [formTime, setFormTime] = useState('')

  const [selectedEntry, setSelectedEntry] = useState(null)
  const [entryToDelete, setEntryToDelete] = useState(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formTopic.trim() || !formDate) return
    const [y, m, d] = formDate.split('-').map(Number)
    addEntry({
      topic: formTopic.trim(),
      platform: formPlatform,
      format: 'text-only',
      date: new Date(y, m - 1, d),
      time: formTime ? formatTimeLabel(formTime) : '',
      status: 'Scheduled',
    })
    setFormTopic('')
    setFormPlatform(PLATFORMS[0])
    setFormTime('')
    setShowForm(false)
  }

  const confirmDelete = () => {
    if (!entryToDelete) return
    removeEntry(entryToDelete.id)
    setEntryToDelete(null)
  }

  const entriesByKey = (day) =>
    entries
      .filter((entry) => entry.date.toDateString() === day.toDateString())
      .sort((a, b) => a.date - b.date)

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          <button
            type="button"
            onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            aria-label="Previous month"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <ChevronLeftIcon />
          </button>
          <h2 className="text-sm font-semibold text-slate-900 truncate px-1 min-w-[9rem] text-center">{monthName}</h2>
          <button
            type="button"
            onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            aria-label="Next month"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <ChevronRightIcon />
          </button>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm shadow-blue-200 shrink-0"
        >
          + New Entry
        </button>
      </header>

      {/* Fixed-width grid (700px) scrolls horizontally below that — a 7-day week squeezed
          into a phone's ~350px usable width would make every cell too narrow to read, so this
          trades "see the whole week at once" for "each day stays legible," same tradeoff a
          swipeable native calendar app makes. */}
      <div className="flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-6">
        <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden bg-white min-w-[700px]">
          {DAY_LABELS.map((label) => (
            <div key={label} className="bg-white px-3 py-2 text-xs font-semibold text-slate-500 text-center">
              {label}
            </div>
          ))}

          {grid.map((day, i) => {
            const inMonth = day.getMonth() === viewDate.getMonth()
            const dayEntries = entriesByKey(day)
            const isToday = day.toDateString() === today.toDateString()
            return (
              <div
                key={i}
                className={`min-h-[110px] p-2 bg-white ${inMonth ? '' : 'bg-slate-50/50'}`}
              >
                <div className={`text-xs font-medium mb-1.5 ${
                  isToday
                    ? 'w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center'
                    : inMonth ? 'text-slate-700' : 'text-slate-300'
                }`}>
                  {day.getDate()}
                </div>
                <div className="space-y-1">
                  {dayEntries.map((entry) => {
                    const badge = platformBadge(entry.platform)
                    const formatBadge = entry.format ? FORMAT_BADGES[entry.format] : null
                    return (
                      <div
                        key={entry.id}
                        onClick={() => setSelectedEntry(entry)}
                        className="group relative rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 cursor-pointer hover:border-slate-300 hover:bg-white transition-colors"
                      >
                        <div className="flex items-center gap-1.5 mb-0.5 pr-4">
                          <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold shrink-0 ${badge.className}`}>
                            {badge.label}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-600 truncate">{entry.platform}</span>
                        </div>
                        <p className="text-[11px] leading-tight text-slate-800 truncate">{entry.topic}</p>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1">
                          {formatBadge && (
                            <span className="inline-flex items-center gap-0.5">
                              {formatBadge.icon} {formatBadge.label}
                            </span>
                          )}
                          {entry.time && <span>{formatBadge ? '· ' : ''}{entry.time}</span>}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEntryToDelete(entry)
                          }}
                          aria-label={`Delete ${entry.topic}`}
                          className="absolute top-1 right-1 p-1 rounded-md transition-all opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 hover:bg-slate-200"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-10">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-md"
          >
            <h3 className="text-base font-semibold text-slate-900 mb-4">New Calendar Entry</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Topic</label>
                <input
                  type="text"
                  value={formTopic}
                  onChange={(e) => setFormTopic(e.target.value)}
                  placeholder="e.g. Client testimonial post"
                  className={inputClass}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Platform</label>
                <select
                  value={formPlatform}
                  onChange={(e) => setFormPlatform(e.target.value)}
                  className={inputClass}
                >
                  {PLATFORMS.map((platform) => (
                    <option key={platform} value={platform}>{platform}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Date</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Time (optional)</label>
                  <input
                    type="time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!formTopic.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm shadow-blue-200"
              >
                Add Entry
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedEntry && (
        <EntryDetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}

      {entryToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-sm font-semibold text-slate-900">
              Remove "{entryToDelete.topic}" from the calendar? This cannot be undone.
            </h3>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setEntryToDelete(null)}
                className="flex-1 text-slate-500 hover:text-slate-700 text-xs font-medium py-2 rounded-lg transition-colors border border-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
