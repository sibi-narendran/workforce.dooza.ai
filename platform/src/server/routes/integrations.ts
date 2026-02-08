/**
 * Integrations Router - Manage app connections via Composio
 *
 * OAuth flow (session-based):
 *   1. Frontend calls POST /:providerSlug/connect → gets redirectUrl
 *   2. Frontend opens popup with redirectUrl → user authorizes
 *   3. Composio redirects popup to frontend /integrations?... → popup closes
 *   4. Backend's waitForConnection() detects completion → updates DB
 *   5. Frontend polls GET /connections to see updated status
 */
import { Hono } from 'hono'
import { db } from '../../db/client.js'
import { integrationProviders, userIntegrations } from '../../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth.js'
import { env } from '../../lib/env.js'
import {
  initiateOAuthConnection,
  disconnectAccount,
  getAuthConfigForProvider,
} from '../../integrations/composio-client.js'

const SOCIAL_PROVIDERS = new Set(['instagram', 'facebook', 'linkedin', 'twitter', 'youtube', 'tiktok'])

/**
 * Follow Composio's redirect chain to get the actual provider OAuth URL,
 * then modify it to force re-authentication (fresh login prompt).
 */
async function resolveOAuthRedirect(composioUrl: string, providerSlug: string): Promise<string> {
  if (!composioUrl || !SOCIAL_PROVIDERS.has(providerSlug)) {
    return composioUrl
  }

  try {
    const res = await fetch(composioUrl, { redirect: 'manual' })
    const location = res.headers.get('location')

    if (!location) {
      return composioUrl
    }

    const url = new URL(location)

    if (url.hostname.includes('instagram.com') || url.hostname.includes('facebook.com')) {
      url.searchParams.set('force_reauth', '1')
    } else if (url.hostname.includes('linkedin.com')) {
      url.searchParams.set('prompt', 'login')
    } else if (url.hostname.includes('twitter.com') || url.hostname.includes('x.com')) {
      url.searchParams.set('prompt', 'login')
    } else if (url.hostname.includes('google.com')) {
      url.searchParams.set('prompt', 'consent')
    } else {
      return location
    }

    return url.toString()
  } catch (err) {
    console.error('[Integrations] Failed to resolve OAuth redirect:', err)
    return composioUrl
  }
}

/** Frontend URL — derive from request Origin, fallback to sensible default */
function getFrontendUrl(requestOrigin?: string | null): string {
  if (requestOrigin) return requestOrigin
  return env.NODE_ENV === 'production'
    ? 'https://workforce.dooza.ai'
    : 'http://localhost:5173'
}

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

  return c.json({
    providers: providers.map(p => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      icon: p.icon,
      category: p.category,
    })),
  })
})

// All routes below require auth
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
    .where(and(
      eq(userIntegrations.tenantId, tenantId),
      eq(userIntegrations.status, 'connected')
    ))

  return c.json({
    connections: connections.map(({ integration, provider }) => ({
      id: integration.id,
      providerId: provider.id,
      providerSlug: provider.slug,
      providerName: provider.name,
      providerIcon: provider.icon,
      accountLabel: integration.accountLabel,
      status: integration.status,
      connectedAt: integration.connectedAt,
    })),
  })
})

/**
 * Initiate OAuth connection for a provider
 *
 * Uses session.authorize() — the proper Composio API.
 * waitForConnection() runs in background to detect when OAuth completes.
 */
integrationsRouter.post('/:providerSlug/connect', async (c) => {
  const tenantId = c.get('tenantId')
  const providerSlug = c.req.param('providerSlug')

  if (!env.COMPOSIO_API_KEY) {
    return c.json({ error: 'Composio integration not configured' }, 500)
  }

  const [provider] = await db
    .select()
    .from(integrationProviders)
    .where(eq(integrationProviders.slug, providerSlug))
    .limit(1)

  if (!provider) {
    return c.json({ error: 'Provider not found' }, 404)
  }

  try {
    // Get auth config for this provider
    const config = await getAuthConfigForProvider(providerSlug)
    if (!config) {
      return c.json({ error: 'Failed to configure provider authentication' }, 500)
    }

    // Clean up existing DB records for this provider (Composio handles multiple accounts natively)
    await db
      .delete(userIntegrations)
      .where(
        and(
          eq(userIntegrations.tenantId, tenantId),
          eq(userIntegrations.providerId, provider.id)
        )
      )

    // Callback URL → frontend (Composio redirects browser here after OAuth)
    const referer = c.req.header('referer')
    const origin = c.req.header('origin') || (referer ? new URL(referer).origin : null)
    const callbackUrl = `${getFrontendUrl(origin)}/integrations`

    // Initiate connection via session.authorize()
    // This also starts waitForConnection() in background to update DB
    const redirectUrl = await initiateOAuthConnection(
      tenantId,
      providerSlug,
      config.toolkit,
      config.authConfigId,
      callbackUrl,
      provider.id,
    )

    // For social providers: intercept redirect to force fresh login
    const finalUrl = await resolveOAuthRedirect(redirectUrl, providerSlug)

    return c.json({ redirectUrl: finalUrl })
  } catch (error) {
    console.error('[Integrations] Connect error:', error)
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to initiate connection' },
      500
    )
  }
})

/**
 * List Facebook pages for a connected integration (from stored metadata)
 */
integrationsRouter.get('/:connectionId/pages', async (c) => {
  const tenantId = c.get('tenantId')
  const connectionId = c.req.param('connectionId')

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

  const meta = integration.metadata as Record<string, unknown> | null
  const pages = Array.isArray(meta?.pages) ? meta.pages : []
  const selectedPageId = (meta?.selectedPageId as string) || null

  return c.json({ pages, selectedPageId })
})

/**
 * Select a Facebook page for publishing
 */
integrationsRouter.patch('/:connectionId/select-page', async (c) => {
  const tenantId = c.get('tenantId')
  const connectionId = c.req.param('connectionId')
  let pageId: string
  try {
    const body = await c.req.json<{ pageId: string }>()
    pageId = body.pageId
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  if (!pageId) {
    return c.json({ error: 'pageId is required' }, 400)
  }

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

  const meta = (integration.metadata as Record<string, unknown>) || {}
  const pages = Array.isArray(meta.pages) ? meta.pages as Array<{ id: string; name: string }> : []

  const selectedPage = pages.find((p) => p.id === pageId)
  if (!selectedPage) {
    return c.json({ error: 'Page not found in connected pages' }, 400)
  }

  await db
    .update(userIntegrations)
    .set({
      metadata: { ...meta, selectedPageId: pageId },
      accountLabel: selectedPage.name,
      updatedAt: new Date(),
    })
    .where(eq(userIntegrations.id, connectionId))

  return c.json({ success: true })
})

/**
 * Check connection status
 */
integrationsRouter.get('/:connectionId/status', async (c) => {
  const tenantId = c.get('tenantId')
  const connectionId = c.req.param('connectionId')

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

  return c.json({ status: integration.status })
})

/**
 * Disconnect an integration
 */
integrationsRouter.delete('/:connectionId', async (c) => {
  const tenantId = c.get('tenantId')
  const connectionId = c.req.param('connectionId')

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
    if (integration.composioConnectionId && integration.composioConnectionId !== 'pending') {
      await disconnectAccount(integration.composioConnectionId)
    }

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
