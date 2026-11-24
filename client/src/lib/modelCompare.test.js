import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { aspectsFor, candidateMessage, candidateError, chooseComparison, choiceSummary, combineComparison, formatCost, hasFeedback, planSummary, runComparison, saveRequest, getComparisonDetail } from './modelCompare.js'
import { decodeMessage } from './chatSerialization.js'

const footer = 'Synthetic Licensee | NMLS #123456 | DRE #00123456 | Equal Housing Opportunity'
const textCandidate = { slot: 'A', response: { type: 'text', response: `Plain answer.\n\n${footer}`, compliance_flags: [] } }
const postsCandidate = { slot: 'B', response: { type: 'posts', compliance_flags: [], posts: { posts: [
  { title: 'Docs checklist', platform: 'Instagram', format: 'carousel', script: { hook: 'Get ready.', body: ['Gather pay stubs.'], cta: 'Book a call.' } }] } } }

test('candidates become renderable messages without being marked saved', () => {
  const text = candidateMessage(textCandidate, 'c1')
  assert.equal(text.type, 'text')
  assert.match(text.text, /Plain answer/)
  assert.equal(text.id, 'compare-c1-A')
  const posts = candidateMessage(postsCandidate, 'c1')
  assert.equal(posts.type, 'posts')
  assert.equal(posts.posts.posts[0].title, 'Docs checklist')
})

test('cost and error text', () => {
  assert.equal(formatCost(0.0061), '$0.0061')
  assert.equal(formatCost(1.5), '$1.50')
  assert.equal(formatCost(null), 'not priced')
  assert.match(candidateError('provider_rate_limited'), /busy/)
  assert.match(candidateError('anything_else'), /could not/)
  assert.equal(choiceSummary('B', [{ slot: 'B', model: 'gpt-test' }]), 'You picked Version B (gpt-test).')
  assert.match(choiceSummary('neither'), /neither/)
})

test('requests go to the compare routes with the selected persona', async () => {
  const sent = []
  const api = { send: async (config) => { sent.push(config); return { data: { ok: true } } } }
  await runComparison(api, { message: 'Hi', personaId: 'p1' })
  await chooseComparison(api, 'c1', 'A', '')
  await chooseComparison(api, 'c1', 'B', 'warmer')
  assert.deepEqual(sent.map((row) => [row.method, row.url, row.data]), [
    ['POST', '/api/compare', { message: 'Hi', persona_id: 'p1' }],
    ['POST', '/api/compare/c1/choice', { choice: 'A' }],
    ['POST', '/api/compare/c1/choice', { choice: 'B', note: 'warmer' }],
  ])
})

test('a both-failed comparison resolves with its per-side errors', async () => {
  const body = { error: 'comparison_failed', candidates: [{ slot: 'A', error: 'generation_failed' }] }
  const api = { send: async () => { throw Object.assign(new Error('502'), { response: { data: body } }) } }
  assert.deepEqual(await runComparison(api, { message: 'Hi', personaId: 'p1' }), body)
  const other = { send: async () => { throw new Error('network') } }
  await assert.rejects(runComparison(other, { message: 'Hi', personaId: 'p1' }), /network/)
})

const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, plugins: [{ name: 'offline-api', enforce: 'pre', load(id) {
  if (id.replaceAll('\\', '/').endsWith('/src/lib/api.js')) return `export const workspaceApi = { send() { throw Error('Unexpected network'); } }; export { apiErrorMessage } from './authenticatedApi.js';`
} }] })
after(() => vite.close())
const { default: ModelComparison } = await vite.ssrLoadModule('/src/components/ModelComparison.jsx')
const { default: PersistedMessage } = await vite.ssrLoadModule('/src/components/PersistedMessage.jsx')
const { CalendarProvider } = await vite.ssrLoadModule('/src/context/CalendarContext.jsx')
const { WorkspaceDataContext } = await vite.ssrLoadModule('/src/context/WorkspaceData.js')
const { BrowserScopeContext } = await vite.ssrLoadModule('/src/context/BrowserScope.js')
const renderItem = (item) => renderToStaticMarkup(React.createElement(BrowserScopeContext.Provider, { value: '["fake","workspace"]' },
  React.createElement(WorkspaceDataContext.Provider, { value: { brand: { licensed_person_name: 'Synthetic Licensee' } } },
    React.createElement(CalendarProvider, null, React.createElement(ModelComparison, { item, nmls: '123456', onChoose: noop, onCombine: noop })))))

const both = { comparison_id: 'c1', saved: true, candidates: [textCandidate, postsCandidate] }
const noop = () => {}

