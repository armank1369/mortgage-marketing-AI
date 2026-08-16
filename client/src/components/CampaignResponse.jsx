import { useState } from 'react'
import Section from './Section'
import platformBadge from './platformBadge'
import ContentBriefCard, { FORMAT_BADGES } from './ContentBriefCard'
import SocialImageGenerator from './socialImage/SocialImageGenerator'
import { useCalendar } from '../context/CalendarContext'

function BookmarkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}

// content_calendar entries carry a model-written "date" string (e.g. "Aug 4") that's only
// ever meant for display — it isn't reliably anchored to the real, current date, so trusting
// it for scheduling is how every entry used to collide on the same (often already-past) day.
// What IS trustworthy is the entry's "day" (Mon-Sun) sequence: the model already spaces
// platforms/pillars across the window for engagement (e.g. LinkedIn Tue/Wed/Thu, no more than
// one post per platform per day), and a run of weekdays that dips back down (e.g. ...Fri, Mon...)
// marks a new week. Re-anchoring that same weekday rhythm onto the real upcoming calendar
// preserves the strategic spacing while guaranteeing every saved post lands on a distinct,
// future date.
const WEEKDAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

function distributeCalendarDates(calendar) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const mondayThisWeek = new Date(today)
  mondayThisWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7))

  // Compute each entry's (weekGroup, weekdayIndex) from its own position in the sequence.
  let weekGroup = 0
  let prevWeekday = -1
  const positioned = calendar.map((entry) => {
    const weekday = WEEKDAY_INDEX[entry.day] ?? 0
    if (weekday < prevWeekday) weekGroup += 1
    prevWeekday = weekday
    return { entry, weekGroup, weekday }
  })

  // If week 0's schedule (anchored to this week's Monday) has already partly or fully
  // elapsed, push the whole plan out to start next Monday instead of landing in the past.
  const anyPast = positioned.some(({ weekGroup: g, weekday: w }) => {
    if (g !== 0) return false
    const d = new Date(mondayThisWeek)
    d.setDate(mondayThisWeek.getDate() + w)
    return d < today
  })
  const startMonday = new Date(mondayThisWeek)
  if (anyPast) startMonday.setDate(startMonday.getDate() + 7)

  return positioned.map(({ weekGroup: g, weekday: w }) => {
    const d = new Date(startMonday)
    d.setDate(startMonday.getDate() + g * 7 + w)
    return d
  })
}

