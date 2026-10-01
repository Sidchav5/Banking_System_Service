import { embedText } from '../embeddings/googleEmbedder';
import { vectorSearch, VectorSearchResult } from '../vectordb/qdrantClient';
import { RetrievedChunk } from '../schema/chunk';
import { createLogger } from '@bankflow/shared';

const logger = createLogger('ai-assistant:vector-retrieval');

// ─── Vector Retrieval ─────────────────────────────────────────────────────────

/**
 * Dense vector search: embed the query, find nearest neighbours in Qdrant.
 * Returns RetrievedChunks sorted by cosine similarity (highest first).
 */
export async function retrieveByVector(
  query: string,
  topK: number,
): Promise<RetrievedChunk[]> {
  logger.debug(`Vector search: "${query.substring(0, 80)}"`, { topK });

  const queryVector = await embedText(query);
  const results = await vectorSearch(queryVector, topK);

  return results.map((r) => payloadToChunk(r, 'vector'));
}

/**
 * Also export the raw query embedding for use in hybrid fusion / abstention scoring.
 */
export async function getQueryEmbedding(query: string): Promise<number[]> {
  return embedText(query);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function payloadToChunk(result: VectorSearchResult, method: 'vector'): RetrievedChunk {
  const p = result.payload;
  return {
    metadata: {
      chunkId:        String(p['chunkId'] ?? result.chunkId),
      docId:          String(p['docId'] ?? ''),
      docName:        String(p['docName'] ?? ''),
      fileName:       String(p['fileName'] ?? ''),
      page:           Number(p['page'] ?? 0),
      sectionHeading: String(p['sectionHeading'] ?? ''),
      chunkIndex:     Number(p['chunkIndex'] ?? 0),
      charStart:      0,
      charEnd:        0,
      tokenCount:     Number(p['tokenCount'] ?? 0),
      totalPages:     Number(p['totalPages'] ?? 0),
    },
    text: String(p['text'] ?? ''),
    score: result.score,
    retrievalMethod: method,
  };
}
