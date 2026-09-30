-- notification-service schema

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  type        VARCHAR(50) NOT NULL,
  -- PAYMENT_COMPLETED | PAYMENT_REVERSED | PAYMENT_FAILED | DEPOSIT | WITHDRAWAL | ACCOUNT_FROZEN | SYSTEM
  title       VARCHAR(200) NOT NULL,
  message     TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}',
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id    ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read    ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
