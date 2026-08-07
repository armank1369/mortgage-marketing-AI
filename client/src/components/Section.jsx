import { useState } from 'react'

function Chevron({ open }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

// Shared card chrome — used by CampaignResponse's four-pillar sections, plain-text AI
// replies, and clarifying-question cards, so every AI output reads as one visual system.
export default function Section({ icon, title, subtitle, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50/70 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 shrink-0 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
        </div>
        <span className="text-slate-400 shrink-0">
          <Chevron open={open} />
        </span>
      </button>
      {open && <div className="px-5 pb-5 border-t border-slate-100 pt-4">{children}</div>}
    </div>
  )
}
