/**
 * Conversations Router - Chat with employees (installed agents from library)
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { db } from '../../db/client.js'
import { conversations, installedAgents, agentLibrary } from '../../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth.js'
import { tenantDirMiddleware } from '../middleware/tenant.js'
import { executeEmployee } from '../../employees/executor.js'

const conversationsRouter = new Hono()

// Apply auth middleware to all routes
conversationsRouter.use('*', authMiddleware)
conversationsRouter.use('*', tenantDirMiddleware)

// Schema for chat message
const chatSchema = z.object({
  message: z.string().min(1),
  thinking: z.enum(['none', 'low', 'medium', 'high']).optional(),
})

/**
 * Helper: Check if an employee ID is an installed agent for this tenant
 */
async function verifyEmployeeAccess(employeeId: string, tenantId: string) {
  const [installed] = await db
    .select({ id: installedAgents.id })
    .from(installedAgents)
    .where(
      and(
        eq(installedAgents.id, employeeId),
        eq(installedAgents.tenantId, tenantId),
        eq(installedAgents.isActive, true)
      )
    )
    .limit(1)

  return installed ? { id: installed.id } : null
}

/**
 * List all conversations for the tenant
 */
conversationsRouter.get('/', async (c) => {
  const tenantId = c.get('tenantId')

  const tenantConversations = await db
    .select()
    .from(conversations)
    .where(eq(conversations.tenantId, tenantId))
    .orderBy(desc(conversations.lastMessageAt))

  return c.json({
    conversations: tenantConversations.map((conv) => ({
      id: conv.id,
      employeeId: conv.employeeId,
      sessionKey: conv.sessionKey,
      title: conv.title,
      lastMessageAt: conv.lastMessageAt,
      createdAt: conv.createdAt,
    })),
  })
})

/**
 * Start a new chat or continue existing
 */
conversationsRouter.post('/employee/:employeeId/chat', zValidator('json', chatSchema), async (c) => {
  const tenantId = c.get('tenantId')
  const employeeId = c.req.param('employeeId')
  const { message, thinking } = c.req.valid('json')

  // Verify employee access
  const access = await verifyEmployeeAccess(employeeId, tenantId)
  if (!access) {
    return c.json({ error: 'Employee not found' }, 404)
  }

  try {
    // Generate session key for this conversation
    const sessionKey = `session-${Date.now()}`

    // Execute the message
    const result = await executeEmployee(tenantId, employeeId, message, {
      thinking: thinking || 'medium',
    })

    if (!result.success) {
      return c.json({ error: result.error || 'Failed to get response' }, 500)
    }

    return c.json({
      conversation: {
        id: `temp-${sessionKey}`,
        sessionKey,
        title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
      },
      response: result.response,
      usage: result.usage,
    })
  } catch (error) {
    console.error('Chat error:', error)
    return c.json({ error: 'Failed to process message' }, 500)
  }
})

/**
 * List conversations for a specific employee
 */
conversationsRouter.get('/employee/:employeeId', async (c) => {
  const tenantId = c.get('tenantId')
  const employeeId = c.req.param('employeeId')

  // Verify employee access
  const access = await verifyEmployeeAccess(employeeId, tenantId)
  if (!access) {
    return c.json({ error: 'Employee not found' }, 404)
  }

  const employeeConversations = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.employeeId, employeeId), eq(conversations.tenantId, tenantId)))
    .orderBy(desc(conversations.lastMessageAt))

  return c.json({
    conversations: employeeConversations.map((conv) => ({
      id: conv.id,
      sessionKey: conv.sessionKey,
      title: conv.title,
      lastMessageAt: conv.lastMessageAt,
      createdAt: conv.createdAt,
    })),
  })
})

/**
 * Delete a conversation
 */
conversationsRouter.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const conversationId = c.req.param('id')

  // Verify conversation belongs to tenant
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, tenantId)))
    .limit(1)

  if (!conversation) {
    return c.json({ error: 'Conversation not found' }, 404)
  }

  // Delete from database
  await db.delete(conversations).where(eq(conversations.id, conversationId))

  return c.json({ success: true, message: 'Conversation deleted' })
})

export { conversationsRouter }
