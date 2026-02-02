import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import * as cheerio from 'cheerio'
import { authMiddleware } from '../middleware/auth.js'
import { openrouter } from '../../lib/openrouter.js'

const brainRouter = new Hono()

// Apply auth middleware to all routes
brainRouter.use('*', authMiddleware)

// Schema for extracting brand info
const extractSchema = z.object({
  url: z.string().url(),
})

interface ExtractedBrand {
  business_name: string | null
  website: string | null
  tagline: string | null
  colors: { primary?: string; secondary?: string } | null
  social_links: Record<string, string> | null
  description: string | null
  value_proposition: string | null
  target_audience: string | null
  industry: string | null
}

/**
 * Extract brand information from a URL
 * Fetches HTML, parses with cheerio, and uses LLM for deeper analysis
 */
brainRouter.post('/extract', zValidator('json', extractSchema), async (c) => {
  const { url } = c.req.valid('json')

  try {
    // Fetch the URL
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WorkforceBot/1.0; +https://workforce.dooza.ai)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      return c.json({
        success: false,
        url,
        extracted: createEmptyExtracted(),
        error: `Failed to fetch URL: ${response.status} ${response.statusText}`,
      }, 400)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    // Extract basic info from HTML
    const htmlExtracted = extractFromHtml($, url)

    // Get page text for LLM analysis (truncated to ~4000 chars)
    const pageText = getPageText($)

    // Use LLM to extract deeper insights
    let llmExtracted: Partial<ExtractedBrand> = {}
    try {
      llmExtracted = await extractWithLlm(pageText)
    } catch (llmError) {
      console.warn('[Brain] LLM extraction failed:', llmError)
      // Continue with HTML-only extraction
    }

    // Merge HTML and LLM extractions (LLM takes precedence for text fields)
    const extracted: ExtractedBrand = {
      business_name: llmExtracted.business_name || htmlExtracted.business_name || null,
      website: url,
      tagline: htmlExtracted.tagline || llmExtracted.tagline || null,
      colors: htmlExtracted.colors || null,
      social_links: htmlExtracted.social_links || null,
      description: llmExtracted.description || htmlExtracted.description || null,
      value_proposition: llmExtracted.value_proposition || null,
      target_audience: llmExtracted.target_audience || null,
      industry: llmExtracted.industry || null,
    }

    return c.json({
      success: true,
      url,
      extracted,
    })
  } catch (error) {
    console.error('[Brain] Extraction error:', error)

    const message = error instanceof Error ? error.message : 'Unknown error'

    return c.json({
      success: false,
      url,
      extracted: createEmptyExtracted(),
      error: message.includes('timeout')
        ? 'Request timed out - the website may be slow or unavailable'
        : `Failed to extract brand info: ${message}`,
    }, 500)
  }
})

/**
 * Extract info directly from HTML using cheerio
 */
function extractFromHtml($: cheerio.CheerioAPI, url: string): Partial<ExtractedBrand> {
  const result: Partial<ExtractedBrand> = {
    business_name: null,
    tagline: null,
    colors: null,
    social_links: null,
    description: null,
  }

  // Business name: try og:site_name, then title
  result.business_name =
    $('meta[property="og:site_name"]').attr('content')?.trim() ||
    $('meta[name="application-name"]').attr('content')?.trim() ||
    extractFromTitle($('title').text()) ||
    null

  // Tagline: try og:description or meta description
  result.tagline =
    $('meta[property="og:description"]').attr('content')?.trim()?.slice(0, 150) ||
    $('meta[name="description"]').attr('content')?.trim()?.slice(0, 150) ||
    null

  // Description: same as tagline but full length
  result.description =
    $('meta[property="og:description"]').attr('content')?.trim() ||
    $('meta[name="description"]').attr('content')?.trim() ||
    null

  // Colors: try to extract from CSS or theme-color meta
  const colors: { primary?: string; secondary?: string } = {}
  const themeColor = $('meta[name="theme-color"]').attr('content')
  if (themeColor && isValidColor(themeColor)) {
    colors.primary = themeColor
  }

  // Try to find brand color in inline styles or CSS variables
  const msColor = $('meta[name="msapplication-TileColor"]').attr('content')
  if (msColor && isValidColor(msColor)) {
    colors.secondary = msColor
  }

  if (Object.keys(colors).length > 0) {
    result.colors = colors
  }

  // Social links
  const socialLinks: Record<string, string> = {}
  const socialPatterns = [
    { name: 'twitter', patterns: ['twitter.com', 'x.com'] },
    { name: 'facebook', patterns: ['facebook.com', 'fb.com'] },
    { name: 'linkedin', patterns: ['linkedin.com'] },
    { name: 'instagram', patterns: ['instagram.com'] },
    { name: 'youtube', patterns: ['youtube.com', 'youtu.be'] },
    { name: 'github', patterns: ['github.com'] },
  ]

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return

    for (const social of socialPatterns) {
      if (social.patterns.some(p => href.includes(p)) && !socialLinks[social.name]) {
        socialLinks[social.name] = href
      }
    }
  })

  if (Object.keys(socialLinks).length > 0) {
    result.social_links = socialLinks
  }

  return result
}

