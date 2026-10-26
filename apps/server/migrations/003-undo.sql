CREATE TABLE IF NOT EXISTS game_undo_requests (
 game_id text NOT NULL REFERENCES games(id), id text NOT NULL,
 requester text NOT NULL REFERENCES accounts(id), requester_seat text NOT NULL,
 base_revision integer NOT NULL, target_revision integer NOT NULL,
 reason text NOT NULL, votes jsonb NOT NULL, status text NOT NULL DEFAULT 'pending',
 applied_revision integer, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(game_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS game_one_pending_undo ON game_undo_requests(game_id) WHERE status='pending';
ALTER TABLE games ADD COLUMN IF NOT EXISTS stats_eligible boolean NOT NULL DEFAULT false;
