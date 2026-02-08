/**
 * Employee Executor (Streaming) - Executes messages with streaming via WebSocket
 *
 * Unlike the standard executor which waits for the full response,
 * this version returns immediately with a runId. The actual response
 * is delivered token-by-token via the SSE connection.
 */
import { db } from '../db/client.js'
import {
  installedAgents,
  agentLibrary,
} from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { gatewayPool } from '../streaming/index.js'

export interface StreamingExecuteOptions {
  thinking?: 'none' | 'low' | 'medium' | 'high'
}

export interface StreamingExecuteResult {
  success: boolean
  runId?: string
  sessionKey?: string
  error?: string
}

/**
 * Get the session key for an employee (for SSE connection setup)
 */
export async function getSessionKeyForEmployee(
  tenantId: string,
  employeeId: string
): Promise<string | null> {
  // Find installed agent to get the slug
  const [installedResult] = await db
    .select({
      agent: agentLibrary,
    })
    .from(installedAgents)
    .innerJoin(agentLibrary, eq(installedAgents.agentId, agentLibrary.id))
    .where(
      and(
        eq(installedAgents.id, employeeId),
        eq(installedAgents.tenantId, tenantId)
      )
    )
    .limit(1)

  if (!installedResult) {
    return null
  }

  const agentSlug = installedResult.agent.slug
  return `agent:${agentSlug}:tenant-${tenantId}-${employeeId}`
}

/**
 * Execute a message with streaming - returns immediately with runId
 * The actual response is delivered via the SSE connection
 */
export async function executeEmployeeStreaming(
  tenantId: string,
  employeeId: string,
  message: string,
  options?: StreamingExecuteOptions
): Promise<StreamingExecuteResult> {
  try {
    // Find installed agent
    const [installedResult] = await db
      .select({
        installed: installedAgents,
        agent: agentLibrary,
      })
      .from(installedAgents)
      .innerJoin(agentLibrary, eq(installedAgents.agentId, agentLibrary.id))
      .where(
        and(
          eq(installedAgents.id, employeeId),
          eq(installedAgents.tenantId, tenantId)
        )
      )
      .limit(1)

    if (!installedResult) {
      return {
        success: false,
        error: 'Employee not found',
      }
    }

    const agentSlug = installedResult.agent.slug
    const sessionKey = `agent:${agentSlug}:tenant-${tenantId}-${employeeId}`

    // Get WebSocket client for this tenant from the pool
    const wsClient = await gatewayPool.getClient(tenantId)

    // Send chat via WebSocket - returns immediately with runId
    // Note: Tools (api-tools, Composio) are configured per-agent in clawdbot.json,
    // not passed per-request. The gateway's chat.send RPC doesn't accept a tools param.
    const runId = await wsClient.sendChat({
      sessionKey,
      message,
      agentId: agentSlug,
      timeoutMs: 120000,
    })

    console.log(`[StreamingExecutor] Started streaming for ${employeeId}, runId: ${runId}`)

    return {
      success: true,
      runId,
      sessionKey,
    }
  } catch (error) {
    console.error(`[StreamingExecutor] Error starting stream for ${employeeId}:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