/**
 * Extract company name from page title
 */
function extractFromTitle(title: string): string | null {
  if (!title) return null

  // Common patterns: "Company Name - Tagline" or "Tagline | Company Name"
  const separators = [' | ', ' - ', ' – ', ' — ', ' : ']

  for (const sep of separators) {
    if (title.includes(sep)) {
      const parts = title.split(sep)
      // Usually company name is first or last
      const first = parts[0].trim()
      const last = parts[parts.length - 1].trim()

      // Prefer shorter part as company name
      if (first.length <= last.length && first.length <= 30) {
        return first
      }
      if (last.length <= 30) {
        return last
      }
    }
  }

  // Just use the title if short enough
  if (title.length <= 40) {
    return title.trim()
  }

  return null
}

/**
 * Check if a string is a valid CSS color
 */
function isValidColor(color: string): boolean {
  return /^#([0-9A-Fa-f]{3}){1,2}$/.test(color) ||
         /^rgb\(/.test(color) ||
         /^rgba\(/.test(color)
}

/**
 * Get cleaned page text for LLM analysis
 */
function getPageText($: cheerio.CheerioAPI): string {
  // Remove scripts, styles, and hidden elements
  $('script, style, noscript, iframe, svg, nav, footer, header').remove()

  // Get text content
  let text = $('body').text()

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim()

  // Truncate to ~4000 chars
  if (text.length > 4000) {
    text = text.slice(0, 4000) + '...'
  }

  return text
}

/**
 * Use LLM to extract deeper brand insights
 */
async function extractWithLlm(pageText: string): Promise<Partial<ExtractedBrand>> {
  if (!pageText || pageText.length < 50) {
    return {}
  }

  const prompt = `Analyze this website content and extract the following information. Return ONLY valid JSON with no additional text.

{
  "business_name": "The company or business name",
  "description": "A 2-3 sentence summary of what this company does",
  "value_proposition": "What makes them unique or their main selling point",
  "target_audience": "Who their ideal customers are",
  "industry": "Their industry category (e.g., 'SaaS', 'E-commerce', 'Healthcare', 'Finance', 'AI/ML')"
}

Website content:
---
${pageText}
---

Return ONLY the JSON object, no markdown code blocks or other text.`

  const result = await openrouter.complete(prompt, undefined, {
    temperature: 0.3,
    maxTokens: 500,
  })

  // Parse the JSON response
  const content = result.content.trim()

  // Try to extract JSON from the response
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.warn('[Brain] No JSON found in LLM response')
    return {}
  }

  try {
    const parsed = JSON.parse(jsonMatch[0])
    return {
      business_name: typeof parsed.business_name === 'string' ? parsed.business_name : null,
      description: typeof parsed.description === 'string' ? parsed.description : null,
      value_proposition: typeof parsed.value_proposition === 'string' ? parsed.value_proposition : null,
      target_audience: typeof parsed.target_audience === 'string' ? parsed.target_audience : null,
      industry: typeof parsed.industry === 'string' ? parsed.industry : null,
    }
  } catch {
    console.warn('[Brain] Failed to parse LLM JSON response')
    return {}
  }
}

/**
 * Create an empty extracted object
 */
function createEmptyExtracted(): ExtractedBrand {
  return {
    business_name: null,
    website: null,
    tagline: null,
    colors: null,
    social_links: null,
    description: null,
    value_proposition: null,
    target_audience: null,
    industry: null,
  }
}

export { brainRouter }
