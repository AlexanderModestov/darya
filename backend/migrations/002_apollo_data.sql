-- Add JSONB column to store full Apollo.io enrichment response
ALTER TABLE leads ADD COLUMN IF NOT EXISTS apollo_data JSONB;
