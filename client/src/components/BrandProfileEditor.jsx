import { useEffect, useRef, useState } from 'react'
import { useBrowserScope } from '../context/BrowserScope.js'
import { useWorkspaceData } from '../context/WorkspaceData.js'
import { workspaceApi, apiErrorMessage } from '../lib/api.js'
import { brandVoiceText, validateBrandFields } from '../lib/workspaceConfiguration.js'
import { brandProfileRequest } from '../lib/brandProfile.js'

const fields = [
  ['business_name', 'Business name', 100], ['licensed_person_name', "Licensed person's full name", 100],
  ['nmls_id', 'NMLS identifier', 20], ['dre_number', 'DRE identifier', 20],
  ['tone', 'Tone of voice', 4000, 'voice'],
  ['values', 'Values', 8040, 'lines'], ['keywords', 'Keywords', 8040, 'lines'],
  ['catchphrases', 'Catchphrases', 8040, 'lines'], ['banned_words', 'Banned words', 8040, 'lines'],
  ['blog_examples', 'Writing examples (JSON array or object)', 8000, 'json'],
  ['compliance_footer', 'Supplemental disclosure', 1000, 'text'],
  ['equal_housing_text', 'Supplemental equal-housing text', 500, 'text'],
]
function formFrom(profile) {
  return Object.fromEntries(fields.map(([key, , , kind]) => [key,
    kind === 'lines' ? (Array.isArray(profile?.[key]) ? profile[key].join('\n') : '') :
      ['json', 'voice'].includes(kind) ? JSON.stringify(profile?.[key] || (key === 'tone' ? {} : []), null, 2) : profile?.[key] || '']))
}
export default function BrandProfileEditor() {
  const scope = useBrowserScope()
  const { brand, setBrand, canWrite, loading, error: loadError, reload } = useWorkspaceData()
  const [draft, setDraft] = useState(() => formFrom(brand))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const controller = useRef(null)
  useEffect(() => { setDraft(formFrom(brand)) }, [brand])
  useEffect(() => () => controller.current?.abort(), [scope])
  async function save(event) {
    event.preventDefault()
    if (!canWrite || saving || controller.current || !brand?.exists) return
    setError(''); setSuccess('')
    try {
      const baseline = formFrom(brand)
      const patch = {}
      for (const [key, , , kind] of fields) {
        if (draft[key] === baseline[key]) continue
        patch[key] = kind === 'lines' ? draft[key].split('\n').map((line) => line.trim()).filter(Boolean) :
          ['json', 'voice'].includes(kind) ? JSON.parse(draft[key]) : draft[key]
      }
      if (!Object.keys(patch).length) { setSuccess('No changes to save.'); return }
      const validated = validateBrandFields(patch)
      const pending = new AbortController()
      controller.current = pending
      setSaving(true)
      const result = await brandProfileRequest(workspaceApi, scope, pending.signal, validated)
      if (!pending.signal.aborted) { setBrand(result); setSuccess('Brand profile saved. New requests use these values.') }
    } catch (err) {
      if (!controller.current?.signal.aborted && err.code !== 'ERR_CANCELED') setError(err.response ? apiErrorMessage(err, 'Could not save brand configuration.') :
        err instanceof SyntaxError ? 'Check the JSON in tone and writing examples.' : err.message)
    } finally { if (!controller.current?.signal.aborted) { setSaving(false); controller.current = null } }
  }
  return <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 className="mb-3 font-semibold text-slate-900">Brand profile</h2>
    <p className="mb-4 text-sm text-slate-500">Enter verified business and licensing details. Required licensing and Equal Housing Opportunity disclosures are always enforced. Saving details does not verify a license.</p>
    {loading && <p role="status">Loading brand profile…</p>}
    {loadError && <div role="alert">{loadError} <button onClick={reload} className="underline">Try again</button></div>}
    {brand && !loading && !loadError && <form onSubmit={save} className="space-y-4">
      {!brand.exists && <p role="alert">No brand profile exists for this workspace. Ask your administrator to provision it.</p>}
      {!canWrite && <p className="text-sm text-slate-500">Your role can view this profile. Ask an owner or administrator to make changes.</p>}
      <fieldset disabled={!canWrite || saving || !brand.exists} className="space-y-3">
        {fields.map(([key, label, limit, kind]) => <label key={key} className="block text-sm text-slate-700">{label}
          {kind ? <textarea rows={kind === 'json' ? 4 : 3} aria-label={label} maxLength={limit}
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 disabled:bg-slate-50"
            value={kind === 'voice' ? brandVoiceText(JSON.parse(draft[key])) : draft[key]}
            onChange={(event) => setDraft({ ...draft, [key]: kind === 'voice' ? JSON.stringify({ ...JSON.parse(draft[key]), voice: event.target.value }) : event.target.value })} /> :
            <input aria-label={label} maxLength={limit} className="mt-1 w-full rounded-lg border border-slate-300 p-2 disabled:bg-slate-50"
              value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />}
          {kind === 'lines' && <span className="text-xs text-slate-500">One item per line; up to 40 items, 200 characters each.</span>}
          {key === 'tone' && <span className="text-xs text-slate-500">For example: Clear, professional and warm. Other saved tone settings are preserved.</span>}
        </label>)}
        {canWrite && <button type="submit" disabled={saving} className="rounded-lg bg-sky-700 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save brand profile'}</button>}
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="text-sm text-emerald-700">{success}</p>}
    </form>}
  </section>
}
