import { createMiddleware } from 'hono/factory'
import type { Context, Next } from 'hono'
import { tenantManager } from '../../tenant/manager.js'

/**
 * Middleware to ensure tenant directory exists
 */
export const tenantDirMiddleware = createMiddleware(async (c: Context, next: Next) => {
  const tenantId = c.get('tenantId')

  if (!tenantId) {
    return c.json({ error: 'Tenant context required' }, 400)
  }

  // Ensure tenant directory exists (creates if needed)
  if (!(await tenantManager.tenantExists(tenantId))) {
    // This shouldn't normally happen as tenant dir is created on registration
    console.warn(`Tenant directory missing for ${tenantId}, creating...`)
    const user = c.get('user')
    await tenantManager.createTenant(tenantId, user?.email || 'Unknown')
  }

  await next()
})

/**
 * Middleware to verify tenant ownership of a resource
 */
export function requireTenantResource(getResourceTenantId: (c: Context) => string | Promise<string>) {
  return createMiddleware(async (c: Context, next: Next) => {
    const userTenantId = c.get('tenantId')

    if (!userTenantId) {
      return c.json({ error: 'Tenant context required' }, 400)
    }

    const resourceTenantId = await getResourceTenantId(c)

    if (resourceTenantId !== userTenantId) {
      return c.json({ error: 'Resource not found' }, 404) // 404 to not leak existence
    }

    await next()
  })
}
