import { useState } from 'react'

/** Short role taglines shown under the agent name instead of raw slugs */
const TAGLINES: Record<string, string> = {
  utumy: 'YouTube Content Specialist',
  somi: 'Social Media Specialist',
  linky: 'LinkedIn Specialist',
  researcher: 'Research Assistant',
  writer: 'Content Writer',
  'data-analyst': 'Data Analyst',
  'customer-support': 'Support Agent',
  'code-reviewer': 'Code Reviewer',
  'project-manager': 'Project Coordinator',
  ranky: 'SEO Specialist',
}

export function agentTagline(slug: string): string {
  return TAGLINES[slug] || 'AI Employee'
}

/**
 * Agent avatar with fallback chain:
 * 1. Custom image at /avatars/{slug}.png (drop your own in web/public/avatars/)
 * 2. DiceBear Adventurer cartoon (generated from slug seed)
 */
export function AgentAvatar({
  slug,
  name,
  size = 48,
}: {
  slug: string
  name: string
  size?: number
}) {
  const [useFallback, setUseFallback] = useState(false)

  const customUrl = `/avatars/${slug}.png`
  const dicebearUrl = `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(slug)}&radius=12&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`

  return (
    <img
      src={useFallback ? dicebearUrl : customUrl}
      alt={name}
      onError={() => {
        if (!useFallback) setUseFallback(true)
      }}
      style={{
        width: size,
        height: size,
        borderRadius: 'var(--radius-md)',
        objectFit: 'cover',
        flexShrink: 0,
      }}
    />
  )
}
