import test from 'node:test'
import assert from 'node:assert/strict'
import { isNearBottom, planScroll } from './chatScroll.js'

const base = { chatId: 'c1', lastId: 'm1', lastRole: 'user', submitting: false }
const reply = { ...base, lastId: 'm2', lastRole: 'assistant' }

test('a tall new reply scrolls to its start', () => {
  assert.equal(planScroll({ prev: { ...base, submitting: true }, next: reply, nearBottom: true, replyHeight: 3000, viewportHeight: 700 }), 'reply-start')
})
test('a short new reply scrolls to the bottom so it is fully visible', () => {
  assert.equal(planScroll({ prev: base, next: reply, nearBottom: true, replyHeight: 200, viewportHeight: 700 }), 'bottom')
})
test('a new reply does not move the view if the reader scrolled away', () => {
  assert.equal(planScroll({ prev: base, next: reply, nearBottom: false, replyHeight: 3000, viewportHeight: 700 }), 'none')
})
test('sending your own message always scrolls to the bottom', () => {
  assert.equal(planScroll({ prev: reply, next: { ...base, lastId: 'm3' }, nearBottom: false }), 'bottom')
})
test('showing the typing indicator follows the bottom only when already there', () => {
  assert.equal(planScroll({ prev: base, next: { ...base, submitting: true }, nearBottom: true }), 'bottom')
  assert.equal(planScroll({ prev: base, next: { ...base, submitting: true }, nearBottom: false }), 'none')
  assert.equal(planScroll({ prev: { ...base, submitting: true }, next: base, nearBottom: true }), 'none')
})
test('opening or switching chats scrolls to the bottom', () => {
  assert.equal(planScroll({ prev: null, next: base, nearBottom: true }), 'bottom')
  assert.equal(planScroll({ prev: base, next: { ...reply, chatId: 'c2' }, nearBottom: false }), 'bottom')
})
test('detects the near-bottom threshold', () => {
  assert.equal(isNearBottom({ scrollHeight: 2000, scrollTop: 1200, clientHeight: 700 }), true)
  assert.equal(isNearBottom({ scrollHeight: 2000, scrollTop: 500, clientHeight: 700 }), false)
})
