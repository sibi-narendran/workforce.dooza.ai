/**
 * Integrations Router - Manage app connections via Composio
 *
 * All integrations are tenant-scoped (1 user = 1 tenant for now)
 */
import { Hono } from 'hono'
import { db } from '../../db/client.js'
import { integrationProviders, userIntegrations } from '../../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth.js'
import { env } from '../../lib/env.js'
import {
  initiateConnection,
  getConnectedAccount,
  disconnectAccount,
  buildComposioEntityId,
  getAuthConfigForProvider,
} from '../../integrations/composio-client.js'

const integrationsRouter = new Hono()

/**
 * List all available integration providers (public)
 */
integrationsRouter.get('/', async (c) => {
  const providers = await db
    .select()
    .from(integrationProviders)
    .where(eq(integrationProviders.isActive, true))
    .orderBy(integrationProviders.category, integrationProviders.name)

  // Group by category
  const grouped = providers.reduce((acc, provider) => {
    const category = provider.category || 'other'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push({
      id: provider.id,
      slug: provider.slug,
      name: provider.name,
      description: provider.description,
      icon: provider.icon,
      category: provider.category,
    })
    return acc
  }, {} as Record<string, Array<{
    id: string
    slug: string
    name: string
    description: string | null
    icon: string | null
    category: string | null
  }>>)

  return c.json({
    providers: providers.map(p => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      icon: p.icon,
      category: p.category,
    })),
    grouped,
  })
})

// Protected routes below
integrationsRouter.use('/*', authMiddleware)

/**
 * Get tenant's connected integrations
 */
integrationsRouter.get('/connections', async (c) => {
  const tenantId = c.get('tenantId')

  const connections = await db
    .select({
      integration: userIntegrations,
      provider: integrationProviders,
    })
    .from(userIntegrations)
    .innerJoin(integrationProviders, eq(userIntegrations.providerId, integrationProviders.id))
    .where(eq(userIntegrations.tenantId, tenantId))

  return c.json({
    connections: connections.map(({ integration, provider }) => ({
      id: integration.id,
      providerId: provider.id,
      providerSlug: provider.slug,
      providerName: provider.name,
      providerIcon: provider.icon,
      status: integration.status,
      connectedAt: integration.connectedAt,
    })),
  })
})

/**
 * Initiate OAuth connection for a provider
 */
integrationsRouter.post('/:providerSlug/connect', async (c) => {
  const tenantId = c.get('tenantId')
  const providerSlug = c.req.param('providerSlug')

  // Check if Composio is configured
  if (!env.COMPOSIO_API_KEY) {
    return c.json({ error: 'Composio integration not configured' }, 500)
  }

  // Get provider
  const [provider] = await db
    .select()
    .from(integrationProviders)
    .where(eq(integrationProviders.slug, providerSlug))
    .limit(1)

  if (!provider) {
    return c.json({ error: 'Provider not found' }, 404)
  }

  // Check if already connected (by tenantId + providerId)
  const [existing] = await db
    .select()
    .from(userIntegrations)
    .where(
      and(
        eq(userIntegrations.tenantId, tenantId),
        eq(userIntegrations.providerId, provider.id)
      )
    )
    .limit(1)

  if (existing && existing.status === 'connected') {
    return c.json({ error: 'Already connected to this provider' }, 400)
  }

  try {
    // Get or create auth config for this provider
    const authConfigId = await getAuthConfigForProvider(providerSlug)
    if (!authConfigId) {
      return c.json({ error: 'Failed to configure provider authentication' }, 500)
    }

    // Build callback URL
    const baseUrl = env.NODE_ENV === 'production'
      ? 'https://workforce.dooza.ai'
      : `http://localhost:${env.PORT}`
    const callbackUrl = `${baseUrl}/api/integrations/callback?provider=${providerSlug}`

    // Initiate OAuth via Composio (using tenantId)
    const result = await initiateConnection(tenantId, authConfigId, callbackUrl)

    // Store pending connection
    const composioEntityId = buildComposioEntityId(tenantId)

    if (existing) {
      await db
        .update(userIntegrations)
        .set({
          composioEntityId,
          composioConnectionId: result.connectionId || 'pending',
          status: 'pending',
          updatedAt: new Date(),
        })
        .where(eq(userIntegrations.id, existing.id))
    } else {
      await db.insert(userIntegrations).values({
        tenantId,
        providerId: provider.id,
        composioEntityId,
        composioConnectionId: result.connectionId || 'pending',
        status: 'pending',
      })
    }

    return c.json({ redirectUrl: result.redirectUrl })
  } catch (error) {
    console.error('[Integrations] Connect error:', error)
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to initiate connection' },
      500
    )
  }
})

