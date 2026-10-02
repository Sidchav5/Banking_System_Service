#!/usr/bin/env ts-node
/**
 * testDay14.ts — Validates Day 14 modules without API keys or Qdrant.
 * Tests: reranker (fallback), context builder, source tracker.
 *
 * Run: npx ts-node --project services/ai-assistant-service/tsconfig.json
 *               services/ai-assistant-service/src/cli/testDay14.ts
 */

import { rerank } from '../retrieval/reranker';
import { buildContext, buildLiveDataContext } from '../context/contextBuilder';
import { trackSources, extractCitations, maxRelevanceScore, deduplicateChunks } from '../context/sourceTracker';
import { retrievalConfig } from '../config/retrievalConfig';
import { RetrievedChunk } from '../schema/chunk';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PASS = '✅';
const FAIL = '❌';
function assert(cond: boolean, label: string) {
  console.log(`  ${cond ? PASS : FAIL} ${label}`);
  if (!cond) process.exitCode = 1;
}

function makeChunk(
  id: string,
  text: string,
  score: number,
  docName = 'Test Doc',
  page = 1,
  section = 'Overview',
): RetrievedChunk {
  return {
    metadata: {
      chunkId: id, docId: 'test', docName, fileName: 'test.pdf',
      page, sectionHeading: section, chunkIndex: 0,
      charStart: 0, charEnd: text.length, tokenCount: Math.ceil(text.length / 4),
      totalPages: 5,
    },
    text,
    score,
    retrievalMethod: 'hybrid',
    rrfRank: 0,
  };
}

// ─── Test Reranker (Fallback) ─────────────────────────────────────────────────

async function testReranker() {
  console.log('\n── Reranker Tests (cosine/keyword fallback) ─────────');

  const query = 'What is NEFT payment transfer?';
  const chunks: RetrievedChunk[] = [
    makeChunk('c1', 'NEFT is a National Electronic Funds Transfer payment system used in India for bank transfers.',   0.8),
    makeChunk('c2', 'RabbitMQ is a message broker used for async background job processing.',                          0.5),
    makeChunk('c3', 'RTGS enables real-time gross settlement for high-value fund transfers between banks.',             0.7),
    makeChunk('c4', 'The Payment Saga pattern handles distributed transaction compensation and rollback.',               0.6),
    makeChunk('c5', 'NEFT transactions are settled in batches throughout the banking day by RBI.',                     0.75),
  ];

  // No Cohere key set → uses fallback
  const results = await rerank(query, chunks, 3);

  assert(results.length === 3, `Reranker returns topN=3 (got ${results.length})`);
  assert(results[0].finalRank === 0, 'Top result has finalRank=0');
  assert(results.every((r) => r.rerankScore >= 0), 'All rerank scores non-negative');
  assert(
    results[0].chunk.metadata.chunkId === 'c1' || results[0].chunk.metadata.chunkId === 'c5',
    `Top result is NEFT-related chunk (got ${results[0].chunk.metadata.chunkId})`,
  );

  console.log(`  Reranked order: ${results.map((r) => r.chunk.metadata.chunkId).join(' > ')}`);
  console.log(`  Rerank scores:  ${results.map((r) => r.rerankScore.toFixed(4)).join(', ')}`);

  // Edge case: fewer chunks than topN
  const small = [makeChunk('x1', 'NEFT test', 0.9)];
  const smallResult = await rerank(query, small, 5);
  assert(smallResult.length === 1, 'Fewer chunks than topN → returns all available');
}

// ─── Test Context Builder ─────────────────────────────────────────────────────

