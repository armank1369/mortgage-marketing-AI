import test from 'node:test'
import assert from 'node:assert/strict'
import { parseFilmingSetup } from './filmingSetup.js'

test('reads shot, angle, ring light and window side', () => {
  const s = parseFilmingSetup({
    camera: 'Medium close-up, phone on a tripod slightly above eye level, vertical',
    lighting: 'Ring light in front plus soft daylight from a window on the left',
    setting: 'Home office',
  })
  assert.equal(s.shot, 'medium')
  assert.equal(s.angle, 'high')
  assert.equal(s.keyLight, 'ring')
  assert.equal(s.windowSide, 'left')
  assert.equal(s.tripod, true)
  assert.equal(s.vertical, true)
})

test('close-up handheld with a key light on the right', () => {
  const s = parseFilmingSetup({ camera: 'Tight close-up, handheld selfie style', lighting: 'Softbox key light to the right' })
  assert.equal(s.shot, 'close')
  assert.equal(s.handheld, true)
  assert.equal(s.tripod, false)
  assert.equal(s.keyLight, 'softbox')
  assert.equal(s.keySide, 'right')
  assert.equal(s.windowSide, null)
})

test('a side named for another object does not move the window', () => {
  const s = parseFilmingSetup({ lighting: 'Softbox key light to the right, window behind camera on the left' })
  assert.equal(s.keySide, 'right')
  assert.equal(s.windowSide, 'left')
})

test('wide horizontal shot, defaults when text is vague', () => {
  const s = parseFilmingSetup({ camera: 'Wide shot, landscape 16:9', lighting: 'Bright and even' })
  assert.equal(s.shot, 'wide')
  assert.equal(s.vertical, false)
  assert.equal(s.angle, 'eye')
  assert.equal(s.keyLight, null)
  assert.deepEqual(parseFilmingSetup({}).shot, 'medium')
})
