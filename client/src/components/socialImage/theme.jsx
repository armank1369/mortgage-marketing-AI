// Shared brand tokens for the social-image templates — approximated from the Figma exports.
export const COLORS = {
  cream: '#F4F1EA',
  ink: '#1A1A1A',
  inkSoft: '#514E48',
  steel: '#3F6B82',
  steelDeep: '#2B4C5E',
  terracotta: '#C0503B',
  hairline: 'rgba(26, 26, 26, 0.12)',
  hairlineOnDark: 'rgba(244, 241, 234, 0.22)',
}

export const FONT_SERIF = "'Playfair Display', Georgia, serif"
export const FONT_MONO = "'JetBrains Mono', 'IBM Plex Mono', monospace"

export const WORDMARK = 'LUCENT'
export const WORDMARK_SUB = 'MORTGAGE'

export function Wordmark({ dark }) {
  const color = dark ? COLORS.cream : COLORS.ink
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span
        style={{
          fontFamily: FONT_MONO,
          fontWeight: 600,
          fontSize: 15,
          letterSpacing: '0.18em',
          color,
        }}
      >
        {WORDMARK}
      </span>
      <span
        style={{
          fontFamily: FONT_MONO,
          fontWeight: 500,
          fontSize: 15,
          letterSpacing: '0.18em',
          color: dark ? 'rgba(244,241,234,0.55)' : 'rgba(26,26,26,0.45)',
        }}
      >
        {WORDMARK_SUB}
      </span>
    </div>
  )
}

export function BrokerFooter({ dark, nmls }) {
  const color = dark ? 'rgba(244,241,234,0.6)' : 'rgba(26,26,26,0.5)'
  return (
    <div
      style={{
        fontFamily: FONT_MONO,
        fontSize: 12,
        letterSpacing: '0.04em',
        color,
      }}
    >
      Joseph Kim &middot; NMLS #{nmls || '000000'}
    </div>
  )
}
