/**
 * Gateway Manager - Spawns and manages per-tenant clawdbot gateways
 *
 * Each tenant gets their own clawdbot gateway process running on a unique port.
 * The gateway uses the tenant's data directory for config and state.
 */
import { spawn, ChildProcess } from 'node:child_process'
import { env } from '../lib/env.js'
import { tenantManager } from './manager.js'

interface GatewayInstance {
  process: ChildProcess
  port: number
  tenantId: string
  startedAt: Date
  url: string
}

// Track running gateways by tenant ID
const runningGateways = new Map<string, GatewayInstance>()

// Track used ports
const usedPorts = new Set<number>()

/**
 * Get the next available port in the configured range
 */
function getNextAvailablePort(): number | null {
  for (let port = env.GATEWAY_PORT_START; port <= env.GATEWAY_PORT_END; port++) {
    if (!usedPorts.has(port)) {
      return port
    }
  }
  return null
}

/**
 * Spawn a clawdbot gateway for a tenant
 */
export async function spawnGatewayForTenant(tenantId: string): Promise<GatewayInstance> {
  // Check if already running
  const existing = runningGateways.get(tenantId)
  if (existing) {
    console.log(`[GatewayManager] Gateway already running for tenant ${tenantId} on port ${existing.port}`)
    return existing
  }

  // Check tenant exists
  const exists = await tenantManager.tenantExists(tenantId)
  if (!exists) {
    throw new Error(`Tenant directory does not exist: ${tenantId}`)
  }

  // Get available port
  const port = getNextAvailablePort()
  if (!port) {
    throw new Error('No available ports for gateway')
  }

  const tenantDir = tenantManager.getTenantDir(tenantId)
  const clawdbotPath = env.CLAWDBOT_PATH

  console.log(`[GatewayManager] Spawning gateway for tenant ${tenantId} on port ${port}`)
  console.log(`[GatewayManager] Tenant dir: ${tenantDir}`)
  console.log(`[GatewayManager] Clawdbot path: ${clawdbotPath}`)

  // Spawn clawdbot gateway process
  const gatewayProcess = spawn('node', [
    clawdbotPath,
    'gateway',
    'run',
    '--port', port.toString(),
    '--bind', 'loopback',
  ], {
    cwd: tenantDir,
    env: {
      ...process.env,
      // Clawdbot state directory (where clawdbot.json lives)
      CLAWDBOT_STATE_DIR: tenantDir,
      // Pass through API keys
      OPENROUTER_API_KEY: env.OPENROUTER_API_KEY || '',
      ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY || '',
      // Disable interactive prompts
      CI: 'true',
      // Node options
      NODE_ENV: env.NODE_ENV,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })

  // Log gateway output
  gatewayProcess.stdout?.on('data', (data) => {
    console.log(`[Gateway:${tenantId}:${port}] ${data.toString().trim()}`)
  })

  gatewayProcess.stderr?.on('data', (data) => {
    console.error(`[Gateway:${tenantId}:${port}] ${data.toString().trim()}`)
  })

  gatewayProcess.on('error', (error) => {
    console.error(`[GatewayManager] Gateway process error for tenant ${tenantId}:`, error)
    cleanupGateway(tenantId)
  })

  gatewayProcess.on('exit', (code, signal) => {
    console.log(`[GatewayManager] Gateway exited for tenant ${tenantId} (code: ${code}, signal: ${signal})`)
    cleanupGateway(tenantId)
  })

  // Mark port as used
  usedPorts.add(port)

  const instance: GatewayInstance = {
    process: gatewayProcess,
    port,
    tenantId,
    startedAt: new Date(),
    url: `http://127.0.0.1:${port}`,
  }

  runningGateways.set(tenantId, instance)

  // Wait a bit for gateway to start
  await new Promise(resolve => setTimeout(resolve, 2000))

  console.log(`[GatewayManager] Gateway started for tenant ${tenantId} at ${instance.url}`)

  return instance
}

/**
 * Clean up gateway instance
 */
function cleanupGateway(tenantId: string): void {
  const instance = runningGateways.get(tenantId)
  if (instance) {
    usedPorts.delete(instance.port)
    runningGateways.delete(tenantId)
  }
}

/**
 * Stop a tenant's gateway
 */
export function stopGatewayForTenant(tenantId: string): void {
  const instance = runningGateways.get(tenantId)
  if (instance) {
    console.log(`[GatewayManager] Stopping gateway for tenant ${tenantId}`)
    instance.process.kill('SIGTERM')
    cleanupGateway(tenantId)
  }
}

/**
 * Get gateway instance for a tenant (spawns if not running)
 */
export async function getGatewayForTenant(tenantId: string): Promise<GatewayInstance> {
  const existing = runningGateways.get(tenantId)
  if (existing) {
    return existing
  }
  return spawnGatewayForTenant(tenantId)
}

/**
 * Get gateway URL for a tenant (spawns if not running)
 */
export async function getGatewayUrlForTenant(tenantId: string): Promise<string> {
  const instance = await getGatewayForTenant(tenantId)
  return instance.url
}

/**
 * Check if a tenant has a running gateway
 */
export function hasRunningGateway(tenantId: string): boolean {
  return runningGateways.has(tenantId)
}

/**
 * Get all running gateways
 */
export function getRunningGateways(): Map<string, GatewayInstance> {
  return new Map(runningGateways)
}

/**
 * Stop all running gateways (for graceful shutdown)
 */
export function stopAllGateways(): void {
  console.log(`[GatewayManager] Stopping all gateways (${runningGateways.size} running)`)
  for (const [tenantId] of runningGateways) {
    stopGatewayForTenant(tenantId)
  }
}

/**
 * Check gateway health
 */
export async function checkGatewayHealth(tenantId: string): Promise<boolean> {
  const instance = runningGateways.get(tenantId)
  if (!instance) {
    return false
  }

  try {
    const response = await fetch(`${instance.url}/`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    })
    return response.ok
  } catch {
    return false
  }
}
