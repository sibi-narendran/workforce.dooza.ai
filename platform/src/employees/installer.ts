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

  // Update clawdbot.json (required for skill discovery)
  await tenantManager.addAgentToClawdbotConfig(tenantId, {
    id: agentSlug,
    agentDir: destPath,  // clawdbot uses agentDir for workspace path
  })

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

  // Use a reliable approach: copy entire template, then restore memory from backup
  // Step 1: Backup tenant's memory directory if it exists
  const tenantMemoryPath = join(destPath, 'memory')
  const backupMemoryPath = join(destPath, '.memory-backup')
  let hadMemory = false

  try {
    await access(tenantMemoryPath)
    hadMemory = true
    // Backup memory
    await cp(tenantMemoryPath, backupMemoryPath, { recursive: true, force: true })
  } catch {
    // No memory directory to backup
  }

  // Step 2: Copy entire template (this overwrites everything including memory)
  await cp(templatePath, destPath, {
    recursive: true,
    force: true,
    preserveTimestamps: true,
  })

  // Step 3: Restore tenant's memory from backup
  if (hadMemory) {
    try {
      // Remove the template's memory (if any)
      await rm(tenantMemoryPath, { recursive: true, force: true })
      // Restore tenant's memory
      await cp(backupMemoryPath, tenantMemoryPath, { recursive: true, force: true })
      // Clean up backup
      await rm(backupMemoryPath, { recursive: true, force: true })
    } catch (err) {
      console.warn(`[Installer] Failed to restore memory for ${agentSlug}:`, err)
    }
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
