// Whitelist publication/brief fields; compliance_flags/advisories are UI metadata.
export function stripReviewNotes(text = '') {
  const lines = []
  let skipping = false
  for (const line of text.split('\n')) {
    if (/^\s*(?:⚠\ufe0f?\s*)?(?:\*\*)?Compliance note(?:\s*\([^\n)]*\))?(?:\*\*)?\s*:/i.test(line)) {
      skipping = true
      continue
    }
    if (skipping) {
      if (!line.trim() || line.includes(' | NMLS #')) skipping = false
      else continue
    }
    lines.push(line)
  }
  return lines.join('\n').trim()
}

function splitDisclosure(text) {
  const clean = stripReviewNotes(text || '')
  const lines = clean.split('\n')
  const start = lines.findIndex((line) => line.includes(' | NMLS #') && line.includes(' | DRE #') && line.includes('Equal Housing Opportunity'))
  return start < 0 ? { body: clean, disclosure: '' } :
    { body: lines.slice(0, start).join('\n').trim(), disclosure: lines.slice(start).join('\n').trim() }
}

const joinCopy = (parts) => parts.filter(Boolean).map(stripReviewNotes).filter(Boolean).join('\n\n')

export function buildPostCopy(post) {
  const script = post.script || {}
  const cta = splitDisclosure(script.cta)
  const body = Array.isArray(script.body) ? script.body.map((slide, index) => `Slide ${index + 2}: ${slide}`).join('\n\n') : script.body
  return joinCopy([script.hook, body, (post.hashtags || []).join(' '), cta.body, cta.disclosure])
}

export function buildCampaignEntryCopy(entry) {
  const caption = splitDisclosure(entry.caption)
  const video = entry.video
  const script = video?.script || {}
  const direction = video?.creative_direction || {}
  const details = video?.quick_details || {}
  return joinCopy([
    caption.body,
    ...(entry.slides || []).map((slide, index) => `Slide ${index + 1}: ${slide}`),
    (entry.hashtags || []).join(' '),
    video && 'SCRIPT',
    ...['intro', 'body', 'cta'].map((key) => script[key]?.text && `${key.toUpperCase()} (${script[key].time || ''}): ${script[key].text}`),
    video && 'CREATIVE DIRECTION',
    ...['setting', 'camera', 'lighting', 'energy', 'background', 'clothing'].map((key) => direction[key] && `${key}: ${direction[key]}`),
    video && 'QUICK DETAILS',
    ...['duration', 'tone', 'call_to_action'].map((key) => details[key] && `${key}: ${details[key]}`),
    caption.disclosure,
  ])
}
