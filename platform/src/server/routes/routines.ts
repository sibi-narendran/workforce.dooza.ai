/**
 * Routines Router - CRUD for Clawdbot cron jobs per-agent
 *
 * Proxies to the gateway's cron RPC (cron.list/add/update/remove/run).
 * Each routine is scoped to an agent (by slug) within a tenant.
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../../db/client.js'
import { installedAgents, agentLibrary } from '../../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { gatewayPool } from '../../streaming/index.js'

const routinesRouter = new Hono()

// ============= Helpers =============

/** Resolve employeeId (installed_agents.id) → agentLibrary.slug */
async function resolveSlug(employeeId: string, tenantId: string): Promise<string | null> {
  const [result] = await db
    .select({ slug: agentLibrary.slug })
    .from(installedAgents)
    .innerJoin(agentLibrary, eq(installedAgents.agentId, agentLibrary.id))
    .where(and(eq(installedAgents.id, employeeId), eq(installedAgents.tenantId, tenantId)))
    .limit(1)
  return result?.slug ?? null
}

function gatewayError(err: unknown): { message: string; status: 503 | 504 | 502 } {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('not connected') || msg.includes('Connection') || msg.includes('WebSocket')) {
    return { message: 'Gateway unavailable', status: 503 }
  }
  if (msg.includes('timeout') || msg.includes('Timeout')) {
    return { message: 'Gateway timeout', status: 504 }
  }
  return { message: msg || 'Gateway error', status: 502 }
}

// ============= Validation =============

const createSchema = z.object({
  name: z.string().min(1).max(100),
  schedule: z.string().min(1), // cron expression
  message: z.string().min(1),
  tz: z.string().optional(),
})

const updateSchema = z.object({
  enabled: z.boolean(),
})

// ============= Routes =============

/** List routines for an employee */
routinesRouter.get('/employee/:employeeId', async (c) => {
  const tenantId = c.get('tenantId')
  const employeeId = c.req.param('employeeId')

  const slug = await resolveSlug(employeeId, tenantId)
  if (!slug) return c.json({ error: 'Employee not found' }, 404)

  try {
    const client = await gatewayPool.getClient(tenantId)
    const result = await client.cronList()
    const routines = result.jobs.filter((j) => j.agentId === slug)
    return c.json({ routines })
  } catch (err) {
    const { message, status } = gatewayError(err)
    return c.json({ error: message }, status)
  }
})

/** Create a routine for an employee */
routinesRouter.post('/employee/:employeeId', async (c) => {
  const tenantId = c.get('tenantId')
  const employeeId = c.req.param('employeeId')

  const slug = await resolveSlug(employeeId, tenantId)
  if (!slug) return c.json({ error: 'Employee not found' }, 404)

  const body = await c.req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400)
  }

  const { name, schedule, message, tz } = parsed.data
  const browserTz = tz || 'UTC'

  try {
    const client = await gatewayPool.getClient(tenantId)
    const result = await client.cronAdd({
      agentId: slug,
      name,
      enabled: true,
      schedule: { kind: 'cron', expr: schedule, tz: browserTz },
      sessionTarget: 'isolated',
      wakeMode: 'now',
      payload: { kind: 'agentTurn', message },
    })
    return c.json({ routine: result })
  } catch (err) {
    const { message: msg, status } = gatewayError(err)
    return c.json({ error: msg }, status)
  }
})

/** Toggle a routine (enable/disable) */
routinesRouter.patch('/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const id = c.req.param('id')

  const body = await c.req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400)
  }

  try {
    const client = await gatewayPool.getClient(tenantId)
    const result = await client.cronUpdate(id, { enabled: parsed.data.enabled })
    return c.json({ routine: result })
  } catch (err) {
    const { message, status } = gatewayError(err)
    return c.json({ error: message }, status)
  }
})

/** Delete a routine */
routinesRouter.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const id = c.req.param('id')

  try {
    const client = await gatewayPool.getClient(tenantId)
    await client.cronRemove(id)
    return c.json({ ok: true })
  } catch (err) {
    const { message, status } = gatewayError(err)
    return c.json({ error: message }, status)
  }
})

/** Run a routine immediately */
routinesRouter.post('/:id/run', async (c) => {
  const tenantId = c.get('tenantId')
  const id = c.req.param('id')

  try {
    const client = await gatewayPool.getClient(tenantId)
    await client.cronRun(id)
    return c.json({ ok: true })
  } catch (err) {
    const { message, status } = gatewayError(err)
    return c.json({ error: message }, status)
  }
})

export { routinesRouter }
