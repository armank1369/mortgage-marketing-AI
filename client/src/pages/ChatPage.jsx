import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useBrowserScope } from '../context/BrowserScope.js'
import { useWorkspaceData } from '../context/WorkspaceData.js'
import { useWorkspaceAccess } from '../context/WorkspaceAccess.js'
import { useChatPersistence } from '../lib/useChatPersistence.js'
import { projectConversation, visibleOperations } from '../lib/chatSerialization.js'
import { loadChatsFromStorage } from '../utils/storage.js'
import { PROMPT_CATEGORIES } from '../lib/chatPrompts.js'
import { buildPersonaFolders, folderFor, newestFirst, formatChatTime } from '../lib/chatFolders.js'
import { defaultVoice, customVoiceCount } from '../lib/voiceSettings.js'
import VoiceSettings from '../components/VoiceSettings.jsx'
import PersonaGuidelines from '../components/PersonaGuidelines.jsx'
import { isLongChat } from '../lib/longChat.js'
import PreferenceSetup from './PreferenceSetup.jsx'
import BrandSummary from '../components/BrandSummary.jsx'
import Dialog from '../components/Dialog.jsx'
import { downloadJSON, exportDocument, promptSuggestions } from '../lib/legacyRecovery.js'
import PersistedMessage from '../components/PersistedMessage.jsx'
import TypingIndicator from '../components/TypingIndicator.jsx'
import ConversationSkeleton from '../components/ConversationSkeleton.jsx'
import CalendarPage from './CalendarPage.jsx'
import lucieAvatar from '../assets/lucie-avatar.jpg'

const button = 'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 disabled:opacity-40 disabled:cursor-not-allowed'
const resolved = (state) => ['succeeded', 'failed', 'abandoned'].includes(state)

