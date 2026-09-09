-- Ledger-owned projections and transactional domain outbox.
ALTER TABLE IF EXISTS ledger_outbox ADD COLUMN IF NOT EXISTS dead_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS ledger_pair_balances (
  user_id UUID NOT NULL,
  counterparty_id UUID NOT NULL,
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  net_minor NUMERIC(30,0) NOT NULL,
  PRIMARY KEY (user_id, counterparty_id, currency)
);

CREATE TABLE IF NOT EXISTS ledger_group_balances (
  group_id UUID NOT NULL,
  user_id UUID NOT NULL,
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  net_minor NUMERIC(30,0) NOT NULL,
  PRIMARY KEY (group_id, user_id, currency)
);

CREATE TABLE IF NOT EXISTS ledger_outbox (
  id UUID PRIMARY KEY,
  event_version INTEGER NOT NULL CHECK (event_version = 1),
  event_type TEXT NOT NULL CHECK (event_type IN ('expense.created','expense.updated','expense.deleted')),
  occurred_at TIMESTAMPTZ NOT NULL,
  owner_id UUID NOT NULL,
  correlation_id TEXT NOT NULL,
  producer TEXT NOT NULL CHECK (producer = 'ledger'),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until TIMESTAMPTZ,
  lease_token TEXT,
  last_error TEXT,
  dead_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ledger_outbox_owner_cursor_idx
  ON ledger_outbox(owner_id, occurred_at, id);
CREATE INDEX IF NOT EXISTS ledger_outbox_publish_idx
  ON ledger_outbox(published_at, available_at, occurred_at, id);
