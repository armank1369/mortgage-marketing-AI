import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useBrowserScope } from '../context/BrowserScope.js'
import { useWorkspaceData } from '../context/WorkspaceData.js'
import { useWorkspaceAccess } from '../context/WorkspaceAccess.js'
import { useChatPersistence } from '../lib/useChatPersistence.js'
import { projectConversation } from '../lib/chatSerialization.js'
import { loadChatsFromStorage } from '../utils/storage.js'
import { PROMPT_CATEGORIES } from '../lib/chatPrompts.js'
import PersistedMessage from '../components/PersistedMessage.jsx'
import CalendarPage from './CalendarPage.jsx'
import lucieAvatar from '../assets/lucie-avatar.jpg'

const button = 'rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed'
const resolved = (state) => ['succeeded', 'failed', 'abandoned'].includes(state)

function OperationStatus({ operation, controller, canWrite, disabled, retryDisabled, onRetry }) {
  const [acknowledged, setAcknowledged] = useState(false)
  const unknown = operation.state === 'unknown'
  if (operation.state === 'succeeded' || operation.state === 'abandoned') return null
  return <div role="status" className={`rounded-xl border p-4 text-sm space-y-2 ${unknown ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
    <p className="font-medium">{({ running: 'Generating — awaiting a saved result', checking: 'Checking whether this request was saved',
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
  const providerBlocked = blocked || !persona || configLoading || !!configError
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
      if (result?.request_message_id) setInputs((previous) =>
        (previous[inputKey] || '').trim() === text.trim() ? { ...previous, [inputKey]: '' } : previous)
    })
  }
  const retry = (operation, acknowledge) => {
    const { operation_key: _key, retry_of: _prior, acknowledge_uncertain_outcome: _ack, ...input } = operation.input
    run(() => controller.submit({ ...input, ...(input.action !== 'shorten' ? { persona_id: persona?.id } : {}) }, { retryOf: operation.operation_key, acknowledge }))
  }
  const chooseView = (next) => {
    setView(next); setNav('chat'); setMobileMenu(false); setLocalError(''); setTitleEdit(null)
    if (next === 'local') setLocalId(localChats[0]?.id || null)
    else controller.list(next === 'archive')
  }
  const newChat = () => {
    controller.newChat(persona?.id || ''); setView('active'); setNav('chat'); setMobileMenu(false); setTitleEdit(null)
    controller.list(false)
  }
  const select = (chat) => {
    setNav('chat'); setMobileMenu(false); setTitleEdit(null); setLocalError('')
    if (local) setLocalId(chat.id); else controller.open(chat.id)
  }
  const list = local ? localChats.filter((row) => row.messages?.length) : state.sessions
  return <div className="flex h-dvh bg-slate-50 text-slate-800 overflow-hidden">
    {mobileMenu && <button className="fixed inset-0 z-30 bg-slate-900/50 md:hidden" aria-label="Close menu" onClick={() => setMobileMenu(false)} />}
    <aside className={`${mobileMenu ? 'flex' : 'hidden'} fixed inset-y-0 left-0 z-40 w-72 md:static md:flex shrink-0 flex-col bg-white border-r border-slate-200`}>
      <div className="p-5 flex items-center gap-3 border-b border-slate-100">
        <img src={lucieAvatar} alt="" className="h-10 w-10 rounded-xl object-cover" />
        <div><h1 className="text-xl font-extrabold text-lucent-navy">Lucie</h1><p className="text-[10px] text-slate-500">Lucent's AI Social Media Assistant</p></div>
      </div>
      <div className="p-4 flex gap-2">
        <button className={`${button} flex-1 bg-lucent-navy text-white`} disabled={!canWrite} onClick={newChat}>+ New Chat</button>
        <Link to="/settings" className={button}>Settings</Link>
      </div>
      <div className="flex gap-2 px-4 pb-3"><button className={button} onClick={() => { setNav('chat'); setMobileMenu(false) }}>Chat</button><button className={button} onClick={() => { setNav('calendar'); setMobileMenu(false) }}>Calendar</button></div>
      <div className="px-4 flex gap-1 border-b pb-3">{[['active', 'Conversations'], ['archive', 'Archive'], ['local', 'Local history']].map(([id, label]) => <button key={id} aria-pressed={view === id} className={`text-[11px] rounded px-2 py-1 ${view === id ? 'bg-blue-50 text-blue-800' : 'text-slate-500'}`} onClick={() => chooseView(id)}>{label}</button>)}</div>
      <nav aria-label="Conversation list" className="flex-1 overflow-y-auto p-3 space-y-2">
        {local && <p className="text-xs text-slate-500 px-2">Read-only history from this account and browser. Nothing is uploaded.</p>}
        {!list.length && <p className="p-3 text-xs text-slate-400">{local ? 'No local history in this account and workspace.' : 'No conversations in this view.'}</p>}
        {list.map((chat) => <button key={chat.id} onClick={() => select(chat)} className={`w-full rounded-xl p-3 text-left border ${active?.id === chat.id ? 'bg-blue-50 border-blue-200' : 'border-transparent hover:bg-slate-50'}`}>
          <span className="block truncate text-sm font-medium">{chat.title || 'Conversation'}</span>
          <span className="block text-[10px] text-slate-500 mt-1">{new Date(chat.updated_at || chat.updatedAt || chat.createdAt || Date.now()).toLocaleString()}</span>
        </button>)}
        {!local && state.next_cursor && <button className={`${button} w-full`} onClick={() => controller.list(state.archived, true)}>Load more conversations</button>}
        {!local && state.pending.filter((record) => !list.some((chat) => chat.id === record.session_id)).map((record) => <button key={record.body.operation_key} className={`${button} w-full text-left`} onClick={() => controller.open(record.session_id)}>Recover pending request</button>)}
      </nav>
      <p className="p-4 border-t text-[11px] text-slate-500">{brand?.licensed_person_name || 'Identity not configured'} · NMLS #{nmls}</p>
    </aside>
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="md:hidden bg-slate-900 text-white px-4 py-3"><button aria-label="Open menu" onClick={() => setMobileMenu(true)}>☰ <span className="ml-3 font-semibold">Lucie</span></button></div>
      {nav === 'calendar' ? <CalendarPage /> : <>
        <header className="bg-white border-b px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0"><h2 className="font-semibold text-sm truncate">{active?.title || 'Conversations'}</h2><p className="text-[10px] text-slate-500">{local ? 'Local history · Read only' : state.active?.unsaved ? 'Unsent conversation' : state.active?.archived_at ? 'Archived conversation' : 'Creator-private conversation'}</p></div>
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
            {!local && <div className="rounded-xl border bg-white p-3 text-sm">
              <label>Generation persona <select aria-label="Generation persona" value={persona?.id || ''} disabled={readOnly || pending || configLoading || state.loading || state.metadataSaving || !state.active} className="ml-2 border rounded p-1 max-w-full" onChange={(event) => run(() => controller.patch({ default_persona_id: event.target.value || null }))}>
                <option value="">Select a workspace persona</option>{personas.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select></label>
              {!persona && <p className="text-xs text-amber-800 mt-2">Select a current workspace persona explicitly before generation. Historical results keep their saved persona label.</p>}
              {configError && <p role="alert" className="mt-2 text-xs">{configError} <button className="underline" onClick={reload}>Reload configuration</button></p>}
              <Link to="/settings" className="block text-xs text-blue-700 mt-2">Configure brand and personas</Link>
            </div>}
            {state.loading && !local && <p role="status">Loading saved conversation…</p>}
            {!local && state.before_cursor && <button className={button} onClick={() => controller.open(state.active.id, true)}>Load earlier messages</button>}
            {!messages.length && !state.loading && <div className="py-14 text-center"><p className="font-semibold">{local ? 'Select local history' : 'Start a conversation'}</p><p className="text-xs text-slate-500 mt-2">{local ? 'Existing browser history remains preserved.' : 'Ask for a caption, post idea, or content strategy.'}</p></div>}
            {messages.map((message) => <PersistedMessage key={message.id} message={message} nmls={nmls} persona={persona?.id} onAction={action} disabled={blocked} providerDisabled={providerBlocked} readOnly={readOnly} legacy={local} />)}
            {operations.map((operation) => <OperationStatus key={operation.operation_key} operation={operation} controller={controller} canWrite={!readOnly} disabled={state.submitting || offline} retryDisabled={!persona && operation.action !== 'shorten'} onRetry={retry} />)}
            <div ref={bottom} />
          </div>
        </div>
        {!readOnly && <footer className="bg-white border-t px-4 sm:px-6 py-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-wrap gap-2 mb-3">{PROMPT_CATEGORIES.map((category) => <button key={category.category} className={button} onClick={() => setPromptCategory(promptCategory === category.category ? null : category.category)}>{category.emoji} {category.category}</button>)}</div>
            {promptCategory && <div className="flex flex-wrap gap-2 mb-3">{PROMPT_CATEGORIES.find((row) => row.category === promptCategory).prompts.slice(0, 3).map((prompt) => <button key={prompt} disabled={providerBlocked} className={button} onClick={() => send(prompt)}>{prompt}</button>)}</div>}
            <form onSubmit={(event) => { event.preventDefault(); send() }} className="flex gap-2 items-end">
              <textarea aria-label="Message" rows={2} maxLength={16000} value={input} onChange={(event) => setInputs((previous) => ({ ...previous, [inputKey]: event.target.value }))} placeholder="Type a message…" className="flex-1 min-w-0 resize-y border rounded-xl px-4 py-2 text-sm bg-slate-50 focus:ring-2 focus:ring-blue-500" />
              <button type="submit" disabled={providerBlocked || !input.trim()} className={`${button} bg-lucent-navy text-white px-5`}>{state.submitting ? 'Saving / generating…' : 'Send'}</button>
            </form>
            <p className="mt-2 text-[10px] text-slate-400">Results appear as saved after the server commits them. Calendar saves remain on this browser.</p>
          </div>
        </footer>}
      </>}
    </main>
    {titleEdit !== null && <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"><form className="bg-white rounded-xl p-6 max-w-md w-full space-y-4" onSubmit={(event) => { event.preventDefault(); run(() => controller.patch({ title: titleEdit.trim() })).then((saved) => { if (saved) setTitleEdit(null) }) }}>
      <label className="text-sm font-semibold">Conversation title<input autoFocus maxLength={200} value={titleEdit} onChange={(event) => setTitleEdit(event.target.value)} className="block w-full border rounded p-2 mt-2" /></label>
      <div className="flex gap-2"><button type="button" className={button} onClick={() => setTitleEdit(null)}>Cancel</button><button type="submit" className={button} disabled={!titleEdit.trim()}>Save title</button></div>
    </form></div>}
    {confirmArchive && <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"><div className="bg-white rounded-xl p-6 max-w-sm space-y-4"><h3 className="font-semibold">Archive this conversation?</h3><p className="text-sm">Your saved messages remain available in Archive. A new unsent conversation will open.</p><div className="flex gap-2"><button className={button} onClick={() => setConfirmArchive(false)}>Cancel</button><button className={button} onClick={() => run(() => controller.archive()).then(() => setConfirmArchive(false))}>Archive and start new</button></div></div></div>}
  </div>
}
