import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BrowserScopeContext } from '../context/BrowserScope.js'
import { authClient } from '../lib/neon/neon.js'
import { workspaceApi, getWorkspaces, onWorkspaceAccessError, apiErrorMessage } from '../lib/api.js'

// This gate handles selection UX; the server authorizes every request independently.
export default function WorkspaceGate({ children }) {
  const { data: session } = authClient.useSession()
  const userId = session?.user?.id
  const [state, setState] = useState({ userId: null, workspaces: [], selected: null, error: '' })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    getWorkspaces(controller.signal).then(({ data }) => {
      if (controller.signal.aborted) return
      const workspaces = data.workspaces
      const stored = workspaceApi.getWorkspace(userId)
      const valid = workspaces.some((w) => w.workspace_id === stored)
      // Surface stale selections instead of silently switching tenants.
      const selected = valid ? stored : (!stored && workspaces.length === 1 ? workspaces[0].workspace_id : null)
      workspaceApi.setWorkspace(userId, selected)
      setState({ userId, workspaces, selected, error: '' })
    }).catch((error) => {
      if (!controller.signal.aborted) setState({ userId, workspaces: [], selected: null,
        error: apiErrorMessage(error, 'Could not load your workspaces. Please try again.') })
    })
    return () => controller.abort()
  }, [userId, retry])
  useEffect(() => onWorkspaceAccessError((error, requestUserId) => {
    if (requestUserId && requestUserId !== userId) return
    setState((previous) => ({ ...previous, error: apiErrorMessage(error) }))
  }), [userId])
  function choose(value) {
    workspaceApi.setWorkspace(userId, value)
    setState((previous) => ({ ...previous, selected: value }))
  }
  if (!userId || state.userId !== userId) return <div className="p-6">Loading workspace access…</div>
  if (state.error) return (
    <main className="p-6 space-y-4" role="alert">
      <p>{state.error}</p>
      <button className="text-blue-700 underline" onClick={() => {
        setState({ userId: null, workspaces: [], selected: null, error: '' })
        setRetry((value) => value + 1)
      }}>Review workspace access</button>
      <p><Link to="/settings" className="text-blue-700 underline">Account settings</Link></p>
    </main>
  )
  if (!state.workspaces.length) return (
    <main className="p-6 space-y-4">
      <p>You’re signed in, but haven’t been granted access to a Lucie workspace. Contact your workspace administrator.</p>
      <button className="text-blue-700 underline" onClick={() => setRetry((value) => value + 1)}>Check again</button>
      <p><Link to="/settings" className="text-blue-700 underline">Account settings</Link></p>
    </main>
  )
  return (
    <>
      {(state.workspaces.length > 1 || !state.selected) && (
        <div className="bg-slate-50 border-b p-3">
          <label>Workspace{' '}
            <select value={state.selected || ''} onChange={(event) => choose(event.target.value)} className="border rounded p-1">
              <option value="" disabled>Select a workspace</option>
              {state.workspaces.map((workspace) => <option key={workspace.workspace_id} value={workspace.workspace_id}>{workspace.workspace_name}</option>)}
            </select>
          </label>
        </div>
      )}
      {state.selected && (
        <BrowserScopeContext.Provider key={JSON.stringify([userId, state.selected])} value={JSON.stringify([userId, state.selected])}>
          {children}
        </BrowserScopeContext.Provider>
      )}
    </>
  )
}
