CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL,
  payer_id UUID NOT NULL,
  amount_minor NUMERIC(30,0) NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  description TEXT NOT NULL DEFAULT '',
  category_id TEXT,
  category_kind TEXT CHECK (category_kind IN ('standard', 'custom')),
  friend_id UUID,
  group_id UUID,
  trip_id UUID,
  state TEXT NOT NULL CHECK (state IN ('ACTIVE','UPDATED','DELETED')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expenses_owner_created_idx ON expenses(owner_id, created_at);
CREATE INDEX IF NOT EXISTS expenses_group_idx ON expenses(group_id, created_at);
CREATE TABLE IF NOT EXISTS expense_participants (
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  share_minor NUMERIC(30,0) NOT NULL CHECK (share_minor >= 0),
  PRIMARY KEY (expense_id, user_id)
);
CREATE TABLE IF NOT EXISTS expense_history (
  id UUID PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  changed_by UUID NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expense_history_expense_idx ON expense_history(expense_id, version);
CREATE TABLE IF NOT EXISTS ledger_categories (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  standard BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_id, name)
);
CREATE TABLE IF NOT EXISTS ledger_idempotency_keys (
  owner_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id, idempotency_key)
);
