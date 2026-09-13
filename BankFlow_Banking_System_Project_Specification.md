# Production-Style Banking System — Project Specification

## 1. Project Overview

A production-style, microservices-based digital banking simulation built with:

- **Frontend:** React
- **Backend:** Node.js
- **API Gateway:** Node.js
- **Database:** PostgreSQL, database-per-service
- **Cache / distributed coordination:** Redis
- **Event streaming:** Apache Kafka
- **Background job processing:** RabbitMQ
- **Containerization:** Docker + Docker Compose
- **Cloud target:** AWS/Azure
- **Testing:** Unit, integration, API, concurrency, failure and load tests
- **Observability:** Basic health checks, structured logs and correlation IDs

The project intentionally models realistic banking concepts while remaining implementable by a final-year student. It is **NPCI-inspired, not a real NPCI/UPI implementation**, and uses simulated external banks and payment-network components.

---

# 2. Project Goals

The system should demonstrate:

1. Microservice architecture
2. Service-owned databases
3. ACID transactions in PostgreSQL
4. Double-entry ledger accounting
5. Concurrent transaction handling
6. Row-level and optimistic locking
7. Transaction isolation
8. Idempotency
9. Distributed locks with Redis
10. API Gateway
11. JWT authentication and authorization
12. Kafka-based domain events
13. RabbitMQ-based background jobs
14. Saga-based distributed workflows
15. Transactional Outbox pattern
16. Retry and dead-letter handling
17. Payment timeout and reversal handling
18. Inter-bank payment simulation
19. Settlement and reconciliation
20. Auditability
21. Notifications
22. Rate limiting
23. Failure simulation
24. Automated testing
25. Dockerized deployment

---

# 3. Scope Boundary

## What this project simulates

- A bank's digital banking platform
- Multiple customer accounts
- Internal transfers
- Inter-bank transfers
- An NPCI-like payment network
- External-bank simulators
- Ledger and settlement
- Reconciliation
- Payment failures and reversals

## What it does NOT claim to implement

- Actual UPI protocol
- Actual NPCI connectivity
- RBI production infrastructure
- Real payment rails
- Production KYC/AML compliance
- Real SMS/email delivery
- Real card-network processing

This distinction should be explicitly stated in the README and project presentation.

---

# 4. Functional Requirements

## 4.1 Authentication

- User registration
- Login
- Logout
- Refresh token
- Password hashing
- Session/device management
- Account lockout after repeated failed login attempts
- Role-based access control

Roles:

- CUSTOMER
- EMPLOYEE
- ADMIN
- AUDITOR

---

# 5. User Management

Admin/employee capabilities:

- Create user
- Read user
- Update user
- Deactivate user
- Search users
- View KYC status
- View user accounts

Customer capabilities:

- View profile
- Update allowed profile fields
- Change password
- Manage sessions

---

# 6. Account Management

A user can own multiple accounts.

Supported account types:

- Savings
- Current
- Fixed Deposit

Core operations:

- Open account
- Close account
- Freeze account
- Unfreeze account
- View balance
- View account details
- View transaction history
- Set transaction limits

Account states:

```text
PENDING
ACTIVE
FROZEN
BLOCKED
CLOSED
```

---

# 7. Money Operations

## Deposit

Requirements:

- Validate account
- Validate amount
- Create ledger entries
- Update balance projection
- Create transaction record
- Emit event
- Create audit record

## Withdrawal

Requirements:

- Validate account
- Validate limits
- Check available balance
- Lock account/ledger state
- Debit account
- Create transaction
- Emit event

Withdrawal must never allow an invalid negative balance.

---

# 8. Internal Transfer

Example:

```text
Customer A
Account A
₹10,000

        Transfer ₹2,000

Account A
₹8,000

Account B
₹2,000
```

The transfer must be atomic within the bank.

Both sides of the accounting entry must succeed or neither should commit.

---

# 9. Inter-Bank Transfer

Example:

```text
Bank A
  |
  | Payment Request
  v
Payment Network Simulator
  |
  | Route
  v
Bank B
  |
  | Credit
  v
Beneficiary Account
```

The flow includes:

1. Initiation
2. Validation
3. Idempotency check
4. Debit reservation/debit
5. Outbox event
6. Network routing
7. External bank validation
8. Credit
9. Acknowledgement
10. Settlement
11. Reconciliation

Failure paths must support reversal/compensation.

---

# 10. NPCI-Inspired Payment Lifecycle

