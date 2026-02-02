export interface ScheduledPost {
  id: string
  title: string
  content: string
  platform: 'twitter' | 'instagram' | 'linkedin' | 'facebook'
  scheduledDate: Date
  status: 'draft' | 'scheduled' | 'published'
}

export interface CalendarDay {
  date: Date
  isCurrentMonth: boolean
  isToday: boolean
  posts: ScheduledPost[]
}
