import readline from 'readline';
import fs from 'fs';
import path from 'path';
// @ts-ignore — wink-bm25-text-search has no bundled types
import BM25 from 'wink-bm25-text-search';
import { DocumentChunk, RetrievedChunk } from '../schema/chunk';
import { createLogger } from '@bankflow/shared';

const logger = createLogger('ai-assistant:bm25');

// ─── BM25 Index ───────────────────────────────────────────────────────────────

interface BM25Engine {
  defineConfig(cfg: object): void;
  definePrepTasks(tasks: Function[]): void;
  addDoc(doc: object, uid: string): void;
  consolidate(k?: number): void;
  search(query: string, limit: number): Array<[string, number]>;
}

let _engine: BM25Engine | null = null;
let _chunkMap = new Map<string, DocumentChunk>(); // chunkId → chunk
let _indexed = false;

// ─── Simple tokenizer ─────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function removeStopwords(tokens: string[]): string[] {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'this', 'that', 'these', 'those', 'it',
    'its', 'as', 'up', 'out', 'if', 'so', 'no', 'not', 'can', 'all',
  ]);
  return tokens.filter((t) => !stopwords.has(t));
}

// ─── Build / Load Index ───────────────────────────────────────────────────────

/**
 * Build the BM25 index from a chunks.jsonl file.
 * Call once at service startup before any retrieval.
 */
export async function buildBm25Index(chunksFile: string): Promise<void> {
  if (_indexed) {
    logger.debug('BM25 index already built — skipping');
    return;
  }

  const absPath = path.resolve(chunksFile);
  if (!fs.existsSync(absPath)) {
    throw new Error(`chunks.jsonl not found: ${absPath}. Run: npm run ingest first.`);
  }

  // Load all chunks
  const chunks: DocumentChunk[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(absPath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) {
      const chunk = JSON.parse(line) as DocumentChunk;
      chunks.push(chunk);
      _chunkMap.set(chunk.metadata.chunkId, chunk);
    }
  }

  // Initialize BM25 engine
  _engine = new BM25() as BM25Engine;
  _engine.defineConfig({ fldWeights: { text: 4, sectionHeading: 2, docName: 1 } });
  _engine.definePrepTasks([tokenize, removeStopwords]);

  // Index each chunk
  for (const chunk of chunks) {
    _engine.addDoc(
      {
        text:           chunk.text,
        sectionHeading: chunk.metadata.sectionHeading,
        docName:        chunk.metadata.docName,
      },
      chunk.metadata.chunkId,
    );
  }

  _engine.consolidate(1);
  _indexed = true;
  logger.info(`BM25 index built: ${chunks.length} documents`, { file: absPath });
}

/**
 * Keyword search using BM25.
 * Returns top-K results sorted by BM25 score (descending).
 */
export function retrieveByBm25(query: string, topK: number): RetrievedChunk[] {
  if (!_engine || !_indexed) {
    logger.warn('BM25 index not yet built — returning empty results');
    return [];
  }

  let rawResults: Array<[string, number]>;
  try {
    rawResults = _engine.search(query, topK);
  } catch {
    logger.warn('BM25 search error — returning empty results');
    return [];
  }

  // Normalize scores to 0–1 range
  const maxScore = rawResults.length > 0 ? rawResults[0][1] : 1;

  return rawResults
    .filter(([chunkId]) => _chunkMap.has(chunkId))
    .map(([chunkId, rawScore]) => {
      const chunk = _chunkMap.get(chunkId)!;
      return {
        ...chunk,
        score: maxScore > 0 ? rawScore / maxScore : 0,
        retrievalMethod: 'bm25' as const,
      };
    });
}

/**
 * Check if index is ready.
 */
export function isBm25Ready(): boolean {
  return _indexed;
}

/**
 * Get the number of indexed documents.
 */
export function getBm25IndexSize(): number {
  return _chunkMap.size;
}
