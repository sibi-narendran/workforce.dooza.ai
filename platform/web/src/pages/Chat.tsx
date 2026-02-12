import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { employeesApi, type Employee, ApiError } from '../lib/api'
import { useAuthStore } from '../lib/store'
import { WorkspaceButton, WorkspacePanel } from '../components/workspace'
import { AgentAvatar, agentTagline } from '../components/AgentAvatar'
import { RoutinesPanel } from '../components/RoutinesPanel'
import { StreamingClient, sendStreamingChat, abortStreamingChat } from '../lib/streaming'
import { useChatStore, useChatMessages, useStreamingContent, useIsStreaming } from '../lib/chat-store'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Pre-process content before markdown rendering:
 * - Strip JSON image-metadata artifacts the LLM sometimes echoes
 */
function cleanContent(content: string): string {
  return content.replace(/\{\s*"image"\s*:\s*"[^"]*"\s*\}/g, '')
}

/** Custom img renderer for Supabase Storage images */
const markdownComponents = {
  img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img
      src={src}
      alt={alt || 'Generated image'}
      loading="lazy"
      style={{
        maxWidth: '100%',
        borderRadius: 'var(--radius-md)',
        margin: '8px 0',
        display: 'block',
      }}
      {...props}
    />
  ),
  // Open links in new tab
  a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} target="_blank" rel="noreferrer noopener" {...props}>
      {children}
    </a>
  ),
}

function MarkdownContent({ content }: { content: string }) {
  const cleaned = cleanContent(content)
  if (!cleaned.trim()) return null
  return (
    <div className="chat-text">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{cleaned}</ReactMarkdown>
    </div>
  )
}

export function Chat() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuthStore()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [lastError, setLastError] = useState<string | null>(null)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [routinesOpen, setRoutinesOpen] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const hasScrolledOnLoad = useRef(false)
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

  // Initialize chat state and load history from gateway
  useEffect(() => {
    if (!id) return
    initChat(id)

    if (!session?.accessToken) return
    employeesApi.history(session.accessToken, id).then((res) => {
      if (res.messages?.length) {
        useChatStore.getState().loadHistory(id, res.messages)
      }
    }).catch((err) => {
      console.error('[Chat] Failed to load history:', err)
    })
  }, [id, initChat, session?.accessToken])

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

    let cancelled = false
    const client = new StreamingClient(
      id,
      async () => {
        const store = useAuthStore.getState()
        if (store.shouldRefreshToken()) {
          await store.refreshSession()
        }
        const token = useAuthStore.getState().session?.accessToken
        if (!token) throw new Error('No token')
        return token
      },
      {
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
        if (!cancelled) {
          console.log('[Chat] SSE connected, session:', sessionKey)
          setIsConnected(true)
        }
      },
      onDisconnected: () => {
        if (!cancelled) {
          console.log('[Chat] SSE disconnected')
          setIsConnected(false)
        }
      },
    })

    client.connect()
    streamingClientRef.current = client

    return () => {
      cancelled = true
      client.disconnect()
      streamingClientRef.current = null
    }
  }, [session?.accessToken, id])

  // Scroll helpers
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    isNearBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 80
  }, [])

  // Instant jump on history load (no visible scroll animation)
  useEffect(() => {
    if (messages.length > 0 && !hasScrolledOnLoad.current) {
      hasScrolledOnLoad.current = true
      scrollToBottom('instant')
    }
  }, [messages, scrollToBottom])

  // During streaming: only scroll if user is near the bottom
  useEffect(() => {
    if (streamingContent && isNearBottomRef.current) {
      scrollToBottom('instant')
    }
  }, [streamingContent, scrollToBottom])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !session?.accessToken || !id) return

    const messageText = input.trim()
    setInput('')
    setLastError(null)

    // If currently streaming, abort the active run first
    const chatState = useChatStore.getState().chats[id]
    if (chatState?.isStreaming && chatState.currentRunId) {
      try {
        await abortStreamingChat(session.accessToken, id, chatState.currentRunId)
      } catch {
        // best-effort — continue even if abort fails
      }
      useChatStore.getState().abortStreaming(id)
    }

    // Add user message to store
    addUserMessage(id, messageText)
    isNearBottomRef.current = true
    scrollToBottom('smooth')

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
  }, [input, session?.accessToken, id, addUserMessage, startStreaming, scrollToBottom])

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
          to="/employees"
          style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
        </Link>

        {employee && (
          <AgentAvatar slug={employee.type} name={employee.name} size={40} />
        )}

        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-strong)' }}>
            {employee?.name || 'Unknown'}
          </h2>
          <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{employee ? agentTagline(employee.type) : ''}</span>
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
            setRoutinesOpen(!routinesOpen)
            setWorkspaceOpen(false)
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
          onToggle={() => {
            setWorkspaceOpen(!workspaceOpen)
            setRoutinesOpen(false)
          }}
        />
      </header>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
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
            <div style={{ marginBottom: 16 }}>
              {employee && (
                <AgentAvatar slug={employee.type} name={employee.name} size={64} />
              )}
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
                  <div style={{ lineHeight: 1.5 }}>
                    {msg.role === 'assistant'
                      ? <MarkdownContent content={msg.content} />
                      : <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>}
                  </div>
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
                  <div style={{ lineHeight: 1.5 }}>
                    <MarkdownContent content={streamingContent} />
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
            disabled={!input.trim()}
            style={{ padding: '12px 20px' }}
          >
            Send
          </button>
        </div>
      </div>

      <WorkspacePanel
        isOpen={workspaceOpen}
        onClose={() => setWorkspaceOpen(false)}
        employee={employee}
      />

      <RoutinesPanel
        isOpen={routinesOpen}
        onClose={() => setRoutinesOpen(false)}
        employeeId={id || ''}
        employeeName={employee?.name}
      />

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
