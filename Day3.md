# BankFlow — Day 3 Implementation Summary

## Day 3: Account Service, Balance Projection Engine, Limits & Bootstrap Account Dashboard

This document provides a comprehensive technical breakdown of everything implemented and verified during **Day 3** of the BankFlow Enterprise Banking System.

---

## 1. Shared Package (`@bankflow/shared`) Extensions

We expanded the shared API models with account management contracts:

- **`Account` Interface**:
  - `id`: Unique UUID primary key.
  - `accountNumber`: 12-digit bank account number.
  - `userId`: Owner reference UUID.
  - `accountType`: `SAVINGS`, `CURRENT`, `FIXED_DEPOSIT`.
  - `currency`: `INR`.
  - `balance`: Total ledger balance in paise (`BIGINT`).
  - `availableBalance`: Total balance minus active reserved holds (`BIGINT`).
  - `status`: `ACTIVE`, `FROZEN`, `BLOCKED`, `CLOSED`.
  - `dailyTransferLimit`: Maximum allowed cumulative daily transfers in paise (default: ₹100,000.00).
  - `singleTransactionLimit`: Maximum single transaction amount in paise (default: ₹50,000.00).
- **`AccountHold` Interface**: Holds placed on accounts for pending transactions or verification.

---

## 2. Account Service Implementation (`services/account-service`)

The `account-service` is responsible for account lifecycle management, 12-digit account number generation, status controls, and balance projections.

```
services/account-service/
├── src/
│   ├── config.ts              # Port 3003, default limits, DB config
│   ├── db.ts                  # PostgreSQL pool (Neon Cloud + local)
│   ├── schema.sql             # accounts & account_holds tables
│   ├── utils/
│   │   └── accountNumber.ts   # 12-digit unique account number generator
│   └── index.ts               # Express API endpoints
```

### Key Technical Specs:
1. **12-Digit Account Generator**: Generates cryptographically randomized 12-digit account numbers prefixed with `1000XXXXXXXX`.
2. **Paise Precision**: All monetary values are strictly converted to minor units (`BIGINT` paise, e.g., ₹5,000.00 -> `500000` paise) to eliminate JavaScript floating-point errors.
3. **Balance Projection Engine**: Computes `availableBalance` dynamically by subtracting active hold reservations from total `balance`.
4. **Account State Machine**: Supports transitions between `ACTIVE`, `FROZEN`, `BLOCKED`, and `CLOSED`. Blocked or frozen accounts reject outgoing transfer requests.

### Endpoints Implemented:
- `POST /`: Open new bank account with initial deposit & default limits.
- `GET /`: List all accounts owned by the logged-in customer.
- `GET /:id`: Get detailed account info & available balance projection.
- `PATCH /:id/status`: Update account status (`FREEZE`, `UNFREEZE`, `BLOCK`, `CLOSE`).
- `PATCH /:id/limits`: Update daily transfer limit and single transaction limit.

---

## 3. Bootstrap Account Dashboard (`apps/frontend`)

Per project guidelines, **every major UI component has its own dedicated `.css` file**.

```
apps/frontend/src/
├── components/
│   ├── AccountList/
│   │   ├── AccountList.tsx           # Account cards dashboard
│   │   └── AccountList.css           # Dedicated styling
│   ├── OpenAccountModal/
│   │   ├── OpenAccountModal.tsx      # Account creation modal
│   │   └── OpenAccountModal.css      # Dedicated styling
│   └── AccountDetailsModal/
│       ├── AccountDetailsModal.tsx   # Limits & status management modal
│       └── AccountDetailsModal.css   # Dedicated styling
```

### Component Highlights:
- **`AccountList.tsx` & `AccountList.css`**: Card grid layout displaying 12-digit account numbers, ₹ INR balance formatting, status pills, and action controls.
- **`OpenAccountModal.tsx` & `OpenAccountModal.css`**: Floating backdrop modal with account type dropdown (`SAVINGS`, `CURRENT`, `FIXED_DEPOSIT`) and custom initial deposit input.
- **`AccountDetailsModal.tsx` & `AccountDetailsModal.css`**: Balance breakdown view (Total vs Available balance), interactive form to update daily/single limits, and Freeze/Unfreeze toggles.

---

## Summary of Day 3 Verification
✅ `npm run build` executed across the monorepo — **100% clean compilation with 0 errors**.
✅ Account service endpoints implemented with Neon PostgreSQL database schema & in-memory fallback.
✅ Bootstrap 5 frontend upgraded with dedicated `.css` files for all account components.
