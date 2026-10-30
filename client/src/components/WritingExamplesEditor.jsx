import { useId, useState } from 'react'
import { addWritingExample, removeWritingExample, updateWritingExample, writingEntries, writingExamplesError } from '../lib/brandInputs.js'

function SavedMaterial({ value }) {
  if (value === null) return <span>Not set</span>
  if (typeof value !== 'object') return <span className="whitespace-pre-wrap break-words">{String(value)}</span>
  return <dl className="space-y-2">{Object.entries(value).map(([key, item]) => <div key={key}><dt className="font-medium">{Array.isArray(value) ? `Sample ${Number(key) + 1}` : key.replaceAll('_', ' ')}</dt><dd className="ml-3"><SavedMaterial value={item} /></dd></div>)}</dl>
}

export default function WritingExamplesEditor({ value, onChange, pending, onPendingChange, disabled = false }) {
  const id = useId()
  const [error, setError] = useState('')
  const storedError = writingExamplesError(value)
  const commit = () => {
    if (disabled) return
    try { onChange(addWritingExample(value, pending)); onPendingChange(''); setError('') }
    catch (err) { setError(err.message) }
  }
  return <section aria-label="Writing examples" className="space-y-3">
    <h3 className="text-sm font-medium text-slate-700">Writing examples</h3>
    <p className="text-xs text-slate-500">Add samples of the captions, posts or articles that sound like your brand.</p>
    {writingEntries(value).map((entry) => <div key={entry.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-3"><h4 className="min-w-0 break-words text-xs font-medium capitalize text-slate-600">{entry.label}</h4>
        {!disabled && <button type="button" aria-label={`Remove writing ${entry.label}`} className="text-xs text-slate-500 hover:text-red-700" onClick={() => { onChange(removeWritingExample(value, entry.key)); setError('') }}>Remove</button>}
      </div>
      {entry.text !== null ? <textarea aria-label={`Writing ${entry.label}`} rows={3} maxLength={8000} disabled={disabled} className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm disabled:text-slate-500" value={entry.text}
        onChange={(event) => { onChange(updateWritingExample(value, entry.key, event.target.value)); setError('') }} /> :
        <div className="text-xs text-slate-600"><SavedMaterial value={entry.original} /><p className="mt-2 text-slate-400">Existing saved material is kept as it is.</p></div>}
    </div>)}
    {!disabled && <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-600">New writing example</label>
      <textarea id={id} aria-label="New writing example" aria-describedby={`${id}-help`} aria-invalid={!!error} rows={3} maxLength={8000} value={pending} placeholder="Paste or write a sample in your preferred voice…"
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-700"
        onChange={(event) => { onPendingChange(event.target.value); setError('') }}
        onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); commit() } }} />
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2"><p id={`${id}-help`} className="text-xs text-slate-500">Press Enter to add. Use Shift+Enter for a new paragraph.</p><button type="button" onClick={commit} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200">Add example</button></div>
    </div>}
    {(error || storedError) && <p role="alert" className="text-xs text-red-700">{error || storedError}</p>}
  </section>
}
