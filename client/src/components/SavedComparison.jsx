import { useState } from 'react'
import PersistedMessage from './PersistedMessage.jsx'
import { workspaceApi } from '../lib/api.js'
import { candidateError, candidateMessage, formatCost, getComparisonDetail, modelName } from '../lib/modelCompare.js'

// Reopens the full record behind a chat message that was saved from a compare-and-combine session:
// both drafts, what the user liked, every combine/adjust round, and the cost.
export default function SavedComparison({ link, nmls, load = (id, signal) => getComparisonDetail(workspaceApi, id, signal) }) {
  const [state, setState] = useState({ status: 'idle' })
  const open = (event) => {
    if (!event.currentTarget.open || state.status !== 'idle') return
    setState({ status: 'loading' })
    load(link.id).then((comparison) => setState({ status: 'ready', comparison }))
      .catch(() => setState({ status: 'error' }))
  }
  const label = link.source === 'combined' ? 'combined from two models' : `Version ${link.source}, picked from two models`
  const { comparison } = state
  return <details onToggle={open} className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
    <summary className="cursor-pointer text-xs font-medium text-violet-800">How this was made ({label})</summary>
    <div className="mt-3 space-y-4 text-xs text-slate-600">
      {state.status === 'loading' && <p>Loading the comparison…</p>}
      {state.status === 'error' && <p role="alert" className="text-amber-800">The comparison details could not be loaded. The saved reply above is unaffected.</p>}
      {comparison && <>
        <div className="grid gap-3 lg:grid-cols-2">
          {comparison.candidates.map((draft) => <div key={draft.slot} className="min-w-0 space-y-2 rounded-lg border border-slate-200 bg-white p-3">
            <p className="font-semibold text-slate-700">Version {draft.slot} · {modelName(draft)} · {formatCost(draft.estimated_cost_usd)}</p>
            {draft.response ? <PersistedMessage message={candidateMessage(draft, comparison.id)} nmls={nmls} readOnly statusLabel="Draft" /> : <p className="text-amber-800">{candidateError(draft.error)}</p>}
            {comparison.feedback?.[draft.slot]?.aspects?.length > 0 && <p>You liked: {comparison.feedback[draft.slot].aspects.join(', ')}</p>}
            {comparison.feedback?.[draft.slot]?.note && <p>Your note: "{comparison.feedback[draft.slot].note}"</p>}
          </div>)}
        </div>
        {comparison.merges.length > 0 && <div className="space-y-1">
          <p className="font-semibold text-slate-700">Combine and adjust rounds</p>
          <ol className="list-decimal space-y-1 pl-5">{comparison.merges.map((round) => <li key={round.round}>
            {round.kind === 'refine' ? 'Adjusted' : 'Combined'}{round.change ? `: "${round.change}"` : ''}{round.error ? ` (${candidateError(round.error)})` : ''} · {formatCost(round.estimated_cost_usd)}
          </li>)}</ol>
        </div>}
        <p>Estimated cost of the whole comparison: {formatCost(comparison.estimated_cost_usd)}</p>
      </>}
    </div>
  </details>
}
