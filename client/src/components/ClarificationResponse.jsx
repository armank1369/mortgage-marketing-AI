import { useEffect, useState } from 'react'
import Section from './Section'

function QuestionBlock({ question, selected, customText, onToggleOption, onCustomChange, disabled }) {
  return (
    <div className="py-4 border-b border-slate-100 last:border-b-0 last:pb-0 first:pt-0">
      <p className="text-sm font-medium text-slate-800 mb-3">{question.question}</p>
      <div className="flex flex-wrap gap-2">
        {(question.options || []).map((option, i) => {
          const isSelected = selected.includes(option)
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onToggleOption(option)}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                isSelected
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700'
              }`}
            >
              <span>{isSelected ? '☑' : '☐'}</span>
              {option}
            </button>
          )
        })}
      </div>
      {question.allow_custom && (
        <input
          type="text"
          value={customText}
          onChange={(e) => onCustomChange(e.target.value)}
          disabled={disabled}
          placeholder="Or type your own answer..."
          className="mt-3 w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50/50 placeholder:text-slate-400 disabled:opacity-70"
        />
      )}
    </div>
  )
}

export default function ClarificationResponse({ data, submitted, onSubmit }) {
  const questions = data?.questions || []
  const [answers, setAnswers] = useState(() => questions.map(() => ({ selected: [], custom: '' })))

  // ChatPage keys messages by array index, so an earlier message being removed (e.g. via
  // "Regenerate") shifts every later message's index down by one — React then reuses this
  // component instance for a different clarification round instead of remounting it, leaving
  // `answers` sized for the old question set. Resync whenever the underlying data changes.
  useEffect(() => {
    setAnswers(questions.map(() => ({ selected: [], custom: '' })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  if (questions.length === 0) return null

  const toggleOption = (qIndex, option) => {
    setAnswers((prev) => {
      const next = [...prev]
      const current = next[qIndex] || { selected: [], custom: '' }
      const selected = current.selected.includes(option)
        ? current.selected.filter((o) => o !== option)
        : [...current.selected, option]
      next[qIndex] = { ...current, selected }
      return next
    })
  }

  const setCustom = (qIndex, value) => {
    setAnswers((prev) => {
      const next = [...prev]
      next[qIndex] = { ...(next[qIndex] || { selected: [] }), custom: value }
      return next
    })
  }

  const handleContinue = () => {
    const lines = questions.map((q, i) => {
      const { selected, custom } = answers[i] || { selected: [], custom: '' }
      const parts = [...selected]
      if (custom.trim()) parts.push(custom.trim())
      const answerText = parts.length > 0 ? parts.join(', ') : 'No preference — use your judgment'
      return `- ${q.question}: ${answerText}`
    })
    onSubmit(lines.join('\n'))
  }

  return (
    <div className="w-full max-w-3xl">
      <Section
        icon="❓"
        title="A few quick questions"
        subtitle={`${questions.length} question${questions.length === 1 ? '' : 's'} — check all that apply`}
        defaultOpen
      >
        <div>
          {questions.map((q, i) => (
            <QuestionBlock
              key={i}
              question={q}
              selected={answers[i]?.selected || []}
              customText={answers[i]?.custom || ''}
              onToggleOption={(option) => toggleOption(i, option)}
              onCustomChange={(value) => setCustom(i, value)}
              disabled={submitted}
            />
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-slate-100">
          {submitted ? (
            <p className="text-xs text-emerald-600 font-medium">✓ Answers submitted</p>
          ) : (
            <button
              type="button"
              onClick={handleContinue}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Continue
            </button>
          )}
        </div>
      </Section>
    </div>
  )
}
