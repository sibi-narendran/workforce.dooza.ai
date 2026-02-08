/**
 * Gateway WebSocket Client - Persistent WebSocket connection to clawdbot gateway
 *
 * Builds on the gateway-rpc.ts patterns:
 * - Challenge-response WebSocket auth
 * - RPC request/response handling
 * - Chat event streaming
 * - Exponential backoff reconnection
 */
import { WebSocket } from 'ws'
import { randomUUID } from 'crypto'
import { env } from '../lib/env.js'
import { eventRouter } from './event-router.js'
import type { ChatEvent, ChatSendParams, GatewayChatEvent, ChatCallback, CronJob, CronJobCreate, CronJobPatch } from './types.js'

const GATEWAY_TOKEN = env.CLAWDBOT_HOOK_TOKEN

interface RpcRequest {
  type: 'req'
  id: string
  method: string
  params: Record<string, unknown>
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

interface ChatSendResponse {
  runId: string
  status: string
}

export class GatewayWSClient {
  private ws: WebSocket | null = null
  private tenantId: string
  private gatewayUrl: string
  private connected = false
  private connecting = false
  private reconnectAttempt = 0
  private maxReconnectAttempts = 10
  private pendingRequests = new Map<string, PendingRequest>()
  private chatCallbacks = new Map<string, ChatCallback>()
  private runIdToSession = new Map<string, string>() // runId -> sessionKey
  private lastActivity = Date.now()
  private reconnectTimeout: NodeJS.Timeout | null = null

  constructor(tenantId: string, gatewayUrl: string) {
    this.tenantId = tenantId
    this.gatewayUrl = gatewayUrl
  }

  /**
   * Connect to the gateway
   */
  async connect(): Promise<void> {
    if (this.connected || this.connecting) return

    this.connecting = true
    const wsUrl = this.gatewayUrl.replace(/^http/, 'ws') + '/ws'

    return new Promise((resolve, reject) => {
      console.log(`[GatewayWS:${this.tenantId}] Connecting to ${wsUrl}`)
      this.ws = new WebSocket(wsUrl, {
        headers: { 'X-Tenant-ID': this.tenantId }
      })

      const connectTimeout = setTimeout(() => {
        this.connecting = false
        reject(new Error('WebSocket connection timeout'))
        this.ws?.close()
      }, 10000)

      this.ws.on('open', () => {
        console.log(`[GatewayWS:${this.tenantId}] WebSocket connected, waiting for challenge...`)
      })

      this.ws.on('message', (data) => {
        try {
          this.lastActivity = Date.now()
          const frame = JSON.parse(data.toString())

          // Handle challenge event
          if (frame.type === 'event' && frame.event === 'connect.challenge') {
            this.handleChallenge()
            return
          }

          // Handle connect response (HelloOk)
          if (frame.type === 'res' && frame.ok === true && frame.payload?.type === 'hello-ok') {
            console.log(`[GatewayWS:${this.tenantId}] Handshake complete`)
            clearTimeout(connectTimeout)
            this.connected = true
            this.connecting = false
            this.reconnectAttempt = 0
            resolve()
            return
          }

          // Handle RPC responses
          if (frame.type === 'res') {
            this.handleRpcResponse(frame)
            return
          }

          // Handle chat events
          if (frame.type === 'event' && frame.event === 'chat') {
            this.handleChatEvent(frame.payload)
            return
          }
        } catch (error) {
          console.error(`[GatewayWS:${this.tenantId}] Failed to parse message:`, error)
        }
      })

      this.ws.on('error', (error) => {
        console.error(`[GatewayWS:${this.tenantId}] WebSocket error:`, error)
        clearTimeout(connectTimeout)
        this.connecting = false
        if (!this.connected) {
          reject(error)
        }
      })

      this.ws.on('close', () => {
        console.log(`[GatewayWS:${this.tenantId}] WebSocket closed`)
        this.connected = false
        this.connecting = false
        this.rejectAllPending('Connection closed')
        this.scheduleReconnect()
      })
    })
  }

