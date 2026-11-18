import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthenticatedApi, apiErrorMessage } from './authenticatedApi.js'

function setup() {
  let user = 'user-a'
  const calls = [], errors = []
  const api = createAuthenticatedApi({
    getSession: async () => ({ data: user ? { user: { id: user }, session: { token: `token-${user}` } } : null }),
    request: async (config) => { calls.push(config); return { data: {} } },
    onAccessError: (error) => errors.push(error),
  })
  return { api, calls, errors, setUser: (value) => { user = value } }
}

test('fresh session token and selected workspace accompany each AI endpoint', async () => {
  const { api, calls } = setup()
  api.setWorkspace('user-a', 'workspace-a')
  const signal = new AbortController().signal
  for (const url of ['/api/chat', '/api/video-brief', '/api/social-image']) {
    await api.send({ url, method: 'POST', data: { message: 'synthetic' }, signal,
      headers: { authorization: 'spoof', 'X-Workspace-Id': 'spoof' } })
  }
  assert.equal(calls.length, 3)
  for (const call of calls) {
    assert.deepEqual(call.headers, { Authorization: 'Bearer token-user-a', 'X-Workspace-Id': 'workspace-a' })
    assert.equal(call.signal, signal)
  }
})

test('workspace selection is bound to identity', async () => {
  const { api, calls, setUser } = setup()
  api.setWorkspace('user-a', 'workspace-a')
  setUser('user-b')
  await api.send({ url: '/api/chat' })
  assert.deepEqual(calls[0].headers, { Authorization: 'Bearer token-user-b' })
})

test('auth-only discovery excludes stale workspace selection', async () => {
  const { api, calls } = setup()
  api.setWorkspace('user-a', 'stale')
  await api.send({ url: '/api/workspaces' }, { workspace: false })
  assert.equal(calls[0].headers['X-Workspace-Id'], undefined)
})

test('missing session never reaches backend', async () => {
  const { api, calls, errors, setUser } = setup()
  setUser(null)
  await assert.rejects(api.send({ url: '/api/chat' }), { code: 'NO_AUTH_TOKEN' })
  assert.equal(calls.length, 0)
  assert.equal(errors.length, 1)
})

for (const code of ['unauthenticated', 'workspace_access_denied', 'workspace_selection_required']) {
  test(`${code} is surfaced without automatic retry`, async () => {
    let calls = 0, notified = 0
    const error = { response: { data: { error: code } } }
    const api = createAuthenticatedApi({
      getSession: async () => ({ data: { user: { id: 'a' }, session: { token: 't' } } }),
      request: async () => { calls++; throw error },
      onAccessError: () => { notified++ },
    })
    await assert.rejects(api.send({ url: '/api/chat' }))
    assert.equal(calls, 1)
    assert.equal(notified, 1)
    assert.notEqual(apiErrorMessage(error), 'The request failed. Please try again.')
  })
}

test('unavailable browser storage does not lose current selection', () => {
  const api = createAuthenticatedApi({ storage: { getItem() { throw Error() }, setItem() { throw Error() } } })
  assert.equal(api.getWorkspace('a'), null)
  api.setWorkspace('a', 'w')
  assert.equal(api.getWorkspace('a'), 'w')
})

for (const cause of ['workspace change', 'request cancellation']) {
  test(`${cause} during session lookup prevents dispatch`, async () => {
    let finishSession
    let calls = 0
    const api = createAuthenticatedApi({
      getSession: () => new Promise((resolve) => { finishSession = resolve }),
      request: async () => { calls++ },
    })
    api.setWorkspace('a', 'first')
    const controller = new AbortController()
    const pending = api.send({ url: '/api/chat', signal: controller.signal })
    if (cause === 'workspace change') api.setWorkspace('a', 'second')
    else controller.abort()
    finishSession({ data: { user: { id: 'a' }, session: { token: 'token' } } })
    await assert.rejects(pending, { code: 'ERR_CANCELED' })
    assert.equal(calls, 0)
  })
}
