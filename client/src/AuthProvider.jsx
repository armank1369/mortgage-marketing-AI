import { NeonAuthUIProvider } from '@neondatabase/neon-js/auth/react'
import { Link, useNavigate } from 'react-router-dom'
import { authClient } from './lib/neon/neon.js'
import { createAuthNavigate } from './lib/authNavigation.js'

export default function AuthProvider({ children }) {
  const routerNavigate = useNavigate()
  // Full page load after sign-in so Safari picks up the new session (see authNavigation.js).
  const navigate = createAuthNavigate(routerNavigate, (to) => window.location.assign(to))

  return (
    <NeonAuthUIProvider
      authClient={authClient}
      navigate={navigate}
      redirectTo="/"
      // Forward className so Neon Auth's own link styling (e.g. "Forgot password?") survives.
      Link={({ href, className, children }) => <Link to={href} className={className}>{children}</Link>}
    >
      {children}
    </NeonAuthUIProvider>
  )
}