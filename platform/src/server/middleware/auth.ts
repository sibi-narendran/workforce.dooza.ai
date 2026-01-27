import { createMiddleware } from 'hono/factory'
import type { Context, Next } from 'hono'
import { supabaseAdmin, type AuthUser } from '../../lib/supabase.js'
import { db } from '../../db/client.js'
import { profiles } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

// Extend Hono context with auth user
declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser
    tenantId: string
  }
}

/**
 * Middleware to verify Supabase JWT and extract user info
 */
export const authMiddleware = createMiddleware(async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid authorization header' }, 401)
  }

  const token = authHeader.slice(7)

  if (!supabaseAdmin) {
    return c.json({ error: 'Auth service unavailable' }, 503)
  }

  try {
    // Verify JWT with Supabase
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token)

    if (error || !user) {
      return c.json({ error: 'Invalid or expired token' }, 401)
    }

    // Get user's profile with tenant info
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1)

    if (!profile?.tenantId) {
      return c.json({ error: 'User has no tenant. Complete registration first.' }, 403)
    }

    // Set user and tenant in context
    c.set('user', {
      id: user.id,
      email: user.email!,
      tenantId: profile.tenantId,
      role: profile.role || 'member',
    })
    c.set('tenantId', profile.tenantId)

    await next()
  } catch (error) {
    console.error('Auth middleware error:', error)
    return c.json({ error: 'Authentication failed' }, 401)
  }
})

/**
 * Middleware to require admin role
 */
export const adminMiddleware = createMiddleware(async (c: Context, next: Next) => {
  const user = c.get('user')

  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  if (user.role !== 'admin' && user.role !== 'owner') {
    return c.json({ error: 'Admin access required' }, 403)
  }

  await next()
})

/**
 * Optional auth - sets user if token present, continues if not
 */
export const optionalAuthMiddleware = createMiddleware(async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ') || !supabaseAdmin) {
    await next()
    return
  }

  const token = authHeader.slice(7)

  try {
    const {
      data: { user },
    } = await supabaseAdmin.auth.getUser(token)

    if (user) {
      const [profile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, user.id))
        .limit(1)

      if (profile?.tenantId) {
        c.set('user', {
          id: user.id,
          email: user.email!,
          tenantId: profile.tenantId,
          role: profile.role || 'member',
        })
        c.set('tenantId', profile.tenantId)
      }
    }
  } catch {
    // Ignore auth errors for optional middleware
  }

  await next()
})
