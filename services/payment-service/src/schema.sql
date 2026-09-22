-- ─────────────────────────────────────────────────────────────────────────────
-- payment-service schema
--
-- Tables:
--   payments         — Inter-bank payment records with full state machine
--   payment_events   — Immutable state-transition audit log (Saga steps)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number            VARCHAR(30) UNIQUE NOT NULL,    -- PAY-<timestamp>-<random>
  idempotency_key           VARCHAR(255) UNIQUE,

  -- Source (always a BankFlow internal account)
  source_account_number     VARCHAR(30) NOT NULL,
  source_user_id            UUID NOT NULL,
  source_bank_code          VARCHAR(20) NOT NULL DEFAULT 'BANKFLOW',

  -- Destination (external bank)
  destination_account_number VARCHAR(50) NOT NULL,
  destination_bank_code     VARCHAR(20) NOT NULL,

  -- Money
  amount                    BIGINT NOT NULL CHECK (amount > 0),   -- in paise (minor units)
  currency                  VARCHAR(3) NOT NULL DEFAULT 'INR',

  -- State Machine
  -- INITIATED → DEBITED → SENT_TO_NETWORK → CREDITED → COMPLETED
  --                                        ↘ CREDIT_FAILED → REVERSAL_PENDING → REVERSED
  --                                        ↘ TIMEOUT       → REVERSAL_PENDING → REVERSED
  status                    VARCHAR(30) NOT NULL DEFAULT 'INITIATED',

  -- References
  description               TEXT,
  payment_network_reference VARCHAR(100),   -- Reference from payment-network
  credit_id                 VARCHAR(100),   -- Credit ID from external bank
  failure_reason            TEXT,
  reversal_journal_id       UUID,           -- Journal used for reversal

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Payment Events (State Transition Audit Log) ──────────────────────────────
-- Every status transition is logged immutably here.
-- This is the Saga execution history.

CREATE TABLE IF NOT EXISTS payment_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id      UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  from_status     VARCHAR(30),
  to_status       VARCHAR(30) NOT NULL,
  event_type      VARCHAR(50) NOT NULL,     -- e.g. DEBIT_SUCCEEDED, CREDIT_FAILED, REVERSAL_COMPLETED
  detail          TEXT,                     -- Human-readable detail or error
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_payments_source_account       ON payments(source_account_number);
CREATE INDEX IF NOT EXISTS idx_payments_destination_account  ON payments(destination_account_number);
CREATE INDEX IF NOT EXISTS idx_payments_status               ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_idempotency_key      ON payments(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_payments_user                 ON payments(source_user_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_payment_id     ON payment_events(payment_id);
