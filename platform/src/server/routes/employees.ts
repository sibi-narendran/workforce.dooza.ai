/**
 * Employees Router - List user's installed agents from library
 *
 * Note: Custom employee creation via UI is not supported.
 * Agents are defined in code (templates.ts) and installed from the library.
 */
import { Hono } from 'hono'
import { db } from '../../db/client.js'
import { conversations, installedAgents, agentLibrary } from '../../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth.js'
import { tenantDirMiddleware } from '../middleware/tenant.js'

const employeesRouter = new Hono()

// Apply auth to all routes
employeesRouter.use('*', authMiddleware)
employeesRouter.use('*', tenantDirMiddleware)

/**
 * List all employees for the user (installed agents from library)
 */
employeesRouter.get('/', async (c) => {
  const tenantId = c.get('tenantId')

  // Get installed agents from library
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

  const allEmployees = installed.map(({ installed, agent }) => ({
    id: installed.id,
    agentId: agent.id,
    slug: agent.slug,
    name: installed.customName || agent.name,
    type: agent.slug,
    description: agent.description,
    emoji: agent.emoji,
    gradient: agent.gradient,
    category: agent.category,
    skills: agent.skills || [],
    model: installed.customModel || agent.defaultModel,
    isFromLibrary: true,
    chatEnabled: true,
    installedAt: installed.installedAt,
    createdAt: installed.installedAt,
  }))

  return c.json({ employees: allEmployees })
})

/**
 * Get a single employee (installed agent)
 */
employeesRouter.get('/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const employeeId = c.req.param('id')

  const [installedResult] = await db
    .select({
      installed: installedAgents,
      agent: agentLibrary,
    })
    .from(installedAgents)
    .innerJoin(agentLibrary, eq(installedAgents.agentId, agentLibrary.id))
    .where(
      and(
        eq(installedAgents.id, employeeId),
        eq(installedAgents.tenantId, tenantId)
      )
    )
    .limit(1)

  if (!installedResult) {
    return c.json({ error: 'Employee not found' }, 404)
  }

  const { installed, agent } = installedResult

  // Get conversation count
  const empConversations = await db
    .select()
    .from(conversations)
    .where(eq(conversations.employeeId, employeeId))

  return c.json({
    employee: {
      id: installed.id,
      agentId: agent.id,
      slug: agent.slug,
      name: installed.customName || agent.name,
      type: agent.slug,
      description: agent.description,
      emoji: agent.emoji,
      gradient: agent.gradient,
      skills: agent.skills,
      model: installed.customModel || agent.defaultModel,
      identityPrompt: agent.identityPrompt,
      customPrompt: installed.customPrompt,
      isFromLibrary: true,
      installedAt: installed.installedAt,
      createdAt: installed.installedAt,
      conversationCount: empConversations.length,
    },
  })
})

/**
 * Uninstall an agent (remove from user's employees)
 */
employeesRouter.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const employeeId = c.req.param('id')

  // Check if it's an installed agent
  const [installed] = await db
    .select()
    .from(installedAgents)
    .where(
      and(
        eq(installedAgents.id, employeeId),
        eq(installedAgents.tenantId, tenantId)
      )
    )
    .limit(1)

  if (!installed) {
    return c.json({ error: 'Employee not found' }, 404)
  }

  // Uninstall agent
  await db
    .delete(installedAgents)
    .where(eq(installedAgents.id, employeeId))

  // Delete conversations for this employee
  await db.delete(conversations).where(eq(conversations.employeeId, employeeId))

  return c.json({ success: true, message: 'Agent uninstalled' })
})

export { employeesRouter }
