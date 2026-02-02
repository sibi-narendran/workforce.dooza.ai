/**
 * Setup Brain Storage - Run once to configure Supabase
 *
 * Usage: pnpm setup:brain
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
  console.log('🧠 Setting up Brain Storage...\n')

  // 1. Create bucket
  console.log('1. Creating "brain" bucket...')
  const { error: bucketError } = await supabase.storage.createBucket('brain', {
    public: false,
    fileSizeLimit: null, // No limit
    allowedMimeTypes: null, // All types allowed
  })

  if (bucketError) {
    if (bucketError.message.includes('already exists')) {
      console.log('   ✓ Bucket already exists')
    } else {
      console.error('   ✗ Error:', bucketError.message)
      process.exit(1)
    }
  } else {
    console.log('   ✓ Bucket created')
  }

  // 2. Print manual SQL for RLS policies
  console.log('\n2. Storage RLS policies need to be created manually.')
  console.log('   Copy and run the following SQL in Supabase SQL Editor:')
  console.log('─'.repeat(60))
  console.log(`
-- Enable RLS on storage.objects (if not already)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy: Tenant can INSERT to their folder
CREATE POLICY "brain_tenant_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'brain' AND
  (storage.foldername(name))[1] = (
    SELECT tenant_id::text FROM profiles WHERE id = auth.uid()
  )
);

-- Policy: Tenant can SELECT from their folder
CREATE POLICY "brain_tenant_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'brain' AND
  (storage.foldername(name))[1] = (
    SELECT tenant_id::text FROM profiles WHERE id = auth.uid()
  )
);

-- Policy: Tenant can UPDATE in their folder
CREATE POLICY "brain_tenant_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'brain' AND
  (storage.foldername(name))[1] = (
    SELECT tenant_id::text FROM profiles WHERE id = auth.uid()
  )
);

-- Policy: Tenant can DELETE from their folder
CREATE POLICY "brain_tenant_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'brain' AND
  (storage.foldername(name))[1] = (
    SELECT tenant_id::text FROM profiles WHERE id = auth.uid()
  )
);

-- Policy: Service role has full access (for backend)
CREATE POLICY "brain_service_role_all" ON storage.objects
FOR ALL TO service_role
USING (bucket_id = 'brain')
WITH CHECK (bucket_id = 'brain');
  `)
  console.log('─'.repeat(60))

  console.log('\n✅ Brain Storage bucket setup complete!')
  console.log('\nNext steps:')
  console.log('  1. Run: pnpm db:push (to create brain_files table)')
  console.log('  2. Copy SQL above to Supabase SQL Editor and run')
  console.log('  3. Test with: curl http://localhost:3000/api/internal/brain-storage/health')
}

setup().catch(console.error)
