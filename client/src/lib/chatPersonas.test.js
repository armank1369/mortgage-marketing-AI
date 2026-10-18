import test from 'node:test'
import assert from 'node:assert/strict'
import { getChatGenerationPersona, selectChatGenerationPersona } from './chatPersonas.js'
import { saveChatsToStorage, loadChatsFromStorage } from '../utils/storage.js'

const first = { id: '11111111-1111-4111-8111-111111111111', name: 'First-Time Buyer' }
const second = { id: '22222222-2222-4222-8222-222222222222', name: 'Business Owner' }
const personas = [first, second]
const scope = JSON.stringify(['synthetic-user', 'synthetic-workspace'])
const legacy = {
  id: 'old-chat', title: 'Existing conversation', personaId: 'self-employed',
  persona: { id: 'business-owner', apiKey: 'self-employed', name: 'Original browser audience' },
  createdAt: '2026-10-12T12:00:00.000Z', updatedAt: '2026-10-12T12:05:00.000Z',
  messages: [{ id: 'message-1', role: 'assistant', text: 'Keep this historical answer.',
    createdAt: '2026-10-12T12:05:00.000Z', persona_id: second.id }],
}
const current = { id: 'new-chat', persona: second, personaId: second.id, title: 'New conversation', messages: [] }

test('legacy chats require explicit selection; new database-persona chats retain their original default', () => {
  assert.equal(getChatGenerationPersona(legacy, second, personas), null)
  assert.equal(getChatGenerationPersona(current, first, personas), second)
  // A previous answer's persona never becomes an implicit selection/migration.
  assert.equal(legacy.messages[0].persona_id, second.id)
})

test('selection belongs to the chat and survives switching chats without changing its original records', () => {
  const original = structuredClone(legacy)
  const selected = selectChatGenerationPersona([legacy, current], legacy.id, first.id, personas)
  assert.equal(getChatGenerationPersona(selected[0], second, personas), first)
  assert.equal(getChatGenerationPersona(selected[1], first, personas), second)
  assert.equal(getChatGenerationPersona(selected[0], second, personas), first)
  assert.deepEqual(legacy, original)
  assert.deepEqual(selected[0], { ...original, generationPersonaId: first.id })
  assert.equal(selected[0].messages, legacy.messages)
  assert.equal(selected[0].persona, legacy.persona)
  assert.equal(selected[1], current)
})

test('an older chat selection persists through the actual scoped storage/reload path', () => {
  const data = new Map([['lucent_chats', 'untouched legacy storage']])
  globalThis.localStorage = { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) }
  try {
    const empty = { id: 'empty-chat', persona: null, messages: [] }
    const selected = selectChatGenerationPersona([legacy, current, empty], legacy.id, first.id, personas)
    saveChatsToStorage(selected, current.id, scope) // Navigate away before refresh.
    const restored = loadChatsFromStorage(scope)
    assert.equal(restored.activeChatId, current.id)
    assert.equal(getChatGenerationPersona(restored.chats.find((chat) => chat.id === legacy.id), second, personas).id, first.id)
    assert.equal(getChatGenerationPersona(restored.chats.find((chat) => chat.id === current.id), first, personas).id, second.id)
    assert.deepEqual(restored.chats[0].messages, legacy.messages)
    assert.deepEqual(restored.chats[0].persona, legacy.persona)
    assert.equal(restored.chats[0].title, legacy.title)
    assert.equal(restored.chats[0].createdAt, legacy.createdAt)
    assert.equal(data.get('lucent_chats'), 'untouched legacy storage')
    assert.equal(loadChatsFromStorage(JSON.stringify(['other-user', 'synthetic-workspace'])), null)
    assert.equal(loadChatsFromStorage(JSON.stringify(['synthetic-user', 'other-workspace'])), null)
  } finally { delete globalThis.localStorage }
})

test('clearing a selection is durable and never falls back to the original persona', () => {
  const [cleared] = selectChatGenerationPersona([current], current.id, '', personas)
  assert.equal(cleared.generationPersonaId, '')
  assert.equal(getChatGenerationPersona(JSON.parse(JSON.stringify(cleared)), second, personas), null)
  assert.deepEqual(cleared.persona, second)
})

test('a saved selection does not silently fall back when configuration is loading or the persona is deleted/foreign', () => {
  const [selected] = selectChatGenerationPersona([current], current.id, first.id, personas)
  assert.equal(getChatGenerationPersona(selected, second, []), null)
  assert.equal(getChatGenerationPersona(selected, second, [second]), null)
  assert.equal(selected.generationPersonaId, first.id)
  assert.equal(getChatGenerationPersona(selected, second, personas), first)
  assert.deepEqual(selectChatGenerationPersona([legacy], legacy.id, 'custom-123', personas), [legacy])
})

test('each chat can change selection independently, including a new chat with a database default', () => {
  let chats = selectChatGenerationPersona([legacy, current], legacy.id, first.id, personas)
  chats = selectChatGenerationPersona(chats, current.id, first.id, personas)
  chats = selectChatGenerationPersona(chats, legacy.id, second.id, personas)
  assert.equal(getChatGenerationPersona(chats[0], null, personas), second)
  assert.equal(getChatGenerationPersona(chats[1], null, personas), first)
  assert.equal(chats[1].persona.id, second.id)
})
