import fs from 'fs';
import path from 'path';
import { createLogger } from '@bankflow/shared';

const logger = createLogger('ai-assistant:embedding-cache');

// ─── File-Based Embedding Cache ───────────────────────────────────────────────
// Saves embedding vectors keyed by `{model}:{chunkId}` to avoid re-calling
// the API when re-ingesting unchanged PDFs.

interface CacheEntry {
  chunkId: string;
  model: string;
  embedding: number[];
  cachedAt: string;
}

type CacheStore = Record<string, CacheEntry>;

let _cache: CacheStore | null = null;
let _cacheFile = '';
let _dirty = false;

export function initCache(cacheFilePath: string): void {
  _cacheFile = path.resolve(cacheFilePath);
  const dir = path.dirname(_cacheFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(_cacheFile)) {
    try {
      _cache = JSON.parse(fs.readFileSync(_cacheFile, 'utf-8')) as CacheStore;
      logger.info(`Embedding cache loaded: ${Object.keys(_cache).length} entries`);
    } catch {
      logger.warn('Cache file corrupted — starting fresh');
      _cache = {};
    }
  } else {
    _cache = {};
  }
}

function ensureInit(): void {
  if (!_cache) initCache('./data/embedding_cache.json');
}

export function getCached(chunkId: string, model: string): number[] | null {
  ensureInit();
  return _cache![`${model}:${chunkId}`]?.embedding ?? null;
}

export function setCached(chunkId: string, model: string, embedding: number[]): void {
  ensureInit();
  _cache![`${model}:${chunkId}`] = {
    chunkId,
    model,
    embedding,
    cachedAt: new Date().toISOString(),
  };
  _dirty = true;
}

export function flushCache(): void {
  if (!_dirty || !_cache || !_cacheFile) return;
  fs.writeFileSync(_cacheFile, JSON.stringify(_cache, null, 2), 'utf-8');
  logger.info(`Cache flushed: ${Object.keys(_cache).length} entries → ${_cacheFile}`);
  _dirty = false;
}

export function getCacheSize(): number {
  ensureInit();
  return Object.keys(_cache!).length;
}
