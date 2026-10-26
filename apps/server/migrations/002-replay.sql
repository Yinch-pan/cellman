-- Existing games receive an honest checkpoint at their current revision.
-- Historical command parameters cannot be recovered from hashes.
ALTER TABLE games ADD COLUMN IF NOT EXISTS initial_state jsonb;
UPDATE games SET initial_state=state WHERE initial_state IS NULL;
ALTER TABLE game_commands ADD COLUMN IF NOT EXISTS revision integer;
ALTER TABLE game_commands ADD COLUMN IF NOT EXISTS seat text;
ALTER TABLE game_commands ADD COLUMN IF NOT EXISTS action jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS game_commands_revision ON game_commands(game_id,revision) WHERE revision IS NOT NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS setup_mode text NOT NULL DEFAULT 'training';
