import type { ScheduledPost, Platform } from './somi.types'

interface SomiPostCardProps {
  post: ScheduledPost
  onClick?: () => void
}

const platformIcons: Record<Platform, string> = {
  instagram: 'IG',
  linkedin: 'in',
  facebook: 'f',
}

const platformColors: Record<Platform, string> = {
  instagram: '#E4405F',
  linkedin: '#0A66C2',
  facebook: '#1877F2',
}

export function SomiPostCard({ post, onClick }: SomiPostCardProps) {
  return (
    <div
      className={`somi-post-card somi-post-card--${post.status}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      <div
        className="somi-post-card__platform"
        style={{ backgroundColor: platformColors[post.platform] }}
      >
        {platformIcons[post.platform]}
      </div>
      <div className="somi-post-card__content">
        <span className="somi-post-card__title">{post.title || post.content.slice(0, 40)}</span>
      </div>
    </div>
  )
}
