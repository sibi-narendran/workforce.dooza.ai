/**
 * Library Router - Browse and install agents from the shared library
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { db } from '../../db/client.js'
import { agentLibrary, installedAgents } from '../../db/schema.js'
import { eq, and, sql, desc } from 'drizzle-orm'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.js'
import {
  installAgentForTenant,
  uninstallAgentFromTenant,
  agentTemplateExists,
} from '../../employees/installer.js'
import { syncAgentFilesForAllTenants, syncAgentConfigForAllTenants } from '../../employees/sync.js'

const libraryRouter = new Hono()

/**
 * Browse library - PUBLIC (no auth required)
 * Returns all public agents in the library
 * If authenticated, also returns which agents are installed
 */
libraryRouter.get('/', optionalAuthMiddleware, async (c) => {
  const category = c.req.query('category')

  // Get all public agents
  const agents = await db
    .select()
    .from(agentLibrary)
    .where(eq(agentLibrary.isPublic, true))
    .orderBy(desc(agentLibrary.installCount))

  // Filter by category if provided
  const filteredAgents = category
    ? agents.filter(a => a.category === category)
    : agents

  // Check if user is authenticated to show installed status
  let installedAgentIds: Set<string> = new Set()
  const tenantId = c.get('tenantId')
  if (tenantId) {
    const installed = await db
      .select({ agentId: installedAgents.agentId })
      .from(installedAgents)
      .where(
        and(
          eq(installedAgents.tenantId, tenantId),
          eq(installedAgents.isActive, true)
        )
      )
    installedAgentIds = new Set(installed.map(i => i.agentId))
  }

  return c.json({
    agents: filteredAgents.map(agent => ({
      id: agent.id,
      slug: agent.slug,
      name: agent.name,
      description: agent.description,
      emoji: agent.emoji,
      gradient: agent.gradient,
      category: agent.category,
      defaultModel: agent.defaultModel,
      skills: agent.skills,
      installCount: agent.installCount,
      isInstalled: installedAgentIds.has(agent.id),
    })),
  })
})

/**
 * Get single agent details - PUBLIC
 */
libraryRouter.get('/:idOrSlug', async (c) => {
  const idOrSlug = c.req.param('idOrSlug')

  // Try to find by ID first, then by slug
  let agent
  try {
    // Check if it's a valid UUID format
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)

    if (isUuid) {
      const [result] = await db
        .select()
        .from(agentLibrary)
        .where(eq(agentLibrary.id, idOrSlug))
        .limit(1)
      agent = result
    }

    if (!agent) {
      const [result] = await db
        .select()
        .from(agentLibrary)
        .where(eq(agentLibrary.slug, idOrSlug))
        .limit(1)
      agent = result
    }
  } catch {
    // Invalid UUID, try slug
    const [result] = await db
      .select()
      .from(agentLibrary)
      .where(eq(agentLibrary.slug, idOrSlug))
      .limit(1)
    agent = result
  }

  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404)
  }

  return c.json({ agent })
})

// Protected routes below - require authentication
libraryRouter.use('/*', authMiddleware)

/**
 * Install an agent from the library
 */
const installSchema = z.object({
  customName: z.string().optional(),
  customPrompt: z.string().optional(),
  customModel: z.string().optional(),
  settings: z.record(z.any()).optional(),
})

libraryRouter.post('/:agentId/install', zValidator('json', installSchema.optional()), async (c) => {
  const tenantId = c.get('tenantId')
  const user = c.get('user')
  const agentId = c.req.param('agentId')
  const body = c.req.valid('json') || {}

  // Verify agent exists
  const [agent] = await db
    .select()
    .from(agentLibrary)
    .where(eq(agentLibrary.id, agentId))
    .limit(1)

  if (!agent) {
    return c.json({ error: 'Agent not found in library' }, 404)
  }

  // Check if already installed for this tenant
  const [existingInstall] = await db
    .select({ id: installedAgents.id })
    .from(installedAgents)
    .where(
      and(
        eq(installedAgents.tenantId, tenantId),
        eq(installedAgents.agentId, agentId),
        eq(installedAgents.isActive, true)
      )
    )
    .limit(1)

  if (existingInstall) {
    return c.json({ error: 'Agent already installed' }, 409)
  }

  try {
    // Check if agent template exists on filesystem
    const hasTemplate = await agentTemplateExists(agent.slug)

    // Copy agent files to tenant directory and update configs
    if (hasTemplate) {
      await installAgentForTenant(tenantId, agent.slug, body.customName || agent.name)
    }

    // Create installed agent record in database
    const [installed] = await db
      .insert(installedAgents)
      .values({
        tenantId,
        userId: user.id,
        agentId,
        customName: body.customName,
        customPrompt: body.customPrompt,
        customModel: body.customModel,
        settings: body.settings,
        isActive: true,
      })
      .returning()

    // Increment install count
    await db
      .update(agentLibrary)
      .set({ installCount: sql`${agentLibrary.installCount} + 1` })
      .where(eq(agentLibrary.id, agentId))

    return c.json({
      installed: {
        id: installed.id,
        agentId: installed.agentId,
        customName: installed.customName,
        installedAt: installed.installedAt,
      },
      agent: {
        id: agent.id,
        slug: agent.slug,
        name: body.customName || agent.name,
        emoji: agent.emoji,
        gradient: agent.gradient,
      },
      message: `${agent.name} installed successfully!`,
    }, 201)
  } catch (error) {
    console.error('Install error:', error)
    return c.json({ error: 'Failed to install agent' }, 500)
  }
})

