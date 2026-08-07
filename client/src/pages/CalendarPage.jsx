import { useState } from 'react'

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

const inputClass =
  'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50/50'

export default function CalendarPage() {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const monthName = today.toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const grid = buildMonthGrid(year, month)

  const [entries, setEntries] = useState([
    { id: 1, topic: 'Educational reel for first-time buyers', platform: 'Instagram', date: new Date(year, month, 3), status: 'Scheduled' },
    { id: 2, topic: 'Self-employed success story', platform: 'LinkedIn', date: new Date(year, month, 10), status: 'Completed' },
    { id: 3, topic: 'Home buying tips carousel', platform: 'Instagram', date: new Date(year, month, 17), status: 'Upcoming' },
    { id: 4, topic: 'Lead magnet post', platform: 'Facebook', date: new Date(year, month, 24), status: 'Upcoming' },
  ])

  const [showForm, setShowForm] = useState(false)
  const [formTopic, setFormTopic] = useState('')
  const [formPlatform, setFormPlatform] = useState(PLATFORMS[0])
  const [formDate, setFormDate] = useState(`${year}-${String(month + 1).padStart(2, '0')}-01`)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formTopic.trim() || !formDate) return
    const [y, m, d] = formDate.split('-').map(Number)
    setEntries((prev) => [
      ...prev,
      {
        id: Date.now(),
        topic: formTopic.trim(),
        platform: formPlatform,
        date: new Date(y, m - 1, d),
        status: 'Scheduled',
      },
    ])
    setFormTopic('')
    setFormPlatform(PLATFORMS[0])
    setShowForm(false)
  }

  const entriesByKey = (day) =>
    entries
      .filter((entry) => entry.date.toDateString() === day.toDateString())
      .sort((a, b) => a.date - b.date)

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-white border-b border-slate-200 px-6 py-3 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <h2 className="text-sm font-semibold text-slate-900">{monthName}</h2>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm shadow-blue-200"
        >
          + New Entry
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden bg-white">
          {DAY_LABELS.map((label) => (
            <div key={label} className="bg-white px-3 py-2 text-xs font-semibold text-slate-500 text-center">
              {label}
            </div>
          ))}

          {grid.map((day, i) => {
            const inMonth = day.getMonth() === month
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
                  {dayEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5"
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`inline-block px-1.5 py-px rounded text-[10px] font-semibold ${STATUS_STYLES[entry.status]}`}>
                          {entry.status}
                        </span>
                      </div>
                      <p className="text-[11px] leading-tight text-slate-800 truncate">{entry.topic}</p>
                      <p className="text-[10px] text-slate-400">{entry.platform}</p>
                    </div>
                  ))}
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

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Date</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className={inputClass}
                />
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
    </div>
  )
}
