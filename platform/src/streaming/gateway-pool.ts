/**
 * Gateway Connection Pool - Per-tenant WebSocket connection management
 *
 * Maintains persistent WebSocket connections to the gateway,
 * with lazy initialization and idle pruning.
 */
import { GatewayWSClient } from './gateway-ws-client.js'
import { getGatewayUrlForTenant } from '../tenant/gateway-manager.js'

interface PoolEntry {
  client: GatewayWSClient
  createdAt: number
  lastAccess: number
}

class GatewayPool {
  private pool = new Map<string, PoolEntry>()
  private pruneInterval: NodeJS.Timeout | null = null
  private readonly MAX_IDLE_MS = 5 * 60 * 1000 // 5 minutes
  private readonly PRUNE_INTERVAL_MS = 60 * 1000 // 1 minute

  constructor() {
    this.startPruneInterval()
  }

  /**
   * Get or create a WebSocket client for a tenant
   */
  async getClient(tenantId: string): Promise<GatewayWSClient> {
    let entry = this.pool.get(tenantId)

    if (entry) {
      entry.lastAccess = Date.now()
      // Ensure connection is active
      if (!entry.client.isConnected()) {
        try {
          await entry.client.connect()
        } catch (error) {
          // Remove broken client and create new one
          console.error(`[GatewayPool] Failed to reconnect for ${tenantId}:`, error)
          this.removeClient(tenantId)
          entry = undefined
        }
      }
    }

    if (!entry) {
      const gatewayUrl = await getGatewayUrlForTenant(tenantId)
      const client = new GatewayWSClient(tenantId, gatewayUrl)

      try {
        await client.connect()
      } catch (error) {
        console.error(`[GatewayPool] Failed to connect for ${tenantId}:`, error)
        throw error
      }

      entry = {
        client,
        createdAt: Date.now(),
        lastAccess: Date.now(),
      }
      this.pool.set(tenantId, entry)
      console.log(`[GatewayPool] Created client for tenant ${tenantId}`)
    }

    return entry.client
  }

  /**
   * Check if a client exists for a tenant
   */
  hasClient(tenantId: string): boolean {
    return this.pool.has(tenantId)
  }

  /**
   * Remove a client for a tenant
   */
  removeClient(tenantId: string): void {
    const entry = this.pool.get(tenantId)
    if (entry) {
      entry.client.close()
      this.pool.delete(tenantId)
      console.log(`[GatewayPool] Removed client for tenant ${tenantId}`)
    }
  }

  /**
   * Prune idle connections
   */
  pruneIdle(maxIdleMs?: number): number {
    const threshold = Date.now() - (maxIdleMs || this.MAX_IDLE_MS)
    let pruned = 0

    for (const [tenantId, entry] of this.pool) {
      // Check both lastAccess and client's last activity
      const lastActivity = Math.max(entry.lastAccess, entry.client.getLastActivity())
      if (lastActivity < threshold) {
        this.removeClient(tenantId)
        pruned++
      }
    }

    if (pruned > 0) {
      console.log(`[GatewayPool] Pruned ${pruned} idle connections`)
    }

    return pruned
  }

  /**
   * Start the prune interval
   */
  private startPruneInterval(): void {
    if (this.pruneInterval) return
    this.pruneInterval = setInterval(() => this.pruneIdle(), this.PRUNE_INTERVAL_MS)
  }

  /**
   * Stop the prune interval
   */
  stopPruneInterval(): void {
    if (this.pruneInterval) {
      clearInterval(this.pruneInterval)
      this.pruneInterval = null
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalClients: number
    clients: Array<{ tenantId: string; connected: boolean; lastActivity: number }>
  } {
    const clients = []
    for (const [tenantId, entry] of this.pool) {
      clients.push({
        tenantId,
        connected: entry.client.isConnected(),
        lastActivity: entry.client.getLastActivity(),
      })
    }

    return {
      totalClients: this.pool.size,
      clients,
    }
  }

  /**
   * Close all connections and clean up
   */
  shutdown(): void {
    this.stopPruneInterval()
    for (const [tenantId] of this.pool) {
      this.removeClient(tenantId)
    }
    console.log('[GatewayPool] Shutdown complete')
  }
}

// Singleton instance
export const gatewayPool = new GatewayPool()
