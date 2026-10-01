import 'dotenv/config';

// ─── AI Assistant Service Config ─────────────────────────────────────────────

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: parseInt(optional('AI_ASSISTANT_PORT', '3012'), 10),
  serviceName: 'ai-assistant-service',

  // Google Gemini
  geminiApiKey: optional('GEMINI_API_KEY', ''),
  embeddingModel: optional('EMBEDDING_MODEL', 'text-embedding-004'),
  chatModel: optional('CHAT_MODEL', 'gemini-1.5-flash'),

  // Qdrant Vector DB
  qdrantUrl: optional('QDRANT_URL', 'http://localhost:6333'),
  qdrantCollectionName: optional('QDRANT_COLLECTION', 'bankflow_knowledge'),
  vectorDimensions: 768,

  // Retrieval tuning
  ragTopKVector: parseInt(optional('RAG_TOP_K_VECTOR', '15'), 10),
  ragTopKBm25: parseInt(optional('RAG_TOP_K_BM25', '15'), 10),
  ragRerankTopN: parseInt(optional('RAG_RERANK_TOP_N', '6'), 10),
  abstentionThreshold: parseFloat(optional('ABSTENTION_THRESHOLD', '0.35')),

  // Redis
  redisUrl: optional('REDIS_URL', 'redis://localhost:6379'),
  conversationTtlSeconds: parseInt(optional('CONVERSATION_TTL_SECONDS', '7200'), 10),
  cacheTtlSeconds: parseInt(optional('RAG_CACHE_TTL_SECONDS', '300'), 10),

  // Cohere reranker (optional — falls back to cosine similarity)
  cohereApiKey: optional('COHERE_API_KEY', ''),

  // Banking service URLs (used by tools to call live APIs)
  gatewayUrl: optional('GATEWAY_URL', 'http://localhost:3000/api/v1'),
  accountServiceUrl: optional('ACCOUNT_SERVICE_URL', 'http://localhost:3003'),
  ledgerServiceUrl: optional('LEDGER_SERVICE_URL', 'http://localhost:3004'),
  transactionServiceUrl: optional('TRANSACTION_SERVICE_URL', 'http://localhost:3005'),
  paymentServiceUrl: optional('PAYMENT_SERVICE_URL', 'http://localhost:3006'),
  beneficiaryServiceUrl: optional('BENEFICIARY_SERVICE_URL', 'http://localhost:3007'),

  // JWT (for verifying incoming user tokens — MUST be set via JWT_ACCESS_SECRET env var)
  jwtSecret: optional('JWT_ACCESS_SECRET', optional('JWT_SECRET', '')),

  // Knowledge base PDF folder path
  knowledgeDir: optional('KNOWLEDGE_DIR', '../../BankFlow_RAG_Knowledge_Base'),
  chunksFile: optional('CHUNKS_FILE', './data/chunks.jsonl'),
  embeddingCacheFile: optional('EMBEDDING_CACHE_FILE', './data/embedding_cache.json'),
} as const;

export type Config = typeof config;
