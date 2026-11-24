import { createAuthClient } from '@neondatabase/neon-js/auth'
import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters'

const authUrl = import.meta.env.VITE_NEON_AUTH_URL

if (!authUrl) {
  throw new Error('VITE_NEON_AUTH_URL is not configured')
}

// Default: send auth calls through this site's own /neon-auth proxy so Safari treats the session
// cookie as first-party and nobody has to change a browser setting (see client/api/neon-auth.js).
// Local dev (no Vercel function) and an explicit VITE_NEON_AUTH_SAME_ORIGIN=false use the Neon URL.
const flag = String(import.meta.env.VITE_NEON_AUTH_SAME_ORIGIN || '').toLowerCase()
const sameOrigin = flag === 'true' || (flag !== 'false' && !import.meta.env.DEV)
export const usingSameOriginAuth = sameOrigin && typeof window !== 'undefined'
const baseUrl = sameOrigin && typeof window !== 'undefined' ? `${window.location.origin}/neon-auth` : authUrl

// Last few auth responses (status and cookie NAMES the proxy saw), shown only when the session
// check fails so a screenshot of the banner is enough to diagnose it.
export const authDiagnostics = []
function recordAuthResponse(ctx) {
  try {
    const res = ctx?.response
    const path = new URL(res.url).pathname.replace(/^.*\/neon-auth/, '') || res.url
    authDiagnostics.push(`${path} ${res.status} in:${res.headers.get('x-lucie-cookies-in') ?? '-'} out:${res.headers.get('x-lucie-cookies-out') ?? '-'}`)
    if (authDiagnostics.length > 4) authDiagnostics.shift()
  } catch { /* diagnostics only */ }
}

export const authBaseUrl = baseUrl

export const authClient = createAuthClient(baseUrl, {
  adapter: BetterAuthReactAdapter({
    fetchOptions: {
      credentials: 'include',
      onResponse: recordAuthResponse,
    },
  }),
})