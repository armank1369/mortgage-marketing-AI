import test from 'node:test'
import assert from 'node:assert/strict'
import { LONG_CHAT_REQUEST_THRESHOLD, countChatRequests, isLongChat } from './longChat.js'

const send = (id) => ({ id, role: 'user', structured_data: { input: { action: 'send' } } })
const reply = (id) => ({ id, role: 'assistant', structured_data: { type: 'text' } })

test('counts only send requests from the user', () => {
  const rows = [
    send('1'), reply('2'),
    { id: '3', role: 'user', content: 'legacy row without input' },
    { id: '4', role: 'user', structured_data: { input: { action: 'shorten' } } },
    { id: '5', role: 'user', structured_data: { input: { action: 'clarify' } } },
    { id: '6', role: 'user', structured_data: { input: { action: 'rewrite' } } },
  ]
  assert.equal(countChatRequests(rows), 2)
  assert.equal(countChatRequests(), 0)
})

test('warns once the configured threshold is reached', () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => [send(`u${i}`), reply(`a${i}`)]).flat()
  assert.equal(isLongChat(rows(LONG_CHAT_REQUEST_THRESHOLD - 1)), false)
  assert.equal(isLongChat(rows(LONG_CHAT_REQUEST_THRESHOLD)), true)
  assert.equal(isLongChat(rows(3), { threshold: 3 }), true)
})

test('an unloaded older page means the chat is already long', () => {
  assert.equal(isLongChat([send('1')], { hasOlder: true }), true)
})
