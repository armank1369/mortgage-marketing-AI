import { useId, useState } from 'react'
import { addTag } from '../lib/brandInputs.js'

export default function TagInput({ label, value, onChange, pending, onPendingChange, disabled = false, placeholder = 'Add a word or phrase' }) {
  const id = useId()
  const [error, setError] = useState('')
  const commit = () => {
    if (disabled) return
    try { onChange(addTag(value, pending, label)); onPendingChange(''); setError('') }
    catch (err) { setError(err.message) }
  }
  return <div className="space-y-1.5">
    <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
    <div className={`rounded-lg border p-2 ${disabled ? 'border-slate-200 bg-slate-50' : 'border-slate-300 bg-white focus-within:border-sky-700 focus-within:ring-1 focus-within:ring-sky-700'}`}>
      {!!value.length && <ul aria-label={`${label} tags`} className="mb-2 flex flex-wrap gap-1.5">
        {value.map((item, index) => <li key={index} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-sky-100 bg-sky-50 py-1 pl-2.5 pr-1 text-xs text-sky-900">
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">{item}</span>
          {!disabled && <button type="button" aria-label={`Remove ${label}: ${item}`} onClick={() => { onChange(value.filter((_, i) => i !== index)); setError('') }} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-sky-700 hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700">×</button>}
        </li>)}
      </ul>}
      <div className="flex items-center gap-2">
        <input id={id} aria-label={label} aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`} aria-invalid={!!error} value={pending} disabled={disabled}
          className="min-w-0 flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-slate-400 disabled:cursor-not-allowed" placeholder={disabled ? '' : placeholder}
          onChange={(event) => { onPendingChange(event.target.value); setError('') }}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); commit() } }} />
        {!disabled && <button type="button" aria-label={`Add ${label}`} onClick={commit} className="shrink-0 rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200">Add</button>}
      </div>
    </div>
    <p id={`${id}-help`} className="text-xs text-slate-500">{disabled ? `${value.length} saved tags` : `Type a word or phrase, then press Enter or Add. ${value.length}/40 tags.`}</p>
    {error && <p id={`${id}-error`} role="alert" className="text-xs text-red-700">{error}</p>}
  </div>
}
