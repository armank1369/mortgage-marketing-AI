import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthenticatedApi, apiErrorMessage } from './authenticatedApi.js'
import { brandProfileRequest } from './brandProfile.js'
import { scopedRequest, validateBrandFields, validatePersonaFields, selectDatabasePersona, isDatabasePersona } from './workspaceConfiguration.js'
import { loadPreferencesFromStorage, savePreferencesToStorage } from '../utils/storage.js'

const persona = { id: '11111111-1111-4111-8111-111111111111', name: 'Saved Audience' }
function setup(request) {
  let userId = 'a'
  const api = createAuthenticatedApi({ getSession: async () => ({ data: { user: { id: userId }, session: { token: 'synthetic' } } }), request })
  api.setWorkspace('a', 'first')
  return { api, setUser: (value) => { userId = value } }
}
const scope = JSON.stringify(['a', 'first'])

test('all exposed brand fields survive validated save/load, with only the edited patch sent', async () => {
  const values = { business_name: 'Synthetic Brokerage', licensed_person_name: 'Synthetic Licensee', nmls_id: '123456', dre_number: '00123456',
    tone: { voice: 'Clear and warm' }, values: ['Accuracy'], keywords: ['clear'], catchphrases: ['Clarity.'], banned_words: ['hype'],
    blog_examples: [{ text: 'Synthetic education' }], compliance_footer: 'Supplemental text', equal_housing_text: 'Additional text' }
  const calls = []
  const { api } = setup(async (config) => { calls.push(config); return { data: config.method === 'PUT' ? { ...values, ...config.data } : values } })
  assert.deepEqual(validateBrandFields(values), values)
  assert.deepEqual(await brandProfileRequest(api, scope, new AbortController().signal), values)
  const updated = await brandProfileRequest(api, scope, new AbortController().signal, { tone: { voice: 'Concise' } })
  assert.deepEqual(calls[1].data, { tone: { voice: 'Concise' } })
  assert.equal(updated.dre_number, '00123456')
  assert.equal(updated.licensed_person_name, values.licensed_person_name)
})

for (const fields of [{ business_name: '' }, { licensed_person_name: 'Name\nOverride' }, { nmls_id: '000000' }, { nmls_id: 123 },
  { dre_number: 'not-numeric' }, { values: [42] }, { keywords: [null] }, { tone: [] }, { blog_examples: 'raw text' },
  { banned_words: ['x'.repeat(201)] }, { equal_housing_text: 'x'.repeat(501) }, { settings: { any: 'unknown' } }]) {
  test(`invalid brand configuration rejected: ${JSON.stringify(fields).slice(0, 55)}`, () => assert.throws(() => validateBrandFields(fields)))
}

test('JSON and arrays enforce shared depth, aggregate size and count bounds', () => {
  assert.throws(() => validateBrandFields({ values: Array(41).fill('x') }))
  assert.throws(() => validateBrandFields({ tone: { voice: 'x'.repeat(4000) } }))
  assert.throws(() => validateBrandFields({ tone: { a: { b: { c: { d: { e: 'deep' } } } } } }))
  assert.throws(() => validateBrandFields({ tone: { a: Number.NaN } }))
  assert.deepEqual(validateBrandFields({ values: [], tone: {}, nmls_id: '', licensed_person_name: '' }), { values: [], tone: {}, nmls_id: '', licensed_person_name: '' })
})

test('persona editor validates useful fields and rejects browser-controlled workspace/starter status', () => {
  const fields = { slug: 'education', name: 'Education', description: 'Clear process', audience_profile: { needs: ['Clarity'] }, prompt_guidance: 'Explain terms' }
  assert.deepEqual(validatePersonaFields(fields), fields)
  for (const patch of [{ ...fields, slug: 'BAD Slug' }, { ...fields, audience_profile: [] }, { ...fields, name: '' },
    { ...fields, prompt_guidance: 'x'.repeat(4001) }, { ...fields, workspace_id: 'foreign' }, { ...fields, is_starter: true }]) {
    assert.throws(() => validatePersonaFields(patch))
  }
})

