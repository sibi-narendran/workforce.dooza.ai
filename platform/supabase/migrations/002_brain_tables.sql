-- Brain Brand (single row per tenant for brand identity)
CREATE TABLE IF NOT EXISTS brain_brand (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  business_name TEXT,
  website TEXT,
  tagline TEXT,
  industry TEXT,
  target_audience TEXT,
  description TEXT,
  value_proposition TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  social_links JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Brain Items (uploaded files for LLM access)
CREATE TABLE IF NOT EXISTS brain_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'image', 'video', 'document', 'file'
  title TEXT NOT NULL, -- user-provided name for LLM retrieval
  file_name TEXT NOT NULL, -- original file name
  file_path TEXT NOT NULL, -- path in brain bucket
  mime_type TEXT,
  file_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_brain_brand_tenant ON brain_brand(tenant_id);
CREATE INDEX IF NOT EXISTS idx_brain_items_tenant ON brain_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_brain_items_type ON brain_items(tenant_id, type);

-- Row Level Security (RLS)
ALTER TABLE brain_brand ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_items ENABLE ROW LEVEL SECURITY;

-- Brain brand policies
CREATE POLICY "Users can view own tenant brand" ON brain_brand
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert own tenant brand" ON brain_brand
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can update own tenant brand" ON brain_brand
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- Brain items policies
CREATE POLICY "Users can view own tenant items" ON brain_items
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert own tenant items" ON brain_items
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can delete own tenant items" ON brain_items
  FOR DELETE USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- Grant permissions for service role (API server)
GRANT ALL ON brain_brand TO service_role;
GRANT ALL ON brain_items TO service_role;
