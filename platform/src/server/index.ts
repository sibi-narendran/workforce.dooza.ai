import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { auth } from './routes/auth.js'
import { tenantsRouter } from './routes/tenants.js'
import { employeesRouter } from './routes/employees.js'
import { conversationsRouter } from './routes/conversations.js'
import { jobsRouter } from './routes/jobs.js'
import { libraryRouter } from './routes/library.js'
import { integrationsRouter } from './routes/integrations.js'
import { authMiddleware } from './middleware/auth.js'

const app = new Hono()

// Global middleware
app.use('*', logger())
app.use('*', prettyJSON())
app.use(
  '*',
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://workforce.dooza.ai',
      /\.vercel\.app$/,  // Vercel preview deployments
    ],
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
      jobs: '/api/jobs',
      integrations: '/api/integrations',
    },
  })
})

// Mount routes
app.route('/api/auth', auth)

// Protected routes - require auth
app.use('/api/tenant/*', authMiddleware)
// Note: /api/employees list is public, other employee routes use router-level auth
app.use('/api/conversations/*', authMiddleware)
app.use('/api/jobs/*', authMiddleware)

app.route('/api/tenant', tenantsRouter)
app.route('/api/employees', employeesRouter)
app.route('/api/conversations', conversationsRouter)
app.route('/api/jobs', jobsRouter)
app.route('/api/library', libraryRouter)
app.route('/api/integrations', integrationsRouter)

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

export { app }
