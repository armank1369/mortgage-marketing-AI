import { useTheme } from '@neondatabase/neon-js/auth/react'

const CHOICES = [
  { value: 'system', label: 'Match my device', hint: 'Light or dark, following your browser setting' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

// Light/dark choice. The theme itself is applied by Neon Auth's theme provider (next-themes),
// which saves the choice in this browser.
export default function AppearanceSetting() {
  const { theme = 'system', setTheme } = useTheme()

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="appearance-heading">
      <h2 id="appearance-heading" className="text-lg font-semibold text-slate-900">Appearance</h2>
      <p className="mt-1 text-sm text-slate-500">Choose how Lucie looks on this device.</p>
      <div role="radiogroup" aria-labelledby="appearance-heading" className="mt-4 flex flex-wrap gap-2">
        {CHOICES.map((choice) => {
          const selected = theme === choice.value
          return (
            <button
              key={choice.value}
              type="button"
              role="radio"
              aria-checked={selected}
              title={choice.hint}
              onClick={() => setTheme(choice.value)}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              {choice.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}
