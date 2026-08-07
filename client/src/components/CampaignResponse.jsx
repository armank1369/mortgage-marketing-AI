import Section from './Section'
import platformBadge from './platformBadge'
import ContentBriefCard from './ContentBriefCard'
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

function ContentCalendarBody({ calendar }) {
  if (!calendar || calendar.length === 0) {
    return <p className="text-xs text-slate-400">No calendar entries returned.</p>
  }
  return (
    <div className="space-y-3">
      {calendar.map((entry, i) => {
        const badge = platformBadge(entry.platform)
        return (
          <div key={i} className="rounded-xl border border-slate-200 p-4">
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
          </div>
        )
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
      script={[
        { label: 'Intro', time: script.intro?.time, text: script.intro?.text },
        { label: 'Body', time: script.body?.time, text: script.body?.text },
        { label: 'CTA', time: script.cta?.time, text: script.cta?.text },
      ]}
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
      >
        <ContentCalendarBody calendar={content_calendar} />
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
