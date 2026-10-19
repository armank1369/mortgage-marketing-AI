import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { decodeMessage, projectConversation } from './chatSerialization.js'

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, plugins: [{ name: 'step-j-offline-api', enforce: 'pre', load(id) {
  if (id.replaceAll('\\', '/').endsWith('/src/lib/api.js')) return `export const workspaceApi = { send() { throw Error('Unexpected network'); } }; export { apiErrorMessage } from './authenticatedApi.js';`
} }] })
after(() => vite.close())
const { default: Message } = await vite.ssrLoadModule('/src/components/PersistedMessage.jsx')
const { CalendarProvider } = await vite.ssrLoadModule('/src/context/CalendarContext.jsx')
const { WorkspaceDataContext } = await vite.ssrLoadModule('/src/context/WorkspaceData.js')
const { BrowserScopeContext } = await vite.ssrLoadModule('/src/context/BrowserScope.js')
const fixtures = JSON.parse(readFileSync(new URL('../../../docs/fixtures/step_j_v1.json', import.meta.url)))
const rows = fixtures.cases.map((item, i) => ({ id: `m${i}`, role: 'assistant', content: '', compliance_flags: item.compliance_flags,
  structured_data: { ...item, persona_snapshot: fixtures.persona_snapshot } }))
function render(message, overrides = {}) {
  return renderToStaticMarkup(React.createElement(BrowserScopeContext.Provider, { value: '["fake","workspace"]' },
    React.createElement(WorkspaceDataContext.Provider, { value: { brand: { licensed_person_name: 'Synthetic Licensee' } } },
      React.createElement(CalendarProvider, null, React.createElement(Message, { message, nmls: '123456', ...overrides })))))
}

test('real renderers reopen six saved output types with complete text and no transport', () => {
  for (const row of rows) {
    const html = render(decodeMessage(row))
    assert.match(html, /Synthetic education audience/)
    assert.match(html, /Saved/)
    assert.ok(html.length > 300, row.structured_data.type)
  }
  const text = render(decodeMessage(rows[0]))
  assert.match(text, /Synthetic supplemental disclosure/)
  assert.match(text, /Equal Housing Opportunity/)
  const image = render(decodeMessage(rows[5]))
  assert.match(image, /Download PNG/)
  assert.match(image, /Equal Housing Opportunity/)
})

test('linked clarification selections are restored and cannot be resubmitted on reload', () => {
  const source = rows[2]
  const answer = { id: 'answer', role: 'user', source_message_id: source.id, structured_data: { input: { action: 'clarify', answers: [fixtures.cases[2].synthetic_user_answer] } } }
  const html = render(projectConversation([source, answer])[0])
  assert.match(html, /Answers submitted/)
  assert.match(html, /●.*Instagram/s)
  assert.match(html, /disabled=""/)
  assert.doesNotMatch(html, />Continue</)
})

test('history/revisions disable paid controls and show previous versions without losing disclosures', () => {
  const revision = { ...rows[0], id: 'new', kind: 'revision', source_message_id: rows[0].id }
  const html = render(projectConversation([rows[0], revision])[0], { readOnly: true })
  assert.match(html, /Previous versions \(1\)/)
  assert.equal((html.match(/Synthetic supplemental disclosure/g) || []).length, 2)
  assert.doesNotMatch(html, />Regenerate</)
  const localPosts = render({ ...decodeMessage(rows[1]), persona_snapshot: undefined }, { readOnly: true, legacy: true })
  assert.match(localPosts, /Local history/)
  assert.match(localPosts, /disabled=""/)
  assert.doesNotMatch(localPosts, /· Saved/)
})

test('future image versions render an unsupported state without attempting a template', () => {
  const row = { ...rows[5], structured_data: { ...rows[5].structured_data, render_version: 9 } }
  const html = render(decodeMessage(row))
  assert.match(html, /Unsupported saved format/)
  assert.doesNotMatch(html, /Download PNG/)
})
