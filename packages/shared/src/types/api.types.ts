// ────────────────────────────────────────────────────────────────────────────
// BankFlow — Shared API Types
//
// All API responses follow this envelope format:
//
// Success:
//   { success: true, data: T, requestId: string }
//
// Error:
//   { success: false, error: { code: string, message: string }, requestId: string }
// ────────────────────────────────────────────────────────────────────────────

/** Standard success response envelope */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  requestId: string;
  meta?: PaginationMeta;
}

/** Standard error response envelope */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>; // field-level validation errors
    stack?: string; // dev only
  };
  requestId: string;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/** Pagination metadata attached to list responses */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/** Pagination query params */
export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ─── User / Auth ─────────────────────────────────────────────────────────────

export type UserRole = 'CUSTOMER' | 'EMPLOYEE' | 'ADMIN' | 'AUDITOR';

export interface JwtPayload {
  sub: string;       // userId
  email: string;
  role: UserRole;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  status: 'ACTIVE' | 'LOCKED' | 'DEACTIVATED';
  createdAt: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  role?: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  kycDocuments?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
  dateOfBirth?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

// ─── Account ─────────────────────────────────────────────────────────────────

export type AccountType = 'SAVINGS' | 'CURRENT' | 'FIXED_DEPOSIT';

export type AccountStatus = 'PENDING' | 'ACTIVE' | 'FROZEN' | 'BLOCKED' | 'CLOSED';

// ─── Transaction ─────────────────────────────────────────────────────────────

export type TransactionType =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'INTERNAL_TRANSFER'
  | 'INTER_BANK_TRANSFER'
  | 'REVERSAL';

export type TransactionStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REVERSED'
  | 'REFUNDED';

// ─── Payment ─────────────────────────────────────────────────────────────────

export type PaymentStatus =
  | 'INITIATED'
  | 'VALIDATING'
  | 'DEBIT_PENDING'
  | 'DEBITED'
  | 'SENT_TO_NETWORK'
  | 'ROUTED'
  | 'CREDIT_PENDING'
  | 'CREDITED'
  | 'ACKNOWLEDGED'
  | 'SETTLEMENT_PENDING'
  | 'SETTLED'
  | 'FAILED'
  | 'TIMEOUT'
  | 'REVERSAL_PENDING'
  | 'REVERSED'
  | 'RECONCILIATION_REQUIRED';

// ─── Ledger ──────────────────────────────────────────────────────────────────

export type LedgerEntryType = 'DEBIT' | 'CREDIT';

/** Money is always stored as BIGINT minor units (paise for INR) */
export type AmountMinor = number; // e.g., ₹100.50 → 10050 paise

export type Currency = 'INR';

// ─── Service Health ──────────────────────────────────────────────────────────

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  service: string;
  version: string;
  timestamp: string;
  uptime: number; // seconds
}

export interface ReadyResponse {
  status: 'ready' | 'not_ready';
  service: string;
  checks: Record<string, 'ok' | 'fail' | 'skip'>;
}
