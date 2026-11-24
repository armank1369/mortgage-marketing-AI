import test from 'node:test'
import assert from 'node:assert/strict'
import { canSeeUsers, displayName, filterPeople, grantSummary, roleChangeSummary, roleLabel, usersErrorMessage } from './members.js'

test('only owners and admins see the Users tab', () => {
  for (const role of ['owner', 'admin']) assert.equal(canSeeUsers(role), true)
  for (const role of ['developer', 'member', 'viewer', undefined]) assert.equal(canSeeUsers(role), false)
})

test('names fall back to email, then a placeholder', () => {
  assert.equal(displayName({ name: 'Dana', email: 'd@x.com' }), 'Dana')
  assert.equal(displayName({ email: 'd@x.com' }), 'd@x.com')
  assert.equal(displayName({}), 'Unnamed account')
})

test('confirmation text names the person and warns on demotion', () => {
  const s = roleChangeSummary({ name: 'Dana', role: 'admin' }, 'member')
  assert.equal(s.title, 'Change Dana to Member?')
  assert.match(s.body, /currently Admin/)
  assert.match(s.body, /lose access/)
  assert.doesNotMatch(roleChangeSummary({ name: 'Dana', role: 'member' }, 'viewer').body, /lose access/)
  assert.equal(grantSummary({ email: 'a@b.co' }, 'member').confirm, 'Give Member access')
  assert.equal(roleLabel('viewer'), 'Viewer')
})

test('search matches name or email, ignoring case', () => {
  const people = [{ name: 'Dana Lee', email: 'dana@x.com' }, { name: null, email: 'sam@y.com' }]
  assert.equal(filterPeople(people, 'LEE').length, 1)
  assert.equal(filterPeople(people, 'y.com')[0].email, 'sam@y.com')
  assert.equal(filterPeople(people, '  ').length, 2)
})

test('error codes map to plain language, conflicts pass the server message through', () => {
  assert.match(usersErrorMessage('permission_denied', 'x'), /Owners can change any role/)
  assert.equal(usersErrorMessage('conflict', 'x'), null)
  assert.equal(usersErrorMessage('weird', 'fallback'), 'fallback')
})
