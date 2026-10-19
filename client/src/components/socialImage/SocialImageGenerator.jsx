import { useRef, useState, useEffect } from 'react'
import { workspaceApi, apiErrorMessage } from '../../lib/api'
import { scopedRequest } from '../../lib/workspaceConfiguration.js'
import { useBrowserScope } from '../../context/BrowserScope.js'
import { toPng } from 'html-to-image'
import TEMPLATE_COMPONENTS, { TEMPLATE_DIMENSIONS } from './templates'

const PREVIEW_MAX_WIDTH = 340

// The graphic must always match the specific platform this post/entry was actually written
// for — letting the user pick a different one here used to produce an "Instagram" image for a
// caption that was written (tone, length, hashtag count) for LinkedIn. TikTok isn't included
// since TikTok posts are always video-format and never reach this component.
const PLATFORM_LABELS = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
}

function resolvePlatformLabel(platform) {
  const key = (platform || '').toLowerCase()
  return PLATFORM_LABELS[key] || platform || 'Instagram'
}

export default function SocialImageGenerator({ title, script, platform, persona, durable = false, savedResult = null, onGenerate, disabled = false, readOnly = false }) {
  const scope = useBrowserScope()
  const pendingRef = useRef(null)
  useEffect(() => () => pendingRef.current?.abort(), [scope])
  const platformLabel = resolvePlatformLabel(platform)
  const [localResult, setResult] = useState(null)
  const result = durable ? savedResult : localResult
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const captureRef = useRef(null)
  const previewBoxRef = useRef(null)
  // The preview box is CSS-fluid (w-full, capped at PREVIEW_MAX_WIDTH) so it never overflows
  // a narrow phone screen — this tracks its actual rendered width so the inner native-resolution
  // template can be scaled down to match exactly, instead of assuming the desktop 340px width.
  const [previewWidth, setPreviewWidth] = useState(PREVIEW_MAX_WIDTH)

  useEffect(() => {
    const el = previewBoxRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry?.contentRect.width) setPreviewWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [result])

  const generate = async () => {
    if (disabled || readOnly) return
    if (durable) { if (onGenerate) await onGenerate(); return }
    if (pendingRef.current) return
    const pending = new AbortController()
    pendingRef.current = pending
    setLoading(true)
    setError('')
    try {
      const data = await scopedRequest(workspaceApi, scope, pending.signal, '/api/social-image', 'POST', {
        title,
        script,
        platform: platformLabel,
        persona_id: persona,
        previous_attempt: result || undefined,
      })
      if (!pending.signal.aborted) setResult(data)
    } catch (err) {
      if (!pending.signal.aborted && err.code !== 'ERR_CANCELED') setError(apiErrorMessage(err, 'Could not generate a graphic. Please try again.'))
    } finally {
      if (!pending.signal.aborted) { setLoading(false); pendingRef.current = null }
    }
  }

  const download = async () => {
    if (!captureRef.current) return
    setDownloading(true)
    try {
      const dataUrl = await toPng(captureRef.current, {
        pixelRatio: 1,
        cacheBust: true,
        width: dims.width,
        height: dims.height,
      })
      const link = document.createElement('a')
      const slug = (title || 'social-image').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
      link.download = `${slug || 'social-image'}.png`
      link.href = dataUrl
      link.click()
    } catch {
      setError('Could not export the image. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const TemplateComponent = result ? TEMPLATE_COMPONENTS[result.template] : null
  const dims = result ? TEMPLATE_DIMENSIONS[result.template] : null
  const scale = dims ? previewWidth / dims.width : 1
  const previewHeight = dims ? dims.height * scale : 0

  return (
    <div className="px-4 py-4 border-t border-slate-100">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Social Image</div>
        <span className="text-xs font-medium px-3 py-1.5 rounded-full bg-slate-900 text-white">
          {platformLabel}
        </span>
      </div>

      {result?.compliance_flags?.length > 0 && <p className="mb-3 text-xs text-amber-800" role="status">Human compliance review required before publishing: {result.compliance_flags.join(', ')}</p>}
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      {!result ? (
        <button
          type="button"
          onClick={generate}
          disabled={loading || disabled || readOnly}
          className="w-full flex flex-col items-center justify-center gap-2 border border-dashed border-slate-300 rounded-lg py-8 text-slate-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/40 transition-colors disabled:opacity-60"
        >
          {loading ? (
            <>
              <span className="w-5 h-5 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
              <span className="text-xs font-medium">Generating graphic…</span>
            </>
          ) : (
            <>
              <span className="text-lg">✨</span>
              <span className="text-xs font-medium">Generate social image</span>
            </>
          )}
        </button>
      ) : !TemplateComponent || !dims ? <p role="status">Unsupported saved image format. Its specification remains preserved.</p> : (
        <div>
          <div
            ref={previewBoxRef}
            style={{ maxWidth: PREVIEW_MAX_WIDTH, height: previewHeight, overflow: 'hidden' }}
            className="w-full rounded-lg border border-slate-200 mx-auto"
          >
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <div ref={captureRef} style={{ width: dims.width, height: dims.height }}>
                <TemplateComponent slots={result.slots} footer={result.compliance_footer} businessName={result.business_name} />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 mt-3">
            <button
              type="button"
              onClick={generate}
              disabled={loading || disabled || readOnly}
              className="text-xs font-medium text-slate-500 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-60"
            >
              {loading ? 'Regenerating…' : '↻ Regenerate'}
            </button>
            <button
              type="button"
              onClick={download}
              disabled={downloading}
              className="text-xs font-medium text-white bg-slate-900 hover:bg-slate-700 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-60"
            >
              {downloading ? 'Exporting…' : '⬇ Download PNG'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
