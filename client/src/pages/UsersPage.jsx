import { useCallback, useEffect, useMemo, useState } from 'react'
import { workspaceApi, apiErrorMessage } from '../lib/api.js'
import { scopedRequest } from '../lib/workspaceConfiguration.js'
import { useBrowserScope } from '../context/BrowserScope.js'
import Dialog from '../components/Dialog.jsx'
import { displayName, filterPeople, grantSummary, roleChangeSummary, roleHint, roleLabel, usersErrorMessage } from '../lib/members.js'

const card = 'rounded-xl border border-slate-200 bg-white'
const subtle = 'text-xs text-slate-500'
const select = 'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500'

export default function UsersPage() {
  const scope = useBrowserScope()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [revision, setRevision] = useState(0)
  const [pending, setPending] = useState(null) // { kind: 'change' | 'grant', person, role }
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    scopedRequest(workspaceApi, scope, controller.signal, '/api/members')
      .then((result) => { if (!controller.signal.aborted) setData(result) })
      .catch((err) => { if (!controller.signal.aborted && err.code !== 'ERR_CANCELED') setError(apiErrorMessage(err, 'People could not be loaded.')) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [scope, revision])

  const people = useMemo(() => filterPeople(data?.members || [], query), [data, query])
  const waiting = useMemo(() => filterPeople(data?.unassigned || [], query), [data, query])
  const close = () => { if (!busy) { setPending(null); setDialogError('') } }

  const confirm = useCallback(async () => {
    setBusy(true); setDialogError('')
    try {
      if (pending.kind === 'change') {
        await scopedRequest(workspaceApi, scope, undefined, `/api/members/${pending.person.id}/role`, 'PUT',
          { role: pending.role, expected_role: pending.person.role })
      } else {
        await scopedRequest(workspaceApi, scope, undefined, '/api/members', 'POST',
          { auth_user_id: pending.person.auth_user_id, role: pending.role })
      }
      setNotice(`${displayName(pending.person)} is now ${roleLabel(pending.role)}.`)
      setPending(null); setRevision((n) => n + 1)
    } catch (err) {
      const code = err?.response?.data?.error
      setDialogError(usersErrorMessage(code, null) ?? err?.response?.data?.message ?? apiErrorMessage(err, 'The change could not be saved. Try again.'))
      if (code === 'conflict' || code === 'not_found') setRevision((n) => n + 1)
    } finally { setBusy(false) }
  }, [pending, scope])

  const summary = pending && (pending.kind === 'change' ? roleChangeSummary(pending.person, pending.role) : grantSummary(pending.person, pending.role))
  const roles = data?.assignable_roles || []

  const roleSelect = (person, kind) => <select aria-label={`Role for ${displayName(person)}`}
    value={kind === 'change' ? person.role : ''} disabled={kind === 'change' && !person.can_change}
    title={kind === 'change' && !person.can_change ? (person.is_you ? 'You cannot change your own role.' : 'Only an owner can change this role.') : undefined}
    onChange={(event) => { setNotice(''); setPending({ kind, person, role: event.target.value }) }} className={select}>
    {kind === 'grant' && <option value="" disabled>Choose a role…</option>}
    {kind === 'change' && !roles.includes(person.role) && <option value={person.role}>{roleLabel(person.role)}</option>}
    {roles.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
  </select>

  return <div className="flex min-w-0 flex-1 flex-col">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
      <div><h2 className="text-sm font-semibold text-slate-900">Users</h2>
        <p className="text-[11px] text-slate-500">Decide who can do what in this workspace.</p></div>
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" aria-label="Search people"
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-64" />
    </header>
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error} <button type="button" className="underline" onClick={() => setRevision((n) => n + 1)}>Try again</button></p>}
        {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{notice}</p>}
        {loading && !data && <p className={subtle}>Loading people…</p>}
        {data && <>
          <section aria-label="Roles" className="grid gap-2 sm:grid-cols-2">
            {['owner', 'admin', 'developer', 'member', 'viewer'].map((r) => <p key={r} className={`${card} px-3 py-2 text-xs text-slate-600`}><b className="text-slate-900">{roleLabel(r)}.</b> {roleHint(r)}</p>)}
          </section>
          <section className={card}>
            <h3 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">People in this workspace <span className={subtle}>({people.length})</span></h3>
            {!people.length ? <p className={`${subtle} p-4`}>No one matches your search.</p> :
              <ul className="divide-y divide-slate-100">{people.map((p) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{displayName(p)}{p.is_you && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">You</span>}</p>
                  {p.name && p.email && <p className="truncate text-xs text-slate-500">{p.email}</p>}</div>
                {roleSelect(p, 'change')}
              </li>)}</ul>}
          </section>
          <section className={card}>
            <h3 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Registered, no access yet <span className={subtle}>({waiting.length})</span></h3>
            <p className={`${subtle} px-4 pt-3`}>These people created a Lucie account but are not in any workspace. Choose a role to let them in.</p>
            {!waiting.length ? <p className={`${subtle} p-4`}>Nobody is waiting.</p> :
              <ul className="divide-y divide-slate-100">{waiting.map((p) => <li key={p.auth_user_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{displayName(p)}</p>
                  {p.name && p.email && <p className="truncate text-xs text-slate-500">{p.email}</p>}</div>
                {roleSelect(p, 'grant')}
              </li>)}</ul>}
          </section>
        </>}
      </div>
    </div>
    {pending && <Dialog title={summary.title} onClose={close}>
      <p className="text-sm text-slate-700">{summary.body}</p>
      {dialogError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{dialogError}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={close} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">Cancel</button>
        <button type="button" onClick={confirm} disabled={busy} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{busy ? 'Saving…' : summary.confirm}</button>
      </div>
    </Dialog>}
  </div>
}
