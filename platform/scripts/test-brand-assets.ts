/**
 * Test Brand Assets Plugin — Supabase Data Layer
 *
 * Tests the PostgREST + Storage operations that the brand-assets plugin
 * (clawdbot/extensions/brand-assets/index.ts) uses at runtime.
 *
 * Usage: cd platform && pnpm exec tsx --env-file=.env scripts/test-brand-assets.ts
 */

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY. Run with --env-file=.env')
  process.exit(1)
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

let passed = 0
let failed = 0

function pass(name: string) {
  passed++
  console.log(`   ✅ PASS`)
}
function fail(name: string, reason: string) {
  failed++
  console.log(`   ❌ FAIL — ${reason}`)
}

// 1x1 transparent PNG (68 bytes)
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

async function run() {
  console.log('🧪 Brand Assets Plugin — Data Layer Tests\n')
  console.log('─'.repeat(55))

  // Find a test tenant
  const tenantRes = await fetch(`${SUPABASE_URL}/rest/v1/tenants?limit=1&select=id,name`, { headers })
  const tenants = (await tenantRes.json()) as Array<{ id: string; name: string }>
  if (!tenants.length) {
    console.error('No tenants found. Create one first.')
    process.exit(1)
  }
  const tenantId = tenants[0].id
  console.log(`Using tenant: ${tenants[0].name} (${tenantId})\n`)

  // ── Test 1: Supabase connectivity ────────────────────────────────
  console.log('📋 Test 1: Supabase PostgREST connectivity')
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/brain_brand?limit=1`, { headers })
    console.log(`   Status: ${res.status}`)
    if (res.ok) pass('connectivity')
    else fail('connectivity', `HTTP ${res.status}`)
  } catch (e) {
    fail('connectivity', String(e))
  }

  // ── Test 2: Ensure brand profile exists (upsert or verify existing) ──
  console.log('\n📋 Test 2: Ensure brand profile exists')
  try {
    // First check if a profile already exists
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/brain_brand?tenant_id=eq.${tenantId}&limit=1`,
      { headers }
    )
    const existing = (await checkRes.json()) as Array<Record<string, unknown>>

    if (existing.length > 0) {
      console.log(`   Brand profile already exists: ${existing[0].business_name}`)
      console.log(`   (Skipping seed — using existing data)`)
      pass('brand profile exists')
    } else {
      // Seed a new one
      const res = await fetch(`${SUPABASE_URL}/rest/v1/brain_brand`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          tenant_id: tenantId,
          business_name: 'Test Brand Co',
          tagline: 'Testing made beautiful',
          primary_color: '#FF6B35',
          secondary_color: '#004E89',
          industry: 'Technology',
          target_audience: 'Developers',
          description: 'A test brand for verifying the brand-assets plugin.',
          value_proposition: 'Best testing ever',
        }),
      })
      const data = await res.json()
      console.log(`   Status: ${res.status}`)
      console.log(`   Brand: ${Array.isArray(data) ? data[0]?.business_name : data?.business_name}`)
      if (res.ok) pass('seed brand')
      else fail('seed brand', `HTTP ${res.status}: ${JSON.stringify(data)}`)
    }
  } catch (e) {
    fail('brand profile', String(e))
  }

  // ── Test 3: Read brand profile ───────────────────────────────────
  console.log('\n📋 Test 3: Read brand profile via PostgREST')
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/brain_brand?tenant_id=eq.${tenantId}&limit=1`,
      { headers }
    )
    const rows = (await res.json()) as Array<Record<string, unknown>>
    console.log(`   Status: ${res.status}`)
    console.log(`   Business name: ${rows[0]?.business_name}`)
    console.log(`   Primary color: ${rows[0]?.primary_color}`)
    if (res.ok && rows.length > 0 && rows[0].business_name)
      pass('read brand')
    else fail('read brand', 'No brand profile found')
  } catch (e) {
    fail('read brand', String(e))
  }

  // ── Test 4: Upload test image ────────────────────────────────────
  const storagePath = `${tenantId}/test-logo.png`
  console.log('\n📋 Test 4: Upload test image to brain storage')
  try {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/brain/${storagePath}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'image/png',
        },
        body: TINY_PNG,
      }
    )
    const data = await res.json()
    console.log(`   Status: ${res.status}`)
    // 200 = created, 409 = already exists (both OK for this test)
    if (res.ok || res.status === 409) pass('upload image')
    else fail('upload image', `HTTP ${res.status}: ${JSON.stringify(data)}`)
  } catch (e) {
    fail('upload image', String(e))
  }

  // ── Test 5: Seed brain_item ──────────────────────────────────────
  let testItemId: string | null = null
  console.log('\n📋 Test 5: Seed brain_item record')
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/brain_items`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        tenant_id: tenantId,
        type: 'image',
        title: 'Test Logo',
        file_name: 'test-logo.png',
        file_path: storagePath,
        mime_type: 'image/png',
        file_size: TINY_PNG.byteLength,
      }),
    })
    const data = (await res.json()) as Array<{ id: string }>
    console.log(`   Status: ${res.status}`)
    if (res.ok && data.length > 0) {
      testItemId = data[0].id
      console.log(`   Item ID: ${testItemId}`)
      pass('seed brain_item')
    } else {
      fail('seed brain_item', `HTTP ${res.status}: ${JSON.stringify(data)}`)
    }
  } catch (e) {
    fail('seed brain_item', String(e))
  }

  // ── Test 6: List brain items ─────────────────────────────────────
  console.log('\n📋 Test 6: List brain items')
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/brain_items?tenant_id=eq.${tenantId}&order=created_at.desc`,
      { headers }
    )
    const rows = (await res.json()) as Array<Record<string, unknown>>
    console.log(`   Status: ${res.status}`)
    console.log(`   Items: ${rows.length}`)
    if (res.ok && rows.length > 0) pass('list items')
    else fail('list items', 'No items returned')
  } catch (e) {
    fail('list items', String(e))
  }

  // ── Test 7: Download image ───────────────────────────────────────
  console.log('\n📋 Test 7: Download image from storage')
  try {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/authenticated/brain/${storagePath}`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      }
    )
    console.log(`   Status: ${res.status}`)
    if (res.ok) {
      const buf = await res.arrayBuffer()
      console.log(`   Size: ${buf.byteLength} bytes`)
      pass('download image')
    } else {
      fail('download image', `HTTP ${res.status}`)
    }
  } catch (e) {
    fail('download image', String(e))
  }

  // ── Test 8: Create signed URL ────────────────────────────────────
  let signedUrl: string | null = null
  console.log('\n📋 Test 8: Create signed URL')
  try {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/brain/${storagePath}`,
      {
        method: 'POST',
        headers: {
          ...headers,
        },
        body: JSON.stringify({ expiresIn: 3600 }),
      }
    )
    const data = (await res.json()) as { signedURL?: string }
    console.log(`   Status: ${res.status}`)
    if (res.ok && data.signedURL) {
      signedUrl = `${SUPABASE_URL}/storage/v1${data.signedURL}`
      console.log(`   Signed URL: ${signedUrl.slice(0, 80)}...`)
      pass('signed URL')
    } else {
      fail('signed URL', `HTTP ${res.status}: ${JSON.stringify(data)}`)
    }
  } catch (e) {
    fail('signed URL', String(e))
  }

  // ── Test 9: Download via signed URL ──────────────────────────────
  console.log('\n📋 Test 9: Download via signed URL')
  if (signedUrl) {
    try {
      const res = await fetch(signedUrl)
      console.log(`   Status: ${res.status}`)
      if (res.ok) {
        const buf = await res.arrayBuffer()
        console.log(`   Size: ${buf.byteLength} bytes`)
        pass('signed URL download')
      } else {
        fail('signed URL download', `HTTP ${res.status}`)
      }
    } catch (e) {
      fail('signed URL download', String(e))
    }
  } else {
    fail('signed URL download', 'No signed URL from test 8')
  }

  // ── Test 10: Cleanup ─────────────────────────────────────────────
  console.log('\n📋 Test 10: Cleanup (delete test item + storage object)')
  try {
    // Delete brain_item
    if (testItemId) {
      const delRes = await fetch(
        `${SUPABASE_URL}/rest/v1/brain_items?id=eq.${testItemId}`,
        { method: 'DELETE', headers }
      )
      console.log(`   Delete brain_item: ${delRes.status}`)
    }

    // Delete storage object
    const delStorage = await fetch(
      `${SUPABASE_URL}/storage/v1/object/brain/${storagePath}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      }
    )
    console.log(`   Delete storage: ${delStorage.status}`)
    console.log(`   (Brand profile kept for future use)`)
    pass('cleanup')
  } catch (e) {
    fail('cleanup', String(e))
  }

  // ── Summary ──────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(55))
  console.log(`🏁 Results: ${passed} passed, ${failed} failed out of ${passed + failed}`)
  if (failed > 0) process.exit(1)
}

run().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
