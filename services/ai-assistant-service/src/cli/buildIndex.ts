#!/usr/bin/env ts-node
/**
 * buildIndex.ts — Embedding + Qdrant Index CLI
 *
 * Usage:
 *   ts-node src/cli/buildIndex.ts [--chunks <chunks.jsonl>] [--recreate]
 *
 * Reads chunks.jsonl produced by ingest.ts, generates embeddings for each chunk
 * (using file cache to avoid redundant API calls), and upserts all vectors into
 * the Qdrant bankflow_knowledge collection.
 */

import path from 'path';
import fs from 'fs';
import readline from 'readline';

import { embedBatch } from '../embeddings/googleEmbedder';
import { initCache, getCached, setCached, flushCache, getCacheSize } from '../embeddings/embeddingCache';
import { ensureCollection, upsertPoints, getCollectionInfo } from '../vectordb/qdrantClient';
import { DocumentChunk } from '../schema/chunk';
import { config } from '../config';

// ── Parse CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const chunksArg = args[args.indexOf('--chunks') + 1];
const recreate = args.includes('--recreate');

const chunksFile = chunksArg
  ?? path.resolve(__dirname, '../../data/chunks.jsonl');
const cacheFile = path.resolve(__dirname, '../../data/embedding_cache.json');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadChunks(filePath: string): Promise<DocumentChunk[]> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`chunks.jsonl not found: ${filePath}\nRun: npm run ingest first.`);
  }
  const chunks: DocumentChunk[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) chunks.push(JSON.parse(line));
  }
  return chunks;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  BankFlow RAG — Build Vector Index (Day 12)');
  console.log('══════════════════════════════════════════════════════\n');
  console.log(`  Chunks file:  ${chunksFile}`);
  console.log(`  Cache file:   ${cacheFile}`);
  console.log(`  Qdrant URL:   ${config.qdrantUrl}`);
  console.log(`  Collection:   ${config.qdrantCollectionName}`);
  console.log(`  Recreate:     ${recreate}`);
  console.log(`  Embedding:    ${config.embeddingModel}\n`);

  // ── 1. Load chunks ──────────────────────────────────────────────────────────
  console.log('── Step 1: Loading chunks ───────────────────────────');
  const chunks = await loadChunks(chunksFile);
  console.log(`✅ Loaded ${chunks.length} chunks from ${path.basename(chunksFile)}\n`);

  // ── 2. Init embedding cache ─────────────────────────────────────────────────
  console.log('── Step 2: Embedding Cache ──────────────────────────');
  initCache(cacheFile);
  const initialCacheSize = getCacheSize();
  console.log(`   Cache entries on disk: ${initialCacheSize}`);

  // Separate chunks into cache-hits and misses
  const toEmbed: DocumentChunk[] = [];
  const cachedEmbeddings = new Map<string, number[]>();

  for (const chunk of chunks) {
    const cached = getCached(chunk.metadata.chunkId, config.embeddingModel);
    if (cached) {
      cachedEmbeddings.set(chunk.metadata.chunkId, cached);
    } else {
      toEmbed.push(chunk);
    }
  }

  console.log(`   Cache hits:  ${cachedEmbeddings.size}`);
  console.log(`   Need embed:  ${toEmbed.length}\n`);

  // ── 3. Generate embeddings ──────────────────────────────────────────────────
  console.log('── Step 3: Generating Embeddings ────────────────────');
  const freshEmbeddings = new Map<string, number[]>();

  if (toEmbed.length === 0) {
    console.log('   ✅ All chunks cached — skipping API calls\n');
  } else {
    if (!config.geminiApiKey) {
      console.error('❌ GEMINI_API_KEY not set. Cannot generate embeddings.');
      console.log('\n💡 Set GEMINI_API_KEY in .env and re-run: npm run build-index');
      process.exit(1);
    }

    const texts = toEmbed.map((c) => c.text);
    const vectors = await embedBatch(texts, 50);

    for (let i = 0; i < toEmbed.length; i++) {
      const chunkId = toEmbed[i].metadata.chunkId;
      const vector = vectors[i];
      freshEmbeddings.set(chunkId, vector);
      setCached(chunkId, config.embeddingModel, vector);
    }

    flushCache();
    console.log(`✅ Embedded ${toEmbed.length} chunks, cache flushed (${getCacheSize()} total)\n`);
  }

  // Merge all embeddings
  const allEmbeddings = new Map<string, number[]>([...cachedEmbeddings, ...freshEmbeddings]);

  // ── 4. Ensure Qdrant collection ─────────────────────────────────────────────
  console.log('── Step 4: Qdrant Collection ────────────────────────');
  try {
    await ensureCollection(recreate);
    const beforeInfo = await getCollectionInfo();
    console.log(`✅ Collection ready — ${beforeInfo.pointsCount} points currently\n`);
  } catch (err: any) {
    console.error(`❌ Qdrant connection failed: ${err.message}`);
    console.log('\n💡 Start Qdrant with: docker compose up qdrant -d');
    console.log('   Then retry: npm run build-index\n');
    process.exit(1);
  }

  // ── 5. Upsert vectors ───────────────────────────────────────────────────────
  console.log('── Step 5: Upserting to Qdrant ──────────────────────');
  const UPSERT_BATCH_SIZE = 50;
  let upserted = 0;

  for (let i = 0; i < chunks.length; i += UPSERT_BATCH_SIZE) {
    const batch = chunks.slice(i, i + UPSERT_BATCH_SIZE);
    const points = batch.map((chunk) => ({
      id: chunk.metadata.chunkId,
      vector: allEmbeddings.get(chunk.metadata.chunkId)!,
      payload: {
        chunkId:        chunk.metadata.chunkId,
        docId:          chunk.metadata.docId,
        docName:        chunk.metadata.docName,
        fileName:       chunk.metadata.fileName,
        page:           chunk.metadata.page,
        sectionHeading: chunk.metadata.sectionHeading,
        chunkIndex:     chunk.metadata.chunkIndex,
        tokenCount:     chunk.metadata.tokenCount,
        totalPages:     chunk.metadata.totalPages,
        text:           chunk.text,            // store full text for retrieval
      },
    }));

    await upsertPoints(points);
    upserted += batch.length;
    console.log(`   Upserted ${upserted}/${chunks.length} chunks`);
  }

  // ── 6. Verify ────────────────────────────────────────────────────────────────
  console.log('\n── Step 6: Verify Collection ────────────────────────');
  const finalInfo = await getCollectionInfo();
  console.log(`   Collection: ${config.qdrantCollectionName}`);
  console.log(`   Status:     ${finalInfo.status}`);
  console.log(`   Points:     ${finalInfo.pointsCount}`);
  console.log(`   Vectors:    ${finalInfo.vectorsCount}`);

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  VECTOR INDEX BUILD COMPLETE');
  console.log('──────────────────────────────────────────────────────');
  console.log(`  Chunks indexed:     ${chunks.length}`);
  console.log(`  Freshly embedded:  ${toEmbed.length}`);
  console.log(`  Cache hits:        ${cachedEmbeddings.size}`);
  console.log(`  Qdrant points:     ${finalInfo.pointsCount}`);
  console.log('  Next step:         Day 13 — BM25 + Hybrid Retrieval');
  console.log('══════════════════════════════════════════════════════\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err.message ?? err);
  process.exit(1);
});
