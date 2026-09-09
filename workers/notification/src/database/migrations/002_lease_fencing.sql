ALTER TABLE notification_jobs ADD COLUMN IF NOT EXISTS lease_token TEXT;
