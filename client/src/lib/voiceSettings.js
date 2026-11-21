// Per-conversation voice: tone scales and target age range. Defaults come from the workspace
// brand (tone) and the folder's persona (ageRange); a conversation stores only what differs.
import { TONE_SCALES } from './legacyRecovery.js'
import { validAgeRange } from './personaGuidelines.js'

const validScale = (n) => Number.isInteger(n) && n >= 1 && n <= 5

export function defaultVoice(brand, persona) {
  const tone = {}
  for (const [key] of TONE_SCALES) if (validScale(brand?.tone?.[key])) tone[key] = brand.tone[key]
  const age = persona?.audience_profile?.ageRange
  return { tone, ageRange: validAgeRange(age) ? [...age] : null }
}

export function effectiveVoice(defaults, overrides = {}) {
  return { tone: { ...defaults.tone, ...(overrides?.tone || {}) }, ageRange: overrides?.ageRange || defaults.ageRange || null }
}

// Only differences from the defaults are stored, so later changes to the defaults still flow through.
export function voiceOverrides(defaults, draft) {
  const result = {}
  const tone = {}
  for (const [key] of TONE_SCALES) if (validScale(draft.tone?.[key]) && draft.tone[key] !== defaults.tone[key]) tone[key] = draft.tone[key]
  if (Object.keys(tone).length) result.tone = tone
  const age = draft.ageRange
  if (validAgeRange(age) && (!defaults.ageRange || age[0] !== defaults.ageRange[0] || age[1] !== defaults.ageRange[1])) result.ageRange = [...age]
  return result
}

export function customVoiceCount(overrides) {
  return Object.keys(overrides?.tone || {}).length + (overrides?.ageRange ? 1 : 0)
}
