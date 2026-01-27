/**
 * Migration script to create agent_library and installed_agents tables,
 * then seed with clawdbot agents.
 */
import { db } from './client.js'
import { agentLibrary, installedAgents } from './schema.js'
import { sql } from 'drizzle-orm'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const CLAWDBOT_CONFIG_PATH = join(homedir(), '.clawdbot', 'clawdbot.json')

// Gradient colors for each agent
const AGENT_GRADIENTS: Record<string, string> = {
  'clawd': 'linear-gradient(135deg, #ef4444, #dc2626)',
  'soshie': 'linear-gradient(135deg, #3b82f6, #2563eb)',
  'researcher': 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
  'creator': 'linear-gradient(135deg, #f59e0b, #d97706)',
  'publisher': 'linear-gradient(135deg, #10b981, #059669)',
  'writer': 'linear-gradient(135deg, #ec4899, #db2777)',
  'data-analyst': 'linear-gradient(135deg, #06b6d4, #0891b2)',
  'customer-support': 'linear-gradient(135deg, #6366f1, #4f46e5)',
  'code-reviewer': 'linear-gradient(135deg, #14b8a6, #0d9488)',
  'project-manager': 'linear-gradient(135deg, #f97316, #ea580c)',
}

// Category mapping
const AGENT_CATEGORIES: Record<string, string> = {
  'clawd': 'assistant',
  'soshie': 'specialist',
  'researcher': 'specialist',
  'creator': 'creative',
  'publisher': 'specialist',
  'writer': 'creative',
  'data-analyst': 'specialist',
  'customer-support': 'support',
  'code-reviewer': 'specialist',
  'project-manager': 'specialist',
}

async function createTables() {
  console.log('Creating tables...')

  // Create agent_library table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agent_library (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      emoji TEXT,
      gradient TEXT,
      category TEXT DEFAULT 'assistant',
      default_model TEXT DEFAULT 'openrouter/anthropic/claude-sonnet-4',
      identity_prompt TEXT,
      skills TEXT[],
      is_public BOOLEAN DEFAULT true,
      install_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // Create installed_agents table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS installed_agents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      user_id UUID NOT NULL,
      agent_id UUID NOT NULL REFERENCES agent_library(id),
      custom_name TEXT,
      custom_prompt TEXT,
      custom_model TEXT,
      settings JSONB,
      is_active BOOLEAN DEFAULT true,
      installed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // Create index for faster lookups
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_installed_agents_tenant
    ON installed_agents(tenant_id)
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_installed_agents_user
    ON installed_agents(user_id)
  `)

  console.log('Tables created successfully')
}

async function seedAgents() {
  console.log('Seeding agents from clawdbot.json...')

  if (!existsSync(CLAWDBOT_CONFIG_PATH)) {
    console.error('clawdbot.json not found at', CLAWDBOT_CONFIG_PATH)
    return
  }

  const content = await readFile(CLAWDBOT_CONFIG_PATH, 'utf-8')
  const config = JSON.parse(content)
  const agentsList = config?.agents?.list || []

  console.log(`Found ${agentsList.length} agents to seed`)

  for (const agent of agentsList) {
    const identity = agent.identity || {}
    const agentId = agent.id || ''
    const theme = identity.theme || ''

    const agentData = {
      slug: agentId,
      name: identity.name || agent.name || agentId,
      description: theme ? `AI ${theme}` : `Clawdbot agent: ${identity.name || agentId}`,
      emoji: identity.emoji || '🤖',
      gradient: AGENT_GRADIENTS[agentId] || 'linear-gradient(135deg, #6b7280, #4b5563)',
      category: AGENT_CATEGORIES[agentId] || 'assistant',
      defaultModel: agent.model || 'openrouter/anthropic/claude-sonnet-4',
      identityPrompt: null, // Could extract from agent config if available
      skills: [],
      isPublic: true,
      installCount: 0,
    }

    // Upsert - insert or update if exists
    await db.insert(agentLibrary)
      .values(agentData)
      .onConflictDoUpdate({
        target: agentLibrary.slug,
        set: {
          name: agentData.name,
          description: agentData.description,
          emoji: agentData.emoji,
          gradient: agentData.gradient,
          category: agentData.category,
          defaultModel: agentData.defaultModel,
          updatedAt: new Date(),
        }
      })

    console.log(`  ✓ ${agentData.name} (${agentId})`)
  }

  console.log('Seeding complete!')
}

async function main() {
  try {
    await createTables()
    await seedAgents()
    console.log('\n✅ Migration complete!')
    process.exit(0)
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

main()
