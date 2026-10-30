CREATE TABLE IF NOT EXISTS game_end_requests (
 game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
 id text NOT NULL,
 requester text NOT NULL REFERENCES accounts(id),
 requester_seat text NOT NULL,
 base_revision integer NOT NULL,
 reason text NOT NULL,
 votes jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending'
   CHECK (status IN ('pending','applied','rejected','cancelled','expired','changed')),
 applied_revision integer,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
 PRIMARY KEY (game_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS game_one_pending_end ON game_end_requests(game_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS game_end_requester_created ON game_end_requests(game_id,requester,created_at DESC);
