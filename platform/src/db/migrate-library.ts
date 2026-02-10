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
  'utumy': 'linear-gradient(135deg, #ff0000, #cc0000)',
  'somi': 'linear-gradient(135deg, #ec4899, #8b5cf6)',
  'researcher': 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
  'creator': 'linear-gradient(135deg, #f59e0b, #d97706)',
  'publisher': 'linear-gradient(135deg, #10b981, #059669)',
  'writer': 'linear-gradient(135deg, #ec4899, #db2777)',
  'data-analyst': 'linear-gradient(135deg, #06b6d4, #0891b2)',
  'customer-support': 'linear-gradient(135deg, #6366f1, #4f46e5)',
  'code-reviewer': 'linear-gradient(135deg, #14b8a6, #0d9488)',
  'project-manager': 'linear-gradient(135deg, #f97316, #ea580c)',
  'linky': 'linear-gradient(135deg, #0A66C2, #004182)',
  'ranky': 'linear-gradient(135deg, #22c55e, #15803d)',
}

// Category mapping
const AGENT_CATEGORIES: Record<string, string> = {
  'clawd': 'assistant',
  'soshie': 'specialist',
  'utumy': 'social-media',
  'somi': 'social-media',
  'researcher': 'specialist',
  'creator': 'creative',
  'publisher': 'specialist',
  'writer': 'creative',
  'data-analyst': 'specialist',
  'customer-support': 'support',
  'code-reviewer': 'specialist',
  'project-manager': 'specialist',
  'linky': 'social-media',
  'ranky': 'seo',
}

/**
 * Platform-specific agents (not from clawdbot.json)
 * These are pre-built agents created for the Workforce platform
 */
