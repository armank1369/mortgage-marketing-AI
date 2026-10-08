import { useParams } from 'react-router-dom'
import { AuthView } from '@neondatabase/neon-js/auth/react'

export default function AuthPage() {
  const { pathname } = useParams()

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <AuthView pathname={pathname} />
    </main>
  )
}