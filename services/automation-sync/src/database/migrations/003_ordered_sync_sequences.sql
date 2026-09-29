-- Repair legacy sequence backfills that assigned every operation the same value.
WITH ordered AS (
  SELECT ctid,
         row_number() OVER (
           PARTITION BY owner_id, device_id
           ORDER BY sequence, created_at, operation_id
         ) AS assigned_sequence
  FROM sync_operations
)
UPDATE sync_operations operation
SET sequence = ordered.assigned_sequence
FROM ordered
WHERE operation.ctid = ordered.ctid;

INSERT INTO sync_device_sequences (owner_id, device_id, next_sequence)
SELECT owner_id, device_id, MAX(sequence) + 1
FROM sync_operations
GROUP BY owner_id, device_id
ON CONFLICT (owner_id, device_id)
DO UPDATE SET next_sequence = GREATEST(sync_device_sequences.next_sequence, EXCLUDED.next_sequence);
