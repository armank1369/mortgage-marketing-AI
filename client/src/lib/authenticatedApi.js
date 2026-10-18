// Inject dependencies so session/selection tests need no browser or Auth network.
export function createAuthenticatedApi({ getSession, request, storage, onAccessError = () => {} }) {
  const keyFor = (userId) => `lucie_workspace:${userId}`
  const selections = new Map()
  let selectionRevision = 0
  function getWorkspace(userId) {
    if (selections.has(userId)) return selections.get(userId)
    try { return storage?.getItem(keyFor(userId)) || null } catch { return null }
  }
  function setWorkspace(userId, workspaceId) {
    if (!userId) return
    selectionRevision += 1
    selections.set(userId, workspaceId || null)
    try {
      if (workspaceId) storage?.setItem(keyFor(userId), workspaceId)
      else storage?.removeItem(keyFor(userId))
    } catch { /* In-memory selection still works when storage is unavailable. */ }
  }
  async function send(config, { workspace = true, expectedScope, expectedUserId } = {}) {
    const startedRevision = selectionRevision
    const { data, error } = await getSession()
    if (config.signal?.aborted || (workspace && startedRevision !== selectionRevision)) {
      const canceled = new Error('Workspace access changed. Please submit the request again.')
      canceled.code = 'ERR_CANCELED'
      throw canceled
    }
    if (error || !data?.session?.token || !data?.user?.id) {
      const missing = new Error('Sign in again to continue.')
      missing.code = 'NO_AUTH_TOKEN'
      onAccessError(missing)
      throw missing
    }
    const userId = data.user.id
    const headers = { ...config.headers }
    for (const name of Object.keys(headers)) {
      if (['authorization', 'x-workspace-id'].includes(name.toLowerCase())) delete headers[name]
    }
    headers.Authorization = `Bearer ${data.session.token}`
    const selected = workspace ? getWorkspace(userId) : null
    if ((expectedUserId && expectedUserId !== userId) ||
        (expectedScope && (!selected || expectedScope !== JSON.stringify([userId, selected])))) {
      const canceled = new Error('Workspace access changed. Please submit the request again.')
      canceled.code = 'ERR_CANCELED'
      throw canceled
    }
    if (selected) headers['X-Workspace-Id'] = selected
    try {
      return await request({ ...config, headers })
    } catch (err) {
      const code = err?.response?.data?.error
      if (!config.signal?.aborted && (!workspace || startedRevision === selectionRevision) &&
          ['unauthenticated', 'workspace_access_denied', 'workspace_selection_required'].includes(code)) {
        // Never retry a paid operation in a different workspace.
        onAccessError(err, userId)
      }
      throw err
    }
  }
  return { send, getWorkspace, setWorkspace }
}

export function apiErrorMessage(error, fallback = 'The request failed. Please try again.') {
  const code = error?.response?.data?.error || error?.code
  const messages = {
    NO_AUTH_TOKEN: 'Sign in again to continue.',
    unauthenticated: 'Sign in again to continue.',
    workspace_access_denied: 'You no longer have access to the selected workspace. Review your workspace access.',
    workspace_selection_required: 'Select a workspace to continue.',
    permission_denied: 'Your workspace role does not permit this action.',
    database_unavailable: 'Workspace data is temporarily unavailable. Please try again.',
    generation_configuration_required: 'Generation needs complete, valid brand and licensing details. Ask an authorized editor to review Settings.',
    not_found: 'The selected record is unavailable in this workspace. Refresh configuration or choose a saved persona.',
    validation_error: 'Check the configuration fields, their types and length limits. A business name must contain 1–100 characters.',
    conflict: 'This identifier is already in use. Choose another short identifier.',
    ai_provider_unavailable: 'The AI provider is unavailable. Contact your administrator.',
  }
  return messages[code] || fallback
}
