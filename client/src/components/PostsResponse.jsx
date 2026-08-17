import Section from './Section'
import ContentBriefCard from './ContentBriefCard'
import { useCalendar } from '../context/CalendarContext'
import { bestPostingTime } from '../utils/postingTimes'

function PostCard({ post }) {
  const { addEntry } = useCalendar()
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

  const handleSaveToCalendar = () => {
    addEntry({
      topic: post.title,
      platform: post.platform,
      format: post.format,
      time: bestPostingTime(post.platform),
      date: new Date(),
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
    })
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
    />
  )
}

export default function PostsResponse({ data }) {
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
            <PostCard key={i} post={post} />
          ))}
        </div>
      </Section>
    </div>
  )
}
