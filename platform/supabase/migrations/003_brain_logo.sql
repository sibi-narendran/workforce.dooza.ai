-- Add logo_url column to brain_brand
ALTER TABLE brain_brand ADD COLUMN IF NOT EXISTS logo_url TEXT;
