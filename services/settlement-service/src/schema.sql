-- settlement-service schema
-- Net inter-bank positions and settlement batches

CREATE TABLE IF NOT EXISTS settlement_positions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_bank_code  VARCHAR(20) NOT NULL,
  to_bank_code    VARCHAR(20) NOT NULL,
  net_amount      BIGINT NOT NULL DEFAULT 0,   -- paise, positive = from_bank owes to_bank
  currency        VARCHAR(10) NOT NULL DEFAULT 'INR',
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (from_bank_code, to_bank_code)
);

CREATE TABLE IF NOT EXISTS settlement_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING, PROCESSING, SETTLED, FAILED
  total_entries   INTEGER NOT NULL DEFAULT 0,
  total_amount    BIGINT NOT NULL DEFAULT 0,
  triggered_by    VARCHAR(100),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS settlement_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        UUID NOT NULL REFERENCES settlement_batches(id) ON DELETE CASCADE,
  payment_id      UUID NOT NULL,
  from_bank_code  VARCHAR(20) NOT NULL,
  to_bank_code    VARCHAR(20) NOT NULL,
  amount          BIGINT NOT NULL,
  currency        VARCHAR(10) NOT NULL DEFAULT 'INR',
  status          VARCHAR(20) NOT NULL DEFAULT 'SETTLED',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlement_entries_batch_id ON settlement_entries(batch_id);
CREATE INDEX IF NOT EXISTS idx_settlement_entries_payment_id ON settlement_entries(payment_id);
CREATE INDEX IF NOT EXISTS idx_settlement_batches_status ON settlement_batches(status);
