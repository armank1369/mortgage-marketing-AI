// Synthetic browser fixture only. The browser runner serves this through a private
// Vite module; production builds never import it. No authentication, DB or AI calls.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import BrandProfileEditor from '../src/components/BrandProfileEditor.jsx'
import PersonaManager from '../src/components/PersonaManager.jsx'
import ChatPage from '../src/pages/ChatPage.jsx'
import { BrowserScopeContext } from '../src/context/BrowserScope.js'
import { WorkspaceAccessContext } from '../src/context/WorkspaceAccess.js'
import { WorkspaceDataContext } from '../src/context/WorkspaceData.js'
import { PreferencesProvider } from '../src/context/PreferencesContext.jsx'
import { CalendarProvider } from '../src/context/CalendarContext.jsx'
import '../src/index.css'
import fixtures from 'virtual:step-j-fixtures'

const dbKey = 'step-j-synthetic-browser-db'
const db = JSON.parse(localStorage.getItem(dbKey) || '{"sessions":{},"messages":{},"results":{},"calls":[]}')
const snapshot = fixtures.persona_snapshot
const save = () => localStorage.setItem(dbKey, JSON.stringify(db))
const reject = (status, error) => Promise.reject(Object.assign(Error(error), { response: { status, data: { error } } }))
const nextTime = () => new Date(Date.now() + db.calls.length * 1000).toISOString()
const presentation = (session) => {
  const messages = db.messages[session.id] || [], persona = db.personas?.find(p => p.id === session.default_persona_id)
  const ids = new Set(messages.map(m=>m.persona_id).filter(Boolean))
  return { ...session, persona_name: persona?.name, preview: messages.find(m=>m.role==='user' && m.structured_data?.input?.action==='send')?.content?.slice(0,180) || '',
    content_types: [...new Set(messages.filter(m=>m.role==='assistant').map(m=>m.structured_data?.type).filter(Boolean))],
    persona_state: ids.size > 1 || [...ids].some(id=>id!==session.default_persona_id) ? 'mixed' : !session.default_persona_id || messages.some(m=>m.role==='assistant' && !m.persona_id) ? 'ambiguous' : persona ? 'available' : 'unavailable' }
}
window.__stepJ = { db, mode: 'text', account: 'account-a', role: 'owner', workspace: 'workspace-a', save }
window.__stepJ.api = { getWorkspace: () => window.__stepJ.workspace, async send(config, { expectedScope }) {
  const [user, workspace] = JSON.parse(expectedScope)
  if (workspace !== window.__stepJ.workspace) return reject(403, "workspace_access_denied")
  const { url, method, data } = config
  db.calls.push({ url, method, data }); save()
  if (url.startsWith('/api/brand-profile') && method === 'PUT') { if(window.__stepJ.failBrand) return reject(503, 'database_unavailable'); db.brand = { ...db.brand, ...data }; save(); return { data: db.brand } }
  if (url.startsWith('/api/personas') && ['PUT', 'POST'].includes(method)) {
    const row = { ...(db.personas || []).find(p => url.endsWith(p.id)), ...data, id: method === 'POST' ? crypto.randomUUID() : url.split('/').at(-1), is_starter: false }
    db.personas = [...(db.personas || []).filter(p => p.id !== row.id), row]; save(); return { data: row }
  }
  if (window.__stepJ.role === 'viewer' && method !== 'GET') return reject(403, 'permission_denied')
  if (!url.startsWith('/api/chat/sessions')) throw Error('Unexpected stateless/provider request')
  const [path] = url.split('?'), parts = path.split('/'), id = parts[4], key = parts[6]
  if (url.includes('?version=2&archived=')) {
    const query = new URLSearchParams(url.split('?')[1]), offset = Number(query.get('cursor') || 0)
    const list = Object.values(db.sessions).filter((s) => s.workspace_id === workspace && !!s.archived_at === (query.get('archived') === 'true')).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    return { data: { sessions: list.slice(offset, offset + 30).map(presentation), next_cursor: list.length > offset + 30 ? String(offset + 30) : null } }
  }
  if (method === 'PUT') {
    if (db.sessions[id] && db.sessions[id].workspace_id !== workspace) return reject(404, 'not_found')
    db.sessions[id] ||= { id, owner: user, created_by_member_id: user, workspace_id: workspace, title: data.title, default_persona_id: data.persona_id, updated_at: nextTime(), etag: '"initial"' }
    db.messages[id] ||= []; save(); return { data: db.sessions[id] }
  }
  const session = db.sessions[id]
  if (!session || session.workspace_id !== workspace) return reject(404, 'not_found')
  db.messages[id] ||= []
  if (method === 'PATCH') {
    if ('default_persona_id' in data && data.default_persona_id !== session.default_persona_id) return reject(409, 'persona_locked')
    if (config.headers['If-Match'] !== session.etag) return reject(412, 'stale_metadata')
    Object.assign(session, data, { etag: JSON.stringify(crypto.randomUUID()), updated_at: nextTime() })
    if ('archived' in data) session.archived_at = data.archived ? nextTime() : null
    save(); return { data: session }
  }
  if (parts[5] === 'operations') {
    if (parts[7] === 'abandon') {
      db.results[key].state = 'abandoned'
      const row = db.messages[id].find((r) => r.structured_data?.input?.operation_key === key)
      row.structured_data.operation.state = 'abandoned'; save(); return { data: db.results[key] }
    }
    if (method !== 'POST') return db.results[key] ? { data: db.results[key] } : reject(404, 'not_found')
    if (db.results[data.operation_key]) return { data: db.results[data.operation_key] }
    if (data.action !== 'shorten' && data.persona_id !== session.default_persona_id) return reject(409, 'persona_locked')
    if (data.retry_of && db.results[data.retry_of]?.state === 'unknown') {
      if (!data.acknowledge_uncertain_outcome) return reject(409, 'uncertain_acknowledgement_required')
      db.results[data.retry_of].state = 'abandoned'
      db.messages[id].find((r) => r.structured_data?.input?.operation_key === data.retry_of).structured_data.operation.state = 'abandoned'
    }
    const state = window.__stepJ.mode === 'unknown' ? 'unknown' : 'succeeded'
    const request = { id: crypto.randomUUID(), author_member_id: user, persona_id: data.persona_id, role: 'user', kind: 'operation', source_message_id: data.source_message_id,
      created_at: nextTime(), content: data.message || data.action,
      structured_data: { schema_version: 1, input: data, operation: { state } } }
    db.messages[id].push(request)
    let response = null
    if (state === 'succeeded') {
      const source = db.messages[id].find((r) => r.id === data.source_message_id)
      let type = data.action === 'social_image' ? 'social_image' : data.action === 'video' ? 'video' : data.action === 'shorten' ? 'text' : window.__stepJ.mode
      if (['clarify', 'regenerate'].includes(data.action)) type = 'text'
      const fixture = fixtures.cases.find((c) => c.type === type) || fixtures.cases[0]
      type = fixture.type
      const payload = structuredClone(fixture.payload)
      if (type === 'campaign') payload.campaign.content_calendar[0].format = 'video'
      if (data.action === 'shorten') payload.response = 'Shortened synthetic text.\n\nSynthetic Licensee | NMLS #123456 | DRE #00123456 | Equal Housing Opportunity'
      response = { id: crypto.randomUUID(), persona_id: data.persona_id || source?.persona_id, role: 'assistant', kind: ['regenerate', 'shorten'].includes(data.action) || ['video', 'social_image'].includes(source?.structured_data?.type) ? 'revision' : 'response',
        source_message_id: data.source_message_id, request_message_id: request.id, content: JSON.stringify(payload), created_at: nextTime(), compliance_flags: fixture.compliance_flags,
        structured_data: { schema_version: 1, type, payload, persona_snapshot: snapshot, ...(type === 'social_image' ? { render_version: 1 } : {}), ...(data.target ? { target: data.target } : {}) } }
      db.messages[id].push(response)
    }
    const result = { operation_key: data.operation_key, action: data.action, state, request_message_id: request.id, response, safe_error_code: state === 'unknown' ? 'provider_outcome_unknown' : null }
    db.results[data.operation_key] = result; session.updated_at = nextTime(); save()
    if (window.__stepJ.holdReply) await new Promise((resolve) => {
      window.__stepJ.releaseReply = () => { window.__stepJ.holdReply = false; resolve() }
    })
    if (window.__stepJ.mode === 'lost') throw Error('Synthetic reply lost after commit')
    return { data: result }
  }
  const query = new URLSearchParams(url.split('?')[1]), before = Number(query.get('before') || db.messages[id].length)
  const messages = db.messages[id].slice(Math.max(0, before - 50), before)
  return { data: { ...presentation(session), messages, before_cursor: before > 50 ? String(before - 50) : null,
    operations: Object.values(db.results).filter((op) => ['running', 'unknown'].includes(op.state) && db.messages[id].some((r) => r.id === op.request_message_id)) } }
} }

