import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { employeesApi, conversationsApi, type Employee, ApiError } from '../lib/api'
import { useAuthStore } from '../lib/store'
import { WorkspaceButton, WorkspacePanel } from '../components/workspace'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isError?: boolean
  canRetry?: boolean
}

export function Chat() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuthStore()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [showRoutinesToast, setShowRoutinesToast] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!session?.accessToken || !id) return

    employeesApi
      .get(session.accessToken, id)
      .then((res) => setEmployee(res.employee))
      .catch((err) => {
        console.error('Failed to load employee:', err)
        setLastError(err instanceof ApiError ? err.message : 'Failed to load employee')
      })
      .finally(() => setLoading(false))
  }, [session?.accessToken, id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async (messageText: string) => {
    if (!session?.accessToken || !id) return

    const userMessage: Message = {
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    }

    // Optimistic update - add user message immediately
    setMessages((prev) => [...prev, userMessage])
    setSending(true)
    setLastError(null)
    setPendingMessage(messageText)

    try {
      const response = await conversationsApi.chat(session.accessToken, id, messageText)

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
      setPendingMessage(null)
    } catch (error) {
      const errorMsg = error instanceof ApiError ? error.message : 'Failed to get response'
      setLastError(errorMsg)

      const errorMessage: Message = {
        role: 'assistant',
        content: `Error: ${errorMsg}`,
        timestamp: new Date(),
        isError: true,
        canRetry: true,
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setSending(false)
    }
  }, [session?.accessToken, id])

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return
    const messageText = input.trim()
    setInput('')
    await sendMessage(messageText)
  }, [input, sending, sendMessage])

  const handleRetry = useCallback(async () => {
    if (!pendingMessage || sending) return

    // Remove the last error message
    setMessages((prev) => {
      const newMessages = [...prev]
      if (newMessages.length > 0 && newMessages[newMessages.length - 1].isError) {
        newMessages.pop()
      }
      // Also remove the user message that failed
      if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'user') {
        newMessages.pop()
      }
      return newMessages
    })

    await sendMessage(pendingMessage)
  }, [pendingMessage, sending, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="loading" />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '16px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--panel-strong)',
        }}
      >
        <Link
          to={`/employees/${id}`}
          style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
        </Link>

        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--radius-md)',
            background: 'var(--accent-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent)',
            fontWeight: 600,
          }}
        >
          {employee?.name?.[0]?.toUpperCase() || '?'}
        </div>

        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-strong)' }}>
            {employee?.name || 'Unknown'}
          </h2>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{employee?.type}</div>
        </div>

        <button
          className="workspace-btn"
          onClick={() => {
            setShowRoutinesToast(true)
            setTimeout(() => setShowRoutinesToast(false), 3000)
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>Routines</span>
        </button>

        <WorkspaceButton
          isOpen={workspaceOpen}
          onToggle={() => setWorkspaceOpen(!workspaceOpen)}
        />
      </header>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--muted)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 'var(--radius-lg)',
                background: 'var(--accent-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
                fontSize: 24,
                fontWeight: 600,
                marginBottom: 16,
              }}
            >
              {employee?.name?.[0]?.toUpperCase() || '?'}
            </div>
            <h3 style={{ margin: '0 0 8px', color: 'var(--text-strong)' }}>
              Start a conversation with {employee?.name}
            </h3>
            <p style={{ margin: 0, maxWidth: 400 }}>{employee?.description}</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: '70%',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-lg)',
                  background: msg.isError
                    ? 'rgba(239, 68, 68, 0.1)'
                    : msg.role === 'user'
                      ? 'var(--accent)'
                      : 'var(--card)',
                  color: msg.isError
                    ? '#ef4444'
                    : msg.role === 'user'
                      ? 'white'
                      : 'var(--text)',
                  border: msg.isError
                    ? '1px solid rgba(239, 68, 68, 0.3)'
                    : msg.role === 'assistant'
                      ? '1px solid var(--border)'
                      : 'none',
                }}
              >
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{msg.content}</div>
                <div
                  style={{
                    fontSize: 10,
                    marginTop: 8,
                    opacity: 0.7,
                  }}
                >
                  {msg.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))
        )}

        {sending && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div className="loading" style={{ width: 16, height: 16 }} />
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>Thinking...</span>
            </div>
          </div>
        )}

        {lastError && !sending && pendingMessage && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            <button
              className="btn"
              onClick={handleRetry}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                background: 'var(--accent-subtle)',
                color: 'var(--accent)',
                border: '1px solid var(--accent)',
              }}
            >
              Retry
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: 24,
          borderTop: '1px solid var(--border)',
          background: 'var(--panel)',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 12,
            maxWidth: 800,
            margin: '0 auto',
          }}
        >
          <textarea
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${employee?.name || 'employee'}...`}
            rows={1}
            style={{
              flex: 1,
              resize: 'none',
              minHeight: 44,
              maxHeight: 120,
            }}
          />
          <button
            className="btn"
            onClick={handleSend}
            disabled={!input.trim() || sending}
            style={{ padding: '12px 20px' }}
          >
            {sending ? <div className="loading" style={{ width: 18, height: 18 }} /> : 'Send'}
          </button>
        </div>
      </div>

      <WorkspacePanel
        isOpen={workspaceOpen}
        onClose={() => setWorkspaceOpen(false)}
        employee={employee}
      />

      {/* Routines Coming Soon Toast */}
      {showRoutinesToast && (
        <div className="toast">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>Routines feature coming this week!</span>
        </div>
      )}
    </div>
  )
}
