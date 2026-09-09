CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS recurring_rules (
  id UUID PRIMARY KEY, owner_id UUID NOT NULL, schedule TEXT NOT NULL, next_run_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 1, disabled_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS recurring_executions (
  idempotency_key TEXT PRIMARY KEY, rule_id UUID NOT NULL, occurrence_at TIMESTAMPTZ NOT NULL,
  payload_snapshot JSONB NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  lease_until TIMESTAMPTZ, lease_token TEXT, last_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS sync_operations (
  owner_id UUID NOT NULL, device_id TEXT NOT NULL, operation_id UUID NOT NULL, payload_hash TEXT NOT NULL,
  request JSONB NOT NULL, status TEXT NOT NULL, receipt JSONB, sequence BIGINT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, lease_until TIMESTAMPTZ, lease_token TEXT,
  last_error TEXT, failure_code TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, device_id, operation_id)
);
CREATE TABLE IF NOT EXISTS sync_device_sequences (
  owner_id UUID NOT NULL, device_id TEXT NOT NULL, next_sequence BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY (owner_id, device_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS sync_operations_one_lease_per_device
  ON sync_operations (owner_id, device_id) WHERE status = 'leased';
CREATE TABLE IF NOT EXISTS sync_cursors (
  cursor TEXT PRIMARY KEY, owner_id UUID NOT NULL, device_id TEXT NOT NULL, ledger_cursor TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
