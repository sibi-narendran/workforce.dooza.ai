/**
 * Composio SDK wrapper for managing user integrations
 *
 * Uses the session-based API:
 *   composio.create(userId) → session.authorize(toolkit) → waitForConnection()
 *
 * Docs: https://docs.composio.dev/docs/authenticating-users/manually-authenticating
 */
import { Composio } from '@composio/core'
import { env } from '../lib/env.js'
import { db } from '../db/client.js'
import { integrationProviders, userIntegrations } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'

// Singleton client
let composioClient: Composio | null = null

function getClient(): Composio {
  if (!composioClient) {
    if (!env.COMPOSIO_API_KEY) {
      throw new Error('COMPOSIO_API_KEY environment variable is not set')
    }
    composioClient = new Composio({ apiKey: env.COMPOSIO_API_KEY })
  }
  return composioClient
}

/**
 * Build a consistent entity ID for Composio
 * Format: workforce-{tenantId}
 */
export function buildComposioEntityId(tenantId: string): string {
  return `workforce-${tenantId}`
}

/**
 * Initiate an OAuth connection using the session-based API.
 *
 * Flow:
 *   1. Create session with user's auth config
 *   2. Call session.authorize(toolkit) → redirectUrl + waitForConnection()
 *   3. Return redirectUrl immediately
 *   4. Start waitForConnection() in background → updates DB when done
 *
 * @returns redirectUrl for the OAuth popup
 */
export async function initiateOAuthConnection(
  tenantId: string,
  providerSlug: string,
  toolkit: string,
  authConfigId: string,
  callbackUrl: string,
  providerId: string,
): Promise<string> {
  const client = getClient()
  const entityId = buildComposioEntityId(tenantId)

  // Create session with auth config for this specific toolkit
  const session = await client.create(entityId, {
    authConfigs: { [toolkit.toLowerCase()]: authConfigId },
  })

  // Authorize — returns ConnectionRequest with redirectUrl + waitForConnection
  const connectionRequest = await session.authorize(toolkit.toLowerCase(), {
    callbackUrl,
  })

  const redirectUrl = connectionRequest.redirectUrl
  if (!redirectUrl) {
    throw new Error('No redirect URL returned from Composio')
  }

  // Store pending connection in DB
  await db.insert(userIntegrations).values({
    tenantId,
    providerId,
    composioEntityId: entityId,
    composioConnectionId: connectionRequest.id || 'pending',
    status: 'pending',
  })

  // Background: wait for connection to complete, then update DB with account details
  connectionRequest.waitForConnection(120_000)
    .then(async (account) => {
      console.log(`[Composio] Connection confirmed: ${account.id} (status: ${account.status})`)

      // Fetch account label (and metadata for Facebook pages) via platform-specific tool calls
      const { label: accountLabel, metadata } = await fetchAccountLabel(tenantId, toolkit)
      console.log(`[Composio] Account label for ${toolkit}: ${accountLabel || 'none'}`)

      await db
        .update(userIntegrations)
        .set({
          composioConnectionId: account.id,
          accountLabel,
          ...(metadata ? { metadata } : {}),
          status: 'connected',
          connectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(userIntegrations.tenantId, tenantId),
            eq(userIntegrations.providerId, providerId),
            eq(userIntegrations.status, 'pending')
          )
        )
    })
    .catch((err) => {
      console.error(`[Composio] waitForConnection failed for ${providerSlug}:`, err)
      // Mark as failed so it doesn't stay pending forever
      db.update(userIntegrations)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(
          and(
            eq(userIntegrations.tenantId, tenantId),
            eq(userIntegrations.providerId, providerId),
            eq(userIntegrations.status, 'pending')
          )
        )
        .catch(() => {})
    })

  return redirectUrl
}

/**
 * Check connection status for a toolkit using session.toolkits()
 */
export async function checkToolkitConnection(
  tenantId: string,
  toolkit: string,
  authConfigId: string,
): Promise<{ isConnected: boolean; connectedAccountId?: string }> {
  const client = getClient()
  const entityId = buildComposioEntityId(tenantId)

  try {
    const session = await client.create(entityId, {
      authConfigs: { [toolkit.toLowerCase()]: authConfigId },
    })

    const toolkits = await session.toolkits({ toolkits: [toolkit.toLowerCase()] })
    const tk = toolkits.items?.[0]

    if (tk?.connection?.isActive && tk?.connection?.connectedAccount) {
      return {
        isConnected: true,
        connectedAccountId: tk.connection.connectedAccount.id,
      }
    }

    return { isConnected: false }
  } catch (error) {
    console.error(`[Composio] Failed to check ${toolkit} connection:`, error)
    return { isConnected: false }
  }
}

/**
 * Disconnect/delete a connected account
 */
export async function disconnectAccount(connectionId: string): Promise<boolean> {
  const client = getClient()

  try {
    await client.connectedAccounts.delete(connectionId)
    return true
  } catch (error) {
    console.error('[Composio] Failed to disconnect account:', error)
    return false
  }
}

/**
 * Delete Composio connections for a tenant entity, scoped to a specific auth config.
 */
