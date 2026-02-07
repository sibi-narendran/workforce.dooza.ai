import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { db } from '../../db/client.js'
import { posts } from '../../db/schema.js'
import { eq, and, gte, lt, desc } from 'drizzle-orm'

const postsRouter = new Hono()

const createPostSchema = z.object({
  agentSlug: z.string().max(100).optional(),
  platform: z.enum(['youtube', 'instagram', 'facebook', 'linkedin', 'tiktok']),
  title: z.string().max(200).optional(),
  content: z.string().min(1),
  imageUrl: z.string().url().optional(),
  scheduledDate: z.string().datetime(),
  status: z.enum(['draft', 'scheduled', 'published', 'failed']).optional().default('draft'),
  metadata: z.record(z.unknown()).optional(),
})

const updatePostSchema = z.object({
  platform: z.enum(['youtube', 'instagram', 'facebook', 'linkedin', 'tiktok']).optional(),
  title: z.string().max(200).optional(),
  content: z.string().min(1).optional(),
  imageUrl: z.string().url().nullable().optional(),
  scheduledDate: z.string().datetime().optional(),
  status: z.enum(['draft', 'scheduled', 'published', 'failed']).optional(),
  metadata: z.record(z.unknown()).optional(),
})

/**
 * List posts — filter by ?month=2026-02&agentSlug=somi
 */
postsRouter.get('/', async (c) => {
  const tenantId = c.get('tenantId')
  const monthParam = c.req.query('month')
  const agentSlugParam = c.req.query('agentSlug')

  const conditions = [eq(posts.tenantId, tenantId)]

  if (agentSlugParam) {
    conditions.push(eq(posts.agentSlug, agentSlugParam))
  }

  if (monthParam) {
    const [year, month] = monthParam.split('-').map(Number)
    if (year && month) {
      const start = new Date(year, month - 1, 1)
      const end = new Date(year, month, 1)
      conditions.push(gte(posts.scheduledDate, start))
      conditions.push(lt(posts.scheduledDate, end))
    }
  }

  const result = await db
    .select()
    .from(posts)
    .where(and(...conditions))
    .orderBy(desc(posts.scheduledDate))

  return c.json({ posts: result })
})

/**
 * Create post
 */
postsRouter.post('/', zValidator('json', createPostSchema), async (c) => {
  const tenantId = c.get('tenantId')
  const input = c.req.valid('json')

  // Reject past dates (5-min grace period, same as DB trigger)
  const scheduledTime = new Date(input.scheduledDate)
  if (scheduledTime.getTime() < Date.now() - 5 * 60 * 1000) {
    return c.json({ error: 'Cannot schedule a post in the past.' }, 400)
  }

  const [post] = await db
    .insert(posts)
    .values({
      tenantId,
      agentSlug: input.agentSlug,
      platform: input.platform,
      title: input.title,
      content: input.content,
      imageUrl: input.imageUrl,
      scheduledDate: new Date(input.scheduledDate),
      status: input.status,
      metadata: input.metadata,
    })
    .returning()

  return c.json({ post }, 201)
})

/**
 * Update post (partial)
 */
postsRouter.patch('/:id', zValidator('json', updatePostSchema), async (c) => {
  const tenantId = c.get('tenantId')
  const postId = c.req.param('id')
  const updates = c.req.valid('json')

  // Verify post belongs to tenant
  const [existing] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.tenantId, tenantId)))
    .limit(1)

  if (!existing) {
    return c.json({ error: 'Post not found' }, 404)
  }

  // Reject past dates when rescheduling (5-min grace period)
  if (updates.scheduledDate) {
    const scheduledTime = new Date(updates.scheduledDate)
    if (scheduledTime.getTime() < Date.now() - 5 * 60 * 1000) {
      return c.json({ error: 'Cannot reschedule a post to the past.' }, 400)
    }
  }

  const values: Record<string, unknown> = { updatedAt: new Date() }
  if (updates.platform !== undefined) values.platform = updates.platform
  if (updates.title !== undefined) values.title = updates.title
  if (updates.content !== undefined) values.content = updates.content
  if (updates.imageUrl !== undefined) values.imageUrl = updates.imageUrl
  if (updates.scheduledDate !== undefined) values.scheduledDate = new Date(updates.scheduledDate)
  if (updates.status !== undefined) values.status = updates.status
  if (updates.metadata !== undefined) values.metadata = updates.metadata

  const [updated] = await db
    .update(posts)
    .set(values)
    .where(eq(posts.id, postId))
    .returning()

  return c.json({ post: updated })
})

/**
 * Delete post
 */
postsRouter.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const postId = c.req.param('id')

  const [existing] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.tenantId, tenantId)))
    .limit(1)

  if (!existing) {
    return c.json({ error: 'Post not found' }, 404)
  }

  await db.delete(posts).where(eq(posts.id, postId))

  return c.json({ success: true, message: 'Post deleted' })
})

export { postsRouter }