```text
INITIATED
   |
   v
VALIDATING
   |
   v
DEBIT_PENDING
   |
   v
DEBITED
   |
   v
SENT_TO_NETWORK
   |
   v
ROUTED
   |
   v
CREDIT_PENDING
   |
   +-------> FAILED
   |            |
   |            v
   |         REVERSAL
   |
   v
CREDITED
   |
   v
ACKNOWLEDGED
   |
   v
SETTLEMENT_PENDING
   |
   v
SETTLED
```

Timeouts may cause:

```text
CREDIT_PENDING
      |
      v
TIMEOUT
      |
      v
RECONCILIATION
      |
      +--> CREDIT_CONFIRMED
      |
      +--> REVERSAL_REQUIRED
```

---

# 11. Beneficiary Management

Customers can:

- Add beneficiary
- Verify beneficiary
- Update beneficiary
- Delete beneficiary
- Enable/disable beneficiary

Security controls:

- OTP simulation
- Cooling period simulation
- Transfer limits for newly added beneficiaries

---

# 12. Transaction History and Statements

Users can:

- Search transactions
- Filter by date
- Filter by type
- Filter by status
- View transaction details
- Download/generate statements

Transactions should contain:

- Transaction ID
- Reference ID
- Idempotency key
- Source account
- Destination account
- Amount
- Currency
- Type
- Status
- Timestamp
- Failure reason

---

# 13. Double-Entry Ledger

The ledger is the accounting source of truth.

Every movement of money must create balanced entries.

Example:

```text
Transfer ₹1,000

Debit:
Source Account     ₹1,000

Credit:
Destination Account ₹1,000
```

Ledger invariant:

```text
SUM(DEBITS) = SUM(CREDITS)
```

for every balanced journal transaction.

Do not implement money movement as only:

```sql
UPDATE accounts SET balance = balance - 1000;
```

Instead:

```text
Transaction
    |
    v
Journal
    |
    +---- Debit Ledger Entry
    |
    +---- Credit Ledger Entry
```

---

# 14. Monetary Representation

Use integer minor units.

For INR:

```text
₹100.50 = 10050 paise
```

Recommended database type:

```text
BIGINT
```

This avoids floating-point money errors.

Currency should still be stored explicitly:

```text
currency = INR
```

---

# 15. Consistency Model

## Strong consistency

Use strong consistency for:

- Ledger
- Account balance
- Debit
- Credit
- Internal transfer
- Financial transaction state

## Eventual consistency

Use eventual consistency for:

- Notifications
- Analytics
- Search projections
- Reporting
- Audit projections
- Dashboard aggregates

This distinction should be demonstrated in the project presentation.

---

# 16. Microservices

Recommended services:

```text
api-gateway
auth-service
user-service
account-service
ledger-service
transaction-service
payment-service
beneficiary-service
bank-service
settlement-service
reconciliation-service
notification-service
```

Infrastructure:

```text
postgresql
redis
kafka
rabbitmq
```

External simulation:

```text
payment-network-simulator
external-bank-simulator
```

---

# 17. Service Responsibilities

## API Gateway

Responsibilities:

- Single frontend entry point
- Authentication middleware
- Authorization
- Request validation
- Routing
- Rate limiting
- Correlation ID
- Logging
- API versioning

Frontend should communicate only with the gateway.

---

## Auth Service

Responsibilities:

- Registration
- Login
- Password hashing
- Access tokens
- Refresh tokens
- Token rotation
- Session management
- Login attempt tracking

---

## User Service

Responsibilities:

- Customer profile
- Personal information
- KYC status
- User lifecycle

---

## Account Service

Responsibilities:

- Account creation
- Account status
- Account metadata
- Account ownership
- Limits

It should not own the financial ledger.

---

## Ledger Service

Responsibilities:

- Journals
- Ledger entries
- Double-entry validation
- Financial posting
- Balance integrity

This is one of the most critical services.

---

## Transaction Service

Responsibilities:

- Transaction lifecycle
- Transaction history
- Transaction status
- Transaction references
- Read-oriented transaction queries

---

## Payment Service

Responsibilities:

- Payment initiation
- Internal transfers
- Inter-bank payments
- Idempotency
- Payment state machine
- Saga orchestration

---

## Beneficiary Service

Responsibilities:

- Beneficiary CRUD
- Verification
- Cooling period
- Beneficiary state

---

## Bank Service

Responsibilities:

- Bank registry
- Routing information
- External bank metadata
- Account lookup simulation

---

## Settlement Service

