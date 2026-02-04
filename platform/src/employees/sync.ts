/**
 * Sync agent templates to all existing tenant installations.
 *
 * - syncAgentConfigForAllTenants(slug) — updates clawdbot.json (tools, plugins)
 * - syncAgentFilesForAllTenants(slug) — re-copies template files (AGENTS.md, SOUL.md, etc.)
 * - syncAllAgentTemplates() — runs both for every template with installations (startup hook)
 */
import { db } from '../db/client.js'
import { installedAgents, agentLibrary } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { tenantManager } from '../tenant/manager.js'
import { getTemplate, EMPLOYEE_TEMPLATES, buildAgentToolsConfig } from './templates.js'
import { updateAgentForTenant, agentTemplateExists } from './installer.js'


/**
 * Sync clawdbot.json config (per-agent tools, plugins) for one agent across all tenants.
 */
export async function syncAgentConfigForAllTenants(agentSlug: string): Promise<{
  synced: number
  errors: string[]
}> {
  const template = getTemplate(agentSlug)
  if (!template) {
    return { synced: 0, errors: [`Template not found: ${agentSlug}`] }
  }

  // Find the library entry for this slug
  const [libraryEntry] = await db
    .select({ id: agentLibrary.id })
    .from(agentLibrary)
    .where(eq(agentLibrary.slug, agentSlug))
    .limit(1)

  if (!libraryEntry) {
    return { synced: 0, errors: [`Agent not found in library: ${agentSlug}`] }
  }

  // Get all active installations
  const installations = await db
    .select({ tenantId: installedAgents.tenantId })
    .from(installedAgents)
    .where(
      and(
        eq(installedAgents.agentId, libraryEntry.id),
        eq(installedAgents.isActive, true)
      )
    )

  let synced = 0
  const errors: string[] = []

  for (const { tenantId } of installations) {
    try {
      const config = await tenantManager.loadClawdbotConfig(tenantId)

      // Find agent entry in agents.list
      if (!config.agents.list) {
        errors.push(`${tenantId}: no agents.list in config`)
        continue
      }

      const agentIndex = config.agents.list.findIndex(a => a.id === agentSlug)
      if (agentIndex < 0) {
        errors.push(`${tenantId}: agent ${agentSlug} not in agents.list`)
        continue
      }

      // Update per-agent tools from template (alsoAllow + sandbox allow)
      const toolsConfig = buildAgentToolsConfig(template)
      if (toolsConfig) {
        config.agents.list[agentIndex].tools = toolsConfig
      } else {
        delete config.agents.list[agentIndex].tools
      }

      // Enable required plugins
      if (template.requiredTools?.plugins?.length) {
        if (!config.plugins) {
          config.plugins = { enabled: true }
        }
        if (!config.plugins.entries) {
          config.plugins.entries = {}
        }
        for (const pluginId of template.requiredTools.plugins) {
          config.plugins.entries[pluginId] = { enabled: true }
        }
      }

      // Remove stale tenant-level tools.alsoAllow if present
      if (config.tools && 'alsoAllow' in config.tools) {
        delete (config.tools as Record<string, unknown>).alsoAllow
      }

      await tenantManager.saveClawdbotConfig(tenantId, config)
      synced++
    } catch (err) {
      errors.push(`${tenantId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { synced, errors }
}

/**
 * Re-copy template files (AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md) for one agent
 * across all tenants that have it installed. Uses updateAgentForTenant which
 * preserves tenant memory via backup/restore.
 */
export async function syncAgentFilesForAllTenants(agentSlug: string): Promise<{
  synced: number
  errors: string[]
}> {
  // Check template exists on filesystem
  const hasTemplate = await agentTemplateExists(agentSlug)
  if (!hasTemplate) {
    return { synced: 0, errors: [`Agent template not found on filesystem: ${agentSlug}`] }
  }

  // Find the library entry for this slug
  const [libraryEntry] = await db
    .select({ id: agentLibrary.id })
    .from(agentLibrary)
    .where(eq(agentLibrary.slug, agentSlug))
    .limit(1)

  if (!libraryEntry) {
    return { synced: 0, errors: [`Agent not found in library: ${agentSlug}`] }
  }

  // Get all active installations
  const installations = await db
    .select({ tenantId: installedAgents.tenantId })
    .from(installedAgents)
    .where(
      and(
        eq(installedAgents.agentId, libraryEntry.id),
        eq(installedAgents.isActive, true)
      )
    )

  let synced = 0
  const errors: string[] = []

  for (const { tenantId } of installations) {
    try {
      await updateAgentForTenant(tenantId, agentSlug)
      synced++
    } catch (err) {
      errors.push(`${tenantId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { synced, errors }
}

/**
 * Sync all agent templates to all tenants. Called on server startup.
 * For each template that has installations, re-copies files and updates config.
 */
export async function syncAllAgentTemplates(): Promise<void> {
  console.log('[Sync] Starting agent template sync...')

  let totalFiles = 0
  let totalConfig = 0
  const allErrors: string[] = []

  for (const template of EMPLOYEE_TEMPLATES) {
    const slug = template.type

    // Sync files (AGENTS.md, SOUL.md, etc.)
    const hasTemplate = await agentTemplateExists(slug)
    if (hasTemplate) {
      const files = await syncAgentFilesForAllTenants(slug)
      totalFiles += files.synced
      allErrors.push(...files.errors)
    }

    // Sync config (clawdbot.json tools/plugins)
    const config = await syncAgentConfigForAllTenants(slug)
    totalConfig += config.synced
    allErrors.push(...config.errors)
  }

  if (allErrors.length > 0) {
    console.warn(`[Sync] Completed with ${allErrors.length} errors:`, allErrors)
  }

  console.log(`[Sync] Synced ${totalFiles} file copies, ${totalConfig} config updates across ${EMPLOYEE_TEMPLATES.length} templates`)
}