/**
 * OAuth callback - handle return from Composio OAuth
 */
integrationsRouter.get('/callback', async (c) => {
  const tenantId = c.get('tenantId')
  const providerSlug = c.req.query('provider')
  const connectedAccountId = c.req.query('connectedAccountId')
  const errorParam = c.req.query('error')

  const frontendUrl = env.NODE_ENV === 'production'
    ? 'https://workforce.dooza.ai'
    : 'http://localhost:5173'

  // Handle error from Composio
  if (errorParam) {
    console.error('[Integrations] OAuth error:', errorParam)
    return c.redirect(`${frontendUrl}/integrations?error=${encodeURIComponent(errorParam)}`)
  }

  if (!connectedAccountId) {
    return c.redirect(`${frontendUrl}/integrations?error=missing_connection_id`)
  }

  try {
    // Verify the connection is active
    const account = await getConnectedAccount(connectedAccountId)

    if (!account || account.status !== 'active') {
      return c.redirect(`${frontendUrl}/integrations?error=connection_not_active`)
    }

    // Update our database record
    const composioEntityId = buildComposioEntityId(tenantId)

    const [updated] = await db
      .update(userIntegrations)
      .set({
        composioConnectionId: connectedAccountId,
        status: 'connected',
        connectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userIntegrations.tenantId, tenantId),
          eq(userIntegrations.composioEntityId, composioEntityId),
          eq(userIntegrations.status, 'pending')
        )
      )
      .returning()

    if (updated) {
      return c.redirect(`${frontendUrl}/integrations?success=true&app=${providerSlug || ''}`)
    } else {
      return c.redirect(`${frontendUrl}/integrations?error=connection_not_found`)
    }
  } catch (error) {
    console.error('[Integrations] Callback error:', error)
    return c.redirect(`${frontendUrl}/integrations?error=callback_failed`)
  }
})

/**
 * Check connection status
 */
integrationsRouter.get('/:connectionId/status', async (c) => {
  const tenantId = c.get('tenantId')
  const connectionId = c.req.param('connectionId')

  // Get our database record (filtered by tenantId)
  const [integration] = await db
    .select()
    .from(userIntegrations)
    .where(
      and(
        eq(userIntegrations.id, connectionId),
        eq(userIntegrations.tenantId, tenantId)
      )
    )
    .limit(1)

  if (!integration) {
    return c.json({ error: 'Connection not found' }, 404)
  }

  // Check with Composio if we have a connection ID
  if (integration.composioConnectionId && integration.composioConnectionId !== 'pending') {
    try {
      const account = await getConnectedAccount(integration.composioConnectionId)

      if (account) {
        const newStatus = account.status === 'active' ? 'connected' : account.status

        // Update if status changed
        if (newStatus !== integration.status) {
          await db
            .update(userIntegrations)
            .set({ status: newStatus, updatedAt: new Date() })
            .where(eq(userIntegrations.id, integration.id))
        }

        return c.json({ status: newStatus })
      }
    } catch (error) {
      console.error('[Integrations] Status check error:', error)
    }
  }

  return c.json({ status: integration.status })
})

/**
 * Disconnect an integration
 */
integrationsRouter.delete('/:connectionId', async (c) => {
  const tenantId = c.get('tenantId')
  const connectionId = c.req.param('connectionId')

  // Get our database record (filtered by tenantId)
  const [integration] = await db
    .select()
    .from(userIntegrations)
    .where(
      and(
        eq(userIntegrations.id, connectionId),
        eq(userIntegrations.tenantId, tenantId)
      )
    )
    .limit(1)

  if (!integration) {
    return c.json({ error: 'Connection not found' }, 404)
  }

  try {
    // Disconnect from Composio if we have a valid connection ID
    if (integration.composioConnectionId && integration.composioConnectionId !== 'pending') {
      await disconnectAccount(integration.composioConnectionId)
    }

    // Delete from our database
    await db
      .delete(userIntegrations)
      .where(eq(userIntegrations.id, integration.id))

    return c.json({ success: true })
  } catch (error) {
    console.error('[Integrations] Disconnect error:', error)
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to disconnect' },
      500
    )
  }
})

export { integrationsRouter }