Responsibilities:

- Batch settlement
- Inter-bank net positions
- Settlement records

---

## Reconciliation Service

Responsibilities:

- Compare expected vs actual financial states
- Detect mismatches
- Resolve/recommend reversal
- Generate reconciliation reports

---

## Notification Service

Responsibilities:

- Email jobs
- SMS simulation
- Push notification simulation
- Retry failed notifications

RabbitMQ is appropriate here.

---

# 18. Database Architecture

Use database-per-service.

Example:

```text
auth_db
user_db
account_db
ledger_db
transaction_db
payment_db
beneficiary_db
bank_db
settlement_db
reconciliation_db
notification_db
```

A service must not directly query another service's database.

Communication occurs through:

- REST APIs
- Kafka events
- RabbitMQ jobs

---

# 19. Core Database Models

## User

```text
id
email
phone
password_hash
first_name
last_name
status
role
created_at
updated_at
```

## Account

```text
id
user_id
bank_id
account_number
account_type
currency
status
daily_withdrawal_limit
daily_transfer_limit
created_at
updated_at
```

## Journal

```text
id
transaction_id
reference_id
status
created_at
```

## Ledger Entry

```text
id
journal_id
account_id
entry_type
amount_minor
currency
created_at
```

`entry_type`:

```text
DEBIT
CREDIT
```

## Transaction

```text
id
reference_id
idempotency_key
source_account
destination_account
amount_minor
currency
transaction_type
status
failure_reason
created_at
updated_at
```

## Beneficiary

```text
id
user_id
bank_id
account_number
name
status
cooling_period_until
created_at
```

---

# 20. PostgreSQL Transaction Strategy

Financial operations must use database transactions.

Example conceptual flow:

```text
BEGIN

Lock source account/financial state

Validate balance

Create journal

Create debit entry

Create credit entry

Update required balance projection

Create transaction record

Create outbox event

COMMIT
```

Never:

```text
Debit database
   ↓
HTTP request
   ↓
Credit database
```

without distributed-transaction handling.

---

# 21. Concurrency Control

The system must demonstrate race-condition prevention.

Example:

```text
Initial balance = ₹10,000

Request A → withdraw ₹8,000
Request B → withdraw ₹7,000
```

Expected:

```text
One succeeds
One fails
```

Never:

```text
Both succeed
Final balance = invalid
```

---

# 22. Locking Strategy

Use PostgreSQL row-level locking where appropriate:

```sql
SELECT *
FROM accounts
WHERE id = $1
FOR UPDATE;
```

This serializes competing modifications to the same financial state.

Also demonstrate:

- `FOR UPDATE`
- optimistic version column
- transaction isolation
- deadlock handling

---

# 23. Isolation Levels

Demonstrate:

- READ COMMITTED
- REPEATABLE READ
- SERIALIZABLE

Explain when each is appropriate.

For financial posting, prefer explicit transaction boundaries and locking rather than assuming a high isolation level alone solves every concurrency issue.

---

# 24. Optimistic Locking

Account records can contain:

```text
version
```

Update:

```sql
UPDATE accounts
SET balance = $newBalance,
    version = version + 1
WHERE id = $id
AND version = $oldVersion;
```

If zero rows are updated:

```text
Concurrent modification detected
```

---

# 25. Redis

Redis will be used for:

## Cache

Examples:

```text
bank metadata
beneficiary metadata
read-heavy account information
```

## Distributed lock

Use for selected cross-process coordination.

Example:

```text
lock:account:{accountId}
```

Important:

Redis locks are **not** the source of truth for money. PostgreSQL transactional guarantees remain authoritative.

## Rate limiting

Examples:

```text
login attempts
payment initiation
OTP requests
API requests
```

## Session-related data

Store revocation/session metadata where appropriate.

---

# 26. Kafka

Kafka handles domain events.

Example topics:

```text
user.events
account.events
transaction.events
payment.events
ledger.events
settlement.events
reconciliation.events
audit.events
```

Example event:

```json
{
  "eventId": "uuid",
  "eventType": "PAYMENT_COMPLETED",
  "aggregateId": "payment-id",
  "timestamp": "ISO-8601",
  "version": 1,
  "payload": {}
}
```

Consumers must be idempotent.

---

# 27. RabbitMQ

Use RabbitMQ for background jobs where queue semantics are useful.

Examples:

```text
notification.email
notification.sms
notification.push
statement.generation
```

Include:

- Retry
- Dead-letter queue
- Consumer acknowledgement
- Failed-job handling

