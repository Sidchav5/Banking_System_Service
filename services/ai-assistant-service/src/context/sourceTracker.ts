import { RetrievedChunk, Citation } from '../schema/chunk';
import { retrievalConfig } from '../config/retrievalConfig';
import { createLogger } from '@bankflow/shared';

const logger = createLogger('ai-assistant:source-tracker');

// ─── Source Tracker ───────────────────────────────────────────────────────────
//
// Tracks which chunks were actually used in the LLM context and builds
// the structured citation list returned to the frontend.

export interface TrackedSource {
  chunk: RetrievedChunk;
  contextIndex: number;  // Position in the context block (1-based, shown as [SOURCE N])
  rerankScore: number;
  citation: Citation;
}

/**
 * Build the source tracking record for a set of context chunks.
 * Each chunk gets a [SOURCE N] label used in both the LLM prompt and the UI.
 */
export function trackSources(chunks: RetrievedChunk[]): TrackedSource[] {
  return chunks.map((chunk, i) => {
    const citation: Citation = {
      docName:        chunk.metadata.docName,
      fileName:       chunk.metadata.fileName,
      page:           chunk.metadata.page,
      sectionHeading: chunk.metadata.sectionHeading,
      excerpt:        buildExcerpt(chunk.text, retrievalConfig.citationExcerptLength),
    };

    return {
      chunk,
      contextIndex: i + 1,  // 1-based for [SOURCE 1], [SOURCE 2], ...
      rerankScore:  chunk.rerankScore ?? chunk.score,
      citation,
    };
  });
}

/**
 * Build a clean excerpt from chunk text for display in the citation panel.
 * Trims to the nearest word boundary, not mid-word.
 */
function buildExcerpt(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;

  const truncated = clean.substring(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated) + '…';
}

/**
 * Extract the final citation list from tracked sources (for API response).
 */
export function extractCitations(sources: TrackedSource[]): Citation[] {
  return sources.map((s) => s.citation);
}

/**
 * Compute the maximum relevance score across all retrieved chunks.
 * Used by the abstention guard.
 */
export function maxRelevanceScore(chunks: RetrievedChunk[]): number {
  if (chunks.length === 0) return 0;
  return Math.max(...chunks.map((c) => c.rerankScore ?? c.score));
}

/**
 * De-duplicate chunks by chunkId (in case vector + BM25 returned the same chunk).
 * Keeps the version with the higher score.
 */
export function deduplicateChunks(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Map<string, RetrievedChunk>();
  for (const chunk of chunks) {
    const id = chunk.metadata.chunkId;
    const existing = seen.get(id);
    if (!existing || chunk.score > existing.score) {
      seen.set(id, chunk);
    }
  }
  return Array.from(seen.values());
}
