import { useEffect, useRef, useState } from 'react'
import { useBrowserScope } from '../context/BrowserScope.js'
import { useWorkspaceData } from '../context/WorkspaceData.js'
import { workspaceApi, apiErrorMessage } from '../lib/api.js'
import { brandVoiceText, validateBrandFields } from '../lib/workspaceConfiguration.js'
import { brandProfileRequest } from '../lib/brandProfile.js'

import ToneScales from './ToneScales.jsx'
import TagInput from './TagInput.jsx'
import WritingExamplesEditor from './WritingExamplesEditor.jsx'
import { addTag, addWritingExample, writingExamplesError } from '../lib/brandInputs.js'

const fields = [
  ['business_name', 'Business name', 100], ['licensed_person_name', "Licensed person's full name", 100],
  ['nmls_id', 'NMLS identifier', 20], ['dre_number', 'DRE identifier', 20],
  ['tone', 'Tone of voice', 4000, 'voice'],
  ['values', 'Values', 8040, 'tags'], ['keywords', 'Keywords', 8040, 'tags'],
  ['catchphrases', 'Catchphrases', 8040, 'tags'], ['banned_words', 'Banned words', 8040, 'tags'],
  ['blog_examples', 'Writing examples', 8000, 'examples'],
  ['compliance_footer', 'Supplemental disclosure', 1000, 'text'],
  ['equal_housing_text', 'Supplemental equal-housing text', 500, 'text'],
]
function formFrom(profile) {
  return Object.fromEntries(fields.map(([key, , , kind]) => [key,
    kind === 'tags' ? [...(profile?.[key] || [])] : kind === 'voice' ? { ...profile?.[key] } :
      kind === 'examples' ? profile?.[key] ?? [] : profile?.[key] || '']))
}
export default function BrandProfileEditor() {
  const scope = useBrowserScope()
  const { brand, setBrand, canWrite, loading, error: loadError, reload } = useWorkspaceData()
  const [draft, setDraft] = useState(() => formFrom(brand))
  const [pendingTags, setPendingTags] = useState({})
  const [pendingExample, setPendingExample] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const controller = useRef(null)
  useEffect(() => { setDraft(formFrom(brand)); setPendingTags({}); setPendingExample('') }, [brand])
  useEffect(() => () => controller.current?.abort(), [scope])
  async function save(event) {
    event.preventDefault()
    if (!canWrite || saving || controller.current || !brand?.exists) return
    setError(''); setSuccess('')
    try {
      const baseline = formFrom(brand)
      const patch = {}, prepared = { ...draft }
      for (const [key, label, , kind] of fields) {
        if (kind === 'tags') prepared[key] = addTag(draft[key], pendingTags[key] || '', label)
      }
      prepared.blog_examples = addWritingExample(draft.blog_examples, pendingExample)
      const examplesError = writingExamplesError(prepared.blog_examples)
      if (examplesError) throw Error(examplesError)
      for (const [key] of fields) {
        if (JSON.stringify(prepared[key]) !== JSON.stringify(baseline[key])) patch[key] = prepared[key]
      }
      if (!Object.keys(patch).length) { setPendingTags({}); setPendingExample(''); setSuccess('No changes to save.'); return }
      const validated = validateBrandFields(patch)
      const pending = new AbortController()
      controller.current = pending
      setSaving(true)
      const result = await brandProfileRequest(workspaceApi, scope, pending.signal, validated)
      if (!pending.signal.aborted) { setBrand(result); setSuccess('Brand profile saved. New requests use these values.') }
    } catch (err) {
      if (!controller.current?.signal.aborted && err.code !== 'ERR_CANCELED') setError(err.response ? apiErrorMessage(err, 'Could not save brand configuration.') :
        err.message)
    } finally { if (!controller.current?.signal.aborted) { setSaving(false); controller.current = null } }
  }
  return <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 className="mb-3 font-semibold text-slate-900">Brand profile</h2>
    <p className="mb-4 text-sm text-slate-500">Enter verified business and licensing details. Required licensing and Equal Housing Opportunity disclosures are always enforced. Saving details does not verify a license.</p>
    {canWrite && <p className="mb-4 text-xs text-slate-500">Press Enter to turn words or phrases into tags. Changes stay in your draft until you select Save brand profile.</p>}
    {loading && <p role="status">Loading brand profile…</p>}
    {loadError && <div role="alert">{loadError} <button onClick={reload} className="underline">Try again</button></div>}
    {brand && !loading && !loadError && <form onSubmit={save} className="space-y-4">
      {!brand.exists && <p role="alert">No brand profile exists for this workspace. Ask your administrator to provision it.</p>}
      {!canWrite && <p className="text-sm text-slate-500">Your role can view this profile. Ask an owner or administrator to make changes.</p>}
      <fieldset disabled={!canWrite || saving || !brand.exists} className="space-y-3">
        {fields.map(([key, label, limit, kind]) => kind === 'tags' ? <TagInput key={key} label={label} value={draft[key]} pending={pendingTags[key] || ''}
          disabled={!canWrite || saving || !brand.exists} onChange={(value) => setDraft({ ...draft, [key]: value })} onPendingChange={(value) => setPendingTags((previous) => ({ ...previous, [key]: value }))} /> :
          kind === 'examples' ? <WritingExamplesEditor key={key} value={draft[key]} pending={pendingExample} onPendingChange={setPendingExample} disabled={!canWrite || saving || !brand.exists} onChange={(value) => setDraft({ ...draft, [key]: value })} /> :
          <label key={key} className="block text-sm text-slate-700">{label}
            {kind ? <textarea rows={3} aria-label={label} maxLength={limit} className="mt-1 w-full rounded-lg border border-slate-300 p-2 disabled:bg-slate-50"
              value={kind === 'voice' ? brandVoiceText(draft[key]) : draft[key]} onChange={(event) => setDraft({ ...draft, [key]: kind === 'voice' ? { ...draft[key], voice: event.target.value } : event.target.value })} /> :
              <input aria-label={label} maxLength={limit} className="mt-1 w-full rounded-lg border border-slate-300 p-2 disabled:bg-slate-50" value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />}
            {key === 'tone' && <span className="text-xs text-slate-500">For example: Clear, professional and warm.</span>}
          </label>)}
        <div className="space-y-4 rounded-xl bg-slate-50 p-4"><h3 className="font-medium text-sm">Shared tone scales</h3><p className="text-xs text-slate-500">These apply to every persona. Leave unset for no preference; use persona guidance for audience-specific explanations.</p>
          <ToneScales value={draft.tone} disabled={!canWrite || saving || !brand.exists} onChange={(key, value) => { const tone = { ...draft.tone }; if (value === undefined) delete tone[key]; else tone[key] = value; setDraft({ ...draft, tone }) }} />
        </div>
        {(!brand.keywords?.length || !brand.catchphrases?.length) && <p className="text-xs text-amber-800">Keywords or catchphrases are empty. Existing voice text may still be useful; review these fields against your approved brand guidance.</p>}
        {!brandVoiceText(brand.tone) && <p className="text-sm text-amber-800">Shared brand voice is empty. Review wording before saving.</p>}
        <button type="button" className="text-sm underline text-blue-800" onClick={() => { const tone = draft.tone; if (!brandVoiceText(tone)) setDraft({ ...draft, tone: { ...tone, voice: 'Professional, authoritative, serious and matter-of-fact; communicate competence, clarity and transparency without hype.' } }) }}>Review legacy-inspired voice draft (fills empty voice only)</button>
        {canWrite && <button type="submit" disabled={saving} className="rounded-lg bg-sky-700 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save brand profile'}</button>}
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="text-sm text-emerald-700">{success}</p>}
    </form>}
  </section>
}