---

# 28. Transactional Outbox Pattern

Problem:

```text
DB COMMIT succeeds
Kafka publish fails
```

Solution:

```text
Database transaction
   |
   +--> Financial state
   |
   +--> Outbox event
            |
            v
       Outbox publisher
            |
            v
          Kafka
```

The outbox record is written in the same PostgreSQL transaction as the financial change.

A worker publishes pending outbox events.

---

# 29. Idempotency

Every externally initiated financial request should support an idempotency key.

Example:

```text
POST /payments
Idempotency-Key: 7a9...
```

If the client retries the same request:

```text
Same key
    ↓
Existing transaction returned
```

It must not debit the customer twice.

Idempotency records should have:

```text
key
request_hash
response
status
created_at
```

---

# 30. Saga Pattern

Inter-bank transfers are distributed workflows.

Example:

```text
Payment Service
      |
      v
Reserve/Debit
      |
      v
Send Payment Event
      |
      v
External Bank
      |
      v
Credit
```

If credit fails:

```text
Credit Failed
     |
     v
Compensation
     |
     v
Reverse Source Debit
```

The Saga state should be persisted.

---

# 31. Saga State Machine

```text
INITIATED
VALIDATED
DEBITED
SENT
ACK_PENDING
CREDITED
COMPLETED
```

Failure states:

```text
VALIDATION_FAILED
DEBIT_FAILED
NETWORK_FAILED
CREDIT_FAILED
TIMEOUT
REVERSAL_PENDING
REVERSED
RECONCILIATION_REQUIRED
```

---

# 32. Failure Handling

The project must deliberately simulate:

1. External bank unavailable
2. Kafka unavailable
3. RabbitMQ unavailable
4. Database timeout
5. Payment timeout
6. Duplicate request
7. Consumer crash
8. Debit succeeds but credit fails
9. Credit succeeds but acknowledgement is lost
10. Network retry
11. Duplicate Kafka event
12. Dead-letter event

---

# 33. Reconciliation

Reconciliation is required because distributed payment systems can have ambiguous outcomes.

Example:

```text
Bank A says:
DEBITED ₹1000

Network says:
SUCCESS

Bank B says:
UNKNOWN
```

Reconciliation checks the authoritative records and determines:

```text
CONFIRMED
RETRY
REVERSAL_REQUIRED
MANUAL_REVIEW
```

Build a simple reconciliation dashboard.

---

# 34. Settlement

For inter-bank transfers, maintain simulated settlement positions.

Example:

```text
Bank A → Bank B
₹1,000

Bank A net position: -₹1,000
Bank B net position: +₹1,000
```

Settlement can run periodically.

For the student project, settlement can be simulated as a batch process rather than connected to real banking infrastructure.

---

# 35. Security

Implement:

- Argon2 or bcrypt password hashing
- JWT access tokens
- Refresh token rotation
- RBAC
- Input validation
- Parameterized SQL
- Helmet
- CORS
- Rate limiting
- Secure cookies where applicable
- Secrets through environment variables
- PII masking
- Audit logging
- Account lockout
- Idempotency
- Authorization checks at service boundaries

Never log:

- Passwords
- Full authentication tokens
- Sensitive secrets
- Unnecessary PII

---

# 36. API Design

Example gateway routes:

```text
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

GET    /api/v1/users/me
PATCH  /api/v1/users/me

POST   /api/v1/accounts
GET    /api/v1/accounts
GET    /api/v1/accounts/:id

POST   /api/v1/accounts/:id/deposit
POST   /api/v1/accounts/:id/withdraw

POST   /api/v1/beneficiaries
GET    /api/v1/beneficiaries
DELETE /api/v1/beneficiaries/:id

POST   /api/v1/payments
GET    /api/v1/payments/:id
GET    /api/v1/transactions

GET    /api/v1/statements
```

Admin:

```text
GET    /api/v1/admin/users
POST   /api/v1/admin/accounts/:id/freeze
POST   /api/v1/admin/accounts/:id/unfreeze
GET    /api/v1/admin/reconciliation
GET    /api/v1/admin/audit
```

---

# 37. API Response Convention

Success:

```json
{
  "success": true,
  "data": {},
  "requestId": "uuid"
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient available balance"
  },
  "requestId": "uuid"
}
```

Use consistent HTTP status codes.

---

# 38. React Application

Pages:

