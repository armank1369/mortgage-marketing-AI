import { NeonAuthUIProvider } from '@neondatabase/neon-js/auth/react'
import { Link, useNavigate } from 'react-router-dom'
import { authClient } from './lib/neon/neon.js'

export default function AuthProvider({ children }) {
  const navigate = useNavigate()

  return (
    <NeonAuthUIProvider
      authClient={authClient}
      navigate={navigate}
      redirectTo="/"
      Link={({ href, children }) => <Link to={href}>{children}</Link>}
    >
      {children}
    </NeonAuthUIProvider>
  )
}