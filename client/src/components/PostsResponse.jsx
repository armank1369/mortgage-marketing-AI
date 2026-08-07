import Section from './Section'
import ContentBriefCard from './ContentBriefCard'

function PostCard({ post }) {
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