```text
Login
Register
Dashboard
Accounts
Account Details
Deposit
Withdraw
Transfer
Beneficiaries
Transactions
Statement
Notifications
Profile
Security
Admin Dashboard
Reconciliation
Audit Logs
```

Dashboard:

```text
Total Balance
Accounts
Recent Transactions
Pending Payments
Quick Actions
Notifications
```

---

# 39. Frontend Architecture

Suggested structure:

```text
frontend/
├── src/
│   ├── app/
│   ├── components/
│   ├── pages/
│   ├── features/
│   ├── services/
│   ├── hooks/
│   ├── store/
│   ├── routes/
│   ├── utils/
│   └── types/
```

Use feature-oriented organization where practical.

---

# 40. Backend Monorepo

Recommended:

```text
banking-system/
├── apps/
│   ├── frontend/
│   └── api-gateway/
│
├── services/
│   ├── auth-service/
│   ├── user-service/
│   ├── account-service/
│   ├── ledger-service/
│   ├── transaction-service/
│   ├── payment-service/
│   ├── beneficiary-service/
│   ├── bank-service/
│   ├── settlement-service/
│   ├── reconciliation-service/
│   └── notification-service/
│
├── simulators/
│   ├── payment-network/
│   └── external-bank/
│
├── infrastructure/
│   ├── postgres/
│   ├── redis/
│   ├── kafka/
│   ├── rabbitmq/
│   └── docker/
│
├── tests/
├── docs/
├── docker-compose.yml
└── README.md
```

Use a monorepo because this is a solo final-year project.

---

# 41. Docker Architecture

Local environment:

```text
                    React
                      |
                 API Gateway
                      |
       +--------------+--------------+
       |              |              |
    Services       Services       Services
       |              |              |
       +--------------+--------------+
                      |
        +-------------+-------------+
        |             |             |
     Postgres       Redis         Kafka
                                    |
                                RabbitMQ
```

Docker Compose should start the complete development environment.

---

# 42. Cloud Deployment

Initial deployment target:

```text
Docker
   ↓
AWS/Azure
```

Possible components:

- Managed PostgreSQL
- Managed Redis
- Kafka-compatible managed service
- Container hosting
- Object storage for statements
- Secrets manager

Do not make Kubernetes mandatory for the first release.

Kubernetes can be documented as a future extension.

---

# 43. CI/CD

Use GitHub Actions.

Pipeline:

```text
git push
   |
   v
Lint
   |
   v
Unit Tests
   |
   v
Integration Tests
   |
   v
Build
   |
   v
Docker Build
   |
   v
Deploy
```

---

# 44. Observability

Keep observability basic but meaningful.

Implement:

- Structured logs
- Request ID
- Correlation ID
- Service name
- Timestamp
- Log level
- Health endpoints

Example:

```text
GET /health
GET /ready
```

A request should retain a correlation ID across service calls where possible.

Future extension:

```text
OpenTelemetry
Prometheus
Grafana
Distributed tracing
```

---

# 45. Testing Strategy

## Unit Tests

Test:

- Business rules
- Ledger validation
- Limits
- Idempotency
- State transitions

## Integration Tests

Test:

- PostgreSQL transactions
- Redis
- Kafka
- RabbitMQ
- Service integration

## API Tests

Test:

- Authentication
- Authorization
- CRUD
- Payments
- Error responses

## Concurrency Tests

Critical scenario:

```text
Initial balance = ₹10,000

100 concurrent requests
attempt withdrawal of ₹500
```

Only financially valid requests should succeed.

Verify:

```text
Ledger balanced
No negative balance
No duplicate transaction
Expected final balance
```

## Failure Tests

Simulate:

```text
External bank unavailable
Kafka unavailable
Consumer crash
Timeout
Duplicate request
Credit failure
```

---

# 46. Important Invariants

The system must preserve:

### Invariant 1 — No unauthorized money movement

Every financial operation requires valid authorization.

### Invariant 2 — No double spending

Concurrent operations cannot spend the same funds twice.

### Invariant 3 — Ledger balance

Every completed journal must balance.

```text
Total Debit = Total Credit
```

### Invariant 4 — Idempotency

Same financial request cannot cause two financial effects.

### Invariant 5 — Atomic internal transfer

Internal transfer is all-or-nothing.

### Invariant 6 — Recoverability

An ambiguous inter-bank transaction must be recoverable through reconciliation/reversal.

### Invariant 7 — Auditability

Financial state changes must be traceable.

---

# 47. Example Concurrency Scenario

Initial balance:

```text
₹10,000
```

Concurrent:

