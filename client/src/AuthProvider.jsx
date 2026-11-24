import { useState } from 'react'
import { NeonAuthUIProvider } from '@neondatabase/neon-js/auth/react'
import { Link, useNavigate } from 'react-router-dom'
import { authClient } from './lib/neon/neon.js'
import { createAuthNavigate, hasSession, SESSION_BLOCKED_MESSAGE } from './lib/authNavigation.js'

export default function AuthProvider({ children }) {
  const routerNavigate = useNavigate()
  const [blocked, setBlocked] = useState(false)

  // Leaving the auth screens: confirm the browser actually kept the session first. If it did not
  // (Safari blocking the cross-site cookie), say so instead of silently showing a blank form.
  const navigate = createAuthNavigate(routerNavigate, async (to) => {
    const ok = await hasSession(authClient).catch(() => false)
    if (!ok) {
      console.warn('[auth] Sign-in succeeded but no session came back; the browser may be blocking the session cookie.')
      setBlocked(true)
      return
    }
    window.location.assign(to)
  })

  return (
    <NeonAuthUIProvider
      authClient={authClient}
      navigate={navigate}
      redirectTo="/"
      // Forward className so Neon Auth's own link styling (e.g. "Forgot password?") survives.
      Link={({ href, className, children }) => <Link to={href} className={className}>{children}</Link>}
    >
      {blocked && (
        <div role="alert" className="fixed inset-x-0 top-0 z-50 bg-lucent-red px-4 py-3 text-center text-sm text-white">
          {SESSION_BLOCKED_MESSAGE}
        </div>
      )}
      {children}
    </NeonAuthUIProvider>
  )
}
