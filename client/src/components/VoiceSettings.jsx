import { useState } from 'react'
import ToneScales from './ToneScales.jsx'
import DualRangeSlider from './DualRangeSlider.jsx'
import { effectiveVoice, voiceOverrides } from '../lib/voiceSettings.js'

const button = 'rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed'

// Tone scales and target age for ONE conversation. The persona belongs to the folder and is not changed here.
export default function VoiceSettings({ defaults, overrides, personaName, disabled, saving, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => effectiveVoice(defaults, overrides))
  const changeTone = (key, value) => {
    const tone = { ...draft.tone }
    // Clearing a scale falls back to the folder/brand default instead of removing it.
    if (value === undefined) { if (defaults.tone[key] === undefined) delete tone[key]; else tone[key] = defaults.tone[key] } else tone[key] = value
    setDraft({ ...draft, tone })
  }
  const age = draft.ageRange
  const result = voiceOverrides(defaults, draft)
  return <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); onSave(result) }}>
    <p className="text-xs text-slate-600">These settings apply to <strong>this conversation only</strong>. Other chats in the {personaName ? `${personaName} folder` : 'folder'} keep the defaults from Settings.</p>
    <div className="space-y-6 pb-3"><ToneScales value={draft.tone} disabled={disabled || saving} onChange={changeTone} /></div>
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3"><span className="text-sm font-semibold text-slate-900">Audience age: {age ? `${age[0]}-${age[1]}` : 'Not set'}</span>
        <button type="button" disabled={disabled || saving} className="text-xs text-slate-500 underline disabled:opacity-40" onClick={() => setDraft({ ...draft, ageRange: age ? defaults.ageRange : [25, 45] })}>{age ? (defaults.ageRange ? 'Use folder default' : 'Clear age range') : 'Use 25–45'}</button></div>
      <DualRangeSlider value={age || [25, 45]} disabled={disabled || saving} onChange={(value) => setDraft({ ...draft, ageRange: value })} />
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <button type="submit" className={`${button} bg-lucent-navy text-white px-5`} disabled={disabled || saving}>{saving ? 'Saving…' : 'Save for this chat'}</button>
      <button type="button" className={button} disabled={disabled || saving} onClick={() => setDraft(effectiveVoice(defaults, {}))}>Reset to defaults</button>
      <button type="button" className={button} onClick={onCancel}>Cancel</button>
    </div>
  </form>
}
