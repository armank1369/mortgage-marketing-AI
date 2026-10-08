import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authClient } from '../lib/neon/neon.js'

export default function SettingsPage() {
  const navigate = useNavigate()
  const { data: session, isPending, error, refetch } = authClient.useSession()
  const [signingOut, setSigningOut] = useState(false)
  const [actionError, setActionError] = useState('')

  const user = session?.user

  const handleSignOut = async () => {
    setSigningOut(true)
    setActionError('')

    try {
      const result = await authClient.signOut()

      if (result?.error) {
        throw new Error(result.error.message || 'Sign out failed')
      }

      await refetch?.()
    } catch (err) {
      setActionError(err?.message || 'Could not sign out. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <main className="min-h-dvh bg-slate-50 p-4 sm:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4">
          {user ? (
            <Link
              to="/"
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              ← Back to Lucie
            </Link>
          ) : (
            <span className="text-sm text-slate-500">Lucie account settings</span>
          )}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="mt-2 text-sm text-slate-500">
            View the current Neon Auth status and manage this browser session.
          </p>

          {isPending && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-600">Checking sign-in status...</p>
            </div>
          )}

          {!isPending && error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-700">
                Could not read the Neon Auth session
              </p>
              <p className="mt-1 text-xs text-red-600">{error.message}</p>
            </div>
          )}

          {!isPending && !user && (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                <p className="font-semibold text-amber-900">Not signed in</p>
              </div>

              <p className="mt-2 text-sm text-amber-800">
                Sign in with Neon Auth to access Lucie.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/auth/sign-in')}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Sign In
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/auth/sign-up')}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Create Account
                </button>
              </div>
            </div>
          )}

          {!isPending && user && (
            <div className="mt-6">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <p className="font-semibold text-emerald-900">
                    Signed in with Neon Auth
                  </p>
                </div>

                <dl className="mt-4 space-y-3 text-sm">
                  <div>
                    <dt className="font-medium text-slate-500">Name</dt>
                    <dd className="mt-0.5 text-slate-900">{user.name || '—'}</dd>
                  </div>

                  <div>
                    <dt className="font-medium text-slate-500">Email</dt>
                    <dd className="mt-0.5 text-slate-900">{user.email || '—'}</dd>
                  </div>

                  <div>
                    <dt className="font-medium text-slate-500">Neon Auth user ID</dt>
                    <dd className="mt-0.5 break-all font-mono text-xs text-slate-700">
                      {user.id}
                    </dd>
                  </div>
                </dl>
              </div>

              {actionError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm text-red-700">{actionError}</p>
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {signingOut ? 'Signing Out...' : 'Sign Out'}
                </button>

                {import.meta.env.DEV && (
                  <Link
                    to="/debug/auth"
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Test Backend Identity
                  </Link>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
