import { useState } from 'react'
import PersistedMessage from './PersistedMessage.jsx'
import TypingIndicator from './TypingIndicator.jsx'
import ClarificationResponse from './ClarificationResponse.jsx'
import {
  REFINE_SUGGESTIONS, aspectsFor, candidateError, candidateMessage, choiceSummary, formatCost, hasFeedback, modelName, planSummary,
} from '../lib/modelCompare.js'

const button = 'rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed'
const primary = 'rounded-full bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-40 disabled:cursor-not-allowed'
const chip = (on) => `rounded-full border px-3 py-1 text-xs transition-colors ${on ? 'border-violet-600 bg-violet-600 text-white hover:bg-violet-700' : 'border-slate-300 bg-white text-slate-700 hover:border-violet-400'}`

function Step({ number, title, done, children }) {
  return <div className="space-y-3">
    <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${done ? 'bg-emerald-600 text-white' : 'bg-violet-100 text-violet-800'}`}>{done ? '✓' : number}</span>{title}
    </p>
    {children}
  </div>
}

function LucieSays({ children }) {
  return <p className="rounded-xl rounded-tl-sm bg-white px-4 py-3 text-sm text-slate-700 shadow-sm"><span className="font-semibold text-violet-800">Lucie: </span>{children}</p>
}

// One beta comparison, as a guided flow: read both drafts, say what works in each, let Lucie
// combine them, then keep adjusting the combined version until it is ready to copy.
export default function ModelComparison({ item, nmls, onChoose, onAnswer = () => {}, onCombine, onSave, canSave = true }) {
  const [feedback, setFeedback] = useState({ A: { aspects: [], note: '' }, B: { aspects: [], note: '' } })
  const [change, setChange] = useState('')
  const [adjust, setAdjust] = useState('')
  const { data, reveal } = item
  const candidates = data?.candidates || []
  const merges = item.merges || []
  const latest = [...merges].reverse().find((round) => round.response)
  const usable = candidates.filter((row) => row.response)
  const canAct = !!data?.comparison_id && usable.length > 0
  const picked = reveal && ['A', 'B', 'tie', 'neither'].includes(reveal.choice)
  const busy = item.choosing || item.combining || item.saving
  const toggle = (slot, aspect) => setFeedback((previous) => {
    const aspects = previous[slot].aspects.includes(aspect) ? previous[slot].aspects.filter((a) => a !== aspect) : [...previous[slot].aspects, aspect]
    return { ...previous, [slot]: { ...previous[slot], aspects } }
  })
  const note = (slot, value) => setFeedback((previous) => ({ ...previous, [slot]: { ...previous[slot], note: value } }))
  const plan = planSummary(feedback, change)
  const refine = (text) => { if (text.trim()) { onCombine(item, { refine: true, change: text.trim() }); setAdjust('') } }

  return <section aria-label="Model comparison" className="space-y-3">
    <div className="flex justify-end"><p className="max-w-[85%] rounded-2xl bg-imessage-blue text-white px-5 py-3 whitespace-pre-wrap text-sm">{item.prompt}</p></div>
    <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 space-y-5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Compare and combine · Beta</p>
      {item.status === 'checking' && <><LucieSays>Let me check whether I need anything from you before I write…</LucieSays><TypingIndicator /></>}
      {item.status === 'asking' && <>
        <LucieSays>A few quick questions first, so both versions come out right.</LucieSays>
        <ClarificationResponse data={item.clarification} onSubmit={(text) => onAnswer(item, text)} />
        <button type="button" className={button} onClick={() => onAnswer(item, '')}>Skip the questions and use your best guess</button>
      </>}
      {item.status === 'running' && <><LucieSays>I'm writing two versions with two different AI models so you can take the best of each…</LucieSays><TypingIndicator /></>}
      {item.status === 'failed' && <p role="alert" className="text-sm text-red-800">{item.error}</p>}

      {candidates.length > 0 && <>
        <Step number={1} title="Read both versions and tap what works" done={merges.length > 0 || picked}>
          {!merges.length && !picked && <LucieSays>Here are two takes on your request. Under each one, tap the parts you like. You can mix and match, and I'll combine them into one version for you.</LucieSays>}
          <div className="grid gap-4 lg:grid-cols-2">
            {candidates.map((candidate) => {
              const options = aspectsFor(candidate.response?.type)
              const mine = feedback[candidate.slot]
              return <div key={candidate.slot} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                <p className="text-xs font-semibold text-slate-600">Version {candidate.slot}{reveal && <span className="font-normal text-slate-500"> · {modelName(reveal.candidates.find((row) => row.slot === candidate.slot))}</span>}</p>
                {candidate.response
                  ? <PersistedMessage message={candidateMessage(candidate, data.comparison_id || 'unsaved')} nmls={nmls} readOnly statusLabel="Draft" />
                  : <p className="text-sm text-amber-800">{candidateError(candidate.error, candidate.failed_model)}</p>}
                {candidate.response && canAct && !merges.length && !picked && options.length > 0 && <fieldset className="space-y-2 border-t border-slate-100 pt-3">
                  <legend className="text-xs font-medium text-slate-700">What do you like about Version {candidate.slot}?</legend>
                  <div className="flex flex-wrap gap-1.5">{options.map((aspect) => <button key={aspect} type="button" aria-pressed={mine.aspects.includes(aspect)} className={chip(mine.aspects.includes(aspect))} onClick={() => toggle(candidate.slot, aspect)}>{aspect}</button>)}</div>
                  <input aria-label={`Notes on Version ${candidate.slot}`} maxLength={1000} value={mine.note} onChange={(event) => note(candidate.slot, event.target.value)} placeholder="Anything specific? e.g. the line about knowing your numbers" className="block w-full rounded-lg border px-3 py-1.5 text-sm" />
                </fieldset>}
              </div>
            })}
          </div>
        </Step>

        {!data.saved && <p className="text-xs text-amber-800">This comparison could not be logged, so Lucie can't combine it or record a choice. Both versions are shown above.</p>}

        {canAct && !merges.length && !picked && <Step number={2} title="Tell Lucie what the final version needs">
          <input aria-label="What should the final version change" maxLength={1000} value={change} onChange={(event) => setChange(event.target.value)} placeholder="Optional: anything to change? e.g. keep it under 80 words, mention first-time buyers" className="block w-full rounded-lg border px-3 py-2 text-sm" />
          {plan ? <LucieSays>{plan} Ready when you are.</LucieSays> : <p className="text-xs text-slate-500">Tap at least one thing you like, or describe what you want, and Lucie will combine them.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={primary} disabled={busy || !hasFeedback(feedback, change)} onClick={() => onCombine(item, { feedback, change: change.trim() }, plan)}>{item.combining ? 'Combining…' : 'Combine into one version'}</button>
            <span className="text-xs text-slate-500">or, if one is already right:</span>
            {usable.map((row) => <button key={row.slot} type="button" className={button} disabled={busy} onClick={() => onChoose(item, row.slot, '')}>Use Version {row.slot} as is</button>)}
            <button type="button" className={button} disabled={busy} onClick={() => onChoose(item, 'neither', change.trim())}>Neither works</button>
          </div>
        </Step>}

        {merges.length > 0 && !picked && <Step number={2} title="Told Lucie what to keep" done>
          <p className="pl-8 text-xs text-slate-600">{item.plan || 'Lucie combined the parts you picked from both versions.'}</p>
        </Step>}

        {(merges.length > 0 || (item.combining && !picked)) && <Step number={3} title="Your combined version" done={false}>
          {merges.length > 1 && <details className="rounded-lg border border-slate-200 bg-white p-3">
            <summary className="cursor-pointer text-xs text-slate-600">Earlier rounds ({merges.length - 1})</summary>
            <div className="mt-3 space-y-4">{merges.slice(0, -1).map((round) => <div key={round.round} className="space-y-1">
              <p className="text-[11px] text-slate-500">Round {round.round}{round.change ? `: "${round.change}"` : ''}</p>
              {round.response ? <PersistedMessage message={candidateMessage({ slot: `R${round.round}`, response: round.response }, data.comparison_id)} nmls={nmls} readOnly statusLabel="Earlier round" /> : <p className="text-xs text-amber-800">{candidateError(round.error)}</p>}
            </div>)}</div>
          </details>}
          {item.combining && <><LucieSays>{merges.length ? 'Making that adjustment…' : 'Combining the parts you picked into one version…'}</LucieSays><TypingIndicator /></>}
          {!item.combining && merges.at(-1)?.error && <p role="alert" className="text-sm text-amber-800">{candidateError(merges.at(-1).error)} Your earlier work is kept. Try again below.</p>}
          {latest && <div className="rounded-xl border-2 border-violet-300 bg-white p-3 space-y-2">
            <p className="text-xs font-semibold text-violet-800">Combined version · round {latest.round}</p>
            <PersistedMessage message={candidateMessage({ slot: `R${latest.round}`, response: latest.response }, data.comparison_id)} nmls={nmls} readOnly statusLabel="Not saved yet" />
          </div>}
          {latest && !item.combining && (item.roundsLeft ?? 1) > 0 && <div className="space-y-2">
            <LucieSays>How's this? If anything still feels off, tell me what to adjust and I'll rework it. When you're happy, use Copy above.</LucieSays>
            <div className="flex flex-wrap gap-1.5">{REFINE_SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" className={chip(false)} disabled={busy} onClick={() => refine(suggestion)}>{suggestion}</button>)}</div>
            <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); refine(adjust) }}>
              <input aria-label="What to adjust" maxLength={1000} value={adjust} onChange={(event) => setAdjust(event.target.value)} placeholder="Or type your own: e.g. swap the hook for a question" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" />
              <button type="submit" className={primary} disabled={busy || !adjust.trim()}>Adjust</button>
            </form>
          </div>}
          {latest && !item.combining && <div className="space-y-1">
            <button type="button" className={primary} disabled={busy || !canSave} onClick={() => onSave(item, 'combined')}>{item.saving ? 'Saving…' : 'Save as new Compare chat'}</button>
            <p className="text-xs text-slate-500">Adds your request and this combined version to the conversation, so it is in your history and Lucie can build on it. You can keep adjusting first.</p>
          </div>}
          {latest && item.roundsLeft === 0 && <p className="text-xs text-slate-500">That's the last adjustment for this comparison. Start a new one to keep going.</p>}
          {!latest && !item.combining && merges.length > 0 && <button type="button" className={primary} disabled={busy} onClick={() => onCombine(item, { feedback, change: change.trim() })}>Try combining again</button>}
        </Step>}

        {picked && ['A', 'B'].includes(reveal.choice) && <div className="space-y-1">
          <button type="button" className={primary} disabled={busy || !canSave} onClick={() => onSave(item, reveal.choice)}>{item.saving ? 'Saving…' : `Save Version ${reveal.choice} as new Compare chat`}</button>
          <p className="text-xs text-slate-500">Adds your request and this version to the conversation so it is in your history.</p>
        </div>}
        {item.saveError && <p role="alert" className="text-xs text-red-700">{item.saveError}</p>}
        {item.choiceError && <p role="alert" className="text-xs text-red-700">{item.choiceError}</p>}
        {reveal && <div className="rounded-lg bg-white p-3 text-xs text-slate-600 space-y-1">
          <p className="font-medium text-slate-800">{choiceSummary(reveal.choice, reveal.candidates)} Thanks, this helps Lucie learn what you like.</p>
          {reveal.candidates.map((row) => <p key={row.slot}>Version {row.slot}: {modelName(row)} · {(row.usage?.input_tokens || 0) + (row.usage?.cache_read_input_tokens || 0) + (row.usage?.cache_creation_input_tokens || 0)} tokens in, {row.usage?.output_tokens || 0} out · {formatCost(row.estimated_cost_usd)} · {((row.latency_ms || 0) / 1000).toFixed(1)}s</p>)}
          {merges.length > 0 && <p>Combine and adjust rounds: {merges.length} · {mergeCost(merges)}</p>}
          <p>Estimated cost of this comparison so far: {formatCost(reveal.estimated_cost_usd)}</p>
        </div>}
      </>}
    </div>
  </section>
}

function mergeCost(merges) {
  const costs = merges.map((round) => round.estimated_cost_usd)
  return costs.every((cost) => typeof cost === 'number') ? formatCost(costs.reduce((a, b) => a + b, 0)) : 'not priced'
}
