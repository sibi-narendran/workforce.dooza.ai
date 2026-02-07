import { useMemo } from 'react'
import type { ScheduledPost, Platform } from './somi.types'
import { PlatformIcon, platformColors } from './PlatformIcon'

interface SomiCalendarProps {
  posts: ScheduledPost[]
  startDate: Date
  onAddPost?: (date: Date) => void
  onSelectPost?: (post: ScheduledPost) => void
  onNavigate?: (direction: 'prev' | 'next' | 'today') => void
  loading?: boolean
}

const DAY_COUNT = 14

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const statusColors: Record<string, string> = {
  draft: 'var(--warn)',
  scheduled: 'var(--primary-500)',
  published: 'var(--ok)',
  failed: 'var(--danger, #ef4444)',
}

interface DaySlot {
  date: Date
  isToday: boolean
  isPast: boolean
  posts: ScheduledPost[]
}

interface PlatformGroup {
  platform: Platform
  posts: ScheduledPost[]
}

function groupByPlatform(posts: ScheduledPost[]): PlatformGroup[] {
  const map = new Map<Platform, ScheduledPost[]>()
  for (const post of posts) {
    const arr = map.get(post.platform) || []
    arr.push(post)
    map.set(post.platform, arr)
  }
  return Array.from(map, ([platform, posts]) => ({ platform, posts }))
}

function buildDays(startDate: Date, posts: ScheduledPost[]): DaySlot[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const days: DaySlot[] = []
  for (let i = 0; i < DAY_COUNT; i++) {
    const date = new Date(startDate)
    date.setDate(date.getDate() + i)
    date.setHours(0, 0, 0, 0)

    const dayPosts = posts.filter((post) => {
      const pd = new Date(post.scheduledDate)
      return (
        pd.getFullYear() === date.getFullYear() &&
        pd.getMonth() === date.getMonth() &&
        pd.getDate() === date.getDate()
      )
    })

    days.push({
      date,
      isToday: date.getTime() === today.getTime(),
      isPast: date < today,
      posts: dayPosts,
    })
  }
  return days
}

function formatRange(start: Date, count: number): string {
  const end = new Date(start)
  end.setDate(end.getDate() + count - 1)

  const startMonth = start.toLocaleString('default', { month: 'short' })
  const endMonth = end.toLocaleString('default', { month: 'short' })

  if (start.getMonth() === end.getMonth()) {
    return `${startMonth} ${start.getDate()} – ${end.getDate()}`
  }
  return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}`
}

export function SomiCalendar({ posts, startDate, onAddPost, onSelectPost, onNavigate, loading }: SomiCalendarProps) {
  const days = useMemo(() => buildDays(startDate, posts), [startDate, posts])

  const rangeLabel = formatRange(startDate, DAY_COUNT)

  return (
    <div className="somi-calendar">
      <div className="somi-calendar__header">
        <button className="btn btn-ghost" onClick={() => onNavigate?.('prev')} title="Previous week">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div className="somi-calendar__title">
          <h3>{rangeLabel}</h3>
          <button className="btn btn-ghost" onClick={() => onNavigate?.('today')} style={{ fontSize: 12 }}>
            Today
          </button>
        </div>

        <button className="btn btn-ghost" onClick={() => onNavigate?.('next')} title="Next week">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className={`somi-calendar__grid ${loading ? 'somi-calendar__grid--loading' : ''}`}>
        {days.map((day, index) => (
          <div
            key={index}
            className={`somi-calendar__day ${
              day.isToday ? 'somi-calendar__day--today' : ''
            } ${day.isPast && !day.isToday ? 'somi-calendar__day--past' : ''}`}
          >
            <div className="somi-calendar__day-top">
              <div className="somi-calendar__day-label">
                <span className="somi-calendar__day-weekday">{WEEKDAY_SHORT[day.date.getDay()]}</span>
                <span className="somi-calendar__day-number">{day.date.getDate()}</span>
              </div>
              <button
                className="somi-calendar__day-add"
                onClick={() => onAddPost?.(day.date)}
                title="Schedule post"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
            {day.posts.length > 0 && (
              <div className="somi-calendar__day-icons">
                {groupByPlatform(day.posts).map((group) => (
                  <button
                    key={group.platform}
                    className="somi-calendar__icon"
                    onClick={() => onSelectPost?.(group.posts[0])}
                    title={`${group.posts.length} ${group.platform} post${group.posts.length > 1 ? 's' : ''}`}
                    style={{
                      backgroundColor: platformColors[group.platform],
                      borderBottom: `3px solid ${statusColors[group.posts[0].status] || statusColors.draft}`,
                    }}
                  >
                    <PlatformIcon platform={group.platform} size={14} />
                    {group.posts.length > 1 && (
                      <span className="somi-calendar__icon-badge">{group.posts.length}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
