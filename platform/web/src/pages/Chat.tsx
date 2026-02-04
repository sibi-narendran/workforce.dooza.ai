import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { employeesApi, type Employee, ApiError } from '../lib/api'
import { useAuthStore } from '../lib/store'
import { WorkspaceButton, WorkspacePanel } from '../components/workspace'
import { StreamingClient, sendStreamingChat } from '../lib/streaming'
import { useChatStore, useChatMessages, useStreamingContent, useIsStreaming } from '../lib/chat-store'

export function Chat() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuthStore()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [lastError, setLastError] = useState<string | null>(null)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [showRoutinesToast, setShowRoutinesToast] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const streamingClientRef = useRef<StreamingClient | null>(null)

  // Chat store
  const messages = useChatMessages(id || '')
  const streamingContent = useStreamingContent(id || '')
  const isStreaming = useIsStreaming(id || '')
  const {
    initChat,
    addUserMessage,
    startStreaming,
  } = useChatStore()

  // Initialize chat state
  useEffect(() => {
    if (id) {
      initChat(id)
    }
  }, [id, initChat])

  // Load employee data
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

  // Setup streaming client
  // Note: Using useChatStore.getState() in callbacks to avoid effect re-runs
  // when store actions change (Zustand's recommended pattern for non-reactive access)
  useEffect(() => {
    if (!session?.accessToken || !id) return

    const client = new StreamingClient(id, session.accessToken, {
      onToken: (token) => {
        useChatStore.getState().appendToken(id, token)
      },
      onComplete: (message, runId, usage) => {
        useChatStore.getState().finalizeMessage(id, message, usage, runId)
      },
      onError: (error, runId) => {
        useChatStore.getState().setError(id, runId, `Error: ${error}`)
      },
      onAborted: () => {
        useChatStore.getState().abortStreaming(id)
      },
      onConnected: (sessionKey) => {
        console.log('[Chat] SSE connected, session:', sessionKey)
        setIsConnected(true)
      },
      onDisconnected: () => {
        console.log('[Chat] SSE disconnected')
        setIsConnected(false)
      },
    })

    client.connect()
    streamingClientRef.current = client

    return () => {
      client.disconnect()
      streamingClientRef.current = null
    }
  }, [session?.accessToken, id])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming || !session?.accessToken || !id) return

    const messageText = input.trim()
    setInput('')
    setLastError(null)

    // Add user message to store
    addUserMessage(id, messageText)

    try {
      // Send message via streaming endpoint
      const { runId } = await sendStreamingChat(session.accessToken, id, messageText)

      // Mark as streaming - events will come via SSE
      startStreaming(id, runId)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to send message'
      setLastError(errorMsg)
      useChatStore.getState().setError(id, 'send-error', `Error: ${errorMsg}`)
    }
  }, [input, isStreaming, session?.accessToken, id, addUserMessage, startStreaming])

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
          <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{employee?.type}</span>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: isConnected ? '#22c55e' : '#ef4444',
              }}
              title={isConnected ? 'Connected' : 'Disconnected'}
            />
          </div>
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
        {messages.length === 0 && !streamingContent ? (
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
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
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
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>{msg.timestamp.toLocaleTimeString()}</span>
                    {msg.usage && (
                      <span style={{ marginLeft: 8 }}>
                        {msg.usage.inputTokens + msg.usage.outputTokens} tokens
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Streaming content indicator */}
            {streamingContent && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div
                  style={{
                    maxWidth: '70%',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                    {streamingContent}
                    <span
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 16,
                        background: 'var(--accent)',
                        marginLeft: 2,
                        animation: 'blink 1s infinite',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Loading indicator when streaming but no content yet */}
            {isStreaming && !streamingContent && (
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
          </>
        )}

        {lastError && !isStreaming && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            <span style={{ color: '#ef4444', fontSize: 13 }}>{lastError}</span>
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
            disabled={!input.trim() || isStreaming}
            style={{ padding: '12px 20px' }}
          >
            {isStreaming ? <div className="loading" style={{ width: 18, height: 18 }} /> : 'Send'}
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

      {/* Cursor blink animation */}
      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
