import { useCallback, useEffect, useMemo, useState } from 'react'
import ComplianceNotice from '../components/ComplianceNotice.jsx'
import { useCalendar } from '../context/CalendarContext'
import ContentBriefCard, { FORMAT_BADGES } from '../components/ContentBriefCard'
import platformBadge from '../components/platformBadge'
import { recommendedPostingTimes } from '../utils/postingTimes'
import {
  DAY_LABELS, addDays, buildMonthGrid, dayKey, entryIsPast, formatTimeLabel, fromDateInputValue,
  groupByDay, monthStats, sameDay, startOfDay, suggestTimes, toDateInputValue,
  toTimeInputValue, weekDays,
} from '../lib/calendarView'

const PLATFORMS = ['Instagram', 'LinkedIn', 'Facebook', 'TikTok', 'X (Twitter)', 'YouTube']
const FORMATS = [
  ['text-only', 'Text post'],
  ['single-image', 'Single image'],
  ['carousel', 'Carousel'],
  ['video', 'Video'],
]

// One accent per platform, used for the chip's left rule and legend dot so a busy month can be
// scanned by channel at a glance.
const PLATFORM_ACCENTS = {
  linkedin: { rule: 'border-l-blue-600', dot: 'bg-blue-600', soft: 'bg-blue-50' },
  instagram: { rule: 'border-l-pink-500', dot: 'bg-pink-500', soft: 'bg-pink-50' },
  facebook: { rule: 'border-l-indigo-500', dot: 'bg-indigo-500', soft: 'bg-indigo-50' },
  tiktok: { rule: 'border-l-slate-900', dot: 'bg-slate-900', soft: 'bg-slate-100' },
  'x (twitter)': { rule: 'border-l-slate-500', dot: 'bg-slate-500', soft: 'bg-slate-100' },
  youtube: { rule: 'border-l-red-600', dot: 'bg-red-600', soft: 'bg-red-50' },
}
const accent = (platform) => PLATFORM_ACCENTS[(platform || '').toLowerCase()] || { rule: 'border-l-slate-400', dot: 'bg-slate-400', soft: 'bg-slate-100' }

const STATUS_STYLES = {
  Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  Scheduled: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  Ready: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  Cancelled: 'bg-slate-100 text-slate-500 ring-slate-500/20',
}
const STATUS_LABELS = { Completed: 'Published' }

const VIEWS = [['month', 'Month'], ['week', 'Week'], ['agenda', 'Agenda']]
const VIEW_KEY = 'lucie_calendar_view'
const MAX_CHIPS = 3

const inputClass =
  'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white'
const labelClass = 'block text-xs font-semibold text-slate-600 mb-1.5'
const primaryButton =
  'bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm'
const secondaryButton =
  'border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 text-sm font-medium px-3 py-2 rounded-lg transition-colors'

function Icon({ d, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
const ICONS = {
  close: 'M18 6L6 18M6 6l12 12',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  plus: 'M12 5v14M5 12h14',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
}

function readStoredView() {
  try {
    const stored = localStorage.getItem(VIEW_KEY)
    if (VIEWS.some(([id]) => id === stored)) return stored
  } catch { /* Storage can be unavailable; fall back below. */ }
  try { if (window.matchMedia('(max-width: 640px)').matches) return 'agenda' } catch { /* Older browsers. */ }
  return 'month'
}

function StatusPill({ status }) {
  if (!status) return null
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-inset ${STATUS_STYLES[status] || STATUS_STYLES.Cancelled}`}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

function PlatformDot({ platform, size = 'w-2 h-2' }) {
  return <span className={`inline-block rounded-full shrink-0 ${size} ${accent(platform).dot}`} aria-hidden="true" />
}

function PlatformBadge({ platform }) {
  const badge = platformBadge(platform)
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold shrink-0 ${badge.className}`} aria-hidden="true">
      {badge.label}
    </span>
  )
}

