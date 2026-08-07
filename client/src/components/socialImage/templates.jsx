import { COLORS, FONT_SERIF, FONT_MONO, Wordmark, BrokerFooter } from './theme'

// Every template renders at a fixed native pixel size (the actual export resolution) so
// html-to-image captures a crisp, consistent graphic regardless of on-screen preview scale.
export const TEMPLATE_DIMENSIONS = {
  pull_quote: { width: 1080, height: 1080 },
  stat_highlight: { width: 1080, height: 1080 },
  carousel_cover: { width: 1080, height: 1080 },
  event_banner: { width: 1080, height: 1080 },
  tips_list: { width: 1080, height: 1080 },
  story_cover: { width: 1080, height: 1920 },
}

const canvasBase = {
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
  position: 'relative',
  overflow: 'hidden',
}

export function PullQuoteTemplate({ slots, nmls }) {
  const { quote, attribution_name, attribution_title } = slots
  return (
    <div
      style={{
        ...canvasBase,
        ...TEMPLATE_DIMENSIONS.pull_quote,
        background: COLORS.cream,
        padding: '76px 84px',
        justifyContent: 'space-between',
      }}
    >
      <Wordmark />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <span style={{ fontFamily: FONT_SERIF, fontSize: 96, lineHeight: 1, color: COLORS.terracotta }}>
          &ldquo;
        </span>
        <p
          style={{
            fontFamily: FONT_SERIF,
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 52,
            lineHeight: 1.28,
            color: COLORS.ink,
            margin: 0,
          }}
        >
          {quote}
        </p>
        <div style={{ width: 56, height: 3, background: COLORS.terracotta }} />
        <div>
          <div style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 20, color: COLORS.ink }}>
            {attribution_name}
          </div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 15, color: COLORS.inkSoft, marginTop: 4 }}>
            {attribution_title}
          </div>
        </div>
      </div>
      <BrokerFooter nmls={nmls} />
    </div>
  )
}

export function StatHighlightTemplate({ slots, nmls }) {
  const { eyebrow, stat_number, stat_label, footnote } = slots
  return (
    <div
      style={{
        ...canvasBase,
        ...TEMPLATE_DIMENSIONS.stat_highlight,
        background: `linear-gradient(160deg, ${COLORS.steel} 0%, ${COLORS.steelDeep} 100%)`,
        padding: '76px 84px',
        justifyContent: 'space-between',
        color: COLORS.cream,
      }}
    >
      <Wordmark dark />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16 }}>
        {eyebrow && (
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 16,
              letterSpacing: '0.22em',
              color: 'rgba(244,241,234,0.75)',
              textTransform: 'uppercase',
            }}
          >
            {eyebrow}
          </span>
        )}
        <span
          style={{
            fontFamily: FONT_SERIF,
            fontWeight: 700,
            fontSize: 220,
            lineHeight: 1,
            color: COLORS.cream,
          }}
        >
          {stat_number}
        </span>
        <span style={{ fontFamily: FONT_SERIF, fontSize: 34, color: 'rgba(244,241,234,0.92)' }}>
          {stat_label}
        </span>
      </div>
      <div>
        {footnote && (
          <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: 'rgba(244,241,234,0.55)', marginBottom: 14 }}>
            {footnote}
          </div>
        )}
        <BrokerFooter dark nmls={nmls} />
      </div>
    </div>
  )
}

