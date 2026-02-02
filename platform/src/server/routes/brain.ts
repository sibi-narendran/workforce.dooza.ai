import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import * as cheerio from 'cheerio'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth.js'
import { tenantDirMiddleware } from '../middleware/tenant.js'
import { openrouter } from '../../lib/openrouter.js'
import { db } from '../../db/client.js'
import { brainBrand, brainItems } from '../../db/schema.js'
import * as storage from '../../lib/brain-storage.js'

const brainRouter = new Hono()

// Apply auth and tenant middleware to all routes
brainRouter.use('*', authMiddleware)
brainRouter.use('*', tenantDirMiddleware)

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
  logo_url: string | null
}

/**
 * Extract logo URL from HTML (prioritized search)
 */
function extractLogoUrl($: cheerio.CheerioAPI, baseUrl: string): string | null {
  const candidates = [
    // Apple touch icon (usually high quality)
    $('link[rel="apple-touch-icon"]').attr('href'),
    $('link[rel="apple-touch-icon-precomposed"]').attr('href'),
    // Open Graph image
    $('meta[property="og:image"]').attr('content'),
    // Twitter image
    $('meta[name="twitter:image"]').attr('content'),
    // Favicon variations
    $('link[rel="icon"][sizes="192x192"]').attr('href'),
    $('link[rel="icon"][sizes="128x128"]').attr('href'),
    $('link[rel="icon"]').attr('href'),
    $('link[rel="shortcut icon"]').attr('href'),
    // Logo in header
    $('header img[class*="logo"], header img[id*="logo"]').attr('src'),
    $('nav img[class*="logo"], nav img[id*="logo"]').attr('src'),
    $('img[class*="logo"]').first().attr('src'),
  ]

  for (const candidate of candidates) {
    if (candidate) {
      // Convert relative URL to absolute
      try {
        return new URL(candidate, baseUrl).href
      } catch {
        continue
      }
    }
  }
  return null
}

/**
 * Download logo and upload to tenant storage
 */
async function downloadAndStoreLogo(
  logoUrl: string,
  tenantId: string
): Promise<string | null> {
  try {
    const response = await fetch(logoUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WorkforceBot/1.0)' },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) return null

    const contentType = response.headers.get('content-type') || 'image/png'
    const buffer = await response.arrayBuffer()

    // Determine file extension
    const ext = contentType.includes('svg') ? 'svg'
      : contentType.includes('png') ? 'png'
      : contentType.includes('gif') ? 'gif'
      : contentType.includes('ico') ? 'ico'
      : contentType.includes('webp') ? 'webp'
      : 'png'

    // Upload to storage (upsert replaces existing)
    const { path } = await storage.uploadFile(
      tenantId,
      `brand-logo.${ext}`,
      buffer,
      { category: 'image', mimeType: contentType, upsert: true }
    )

    return path
  } catch (error) {
    console.warn('[Brain] Failed to download logo:', error)
    return null
  }
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

    // Extract logo URL from HTML
    const tenantId = c.get('tenantId')
    const logoSourceUrl = extractLogoUrl($, url)

    // Download and store logo if found
    let storedLogoPath: string | null = null
    if (logoSourceUrl) {
      storedLogoPath = await downloadAndStoreLogo(logoSourceUrl, tenantId)
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
      logo_url: storedLogoPath,
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
    logo_url: null,
  }
}

// ============================================
// Brand Persistence Endpoints
// ============================================

/**
 * GET /brand - Load brand for tenant
 */
brainRouter.get('/brand', async (c) => {
  const tenantId = c.get('tenantId')

  const [brand] = await db.select().from(brainBrand)
    .where(eq(brainBrand.tenantId, tenantId))
    .limit(1)

  return c.json({ brand: brand || null })
})

/**
 * POST /brand - Save/update brand for tenant
 */
