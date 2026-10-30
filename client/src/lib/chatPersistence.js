import { collectConversationExport } from './legacyRecovery.js'
import { mergeMessages, operationRecords } from './chatSerialization.js'

export function chatUUID() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
export const pendingStorageKey = (scope) => `lucie_chat_pending:v1:${encodeURIComponent(scope)}`
const terminal = (state) => ['succeeded', 'failed', 'abandoned'].includes(state)
const apiError = (err) => {
  const code = err?.response?.data?.error
  return ({ persona_locked: 'This conversation is tied to one persona. Start a new chat for another audience.',
    persona_history_conflict: 'This conversation has mixed or unknown persona history. Start a new chat.', precondition_failed: 'This conversation changed elsewhere. Refresh and try the edit again.',
    operation_in_progress: 'Another operation is active in this conversation.', stale_source: 'A newer version exists. Refresh before trying again.',
    permission_denied: 'Your workspace role does not permit this action.', not_found: 'This conversation or source is unavailable.',
    generation_configuration_required: 'Review the brand and persona configuration in Settings.',
    database_unavailable: 'Conversation storage is unavailable. No unsaved generation will be started.',
    validation_error: 'Check the selected persona, input and source before trying again.' })[code] ||
    'The request could not be confirmed. Check its status before making another attempt.'
}

