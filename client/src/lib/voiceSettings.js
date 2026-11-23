// Per-conversation voice: the four tone scales. Defaults come from the workspace brand (Settings);
// a conversation stores only the scales that differ. Audience age belongs to the persona (folder).
import { TONE_SCALES } from './legacyRecovery.js'

const validScale = (n) => Number.isInteger(n) && n >= 1 && n <= 5

export function defaultVoice(brand) {
  const tone = {}
  for (const [key] of TONE_SCALES) if (validScale(brand?.tone?.[key])) tone[key] = brand.tone[key]
  return { tone }
}

export function effectiveVoice(defaults, overrides = {}) {
  return { tone: { ...defaults.tone, ...(overrides?.tone || {}) } }
}

// Only differences from the defaults are stored, so later changes to the defaults still flow through.
export function voiceOverrides(defaults, draft) {
  const tone = {}
  for (const [key] of TONE_SCALES) if (validScale(draft.tone?.[key]) && draft.tone[key] !== defaults.tone[key]) tone[key] = draft.tone[key]
  return Object.keys(tone).length ? { tone } : {}
}

export function customVoiceCount(overrides) {
  return Object.keys(overrides?.tone || {}).length
}
