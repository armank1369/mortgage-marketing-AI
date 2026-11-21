import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { AuthView } from '@neondatabase/neon-js/auth/react'
import lucieAvatar from '../assets/lucie-avatar.jpg'
import { AUTH_LOCALIZATION, authDocumentTitle, authScreen } from '../lib/authCopy.js'

// Branded wrapper around Neon Auth's AuthView. Only presentation lives here: the sign-in flow,
// session handling and redirect target are still owned by NeonAuthUIProvider (AuthProvider.jsx),
// and every API call is still authorized server-side.

const HIGHLIGHTS = [
  'Draft on-brand posts and campaigns in minutes',
  'Plan everything on one shared content calendar',
  'Compliance reminders built into every draft',
]

function Wordmark({ size = 'lg' }) {
  const big = size === 'lg'
  return (
    <div className="flex items-center gap-3">
      <img
        src={lucieAvatar}
        alt=""
        className={`${big ? 'h-14 w-14' : 'h-11 w-11'} rounded-full object-cover ring-2 ring-white/70 shadow`}
      />
      <div className="leading-tight">
        <p className={`font-serif italic font-semibold ${big ? 'text-4xl' : 'text-2xl'}`}>Lucie</p>
        <p className={`${big ? 'text-sm' : 'text-xs'} opacity-80`}>Lucent&apos;s AI Social Media Strategist</p>
      </div>
    </div>
  )
}

export default function AuthPage() {
  const { pathname } = useParams()
  const screen = authScreen(pathname)

  useEffect(() => {
    const previous = document.title
    document.title = authDocumentTitle(pathname)
    return () => { document.title = previous }
  }, [pathname])

  return (
    <div className="lucie-auth min-h-dvh bg-lucent-cream text-lucent-navy lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Brand panel: full height on desktop, hidden on phones so the form is above the fold. */}
      <aside className="hidden lg:flex flex-col justify-between bg-lucent-navy text-white p-12">
        <Wordmark />
        <div className="max-w-md">
          <h2 className="font-serif text-3xl leading-snug">Social media that sounds like you, ready when you are.</h2>
          <ul className="mt-8 space-y-4 text-base text-white/85">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-lucent-red" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/60">For licensed Lucent team members only.</p>
      </aside>

      <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-8 sm:px-8 lg:min-h-0">
        <header className="mb-6 w-full max-w-sm lg:hidden">
          <Wordmark size="sm" />
        </header>

        <div className="w-full max-w-sm">
          <h1 className="sr-only">{screen.title}</h1>
          <AuthView
            pathname={pathname}
            localization={AUTH_LOCALIZATION}
            classNames={{
              base: 'w-full shadow-lg border-black/5',
              title: 'font-serif text-2xl font-semibold',
              description: 'text-sm',
              footerLink: 'font-medium text-lucent-red underline-offset-4 hover:underline',
              form: {
                input: 'h-11 text-base sm:text-sm',
                primaryButton: 'h-11 text-base sm:text-sm font-semibold',
                forgotPasswordLink: 'text-sm font-medium text-lucent-red underline-offset-4 hover:underline',
                error: 'text-sm',
              },
            }}
          />
          <p className="mt-5 rounded-lg bg-white/70 px-4 py-3 text-sm leading-relaxed text-slate-600 ring-1 ring-black/5">
            {screen.note}
          </p>
        </div>
      </main>
    </div>
  )
}
