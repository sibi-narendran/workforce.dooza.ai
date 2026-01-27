import cron from 'node-cron'
import { db } from '../db/client.js'
import { jobs } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { jobQueue } from './queue.js'

interface ScheduledTask {
  jobId: string
  cronTask: cron.ScheduledTask
}

/**
 * Manages cron-based job scheduling
 */
class JobScheduler {
  private tasks = new Map<string, ScheduledTask>()

  /**
   * Start the scheduler and load all enabled jobs
   */
  async start(): Promise<void> {
    console.log('[Scheduler] Starting job scheduler...')

    // Load all enabled jobs from database
    const enabledJobs = await db.select().from(jobs).where(eq(jobs.enabled, true))

    for (const job of enabledJobs) {
      this.scheduleJob(job)
    }

    console.log(`[Scheduler] Loaded ${enabledJobs.length} scheduled jobs`)

    // Clean up old executions every hour
    cron.schedule('0 * * * *', () => {
      jobQueue.clearOldExecutions()
    })
  }

  /**
   * Schedule a single job
   */
  scheduleJob(job: {
    id: string
    tenantId: string
    employeeId: string
    name: string
    schedule: string
    prompt: string
  }): void {
    // Validate cron expression
    if (!cron.validate(job.schedule)) {
      console.error(`[Scheduler] Invalid cron expression for job ${job.id}: ${job.schedule}`)
      return
    }

    // Remove existing task if any
    this.unscheduleJob(job.id)

    console.log(`[Scheduler] Scheduling job ${job.id} (${job.name}): ${job.schedule}`)

    const cronTask = cron.schedule(job.schedule, async () => {
      console.log(`[Scheduler] Running scheduled job ${job.id}: ${job.name}`)

      try {
        // Fetch fresh job data
        const [freshJob] = await db.select().from(jobs).where(eq(jobs.id, job.id)).limit(1)

        if (!freshJob || !freshJob.enabled) {
          console.log(`[Scheduler] Job ${job.id} is disabled, skipping`)
          return
        }

        // Execute the job
        await jobQueue.executeJob(freshJob)

        // Update last run time
        await db.update(jobs).set({ lastRunAt: new Date() }).where(eq(jobs.id, job.id))
      } catch (error) {
        console.error(`[Scheduler] Error running job ${job.id}:`, error)
      }
    })

    this.tasks.set(job.id, { jobId: job.id, cronTask })
  }

  /**
   * Unschedule a job
   */
  unscheduleJob(jobId: string): void {
    const task = this.tasks.get(jobId)
    if (task) {
      task.cronTask.stop()
      this.tasks.delete(jobId)
      console.log(`[Scheduler] Unscheduled job ${jobId}`)
    }
  }

  /**
   * Update a job's schedule
   */
  async updateJobSchedule(
    jobId: string,
    newSchedule: string,
    enabled: boolean
  ): Promise<void> {
    // Unschedule existing
    this.unscheduleJob(jobId)

    if (!enabled) return

    // Load and reschedule
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1)

    if (job && job.enabled) {
      this.scheduleJob(job)
    }
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    console.log('[Scheduler] Stopping job scheduler...')

    for (const [jobId, task] of this.tasks) {
      task.cronTask.stop()
    }

    this.tasks.clear()
  }

  /**
   * Get status of scheduled tasks
   */
  getStatus(): { jobId: string; running: boolean }[] {
    return Array.from(this.tasks.values()).map((task) => ({
      jobId: task.jobId,
      running: true,
    }))
  }
}

export const jobScheduler = new JobScheduler()
