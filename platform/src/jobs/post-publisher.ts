/**
 * Background post publisher
 *
 * Polls every 60s for posts with status='scheduled' and scheduledDate <= now.
 * Publishes via Composio SDK directly (no AI agent needed).
 */
import { db } from '../db/client.js'
import { posts, userIntegrations, integrationProviders } from '../db/schema.js'
import { eq, and, lte, sql } from 'drizzle-orm'
import { executeTool } from '../integrations/composio-client.js'
import { getPlatformConfig, getProviderSlugForPlatform } from '../integrations/social-platforms.js'

class PostPublisher {
  private intervalId: ReturnType<typeof setInterval> | null = null

  start() {
    console.log('[PostPublisher] Started (polling every 60s)')
    this.tick()
    this.intervalId = setInterval(() => this.tick(), 60_000)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.log('[PostPublisher] Stopped')
    }
  }

  private async tick() {
    try {
      // Find due posts: status='scheduled' AND scheduledDate <= now, limit 10
      const duePosts = await db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts.status, 'scheduled'),
            lte(posts.scheduledDate, new Date())
          )
        )
        .limit(10)

      if (duePosts.length === 0) return

      console.log(`[PostPublisher] Found ${duePosts.length} due post(s)`)

      for (const post of duePosts) {
        await this.publishPost(post)
      }
    } catch (err) {
      console.error('[PostPublisher] Tick error:', err)
    }
  }

  private async publishPost(post: typeof posts.$inferSelect) {
    const config = getPlatformConfig(post.platform)
    if (!config) {
      await this.markFailed(post.id, `No platform config for ${post.platform}`)
      return
    }

    // Optimistic lock: set status='publishing'
    const [locked] = await db
      .update(posts)
      .set({ status: 'publishing', updatedAt: new Date() })
      .where(and(eq(posts.id, post.id), eq(posts.status, 'scheduled')))
      .returning()

    if (!locked) {
      // Another instance already picked it up
      return
    }

    console.log(`[PostPublisher] Publishing post ${post.id} to ${post.platform}`)

    try {
      // Look up selectedPageId from integration metadata (Facebook page_id, LinkedIn author URN)
      let pageId: string | null = null
      const providerSlug = getProviderSlugForPlatform(post.platform)
      if (providerSlug === 'facebook' || providerSlug === 'linkedin') {
        const [integration] = await db
          .select({ metadata: userIntegrations.metadata })
          .from(userIntegrations)
          .innerJoin(integrationProviders, eq(userIntegrations.providerId, integrationProviders.id))
          .where(
            and(
              eq(userIntegrations.tenantId, post.tenantId),
              eq(integrationProviders.slug, providerSlug),
              eq(userIntegrations.status, 'connected')
            )
          )
          .limit(1)
        const meta = integration?.metadata as Record<string, unknown> | null
        pageId = (meta?.selectedPageId as string) || null
      }

      const postData = {
        content: post.content,
        title: post.title,
        imageUrl: post.imageUrl,
        pageId,
      }

      // Execute steps sequentially, passing each result to the next
      let prevResult: unknown = undefined
      for (const step of config.steps) {
        const params = step.buildParams(postData, prevResult)
        const result = await executeTool(post.tenantId, step.action, params)
        if (!result.success) {
          await this.markFailed(post.id, result.error || `Failed at ${step.action}`)
          return
        }
        prevResult = result.data
      }

      // All steps succeeded → mark published
      await db
        .update(posts)
        .set({
          status: 'published',
          updatedAt: new Date(),
          metadata: sql`COALESCE(${posts.metadata}, '{}'::jsonb) || ${JSON.stringify({
            publishedAt: new Date().toISOString(),
            composioResult: prevResult,
          })}::jsonb`,
        })
        .where(eq(posts.id, post.id))

      console.log(`[PostPublisher] Published post ${post.id}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      await this.markFailed(post.id, message)
    }
  }

  private async markFailed(postId: string, reason: string) {
    console.error(`[PostPublisher] Failed post ${postId}: ${reason}`)
    await db
      .update(posts)
      .set({
        status: 'failed',
        updatedAt: new Date(),
        metadata: sql`COALESCE(${posts.metadata}, '{}'::jsonb) || ${JSON.stringify({
          failureReason: reason,
          failedAt: new Date().toISOString(),
        })}::jsonb`,
      })
      .where(eq(posts.id, postId))
  }
}

export const postPublisher = new PostPublisher()
