import { serve } from '@hono/node-server'
import { startGatewayServer, type GatewayServer } from 'moltbot/gateway/server'
import { app } from './server/index.js'
import { validateEnv, env } from './lib/env.js'
import { jobScheduler } from './jobs/scheduler.js'

// Validate environment on startup
try {
  validateEnv()
} catch (error) {
  console.error('Environment validation failed:', error)
  process.exit(1)
}

// Start embedded gateway
let gateway: GatewayServer | null = null
try {
  gateway = await startGatewayServer(18789, {
    bind: 'loopback',
    controlUiEnabled: false,
    openAiChatCompletionsEnabled: true,
  })
  console.log('[Platform] Gateway started on port 18789')
} catch (err) {
  console.error('[Platform] Failed to start gateway:', err)
  process.exit(1)
}

const port = env.PORT

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██╗    ██╗ ██████╗ ██████╗ ██╗  ██╗███████╗ ██████╗    ║
║   ██║    ██║██╔═══██╗██╔══██╗██║ ██╔╝██╔════╝██╔═══██╗   ║
║   ██║ █╗ ██║██║   ██║██████╔╝█████╔╝ █████╗  ██║   ██║   ║
║   ██║███╗██║██║   ██║██╔══██╗██╔═██╗ ██╔══╝  ██║   ██║   ║
║   ╚███╔███╔╝╚██████╔╝██║  ██║██║  ██╗██║     ╚██████╔╝   ║
║    ╚══╝╚══╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝      ╚═════╝    ║
║                                                           ║
║              workforce.dooza.ai Platform                  ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`)

console.log(`[Platform] Starting server on port ${port}...`)
console.log(`[Platform] Environment: ${env.NODE_ENV}`)
console.log(`[Platform] AI Model: ${env.DEFAULT_MODEL}`)

// Start job scheduler (skip if database not ready)
jobScheduler.start().catch((err) => {
  console.warn('[Platform] Job scheduler failed to start:', err.message)
})

// Start HTTP server
serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`[Platform] Server running at http://localhost:${info.port}`)
    console.log(`[Platform] API docs at http://localhost:${info.port}/api`)
    console.log(`[Platform] Health check at http://localhost:${info.port}/health`)
  }
)

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\n[Platform] Received ${signal}, shutting down...`)

  // Stop scheduler
  jobScheduler.stop()

  // Close gateway
  if (gateway) {
    await gateway.close()
    console.log('[Platform] Gateway closed')
  }

  console.log('[Platform] Shutdown complete')
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
