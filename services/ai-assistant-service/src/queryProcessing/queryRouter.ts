import { QueryType } from '../schema/chunk';
import { createLogger } from '@bankflow/shared';

const logger = createLogger('ai-assistant:query-router');

// ─── Query Router ─────────────────────────────────────────────────────────────
//
// Classifies an incoming query into one of 7 categories using rule-based
// keyword matching first (fast, free), falling back gracefully.
//
// Categories:
//   GENERAL_BANKING        — Generic banking concepts (NEFT, RTGS, IFSC…)
//   BANKFLOW_DOCUMENTATION — Questions about BankFlow product features/states
//   LIVE_ACCOUNT_DATA      — "What is my balance?", "show my accounts"
//   LIVE_TRANSACTION_DATA  — "Status of payment TX123", "recent transactions"
//   HYBRID                 — Combines live data + knowledge (e.g., "Why is TX123 pending?")
//   FINANCIAL_ACTION       — Requests to execute a transfer/payment (BLOCKED by AI)
//   UNSUPPORTED            — Off-topic, cannot be answered from banking context

// ─── Pattern sets ─────────────────────────────────────────────────────────────

const FINANCIAL_ACTION_PATTERNS = [
  /\b(transfer|send|pay|deposit|withdraw|move)\s+(money|funds|rupees|rs\.?|inr|\u20b9|\d)/i,
  /\b(make|do|execute|initiate|start)\s+(a\s+)?(payment|transfer|withdrawal|transaction)/i,
  /\badd\s+(a\s+)?beneficiary\b/i,
  /\b(create|add|register|save)\s+(new\s+)?(payee|recipient|account)\b/i,
  /\bpay\s+(my\s+)?\w+(\s+bill)?\b/i,
];

const LIVE_ACCOUNT_PATTERNS = [
  /\b(my|current|available)\s+balance\b/i,
  /\bshow\s+(me\s+)?(my\s+)?accounts?\b/i,
  /\bhow\s+much\s+(do\s+i\s+have|is\s+in\s+my|money)\b/i,
  /\b(list|view|see)\s+(my\s+)?accounts?\b/i,
  /\bmy\s+account\s+(details?|info|number|balance)\b/i,
];

const LIVE_TRANSACTION_PATTERNS = [
  /\b(status|state|update)\s+(of\s+)?(payment|transfer|transaction|tx)\b/i,
  /\b(payment|transaction|transfer)\s+[A-Z0-9\-]{3,}\b/i,     // "TX123", "PAY-456"
  /\b(recent|latest|last)\s+(transactions?|payments?|transfers?)\b/i,
  /\bwhy\s+is\s+.{0,30}(pending|stuck|delayed|failed|reversed)\b/i,
  /\b(track|check)\s+(my\s+)?(payment|transfer|transaction)\b/i,
  /\bbeneficiar(y|ies)\b/i,
];

const HYBRID_PATTERNS = [
  /\bwhy\s+is\s+.{0,20}(tx|payment|transfer)\b/i,
  /\bwhat\s+does\s+.{0,30}(mean|status|state)\b/i,
  /\bhow\s+long\s+(will|does|should)\s+.{0,30}(take|be|wait)\b/i,
  /\b(explain|tell\s+me\s+about)\s+(my|the)\s+(payment|transfer|transaction)\b/i,
];

const BANKFLOW_DOC_PATTERNS = [
  /\bbankflow\b/i,
  /\b(credit_pending|debit_pending|dispatched|settlement|reconcil)/i,
  /\b(saga|payment\s+state|payment\s+status\s+mean|what\s+is\s+a\s+payment)\b/i,
  /\b(internal\s+transfer|inter[\s-]bank|neft|rtgs|imps|upi)\s+(work|process|mean|differ)/i,
  /\b(how\s+does|what\s+is)\s+(the\s+)?(payment|settlement|reconciliation)\s+(process|work|system)\b/i,
];

