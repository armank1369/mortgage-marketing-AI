import { useState } from 'react'
import platformBadge, { platformGradient } from './platformBadge'

export function ScriptLine({ label, time, text }) {
  if (!text) return null
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wide">{label}</span>
        {time && <span className="text-[11px] text-slate-400">{time}</span>}
      </div>
      <p className="border-l-2 border-slate-200 pl-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
        {text}
      </p>
    </div>
  )
}

// Navigable slide viewer for carousel-format posts — script.body arrives as an array of
// slide strings instead of one paragraph, so each slide gets its own distinguishable frame
// with prev/next controls and dot indicators, matching how a real Instagram carousel reads.
export function SlideCarousel({ label, slides }) {
  const [index, setIndex] = useState(0)
  if (!slides || slides.length === 0) return null
  const total = slides.length

  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wide">{label}</span>
        <span className="text-[11px] text-slate-400">
          Slide {index + 1} of {total}
        </span>
      </div>
      <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/60 min-h-[4.5rem] flex items-center">
        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{slides[index]}</p>
      </div>
      <div className="flex items-center justify-between mt-2">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="text-xs font-medium text-slate-500 hover:text-blue-700 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 transition-colors"
        >
          ← Prev
        </button>
        <div className="flex items-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === index ? 'bg-blue-600' : 'bg-slate-300'}`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
          disabled={index === total - 1}
          className="text-xs font-medium text-slate-500 hover:text-blue-700 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  )
}

export function CreativeDirectionGrid({ direction }) {
  if (!direction) return null
  const fields = [
    ['Setting', direction.setting],
    ['Camera', direction.camera],
    ['Lighting', direction.lighting],
    ['Energy', direction.energy],
    ['Background', direction.background],
    ['Clothing', direction.clothing],
  ]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
      {fields.map(([label, value]) =>
        value ? (
          <div key={label} className="border-l-2 border-slate-200 pl-3">
            <div className="text-[11px] font-semibold text-blue-600 uppercase tracking-wide mb-1">{label}</div>
            <div className="text-sm text-slate-700 leading-relaxed">{value}</div>
          </div>
        ) : null
      )}
    </div>
  )
}

// Shared "content brief" card — a post-preview header (avatar, brand name, platform badge,
// platform-colored top bar) wrapping a Script / Creative Direction / Quick Details breakdown
// and a Copy/status footer. Used by both the four-pillar Video Content Briefs section and
// the general post-idea response, so every generated deliverable reads as one visual system.
const FORMAT_BADGES = {
  'text-only': { icon: '📝', label: 'Text' },
  'single-image': { icon: '🖼️', label: 'Image' },
  carousel: { icon: '🖼️', label: 'Carousel' },
  video: { icon: '🎥', label: 'Video' },
}

export default function ContentBriefCard({ title, platform, format, script, direction, details, hashtags, onCopyText, children }) {
  const [copied, setCopied] = useState(false)
  const gradient = platformGradient(platform)
  const badge = platform ? platformBadge(platform) : null
  const formatBadge = format ? FORMAT_BADGES[format] : null

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(onCopyText())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable — ignore
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className={`h-1.5 ${gradient}`} />

      <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
            JK
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-slate-900 leading-snug truncate">{title}</h4>
            <p className="text-xs text-slate-400">Joseph Kim · Mortgage Broker</p>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          {formatBadge && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
              <span>{formatBadge.icon}</span>
              {formatBadge.label}
            </span>
          )}
          {badge && (
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${badge.className}`}
            >
              <span>{badge.label}</span>
              {platform}
            </span>
          )}
        </div>
      </div>

      {script?.length > 0 && (
        <div className="px-4 py-4">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-3">Script</div>
          {script.map((line, i) =>
            line.slides ? (
              <SlideCarousel key={i} label={line.label} slides={line.slides} />
            ) : (
              <ScriptLine key={i} label={line.label} time={line.time} text={line.text} />
            )
          )}
        </div>
      )}

      <div className="px-4 py-4 border-t border-slate-100">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-3">Creative Direction</div>
        <CreativeDirectionGrid direction={direction} />
      </div>

      <div className="px-4 py-4 border-t border-slate-100 bg-slate-50/60">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-3">Quick Details</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {details?.duration && (
            <div>
              <div className="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Duration</div>
              <div className="text-sm font-semibold text-slate-800">{details.duration}</div>
            </div>
          )}
          {details?.tone && (
            <div>
              <div className="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Tone</div>
              <div className="text-sm font-semibold text-slate-800">{details.tone}</div>
            </div>
          )}
          {details?.call_to_action && (
            <div className="col-span-2 sm:col-span-1">
              <div className="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Call-to-Action</div>
              <div className="text-sm font-semibold text-slate-800">{details.call_to_action}</div>
            </div>
          )}
        </div>
        {Array.isArray(hashtags) && hashtags.length > 0 && (
          <p className="text-xs text-blue-600 mt-3 break-words">{hashtags.join(' ')}</p>
        )}
        {Array.isArray(details?.platforms) && details.platforms.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {details.platforms.map((p, j) => {
              const b = platformBadge(p)
              return (
                <span
                  key={j}
                  className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full ${b.className}`}
                >
                  <span>{b.label}</span>
                  {p}
                </span>
              )
            })}
          </div>
        )}
      </div>

      {children}

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
    </div>
  )
}