export async function disconnectAllForEntity(tenantId: string, authConfigId: string): Promise<number> {
  const client = getClient()
  const composioEntityId = buildComposioEntityId(tenantId)

  try {
    const response = await client.connectedAccounts.list({
      userIds: [composioEntityId],
      authConfigIds: [authConfigId],
    })

    const accounts = response.items || []
    let deleted = 0
    for (const acc of accounts) {
      try {
        await client.connectedAccounts.delete(acc.id)
        deleted++
      } catch { /* ignore individual failures */ }
    }

    if (deleted > 0) {
      console.log(`[Composio] Cleaned up ${deleted} stale connection(s) for ${authConfigId}`)
    }
    return deleted
  } catch (error) {
    console.error('[Composio] Failed to list/clean accounts:', error)
    return 0
  }
}

/**
 * Get or create an auth config for a toolkit (Composio managed auth)
 */
export async function getOrCreateAuthConfig(toolkit: string): Promise<string | null> {
  const client = getClient()

  try {
    const authConfigs = await client.authConfigs.list({
      toolkit: toolkit.toUpperCase(),
    })

    const items = authConfigs?.items || authConfigs || []
    if (Array.isArray(items) && items.length > 0) {
      return items[0].id
    }

    const newConfig = await client.authConfigs.create(toolkit.toUpperCase(), {
      name: `workforce-${toolkit.toLowerCase()}`,
      type: 'use_composio_managed_auth',
    })

    return newConfig?.id || null
  } catch (error) {
    console.error(`[Composio] Failed to get/create auth config for ${toolkit}:`, error)
    return null
  }
}

/**
 * Get auth config ID for a provider from our database.
 * If not cached, creates one via Composio managed auth.
 */
export async function getAuthConfigForProvider(
  providerSlug: string
): Promise<{ authConfigId: string; toolkit: string } | null> {
  const [provider] = await db
    .select()
    .from(integrationProviders)
    .where(eq(integrationProviders.slug, providerSlug))
    .limit(1)

  if (!provider) return null

  const toolkit = provider.composioToolkit || provider.composioAppKey
  if (!toolkit) return null

  // If we have a valid auth config ID stored, use it
  if (provider.composioAppKey?.startsWith('ac_')) {
    return { authConfigId: provider.composioAppKey, toolkit }
  }

  // Otherwise, create one
  const authConfigId = await getOrCreateAuthConfig(toolkit)

  if (authConfigId) {
    await db
      .update(integrationProviders)
      .set({ composioAppKey: authConfigId })
      .where(eq(integrationProviders.id, provider.id))
  }

  return authConfigId ? { authConfigId, toolkit } : null
}

/**
 * Execute a tool action
 */
