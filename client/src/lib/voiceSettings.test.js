import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultVoice, effectiveVoice, voiceOverrides, customVoiceCount } from './voiceSettings.js'

const brand = { tone: { professional: 2, serious: 4, matterOfFact: 9, voice: 'Warm' } }

test('defaults keep only valid scales', () => {
  assert.deepEqual(defaultVoice(brand), { tone: { professional: 2, serious: 4 } })
  assert.deepEqual(defaultVoice(undefined), { tone: {} })
})

test('overrides layer on top of defaults', () => {
  const defaults = defaultVoice(brand)
  assert.deepEqual(effectiveVoice(defaults, { tone: { serious: 1 } }), { tone: { professional: 2, serious: 1 } })
  assert.deepEqual(effectiveVoice(defaults, {}), defaults)
})

test('only differences from the defaults are stored', () => {
  const defaults = defaultVoice(brand)
  assert.deepEqual(voiceOverrides(defaults, effectiveVoice(defaults, { tone: { serious: 1 } })), { tone: { serious: 1 } })
  assert.deepEqual(voiceOverrides(defaults, defaults), {})
  assert.deepEqual(voiceOverrides(defaults, { tone: { ...defaults.tone, authoritative: 5 } }), { tone: { authoritative: 5 } })
  assert.deepEqual(voiceOverrides({ tone: {} }, { tone: { serious: 3 } }), { tone: { serious: 3 } })
  assert.equal(customVoiceCount({ tone: { serious: 1, professional: 5 } }), 2)
  assert.equal(customVoiceCount({}), 0)
})
