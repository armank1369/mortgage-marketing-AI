import test from 'node:test'
import assert from 'node:assert/strict'
import { saveChatsToStorage, loadChatsFromStorage, savePreferencesToStorage,
  loadPreferencesFromStorage, saveCalendarEntriesToStorage, loadCalendarEntriesFromStorage } from '../utils/storage.js'

test('browser data is isolated by identity/workspace and legacy data is preserved', () => {
  const data = new Map([
    ['lucent_chats', '{"chats":[{"id":"legacy","messages":[]}]}'],
    ['lucent_preferences', '{"persona":{"name":"Legacy persona"}}'],
    ['lucent_calendar_entries', '[{"id":"legacy"}]'],
  ])
  const legacy = new Map(data)
  globalThis.localStorage = {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
  }
  try {
    const a = JSON.stringify(['user-a', 'workspace-a'])
    const b = JSON.stringify(['user-b', 'workspace-a'])
    const c = JSON.stringify(['user-a', 'workspace-b'])
    for (const scope of [a, b, c]) {
      assert.equal(loadChatsFromStorage(scope), null)
      assert.equal(loadPreferencesFromStorage(scope), null)
      assert.equal(loadCalendarEntriesFromStorage(scope), null)
    }
    saveChatsToStorage([{ id: 'private', messages: [] }], 'private', a)
    savePreferencesToStorage({ persona: { name: 'Synthetic' } }, a)
    saveCalendarEntriesToStorage([{ id: 'event', date: new Date('2026-10-10T12:00:00Z') }], a)
    assert.equal(loadChatsFromStorage(a).chats[0].id, 'private')
    assert.equal(loadPreferencesFromStorage(a).persona.name, 'Synthetic')
    assert.equal(loadCalendarEntriesFromStorage(a)[0].id, 'event')
    for (const scope of [b, c]) {
      assert.equal(loadChatsFromStorage(scope), null)
      assert.equal(loadPreferencesFromStorage(scope), null)
      assert.equal(loadCalendarEntriesFromStorage(scope), null)
    }
    for (const [key, value] of legacy) assert.equal(data.get(key), value)
    const count = data.size
    saveChatsToStorage([], null) // Missing scope must never overwrite legacy records.
    assert.equal(data.size, count)
    assert.equal(loadChatsFromStorage(), null)
    assert.equal(data.get('lucent_chats'), legacy.get('lucent_chats'))
  } finally { delete globalThis.localStorage }
})
