import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useBrowserScope } from '../context/BrowserScope.js'
import { useWorkspaceData } from '../context/WorkspaceData.js'
import { useWorkspaceAccess } from '../context/WorkspaceAccess.js'
import { useChatPersistence } from '../lib/useChatPersistence.js'
import { projectConversation } from '../lib/chatSerialization.js'
import { loadChatsFromStorage } from '../utils/storage.js'
import { PROMPT_CATEGORIES } from '../lib/chatPrompts.js'
import PreferenceSetup from './PreferenceSetup.jsx'
import BrandSummary from '../components/BrandSummary.jsx'
import Dialog from '../components/Dialog.jsx'
import { downloadJSON, exportDocument, promptSuggestions } from '../lib/legacyRecovery.js'
import PersistedMessage from '../components/PersistedMessage.jsx'
import CalendarPage from './CalendarPage.jsx'
import lucieAvatar from '../assets/lucie-avatar.jpg'

const button = 'rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed'
const resolved = (state) => ['succeeded', 'failed', 'abandoned'].includes(state)

function OperationStatus({ operation, controller, canWrite, disabled, retryDisabled, onRetry }) {
  const [acknowledged, setAcknowledged] = useState(false)
  const unknown = operation.state === 'unknown'
  if (operation.state === 'succeeded' || operation.state === 'abandoned') return null
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
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [promptCategory, setPromptCategory] = useState(null)
  const [setup, setSetup] = useState(false)
  const [setupDismissed, setSetupDismissed] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [promptOffsets, setPromptOffsets] = useState({})
  const [localError, setLocalError] = useState('')
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
  const providerBlocked = blocked || personaConflict || !persona || configLoading || !!configError
  const inputKey = local ? `local:${localId}` : state.active?.id || 'composer'
  const input = inputs[inputKey] || ''
  const nmls = brand?.nmls_id || 'Not configured'
  const error = localError || state.error
  const lastMessageId = state.messages.at(-1)?.id

  useEffect(() => {
    const online = () => setOffline(false), offline = () => setOffline(true)
    window.addEventListener('online', online); window.addEventListener('offline', offline)
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline) }
  }, [])
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [lastMessageId, state.submitting])

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
  const newChat = () => {
    setSetupDismissed(false); setSetup(true); setView('active'); setNav('chat'); setMobileMenu(false); setTitleEdit(null)
    controller.list(false)
  }
  const select = (chat) => {
    setSetup(false); setNav('chat'); setMobileMenu(false); setTitleEdit(null); setLocalError('')
    if (local) setLocalId(chat.id); else controller.open(chat.id)
  }
  const list = local ? localChats.filter((row) => row.messages?.length) : state.sessions
  const startPersonaChat = (row) => { controller.newChat(row.id); controller.patch({ title: row.name }); setSetup(false); setSetupDismissed(false) }
  const exportChat = async () => {
    setExporting(true); setLocalError('')
    try {
      const document = local ? exportDocument(localChat, localChat.messages || [], 'local') : await controller.exportConversation(active.id)
      downloadJSON(document, `lucie-conversation-${active.id}`)
    } catch { setLocalError('Export could not be completed. No partial file was downloaded. Please try again.') }
    finally { setExporting(false) }
  }
  const showingSetup = setup || (!setupDismissed && canWrite && view === 'active' && state.active?.unsaved && !state.active.default_persona_id && !state.loading)
  if (nav !== 'calendar' && showingSetup) return <div className="h-dvh overflow-y-auto"><PreferenceSetup onComplete={startPersonaChat} onCancel={() => { setSetup(false); setSetupDismissed(true) }} /></div>
  return <div className="flex h-dvh bg-slate-50 text-slate-800 overflow-hidden">
    {mobileMenu && <button className="fixed inset-0 z-30 bg-slate-900/50 md:hidden" aria-label="Close menu" onClick={() => setMobileMenu(false)} />}
    <aside className={`${mobileMenu ? 'flex' : 'hidden'} fixed inset-y-0 left-0 z-40 w-72 md:static md:flex shrink-0 flex-col bg-slate-50 border-r border-slate-200`}>
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center gap-2.5"><img src={lucieAvatar} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
          <div className="leading-tight"><h1 className="text-xl font-extrabold text-slate-900">Lucie</h1><p className="text-[10px] font-medium text-slate-500">Lucent's AI Social Media Assistant</p></div></div>
        <div className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" /><span className="truncate">{local ? localChat?.persona?.name || 'Local history' : persona?.name || state.active?.persona_name || 'Choose a persona'}</span></div>
      </div>
      <nav aria-label="Main navigation" className="space-y-1 p-3">
        {[["chat", "💬", "Chat"], ["calendar", "🗓️", "Calendar"]].map(([id, icon, label]) => <button key={id} type="button" aria-label={label} aria-current={nav === id ? 'page' : undefined} onClick={() => { setNav(id); setMobileMenu(false) }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${nav === id ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}><span aria-hidden="true" className="text-base">{icon}</span>{label}</button>)}
        <button type="button" aria-label="New Chat" disabled={!canWrite} onClick={newChat} className="mt-3 flex w-full items-center gap-3 rounded-lg border-t border-slate-100 px-3 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"><span aria-hidden="true" className="text-base">➕</span>New Chat</button>
      </nav>
      <div className="px-4 flex gap-1 border-b pb-3">{[['active', 'Conversations'], ['archive', 'Archive'], ['local', 'Local history']].map(([id, label]) => <button key={id} aria-pressed={view === id} className={`text-[11px] rounded px-2 py-1 ${view === id ? 'bg-blue-50 text-blue-800' : 'text-slate-500'}`} onClick={() => chooseView(id)}>{label}</button>)}</div>
      <nav aria-label="Conversation list" className="flex-1 overflow-y-auto p-3 space-y-2">
        {local && <p className="text-xs text-slate-500 px-2">Read-only history from this account and browser. Nothing is uploaded.</p>}
        {!list.length && <p className="p-3 text-xs text-slate-400">{local ? 'No local history in this account and workspace.' : 'No conversations in this view.'}</p>}
        {list.map((chat) => <button key={chat.id} onClick={() => select(chat)} className={`w-full rounded-xl p-3 text-left border ${active?.id === chat.id ? 'bg-slate-100 border-transparent' : 'border-transparent hover:bg-slate-100'}`}>
          <span className="block truncate text-sm font-medium">{chat.title || 'Conversation'}</span>
          <span className="block text-[10px] text-slate-400 mt-1">Last edited: {new Date(chat.updated_at || chat.updatedAt || chat.createdAt || Date.now()).toLocaleString()}</span>
          <span className="flex flex-wrap gap-1 mt-2"><span className="max-w-full truncate rounded border border-slate-300 px-1.5 py-0.5 text-[9px] text-slate-600">{chat.persona_name || chat.persona?.name || 'Persona unavailable'}</span>{(chat.content_types || chat.contentTypes || []).slice(0, 2).map((type) => <span key={type} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] text-slate-600">{({ social_image: 'Image', campaign: 'Campaign', posts: 'Posts', video: 'Video', carousel: 'Multi Image Carousel', text: 'Text' })[type] || type}</span>)}{(chat.content_types || chat.contentTypes || []).length > 2 && <span className="text-[10px] text-slate-400">+{(chat.content_types || chat.contentTypes).length - 2}</span>}</span>
          <span className="block truncate text-[10px] text-slate-500 mt-1.5">{chat.preview || chat.summary || ''}</span>
        </button>)}
        {!local && state.next_cursor && <button className={`${button} w-full`} onClick={() => controller.list(state.archived, true)}>Load more conversations</button>}
        {!local && state.pending.filter((record) => !list.some((chat) => chat.id === record.session_id)).map((record) => <button key={record.body.operation_key} className={`${button} w-full text-left`} onClick={() => controller.open(record.session_id)}>Recover pending request</button>)}
      </nav>
      <div className="px-4 py-3 border-t border-slate-100"><Link to="/settings" className="text-xs text-slate-500 hover:text-slate-900">Settings</Link></div>
      <p className="p-4 border-t border-slate-100 text-[11px] text-slate-400">{brand?.licensed_person_name || 'Identity not configured'} · NMLS #{nmls}</p>
    </aside>
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="md:hidden bg-slate-900 text-white px-4 py-3"><button aria-label="Open menu" onClick={() => setMobileMenu(true)}>☰ <span className="ml-3 font-semibold">Lucie</span></button></div>
      {nav === 'calendar' ? <CalendarPage /> : <>
        <header className="bg-white border-b px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0"><h2 className="font-semibold text-sm truncate">{active?.title || 'Conversations'}</h2><p className="mt-1 text-xs font-medium text-blue-900">Persona: {local ? localChat?.persona?.name || 'Historical persona' : persona?.name || state.active?.persona_name || 'Unavailable'}</p><p className="text-[10px] text-slate-500">{local ? 'Local history · Read only' : state.active?.unsaved ? 'Unsent conversation' : state.active?.archived_at ? 'Archived conversation' : 'Creator-private conversation'}</p></div>
          <div className="flex gap-2">{active && !active.unsaved && <button className={button} disabled={exporting || state.loading} onClick={exportChat}>{exporting ? 'Preparing export…' : 'Export chat'}</button>}<button className={button} disabled={!active} onClick={() => setSummaryOpen(true)}>Brand Summary</button></div>
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
            {!canWrite && <p className="text-xs text-slate-500">Your workspace role permits reading your saved conversations.</p>}
            {!local && (personaConflict || !persona || configError) && <div className="rounded-xl border bg-white p-3 text-sm">
              <div className="flex flex-wrap justify-between items-center gap-3"><span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-900">Persona: {persona?.name || state.active?.persona_name || 'Unavailable'}</span><button className={button} disabled={!canWrite} onClick={newChat}>Start another chat</button></div>
              <p className="text-xs text-slate-500 mt-2">This conversation stays with one persona. Multiple conversations can use the same persona.</p>
              {(personaConflict || !persona) && <p role="status" className="text-xs text-amber-800 mt-2">This conversation's persona is unavailable, mixed or unknown. History is preserved; start a new chat to generate content.</p>}
              {persona && (!Object.keys(persona.audience_profile || {}).length || !persona.prompt_guidance) && <p className="text-xs text-amber-800 mt-2">Audience details or content guidance are incomplete. Review configuration in Settings.</p>}
              {configError && <p role="alert" className="mt-2 text-xs">{configError} <button className="underline" onClick={reload}>Reload configuration</button></p>}
              <Link to="/settings" className="block text-xs text-blue-700 mt-2">Configure brand and personas</Link>
            </div>}
            {state.loading && !local && <p role="status">Loading saved conversation…</p>}
            {!local && state.before_cursor && <button className={button} onClick={() => controller.open(state.active.id, true)}>Load earlier messages</button>}
            {!messages.length && !state.loading && <div className="py-14 text-center"><p className="font-semibold">{local ? 'Select local history' : 'Start a conversation'}</p><p className="text-xs text-slate-500 mt-2">{local ? 'Existing browser history remains preserved.' : 'Ask for a caption, post idea, or content strategy.'}</p></div>}
            {messages.map((message) => <PersistedMessage key={message.id} message={message} nmls={nmls} persona={persona?.id} onAction={action} disabled={blocked} providerDisabled={providerBlocked} readOnly={readOnly} legacy={local} />)}
            {operations.map((operation) => <OperationStatus key={operation.operation_key} operation={operation} controller={controller} canWrite={!readOnly} disabled={state.submitting || offline} retryDisabled={(!persona || personaConflict) && operation.action !== 'shorten'} onRetry={retry} />)}
            <div ref={bottom} />
          </div>
        </div>
        {!readOnly && <footer className="bg-white border-t px-4 sm:px-6 py-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-wrap gap-2 mb-3">{PROMPT_CATEGORIES.map((category) => <button key={category.category} className={button} onClick={() => setPromptCategory(promptCategory === category.category ? null : category.category)}>{category.emoji} {category.category}</button>)}</div>
            {promptCategory && <div className="flex flex-wrap gap-2 mb-3">{promptSuggestions(PROMPT_CATEGORIES.find((row) => row.category === promptCategory).prompts, promptOffsets[promptCategory] || 0).map((prompt) => <button key={prompt} disabled={providerBlocked} className={button} onClick={() => send(prompt)}>{prompt}</button>)}<button type="button" className={button} onClick={() => setPromptOffsets({ ...promptOffsets, [promptCategory]: (promptOffsets[promptCategory] || 0) + 3 })}>↻ More</button></div>}
            <form onSubmit={(event) => { event.preventDefault(); send() }} className="flex gap-2 items-end">
              <textarea aria-label="Message" rows={2} maxLength={16000} value={input} onChange={(event) => setInputs((previous) => ({ ...previous, [inputKey]: event.target.value }))} placeholder="Type a message…" className="flex-1 min-w-0 resize-y border rounded-xl px-4 py-2 text-sm bg-slate-50 focus:ring-2 focus:ring-blue-500" />
              <button type="submit" disabled={providerBlocked || !input.trim()} className={`${button} bg-lucent-navy text-white px-5`}>{state.submitting ? 'Saving / generating…' : 'Send'}</button>
            </form>
            <p className="mt-2 text-[10px] text-slate-400">Results appear as saved after the server commits them. Calendar saves remain on this browser.</p>
          </div>
        </footer>}
      </>}
    </main>
    {summaryOpen && <Dialog title="Brand Summary" onClose={() => setSummaryOpen(false)}><BrandSummary persona={local ? localChat?.persona : persona} brand={brand} /></Dialog>}
    {titleEdit !== null && <Dialog title="Rename conversation" onClose={() => setTitleEdit(null)}><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); run(() => controller.patch({ title: titleEdit.trim() })).then((saved) => { if (saved) setTitleEdit(null) }) }}>
      <label className="text-sm font-semibold">Conversation title<input autoFocus maxLength={200} value={titleEdit} onChange={(event) => setTitleEdit(event.target.value)} className="block w-full border rounded p-2 mt-2" /></label>
      <div className="flex gap-2"><button type="button" className={button} onClick={() => setTitleEdit(null)}>Cancel</button><button type="submit" className={button} disabled={!titleEdit.trim()}>Save title</button></div>
    </form></Dialog>}
    {confirmArchive && <Dialog title="Archive this conversation?" onClose={() => setConfirmArchive(false)}><div className="space-y-4"><p className="text-sm">Your saved messages remain available in Archive. A new unsent conversation will open.</p><div className="flex gap-2"><button className={button} onClick={() => setConfirmArchive(false)}>Cancel</button><button className={button} onClick={() => run(() => controller.archive()).then(() => setConfirmArchive(false))}>Archive and start new</button></div></div></Dialog>}
  </div>
}