/**
 * List my installed agents
 */
libraryRouter.get('/installed/list', async (c) => {
  const tenantId = c.get('tenantId')
  const user = c.get('user')

  const installed = await db
    .select({
      installed: installedAgents,
      agent: agentLibrary,
    })
    .from(installedAgents)
    .innerJoin(agentLibrary, eq(installedAgents.agentId, agentLibrary.id))
    .where(
      and(
        eq(installedAgents.tenantId, tenantId),
        eq(installedAgents.isActive, true)
      )
    )
    .orderBy(desc(installedAgents.installedAt))

  return c.json({
    agents: installed.map(({ installed, agent }) => ({
      id: installed.id,
      agentId: agent.id,
      slug: agent.slug,
      name: installed.customName || agent.name,
      description: agent.description,
      emoji: agent.emoji,
      gradient: agent.gradient,
      category: agent.category,
      model: installed.customModel || agent.defaultModel,
      customPrompt: installed.customPrompt,
      settings: installed.settings,
      installedAt: installed.installedAt,
    })),
  })
})

/**
 * Update installed agent settings
 */
libraryRouter.patch('/installed/:id', zValidator('json', installSchema), async (c) => {
  const tenantId = c.get('tenantId')
  const installedId = c.req.param('id')
  const body = c.req.valid('json')

  // Verify ownership
  const [existing] = await db
    .select()
    .from(installedAgents)
    .where(
      and(
        eq(installedAgents.id, installedId),
        eq(installedAgents.tenantId, tenantId)
      )
    )
    .limit(1)

  if (!existing) {
    return c.json({ error: 'Installed agent not found' }, 404)
  }

  const [updated] = await db
    .update(installedAgents)
    .set({
      customName: body.customName,
      customPrompt: body.customPrompt,
      customModel: body.customModel,
      settings: body.settings,
    })
    .where(eq(installedAgents.id, installedId))
    .returning()

  return c.json({ installed: updated })
})

/**
 * Uninstall an agent
 */
libraryRouter.delete('/installed/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const installedId = c.req.param('id')

  // Verify ownership and get agent ID for decrementing count
  const [existing] = await db
    .select()
    .from(installedAgents)
    .where(
      and(
        eq(installedAgents.id, installedId),
        eq(installedAgents.tenantId, tenantId)
      )
    )
    .limit(1)

  if (!existing) {
    return c.json({ error: 'Installed agent not found' }, 404)
  }

  // Get agent slug for filesystem operations
  const [agent] = await db
    .select({ slug: agentLibrary.slug })
    .from(agentLibrary)
    .where(eq(agentLibrary.id, existing.agentId))
    .limit(1)

  // Remove agent files from tenant directory and update configs
  if (agent) {
    try {
      await uninstallAgentFromTenant(tenantId, agent.slug)
    } catch (err) {
      console.warn('Failed to uninstall agent files:', err)
      // Continue with database cleanup even if filesystem fails
    }
  }

  // Delete from database
  await db
    .delete(installedAgents)
    .where(eq(installedAgents.id, installedId))

  // Decrement install count
  await db
    .update(agentLibrary)
    .set({ installCount: sql`GREATEST(${agentLibrary.installCount} - 1, 0)` })
    .where(eq(agentLibrary.id, existing.agentId))

  return c.json({ success: true, message: 'Agent uninstalled' })
})

/**
 * Sync agent template files + clawdbot.json config to all existing tenant installations.
 * Used when a template's files or requiredTools change.
 */
libraryRouter.post('/sync/:slug', async (c) => {
  const slug = c.req.param('slug')

  try {
    const files = await syncAgentFilesForAllTenants(slug)
    const config = await syncAgentConfigForAllTenants(slug)
    return c.json({
      files: { synced: files.synced, errors: files.errors },
      config: { synced: config.synced, errors: config.errors },
    })
  } catch (error) {
    console.error('Sync error:', error)
    return c.json({ error: 'Failed to sync agent' }, 500)
  }
})

export { libraryRouter }
