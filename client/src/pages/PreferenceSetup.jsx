import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePreferences } from '../context/PreferencesContext'
import { useWorkspaceData } from '../context/WorkspaceData.js'
import { selectDatabasePersona } from '../lib/workspaceConfiguration.js'
import PersonaManager from '../components/PersonaManager.jsx'
import lucieAvatar from '../assets/lucie-avatar.jpg'

// Keep the pick -> review -> use onboarding flow. Workspace voice is edited once
// in Settings; persona audiences use the same database editor here and there.
export default function PreferenceSetup({ onComplete }) {
  const { preferences, setPreferences } = usePreferences()
  const { brand, personas } = useWorkspaceData()
  const [selectedId, setSelectedId] = useState(null)
  const selected = personas.find((row) => row.id === selectedId)
  function complete() {
    if (!selected) return
    setPreferences(selectDatabasePersona(preferences, selected))
    onComplete?.(selected)
  }
  return <div className="min-h-dvh bg-slate-50">
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
        <img src={lucieAvatar} alt="Lucie" className="h-8 w-8 rounded-full object-cover" />
        <h1 className="text-lg font-bold text-slate-900">Lucie: Persona setup</h1>
        <Link to="/settings" className="ml-auto text-sm text-sky-700 underline">Brand settings</Link>
      </div>
    </header>
    <main className="mx-auto max-w-2xl px-4 py-8">
      {!selected ? <PersonaManager onSelect={(row) => setSelectedId(row.id)} legacyPersona={preferences?.persona} /> :
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <button className="mb-5 text-sm text-slate-500 underline" onClick={() => setSelectedId(null)}>Back to personas</button>
          <h2 className="text-lg font-semibold">Review {selected.name}</h2>
          <p className="mt-3 text-sm text-slate-600">{selected.description}</p>
          <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{selected.prompt_guidance}</p>
          <p className="mt-4 text-sm text-slate-500">Brand voice and licensed identity come from this workspace's brand profile. Existing browser personas and chat history are preserved.</p>
          {(!brand?.licensed_person_name || !brand?.nmls_id || !brand?.dre_number) && <p role="status" className="mt-4 text-sm text-amber-800">Before generating, an authorized editor must complete licensing in <Link className="underline" to="/settings">Settings</Link>.</p>}
          <button className="mt-6 w-full rounded-xl bg-sky-700 py-3 font-semibold text-white" onClick={complete}>Use this persona</button>
        </section>}
    </main>
  </div>
}
