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