```text
T1 → Withdraw ₹8,000
T2 → Withdraw ₹7,000
```

Without locking:

```text
T1 reads ₹10,000
T2 reads ₹10,000

T1 writes ₹2,000
T2 writes ₹3,000

Incorrect result
```

With row locking:

```text
T1 locks account
T1 validates ₹10,000
T1 withdraws ₹8,000
T1 commits

T2 acquires lock
T2 sees ₹2,000
T2 fails
```

Expected result:

```text
T1 = SUCCESS
T2 = INSUFFICIENT_BALANCE
Final balance = ₹2,000
```

---

# 48. Example Duplicate Request

Client sends:

```text
POST /payments

Idempotency-Key: ABC123
```

Network times out.

Client retries:

```text
POST /payments

Idempotency-Key: ABC123
```

Server finds:

```text
ABC123 → existing payment
```

It returns the existing result instead of creating a second debit.

---

# 49. Example Debit-Success / Credit-Failure

```text
Customer A
   |
   | Debit ₹5,000
   v
Bank A
   |
   v
Payment Network
   |
   X
Bank B unavailable
```

System:

```text
Payment = CREDIT_PENDING / TIMEOUT
             |
             v
      Reconciliation
             |
       +-----+------+
       |            |
 Confirmed       Unknown
                    |
                    v
              Reversal Saga
                    |
                    v
              Debit Reversed
```

Never simply assume that a timeout means the transaction failed.

---

# 50. Admin Dashboard

Include:

- User count
- Active accounts
- Frozen accounts
- Payment volume
- Failed transactions
- Pending payments
- Reconciliation mismatches
- Settlement status
- Audit events

Admin actions:

- Freeze account
- Unfreeze account
- View user
- View transaction
- View payment state
- View reconciliation
- View audit logs

---

# 51. Development Principles

1. Never share database tables between services.
2. Never trust the frontend for authorization.
3. Never use Redis as financial source of truth.
4. Never use floating-point values for money.
5. Never publish financial events before database commit.
6. Never perform a non-idempotent financial operation without an idempotency strategy.
7. Never assume network timeout equals transaction failure.
8. Keep financial state transitions explicit.
9. Keep auditability from the beginning.
10. Test concurrency, not only normal flows.

---

# 52. 10-Day Implementation Plan

The goal is to produce a **working MVP with advanced architecture**, not to perfectly implement every theoretical banking feature.

## Day 1 — Foundation + Architecture

### Build

- Monorepo
- Node.js/TypeScript setup
- React setup
- API Gateway
- Docker Compose
- PostgreSQL
- Redis
- Kafka
- RabbitMQ
- Environment configuration
- Common logging/request ID utilities

### Deliverable

```text
React → API Gateway → Service
```

working locally.

---

## Day 2 — Auth + User + Account

### Build

- Auth service
- User service
- Account service
- Registration
- Login
- JWT
- Refresh tokens
- RBAC
- User CRUD
- Account CRUD

### Deliverable

User can:

```text
Register
Login
Create account
View account
```

---

## Day 3 — Ledger + Deposit + Withdrawal

This is the most important day.

### Build

- Ledger service
- Journal
- Ledger entries
- Double-entry validation
- Deposit
- Withdrawal
- PostgreSQL transactions
- Account locking

### Deliverable

```text
Deposit
   ↓
Ledger

Withdrawal
   ↓
Ledger
```

with correct balances.

---

## Day 4 — Internal Transfers + Concurrency

### Build

- Internal transfer
- `SELECT FOR UPDATE`
- Idempotency
- Transaction lifecycle
- Optimistic locking
- Isolation-level experiments
- Concurrent withdrawal tests

### Deliverable

Demonstrate:

```text
100 concurrent requests
        ↓
same account
        ↓
no double spending
```

---

## Day 5 — Kafka + Outbox + Notifications

### Build

- Transactional outbox
- Kafka producer
- Kafka consumers
- Payment events
- Ledger events
- Transaction events
- Notification service
- RabbitMQ notification queue
- Retry
- DLQ

### Deliverable

```text
Transaction
   ↓
DB + Outbox
   ↓
Kafka
   ↓
Notification
   ↓
RabbitMQ
```

---

## Day 6 — Inter-Bank Payment Network

### Build

- Bank service
- Payment service
- External bank simulator
- Payment-network simulator
- Bank routing
- Inter-bank transfer
- Payment state machine

### Deliverable