test('blind comparison guides the user to tap what they like and hides model names', () => {
  const html = renderItem({ id: '1', prompt: 'Write a post', status: 'done', data: both })
  assert.match(html, /Read both versions and tap what works/)
  assert.match(html, /What do you like about Version A\?/)
  assert.match(html, /Opening hook/)
  assert.match(html, /Combine into one version/)
  assert.match(html, /<button[^>]*disabled=""[^>]*>Combine into one version/)
  assert.match(html, /Use Version B as is/)
  assert.match(html, /Docs checklist/)
  assert.doesNotMatch(html, /claude|gpt/i)
})

test('combined version offers adjustments and shows the rounds cost', () => {
  const merge = { round: 1, kind: 'combine', model: 'claude-sonnet-5-5', estimated_cost_usd: 0.003,
    response: { type: 'text', response: `Combined answer.\n\n${footer}`, compliance_flags: [] } }
  const html = renderItem({ id: '1', prompt: 'Write a post', status: 'done', data: both, merges: [merge], roundsLeft: 7,
    reveal: { choice: 'merged', estimated_cost_usd: 0.0091, candidates: [
      { slot: 'A', model: 'claude-sonnet-5-5', usage: { input_tokens: 1000, output_tokens: 200 }, estimated_cost_usd: 0.004, latency_ms: 2500 },
      { slot: 'B', model: 'gpt-6.1-sol', usage: { input_tokens: 900, output_tokens: 300 }, estimated_cost_usd: 0.0021, latency_ms: 3100 }] } })
  assert.match(html, /Combined version · round 1/)
  assert.match(html, /Combined answer/)
  assert.match(html, /Make it shorter/)
  assert.match(html, /You combined the best of both versions/)
  assert.match(html, /Version B: gpt-6\.1-sol/)
  assert.match(html, /Combine and adjust rounds: 1 · \$0\.0030/)
  assert.doesNotMatch(html, /Combine into one version/)
})

test('after picking one as is, the models and cost are revealed', () => {
  const html = renderItem({ id: '1', prompt: 'Write a post', status: 'done', data: both,
    reveal: { choice: 'A', estimated_cost_usd: 0.0061, candidates: [
      { slot: 'A', model: 'claude-sonnet-5-5', usage: {}, estimated_cost_usd: 0.004 },
      { slot: 'B', model: 'gpt-test', usage: {}, estimated_cost_usd: 0.0021 }] } })
  assert.match(html, /You picked Version A \(claude-sonnet-5-5\)/)
  assert.match(html, /\$0\.0061/)
  assert.doesNotMatch(html, /What do you like about/)
})

test('one failed side shows a friendly error and cannot be used as is', () => {
  const html = renderItem({ id: '1', prompt: 'Hi', status: 'done',
    data: { comparison_id: 'c1', saved: true, candidates: [textCandidate, { slot: 'B', error: 'provider_rate_limited' }] } })
  assert.match(html, /busy right now/)
  assert.match(html, /Use Version A as is/)
  assert.doesNotMatch(html, /Use Version B as is/)
})

test('Lucie reads back the combine plan', () => {
  assert.equal(planSummary({ A: { aspects: ['Opening hook', 'Tone and voice'] }, B: { aspects: ['Call to action'] } }),
    "I'll keep the opening hook and tone and voice from Version A, and the call to action from Version B.")
  assert.equal(planSummary({ B: { aspects: [], note: 'the warmth' } }, 'shorter'),
    "I'll keep what you noted from Version B, and make the change you asked for.")
  assert.equal(planSummary({}, 'make it fun'), "I'll blend the best of both versions, and make the change you asked for.")
  assert.equal(planSummary({}), '')
  assert.equal(hasFeedback({ A: { aspects: [] } }), false)
  assert.equal(hasFeedback({ A: { aspects: ['Hook'] } }), true)
  assert.deepEqual(aspectsFor('clarification'), [])
  assert.ok(aspectsFor('campaign').includes('Posting schedule'))
})

test('combine requests send feedback, change and refine', async () => {
  const sent = []
  const api = { send: async (config) => { sent.push(config); return { data: {} } } }
  await combineComparison(api, 'c1', { feedback: { A: { aspects: ['Hook'] } }, change: 'shorter' })
  await combineComparison(api, 'c1', { refine: true, change: 'warmer' })
  assert.deepEqual(sent.map((row) => [row.url, row.data]), [
    ['/api/compare/c1/combine', { feedback: { A: { aspects: ['Hook'] } }, change: 'shorter', refine: false }],
    ['/api/compare/c1/combine', { change: 'warmer', refine: true }],
  ])
  const failed = { merge: { round: 2, error: 'provider_rate_limited' } }
  const broken = { send: async () => { throw Object.assign(new Error('502'), { response: { data: { error: 'combine_failed', ...failed } } }) } }
  assert.equal((await combineComparison(broken, 'c1', { refine: true, change: 'x' })).merge.error, 'provider_rate_limited')
})