function testContextBuilder() {
  console.log('\n── Context Builder Tests ────────────────────────────');

  const chunks: RetrievedChunk[] = [
    makeChunk('c1',
      'NEFT (National Electronic Funds Transfer) is a nation-wide payment system enabling fund transfers from any bank branch to any other bank branch.',
      0.9, 'Banking Fundamentals', 3, 'NEFT Overview'),
    makeChunk('c2',
      'CREDIT_PENDING indicates that the debit has been posted to the sender account but the corresponding credit to the recipient is awaiting external acknowledgment.',
      0.85, 'BankFlow Product Manual', 7, 'Payment States'),
    makeChunk('c3',
      'The Payment Saga pattern uses compensating transactions to ensure atomicity across distributed services.',
      0.75, 'Distributed Banking Architecture', 12, 'Saga Pattern'),
  ];

  const ctx = buildContext(chunks);

  assert(typeof ctx.contextBlock === 'string', 'contextBlock is a string');
  assert(ctx.contextBlock.includes('[SOURCE 1]'), 'Context contains [SOURCE 1]');
  assert(ctx.contextBlock.includes('[SOURCE 2]'), 'Context contains [SOURCE 2]');
  assert(ctx.contextBlock.includes('[SOURCE 3]'), 'Context contains [SOURCE 3]');
  assert(ctx.contextBlock.includes('=== KNOWLEDGE BASE CONTEXT ==='), 'Context has header');
  assert(ctx.contextBlock.includes('=== END CONTEXT ==='), 'Context has footer');
  assert(ctx.contextBlock.includes('Banking Fundamentals'), 'Source 1 doc name present');
  assert(ctx.contextBlock.includes('Page 3'), 'Source 1 page number present');
  assert(ctx.contextBlock.includes('NEFT Overview'), 'Source 1 section heading present');
  assert(ctx.sources.length === 3, `3 sources tracked (got ${ctx.sources.length})`);
  assert(!ctx.truncated, 'Small context not truncated');
  assert(ctx.totalTokens > 0, `Total tokens counted (${ctx.totalTokens})`);

  // Empty chunks
  const emptyCtx = buildContext([]);
  assert(emptyCtx.contextBlock.includes('No relevant context'), 'Empty chunks → no context message');
  assert(emptyCtx.sources.length === 0, 'Empty chunks → 0 sources');

  // Live data context
  const liveCtx = buildLiveDataContext({
    get_account_balance: { accountId: 'ACC001', balance: 50000, currency: 'INR' },
  });
  assert(liveCtx.includes('=== LIVE BANKING DATA ==='), 'Live context has header');
  assert(liveCtx.includes('GET_ACCOUNT_BALANCE'), 'Live context has tool label');
  assert(liveCtx.includes('ACC001'), 'Live context includes account data');

  // Preview
  console.log('\n  Context block preview:');
  ctx.contextBlock.split('\n').slice(0, 10).forEach((line) => console.log(`    ${line}`));
  console.log('    ...');
}

// ─── Test Source Tracker ──────────────────────────────────────────────────────

function testSourceTracker() {
  console.log('\n── Source Tracker Tests ─────────────────────────────');

  const chunks: RetrievedChunk[] = [
    makeChunk('a1', 'NEFT is the National Electronic Funds Transfer system.',      0.9, 'Banking Fundamentals', 3, 'NEFT'),
    makeChunk('a2', 'CREDIT_PENDING means the debit posted, credit awaited.',      0.8, 'BankFlow Manual',      7, 'States'),
    makeChunk('a1', 'NEFT duplicate with lower score.',                             0.5, 'Banking Fundamentals', 3, 'NEFT'), // duplicate id
  ];

  // Deduplication
  const deduped = deduplicateChunks(chunks);
  assert(deduped.length === 2, `Deduplication: 3 chunks with 1 duplicate → 2 unique (got ${deduped.length})`);
  const a1 = deduped.find((c) => c.metadata.chunkId === 'a1');
  assert(a1?.score === 0.9, 'Dedup keeps higher-score version (0.9)');

  // Source tracking
  const sources = trackSources(deduped);
  assert(sources.length === 2, `trackSources returns 2 TrackedSources (got ${sources.length})`);
  assert(sources[0].contextIndex === 1, 'First source has contextIndex=1');
  assert(sources[1].contextIndex === 2, 'Second source has contextIndex=2');
  assert(typeof sources[0].citation.excerpt === 'string', 'Citation has excerpt');
  assert(sources[0].citation.excerpt.length <= retrievalConfig.citationExcerptLength + 1, 'Excerpt within length limit');

  // Citations extraction
  const citations = extractCitations(sources);
  assert(citations.length === 2, `extractCitations returns 2 citations`);
  assert(citations[0].docName === 'Banking Fundamentals', 'Citation has correct docName');
  assert(citations[0].page === 3, 'Citation has correct page');
  assert(citations[0].sectionHeading === 'NEFT', 'Citation has correct sectionHeading');

  // Max relevance score
  const maxScore = maxRelevanceScore(deduped);
  assert(Math.abs(maxScore - 0.9) < 0.001, `maxRelevanceScore = 0.9 (got ${maxScore})`);
  assert(maxRelevanceScore([]) === 0, 'maxRelevanceScore([]) = 0');

  // Retrieval config sanity
  assert(retrievalConfig.vectorTopK > 0,      `vectorTopK=${retrievalConfig.vectorTopK} > 0`);
  assert(retrievalConfig.bm25TopK > 0,        `bm25TopK=${retrievalConfig.bm25TopK} > 0`);
  assert(retrievalConfig.rerankTopN > 0,      `rerankTopN=${retrievalConfig.rerankTopN} > 0`);
  assert(retrievalConfig.abstentionThreshold > 0 && retrievalConfig.abstentionThreshold < 1,
    `abstentionThreshold=${retrievalConfig.abstentionThreshold} in (0,1)`);
}

// ─── Run All Tests ────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  BankFlow RAG — Day 14 Tests');
  console.log('══════════════════════════════════════════════════════');

  await testReranker();
  testContextBuilder();
  testSourceTracker();

  const code = process.exitCode ?? 0;
  console.log('\n══════════════════════════════════════════════════════');
  console.log(code === 0
    ? '  ✅ ALL TESTS PASSED — Day 14 complete'
    : '  ❌ SOME TESTS FAILED');
  console.log('══════════════════════════════════════════════════════\n');
  process.exit(code);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
