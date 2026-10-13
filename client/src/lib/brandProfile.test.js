import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthenticatedApi, apiErrorMessage } from './authenticatedApi.js'
import { brandProfileRequest, brandProfileError } from './brandProfile.js'

function setup(request) {
  let userId = 'a'
  const api = createAuthenticatedApi({
    getSession: async () => ({ data: { user: { id: userId }, session: { token: 'synthetic' } } }),
    request,
  })
  api.setWorkspace('a', 'first')
  return { api, setUser: (value) => { userId = value } }
}

test('profile GET/PUT use verified session and selected workspace; PUT displays persisted value', async () => {
  const calls = []
  const { api } = setup(async (config) => { calls.push(config); return { data: { business_name: 'Persisted' } } })
  const scope = JSON.stringify(['a', 'first'])
  const signal = new AbortController().signal
  await brandProfileRequest(api, scope, signal)
  assert.equal((await brandProfileRequest(api, scope, signal, '  New  ')).business_name, 'Persisted')
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[1].method, 'PUT')
  assert.deepEqual(calls[1].data, { business_name: 'New' })
  assert.deepEqual(calls[1].headers, { Authorization: 'Bearer synthetic', 'X-Workspace-Id': 'first' })
})

for (const change of ['account', 'workspace', 'no selection']) {
  test(`${change} before dispatch prevents profile write`, async () => {
    let calls = 0
    const { api, setUser } = setup(async () => { calls++ })
    if (change === 'account') setUser('b')
    else api.setWorkspace('a', change === 'workspace' ? 'second' : null)
    await assert.rejects(brandProfileRequest(api, JSON.stringify(['a', 'first']), new AbortController().signal, 'New'), { code: 'ERR_CANCELED' })
    assert.equal(calls, 0)
  })
}

for (const method of ['GET', 'PUT']) {
  for (const change of ['abort', 'workspace']) {
    test(`late ${method} response after ${change} cannot update editor`, async () => {
      let finish
      const { api } = setup(() => new Promise((resolve) => { finish = resolve }))
      const controller = new AbortController()
      const pending = brandProfileRequest(api, JSON.stringify(['a', 'first']), controller.signal, method === 'PUT' ? 'New' : undefined)
      await new Promise((resolve) => setImmediate(resolve))
      if (change === 'abort') controller.abort()
      else api.setWorkspace('a', 'second')
      finish({ data: { business_name: 'Old workspace' } })
      await assert.rejects(pending, { code: 'ERR_CANCELED' })
    })
  }
}

test('workspace discovery rejects account change before dispatch', async () => {
  let calls = 0
  const { api, setUser } = setup(async () => { calls++ })
  setUser('b')
  await assert.rejects(api.send({ url: '/api/workspaces' }, { workspace: false, expectedUserId: 'a' }), { code: 'ERR_CANCELED' })
  assert.equal(calls, 0)
})

test('aborted access errors do not disrupt a new workspace gate', async () => {
  let reject, notices = 0
  const api = createAuthenticatedApi({
    getSession: async () => ({ data: { user: { id: 'a' }, session: { token: 't' } } }),
    request: () => new Promise((_, fail) => { reject = fail }),
    onAccessError: () => { notices++ },
  })
  api.setWorkspace('a', 'first')
  const controller = new AbortController()
  const pending = api.send({ url: '/api/brand-profile', signal: controller.signal })
  await new Promise((resolve) => setImmediate(resolve))
  controller.abort()
  reject({ response: { data: { error: 'workspace_access_denied' } } })
  await assert.rejects(pending)
  assert.equal(notices, 0)
})

for (const [code, text] of [['not_found', 'No brand profile'], ['permission_denied', 'role'],
  ['validation_error', '1–100'], ['database_unavailable', 'temporarily unavailable']]) {
  test(`${code} save errors surface safe actionable messages without success`, async () => {
    const error = { response: { data: { error: code, message: 'secret' } } }
    const { api } = setup(async () => { throw error })
    await assert.rejects(brandProfileRequest(api, JSON.stringify(['a', 'first']), new AbortController().signal, 'New'))
    const message = brandProfileError(error) || apiErrorMessage(error)
    assert.ok(message.includes(text))
    assert.ok(!message.includes('secret'))
  })
}
