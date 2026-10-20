import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

// Render actual JSX through installed Vite, with Auth/transport replaced before
// module evaluation. No listener, browser session, Neon connection or provider.
const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  plugins: [{ name: 'step-i-synthetic-api', enforce: 'pre', load(id) {
    if (id.replaceAll('\\', '/').endsWith('/src/lib/api.js')) return `
      export const workspaceApi = { send() { throw new Error('Unexpected network'); } };
      export { apiErrorMessage } from './authenticatedApi.js';
    `
  } }],
})
after(() => server.close())
const { BrowserScopeContext } = await server.ssrLoadModule('/src/context/BrowserScope.js')
const { WorkspaceDataContext } = await server.ssrLoadModule('/src/context/WorkspaceData.js')
const { default: BrandEditor } = await server.ssrLoadModule('/src/components/BrandProfileEditor.jsx')
const { default: PersonaManager } = await server.ssrLoadModule('/src/components/PersonaManager.jsx')
const { default: templates } = await server.ssrLoadModule('/src/components/socialImage/templates.jsx')
const { default: ComplianceNotice } = await server.ssrLoadModule('/src/components/ComplianceNotice.jsx')
const brand = { exists: true, business_name: 'Synthetic Brokerage', licensed_person_name: 'Synthetic Licensee', nmls_id: '123456', dre_number: '00123456',
  tone: { voice: 'Warm' }, values: ['Accuracy'], keywords: [], catchphrases: [], banned_words: [], blog_examples: [], compliance_footer: '', equal_housing_text: '' }
const personas = [{ id: '11111111-1111-4111-8111-111111111111', name: 'Education', slug: 'education', description: 'Clear process' }]
function render(Component, { canWrite = false, ...overrides } = {}, props = {}) {
  return renderToStaticMarkup(React.createElement(BrowserScopeContext.Provider, { value: JSON.stringify(['synthetic', 'workspace']) },
    React.createElement(WorkspaceDataContext.Provider, { value: { brand, personas, canWrite, loading: false, error: '', ...overrides } },
      React.createElement(Component, props))))
}

test('actual Settings editor renders all approved fields and blocks read-only saves', () => {
  const readonly = render(BrandEditor)
  assert.match(readonly, /<fieldset disabled=""/)
  assert.doesNotMatch(readonly, /Save brand profile/)
  const editable = render(BrandEditor, { canWrite: true })
  assert.doesNotMatch(editable, /<fieldset disabled=""/)
  for (const label of ['Business name', 'Licensed person', 'NMLS identifier', 'DRE identifier', 'Tone of voice', 'Values',
    'Keywords', 'Catchphrases', 'Banned words', 'Writing examples', 'Supplemental disclosure', 'Supplemental equal-housing text']) {
    assert.ok(editable.includes(label), label)
  }
  assert.match(editable, /Synthetic Licensee/)
  assert.match(editable, /00123456/)
  assert.match(editable, /Save brand profile/)
})

test('review notices render separately as UI metadata, omitting mechanical footer repairs', () => {
  const html = renderToStaticMarkup(React.createElement(ComplianceNotice, { flags: [
    'possible_fair_housing_language', 'possible_fair_housing_language', 'possible_respa_review', 'missing_or_altered_footer'] }))
  assert.match(html, /role="note"/)
  assert.match(html, /Human review required/)
  assert.match(html, /RESPA/)
  assert.equal((html.match(/fair-housing-sensitive/g) || []).length, 1)
  assert.doesNotMatch(html, /missing_or_altered_footer/)
  assert.equal(renderToStaticMarkup(React.createElement(ComplianceNotice, { flags: ['missing_or_altered_footer'] })), '')
})

test('missing brand profile offers an actionable error without a false usable save', () => {
  const html = render(BrandEditor, { canWrite: true, brand: { ...brand, exists: false } })
  assert.match(html, /No brand profile exists/)
  assert.match(html, /<fieldset disabled=""/)
})

test('persona onboarding renders saved choices while read-only users cannot create/edit', () => {
  const html = render(PersonaManager, {}, { onSelect() {} })
  assert.match(html, /Select persona/)
  assert.match(html, /Education/)
  assert.doesNotMatch(html, /aria-label="Edit Education"/)
  assert.doesNotMatch(html, /New persona/)
  const editable = render(PersonaManager, { canWrite: true })
  assert.match(editable, /New persona/)
  assert.match(editable, /aria-label="Edit Education"/)
})

test('legacy persona transition remains explicit and does not present an automatic mapping', () => {
  const html = render(PersonaManager, { canWrite: true }, { legacyPersona: { id: 'custom-123', name: 'Local audience' } })
  assert.match(html, /preserved locally/)
  assert.match(html, /Select a workspace persona explicitly/)
  assert.match(html, /Review a copy in this workspace/)
})

test('all six real social-image templates render server identity and complete disclosures', () => {
  const footer = 'Synthetic Licensee | NMLS #123456 | DRE #00123456 | Equal Housing Opportunity'
  assert.equal(Object.keys(templates).length, 6)
  for (const [name, Template] of Object.entries(templates)) {
    const html = renderToStaticMarkup(React.createElement(Template, { slots: { tips: [], items: [], quote: 'Education' }, footer, businessName: brand.business_name }))
    assert.ok(html.includes(footer), name)
    assert.ok(html.includes('Synthetic Brokerage'), name)
    assert.doesNotMatch(html, /Joseph|000000|LUCENT/)
  }
})
