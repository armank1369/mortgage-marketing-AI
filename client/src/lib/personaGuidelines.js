import { AUDIENCE_FIELDS } from './legacyRecovery.js'
import { validateBrandFields, validatePersonaFields } from './workspaceConfiguration.js'

export const INCOME_OPTIONS = ['Under $100k', '$100k-$200k', '$200k-$300k', '$300k-$500k', '$500k+']
export const EDUCATION_OPTIONS = ['High school', 'Some college', "Bachelor's degree", 'Graduate degree']
export function personaInitials(name) {
  return name.trim().split(/\s+/).filter((part) => !/^(the|a|an)$/i.test(part)).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}
export function newPersonaSlug(name) {
  const base = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 75).replace(/-$/g, '') || 'persona'
  const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10)
  return `${base}-${suffix}`
}
export function parseAudience(raw) {
  try { const value = JSON.parse(raw); return value && typeof value === 'object' && !Array.isArray(value) ? value : null } catch { return null }
}
export function validAgeRange(value) {
  return Array.isArray(value) && value.length === 2 && value.every((n) => Number.isInteger(n) && n >= 1 && n <= 100) && value[0] <= value[1]
}
export function guidelinesDraft(persona, brand) {
  const audience = persona.audience_profile || {}
  return { coreValues: [...(brand?.values || [])], tone: { ...brand?.tone },
    audienceRaw: JSON.stringify(audience, null, 2), guidance: persona.prompt_guidance || '',
    audienceLines: Object.fromEntries(AUDIENCE_FIELDS.map(([key]) => [key, Array.isArray(audience[key]) ? audience[key].join('\n') : ''])) }
}
export function guidelinePatches(persona, brand, draft) {
  const audience = parseAudience(draft.audienceRaw)
  if (!audience) throw Error('Enter a valid audience JSON object in advanced settings.')
  const personaPatch = {}, brandPatch = {}
  if (JSON.stringify(audience) !== JSON.stringify(persona.audience_profile || {})) personaPatch.audience_profile = audience
  if (draft.guidance !== (persona.prompt_guidance || '')) personaPatch.prompt_guidance = draft.guidance
  if (JSON.stringify(draft.coreValues) !== JSON.stringify(brand?.values || [])) brandPatch.values = draft.coreValues
  if (JSON.stringify(draft.tone) !== JSON.stringify(brand?.tone || {})) brandPatch.tone = draft.tone
  return { personaPatch: validatePersonaFields(personaPatch), brandPatch: validateBrandFields(brandPatch) }
}
