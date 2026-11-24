import { useEffect, useRef, useState } from 'react'
import { workspaceApi, apiErrorMessage } from '../lib/api'
import { scopedRequest } from '../lib/workspaceConfiguration.js'
import { useBrowserScope } from '../context/BrowserScope.js'
import { sketchEnabled, sketchRequestBody } from '../lib/creativeSketch.js'
import FilmingSetupDiagram from './FilmingSetupDiagram'

// Prototype: one hand-drawn illustration showing every creative direction suggestion in a
// single frame. On demand only (each image costs money), never generated automatically, and
// hidden unless VITE_CREATIVE_SKETCH_ENABLED=true. The server decides the provider.
export default function CreativeDirectionSketch({ direction, format, platform, active = null }) {
  const scope = useBrowserScope()
  const pendingRef = useRef(null)
  useEffect(() => () => pendingRef.current?.abort(), [scope])
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const [open, setOpen] = useState(false)
  const body = sketchRequestBody(direction, { format, platform })
  const isVideo = !format || format === 'video'

  if (!sketchEnabled(import.meta.env) || !body) return null

  const generate = async () => {
    if (pendingRef.current) return
    const pending = new AbortController()
    pendingRef.current = pending
    setLoading(true)
    setError('')
    try {
      const data = await scopedRequest(workspaceApi, scope, pending.signal, '/api/creative-sketch', 'POST', body)
      if (!pending.signal.aborted) setResult(data)
    } catch (err) {
      if (!pending.signal.aborted && err.code !== 'ERR_CANCELED') setError(apiErrorMessage(err, 'Could not draw the sketch. Please try again.'))
    } finally {
      if (!pending.signal.aborted) { setLoading(false); pendingRef.current = null }
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-lg"
      >
        <span>🎬 {isVideo ? 'See it as a picture' : 'Sketch this idea'} <span className="font-normal text-slate-400">· numbers match the cards above</span></span>
        <span aria-hidden="true" className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && <div className="px-3 pb-3">
      {isVideo && <FilmingSetupDiagram direction={direction} active={active} />}
      <div className="mt-3" />
      {result?.image_url && (
        <figure className="mb-3">
          <img
            src={result.image_url}
            alt="Hand-drawn sketch of the creative direction"
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white"
          />
          <figcaption className="text-[11px] text-slate-400 mt-1">AI sketch for planning only. Not for posting.</figcaption>
        </figure>
      )}
      {result && !result.image_url && (
        <p className="text-xs text-slate-500 mb-2">Preview mode: no image provider is connected yet. This is the prompt it would receive.</p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
        >
          {loading ? 'Sketching…' : result ? 'Redraw sketch' : '✏️ Sketch this scene'}
        </button>
        {result?.prompt && (
          <button type="button" onClick={() => setShowPrompt((v) => !v)} className="text-xs text-slate-400 hover:text-slate-600">
            {showPrompt || !result.image_url ? 'Hide prompt' : 'Show prompt'}
          </button>
        )}
      </div>
      {result?.prompt && (showPrompt || !result.image_url) && (
        <pre className="mt-2 text-[11px] whitespace-pre-wrap text-slate-500 bg-slate-50 rounded-lg p-3">{result.prompt}</pre>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>}
    </div>
  )
}
