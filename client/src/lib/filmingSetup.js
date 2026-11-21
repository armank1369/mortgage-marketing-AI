// Turns a video brief's creative direction text into a small filming-setup spec that
// FilmingSetupDiagram draws as a stick-figure diagram (camera, tripod, lights, window).
// Prototype: keyword matching on the existing text, so it costs nothing and needs no new
// AI call. The follow-up is to have the model emit this spec directly as structured output.

const has = (text, ...words) => words.some((w) => new RegExp(`\\b${w}`, 'i').test(text))

function sideOf(text, subject) {
  // Prefer "window ... on the left" over "... right, window" so a nearby phrase about a
  // different object does not win.
  const after = text.match(new RegExp(`${subject}[^.;,]{0,40}?\\b(left|right)\\b`, 'i'))
  if (after) return after[1].toLowerCase()
  const before = text.match(new RegExp(`\\b(left|right)\\b[^.;,]{0,25}?${subject}`, 'i'))
  return before ? before[1].toLowerCase() : null
}

export function parseFilmingSetup(direction = {}) {
  const camera = direction.camera || ''
  const lighting = direction.lighting || ''
  const setting = direction.setting || ''
  const all = [camera, lighting, setting, direction.background || ''].join(' ')

  let shot = 'medium'
  if (has(camera, 'extreme close', 'close-up', 'closeup', 'close up', 'tight', 'head and shoulders', 'head-and-shoulders')) shot = 'close'
  if (has(camera, 'medium close', 'chest', 'waist')) shot = 'medium'
  if (has(camera, 'wide', 'full body', 'full-body', 'full length')) shot = 'wide'

  let angle = 'eye'
  if (has(camera, 'slightly above', 'high angle', 'high-angle', 'above eye', 'looking down')) angle = 'high'
  if (has(camera, 'low angle', 'low-angle', 'below eye', 'looking up')) angle = 'low'

  let keyLight = null
  if (has(lighting, 'ring ?light', 'ringlight')) keyLight = 'ring'
  else if (has(lighting, 'softbox', 'key light', 'led panel', 'panel')) keyLight = 'softbox'
  else if (has(lighting, 'lamp')) keyLight = 'lamp'

  const windowLight = has(all, 'window', 'daylight', 'natural light', 'sunlight')
  const windowSide = windowLight ? (sideOf(all, 'window') || sideOf(lighting, 'light') || 'left') : null
  let keySide = 'front'
  if (keyLight && keyLight !== 'ring') keySide = sideOf(lighting, '(?:key|softbox|panel|lamp)') || (windowSide === 'left' ? 'right' : 'left')

  return {
    shot,
    angle,
    keyLight,
    keySide,
    windowSide,
    handheld: has(camera, 'handheld', 'hand-held', 'selfie', 'walking'),
    tripod: !has(camera, 'handheld', 'hand-held', 'selfie') || has(camera, 'tripod'),
    vertical: !has(camera, 'horizontal', 'landscape', '16:9'),
    standing: has(all, 'standing', 'stand ', 'walking', 'walk-and-talk'),
  }
}

export const SHOT_LABELS = { close: 'Close-up (head & shoulders)', medium: 'Medium shot (chest up)', wide: 'Wide shot (full body)' }
export const ANGLE_LABELS = { eye: 'Camera at eye level', high: 'Camera slightly above eye level', low: 'Camera slightly below eye level' }
