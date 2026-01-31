#!/usr/bin/env npx tsx
/**
 * Migration Script: Fix Tenant Configs for Full Isolation
 *
 * This script fixes existing tenant clawdbot.json configs so:
 * 1. sandbox.workspaceRoot covers entire tenant directory (not just /workspace/)
 * 2. agents.list[].workspace points to copied files (not source template)
 *
 * Run: npx tsx src/scripts/migrate-tenant-configs.ts
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Resolve paths relative to script location
const PLATFORM_DIR = join(__dirname, '..', '..')
const TENANTS_DIR = join(PLATFORM_DIR, 'data', 'tenants')

interface AgentEntry {
  id: string
  default?: boolean
  workspace: string
  agentDir: string
}

interface ClawdbotConfig {
  gateway: Record<string, unknown>
  tools?: Record<string, unknown>
  agents: {
    defaults: {
      model: Record<string, unknown>
      sandbox?: {
        mode?: string
        workspaceRoot?: string
        workspaceAccess?: string
      }
    }
    list?: AgentEntry[]
  }
  [key: string]: unknown
}

async function getTenantIds(): Promise<string[]> {
  try {
    const entries = await readdir(TENANTS_DIR, { withFileTypes: true })
    return entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => entry.name)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('No tenants directory found at:', TENANTS_DIR)
      return []
    }
    throw error
  }
}

async function loadClawdbotConfig(tenantId: string): Promise<ClawdbotConfig | null> {
  const configPath = join(TENANTS_DIR, tenantId, 'clawdbot.json')
  try {
    const content = await readFile(configPath, 'utf-8')
    return JSON.parse(content) as ClawdbotConfig
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(`  - No clawdbot.json found for tenant ${tenantId}`)
      return null
    }
    throw error
  }
}

async function saveClawdbotConfig(tenantId: string, config: ClawdbotConfig): Promise<void> {
  const configPath = join(TENANTS_DIR, tenantId, 'clawdbot.json')
  await writeFile(configPath, JSON.stringify(config, null, 2))
}

function migrateTenantConfig(tenantId: string, config: ClawdbotConfig): { config: ClawdbotConfig; changes: string[] } {
  const changes: string[] = []
  const tenantDir = join(TENANTS_DIR, tenantId)

  // Fix 1: sandbox.workspaceRoot should be tenantDir (not tenantDir/workspace)
  if (config.agents.defaults.sandbox) {
    const currentRoot = config.agents.defaults.sandbox.workspaceRoot
    const expectedRoot = tenantDir

    if (currentRoot && currentRoot !== expectedRoot) {
      // Check if it's pointing to /workspace subdirectory
      if (currentRoot.endsWith('/workspace') || currentRoot.endsWith('\\workspace')) {
        config.agents.defaults.sandbox.workspaceRoot = expectedRoot
        changes.push(`sandbox.workspaceRoot: ${currentRoot} -> ${expectedRoot}`)
      }
    } else if (!currentRoot) {
      config.agents.defaults.sandbox.workspaceRoot = expectedRoot
      changes.push(`sandbox.workspaceRoot: (missing) -> ${expectedRoot}`)
    }
  }

  // Fix 2: agents.list[].workspace should point to tenant's agents directory
  if (config.agents.list && Array.isArray(config.agents.list)) {
    for (const agent of config.agents.list) {
      const expectedWorkspace = join(tenantDir, 'agents', agent.id)

      // Check if workspace points to source template (platform/src/employees/agents/)
      if (agent.workspace.includes('/employees/agents/') || agent.workspace.includes('\\employees\\agents\\')) {
        agent.workspace = expectedWorkspace
        agent.agentDir = expectedWorkspace
        changes.push(`agent[${agent.id}].workspace: (source template) -> ${expectedWorkspace}`)
      }
      // Also fix if agentDir is wrong
      else if (agent.agentDir !== expectedWorkspace) {
        if (agent.agentDir.includes('/employees/agents/') || agent.agentDir.includes('\\employees\\agents\\')) {
          agent.agentDir = expectedWorkspace
          changes.push(`agent[${agent.id}].agentDir: (source template) -> ${expectedWorkspace}`)
        }
      }
    }
  }

  return { config, changes }
}

async function main() {
  console.log('=== Tenant Config Migration Script ===\n')
  console.log('Tenants directory:', TENANTS_DIR)

  const tenantIds = await getTenantIds()

  if (tenantIds.length === 0) {
    console.log('\nNo tenants found. Nothing to migrate.')
    return
  }

  console.log(`\nFound ${tenantIds.length} tenant(s):\n`)

  let totalMigrated = 0
  let totalSkipped = 0
  let totalErrors = 0

  for (const tenantId of tenantIds) {
    console.log(`\nTenant: ${tenantId}`)

    try {
      const config = await loadClawdbotConfig(tenantId)
      if (!config) {
        totalSkipped++
        continue
      }

      const { config: migratedConfig, changes } = migrateTenantConfig(tenantId, config)

      if (changes.length === 0) {
        console.log('  - Already up to date, no changes needed')
        totalSkipped++
      } else {
        console.log('  - Changes:')
        for (const change of changes) {
          console.log(`    * ${change}`)
        }

        await saveClawdbotConfig(tenantId, migratedConfig)
        console.log('  - Config saved successfully')
        totalMigrated++
      }
    } catch (error) {
      console.error(`  - Error migrating tenant ${tenantId}:`, error)
      totalErrors++
    }
  }

  console.log('\n=== Migration Summary ===')
  console.log(`Migrated: ${totalMigrated}`)
  console.log(`Skipped (already up to date): ${totalSkipped}`)
  console.log(`Errors: ${totalErrors}`)
  console.log('')

  if (totalMigrated > 0) {
    console.log('Migration completed. Verify with:')
    console.log(`  cat ${TENANTS_DIR}/*/clawdbot.json | jq '.agents'`)
  }
}

main().catch(error => {
  console.error('Migration failed:', error)
  process.exit(1)
})
