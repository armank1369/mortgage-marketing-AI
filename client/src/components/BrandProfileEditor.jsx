import { useEffect, useRef, useState } from 'react'
import { useBrowserScope } from '../context/BrowserScope.js'
import { workspaceApi, apiErrorMessage } from '../lib/api.js'
import { brandProfileRequest, brandProfileError } from '../lib/brandProfile.js'

// WorkspaceGate remounts this editor on account/workspace changes.
export default function BrandProfileEditor() {
  const scope = useBrowserScope()
  const [businessName, setBusinessName] = useState('')
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [retry, setRetry] = useState(0)
  const saveController = useRef(null)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setReady(false)
    setError('')
    setSuccess('')
    brandProfileRequest(workspaceApi, scope, controller.signal).then((data) => {
      if (controller.signal.aborted) return
      setBusinessName(data.business_name || '')
      setReady(true)
    }).catch((err) => {
      if (!controller.signal.aborted && err.code !== 'ERR_CANCELED') {
        setError(brandProfileError(err) || apiErrorMessage(err, 'Could not load the brand profile. Please try again.'))
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { controller.abort(); saveController.current?.abort() }
  }, [scope, retry])

  async function save(event) {
    event.preventDefault()
    if (!ready || loading || saving || saveController.current) return
    setSuccess('')
    setError('')
    if (!businessName.trim() || [...businessName.trim()].length > 100) {
      setError('Enter a business name containing 1–100 characters.')
      return
    }
    const controller = new AbortController()
    saveController.current = controller
    setSaving(true)
    try {
      const data = await brandProfileRequest(workspaceApi, scope, controller.signal, businessName)
      if (controller.signal.aborted) return
      setBusinessName(data.business_name)
      setSuccess('Business name saved.')
    } catch (err) {
      if (!controller.signal.aborted && err.code !== 'ERR_CANCELED') {
        setError(brandProfileError(err) || apiErrorMessage(err, 'Could not save the brand profile. Please try again.'))
      }
    } finally {
      if (!controller.signal.aborted) { setSaving(false); saveController.current = null }
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 font-semibold text-slate-900">Brand profile</h2>
      {loading && <p role="status">Loading brand profile…</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!loading && !ready && <button type="button" className="text-blue-700 underline" onClick={() => setRetry((value) => value + 1)}>Try again</button>}
      {ready && <form onSubmit={save} className="space-y-3">
        <label className="block text-sm">Business name
          <input className="mt-1 w-full rounded border p-2" type="text" maxLength={100}
            value={businessName} disabled={saving} onChange={(event) => { setBusinessName(event.target.value); setSuccess('') }} />
        </label>
        <p className="text-xs text-slate-500">{businessName.length}/100 characters</p>
        {success && <p role="status" className="text-sm text-emerald-700">{success}</p>}
        <button type="submit" disabled={saving || loading} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>}
    </section>
  )
}