function OperationStatus({ operation, controller, canWrite, disabled, retryDisabled, onRetry }) {
  const [acknowledged, setAcknowledged] = useState(false)
  const unknown = operation.state === 'unknown'
  if (operation.state === 'succeeded' || operation.state === 'abandoned') return null
  // While a request is simply in flight, show Lucie's loading bubble instead of the internal
  // bookkeeping label. States that need a decision (unconfirmed/failed/unknown) keep the full panel.
  if (['running', 'checking'].includes(operation.state)) return <TypingIndicator onCheck={() => controller.reconcile()} disabled={disabled} />
  return <div role="status" className={`rounded-xl border p-4 text-sm space-y-2 ${unknown ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
    <p className="font-medium">{['running', 'checking'].includes(operation.state) && <span aria-hidden="true" className="inline-block mr-2 h-2 w-2 rounded-full bg-blue-700 motion-safe:animate-pulse" />}{({ running: 'Generating — awaiting a saved result', checking: 'Checking whether this request was saved',
      unconfirmed: 'Request not found yet — no new attempt has been started', failed: 'This attempt failed', unknown: 'Outcome unknown' })[operation.state] || operation.state}</p>
    {operation.safe_error_code && <p className="text-xs text-slate-600">{operation.safe_error_code.replaceAll('_', ' ')}</p>}
    {unknown && <>
      <p className="text-xs">The provider may have processed this attempt. A new attempt may incur another charge. The original output might be unavailable.</p>
      {canWrite && <label className="flex gap-2 text-xs"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />I understand the uncertain outcome and possible additional charge.</label>}
    </>}
    <div className="flex flex-wrap gap-2">
      <button className={button} disabled={disabled} onClick={() => controller.reconcile()}>Check status</button>
      {canWrite && operation.state === 'unconfirmed' && <button className={button} disabled={disabled} onClick={() => controller.resend(operation.operation_key)}>Resubmit the same request</button>}
      {canWrite && ['failed', 'unknown'].includes(operation.state) && operation.input && <button className={button} disabled={disabled || retryDisabled || (unknown && !acknowledged)} onClick={() => onRetry(operation, unknown)}>Start a new attempt</button>}
      {canWrite && unknown && <button className={button} disabled={disabled || !acknowledged} onClick={() => controller.abandon(operation.operation_key)}>Close this uncertain attempt</button>}
    </div>
  </div>
}

export default function ChatPage() {
  const scope = useBrowserScope()
  const { brand, personas, loading: configLoading, error: configError, reload } = useWorkspaceData()
  const { role } = useWorkspaceAccess()
  const canWrite = ['owner', 'admin', 'developer', 'member'].includes(role)
  const [state, controller] = useChatPersistence()
  const [view, setView] = useState('active')
  const [nav, setNav] = useState('chat')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [localChats] = useState(() => loadChatsFromStorage(scope)?.chats || [])
  const [localId, setLocalId] = useState(null)
  const [inputs, setInputs] = useState({})
  const [titleEdit, setTitleEdit] = useState(null)
  const [suggesting, setSuggesting] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [promptCategory, setPromptCategory] = useState(null)
  const [setup, setSetup] = useState(false)
  const [startNewPersona, setStartNewPersona] = useState(false)
  // Expanded persona folders in the sidebar (remembered per account and workspace in this browser).
  const [openIds, setOpenIds] = useState(() => {
    try { const saved = JSON.parse(globalThis.localStorage?.getItem(`lucie_open_folders:v1:${encodeURIComponent(scope)}`) || '[]'); return Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : [] } catch { return [] }
  })
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [personaOpen, setPersonaOpen] = useState(null)
  const [setupDismissed, setSetupDismissed] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [promptOffsets, setPromptOffsets] = useState({})
  const [localError, setLocalError] = useState('')
  const [dismissedLongChat, setDismissedLongChat] = useState(() => new Set())
  const [offline, setOffline] = useState(() => globalThis.navigator?.onLine === false)
  const bottom = useRef(null)
  const local = view === 'local'
  const localChat = localChats.find((row) => row.id === localId)
  const active = local ? localChat : state.active
  const messages = local ? localChat?.messages || [] : projectConversation(state.messages)
  const operations = local ? [] : controller.operations()
  const unresolved = operations.some((op) => !resolved(op.state))
  const pending = state.submitting || unresolved
  const persona = personas.find((row) => row.id === state.active?.default_persona_id)
  const readOnly = local || !!state.active?.archived_at || !canWrite
  const blocked = readOnly || pending || state.loading || state.metadataSaving || offline || !!state.storageError
  const personaConflict = ['mixed', 'ambiguous', 'unavailable'].includes(state.active?.persona_state)
  // While a chat (or the persona list) is still loading, the persona is simply not known yet — not
  // missing. Show a neutral placeholder instead of the "Unavailable" warning; generation stays
  // blocked by `blocked`/`providerBlocked` either way.
  const personaPending = !local && (state.loading || configLoading)
  const providerBlocked = blocked || personaConflict || !persona || configLoading || !!configError
  const inputKey = local ? `local:${localId}` : state.active?.id || 'composer'
  const input = inputs[inputKey] || ''
  const nmls = brand?.nmls_id || 'Not configured'
  const error = localError || state.error
  const lastMessageId = state.messages.at(-1)?.id
  // Persona folders: collapsible folders in the sidebar, one per persona, each holding that persona's chats.
  const folders = buildPersonaFolders(personas, state.folders)
  const openFolder = local ? null : folderFor(folders, state.active?.default_persona_id)
  const sessionCount = state.sessions.length
  // The persona belongs to the folder; tone is per conversation, layered over the shared brand tone.
  const voiceDefaults = defaultVoice(brand)
  const voiceCustom = customVoiceCount(state.active?.voice_settings)
  const toggleFolder = (id) => setOpenIds((current) => current.includes(id) ? current.filter((row) => row !== id) : [...current, id])
  const openFolderIds = (...ids) => setOpenIds((current) => [...current, ...ids.filter((id) => !current.includes(id))])
  // Suggest a fresh chat once this one is long enough that Lucie's context starts dropping early turns.
  const showLongChat = !readOnly && !!state.active && !state.loading && !dismissedLongChat.has(state.active.id)
    && isLongChat(state.messages, { hasOlder: !!state.before_cursor })

  useEffect(() => {
    const online = () => setOffline(false), offline = () => setOffline(true)
    window.addEventListener('online', online); window.addEventListener('offline', offline)
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline) }
  }, [])
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [lastMessageId, state.submitting])
  // Refresh folder counts whenever the chat list refreshes (new chat, archive, periodic reconcile).
  useEffect(() => { if (!local) controller.loadFolders(false) }, [controller, local, state.sessions, sessionCount])
  // Keep the chat lists of expanded folders loaded, and remember which are expanded.
  useEffect(() => { controller.setOpenFolders(view === 'active' && !local ? openIds : []) }, [controller, openIds, view, local])
  useEffect(() => { try { globalThis.localStorage?.setItem(`lucie_open_folders:v1:${encodeURIComponent(scope)}`, JSON.stringify(openIds)) } catch { /* remembering is optional */ } }, [scope, openIds])
  // The folder of the chat you are in is always expanded so it stays visible in the sidebar.
  const activePersonaId = state.active?.default_persona_id
  useEffect(() => { if (activePersonaId) openFolderIds(activePersonaId) }, [activePersonaId])

  const run = async (task) => {
    setLocalError('')
    try { return await task() } catch (err) { if (err.code !== 'ERR_CANCELED') setLocalError(err.message === state.storageError ? err.message : 'The action could not be completed. Refresh the conversation and try again.') }
  }
  const action = (fields) => run(() => controller.submit({ ...fields, ...(fields.action !== 'shorten' ? { persona_id: persona?.id } : {}) }))
  const send = (text = input) => {
    if (!text.trim() || providerBlocked || !state.active) return
    action({ action: 'send', message: text.trim() }).then((result) => {
      // Keep unsent text until a durable claim/result can be confirmed. Errors never become assistant messages.
      if (result?.request_message_id) {
        setInputs((previous) => (previous[inputKey] || '').trim() === text.trim() ? { ...previous, [inputKey]: '' } : previous)
        setPromptOffsets((previous) => Object.fromEntries(PROMPT_CATEGORIES.map((row) => [row.category, (previous[row.category] || 0) + 3])))
      }
    })
  }
  const retry = (operation, acknowledge) => {
    const { operation_key: _key, retry_of: _prior, acknowledge_uncertain_outcome: _ack, ...input } = operation.input
    run(() => controller.submit({ ...input, ...(input.action !== 'shorten' ? { persona_id: persona?.id } : {}) }, { retryOf: operation.operation_key, acknowledge }))
  }
  const chooseView = (next) => {
    setSetup(false); setView(next); setNav('chat'); setMobileMenu(false); setLocalError(''); setTitleEdit(null)
    if (next === 'local') setLocalId(localChats[0]?.id || null)
    else controller.list(next === 'archive')
  }
  // "New Persona" always starts at the persona configurator; saving the persona creates its folder.
  const newPersona = () => { setStartNewPersona(true); newChat() }
  const newChat = () => {
    setSetupDismissed(false); setSetup(true); setView('active'); setNav('chat'); setMobileMenu(false); setTitleEdit(null)
    controller.list(false)
  }
  // Inside a persona folder, a new chat skips the selector and stays in the folder.
  const newChatInFolder = (folder = openFolder) => {
    if (!folder?.available) return newChat()
    setSetup(false); setView('active'); setNav('chat'); setMobileMenu(false); setTitleEdit(null); setLocalError('')
    openFolderIds(folder.id); controller.newChat(folder.id); controller.patch({ title: folder.name })
  }
  const select = (chat) => {
    setSetup(false); setNav('chat'); setMobileMenu(false); setTitleEdit(null); setLocalError('')
    if (local) setLocalId(chat.id); else controller.open(chat.id)
  }
  const list = local ? localChats.filter((row) => row.messages?.length) : state.sessions
  // The persona selector opens that persona's folder with a fresh chat inside it.
  const startPersonaChat = (row) => { openFolderIds(row.id); setView('active'); controller.newChat(row.id); controller.patch({ title: row.name }); setSetup(false); setSetupDismissed(false) }
  const exportChat = async () => {
    setExporting(true); setLocalError('')
    try {
      const document = local ? exportDocument(localChat, localChat.messages || [], 'local') : await controller.exportConversation(active.id)
      downloadJSON(document, `lucie-conversation-${active.id}`)
    } catch { setLocalError('Export could not be completed. No partial file was downloaded. Please try again.') }
    finally { setExporting(false) }
  }
  const showingSetup = setup || (!setupDismissed && canWrite && view === 'active' && state.active?.unsaved && !state.active.default_persona_id && !state.loading)
  if (nav !== 'calendar' && showingSetup) return <div className="h-dvh overflow-y-auto"><PreferenceSetup startNew={startNewPersona} onComplete={(row) => { setStartNewPersona(false); startPersonaChat(row) }} onCancel={() => { setSetup(false); setSetupDismissed(true); setStartNewPersona(false) }} /></div>
  return <div className="flex h-dvh bg-slate-50 text-slate-800 overflow-hidden">
    {mobileMenu && <button className="fixed inset-0 z-30 bg-slate-900/50 md:hidden" aria-label="Close menu" onClick={() => setMobileMenu(false)} />}
    <aside className={`${mobileMenu ? 'flex' : 'hidden'} fixed inset-y-0 left-0 z-40 w-72 md:static md:flex shrink-0 flex-col bg-lucent-navy shadow-xl md:shadow-none app-sidebar`}>
      <div aria-hidden="true" className="h-1 shrink-0 bg-gradient-to-r from-lucent-accent via-blue-300 to-lucent-cream" />
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center gap-2.5"><img src={lucieAvatar} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-blue-300/60" />
          <div className="leading-tight"><h1 className="text-xl font-extrabold text-slate-900">Lucie</h1><p className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-wide text-blue-300">Lucent's AI Social Media Assistant</p></div></div>
        <div className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-300" /><span className="truncate">{local ? localChat?.persona?.name || 'Local history' : persona?.name || state.active?.persona_name || (personaPending ? 'Loading…' : 'Choose a persona')}</span></div>
      </div>
      <nav aria-label="Main navigation" className="space-y-1 p-3">
        {[["chat", "💬", "Chat"], ["calendar", "🗓️", "Calendar"]].map(([id, icon, label]) => <button key={id} type="button" aria-label={label} aria-current={nav === id ? 'page' : undefined} onClick={() => { setNav(id); setMobileMenu(false) }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${nav === id ? 'bg-slate-100 text-slate-900 shadow-[inset_3px_0_0_#3FA3B7]' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}><span aria-hidden="true" className="text-base">{icon}</span>{label}</button>)}
        <button type="button" aria-label="New Persona" disabled={!canWrite} onClick={newPersona} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-lucent-accent px-3 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"><span aria-hidden="true" className="text-base leading-none">+</span>New Persona</button>
      </nav>
      <div className="px-4 flex gap-1 border-b pb-3">{[['active', 'Conversations'], ['archive', 'Archive'], ['local', 'Local history']].map(([id, label]) => <button key={id} aria-pressed={view === id} className={`text-[11px] rounded-md px-2 py-1 font-medium transition-colors ${view === id ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900'}`} onClick={() => chooseView(id)}>{label}</button>)}</div>
      {view === 'active' && !local ? <nav aria-label="Persona folders" className="flex-1 overflow-y-auto p-3 space-y-0.5">
        <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Persona folders</p>
        {state.foldersError && <p role="status" className="px-2 text-xs text-amber-800">{state.foldersError} <button className="underline" onClick={() => controller.loadFolders(false)}>Retry</button></p>}
        {!folders.length && <p className="p-3 text-xs text-slate-400">{configLoading ? 'Loading personas…' : 'No personas yet. Choose New Persona to create your first folder.'}</p>}
        {folders.map((folder) => {
          const open = openIds.includes(folder.id), chats = state.folderChats[folder.id]
          return <div key={folder.id}>
            <button type="button" aria-expanded={open} aria-label={`${folder.name} folder`} onClick={() => toggleFolder(folder.id)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-100 ${openFolder?.id === folder.id ? 'text-blue-800' : ''}`}>
              <span aria-hidden="true" className="w-3 text-[10px] text-slate-400">{open ? '▾' : '▸'}</span><span aria-hidden="true" className="text-base">{open ? '📂' : folder.available ? '📁' : '🗂️'}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{folder.name}</span><span className="text-[10px] text-slate-400">{folder.chat_count}</span>
            </button>
            {open && <div className="ml-5 space-y-0.5 border-l border-slate-200 pb-1 pl-2">
              {folder.available && <div className="flex flex-wrap gap-1.5 py-1">
                <button type="button" disabled={!canWrite} onClick={() => newChatInFolder(folder)} className={button}>＋ New chat</button>
                <button type="button" onClick={() => setPersonaOpen(folder.id)} className={button}>Persona settings</button></div>}
              {!folder.available && <p className="px-1 py-1 text-[11px] text-slate-500">This persona is unavailable, so its chats are read only.</p>}
              {!chats && <p role="status" className="px-1 py-1 text-[11px] text-slate-400">Loading…</p>}
              {chats && !chats.sessions.length && <p className="px-1 py-1 text-[11px] text-slate-400">No chats yet.</p>}
              {chats && newestFirst(chats.sessions).map((chat) => <button key={chat.id} type="button" onClick={() => select(chat)} aria-current={active?.id === chat.id ? 'true' : undefined} className={`block w-full rounded-lg px-2 py-1.5 text-left ${active?.id === chat.id ? 'bg-slate-100' : 'hover:bg-slate-100'}`}>
                <span className="block truncate text-[13px] font-medium">{chat.title || 'Conversation'}</span>
                <span className="block text-[10px] text-slate-400">{formatChatTime(chat.updated_at)}</span>
              </button>)}
              {chats?.next_cursor && <button type="button" className={`${button} w-full`} onClick={() => controller.loadFolderChats(folder.id, true)}>Load more conversations</button>}
            </div>}
          </div>
        })}
        {state.pending.filter((record) => !list.some((chat) => chat.id === record.session_id)).map((record) => <button key={record.body.operation_key} className={`${button} w-full text-left`} onClick={() => controller.open(record.session_id)}>Recover pending request</button>)}
      </nav> : <nav aria-label="Conversation list" className="flex-1 overflow-y-auto p-3 space-y-2">
        {local && <p className="text-xs text-slate-500 px-2">Read-only history from this account and browser. Nothing is uploaded.</p>}
        {!list.length && <p className="p-3 text-xs text-slate-400">{local ? 'No local history in this account and workspace.' : 'No archived conversations.'}</p>}
        {list.map((chat) => <button key={chat.id} onClick={() => select(chat)} className={`w-full rounded-xl p-3 text-left border ${active?.id === chat.id ? 'bg-slate-100 border-transparent' : 'border-transparent hover:bg-slate-100'}`}>
          <span className="block truncate text-sm font-medium">{chat.title || 'Conversation'}</span>
          <span className="block text-[10px] text-slate-400 mt-1">Last edited: {new Date(chat.updated_at || chat.updatedAt || chat.createdAt || Date.now()).toLocaleString()}</span>
          <span className="flex flex-wrap gap-1 mt-2"><span className="max-w-full truncate rounded border border-slate-300 px-1.5 py-0.5 text-[9px] text-slate-600">{chat.persona_name || chat.persona?.name || 'Persona unavailable'}</span></span>
          <span className="block truncate text-[10px] text-slate-500 mt-1.5">{chat.preview || chat.summary || ''}</span>
        </button>)}
        {!local && state.next_cursor && <button className={`${button} w-full`} onClick={() => controller.list(state.archived, true)}>Load more conversations</button>}
      </nav>}
      <div className="px-4 py-3 border-t border-slate-100"><Link to="/settings" className="text-xs text-slate-500 hover:text-slate-900">Settings</Link></div>
      <p className="p-4 border-t border-slate-100 text-[11px] text-slate-400">{brand?.licensed_person_name || 'Identity not configured'} · NMLS #{nmls}</p>
    </aside>
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="md:hidden bg-lucent-navy text-white px-4 py-3 border-b-2 border-lucent-accent"><button aria-label="Open menu" onClick={() => setMobileMenu(true)}><span className="flex items-center">☰ <img src={lucieAvatar} alt="" className="ml-3 h-7 w-7 rounded-full object-cover" /><span className="ml-2.5 font-semibold">Lucie</span></span></button></div>
      {nav === 'calendar' ? <CalendarPage /> : <>
        <header className="bg-white border-b px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0"><h2 className="font-semibold text-sm truncate">{active?.title || 'Conversations'}</h2><p className="mt-1 text-xs font-medium text-blue-900">Persona: {local ? localChat?.persona?.name || 'Historical persona' : persona?.name || state.active?.persona_name || (personaPending ? 'Loading…' : 'Unavailable')}</p><p className="text-[10px] text-slate-500">{local ? 'Local history · Read only' : state.active?.unsaved ? 'Unsent conversation' : state.active?.archived_at ? 'Archived conversation' : 'Shared workspace conversation'}</p></div>
          <div className="flex gap-2">{active && !active.unsaved && <button className={button} disabled={exporting || state.loading} onClick={exportChat}>{exporting ? 'Preparing export…' : 'Export chat'}</button>}{!local && state.active && <button className={button} aria-label="Voice settings for this chat" disabled={!persona || state.loading} onClick={() => setVoiceOpen(true)}>Voice{voiceCustom ? ` · ${voiceCustom} custom` : ''}</button>}<button className={button} disabled={!active} onClick={() => setSummaryOpen(true)}>Brand Summary</button></div>
          {!local && state.active && <div className="flex gap-2">
            <button className={button} disabled={readOnly || pending || state.loading || state.metadataSaving || state.active.unsaved} onClick={() => setTitleEdit(state.active.title)}>Rename</button>
            {state.active.archived_at ? <button className={button} disabled={!canWrite || state.loading} onClick={() => run(() => controller.patch({ archived: false }))}>Restore</button>
              : <button className={button} disabled={readOnly || pending || state.loading} onClick={() => state.active.unsaved ? newChat() : setConfirmArchive(true)}>Clear / Archive</button>}
          </div>}
        </header>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">
          <div className="max-w-4xl mx-auto space-y-5">
            {error && <div role="alert" className="border border-red-200 bg-red-50 rounded-lg p-3 text-sm text-red-800">{error} <button className="underline ml-2" onClick={() => { setLocalError(''); controller.clearError(); controller.reconcile(); controller.list() }}>Refresh</button></div>}
            {offline && <p role="status" className="text-sm text-amber-800">Offline. You can compose a message; generation needs durable storage online.</p>}
            {!canWrite && <p className="text-xs text-slate-500">Your workspace role permits reading this workspace’s saved conversations.</p>}
            {!local && !personaPending && (personaConflict || !persona || configError) && <div className="rounded-xl border bg-white p-3 text-sm">
              <div className="flex flex-wrap justify-between items-center gap-3"><span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-900">Persona: {persona?.name || state.active?.persona_name || 'Unavailable'}</span><button className={button} disabled={!canWrite} onClick={() => newChatInFolder()}>Start another chat</button></div>
              <p className="text-xs text-slate-500 mt-2">This conversation stays with one persona. Multiple conversations can use the same persona.</p>
              {(personaConflict || !persona) && <p role="status" className="text-xs text-amber-800 mt-2">This conversation's persona is unavailable, mixed or unknown. History is preserved; start a new chat to generate content.</p>}
              {persona && (!Object.keys(persona.audience_profile || {}).length || !persona.prompt_guidance) && <p className="text-xs text-amber-800 mt-2">Audience details or content guidance are incomplete. Review configuration in Settings.</p>}
              {configError && <p role="alert" className="mt-2 text-xs">{configError} <button className="underline" onClick={reload}>Reload configuration</button></p>}
              <Link to="/settings" className="block text-xs text-blue-700 mt-2">Configure brand and personas</Link>
            </div>}
            {state.loading && !local && <ConversationSkeleton />}
            {!local && state.before_cursor && <button className={button} onClick={() => controller.open(state.active.id, true)}>Load earlier messages</button>}
            {!messages.length && !state.loading && <div className="py-14 text-center"><img src={lucieAvatar} alt="" className="mx-auto mb-4 h-16 w-16 rounded-full object-cover ring-4 ring-blue-100" /><p className="font-display text-lg font-bold text-slate-900">{local ? 'Select local history' : 'Start a conversation'}</p><div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-lucent-accent" /><p className="text-sm text-slate-500 mt-3">{local ? 'Existing browser history remains preserved.' : 'Ask for a caption, post idea, or content strategy.'}</p></div>}
            {messages.map((message) => <PersistedMessage key={message.id} message={message} nmls={nmls} persona={persona?.id} onAction={action} disabled={blocked} providerDisabled={providerBlocked} readOnly={readOnly} legacy={local} />)}
            {visibleOperations(operations, state.messages).map((operation) => <OperationStatus key={operation.operation_key} operation={operation} controller={controller} canWrite={!readOnly} disabled={state.submitting || offline} retryDisabled={(!persona || personaConflict) && operation.action !== 'shorten'} onRetry={retry} />)}
            <div ref={bottom} />
          </div>
        </div>
        {!readOnly && <footer className="bg-white border-t px-4 sm:px-6 py-4">
          <div className="max-w-4xl mx-auto">
            {showLongChat && <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="min-w-0 flex-1"><span className="font-semibold">This chat is getting long.</span> Lucie only remembers the most recent part of a conversation, so answers may drift or repeat. For best results, start a new chat{openFolder?.available ? ` in the ${openFolder.name} folder` : ''}.</p>
              <div className="flex gap-2"><button type="button" className={`${button} border-amber-300 bg-white`} disabled={pending} onClick={() => newChatInFolder()}>Start new chat</button><button type="button" className={button} onClick={() => setDismissedLongChat((previous) => new Set(previous).add(state.active.id))}>Keep going</button></div>
            </div>}
            <div className="flex flex-wrap gap-2 mb-3">{PROMPT_CATEGORIES.map((category) => <button key={category.category} className={button} onClick={() => setPromptCategory(promptCategory === category.category ? null : category.category)}>{category.emoji} {category.category}</button>)}</div>
            {promptCategory && <div className="flex flex-wrap gap-2 mb-3">{promptSuggestions(PROMPT_CATEGORIES.find((row) => row.category === promptCategory).prompts, promptOffsets[promptCategory] || 0).map((prompt) => <button key={prompt} disabled={providerBlocked} className={button} onClick={() => send(prompt)}>{prompt}</button>)}<button type="button" className={button} onClick={() => setPromptOffsets({ ...promptOffsets, [promptCategory]: (promptOffsets[promptCategory] || 0) + 3 })}>↻ More</button></div>}
            <form onSubmit={(event) => { event.preventDefault(); send() }} className="flex gap-2 items-end">
              <textarea aria-label="Message" rows={2} maxLength={16000} value={input}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
                  event.preventDefault()
                  if (!event.repeat && !providerBlocked && input.trim()) event.currentTarget.form.requestSubmit()
                }}
                onChange={(event) => setInputs((previous) => ({ ...previous, [inputKey]: event.target.value }))} placeholder="Type a message…" className="flex-1 min-w-0 resize-y border rounded-xl px-4 py-2 text-sm bg-slate-50 focus:ring-2 focus:ring-blue-500" />
              <button type="submit" disabled={providerBlocked || !input.trim()} className={`${button} !border-lucent-navy !bg-lucent-navy !text-white px-5 hover:!bg-lucent-navy-light`}>{state.submitting ? 'Saving / generating…' : 'Send'}</button>
            </form>
            <p className="mt-2 text-[10px] text-slate-400">Results appear as saved after the server commits them. Calendar saves are shared with this workspace.</p>
          </div>
        </footer>}
      </>}
    </main>
    {voiceOpen && state.active && <Dialog title="Voice for this chat" onClose={() => setVoiceOpen(false)}><VoiceSettings defaults={voiceDefaults} overrides={state.active.voice_settings} personaName={persona?.name} disabled={readOnly || state.loading} saving={state.metadataSaving}
      onCancel={() => setVoiceOpen(false)} onSave={(voice) => run(() => controller.setVoice(voice)).then((saved) => { if (saved) setVoiceOpen(false) })} /></Dialog>}
    {personaOpen && personas.find((row) => row.id === personaOpen) && <Dialog wide title={`${personas.find((row) => row.id === personaOpen).name} persona settings`} onClose={() => setPersonaOpen(null)}><PersonaGuidelines key={personaOpen} persona={personas.find((row) => row.id === personaOpen)} onBack={() => setPersonaOpen(null)} onDone={() => setPersonaOpen(null)} /></Dialog>}
    {summaryOpen && <Dialog title="Brand Summary" onClose={() => setSummaryOpen(false)}><BrandSummary persona={local ? localChat?.persona : persona} brand={brand} /></Dialog>}
    {titleEdit !== null && <Dialog title="Rename conversation" onClose={() => setTitleEdit(null)}><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); run(() => controller.patch({ title: titleEdit.trim() })).then((saved) => { if (saved) setTitleEdit(null) }) }}>
      <label className="text-sm font-semibold">Conversation title<input autoFocus maxLength={200} value={titleEdit} onChange={(event) => setTitleEdit(event.target.value)} className="block w-full border rounded p-2 mt-2" /></label>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => setTitleEdit(null)}>Cancel</button><button type="submit" className={button} disabled={!titleEdit.trim() || suggesting}>Save title</button>
        <button type="button" className={button} disabled={suggesting || state.metadataSaving || !state.active?.id || state.active.unsaved} onClick={() => { setSuggesting(true); run(() => controller.nameChat(state.active.id, { force: true })).then((data) => { if (data?.session?.title) setTitleEdit(data.session.title) }).finally(() => setSuggesting(false)) }}>{suggesting ? 'Suggesting…' : 'Suggest a title'}</button></div>
      <p className="text-[11px] text-slate-500">Suggest a title writes a specific, unique name from this conversation using one short AI call, and replaces the current title right away.</p>
    </form></Dialog>}
    {confirmArchive && <Dialog title="Archive this conversation?" onClose={() => setConfirmArchive(false)}><div className="space-y-4"><p className="text-sm">This archives the conversation for everyone in this workspace. Its messages remain available in Archive and can be restored. A new unsent conversation will open.</p><div className="flex gap-2"><button className={button} onClick={() => setConfirmArchive(false)}>Cancel</button><button className={button} onClick={() => run(() => controller.archive()).then(() => setConfirmArchive(false))}>Archive and start new</button></div></div></Dialog>}
  </div>
}
