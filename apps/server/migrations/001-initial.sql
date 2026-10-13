CREATE TABLE IF NOT EXISTS accounts (
 id text PRIMARY KEY, username text UNIQUE NOT NULL, display_name text NOT NULL,
 password_hash text NOT NULL, recovery_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 csrf text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS games (
 id text PRIMARY KEY, state jsonb NOT NULL, revision integer NOT NULL DEFAULT 0,
 rules_version text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS game_members (
 game_id text NOT NULL REFERENCES games(id), user_id text NOT NULL REFERENCES accounts(id), seat text NOT NULL,
 PRIMARY KEY (game_id,user_id), UNIQUE(game_id,seat)
);
CREATE TABLE IF NOT EXISTS game_commands (
 game_id text NOT NULL REFERENCES games(id), actor_id text NOT NULL REFERENCES accounts(id), command_id text NOT NULL,
 payload_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(game_id,actor_id,command_id)
);
CREATE TABLE IF NOT EXISTS game_events (
 game_id text NOT NULL REFERENCES games(id), revision integer NOT NULL, actor_id text NOT NULL,
 events jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(game_id,revision)
);
CREATE TABLE IF NOT EXISTS rooms (
 id text PRIMARY KEY, host_id text REFERENCES accounts(id), visibility text NOT NULL CHECK(visibility IN ('public','private')),
 capacity integer NOT NULL CHECK(capacity BETWEEN 2 AND 5), status text NOT NULL DEFAULT 'waiting',
 invite_hash text NOT NULL, game_id text REFERENCES games(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS room_seats (
 room_id text REFERENCES rooms(id), user_id text REFERENCES accounts(id), ready boolean NOT NULL DEFAULT false,
 joined_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(room_id,user_id)
);
CREATE INDEX IF NOT EXISTS game_members_user_idx ON game_members(user_id);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