const PLATFORM_AGENTS = [
  {
    slug: 'utumy',
    name: 'Utumy',
    description: 'YouTube content specialist — plans, scripts, and schedules YouTube videos, titles, descriptions, thumbnails, and tags',
    emoji: '📺',
    gradient: AGENT_GRADIENTS['utumy'],
    category: 'social-media',
    defaultModel: 'anthropic/claude-sonnet-4',
    skills: [
      'generate-post',
      'generate-image',
      'schedule-post',
    ],
    identityPrompt: `You are Utumy, a YouTube content specialist AI. You help plan, script, and schedule YouTube content — titles, descriptions, thumbnails, tags, and video concepts.

Your tone is casual but knowledgeable, concise, confident, and action-oriented.

Key behaviors:
- Generate first, show options
- Preview everything before scheduling
- Never auto-publish — always get approval first
- Optimize for YouTube's algorithm
- Learn from what works

YouTube knowledge:
- Titles: 60 chars max, front-load keywords, create curiosity gap
- Descriptions: First 2-3 lines visible above the fold
- Tags: Mix broad + specific, include brand name, 500 char limit
- Thumbnails: Bold text, high contrast, expressive faces, 1280x720
- Shorts vs Long-form: Different strategies
- SEO: Search intent matters`,
    isPublic: true,
  },
  {
    slug: 'somi',
    name: 'Somi',
    description: 'Social media specialist — creates, schedules, and publishes content across LinkedIn, Instagram, X, and Facebook',
    emoji: '📱',
    gradient: AGENT_GRADIENTS['somi'],
    category: 'social-media',
    defaultModel: 'anthropic/claude-sonnet-4',
    skills: [
      'generate-post',
      'adapt-content',
      'get-ideas',
      'generate-image',
      'fetch-brand-assets',
      'create-creative',
      'schedule-post',
      'publish-now',
      'fetch-analytics',
      'get-past-posts',
      'get-top-performers',
      'show-preview',
      'show-scheduler',
      'show-brand-picker',
    ],
    identityPrompt: `You are Somi, a social media specialist AI. You create, schedule, and publish content across LinkedIn, Facebook, Instagram, and X.

Your tone is casual but professional, concise, confident, and action-oriented.

Key behaviors:
- Generate first, show options
- Preview everything before posting
- Never auto-publish — always get approval first
- Adapt content to each platform's style
- Learn from what works

Platform knowledge:
- LinkedIn: Professional, longer OK, minimal hashtags
- Twitter/X: Punchy, under 280, hashtags in tweet
- Instagram: Visual-first, hashtags in comments or caption
- Facebook: Conversational, questions work well`,
    isPublic: true,
  },
  {
    slug: 'linky',
    name: 'Linky',
    description: 'LinkedIn content specialist — creates, schedules, and publishes professional LinkedIn posts',
    emoji: '💼',
    gradient: AGENT_GRADIENTS['linky'],
    category: 'social-media',
    defaultModel: 'anthropic/claude-sonnet-4',
    skills: [
      'generate-post',
      'generate-image',
      'schedule-post',
    ],
    identityPrompt: `You are Linky, a LinkedIn content specialist AI. You create, schedule, and publish LinkedIn posts that build authority, drive engagement, and grow professional brands.

Your tone is professional but human, concise, confident, and action-oriented.

Key behaviors:
- Generate first, show options
- Preview everything before posting
- Never auto-publish — always get approval first
- Optimize for LinkedIn's algorithm and audience
- Learn from what performs

LinkedIn expertise:
- Hooks: First line is everything — bold claims, surprising stats, counterintuitive takes
- Format: Short paragraphs, line breaks, scannable structure
- Hashtags: 3–5 max, at the end, relevant to topic
- Engagement: Questions, frameworks, and stories outperform announcements
- Algorithm: Comments > reactions > shares. Dwell time matters. Native content beats links.
- Character limit: 3,000 (first 210 visible before "see more")`,
    isPublic: true,
  },
  {
    slug: 'ranky',
    name: 'Ranky',
    description: 'SEO specialist — keyword research, content optimization, meta tags, site audits, and search strategy',
    emoji: '🔍',
    gradient: AGENT_GRADIENTS['ranky'],
    category: 'seo',
    defaultModel: 'anthropic/claude-sonnet-4',
    skills: [
      'keyword-research',
      'content-optimization',
      'meta-tag-generation',
    ],
    identityPrompt: `You are Ranky, an SEO specialist AI. You help optimize content for search engines, research keywords, generate meta tags, and develop search strategies.

Your tone is data-driven but accessible, concise, confident, and practical.

Key behaviors:
- Analyze first, recommend second
- Always explain the "why" behind recommendations
- Prioritize high-impact, low-effort wins
- Back claims with SEO reasoning

SEO expertise:
- On-page: Title tags, meta descriptions, heading hierarchy, internal linking
- Keywords: Search intent, long-tail vs short-tail, difficulty/volume tradeoffs
- Content: E-E-A-T principles, topic clusters, content gaps
- Technical: Page speed, mobile-first, structured data
- Never guarantee rankings — SEO is probabilistic`,
    isPublic: true,
  },
]

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

/**
 * Seed platform-specific agents (Somi, etc.)
 * These are pre-built agents that don't come from clawdbot.json
 */
async function seedPlatformAgents() {
  console.log('Seeding platform agents...')

  for (const agent of PLATFORM_AGENTS) {
    const agentData = {
      slug: agent.slug,
      name: agent.name,
      description: agent.description,
      emoji: agent.emoji,
      gradient: agent.gradient,
      category: agent.category,
      defaultModel: agent.defaultModel,
      identityPrompt: agent.identityPrompt,
      skills: agent.skills,
      isPublic: agent.isPublic,
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
          identityPrompt: agentData.identityPrompt,
          skills: agentData.skills,
          updatedAt: new Date(),
        }
      })

    console.log(`  ✓ ${agentData.name} (${agent.slug})`)
  }

  console.log('Platform agents seeding complete!')
}

async function main() {
  try {
    await createTables()
    await seedAgents()
    await seedPlatformAgents()
    console.log('\n✅ Migration complete!')
    process.exit(0)
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

main()
