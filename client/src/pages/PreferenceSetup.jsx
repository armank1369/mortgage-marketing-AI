import { useState, useMemo } from 'react'
import { usePreferences } from '../context/PreferencesContext'
import DualRangeSlider from '../components/DualRangeSlider'
import { NMLS_NUMBER } from '../constants'

const INITIAL_PERSONAS = [
  {
    id: 'business-owner',
    name: 'The Business Owner',
    initials: 'BO',
    description:
      'Age 35-60, self-employed or entrepreneur. Complex finances, frustrated with traditional banks. Needs Non-QM loan options.',
    apiKey: 'self-employed',
  },
]

const INCOME_OPTIONS = ['Under $100k', '$100k-$200k', '$200k-$300k', '$300k-$500k', '$500k+']

const EDUCATION_OPTIONS = ['High school', 'Some college', "Bachelor's degree", 'Graduate degree']

const TONE_SCALES = [
  { key: 'professional', low: 'Professional', high: 'Casual' },
  { key: 'authoritative', low: 'Authoritative', high: 'Conversational' },
  { key: 'serious', low: 'Serious', high: 'Humorous' },
  { key: 'matterOfFact', low: 'Matter of Fact', high: 'Enthusiastic' },
]

const DEFAULT_TONE = {
  professional: 3,
  authoritative: 3,
  serious: 3,
  matterOfFact: 3,
}

const fieldClass =
  'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-700 focus:border-sky-700 bg-slate-50/50 placeholder:text-slate-400'

const initials = (name) =>
  name.split(' ').map((word) => word[0]).slice(0, 2).join('').toUpperCase()

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5v14" />
    </svg>
  )
}

function Section({ number, title, children }) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-8 h-8 rounded-lg bg-sky-700 text-white text-xs font-bold flex items-center justify-center">
          {number}
        </span>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm shadow-slate-900/5 p-5 sm:p-6">
        {children}
      </div>
    </section>
  )
}

