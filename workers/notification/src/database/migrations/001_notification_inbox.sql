CREATE TABLE IF NOT EXISTS notification_inbox (event_id UUID PRIMARY KEY, received_at TIMESTAMPTZ NOT NULL DEFAULT now(), event JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS notification_jobs (
  delivery_id TEXT PRIMARY KEY, event_id UUID NOT NULL UNIQUE REFERENCES notification_inbox(event_id), owner_id UUID NOT NULL,
  type TEXT NOT NULL, payload JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(), lease_until TIMESTAMPTZ, lease_token TEXT,
  last_error TEXT, provider_id TEXT UNIQUE
);