const GENERAL_BANKING_PATTERNS = [
  /\bwhat\s+is\s+(neft|rtgs|imps|upi|ifsc|micr|swift|iban)\b/i,
  /\b(double[\s-]entry|ledger|debit|credit)\s+(accounting|system|book)\b/i,
  /\b(bank(ing)?|financial)\s+(regulation|compliance|kyc|aml)\b/i,
  /\bwhat\s+is\s+a?\s+(bank|banking|payment|transaction|transfer)\b/i,
  /\b(interest|emi|loan|mortgage|savings|fixed\s+deposit)\b/i,
];

const UNSUPPORTED_PATTERNS = [
  /\b(weather|sports|cricket|movie|recipe|cook|joke|story|poem)\b/i,
  /\b(who\s+is|what\s+is\s+the\s+capital|population\s+of)\b/i,
  /\bwrite\s+(code|script|program|email|letter)\b/i,
  /\btell\s+me\s+a\s+/i,
];

// ─── Classifier ───────────────────────────────────────────────────────────────

export function classifyQuery(query: string): QueryType {
  const q = query.trim();

  // 1. Financial actions — highest priority (must never execute)
  if (FINANCIAL_ACTION_PATTERNS.some((p) => p.test(q))) {
    logger.debug(`Query classified: FINANCIAL_ACTION`, { query: q.substring(0, 80) });
    return 'FINANCIAL_ACTION';
  }

  // 2. Clearly off-topic
  if (UNSUPPORTED_PATTERNS.some((p) => p.test(q))) {
    logger.debug(`Query classified: UNSUPPORTED`, { query: q.substring(0, 80) });
    return 'UNSUPPORTED';
  }

  // 3. Hybrid — live data + knowledge needed
  const needsLiveTx   = LIVE_TRANSACTION_PATTERNS.some((p) => p.test(q));
  const needsLiveAcct = LIVE_ACCOUNT_PATTERNS.some((p) => p.test(q));
  const needsDocs     = BANKFLOW_DOC_PATTERNS.some((p) => p.test(q));
  const needsGeneral  = GENERAL_BANKING_PATTERNS.some((p) => p.test(q));
  const isHybrid      = HYBRID_PATTERNS.some((p) => p.test(q));

  if (isHybrid || (needsLiveTx && (needsDocs || needsGeneral))) {
    logger.debug(`Query classified: HYBRID`, { query: q.substring(0, 80) });
    return 'HYBRID';
  }

  if (needsLiveTx) {
    logger.debug(`Query classified: LIVE_TRANSACTION_DATA`, { query: q.substring(0, 80) });
    return 'LIVE_TRANSACTION_DATA';
  }

  if (needsLiveAcct) {
    logger.debug(`Query classified: LIVE_ACCOUNT_DATA`, { query: q.substring(0, 80) });
    return 'LIVE_ACCOUNT_DATA';
  }

  if (needsDocs) {
    logger.debug(`Query classified: BANKFLOW_DOCUMENTATION`, { query: q.substring(0, 80) });
    return 'BANKFLOW_DOCUMENTATION';
  }

  if (needsGeneral) {
    logger.debug(`Query classified: GENERAL_BANKING`, { query: q.substring(0, 80) });
    return 'GENERAL_BANKING';
  }

  // Default: treat as general banking knowledge query (RAG will handle or abstain)
  logger.debug(`Query classified: GENERAL_BANKING (default)`, { query: q.substring(0, 80) });
  return 'GENERAL_BANKING';
}

/**
 * Returns true if this query type requires knowledge base retrieval.
 */
export function requiresRetrieval(queryType: QueryType): boolean {
  return !['LIVE_ACCOUNT_DATA', 'FINANCIAL_ACTION', 'UNSUPPORTED'].includes(queryType);
}

/**
 * Returns true if this query type requires live banking tool calls.
 */
export function requiresLiveData(queryType: QueryType): boolean {
  return ['LIVE_ACCOUNT_DATA', 'LIVE_TRANSACTION_DATA', 'HYBRID'].includes(queryType);
}
