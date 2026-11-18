import { useEffect, useState } from 'react'
import lucieAvatar from '../assets/lucie-avatar.jpg'

// Shown immediately when a request fires (stage 1) — short, in-voice acknowledgements, never
// generic "Processing..." filler.
const LOADING_PHRASES = [
  'On it! Let me crunch some ideas for you...',
  'Got it! Give me just a sec to strategize...',
  'Reviewing the latest trends... back in a flash! ✨',
  'Drafting this up for you now...',
  'Ooh, good question. Let me pull the perfect angle for this...',
]

// Rotated in every 10s once a request has been running longer than 10s (stage 2) — keeps the
// wait from feeling dead air on slower campaign/calendar generations.
const LOADING_TIPS = [
  "💡 **Lucie's Tip:** The first 3 seconds of your Reel determine if a borrower keeps watching. Start with a strong hook instead of introducing yourself!",
  "📈 **Did you know?** Carousel posts on LinkedIn and Instagram generate significantly higher engagement than single images. They're perfect for breaking down complex loan types.",
  "💡 **Lucie's Tip:** Educational content about Non-QM loans or refinancing performs best when you tell a quick client success story instead of just listing the stats.",
  '📈 **Did you know?** Including a face in your videos or photos increases engagement by over 30%. People buy from people—especially when securing a mortgage!',
  '💡 **Lucie\'s Tip:** Using hyper-local hashtags (like #OrangeCountyRealEstate) converts much better than broad ones (like #MortgageBroker) because it targets actual local homebuyers.',
]

const LOADING_STAGE_2_DELAY_MS = 10000
const LOADING_TIP_ROTATE_MS = 10000
// Only a request that has been silent this long gets a manual "Check status" escape hatch;
// normal generations never show it.
const LOADING_STUCK_MS = 45000

function pickRandom(list, excluding) {
  if (list.length <= 1) return list[0]
  let next
  do {
    next = list[Math.floor(Math.random() * list.length)]
  } while (next === excluding)
  return next
}

// "**bold**" segments in LOADING_TIPS are hardcoded UI copy, not AI output — the app's
// no-markdown policy governs generated content, not this — so a tiny inline parser is enough,
// no need for a full markdown renderer.
function renderWithBold(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

// Two-stage loading bubble: a short in-voice phrase for the first 10s of any request, then
// rotating tips every 10s after that. Mounted only while a request is in flight (the durable
// operation is "checking" or "running"), so a fresh request naturally remounts it (fresh random
// phrase, timers reset) — driven entirely by local state, no API payload or network calls of
// its own. `onCheck` (optional) re-checks the saved operation if the wait looks stuck.
export default function TypingIndicator({ onCheck, disabled = false }) {
  const [stage, setStage] = useState(1)
  const [stuck, setStuck] = useState(false)
  const [text, setText] = useState(() => pickRandom(LOADING_PHRASES))

  useEffect(() => {
    const toStuck = setTimeout(() => setStuck(true), LOADING_STUCK_MS)
    return () => clearTimeout(toStuck)
  }, [])

  useEffect(() => {
    const toStage2 = setTimeout(() => {
      setStage(2)
      setText((prev) => pickRandom(LOADING_TIPS, prev))
    }, LOADING_STAGE_2_DELAY_MS)
    return () => clearTimeout(toStage2)
  }, [])

  useEffect(() => {
    if (stage !== 2) return
    const interval = setInterval(() => {
      setText((prev) => pickRandom(LOADING_TIPS, prev))
    }, LOADING_TIP_ROTATE_MS)
    return () => clearInterval(interval)
  }, [stage])

  return (
    <div role="status" aria-label="Lucie is working on your request" className="flex justify-start">
      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-sm max-w-sm">
        <div className="flex items-center gap-2 mb-2">
          <img src={lucieAvatar} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
          <div className="flex gap-1.5">
            <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
            <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
            <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
          </div>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">{renderWithBold(text)}</p>
        {stuck && onCheck && (
          <p className="mt-3 text-xs text-slate-500">
            Taking longer than usual.{' '}
            <button type="button" disabled={disabled} onClick={onCheck} className="underline text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
              Check status
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
