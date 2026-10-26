ALTER TABLE rooms ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS settings_revision integer NOT NULL DEFAULT 0;
ALTER TABLE room_seats ADD COLUMN IF NOT EXISTS position integer;
WITH ranked AS (
 SELECT room_id,user_id,row_number() OVER(PARTITION BY room_id ORDER BY joined_at,user_id)::int AS n FROM room_seats
)
UPDATE room_seats s SET position=r.n FROM ranked r WHERE s.room_id=r.room_id AND s.user_id=r.user_id AND s.position IS NULL;
ALTER TABLE games ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}';
ALTER TABLE games ADD COLUMN IF NOT EXISTS clock jsonb;
