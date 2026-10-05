ALTER TABLE group_invitations DROP CONSTRAINT IF EXISTS group_invitations_status_check;
ALTER TABLE group_invitations
  ADD CONSTRAINT group_invitations_status_check
  CHECK (status IN ('pending', 'accepted', 'declined', 'revoked'));

CREATE TABLE IF NOT EXISTS social_outbox (
  id UUID PRIMARY KEY,
  event JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_until TIMESTAMPTZ,
  lease_token UUID,
  published_at TIMESTAMPTZ,
  dead_at TIMESTAMPTZ,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS social_outbox_publish_idx
  ON social_outbox (published_at, dead_at, available_at, created_at, id);
