-- Eligibility is no longer optional. Do not modify game state or replay history.
ALTER TABLE games ALTER COLUMN stats_eligible SET DEFAULT true;
UPDATE games SET stats_eligible=true WHERE NOT stats_eligible;
UPDATE games SET settings=jsonb_set(settings,'{countStats}','true')
WHERE settings->'countStats' IS DISTINCT FROM 'true'::jsonb;
UPDATE rooms SET settings=jsonb_set(settings,'{countStats}','true')
WHERE settings->'countStats' IS DISTINCT FROM 'true'::jsonb;
