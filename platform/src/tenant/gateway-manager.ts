/**
 * Gateway Manager - Multi-tenant mode
 *
 * In multi-tenant mode, a SINGLE gateway serves ALL tenants.
 * Tenant isolation is handled via X-Tenant-ID header, which the gateway
 * uses to resolve the correct state directory per-request.
 *
 * This replaces the old per-tenant gateway spawning approach.
 */
import { env } from '../lib/env.js'

/**
 * Get the gateway URL for any tenant.
 * In multi-tenant mode, all tenants use the same gateway.
 */
export async function getGatewayUrlForTenant(_tenantId: string): Promise<string> {
  return env.CLAWDBOT_GATEWAY_URL
}

/**
 * Check if gateway is healthy
 */
export async function checkGatewayHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${env.CLAWDBOT_GATEWAY_URL}/`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * No-op for backwards compatibility.
 * In multi-tenant mode, there's nothing to stop per-tenant.
 */
export function stopGatewayForTenant(_tenantId: string): void {
  // No-op: single gateway serves all tenants
}

/**
 * No-op for backwards compatibility.
 * In multi-tenant mode, gateway lifecycle is managed externally.
 */
export function stopAllGateways(): void {
  // No-op: gateway is managed externally (systemd, pm2, etc.)
  console.log('[GatewayManager] Multi-tenant mode: gateway managed externally')
}
