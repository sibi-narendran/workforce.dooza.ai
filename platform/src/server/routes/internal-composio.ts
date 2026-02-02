/**
 * Internal Composio API routes for Clawdbot plugin communication
 *
 * These endpoints are called by the composio-direct plugin running inside
 * the Clawdbot gateway. They provide tenant-isolated and agent-filtered
 * access to Composio tools.
 *
 * Endpoints:
 * - GET /tools?tenantId=xxx&agentId=yyy - Get available tools for tenant/agent
 * - POST /execute - Execute a Composio tool
 */
import { Hono } from 'hono'
import { getToolsForToolkits, executeTool } from '../../integrations/composio-client.js'
import { db } from '../../db/client.js'
import { userIntegrations, integrationProviders, agentIntegrationSkills } from '../../db/schema.js'
import { eq, and } from 'drizzle-orm'

const app = new Hono()

/**
 * GET /api/internal/composio/tools
 *
 * Returns available Composio tools for a tenant, optionally filtered by agent skills.
 *
 * Query params:
 * - tenantId (required): The tenant's UUID
 * - agentId (optional): The agent's UUID for skill-based filtering
 */
app.get('/tools', async (c) => {
  const tenantId = c.req.query('tenantId')
  const agentId = c.req.query('agentId')

  if (!tenantId) {
    return c.json({ error: 'tenantId required' }, 400)
  }

  try {
    // 1. Get tenant's connected integrations
    const tenantConnections = await db
      .select({
        providerId: integrationProviders.id,
        toolkit: integrationProviders.composioToolkit,
        providerSlug: integrationProviders.slug,
      })
      .from(userIntegrations)
      .innerJoin(integrationProviders, eq(userIntegrations.providerId, integrationProviders.id))
      .where(and(
        eq(userIntegrations.tenantId, tenantId),
        eq(userIntegrations.status, 'connected')
      ))

    if (tenantConnections.length === 0) {
      return c.json({ tools: [] })
    }

    // 2. If agentId provided, filter by agent's allowed skills
    let allowedProviderIds: string[] | null = null
    if (agentId) {
      const agentSkills = await db
        .select({ providerId: agentIntegrationSkills.providerId })
        .from(agentIntegrationSkills)
        .where(eq(agentIntegrationSkills.agentId, agentId))

      // Only filter if agent has explicit skill assignments
      // If no skills assigned, allow all tenant tools (permissive default)
      if (agentSkills.length > 0) {
        allowedProviderIds = agentSkills.map(s => s.providerId)
      }
    }

    // 3. Filter tenant connections by agent skills (if specified)
    const availableConnections = allowedProviderIds
      ? tenantConnections.filter(c => allowedProviderIds!.includes(c.providerId))
      : tenantConnections

    // 4. Get toolkit names
    const toolkits = availableConnections
      .map(c => c.toolkit)
      .filter((t): t is string => !!t)

    if (toolkits.length === 0) {
      return c.json({ tools: [] })
    }

    // 5. Fetch tools from Composio
    const tools = await getToolsForToolkits(toolkits)

    console.log(`[Internal Composio] Loaded ${tools.length} tools for tenant ${tenantId}${agentId ? ` (agent: ${agentId})` : ''}`)

    return c.json({ tools })
  } catch (error) {
    console.error('[Internal Composio] Failed to fetch tools:', error)
    return c.json({
      error: 'Failed to fetch tools',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500)
  }
})

/**
 * POST /api/internal/composio/execute
 *
 * Executes a Composio tool on behalf of a tenant.
 *
 * Request body:
 * - tenantId (required): The tenant's UUID
 * - toolName (required): The Composio tool name (e.g., 'GMAIL_SEND_EMAIL')
 * - params (optional): Tool parameters
 */
app.post('/execute', async (c) => {
  const body = await c.req.json()
  const { tenantId, toolName, params } = body

  if (!tenantId || !toolName) {
    return c.json({ error: 'tenantId and toolName required' }, 400)
  }

  try {
    console.log(`[Internal Composio] Executing ${toolName} for tenant ${tenantId}`)

    const result = await executeTool(tenantId, toolName, params || {})

    return c.json(result)
  } catch (error) {
    console.error('[Internal Composio] Tool execution failed:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500)
  }
})

/**
 * GET /api/internal/composio/health
 *
 * Health check endpoint for the internal Composio API.
 */
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'internal-composio',
    timestamp: new Date().toISOString(),
  })
})

export default app
