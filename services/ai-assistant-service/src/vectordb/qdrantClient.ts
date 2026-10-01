import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config';
import { createLogger } from '@bankflow/shared';

const logger = createLogger('ai-assistant:qdrant');

// ─── Qdrant Client Singleton ──────────────────────────────────────────────────

let _client: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  if (!_client) {
    _client = new QdrantClient({ url: config.qdrantUrl });
    logger.info('Qdrant client created', { url: config.qdrantUrl });
  }
  return _client;
}

// ─── Collection Management ────────────────────────────────────────────────────

/**
 * Ensure the bankflow_knowledge collection exists in Qdrant.
 * Pass `recreate=true` for a fresh full re-ingestion.
 */
export async function ensureCollection(recreate = false): Promise<void> {
  const client = getQdrantClient();
  const name = config.qdrantCollectionName;

  let exists = false;
  try {
    const info = await client.getCollection(name);
    exists = true;
    const points = info.points_count ?? 0;

    if (recreate) {
      logger.warn(`Deleting existing collection for recreation: ${name} (${points} points)`);
      await client.deleteCollection(name);
      exists = false;
    } else {
      logger.info(`Collection "${name}" already exists — skipping creation`, { points });
      return;
    }
  } catch {
    // Collection doesn't exist — fall through to create
  }

  if (!exists) {
    logger.info(`Creating collection "${name}"`, {
      vectorSize: config.vectorDimensions,
      distance: 'Cosine',
    });

    await client.createCollection(name, {
      vectors: {
        size: config.vectorDimensions,
        distance: 'Cosine',
      },
    });

    // Payload indexes for metadata filtering
    await client.createPayloadIndex(name, { field_name: 'docId',          field_schema: 'keyword' });
    await client.createPayloadIndex(name, { field_name: 'docName',        field_schema: 'keyword' });
    await client.createPayloadIndex(name, { field_name: 'page',           field_schema: 'integer' });
    await client.createPayloadIndex(name, { field_name: 'sectionHeading', field_schema: 'keyword' });
    await client.createPayloadIndex(name, { field_name: 'chunkIndex',     field_schema: 'integer' });

    logger.info(`Collection "${name}" ready with payload indexes`);
  }
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

export interface UpsertPoint {
  id: string;          // String chunkId — will be hashed to uint32
  vector: number[];
  payload: Record<string, unknown>;
}

/**
 * Upsert a batch of points with exponential backoff retry.
 */
export async function upsertPoints(points: UpsertPoint[]): Promise<void> {
  const client = getQdrantClient();
  const name = config.qdrantCollectionName;

  const qdrantPoints = points.map((p) => ({
    id: chunkIdToUint(p.id),
    vector: p.vector,
    payload: { ...p.payload, chunkId: p.id }, // always store original string id in payload
  }));

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await client.upsert(name, { wait: true, points: qdrantPoints });
      return;
    } catch (err: any) {
      if (attempt === 5) throw err;
      const delay = Math.min(500 * Math.pow(2, attempt), 10000);
      logger.warn(`Upsert attempt ${attempt} failed, retry in ${delay}ms`, { error: err.message });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// ─── Vector Search ────────────────────────────────────────────────────────────

export interface VectorSearchResult {
  chunkId: string;
  score: number;
  payload: Record<string, unknown>;
}

/**
 * Search for the top-K nearest vectors to the query.
 * Uses client.query() (new Qdrant SDK ≥1.9) which is the recommended way.
 */
export async function vectorSearch(
  queryVector: number[],
  topK: number,
  filter?: Record<string, unknown>,
): Promise<VectorSearchResult[]> {
  const client = getQdrantClient();
  const name = config.qdrantCollectionName;

  const results = await client.query(name, {
    query: queryVector,
    limit: topK,
    with_payload: true,
    filter: filter as any,
  });

  return results.points.map((r: any) => ({
    chunkId: (r.payload?.['chunkId'] as string) ?? String(r.id),
    score: r.score,
    payload: (r.payload ?? {}) as Record<string, unknown>,
  }));
}

/**
 * Get collection statistics.
 */
export async function getCollectionInfo(): Promise<{
  pointsCount: number;
  vectorsCount: number;
  status: string;
}> {
  const client = getQdrantClient();
  const info = await client.getCollection(config.qdrantCollectionName);
  return {
    pointsCount: info.points_count ?? 0,
    vectorsCount: info.indexed_vectors_count ?? 0,
    status: info.status ?? 'unknown',
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a string chunkId to a stable uint32 (Qdrant requires integer IDs).
 * Uses djb2 hash, which is fast and collision-resistant for our small corpus.
 */
export function chunkIdToUint(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return Math.abs(hash >>> 0); // unsigned 32-bit
}
