import { spawn, ChildProcess } from 'node:child_process'
import { env } from '../lib/env.js'
import { tenantManager } from './manager.js'

interface GatewayInstance {
  port: number
  process: ChildProcess
  tenantId: string
  startedAt: Date
  lastActivity: Date
}

/**
 * Manages clawdbot gateway instances per tenant
 */
export class TenantGatewayManager {
  private gateways = new Map<string, GatewayInstance>()
  private portAllocations = new Map<number, string>() // port -> tenantId
  private nextPort: number

  constructor() {
    this.nextPort = env.GATEWAY_PORT_START
  }

  /**
   * Allocate an available port
   */
  private allocatePort(): number {
    while (this.portAllocations.has(this.nextPort)) {
      this.nextPort++
      if (this.nextPort > env.GATEWAY_PORT_END) {
        this.nextPort = env.GATEWAY_PORT_START
        // If we've cycled through all ports, find first available
        for (let p = env.GATEWAY_PORT_START; p <= env.GATEWAY_PORT_END; p++) {
          if (!this.portAllocations.has(p)) {
            this.nextPort = p
            break
          }
        }
      }
    }

    const port = this.nextPort
    this.nextPort++
    return port
  }

  /**
   * Get or create a gateway for a tenant
   */
  async ensureGateway(tenantId: string): Promise<number> {
    // Return existing gateway if running
    const existing = this.gateways.get(tenantId)
    if (existing && !existing.process.killed) {
      existing.lastActivity = new Date()
      return existing.port
    }

    // Ensure tenant directory exists
    if (!(await tenantManager.tenantExists(tenantId))) {
      throw new Error(`Tenant ${tenantId} does not exist`)
    }

    const port = this.allocatePort()
    const stateDir = tenantManager.getStateDir(tenantId)

    console.log(`[Gateway] Starting gateway for tenant ${tenantId} on port ${port}`)

    // Spawn clawdbot gateway for this tenant
    // Note: Each agent has its own workspace defined in its config.json
    const proc = spawn(
      'node',
      [env.CLAWDBOT_PATH, 'gateway', 'run', '--port', String(port), '--bind', 'loopback'],
      {
        env: {
          ...process.env,
          CLAWDBOT_STATE_DIR: stateDir,
          CLAWDBOT_CONFIG_PATH: `${stateDir}/config.json`,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      }
    )

    // Log gateway output
    proc.stdout?.on('data', (data) => {
      console.log(`[Gateway ${tenantId}] ${data.toString().trim()}`)
    })
    proc.stderr?.on('data', (data) => {
      console.error(`[Gateway ${tenantId}] ${data.toString().trim()}`)
    })

    proc.on('exit', (code) => {
      console.log(`[Gateway] Tenant ${tenantId} gateway exited with code ${code}`)
      this.gateways.delete(tenantId)
      this.portAllocations.delete(port)
    })

    const instance: GatewayInstance = {
      port,
      process: proc,
      tenantId,
      startedAt: new Date(),
      lastActivity: new Date(),
    }

    this.gateways.set(tenantId, instance)
    this.portAllocations.set(port, tenantId)

    // Wait for gateway to start (simple delay for now)
    await new Promise((resolve) => setTimeout(resolve, 2000))

    return port
  }

  /**
   * Stop a tenant's gateway
   */
  async stopGateway(tenantId: string): Promise<void> {
    const gateway = this.gateways.get(tenantId)
    if (!gateway) return

    console.log(`[Gateway] Stopping gateway for tenant ${tenantId}`)

    gateway.process.kill('SIGTERM')

    // Force kill after timeout
    setTimeout(() => {
      if (!gateway.process.killed) {
        gateway.process.kill('SIGKILL')
      }
    }, 5000)

    this.gateways.delete(tenantId)
    this.portAllocations.delete(gateway.port)
  }

  /**
   * Run a message through an employee via the gateway
   */
  async runEmployee(
    tenantId: string,
    employeeId: string,
    message: string,
    options?: {
      thinking?: 'none' | 'low' | 'medium' | 'high'
      stream?: boolean
    }
  ): Promise<any> {
    const port = await this.ensureGateway(tenantId)

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: employeeId,
          message,
          thinking: options?.thinking || 'medium',
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Gateway error: ${error}`)
      }

      return response.json()
    } catch (error) {
      console.error(`[Gateway] Error running employee ${employeeId}:`, error)
      throw error
    }
  }

  /**
   * Get WebSocket URL for streaming chat
   */
  async getStreamUrl(tenantId: string, employeeId: string): Promise<string> {
    const port = await this.ensureGateway(tenantId)
    return `ws://127.0.0.1:${port}/ws/agent/${employeeId}`
  }

  /**
   * Get status of all gateways
   */
  getStatus(): { tenantId: string; port: number; startedAt: Date; lastActivity: Date }[] {
    return Array.from(this.gateways.values()).map((g) => ({
      tenantId: g.tenantId,
      port: g.port,
      startedAt: g.startedAt,
      lastActivity: g.lastActivity,
    }))
  }

  /**
   * Stop all gateways (for shutdown)
   */
  async stopAll(): Promise<void> {
    console.log(`[Gateway] Stopping all gateways...`)
    const tenantIds = Array.from(this.gateways.keys())
    await Promise.all(tenantIds.map((id) => this.stopGateway(id)))
  }
}

// Singleton instance
export const gatewayManager = new TenantGatewayManager()