```text
Bank A
  ↓
Payment Service
  ↓
Network Simulator
  ↓
Bank B
  ↓
External Account
```

working end-to-end.

---

## Day 7 — Saga + Failure Handling + Reversal

### Build

- Saga orchestration
- Timeout handling
- Retry
- Compensation
- Reversal
- Duplicate event handling
- External bank failure simulation

### Demo:

```text
Debit succeeds
Credit fails
   ↓
Saga
   ↓
Reversal
```

Also:

```text
Request timeout
   ↓
Reconciliation
```

---

## Day 8 — Beneficiaries + Statements + Reconciliation

### Build

- Beneficiary CRUD
- Beneficiary verification
- Cooling period simulation
- Transaction filters
- Statement generation
- Settlement simulation
- Reconciliation service

### Deliverable

Admin can see:

```text
Settlement
Reconciliation
Mismatches
Failed payments
```

---

## Day 9 — React Banking UI + Security + Testing

### Build

Frontend:

- Login
- Dashboard
- Accounts
- Deposit
- Withdrawal
- Transfer
- Beneficiaries
- Transactions
- Profile
- Admin

Security:

- Rate limiting
- Input validation
- Helmet
- CORS
- Authorization checks
- PII masking

Testing:

- Unit
- Integration
- API
- Concurrency
- Failure tests

---

## Day 10 — Docker + Cloud + Demo + Documentation

### Build

- Production Dockerfiles
- Docker Compose cleanup
- CI pipeline
- Cloud deployment
- Health checks
- Structured logging
- README
- Architecture diagram
- API documentation
- Demo dataset

### Final demo scenarios

#### Demo 1 — Normal transfer

```text
A → B ₹1,000
SUCCESS
```

#### Demo 2 — Concurrent withdrawal

```text
100 concurrent withdrawals
NO double spending
```

#### Demo 3 — Duplicate request

```text
Same idempotency key
ONE financial effect
```

#### Demo 4 — Inter-bank transfer

```text
Bank A → Network → Bank B
```

#### Demo 5 — Failure

```text
Bank B unavailable
      ↓
Timeout
      ↓
Reconciliation
      ↓
Reversal
```

#### Demo 6 — Event-driven architecture

```text
Transaction
 → Outbox
 → Kafka
 → Notification
 → RabbitMQ
```

---

# 53. Priority Matrix for the 10 Days

## MUST HAVE

```text
Authentication
User
Account
Deposit
Withdrawal
Ledger
Internal Transfer
PostgreSQL Transactions
Concurrency
Idempotency
API Gateway
Kafka
Outbox
Inter-bank Transfer
Saga
Failure Handling
React Dashboard
Docker
Tests
```

## SHOULD HAVE

```text
Beneficiary
Notifications
Reconciliation
Settlement
Statements
Admin Dashboard
Redis Rate Limiting
RabbitMQ
CI/CD
```

## NICE TO HAVE

```text
Advanced analytics
OpenTelemetry
Prometheus
Grafana
Kubernetes
Advanced reporting
Advanced fraud detection
Multiple account interest engines
```

If time becomes constrained, do **not** sacrifice ledger correctness and concurrency to add cosmetic features.

---

# 54. Suggested Git Commit Strategy

Use meaningful commits:

```text
feat: initialize banking monorepo
feat: add api gateway
feat: add authentication service
feat: add user service
feat: add account service
feat: implement double entry ledger
feat: implement deposit and withdrawal
feat: implement internal transfer
test: add concurrent withdrawal tests
feat: add redis locking and rate limiting
feat: add kafka event infrastructure
feat: implement transactional outbox
feat: add notification service
feat: add payment network simulator
feat: implement interbank transfer
feat: implement saga compensation
feat: add reconciliation
feat: add react banking dashboard
test: add failure scenarios
ci: add github actions
docs: add architecture documentation
```

---

# 55. Final Architecture

```text
                         ┌─────────────────┐
                         │   React Client  │
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │   API Gateway   │
                         └────────┬────────┘
                                  │
          ┌───────────────────────┼────────────────────────┐
          │                       │                        │
          ▼                       ▼                        ▼
   Auth / User              Account / Ledger        Payment / Txn
   Services                 Services                Services
          │                       │                        │
          └───────────────────────┼────────────────────────┘
                                  │
                     ┌────────────┼────────────┐
                     │            │            │
                     ▼            ▼            ▼
                PostgreSQL      Redis         Kafka
                     │                         │
                     │                         ▼
                     │                    Event Consumers
                     │                         │
                     │                         ▼
                     │                    RabbitMQ
                     │                         │
                     │                         ▼
                     │                  Notification
                     │
                     ▼
               Outbox Tables


                    Payment Service
                          │
                          ▼
                Payment Network Simulator
                          │
                 ┌────────┴────────┐
                 ▼                 ▼
             Bank A             Bank B
                 │                 │
                 ▼                 ▼
              Ledger            Ledger


                Settlement Service
                       │
                       ▼
             Reconciliation Service
```

