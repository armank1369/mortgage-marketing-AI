import test from 'node:test'
import assert from 'node:assert/strict'
import { sketchEnabled, sketchRequestBody, filledFields, DIRECTION_FIELDS } from './creativeSketch.js'

test('sketch button is off unless the env flag is exactly true', () => {
  assert.equal(sketchEnabled({}), false)
  assert.equal(sketchEnabled({ VITE_CREATIVE_SKETCH_ENABLED: 'false' }), false)
  assert.equal(sketchEnabled({ VITE_CREATIVE_SKETCH_ENABLED: 'TRUE' }), true)
})

test('request body keeps filled fields and drops N/A', () => {
  const body = sketchRequestBody({ setting: ' Kitchen ', camera: 'N/A', clothing: 'n/a.', energy: 'Calm', extra: 'x' },
    { format: 'video', platform: 'Instagram' })
  assert.deepEqual(body, { direction: { setting: 'Kitchen', energy: 'Calm' }, format: 'video', platform: 'Instagram' })
})

test('nothing to draw returns null', () => {
  assert.equal(sketchRequestBody({ setting: 'N/A', camera: '' }), null)
  assert.equal(sketchRequestBody(null), null)
})

test('filledFields lists only fields with real content, numbering is fixed', () => {
  assert.deepEqual([...filledFields({ setting: 'Kitchen', camera: 'N/A', clothing: 'Blazer' })], ['setting', 'clothing'])
  assert.equal(filledFields(null).size, 0)
  assert.deepEqual(DIRECTION_FIELDS.map(([k]) => k), ['setting', 'camera', 'lighting', 'energy', 'background', 'clothing'])
})
