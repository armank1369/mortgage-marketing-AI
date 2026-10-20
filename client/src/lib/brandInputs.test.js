import test from 'node:test'
import assert from 'node:assert/strict'
import { addTag, addWritingExample, writingEntries, updateWritingExample, removeWritingExample, writingExamplesError } from './brandInputs.js'
import { validateBrandFields } from './workspaceConfiguration.js'

test('Enter-style tag commits preserve whole phrases and punctuation and ignore duplicate entries', () => {
  const original = ['Accuracy']
  const result = addTag(original, '  Clear, practical advice  ', 'Keywords')
  assert.deepEqual(result, ['Accuracy', 'Clear, practical advice'])
  assert.deepEqual(original, ['Accuracy'])
  assert.equal(addTag(result, 'clear, practical advice'), result)
  assert.equal(addTag(result, '  '), result)
  assert.deepEqual(validateBrandFields({ keywords: result, catchphrases: result, banned_words: result }).keywords, result)
})

test('tag limits use Unicode characters and never silently truncate or discard existing tags', () => {
  assert.equal(addTag([], '🏡'.repeat(200))[0], '🏡'.repeat(200))
  assert.throws(() => addTag([], '🏡'.repeat(201), 'Keywords'), /200 characters/)
  const full = Array.from({ length: 40 }, (_, i) => `Phrase ${i}`)
  assert.throws(() => addTag(full, 'One more', 'Keywords'), /40 tags/)
  assert.equal(addTag(full, 'Phrase 0'), full)
  assert.equal(full.length, 40)
})

test('plain writing examples serialize automatically to the existing API shape', () => {
  const examples = addWritingExample([], '  First paragraph.\n\nSecond paragraph.  ')
  assert.deepEqual(examples, [{ text: 'First paragraph.\n\nSecond paragraph.' }])
  assert.deepEqual(validateBrandFields({ blog_examples: examples }).blog_examples, examples)
  assert.equal(addWritingExample(examples, '  '), examples)
})

test('editing stored string and object samples preserves their shape and extra metadata', () => {
  const original = ['Original string', { title: 'LinkedIn', text: 'Original post', platform: 'linkedin', metadata: { preserve: true } }]
  assert.deepEqual(writingEntries(original).map((row) => row.text), ['Original string', 'Original post'])
  const edited = updateWritingExample(original, 1, 'Updated post')
  assert.equal(edited[1].text, 'Updated post')
  assert.equal(original[1].text, 'Original post')
  assert.deepEqual(edited[1].metadata, { preserve: true })
  assert.equal(updateWritingExample(edited, 0, 'Edited string')[0], 'Edited string')
  assert.equal(edited[1].platform, 'linkedin')
})

test('legacy object-shaped writing data remains an object without clobbering existing keys', () => {
  const original = { linkedin: { text: 'Saved copy', audience: 'Owners' }, custom: { nested: ['Keep this'] }, example_1: 'Existing example' }
  assert.equal(writingEntries(original).find((row) => row.key === 'custom').text, null)
  assert.equal(updateWritingExample(original, 'custom', 'Overwrite'), original)
  const appended = addWritingExample(original, 'New sample')
  assert.deepEqual(appended.example_2, { text: 'New sample' })
  assert.deepEqual(appended.custom, original.custom)
  const edited = updateWritingExample(appended, 'linkedin', 'New LinkedIn copy')
  assert.equal(edited.linkedin.audience, 'Owners')
  assert.equal(edited.linkedin.text, 'New LinkedIn copy')
  assert.equal(removeWritingExample(edited, 'example_2').example_2, undefined)
  assert.equal(removeWritingExample(edited, 'example_2').example_1, 'Existing example')
})

test('writing limits surface plain-language errors and reject additions without changing saved content', () => {
  const full = Array.from({ length: 40 }, () => 'Sample')
  assert.throws(() => addWritingExample(full, 'Another'), /40 writing examples/)
  assert.throws(() => addWritingExample([], 'x'.repeat(8000)), /Shorten an example/)
  assert.doesNotMatch(writingExamplesError(['x'.repeat(8001)]), /JSON/)
  assert.equal(writingExamplesError([{ text: 'Valid sample' }]), '')
  assert.equal(full.length, 40)
  assert.deepEqual(removeWritingExample(['One', 'Two'], 0), ['Two'])
})