// Injectable transport/storage keeps recovery and account-switch races testable without AI or a database.
export function createChatPersistence({ api, scope, storage, uuid = chatUUID }) {
  const base = '/api/chat/sessions'
  let listeners = new Set(), alive = false, epoch = 0, selection = 0, listSequence = 0, posting = false
  let controllers = new Set(), polling = false
  let detailSequence = 0, lastDetailApplied = 0
  let loadedHistoryIds = new Set()
  const terminalStates = new Map()
  const metadataVersions = new Map()
  let initialPending = [], initialError = ''
  try {
    const raw = storage.getItem(pendingStorageKey(scope))
    if (raw) {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed) || parsed.some((item) => !item.session_id || !item.body?.operation_key || !item.create)) throw Error()
      initialPending = parsed
    }
  } catch { initialError = 'Pending-request storage cannot be read. Resolve browser storage access before generating.' }
  let state = { sessions: [], next_cursor: null, archived: false, active: null, messages: [], before_cursor: null,
    operations: [], pending: initialPending, loading: false, submitting: false, metadataSaving: false, error: initialError, storageError: initialError }
  const emit = (patch) => { if (!alive) return; state = { ...state, ...patch }; for (const listener of listeners) listener() }
  function persist(pending) {
    try { storage.setItem(pendingStorageKey(scope), JSON.stringify(pending)) }
    catch { const error = 'Pending-request storage cannot be saved. Enable browser storage before generating.'; emit({ storageError: error, error }); throw Error(error) }
    emit({ pending, storageError: '' })
  }
  async function request(url, method = 'GET', data, headers) {
    if (!alive) throw Object.assign(Error(), { code: 'ERR_CANCELED' })
    const requestEpoch = epoch
    const controller = new AbortController(); controllers.add(controller)
    const [user, workspace] = JSON.parse(scope)
    function valid() { return alive && epoch === requestEpoch && !controller.signal.aborted && api.getWorkspace(user) === workspace }
    try {
      const response = await api.send({ url, method, data, headers, signal: controller.signal }, { expectedScope: scope })
      if (!valid()) throw Object.assign(Error(), { code: 'ERR_CANCELED' })
      return response.data
    } catch (err) {
      if (!valid()) throw Object.assign(Error(), { code: 'ERR_CANCELED' })
      throw err
    } finally { controllers.delete(controller) }
  }
  function report(err) { if (err.code !== 'ERR_CANCELED') emit({ error: apiError(err) }) }
  async function list(archived = state.archived, more = false) {
    const seq = ++listSequence
    try {
      const data = await request(`${base}?version=2&archived=${archived}&limit=30${more && state.next_cursor ? `&cursor=${encodeURIComponent(state.next_cursor)}` : ''}`)
      if (seq === listSequence) emit({ archived, sessions: more ? [...new Map([...state.sessions, ...data.sessions].map((s) => [s.id, s])).values()] : data.sessions, next_cursor: data.next_cursor })
    } catch (err) { report(err) }
  }
  async function open(id, older = false, refresh = false) {
    const seq = refresh || older ? selection : ++selection
    const detail = ++detailSequence
    const metadataAtStart = metadataVersions.get(id) || 0
    if (!refresh && !older) {
      loadedHistoryIds = new Set()
      emit({ active: { id }, messages: [], operations: [], before_cursor: null, loading: true, error: state.storageError })
    }
    try {
      const data = await request(`${base}/${id}?version=2&limit=50${older && state.before_cursor ? `&before=${encodeURIComponent(state.before_cursor)}` : ''}`)
      if (seq !== selection || state.active?.id !== id || detail < lastDetailApplied) return
      lastDetailApplied = detail
      const contiguousRefresh = refresh && data.messages.some((row) => loadedHistoryIds.has(row.id))
      // A large offline backlog can leave a gap between the old cache and latest
      // page. Restart pagination at the new page instead of making that gap unreachable.
      const merge = older || contiguousRefresh
      loadedHistoryIds = new Set([...(merge ? loadedHistoryIds : []), ...data.messages.map((row) => row.id)])
      emit({ active: metadataAtStart === (metadataVersions.get(id) || 0) ? data : state.active,
        messages: merge ? mergeMessages(state.messages, data.messages) : data.messages,
        before_cursor: contiguousRefresh ? state.before_cursor : data.before_cursor, operations: data.operations || [], loading: false })
    } catch (err) { if (seq === selection) { emit({ loading: false }); report(err) } }
  }
  function newChat(personaId = '') {
    ++selection
    loadedHistoryIds = new Set()
    emit({ active: { id: uuid(), title: 'New conversation', default_persona_id: personaId, unsaved: true },
      messages: [], operations: [], before_cursor: null, loading: false, error: state.storageError })
  }
  async function patch(fields) {
    const active = state.active
    if (!active) return
    if (!active.unsaved && 'default_persona_id' in fields && fields.default_persona_id !== active.default_persona_id) throw Error('This conversation is tied to one persona. Start a new chat.');
    if (active.unsaved) { emit({ active: { ...active, ...fields } }); return }
    if (state.metadataSaving) throw Error('A conversation edit is already being saved.')
    metadataVersions.set(active.id, (metadataVersions.get(active.id) || 0) + 1); emit({ metadataSaving: true })
    try {
      const saved = await request(`${base}/${active.id}`, 'PATCH', fields, { 'If-Match': active.etag })
      if (state.active?.id === active.id) emit({ active: { ...state.active, ...saved }, error: state.storageError })
      await list()
      return saved
    } catch (err) {
      report(err)
      if (err.response?.status === 412) await open(active.id, false, true)
      throw err
    } finally { metadataVersions.set(active.id, (metadataVersions.get(active.id) || 0) + 1); emit({ metadataSaving: false }) }
  }
  async function settle(record, result) {
    if (!alive) return
    if (applyStatus(record.session_id, result) === false) return
    const pending = state.pending.filter((item) => item.body.operation_key !== record.body.operation_key)
    if (!terminal(result.state)) pending.push({ ...record, state: result.state })
    try { persist(pending) } catch { /* Durable result is still available; retaining disk record is safe. */ }
    if (state.active?.id === record.session_id) await open(record.session_id, false, true)
    await list()
    return result
  }
  function applyStatus(sessionId, result) {
    const cacheKey = `${sessionId}:${result.operation_key}`
    const known = terminalStates.get(cacheKey)
    if (known && known !== result.state) return false
    if (terminal(result.state)) terminalStates.set(cacheKey, result.state)
    if (state.active?.id !== sessionId) return true
    lastDetailApplied = ++detailSequence // Fence history GETs started before this authoritative status.
    const messages = state.messages.map((row) => row.structured_data?.input?.operation_key === result.operation_key ? {
      ...row, structured_data: { ...row.structured_data, operation: { ...row.structured_data.operation,
        state: result.state, safe_error_code: result.safe_error_code, response_message_id: result.response?.id || null } },
    } : row)
    emit({ messages: result.response ? mergeMessages(messages, [result.response]) : messages,
      operations: [...state.operations.filter((op) => op.operation_key !== result.operation_key), ...(!terminal(result.state) ? [result] : [])] })
    return true
  }
  async function dispatch(record) {
    if (posting) return
    posting = true; emit({ submitting: true, error: state.storageError })
    try {
      // The identifier/input are durable locally before either creation or provider dispatch.
      persist([...state.pending.filter((item) => item.body.operation_key !== record.body.operation_key), record])
      if (record.needs_create !== false) {
        const session = await request(`${base}/${record.session_id}`, 'PUT', record.create)
        if (state.active?.id === session.id) emit({ active: { ...state.active, ...session, unsaved: false } })
        record = { ...record, needs_create: false }
        persist(state.pending.map((item) => item.body.operation_key === record.body.operation_key ? record : item))
      }
      let result
      try { result = await request(`${base}/${record.session_id}/operations`, 'POST', record.body) }
      catch (err) {
        if (err.response?.data?.operation_key === record.body.operation_key) result = err.response.data
        else throw err
      }
      return await settle(record, result)
    } catch (err) {
      if (err.response?.status >= 400 && err.response.status < 500 && ![408, 429].includes(err.response.status)) {
        // A definitive pre-claim rejection cannot have dispatched this operation.
        try { persist(state.pending.filter((item) => item.body.operation_key !== record.body.operation_key)) } catch { /* surfaced */ }
      }
      report(err)
      // An HTTP failure does not establish whether the server claimed or completed the operation.
      return null
    } finally { posting = false; emit({ submitting: false }) }
  }
  async function submit(input, { retryOf, acknowledge = false } = {}) {
    const active = state.active
    if (!active || posting || active.archived_at || state.metadataSaving) return
    if (state.storageError) throw Error(state.storageError)
    const unresolved = operations().some((op) => !terminal(op.state))
    if (unresolved && !retryOf) throw Error('Check or close the active request first.')
    const body = { ...input, operation_key: uuid() }
    if (retryOf) { body.retry_of = retryOf; if (acknowledge) body.acknowledge_uncertain_outcome = true }
    const record = { session_id: active.id, body, needs_create: !!active.unsaved, create: { title: active.unsaved && active.title === 'New conversation' && input.action === 'send' ? [...input.message.trim()].slice(0, 200).join('') : active.title,
      persona_id: active.default_persona_id || input.persona_id || null }, state: 'checking' }
    return dispatch(record)
  }
  async function check(record) {
    try { return await settle(record, await request(`${base}/${record.session_id}/operations/${record.body.operation_key}`)) }
    catch (err) {
      if (err.response?.status === 404) {
        try { persist(state.pending.map((item) => item.body.operation_key === record.body.operation_key ? { ...item, state: 'unconfirmed' } : item)) } catch { /* surfaced */ }
      } else report(err)
    }
  }
  async function reconcile() {
    if (polling || posting || !alive) return
    polling = true
    try {
      for (const record of [...state.pending]) await check(record)
      const activeId = state.active?.id
      const knownPending = new Set(state.pending.map((record) => record.body.operation_key))
      for (const op of operations().filter((op) => !terminal(op.state) && !knownPending.has(op.operation_key))) {
        try { applyStatus(activeId, await request(`${base}/${activeId}/operations/${op.operation_key}`)) } catch (err) { report(err) }
      }
      if (state.active && !state.active.unsaved) await open(state.active.id, false, true)
      await list()
    } finally { polling = false }
  }
  function operations() {
    return operationRecords(state.messages, state.operations, state.pending.filter((item) => item.session_id === state.active?.id))
  }
  async function abandon(key) {
    try {
      const activeId = state.active.id
      applyStatus(activeId, await request(`${base}/${activeId}/operations/${key}/abandon`, 'POST', { acknowledge_uncertain_outcome: true }))
      persist(state.pending.filter((item) => item.body.operation_key !== key))
      if (state.active?.id === activeId) await open(activeId, false, true)
    } catch (err) { report(err) }
  }
  return { getSnapshot: () => state, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    async start() { alive = true; const startEpoch = epoch; await list(); if (!alive || startEpoch !== epoch) return
      if (!state.active) { if (state.pending.length) await open(state.pending[0].session_id); else if (state.sessions.length) await open(state.sessions[0].id); else newChat() }
      await reconcile()
    },
    stop() { alive = false; ++epoch; ++selection; for (const controller of controllers) controller.abort(); controllers.clear() },
    list, open, newChat, patch, submit, reconcile, operations, abandon,
    exportConversation(id) { return collectConversationExport((sessionId, cursor) => request(`${base}/${sessionId}?version=2&limit=100${cursor ? `&before=${encodeURIComponent(cursor)}` : ''}`), id) },
    async archive() { const active = state.active; if (await patch({ archived: true })) {
      if (state.active?.id === active.id) newChat()
    } },
    async resend(key) { const record = state.pending.find((r) => r.body.operation_key === key); if (record) return dispatch(record) },
    clearError() { emit({ error: state.storageError }) },
  }
}
