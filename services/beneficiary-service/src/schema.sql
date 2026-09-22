-- ─────────────────────────────────────────────────────────────────────────────
-- BankFlow — Beneficiary Service Schema
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS beneficiaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  nickname VARCHAR(100) NOT NULL,
  beneficiary_name VARCHAR(100) NOT NULL,
  account_number VARCHAR(34) NOT NULL,
  bank_code VARCHAR(20) NOT NULL,
  ifsc_code VARCHAR(11),
  status VARCHAR(20) NOT NULL DEFAULT 'COOLING', -- 'COOLING', 'ACTIVE', 'DISABLED'
  cooling_ends_at TIMESTAMPTZ NOT NULL,
  max_transfer_limit BIGINT NOT NULL DEFAULT 2500000, -- in minor units (paise), default ₹25,000
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_beneficiary UNIQUE (user_id, account_number, bank_code)
);

CREATE INDEX IF NOT EXISTS idx_beneficiaries_user_id ON beneficiaries(user_id);
CREATE INDEX IF NOT EXISTS idx_beneficiaries_status ON beneficiaries(status);
