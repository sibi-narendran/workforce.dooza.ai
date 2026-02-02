import { Hono } from 'hono'
import { db } from '../../db/client.js'
import { brainFiles } from '../../db/schema.js'
import { eq, and, ilike, or, desc } from 'drizzle-orm'
import * as storage from '../../lib/brain-storage.js'

const app = new Hono()

/**
 * POST /upload - Upload a file
 */
app.post('/upload', async (c) => {
  try {
    const formData = await c.req.formData()
    const tenantId = formData.get('tenantId') as string
    const file = formData.get('file') as File
    const category = (formData.get('category') as string) || 'general'
    const description = formData.get('description') as string | null

    if (!tenantId || !file) {
      return c.json({ error: 'tenantId and file required' }, 400)
    }

    // Upload to Supabase Storage
    const { path, url } = await storage.uploadFile(
      tenantId,
      file.name,
      await file.arrayBuffer(),
      { category: category as storage.FileCategory, mimeType: file.type }
    )

    // Save metadata to database
    const [record] = await db.insert(brainFiles).values({
      tenantId,
      fileName: file.name,
      filePath: path,
      mimeType: file.type || null,
      fileSize: file.size,
      category,
      description,
    }).returning()

    return c.json({ success: true, file: record, url })
  } catch (error) {
    console.error('[Brain Storage] Upload error:', error)
    return c.json({
      error: 'Upload failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

/**
 * GET /files - List files for tenant
 */
app.get('/files', async (c) => {
  const tenantId = c.req.query('tenantId')
  const category = c.req.query('category')
  const search = c.req.query('search')
  const limit = parseInt(c.req.query('limit') || '50')

  if (!tenantId) {
    return c.json({ error: 'tenantId required' }, 400)
  }

  try {
    let conditions = [eq(brainFiles.tenantId, tenantId)]

    if (category) {
      conditions.push(eq(brainFiles.category, category))
    }

    if (search) {
      conditions.push(
        or(
          ilike(brainFiles.fileName, `%${search}%`),
          ilike(brainFiles.description, `%${search}%`)
        )!
      )
    }

    const files = await db
      .select()
      .from(brainFiles)
      .where(and(...conditions))
      .orderBy(desc(brainFiles.createdAt))
      .limit(limit)

    return c.json({ files })
  } catch (error) {
    console.error('[Brain Storage] List error:', error)
    return c.json({ error: 'Failed to list files' }, 500)
  }
})

/**
 * GET /file/:id - Get file details with signed URL
 */
app.get('/file/:id', async (c) => {
  const fileId = c.req.param('id')
  const tenantId = c.req.query('tenantId')

  if (!tenantId) {
    return c.json({ error: 'tenantId required' }, 400)
  }

  try {
    const [file] = await db
      .select()
      .from(brainFiles)
      .where(and(
        eq(brainFiles.id, fileId),
        eq(brainFiles.tenantId, tenantId)
      ))

    if (!file) {
      return c.json({ error: 'File not found' }, 404)
    }

    const url = await storage.getSignedUrl(tenantId, file.filePath)

    return c.json({ file, url })
  } catch (error) {
    console.error('[Brain Storage] Get file error:', error)
    return c.json({ error: 'Failed to get file' }, 500)
  }
})

/**
 * GET /download/:id - Download file content
 */
app.get('/download/:id', async (c) => {
  const fileId = c.req.param('id')
  const tenantId = c.req.query('tenantId')

  if (!tenantId) {
    return c.json({ error: 'tenantId required' }, 400)
  }

  try {
    const [file] = await db
      .select()
      .from(brainFiles)
      .where(and(
        eq(brainFiles.id, fileId),
        eq(brainFiles.tenantId, tenantId)
      ))

    if (!file) {
      return c.json({ error: 'File not found' }, 404)
    }

    const blob = await storage.downloadFile(tenantId, file.filePath)

    return new Response(blob, {
      headers: {
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${file.fileName}"`,
      },
    })
  } catch (error) {
    console.error('[Brain Storage] Download error:', error)
    return c.json({ error: 'Failed to download file' }, 500)
  }
})

/**
 * DELETE /file/:id - Delete a file
 */
app.delete('/file/:id', async (c) => {
  const fileId = c.req.param('id')
  const tenantId = c.req.query('tenantId')

  if (!tenantId) {
    return c.json({ error: 'tenantId required' }, 400)
  }

  try {
    const [file] = await db
      .select()
      .from(brainFiles)
      .where(and(
        eq(brainFiles.id, fileId),
        eq(brainFiles.tenantId, tenantId)
      ))

    if (!file) {
      return c.json({ error: 'File not found' }, 404)
    }

    // Delete from storage
    await storage.deleteFile(tenantId, file.filePath)

    // Delete from database
    await db.delete(brainFiles).where(eq(brainFiles.id, fileId))

    return c.json({ success: true })
  } catch (error) {
    console.error('[Brain Storage] Delete error:', error)
    return c.json({ error: 'Failed to delete file' }, 500)
  }
})

/**
 * GET /health - Health check
 */
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'brain-storage' })
})

export default app
