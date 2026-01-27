/**
 * Employees Router - Manage user's installed agents and custom employees
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { db } from '../../db/client.js'
import { employees, conversations, installedAgents, agentLibrary } from '../../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth.js'
import { tenantDirMiddleware } from '../middleware/tenant.js'
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  buildEmployeeConfig,
  validateSkills,
  validateModel,
  AVAILABLE_SKILLS,
  AVAILABLE_MODELS,
} from '../../employees/builder.js'
import { EMPLOYEE_TEMPLATES } from '../../employees/templates.js'
import { syncEmployeeToClawdbot, removeEmployeeFromClawdbot } from '../../employees/sync.js'

const employeesRouter = new Hono()

// Apply auth to all routes
employeesRouter.use('*', authMiddleware)
employeesRouter.use('*', tenantDirMiddleware)

/**
 * List all employees for the user
 * Returns: installed agents from library + custom employees
 */
employeesRouter.get('/', async (c) => {
  const tenantId = c.get('tenantId')

  // 1. Get installed agents from library
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

  // 2. Get custom employees (not from library)
  const customEmployees = await db
    .select()
    .from(employees)
    .where(eq(employees.tenantId, tenantId))

  // 3. Combine and format
  const allEmployees = [
    // Installed agents
    ...installed.map(({ installed, agent }) => ({
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
      isTemplate: false,
      chatEnabled: true,
      installedAt: installed.installedAt,
      createdAt: installed.installedAt,
    })),
    // Custom employees
    ...customEmployees.map((emp) => ({
      id: emp.id,
      agentId: null,
      slug: null,
      name: emp.name,
      type: emp.type,
      description: emp.description,
      emoji: '🤖',
      gradient: 'linear-gradient(135deg, #6b7280, #4b5563)',
      category: 'custom',
      skills: emp.skills || [],
      model: emp.model,
      isFromLibrary: false,
      isTemplate: emp.isTemplate,
      chatEnabled: true,
      installedAt: null,
      createdAt: emp.createdAt,
    })),
  ]

  return c.json({ employees: allEmployees })
})

/**
 * Get available templates for creating custom employees
 */
employeesRouter.get('/templates', async (c) => {
  return c.json({
    templates: EMPLOYEE_TEMPLATES.map((t) => ({
      type: t.type,
      name: t.name,
      description: t.description,
      skills: t.skills,
      model: t.model,
    })),
  })
})

/**
 * Get available skills
 */
employeesRouter.get('/skills', async (c) => {
  return c.json({ skills: AVAILABLE_SKILLS })
})

/**
 * Get available models
 */
employeesRouter.get('/models', async (c) => {
  return c.json({ models: AVAILABLE_MODELS })
})

/**
 * Create a custom employee (not from library)
 */
employeesRouter.post('/', zValidator('json', createEmployeeSchema), async (c) => {
  const tenantId = c.get('tenantId')
  const input = c.req.valid('json')

  try {
    // Validate skills and model
    if (input.skills) {
      validateSkills(input.skills)
    }
    validateModel(input.model)

    // Build config (merges with template if applicable)
    const config = buildEmployeeConfig(input)

    // Insert into database
    const [employee] = await db
      .insert(employees)
      .values({
        tenantId,
        name: config.name,
        type: config.type,
        description: config.description,
        skills: config.skills,
        model: config.model,
        identityPrompt: config.identityPrompt,
        isTemplate: false,
      })
      .returning()

    // Sync to clawdbot
    await syncEmployeeToClawdbot(employee)

    return c.json(
      {
        employee: {
          id: employee.id,
          name: employee.name,
          type: employee.type,
          description: employee.description,
          skills: employee.skills,
          model: employee.model,
          createdAt: employee.createdAt,
        },
      },
      201
    )
  } catch (error) {
    console.error('Create employee error:', error)
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to create employee' },
      400
    )
  }
})

/**
 * Get a single employee (installed agent or custom)
 */
employeesRouter.get('/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const employeeId = c.req.param('id')

  // Try installed agent first
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

  if (installedResult) {
    const { installed, agent } = installedResult
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
      },
    })
  }

  // Try custom employee
  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.tenantId, tenantId)))
    .limit(1)

  if (!employee) {
    return c.json({ error: 'Employee not found' }, 404)
  }

  // Get conversation count
  const empConversations = await db
    .select()
    .from(conversations)
    .where(eq(conversations.employeeId, employeeId))

  return c.json({
    employee: {
      id: employee.id,
      name: employee.name,
      type: employee.type,
      description: employee.description,
      skills: employee.skills,
      model: employee.model,
      identityPrompt: employee.identityPrompt,
      isTemplate: employee.isTemplate,
      isFromLibrary: false,
      createdAt: employee.createdAt,
      conversationCount: empConversations.length,
    },
  })
})

/**
 * Update an employee
 */
employeesRouter.patch('/:id', zValidator('json', updateEmployeeSchema), async (c) => {
  const tenantId = c.get('tenantId')
  const employeeId = c.req.param('id')
  const updates = c.req.valid('json')

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

  if (installed) {
    // Update installed agent customizations
    const [updated] = await db
      .update(installedAgents)
      .set({
        customName: updates.name,
        customPrompt: updates.identityPrompt,
        customModel: updates.model,
      })
      .where(eq(installedAgents.id, employeeId))
      .returning()

    return c.json({
      employee: {
        id: updated.id,
        customName: updated.customName,
        customModel: updated.customModel,
      },
    })
  }

  // Update custom employee
  const [existing] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.tenantId, tenantId)))
    .limit(1)

  if (!existing) {
    return c.json({ error: 'Employee not found' }, 404)
  }

  try {
    if (updates.skills) {
      validateSkills(updates.skills)
    }
    if (updates.model) {
      validateModel(updates.model)
    }

    const [updated] = await db
      .update(employees)
      .set(updates)
      .where(eq(employees.id, employeeId))
      .returning()

    // Sync to clawdbot
    await syncEmployeeToClawdbot(updated)

    return c.json({
      employee: {
        id: updated.id,
        name: updated.name,
        type: updated.type,
        description: updated.description,
        skills: updated.skills,
        model: updated.model,
        createdAt: updated.createdAt,
      },
    })
  } catch (error) {
    console.error('Update employee error:', error)
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to update employee' },
      400
    )
  }
})

/**
 * Delete an employee (uninstall agent or delete custom)
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

  if (installed) {
    // Uninstall agent
    await db
      .delete(installedAgents)
      .where(eq(installedAgents.id, employeeId))

    return c.json({ success: true, message: 'Agent uninstalled' })
  }

  // Delete custom employee
  const [existing] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.tenantId, tenantId)))
    .limit(1)

  if (!existing) {
    return c.json({ error: 'Employee not found' }, 404)
  }

  // Delete from clawdbot first
  await removeEmployeeFromClawdbot(tenantId, employeeId)

  // Delete conversations
  await db.delete(conversations).where(eq(conversations.employeeId, employeeId))

  // Delete employee
  await db.delete(employees).where(eq(employees.id, employeeId))

  return c.json({ success: true, message: 'Employee deleted' })
})

export { employeesRouter }
