import { useEffect, useRef, useState } from 'react'
import { useBrowserScope } from '../context/BrowserScope.js'
import { useWorkspaceData } from '../context/WorkspaceData.js'
import { workspaceApi, apiErrorMessage } from '../lib/api.js'
import { scopedRequest, validatePersonaFields, isDatabasePersona } from '../lib/workspaceConfiguration.js'

import { AUDIENCE_FIELDS, audienceCompatible, setAudienceLines } from '../lib/legacyRecovery.js'

const blank = { name: '', slug: '', description: '', audience_profile: {}, prompt_guidance: '' }
const proposals = [
  { name: 'The Business Owner', slug: 'business-owner', description: 'Business owners navigating complex income documentation.',
    audience_profile: { needs: ['Complex income documentation', 'Clear financing education'] },
    prompt_guidance: 'Explain documentation and financing options neutrally. Never promise qualification, pricing or underwriting outcomes.' },
  { name: 'First-Time Homebuyer', slug: 'first-time-homebuyer', description: 'People new to the mortgage process who want understandable guidance.',
    audience_profile: { needs: ['Mortgage process education', 'Clear next steps'] },
    prompt_guidance: 'Explain terms step by step without assuming age, income, family status or eligibility. No guarantees.' },
]
const draftFrom = (row) => ({ ...blank, ...row, audience_profile: JSON.stringify(row?.audience_profile || {}, null, 2), audience_lines: Object.fromEntries(AUDIENCE_FIELDS.map(([key]) => [key, Array.isArray(row?.audience_profile?.[key]) ? row.audience_profile[key].join('\n') : ''])) })
function parsedAudience(value) { try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null } catch { return null } }