  /**
   * Handle challenge from gateway
   */
  private handleChallenge(): void {
    console.log(`[GatewayWS:${this.tenantId}] Received challenge, sending connect request...`)
    const connectReq: RpcRequest = {
      type: 'req',
      id: randomUUID(),
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'gateway-client',  // Must be a valid clawdbot client ID
          displayName: 'Workforce Platform',
          version: '1.0.0',
          mode: 'backend',
          platform: 'node',
        },
        auth: {
          token: GATEWAY_TOKEN,
        },
        role: 'operator',
        scopes: ['operator.admin'],
      },
    }
    this.ws?.send(JSON.stringify(connectReq))
  }

  /**
   * Handle RPC response
   */
  private handleRpcResponse(frame: { id: string; ok: boolean; payload?: unknown; error?: { message: string } }): void {
    const pending = this.pendingRequests.get(frame.id)
    if (!pending) return

    clearTimeout(pending.timeout)
    this.pendingRequests.delete(frame.id)

    if (frame.ok) {
      pending.resolve(frame.payload)
    } else {
      pending.reject(new Error(frame.error?.message || 'RPC error'))
    }
  }

  /**
   * Handle chat event from gateway
   */
  private handleChatEvent(payload: GatewayChatEvent['payload']): void {
    const { runId, sessionKey } = payload

    // Log all events for debugging (verbose)
    console.log(`[GatewayWS:${this.tenantId}] Chat event: state=${payload.state}, runId=${runId?.substring(0, 8)}...`)
    if (payload.state === 'error') {
      console.error(`[GatewayWS:${this.tenantId}] Error payload:`, JSON.stringify(payload, null, 2))
    }

    // Store session key for this runId
    if (sessionKey && !this.runIdToSession.has(runId)) {
      this.runIdToSession.set(runId, sessionKey)
    }

    // Route to SSE connections via event router
    eventRouter.handleGatewayEvent(this.tenantId, payload)

    // Call registered callback if any
    const callback = this.chatCallbacks.get(runId)
    if (callback) {
      const chatEvent = this.transformToEvent(payload)
      callback(chatEvent)

      // Clean up on terminal states
      if (payload.state === 'final' || payload.state === 'aborted' || payload.state === 'error') {
        this.chatCallbacks.delete(runId)
        this.runIdToSession.delete(runId)
      }
    }
  }

  /**
   * Transform gateway payload to ChatEvent
   */
  private transformToEvent(payload: GatewayChatEvent['payload']): ChatEvent {
    const event: ChatEvent = {
      runId: payload.runId,
      seq: payload.seq,
      state: payload.state,
      sessionKey: payload.sessionKey,
    }

    if (payload.state === 'delta' && payload.message) {
      const content = payload.message.content
        .filter(p => p.type === 'text' || p.type === 'output_text')
        .map(p => p.text || '')
        .join('')
      if (content) {
        event.content = content
      }
    }

    if (payload.state === 'final' && payload.message) {
      const content = payload.message.content
        .filter(p => p.type === 'text' || p.type === 'output_text')
        .map(p => p.text || '')
        .join('')
      event.message = {
        role: payload.message.role as 'user' | 'assistant',
        content,
        timestamp: Date.now(),
      }
      if (payload.usage) {
        event.usage = {
          inputTokens: payload.usage.input,
          outputTokens: payload.usage.output,
          totalTokens: payload.usage.totalTokens,
        }
      }
    }

    // Always include error message for error state
    // Note: clawdbot gateway sends "errorMessage", not "error"
    if (payload.state === 'error') {
      event.error = payload.error || (payload as any).errorMessage || 'An error occurred while processing your message'
    }

    return event
  }

  /**
   * Send RPC request
   */
  private async rpc<T>(method: string, params: Record<string, unknown>, timeoutMs = 30000): Promise<T> {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }

    const id = randomUUID()
    const request: RpcRequest = {
      type: 'req',
      id,
      method,
      params,
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`RPC timeout: ${method}`))
      }, timeoutMs)

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      })

      this.ws!.send(JSON.stringify(request))
      this.lastActivity = Date.now()
    })
  }

  /**
   * Send a chat message and get runId
   * Events will be delivered via the event router to SSE connections
   */
  async sendChat(params: ChatSendParams): Promise<string> {
    if (!this.connected) {
      await this.connect()
    }

    const idempotencyKey = params.idempotencyKey || randomUUID()

    const response = await this.rpc<ChatSendResponse>('chat.send', {
      sessionKey: params.sessionKey,
      message: params.message,
      idempotencyKey,
      timeoutMs: params.timeoutMs || 120000,
    })

    return response.runId || idempotencyKey
  }

  /**
   * Register a callback for chat events for a specific runId
   */
  onChatEvent(runId: string, callback: ChatCallback): void {
    this.chatCallbacks.set(runId, callback)
  }

  /**
   * Abort a running chat
   */
  async abortChat(runId: string): Promise<void> {
    await this.rpc('chat.abort', { runId })
  }

  /**
   * Get chat history for a session
   */
  async getChatHistory(sessionKey: string, limit = 200): Promise<Array<{ role: string; content: string }>> {
    if (!this.connected) {
      await this.connect()
    }

    const response = await this.rpc<{ messages: Array<{ role: string; content: unknown }> }>('chat.history', {
      sessionKey,
      limit,
    })

    return response.messages.map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string'
        ? msg.content
        : (msg.content as Array<{ type: string; text?: string }>)
            .filter(p => p.type === 'text' || p.type === 'output_text')
            .map(p => p.text || '')
            .join(''),
    }))
  }

  // ============= Cron RPC Methods =============

  async cronList(): Promise<{ jobs: CronJob[] }> {
    if (!this.connected) await this.connect()
    return this.rpc<{ jobs: CronJob[] }>('cron.list', { includeDisabled: true })
  }

  async cronAdd(job: CronJobCreate): Promise<CronJob> {
    if (!this.connected) await this.connect()
    return this.rpc<CronJob>('cron.add', { job })
  }

  async cronUpdate(id: string, patch: CronJobPatch): Promise<CronJob> {
    if (!this.connected) await this.connect()
    return this.rpc<CronJob>('cron.update', { id, patch })
  }

  async cronRemove(id: string): Promise<{ ok: boolean }> {
    if (!this.connected) await this.connect()
    return this.rpc<{ ok: boolean }>('cron.remove', { id })
  }

  async cronRun(id: string): Promise<{ ok: boolean }> {
    if (!this.connected) await this.connect()
    return this.rpc<{ ok: boolean }>('cron.run', { id, mode: 'force' })
  }

  /**
   * Schedule reconnection with exponential backoff and jitter
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempt >= this.maxReconnectAttempts) {
      console.error(`[GatewayWS:${this.tenantId}] Max reconnect attempts reached`)
      return
    }

    // Exponential backoff with jitter
    const baseDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30000)
    const jitter = baseDelay * 0.3 * (Math.random() * 2 - 1)
    const delay = baseDelay + jitter

    console.log(`[GatewayWS:${this.tenantId}] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempt + 1})`)

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectAttempt++
      try {
        await this.connect()
      } catch (error) {
        console.error(`[GatewayWS:${this.tenantId}] Reconnect failed:`, error)
        this.scheduleReconnect()
      }
    }, delay)
  }

  /**
   * Reject all pending requests
   */
  private rejectAllPending(message: string): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout)
      pending.reject(new Error(message))
      this.pendingRequests.delete(id)
    }
  }

  /**
   * Close the connection
   */
  close(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
    this.rejectAllPending('Connection closed')
    this.chatCallbacks.clear()
    this.runIdToSession.clear()
    this.ws?.close()
    this.ws = null
    this.connected = false
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.connected
  }

  /**
   * Get last activity timestamp
   */
  getLastActivity(): number {
    return this.lastActivity
  }
}
