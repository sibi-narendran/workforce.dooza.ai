/**
 * Test Brain Storage API
 *
 * Usage: pnpm exec tsx --env-file=.env scripts/test-brain-storage.ts
 */
import { createClient } from '@supabase/supabase-js'

const API_BASE = 'http://localhost:3000/api/internal/brain-storage'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function runTests() {
  console.log('🧪 Brain Storage API Tests\n')
  console.log('─'.repeat(50))

  // Get or create a test tenant
  let tenantId: string

  // Try to get existing tenant
  const { data: existingTenant } = await supabase
    .from('tenants')
    .select('id, name')
    .limit(1)
    .single()

  if (existingTenant) {
    tenantId = existingTenant.id
    console.log(`Using existing tenant: ${existingTenant.name} (${tenantId})`)
  } else {
    // Create a test tenant
    const { data: newTenant, error } = await supabase
      .from('tenants')
      .insert({
        name: 'Test Tenant',
        slug: 'test-tenant-' + Date.now(),
        owner_id: '00000000-0000-0000-0000-000000000000'
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create test tenant:', error.message)
      process.exit(1)
    }
    tenantId = newTenant.id
    console.log(`Created test tenant: ${tenantId}`)
  }

  console.log('─'.repeat(50))

  // Test 1: Health Check
  console.log('\n📋 Test 1: Health Check')
  const healthRes = await fetch(`${API_BASE}/health`)
  const health = await healthRes.json()
  console.log(`   Status: ${healthRes.status}`)
  console.log(`   Response:`, health)
  console.log(`   ${health.status === 'ok' ? '✅ PASS' : '❌ FAIL'}`)

  // Test 2: List files (should be empty initially)
  console.log('\n📋 Test 2: List Files (empty)')
  const listRes = await fetch(`${API_BASE}/files?tenantId=${tenantId}`)
  const list = await listRes.json()
  console.log(`   Status: ${listRes.status}`)
  console.log(`   Files count: ${list.files?.length || 0}`)
  console.log(`   ${listRes.status === 200 ? '✅ PASS' : '❌ FAIL'}`)

  // Test 3: Upload a file
  console.log('\n📋 Test 3: Upload File')
  const formData = new FormData()
  formData.append('tenantId', tenantId)
  formData.append('file', new Blob(['Test content for brain storage\nLine 2\nLine 3'], { type: 'text/plain' }), 'test-file.txt')
  formData.append('category', 'document')
  formData.append('description', 'Test file for brain storage API')

  const uploadRes = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData
  })
  const upload = await uploadRes.json()
  console.log(`   Status: ${uploadRes.status}`)
  if (upload.file) {
    console.log(`   File ID: ${upload.file.id}`)
    console.log(`   File Path: ${upload.file.filePath}`)
    console.log(`   Has URL: ${!!upload.url}`)
  } else {
    console.log(`   Error: ${upload.error} - ${upload.message}`)
  }
  console.log(`   ${upload.success ? '✅ PASS' : '❌ FAIL'}`)

  const fileId = upload.file?.id

  if (fileId) {
    // Test 4: List files (should have 1)
    console.log('\n📋 Test 4: List Files (after upload)')
    const list2Res = await fetch(`${API_BASE}/files?tenantId=${tenantId}`)
    const list2 = await list2Res.json()
    console.log(`   Status: ${list2Res.status}`)
    console.log(`   Files count: ${list2.files?.length || 0}`)
    console.log(`   ${list2.files?.length === 1 ? '✅ PASS' : '❌ FAIL'}`)

    // Test 5: Get file details
    console.log('\n📋 Test 5: Get File Details')
    const getRes = await fetch(`${API_BASE}/file/${fileId}?tenantId=${tenantId}`)
    const getFile = await getRes.json()
    console.log(`   Status: ${getRes.status}`)
    console.log(`   File Name: ${getFile.file?.fileName}`)
    console.log(`   Has Signed URL: ${!!getFile.url}`)
    console.log(`   ${getRes.status === 200 ? '✅ PASS' : '❌ FAIL'}`)

    // Test 6: Download file
    console.log('\n📋 Test 6: Download File')
    const downloadRes = await fetch(`${API_BASE}/download/${fileId}?tenantId=${tenantId}`)
    const content = await downloadRes.text()
    console.log(`   Status: ${downloadRes.status}`)
    console.log(`   Content Type: ${downloadRes.headers.get('content-type')}`)
    console.log(`   Content Length: ${content.length} bytes`)
    console.log(`   Content Preview: "${content.substring(0, 30)}..."`)
    console.log(`   ${downloadRes.status === 200 ? '✅ PASS' : '❌ FAIL'}`)

    // Test 7: Search files
    console.log('\n📋 Test 7: Search Files')
    const searchRes = await fetch(`${API_BASE}/files?tenantId=${tenantId}&search=test`)
    const search = await searchRes.json()
    console.log(`   Status: ${searchRes.status}`)
    console.log(`   Files found: ${search.files?.length || 0}`)
    console.log(`   ${search.files?.length > 0 ? '✅ PASS' : '❌ FAIL'}`)

    // Test 8: Filter by category
    console.log('\n📋 Test 8: Filter by Category')
    const catRes = await fetch(`${API_BASE}/files?tenantId=${tenantId}&category=document`)
    const cat = await catRes.json()
    console.log(`   Status: ${catRes.status}`)
    console.log(`   Document files: ${cat.files?.length || 0}`)
    console.log(`   ${cat.files?.length > 0 ? '✅ PASS' : '❌ FAIL'}`)

    // Test 9: Delete file
    console.log('\n📋 Test 9: Delete File')
    const deleteRes = await fetch(`${API_BASE}/file/${fileId}?tenantId=${tenantId}`, {
      method: 'DELETE'
    })
    const deleteResult = await deleteRes.json()
    console.log(`   Status: ${deleteRes.status}`)
    console.log(`   Success: ${deleteResult.success}`)
    console.log(`   ${deleteResult.success ? '✅ PASS' : '❌ FAIL'}`)

    // Test 10: List files (should be empty again)
    console.log('\n📋 Test 10: List Files (after delete)')
    const list3Res = await fetch(`${API_BASE}/files?tenantId=${tenantId}`)
    const list3 = await list3Res.json()
    console.log(`   Status: ${list3Res.status}`)
    console.log(`   Files count: ${list3.files?.length || 0}`)
    console.log(`   ${list3.files?.length === 0 ? '✅ PASS' : '❌ FAIL'}`)
  }

  console.log('\n' + '─'.repeat(50))
  console.log('🏁 Tests complete!')
}

runTests().catch(console.error)
