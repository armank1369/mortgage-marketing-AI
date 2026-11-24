// Helpers for the creative direction sketch prototype (see CreativeDirectionSketch.jsx).
const FIELDS = ['setting', 'camera', 'lighting', 'energy', 'background', 'clothing']
// Numbered 1-6 in this order. The same numbers badge the text cards and the matching parts of
// the filming-setup diagram, so each picture element points back at the description it shows.
export const DIRECTION_FIELDS = [
  ['setting', 'Setting'], ['camera', 'Camera'], ['lighting', 'Lighting'],
  ['energy', 'Energy'], ['background', 'Background'], ['clothing', 'Clothing'],
]
const EMPTY = new Set(['', 'N/A', 'NA', 'NONE'])

export function sketchEnabled(env) {
  return String(env?.VITE_CREATIVE_SKETCH_ENABLED || '').toLowerCase() === 'true'
}

// Returns the request body, or null when no direction field has anything worth drawing.
export function sketchRequestBody(direction, { format, platform } = {}) {
  if (!direction || typeof direction !== 'object') return null
  const picked = {}
  for (const field of FIELDS) {
    const value = direction[field]
    if (typeof value === 'string' && !EMPTY.has(value.trim().toUpperCase().replace(/\.$/, ''))) picked[field] = value.trim()
  }
  if (!Object.keys(picked).length) return null
  return { direction: picked, ...(format ? { format } : {}), ...(platform ? { platform } : {}) }
}

export function filledFields(direction) {
  const body = sketchRequestBody(direction)
  return new Set(body ? Object.keys(body.direction) : [])
}
