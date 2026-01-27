/**
 * Composio SDK wrapper for managing user integrations
 *
 * Documentation: https://docs.composio.dev/docs/quickstart
 * API Reference: https://docs.composio.dev/type-script/models/connected-accounts
 */
import { Composio } from '@composio/core'
import { env } from '../lib/env.js'
import { db } from '../db/client.js'
import { integrationProviders } from '../db/schema.js'
import { eq } from 'drizzle-orm'

// Initialize Composio client (singleton)
let composioClient: Composio | null = null

/**
 * Get Composio client instance
 *
 * Toolkit versioning can be configured via environment variables:
 * - COMPOSIO_TOOLKIT_VERSION_GITHUB=20250909_00
 * - COMPOSIO_TOOLKIT_VERSION_SLACK=20250902_00
 * - etc.
 *
 * The SDK automatically reads these env vars for version pinning.
 */
function getClient(): Composio {
  if (!composioClient) {
    if (!env.COMPOSIO_API_KEY) {
      throw new Error('COMPOSIO_API_KEY environment variable is not set')
    }
    composioClient = new Composio({
      apiKey: env.COMPOSIO_API_KEY,
      // Toolkit versions can be set via COMPOSIO_TOOLKIT_VERSION_* env vars
      // or explicitly here for production stability:
      // toolkitVersions: {
      //   github: '20250909_00',
      //   gmail: '20250909_00',
      // },
    })
  }
  return composioClient
}

/**
 * Build a consistent entity ID for Composio
 * Uses format: workforce-{tenantId}
 * Since 1 user = 1 tenant, this identifies the user's workspace
 */
export function buildComposioEntityId(tenantId: string): string {
  return `workforce-${tenantId}`
}

/**
 * Initiate OAuth connection for an app
 *
 * @param tenantId - Our platform's tenant ID (1 user = 1 tenant)
 * @param authConfigId - Composio auth config ID
 * @param callbackUrl - URL to redirect after OAuth
 * @returns Connection request with redirectUrl
 */
export async function initiateConnection(
  tenantId: string,
  authConfigId: string,
  callbackUrl: string
): Promise<{ redirectUrl: string; connectionId?: string }> {
  const client = getClient()
  const composioEntityId = buildComposioEntityId(tenantId)

  try {
    const connectionRequest = await client.connectedAccounts.initiate(
      composioEntityId,
      authConfigId,
      {
        callbackUrl,
      }
    )

    return {
      redirectUrl: connectionRequest.redirectUrl || '',
      connectionId: connectionRequest.id,
    }
  } catch (error) {
    console.error('[Composio] Failed to initiate connection:', error)
    throw error
  }
}

/**
 * Wait for a connection to become active
 * Used after OAuth callback to confirm the connection
 *
 * @param connectionId - The connection request ID
 * @param timeoutMs - How long to wait (default 60s)
 */
export async function waitForConnection(
  connectionId: string,
  timeoutMs: number = 60000
): Promise<ConnectedAccount | null> {
  const client = getClient()

  try {
    const connectedAccount = await client.connectedAccounts.waitForConnection(
      connectionId,
      timeoutMs
    )
    return {
      id: connectedAccount.id,
      status: mapStatus(connectedAccount.status),
    }
  } catch (error) {
    console.error('[Composio] Connection wait failed:', error)
    return null
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
 * Get a specific connected account
 */
export async function getConnectedAccount(
  connectionId: string
): Promise<ConnectedAccount | null> {
  const client = getClient()

  try {
    const account = await client.connectedAccounts.get(connectionId)
    return {
      id: account.id,
      status: mapStatus(account.status),
    }
  } catch (error) {
    console.error('[Composio] Failed to get connected account:', error)
    return null
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
 * Get tools for specified toolkits
 *
 * Note: This returns tool definitions. User's connected accounts should be
 * checked separately via getConnectedAccounts() to filter available tools.
 *
 * @param toolkits - Array of toolkit names (e.g., ['GMAIL', 'SLACK'])
 * @returns Array of tools that can be passed to AI model
 */
export async function getToolsForToolkits(
  toolkits: string[]
): Promise<ComposioTool[]> {
  const client = getClient()

  try {
    // Use getRawComposioTools to get raw Tool format (not OpenAI-wrapped)
    // Returns ToolList which is Array<Tool>
    const tools = await client.tools.getRawComposioTools({
      toolkits,
    })

    // Convert to our tool format
    // SDK Tool properties: slug, name, description?, inputParameters?, toolkit?
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
 * Execute a tool action
 *
 * @param tenantId - Our platform's tenant ID (1 user = 1 tenant)
 * @param toolName - The tool to execute (e.g., 'GMAIL_SEND_EMAIL')
 * @param params - Parameters for the tool
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
    // SDK signature: execute(toolSlug, { userId, arguments, version?, ... })
    // Version can be:
    // 1. Explicitly passed to this function
    // 2. Set via COMPOSIO_TOOLKIT_VERSION_* env vars (SDK reads automatically)
    // 3. Skipped with dangerouslySkipVersionCheck (not recommended for production)
    const result = await client.tools.execute(toolName, {
      userId: composioEntityId,
      arguments: params,
      ...(version ? { version } : { dangerouslySkipVersionCheck: true }),
    })
    return {
      success: true,
      data: result,
    }
  } catch (error) {
    console.error('[Composio] Tool execution failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get or create an auth config for a toolkit
 *
 * This uses Composio's managed authentication, which means Composio
 * handles the OAuth credentials. No need to set up your own OAuth apps.
 *
 * @param toolkit - The toolkit name (e.g., 'GMAIL', 'SLACK', 'GITHUB')
 * @returns The auth config ID (starts with 'ac_')
 */
export async function getOrCreateAuthConfig(toolkit: string): Promise<string | null> {
  const client = getClient()

  try {
    // First, try to find an existing auth config for this toolkit
    const authConfigs = await client.authConfigs.list({
      toolkit: toolkit.toUpperCase(),
    })

    // Use existing config if found
    const items = authConfigs?.items || authConfigs || []
    if (Array.isArray(items) && items.length > 0) {
      return items[0].id
    }

    // Create a new auth config using Composio's managed auth
    // SDK signature: create(toolkit: string, options: CreateAuthConfigParams)
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
 * Get auth config ID for a provider from our database
 *
 * If the stored composioAppKey is a valid auth config ID (starts with 'ac_'),
 * use it directly. Otherwise, try to get or create one.
 */
export async function getAuthConfigForProvider(providerSlug: string): Promise<string | null> {
  const [provider] = await db
    .select()
    .from(integrationProviders)
    .where(eq(integrationProviders.slug, providerSlug))
    .limit(1)

  if (!provider) {
    return null
  }

  // If we have a valid auth config ID stored, use it
  if (provider.composioAppKey?.startsWith('ac_')) {
    return provider.composioAppKey
  }

  // Otherwise, try to get or create an auth config using the toolkit name
  const toolkit = provider.composioToolkit || provider.composioAppKey
  if (!toolkit) {
    return null
  }

  const authConfigId = await getOrCreateAuthConfig(toolkit)

  // Update the provider record with the new auth config ID
  if (authConfigId) {
    await db
      .update(integrationProviders)
      .set({ composioAppKey: authConfigId })
      .where(eq(integrationProviders.id, provider.id))
  }

  return authConfigId
}

/**
 * Map Composio status to our simplified status
 */
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