for (const [url, method, payload] of [
  ['/api/personas', 'GET', undefined], ['/api/personas', 'POST', { name: 'Education', slug: 'education' }],
  [`/api/personas/${persona.id}`, 'PUT', { description: 'Changed' }],
  ['/api/chat', 'POST', { message: 'Education', persona_id: persona.id }],
  ['/api/video-brief', 'POST', { caption: 'Education', persona_id: persona.id }],
  ['/api/social-image', 'POST', { title: 'Education', persona_id: persona.id }],
]) {
  test(`${method} ${url} is scoped, authenticated, and rejects a late workspace response`, async () => {
    let finish, call
    const { api } = setup((config) => { call = config; return new Promise((resolve) => { finish = resolve }) })
    const pending = scopedRequest(api, scope, new AbortController().signal, url, method, payload)
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(call.headers, { Authorization: 'Bearer synthetic', 'X-Workspace-Id': 'first' })
    assert.deepEqual(call.data, payload)
    if (payload?.persona_id) assert.equal(call.data.nmls_number, undefined)
    api.setWorkspace('a', 'second')
    finish({ data: { name: 'Old workspace' } })
    await assert.rejects(pending, { code: 'ERR_CANCELED' })
  })
}

test('account change before persona save prevents dispatch', async () => {
  let calls = 0
  const { api, setUser } = setup(async () => { calls++ })
  setUser('second-account')
  await assert.rejects(scopedRequest(api, scope, new AbortController().signal, '/api/personas', 'POST', { name: 'Name' }), { code: 'ERR_CANCELED' })
  assert.equal(calls, 0)
})

test('abort on account unmount rejects late responses even when transport ignores abort', async () => {
  let finish
  const { api, setUser } = setup(() => new Promise((resolve) => { finish = resolve }))
  const controller = new AbortController()
  const pending = scopedRequest(api, scope, controller.signal, '/api/personas')
  await new Promise((resolve) => setImmediate(resolve))
  setUser('second-account'); controller.abort()
  finish({ data: { personas: [persona] } })
  await assert.rejects(pending, { code: 'ERR_CANCELED' })
})

test('explicit database selection preserves legacy preference/persona records without mutating them', () => {
  const previous = { name: 'Legacy display', persona: { id: 'custom-123', name: 'Browser audience', tone: { serious: 2 }, privateDraft: 'Keep me' }, historySetting: 'keep' }
  const snapshot = structuredClone(previous)
  const result = selectDatabasePersona(previous, persona)
  assert.deepEqual(previous, snapshot)
  assert.deepEqual(result.legacyPersonas, [previous.persona])
  assert.equal(result.historySetting, 'keep')
  assert.equal(result.persona.id, persona.id)
  assert.equal(isDatabasePersona(previous.persona), false)
  assert.equal(selectDatabasePersona(result, persona).legacyPersonas.length, 1)
  assert.throws(() => selectDatabasePersona(previous, previous.persona))
})

test('configuration and permission failures surface safe actionable messages', () => {
  for (const code of ['generation_configuration_required', 'permission_denied', 'not_found', 'conflict', 'database_unavailable', 'validation_error']) {
    const message = apiErrorMessage({ response: { data: { error: code, message: 'PRIVATE_SERVER_DETAIL' } } })
    assert.ok(message.length > 15 && !message.includes('PRIVATE_SERVER_DETAIL'))
  }
})

test('explicit persona transition persists complete legacy snapshots across browser reloads', () => {
  const key = `lucent_preferences:v2:${encodeURIComponent(scope)}`
  const original = { persona: { id: 'custom-123', name: 'Original audience' },
    core_values: 'Legacy voice', nmls_number: 'historical-only', unknownSetting: { keep: true } }
  const data = new Map([[key, JSON.stringify(original)]])
  globalThis.localStorage = { getItem: (name) => data.get(name) || null, setItem: (name, value) => data.set(name, value) }
  try {
    const loaded = loadPreferencesFromStorage(scope)
    assert.deepEqual(loaded, original)
    assert.equal(data.get(key), JSON.stringify(original))
    savePreferencesToStorage(selectDatabasePersona(loaded, persona), scope)
    const restored = loadPreferencesFromStorage(scope)
    assert.deepEqual(restored.legacyPersonas, [original.persona])
    assert.deepEqual(restored.unknownSetting, original.unknownSetting)
    assert.equal(restored.nmls_number, original.nmls_number)
    assert.equal(restored.persona.id, persona.id)
  } finally { delete globalThis.localStorage }
})
