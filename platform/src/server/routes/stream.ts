/**
 * Stream Router - SSE endpoint for real-time chat streaming
 *
 * Provides:
 * - SSE connection for receiving chat events
 * - Streaming chat endpoint that returns immediately with runId
 * - Keep-alive pings to maintain connection
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { db } from '../../db/client.js'
import { installedAgents, agentLibrary, profiles } from '../../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { tenantDirMiddleware } from '../middleware/tenant.js'
import { sseManager, gatewayPool } from '../../streaming/index.js'
import { executeEmployeeStreaming, getSessionKeyForEmployee } from '../../employees/executor-streaming.js'
import { supabaseAdmin } from '../../lib/supabase.js'

const streamRouter = new Hono()

// Custom middleware for SSE endpoint that accepts token from query param
// EventSource API doesn't support custom headers, so we need this workaround
const sseAuthMiddleware = async (c: any, next: () => Promise<void>) => {
  console.log('[SSE Auth] Request to:', c.req.path)

  // First try Authorization header
  const authHeader = c.req.header('Authorization')
  let token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  // Fall back to query param for SSE connections
  if (!token) {
    token = c.req.query('token')
    if (token) {
      console.log('[SSE Auth] Using token from query param')
    }
  } else {
    console.log('[SSE Auth] Using token from header')
  }

  if (!token) {
    console.log('[SSE Auth] No token found')
    return c.json({ error: 'Missing authorization' }, 401)
  }

  if (!supabaseAdmin) {
    return c.json({ error: 'Auth service unavailable' }, 503)
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

    if (error || !user) {
      console.log('[SSE Auth] Token validation failed:', error?.message || 'No user')
      return c.json({ error: 'Invalid or expired token' }, 401)
    }

    console.log('[SSE Auth] User authenticated:', user.email)

    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1)

    if (!profile?.tenantId) {
      return c.json({ error: 'User has no tenant' }, 403)
    }

    c.set('user', {
      id: user.id,
      email: user.email!,
      tenantId: profile.tenantId,
      role: profile.role || 'member',
    })
    c.set('tenantId', profile.tenantId)

    await next()
  } catch (error) {
    console.error('SSE auth error:', error)
    return c.json({ error: 'Authentication failed' }, 401)
  }
}

// Apply custom auth middleware that supports both header and query param tokens
// This is needed because EventSource API doesn't support custom headers
streamRouter.use('*', sseAuthMiddleware, tenantDirMiddleware)

/**
 * Helper: Check if an employee ID is an installed agent for this tenant
 */
async function verifyEmployeeAccess(employeeId: string, tenantId: string) {
  const [installed] = await db
    .select({
      id: installedAgents.id,
      agentId: installedAgents.agentId,
    })
    .from(installedAgents)
    .innerJoin(agentLibrary, eq(installedAgents.agentId, agentLibrary.id))
    .where(
      and(
        eq(installedAgents.id, employeeId),
        eq(installedAgents.tenantId, tenantId),
        eq(installedAgents.isActive, true)
      )
    )
    .limit(1)

  return installed || null
}

/**
 * SSE stream endpoint - Connect to receive chat events
 *
 * GET /api/stream/employee/:employeeId
 *
 * The client connects here to receive events for a specific employee.
 * Events include: delta (streaming tokens), final (complete message),
 * aborted, error, and connected (initial connection confirmation).
 */
streamRouter.get('/employee/:employeeId', async (c) => {
  const tenantId = c.get('tenantId')
  const employeeId = c.req.param('employeeId')

  // Verify employee access
  const access = await verifyEmployeeAccess(employeeId, tenantId)
  if (!access) {
    return c.json({ error: 'Employee not found' }, 404)
  }

  // Get session key for this employee
  const sessionKey = await getSessionKeyForEmployee(tenantId, employeeId)
  if (!sessionKey) {
    return c.json({ error: 'Failed to generate session key' }, 500)
  }

  // Extract tabId for per-tab connection dedup (prevents duplicate connections from React StrictMode)
  const tabId = c.req.query('tabId')

  // Create SSE response
  return sseManager.createSSEResponse(c, tenantId, employeeId, sessionKey, tabId)
})

// Schema for streaming chat message
const streamChatSchema = z.object({
  message: z.string().min(1),
  thinking: z.enum(['none', 'low', 'medium', 'high']).optional(),
})

/**
 * Streaming chat endpoint
 *
 * POST /api/stream/employee/:employeeId/chat
 *
 * Sends a message and returns immediately with a runId.
 * The actual response is delivered via the SSE connection.
 */
streamRouter.post('/employee/:employeeId/chat', zValidator('json', streamChatSchema), async (c) => {
  const tenantId = c.get('tenantId')
  const employeeId = c.req.param('employeeId')
  const { message, thinking } = c.req.valid('json')

  // Verify employee access
  const access = await verifyEmployeeAccess(employeeId, tenantId)
  if (!access) {
    return c.json({ error: 'Employee not found' }, 404)
  }

  try {
    // Execute with streaming - returns immediately with runId
    const result = await executeEmployeeStreaming(tenantId, employeeId, message, {
      thinking: thinking || 'medium',
    })

    if (!result.success) {
      return c.json({ error: result.error || 'Failed to start streaming' }, 500)
    }

    return c.json({
      runId: result.runId,
      sessionKey: result.sessionKey,
      status: 'streaming',
    })
  } catch (error) {
    console.error('Streaming chat error:', error)
    return c.json({ error: 'Failed to process message' }, 500)
  }
})

/**
 * Get streaming statistics (for monitoring)
 *
 * GET /api/stream/stats
 */
streamRouter.get('/stats', async (c) => {
  const sseStats = sseManager.getStats()
  const poolStats = gatewayPool.getStats()

  return c.json({
    sse: sseStats,
    gateway: poolStats,
  })
})

export { streamRouter }
