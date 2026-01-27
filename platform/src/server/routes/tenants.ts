import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { db } from '../../db/client.js'
import { tenants, profiles } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { authMiddleware, adminMiddleware } from '../middleware/auth.js'

const tenantsRouter = new Hono()

// Apply auth middleware to all routes
tenantsRouter.use('*', authMiddleware)

// Schema for updating tenant
const updateTenantSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  plan: z.string().optional(),
})

/**
 * Get current tenant info
 */
tenantsRouter.get('/', async (c) => {
  const tenantId = c.get('tenantId')

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)

  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404)
  }

  // Get team members
  const members = await db.select().from(profiles).where(eq(profiles.tenantId, tenantId))

  return c.json({
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      createdAt: tenant.createdAt,
    },
    members: members.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      role: m.role,
      createdAt: m.createdAt,
    })),
  })
})

/**
 * Update tenant settings (admin only)
 */
tenantsRouter.patch('/', adminMiddleware, zValidator('json', updateTenantSchema), async (c) => {
  const tenantId = c.get('tenantId')
  const updates = c.req.valid('json')

  const [updated] = await db
    .update(tenants)
    .set(updates)
    .where(eq(tenants.id, tenantId))
    .returning()

  return c.json({
    tenant: {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      plan: updated.plan,
      createdAt: updated.createdAt,
    },
  })
})

/**
 * Invite team member (admin only)
 */
tenantsRouter.post(
  '/invite',
  adminMiddleware,
  zValidator('json', z.object({ email: z.string().email(), role: z.string().optional() })),
  async (c) => {
    // TODO: Implement invitation system
    // This would send an email with invitation link
    return c.json({ error: 'Invitations not yet implemented' }, 501)
  }
)

/**
 * Remove team member (admin only)
 */
tenantsRouter.delete('/members/:userId', adminMiddleware, async (c) => {
  const tenantId = c.get('tenantId')
  const userId = c.req.param('userId')
  const currentUser = c.get('user')

  // Can't remove yourself
  if (userId === currentUser.id) {
    return c.json({ error: 'Cannot remove yourself' }, 400)
  }

  // Check if user belongs to this tenant
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1)

  if (!profile || profile.tenantId !== tenantId) {
    return c.json({ error: 'Member not found' }, 404)
  }

  // Can't remove the owner
  if (profile.role === 'owner') {
    return c.json({ error: 'Cannot remove tenant owner' }, 400)
  }

  // Remove from tenant
  await db.update(profiles).set({ tenantId: null }).where(eq(profiles.id, userId))

  return c.json({ success: true, message: 'Member removed' })
})

export { tenantsRouter }
