-- Existing accounts remain active; new public registrations must verify email.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS registration_pending boolean NOT NULL DEFAULT false;
ALTER TABLE email_tokens DROP CONSTRAINT IF EXISTS email_tokens_kind_check;
ALTER TABLE email_tokens ADD CONSTRAINT email_tokens_kind_check CHECK(kind IN ('verify','reset','signup'));
ALTER TABLE email_outbox DROP CONSTRAINT IF EXISTS email_outbox_kind_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_kind_check CHECK(kind IN ('verify','reset','signup','turn','overdue'));
