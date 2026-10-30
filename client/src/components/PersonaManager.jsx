import { useEffect, useRef, useState } from 'react'
import { useBrowserScope } from '../context/BrowserScope.js'
import { useWorkspaceData } from '../context/WorkspaceData.js'
import { workspaceApi, apiErrorMessage } from '../lib/api.js'
import { scopedRequest, validatePersonaFields, isDatabasePersona } from '../lib/workspaceConfiguration.js'
import { newPersonaSlug, personaInitials } from '../lib/personaGuidelines.js'
import BrandSetupSection from './BrandSetupSection.jsx'
import PersonaGuidelines from './PersonaGuidelines.jsx'

const fieldClass = 'w-full rounded-lg border border-slate-300 bg-slate-50/50 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-700'
const proposals = [
  { name: 'The Business Owner', description: 'Business owners navigating complex income documentation.', audience_profile: { needs: ['Complex income documentation', 'Clear financing education'] }, prompt_guidance: 'Explain documentation and financing options neutrally. Never promise qualification, pricing or underwriting outcomes.' },
  { name: 'First-Time Homebuyer', description: 'People new to the mortgage process who want understandable guidance.', audience_profile: { needs: ['Mortgage process education', 'Clear next steps'] }, prompt_guidance: 'Explain terms step by step without assuming age, income, family status or eligibility. No guarantees.' },
]

export default function PersonaManager({ onSelect, legacyPersona, selectedId }) {
  const scope = useBrowserScope()
  const { personas, setPersonas, canWrite, loading, error: loadError, reload } = useWorkspaceData()
  const [draft, setDraft] = useState(null)
  const [guidelinesId, setGuidelinesId] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const controller = useRef(null)
  useEffect(() => () => controller.current?.abort(), [scope])
  const guidelinesPersona = personas.find((row) => row.id === guidelinesId)
  const activeId = selectedId || personas[0]?.id
  const choose = (row) => { if (onSelect) onSelect(row); else setGuidelinesId(row.id) }
  const open = (row = {}) => { setDraft({ name: '', description: '', ...row }); setError('') }
  async function save(event) {
    event.preventDefault()
    if (!canWrite || saving || controller.current) return
    setError('')
    try {
      const fields = { name: draft.name, description: draft.description }
      if (!draft.id) Object.assign(fields, { slug: newPersonaSlug(draft.name), audience_profile: draft.audience_profile || {}, prompt_guidance: draft.prompt_guidance || '' })
      const payload = validatePersonaFields(fields)
      const pending = new AbortController(); controller.current = pending; setSaving(true)
      const result = await scopedRequest(workspaceApi, scope, pending.signal, draft.id ? `/api/personas/${draft.id}` : '/api/personas', draft.id ? 'PUT' : 'POST', payload)
      if (pending.signal.aborted) return
      setPersonas((previous) => draft.id ? previous.map((row) => row.id === result.id ? result : row) : [...previous, result])
      setDraft(null)
      if (!draft.id) choose(result)
    } catch (err) {
      if (!controller.current?.signal.aborted && err.code !== 'ERR_CANCELED') setError(err.response ? apiErrorMessage(err, 'Could not save this persona.') : err.message)
    } finally { if (!controller.current?.signal.aborted) { setSaving(false); controller.current = null } }
  }
  const compactForm = <form onSubmit={save} className="space-y-2.5 rounded-xl border-2 border-slate-300 bg-white p-4">
    <fieldset disabled={saving} className="space-y-2.5">
      <input autoFocus required aria-label="Persona name" placeholder="Persona name" maxLength={200} className={fieldClass} value={draft?.name || ''} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
      <textarea aria-label="Short description" placeholder="Short description" maxLength={2000} rows={2} className={fieldClass} value={draft?.description || ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
      {draft?.legacy_reference && <details><summary className="text-xs text-slate-500">Original browser persona (reference only)</summary><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(draft.legacy_reference, null, 2)}</pre></details>}
      <div className="flex gap-2 pt-0.5"><button type="submit" className="flex-1 rounded-lg bg-sky-700 py-2 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-50" disabled={saving || !draft?.name.trim()}>{saving ? 'Saving…' : draft?.id ? 'Save' : 'Add Persona'}</button>
        <button type="button" onClick={() => { setDraft(null); setError('') }} className="flex-1 rounded-lg py-2 text-xs font-medium text-slate-500 hover:text-slate-700">Cancel</button></div>
    </fieldset>
  </form>
  if (guidelinesPersona) return <PersonaGuidelines key={guidelinesPersona.id} persona={guidelinesPersona} onBack={() => setGuidelinesId(null)} onDone={() => setGuidelinesId(null)} />
  return <BrandSetupSection number="00" title="Persona Selector">
    {loading && <p role="status" className="text-sm text-slate-500">Loading personas…</p>}
    {loadError && <p role="alert">{loadError} <button type="button" className="underline" onClick={reload}>Try again</button></p>}
    {!loading && !loadError && <>
      {legacyPersona && !isDatabasePersona(legacyPersona) && <div className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
        <p>Your browser persona “{legacyPersona.name}” is preserved locally. Select a workspace persona explicitly to continue.</p>
        {canWrite && <button type="button" className="mt-2 underline" onClick={() => open({ name: legacyPersona.name || '', description: legacyPersona.description || '', prompt_guidance: legacyPersona.painPoints || '', audience_profile: {}, legacy_reference: legacyPersona })}>Review a copy in this workspace</button>}
      </div>}
      {!personas.length && <p className="mb-4 text-sm text-slate-500">No saved personas yet. {canWrite ? 'Add your first persona below.' : 'Ask an owner or administrator to create one.'}</p>}
      <div className="grid gap-3 sm:grid-cols-2">{personas.map((row) => {
        if (draft?.id === row.id) return <div key={row.id}>{compactForm}</div>
        const active = row.id === activeId
        return <div key={row.id} className={`relative rounded-xl border-2 transition-colors ${active ? 'border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/20' : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:shadow-sm'}`}>
          <button type="button" aria-label={`Select persona: ${row.name}`} aria-pressed={active} onClick={() => choose(row)} className="h-full w-full rounded-xl p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">
            <span aria-hidden="true" className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold ${active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-700'}`}>{personaInitials(row.name)}</span>
            <span className="mb-1 block pr-5 text-sm font-semibold">{row.name}</span><span className={`block text-xs leading-relaxed ${active ? 'text-slate-300' : 'text-slate-500'}`}>{row.description}</span>
            {active && <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-900"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Active</span>}
          </button>
          {canWrite && <button type="button" aria-label={`Edit ${row.name}`} title={`Edit ${row.name}`} onClick={() => open(row)} className={`absolute right-2.5 top-2.5 rounded-md p-1.5 ${active ? 'text-slate-400 hover:bg-white/10 hover:text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}>
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
          </button>}
        </div>
      })}</div>
      {canWrite && (draft && !draft.id ? <div className="mt-3">{compactForm}</div> : !draft && <>
        <button type="button" aria-label="New persona" onClick={() => open()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-3.5 text-sm font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700"><span aria-hidden="true" className="text-lg leading-none">＋</span>New persona</button>
        <details className="mt-4"><summary className="cursor-pointer text-xs text-slate-400">Persona starters</summary><div className="mt-2 flex flex-wrap gap-3">{proposals.map((row) => <button key={row.name} type="button" className="text-xs text-sky-700 underline" onClick={() => open(row)}>Review {row.name} starter</button>)}</div></details>
      </>)}
    </>}
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
  </BrandSetupSection>
}
