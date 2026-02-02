import { supabaseAdmin } from './supabase.js'

const BUCKET = 'brain'

// Categories for organizing files
export const FILE_CATEGORIES = ['document', 'image', 'report', 'export', 'general'] as const
export type FileCategory = typeof FILE_CATEGORIES[number]

/**
 * Upload a file to tenant's storage
 */
export async function uploadFile(
  tenantId: string,
  fileName: string,
  fileData: Buffer | Blob | ArrayBuffer,
  options: {
    category?: FileCategory
    mimeType?: string
    upsert?: boolean
  } = {}
): Promise<{ path: string; url: string }> {
  const { category = 'general', mimeType, upsert = true } = options
  const filePath = `${tenantId}/${category}/${fileName}`

  const { data, error } = await supabaseAdmin!.storage
    .from(BUCKET)
    .upload(filePath, fileData, {
      contentType: mimeType,
      upsert,
    })

  if (error) throw new Error(`Upload failed: ${error.message}`)

  const { data: urlData } = await supabaseAdmin!.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 3600) // 1 hour

  return {
    path: data.path,
    url: urlData?.signedUrl || ''
  }
}

/**
 * Download a file (returns Blob)
 */
export async function downloadFile(
  tenantId: string,
  filePath: string
): Promise<Blob> {
  // Security: verify tenant owns path
  if (!filePath.startsWith(`${tenantId}/`)) {
    throw new Error('Access denied: path does not belong to tenant')
  }

  const { data, error } = await supabaseAdmin!.storage
    .from(BUCKET)
    .download(filePath)

  if (error) throw new Error(`Download failed: ${error.message}`)
  return data
}

/**
 * Get a signed URL for a file
 */
export async function getSignedUrl(
  tenantId: string,
  filePath: string,
  expiresIn: number = 3600
): Promise<string> {
  if (!filePath.startsWith(`${tenantId}/`)) {
    throw new Error('Access denied')
  }

  const { data, error } = await supabaseAdmin!.storage
    .from(BUCKET)
    .createSignedUrl(filePath, expiresIn)

  if (error) throw new Error(`Failed to get URL: ${error.message}`)
  return data.signedUrl
}

/**
 * Delete a file
 */
export async function deleteFile(
  tenantId: string,
  filePath: string
): Promise<void> {
  if (!filePath.startsWith(`${tenantId}/`)) {
    throw new Error('Access denied')
  }

  const { error } = await supabaseAdmin!.storage
    .from(BUCKET)
    .remove([filePath])

  if (error) throw new Error(`Delete failed: ${error.message}`)
}

/**
 * List files in a folder
 */
export async function listStorageFiles(
  tenantId: string,
  folder?: string
): Promise<Array<{ name: string; size: number; createdAt: string }>> {
  const path = folder ? `${tenantId}/${folder}` : tenantId

  const { data, error } = await supabaseAdmin!.storage
    .from(BUCKET)
    .list(path, { sortBy: { column: 'created_at', order: 'desc' } })

  if (error) throw new Error(`List failed: ${error.message}`)

  return (data || [])
    .filter(f => f.name !== '.emptyFolderPlaceholder')
    .map(f => ({
      name: f.name,
      size: f.metadata?.size || 0,
      createdAt: f.created_at,
    }))
}