export function CarouselCoverTemplate({ slots, nmls }) {
  const { number, category_label, slide_count, title, subtitle } = slots
  return (
    <div
      style={{
        ...canvasBase,
        ...TEMPLATE_DIMENSIONS.carousel_cover,
        background: COLORS.ink,
        padding: '76px 84px',
        justifyContent: 'space-between',
        color: COLORS.cream,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Wordmark dark />
        {slide_count && (
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 14,
              letterSpacing: '0.1em',
              color: 'rgba(244,241,234,0.55)',
              border: '1px solid rgba(244,241,234,0.3)',
              borderRadius: 999,
              padding: '6px 14px',
            }}
          >
            {slide_count}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {number && (
            <span style={{ fontFamily: FONT_SERIF, fontWeight: 700, fontSize: 54, color: COLORS.terracotta }}>
              {number}
            </span>
          )}
          {category_label && (
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 15,
                letterSpacing: '0.2em',
                color: 'rgba(244,241,234,0.65)',
                textTransform: 'uppercase',
              }}
            >
              {category_label}
            </span>
          )}
        </div>
        <p style={{ fontFamily: FONT_SERIF, fontWeight: 600, fontSize: 68, lineHeight: 1.1, margin: 0 }}>{title}</p>
        {subtitle && (
          <p style={{ fontFamily: FONT_SERIF, fontStyle: 'italic', fontSize: 26, color: 'rgba(244,241,234,0.8)', margin: 0 }}>
            {subtitle}
          </p>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <BrokerFooter dark nmls={nmls} />
        <span style={{ fontFamily: FONT_MONO, fontSize: 14, color: 'rgba(244,241,234,0.55)' }}>Swipe &rarr;</span>
      </div>
    </div>
  )
}

export function EventBannerTemplate({ slots, nmls }) {
  const { eyebrow, headline, date, time, where } = slots
  const details = [date, time, where].filter(Boolean)
  return (
    <div
      style={{
        ...canvasBase,
        ...TEMPLATE_DIMENSIONS.event_banner,
        background: COLORS.cream,
        padding: '76px 84px',
        justifyContent: 'space-between',
      }}
    >
      <Wordmark />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
        {eyebrow && (
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 16,
              letterSpacing: '0.22em',
              color: COLORS.terracotta,
              textTransform: 'uppercase',
            }}
          >
            {eyebrow}
          </span>
        )}
        <p style={{ fontFamily: FONT_SERIF, fontWeight: 600, fontSize: 62, lineHeight: 1.12, color: COLORS.ink, margin: 0 }}>
          {headline}
        </p>
        <div style={{ width: 56, height: 3, background: COLORS.terracotta, marginTop: 8 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {details.map((d, i) => (
            <span key={i} style={{ fontFamily: FONT_MONO, fontSize: 22, color: COLORS.inkSoft }}>
              {d}
            </span>
          ))}
        </div>
      </div>
      <BrokerFooter nmls={nmls} />
    </div>
  )
}

export function TipsListTemplate({ slots, nmls }) {
  const { eyebrow, title, items } = slots
  const list = Array.isArray(items) ? items : []
  return (
    <div
      style={{
        ...canvasBase,
        ...TEMPLATE_DIMENSIONS.tips_list,
        background: COLORS.cream,
        padding: '76px 84px',
        justifyContent: 'space-between',
      }}
    >
      <Wordmark />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div>
          {eyebrow && (
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 16,
                letterSpacing: '0.22em',
                color: COLORS.terracotta,
                textTransform: 'uppercase',
              }}
            >
              {eyebrow}
            </span>
          )}
          <p style={{ fontFamily: FONT_SERIF, fontWeight: 600, fontSize: 54, lineHeight: 1.15, color: COLORS.ink, margin: '10px 0 0' }}>
            {title}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {list.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
              <span style={{ fontFamily: FONT_SERIF, fontWeight: 700, fontSize: 30, color: COLORS.terracotta, minWidth: 44 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ fontFamily: FONT_SERIF, fontSize: 30, lineHeight: 1.4, color: COLORS.ink }}>{item}</span>
            </div>
          ))}
        </div>
      </div>
      <BrokerFooter nmls={nmls} />
    </div>
  )
}

export function StoryCoverTemplate({ slots, nmls }) {
  const { eyebrow, headline, supporting_text, cta_label } = slots
  return (
    <div
      style={{
        ...canvasBase,
        ...TEMPLATE_DIMENSIONS.story_cover,
        background: `linear-gradient(200deg, ${COLORS.steelDeep} 0%, ${COLORS.ink} 100%)`,
        padding: '96px 72px',
        justifyContent: 'space-between',
        color: COLORS.cream,
      }}
    >
      <Wordmark dark />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {eyebrow && (
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 17,
              letterSpacing: '0.22em',
              color: COLORS.terracotta,
              textTransform: 'uppercase',
            }}
          >
            {eyebrow}
          </span>
        )}
        <p style={{ fontFamily: FONT_SERIF, fontWeight: 600, fontSize: 72, lineHeight: 1.15, margin: 0 }}>{headline}</p>
        {supporting_text && (
          <p style={{ fontFamily: FONT_SERIF, fontStyle: 'italic', fontSize: 30, color: 'rgba(244,241,234,0.85)', margin: 0 }}>
            {supporting_text}
          </p>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, alignItems: 'flex-start' }}>
        {cta_label && (
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 16,
              letterSpacing: '0.1em',
              color: COLORS.ink,
              background: COLORS.cream,
              borderRadius: 999,
              padding: '14px 26px',
            }}
          >
            {cta_label}
          </span>
        )}
        <BrokerFooter dark nmls={nmls} />
      </div>
    </div>
  )
}

const TEMPLATE_COMPONENTS = {
  pull_quote: PullQuoteTemplate,
  stat_highlight: StatHighlightTemplate,
  carousel_cover: CarouselCoverTemplate,
  event_banner: EventBannerTemplate,
  tips_list: TipsListTemplate,
  story_cover: StoryCoverTemplate,
}

export default TEMPLATE_COMPONENTS
