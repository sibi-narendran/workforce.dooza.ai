import { executeEmployee } from '../employees/executor.js'
import type { Job } from '../db/schema.js'

export interface JobExecution {
  jobId: string
  startedAt: Date
  completedAt?: Date
  status: 'running' | 'completed' | 'failed'
  result?: string
  error?: string
}

/**
 * Simple in-memory job execution tracking
 */
class JobQueue {
  private executions = new Map<string, JobExecution>()

  /**
   * Execute a job immediately
   */
  async executeJob(job: Job): Promise<JobExecution> {
    const execution: JobExecution = {
      jobId: job.id,
      startedAt: new Date(),
      status: 'running',
    }

    this.executions.set(job.id, execution)

    try {
      console.log(`[Job] Executing job ${job.id}: ${job.name}`)

      const result = await executeEmployee(job.tenantId, job.employeeId, job.prompt, {
        thinking: 'medium',
      })

      execution.completedAt = new Date()

      if (result.success) {
        execution.status = 'completed'
        execution.result = result.response
      } else {
        execution.status = 'failed'
        execution.error = result.error
      }

      console.log(`[Job] Job ${job.id} ${execution.status}`)
    } catch (error) {
      execution.completedAt = new Date()
      execution.status = 'failed'
      execution.error = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[Job] Job ${job.id} failed:`, error)
    }

    return execution
  }

  /**
   * Get execution status
   */
  getExecution(jobId: string): JobExecution | undefined {
    return this.executions.get(jobId)
  }

  /**
   * Get recent executions
   */
  getRecentExecutions(limit = 10): JobExecution[] {
    return Array.from(this.executions.values())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit)
  }

  /**
   * Clear old executions
   */
  clearOldExecutions(olderThanMs = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - olderThanMs

    for (const [id, execution] of this.executions) {
      if (execution.completedAt && execution.completedAt.getTime() < cutoff) {
        this.executions.delete(id)
      }
    }
  }
}

export const jobQueue = new JobQueue()
