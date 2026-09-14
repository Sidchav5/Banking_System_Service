-- ────────────────────────────────────────────────────────────────────────────
-- BankFlow — Ledger Microservice PostgreSQL Schema
-- Database: bankflow_ledger (or unified Neon Cloud schema)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_id VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    entry_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_number VARCHAR(20) NOT NULL,
    entry_direction VARCHAR(10) NOT NULL CHECK (entry_direction IN ('DEBIT', 'CREDIT')),
    amount BIGINT NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_number ON ledger_entries(account_number);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_journal_entry_id ON ledger_entries(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reference_id ON journal_entries(reference_id);
