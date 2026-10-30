import { useState } from 'react'
import { usePreferences } from '../context/PreferencesContext'
import { useWorkspaceData } from '../context/WorkspaceData.js'
import { selectDatabasePersona } from '../lib/workspaceConfiguration.js'
import PersonaManager from '../components/PersonaManager.jsx'
import PersonaGuidelines from '../components/PersonaGuidelines.jsx'
import lucieAvatar from '../assets/lucie-avatar.jpg'

export default function PreferenceSetup({ onComplete, onCancel }) {
  const { preferences, setPreferences } = usePreferences()
  const { personas } = useWorkspaceData()
  const [selectedId, setSelectedId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const selected = personas.find((row) => row.id === editingId)
  const activeId = selectedId || personas.find((row) => row.id === preferences?.persona?.id)?.id || personas[0]?.id
  function complete(persona) {
    setPreferences(selectDatabasePersona(preferences, persona))
    onComplete?.(persona)
  }
  return <div className="min-h-full bg-slate-50">
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src={lucieAvatar} alt="Lucie" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          <h1 className="truncate text-base text-slate-900 sm:text-lg"><span className="font-bold">Lucie</span><span className="font-normal">: Lucent's AI Social Media Assistant</span></h1>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">Brand Setup</span>
      </div>
    </header>
    <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      {onCancel && !selected && <button type="button" onClick={onCancel} className="mb-4 text-xs text-slate-500 hover:text-slate-700">← Back to chats</button>}
      {selected ? <PersonaGuidelines key={selected.id} persona={selected} startChat onBack={() => setEditingId(null)} onDone={complete} /> :
        <PersonaManager selectedId={activeId} onSelect={(row) => { setSelectedId(row.id); setEditingId(row.id) }} legacyPersona={preferences?.persona} />}
    </section>
  </div>
}
