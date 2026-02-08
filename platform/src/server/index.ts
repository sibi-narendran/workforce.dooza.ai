import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { auth } from './routes/auth.js'
import { tenantsRouter } from './routes/tenants.js'
import { employeesRouter } from './routes/employees.js'
import { conversationsRouter } from './routes/conversations.js'
import { libraryRouter } from './routes/library.js'
import { integrationsRouter } from './routes/integrations.js'
import { brainRouter } from './routes/brain.js'
import { postsRouter } from './routes/posts.js'
import { routinesRouter } from './routes/routines.js'
import { streamRouter } from './routes/stream.js'
import internalComposio from './routes/internal-composio.js'
import internalBrainStorage from './routes/internal-brain-storage.js'
import { authMiddleware } from './middleware/auth.js'
import { sseManager, gatewayPool } from '../streaming/index.js'

const app = new Hono()

// Global middleware
app.use('*', logger())
app.use('*', prettyJSON())
app.use(
  '*',
  cors({
    origin: (origin) => {
      const allowedOrigins = [
        'http://localhost:5173',
        'http://localhost:3000',
        'https://workforce.dooza.ai',
      ]
      // Allow Vercel and Render preview deployments
      if (origin && (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app') || origin.endsWith('.onrender.com'))) {
        return origin
      }
      return allowedOrigins[0]
    },
    credentials: true,
  })
)

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'workforce-platform',
  })
})

// API info
app.get('/api', (c) => {
  return c.json({
    name: 'Workforce Platform API',
    version: '0.1.0',
    description: 'Multi-tenant AI employee management platform',
    endpoints: {
      auth: '/api/auth',
      tenant: '/api/tenant',
      employees: '/api/employees',
      conversations: '/api/conversations',
      routines: '/api/routines',
      posts: '/api/posts',
      integrations: '/api/integrations',
      stream: '/api/stream',
      internal: {
        composio: '/api/internal/composio',
        brainStorage: '/api/internal/brain-storage',
      },
    },
  })
})

// Mount routes
app.route('/api/auth', auth)

// Protected routes - require auth
app.use('/api/tenant/*', authMiddleware)
// Note: /api/employees list is public, other employee routes use router-level auth
app.use('/api/conversations/*', authMiddleware)
app.use('/api/posts/*', authMiddleware)
app.use('/api/routines/*', authMiddleware)
// Note: /api/stream handles its own auth (supports query param for SSE)

app.route('/api/tenant', tenantsRouter)
app.route('/api/employees', employeesRouter)
app.route('/api/conversations', conversationsRouter)
app.route('/api/posts', postsRouter)
app.route('/api/routines', routinesRouter)
app.route('/api/library', libraryRouter)
app.route('/api/integrations', integrationsRouter)
app.route('/api/brain', brainRouter)
app.route('/api/stream', streamRouter)

// Internal API for Clawdbot plugin communication (no auth - internal network only)
app.route('/api/internal/composio', internalComposio)

// Internal Brain Storage API (for AI agents)
app.route('/api/internal/brain-storage', internalBrainStorage)

// Auth /me endpoint needs middleware applied in auth.ts context
app.get('/api/auth/me', authMiddleware, async (c) => {
  const user = c.get('user')
  return c.json({ user })
})

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404)
})

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err)
  return c.json(
    {
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    },
    500
  )
})

// Graceful shutdown handling for streaming infrastructure
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down streaming...')
  sseManager.stopPingInterval()
  gatewayPool.shutdown()
})

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, shutting down streaming...')
  sseManager.stopPingInterval()
  gatewayPool.shutdown()
})

export { app }
