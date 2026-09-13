// ────────────────────────────────────────────────────────────────────────────
// @bankflow/shared — Main Export
// ────────────────────────────────────────────────────────────────────────────

// Logger
export { createLogger, childLogger, defaultLogger } from './logger';
export type { Logger } from './logger';

// Middleware
export { requestIdMiddleware } from './middleware/requestId';
export { correlationIdMiddleware, forwardHeaders } from './middleware/correlationId';
export { errorHandler, AppError, Errors } from './middleware/errorHandler';
export { authenticateToken, requireRole } from './middleware/auth';

// Types — API
export type {
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse,
  PaginationMeta,
  PaginationQuery,
  UserRole,
  JwtPayload,
  AuthUser,
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  UserProfile,
  UpdateProfileRequest,
  AccountType,
  AccountStatus,
  TransactionType,
  TransactionStatus,
  PaymentStatus,
  LedgerEntryType,
  AmountMinor,
  Currency,
  HealthResponse,
  ReadyResponse,
} from './types/api.types';

// Types — Events
export type {
  BaseEvent,
  KafkaTopic,
  UserEventType,
  UserRegisteredPayload,
  AccountEventType,
  AccountOpenedPayload,
  TransactionEventType,
  TransactionCompletedPayload,
  PaymentEventType,
  PaymentEventPayload,
  LedgerEventType,
  JournalPostedPayload,
  AuditEventType,
  AuditEventPayload,
  OutboxEvent,
} from './types/events.types';

export { KafkaTopics } from './types/events.types';