const PILLAR_STYLES = [
  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', chip: 'bg-amber-100 text-amber-700' },
  { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', chip: 'bg-blue-100 text-blue-700' },
  { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-800', chip: 'bg-violet-100 text-violet-700' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', chip: 'bg-emerald-100 text-emerald-700' },
  { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-800', chip: 'bg-rose-100 text-rose-700' },
]

function ContentStrategyBody({ strategy }) {
  if (!strategy) return <p className="text-xs text-slate-400">No content strategy returned.</p>
  return (
    <div>
      {strategy.goal && <p className="text-xs text-slate-500 mb-4">{strategy.goal}</p>}
      <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-3">Content Pillars</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(strategy.pillars || []).map((pillar, i) => {
          const style = PILLAR_STYLES[i % PILLAR_STYLES.length]
          return (
            <div key={i} className={`rounded-xl border ${style.border} ${style.bg} p-4`}>
              <div className={`flex items-center justify-between text-sm font-semibold ${style.text}`}>
                <span>{pillar.name}</span>
                {typeof pillar.percentage === 'number' && <span>{pillar.percentage}%</span>}
              </div>
              {pillar.description && (
                <p className={`text-xs mt-1.5 leading-relaxed ${style.text} opacity-80`}>{pillar.description}</p>
              )}
              {Array.isArray(pillar.examples) && pillar.examples.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {pillar.examples.map((ex, j) => (
                    <span key={j} className={`text-[11px] px-2 py-1 rounded-full ${style.chip}`}>
                      {ex}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PlatformBreakdownBody({ platforms }) {
  if (!platforms || platforms.length === 0) {
    return <p className="text-xs text-slate-400">No platform breakdown returned.</p>
  }
  return (
    <div className="space-y-3">
      {platforms.map((p, i) => {
        const badge = platformBadge(p.platform)
        return (
          <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100">
            <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-xs font-bold ${badge.className}`}>
              {badge.label}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-900">{p.platform}</span>
                {p.frequency && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                    {p.frequency}
                  </span>
                )}
                {p.times && <span className="text-[11px] text-slate-400">🕐 {p.times}</span>}
              </div>
              {p.audience && (
                <p className="text-xs text-slate-500 mt-1">
                  <span className="font-medium text-slate-600">Audience:</span> {p.audience}
                </p>
              )}
              {p.tone && (
                <p className="text-xs text-slate-500 mt-0.5">
                  <span className="font-medium text-slate-600">Tone:</span> {p.tone}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Matches each content_calendar entry with format "video" to its scripted video_brief (by
// exact title, falling back to pillar+platform for older cached chats that predate the
// video_brief_title link). Returns an array parallel to `calendar` — the matched brief, or
// null for entries with no match / non-video entries. Shared by the calendar's display and
// its save-to-calendar action so both agree on the same pairing.
function matchVideoBriefs(calendar, videoBriefs) {
  const usedBriefTitles = new Set()
  return calendar.map((entry) => {
    if (entry.format !== 'video') return null
    const byTitle = (videoBriefs || []).find((b) => b.title === entry.video_brief_title && !usedBriefTitles.has(b.title))
    const brief =
      byTitle ||
      (videoBriefs || []).find(
        (b) =>
          !usedBriefTitles.has(b.title) &&
          b.pillar === entry.category &&
          (b.quick_details?.platforms || []).some((p) => p.toLowerCase().includes(entry.platform.toLowerCase()))
      )
    if (brief) usedBriefTitles.add(brief.title)
    return brief || null
  })
}

function videoBriefScript(brief) {
  const script = brief.script || {}
  return [
    { label: 'Intro', time: script.intro?.time, text: script.intro?.text },
    { label: 'Body', time: script.body?.time, text: script.body?.text },
    { label: 'CTA', time: script.cta?.time, text: script.cta?.text },
  ]
}

// Sits in the "Content Calendar" Section's header row via `headerAction`, so it's visible
// whether or not the section is expanded — bulk-saves every generated entry in one click.
function SaveCalendarButton({ calendar, videoBriefs }) {
  const { addEntries } = useCalendar()
  const [saved, setSaved] = useState(false)

  if (!calendar || calendar.length === 0) return null

  const handleSaveToCalendar = (e) => {
    e.stopPropagation()
    const dates = distributeCalendarDates(calendar)
    const briefs = matchVideoBriefs(calendar, videoBriefs)
    addEntries(
      calendar.map((entry, i) => {
        const brief = briefs[i]
        return {
          topic: entry.category || entry.caption || `${entry.platform} post`,
          platform: entry.platform,
          format: entry.format,
          time: entry.time,
          date: dates[i],
          // Carried along so the calendar's detail modal can show the same full breakdown
          // shown here — the matched video script when there is one, otherwise the caption
          // (or, for a carousel, the slide-by-slide breakdown plus caption).
          details: brief
            ? { script: videoBriefScript(brief), direction: brief.creative_direction, quickDetails: brief.quick_details, hashtags: entry.hashtags }
            : { script: calendarEntryScript(entry), hashtags: entry.hashtags },
        }
      })
    )
    setSaved(true)
  }

  return (
    <button
      type="button"
      onClick={handleSaveToCalendar}
      disabled={saved}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-70 disabled:cursor-default rounded-lg px-3 py-1.5 transition-colors"
    >
      <BookmarkIcon />
      {saved ? 'Saved to Calendar' : 'Save to Calendar'}
    </button>
  )
}

// A calendar entry's "day/date" schedule strip — shown above every entry regardless of how
// its content is rendered below, so the calendar still reads as a calendar either way.
function EntryScheduleRow({ entry }) {
  const badge = platformBadge(entry.platform)
  const formatBadge = entry.format ? FORMAT_BADGES[entry.format] : null
  return (
    <div className="flex items-center justify-between flex-wrap gap-2 px-4 pt-3">
      <div className="flex items-center gap-3">
        <div className="text-center leading-tight shrink-0 w-10">
          <div className="text-[10px] font-semibold text-slate-400 uppercase">{entry.day}</div>
          <div className="text-xs font-bold text-slate-700">{entry.date}</div>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full ${badge.className}`}>
          <span>{badge.label}</span>
          {entry.platform}
        </span>
        {formatBadge && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-600">
            <span>{formatBadge.icon}</span>
            {formatBadge.label}
          </span>
        )}
        {entry.category && (
          <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
            {entry.category}
          </span>
        )}
      </div>
      {entry.time && <span className="text-[11px] text-slate-400 shrink-0">🕐 {entry.time}</span>}
    </div>
  )
}

// carousel entries carry both a slide-by-slide breakdown (the swipeable content) and a
// caption (the text posted alongside it) — show the slides as the primary script content,
// with the caption as a secondary line, same as a real carousel post reads. Other non-text
// formats only ever have the flat caption to show.
function calendarEntryScript(entry) {
  if (entry.format === 'carousel' && Array.isArray(entry.slides) && entry.slides.length > 0) {
    return [
      { label: 'Slides', slides: entry.slides },
      ...(entry.caption ? [{ label: 'Caption', text: entry.caption }] : []),
    ]
  }
  return [{ label: 'Post Copy', text: entry.caption }]
}

function calendarEntryCopyText(entry) {
  if (entry.format === 'carousel' && Array.isArray(entry.slides) && entry.slides.length > 0) {
    return [entry.slides.map((slide, i) => `Slide ${i + 1}: ${slide}`).join('\n\n'), entry.caption || ''].filter(Boolean).join('\n\n')
  }
  return entry.caption || ''
}

// text-only entries stay a plain caption block — there's no richer post-preview to show for
// them (a real text post has no image/video/carousel component to render).
function TextCalendarEntry({ entry }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <EntryScheduleRow entry={entry} />
      {entry.caption && (
        <p className="text-xs text-slate-700 mt-3 whitespace-pre-wrap leading-relaxed">{entry.caption}</p>
      )}
      {Array.isArray(entry.hashtags) && entry.hashtags.length > 0 && (
        <p className="text-xs text-blue-600 mt-2 break-words">{entry.hashtags.join(' ')}</p>
      )}
    </div>
  )
}

// single-image/carousel entries only ever carry a flat caption (no shot-by-shot script or
// creative direction is generated for them), so they get the same ContentBriefCard preview
// chrome as a single post with just the caption standing in as the post copy — everything
// ContentBriefCard has no data for (Creative Direction, Quick Details) quietly stays hidden.
function MediaCalendarEntry({ entry }) {
  const title = entry.category ? `${entry.category}: ${entry.platform} ${entry.format}` : `${entry.platform} post`
  return (
    <div>
      <EntryScheduleRow entry={entry} />
      <div className="mt-3">
        <ContentBriefCard
          title={title}
          platform={entry.platform}
          format={entry.format}
          script={calendarEntryScript(entry)}
          hashtags={entry.hashtags}
          onCopyText={() => calendarEntryCopyText(entry)}
        />
      </div>
    </div>
  )
}

function ContentCalendarBody({ calendar, videoBriefs, nmls, persona }) {
  if (!calendar || calendar.length === 0) {
    return <p className="text-xs text-slate-400">No calendar entries returned.</p>
  }

  const briefs = matchVideoBriefs(calendar, videoBriefs)

  return (
    <div className="space-y-3">
      {calendar.map((entry, i) => {
        if (entry.format === 'video') {
          const brief = briefs[i]
          if (brief) {
            return (
              <div key={i}>
                <EntryScheduleRow entry={entry} />
                <div className="mt-3">
                  <VideoBriefCard brief={brief} nmls={nmls} persona={persona} />
                </div>
              </div>
            )
          }
        }
        if (entry.format === 'single-image' || entry.format === 'carousel' || (entry.format === 'video' && !entry.video_brief_title)) {
          return <MediaCalendarEntry key={i} entry={entry} />
        }
        return <TextCalendarEntry key={i} entry={entry} />
      })}
    </div>
  )
}

function VideoBriefCard({ brief, nmls, persona }) {
  const script = brief.script || {}
  const direction = brief.creative_direction || {}
  const details = brief.quick_details || {}

  const buildCopyText = () =>
    [
      brief.title,
      '',
      'SCRIPT',
      script.intro?.text ? `Intro (${script.intro.time || ''}): ${script.intro.text}` : '',
      script.body?.text ? `Body (${script.body.time || ''}): ${script.body.text}` : '',
      script.cta?.text ? `CTA (${script.cta.time || ''}): ${script.cta.text}` : '',
      '',
      'CREATIVE DIRECTION',
      direction.setting ? `Setting: ${direction.setting}` : '',
      direction.camera ? `Camera: ${direction.camera}` : '',
      direction.lighting ? `Lighting: ${direction.lighting}` : '',
      direction.energy ? `Energy: ${direction.energy}` : '',
      direction.background ? `Background: ${direction.background}` : '',
      direction.clothing ? `Clothing: ${direction.clothing}` : '',
      '',
      'QUICK DETAILS',
      details.duration ? `Duration: ${details.duration}` : '',
      details.tone ? `Tone: ${details.tone}` : '',
      details.call_to_action ? `Call-to-Action: ${details.call_to_action}` : '',
      details.platforms?.length ? `Platforms: ${details.platforms.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n')

  return (
    <ContentBriefCard
      title={brief.title}
      platform={details.platforms?.[0]}
      script={videoBriefScript(brief)}
      direction={direction}
      details={details}
      onCopyText={buildCopyText}
    >
      <SocialImageGenerator
        title={brief.title}
        script={{ hook: script.intro?.text, body: script.body?.text, cta: script.cta?.text }}
        platform={details.platforms?.[0]}
        persona={persona}
        nmls={nmls}
      />
    </ContentBriefCard>
  )
}

function VideoBriefsBody({ briefs, nmls, persona }) {
  if (!briefs || briefs.length === 0) {
    return <p className="text-xs text-slate-400">No video briefs returned.</p>
  }
  return (
    <div className="space-y-4">
      {briefs.map((brief, i) => (
        <VideoBriefCard key={i} brief={brief} nmls={nmls} persona={persona} />
      ))}
    </div>
  )
}

export default function CampaignResponse({ data, nmls, persona }) {
  if (!data) return null
  const { content_strategy, platform_breakdown, content_calendar, video_briefs } = data

  return (
    <div className="w-full max-w-3xl space-y-3">
      <Section
        icon="📊"
        title={content_strategy?.title || 'Content Strategy'}
        subtitle={content_strategy?.goal}
        defaultOpen
      >
        <ContentStrategyBody strategy={content_strategy} />
      </Section>

      <Section icon="📣" title="Platform Breakdown" subtitle="Where to post and how often" defaultOpen>
        <PlatformBreakdownBody platforms={platform_breakdown} />
      </Section>

      <Section
        icon="📅"
        title="Content Calendar"
        subtitle={`${content_calendar?.length || 0} scheduled posts`}
        defaultOpen={false}
        headerAction={<SaveCalendarButton calendar={content_calendar} videoBriefs={video_briefs} />}
      >
        <ContentCalendarBody calendar={content_calendar} videoBriefs={video_briefs} nmls={nmls} persona={persona} />
      </Section>

      <Section
        icon="🎬"
        title="Video Content Briefs"
        subtitle={`${video_briefs?.length || 0} script-ready video idea${(video_briefs?.length || 0) === 1 ? '' : 's'}`}
        defaultOpen={false}
      >
        <VideoBriefsBody briefs={video_briefs} nmls={nmls} persona={persona} />
      </Section>
    </div>
  )
}
