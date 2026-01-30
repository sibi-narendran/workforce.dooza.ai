/**
 * Migration script to create integration tables and seed providers
 *
 * Auth configs are created automatically when a user first connects to a provider.
 * The system uses Composio's managed authentication (their OAuth apps).
 */
import { db } from './client.js'
import { integrationProviders } from './schema.js'
import { sql } from 'drizzle-orm'

// Integration providers to seed
// composioToolkit is the toolkit name used to create auth configs
// composioAppKey will be populated automatically when auth config is created
const PROVIDERS = [
  {
    slug: 'gmail',
    name: 'Gmail',
    description: 'Read and send emails from your Gmail account',
    icon: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico',
    composioToolkit: 'GMAIL',
    category: 'communication',
  },
  {
    slug: 'google-calendar',
    name: 'Google Calendar',
    description: 'Manage your calendar events and schedules',
    icon: 'https://calendar.google.com/googlecalendar/images/favicons_2020q4/calendar_31.ico',
    composioToolkit: 'GOOGLECALENDAR',
    category: 'productivity',
  },
  {
    slug: 'google-drive',
    name: 'Google Drive',
    description: 'Access and manage files in your Google Drive',
    icon: 'https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png',
    composioToolkit: 'GOOGLEDRIVE',
    category: 'storage',
  },
  {
    slug: 'slack',
    name: 'Slack',
    description: 'Send messages and interact with Slack workspaces',
    icon: 'https://a.slack-edge.com/80588/marketing/img/meta/favicon-32.png',
    composioToolkit: 'SLACK',
    category: 'communication',
  },
  {
    slug: 'github',
    name: 'GitHub',
    description: 'Manage repositories, issues, and pull requests',
    icon: 'https://github.githubassets.com/favicons/favicon.svg',
    composioToolkit: 'GITHUB',
    category: 'dev',
  },
  {
    slug: 'notion',
    name: 'Notion',
    description: 'Access and update your Notion workspace',
    icon: 'https://www.notion.so/images/favicon.ico',
    composioToolkit: 'NOTION',
    category: 'productivity',
  },
  {
    slug: 'linear',
    name: 'Linear',
    description: 'Manage issues and projects in Linear',
    icon: 'https://linear.app/favicon.ico',
    composioToolkit: 'LINEAR',
    category: 'dev',
  },
  {
    slug: 'discord',
    name: 'Discord',
    description: 'Send messages and interact with Discord servers',
    icon: 'https://discord.com/assets/favicon.ico',
    composioToolkit: 'DISCORD',
    category: 'communication',
  },
  {
    slug: 'twitter',
    name: 'Twitter/X',
    description: 'Post tweets and interact with Twitter',
    icon: 'https://abs.twimg.com/favicons/twitter.3.ico',
    composioToolkit: 'TWITTER',
    category: 'social',
  },
  {
    slug: 'trello',
    name: 'Trello',
    description: 'Manage boards, lists, and cards in Trello',
    icon: 'https://trello.com/favicon.ico',
    composioToolkit: 'TRELLO',
    category: 'productivity',
  },
  {
    slug: 'asana',
    name: 'Asana',
    description: 'Manage tasks and projects in Asana',
    icon: 'https://asana.com/favicon.ico',
    composioToolkit: 'ASANA',
    category: 'productivity',
  },
]

async function createTables() {
  console.log('Creating integration tables...')

  // Create integration_providers table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS integration_providers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      composio_app_key TEXT NOT NULL,
      composio_toolkit TEXT,
      category TEXT DEFAULT 'productivity',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // Create user_integrations table (tenant-scoped, 1 user = 1 tenant for now)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_integrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      provider_id UUID NOT NULL REFERENCES integration_providers(id),
      composio_entity_id TEXT NOT NULL,
      composio_connection_id TEXT NOT NULL,
      status TEXT DEFAULT 'connected',
      connected_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, provider_id)
    )
  `)

  // Create agent_integration_skills table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agent_integration_skills (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id UUID NOT NULL REFERENCES agent_library(id),
      provider_id UUID NOT NULL REFERENCES integration_providers(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(agent_id, provider_id)
    )
  `)

  // Create indexes for faster lookups
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_user_integrations_tenant
    ON user_integrations(tenant_id)
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_agent_integration_skills_agent
    ON agent_integration_skills(agent_id)
  `)

  console.log('Integration tables created successfully')
}

async function seedProviders() {
  console.log('Seeding integration providers...')

  for (const provider of PROVIDERS) {
    await db.insert(integrationProviders)
      .values({
        slug: provider.slug,
        name: provider.name,
        description: provider.description,
        icon: provider.icon,
        composioAppKey: provider.composioToolkit, // Will be replaced with auth config ID on first use
        composioToolkit: provider.composioToolkit,
        category: provider.category,
        isActive: true, // Active by default - auth configs created automatically
      })
      .onConflictDoUpdate({
        target: integrationProviders.slug,
        set: {
          name: provider.name,
          description: provider.description,
          icon: provider.icon,
          composioToolkit: provider.composioToolkit,
          category: provider.category,
        }
      })

    console.log(`  ✓ ${provider.name} (${provider.slug})`)
  }

  console.log('')
  console.log('Providers seeded successfully!')
  console.log('Auth configs will be created automatically when users connect.')
}

async function main() {
  try {
    await createTables()
    await seedProviders()
    console.log('\n✅ Integration migration complete!')
    process.exit(0)
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

main()
