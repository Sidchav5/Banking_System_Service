import { config } from '../config';

// ─── Retrieval Configuration ──────────────────────────────────────────────────
// All tunable knobs in one place. Values come from env vars with sensible defaults.
// Adjust these during Day 17 evaluation to optimise Recall@K, Precision@K, MRR.

export const retrievalConfig = {
  // Step 1: Vector search — how many candidates to fetch from Qdrant
  vectorTopK: config.ragTopKVector,         // default: 15

  // Step 1: BM25 search — how many candidates to fetch from keyword index
  bm25TopK: config.ragTopKBm25,             // default: 15

  // Step 2: After RRF fusion, total candidates passed to reranker
  // (The union of vector + BM25 results, capped at fusionTopK)
  fusionTopK: Math.max(config.ragTopKVector, config.ragTopKBm25),

  // Step 3: After reranking, how many chunks to pass to context builder
  rerankTopN: config.ragRerankTopN,         // default: 6

  // Step 4: Maximum number of chunks included in the LLM context window
  maxContextChunks: config.ragRerankTopN,

  // Abstention: if the top chunk's relevance score is below this, abstain
  abstentionThreshold: config.abstentionThreshold,  // default: 0.35

  // Maximum tokens to include in the full context block sent to LLM
  // (approximate — we count chars / 4)
  maxContextTokens: 4000,

  // Citation excerpt length (chars shown in UI source panel)
  citationExcerptLength: 250,
} as const;

export type RetrievalConfig = typeof retrievalConfig;
