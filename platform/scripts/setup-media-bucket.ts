/**
 * Setup Media Bucket - Run once to configure Supabase Storage for generated images
 *
 * Usage: npx tsx platform/scripts/setup-media-bucket.ts
 *
 * Requires env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function setup() {
  console.log('Setting up Media Storage bucket...\n')

  // 1. Create public bucket for generated images
  console.log('1. Creating "media" bucket (public)...')
  const { error: bucketError } = await supabase.storage.createBucket('media', {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  })

  if (bucketError) {
    if (bucketError.message.includes('already exists')) {
      console.log('   Bucket already exists')
    } else {
      console.error('   Error:', bucketError.message)
      process.exit(1)
    }
  } else {
    console.log('   Bucket created')
  }

  // 2. Print manual SQL for RLS policies
  console.log('\n2. Storage RLS policies (run in Supabase SQL Editor):')
  console.log('-'.repeat(60))
  console.log(`
-- Service role has full access (backend uploads via gateway)
CREATE POLICY "media_service_role_all" ON storage.objects
FOR ALL TO service_role
USING (bucket_id = 'media')
WITH CHECK (bucket_id = 'media');

-- Public read access (bucket is public, but explicit policy)
CREATE POLICY "media_public_read" ON storage.objects
FOR SELECT TO anon
USING (bucket_id = 'media');
  `)
  console.log('-'.repeat(60))

  console.log('\nMedia Storage bucket setup complete!')
  console.log('\nNext steps:')
  console.log('  1. Copy SQL above to Supabase SQL Editor and run')
  console.log('  2. Restart gateway: pnpm pm2 restart gateway')
  console.log('  3. Test image generation — URLs should be public Supabase URLs')
}

setup().catch(console.error)
