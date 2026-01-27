import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import cron from 'node-cron'
import { db } from '../../db/client.js'
import { jobs, employees } from '../../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth.js'
import { tenantDirMiddleware } from '../middleware/tenant.js'
import { jobScheduler } from '../../jobs/scheduler.js'
import { runJobNow, getRecentExecutions } from '../../jobs/worker.js'

const jobsRouter = new Hono()

// Apply auth middleware to all routes
jobsRouter.use('*', authMiddleware)
jobsRouter.use('*', tenantDirMiddleware)

// Schema for creating a job
const createJobSchema = z.object({
  name: z.string().min(1).max(100),
  employeeId: z.string().uuid(),
  schedule: z.string().refine((val) => cron.validate(val), {
    message: 'Invalid cron expression',
  }),
  prompt: z.string().min(1),
  enabled: z.boolean().optional().default(true),
})

// Schema for updating a job
const updateJobSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  schedule: z
    .string()
    .refine((val) => cron.validate(val), {
      message: 'Invalid cron expression',
    })
    .optional(),
  prompt: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
})

/**
 * List all jobs for the tenant
 */
jobsRouter.get('/', async (c) => {
  const tenantId = c.get('tenantId')

  const tenantJobs = await db
    .select({
      job: jobs,
      employee: employees,
    })
    .from(jobs)
    .leftJoin(employees, eq(jobs.employeeId, employees.id))
    .where(eq(jobs.tenantId, tenantId))
    .orderBy(desc(jobs.createdAt))

  return c.json({
    jobs: tenantJobs.map(({ job, employee }) => ({
      id: job.id,
      name: job.name,
      schedule: job.schedule,
      prompt: job.prompt,
      enabled: job.enabled,
      lastRunAt: job.lastRunAt,
      createdAt: job.createdAt,
      employee: employee
        ? {
            id: employee.id,
            name: employee.name,
            type: employee.type,
          }
        : null,
    })),
  })
})

/**
 * Create a new job
 */
jobsRouter.post('/', zValidator('json', createJobSchema), async (c) => {
  const tenantId = c.get('tenantId')
  const input = c.req.valid('json')

  // Verify employee belongs to tenant
  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, input.employeeId), eq(employees.tenantId, tenantId)))
    .limit(1)

  if (!employee) {
    return c.json({ error: 'Employee not found' }, 404)
  }

  const [job] = await db
    .insert(jobs)
    .values({
      tenantId,
      employeeId: input.employeeId,
      name: input.name,
      schedule: input.schedule,
      prompt: input.prompt,
      enabled: input.enabled,
    })
    .returning()

  // Schedule the job if enabled
  if (job.enabled) {
    jobScheduler.scheduleJob(job)
  }

  return c.json(
    {
      job: {
        id: job.id,
        name: job.name,
        schedule: job.schedule,
        prompt: job.prompt,
        enabled: job.enabled,
        createdAt: job.createdAt,
        employee: {
          id: employee.id,
          name: employee.name,
          type: employee.type,
        },
      },
    },
    201
  )
})

/**
 * Get a single job
 */
jobsRouter.get('/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const jobId = c.req.param('id')

  const [result] = await db
    .select({
      job: jobs,
      employee: employees,
    })
    .from(jobs)
    .leftJoin(employees, eq(jobs.employeeId, employees.id))
    .where(and(eq(jobs.id, jobId), eq(jobs.tenantId, tenantId)))
    .limit(1)

  if (!result) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const { job, employee } = result

  return c.json({
    job: {
      id: job.id,
      name: job.name,
      schedule: job.schedule,
      prompt: job.prompt,
      enabled: job.enabled,
      lastRunAt: job.lastRunAt,
      createdAt: job.createdAt,
      employee: employee
        ? {
            id: employee.id,
            name: employee.name,
            type: employee.type,
          }
        : null,
    },
  })
})

/**
 * Update a job
 */
jobsRouter.patch('/:id', zValidator('json', updateJobSchema), async (c) => {
  const tenantId = c.get('tenantId')
  const jobId = c.req.param('id')
  const updates = c.req.valid('json')

  // Verify job belongs to tenant
  const [existing] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.tenantId, tenantId)))
    .limit(1)

  if (!existing) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const [updated] = await db.update(jobs).set(updates).where(eq(jobs.id, jobId)).returning()

  // Update scheduler
  await jobScheduler.updateJobSchedule(
    jobId,
    updates.schedule || existing.schedule,
    updates.enabled ?? existing.enabled ?? true
  )

  return c.json({
    job: {
      id: updated.id,
      name: updated.name,
      schedule: updated.schedule,
      prompt: updated.prompt,
      enabled: updated.enabled,
      lastRunAt: updated.lastRunAt,
      createdAt: updated.createdAt,
    },
  })
})

/**
 * Delete a job
 */
jobsRouter.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const jobId = c.req.param('id')

  // Verify job belongs to tenant
  const [existing] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.tenantId, tenantId)))
    .limit(1)

  if (!existing) {
    return c.json({ error: 'Job not found' }, 404)
  }

  // Unschedule first
  jobScheduler.unscheduleJob(jobId)

  // Delete from database
  await db.delete(jobs).where(eq(jobs.id, jobId))

  return c.json({ success: true, message: 'Job deleted' })
})

/**
 * Run a job immediately
 */
jobsRouter.post('/:id/run', async (c) => {
  const tenantId = c.get('tenantId')
  const jobId = c.req.param('id')

  // Verify job belongs to tenant
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.tenantId, tenantId)))
    .limit(1)

  if (!job) {
    return c.json({ error: 'Job not found' }, 404)
  }

  try {
    const execution = await runJobNow(jobId)

    return c.json({
      execution: {
        jobId: execution.jobId,
        status: execution.status,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        result: execution.result,
        error: execution.error,
      },
    })
  } catch (error) {
    console.error('Run job error:', error)
    return c.json({ error: 'Failed to run job' }, 500)
  }
})

/**
 * Get recent job executions
 */
jobsRouter.get('/executions/recent', async (c) => {
  const executions = getRecentExecutions(20)

  return c.json({
    executions: executions.map((e) => ({
      jobId: e.jobId,
      status: e.status,
      startedAt: e.startedAt,
      completedAt: e.completedAt,
      result: e.result?.slice(0, 200), // Truncate for list view
      error: e.error,
    })),
  })
})

export { jobsRouter }
