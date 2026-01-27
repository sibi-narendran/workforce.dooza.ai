import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { supabaseAdmin } from '../../lib/supabase.js'
import { db } from '../../db/client.js'
import { tenants, profiles } from '../../db/schema.js'
import { tenantManager } from '../../tenant/manager.js'
import { eq } from 'drizzle-orm'

const auth = new Hono()

// Schema for registration
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
  companyName: z.string().min(1).max(100),
})

// Schema for login
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

/**
 * Register a new user and create their tenant
 */
auth.post('/register', zValidator('json', registerSchema), async (c) => {
  if (!supabaseAdmin) {
    return c.json({ error: 'Auth service unavailable' }, 503)
  }

  const { email, password, name, companyName } = c.req.valid('json')

  try {
    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm for now
    })

    if (authError || !authData.user) {
      return c.json({ error: authError?.message || 'Failed to create user' }, 400)
    }

    const userId = authData.user.id

    // Create tenant
    const slug = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    const [tenant] = await db
      .insert(tenants)
      .values({
        name: companyName,
        slug: `${slug}-${Date.now().toString(36)}`,
        ownerId: userId,
        plan: 'free',
      })
      .returning()

    // Create user profile
    await db.insert(profiles).values({
      id: userId,
      tenantId: tenant.id,
      role: 'owner',
      displayName: name,
    })

    // Create tenant directory structure
    await tenantManager.createTenant(tenant.id, companyName)

    // Sign in to get tokens
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    })

    if (sessionError) {
      // User created but session failed - they can log in manually
      return c.json(
        {
          success: true,
          message: 'Account created. Please log in.',
          tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        },
        201
      )
    }

    return c.json(
      {
        success: true,
        user: {
          id: userId,
          email,
          name,
          tenantId: tenant.id,
          role: 'owner',
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
        },
        session: {
          accessToken: sessionData.session?.access_token,
          refreshToken: sessionData.session?.refresh_token,
          expiresAt: sessionData.session?.expires_at,
        },
      },
      201
    )
  } catch (error) {
    console.error('Registration error:', error)
    return c.json({ error: 'Registration failed' }, 500)
  }
})

/**
 * Login and get JWT tokens
 */
auth.post('/login', zValidator('json', loginSchema), async (c) => {
  if (!supabaseAdmin) {
    return c.json({ error: 'Auth service unavailable' }, 503)
  }

  const { email, password } = c.req.valid('json')

  try {
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.session) {
      return c.json({ error: error?.message || 'Invalid credentials' }, 401)
    }

    // Get user profile
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, data.user.id))
      .limit(1)

    // Get tenant info if profile exists
    let tenant = null
    if (profile?.tenantId) {
      const [tenantData] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, profile.tenantId))
        .limit(1)
      tenant = tenantData
    }

    return c.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: profile?.displayName,
        tenantId: profile?.tenantId,
        role: profile?.role,
      },
      tenant: tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            plan: tenant.plan,
          }
        : null,
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    return c.json({ error: 'Login failed' }, 500)
  }
})

/**
 * Refresh session token
 */
auth.post('/refresh', async (c) => {
  if (!supabaseAdmin) {
    return c.json({ error: 'Auth service unavailable' }, 503)
  }

  const body = await c.req.json()
  const refreshToken = body.refreshToken

  if (!refreshToken) {
    return c.json({ error: 'Refresh token required' }, 400)
  }

  try {
    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token: refreshToken,
    })

    if (error || !data.session) {
      return c.json({ error: error?.message || 'Failed to refresh session' }, 401)
    }

    return c.json({
      success: true,
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
      },
    })
  } catch (error) {
    console.error('Refresh error:', error)
    return c.json({ error: 'Token refresh failed' }, 500)
  }
})

/**
 * Logout (invalidate refresh token)
 */
auth.post('/logout', async (c) => {
  // Note: With Supabase, the client should call supabase.auth.signOut()
  // Server-side logout is mainly for admin token invalidation
  return c.json({ success: true, message: 'Logged out' })
})

/**
 * Get current user info (requires auth)
 */
auth.get('/me', async (c) => {
  // This endpoint will use authMiddleware in the main app
  const user = c.get('user')
  const tenantId = c.get('tenantId')

  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    },
    tenant: tenant
      ? {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          plan: tenant.plan,
        }
      : null,
  })
})

export { auth }
