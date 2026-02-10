export type Platform = 'instagram' | 'facebook' | 'linkedin'

export type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed'

export interface ScheduledPost {
  id: string
  tenantId: string
  agentSlug: string | null
  platform: Platform
  title: string | null
  content: string
  imageUrl: string | null
  scheduledDate: string // ISO from API
  status: PostStatus
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface CalendarDay {
  date: Date
  isCurrentMonth: boolean
  isToday: boolean
  posts: ScheduledPost[]
}
