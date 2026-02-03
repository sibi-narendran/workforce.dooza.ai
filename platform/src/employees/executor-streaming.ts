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
  userIntegrations,
  integrationProviders,
  agentIntegrationSkills,
} from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { env } from '../lib/env.js'
import { gatewayPool, type GatewayTool } from '../streaming/index.js'
import { getToolsForToolkits, ComposioTool } from '../integrations/composio-client.js'

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

    // Get Composio tools if tenant has integrations
    let tools: GatewayTool[] = []
    if (env.COMPOSIO_API_KEY) {
      try {
        tools = await getComposioToolsForExecution(tenantId, installedResult.agent.id)
      } catch (error) {
        console.error('[StreamingExecutor] Failed to get Composio tools:', error)
      }
    }

    // Get WebSocket client for this tenant from the pool
    const wsClient = await gatewayPool.getClient(tenantId)

    // Send chat via WebSocket - returns immediately with runId
    const runId = await wsClient.sendChat({
      sessionKey,
      message,
      agentId: agentSlug,
      timeoutMs: 120000,
      tools: tools.length > 0 ? tools : undefined,
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

/**
 * Get Composio tools for execution context
 */
async function getComposioToolsForExecution(
  tenantId: string,
  agentId: string
): Promise<GatewayTool[]> {
  // Get tenant's connected integrations
  const tenantConnections = await db
    .select({
      integration: userIntegrations,
      provider: integrationProviders,
    })
    .from(userIntegrations)
    .innerJoin(integrationProviders, eq(userIntegrations.providerId, integrationProviders.id))
    .where(
      and(
        eq(userIntegrations.tenantId, tenantId),
        eq(userIntegrations.status, 'connected')
      )
    )

  if (tenantConnections.length === 0) {
    return []
  }

  // Get agent's allowed integration skills
  const agentSkills = await db
    .select({ providerId: agentIntegrationSkills.providerId })
    .from(agentIntegrationSkills)
    .where(eq(agentIntegrationSkills.agentId, agentId))

  let allowedProviderIds: string[] | null = null
  if (agentSkills.length > 0) {
    allowedProviderIds = agentSkills.map(s => s.providerId)
  }

  // Filter connections to only allowed integrations
  const availableConnections = allowedProviderIds
    ? tenantConnections.filter(c => allowedProviderIds!.includes(c.provider.id))
    : tenantConnections

  if (availableConnections.length === 0) {
    return []
  }

  // Get Composio tools for available apps
  const toolkits = availableConnections
    .map(c => c.provider.composioToolkit || c.provider.composioAppKey?.toUpperCase())
    .filter((t): t is string => !!t)

  const composioTools = await getToolsForToolkits(toolkits)

  return composioTools.map((tool: ComposioTool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}