export default function PersonaManager({ onSelect, legacyPersona, selectedId }) {
  const scope = useBrowserScope()
  const { personas, setPersonas, canWrite, loading, error: loadError, reload } = useWorkspaceData()
  const [draft, setDraft] = useState(null)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  const controller = useRef(null)
  const audience = draft ? parsedAudience(draft.audience_profile) : null
  const structuredAudience = audience && audienceCompatible(audience)
  useEffect(() => () => controller.current?.abort(), [scope])
  function open(row, id = null) { setDraft(draftFrom(row)); setEditing(id); setError(''); setSuccess('') }
  async function save(event) {
    event.preventDefault()
    if (!canWrite || saving || controller.current) return
    setError(''); setSuccess('')
    try {
      const payload = validatePersonaFields({ name: draft.name, slug: draft.slug, description: draft.description,
        audience_profile: JSON.parse(draft.audience_profile), prompt_guidance: draft.prompt_guidance })
      const pending = new AbortController()
      controller.current = pending
      setSaving(true)
      const result = await scopedRequest(workspaceApi, scope, pending.signal,
        editing ? `/api/personas/${editing}` : '/api/personas', editing ? 'PUT' : 'POST', payload)
      if (pending.signal.aborted) return
      setPersonas((previous) => editing ? previous.map((row) => row.id === result.id ? result : row) : [...previous, result])
      setDraft(null); setEditing(null); setSuccess('Persona saved in this workspace. Select it to use it for generation.')
    } catch (err) {
      if (!controller.current?.signal.aborted && err.code !== 'ERR_CANCELED') setError(err.response ? apiErrorMessage(err, 'Could not save this persona.') :
        err instanceof SyntaxError ? 'Enter a valid audience JSON object.' : err.message)
    } finally { if (!controller.current?.signal.aborted) { setSaving(false); controller.current = null } }
  }
  return <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 className="font-semibold text-slate-900">Workspace personas</h2>
    <p className="mt-2 text-sm text-slate-500">Choose an audience for generation. Brand voice and licensed identity are configured in Settings.</p>
    {loading && <p role="status">Loading personas…</p>}
    {loadError && <p role="alert">{loadError} <button className="underline" onClick={reload}>Try again</button></p>}
    {!loading && !loadError && <>
      {legacyPersona && !isDatabasePersona(legacyPersona) && <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        <p>Your browser persona “{legacyPersona.name}” is preserved locally. Select a workspace persona explicitly to continue, or review a new copy before saving.</p>
        {canWrite && <p className="mt-2 text-xs">Review the copied name, description and pain points before saving. The original browser preferences remain local, including demographic and tone settings.</p>}
        {canWrite && <button type="button" className="mt-2 underline" onClick={() => open({ name: legacyPersona.name || '',
          description: legacyPersona.description || '', prompt_guidance: legacyPersona.painPoints || '', audience_profile: {}, legacy_reference: legacyPersona })}>Review a copy in this workspace</button>}
      </div>}
      {!personas.length && <p className="mt-4 text-sm">No saved personas yet. {canWrite ? 'Create one below to begin.' : 'Ask an owner or administrator to create one.'}</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{personas.map((row) => <div key={row.id} className={`rounded-xl border-2 p-4 transition-colors ${selectedId === row.id ? 'border-blue-800 bg-blue-50' : 'border-slate-200 hover:border-blue-300'}`}>
        <div aria-hidden="true" className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 font-bold text-blue-900">{row.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2)}</div>
        <h3 className="font-semibold text-slate-900">{row.name}</h3><p className="mt-1 text-sm text-slate-500">{row.description}</p>
        <div className="mt-3 flex gap-3 text-sm">
          {onSelect && <button type="button" className="font-medium text-sky-700" aria-pressed={selectedId === row.id} onClick={() => onSelect(row)}>Select persona</button>}
          {canWrite && <button type="button" className="text-slate-600 underline" onClick={() => open(row, row.id)}>Edit</button>}
        </div>
      </div>)}</div>
      {canWrite && !draft && <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <button type="button" className="rounded-lg border px-3 py-2" onClick={() => open(blank)}>New persona</button>
        {proposals.map((row) => <button type="button" key={row.slug} className="text-sky-700 underline" onClick={() => open(row)}>Review {row.name} starter</button>)}
      </div>}
      {canWrite && draft && <form onSubmit={save} className="mt-5 space-y-3 border-t pt-4">
        <h3 className="text-sm font-semibold">{editing ? 'Edit persona' : 'Review and create persona'}</h3>
        <fieldset disabled={saving} className="space-y-3">
          {[['name', 'Persona name', 200], ['slug', 'Short identifier (lowercase words with hyphens)', 100],
            ['description', 'Description', 2000],
            ['prompt_guidance', 'Content guidance', 4000]].map(([key, label, limit]) => <label key={key} className="block text-sm text-slate-700">{label}
            {['name', 'slug'].includes(key) ? <input aria-label={label} required maxLength={limit} value={draft[key]} className="mt-1 w-full rounded-lg border p-2"
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /> :
              <textarea aria-label={label} rows={3} maxLength={limit} value={draft[key]} className="mt-1 w-full rounded-lg border p-2"
                onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />}
          </label>)}
          {!Object.keys(audience || {}).length && <p className="text-xs text-amber-800">Audience details are empty. Add needs and guidance to make this persona useful.</p>}
          {structuredAudience ? AUDIENCE_FIELDS.map(([key, label]) => <label key={key} className="block text-sm text-slate-700">{label}<textarea aria-label={label} rows={3} maxLength={4000} className="mt-1 w-full rounded-lg border p-2"
            value={draft.audience_lines[key] || ''} onChange={(event) => setDraft({ ...draft, audience_lines: { ...draft.audience_lines, [key]: event.target.value }, audience_profile: JSON.stringify(setAudienceLines(audience, key, event.target.value), null, 2) })} /><span className="text-xs text-slate-500">One item per line.</span></label>) : <p className="text-sm text-amber-800">This audience uses a custom shape. Review it in the advanced editor; existing fields are preserved.</p>}
          <details open={!structuredAudience}><summary className="text-sm cursor-pointer">Advanced audience data</summary><textarea aria-label="Audience JSON" rows={6} maxLength={4000} className="mt-2 w-full rounded-lg border p-2" value={draft.audience_profile}
            onChange={(event) => { const raw = event.target.value, parsed = parsedAudience(raw); setDraft({ ...draft, audience_profile: raw, audience_lines: draftFrom({ audience_profile: parsed || {} }).audience_lines }) }} /></details>
          {draft.legacy_reference && <details><summary className="text-sm">Original browser persona (reference only)</summary><pre className="text-xs whitespace-pre-wrap">{JSON.stringify(draft.legacy_reference, null, 2)}</pre></details>}
          <p className="text-xs text-slate-500">Use neutral audience needs. Persona guidance cannot override fair housing, compliance or identity rules.</p>
          <div className="flex gap-3"><button className="rounded-lg bg-sky-700 px-4 py-2 text-sm text-white" type="submit">{saving ? 'Saving…' : 'Save persona'}</button>
            <button type="button" className="text-sm underline" onClick={() => setDraft(null)}>Cancel</button></div>
        </fieldset>
      </form>}
    </>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {success && <p role="status" className="mt-3 text-sm text-emerald-700">{success}</p>}
  </section>
}
