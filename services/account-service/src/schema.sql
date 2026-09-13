-- BankFlow Account Service Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_number VARCHAR(20) UNIQUE NOT NULL,
    user_id UUID NOT NULL,
    account_type VARCHAR(50) NOT NULL DEFAULT 'SAVINGS',
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    balance BIGINT NOT NULL DEFAULT 0,            -- total balance in paise
    available_balance BIGINT NOT NULL DEFAULT 0,  -- available balance in paise
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    daily_transfer_limit BIGINT NOT NULL DEFAULT 10000000,   -- ₹100,000 in paise
    single_transaction_limit BIGINT NOT NULL DEFAULT 5000000, -- ₹50,000 in paise
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS account_holds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL,
    reason VARCHAR(255) NOT NULL,
    reference_id VARCHAR(255) NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_account_number ON accounts(account_number);
CREATE INDEX IF NOT EXISTS idx_account_holds_account_id ON account_holds(account_id);
