import { validateBrandFields } from './workspaceConfiguration.js'

export function addTag(items, pending, label = 'This field') {
  const value = pending.trim()
  if (!value || items.some((item) => item.toLowerCase() === value.toLowerCase())) return items
  if ([...value].length > 200) throw Error(`${label}: keep each word or phrase to 200 characters or fewer.`)
  if (items.length >= 40) throw Error(`${label}: you can add up to 40 tags. Remove one before adding another.`)
  return [...items, value]
}

export function writingEntries(value) {
  return (Array.isArray(value) ? value.map((entry, key) => [key, entry]) : Object.entries(value || {})).map(([key, entry]) => {
    const textKey = entry && !Array.isArray(entry) && typeof entry === 'object'
      ? ['text', 'content', 'example', 'sample', 'body'].find((field) => typeof entry[field] === 'string') : null
    return { key, label: Array.isArray(value) ? `Example ${key + 1}` : key.replaceAll('_', ' '),
      text: typeof entry === 'string' ? entry : textKey ? entry[textKey] : null, textKey, original: entry }
  })
}

export function updateWritingExample(value, key, text) {
  const entry = writingEntries(value).find((item) => item.key === key)
  if (!entry || entry.text === null) return value
  const next = entry.textKey ? { ...entry.original, [entry.textKey]: text } : text
  return Array.isArray(value) ? value.map((item, index) => index === key ? next : item) : { ...value, [key]: next }
}

export function removeWritingExample(value, key) {
  return Array.isArray(value) ? value.filter((_, index) => index !== key) : Object.fromEntries(Object.entries(value).filter(([name]) => name !== key))
}

export function writingExamplesError(value) {
  try { validateBrandFields({ blog_examples: value }); return '' }
  catch { return 'Writing examples have too much saved material. Shorten an example or remove one before saving.' }
}

export function addWritingExample(value, pending) {
  const text = pending.trim()
  if (!text) return value
  const entry = { text }
  let next
  if (Array.isArray(value)) {
    if (value.length >= 40) throw Error('You can save up to 40 writing examples. Remove one before adding another.')
    next = [...value, entry]
  } else {
    if (Object.keys(value).length >= 40) throw Error('Your saved writing samples are full. Remove one before adding another.')
    let index = 1
    while (Object.hasOwn(value, `example_${index}`)) index++
    next = { ...value, [`example_${index}`]: entry }
  }
  const error = writingExamplesError(next)
  if (error) throw Error(error)
  return next
}
