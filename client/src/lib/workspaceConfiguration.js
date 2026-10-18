// All configuration/generation requests reject stale scope both before and after transport.
export async function scopedRequest(api, scope, signal, url, method = 'GET', data) {
  const canceled = () => Object.assign(new Error('Workspace access changed. Please try again.'), { code: 'ERR_CANCELED' })
  if (!scope || signal?.aborted) throw canceled()
  const [userId, workspaceId] = JSON.parse(scope)
  if (!userId || !workspaceId) throw canceled()
  const response = await api.send({ url, method, data, signal }, { expectedScope: scope })
  if (signal?.aborted || api.getWorkspace(userId) !== workspaceId) throw canceled()
  return response.data
}

export const isDatabasePersona = (persona) => typeof persona?.id === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(persona.id)

export function selectDatabasePersona(preferences, persona) {
  if (!isDatabasePersona(persona)) throw new Error('Select a saved workspace persona.')
  const previous = preferences?.persona
  const legacyPersonas = [...(preferences?.legacyPersonas || [])]
  if (previous && !isDatabasePersona(previous) && !legacyPersonas.some((item) => JSON.stringify(item) === JSON.stringify(previous))) {
    legacyPersonas.push(previous)
  }
  return { ...preferences, persona, legacyPersonas }
}

const length = (text) => [...text].length
const text = (value, limit, required = false, singleLine = false) => {
  if (typeof value !== 'string' || length(value.trim()) > limit || (required && !value.trim()) ||
      [...value].some((char) => char.codePointAt(0) < 32 && !'\n\r\t'.includes(char)) ||
      (singleLine && /[\r\n\t\u2028\u2029]/.test(value))) throw new Error('Check the field type, required text and length limit.')
  return value.trim()
}

function boundedJson(value, expected, limit) {
  if (value === null || !expected(value)) throw new Error('Enter the indicated JSON object or array.')
  function check(node, depth = 0) {
    if (depth > 4) throw new Error('JSON can be at most four levels deep.')
    if (Array.isArray(node) || (node && typeof node === 'object')) {
      if (Object.keys(node).length > 40) throw new Error('Use at most 40 entries per JSON container.')
      for (const [key, item] of Object.entries(node)) {
        if (!Array.isArray(node)) text(key, 100, true)
        check(item, depth + 1)
      }
    } else if (typeof node === 'string') text(node, limit)
    else if (typeof node === 'number' && !Number.isFinite(node)) throw new Error('Use finite JSON numbers.')
  }
  check(value)
  // Match Python json.dumps separators/ensure_ascii=False for shared size limits.
  const encode = (node) => Array.isArray(node) ? `[${node.map(encode).join(', ')}]` :
    object(node) ? `{${Object.entries(node).map(([key, item]) => `${JSON.stringify(key)}: ${encode(item)}`).join(', ')}}` : JSON.stringify(node)
  const encoded = encode(value)
  if (length(encoded) > limit) throw new Error(`JSON must contain at most ${limit} characters.`)
  return value
}
const object = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
export function validateBrandFields(fields) {
  const result = {}
  for (const [key, value] of Object.entries(fields)) {
    if (['values', 'keywords', 'catchphrases', 'banned_words'].includes(key)) {
      if (!Array.isArray(value) || value.length > 40) throw new Error('Use at most 40 lines, with 200 characters per line.')
      result[key] = value.map((item) => text(item, 200)).filter(Boolean)
    } else if (['tone', 'blog_examples'].includes(key)) {
      result[key] = boundedJson(value, key === 'tone' ? object : (item) => object(item) || Array.isArray(item), key === 'tone' ? 4000 : 8000)
    } else {
      const limits = { business_name: 100, licensed_person_name: 100, nmls_id: 20, dre_number: 20, compliance_footer: 1000, equal_housing_text: 500 }
      if (!(key in limits)) throw new Error('Unsupported brand field.')
      result[key] = text(value, limits[key], key === 'business_name', !['compliance_footer', 'equal_housing_text'].includes(key))
      if (['nmls_id', 'dre_number'].includes(key) && result[key] && (!/^[0-9]{1,20}$/.test(result[key]) || /^0+$/.test(result[key]))) {
        throw new Error('License identifiers must contain 1–20 digits and cannot be all zeros.')
      }
    }
  }
  return result
}

export function validatePersonaFields(fields) {
  const limits = { slug: 100, name: 200, description: 2000, prompt_guidance: 4000 }
  const result = {}
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'audience_profile') result[key] = boundedJson(value, object, 4000)
    else {
      if (!(key in limits)) throw new Error('Unsupported persona field.')
      result[key] = text(value, limits[key], ['slug', 'name'].includes(key), ['slug', 'name'].includes(key))
      if (key === 'slug' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result[key])) throw new Error('Use a lowercase slug with words separated by hyphens.')
    }
  }
  return result
}
