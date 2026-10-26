ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS notify_turn boolean NOT NULL DEFAULT false;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS notify_overdue boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_unique ON accounts(lower(email)) WHERE email IS NOT NULL;
CREATE TABLE IF NOT EXISTS email_tokens (
 token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 email text NOT NULL, kind text NOT NULL CHECK(kind IN ('verify','reset')),
 password_fingerprint text NOT NULL, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,kind)
);
CREATE TABLE IF NOT EXISTS email_attempts (
 id bigserial PRIMARY KEY, user_id text REFERENCES accounts(id) ON DELETE CASCADE,
 destination_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_attempts_destination ON email_attempts(destination_hash,created_at);
CREATE TABLE IF NOT EXISTS email_outbox (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('verify','reset','turn','overdue')),
 payload text NOT NULL, status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
 next_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 claimed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS email_outbox_pending ON email_outbox(status,next_at);
CREATE TABLE IF NOT EXISTS email_waits (
 game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
 user_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 waiting_since timestamptz, turn_queued boolean NOT NULL DEFAULT false,
 overdue_queued boolean NOT NULL DEFAULT false, last_turn_at timestamptz, last_overdue_at timestamptz,
 PRIMARY KEY(game_id,user_id)
);
