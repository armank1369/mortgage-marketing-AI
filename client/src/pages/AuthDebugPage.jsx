import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AuthLoading,
  RedirectToSignIn,
  SignedIn,
} from '@neondatabase/neon-js/auth/react'

import { getBackendIdentity } from '../lib/api'

function IdentityResult() {
  const [result, setResult] = useState({
    status: 'loading',
    user: null,
    error: null,
  })

  useEffect(() => {
    let active = true

    getBackendIdentity()
      .then(({ data }) => {
        if (active) setResult({ status: 'ok', user: data.user, error: null })
      })
      .catch((error) => {
        if (!active) return
        const status = error?.response?.status
        const message = error?.response?.data?.error || error?.message || 'Unknown error'
        setResult({
          status: 'error',
          user: null,
          error: `${status || 'client'}: ${message}`,
        })
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <main className="min-h-dvh bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h1 className="text-xl font-bold text-slate-900">Backend identity check</h1>
        <p className="mt-2 text-sm text-slate-500">
          This development-only page asks Flask to verify the current Neon Auth JWT.
        </p>

        {result.status === 'loading' && (
          <p className="mt-6 text-sm text-slate-600">Verifying signed-in identity...</p>
        )}

        {result.status === 'error' && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-700">Verification failed</p>
            <p className="mt-1 text-xs text-red-600 break-all">{result.error}</p>
          </div>
        )}

        {result.status === 'ok' && result.user && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
            <p className="text-sm font-semibold text-emerald-800">JWT verified by Flask</p>
            <div className="text-xs text-slate-700 space-y-1">
              <p><span className="font-semibold">Name:</span> {result.user.name || '—'}</p>
              <p><span className="font-semibold">Email:</span> {result.user.email || '—'}</p>
              <p className="break-all"><span className="font-semibold">User ID:</span> {result.user.id}</p>
            </div>
          </div>
        )}

        <div className="mt-6">
          <Link to="/" className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            Back to Lucie
          </Link>
        </div>
      </div>
    </main>
  )
}

export default function AuthDebugPage() {
  return (
    <>
      <AuthLoading>
        <div>Loading...</div>
      </AuthLoading>
      <RedirectToSignIn />
      <SignedIn>
        <IdentityResult />
      </SignedIn>
    </>
  )
}
