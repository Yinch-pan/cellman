-- Waiting players must confirm the new setup and clock before starting.
WITH changed AS (
  UPDATE rooms SET setup_mode='snake-reverse',
    settings=jsonb_set(settings,'{time}','{"mode":"paced","movesPerDay":2,"activeStartUtc":2}'::jsonb),
    settings_revision=settings_revision+1
  WHERE status='waiting' AND setup_mode IN ('standard','training')
  RETURNING id
)
UPDATE room_seats SET ready=false WHERE room_id IN (SELECT id FROM changed);
