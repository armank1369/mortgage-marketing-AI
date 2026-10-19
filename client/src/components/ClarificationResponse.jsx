import { useEffect, useState } from 'react'
import Section from './Section'

function isSingleType(question) {
  return question?.type === 'single'
}

function QuestionBlock({ question, selected, customText, onSelectOption, onCustomChange, disabled }) {
  const single = isSingleType(question)
  const isSelected = (option) => (single ? selected === option : selected.includes(option))

  return (
    <div className="py-4 border-b border-slate-100 last:border-b-0 last:pb-0 first:pt-0">
      <p className="text-sm font-medium text-slate-800 mb-3">{question.question}</p>
      <div className="flex flex-wrap gap-2">
        {(question.options || []).map((option, i) => {
          const selectedOption = isSelected(option)
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onSelectOption(option)}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                selectedOption
                  ? 'bg-lucent-navy border-lucent-navy text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-lucent-navy hover:text-lucent-navy'
              }`}
            >
              {/* Radio glyph for single-choice questions (e.g. platform on a single post, or
                  format) signals to the user that picking one option replaces any other. */}
              <span>{single ? (selectedOption ? '●' : '○') : (selectedOption ? '☑' : '☐')}</span>
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

function emptyAnswer(question) {
  return { selected: isSingleType(question) ? '' : [], custom: '' }
}

export default function ClarificationResponse({ data, submitted, onSubmit, savedAnswers = [], disabled = false }) {
  const questions = data?.questions || []
  const answerKey = JSON.stringify([questions, savedAnswers])
  const restore = () => questions.map((question, index) => {
    const saved = savedAnswers.find((answer) => answer.question_index === index)
    return saved ? { selected: isSingleType(question) ? saved.selected[0] || '' : saved.selected, custom: saved.custom } : emptyAnswer(question)
  })
  const [answers, setAnswers] = useState(restore)

  // Stable question/answer content preserves unsent selections across status polls,
  // while committed answer records restore the actual selections after reload.
  useEffect(() => {
    setAnswers(restore())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerKey])

  if (questions.length === 0) return null

  const selectOption = (qIndex, option) => {
    setAnswers((prev) => {
      const next = [...prev]
      const question = questions[qIndex]
      const current = next[qIndex] || emptyAnswer(question)
      const selected = isSingleType(question)
        ? option
        : current.selected.includes(option)
          ? current.selected.filter((o) => o !== option)
          : [...current.selected, option]
      next[qIndex] = { ...current, selected }
      return next
    })
  }

  const setCustom = (qIndex, value) => {
    setAnswers((prev) => {
      const next = [...prev]
      next[qIndex] = { ...(next[qIndex] || emptyAnswer(questions[qIndex])), custom: value }
      return next
    })
  }

  const handleContinue = () => {
    const lines = questions.map((q, i) => {
      const { selected, custom } = answers[i] || emptyAnswer(q)
      // Normalize to an array so a single string selection and a multi-select array join into
      // the same plain-text answer line the API expects either way.
      const parts = Array.isArray(selected) ? [...selected] : selected ? [selected] : []
      if (custom.trim()) parts.push(custom.trim())
      const answerText = parts.length > 0 ? parts.join(', ') : 'No preference — use your judgment'
      return `- ${q.question}: ${answerText}`
    })
    onSubmit(lines.join('\n'), questions.map((question, index) => {
      const answer = answers[index] || emptyAnswer(question)
      return { question_index: index, selected: Array.isArray(answer.selected) ? answer.selected : answer.selected ? [answer.selected] : [], custom: answer.custom.trim() }
    }))
  }

  return (
    <div className="w-full max-w-3xl">
      <Section
        icon="❓"
        title="A few quick questions"
        subtitle={`${questions.length} question${questions.length === 1 ? '' : 's'}`}
        defaultOpen
      >
        <div>
          {questions.map((q, i) => (
            <QuestionBlock
              key={i}
              question={q}
              selected={answers[i]?.selected ?? emptyAnswer(q).selected}
              customText={answers[i]?.custom || ''}
              onSelectOption={(option) => selectOption(i, option)}
              onCustomChange={(value) => setCustom(i, value)}
              disabled={submitted || disabled}
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
              disabled={disabled}
              className="bg-lucent-navy hover:bg-lucent-navy-light text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Continue
            </button>
          )}
        </div>
      </Section>
    </div>
  )
}
