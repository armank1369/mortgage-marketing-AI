import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePreferences } from '../context/PreferencesContext'
import { useWorkspaceData } from '../context/WorkspaceData.js'
import { selectDatabasePersona } from '../lib/workspaceConfiguration.js'
import PersonaManager from '../components/PersonaManager.jsx'
import BrandSummary from '../components/BrandSummary.jsx'
import lucieAvatar from '../assets/lucie-avatar.jpg'

// Keep the pick -> review -> use onboarding flow. Workspace voice is edited once
// in Settings; persona audiences use the same database editor here and there.
export default function PreferenceSetup({ onComplete, onCancel }) {
  const { preferences, setPreferences } = usePreferences()
  const { brand, personas } = useWorkspaceData()
  const [selectedId, setSelectedId] = useState(null)
  const selected = personas.find((row) => row.id === selectedId)
  function complete() {
    if (!selected) return
    setPreferences(selectDatabasePersona(preferences, selected))
    onComplete?.(selected)
  }
  return <div className="min-h-full bg-slate-50">
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
        <img src={lucieAvatar} alt="Lucie" className="h-8 w-8 rounded-full object-cover" />
        <h1 className="text-lg font-bold text-slate-900">Lucie: Persona setup</h1>
        {onCancel && <button type="button" onClick={onCancel} className="text-sm underline">Cancel</button>}
        <Link to="/settings" className="ml-auto text-sm text-sky-700 underline">Brand settings</Link>
      </div>
    </header>
    <section className="mx-auto max-w-2xl px-4 py-8">
      {!selected ? <PersonaManager selectedId={selectedId} onSelect={(row) => setSelectedId(row.id)} legacyPersona={preferences?.persona} /> :
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <button className="mb-5 text-sm text-slate-500 underline" onClick={() => setSelectedId(null)}>Back to personas</button>
          <h2 className="text-lg font-semibold mb-5">Review {selected.name}</h2>
          <BrandSummary persona={selected} brand={brand} />
          <p className="mt-4 text-sm text-blue-900">One persona per conversation. To address another audience, start a separate chat.</p>
          {(!Object.keys(selected.audience_profile || {}).length || !selected.prompt_guidance) && <p role="status" className="mt-3 text-sm text-amber-800">This persona has limited audience details or guidance. An authorized editor can enrich it in Settings.</p>}
          {(!brand?.licensed_person_name || !brand?.nmls_id || !brand?.dre_number) && <p role="status" className="mt-4 text-sm text-amber-800">Before generating, an authorized editor must complete licensing in <Link className="underline" to="/settings">Settings</Link>.</p>}
          <button className="mt-6 w-full rounded-xl bg-sky-700 py-3 font-semibold text-white" onClick={complete}>Use this persona</button>
        </section>}
    </section>
  </div>
}