---

# 56. Key Interview Topics Demonstrated

This project should allow you to discuss:

### Backend

- REST APIs
- Node.js
- Express/Fastify
- Authentication
- Authorization
- API Gateway
- Microservices

### Databases

- PostgreSQL
- ACID
- Transactions
- Isolation levels
- Row locks
- Optimistic locking
- Deadlocks
- Indexing
- Database-per-service

### Distributed Systems

- Event-driven architecture
- Kafka
- RabbitMQ
- Saga
- Outbox
- Idempotency
- Eventual consistency
- Retry
- DLQ
- Reconciliation

### Redis

- Caching
- Distributed locking
- Rate limiting

### Financial systems

- Double-entry ledger
- Balance integrity
- Settlement
- Reversal
- Transaction lifecycle
- Exactly-once effect vs at-least-once delivery

### Reliability

- Timeouts
- Retries
- Duplicate requests
- Partial failures
- Consumer crashes
- Network failures

### Frontend

- React
- State management
- Protected routes
- API integration
- Dashboard design

### DevOps

- Docker
- Docker Compose
- CI/CD
- Cloud deployment
- Health checks
- Logs

---

# 57. Most Important Design Principle

The project should not be judged by how many technologies appear in `docker-compose.yml`.

The strongest part should be the correctness of money movement:

```text
                    MONEY MOVEMENT

                         |
                         v
                 Authentication
                         |
                         v
                    Validation
                         |
                         v
                    Idempotency
                         |
                         v
                 Concurrency Lock
                         |
                         v
                  PostgreSQL TX
                         |
              ┌──────────┴──────────┐
              v                     v
           Debit                 Credit
              │                     │
              └──────────┬──────────┘
                         v
                 Double-Entry Ledger
                         |
                         v
                  Outbox Event
                         |
                         v
                       Kafka
                         |
                         v
                 Distributed Workflow
                         |
                    ┌────┴────┐
                    v         v
                 Success    Failure
                              |
                              v
                          Reversal
                              |
                              v
                       Reconciliation
```

That is the core of the project.

---

# 58. Recommended Final Project Name

Possible names:

- **BankFlow**
- **FinCore**
- **BankSphere**
- **NexBank**
- **CoreBankX**
- **FinLedger**
- **BankMesh**

Recommended:

# BankFlow — Distributed Banking & Payment Processing Platform

Subtitle:

> A production-style microservices banking simulation with double-entry ledger, concurrent transaction processing, event-driven payments, inter-bank transfer simulation, Saga-based recovery, and reconciliation.

---

# 59. Resume-Level Description

> Built a production-style microservices banking platform using React, Node.js, PostgreSQL, Redis, Kafka, and RabbitMQ, implementing double-entry ledger accounting, concurrent transaction control, idempotent payments, transactional outbox, Saga-based inter-bank transfers, failure recovery, settlement and reconciliation.

---

# 60. Final Success Criteria

The project is considered complete when it can demonstrate all of the following:

```text
[✓] User registration/login
[✓] JWT authentication
[✓] RBAC
[✓] Multiple accounts
[✓] Deposit
[✓] Withdrawal
[✓] Double-entry ledger
[✓] Internal transfer
[✓] Inter-bank transfer
[✓] Payment state machine
[✓] Idempotency
[✓] PostgreSQL locking
[✓] Concurrent transaction safety
[✓] Redis
[✓] Kafka
[✓] RabbitMQ
[✓] Transactional outbox
[✓] Saga
[✓] Retry
[✓] DLQ
[✓] Reversal
[✓] External bank simulator
[✓] Payment network simulator
[✓] Settlement
[✓] Reconciliation
[✓] Notifications
[✓] React banking UI
[✓] Admin dashboard
[✓] Automated tests
[✓] Failure simulation
[✓] Docker
[✓] CI/CD
[✓] Cloud deployment
[✓] Architecture documentation
```

The implementation should prioritize **financial correctness, concurrency, distributed failure handling, and demonstrable system-design decisions** over adding more superficial features.
