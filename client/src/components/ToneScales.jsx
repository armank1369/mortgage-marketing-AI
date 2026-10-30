import { TONE_SCALES } from '../lib/legacyRecovery.js'

export default function ToneScales({ value = {}, onChange, disabled = false }) {
  return <div className="space-y-5">{TONE_SCALES.map(([key, low, high]) => {
    const selected = Number.isInteger(value[key]) && value[key] >= 1 && value[key] <= 5 ? value[key] : null
    const label = `${low} to ${high}`
    const change = (next) => onChange(key, next)
    return <div key={key} className="relative">
      <div className="mb-1.5 flex justify-between text-xs font-medium text-slate-600 sm:hidden"><span>{low}</span><span>{high}</span></div>
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="hidden w-32 shrink-0 text-xs font-medium text-slate-600 sm:inline">{low}</span>
        <div role="radiogroup" aria-label={label} className="flex flex-1 justify-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-label={`${label}: ${n}`} aria-checked={selected === n}
            disabled={disabled} tabIndex={selected === n || (!selected && n === 1) ? 0 : -1}
            onClick={() => change(n)} onKeyDown={(event) => {
              const next = ({ ArrowRight: Math.min(n + 1, 5), ArrowDown: Math.min(n + 1, 5), ArrowLeft: Math.max(n - 1, 1), ArrowUp: Math.max(n - 1, 1), Home: 1, End: 5 })[event.key]
              if (next) { event.preventDefault(); change(next); event.currentTarget.parentElement.querySelectorAll('[role="radio"]')[next - 1].focus() }
            }}
            className={`h-9 w-9 shrink-0 rounded-lg border-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed ${selected === n ? 'border-slate-900 bg-slate-900 text-white shadow-md shadow-slate-900/20' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400'}`}>
            {n}
          </button>)}
        </div>
        <span className="hidden w-32 shrink-0 text-right text-xs font-medium text-slate-600 sm:inline">{high}</span>
      </div>
      <div className="absolute -bottom-4 inset-x-0 text-center text-[10px] text-slate-400">
        {selected ? <button type="button" disabled={disabled} aria-label={`Clear ${label}`} className="hover:text-slate-700 disabled:cursor-not-allowed" onClick={() => change(undefined)}>Clear selection</button> : value[key] === undefined ? 'Not set' : 'Custom stored setting preserved'}
      </div>
    </div>
  })}</div>
}
