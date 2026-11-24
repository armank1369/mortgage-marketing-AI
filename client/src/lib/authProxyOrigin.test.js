import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveUpstreamOrigin } from '../../api/neon-auth.js'

const trusted = 'https://lucie.example.com'

test('same-site request from any of our domains is presented as the trusted origin', () => {
  const r = resolveUpstreamOrigin({ origin: 'https://lucie-smm-ai.vercel.app', referer: 'https://lucie-smm-ai.vercel.app/auth/sign-in?x=1', host: 'lucie-smm-ai.vercel.app', trusted })
  assert.deepEqual(r, { origin: trusted, referer: `${trusted}/auth/sign-in?x=1` })
})

test('a different site posting to the proxy is rejected', () => {
  assert.equal(resolveUpstreamOrigin({ origin: 'https://evil.example', host: 'lucie-smm-ai.vercel.app', trusted }).rejected, true)
})

test('without a configured trusted origin nothing is changed', () => {
  assert.deepEqual(resolveUpstreamOrigin({ origin: 'https://a.app', host: 'a.app', trusted: '' }), {})
})

test('requests with no Origin (GET) pass through unchanged', () => {
  assert.deepEqual(resolveUpstreamOrigin({ host: 'a.app', trusted }), {})
})
