import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPersonaFolders, folderFor, newestFirst, formatChatTime, UNSORTED_FOLDER } from './chatFolders.js'

const personas = [{ id: 'p1', name: 'First-time buyers' }, { id: 'p2', name: 'Refinance' }, { id: 'p3', name: 'Investors' }]

test('every active persona gets a folder, most recently used first, empty ones by name', () => {
  const folders = buildPersonaFolders(personas, [
    { persona_id: 'p2', persona_name: 'Refinance', available: true, chat_count: 4, last_updated_at: '2026-11-20T10:00:00Z' },
    { persona_id: 'p1', persona_name: 'First-time buyers', available: true, chat_count: 1, last_updated_at: '2026-11-01T10:00:00Z' },
  ])
  assert.deepEqual(folders.map((f) => [f.id, f.chat_count]), [['p2', 4], ['p1', 1], ['p3', 0]])
  assert.ok(folders.every((f) => f.available))
})

test('deleted personas and persona-less chats keep read-only folders', () => {
  const folders = buildPersonaFolders(personas.slice(0, 1), [
    { persona_id: 'gone', persona_name: null, available: false, chat_count: 2, last_updated_at: null },
    { persona_id: null, persona_name: null, available: false, chat_count: 3, last_updated_at: null },
  ])
  assert.deepEqual(folders.map((f) => [f.id, f.name, f.available, f.chat_count]), [
    ['p1', 'First-time buyers', true, 0], ['gone', 'Unavailable persona', false, 2], [UNSORTED_FOLDER, 'Unsorted chats', false, 3]])
  assert.equal(folderFor(folders, 'gone').chat_count, 2)
  assert.equal(folderFor(folders, 'missing'), null)
})

test('no personas and no chats means no folders', () => {
  assert.deepEqual(buildPersonaFolders(), [])
})

test('chats are listed newest first and show the time of day', () => {
  const rows = [{ id: 'a', updated_at: '2026-11-20T10:00:00Z' }, { id: 'c', updated_at: '2026-11-22T09:30:00Z' }, { id: 'b', updated_at: '2026-11-22T21:05:00Z' }, { id: 'd' }]
  assert.deepEqual(newestFirst(rows).map((row) => row.id), ['b', 'c', 'a', 'd'])
  assert.deepEqual(rows.map((row) => row.id), ['a', 'c', 'b', 'd'], 'input is not mutated')
  const now = new Date('2026-11-22T12:00:00Z')
  const text = formatChatTime('2026-11-22T21:05:00Z', now, 'en-US')
  assert.match(text, /Nov 2\d/); assert.match(text, /\d{1,2}:\d{2}\s?[AP]M/)
  assert.match(formatChatTime('2025-03-01T09:00:00Z', now, 'en-US'), /2025/)
  assert.equal(formatChatTime('not a date', now), '')
})
