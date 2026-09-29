ALTER TABLE notification_jobs DROP CONSTRAINT IF EXISTS notification_jobs_event_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS notification_jobs_event_recipient_unique_idx
  ON notification_jobs (event_id, owner_id);
