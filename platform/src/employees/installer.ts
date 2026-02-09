/**
 * Agent Installer - Copies agent templates to tenant directories
 *
 * Agents are defined in platform/src/employees/agents/{slug}/
 * When a user installs an agent, this copies the template to their tenant directory.
 */
import { mkdir, cp, rm, readdir, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tenantManager } from '../tenant/manager.js'
import { getTemplate } from './templates.js'
import { buildAgentToolsConfig } from './templates.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Path to agent templates (relative to this file)
const AGENTS_TEMPLATE_DIR = join(__dirname, 'agents')

/**
 * Get the template path for an agent
 */
export function getAgentTemplatePath(agentSlug: string): string {
  return join(AGENTS_TEMPLATE_DIR, agentSlug)
}

/**
 * Check if an agent template exists
 */
export async function agentTemplateExists(agentSlug: string): Promise<boolean> {
  try {
    await access(getAgentTemplatePath(agentSlug))
    return true
  } catch {
    return false
  }
}

/**
 * Get list of available agent templates
 */
export async function getAvailableAgentTemplates(): Promise<string[]> {
  try {
    const entries = await readdir(AGENTS_TEMPLATE_DIR, { withFileTypes: true })
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  } catch {
    return []
  }
}

/**
 * Install an agent for a tenant
 *
 * Copies the agent template to the tenant's agents directory
 * and updates moltbot.json with the agent registration.
 */
export async function installAgentForTenant(
  tenantId: string,
  agentSlug: string,
  agentName?: string
): Promise<void> {
  // Verify template exists
  const templatePath = getAgentTemplatePath(agentSlug)
  const templateExists = await agentTemplateExists(agentSlug)

  if (!templateExists) {
    throw new Error(`Agent template not found: ${agentSlug}`)
  }

  // Create destination directory
  const destPath = tenantManager.getAgentDir(tenantId, agentSlug)
  await mkdir(destPath, { recursive: true })

  // Copy template to tenant directory
  await cp(templatePath, destPath, {
    recursive: true,
    force: true,
    // Preserve timestamps
    preserveTimestamps: true,
  })

  console.log(`[Installer] Copied agent template ${agentSlug} to ${destPath}`)

  // Update moltbot.json
  await tenantManager.addAgentToMoltbotConfig(tenantId, {
    id: agentSlug,
    name: agentName || agentSlug,
    workspace: destPath,
  })

  // Look up template for tool/plugin requirements
  const template = getTemplate(agentSlug)

  // Update clawdbot.json (required for skill discovery)
  const toolsConfig = template ? buildAgentToolsConfig(template) : undefined
  await tenantManager.addAgentToClawdbotConfig(tenantId, {
    id: agentSlug,
    agentDir: destPath,  // clawdbot uses agentDir for workspace path
    ...(toolsConfig ? { tools: toolsConfig } : {}),
  })

  // Enable required plugins for this agent
  if (template?.requiredTools?.plugins?.length) {
    await tenantManager.enablePlugins(tenantId, template.requiredTools.plugins)
  }

  console.log(`[Installer] Updated configs for tenant ${tenantId} with agent ${agentSlug}`)
}

/**
 * Uninstall an agent from a tenant
 *
 * Removes the agent directory and updates moltbot.json.
 */
export async function uninstallAgentFromTenant(
  tenantId: string,
  agentSlug: string
): Promise<void> {
  const agentPath = tenantManager.getAgentDir(tenantId, agentSlug)

  // Remove agent directory
  try {
    await rm(agentPath, { recursive: true, force: true })
    console.log(`[Installer] Removed agent directory ${agentPath}`)
  } catch (err) {
    console.warn(`[Installer] Failed to remove agent directory ${agentPath}:`, err)
  }

  // Update moltbot.json
  await tenantManager.removeAgentFromMoltbotConfig(tenantId, agentSlug)

  // Update clawdbot.json
  await tenantManager.removeAgentFromClawdbotConfig(tenantId, agentSlug)

  console.log(`[Installer] Removed agent ${agentSlug} from configs for tenant ${tenantId}`)
}

/**
 * Update an agent for a tenant
 *
 * Re-copies the template to the tenant's directory.
 * Note: This will overwrite any local customizations except memory.
 */
export async function updateAgentForTenant(
  tenantId: string,
  agentSlug: string
): Promise<void> {
  const templatePath = getAgentTemplatePath(agentSlug)
  const destPath = tenantManager.getAgentDir(tenantId, agentSlug)

  // Check if template exists
  const templateExists = await agentTemplateExists(agentSlug)
  if (!templateExists) {
    throw new Error(`Agent template not found: ${agentSlug}`)
  }

  // Copy entire template, then restore tenant-specific data from backup.
  // These files/dirs are per-tenant and must survive template updates:
  const TENANT_PRESERVED = ['memory', 'USER.md', 'MEMORY.md', 'TOOLS.md']
  const backupDir = join(destPath, '.tenant-backup')

  // Step 1: Backup tenant-specific files
  const preserved: string[] = []
  for (const name of TENANT_PRESERVED) {
    try {
      await access(join(destPath, name))
      preserved.push(name)
    } catch {
      // File/dir doesn't exist yet — nothing to preserve
    }
  }
  if (preserved.length > 0) {
    await mkdir(backupDir, { recursive: true })
    for (const name of preserved) {
      await cp(join(destPath, name), join(backupDir, name), { recursive: true, force: true })
    }
  }

  // Step 2: Copy entire template (overwrites everything)
  await cp(templatePath, destPath, {
    recursive: true,
    force: true,
    preserveTimestamps: true,
  })

  // Step 3: Restore tenant-specific files from backup
  if (preserved.length > 0) {
    for (const name of preserved) {
      try {
        await rm(join(destPath, name), { recursive: true, force: true })
        await cp(join(backupDir, name), join(destPath, name), { recursive: true, force: true })
      } catch (err) {
        console.warn(`[Installer] Failed to restore ${name} for ${agentSlug}:`, err)
      }
    }
    await rm(backupDir, { recursive: true, force: true })
  }

  console.log(`[Installer] Updated agent ${agentSlug} for tenant ${tenantId}`)
}

/**
 * Check if an agent is installed for a tenant
 */
export async function isAgentInstalled(
  tenantId: string,
  agentSlug: string
): Promise<boolean> {
  try {
    const agentPath = tenantManager.getAgentDir(tenantId, agentSlug)
    await access(agentPath)
    return true
  } catch {
    return false
  }
}

/**
 * Get list of installed agents for a tenant (from filesystem)
 */
export async function getInstalledAgentsForTenant(tenantId: string): Promise<string[]> {
  try {
    const agentsDir = tenantManager.getAgentsDir(tenantId)
    const entries = await readdir(agentsDir, { withFileTypes: true })
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  } catch {
    return []
  }
}
