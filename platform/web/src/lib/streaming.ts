/**
 * Streaming Client - SSE client for real-time chat
 *
 * Connects to the platform's SSE endpoint and delivers
 * chat events (tokens, completion, errors) to callbacks.
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export interface ChatEvent {
  runId: string
  seq: number
  state: 'delta' | 'final' | 'aborted' | 'error' | 'connected'
  sessionKey?: string
  content?: string          // delta: streaming token
  message?: StreamMessage   // final: complete message
  error?: string            // error: error message
  usage?: TokenUsage
}

export interface StreamMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens?: number
}

export interface StreamingCallbacks {
  onToken?: (token: string, runId: string) => void
  onComplete?: (message: StreamMessage, runId: string, usage?: TokenUsage) => void
  onError?: (error: string, runId: string) => void
  onAborted?: (runId: string) => void
  onConnected?: (sessionKey: string) => void
  onDisconnected?: () => void
}

export class StreamingClient {
  private eventSource: EventSource | null = null
  private employeeId: string
  private token: string
  private callbacks: StreamingCallbacks
  private reconnectAttempt = 0
  private maxReconnectAttempts = 10
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private isManualClose = false

  constructor(employeeId: string, token: string, callbacks: StreamingCallbacks = {}) {
    this.employeeId = employeeId
    this.token = token
    this.callbacks = callbacks
  }

  /**
   * Connect to the SSE stream
   */
  connect(): void {
    if (this.eventSource) {
      return // Already connected
    }

    this.isManualClose = false
    const url = `${API_BASE}/stream/employee/${this.employeeId}?token=${encodeURIComponent(this.token)}`

    // Note: EventSource doesn't support custom headers, so we pass token as query param
    // The backend should accept both Authorization header and query param
    this.eventSource = new EventSource(url, { withCredentials: true })

    this.eventSource.onopen = () => {
      console.log('[StreamingClient] Connected')
      this.reconnectAttempt = 0
    }

    // Listen for specific event types
    this.eventSource.addEventListener('connected', (e) => {
      const event = JSON.parse((e as MessageEvent).data) as ChatEvent
      console.log('[StreamingClient] Session connected:', event.sessionKey)
      this.callbacks.onConnected?.(event.sessionKey || '')
    })

    this.eventSource.addEventListener('delta', (e) => {
      const event = JSON.parse((e as MessageEvent).data) as ChatEvent
      if (event.content) {
        this.callbacks.onToken?.(event.content, event.runId)
      }
    })

    this.eventSource.addEventListener('final', (e) => {
      const event = JSON.parse((e as MessageEvent).data) as ChatEvent
      if (event.message) {
        this.callbacks.onComplete?.(event.message, event.runId, event.usage)
      }
    })

    this.eventSource.addEventListener('error', (e) => {
      // This could be an SSE error event or our custom error event
      if ((e as MessageEvent).data) {
        const event = JSON.parse((e as MessageEvent).data) as ChatEvent
        this.callbacks.onError?.(event.error || 'Unknown error', event.runId)
      }
    })

    this.eventSource.addEventListener('aborted', (e) => {
      const event = JSON.parse((e as MessageEvent).data) as ChatEvent
      this.callbacks.onAborted?.(event.runId)
    })

    this.eventSource.onerror = () => {
      console.log('[StreamingClient] Connection error')

      if (this.isManualClose) {
        return
      }

      // Close and attempt reconnect
      this.eventSource?.close()
      this.eventSource = null
      this.callbacks.onDisconnected?.()
      this.scheduleReconnect()
    }
  }

  /**
   * Schedule reconnection with exponential backoff and jitter
   */
  private scheduleReconnect(): void {
    if (this.isManualClose) {
      return
    }

    if (this.reconnectAttempt >= this.maxReconnectAttempts) {
      console.error('[StreamingClient] Max reconnect attempts reached')
      return
    }

    // Exponential backoff with jitter
    const baseDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30000)
    const jitter = baseDelay * 0.3 * (Math.random() * 2 - 1)
    const delay = baseDelay + jitter

    console.log(`[StreamingClient] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempt + 1})`)

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempt++
      this.connect()
    }, delay)
  }

  /**
   * Disconnect from the stream
   */
  disconnect(): void {
    this.isManualClose = true

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
      console.log('[StreamingClient] Disconnected')
    }
  }

  /**
   * Update callbacks
   */
  setCallbacks(callbacks: StreamingCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN
  }
}

/**
 * Send a streaming chat message
 * Returns immediately with runId, events delivered via SSE
 */
export async function sendStreamingChat(
  token: string,
  employeeId: string,
  message: string,
  thinking?: string
): Promise<{ runId: string; sessionKey: string }> {
  const response = await fetch(`${API_BASE}/stream/employee/${employeeId}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message, thinking }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Failed to send message')
  }

  const data = await response.json()
  return {
    runId: data.runId,
    sessionKey: data.sessionKey,
  }
}

/**
 * Alternative: Send via conversations endpoint with stream=true
 */
export async function sendStreamingChatAlt(
  token: string,
  employeeId: string,
  message: string,
  thinking?: string
): Promise<{ runId: string; sessionKey: string }> {
  const response = await fetch(`${API_BASE}/conversations/employee/${employeeId}/chat?stream=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message, thinking }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Failed to send message')
  }

  const data = await response.json()
  return {
    runId: data.runId,
    sessionKey: data.sessionKey,
  }
}
