import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { candidateMessage, candidateError, chooseComparison, choiceSummary, formatCost, runComparison } from './modelCompare.js'

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
const { CalendarProvider } = await vite.ssrLoadModule('/src/context/CalendarContext.jsx')
const { WorkspaceDataContext } = await vite.ssrLoadModule('/src/context/WorkspaceData.js')
const { BrowserScopeContext } = await vite.ssrLoadModule('/src/context/BrowserScope.js')
const render = (item) => renderToStaticMarkup(React.createElement(BrowserScopeContext.Provider, { value: '["fake","workspace"]' },
  React.createElement(WorkspaceDataContext.Provider, { value: { brand: { licensed_person_name: 'Synthetic Licensee' } } },
    React.createElement(CalendarProvider, null, React.createElement(ModelComparison, { item, nmls: '123456', onChoose() {} })))))

test('blind comparison asks which is better and hides model names', () => {
  const html = render({ id: '1', prompt: 'Write a post', status: 'done',
    data: { comparison_id: 'c1', saved: true, candidates: [textCandidate, postsCandidate] } })
  assert.match(html, /Which one is better\?/)
  assert.match(html, /Version A is better/)
  assert.match(html, /Docs checklist/)
  assert.match(html, /Not saved to this chat/)
  assert.doesNotMatch(html, /claude|gpt/i)
})

test('after voting the models, tokens and cost are revealed', () => {
  const html = render({ id: '1', prompt: 'Write a post', status: 'done',
    data: { comparison_id: 'c1', saved: true, candidates: [textCandidate, postsCandidate] },
    reveal: { choice: 'A', estimated_cost_usd: 0.0061, candidates: [
      { slot: 'A', model: 'claude-sonnet-5-5', usage: { input_tokens: 1000, output_tokens: 200 }, estimated_cost_usd: 0.004, latency_ms: 2500 },
      { slot: 'B', model: 'gpt-test', usage: { input_tokens: 900, output_tokens: 300 }, estimated_cost_usd: 0.0021, latency_ms: 3100 }] } })
  assert.match(html, /You picked Version A \(claude-sonnet-5-5\)/)
  assert.match(html, /\$0\.0061/)
  assert.doesNotMatch(html, /Version A is better/)
})

test('one failed side shows a friendly error and cannot be picked', () => {
  const html = render({ id: '1', prompt: 'Hi', status: 'done',
    data: { comparison_id: 'c1', saved: true, candidates: [textCandidate, { slot: 'B', error: 'provider_rate_limited' }] } })
  assert.match(html, /busy right now/)
  assert.match(html, /<button[^>]*disabled=""[^>]*>Version B is better/)
})