brainRouter.post('/brand', async (c) => {
  const tenantId = c.get('tenantId')
  const body = await c.req.json()

  // Check if brand exists for this tenant
  const [existing] = await db.select().from(brainBrand)
    .where(eq(brainBrand.tenantId, tenantId))
    .limit(1)

  if (existing) {
    // Update existing
    await db.update(brainBrand)
      .set({
        businessName: body.businessName,
        website: body.website,
        tagline: body.tagline,
        industry: body.industry,
        targetAudience: body.targetAudience,
        description: body.description,
        valueProposition: body.valueProposition,
        primaryColor: body.primaryColor,
        secondaryColor: body.secondaryColor,
        socialLinks: body.socialLinks,
        logoUrl: body.logoUrl,
        updatedAt: new Date(),
      })
      .where(eq(brainBrand.tenantId, tenantId))
  } else {
    // Insert new
    await db.insert(brainBrand).values({
      tenantId,
      businessName: body.businessName,
      website: body.website,
      tagline: body.tagline,
      industry: body.industry,
      targetAudience: body.targetAudience,
      description: body.description,
      valueProposition: body.valueProposition,
      primaryColor: body.primaryColor,
      secondaryColor: body.secondaryColor,
      socialLinks: body.socialLinks,
      logoUrl: body.logoUrl,
    })
  }

  return c.json({ success: true })
})

/**
 * GET /logo-url - Get signed URL for tenant's logo
 */
brainRouter.get('/logo-url', async (c) => {
  const tenantId = c.get('tenantId')

  // Get brand to find logo path
  const [brand] = await db.select().from(brainBrand)
    .where(eq(brainBrand.tenantId, tenantId))
    .limit(1)

  if (!brand?.logoUrl) {
    return c.json({ url: null })
  }

  // Get signed URL (1 hour expiry)
  try {
    const signedUrl = await storage.getSignedUrl(tenantId, brand.logoUrl)
    return c.json({ url: signedUrl })
  } catch (error) {
    console.warn('[Brain] Failed to get logo URL:', error)
    return c.json({ url: null })
  }
})

// ============================================
// Brain Items (File Upload) Endpoints
// ============================================

/**
 * GET /items - List items for tenant
 */
brainRouter.get('/items', async (c) => {
  const tenantId = c.get('tenantId')
  const typeFilter = c.req.query('type')

  let items
  if (typeFilter) {
    items = await db.select().from(brainItems)
      .where(and(
        eq(brainItems.tenantId, tenantId),
        eq(brainItems.type, typeFilter)
      ))
      .orderBy(desc(brainItems.createdAt))
  } else {
    items = await db.select().from(brainItems)
      .where(eq(brainItems.tenantId, tenantId))
      .orderBy(desc(brainItems.createdAt))
  }

  return c.json({ items })
})

/**
 * POST /items - Upload a file
 */
brainRouter.post('/items', async (c) => {
  const tenantId = c.get('tenantId')

  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    const title = formData.get('title') as string
    const type = formData.get('type') as string || 'file'

    if (!file) {
      return c.json({ error: 'No file provided' }, 400)
    }

    if (!title?.trim()) {
      return c.json({ error: 'Title is required' }, 400)
    }

    // Determine file category based on mime type
    let category: storage.FileCategory = 'general'
    if (file.type.startsWith('image/')) {
      category = 'image'
    } else if (file.type === 'application/pdf' || file.type.includes('document')) {
      category = 'document'
    }

    // Upload to storage
    const arrayBuffer = await file.arrayBuffer()
    const { path } = await storage.uploadFile(
      tenantId,
      file.name,
      arrayBuffer,
      { category, mimeType: file.type }
    )

    // Save to database
    const [item] = await db.insert(brainItems).values({
      tenantId,
      type,
      title: title.trim(),
      fileName: file.name,
      filePath: path,
      mimeType: file.type,
      fileSize: file.size,
    }).returning()

    return c.json({ success: true, item })
  } catch (error) {
    console.error('[Brain] Upload error:', error)
    return c.json({
      error: error instanceof Error ? error.message : 'Upload failed'
    }, 500)
  }
})

/**
 * DELETE /items/:id - Delete an item
 */
brainRouter.delete('/items/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const id = c.req.param('id')

  // Verify ownership and get file path
  const [item] = await db.select().from(brainItems)
    .where(and(
      eq(brainItems.id, id),
      eq(brainItems.tenantId, tenantId)
    ))

  if (!item) {
    return c.json({ error: 'Not found' }, 404)
  }

  // Delete file from storage
  try {
    await storage.deleteFile(tenantId, item.filePath)
  } catch (error) {
    console.warn('[Brain] Failed to delete storage file:', error)
    // Continue to delete DB record even if storage delete fails
  }

  // Delete from database
  await db.delete(brainItems).where(eq(brainItems.id, id))

  return c.json({ success: true })
})

export { brainRouter }
