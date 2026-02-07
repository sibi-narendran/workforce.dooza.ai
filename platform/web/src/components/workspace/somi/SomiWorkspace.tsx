import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Employee } from '../../../lib/api'
import { postsApi } from '../../../lib/api'
import { useAuthStore } from '../../../lib/store'
import type { ScheduledPost, Platform } from './somi.types'
import { SomiCalendar } from './SomiCalendar'
import { SomiPostList } from './SomiPostList'

type StatusTab = 'scheduled' | 'approved'

interface SomiWorkspaceProps {
  employee: Employee | null
}

function getToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function formatMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function SomiWorkspace({ employee }: SomiWorkspaceProps) {
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [startDate, setStartDate] = useState(getToday)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<StatusTab>('scheduled')
  const session = useAuthStore((s) => s.session)

  // The 14-day window may span 2 months — compute which months to fetch
  const monthsToFetch = useMemo(() => {
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + 13)
    const m1 = formatMonth(startDate)
    const m2 = formatMonth(endDate)
    return m1 === m2 ? [m1] : [m1, m2]
  }, [startDate])

  const fetchPosts = useCallback(async () => {
    if (!session?.accessToken || !employee) return
    setLoading(true)
    try {
      const results = await Promise.all(
        monthsToFetch.map((month) =>
          postsApi.list(session.accessToken, { month, agentSlug: 'somi' })
        )
      )
      // Merge and dedupe by id
      const all = results.flatMap((r) => r.posts)
      const unique = Array.from(new Map(all.map((p) => [p.id, p])).values())
      setPosts(unique as unknown as ScheduledPost[])
    } catch (err) {
      console.error('Failed to fetch posts:', err)
    } finally {
      setLoading(false)
    }
  }, [session?.accessToken, employee, monthsToFetch])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  const filteredPosts = useMemo(() => {
    if (activeTab === 'scheduled') {
      return posts.filter((p) => p.status === 'draft' || p.status === 'scheduled')
    }
    return posts.filter((p) => p.status === 'published')
  }, [posts, activeTab])

  const handleNavigate = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setStartDate(getToday())
    } else {
      const shift = direction === 'next' ? 7 : -7
      setStartDate((prev) => {
        const d = new Date(prev)
        d.setDate(d.getDate() + shift)
        return d
      })
    }
  }

  const handleAddPost = (date: Date) => {
    setSelectedDate(date)
    setShowAddModal(true)
  }

  const handleSelectPost = (post: ScheduledPost) => {
    setSelectedPost(post)
  }

  const handleCreatePost = async (title: string, content: string, platform: Platform, imageUrl: string) => {
    if (!selectedDate || !session?.accessToken || !employee) return

    try {
      const { post } = await postsApi.create(session.accessToken, {
        agentSlug: 'somi',
        platform,
        title: title || undefined,
        content,
        imageUrl: imageUrl || undefined,
        scheduledDate: selectedDate.toISOString(),
        status: 'draft',
      })
      setPosts((prev) => [...prev, post as unknown as ScheduledPost])
      setShowAddModal(false)
      setSelectedDate(null)
    } catch (err) {
      console.error('Failed to create post:', err)
    }
  }

  const handleDeletePost = async (id: string) => {
    if (!session?.accessToken) return
    try {
      await postsApi.delete(session.accessToken, id)
      setPosts((prev) => prev.filter((p) => p.id !== id))
      setSelectedPost(null)
    } catch (err) {
      console.error('Failed to delete post:', err)
    }
  }

  return (
    <div className="somi-workspace">
      <div className="somi-workspace__header">
        <h3>Content Calendar</h3>
      </div>

      <div className="somi-tabs">
        <button
          className={`somi-tabs__tab ${activeTab === 'scheduled' ? 'somi-tabs__tab--active' : ''}`}
          onClick={() => setActiveTab('scheduled')}
        >
          Scheduled
          <span className="somi-tabs__count">{posts.filter((p) => p.status === 'draft' || p.status === 'scheduled').length}</span>
        </button>
        <button
          className={`somi-tabs__tab ${activeTab === 'approved' ? 'somi-tabs__tab--active' : ''}`}
          onClick={() => setActiveTab('approved')}
        >
          Approved
          <span className="somi-tabs__count">{posts.filter((p) => p.status === 'published').length}</span>
        </button>
      </div>

      <SomiCalendar
        posts={filteredPosts}
        startDate={startDate}
        onAddPost={handleAddPost}
        onSelectPost={handleSelectPost}
        onNavigate={handleNavigate}
        loading={loading}
      />

      <SomiPostList posts={filteredPosts} onSelectPost={handleSelectPost} />

      {/* Add Post Modal */}
      {showAddModal && (
        <div className="somi-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="somi-modal" onClick={(e) => e.stopPropagation()}>
            <div className="somi-modal__header">
              <h4>Schedule Post</h4>
              <button
                className="btn btn-ghost"
                onClick={() => setShowAddModal(false)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="somi-modal__body">
              <p style={{ marginBottom: 12, color: 'var(--muted)' }}>
                {selectedDate?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const form = e.target as HTMLFormElement
                  const title = (form.elements.namedItem('title') as HTMLInputElement).value
                  const content = (form.elements.namedItem('content') as HTMLTextAreaElement).value
                  const platform = (form.elements.namedItem('platform') as HTMLSelectElement).value as Platform
                  const imageUrl = (form.elements.namedItem('imageUrl') as HTMLInputElement).value
                  handleCreatePost(title, content, platform, imageUrl)
                }}
              >
                <div className="form-group">
                  <label className="form-label">Title</label>
                  <input
                    name="title"
                    className="input"
                    placeholder="Short title for calendar"
                  />
                </div>
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Content</label>
                  <textarea
                    name="content"
                    className="input"
                    placeholder="Post caption / body text"
                    required
                    rows={4}
                    style={{ resize: 'vertical' }}
                  />
                </div>
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Platform</label>
                  <select name="platform" className="input">
                    <option value="youtube">YouTube</option>
                    <option value="instagram">Instagram</option>
                    <option value="facebook">Facebook</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="tiktok">TikTok</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Image URL (optional)</label>
                  <input
                    name="imageUrl"
                    className="input"
                    placeholder="https://..."
                    type="url"
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ marginTop: 16, width: '100%' }}>
                  Create Post
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Post Detail Modal */}
      {selectedPost && (
        <div className="somi-modal-overlay" onClick={() => setSelectedPost(null)}>
          <div className="somi-modal" onClick={(e) => e.stopPropagation()}>
            <div className="somi-modal__header">
              <h4>{selectedPost.title || selectedPost.content.slice(0, 40)}</h4>
              <button
                className="btn btn-ghost"
                onClick={() => setSelectedPost(null)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="somi-modal__body">
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <span className="badge badge-primary">{selectedPost.platform}</span>
                <span className={`badge ${
                  selectedPost.status === 'published' ? 'badge-ok' :
                  selectedPost.status === 'scheduled' ? 'badge-primary' :
                  selectedPost.status === 'failed' ? 'badge-danger' :
                  'badge-warn'
                }`}>
                  {selectedPost.status}
                </span>
              </div>
              <p style={{ color: 'var(--muted)', marginBottom: 12 }}>
                {new Date(selectedPost.scheduledDate).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
              <p style={{ marginBottom: 16, whiteSpace: 'pre-wrap' }}>{selectedPost.content}</p>
              {selectedPost.imageUrl && (
                <div style={{ marginBottom: 16 }}>
                  <img
                    src={selectedPost.imageUrl}
                    alt="Post image"
                    style={{ maxWidth: '100%', borderRadius: 8, maxHeight: 200, objectFit: 'cover' }}
                  />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-danger"
                  onClick={() => handleDeletePost(selectedPost.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
