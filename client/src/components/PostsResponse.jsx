import Section from './Section'
import ContentBriefCard from './ContentBriefCard'
import SocialImageGenerator from './socialImage/SocialImageGenerator'
import { useCalendar } from '../context/CalendarContext'
import { bestPostingTime } from '../utils/postingTimes'

function PostCard({ post, nmls, persona, batchId }) {
  const { entries, upsertEntries, isBatchSaved } = useCalendar()
  const saved = isBatchSaved(batchId)
  // This post's own previously-saved entry (if any) is excluded so re-opening the picker on an
  // already-saved post doesn't flag its own existing slot as a conflict with itself.
  const bookedTimes = entries.filter((entry) => entry.batchId !== batchId && entry.platform === post.platform)
  const script = post.script || {}
  const direction = post.creative_direction || {}
  const details = post.quick_details || {}
  const isCarousel = post.format === 'carousel' && Array.isArray(script.body)

  const buildCopyText = () => {
    const bodyText = isCarousel
      ? script.body.map((slide, i) => `Slide ${i + 2}: ${slide}`).join('\n\n')
      : script.body || ''
    return [script.hook || '', bodyText, script.cta || ''].filter(Boolean).join('\n\n')
  }

  const handleSaveToCalendar = (dateInputValue, timeValue) => {
    // dateInputValue is a "YYYY-MM-DD" string from the date-picker's <input type="date">.
    // Built from local Y/M/D components rather than `new Date(dateInputValue)` — the latter
    // parses as UTC midnight, which can land on the previous calendar day once converted back
    // to a negative-UTC-offset local timezone (e.g. US Pacific).
    const [y, m, d] = dateInputValue.split('-').map(Number)
    upsertEntries(batchId, [
      {
        topic: post.title,
        platform: post.platform,
        format: post.format,
        time: timeValue || bestPostingTime(post.platform),
        date: new Date(y, m - 1, d),
        // Carried along so the calendar's detail modal can show the same full breakdown as
        // this card, not just the topic/platform/date shell.
        details: {
          script: [
            { label: 'Hook', text: script.hook },
            isCarousel ? { label: 'Body', slides: script.body } : { label: 'Body', text: script.body },
            { label: 'CTA', text: script.cta },
          ],
          direction,
          quickDetails: details,
          hashtags: post.hashtags,
        },
      },
    ])
  }

  return (
    <ContentBriefCard
      title={post.title}
      platform={post.platform}
      format={post.format}
      script={[
        { label: 'Hook', text: script.hook },
        isCarousel ? { label: 'Body', slides: script.body } : { label: 'Body', text: script.body },
        { label: 'CTA', text: script.cta },
      ]}
      direction={direction}
      details={details}
      hashtags={post.hashtags}
      onCopyText={buildCopyText}
      onSaveToCalendar={handleSaveToCalendar}
      saved={saved}
      bookedTimes={bookedTimes}
    >
      {/* Video-format posts already come back with a full spoken script instead — a social
          image only makes sense as a substitute visual for formats that don't have one. */}
      {post.format !== 'video' && (
        <SocialImageGenerator
          title={post.title}
          script={script}
          platform={post.platform}
          persona={persona}
          nmls={nmls}
        />
      )}
    </ContentBriefCard>
  )
}

export default function PostsResponse({ data, nmls, persona, batchId }) {
  const posts = data?.posts || []
  if (posts.length === 0) return null

  return (
    <div className="w-full max-w-3xl">
      <Section
        icon="✍️"
        title={posts.length === 1 ? 'Post Idea' : `${posts.length} Post Ideas`}
        defaultOpen
      >
        {data?.intro && <p className="text-sm text-slate-600 mb-4 leading-relaxed">{data.intro}</p>}
        <div className="space-y-4">
          {posts.map((post, i) => (
            <PostCard key={i} post={post} nmls={nmls} persona={persona} batchId={`${batchId}-${i}`} />
          ))}
        </div>
      </Section>
    </div>
  )
}
