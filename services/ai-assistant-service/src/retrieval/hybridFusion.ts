import { RetrievedChunk } from '../schema/chunk';
import { createLogger } from '@bankflow/shared';

const logger = createLogger('ai-assistant:hybrid-fusion');

// ─── Reciprocal Rank Fusion (RRF) ─────────────────────────────────────────────
//
// RRF merges multiple ranked lists into one by scoring each document as:
//
//   score(d) = Σ_i  1 / (k + rank_i(d))
//
// where k=60 is a smoothing constant (standard from the original RRF paper).
// Documents not present in a list get no contribution from that list.
// This is robust to score scale differences between vector and BM25.

const RRF_K = 60;

interface ScoredResult {
  chunkId: string;
  rrfScore: number;
  vectorRank: number | null;
  bm25Rank: number | null;
  vectorScore: number | null;
  bm25Score: number | null;
  chunk: RetrievedChunk;
}

/**
 * Merge vector and BM25 results using Reciprocal Rank Fusion.
 *
 * @param vectorResults - Results from dense vector search (sorted by score desc)
 * @param bm25Results   - Results from BM25 keyword search (sorted by score desc)
 * @param topN          - How many merged results to return
 * @returns Combined and reranked list tagged with 'hybrid' retrieval method
 */
export function reciprocalRankFusion(
  vectorResults: RetrievedChunk[],
  bm25Results: RetrievedChunk[],
  topN: number,
): RetrievedChunk[] {
  const scoreMap = new Map<string, ScoredResult>();

  // Index both result lists by chunkId for O(1) lookup
  const vectorIndex = new Map(vectorResults.map((c, i) => [c.metadata.chunkId, { chunk: c, rank: i }]));
  const bm25Index   = new Map(bm25Results.map((c, i)   => [c.metadata.chunkId, { chunk: c, rank: i }]));

  // Union of all unique chunkIds
  const allIds = new Set([
    ...vectorResults.map((c) => c.metadata.chunkId),
    ...bm25Results.map((c) => c.metadata.chunkId),
  ]);

  for (const chunkId of allIds) {
    const vec  = vectorIndex.get(chunkId);
    const bm25 = bm25Index.get(chunkId);

    const vectorRank  = vec  ? vec.rank  : null;
    const bm25Rank    = bm25 ? bm25.rank : null;
    const vectorScore = vec  ? vec.chunk.score  : null;
    const bm25Score   = bm25 ? bm25.chunk.score : null;

    // RRF score: sum contributions from each list where the doc appears
    let rrfScore = 0;
    if (vectorRank !== null) rrfScore += 1 / (RRF_K + vectorRank + 1);
    if (bm25Rank   !== null) rrfScore += 1 / (RRF_K + bm25Rank   + 1);

    // Use whichever chunk object is available (prefer vector since it has richer metadata)
    const baseChunk = vec?.chunk ?? bm25!.chunk;

    scoreMap.set(chunkId, {
      chunkId,
      rrfScore,
      vectorRank,
      bm25Rank,
      vectorScore,
      bm25Score,
      chunk: baseChunk,
    });
  }

  // Sort by RRF score descending
  const sorted = Array.from(scoreMap.values()).sort((a, b) => b.rrfScore - a.rrfScore);

  logger.debug('RRF fusion complete', {
    vectorHits: vectorResults.length,
    bm25Hits:   bm25Results.length,
    uniqueDocs: sorted.length,
    returning:  Math.min(topN, sorted.length),
  });

  // Return top-N as RetrievedChunks with updated score and method
  return sorted.slice(0, topN).map((r, idx) => ({
    ...r.chunk,
    score: r.rrfScore,
    retrievalMethod: 'hybrid' as const,
    rrfRank: idx,
  }));
}

/**
 * Compute cosine similarity between two vectors.
 * Used for abstention scoring and fallback reranking.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