export async function executeTool(
  tenantId: string,
  toolName: string,
  params: Record<string, unknown>,
  version?: string
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const client = getClient()
  const composioEntityId = buildComposioEntityId(tenantId)

  try {
    const result = await client.tools.execute(toolName, {
      userId: composioEntityId,
      arguments: params,
      ...(version ? { version } : { dangerouslySkipVersionCheck: true }),
    })

    // Check if Composio returned an error in the response body (without throwing)
    const r = result as Record<string, unknown> | undefined
    if (r?.successful === false || r?.error) {
      const errMsg = String(r.error || 'Composio reported failure')
      console.error(`[Composio] Tool ${toolName} returned error:`, errMsg)
      return { success: false, error: errMsg }
    }

    return { success: true, data: result }
  } catch (error) {
    console.error('[Composio] Tool execution failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get all connected accounts for a tenant
 */
export async function getConnectedAccounts(tenantId: string): Promise<ConnectedAccount[]> {
  const client = getClient()
  const composioEntityId = buildComposioEntityId(tenantId)

  try {
    const response = await client.connectedAccounts.list({
      userIds: [composioEntityId],
    })

    return (response.items || []).map((acc) => ({
      id: acc.id,
      status: mapStatus(acc.status),
    }))
  } catch (error) {
    console.error('[Composio] Failed to list connected accounts:', error)
    return []
  }
}

/**
 * Get tools for specified toolkits
 */
export async function getToolsForToolkits(
  toolkits: string[]
): Promise<ComposioTool[]> {
  const client = getClient()

  try {
    const tools = await client.tools.getRawComposioTools({ toolkits })

    return (tools || []).map((tool) => ({
      name: tool.slug || tool.name || '',
      description: tool.description || '',
      parameters: tool.inputParameters || {},
      toolkit: typeof tool.toolkit === 'object' ? tool.toolkit?.slug : (tool.toolkit || ''),
    }))
  } catch (error) {
    console.error('[Composio] Failed to get tools:', error)
    return []
  }
}

/**
 * Fetch a human-readable label for a connected account using platform-specific tools.
 * e.g., FACEBOOK_GET_USER_PAGES to get page names, INSTAGRAM get profile, etc.
 *
 * For Facebook, also returns metadata with full page list for page selection.
 */
async function fetchAccountLabel(
  tenantId: string,
  toolkit: string,
): Promise<{ label: string | null; metadata?: Record<string, unknown> }> {
  const tk = toolkit.toUpperCase()

  try {
    if (tk === 'FACEBOOK') {
      // Get the user's Facebook pages
      // Composio SDK returns { data: { data: [pages], paging: ... }, error, successful }
      const result = await executeTool(tenantId, 'FACEBOOK_GET_USER_PAGES', {})
      const data = result.data as Record<string, unknown> | undefined
      // Navigate the nested response: executeTool wraps in .data, SDK wraps in .data, FB API wraps in .data
      const fbResponse = (data as any)?.data
      const rawPages = Array.isArray(fbResponse) ? fbResponse
        : Array.isArray(fbResponse?.data) ? fbResponse.data
        : (data as any)?.response_data?.data
      if (Array.isArray(rawPages) && rawPages.length > 0) {
        const pages = rawPages.map((p: any) => ({ id: String(p.id), name: String(p.name || p.id) }))
        return {
          label: pages[0].name,
          metadata: {
            pages,
            selectedPageId: pages[0].id,
          },
        }
      }
    } else if (tk === 'INSTAGRAM') {
      // Instagram doesn't have a direct "get profile" — label comes from Facebook page
      return { label: null }
    } else if (tk === 'LINKEDIN') {
      // 1. Get the user's personal profile (author URN + name)
      // Response: { data: { id, localizedFirstName, localizedLastName, ... } }
      const profileResult = await executeTool(tenantId, 'LINKEDIN_GET_MY_INFO', {})
      const profileData = (profileResult.data as any)?.data || profileResult.data
      const personId = profileData?.id || profileData?.sub
      const personUrn = personId ? `urn:li:person:${personId}` : null
      const personName = profileData?.name
        || [profileData?.localizedFirstName || profileData?.given_name,
            profileData?.localizedLastName || profileData?.family_name].filter(Boolean).join(' ')
        || null

      // Build pages list: personal profile first, then company pages
      const pages: Array<{ id: string; name: string }> = []
      if (personUrn && personName) {
        pages.push({ id: personUrn, name: `${personName} (Personal)` })
      }

      // 2. Get organizations the user admins (company pages)
      // Requires r_organization_admin scope — may fail with 403 if scope not granted
      try {
        const orgResult = await executeTool(tenantId, 'LINKEDIN_GET_COMPANY_INFO', { role: 'ADMINISTRATOR' })
        if (orgResult.success) {
          const orgData = (orgResult.data as any)?.data || orgResult.data
          const elements = orgData?.elements || (orgData as any)?.response_data?.elements || []
          if (Array.isArray(elements)) {
            for (const el of elements) {
              const org = el['organization~'] || el.organization_details || {}
              const orgId = el.organization || el.organizationUrn
              const orgName = org.localizedName || org.name
              if (orgId && orgName) {
                const urn = String(orgId).startsWith('urn:') ? String(orgId) : `urn:li:organization:${orgId}`
                pages.push({ id: urn, name: orgName })
              }
            }
          }
        } else {
          console.warn('[Composio] LinkedIn org fetch failed (may need r_organization_admin scope):', orgResult.error)
        }
      } catch (orgErr) {
        console.error('[Composio] Failed to fetch LinkedIn organizations:', orgErr)
      }

      if (pages.length > 0) {
        return {
          label: pages[0].name,
          metadata: {
            pages,
            selectedPageId: pages[0].id,
          },
        }
      }
      if (personName) return { label: personName }
    } else if (tk === 'TWITTER') {
      const result = await executeTool(tenantId, 'TWITTER_GET_USER_DETAILS', {})
      const data = result.data as Record<string, unknown> | undefined
      const user = (data as any)?.response_data?.data || (data as any)?.data
      return { label: user?.name || user?.username || null }
    } else if (tk === 'YOUTUBE') {
      // Get channel name from the user's playlists (mine=true)
      const result = await executeTool(tenantId, 'YOUTUBE_LIST_USER_PLAYLISTS', { maxResults: 1, part: 'snippet' })
      const data = (result.data as any)?.data || result.data
      const items = data?.items || []
      if (Array.isArray(items) && items.length > 0) {
        const channelTitle = items[0]?.snippet?.channelTitle
        if (channelTitle) return { label: channelTitle }
      }
    } else if (tk === 'TIKTOK') {
      // Get TikTok display name
      const result = await executeTool(tenantId, 'TIKTOK_GET_USER_BASIC_INFO', { fields: 'display_name,username' })
      const data = (result.data as any)?.data || result.data
      const user = data?.data?.user || data?.user || data
      return { label: user?.display_name || user?.username || null }
    }
  } catch (err) {
    console.error(`[Composio] Failed to fetch account label for ${toolkit}:`, err)
  }

  return { label: null }
}

function mapStatus(status: string): 'active' | 'pending' | 'expired' {
  const s = status?.toLowerCase()
  if (s === 'active' || s === 'connected') return 'active'
  if (s === 'expired' || s === 'revoked' || s === 'failed') return 'expired'
  return 'pending'
}

// Types
export interface ConnectedAccount {
  id: string
  status: 'active' | 'pending' | 'expired'
}

export interface ComposioTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  toolkit: string
}
