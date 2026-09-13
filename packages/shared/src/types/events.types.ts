// ────────────────────────────────────────────────────────────────────────────
// BankFlow — Kafka Domain Event Types
//
// All Kafka events follow this envelope structure.
// Consumers MUST be idempotent — they may receive the same event more than once.
//
// Every event has:
//   eventId       → UUID, used for deduplication
//   eventType     → string constant (e.g. "PAYMENT_COMPLETED")
//   aggregateId   → ID of the primary entity (userId, accountId, paymentId)
//   timestamp     → ISO-8601 UTC
//   version       → schema version for forward compatibility
//   payload       → event-specific data
// ────────────────────────────────────────────────────────────────────────────

export interface BaseEvent<T = unknown> {
  eventId: string;          // UUID v4 — used for idempotency checks
  eventType: string;        // e.g. 'PAYMENT_COMPLETED'
  aggregateId: string;      // Primary entity ID
  aggregateType: string;    // e.g. 'Payment', 'Account'
  timestamp: string;        // ISO-8601
  version: number;          // Schema version
  correlationId?: string;   // Traces the originating request
  requestId?: string;
  payload: T;
}

// ─── Kafka Topics ─────────────────────────────────────────────────────────

export const KafkaTopics = {
  USER_EVENTS: 'user.events',
  ACCOUNT_EVENTS: 'account.events',
  TRANSACTION_EVENTS: 'transaction.events',
  PAYMENT_EVENTS: 'payment.events',
  LEDGER_EVENTS: 'ledger.events',
  SETTLEMENT_EVENTS: 'settlement.events',
  RECONCILIATION_EVENTS: 'reconciliation.events',
  AUDIT_EVENTS: 'audit.events',
  OUTBOX_EVENTS: 'bankflow.outbox',
} as const;

export type KafkaTopic = (typeof KafkaTopics)[keyof typeof KafkaTopics];

// ─── Event Types ──────────────────────────────────────────────────────────

// User Events
export type UserEventType = 'USER_REGISTERED' | 'USER_UPDATED' | 'USER_DEACTIVATED';

export interface UserRegisteredPayload {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

// Account Events
export type AccountEventType =
  | 'ACCOUNT_OPENED'
  | 'ACCOUNT_CLOSED'
  | 'ACCOUNT_FROZEN'
  | 'ACCOUNT_UNFROZEN';

export interface AccountOpenedPayload {
  accountId: string;
  userId: string;
  accountType: string;
  currency: string;
}

// Transaction Events
export type TransactionEventType =
  | 'DEPOSIT_COMPLETED'
  | 'WITHDRAWAL_COMPLETED'
  | 'TRANSFER_COMPLETED'
  | 'TRANSACTION_FAILED';

export interface TransactionCompletedPayload {
  transactionId: string;
  accountId: string;
  amountMinor: number;
  currency: string;
  type: string;
  newBalanceMinor: number;
}

// Payment Events
export type PaymentEventType =
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_DEBITED'
  | 'PAYMENT_SENT_TO_NETWORK'
  | 'PAYMENT_CREDITED'
  | 'PAYMENT_COMPLETED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_TIMEOUT'
  | 'PAYMENT_REVERSAL_INITIATED'
  | 'PAYMENT_REVERSED';

export interface PaymentEventPayload {
  paymentId: string;
  sourceAccountId: string;
  destinationAccountId?: string;
  destinationBankCode?: string;
  amountMinor: number;
  currency: string;
  status: string;
  failureReason?: string;
}

// Ledger Events
export type LedgerEventType = 'JOURNAL_POSTED' | 'LEDGER_BALANCED' | 'LEDGER_IMBALANCE_DETECTED';

export interface JournalPostedPayload {
  journalId: string;
  transactionId: string;
  totalDebitsMinor: number;
  totalCreditsMinor: number;
  balanced: boolean;
}

// Audit Events
export type AuditEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'ACCOUNT_LOCKED'
  | 'PASSWORD_CHANGED'
  | 'SENSITIVE_DATA_ACCESSED'
  | 'ADMIN_ACTION';

export interface AuditEventPayload {
  actorId: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, string>;
}

// Outbox Event (stored in DB, published to Kafka by outbox publisher)
export interface OutboxEvent {
  id: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  topic: KafkaTopic;
  payload: string; // JSON stringified
  published: boolean;
  publishedAt?: string;
  createdAt: string;
  retryCount: number;
  lastError?: string;
}
