-- Replace settings.product (per-user "Product Prompt" for email generation)
-- with a dedicated table, then drop the now-unused settings table
-- (API keys and persona config moved to .env — see backend/.env.example).

CREATE TABLE IF NOT EXISTS product_profile (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Carry over any existing product prompts before dropping settings.
-- Guarded so this migration is safe to re-run after settings no longer exists
-- (migrate.js re-applies every .sql file on every deploy).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'settings') THEN
    INSERT INTO product_profile (user_id, data)
    SELECT user_id, product FROM settings
    WHERE product IS NOT NULL AND product::text <> '{}'
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;

DROP TABLE IF EXISTS settings;
