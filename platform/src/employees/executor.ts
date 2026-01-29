/**
 * Employee Executor - Executes messages with AI agents via clawdbot gateway
 *
 * Agents are defined in code and registered in the shared gateway.
 * Users install agents from the library; this executor routes messages to them.
 */
import { callGatewayHook, GatewayTool } from '../lib/clawdbot-client.js'
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
import { getToolsForToolkits, ComposioTool } from '../integrations/composio-client.js'

export interface ExecuteOptions {
  thinking?: 'none' | 'low' | 'medium' | 'high'
  stream?: boolean
}

export interface ExecuteResult {
  success: boolean
  response?: string
  error?: string
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

/**
 * Execute a message with an installed agent using the clawdbot gateway
 */
export async function executeEmployee(
  tenantId: string,
  employeeId: string,
  message: string,
  options?: ExecuteOptions
): Promise<ExecuteResult> {
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

    // Use the agent's slug from library
    const agentSlug = installedResult.agent.slug

    // Session key for tenant isolation
    const sessionKey = `tenant-${tenantId}-${employeeId}`

    // Map thinking level names
    const thinkingLevel = options?.thinking || 'medium'

    // Get Composio tools if tenant has integrations
    let tools: GatewayTool[] = []
    if (env.COMPOSIO_API_KEY) {
      try {
        tools = await getComposioToolsForExecution(tenantId, installedResult.agent.id)
      } catch (error) {
        console.error('[Executor] Failed to get Composio tools:', error)
        // Continue without tools - don't fail the execution
      }
    }

    const result = await callGatewayHook({
      agentId: agentSlug,
      message,
      sessionKey,
      thinking: thinkingLevel,
      deliver: false, // Don't deliver to external channels
      timeoutSeconds: 120,
      tools: tools.length > 0 ? tools : undefined,
    })

    if (!result.ok) {
      return {
        success: false,
        error: result.error || 'Gateway returned error',
      }
    }

    return {
      success: true,
      response: result.text,
      usage: result.usage ? {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      } : undefined,
    }
  } catch (error) {
    console.error(`[Executor] Error running employee ${employeeId}:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get Composio tools for execution context
 * Returns tools based on: tenant's connected integrations ∩ agent's allowed skills
 */
async function getComposioToolsForExecution(
  tenantId: string,
  agentId: string
): Promise<GatewayTool[]> {
  // 1. Get tenant's connected integrations
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

  // 2. Get agent's allowed integration skills (if any are defined)
  const agentSkills = await db
    .select({ providerId: agentIntegrationSkills.providerId })
    .from(agentIntegrationSkills)
    .where(eq(agentIntegrationSkills.agentId, agentId))

  let allowedProviderIds: string[] | null = null
  if (agentSkills.length > 0) {
    allowedProviderIds = agentSkills.map(s => s.providerId)
  }

  // 3. Filter connections to only allowed integrations
  const availableConnections = allowedProviderIds
    ? tenantConnections.filter(c => allowedProviderIds!.includes(c.provider.id))
    : tenantConnections // If no skills defined, agent can use all tenant's integrations

  if (availableConnections.length === 0) {
    return []
  }

  // 4. Get Composio tools for available apps
  const toolkits = availableConnections
    .map(c => c.provider.composioToolkit || c.provider.composioAppKey?.toUpperCase())
    .filter((t): t is string => !!t)

  const composioTools = await getToolsForToolkits(toolkits)

  // 5. Convert to gateway tool format
  return composioTools.map((tool: ComposioTool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}
