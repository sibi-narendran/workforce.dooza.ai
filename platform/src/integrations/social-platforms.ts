/**
 * Social platform configs for Composio publishing
 *
 * Maps platform names to Composio action names and parameter builders.
 * Used by the approve endpoint (validation) and post publisher (execution).
 */

interface PostData {
  content: string
  title?: string | null
  imageUrl?: string | null
}

interface PublishStep {
  action: string
  buildParams: (post: PostData, prevResult?: unknown) => Record<string, unknown>
}

interface SocialPlatformConfig {
  providerSlug: string
  steps: PublishStep[]
  maxContentLength: number
  requiresImage: boolean
  /** Validate post can be published. Returns error string or null if OK. */
  validate: (post: { content: string; imageUrl?: string | null }) => string | null
}

const SOCIAL_PLATFORMS: Record<string, SocialPlatformConfig> = {
  linkedin: {
    providerSlug: 'linkedin',
    steps: [
      {
        action: 'LINKEDIN_CREATE_LINKED_IN_POST',
        buildParams: (p) => ({
          text: p.content.slice(0, 3000),
          visibility: 'PUBLIC',
          ...(p.imageUrl ? { media_url: p.imageUrl } : {}),
        }),
      },
    ],
    maxContentLength: 3000,
    requiresImage: false,
    validate: () => null,
  },
  facebook: {
    providerSlug: 'facebook',
    steps: [
      {
        action: 'FACEBOOK_CREATE_POST',
        buildParams: (p) => ({
          message: p.content,
          ...(p.imageUrl ? { url: p.imageUrl } : {}),
        }),
      },
    ],
    maxContentLength: 63206,
    requiresImage: false,
    validate: () => null,
  },
  instagram: {
    providerSlug: 'instagram',
    steps: [
      {
        action: 'INSTAGRAM_CREATE_MEDIA_CONTAINER',
        buildParams: (p) => ({
          image_url: p.imageUrl!,
          caption: p.content.slice(0, 2200),
          content_type: 'IMAGE',
        }),
      },
      {
        action: 'INSTAGRAM_CREATE_POST',
        buildParams: (_p, prevResult) => ({
          creation_id: (prevResult as Record<string, unknown>)?.creation_id,
        }),
      },
    ],
    maxContentLength: 2200,
    requiresImage: true,
    validate: (p) => (!p.imageUrl ? 'Instagram requires an image' : null),
  },
}

// Platforms excluded from v1 (video-only)
const UNSUPPORTED_PLATFORMS = new Set(['youtube', 'tiktok'])

export function getProviderSlugForPlatform(platform: string): string | null {
  return SOCIAL_PLATFORMS[platform]?.providerSlug ?? null
}

export function getPlatformConfig(platform: string): SocialPlatformConfig | null {
  return SOCIAL_PLATFORMS[platform] ?? null
}

export function validatePostForPlatform(
  platform: string,
  post: { content: string; imageUrl?: string | null }
): string | null {
  if (UNSUPPORTED_PLATFORMS.has(platform)) {
    return `Publishing to ${platform} is not yet supported`
  }
  const config = SOCIAL_PLATFORMS[platform]
  if (!config) {
    return `Unknown platform: ${platform}`
  }
  return config.validate(post)
}
