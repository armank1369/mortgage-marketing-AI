// Persona folders: every active persona is a folder holding the chats locked to it.
// Server summaries only cover personas that already have chats, so merge them with the
// workspace persona list. Chats whose persona was deleted keep a read-only folder, and
// chats saved without a persona (older imports) land in "Unsorted".
export const UNSORTED_FOLDER = 'none'

export function buildPersonaFolders(personas = [], summaries = []) {
  const byPersona = new Map(summaries.map((row) => [row.persona_id || UNSORTED_FOLDER, row]))
  const time = (row) => (row.last_updated_at ? Date.parse(row.last_updated_at) || 0 : 0)
  const active = personas.map((persona) => {
    const summary = byPersona.get(persona.id)
    return { id: persona.id, name: persona.name, available: true, chat_count: summary?.chat_count || 0, last_updated_at: summary?.last_updated_at || null }
  }).sort((a, b) => time(b) - time(a) || a.name.localeCompare(b.name))
  const known = new Set(personas.map((persona) => persona.id))
  const unavailable = summaries.filter((row) => row.persona_id && !known.has(row.persona_id)).map((row) => ({
    id: row.persona_id, name: row.persona_name || 'Unavailable persona', available: false, chat_count: row.chat_count, last_updated_at: row.last_updated_at || null,
  }))
  const unsorted = byPersona.get(UNSORTED_FOLDER)
  return [...active, ...unavailable, ...(unsorted ? [{ id: UNSORTED_FOLDER, name: 'Unsorted chats', available: false, chat_count: unsorted.chat_count, last_updated_at: unsorted.last_updated_at || null }] : [])]
}

export function folderFor(folders, id) {
  return folders.find((folder) => folder.id === id) || null
}
