import { useState, useMemo, useEffect } from 'react'
import type { Employee } from '../../../lib/api'
import { integrationsApi } from '../../../lib/api'
import { useAuthStore } from '../../../lib/store'
import { usePosts, useCreatePost, useDeletePost, useApprovePost } from '../../../lib/queries'
import type { ScheduledPost, Platform } from './somi.types'
import { SomiCalendar } from './SomiCalendar'
import { SomiPostList } from './SomiPostList'

type StatusTab = 'scheduled' | 'approved'

interface SomiWorkspaceProps {
  employee: Employee | null
}

function displayStatus(status: string): string {
  switch (status) {
    case 'draft': return 'Draft'
    case 'scheduled': return 'Approved'
    case 'published': return 'Published'
    case 'failed': return 'Failed'
    default: return status
  }
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
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null)
  const [selectedDayPosts, setSelectedDayPosts] = useState<ScheduledPost[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [startDate, setStartDate] = useState(getToday)
  const [connectionPrompt, setConnectionPrompt] = useState<{ platform: string; providerSlug: string } | null>(null)
  const [activeTab, setActiveTab] = useState<StatusTab>('scheduled')
  const [copied, setCopied] = useState(false)
  const session = useAuthStore((s) => s.session)

  // The 14-day window may span 2 months — compute which months to fetch
  const monthsToFetch = useMemo(() => {
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + 13)
    const m1 = formatMonth(startDate)
    const m2 = formatMonth(endDate)
    return m1 === m2 ? [m1] : [m1, m2]
  }, [startDate])

  const { data: posts = [], isLoading: loading } = usePosts('somi', monthsToFetch)
  const createPost = useCreatePost('somi', monthsToFetch)
  const deletePost = useDeletePost('somi', monthsToFetch)
  const approvePost = useApprovePost('somi', monthsToFetch)

  const filteredPosts = useMemo(() => {
    const typed = posts as unknown as ScheduledPost[]
    if (activeTab === 'scheduled') {
      return typed.filter((p) => p.status === 'draft')
    }
    return typed.filter((p) => p.status === 'scheduled' || p.status === 'published' || p.status === 'failed')
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

  const handleSelectPost = (post: ScheduledPost, dayPosts: ScheduledPost[]) => {
    setSelectedPost(post)
    setSelectedDayPosts(dayPosts)
  }

  const selectedIndex = selectedPost ? selectedDayPosts.findIndex((p) => p.id === selectedPost.id) : -1
  const canNavPrev = selectedIndex > 0
  const canNavNext = selectedIndex >= 0 && selectedIndex < selectedDayPosts.length - 1

  const handleNavPost = (direction: 'prev' | 'next') => {
    const nextIndex = direction === 'prev' ? selectedIndex - 1 : selectedIndex + 1
    if (nextIndex >= 0 && nextIndex < selectedDayPosts.length) {
      setSelectedPost(selectedDayPosts[nextIndex])
    }
  }

  const handleCreatePost = async (title: string, content: string, platform: Platform, imageUrl: string) => {
    if (!selectedDate || !session?.accessToken || !employee) return

    try {
      await createPost.mutateAsync({
        agentSlug: 'somi',
        platform,
        title: title || undefined,
        content,
        imageUrl: imageUrl || undefined,
        scheduledDate: selectedDate.toISOString(),
        status: 'draft',
      })
      setShowAddModal(false)
      setSelectedDate(null)
    } catch (err) {
      console.error('Failed to create post:', err)
    }
  }

  const handleDeletePost = async (id: string) => {
    try {
      await deletePost.mutateAsync(id)
      const remaining = selectedDayPosts.filter((p) => p.id !== id)
      setSelectedDayPosts(remaining)
      if (remaining.length > 0) {
        setSelectedPost(remaining[Math.min(selectedIndex, remaining.length - 1)])
      } else {
        setSelectedPost(null)
      }
    } catch (err) {
      console.error('Failed to delete post:', err)
    }
  }

  const handleApprovePost = async (post: ScheduledPost) => {
    try {
      const result = await approvePost.mutateAsync(post.id)
      if (result.needsConnection && result.providerSlug && result.platform) {
        setConnectionPrompt({ platform: result.platform, providerSlug: result.providerSlug })
      } else if (result.error) {
        alert(result.error)
      } else if (result.post) {
        setSelectedPost(null)
      }
    } catch (err) {
      console.error('Failed to approve post:', err)
      alert(err instanceof Error ? err.message : 'Failed to approve post')
    }
  }

  useEffect(() => {
    setCopied(false)
  }, [selectedPost?.id])

  const handleConnectPlatform = async () => {
    if (!session?.accessToken || !connectionPrompt) return
    try {
      const { redirectUrl } = await integrationsApi.connect(session.accessToken, connectionPrompt.providerSlug)
      if (redirectUrl) {
        window.open(redirectUrl, '_blank', 'noopener')
      }
      setConnectionPrompt(null)
    } catch (err) {
      console.error('Failed to connect platform:', err)
      alert(err instanceof Error ? err.message : 'Failed to connect')
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
          Drafts
          <span className="somi-tabs__count">{(posts as unknown as ScheduledPost[]).filter((p) => p.status === 'draft').length}</span>
        </button>
        <button
          className={`somi-tabs__tab ${activeTab === 'approved' ? 'somi-tabs__tab--active' : ''}`}
          onClick={() => setActiveTab('approved')}
        >
          Approved
          <span className="somi-tabs__count">{(posts as unknown as ScheduledPost[]).filter((p) => p.status === 'scheduled' || p.status === 'published' || p.status === 'failed').length}</span>
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
                    <option value="instagram">Instagram</option>
                    <option value="facebook">Facebook</option>
                    <option value="linkedin">LinkedIn</option>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {selectedDayPosts.length > 1 && (
                  <div className="somi-modal__nav">
                    <button
                      className="btn btn-ghost somi-modal__nav-btn"
                      onClick={() => handleNavPost('prev')}
                      disabled={!canNavPrev}
                      title="Previous post"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    </button>
                    <span className="somi-modal__nav-count">{selectedIndex + 1}/{selectedDayPosts.length}</span>
                    <button
                      className="btn btn-ghost somi-modal__nav-btn"
                      onClick={() => handleNavPost('next')}
                      disabled={!canNavNext}
                      title="Next post"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>
                  </div>
                )}
                <button
                  className="btn btn-ghost"
                  onClick={() => setSelectedPost(null)}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
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
                  {displayStatus(selectedPost.status)}
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
                {selectedPost.status === 'draft' && (
                  <button
                    className="btn btn-primary"
                    onClick={() => handleApprovePost(selectedPost)}
                    disabled={approvePost.isPending}
                  >
                    {approvePost.isPending ? 'Approving...' : 'Approve'}
                  </button>
                )}
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedPost.content)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                >
                  {copied ? 'Copied!' : 'Copy Content'}
                </button>
                {selectedPost.imageUrl && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      fetch(selectedPost.imageUrl!)
                        .then((res) => res.blob())
                        .then((blob) => {
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `somi-${selectedPost.platform}-${selectedPost.id}.jpg`
                          document.body.appendChild(a)
                          a.click()
                          document.body.removeChild(a)
                          URL.revokeObjectURL(url)
                        })
                    }}
                  >
                    Download Image
                  </button>
                )}
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
      {/* Connection Prompt Modal */}
      {connectionPrompt && (
        <div className="somi-modal-overlay" onClick={() => setConnectionPrompt(null)}>
          <div className="somi-modal" onClick={(e) => e.stopPropagation()}>
            <div className="somi-modal__header">
              <h4>Connect {connectionPrompt.platform}</h4>
              <button
                className="btn btn-ghost"
                onClick={() => setConnectionPrompt(null)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="somi-modal__body">
              <p style={{ marginBottom: 16 }}>
                Connect your {connectionPrompt.platform} account to approve and auto-publish posts.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={handleConnectPlatform}>
                  Connect {connectionPrompt.platform}
                </button>
                <button className="btn btn-ghost" onClick={() => setConnectionPrompt(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
