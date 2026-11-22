import test from 'node:test'
import assert from 'node:assert/strict'
import { AUTH_LOCALIZATION, authDocumentTitle, authScreen } from './authCopy.js'

test('each auth screen gets its own title and help note', () => {
  assert.equal(authScreen('sign-in').title, 'Sign in')
  assert.equal(authScreen('sign-up').title, 'Create account')
  assert.equal(authScreen('forgot-password').title, 'Reset password')
  assert.match(authScreen('sign-up').note, /admin needs to add you/)
  assert.equal(authDocumentTitle('forgot-password'), 'Reset password · Lucie')
})

test('unknown or missing paths fall back to the sign-in copy', () => {
  for (const path of [undefined, '', 'callback', 'constructor', '__proto__']) {
    assert.equal(authScreen(path).title, 'Sign in')
  }
})

test('credential errors stay generic so they do not reveal which accounts exist', () => {
  assert.equal(AUTH_LOCALIZATION.USER_NOT_FOUND, AUTH_LOCALIZATION.INVALID_EMAIL_OR_PASSWORD)
  assert.doesNotMatch(AUTH_LOCALIZATION.INVALID_EMAIL_OR_PASSWORD, /no account|not found|not registered/i)
  assert.doesNotMatch(AUTH_LOCALIZATION.FORGOT_PASSWORD_EMAIL, /^Check your email for/)
  assert.match(AUTH_LOCALIZATION.FORGOT_PASSWORD_EMAIL, /^If that email has an account/)
})
