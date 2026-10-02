import axios from 'axios';
import { RetrievedChunk } from '../schema/chunk';
import { config } from '../config';
import { createLogger } from '@bankflow/shared';

const logger = createLogger('ai-assistant:reranker');

// ─── Reranker ─────────────────────────────────────────────────────────────────
//
// Two strategies:
//  1. Cohere Rerank API   — production cross-encoder (if COHERE_API_KEY set)
//  2. Keyword-overlap blend — free fallback, no external API needed
//
// Cohere is the recommended production path. The fallback uses a Jaccard-like
// keyword overlap score blended with the original RRF score.

const COHERE_RERANK_URL = 'https://api.cohere.ai/v1/rerank';
const COHERE_MODEL = 'rerank-english-v3.0';

export interface RerankResult {
  chunk: RetrievedChunk;
  rerankScore: number;
  originalRank: number;
  finalRank: number;
}

// ─── Cohere Rerank ────────────────────────────────────────────────────────────

async function rerankWithCohere(
  query: string,
  chunks: RetrievedChunk[],
  topN: number,
): Promise<RerankResult[]> {
  const documents = chunks.map((c) => c.text);

  const response = await axios.post(
    COHERE_RERANK_URL,
    { model: COHERE_MODEL, query, documents, top_n: topN, return_documents: false },
    {
      headers: { Authorization: `Bearer ${config.cohereApiKey}`, 'Content-Type': 'application/json' },
      timeout: 10_000,
    },
  );

  const results: RerankResult[] = response.data.results.map((r: any, finalRank: number) => ({
    chunk: { ...chunks[r.index], rerankScore: r.relevance_score },
    rerankScore: r.relevance_score,
    originalRank: r.index,
    finalRank,
  }));

  logger.info('Cohere rerank complete', {
    input: chunks.length,
    output: results.length,
    topScore: results[0]?.rerankScore.toFixed(4),
  });

  return results;
}

// ─── Keyword-Overlap Fallback ─────────────────────────────────────────────────

function rerankWithKeywordOverlap(
  query: string,
  chunks: RetrievedChunk[],
  topN: number,
): RerankResult[] {
  logger.debug('Using keyword-overlap fallback reranker', { chunks: chunks.length });

  const queryTokens = new Set(
    query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2),
  );

  const scored = chunks.map((chunk, i) => {
    const chunkTokens = chunk.text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2);

    const chunkSet  = new Set(chunkTokens);
    const overlap   = chunkTokens.filter((t) => queryTokens.has(t)).length;
    const unionSize = queryTokens.size + chunkSet.size - overlap;
    const overlapScore = unionSize > 0 ? overlap / unionSize : 0;

    // Blend: 60% original score (RRF) + 40% keyword overlap
    const rerankScore = 0.6 * chunk.score + 0.4 * overlapScore;

    return { chunk: { ...chunk, rerankScore }, rerankScore, originalRank: i };
  });

  scored.sort((a, b) => b.rerankScore - a.rerankScore);

  const results = scored.slice(0, topN).map((r, finalRank) => ({ ...r, finalRank }));

  logger.debug('Keyword fallback rerank complete', {
    input: chunks.length,
    output: results.length,
    topScore: results[0]?.rerankScore.toFixed(4),
  });

  return results;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Rerank retrieved chunks against the query.
 *
 * Uses Cohere Rerank API if COHERE_API_KEY is set, otherwise falls back
 * to a keyword-overlap + original-score blend (no external API needed).
 *
 * @param query          The user's original query
 * @param chunks         Hybrid-retrieved chunks (from RRF)
 * @param topN           How many to keep after reranking
 */
export async function rerank(
  query: string,
  chunks: RetrievedChunk[],
  topN: number,
): Promise<RerankResult[]> {
  if (chunks.length === 0) return [];

  // Not enough chunks to rerank — assign scores and return as-is
  if (chunks.length <= topN) {
    return chunks.map((chunk, i) => ({
      chunk: { ...chunk, rerankScore: chunk.score },
      rerankScore: chunk.score,
      originalRank: i,
      finalRank: i,
    }));
  }

  // Try Cohere first (production path)
  if (config.cohereApiKey) {
    try {
      return await rerankWithCohere(query, chunks, topN);
    } catch (err: any) {
      logger.warn('Cohere rerank failed — using keyword fallback', { error: err.message });
    }
  }

  // Fallback: keyword overlap blend (synchronous, free)
  return rerankWithKeywordOverlap(query, chunks, topN);
}
