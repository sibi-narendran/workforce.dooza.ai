/**
 * SSE Manager - Manages browser SSE connections per tenant/session
 *
 * Handles:
 * - Connection lifecycle (add/remove/cleanup)
 * - Multi-tenant isolation
 * - Session-scoped event delivery
 * - Keep-alive pings
 */
import { randomUUID } from 'crypto'
import type { Context } from 'hono'
import type { ChatEvent } from './types.js'

export interface SSEConnection {
  id: string
  tenantId: string
  employeeId: string
  sessionKey: string
  tabId?: string
  controller: ReadableStreamDefaultController<Uint8Array>
  createdAt: number
  lastPing: number
}

const encoder = new TextEncoder()

class SSEManager {
  private connections = new Map<string, SSEConnection>()
  private sessionIndex = new Map<string, Set<string>>() // sessionKey -> connIds
  private tenantIndex = new Map<string, Set<string>>() // tenantId -> connIds
  private tabIndex = new Map<string, string>() // `${sessionKey}:${tabId}` -> connId
  private pingInterval: NodeJS.Timeout | null = null
  private readonly PING_INTERVAL_MS = 30000 // 30 seconds

  constructor() {
    this.startPingInterval()
  }

  /**
   * Create and register a new SSE connection
   */
  createConnection(
    tenantId: string,
    employeeId: string,
    sessionKey: string,
    controller: ReadableStreamDefaultController<Uint8Array>,
    tabId?: string
  ): string {
    // Evict existing connection from the same tab (handles StrictMode remounts, token refresh, etc.)
    if (tabId) {
      const tabKey = `${sessionKey}:${tabId}`
      const existingConnId = this.tabIndex.get(tabKey)
      if (existingConnId) {
        const existingConn = this.connections.get(existingConnId)
        if (existingConn) {
          console.log(`[SSEManager] Evicting stale connection ${existingConnId} for tab ${tabId}`)
          try {
            existingConn.controller.close()
          } catch {
            // Already closed
          }
          this.removeConnection(existingConnId)
        }
      }
    }

    const connId = randomUUID()
    const connection: SSEConnection = {
      id: connId,
      tenantId,
      employeeId,
      sessionKey,
      tabId,
      controller,
      createdAt: Date.now(),
      lastPing: Date.now(),
    }

    this.connections.set(connId, connection)

    // Index by session key
    if (!this.sessionIndex.has(sessionKey)) {
      this.sessionIndex.set(sessionKey, new Set())
    }
    this.sessionIndex.get(sessionKey)!.add(connId)

    // Index by tenant
    if (!this.tenantIndex.has(tenantId)) {
      this.tenantIndex.set(tenantId, new Set())
    }
    this.tenantIndex.get(tenantId)!.add(connId)

    // Index by tab
    if (tabId) {
      this.tabIndex.set(`${sessionKey}:${tabId}`, connId)
    }

    console.log(`[SSEManager] Connection added: ${connId} (tenant: ${tenantId}, employee: ${employeeId}, tab: ${tabId || 'none'})`)
    return connId
  }

  /**
   * Remove a connection and clean up indexes
   */
  removeConnection(connId: string): void {
    const conn = this.connections.get(connId)
    if (!conn) return

    // Remove from session index
    const sessionConns = this.sessionIndex.get(conn.sessionKey)
    if (sessionConns) {
      sessionConns.delete(connId)
      if (sessionConns.size === 0) {
        this.sessionIndex.delete(conn.sessionKey)
      }
    }

    // Remove from tenant index
    const tenantConns = this.tenantIndex.get(conn.tenantId)
    if (tenantConns) {
      tenantConns.delete(connId)
      if (tenantConns.size === 0) {
        this.tenantIndex.delete(conn.tenantId)
      }
    }

    // Remove from tab index
    if (conn.tabId) {
      const tabKey = `${conn.sessionKey}:${conn.tabId}`
      if (this.tabIndex.get(tabKey) === connId) {
        this.tabIndex.delete(tabKey)
      }
    }

    this.connections.delete(connId)
    console.log(`[SSEManager] Connection removed: ${connId}`)
  }

