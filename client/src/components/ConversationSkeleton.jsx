import lucieAvatar from '../assets/lucie-avatar.jpg'

// Placeholder shown while a saved conversation's history is fetched. It mirrors the real layout
// — the user's blue bubble, then an AI card with the same chrome as <Section> — so the page
// doesn't jump when messages arrive, and reuses the Lucie avatar + bouncing dots from the typing
// indicator so loading reads as part of the same visual system. `motion-safe:` keeps the
// shimmer off for users who prefer reduced motion.
const bar = 'rounded-full bg-slate-200 motion-safe:animate-pulse'

export default function ConversationSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-5">
      <div className="flex items-center gap-2.5 text-sm text-slate-500">
        <img src={lucieAvatar} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="w-2 h-2 bg-blue-400 rounded-full motion-safe:animate-bounce" style={{ animationDelay: '0s' }} />
          <span className="w-2 h-2 bg-blue-400 rounded-full motion-safe:animate-bounce" style={{ animationDelay: '0.15s' }} />
          <span className="w-2 h-2 bg-blue-400 rounded-full motion-safe:animate-bounce" style={{ animationDelay: '0.3s' }} />
        </div>
        <span>Loading your conversation…</span>
      </div>

      <div aria-hidden="true" className="space-y-5">
        {/* User message */}
        <div className="flex justify-end">
          <div className="h-11 w-3/5 max-w-sm rounded-2xl bg-imessage-blue/20 motion-safe:animate-pulse" />
        </div>

        {/* AI response card — same chrome as <Section> */}
        <div className="space-y-2">
          <div className={`${bar} h-2.5 w-28`} />
          <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4">
              <div className="w-8 h-8 shrink-0 rounded-lg bg-blue-50 motion-safe:animate-pulse" />
              <div className={`${bar} h-3 w-32`} />
            </div>
            <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-3">
              <div className={`${bar} h-3 w-full`} />
              <div className={`${bar} h-3 w-11/12`} />
              <div className={`${bar} h-3 w-4/5`} />
              <div className={`${bar} h-3 w-2/3`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
