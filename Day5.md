# Day 5: Transaction Service, Idempotency Engine, & Inter-Account Transfers

## Architectural Overview

Day 5 introduces the **Transaction Microservice** (`services/transaction-service`), providing production-grade **Inter-Account Transfer Orchestration** and a **Cryptographic Idempotency Engine**. It guarantees that network retries or duplicate client submissions will never result in double debits or unauthorized money creation.

```
                        ┌─────────────────────────────────┐
                        │    React Frontend / Gateway     │
                        └────────────────┬────────────────┘
                                         │
                   POST /api/v1/transactions/transfers/internal
                   Header: X-Idempotency-Key: <UUID>
                                         │
                                         ▼
                        ┌─────────────────────────────────┐
                        │  services/transaction-service   │
                        └────────────────┬────────────────┘
                                         │
                     1. Check Idempotency Key (idempotency_keys table)
                     2. Verify Source & Destination Accounts (account-service)
                     3. Validate Transfer Limits & Available Balance
                     4. Post Double-Entry Journal (ledger-service)
                        - DEBIT Source Account
                        - CREDIT Destination Account
                     5. Record Transaction (COMPLETED)
                     6. Cache & Return Response Payload for Key
```

---

## 1. Cryptographic Idempotency Engine

### Mechanics (`X-Idempotency-Key`):
1. **Request Hashing**: Hashing of request payload (`SHA-256`) and URL route.
2. **State Machine (`idempotency_keys` table)**:
   - `PROCESSING`: Set immediately upon initial request arrival.
   - `COMPLETED`: Stores HTTP status code and response JSON payload upon successful processing.
   - `FAILED`: Set if an unhandled internal exception occurs.
3. **Duplicate Handling**:
   - If a request with an existing `COMPLETED` key is retransmitted, the middleware intercepts execution and returns the cached response immediately (`200 OK` or `201 Created`).
   - If a request with an existing `PROCESSING` key arrives concurrently, it returns `409 CONCURRENT_REQUEST`.

---

## 2. PostgreSQL Database Schema (Neon Cloud)

### `transactions` Table

```sql
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_number VARCHAR(50) UNIQUE NOT NULL,
    source_account_number VARCHAR(20) NOT NULL,
    destination_account_number VARCHAR(20) NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    transaction_type VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    idempotency_key VARCHAR(100),
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `idempotency_keys` Table

```sql
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    request_path VARCHAR(255) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    response_code INT,
    response_body JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);
```

---

## 3. REST API Specifications (`services/transaction-service`)

### 1. `POST /api/v1/transactions/transfers/internal`
- **Headers**: `Authorization: Bearer <JWT>`, `X-Idempotency-Key: <UUID>`
- **Request Body**:
  ```json
  {
    "sourceAccountNumber": "100084920192",
    "destinationAccountNumber": "100073829104",
    "amount": 150000,
    "description": "Rent Payment"
  }
  ```
- **Response**: `201 Created` returning transaction status `COMPLETED` and generated `transactionNumber`.

### 2. `GET /api/v1/transactions`
- **Response**: List of all transfers involving user's accounts.

### 3. `POST /api/v1/transactions/:id/reverse`
- **Response**: Reverses transaction by posting opposite debit/credit journal legs to `ledger-service`.

---

## 4. Frontend Bootstrap 5 UI Components

- **`InternalTransferModal`**: Modal dialog for inter-account transfers featuring client-side UUID idempotency key generation, real-time balance checks, destination account validation, and quick preset amount buttons.
- **`TransactionListView`**: Transaction history component featuring status badges (`COMPLETED`, `PENDING`, `REVERSED`), search filter, single-click copy button for transaction numbers, and transaction reversal actions.

---

## 5. Verification & Testing

1. Database provisioning: `node scripts/init-neon-db.js` (Completed successfully).
2. Workspace compilation: `npm run build` (Clean 0 errors across all monorepo workspaces).
