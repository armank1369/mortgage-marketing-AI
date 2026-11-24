// Same-origin proxy for Neon Auth (opt-in via VITE_NEON_AUTH_SAME_ORIGIN=true on the client).
// Safari blocks cookies that a different site (the Neon Auth domain) sets while you browse Lucie, so
// the session cookie never comes back and sign-in looks like it did nothing. Routing the auth calls
// through Lucie's own domain makes the cookie first-party. vercel.json rewrites /neon-auth/* here.

const HOP_BY_HOP = new Set(['host', 'connection', 'content-length', 'accept-encoding', 'x-forwarded-host', 'x-forwarded-proto', 'x-vercel-id', 'x-vercel-forwarded-for', 'x-real-ip'])

export function resolveUpstreamOrigin({ origin, referer, host, trusted }) {
  const trustedOrigin = (trusted || '').replace(/\/+$/, '')
  if (!trustedOrigin || !/^https?:\/\//.test(trustedOrigin)) return {}
  const hostOf = (u) => { try { return new URL(u).host } catch { return null } }
  // Browsers send Origin on sign-in/sign-up POSTs; GETs may carry neither.
  if (origin && hostOf(origin) !== host) return { rejected: true }
  const out = {}
  if (origin) out.origin = trustedOrigin
  if (referer && hostOf(referer) === host) {
    try { const r = new URL(referer); out.referer = `${trustedOrigin}${r.pathname}${r.search}` } catch { /* ignore */ }
  }
  return out
}

export default async function handler(req, res) {
  const base = (process.env.NEON_AUTH_PROXY_TARGET || process.env.VITE_NEON_AUTH_URL || '').replace(/\/+$/, '')
  if (!/^https:\/\//.test(base)) {
    res.status(500).json({ error: 'Auth proxy is not configured (set NEON_AUTH_PROXY_TARGET).' })
    return
  }
  const url = new URL(req.url, 'https://placeholder.invalid')
  // Prefer the rewrite's ?path=, else recover it from the original URL (/neon-auth/<path>).
  let sub = url.searchParams.get('path')
  if (sub == null) sub = url.pathname.replace(/^\/(?:api\/)?neon-auth\/?/, '')
  sub = sub.replace(/^\/+/, '')
  url.searchParams.delete('path')
  const qs = url.searchParams.toString()
  const target = `${base}/${sub}${qs ? `?${qs}` : ''}`

  const headers = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase()) && typeof v === 'string') headers[k] = v
  }

  // Neon Auth rejects requests whose Origin isn't in its trusted list ("Invalid origin"). Lucie can
  // be served from several domains (production, teammates' Vercel domains, previews), so instead of
  // listing every one in Neon, accept only requests that come from this very site (Origin host ==
  // our own host, which keeps Neon's cross-site request protection) and present the configured
  // trusted origin upstream. Without NEON_AUTH_TRUSTED_ORIGIN the Origin is passed through unchanged.
  const originCheck = resolveUpstreamOrigin({
    origin: req.headers.origin,
    referer: req.headers.referer,
    host: req.headers['x-forwarded-host'] || req.headers.host,
    trusted: process.env.NEON_AUTH_TRUSTED_ORIGIN,
  })
  if (originCheck.rejected) {
    res.status(403).json({ message: 'Invalid origin' })
    return
  }
  if (originCheck.origin) headers.origin = originCheck.origin
  if (originCheck.referer) headers.referer = originCheck.referer
  const hasBody = !['GET', 'HEAD'].includes(req.method)
  let body
  if (hasBody) {
    if (req.body !== undefined && req.body !== null) {
      // Vercel may already have read and parsed the body.
      body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
    } else {
      const chunks = []
      for await (const c of req) chunks.push(c)
      body = Buffer.concat(chunks)
    }
  }

  let upstream
  try {
    upstream = await fetch(target, { method: req.method, headers, body, redirect: 'manual' })
  } catch {
    res.status(502).json({ error: 'Could not reach the sign-in service.' })
    return
  }

  // Diagnostics: cookie NAMES only (never values) so a failed sign-in can be traced from the browser.
  const cookieNames = (list) => list.map((c) => c.split('=')[0].trim()).join(',') || 'none'
  const incoming = (req.headers.cookie || '').split(';').filter(Boolean)
  res.setHeader('x-lucie-cookies-in', incoming.map((c) => c.split('=')[0].trim()).join(',') || 'none')
  res.status(upstream.status)
  upstream.headers.forEach((value, key) => {
    const k = key.toLowerCase()
    if (['set-cookie', 'content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) return
    res.setHeader(key, value)
  })
  const cookies = upstream.headers.getSetCookie ? upstream.headers.getSetCookie() : []
  if (cookies.length) {
    // Drop any Domain attribute so the cookie belongs to Lucie's own host.
    res.setHeader('Set-Cookie', cookies.map((c) => c.replace(/;\s*domain=[^;]*/i, '')))
  }
  res.setHeader('x-lucie-cookies-out', cookieNames(cookies))
  res.send(Buffer.from(await upstream.arrayBuffer()))
}
