export const TONE_SCALES = [
  ['professional', 'Professional', 'Casual'],
  ['authoritative', 'Authoritative', 'Conversational'],
  ['serious', 'Serious', 'Humorous'],
  ['matterOfFact', 'Matter of Fact', 'Enthusiastic'],
]
export const AUDIENCE_FIELDS = [
  ['needs', 'Audience needs'], ['pain_points', 'Pain points'],
  ['common_questions', 'Common questions'], ['explanation_preferences', 'Explanation preferences'],
]
export function audienceCompatible(profile) {
  return AUDIENCE_FIELDS.every(([key]) => profile[key] === undefined ||
    (Array.isArray(profile[key]) && profile[key].every((item) => typeof item === 'string')))
}
export function setAudienceLines(profile, key, value) {
  return { ...profile, [key]: value.split('\n').map((line) => line.trim()).filter(Boolean) }
}
export function promptSuggestions(prompts, offset = 0) {
  return Array.from({ length: Math.min(3, prompts.length) }, (_, index) => prompts[(offset + index) % prompts.length])
}
export function exportDocument(session, messages, source = 'server') {
  const { messages: _messages, operations: _operations, ...metadata } = session
  return { schema_version: 1, exported_at: new Date().toISOString(), source, session: metadata, messages }
}
// Download only after all pages have succeeded. A failed page never returns a partial document.
export async function collectConversationExport(loadPage, id) {
  let page = await loadPage(id), metadata = page
  const rows = new Map(), seen = new Set()
  while (true) {
    for (const row of page.messages) rows.set(row.id, row)
    if (!page.before_cursor) break
    if (seen.has(page.before_cursor)) throw Error('History pagination did not advance. Try exporting again.')
    seen.add(page.before_cursor)
    page = await loadPage(id, page.before_cursor)
  }
  return exportDocument(metadata, [...rows.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)))
}
export function downloadJSON(document, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }))
  const link = globalThis.document.createElement('a')
  link.href = url; link.download = `${name}.json`; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
