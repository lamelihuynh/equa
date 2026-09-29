-- The partial keys make reverse requests and repeated invitations converge even
-- when they arrive on different service instances at the same time. This is
-- the single follow-up migration for both legacy rows and future inserts.
DROP INDEX IF EXISTS friend_requests_pending_unique_idx;

WITH duplicates AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY requester_id, lower(target_identifier)
      ORDER BY created_at, id
    ) AS duplicate_number
  FROM friend_requests
  WHERE status = 'pending'
)
UPDATE friend_requests
SET status = 'rejected'
WHERE id IN (SELECT id FROM duplicates WHERE duplicate_number > 1);

WITH duplicates AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY LEAST(requester_id, target_user_id), GREATEST(requester_id, target_user_id)
      ORDER BY created_at, id
    ) AS duplicate_number
  FROM friend_requests
  WHERE status = 'pending' AND target_user_id IS NOT NULL
)
UPDATE friend_requests
SET status = 'rejected'
WHERE id IN (SELECT id FROM duplicates WHERE duplicate_number > 1);

CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_pending_pair_unique_idx
  ON friend_requests (LEAST(requester_id, target_user_id), GREATEST(requester_id, target_user_id))
  WHERE status = 'pending' AND target_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_pending_normalized_unique_idx
  ON friend_requests (requester_id, lower(target_identifier))
  WHERE status = 'pending';

WITH duplicates AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY group_id, lower(target_identifier)
      ORDER BY created_at, id
    ) AS duplicate_number
  FROM group_invitations
  WHERE status = 'pending' AND kind = 'email' AND target_identifier IS NOT NULL
)
UPDATE group_invitations
SET status = 'revoked'
WHERE id IN (SELECT id FROM duplicates WHERE duplicate_number > 1);

WITH duplicates AS (
  SELECT id,
    row_number() OVER (PARTITION BY group_id ORDER BY created_at, id) AS duplicate_number
  FROM group_invitations
  WHERE status = 'pending' AND kind = 'link'
)
UPDATE group_invitations
SET status = 'revoked'
WHERE id IN (SELECT id FROM duplicates WHERE duplicate_number > 1);

CREATE UNIQUE INDEX IF NOT EXISTS group_invitations_pending_email_unique_idx
  ON group_invitations (group_id, lower(target_identifier))
  WHERE status = 'pending' AND kind = 'email' AND target_identifier IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS group_invitations_pending_link_unique_idx
  ON group_invitations (group_id)
  WHERE status = 'pending' AND kind = 'link';