function Harness() {
  const [configurationOpen, setConfigurationOpen] = useState(false)
  const [brand, setBrand] = useState(() => db.brand ||= { exists: true, business_name: 'Synthetic Brokerage', nmls_id: '123456', dre_number: '00123456', licensed_person_name: 'Synthetic Licensee', tone: { voice: 'Clear voice', custom: 'Preserve tone' }, values: ['Clarity'] })
  const [personas, setPersonas] = useState(() => db.personas ||= [{ ...snapshot, description: 'An education-focused audience looking for clear mortgage guidance and practical next steps.', audience_profile: { custom: { preserve: true } }, prompt_guidance: 'Explain clearly' }])
  window.__stepJ.openConfiguration = () => setConfigurationOpen(true)
  save()
  const [access, setAccess] = useState({ account: 'account-a', role: 'owner', workspace: 'workspace-a' })
  window.__stepJ.role = access.role
  window.__stepJ.workspace = access.workspace
  window.__stepJ.switchAccount = (account, role = 'owner', workspace = 'workspace-a') => setAccess({ account, role, workspace })
  const scope = JSON.stringify([access.account, access.workspace])
  return React.createElement(BrowserRouter, null,
    React.createElement(BrowserScopeContext.Provider, { key: scope, value: scope },
      React.createElement(WorkspaceAccessContext.Provider, { value: { role: access.role } },
        React.createElement(WorkspaceDataContext.Provider, { value: { brand,
          setBrand(next) { db.brand = next; save(); setBrand(next) }, personas,
          setPersonas(update) { setPersonas((previous) => { const next = typeof update === 'function' ? update(previous) : update; db.personas = next; save(); return next }) },
          canWrite: access.role !== 'viewer', loading: false, error: '', reload() {} } },
          React.createElement(PreferencesProvider, null, React.createElement(CalendarProvider, null,
            configurationOpen ? React.createElement('main', { className: 'p-6' },
              React.createElement('button', { onClick: () => setConfigurationOpen(false) }, 'Back to chat'),
              React.createElement(BrandProfileEditor), React.createElement(PersonaManager)) : React.createElement(ChatPage)))))))
}
createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode, null, React.createElement(Harness)))
