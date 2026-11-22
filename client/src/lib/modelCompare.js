// Two-model comparison beta. Pure helpers plus thin request wrappers (api is injected for tests).
import { decodeMessage } from './chatSerialization.js'

export const CHOICES = [
  { value: 'A', label: 'Version A is better' },
  { value: 'B', label: 'Version B is better' },
  { value: 'tie', label: 'Both are good' },
  { value: 'neither', label: 'Neither works' },
]

export const getCompareConfig = (api, signal) =>
  api.send({ method: 'GET', url: '/api/compare/config', signal }).then((response) => response.data)

export const runComparison = (api, { message, personaId }, signal) =>
  api.send({ method: 'POST', url: '/api/compare', data: { message, persona_id: personaId }, signal })
    .then((response) => response.data)
    .catch((error) => {
      // Both models failed: the server still answers with the per-side errors.
      if (error?.response?.data?.error === 'comparison_failed') return error.response.data
      throw error
    })

export const chooseComparison = (api, comparisonId, choice, note) =>
  api.send({ method: 'POST', url: `/api/compare/${comparisonId}/choice`, data: { choice, ...(note ? { note } : {}) } })
    .then((response) => response.data)

export const getComparisonDetail = (api, comparisonId, signal) =>
  api.send({ method: 'GET', url: `/api/compare/${comparisonId}`, signal }).then((response) => response.data.comparison)

// The request body that saves a result as a normal exchange in the chat (no AI call).
export const saveRequest = (item, source) => ({ action: 'send', message: item.prompt, comparison: { id: item.data.comparison_id, source } })

export const combineComparison = (api, comparisonId, { feedback, change, refine = false }) =>
  api.send({ method: 'POST', url: `/api/compare/${comparisonId}/combine`,
    data: { ...(feedback ? { feedback } : {}), ...(change ? { change } : {}), refine } })
    .then((response) => response.data)
    .catch((error) => {
      // A failed combine still returns its round (with the error) so the user sees what happened.
      if (error?.response?.data?.error === 'combine_failed') return error.response.data
      throw error
    })

const POST_ASPECTS = ['Opening hook', 'Tone and voice', 'Key message', 'Structure and flow', 'Call to action', 'Length', 'Specific details', 'Hashtags and emojis']
const CAMPAIGN_ASPECTS = ['Overall theme', 'Post ideas', 'Captions', 'Hooks', 'Posting schedule', 'Platform mix', 'Call to action', 'Creative direction']
// The parts of a draft Joseph can say he likes; tuned to what kind of output it is.
export function aspectsFor(type) {
  if (type === 'campaign') return CAMPAIGN_ASPECTS
  if (type === 'clarification') return []
  return POST_ASPECTS
}

export const REFINE_SUGGESTIONS = ['Make it shorter', 'Sound more casual', 'Stronger call to action', 'Add a question to spark comments', 'More personal and local']

const lower = (text) => text.charAt(0).toLowerCase() + text.slice(1)
const list = (items) => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

// Lucie's read-back of the plan before she combines, e.g. "I'll keep the opening hook from Version A and ..."
export function planSummary(feedback = {}, change = '') {
  const parts = ['A', 'B'].map((slot) => {
    const entry = feedback[slot]
    if (!entry?.aspects?.length && !entry?.note?.trim()) return null
    const liked = entry.aspects?.length ? `the ${list(entry.aspects.map(lower))}` : 'what you noted'
    return `${liked} from Version ${slot}`
  }).filter(Boolean)
  if (!parts.length && !change.trim()) return ''
  const keep = parts.length ? `I'll keep ${parts.join(', and ')}` : "I'll blend the best of both versions"
  return `${keep}${change.trim() ? ', and make the change you asked for' : ''}.`
}

export const hasFeedback = (feedback = {}, change = '') => !!change.trim() ||
  ['A', 'B'].some((slot) => feedback[slot]?.aspects?.length || feedback[slot]?.note?.trim())

// Turn one blind candidate into the message shape PersistedMessage renders.
export function candidateMessage(candidate, comparisonId = 'pending') {
  const { type = 'text', compliance_flags: flags = [], ...payload } = candidate.response || {}
  return decodeMessage({
    id: `compare-${comparisonId}-${candidate.slot}`, role: 'assistant', content: '', compliance_flags: flags,
    structured_data: { schema_version: 1, type, payload, persona_snapshot: { name: 'Lucie' } },
  })
}

const ERRORS = {
  provider_rate_limited: 'This model is busy right now.',
  provider_unavailable: 'This model is not available. Check its API key.',
  provider_outcome_unknown: 'This model did not answer in time.',
  invalid_provider_output: 'This model returned a response Lucie could not use.',
}
export const candidateError = (code) => ERRORS[code] || 'This model could not produce a response.'

export function formatCost(usd) {
  if (typeof usd !== 'number' || !Number.isFinite(usd)) return 'not priced'
  if (usd > 0 && usd < 1) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

export function modelName(candidate) {
  return candidate?.model ? `${candidate.model}` : 'Unknown model'
}

export function choiceSummary(choice, candidates = []) {
  const bySlot = Object.fromEntries(candidates.map((row) => [row.slot, row]))
  if (choice === 'tie') return 'You rated both versions as good.'
  if (choice === 'neither') return 'You rated neither version as usable.'
  if (choice === 'merged') return 'You combined the best of both versions.'
  return bySlot[choice] ? `You picked Version ${choice} (${modelName(bySlot[choice])}).` : ''
}
