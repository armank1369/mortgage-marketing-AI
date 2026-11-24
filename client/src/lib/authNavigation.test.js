import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthNavigate, isAuthPath } from './authNavigation.js'

test('isAuthPath recognises auth screens only', () => {
  assert.equal(isAuthPath('/auth/sign-in?redirectTo=%2F'), true)
  assert.equal(isAuthPath('/auth/forgot-password'), true)
  assert.equal(isAuthPath('/'), false)
  assert.equal(isAuthPath('/settings'), false)
  assert.equal(isAuthPath('/authors'), false)
})

test('leaving the auth screens does a full page load', () => {
  const calls = []
  const nav = createAuthNavigate((t) => calls.push(['router', t]), (t) => calls.push(['hard', t]))
  nav('/')
  nav('/auth/forgot-password')
  assert.deepEqual(calls, [['hard', '/'], ['router', '/auth/forgot-password']])
})

import { hasSession } from './authNavigation.js'

test('hasSession reads the session from the auth client', async () => {
  assert.equal(await hasSession({ getSession: async () => ({ data: { user: { id: 1 } } }) }), true)
  assert.equal(await hasSession({ getSession: async () => ({ data: null }) }), false)
  assert.equal(await hasSession({ getSession: async () => null }), false)
})

test('hasSession falls back to a direct server check', async () => {
  const client = { getSession: async () => ({ data: null }) }
  const ok = async () => ({ ok: true, json: async () => ({ user: { id: 1 } }) })
  const none = async () => ({ ok: true, json: async () => null })
  assert.equal(await hasSession(client, { baseUrl: '/neon-auth', fetchImpl: ok }), true)
  assert.equal(await hasSession(client, { baseUrl: '/neon-auth', fetchImpl: none }), false)
})
