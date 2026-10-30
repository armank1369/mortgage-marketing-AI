import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useBrowserScope } from '../context/BrowserScope.js'
import { useWorkspaceData } from '../context/WorkspaceData.js'
import { workspaceApi, apiErrorMessage } from '../lib/api.js'
import { scopedRequest } from '../lib/workspaceConfiguration.js'
import { brandProfileRequest } from '../lib/brandProfile.js'
import { AUDIENCE_FIELDS, audienceCompatible, setAudienceLines } from '../lib/legacyRecovery.js'
import { INCOME_OPTIONS, EDUCATION_OPTIONS, personaInitials, parseAudience, validAgeRange, guidelinesDraft, guidelinePatches } from '../lib/personaGuidelines.js'
import BrandSetupSection from './BrandSetupSection.jsx'
import ToneScales from './ToneScales.jsx'
import DualRangeSlider from './DualRangeSlider.jsx'
import TagInput from './TagInput.jsx'
import { addTag } from '../lib/brandInputs.js'

const fieldClass = 'w-full rounded-lg border border-slate-300 bg-slate-50/50 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-700 disabled:text-slate-500'

export default function PersonaGuidelines({ persona, onBack, onDone, startChat = false }) {
  const scope = useBrowserScope()
  const { brand, setBrand, setPersonas, canWrite, error: configError } = useWorkspaceData()
  const [draft, setDraft] = useState(() => guidelinesDraft(persona, brand))
  const [pendingValue, setPendingValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef(null)
  useEffect(() => () => controller.current?.abort(), [scope])
  const audience = parseAudience(draft.audienceRaw)
  const structured = audience && audienceCompatible(audience)
  const configuredAge = validAgeRange(audience?.ageRange)
  const customAge = audience?.ageRange !== undefined && !configuredAge
  const disabled = !canWrite || saving || !!configError
  const changeAudience = (key, value) => {
    const next = { ...audience }
    if (value === undefined) delete next[key]; else next[key] = value
    setDraft({ ...draft, audienceRaw: JSON.stringify(next, null, 2) })
  }
  const linesField = (key, label, rows = 3) => <label key={key} className="block text-sm font-medium text-slate-700">{label}
    <textarea aria-label={label} rows={rows} maxLength={4000} className={`${fieldClass} mt-1.5`} value={draft.audienceLines[key] || ''}
      onChange={(event) => setDraft({ ...draft, audienceLines: { ...draft.audienceLines, [key]: event.target.value }, audienceRaw: JSON.stringify(setAudienceLines(audience, key, event.target.value), null, 2) })} />
  </label>

  async function save(event) {
    event.preventDefault()
    if (saving || controller.current || configError) return
    if (!canWrite) { onDone?.(persona); return }
    setError('')
    let audienceSaved = false
    try {
      const { personaPatch, brandPatch } = guidelinePatches(persona, brand, { ...draft, coreValues: addTag(draft.coreValues, pendingValue, 'Core values') })
      if (Object.keys(brandPatch).length && !brand?.exists) throw Error('A workspace brand profile must be provisioned before saving shared brand settings.')
      const pending = new AbortController(); controller.current = pending; setSaving(true)
      let savedPersona = persona
      if (Object.keys(personaPatch).length) {
        savedPersona = await scopedRequest(workspaceApi, scope, pending.signal, `/api/personas/${persona.id}`, 'PUT', personaPatch)
        if (pending.signal.aborted) return
        setPersonas((previous) => previous.map((row) => row.id === savedPersona.id ? savedPersona : row))
        audienceSaved = true
      }
      if (Object.keys(brandPatch).length) {
        const savedBrand = await brandProfileRequest(workspaceApi, scope, pending.signal, brandPatch)
        if (pending.signal.aborted) return
        setBrand(savedBrand)
      }
      if (!pending.signal.aborted) onDone?.(savedPersona)
    } catch (err) {
      if (!controller.current?.signal.aborted && err.code !== 'ERR_CANCELED') setError(`${audienceSaved ? 'Audience changes were saved. Shared brand settings were not saved. ' : ''}${err.response ? apiErrorMessage(err, 'Could not save guidelines. Try again.') : err.message}`)
    } finally { if (!controller.current?.signal.aborted) { setSaving(false); controller.current = null } }
  }

  return <form data-persona-guidelines="true" onSubmit={save}>
    <button type="button" disabled={saving} onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50">← Back to personas</button>
    <div className="mb-8 flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">{personaInitials(persona.name)}</span>
      <div className="min-w-0"><p className="text-xs text-slate-500">Brand guidelines for</p><h2 className="truncate text-base font-bold text-slate-900">{persona.name}</h2></div>
    </div>
    {configError && <p role="alert" className="mb-4 text-sm text-red-700">{configError}</p>}
    {!canWrite && <p className="mb-5 text-xs text-slate-500">Your role can review these guidelines. An owner or administrator can edit them.</p>}
    <fieldset disabled={disabled}>
      <BrandSetupSection number="01" title="Brand Voice" note="Shared across all personas in this workspace.">
        <p className="mb-3 text-xs text-slate-500">What principles guide everything your brand does?</p>
        <TagInput label="Core values" value={draft.coreValues} pending={pendingValue} onPendingChange={setPendingValue} disabled={!brand?.exists || disabled} placeholder="e.g. Transparency" onChange={(value) => setDraft({ ...draft, coreValues: value })} />
      </BrandSetupSection>
      <BrandSetupSection number="02" title="Tone of Voice" note="Shared across all personas in this workspace.">
        <ToneScales value={draft.tone} disabled={disabled || !brand?.exists} onChange={(key, value) => { const tone = { ...draft.tone }; if (value === undefined) delete tone[key]; else tone[key] = value; setDraft({ ...draft, tone }) }} />
      </BrandSetupSection>
      <BrandSetupSection number="03" title="Target Audience">
        {audience && <>
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between gap-3"><span className="text-sm font-semibold text-slate-900">Age range: {configuredAge ? `${audience.ageRange[0]}-${audience.ageRange[1]}` : customAge ? 'Custom stored value' : 'Not set'}</span>
              {!customAge && <button type="button" className="text-xs text-slate-500 underline" onClick={() => changeAudience('ageRange', configuredAge ? undefined : [25, 45])}>{configuredAge ? 'Clear age range' : 'Use 25–45'}</button>}</div>
            <DualRangeSlider value={configuredAge ? audience.ageRange : [25, 45]} disabled={disabled || customAge} onChange={(value) => changeAudience('ageRange', value)} />
            <div className="mt-1.5 flex justify-between text-[11px] text-slate-400"><span>1</span><span>100</span></div>
          </div>
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            {[["income", "Household income", INCOME_OPTIONS], ["education", "Highest education attained", EDUCATION_OPTIONS]].map(([key, label, options]) => <label key={key} className="block text-sm font-medium text-slate-700">{label}
              <select aria-label={label} className={`${fieldClass} mt-1.5`} disabled={disabled || (audience[key] !== undefined && typeof audience[key] !== 'string')} value={typeof audience[key] === 'string' ? audience[key] : ''} onChange={(event) => changeAudience(key, event.target.value || undefined)}>
                <option value="">Not set</option>{typeof audience[key] === 'string' && audience[key] && !options.includes(audience[key]) && <option value={audience[key]}>{audience[key]}</option>}{options.map((option) => <option key={option}>{option}</option>)}</select>
            </label>)}
          </div>
        </>}
        {structured ? linesField('pain_points', 'Pain points') : <p className="text-sm text-slate-500">Your saved audience uses custom fields. Review them in advanced settings below.</p>}
        <details className="mt-6" open={!structured}>
          <summary className="cursor-pointer text-xs font-medium text-slate-500">More audience and writing guidance</summary>
          <div className="mt-4 space-y-4">
            {structured && AUDIENCE_FIELDS.filter(([key]) => key !== 'pain_points').map(([key, label]) => linesField(key, label))}
            <label className="block text-sm font-medium text-slate-700">Content guidance<textarea aria-label="Content guidance" rows={3} maxLength={4000} className={`${fieldClass} mt-1.5`} value={draft.guidance} onChange={(event) => setDraft({ ...draft, guidance: event.target.value })} /></label>
            <details open={!structured}><summary className="cursor-pointer text-xs text-slate-500">Advanced audience data</summary>
              <textarea aria-label="Audience JSON" rows={6} maxLength={4000} className={`${fieldClass} mt-2 font-mono text-xs`} value={draft.audienceRaw} onChange={(event) => { const raw = event.target.value; setDraft({ ...draft, audienceRaw: raw, audienceLines: guidelinesDraft({ ...persona, audience_profile: parseAudience(raw) || {} }, brand).audienceLines }) }} />
            </details>
          </div>
        </details>
      </BrandSetupSection>
    </fieldset>
    {(!brand?.exists || !brand?.licensed_person_name || !brand?.nmls_id || !brand?.dre_number) && <p className="mb-4 text-xs text-amber-800">An authorized editor must complete the brand and licensing details in <Link to="/settings" className="underline">Settings</Link> before generation.</p>}
    {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
    <button type="submit" disabled={saving || !!configError} className="w-full rounded-xl bg-sky-700 py-3.5 font-semibold text-white shadow-lg shadow-sky-900/10 transition-colors hover:bg-sky-800 disabled:opacity-50">{saving ? 'Saving guidelines…' : canWrite ? 'Set Brand Guidelines' : startChat ? 'Use this persona' : 'Done'}</button>
    {startChat && <p className="mt-3 text-center text-xs text-slate-500">A new conversation will use this persona.</p>}
  </form>
}
