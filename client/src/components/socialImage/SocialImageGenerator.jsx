import { useRef, useState, useEffect } from 'react'
import axios from 'axios'
import { toPng } from 'html-to-image'
import TEMPLATE_COMPONENTS, { TEMPLATE_DIMENSIONS } from './templates'

const PLATFORM_TABS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'stories', label: 'Stories' },
]

const PREVIEW_MAX_WIDTH = 340

function guessDefaultTab(platform) {
  const key = (platform || '').toLowerCase()
  return PLATFORM_TABS.some((t) => t.key === key) ? key : 'instagram'
}

export default function SocialImageGenerator({ title, script, platform, persona, nmls }) {
  const [activeTab, setActiveTab] = useState(() => guessDefaultTab(platform))
  const [result, setResult] = useState(null)
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
    setLoading(true)
    setError('')
    try {
      const tabLabel = PLATFORM_TABS.find((t) => t.key === activeTab)?.label || 'Instagram'
      const { data } = await axios.post('/api/social-image', {
        title,
        script,
        platform: tabLabel,
        persona,
        nmls_number: nmls,
        previous_attempt: result || undefined,
      })
      setResult(data)
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not generate a graphic. Please try again.')
    } finally {
      setLoading(false)
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
      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-3">Social Image</div>

      <div className="flex items-center gap-1.5 mb-3">
        {PLATFORM_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              activeTab === tab.key
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      {!result ? (
        <button
          type="button"
          onClick={generate}
          disabled={loading}
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
      ) : (
        <div>
          <div
            ref={previewBoxRef}
            style={{ maxWidth: PREVIEW_MAX_WIDTH, height: previewHeight, overflow: 'hidden' }}
            className="w-full rounded-lg border border-slate-200 mx-auto"
          >
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <div ref={captureRef} style={{ width: dims.width, height: dims.height }}>
                <TemplateComponent slots={result.slots} nmls={nmls} />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 mt-3">
            <button
              type="button"
              onClick={generate}
              disabled={loading}
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
