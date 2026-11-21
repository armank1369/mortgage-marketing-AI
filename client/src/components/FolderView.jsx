import { useState } from 'react'

const typeLabel = { social_image: 'Image', campaign: 'Campaign', posts: 'Posts', video: 'Video', carousel: 'Carousel', text: 'Text' }
const button = 'rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed'
const when = (chat) => new Date(chat.updated_at || Date.now())

// Finder-style contents of a persona folder: a list of its conversations, newest first by default.
// With no folder it lists every conversation (used for the Archive view).
export function FolderContents({ folder, archived, chats, activeId, canWrite, hasMore, loading, onOpen, onNewChat, onSettings, onMore, onUp }) {
  const [sort, setSort] = useState({ key: 'date', dir: -1 })
  const sorted = [...chats].sort((a, b) => sort.dir * (sort.key === 'name' ? (a.title || '').localeCompare(b.title || '') : when(a) - when(b)))
  const header = (key, label) => <button type="button" aria-label={`Sort by ${label}`} className="text-left font-semibold hover:text-slate-900" onClick={() => setSort({ key, dir: sort.key === key ? -sort.dir : key === 'name' ? 1 : -1 })}>{label}{sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</button>
  const name = folder ? folder.name : archived ? 'Archived chats' : 'All chats'
  return <section aria-label={`Folder: ${name}`} className="mx-auto max-w-5xl px-4 sm:px-6 py-5">
    <nav aria-label="Folder path" className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
      <button type="button" className="hover:text-slate-900" onClick={onUp}>Persona folders</button><span aria-hidden="true">›</span><span className="font-medium text-slate-900">{name}</span>{archived && folder && <><span aria-hidden="true">›</span><span>Archive</span></>}
    </nav>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><h2 className="flex items-center gap-2 truncate text-lg font-bold text-slate-900"><span aria-hidden="true">📂</span>{name}</h2>
        <p className="text-xs text-slate-500">{(() => { const n = folder?.chat_count ?? chats.length; return n === 1 ? '1 conversation' : `${n}${folder ? '' : hasMore ? '+' : ''} conversations` })()}{folder && !folder.available ? ' · Read only' : ''}</p></div>
      <div className="flex flex-wrap gap-2">
        {folder?.available && onSettings && <button type="button" className={button} onClick={onSettings}>Persona settings</button>}
        {folder?.available && !archived && <button type="button" className={`${button} bg-lucent-navy text-white px-4`} disabled={!canWrite} onClick={onNewChat}>➕ New chat in this folder</button>}
      </div>
    </div>
    {loading && !chats.length ? <p role="status" className="py-10 text-center text-sm text-slate-500">Loading conversations…</p>
      : !chats.length ? <div className="rounded-xl border border-dashed border-slate-300 bg-white py-14 text-center"><p className="font-semibold">{archived ? 'No archived conversations here' : 'No conversations yet'}</p><p className="mt-1 text-xs text-slate-500">{folder?.available && !archived ? 'Start a chat and it will be saved in this folder.' : 'Archived chats appear here and can be restored.'}</p></div>
      : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="hidden grid-cols-[minmax(0,2fr)_9rem_8rem_minmax(0,2fr)] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] uppercase tracking-wide text-slate-500 md:grid" aria-hidden="false">
          {header('name', 'Name')}{header('date', 'Date modified')}<span className="font-semibold">Kind</span><span className="font-semibold">Preview</span></div>
        <ul aria-label="Conversations">{sorted.map((chat) => {
          const kinds = chat.content_types || []
          return <li key={chat.id} className="border-b border-slate-100 last:border-0">
            <button type="button" onClick={() => onOpen(chat)} aria-current={activeId === chat.id ? 'true' : undefined} className={`grid w-full gap-1 px-4 py-3 text-left hover:bg-blue-50 md:grid-cols-[minmax(0,2fr)_9rem_8rem_minmax(0,2fr)] md:items-center md:gap-3 ${activeId === chat.id ? 'bg-slate-100' : ''}`}>
              <span className="flex min-w-0 items-center gap-2"><span aria-hidden="true">💬</span><span className="truncate text-sm font-medium">{chat.title || 'Conversation'}</span>{!folder && chat.persona_name && <span className="max-w-[10rem] shrink-0 truncate rounded border border-slate-300 px-1.5 py-0.5 text-[9px] text-slate-600">{chat.persona_name}</span>}</span>
              <span className="text-[11px] text-slate-500">{when(chat).toLocaleDateString()} {when(chat).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
              <span className="flex flex-wrap gap-1">{kinds.slice(0, 2).map((type) => <span key={type} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] text-slate-600">{typeLabel[type] || type}</span>)}{kinds.length > 2 && <span className="text-[10px] text-slate-400">+{kinds.length - 2}</span>}</span>
              <span className="truncate text-[11px] text-slate-500">{chat.preview || chat.summary || ''}</span>
            </button></li>
        })}</ul></div>}
    {hasMore && <div className="mt-3 text-center"><button type="button" className={button} onClick={onMore}>Load more conversations</button></div>}
  </section>
}

// Top level of the Finder: one folder per persona.
export function FolderOverview({ folders, error, loading, onOpen, onRetry }) {
  return <section aria-label="Persona folders overview" className="mx-auto max-w-5xl px-4 sm:px-6 py-5">
    <h2 className="mb-1 text-lg font-bold text-slate-900">Persona folders</h2>
    <p className="mb-4 text-xs text-slate-500">Each persona has its own folder. Open one to see its conversations or start a new chat with that persona.</p>
    {error && <p role="status" className="mb-3 text-xs text-amber-800">{error} <button className="underline" onClick={onRetry}>Retry</button></p>}
    {!folders.length && <p className="py-10 text-center text-sm text-slate-500">{loading ? 'Loading personas…' : 'No personas yet. Add one in Settings to start a folder.'}</p>}
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{folders.map((folder) => <li key={folder.id}>
      <button type="button" onClick={() => onOpen(folder)} aria-label={`Open folder ${folder.name}`} className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-blue-300 hover:bg-blue-50">
        <span aria-hidden="true" className="text-3xl leading-none">{folder.available ? '📁' : '🗂️'}</span>
        <span className="min-w-0"><span className="block truncate text-sm font-semibold">{folder.name}</span>
          <span className="mt-1 block text-[11px] text-slate-500">{folder.chat_count === 1 ? '1 conversation' : `${folder.chat_count} conversations`}</span>
          <span className="block text-[11px] text-slate-400">{folder.last_updated_at ? `Modified ${new Date(folder.last_updated_at).toLocaleDateString()}` : 'Empty'}{!folder.available ? ' · Read only' : ''}</span></span>
      </button></li>)}</ul>
  </section>
}
