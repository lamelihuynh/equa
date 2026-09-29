ALTER TABLE recurring_executions ADD COLUMN IF NOT EXISTS lease_token TEXT;
ALTER TABLE sync_operations ADD COLUMN IF NOT EXISTS sequence BIGINT;
ALTER TABLE sync_operations ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_operations ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ;
ALTER TABLE sync_operations ADD COLUMN IF NOT EXISTS lease_token TEXT;
ALTER TABLE sync_operations ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE sync_operations ADD COLUMN IF NOT EXISTS failure_code TEXT;
CREATE TABLE IF NOT EXISTS sync_device_sequences (
  owner_id UUID NOT NULL, device_id TEXT NOT NULL, next_sequence BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY (owner_id, device_id)
);
UPDATE sync_operations SET sequence = 1 WHERE sequence IS NULL;
ALTER TABLE sync_operations ALTER COLUMN sequence SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sync_operations_one_lease_per_device
  ON sync_operations (owner_id, device_id) WHERE status = 'leased';
