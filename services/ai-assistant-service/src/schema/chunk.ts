// ─── Chunk Schema Types ───────────────────────────────────────────────────────
// Shared interfaces used across ingestion, embedding, retrieval, and context building.

export interface ChunkMetadata {
  chunkId: string;         // Unique: `${docId}_p${page}_c${chunkIndex}`
  docId: string;           // e.g., "01_Banking_Fundamentals"
  docName: string;         // e.g., "Banking Fundamentals"
  fileName: string;        // Original PDF filename
  page: number;            // 1-based page number
  sectionHeading: string;  // Nearest section heading, or "" if none detected
  chunkIndex: number;      // 0-based index within the document
  charStart: number;       // Start char offset in extracted page text
  charEnd: number;         // End char offset in extracted page text
  tokenCount: number;      // Approximate token count
  totalPages: number;      // Total pages in source document
}

export interface DocumentChunk {
  metadata: ChunkMetadata;
  text: string;            // The actual chunk text
  parentText?: string;     // Full page text (used for citation display)
}

export interface EmbeddedChunk extends DocumentChunk {
  embedding: number[];     // 768-dimensional vector from text-embedding-004
}

export interface RetrievedChunk extends DocumentChunk {
  score: number;           // Relevance score (0-1)
  retrievalMethod: 'vector' | 'bm25' | 'hybrid';
  rrfRank?: number;        // Rank after Reciprocal Rank Fusion
  rerankScore?: number;    // Score from Cohere / cross-encoder reranker
}

export interface Citation {
  docName: string;
  fileName: string;
  page: number;
  sectionHeading: string;
  excerpt: string;         // Short excerpt (first 200 chars of the chunk)
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  queryType: QueryType;
  toolsUsed: string[];
  abstained: boolean;
  confidence: number;      // 0–1, max relevance score of top retrieved chunk
  conversationId: string;
  requestId: string;
}

export type QueryType =
  | 'GENERAL_BANKING'
  | 'BANKFLOW_DOCUMENTATION'
  | 'LIVE_ACCOUNT_DATA'
  | 'LIVE_TRANSACTION_DATA'
  | 'HYBRID'
  | 'UNSUPPORTED'
  | 'FINANCIAL_ACTION';
