import { useState } from 'react'
import axios from 'axios'
import Section from './Section'
import platformBadge from './platformBadge'
import { ScriptLine, CreativeDirectionGrid } from './ContentBriefCard'
import SocialImageGenerator from './socialImage/SocialImageGenerator'

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

function CalendarEntryCard({ entry, nmls, persona, onVideoGenerated }) {
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const badge = platformBadge(entry.platform)
  const video = entry.video
  const script = video?.script || {}
  const direction = video?.creative_direction || {}
  const details = video?.quick_details || {}

  const generateVideo = async () => {
    setGenerating(true)
    setGenError('')
    try {
      const { data } = await axios.post('/api/video-brief', {
        caption: entry.caption,
        platform: entry.platform,
        category: entry.category,
        persona,
        nmls_number: nmls,
      })
      onVideoGenerated(data.video)
    } catch {
      setGenError('Could not generate a video script. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  const buildCopyText = () =>
    [
      entry.caption,
      Array.isArray(entry.hashtags) && entry.hashtags.length > 0 ? entry.hashtags.join(' ') : '',
      video ? 'SCRIPT' : '',
      script.intro?.text ? `Intro (${script.intro.time || ''}): ${script.intro.text}` : '',
      script.body?.text ? `Body (${script.body.time || ''}): ${script.body.text}` : '',
      script.cta?.text ? `CTA (${script.cta.time || ''}): ${script.cta.text}` : '',
      video ? 'CREATIVE DIRECTION' : '',
      direction.setting ? `Setting: ${direction.setting}` : '',
      direction.camera ? `Camera: ${direction.camera}` : '',
      direction.lighting ? `Lighting: ${direction.lighting}` : '',
      direction.energy ? `Energy: ${direction.energy}` : '',
      direction.background ? `Background: ${direction.background}` : '',
      direction.clothing ? `Clothing: ${direction.clothing}` : '',
      video ? 'QUICK DETAILS' : '',
      details.duration ? `Duration: ${details.duration}` : '',
      details.tone ? `Tone: ${details.tone}` : '',
      details.call_to_action ? `Call-to-Action: ${details.call_to_action}` : '',
    ]
      .filter(Boolean)
      .join('\n')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildCopyText())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable — ignore
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="text-center leading-tight shrink-0 w-10">
              <div className="text-[10px] font-semibold text-slate-400 uppercase">{entry.day}</div>
              <div className="text-xs font-bold text-slate-700">{entry.date}</div>
            </div>
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full ${badge.className}`}>
              <span>{badge.label}</span>
              {entry.platform}
            </span>
            {entry.category && (
              <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                {entry.category}
              </span>
            )}
            {video && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                <span>🎥</span>
                Script
              </span>
            )}
          </div>
          {entry.time && (
            <span className="text-[11px] text-slate-400 shrink-0">🕐 {entry.time}</span>
          )}
        </div>
        {entry.caption && (
          <p className="text-xs text-slate-700 mt-3 whitespace-pre-wrap leading-relaxed">{entry.caption}</p>
        )}
        {Array.isArray(entry.hashtags) && entry.hashtags.length > 0 && (
          <p className="text-xs text-blue-600 mt-2 break-words">{entry.hashtags.join(' ')}</p>
        )}
        {!video && (
          <div className="mt-3">
            <button
              type="button"
              onClick={generateVideo}
              disabled={generating}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating && (
                <span className="w-3 h-3 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
              )}
              {generating ? 'Generating video script...' : '🎥 Generate video script'}
            </button>
            {genError && <p className="text-[11px] text-red-500 mt-1.5">{genError}</p>}
          </div>
        )}
      </div>

      {video && (
        <>
          <div className="px-4 py-4 border-t border-slate-100">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-3">Script</div>
            <ScriptLine label="Intro" time={script.intro?.time} text={script.intro?.text} />
            <ScriptLine label="Body" time={script.body?.time} text={script.body?.text} />
            <ScriptLine label="CTA" time={script.cta?.time} text={script.cta?.text} />
          </div>

          <div className="px-4 py-4 border-t border-slate-100">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-3">Creative Direction</div>
            <CreativeDirectionGrid direction={direction} />
          </div>

          <div className="px-4 py-4 border-t border-slate-100 bg-slate-50/60">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-3">Quick Details</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {details.duration && (
                <div>
                  <div className="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Duration</div>
                  <div className="text-sm font-semibold text-slate-800">{details.duration}</div>
                </div>
              )}
              {details.tone && (
                <div>
                  <div className="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Tone</div>
                  <div className="text-sm font-semibold text-slate-800">{details.tone}</div>
                </div>
              )}
              {details.call_to_action && (
                <div className="col-span-2 sm:col-span-1">
                  <div className="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Call-to-Action</div>
                  <div className="text-sm font-semibold text-slate-800">{details.call_to_action}</div>
                </div>
              )}
            </div>
          </div>

          <SocialImageGenerator
            title={entry.category}
            script={{ hook: script.intro?.text, body: script.body?.text, cta: script.cta?.text }}
            platform={entry.platform}
            persona={persona}
            nmls={nmls}
          />

          <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100">
            <span className="text-[11px] text-slate-400">Draft ready</span>
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs font-medium text-slate-500 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              {copied ? '✓ Copied' : '📋 Copy'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function ContentCalendarBody({ calendar, nmls, persona, onVideoGenerated }) {
  if (!calendar || calendar.length === 0) {
    return <p className="text-xs text-slate-400">No calendar entries returned.</p>
  }
  return (
    <div className="space-y-3">
      {calendar.map((entry, i) => (
        <CalendarEntryCard
          key={i}
          entry={entry}
          nmls={nmls}
          persona={persona}
          onVideoGenerated={(video) => onVideoGenerated(i, video)}
        />
      ))}
    </div>
  )
}

export default function CampaignResponse({ data, nmls, persona, onVideoGenerated }) {
  if (!data) return null
  const { content_strategy, platform_breakdown, content_calendar } = data
  const scriptedCount = (content_calendar || []).filter((entry) => entry.video).length

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
        subtitle={`${content_calendar?.length || 0} scheduled posts${scriptedCount ? ` · ${scriptedCount} with a video script` : ''}`}
        defaultOpen={false}
      >
        <ContentCalendarBody
          calendar={content_calendar}
          nmls={nmls}
          persona={persona}
          onVideoGenerated={onVideoGenerated}
        />
      </Section>
    </div>
  )
}
