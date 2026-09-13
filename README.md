# BankFlow — Distributed Banking & Payment Processing Platform

> A production-style microservices banking simulation demonstrating double-entry ledger accounting, concurrent transaction processing, event-driven payments, inter-bank transfer simulation, Saga-based recovery, and reconciliation.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript + Bootstrap 5 |
| API Gateway | Node.js + Express + TypeScript |
| Services | Node.js + Express + TypeScript (11 microservices) |
| Databases | Neon (Serverless PostgreSQL) — one DB per service |
| Cache / Locks | Redis 7 |
| Event Streaming | Apache Kafka 3.7 (KRaft) |
| Background Jobs | RabbitMQ 3.13 |
| Containerization | Docker + Docker Compose |

## Architecture

```
React (5173 / Bootstrap 5 UI)
    │
    ▼
API Gateway (3000)  ← Single entry point
    │
    ├── auth-service          :3001  → auth_db
    ├── user-service          :3002  → user_db
    ├── account-service       :3003  → account_db
    ├── ledger-service        :3004  → ledger_db  ← Most critical
    ├── transaction-service   :3005  → transaction_db
    ├── payment-service       :3006  → payment_db
    ├── beneficiary-service   :3007  → beneficiary_db
    ├── bank-service          :3008  → bank_db
    ├── settlement-service    :3009  → settlement_db
    ├── reconciliation-service:3010  → reconciliation_db
    └── notification-service  :3011  → notification_db

Infrastructure (Docker):
    Redis      :6379
    Kafka      :9092  (Kafka UI: :8080)
    RabbitMQ   :5672  (Management: :15672)

Databases (Neon — cloud):
    11 PostgreSQL databases, one per service
```

## Getting Started

### Prerequisites

- Node.js >= 20
- Docker + Docker Compose
- Neon account (free tier)

### 1. Install & Build

```bash
npm install
npm run build
```

### 2. Configure Environment

```bash
cp .env.example .env
# Fill in your Neon connection strings, Redis password, JWT secrets
```

### 3. Start Infrastructure

```bash
docker compose up -d
# Starts Redis + Kafka + RabbitMQ
# Kafka UI:       http://localhost:8080
# RabbitMQ UI:    http://localhost:15672
```

### 4. Start Monorepo Services

```bash
npm run dev
```

## API Endpoints & Day Summary

- **Day 1**: Monorepo workspace setup, API Gateway, `@bankflow/shared` library, Kafka/RabbitMQ docker infra, microservice stubs. [Day1.md](file:///e:/PROJECTS/Banking_System/Day1.md)
- **Day 2**: `auth-service` & `user-service`, PostgreSQL schemas, JWT access/refresh rotation, RBAC, account lockout, and Bootstrap 5 React UI. [Day2.md](file:///e:/PROJECTS/Banking_System/Day2.md)

---
*Repository URL: https://github.com/Sidchav5/Banking_System_Service*
