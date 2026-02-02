import { useState, useMemo } from 'react'
import type { ScheduledPost, CalendarDay } from './somi.types'
import { SomiPostCard } from './SomiPostCard'

interface SomiCalendarProps {
  posts: ScheduledPost[]
  onAddPost?: (date: Date) => void
  onSelectPost?: (post: ScheduledPost) => void
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getCalendarDays(year: number, month: number, posts: ScheduledPost[]): CalendarDay[] {
  const firstDay = new Date(year, month, 1)
  const startDate = new Date(firstDay)
  startDate.setDate(startDate.getDate() - firstDay.getDay())

  const days: CalendarDay[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 0; i < 42; i++) {
    const date = new Date(startDate)
    date.setDate(date.getDate() + i)

    const dayPosts = posts.filter((post) => {
      const postDate = new Date(post.scheduledDate)
      return (
        postDate.getFullYear() === date.getFullYear() &&
        postDate.getMonth() === date.getMonth() &&
        postDate.getDate() === date.getDate()
      )
    })

    days.push({
      date,
      isCurrentMonth: date.getMonth() === month,
      isToday: date.getTime() === today.getTime(),
      posts: dayPosts,
    })
  }

  return days
}

export function SomiCalendar({ posts, onAddPost, onSelectPost }: SomiCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const calendarDays = useMemo(
    () => getCalendarDays(year, month, posts),
    [year, month, posts]
  )

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  return (
    <div className="somi-calendar">
      <div className="somi-calendar__header">
        <button className="btn btn-ghost" onClick={goToPrevMonth} title="Previous month">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div className="somi-calendar__title">
          <h3>{monthName}</h3>
          <button className="btn btn-ghost" onClick={goToToday} style={{ fontSize: 12 }}>
            Today
          </button>
        </div>

        <button className="btn btn-ghost" onClick={goToNextMonth} title="Next month">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className="somi-calendar__weekdays">
        {WEEKDAYS.map((day) => (
          <div key={day} className="somi-calendar__weekday">
            {day}
          </div>
        ))}
      </div>

      <div className="somi-calendar__grid">
        {calendarDays.map((day, index) => (
          <div
            key={index}
            className={`somi-calendar__day ${
              !day.isCurrentMonth ? 'somi-calendar__day--outside' : ''
            } ${day.isToday ? 'somi-calendar__day--today' : ''}`}
            onClick={() => onAddPost?.(day.date)}
          >
            <span className="somi-calendar__day-number">{day.date.getDate()}</span>
            <div className="somi-calendar__day-posts">
              {day.posts.slice(0, 2).map((post) => (
                <SomiPostCard
                  key={post.id}
                  post={post}
                  onClick={() => onSelectPost?.(post)}
                />
              ))}
              {day.posts.length > 2 && (
                <span className="somi-calendar__more">+{day.posts.length - 2} more</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
