import { db } from '../db/client.js'
import { jobs } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { jobQueue, type JobExecution } from './queue.js'

/**
 * Run a job immediately (outside of schedule)
 */
export async function runJobNow(jobId: string): Promise<JobExecution> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1)

  if (!job) {
    throw new Error(`Job ${jobId} not found`)
  }

  const execution = await jobQueue.executeJob(job)

  // Update last run time
  await db.update(jobs).set({ lastRunAt: new Date() }).where(eq(jobs.id, jobId))

  return execution
}

/**
 * Get recent executions for a job
 */
export function getJobExecutions(jobId: string): JobExecution | undefined {
  return jobQueue.getExecution(jobId)
}

/**
 * Get all recent executions
 */
export function getRecentExecutions(limit = 10): JobExecution[] {
  return jobQueue.getRecentExecutions(limit)
}
