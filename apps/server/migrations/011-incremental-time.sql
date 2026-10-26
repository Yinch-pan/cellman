-- Ongoing games retain their saved clock and settings. Waiting players reconfirm.
WITH changed AS (
 UPDATE rooms SET
 settings=jsonb_set(settings,'{time}','{"mode":"incremental","initialHours":72,"incrementHours":24,"maximumHours":72}'::jsonb),
 settings_revision=settings_revision+1
 WHERE status='waiting' AND COALESCE(settings->'time'->>'mode','') <> 'incremental'
 RETURNING id
)
UPDATE room_seats SET ready=false WHERE room_id IN (SELECT id FROM changed);
