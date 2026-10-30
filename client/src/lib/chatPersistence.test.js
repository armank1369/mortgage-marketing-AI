import test from 'node:test'
import assert from 'node:assert/strict'
import { createChatPersistence, pendingStorageKey, chatUUID } from './chatPersistence.js'
const scope = JSON.stringify(['account-a', 'workspace-a'])
const otherScope = JSON.stringify(['account-b', 'workspace-a'])
const persona = '11111111-1111-4111-8111-111111111111'
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r }); return { promise, resolve } }
const http = (status, error) => Object.assign(Error('synthetic'), { response: { status, data: { error } } })
function fixture({ initial = new Map(), override } = {}) {
  const calls = [], writes = [], sessions = new Map(), messages = new Map(), results = new Map()
  let currentWorkspace = 'workspace-a', nextId = 0
  const storage = { getItem: (key) => initial.get(key) || null, setItem(key, value) { writes.push(key); initial.set(key, value) } }
  const api = { getWorkspace: () => currentWorkspace, async send(config, options) {
    assert.equal(options.expectedScope, scope); calls.push(config)
    const replacement = override?.(config, { sessions, messages, results, storage, calls })
    if (replacement) return await replacement
    const { url, method, data } = config
    const [path] = url.split('?'); const parts = path.split('/'); const id = parts[4], key = parts[6]
    if (url.includes('?version=2&archived=')) return { data: { sessions: [...sessions.values()].filter((s) => !!s.archived_at === url.includes('archived=true')), next_cursor: null } }
    if (method === 'PUT') {
      assert.ok(initial.get(pendingStorageKey(scope)), 'pending identifier must precede first network write')
      if (!sessions.has(id)) sessions.set(id, { id, title: data.title, default_persona_id: data.persona_id, etag: '"v1"' })
      return { data: sessions.get(id) }
    }
    if (method === 'PATCH') {
      assert.equal(config.headers['If-Match'], sessions.get(id).etag)
      sessions.set(id, { ...sessions.get(id), ...data, archived_at: data.archived === true ? 'now' : null, etag: '"v2"' })
      return { data: sessions.get(id) }
    }
    if (parts[5] === 'operations' && method === 'POST') {
      const user = { id: 'request', role: 'user', created_at: '2026-01-01', content: data.message || data.action,
        structured_data: { input: data, operation: { state: 'succeeded' } } }
      const response = { id: 'response', role: 'assistant', created_at: '2026-01-02', content: 'saved text', structured_data: { schema_version: 1, type: 'text', payload: { response: 'saved text' } } }
      messages.set(id, [user, response]); const result = { operation_key: data.operation_key, state: 'succeeded', request_message_id: user.id, response }
      results.set(data.operation_key, result); return { data: result }
    }
    if (parts[5] === 'operations') { if (!results.has(key)) throw http(404, 'not_found'); return { data: results.get(key) } }
    if (!sessions.has(id)) throw http(404, 'not_found')
    return { data: { ...sessions.get(id), messages: messages.get(id) || [], operations: [], before_cursor: null } }
  } }
  const make = (custom = {}) => createChatPersistence({ api, scope, storage, uuid: () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`, ...custom })
  return { make, api, storage, initial, calls, writes, sessions, messages, results, switchScope: () => { currentWorkspace = 'workspace-b' } }
}

test('first send stores stable identifiers before writes; success is server-authoritative and legacy keys remain untouched', async () => {
  const legacy = new Map([['lucent_chats', 'legacy bytes'], [`lucent_chats:v2:${encodeURIComponent(scope)}`, 'scoped legacy bytes']])
  const f = fixture({ initial: new Map(legacy) }), c = f.make(); await c.start()
  assert.equal(f.calls.filter((r) => r.method !== 'GET').length, 0)
  await c.patch({ default_persona_id: persona })
  await c.submit({ action: 'send', message: 'Synthetic prompt', persona_id: persona })
  assert.equal(c.getSnapshot().messages.at(-1).content, 'saved text')
  assert.equal(c.getSnapshot().active.unsaved, undefined)
  assert.deepEqual(JSON.parse(f.initial.get(pendingStorageKey(scope))), [])
  for (const [key, value] of legacy) assert.equal(f.initial.get(key), value)
  assert.ok(f.writes.every((key) => key === pendingStorageKey(scope)))
  c.stop()
})

test('browser storage failure prevents both session creation and provider dispatch', async () => {
  const f = fixture(), c = f.make({ storage: { getItem: () => null, setItem: () => { throw Error('quota') } } }); await c.start()
  await c.submit({ action: 'send', message: 'prompt', persona_id: persona })
  assert.match(c.getSnapshot().storageError, /cannot be saved/)
  assert.equal(f.calls.filter((r) => r.method !== 'GET').length, 0)
  c.stop()
})

test('lost reply after commit reloads using GET only and never repeats provider submission', async () => {
  const f = fixture(), c = f.make(); await c.start()
  const original = f.api.send
  f.api.send = async (config, options) => {
    const response = await original(config, options)
    if (config.url.endsWith('/operations') && config.method === 'POST') throw Error('lost reply')
    return response
  }
  await c.submit({ action: 'send', message: 'prompt', persona_id: persona }); c.stop()
  assert.equal(c.getSnapshot().messages.length, 0)
  const before = f.calls.filter((r) => r.method === 'POST').length
  const reloaded = f.make(); await reloaded.start()
  assert.equal(f.calls.filter((r) => r.method === 'POST').length, before)
  assert.equal(reloaded.getSnapshot().messages.at(-1).content, 'saved text')
  assert.equal(reloaded.getSnapshot().pending.length, 0)
  reloaded.stop()
})

test('uncertain status remains unresolved; only explicit acknowledged retry creates a new key', async () => {
  const f = fixture(), c = f.make(); await c.start()
  const original = f.api.send
  f.api.send = async (config, options) => {
    if (config.url.endsWith('/operations') && config.method === 'POST') {
      f.calls.push(config)
      const result = { operation_key: config.data.operation_key, action: 'send', state: 'unknown', safe_error_code: 'provider_outcome_unknown' }
      f.results.set(result.operation_key, result)
      return { data: result }
    }
    return original(config, options)
  }
  await c.submit({ action: 'send', message: 'prompt', persona_id: persona })
  const key = c.operations()[0].operation_key
  for (let i = 0; i < 2; i++) await c.reconcile()
  assert.equal(f.calls.filter((r) => r.method === 'POST').length, 1)
  assert.equal(c.operations()[0].state, 'unknown')
  await assert.rejects(c.submit({ action: 'send', message: 'new', persona_id: persona }))
  await c.submit({ action: 'send', message: 'prompt', persona_id: persona }, { retryOf: key, acknowledge: true })
  const retry = f.calls.filter((r) => r.method === 'POST').at(-1).data
  assert.notEqual(retry.operation_key, key)
  assert.equal(retry.retry_of, key); assert.equal(retry.acknowledge_uncertain_outcome, true)
  c.stop()
})

test('404 status never auto-posts; deliberate resubmission preserves exact input and key', async () => {
  let disconnect = true
  const f = fixture({ override: (config) => config.method === 'POST' && disconnect ? Promise.reject(Error('disconnected before dispatch')) : null })
  const c = f.make(); await c.start(); await c.submit({ action: 'send', message: 'prompt', persona_id: persona })
  const body = f.calls.find((r) => r.method === 'POST').data
  await c.reconcile()
  assert.equal(c.operations()[0].state, 'unconfirmed')
  assert.equal(f.calls.filter((r) => r.method === 'POST').length, 1)
  disconnect = false
  await c.resend(body.operation_key)
  assert.deepEqual(f.calls.filter((r) => r.method === 'POST').at(-1).data, body)
  c.stop()
})

test('scope change and disposal suppress late replies and subsequent requests', async () => {
  const barrier = deferred()
  const f = fixture({ override: (config) => config.method === 'PUT' ? barrier.promise : null })
  const c = f.make(); await c.start(); const before = c.getSnapshot().active
  const send = c.submit({ action: 'send', message: 'prompt', persona_id: persona }); await tick()
  f.switchScope(); c.stop(); const stopped = c.getSnapshot()
  barrier.resolve({ data: { id: before.id, title: 'foreign late title' } }); await send
  assert.equal(c.getSnapshot(), stopped)
  assert.equal(f.calls.filter((r) => r.method === 'POST').length, 0)
  assert.ok(f.calls.find((r) => r.method === 'PUT').signal.aborted)
  assert.notEqual(pendingStorageKey(scope), pendingStorageKey(otherScope))
})

test('switching sessions rejects out-of-order detail responses', async () => {
  const barrier = deferred()
  const f = fixture({ override: (config) => config.url.includes('/old?') ? barrier.promise : null })
  const c = f.make(); await c.start()
  const old = c.open('old'); const fresh = { id: 'fresh', title: 'Current', etag: '"fresh"' }; f.sessions.set(fresh.id, fresh)
  await c.open('fresh'); barrier.resolve({ data: { id: 'old', messages: [{ id: 'foreign' }], operations: [] } }); await old
  assert.equal(c.getSnapshot().active.id, 'fresh'); assert.deepEqual(c.getSnapshot().messages, [])
  c.stop()
})

test('rapid duplicate clicks dispatch once and terminal provider errors stay operation metadata', async () => {
  const barrier = deferred()
  const f = fixture({ override: (config) => config.method === 'POST' ? barrier.promise : null })
  const c = f.make(); await c.start()
  const one = c.submit({ action: 'send', message: 'prompt', persona_id: persona }); await tick()
  await c.submit({ action: 'send', message: 'prompt', persona_id: persona })
  const key = f.calls.find((r) => r.method === 'POST').data.operation_key
  const result = { operation_key: key, state: 'failed', safe_error_code: 'generation_failed' }
  barrier.resolve({ data: result }); await one
  assert.equal(f.calls.filter((r) => r.method === 'POST').length, 1)
  assert.deepEqual(c.getSnapshot().messages, [])
  c.stop()
})

test('metadata changes use ETags; archive retains history and opens only an unsaved composer', async () => {
  const f = fixture(), c = f.make(); await c.start()
  await c.submit({ action: 'send', message: 'prompt', persona_id: persona })
  const id = c.getSnapshot().active.id
  await c.patch({ title: 'Renamed' }); assert.equal(c.getSnapshot().active.title, 'Renamed')
  const writes = f.calls.filter((r) => r.method === 'PUT').length
  await c.archive(); assert.equal(c.getSnapshot().active.unsaved, true)
  assert.equal(f.sessions.get(id).archived_at, 'now'); assert.equal(f.messages.get(id).length, 2)
  assert.equal(f.calls.filter((r) => r.method === 'PUT').length, writes)
  await c.open(id); await c.patch({ archived: false }); assert.equal(f.sessions.get(id).archived_at, null)
  c.stop()
})

test('HTTP validation failure clears the unclaimed pending request and exposes a non-assistant error', async () => {
  const f = fixture({ override: (config) => config.method === 'POST' ? Promise.reject(http(400, 'validation_error')) : null }), c = f.make()
  await c.start(); await c.submit({ action: 'send', message: 'bad', persona_id: persona })
  assert.equal(c.getSnapshot().pending.length, 0); assert.deepEqual(c.getSnapshot().messages, [])
  assert.match(c.getSnapshot().error, /Check the selected persona/)
  c.stop()
})

test('UUID fallback always produces a valid session/operation identifier', () => {
  assert.match(chatUUID(), /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
})

test('a completed operation outside the latest history page cannot leave the conversation permanently busy', async () => {
  const f = fixture(), c = f.make(); await c.start()
  await c.submit({ action: 'send', message: 'prompt', persona_id: persona })
  const session = c.getSnapshot().active
  const request = f.messages.get(session.id)[0]
  request.structured_data.operation.state = 'running'
  await c.open(session.id)
  // The next latest page omits the old request. The status endpoint is authoritative.
  f.messages.set(session.id, [])
  await c.reconcile()
  assert.ok(c.operations().every((op) => ['succeeded', 'failed', 'abandoned'].includes(op.state)))
  assert.ok(f.calls.some((r) => r.url.endsWith(`/operations/${request.structured_data.input.operation_key}`)))
  c.stop()
})

test('a stale history GET cannot overwrite a newly committed persona/title edit', async () => {
  const f = fixture(), c = f.make(); await c.start()
  await c.submit({ action: 'send', message: 'prompt', persona_id: persona })
  const id = c.getSnapshot().active.id
  const original = f.api.send, barrier = deferred()
  const old = structuredClone(c.getSnapshot().active)
  let intercepted = false
  f.api.send = (config, options) => {
    if (!intercepted && config.url.includes(`/${id}?`)) { intercepted = true; return barrier.promise }
    return original(config, options)
  }
  const refresh = c.open(id, false, true)
  await c.patch({ title: 'New metadata' })
  barrier.resolve({ data: { ...old, messages: [], operations: [] } }); await refresh
  assert.equal(c.getSnapshot().active.title, 'New metadata')
  assert.equal(c.getSnapshot().active.etag, '"v2"')
  c.stop()
})

test('shortening an existing conversation does not require a new creation or a current persona', async () => {
  const f = fixture(), c = f.make(); await c.start()
  await c.submit({ action: 'send', message: 'prompt', persona_id: persona })
  await assert.rejects(c.patch({ default_persona_id: null }), /tied to one persona/)
  // A historical unavailable selection still permits deterministic shortening.
  f.sessions.get(c.getSnapshot().active.id).default_persona_id = null
  await c.open(c.getSnapshot().active.id)
  const before = f.calls.filter((r) => r.method === 'PUT').length
  await c.submit({ action: 'shorten', source_message_id: 'response' })
  assert.equal(f.calls.filter((r) => r.method === 'PUT').length, before)
  assert.deepEqual(f.calls.filter((r) => r.method === 'POST').at(-1).data, {
    action: 'shorten', source_message_id: 'response', operation_key: f.calls.filter((r) => r.method === 'POST').at(-1).data.operation_key,
  })
  c.stop()
})

test('automatic titles retain Unicode code points at the 200-character boundary', async () => {
  const f = fixture(), c = f.make(); await c.start()
  await c.submit({ action: 'send', message: 'a'.repeat(199) + '🏡' + 'extra', persona_id: persona })
  assert.equal(f.calls.find((r) => r.method === 'PUT').data.title, 'a'.repeat(199) + '🏡')
  c.stop()
})

test('refresh after a large history gap restarts at the latest page so intervening messages remain reachable', async () => {
  let phase = 'initial'
  const row = (i) => ({ id: `m-${i}`, role: 'user', content: `Message ${i}`, created_at: `2026-01-${String(i).padStart(2, '0')}` })
  const f = fixture({ override: (config) => {
    if (!config.url.includes('/history?')) return null
    const messages = phase === 'initial' ? [row(1), row(2)] : config.url.includes('before=gap') ? [row(3), row(4)] : [row(5), row(6)]
    return Promise.resolve({ data: { id: 'history', title: 'Paged', etag: '"v1"', messages,
      operations: [], before_cursor: phase === 'initial' ? null : config.url.includes('before=gap') ? 'older' : 'gap' } })
  } }), c = f.make()
  await c.start(); await c.open('history')
  phase = 'gap'; await c.open('history', false, true)
  assert.deepEqual(c.getSnapshot().messages.map((m) => m.id), ['m-5', 'm-6'])
  assert.equal(c.getSnapshot().before_cursor, 'gap')
  await c.open('history', true)
  assert.deepEqual(c.getSnapshot().messages.map((m) => m.id), ['m-3', 'm-4', 'm-5', 'm-6'])
  assert.equal(c.getSnapshot().before_cursor, 'older')
  c.stop()
})

test('a stale detail read cannot overwrite a newer saved operation result', async () => {
  const f = fixture(), c = f.make(); await c.start()
  await c.submit({ action: 'send', message: 'prompt', persona_id: persona })
  const active = structuredClone(c.getSnapshot().active), barrier = deferred(), original = f.api.send
  let intercepted = false
  f.api.send = (config, options) => {
    if (!intercepted && config.url.includes(`/${active.id}?`)) { intercepted = true; return barrier.promise }
    return original(config, options)
  }
  const stale = c.open(active.id, false, true)
  await c.submit({ action: 'send', message: 'Another request', persona_id: persona })
  barrier.resolve({ data: { ...active, messages: [], operations: [{ operation_key: 'stale', state: 'running' }] } }); await stale
  assert.equal(c.getSnapshot().messages.at(-1).content, 'saved text')
  assert.ok(!c.operations().some((op) => op.operation_key === 'stale'))
  c.stop()
})

test('a delayed running status cannot resurrect pending work after a saved resubmission', async () => {
  const f = fixture(), c = f.make(); await c.start()
  const original = f.api.send
  let loseFirstReply = true
  f.api.send = async (config, options) => {
    const saved = await original(config, options)
    if (loseFirstReply && config.method === 'POST') {
      loseFirstReply = false
      f.messages.get(c.getSnapshot().active.id)[0].structured_data.operation.state = 'running'
      throw Error('reply not confirmed')
    }
    return saved
  }
  await c.submit({ action: 'send', message: 'prompt', persona_id: persona })
  const key = c.getSnapshot().pending[0].body.operation_key, barrier = deferred()
  let captured = false
  f.api.send = (config, options) => {
    if (!captured && config.method === 'GET' && config.url.endsWith(`/operations/${key}`)) {
      captured = true; return barrier.promise
    }
    return original(config, options)
  }
  const reconcile = c.reconcile(); await tick()
  await c.resend(key)
  barrier.resolve({ data: { operation_key: key, state: 'running', action: 'send', request_message_id: 'request' } })
  await reconcile
  assert.equal(c.getSnapshot().pending.length, 0)
  assert.ok(c.operations().every((op) => ['succeeded', 'failed', 'abandoned'].includes(op.state)))
  c.stop()
})


test('idle reconciliation refreshes shared sidebar and active history without replacing unsaved selection', async () => {
  const f = fixture(), c = f.make()
  await c.start()
  const draft = c.getSnapshot().active
  f.sessions.set('shared', { id: 'shared', title: 'Teammate chat', default_persona_id: persona, etag: '"shared"' })
  f.messages.set('shared', [{ id: 'first', role: 'user', content: 'From teammate', created_at: '2026-01-01' }])
  await c.reconcile()
  assert.equal(c.getSnapshot().sessions[0].id, 'shared')
  assert.deepEqual(c.getSnapshot().active, draft)
  await c.open('shared')
  f.messages.get('shared').push({ id: 'second', role: 'user', content: 'Another followup', created_at: '2026-01-02' })
  f.sessions.get('shared').title = 'Renamed by teammate'
  await c.reconcile()
  assert.equal(c.getSnapshot().active.title, 'Renamed by teammate')
  assert.equal(c.getSnapshot().messages.length, 2)
  assert.equal(f.calls.filter(call => call.method !== 'GET').length, 0)
  c.stop()
})
