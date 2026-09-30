-- reconciliation-service schema

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status          VARCHAR(20) NOT NULL DEFAULT 'RUNNING',  -- RUNNING, COMPLETED, FAILED
  payments_checked INTEGER NOT NULL DEFAULT 0,
  mismatches_found INTEGER NOT NULL DEFAULT 0,
  triggered_by    VARCHAR(100),
  summary         TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS reconciliation_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
  payment_id      UUID NOT NULL,
  payment_status  VARCHAR(30) NOT NULL,
  payment_amount  BIGINT NOT NULL,
  ledger_status   VARCHAR(30),       -- NULL if no ledger entry found
  ledger_amount   BIGINT,
  mismatch_type   VARCHAR(50) NOT NULL,
  -- AMOUNT_MISMATCH | MISSING_LEDGER | STATUS_MISMATCH | ORPHANED_LEDGER | OK
  resolution      VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  -- PENDING | RESOLVED | ESCALATED | IGNORED
  resolved_by     VARCHAR(100),
  resolution_note TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recon_items_run_id    ON reconciliation_items(run_id);
CREATE INDEX IF NOT EXISTS idx_recon_items_payment_id ON reconciliation_items(payment_id);
CREATE INDEX IF NOT EXISTS idx_recon_items_resolution ON reconciliation_items(resolution);
CREATE INDEX IF NOT EXISTS idx_recon_runs_status     ON reconciliation_runs(status);
