import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultVoice, effectiveVoice, voiceOverrides, customVoiceCount } from './voiceSettings.js'

const brand = { tone: { professional: 2, serious: 4, matterOfFact: 9, voice: 'Warm' } }
const persona = { audience_profile: { ageRange: [25, 45] } }

test('defaults keep only valid scales and a valid age range', () => {
  assert.deepEqual(defaultVoice(brand, persona), { tone: { professional: 2, serious: 4 }, ageRange: [25, 45] })
  assert.deepEqual(defaultVoice(undefined, { audience_profile: { ageRange: [50, 20] } }), { tone: {}, ageRange: null })
})

test('overrides layer on top of defaults', () => {
  const defaults = defaultVoice(brand, persona)
  assert.deepEqual(effectiveVoice(defaults, { tone: { serious: 1 }, ageRange: [55, 70] }), { tone: { professional: 2, serious: 1 }, ageRange: [55, 70] })
  assert.deepEqual(effectiveVoice(defaults, {}), defaults)
})

test('only differences from the defaults are stored', () => {
  const defaults = defaultVoice(brand, persona)
  const draft = effectiveVoice(defaults, { tone: { serious: 1 } })
  assert.deepEqual(voiceOverrides(defaults, draft), { tone: { serious: 1 } })
  assert.deepEqual(voiceOverrides(defaults, defaults), {})
  assert.deepEqual(voiceOverrides(defaults, { tone: { ...defaults.tone, authoritative: 5 }, ageRange: [22, 32] }), { tone: { authoritative: 5 }, ageRange: [22, 32] })
  assert.deepEqual(voiceOverrides({ tone: {}, ageRange: null }, { tone: { serious: 3 }, ageRange: [30, 40] }), { tone: { serious: 3 }, ageRange: [30, 40] })
  assert.equal(customVoiceCount({ tone: { serious: 1, professional: 5 }, ageRange: [1, 2] }), 3)
  assert.equal(customVoiceCount({}), 0)
})
