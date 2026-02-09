import { useMemo } from 'react'
import type { ScheduledPost } from './somi.types'
import { PlatformIcon, platformColors } from './PlatformIcon'

interface SomiPostListProps {
  posts: ScheduledPost[]
  onSelectPost?: (post: ScheduledPost, dayPosts: ScheduledPost[]) => void
}

const statusClass: Record<string, string> = {
  draft: 'badge-warn',
  scheduled: 'badge-primary',
  published: 'badge-ok',
  failed: 'badge-danger',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function SomiPostList({ posts, onSelectPost }: SomiPostListProps) {
  const sorted = useMemo(
    () => [...posts].sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()),
    [posts]
  )

  return (
    <div className="somi-post-list">
      <div className="somi-post-list__header">
        <h4>Upcoming Posts ({posts.length})</h4>
      </div>

      {sorted.length === 0 ? (
        <div className="somi-post-list__empty">
          No posts this month
        </div>
      ) : (
        <div className="somi-post-list__items">
          {sorted.map((post) => (
            <div
              key={post.id}
              className="somi-post-list__item"
              onClick={() => onSelectPost?.(post, [post])}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelectPost?.(post, [post])}
            >
              {/* Thumbnail */}
              <div className="somi-post-list__thumb">
                {post.imageUrl ? (
                  <img src={post.imageUrl} alt="" />
                ) : (
                  <div
                    className="somi-post-list__thumb-placeholder"
                    style={{ backgroundColor: platformColors[post.platform] }}
                  >
                    <PlatformIcon platform={post.platform} size={18} />
                  </div>
                )}
              </div>

              {/* Platform badge */}
              <div
                className="somi-post-list__platform"
                style={{ backgroundColor: platformColors[post.platform] }}
              >
                <PlatformIcon platform={post.platform} size={12} />
              </div>

              {/* Title + date */}
              <div className="somi-post-list__info">
                <span className="somi-post-list__title">
                  {post.title || post.content.slice(0, 40)}
                </span>
                <span className="somi-post-list__date">{formatDate(post.scheduledDate)}</span>
              </div>

              {/* Status */}
              <span className={`badge ${statusClass[post.status] || 'badge-warn'}`}>
                {post.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
