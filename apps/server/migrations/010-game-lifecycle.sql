ALTER TABLE games ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;
UPDATE games SET last_activity_at=updated_at WHERE last_activity_at IS NULL;
ALTER TABLE games ALTER COLUMN last_activity_at SET DEFAULT now();
ALTER TABLE games ALTER COLUMN last_activity_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS games_active_activity_idx ON games(last_activity_at) WHERE state->>'status'='active';
CREATE TABLE IF NOT EXISTS game_timeouts (
 game_id text NOT NULL REFERENCES games(id),
 user_id text NOT NULL REFERENCES accounts(id),
 seat text NOT NULL,
 first_seen_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(game_id,user_id)
);
