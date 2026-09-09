ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
UPDATE users SET username = lower(trim(username)) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx ON users (lower(username)) WHERE username IS NOT NULL;
