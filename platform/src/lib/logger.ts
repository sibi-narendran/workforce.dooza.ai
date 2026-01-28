/**
 * Production-ready logger with context support
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  tenantId?: string
  userId?: string
  requestId?: string
  route?: string
  method?: string
  [key: string]: unknown
}

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: LogContext
  error?: {
    name: string
    message: string
    stack?: string
  }
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

// Set minimum log level from environment (default: info in production, debug in development)
const MIN_LOG_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[MIN_LOG_LEVEL]
}

function formatLogEntry(entry: LogEntry): string {
  const { timestamp, level, message, context, error } = entry

  // In production, output JSON for structured logging
  if (process.env.NODE_ENV === 'production') {
    return JSON.stringify(entry)
  }

  // In development, output human-readable format
  const levelStr = level.toUpperCase().padEnd(5)
  const contextStr = context ? ` ${JSON.stringify(context)}` : ''
  const errorStr = error ? `\n  Error: ${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ''}` : ''

  return `[${timestamp}] ${levelStr} ${message}${contextStr}${errorStr}`
}

function log(level: LogLevel, message: string, context?: LogContext, error?: Error) {
  if (!shouldLog(level)) return

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
  }

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  const formatted = formatLogEntry(entry)

  switch (level) {
    case 'error':
      console.error(formatted)
      break
    case 'warn':
      console.warn(formatted)
      break
    default:
      console.log(formatted)
  }
}

/**
 * Logger instance with context support
 */
export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext, error?: Error) => log('warn', message, context, error),
  error: (message: string, context?: LogContext, error?: Error) => log('error', message, context, error),

  /**
   * Create a child logger with preset context
   */
  child: (baseContext: LogContext) => ({
    debug: (message: string, context?: LogContext) => log('debug', message, { ...baseContext, ...context }),
    info: (message: string, context?: LogContext) => log('info', message, { ...baseContext, ...context }),
    warn: (message: string, context?: LogContext, error?: Error) =>
      log('warn', message, { ...baseContext, ...context }, error),
    error: (message: string, context?: LogContext, error?: Error) =>
      log('error', message, { ...baseContext, ...context }, error),
  }),
}

/**
 * Create a request logger from Hono context
 */
export function createRequestLogger(c: { req: { method: string; path: string }; get: (key: string) => unknown }) {
  const baseContext: LogContext = {
    method: c.req.method,
    route: c.req.path,
    tenantId: c.get('tenantId') as string | undefined,
    userId: (c.get('user') as { id?: string } | undefined)?.id,
  }

  return logger.child(baseContext)
}

/**
 * Format error for API response (hides internal details in production)
 */
export function formatApiError(error: unknown, fallbackMessage = 'An unexpected error occurred'): string {
  if (error instanceof Error) {
    // In production, hide internal error details
    if (process.env.NODE_ENV === 'production') {
      // Return generic messages for common error types
      if (error.message.includes('connection') || error.message.includes('ECONNREFUSED')) {
        return 'Service temporarily unavailable. Please try again.'
      }
      if (error.message.includes('timeout')) {
        return 'Request timed out. Please try again.'
      }
      // Return the message if it looks user-friendly (no stack traces, paths, etc.)
      if (error.message.length < 200 && !error.message.includes('/') && !error.message.includes('at ')) {
        return error.message
      }
      return fallbackMessage
    }
    return error.message
  }
  return fallbackMessage
}
