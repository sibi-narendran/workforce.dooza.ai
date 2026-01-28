import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required')
}

// Production-ready postgres client with connection pooling
const client = postgres(connectionString, {
  // Connection pool settings
  max: 20, // Maximum connections in pool
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Connection timeout in seconds

  // Retry settings for transient failures
  max_lifetime: 60 * 30, // Max connection lifetime: 30 minutes

  // Transform settings
  transform: {
    undefined: null, // Transform undefined to null for PostgreSQL compatibility
  },

  // Connection error handling
  onnotice: () => {}, // Suppress notice messages
})

// Create drizzle instance with schema
export const db = drizzle(client, { schema })

/**
 * Execute a database operation with retry logic for transient failures
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 100 } = options
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error
      const errorMessage = lastError.message?.toLowerCase() || ''

      // Only retry on transient/connection errors
      const isTransient =
        errorMessage.includes('connection') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('econnreset') ||
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('too many clients')

      if (!isTransient || attempt === maxRetries) {
        throw lastError
      }

      // Exponential backoff: 100ms, 200ms, 400ms, ...
      const delay = baseDelayMs * Math.pow(2, attempt)
      console.warn(`[DB] Retrying operation (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms:`, errorMessage)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

/**
 * Health check for database connection
 */
export async function checkDatabaseHealth(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const start = Date.now()
  try {
    await client`SELECT 1`
    return { ok: true, latencyMs: Date.now() - start }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

// Export for direct SQL queries if needed
export { client }
