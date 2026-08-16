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
// `headerAction`, when given, renders in the header row itself (e.g. a "Save to Calendar"
// button) so it stays visible whether or not the section is expanded. It sits outside the
// title's toggle button — real <button> elements can't nest — so its own clicks don't
// bubble into the section's open/close toggle.
export default function Section({ icon, title, subtitle, defaultOpen = true, headerAction, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden">
      <div className="w-full flex items-center justify-between gap-3 px-5 py-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex-1 flex items-center gap-3 min-w-0 text-left hover:opacity-80 transition-opacity"
        >
          <div className="w-8 h-8 shrink-0 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
        </button>
        <div className="flex items-center gap-3 shrink-0">
          {headerAction}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Collapse section' : 'Expand section'}
            className="text-slate-400 p-1 -m-1"
          >
            <Chevron open={open} />
          </button>
        </div>
      </div>
      {open && <div className="px-5 pb-5 border-t border-slate-100 pt-4">{children}</div>}
    </div>
  )
}
