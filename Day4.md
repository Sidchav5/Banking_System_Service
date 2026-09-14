# Day 4: Ledger Service & Double-Entry Accounting Engine

## Architectural Overview

Day 4 introduces the immutable core accounting engine of the **BankFlow Enterprise Banking Platform**. All monetary movements (Deposits, Withdrawals, Transfers, Holds, and Fees) are governed strictly by **Double-Entry Accounting Principles**, ensuring complete auditability, mathematical equilibrium, and zero money creation/loss out of thin air.

```
                      ┌─────────────────────────────────┐
                      │    React Frontend / Gateway     │
                      └────────────────┬────────────────┘
                                       │
                         POST /ledger/journals/deposit
                         POST /ledger/journals/withdraw
                                       │
                                       ▼
                      ┌─────────────────────────────────┐
                      │     services/ledger-service     │
                      └────────────────┬────────────────┘
                                       │
                       1. Validate Sum(Debits)==Sum(Credits)
                       2. BEGIN PostgreSQL Transaction
                       3. Insert journal_entries (Header)
                       4. Insert ledger_entries (Lines)
                       5. COMMIT Transaction
                                       │
                                       ▼
                      ┌─────────────────────────────────┐
                      │     services/account-service    │
                      │     (Balance Sync via PATCH)    │
                      └─────────────────────────────────┘
```

---

## 1. Double-Entry Accounting Engine

### Core Axiom:
Every transaction recorded in the ledger MUST satisfy:
$$\sum \text{DEBIT Amounts} = \sum \text{CREDIT Amounts}$$

If total debits do not equal total credits, the journal posting is rejected immediately with `400 UNBALANCED_JOURNAL` and the database transaction rolls back (`ROLLBACK`).

### Account Types & Entry Directions:
- **Asset Accounts** (e.g. Bank Cash Reserve `CASH_RESERVE_1000`):
  - `DEBIT` increases (+), `CREDIT` decreases (-).
- **Liability Accounts** (e.g. Customer Accounts `1000XXXXXXXX`):
  - `CREDIT` increases (+), `DEBIT` decreases (-).

### Double-Entry Flow Matrix:

| Transaction Type | Debit Leg (Increases/Decreases) | Credit Leg (Increases/Decreases) | Result |
| :--- | :--- | :--- | :--- |
| **Cash Deposit** | `DEBIT CASH_RESERVE_1000` (Asset +) | `CREDIT Customer Account` (Liability +) | Equal +Assets and +Liabilities |
| **Cash Withdrawal** | `DEBIT Customer Account` (Liability -) | `CREDIT CASH_RESERVE_1000` (Asset -) | Equal -Liabilities and -Assets |

---

## 2. PostgreSQL Database Schema (Neon Cloud)

### `journal_entries` Table
Stores high-level transaction metadata headers:

```sql
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_id VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    entry_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `ledger_entries` Table
Stores immutable line items for each debit or credit legs:

```sql
CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_number VARCHAR(20) NOT NULL,
    entry_direction VARCHAR(10) NOT NULL CHECK (entry_direction IN ('DEBIT', 'CREDIT')),
    amount BIGINT NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 3. REST API Endpoints (`services/ledger-service`)

### 1. `POST /api/v1/ledger/journals/deposit`
- **Request Body**:
  ```json
  {
    "accountNumber": "100084920192",
    "amount": 500000,
    "description": "Salary Deposit"
  }
  ```
- **Response**: `201 Created` with full double-entry journal and ledger records.

### 2. `POST /api/v1/ledger/journals/withdraw`
- **Request Body**:
  ```json
  {
    "accountNumber": "100084920192",
    "amount": 100000,
    "description": "ATM Cash Withdrawal"
  }
  ```
- **Response**: `201 Created` with full double-entry journal and ledger records.

### 3. `GET /api/v1/ledger/journals/account/:accountNumber`
- **Response**: List of ledger entry logs for the requested account number.

---

## 4. Frontend Bootstrap 5 UI Components

- **`DepositModal`**: Quick deposit modal with presets (+₹500, +₹1,000, +₹5,000, +₹10,000, +₹50,000).
- **`WithdrawalModal`**: Withdrawal modal with available balance verification.
- **`LedgerJournalView`**: Full transaction ledger history table showing reference IDs, entry type badges, debit/credit badges, timestamps, and formatted INR amounts.

---

## 5. Verification & Testing

1. Provision database tables: `node scripts/init-neon-db.js` (Completed successfully).
2. Workspace compilation: `npm run build` (Clean 0 errors across all monorepo workspaces).
