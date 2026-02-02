import { useState } from 'react'
import type { ScheduledPost } from './somi.types'
import { SomiCalendar } from './SomiCalendar'

// Mock data for demo
const initialPosts: ScheduledPost[] = [
  {
    id: '1',
    title: 'Product launch',
    content: 'Announcing our new feature!',
    platform: 'twitter',
    scheduledDate: new Date(Date.now() + 86400000 * 2),
    status: 'scheduled',
  },
  {
    id: '2',
    title: 'Behind the scenes',
    content: 'Check out our team at work',
    platform: 'instagram',
    scheduledDate: new Date(Date.now() + 86400000 * 3),
    status: 'draft',
  },
  {
    id: '3',
    title: 'Industry insights',
    content: 'Our thoughts on the latest trends',
    platform: 'linkedin',
    scheduledDate: new Date(),
    status: 'published',
  },
]

export function SomiWorkspace() {
  const [posts, setPosts] = useState<ScheduledPost[]>(initialPosts)
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const handleAddPost = (date: Date) => {
    setSelectedDate(date)
    setShowAddModal(true)
  }

  const handleSelectPost = (post: ScheduledPost) => {
    setSelectedPost(post)
  }

  const handleCreatePost = (title: string, platform: ScheduledPost['platform']) => {
    if (!selectedDate) return

    const newPost: ScheduledPost = {
      id: crypto.randomUUID(),
      title,
      content: '',
      platform,
      scheduledDate: selectedDate,
      status: 'draft',
    }
    setPosts((prev) => [...prev, newPost])
    setShowAddModal(false)
    setSelectedDate(null)
  }

  const handleDeletePost = (id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id))
    setSelectedPost(null)
  }

  return (
    <div className="somi-workspace">
      <div className="somi-workspace__header">
        <h3>Content Calendar</h3>
        <div className="somi-workspace__stats">
          <span className="badge badge-primary">{posts.filter((p) => p.status === 'scheduled').length} scheduled</span>
          <span className="badge badge-warn">{posts.filter((p) => p.status === 'draft').length} drafts</span>
        </div>
      </div>

      <SomiCalendar
        posts={posts}
        onAddPost={handleAddPost}
        onSelectPost={handleSelectPost}
      />

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
                  const platform = (form.elements.namedItem('platform') as HTMLSelectElement).value as ScheduledPost['platform']
                  handleCreatePost(title, platform)
                }}
              >
                <div className="form-group">
                  <label className="form-label">Title</label>
                  <input
                    name="title"
                    className="input"
                    placeholder="Post title"
                    required
                    autoFocus
                  />
                </div>
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Platform</label>
                  <select name="platform" className="input">
                    <option value="twitter">Twitter</option>
                    <option value="instagram">Instagram</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="facebook">Facebook</option>
                  </select>
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
              <h4>{selectedPost.title}</h4>
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
                  'badge-warn'
                }`}>
                  {selectedPost.status}
                </span>
              </div>
              <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
                {selectedPost.scheduledDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
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
