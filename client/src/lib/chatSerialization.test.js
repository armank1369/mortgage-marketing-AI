import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decodeMessage, mergeMessages, projectConversation, operationRecords } from './chatSerialization.js'

const fixtures = JSON.parse(readFileSync(new URL('../../../docs/fixtures/step_j_v1.json', import.meta.url)))
const rows = fixtures.cases.map((item, index) => ({ id: `m${index}`, role: 'assistant', kind: 'response', created_at: `2026-10-19T00:00:0${index}Z`,
  content: JSON.stringify(item.payload), compliance_flags: item.compliance_flags,
  structured_data: { ...item, persona_snapshot: fixtures.persona_snapshot } }))

test('all frozen output envelopes retain full publication fields, flags and persona snapshots', () => {
  for (const row of rows) {
    const decoded = decodeMessage(row)
    assert.equal(decoded.type, row.structured_data.type)
    assert.deepEqual(decoded.structured_data, row.structured_data)
    assert.deepEqual(decoded.compliance_flags, row.compliance_flags)
    assert.deepEqual(decoded.persona_snapshot, fixtures.persona_snapshot)
  }
  assert.match(decodeMessage(rows[0]).text, /Synthetic supplemental disclosure/)
  assert.deepEqual(decodeMessage(rows[1]).posts.posts[0].script.body, rows[1].structured_data.payload.posts.posts[0].script.body)
  assert.deepEqual(decodeMessage(rows[3]).campaign.content_calendar[0].hashtags, [])
})

test('revision chains retain originals and attach current nested media without mutating source rows', () => {
  const parent = structuredClone(rows[3])
  const media = { ...structuredClone(rows[4]), source_message_id: parent.id }
  const revision = { ...structuredClone(media), id: 'new-video', kind: 'revision', source_message_id: media.id }
  const snapshot = JSON.stringify([parent, media, revision])
  const projected = projectConversation([parent, media, revision])
  assert.equal(projected.length, 1)
  const saved = projected[0].artifacts['content_calendar:0'].video
  assert.equal(saved.id, revision.id)
  assert.equal(saved.previous[0].id, media.id)
  assert.equal(JSON.stringify([parent, media, revision]), snapshot)
  // Pagination can initially omit ancestors. It must still display the artifact.
  assert.equal(projectConversation([revision])[0].id, revision.id)
})

test('text revisions and submitted clarification selections survive reload', () => {
  const original = rows[0]
  const revision = { ...original, id: 'short', kind: 'revision', source_message_id: original.id }
  assert.deepEqual(projectConversation([original, revision]).map((r) => r.id), ['short'])
  const clarification = rows[2]
  const answer = { id: 'answer', role: 'user', content: 'JSON', source_message_id: clarification.id,
    structured_data: { input: { action: 'clarify', answers: [fixtures.cases[2].synthetic_user_answer] } } }
  const projected = projectConversation([clarification, answer])
  assert.equal(projected[0].submitted, true)
  assert.deepEqual(projected[0].answers, [fixtures.cases[2].synthetic_user_answer])
  assert.match(projected[1].text, /Which platform\?: Instagram, Use a calm educational tone/)
})

test('legacy text and future envelopes render safely; overlapping pages order by timestamp and id', () => {
  assert.equal(decodeMessage({ role: 'assistant', content: 'old text' }).text, 'old text')
  assert.equal(decodeMessage({ role: 'assistant', structured_data: { schema_version: 8, payload: {} } }).type, 'unsupported')
  assert.equal(decodeMessage({ ...rows[5], structured_data: { ...rows[5].structured_data, render_version: 7 } }).type, 'unsupported')
  assert.deepEqual(mergeMessages([{ id: 'b', created_at: 'same', content: 'old' }], [{ id: 'a', created_at: 'same' }, { id: 'b', created_at: 'same', content: 'new' }]).map((r) => [r.id, r.content]), [['a', undefined], ['b', 'new']])
})

test('operation status outside the loaded message page overrides stale local running state', () => {
  const pending = [{ body: { operation_key: 'key', action: 'send' }, state: 'running' }]
  assert.equal(operationRecords([], [{ operation_key: 'key', state: 'unknown' }], pending)[0].state, 'unknown')
})

test('independent older media attempts stay accessible as previous versions', () => {
  const parent = structuredClone(rows[3])
  const first = { ...structuredClone(rows[4]), source_message_id: parent.id }
  const second = { ...structuredClone(first), id: 'sibling', kind: 'response' }
  const projected = projectConversation([parent, first, second])
  assert.equal(projected.length, 1)
  const video = projected[0].artifacts['content_calendar:0'].video
  assert.equal(video.id, second.id)
  assert.deepEqual(video.previous.map((row) => row.id), [first.id])
})
