CREATE TABLE IF NOT EXISTS social_schema_migrations_marker (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id)
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id UUID PRIMARY KEY,
  requester_id UUID NOT NULL,
  target_user_id UUID,
  target_identifier TEXT NOT NULL,
  target_email TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS friend_requests_target_user_idx ON friend_requests (target_user_id, status);
CREATE INDEX IF NOT EXISTS friend_requests_requester_identifier_idx ON friend_requests (requester_id, target_identifier, status);

CREATE TABLE IF NOT EXISTS friendships (
  user_a UUID NOT NULL,
  user_b UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE TABLE IF NOT EXISTS social_groups (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  image_url TEXT,
  type TEXT NOT NULL CHECK (type IN ('trip', 'household', 'event', 'other')),
  created_by UUID NOT NULL,
  dissolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID NOT NULL REFERENCES social_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_invitations (
  id UUID PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES social_groups(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('email', 'link')),
  target_identifier TEXT,
  target_email TEXT,
  target_user_id UUID,
  token TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS group_invitations_group_idx ON group_invitations (group_id, status);
