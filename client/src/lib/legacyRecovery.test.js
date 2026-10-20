import test from 'node:test'
import assert from 'node:assert/strict'
import { audienceCompatible, setAudienceLines, promptSuggestions, collectConversationExport, exportDocument } from './legacyRecovery.js'
import { validatePersonaFields } from './workspaceConfiguration.js'

test('named audience edits preserve unknown and legacy keys and validate the API contract', () => {
  const original = { needs: ['Old'], ageRange: [35, 60], custom: { detail: 'Preserve' } }
  const audience = setAudienceLines(original, 'needs', 'New need\n\nAnother need')
  assert.deepEqual(audience.needs, ['New need', 'Another need'])
  assert.deepEqual(audience.ageRange, original.ageRange)
  assert.deepEqual(original.needs, ['Old'])
  assert.equal(validatePersonaFields({ audience_profile: audience }).audience_profile, audience)
  assert.equal(audienceCompatible({ needs: { custom: 'shape' } }), false)
  assert.equal(audienceCompatible(original), true)
})

test('suggestions rotate only with an explicit offset and wrap without duplication', () => {
  const prompts = ['a', 'b', 'c', 'd', 'e', 'f']
  assert.deepEqual(promptSuggestions(prompts), ['a', 'b', 'c'])
  assert.deepEqual(promptSuggestions(prompts, 3), ['d', 'e', 'f'])
  assert.deepEqual(promptSuggestions(prompts, 6), ['a', 'b', 'c'])
  assert.deepEqual(promptSuggestions(['a']), ['a'])
})

test('export includes every page and immutable envelopes without operation status metadata', async () => {
  const envelope = { schema_version: 1, payload: { slides: ['One', 'Two'] }, persona_snapshot: { id: 'p' } }
  const row = (id) => ({ id, created_at: `2026-01-0${id}`, structured_data: envelope, compliance_flags: ['review'], source_message_id: 'source' })
  const calls = []
  const result = await collectConversationExport(async (id, cursor) => {
    calls.push([id, cursor]); return { id, operations: [{ state: 'running' }], messages: cursor ? [row('1'), row('2')] : [row('2'), row('3')], before_cursor: cursor ? null : 'older' }
  }, 'chat')
  assert.equal(result.schema_version, 1)
  assert.deepEqual(result.messages.map((r) => r.id), ['1', '2', '3'])
  assert.deepEqual(result.messages[0].structured_data, envelope)
  assert.equal(result.session.operations, undefined)
  assert.equal(calls.length, 2)
  assert.equal(exportDocument({ persona: { ageRange: [35, 60] } }, [], 'local').source, 'local')
})

test('failed or nonadvancing pagination never returns a partial export', async () => {
  await assert.rejects(collectConversationExport(async (_id, cursor) => { if (cursor) throw Error('Unavailable'); return { messages: [], before_cursor: 'older' } }, 'chat'), /Unavailable/)
  await assert.rejects(collectConversationExport(async () => ({ messages: [], before_cursor: 'same' }), 'chat'), /did not advance/)
})
