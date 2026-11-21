import { useState } from 'react'
import PersistedMessage from './PersistedMessage.jsx'
import TypingIndicator from './TypingIndicator.jsx'
import { CHOICES, candidateError, candidateMessage, choiceSummary, formatCost, modelName } from '../lib/modelCompare.js'

const button = 'rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed'

// One beta comparison: the prompt, two blind versions side by side, and Lucie's "which is better?" question.
export default function ModelComparison({ item, nmls, onChoose }) {
  const [note, setNote] = useState('')
  const { data, reveal } = item
  const candidates = data?.candidates || []
  const canVote = !!data?.comparison_id && candidates.some((row) => row.response) && !reveal
  return <section aria-label="Model comparison" className="space-y-3">
    <div className="flex justify-end"><p className="max-w-[85%] rounded-2xl bg-imessage-blue text-white px-5 py-3 whitespace-pre-wrap text-sm">{item.prompt}</p></div>
    <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Model comparison · Beta</p>
      {item.status === 'running' && <><p className="text-sm text-slate-700">Lucie is writing two versions with two different models…</p><TypingIndicator /></>}
      {item.status === 'failed' && <p role="alert" className="text-sm text-red-800">{item.error}</p>}
      {candidates.length > 0 && <>
        <p className="text-sm font-medium text-slate-800">Lucie wrote two versions of this. Which one is better?</p>
        <div className="grid gap-4 lg:grid-cols-2">
          {candidates.map((candidate) => <div key={candidate.slot} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-600">Version {candidate.slot}{reveal && <span className="font-normal text-slate-500"> · {modelName(reveal.candidates.find((row) => row.slot === candidate.slot))}</span>}</p>
            {candidate.response
              ? <PersistedMessage message={candidateMessage(candidate, data.comparison_id || 'unsaved')} nmls={nmls} readOnly statusLabel="Not saved to this chat" />
              : <p className="text-sm text-amber-800">{candidateError(candidate.error)}</p>}
          </div>)}
        </div>
        {!data.saved && <p className="text-xs text-amber-800">This comparison could not be logged, so a vote cannot be recorded. Both versions are shown above.</p>}
        {canVote && <div className="space-y-2">
          <label className="block text-xs text-slate-600">Why? (optional)
            <input maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="For example: warmer tone, clearer call to action" className="mt-1 block w-full rounded-lg border px-3 py-1.5 text-sm" />
          </label>
          <div className="flex flex-wrap gap-2">{CHOICES.map((choice) => <button key={choice.value} type="button" className={button} disabled={item.choosing || (choice.value === 'A' || choice.value === 'B' ? !candidates.find((row) => row.slot === choice.value)?.response : false)} onClick={() => onChoose(item, choice.value, note.trim())}>{choice.label}</button>)}</div>
          {item.choiceError && <p role="alert" className="text-xs text-red-700">{item.choiceError}</p>}
        </div>}
        {reveal && <div className="rounded-lg bg-white p-3 text-xs text-slate-600 space-y-1">
          <p className="font-medium text-slate-800">{choiceSummary(reveal.choice, reveal.candidates)} Thanks, your choice is saved.</p>
          {reveal.candidates.map((row) => <p key={row.slot}>Version {row.slot}: {modelName(row)} · {(row.usage?.input_tokens || 0) + (row.usage?.cache_read_input_tokens || 0) + (row.usage?.cache_creation_input_tokens || 0)} tokens in, {row.usage?.output_tokens || 0} out · {formatCost(row.estimated_cost_usd)} · {((row.latency_ms || 0) / 1000).toFixed(1)}s</p>)}
          <p>Estimated cost of this comparison: {formatCost(reveal.estimated_cost_usd)}</p>
        </div>}
      </>}
    </div>
  </section>
}