test('the combined version and a picked draft can be saved into the chat', () => {
  const merge = { round: 1, kind: 'combine', response: { type: 'text', response: `Combined answer.\n\n${footer}`, compliance_flags: [] } }
  const combined = renderItem({ id: '1', prompt: 'Write a post', status: 'done', data: both, merges: [merge], roundsLeft: 7,
    reveal: { choice: 'merged', estimated_cost_usd: 0.01, candidates: [] } })
  assert.match(combined, />Save as new Compare chat</)
  assert.match(combined, /in your history and Lucie can build on it/)
  const picked = renderItem({ id: '1', prompt: 'Write a post', status: 'done', data: both,
    reveal: { choice: 'B', estimated_cost_usd: 0.01, candidates: [{ slot: 'A', model: 'm1', usage: {} }, { slot: 'B', model: 'm2', usage: {} }] } })
  assert.match(picked, />Save Version B as new Compare chat</)
  assert.doesNotMatch(renderItem({ id: '1', prompt: 'Write a post', status: 'done', data: both }), /as new Compare chat/)
  assert.match(renderItem({ id: '1', prompt: 'x', status: 'done', data: both, merges: [merge], saveError: 'Could not save the Compare chat. Please try again.' }), /Could not save the Compare chat/)
})

test('saving is an ordinary send carrying the comparison link', () => {
  assert.deepEqual(saveRequest({ prompt: 'Write a post', data: { comparison_id: 'c1' } }, 'combined'),
    { action: 'send', message: 'Write a post', comparison: { id: 'c1', source: 'combined' } })
})

test('a saved message reopens its comparison; ordinary messages do not', () => {
  const row = (extra = {}) => ({ id: 'm1', role: 'assistant', content: '', created_at: '2026-11-22T00:00:00Z', compliance_flags: [],
    structured_data: { schema_version: 1, type: 'text', payload: { response: `Saved answer.\n\n${footer}` }, persona_snapshot: { name: 'Lucie' }, ...extra } })
  const message = decodeMessage(row({ comparison: { id: 'c1', source: 'combined', round: 2 } }))
  assert.deepEqual(message.comparison, { id: 'c1', source: 'combined', round: 2 })
  const html = renderToStaticMarkup(React.createElement(BrowserScopeContext.Provider, { value: '["fake","workspace"]' },
    React.createElement(WorkspaceDataContext.Provider, { value: { brand: {} } },
      React.createElement(CalendarProvider, null, React.createElement(PersistedMessage, { message, nmls: '123456' })))))
  assert.match(html, /How this was made \(combined from two models\)/)
  assert.match(html, /Saved answer/)
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(BrowserScopeContext.Provider, { value: '["fake","workspace"]' },
    React.createElement(WorkspaceDataContext.Provider, { value: { brand: {} } },
      React.createElement(CalendarProvider, null, React.createElement(PersistedMessage, { message: decodeMessage(row()), nmls: '123456' }))))), /How this was made/)
})

test('comparison detail is fetched from its own route', async () => {
  const sent = []
  const api = { send: async (config) => { sent.push(config); return { data: { comparison: { id: 'c1' } } } } }
  assert.deepEqual(await getComparisonDetail(api, 'c1'), { id: 'c1' })
  assert.deepEqual([sent[0].method, sent[0].url], ['GET', '/api/compare/c1'])
})

test('candidateError explains quota and names the failed model', () => {
  assert.match(candidateError('provider_quota', 'gpt-x'), /out of credit.*gpt-x/)
  assert.match(candidateError('provider_busy'), /overloaded/)
})

test('withAnswers uses the chat answers layout and leaves the prompt alone when skipped', async () => {
  const { withAnswers } = await import('./modelCompare.js')
  assert.equal(withAnswers('a post', ''), 'a post')
  assert.equal(withAnswers('a post', '- Platform: Instagram\n'), 'Original request: a post\n\nAnswers:\n- Platform: Instagram')
})

test('askCompareQuestions returns the card, or null when the check fails', async () => {
  const { askCompareQuestions } = await import('./modelCompare.js')
  const card = { questions: [{ question: 'Which platform?', type: 'single', options: ['Instagram'] }] }
  assert.deepEqual(await askCompareQuestions({ send: async () => ({ data: { clarification: card } }) }, { message: 'x' }), card)
  assert.equal(await askCompareQuestions({ send: async () => ({ data: { clarification: null } }) }, { message: 'x' }), null)
  assert.equal(await askCompareQuestions({ send: async () => { throw new Error('boom') } }, { message: 'x' }), null)
})