function Modal({ label, onClose, children, width = 'max-w-lg' }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl border border-slate-200 w-full ${width} max-h-[90dvh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function ModalHeader({ title, subtitle, onClose }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-slate-100 sticky top-0 bg-white z-10">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-slate-900 truncate">{title}</h3>
        {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
      </div>
      <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700 p-1.5 -m-1 rounded-md hover:bg-slate-100 transition-colors">
        <Icon d={ICONS.close} />
      </button>
    </div>
  )
}

// Recommended posting windows (the same guidance the AI uses) as one-tap chips beneath a time
// field, with times another post on that platform already holds marked as taken.
function TimeSuggestions({ platform, dateValue, value, onPick, taken }) {
  if (!dateValue) return null
  const options = suggestTimes(recommendedPostingTimes(platform, fromDateInputValue(dateValue)), 5)
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-slate-500 inline-flex items-center gap-1"><Icon d={ICONS.clock} size={12} /> Best times</span>
      {options.map((label) => {
        const inputValue = toTimeInputValue(label)
        const busy = taken?.has(label)
        const selected = value === inputValue
        return (
          <button
            key={label}
            type="button"
            onClick={() => onPick(inputValue)}
            title={busy ? 'Another post on this platform is already at this time' : undefined}
            className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
              selected ? 'bg-blue-600 border-blue-600 text-white'
                : busy ? 'border-slate-200 text-slate-400 line-through'
                : 'border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-700'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function takenTimes(entries, platform, dateValue, exceptId) {
  if (!dateValue) return new Set()
  const day = fromDateInputValue(dateValue)
  return new Set(entries.filter((e) => e.id !== exceptId && e.platform === platform && sameDay(e.date, day) && e.time).map((e) => e.time))
}

// Entries saved from the chat carry a `details` payload (script, creative direction, hashtags),
// shown with the same ContentBriefCard as the source. Manual entries fall back to schedule info.
function EntryDetailModal({ entry, onClose, onDelete, campaignName }) {
  const { canWrite, moveEntry, entries } = useCalendar()
  const [date, setDate] = useState(toDateInputValue(entry.date))
  const [time, setTime] = useState(toTimeInputValue(entry.time))
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const changed = date !== toDateInputValue(entry.date) || time !== toTimeInputValue(entry.time)
  const move = async () => {
    if (await moveEntry(entry.id, { ...entry, date: fromDateInputValue(date), time: formatTimeLabel(time) }, entry.openedRevision)) onClose()
  }
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
  const when = `${entry.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${entry.time ? ` at ${entry.time}` : ''}`

  return (
    <Modal label={entry.topic} onClose={onClose}>
      <ModalHeader
        title={entry.topic}
        onClose={onClose}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2"><StatusPill status={entry.status} />{when}{campaignName && <span className="text-slate-400">· {campaignName}</span>}</span>}
      />
      <div className="p-5 space-y-4">
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
        <ComplianceNotice flags={entry.details?.compliance_flags} />

        {canWrite && (
          <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <h4 className="text-sm font-semibold text-slate-900">Schedule</h4>
            <p className="text-xs text-slate-500 mt-0.5 mb-3">Times are in {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="entry-date">Date</label>
                <input id="entry-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="entry-time">Time</label>
                <input id="entry-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
              </div>
            </div>
            <TimeSuggestions platform={entry.platform} dateValue={date} value={time} onPick={setTime} taken={takenTimes(entries, entry.platform, date, entry.id)} />
            <div className="flex justify-end mt-3">
              <button type="button" disabled={!date || !changed} onClick={move} className={primaryButton}>Save new time</button>
            </div>
          </section>
        )}
      </div>
      {canWrite && (
        <div className="px-5 pb-5 flex items-center justify-between gap-3">
          {confirmingDelete ? (
            <div className="flex flex-1 items-center justify-between gap-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2">
              <span className="text-xs text-red-800">Remove this post from the shared calendar? This cannot be undone.</span>
              <span className="flex gap-2 shrink-0">
                <button type="button" onClick={() => setConfirmingDelete(false)} className="text-xs font-medium text-slate-600 px-2 py-1">Keep</button>
                <button type="button" onClick={() => onDelete(entry)} className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-md">Remove</button>
              </span>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmingDelete(true)} className="text-xs font-medium text-slate-500 hover:text-red-600 inline-flex items-center gap-1.5">
              <Icon d={ICONS.trash} size={13} /> Remove from calendar
            </button>
          )}
        </div>
      )}
    </Modal>
  )
}

function NewEntryModal({ initialDate, onClose }) {
  const { addEntry, entries, canWrite } = useCalendar()
  const [id] = useState(() => crypto.randomUUID())
  const [topic, setTopic] = useState('')
  const [platform, setPlatform] = useState(PLATFORMS[0])
  const [format, setFormat] = useState('single-image')
  const [date, setDate] = useState(toDateInputValue(initialDate))
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!topic.trim() || !date) return
    const ok = await addEntry({
      id,
      topic: topic.trim(),
      platform,
      format,
      date: fromDateInputValue(date),
      time: formatTimeLabel(time),
      status: 'Scheduled',
      details: notes.trim() ? { script: [{ label: 'Notes', text: notes.trim() }] } : undefined,
    })
    if (ok) onClose()
  }

  return (
    <Modal label="New post" onClose={onClose} width="max-w-md">
      <form onSubmit={submit}>
        <ModalHeader title="Plan a post" subtitle="Adds a post to the shared workspace calendar." onClose={onClose} />
        <div className="p-5 space-y-4">
          <div>
            <label className={labelClass} htmlFor="new-topic">Topic</label>
            <input id="new-topic" type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Client testimonial: closing in 21 days" className={inputClass} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="new-platform">Platform</label>
              <select id="new-platform" value={platform} onChange={(e) => setPlatform(e.target.value)} className={inputClass}>
                {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="new-format">Format</label>
              <select id="new-format" value={format} onChange={(e) => setFormat(e.target.value)} className={inputClass}>
                {FORMATS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="new-date">Date</label>
              <input id="new-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="new-time">Time <span className="font-normal text-slate-400">(optional)</span></label>
              <input id="new-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
            </div>
          </div>
          <TimeSuggestions platform={platform} dateValue={date} value={time} onPick={setTime} taken={takenTimes(entries, platform, date)} />
          <div>
            <label className={labelClass} htmlFor="new-notes">Notes <span className="font-normal text-slate-400">(optional)</span></label>
            <textarea id="new-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Angle, call to action, assets needed…" className={inputClass} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={!canWrite || !topic.trim() || !date} className={primaryButton}>Add to calendar</button>
        </div>
      </form>
    </Modal>
  )
}

function ClearModal({ onClose, entries, today }) {
  const { clearEntries, canWrite } = useCalendar()
  const [scope, setScope] = useState('day')
  const [date, setDate] = useState(toDateInputValue(today))
  const target = fromDateInputValue(date)
  const weekEnd = addDays(target, 6)
  const matches = (entry) => {
    if (scope === 'all') return true
    if (scope === 'day') return sameDay(entry.date, target)
    return entry.date >= target && entry.date < addDays(target, 7)
  }
  const count = entries.filter(matches).length
  const confirm = async () => { if (await clearEntries(matches)) onClose() }
  return (
    <Modal label="Clear calendar" onClose={onClose} width="max-w-sm">
      <ModalHeader title="Clear calendar" onClose={onClose} />
      <div className="p-5">
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg mb-4">
          {[['day', 'One day'], ['week', '7 days'], ['all', 'Everything']].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={scope === value} onClick={() => setScope(value)}
              className={`text-xs font-medium py-1.5 rounded-md transition-colors ${scope === value ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>
        {scope !== 'all' && (
          <div className="mb-4">
            <label className={labelClass} htmlFor="clear-date">{scope === 'day' ? 'Date' : 'Starting'}</label>
            <input id="clear-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            {scope === 'week' && (
              <p className="text-xs text-slate-500 mt-1.5">
                {target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} to {weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            )}
          </div>
        )}
        <p className="text-xs text-slate-600 mb-5">
          {count === 0 ? 'No posts match this selection.'
            : `This permanently deletes ${count} shared workspace ${count === 1 ? 'post' : 'posts'}. This cannot be undone.`}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={`${secondaryButton} flex-1`}>Cancel</button>
          <button type="button" onClick={confirm} disabled={!canWrite || count === 0}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2 rounded-lg transition-colors">
            Delete {count || ''}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function DayModal({ day, entries, onClose, onOpen, onAdd, canWrite, now }) {
  return (
    <Modal label={day.toDateString()} onClose={onClose} width="max-w-md">
      <ModalHeader title={day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        subtitle={`${entries.length} ${entries.length === 1 ? 'post' : 'posts'} planned`} onClose={onClose} />
      <div className="p-3 space-y-1">
        {entries.map((entry) => <AgendaRow key={entry.id} entry={entry} onOpen={onOpen} past={entryIsPast(entry, now)} />)}
      </div>
      {canWrite && day >= startOfDay(now) && (
        <div className="px-5 pb-5">
          <button type="button" onClick={() => onAdd(day)} className={`${secondaryButton} w-full inline-flex items-center justify-center gap-1.5`}>
            <Icon d={ICONS.plus} size={14} /> Add a post on this day
          </button>
        </div>
      )}
    </Modal>
  )
}

function EntryChip({ entry, onOpen, past }) {
  const format = entry.format ? FORMAT_BADGES[entry.format] : null
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(entry) }}
      title={`${entry.platform}${entry.time ? ` · ${entry.time}` : ''} · ${entry.topic}`}
      className={`w-full text-left flex items-center gap-1.5 rounded-md border-l-[3px] ${accent(entry.platform).rule} ${accent(entry.platform).soft} px-1.5 py-1 hover:brightness-95 transition ${past ? 'opacity-55' : ''} ${entry.status === 'Cancelled' ? 'line-through' : ''}`}
    >
      {entry.time && <span className="text-[10px] font-semibold text-slate-500 tabular-nums shrink-0">{entry.time.replace(':00', '').replace(' ', '').toLowerCase()}</span>}
      <span className="text-[11px] leading-tight text-slate-800 truncate">{entry.topic}</span>
      {format && <span className="ml-auto text-[10px] shrink-0" aria-label={format.label}>{format.icon}</span>}
      {entry.status === 'Completed' && <span className="text-[10px] text-emerald-600 shrink-0" aria-label="Published">✓</span>}
    </button>
  )
}

function EntryCard({ entry, onOpen, past }) {
  const format = entry.format ? FORMAT_BADGES[entry.format] : null
  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className={`w-full text-left rounded-lg border border-slate-200 border-l-[3px] ${accent(entry.platform).rule} bg-white p-2.5 shadow-sm hover:shadow hover:border-slate-300 transition ${past ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span className="font-semibold tabular-nums">{entry.time || 'Any time'}</span>
        <span className="inline-flex items-center gap-1 truncate"><PlatformDot platform={entry.platform} />{entry.platform}</span>
      </div>
      <p className="text-xs font-medium text-slate-900 mt-1 line-clamp-3">{entry.topic}</p>
      <div className="flex items-center justify-between gap-2 mt-1.5">
        {format ? <span className="text-[10px] text-slate-500">{format.icon} {format.label}</span> : <span />}
        {entry.status !== 'Scheduled' && <StatusPill status={entry.status} />}
      </div>
    </button>
  )
}

function AgendaRow({ entry, onOpen, past, campaignName }) {
  const format = entry.format ? FORMAT_BADGES[entry.format] : null
  return (
    <button type="button" onClick={() => onOpen(entry)}
      className={`w-full text-left flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50 transition-colors ${past ? 'opacity-60' : ''}`}>
      <span className="w-16 shrink-0 text-xs font-semibold text-slate-600 tabular-nums">{entry.time || 'Any time'}</span>
      <PlatformBadge platform={entry.platform} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900 line-clamp-2 sm:truncate">{entry.topic}</span>
        <span className="block text-xs text-slate-500 truncate">
          {entry.platform}{format ? ` · ${format.label}` : ''}{campaignName ? ` · ${campaignName}` : ''}
        </span>
      </span>
      <StatusPill status={entry.status} />
    </button>
  )
}

function StatsStrip({ stats, filters, toggleFilter, clearFilters, onOpen }) {
  return (
    <div className="px-4 sm:px-6 pt-4 grid gap-3 grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Planned this month</div>
        <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{stats.total}</div>
        <div className="text-xs text-slate-500">{stats.published} published</div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Next 7 days</div>
        <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{stats.nextSeven}</div>
        <div className="text-xs text-slate-500">{stats.nextSeven === 0 ? 'Nothing queued yet' : `${stats.nextSeven === 1 ? 'post' : 'posts'} queued`}</div>
      </div>
      <button type="button" disabled={!stats.next} onClick={() => stats.next && onOpen(stats.next)}
        className="col-span-2 lg:col-span-1 text-left rounded-xl border border-slate-200 bg-white px-4 py-3 enabled:hover:border-slate-300 transition-colors min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Up next</div>
        {stats.next ? (
          <>
            <div className="mt-1 text-sm font-semibold text-slate-900 truncate">{stats.next.topic}</div>
            <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
              <PlatformDot platform={stats.next.platform} />
              {stats.next.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}{stats.next.time ? ` · ${stats.next.time}` : ''}
            </div>
          </>
        ) : <div className="mt-1 text-sm text-slate-500">No upcoming posts</div>}
      </button>
      <div className="col-span-2 lg:col-span-1 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Platforms</div>
          {filters.size > 0 && <button type="button" onClick={clearFilters} className="text-[11px] text-blue-600 hover:underline">Show all</button>}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {stats.platforms.length === 0 && <span className="text-xs text-slate-500">No posts this month</span>}
          {stats.platforms.map(([platform, count]) => {
            const active = filters.size === 0 || filters.has(platform)
            return (
              <button key={platform} type="button" aria-pressed={filters.has(platform)} onClick={() => toggleFilter(platform)}
                className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-colors ${
                  filters.has(platform) ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 text-slate-700 hover:border-slate-300'
                } ${active ? '' : 'opacity-50'}`}>
                <PlatformDot platform={platform} />{platform}<span className="tabular-nums opacity-70">{count}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MonthView({ viewDate, byDay, today, now, onOpen, onAdd, onShowDay, canWrite }) {
  const grid = buildMonthGrid(viewDate.getFullYear(), viewDate.getMonth())
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px] rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {DAY_LABELS.map((label) => (
            <div key={label} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 grid-rows-6">
          {grid.map((day, i) => {
            const inMonth = day.getMonth() === viewDate.getMonth()
            const dayEntries = byDay.get(dayKey(day)) || []
            const isToday = sameDay(day, today)
            const isPast = day < startOfDay(today)
            const weekend = day.getDay() === 0 || day.getDay() === 6
            const hidden = dayEntries.length - MAX_CHIPS
            return (
              <div key={i}
                className={`group relative min-h-[118px] p-1.5 border-slate-100 ${i % 7 ? 'border-l' : ''} ${i >= 7 ? 'border-t' : ''} ${
                  !inMonth ? 'bg-slate-50/80' : weekend ? 'bg-slate-50/40' : 'bg-white'}`}>
                <div className="flex items-center justify-between mb-1 px-0.5">
                  <span className={`text-xs font-medium w-6 h-6 inline-flex items-center justify-center rounded-full ${
                    isToday ? 'bg-blue-600 text-white' : !inMonth ? 'text-slate-300' : isPast ? 'text-slate-400' : 'text-slate-700'}`}>
                    {day.getDate()}
                  </span>
                  {canWrite && !isPast && (
                    <button type="button" onClick={() => onAdd(day)} aria-label={`Add a post on ${day.toDateString()}`}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition">
                      <Icon d={ICONS.plus} size={14} />
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {dayEntries.slice(0, hidden > 0 ? MAX_CHIPS - 1 : MAX_CHIPS).map((entry) => (
                    <EntryChip key={entry.id} entry={entry} onOpen={onOpen} past={entryIsPast(entry, now)} />
                  ))}
                  {hidden > 0 && (
                    <button type="button" onClick={() => onShowDay(day)} className="w-full text-left text-[11px] font-medium text-slate-500 hover:text-slate-800 px-1.5 py-0.5 rounded hover:bg-slate-100">
                      +{hidden + 1} more
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function WeekView({ viewDate, byDay, today, now, onOpen, onAdd, canWrite }) {
  const days = weekDays(viewDate)
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[840px] grid grid-cols-7 gap-2">
        {days.map((day) => {
          const dayEntries = byDay.get(dayKey(day)) || []
          const isToday = sameDay(day, today)
          const isPast = day < startOfDay(today)
          return (
            <div key={dayKey(day)} className={`rounded-xl border ${isToday ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 bg-slate-50/60'} flex flex-col min-h-[420px]`}>
              <div className="px-3 py-2 border-b border-slate-200/70 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{DAY_LABELS[day.getDay()]}</div>
                  <div className={`text-lg font-semibold leading-tight ${isToday ? 'text-blue-700' : isPast ? 'text-slate-400' : 'text-slate-900'}`}>{day.getDate()}</div>
                </div>
                <span className="text-[11px] text-slate-400 tabular-nums">{dayEntries.length || ''}</span>
              </div>
              <div className="p-2 space-y-2 flex-1">
                {dayEntries.map((entry) => <EntryCard key={entry.id} entry={entry} onOpen={onOpen} past={entryIsPast(entry, now)} />)}
                {canWrite && !isPast && (
                  <button type="button" onClick={() => onAdd(day)}
                    className="w-full text-xs text-slate-400 hover:text-blue-600 border border-dashed border-slate-300 hover:border-blue-400 rounded-lg py-2 inline-flex items-center justify-center gap-1 transition-colors">
                    <Icon d={ICONS.plus} size={12} /> Add
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AgendaView({ viewDate, byDay, today, now, onOpen, onAdd, canWrite, campaignName }) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const days = [...byDay.keys()].filter((key) => {
    const d = fromDateInputValue(key)
    return d.getFullYear() === year && d.getMonth() === month
  }).sort()
  if (days.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-sm font-medium text-slate-800">Nothing planned for {viewDate.toLocaleString('en-US', { month: 'long' })}</p>
        <p className="text-xs text-slate-500 mt-1">Save posts or a campaign from the chat, or add one here.</p>
        {canWrite && <button type="button" onClick={() => onAdd(today)} className={`${primaryButton} mt-4`}>Plan a post</button>}
      </div>
    )
  }
  return (
    <div className="space-y-4 max-w-3xl">
      {days.map((key) => {
        const day = fromDateInputValue(key)
        const isToday = sameDay(day, today)
        return (
          <section key={key} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <h3 className={`px-4 py-2 text-xs font-semibold border-b border-slate-100 flex items-center gap-2 ${isToday ? 'bg-blue-50 text-blue-800' : 'bg-slate-50 text-slate-600'}`}>
              {day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              {isToday && <span className="text-[10px] uppercase tracking-wide bg-blue-600 text-white rounded px-1.5 py-0.5">Today</span>}
            </h3>
            <div className="p-1">
              {byDay.get(key).map((entry) => (
                <AgendaRow key={entry.id} entry={entry} onOpen={onOpen} past={entryIsPast(entry, now)} campaignName={campaignName(entry)} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export default function CalendarPage() {
  const { entries, revision, removeEntry, refresh, canWrite, legacy, importLegacy, campaigns = [] } = useCalendar()
  useEffect(() => { refresh() }, [refresh])
  const now = new Date()
  const today = startOfDay(now)

  // Month and agenda views show viewDate's month; week view shows the Sunday-start week holding it.
  const [viewDate, setViewDate] = useState(today)
  const [view, setViewState] = useState(readStoredView)
  const setView = (next) => {
    setViewState(next)
    try { localStorage.setItem(VIEW_KEY, next) } catch { /* Only a convenience. */ }
  }
  const [filters, setFilters] = useState(() => new Set())
  const [newEntryDate, setNewEntryDate] = useState(null)
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [dayOpen, setDayOpen] = useState(null)
  const [showClear, setShowClear] = useState(false)

  const visible = useMemo(() => (filters.size ? entries.filter((e) => filters.has(e.platform || 'Other')) : entries), [entries, filters])
  const byDay = useMemo(() => groupByDay(visible), [visible])
  const stats = monthStats(entries, viewDate, now)
  const campaignNames = useMemo(() => new Map(campaigns.map((c) => [c.id, c.name])), [campaigns])
  const campaignName = (entry) => campaignNames.get(entry.campaign_id) || ''

  const shift = useCallback((direction) => {
    setViewDate((d) => (view === 'week' ? addDays(d, 7 * direction) : new Date(d.getFullYear(), d.getMonth() + direction, 1)))
  }, [view])

  const anyModal = !!(newEntryDate || selectedEntry || dayOpen || showClear)
  useEffect(() => {
    const onKey = (event) => {
      if (anyModal || event.metaKey || event.ctrlKey || event.altKey) return
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable) return
      if (event.key === 'ArrowLeft') shift(-1)
      else if (event.key === 'ArrowRight') shift(1)
      else if (event.key === 't') setViewDate(startOfDay(new Date()))
      else if (event.key === 'm') setView('month')
      else if (event.key === 'w') setView('week')
      else if (event.key === 'a') setView('agenda')
      else if (event.key === 'n' && canWrite) setNewEntryDate(startOfDay(new Date()))
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [anyModal, shift, canWrite])

  const openEntry = (entry) => { setDayOpen(null); setSelectedEntry({ ...entry, openedRevision: revision }) }
  const addOn = (day) => { setDayOpen(null); setNewEntryDate(day < today ? today : day) }
  const toggleFilter = (platform) => setFilters((current) => {
    const next = new Set(current)
    if (next.has(platform)) next.delete(platform)
    else next.add(platform)
    return next
  })
  const deleteEntry = async (entry) => { if (await removeEntry(entry.id)) setSelectedEntry(null) }

  const title = view === 'week'
    ? (() => {
      const days = weekDays(viewDate)
      const first = days[0], last = days[6]
      const sameMonth = first.getMonth() === last.getMonth()
      const month = (d) => d.toLocaleDateString('en-US', { month: 'short' })
      return `${month(first)} ${first.getDate()} – ${sameMonth ? '' : month(last) + ' '}${last.getDate()}, ${last.getFullYear()}`
    })()
    : viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const showingCurrent = view === 'week' ? weekDays(viewDate).some((d) => sameDay(d, today))
    : viewDate.getFullYear() === today.getFullYear() && viewDate.getMonth() === today.getMonth()

  const viewProps = { viewDate, byDay, today, now, onOpen: openEntry, onAdd: addOn, canWrite }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 shrink-0 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" onClick={() => setViewDate(today)} disabled={showingCurrent} className={`${secondaryButton} !py-1.5`} title="Jump to today (T)">Today</button>
          <div className="flex items-center">
            <button type="button" onClick={() => shift(-1)} aria-label={view === 'week' ? 'Previous week' : 'Previous month'} className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"><Icon d={ICONS.left} /></button>
            <button type="button" onClick={() => shift(1)} aria-label={view === 'week' ? 'Next week' : 'Next month'} className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"><Icon d={ICONS.right} /></button>
          </div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 truncate">{title}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div role="group" aria-label="Calendar view" className="flex p-0.5 bg-slate-100 rounded-lg">
            {VIEWS.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} title={`${label} view (${id[0].toUpperCase()})`}
                className={`text-xs font-medium px-2.5 sm:px-3 py-1.5 rounded-md transition-colors ${view === id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}>
                {label}
              </button>
            ))}
          </div>
          <button type="button" disabled={!canWrite || entries.length === 0} onClick={() => setShowClear(true)} aria-label="Clear calendar" title="Clear calendar"
            className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-colors">
            <Icon d={ICONS.trash} size={15} />
          </button>
          <button type="button" disabled={!canWrite} onClick={() => setNewEntryDate(showingCurrent ? today : (view === 'week' ? weekDays(viewDate)[0] : viewDate))}
            className={`${primaryButton} inline-flex items-center gap-1.5`} title="New post (N)">
            <Icon d={ICONS.plus} size={14} /><span className="hidden sm:inline">New post</span>
          </button>
        </div>
      </header>

      {legacy.length > 0 && (
        <div className="mx-4 sm:mx-6 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <details>
            <summary className="cursor-pointer font-medium text-amber-900">
              {legacy.length} {legacy.length === 1 ? 'post was' : 'posts were'} saved only in this browser. Review and import them into the shared workspace calendar.
            </summary>
            <ul className="mt-2 max-h-40 overflow-auto text-xs text-amber-900/80 space-y-0.5">
              {legacy.map((e) => <li key={e.id}>{e.date.toLocaleDateString()} {e.time} · {e.topic}</li>)}
            </ul>
            <button type="button" disabled={!canWrite} onClick={importLegacy} className={`${primaryButton} mt-3 !bg-amber-600 hover:!bg-amber-700`}>Import {legacy.length} {legacy.length === 1 ? 'post' : 'posts'}</button>
          </details>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <StatsStrip stats={stats} filters={filters} toggleFilter={toggleFilter} clearFilters={() => setFilters(new Set())} onOpen={openEntry} />
        {stats.gaps.length > 0 && showingCurrent && view !== 'week' && (
          <p className="px-4 sm:px-6 pt-3 text-xs text-slate-500">
            <span className="font-medium text-slate-700">{stats.gaps.length} open {stats.gaps.length === 1 ? 'weekday' : 'weekdays'}</span> left this month with nothing planned
            {stats.gaps.length <= 6 && `: ${stats.gaps.map((d) => `${DAY_LABELS[d.getDay()]} ${d.getDate()}`).join(', ')}`}.
          </p>
        )}
        <div className="p-4 sm:p-6">
          {view === 'month' && <MonthView {...viewProps} onShowDay={setDayOpen} />}
          {view === 'week' && <WeekView {...viewProps} />}
          {view === 'agenda' && <AgendaView {...viewProps} campaignName={campaignName} />}
          {filters.size > 0 && (
            <p className="mt-3 text-xs text-slate-500">Showing {[...filters].join(', ')} only. <button type="button" className="text-blue-600 hover:underline" onClick={() => setFilters(new Set())}>Show all platforms</button></p>
          )}
          <p className="mt-4 hidden md:block text-[11px] text-slate-400">Shortcuts: ← → to move, T today, M / W / A to switch view, N new post.</p>
        </div>
      </div>

      {newEntryDate && <NewEntryModal initialDate={newEntryDate} onClose={() => setNewEntryDate(null)} />}
      {selectedEntry && (
        <EntryDetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} onDelete={deleteEntry} campaignName={campaignName(selectedEntry)} />
      )}
      {dayOpen && (
        <DayModal day={dayOpen} entries={byDay.get(dayKey(dayOpen)) || []} onClose={() => setDayOpen(null)} onOpen={openEntry} onAdd={addOn} canWrite={canWrite} now={now} />
      )}
      {showClear && <ClearModal entries={entries} today={today} onClose={() => setShowClear(false)} />}
    </div>
  )
}
