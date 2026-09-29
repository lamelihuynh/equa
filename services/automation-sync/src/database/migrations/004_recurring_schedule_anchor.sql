ALTER TABLE recurring_rules ADD COLUMN IF NOT EXISTS schedule_anchor_at TIMESTAMPTZ;

UPDATE recurring_rules
SET schedule_anchor_at = next_run_at
WHERE schedule_anchor_at IS NULL;

ALTER TABLE recurring_rules ALTER COLUMN schedule_anchor_at SET NOT NULL;
