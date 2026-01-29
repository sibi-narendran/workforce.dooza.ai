/**
 * Migrate existing tenants' clawdbot.json to include agents.list
 *
 * Problem: Existing tenants have clawdbot.json without agents.list, which means
 * clawdbot can't discover agent workspaces and their skills.
 *
 * Run with: cd platform && npx tsx --env-file=.env scripts/migrate-tenant-configs.ts
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { sql } from 'drizzle-orm'
import { tenantManager } from '../src/tenant/manager.js'

// Database connection
const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL environment variable is required')
  process.exit(1)
}

const client = postgres(connectionString)
const db = drizzle(client)

interface InstalledAgentRow {
  tenant_id: string
  tenant_name: string
  agent_slug: string
  agent_name: string
}

async function main() {
  console.log('🔄 Migrating tenant clawdbot.json configs...\n')

  try {
    // Query all installed agents with tenant info
    const rows = await db.execute<InstalledAgentRow>(sql`
      SELECT
        ia.tenant_id,
        t.name as tenant_name,
        al.slug as agent_slug,
        al.name as agent_name
      FROM installed_agents ia
      JOIN agent_library al ON ia.agent_id = al.id
      JOIN tenants t ON ia.tenant_id = t.id
      WHERE ia.is_active = true
      ORDER BY t.name, al.slug
    `)

    if (rows.length === 0) {
      console.log('No installed agents found. Nothing to migrate.')
      await client.end()
      return
    }

    // Group by tenant
    const tenantAgents = new Map<string, { tenantName: string; agents: Array<{ slug: string; name: string }> }>()

    for (const row of rows) {
      if (!tenantAgents.has(row.tenant_id)) {
        tenantAgents.set(row.tenant_id, {
          tenantName: row.tenant_name,
          agents: [],
        })
      }
      tenantAgents.get(row.tenant_id)!.agents.push({
        slug: row.agent_slug,
        name: row.agent_name,
      })
    }

    console.log(`📊 Found ${tenantAgents.size} tenants with installed agents\n`)

    let updatedCount = 0
    let skippedCount = 0
    let errorCount = 0

    // Process each tenant
    for (const [tenantId, data] of tenantAgents) {
      console.log(`Tenant: ${data.tenantName} (${tenantId.slice(0, 8)}...)`)

      // Check if tenant directory exists
      const exists = await tenantManager.tenantExists(tenantId)
      if (!exists) {
        console.log(`  ⚠️  Tenant directory does not exist, skipping`)
        skippedCount++
        continue
      }

      try {
        // Load current clawdbot.json (raw to check for workspace vs agentDir)
        const configPath = tenantManager.getClawdbotConfigPath(tenantId)
        const rawContent = await import('node:fs/promises').then(fs => fs.readFile(configPath, 'utf-8'))
        const rawConfig = JSON.parse(rawContent)

        let needsUpdate = false

        // Check if agents.list exists
        if (!rawConfig.agents?.list || rawConfig.agents.list.length === 0) {
          // No agents.list - need to add it
          rawConfig.agents = rawConfig.agents || {}
          rawConfig.agents.list = []
          let isFirst = true

          for (const agent of data.agents) {
            const agentDir = tenantManager.getAgentDir(tenantId, agent.slug)
            rawConfig.agents.list.push({
              id: agent.slug,
              agentDir,
              ...(isFirst ? { default: true } : {}),
            })
            console.log(`  ✅ Added ${agent.slug} to agents.list`)
            isFirst = false
          }
          needsUpdate = true
        } else {
          // Has agents.list - check if entries use 'workspace' instead of 'agentDir'
          for (const entry of rawConfig.agents.list) {
            if (entry.workspace && !entry.agentDir) {
              // Fix: rename workspace to agentDir
              entry.agentDir = entry.workspace
              delete entry.workspace
              console.log(`  🔧 Fixed ${entry.id}: renamed workspace -> agentDir`)
              needsUpdate = true
            } else if (entry.agentDir) {
              console.log(`  ✓  ${entry.id} already has agentDir`)
            }
          }
        }

        if (needsUpdate) {
          // Save updated config
          const fs = await import('node:fs/promises')
          await fs.writeFile(configPath, JSON.stringify(rawConfig, null, 2))
          updatedCount++
        } else {
          console.log(`  ℹ️  Already configured correctly`)
          skippedCount++
        }
      } catch (err) {
        console.log(`  ❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
        errorCount++
      }

      console.log('')
    }

    // Summary
    console.log('─'.repeat(50))
    console.log(`\n✅ Migration complete!`)
    console.log(`   Updated: ${updatedCount} tenants`)
    console.log(`   Skipped: ${skippedCount} tenants`)
    if (errorCount > 0) {
      console.log(`   Errors:  ${errorCount} tenants`)
    }

    if (updatedCount > 0) {
      console.log(`\nRestart the platform to apply changes:`)
      console.log(`  pnpm dev`)
    }
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
