# BankFlow — Distributed Banking & Payment Processing Platform

> A **production-style microservices banking simulation** demonstrating double-entry ledger accounting, concurrent transaction handling, event-driven payments, inter-bank transfer simulation, Saga-based recovery, and automated reconciliation.
>
> Built as a final-year capstone project. **Not a real bank. Not connected to actual payment rails.**

[![CI](https://github.com/Sidchav5/Banking_System_Service/actions/workflows/ci.yml/badge.svg)](https://github.com/Sidchav5/Banking_System_Service/actions/workflows/ci.yml)

---

## Architecture

```
                        ┌─────────────────────┐
                        │   React 18 (Vite)   │  :5173 (dev) | :80 (prod)
                        │   Bootstrap 5 UI    │
                        └──────────┬──────────┘
                                   │ HTTP
                                   ▼
                        ┌─────────────────────┐
                        │    API Gateway      │  :3000
                        │  Rate Limit · CORS  │
                        │  JWT · Routing      │
                        └──────────┬──────────┘
                                   │
       ┌───────────────────────────┼──────────────────────────────┐
       │                           │                              │
       ▼                           ▼                              ▼
┌──────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ auth-service │:3001    │ account-service  │:3003    │ payment-service  │:3006
│ user-service │:3002    │ ledger-service   │:3004    │ beneficiary-svc  │:3007
└──────────────┘         │ transaction-svc  │:3005    │ bank-service     │:3008
                         └──────────────────┘         └──────────────────┘
                                   │                              │
                         ┌─────────┴──────────┐                  │
                         │ settlement-svc:3009 │                  │
                         │ reconcile-svc: 3010 │                  ▼
                         │ notify-svc:   3011  │       ┌──────────────────────┐
                         └────────────────────-┘       │ Payment Network Sim  │:4000
                                                       │ External Bank Sim    │:4001
                                                       └──────────────────────┘

Infrastructure (Docker):
  Redis      :6379   — Cache · Distributed locks · Rate limiting · Sessions
  Kafka      :9092   — Domain events (KRaft, no ZooKeeper)
  Kafka UI   :8080   — Visual topic/consumer management
  RabbitMQ   :5672   — Background jobs (DLQ, retry)
  RabbitMQ UI:15672  — Queue management

Databases (Neon — cloud PostgreSQL, one per service):
  auth_db · user_db · account_db · ledger_db · transaction_db
  payment_db · beneficiary_db · bank_db · settlement_db
  reconciliation_db · notification_db
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 + Vite + TypeScript + Bootstrap 5 |
| **API Gateway** | Node.js + Express + TypeScript |
| **Microservices** | Node.js + Express + TypeScript (11 services) |
| **Simulators** | Node.js (payment-network, external-bank) |
| **Database** | Neon Serverless PostgreSQL (one DB per service) |
| **Cache / Locks** | Redis 7 |
| **Event Streaming** | Apache Kafka 3.7 (KRaft mode — no ZooKeeper) |
| **Background Jobs** | RabbitMQ 3.13 (DLQ, retry) |
| **Containerization** | Docker + Docker Compose |
| **CI/CD** | GitHub Actions |

---

## Key Features

### Financial Correctness
- ✅ **Double-entry ledger** — Every money movement creates balanced journal entries
- ✅ **PostgreSQL ACID transactions** — Atomicity guaranteed for all financial state changes
- ✅ **Row-level locking** (`SELECT FOR UPDATE`) — Prevents double-spending
- ✅ **Optimistic locking** — Version column for concurrent update detection
- ✅ **Idempotency** — Duplicate payment requests return the same result, never double-debit

### Distributed Payments
- ✅ **Saga pattern** — Multi-step inter-bank transfer with compensation
- ✅ **Transactional Outbox** — Events written atomically with financial state; never lost
- ✅ **Payment state machine** — INITIATED → DEBITED → SENT → CREDITED → COMPLETED
- ✅ **Failure simulation** — External bank unavailable, timeout, credit failure
- ✅ **Auto-reversal** — DEBIT reversed automatically when downstream step fails

### Infrastructure
- ✅ **Kafka** — Domain events across services; idempotent consumers
- ✅ **RabbitMQ** — Notification jobs with retry and dead-letter queue
- ✅ **Redis** — Distributed rate limiting, session data, distributed locks
- ✅ **Rate limiting** — 100 req/min general, 10/15min auth, 5/min payment initiation

### Operations
- ✅ **Settlement service** — Net inter-bank positions, batch settlement
- ✅ **Reconciliation service** — Compare payment vs ledger state, detect mismatches
- ✅ **Notification service** — In-app notifications on payment lifecycle events
- ✅ **Notification bell** — Real-time badge, glassmorphic dropdown in Navbar
- ✅ **Staff portal** — KYC queue, account holds, reversal desk, settlement, reconciliation tabs

---

## Getting Started

### Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | ≥ 20 | All services and tools |
| Docker + Docker Compose | Latest | Redis, Kafka, RabbitMQ |
| Neon account | Free tier | PostgreSQL databases |

### 1. Install Dependencies

```bash
git clone https://github.com/Sidchav5/Banking_System_Service.git
cd Banking_System_Service
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```env
# Required — your Neon PostgreSQL connection string
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require

# JWT secrets (change in production!)
JWT_SECRET=your_jwt_secret_min_32_chars
JWT_ACCESS_SECRET=your_jwt_secret_min_32_chars
REFRESH_TOKEN_SECRET=your_refresh_secret_min_64_chars

# Redis password (must match docker-compose)
REDIS_PASSWORD=bankflow_redis_secret
```

### 3. Start Infrastructure

```bash
docker compose up -d
```

This starts: **Redis + Kafka (KRaft) + RabbitMQ + Kafka UI**

| Service | URL | Default Credentials |
|---|---|---|
| Kafka UI | http://localhost:8080 | — |
| RabbitMQ Management | http://localhost:15672 | bankflow / bankflow_rabbit_secret |
| Redis | localhost:6379 | password: bankflow_redis_secret |

Wait ~30 seconds for Kafka to initialize.

### 4. Start All Services (Development)

```bash
npm run dev
```

This starts all 15 services concurrently:

| Service | Port |
|---|---|
| API Gateway | :3000 |
| Auth | :3001 |
| User | :3002 |
| Account | :3003 |
| Ledger | :3004 |
| Transaction | :3005 |
| Payment | :3006 |
| Beneficiary | :3007 |
| Bank | :3008 |
| Settlement | :3009 |
| Reconciliation | :3010 |
| Notification | :3011 |
| Payment Network Sim | :4000 |
| External Bank Sim | :4001 |
| Frontend (Vite) | :5173 |

### 5. Seed Demo Data (Optional)

```bash
node scripts/seed-demo.js
```

Creates demo users:

| Role | Email | Password |
|---|---|---|
| Admin | admin@bankflow.com | Admin@123456 |
| Employee | employee@bankflow.com | Employee@123456 |
| Customer | alice@bankflow.com | Alice@123456 |
| Customer | bob@bankflow.com | Bob@123456 |
| Auditor | auditor@bankflow.com | Auditor@123456 |

---

## Production Deployment

### Full-Stack Docker (All Services)

```bash
# Build and start everything
docker compose -f docker-compose.full.yml up --build

# Frontend available at http://localhost:80
# API Gateway at http://localhost:3000
```

### Individual Service Build

```bash
docker build -f services/auth-service/Dockerfile -t bankflow/auth:latest .
docker build -f apps/frontend/Dockerfile -t bankflow/frontend:latest .
```

---

## API Reference

All requests go through the API Gateway at `http://localhost:3000/api/v1`.

### Authentication

```bash
# Register
POST /api/v1/auth/register
Body: { email, password, firstName, lastName, phone }

# Login → returns accessToken + refreshToken
POST /api/v1/auth/login
Body: { email, password }

# Refresh access token
POST /api/v1/auth/refresh
Body: { refreshToken }

# Logout (revokes refresh token)
POST /api/v1/auth/logout
Auth: Bearer {accessToken}
```

### Accounts

```bash
# Create account
POST /api/v1/accounts
Auth: Bearer {token}
Body: { accountType: "SAVINGS"|"CURRENT"|"FIXED_DEPOSIT", currency: "INR" }

# Get my accounts
GET /api/v1/accounts
Auth: Bearer {token}

# Get account by ID
GET /api/v1/accounts/:id
Auth: Bearer {token}

# Deposit
POST /api/v1/accounts/:id/deposit
Auth: Bearer {token}
Body: { amount: 100000, currency: "INR", description: "..." }

# Withdraw
POST /api/v1/accounts/:id/withdraw
Auth: Bearer {token}
Body: { amount: 100000, currency: "INR", description: "..." }
```

### Payments (Internal + Inter-bank)

```bash
# Initiate payment (internal or inter-bank)
POST /api/v1/payments
Auth: Bearer {token}
Headers: Idempotency-Key: {uuid}  # Optional: automatic dedup
Body: {
  sourceAccountId:         "uuid",
  destinationAccountNumber: "account-number",
  destinationBankCode:     "BANKFLOW" | "HDFC_SIM" | "ICICI_SIM" | ...,
  amount:                  100000,  # in paise (₹1,000 = 100000)
  currency:                "INR",
  description:             "..."
}

# Get payment status
GET /api/v1/payments/:id
Auth: Bearer {token}

# Get payment history
GET /api/v1/payments
Auth: Bearer {token}
Query: ?page=1&limit=20&status=COMPLETED
```

### Transactions

```bash
# Get transaction history
GET /api/v1/transactions
Auth: Bearer {token}
Query: ?accountId=...&startDate=...&endDate=...&type=CREDIT&limit=20

# Get single transaction
GET /api/v1/transactions/:id
Auth: Bearer {token}
```

### Beneficiaries

```bash
# Add beneficiary
POST /api/v1/beneficiaries
Auth: Bearer {token}
Body: { accountNumber, bankCode, nickname, accountHolderName, ifscCode }

# List beneficiaries
GET /api/v1/beneficiaries
Auth: Bearer {token}

# Delete beneficiary
DELETE /api/v1/beneficiaries/:id
Auth: Bearer {token}
```

### Notifications

```bash
# Get my notifications
GET /api/v1/notifications
Auth: Bearer {token}
Query: ?limit=15&offset=0

# Get unread count
GET /api/v1/notifications/unread-count
Auth: Bearer {token}

# Mark read
POST /api/v1/notifications/mark-read
Auth: Bearer {token}
Body: { notificationId: "uuid" } | { all: true }
```

### Settlement (Staff/Admin only)

```bash
# Get net positions
GET /api/v1/settlement/positions
Auth: Bearer {token} (EMPLOYEE | ADMIN)

# Get batch history
GET /api/v1/settlement/batches
Auth: Bearer {token}

# Run settlement batch
POST /api/v1/settlement/batches/run
Auth: Bearer {token} (ADMIN)
```

### Reconciliation (Staff/Admin only)

```bash
# Trigger reconciliation run
POST /api/v1/reconciliation/runs
Auth: Bearer {token} (EMPLOYEE | ADMIN)

# List runs
GET /api/v1/reconciliation/runs
Auth: Bearer {token}

# Get mismatches
GET /api/v1/reconciliation/mismatches
Auth: Bearer {token}

# Resolve mismatch
POST /api/v1/reconciliation/mismatches/:id/resolve
Auth: Bearer {token}
Body: { resolution: "RESOLVED", note: "..." }
```

### Staff Portal (EMPLOYEE/ADMIN)

```bash
# KYC — list users
GET /api/v1/users?kycStatus=PENDING
Auth: Bearer {employeeToken}

# KYC — update status
PATCH /api/v1/users/:id/kyc
Auth: Bearer {employeeToken}
Body: { status: "VERIFIED" | "REJECTED" }

# Freeze/unfreeze account
PATCH /api/v1/accounts/:id/status
Auth: Bearer {employeeToken}
Body: { status: "FROZEN" | "ACTIVE", reason: "..." }

# Reverse transaction
POST /api/v1/transactions/:id/reverse
Auth: Bearer {employeeToken}
Body: { reason: "Customer dispute" }

# Update transfer limits
PATCH /api/v1/accounts/:id/limits
Auth: Bearer {adminToken}
Body: { dailyTransferLimit: 1000000, singleTransactionLimit: 500000 }
```

---

## Running Tests

```bash
# Full end-to-end test suite (all 6 demo scenarios)
node scripts/test-full-e2e.js

# Ledger invariant check (SUM DEBIT = SUM CREDIT)
node scripts/test-ledger-balance.js

# Concurrency test (race condition prevention)
node scripts/test-concurrency.js

# Load test (50 concurrent, 100 total requests)
node scripts/test-load.js 50 100

# Settlement service
node scripts/test-settlement.js

# Reconciliation service
node scripts/test-reconciliation.js

# Notification service
node scripts/test-notifications.js

# Saga + failure handling
node scripts/test-saga.js

# Beneficiary lifecycle
node scripts/test-beneficiary.js
```

---

## Demo Scenarios

### Demo 1 — Normal Transfer
```bash
# Alice sends ₹1,000 to Bob (internal)
# Expected: Alice balance -₹1,000, Bob balance +₹1,000, ledger balanced
node scripts/seed-demo.js  # creates accounts
node scripts/test-full-e2e.js  # runs Demo 1 automatically
```

### Demo 2 — Race Condition Prevention
```bash
# 100 concurrent withdrawal requests on a ₹10,000 balance
# Expected: Only financially valid requests succeed, final balance ≥ 0
node scripts/test-concurrency.js
```

### Demo 3 — Idempotency
```bash
# Same Idempotency-Key sent twice
# Expected: Same payment ID returned, only ONE debit in ledger
# Covered in: node scripts/test-full-e2e.js (Demo 3)
```

### Demo 4 — Inter-Bank Transfer
```bash
# Transfer from BANKFLOW account to HDFC_SIM account
# Goes through: Payment Service → Network Simulator → External Bank Sim
# Covered in: node scripts/test-full-e2e.js (Demo 4)
```

### Demo 5 — Failure + Reversal
```bash
# Transfer with x-simulate-failure: CREDIT_FAILED header
# Expected: Saga detects failure, reversal triggered, debit refunded
node scripts/test-saga.js
```

### Demo 6 — Ledger Invariant
```bash
# Run after all other demos to verify accounting integrity
node scripts/test-ledger-balance.js
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon PostgreSQL connection string |
| `JWT_SECRET` | ✅ | JWT signing secret (≥32 chars) |
| `JWT_ACCESS_SECRET` | ✅ | Access token secret |
| `REFRESH_TOKEN_SECRET` | ✅ | Refresh token secret (≥64 chars) |
| `REDIS_HOST` | ✅ | Redis host (default: localhost) |
| `REDIS_PORT` | | Redis port (default: 6379) |
| `REDIS_PASSWORD` | ✅ | Redis auth password |
| `ACCESS_TOKEN_EXPIRES_IN` | | Token TTL (default: 24h) |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | | Refresh TTL (default: 7) |

---

## Project Goals Demonstrated

This project demonstrates all 25 spec goals:

| # | Concept | Where |
|---|---|---|
| 1 | Microservice architecture | 11 services + API gateway |
| 2 | Service-owned databases | 11 separate Neon DBs |
| 3 | ACID transactions | ledger-service, account-service |
| 4 | Double-entry ledger | ledger-service |
| 5 | Concurrent transaction handling | SELECT FOR UPDATE |
| 6 | Row-level & optimistic locking | ledger-service |
| 7 | Transaction isolation | REPEATABLE READ on financial paths |
| 8 | Idempotency | payment-service idempotency_keys table |
| 9 | Distributed locks with Redis | payment-service, account-service |
| 10 | API Gateway | apps/api-gateway |
| 11 | JWT auth & RBAC | auth-service, api-gateway middleware |
| 12 | Kafka domain events | payment-service, ledger-service, outbox |
| 13 | RabbitMQ background jobs | notification-service |
| 14 | Saga orchestration | payment-service Saga state machine |
| 15 | Transactional Outbox | payment-service outbox table |
| 16 | Retry + DLQ | notification-service RabbitMQ config |
| 17 | Payment timeout + reversal | payment-service timeout handler |
| 18 | Inter-bank simulation | payment-network + external-bank simulators |
| 19 | Settlement | settlement-service |
| 20 | Reconciliation | reconciliation-service |
| 21 | Auditability | audit_logs table, all mutations logged |
| 22 | Notifications | notification-service + bell UI |
| 23 | Rate limiting | api-gateway (Redis-backed) |
| 24 | Failure simulation | x-simulate-failure header |
| 25 | Automated testing | scripts/test-*.js + GitHub Actions CI |

---

## Day-by-Day Development Log

| Day | Focus | Key Deliverable |
|---|---|---|
| 1 | Foundation | Monorepo + API Gateway + Docker infra + service stubs |
| 2 | Auth + User + Account | JWT auth, RBAC, account lifecycle, React login UI |
| 3 | Ledger + Deposit + Withdrawal | Double-entry ledger, PostgreSQL transactions, balance locking |
| 4 | Internal Transfers + Concurrency | SELECT FOR UPDATE, idempotency, 100-concurrent test |
| 5 | Kafka + Outbox | Transactional outbox, Kafka producers/consumers, RabbitMQ notifications |
| 6 | Inter-Bank Payment Network | Bank service, payment-network sim, external-bank sim |
| 7 | Saga + Failure Handling | Saga state machine, timeout, compensation, reversal |
| 8 | Beneficiaries + Statements | Beneficiary CRUD, cooling period, transaction filters |
| 9 | Settlement + Reconciliation + Notifications | 3 new services, rate limiting, Staff Portal tabs, notification bell |
| 10 | Docker + CI + Testing + Docs | Production Dockerfiles, GitHub Actions, E2E test suite, README |

---

## Repository

GitHub: https://github.com/Sidchav5/Banking_System_Service

---

*This project is a banking simulation for educational purposes. It is not connected to real payment infrastructure, NPCI, or any actual banking system.*