export default function PreferenceSetup({ onComplete }) {
  const { preferences, setPreferences } = usePreferences()

  const saved = preferences || {}
  const savedPersona = saved.persona

  const initialPersonas = useMemo(() => {
    if (!savedPersona) return INITIAL_PERSONAS
    const index = INITIAL_PERSONAS.findIndex((p) => p.apiKey === savedPersona.apiKey)
    if (index === -1) return [savedPersona, ...INITIAL_PERSONAS]
    const copy = [...INITIAL_PERSONAS]
    copy[index] = savedPersona
    return copy
  }, [savedPersona])

  const [personas, setPersonas] = useState(initialPersonas)
  const [selectedPersonaId, setSelectedPersonaId] = useState(
    savedPersona?.id || INITIAL_PERSONAS[0].id
  )

  const [coreValues, setCoreValues] = useState(saved.coreValues || '')
  const [tone, setTone] = useState(saved.tone || DEFAULT_TONE)
  const [ageRange, setAgeRange] = useState(saved.ageRange || [25, 45])
  const [income, setIncome] = useState(saved.income || INCOME_OPTIONS[0])
  const [education, setEducation] = useState(saved.education || EDUCATION_OPTIONS[0])
  const [painPoints, setPainPoints] = useState(saved.painPoints || '')

  const [editingPersonaId, setEditingPersonaId] = useState(null)
  const [draftName, setDraftName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')

  const [creatingPersona, setCreatingPersona] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')

  const startEdit = (persona) => {
    setEditingPersonaId(persona.id)
    setDraftName(persona.name)
    setDraftDescription(persona.description)
  }

  const saveEdit = (id) => {
    const name = draftName.trim()
    if (!name) return
    setPersonas((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, name, description: draftDescription.trim() } : p
      )
    )
    setEditingPersonaId(null)
  }

  const saveNewPersona = () => {
    const name = newName.trim()
    if (!name) return
    const persona = {
      id: `custom-${Date.now()}`,
      name,
      description: newDescription.trim() || 'Custom persona',
      apiKey: 'custom',
    }
    setPersonas((prev) => [...prev, persona])
    setSelectedPersonaId(persona.id)
    setCreatingPersona(false)
    setNewName('')
    setNewDescription('')
  }

  const handleSubmit = () => {
    const persona = personas.find((p) => p.id === selectedPersonaId)
    if (!persona) return
    setPreferences({
      name: 'Joseph',
      nmls: NMLS_NUMBER,
      persona,
      coreValues: coreValues.trim(),
      tone,
      ageRange,
      income,
      education,
      painPoints: painPoints.trim(),
    })
    onComplete?.(persona)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-700 text-white flex items-center justify-center text-sm font-bold">
              L
            </div>
            <h1 className="text-lg font-bold text-slate-900">Lucent Social Media Assistant</h1>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-full px-3 py-1.5">
            Brand Setup
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <Section number="00" title="Persona Selector">
          <div className="grid sm:grid-cols-2 gap-3">
            {personas.map((p) => {
              const selected = selectedPersonaId === p.id && editingPersonaId !== p.id
              const isEditing = editingPersonaId === p.id

              if (isEditing) {
                return (
                  <div key={p.id} className="rounded-xl border-2 border-slate-300 bg-white p-4 space-y-2.5">
                    <input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="Persona name"
                      autoFocus
                      className={fieldClass}
                    />
                    <textarea
                      value={draftDescription}
                      onChange={(e) => setDraftDescription(e.target.value)}
                      placeholder="Short description"
                      rows={2}
                      className={fieldClass}
                    />
                    <div className="flex gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => saveEdit(p.id)}
                        className="flex-1 bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingPersonaId(null)}
                        className="flex-1 text-slate-500 hover:text-slate-700 text-xs font-medium py-2 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )
              }

              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPersonaId(p.id)}
                  className={`relative rounded-xl border-2 p-4 cursor-pointer transition-all ${
                    selected
                      ? 'bg-slate-900 border-slate-900 text-white shadow-lg shadow-slate-900/20'
                      : 'bg-white border-slate-200 text-slate-900 hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      startEdit(p)
                    }}
                    aria-label={`Edit ${p.name}`}
                    className={`absolute top-2.5 right-2.5 p-1.5 rounded-md transition-colors ${
                      selected
                        ? 'text-slate-400 hover:text-white hover:bg-white/10'
                        : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <PencilIcon />
                  </button>

                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold mb-3 ${
                      selected ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {p.initials || initials(p.name)}
                  </div>
                  <h3 className="font-semibold text-sm mb-1">{p.name}</h3>
                  <p className={`text-xs leading-relaxed ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
                    {p.description}
                  </p>
                  {selected && (
                    <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-900 bg-white rounded-full px-2.5 py-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Active
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {creatingPersona ? (
            <div className="mt-3 rounded-xl border-2 border-slate-300 bg-white p-4 space-y-2.5">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Persona name (e.g. Retiree Rick)"
                autoFocus
                className={fieldClass}
              />
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Short description"
                rows={2}
                className={fieldClass}
              />
              <div className="flex gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={saveNewPersona}
                  className="flex-1 bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
                >
                  Add Persona
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingPersona(false)
                    setNewName('')
                    setNewDescription('')
                  }}
                  className="flex-1 text-slate-500 hover:text-slate-700 text-xs font-medium py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreatingPersona(true)}
              className="w-full mt-3 border-2 border-dashed border-slate-300 rounded-xl py-3.5 text-sm font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors flex items-center justify-center gap-2"
            >
              <PlusIcon />
              New persona
            </button>
          )}
        </Section>

        <Section number="01" title="Brand Voice">
          <label className="block text-sm font-semibold text-slate-900">Core values</label>
          <p className="text-xs text-slate-500 mt-1 mb-3">
            What principles guide everything your brand does?
          </p>
          <textarea
            value={coreValues}
            onChange={(e) => setCoreValues(e.target.value)}
            rows={4}
            placeholder="e.g. Transparency, open communication, radical honesty about limitations..."
            className={fieldClass}
          />
        </Section>

        <Section number="02" title="Tone of Voice">
          <div className="space-y-5">
            {TONE_SCALES.map((scale) => (
              <div key={scale.key} className="flex items-center gap-2 sm:gap-3">
                <span className="w-24 sm:w-32 text-xs font-medium text-slate-600 shrink-0">
                  {scale.low}
                </span>
                <div className="flex-1 flex justify-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => {
                    const active = tone[scale.key] === n
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setTone((prev) => ({ ...prev, [scale.key]: n }))}
                        className={`h-9 w-9 shrink-0 rounded-lg border-2 text-sm font-semibold transition-all ${
                          active
                            ? 'bg-slate-900 border-slate-900 text-white shadow-md shadow-slate-900/20'
                            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'
                        }`}
                      >
                        {n}
                      </button>
                    )
                  })}
                </div>
                <span className="w-24 sm:w-32 text-xs font-medium text-slate-600 shrink-0 text-right">
                  {scale.high}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section number="03" title="Target Audience">
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-900 mb-3">
              Age range: {ageRange[0]}-{ageRange[1]}
            </label>
            <DualRangeSlider min={1} max={100} value={ageRange} onChange={setAgeRange} />
            <div className="flex justify-between text-[11px] text-slate-400 mt-1.5">
              <span>1</span>
              <span>100</span>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Household income
              </label>
              <select
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                className={fieldClass}
              >
                {INCOME_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Highest education attained
              </label>
              <select
                value={education}
                onChange={(e) => setEducation(e.target.value)}
                className={fieldClass}
              >
                {EDUCATION_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Pain points
            </label>
            <textarea
              value={painPoints}
              onChange={(e) => setPainPoints(e.target.value)}
              rows={3}
              placeholder="e.g. Last minute underwriting demands and lack of transparency around costs and fees."
              className={fieldClass}
            />
          </div>
        </Section>

        <button
          type="button"
          onClick={handleSubmit}
          className="w-full bg-sky-700 hover:bg-sky-800 text-white font-semibold py-3.5 rounded-xl transition-colors shadow-lg shadow-sky-900/10"
        >
          Set Brand Guidelines
        </button>
      </main>
    </div>
  )
}