  /**
   * Broadcast event to all connections for a specific session
   */
  broadcastToSession(sessionKey: string, event: ChatEvent): void {
    const connIds = this.sessionIndex.get(sessionKey)
    if (!connIds || connIds.size === 0) {
      console.log(`[SSEManager] No connections for session: ${sessionKey}`)
      return
    }

    const data = this.formatSSE(event)
    for (const connId of connIds) {
      this.sendToConnection(connId, data)
    }
  }

  /**
   * Broadcast event to all connections for a tenant (used for agent-initiated events)
   */
  broadcastToTenant(tenantId: string, event: ChatEvent): void {
    const connIds = this.tenantIndex.get(tenantId)
    if (!connIds || connIds.size === 0) return

    const data = this.formatSSE(event)
    for (const connId of connIds) {
      this.sendToConnection(connId, data)
    }
  }

  /**
   * Send data to a specific connection
   */
  private sendToConnection(connId: string, data: Uint8Array): void {
    const conn = this.connections.get(connId)
    if (!conn) return

    try {
      conn.controller.enqueue(data)
    } catch (error) {
      console.error(`[SSEManager] Failed to send to ${connId}:`, error)
      this.removeConnection(connId)
    }
  }

  /**
   * Format event as SSE message
   */
  private formatSSE(event: ChatEvent): Uint8Array {
    const eventType = event.state
    const data = JSON.stringify(event)
    return encoder.encode(`event: ${eventType}\ndata: ${data}\n\n`)
  }

  /**
   * Send ping to all connections
   */
  private sendPing(): void {
    const pingData = encoder.encode(`: ping\n\n`)
    const now = Date.now()

    for (const [connId, conn] of this.connections) {
      try {
        conn.controller.enqueue(pingData)
        conn.lastPing = now
      } catch {
        // Connection closed, clean up
        this.removeConnection(connId)
      }
    }
  }

  /**
   * Start periodic ping interval
   */
  private startPingInterval(): void {
    if (this.pingInterval) return
    this.pingInterval = setInterval(() => this.sendPing(), this.PING_INTERVAL_MS)
  }

  /**
   * Stop ping interval
   */
  stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  /**
   * Get connection count for monitoring
   */
  getStats(): { total: number; byTenant: Record<string, number> } {
    const byTenant: Record<string, number> = {}
    for (const [tenantId, connIds] of this.tenantIndex) {
      byTenant[tenantId] = connIds.size
    }
    return {
      total: this.connections.size,
      byTenant,
    }
  }

  /**
   * Close all connections for a tenant (used during cleanup)
   */
  closeAllForTenant(tenantId: string): void {
    const connIds = this.tenantIndex.get(tenantId)
    if (!connIds) return

    for (const connId of [...connIds]) {
      const conn = this.connections.get(connId)
      if (conn) {
        try {
          conn.controller.close()
        } catch {
          // Already closed
        }
        this.removeConnection(connId)
      }
    }
  }

  /**
   * Create SSE response for Hono
   */
  createSSEResponse(
    c: Context,
    tenantId: string,
    employeeId: string,
    sessionKey: string,
    tabId?: string
  ): Response {
    let connId: string | null = null

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        connId = this.createConnection(tenantId, employeeId, sessionKey, controller, tabId)

        // Send initial connection event
        const initEvent: ChatEvent = {
          runId: '',
          seq: 0,
          state: 'connected' as any,
          sessionKey,
        }
        controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify(initEvent)}\n\n`))
      },
      cancel: () => {
        if (connId) {
          this.removeConnection(connId)
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      },
    })
  }
}

// Singleton instance
export const sseManager = new SSEManager()
