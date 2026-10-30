// Rendering projections only. The server envelope remains the persistence authority.
export function decodeMessage(row) {
  const envelope = row.structured_data
  const base = { ...row, text: row.content || '', createdAt: row.created_at, previous: [], artifacts: {} }
  if (row.role !== 'assistant') return { ...base, type: 'text' }
  if (!envelope?.schema_version) return { ...base, type: 'text' }
  if (envelope.schema_version !== 1 || !['text', 'posts', 'campaign', 'clarification', 'video', 'social_image'].includes(envelope.type) ||
      (envelope.type === 'social_image' && envelope.render_version !== 1)) return { ...base, type: 'unsupported' }
  return { ...base, ...envelope.payload, type: envelope.type,
    text: envelope.type === 'text' ? envelope.payload?.response || '' : base.text,
    persona_snapshot: envelope.persona_snapshot, target: envelope.target }
}

export function mergeMessages(previous, incoming) {
  return [...new Map([...previous, ...incoming].map((row) => [row.id, row])).values()]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

// Link revisions and artifacts without rewriting any original publication payload.
export function projectConversation(rows) {
  const decoded = rows.map(decodeMessage)
  const byId = new Map(decoded.map((row) => [row.id, row]))
  const hidden = new Set()
  for (const row of decoded) {
    if (row.role === 'user' && row.structured_data?.input?.action === 'clarify') {
      const source = byId.get(row.source_message_id || row.structured_data.input.source_message_id)
      if (source) { source.submitted = true; source.answers = row.structured_data.input.answers }
      row.text = 'Clarification answers:\n' + row.structured_data.input.answers.map((answer) => {
        const question = source?.clarification?.questions?.[answer.question_index]?.question || `Question ${answer.question_index + 1}`
        return `${question}: ${[...answer.selected, answer.custom].filter(Boolean).join(', ') || 'No preference'}`
      }).join('\n')
    }
    if (row.kind === 'revision' && byId.has(row.source_message_id)) hidden.add(row.source_message_id)
  }
  function ancestors(row, seen = new Set()) {
    if (seen.has(row.id)) return []
    seen.add(row.id)
    const prior = row.kind === 'revision' && byId.get(row.source_message_id)
    return prior ? [prior, ...ancestors(prior, seen)] : []
  }
  for (const row of decoded) row.previous = ancestors(row)
  for (const row of decoded) {
    if (!['video', 'social_image'].includes(row.type) || hidden.has(row.id)) continue
    const root = row.previous.at(-1) || row
    const parent = byId.get(root.source_message_id)
    if (parent && row.target) {
      const locator = `${row.target.collection}:${row.target.index}`
      parent.artifacts[locator] ||= {}
      const previous = parent.artifacts[locator][row.type]
      if (previous && previous.id !== row.id) {
        // Older releases allowed two initial attempts from the same parent/item.
        // Keep those immutable siblings visible under the latest artifact's versions.
        row.previous = [...new Map([...row.previous, previous, ...previous.previous]
          .filter((prior) => prior.id !== row.id).map((prior) => [prior.id, prior])).values()]
      }
      parent.artifacts[locator][row.type] = row
      hidden.add(row.id)
    }
  }
  return decoded.filter((row) => !hidden.has(row.id))
}

export function operationRecords(messages, active = [], pending = []) {
  const records = new Map()
  for (const row of messages) {
    const { input, operation } = row.structured_data || {}
    if (row.role === 'user' && input?.operation_key && operation) records.set(input.operation_key,
      { ...operation, ...input, input, request_message_id: row.id })
  }
  for (const row of pending) records.set(row.body.operation_key, { ...records.get(row.body.operation_key),
    operation_key: row.body.operation_key, action: row.body.action, input: row.body,
    state: row.state || records.get(row.body.operation_key)?.state || 'checking' })
  for (const row of active) records.set(row.operation_key, { ...records.get(row.operation_key), ...row })
  return [...records.values()]
}
