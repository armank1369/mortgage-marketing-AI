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
  return bySlot[choice] ? `You picked Version ${choice} (${modelName(bySlot[choice])}).` : ''
}
