// Helpers for the creative direction sketch prototype (see CreativeDirectionSketch.jsx).
const FIELDS = ['setting', 'camera', 'lighting', 'energy', 'background', 'clothing']
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
