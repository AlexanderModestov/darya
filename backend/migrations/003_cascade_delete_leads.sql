-- Change emails.lead_id and inbox.lead_id from ON DELETE SET NULL to ON DELETE CASCADE
-- When a lead is deleted, its emails and inbox entries are also deleted

ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_lead_id_fkey;
ALTER TABLE emails ADD CONSTRAINT emails_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE inbox DROP CONSTRAINT IF EXISTS inbox_lead_id_fkey;
ALTER TABLE inbox ADD CONSTRAINT inbox_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
