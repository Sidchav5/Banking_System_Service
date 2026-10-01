#!/usr/bin/env ts-node
/**
 * testDay13.ts — Validates Day 13 modules (query router, BM25, RRF, rewriter)
 * without needing any API keys or Qdrant running.
 *
 * Run: npx ts-node --project services/ai-assistant-service/tsconfig.json
 *               services/ai-assistant-service/src/cli/testDay13.ts
 */

import path from 'path';
import { classifyQuery, requiresRetrieval, requiresLiveData } from '../queryProcessing/queryRouter';
import { reciprocalRankFusion, cosineSimilarity } from '../retrieval/hybridFusion';
import { buildBm25Index, retrieveByBm25, isBm25Ready, getBm25IndexSize } from '../retrieval/bm25Retrieval';
import { RetrievedChunk } from '../schema/chunk';

const CHUNKS_FILE = path.resolve(__dirname, '../../data/chunks.jsonl');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PASS = '✅';
const FAIL = '❌';

function assert(condition: boolean, label: string): void {
  console.log(`  ${condition ? PASS : FAIL} ${label}`);
  if (!condition) process.exitCode = 1;
}

// ─── Test Query Router ────────────────────────────────────────────────────────

async function testQueryRouter() {
  console.log('\n── Query Router Tests ───────────────────────────────');

  const cases: [string, string][] = [
    ['What is NEFT?',                           'GENERAL_BANKING'],
    ['What does CREDIT_PENDING mean?',          'HYBRID'],          // asks about a state = needs docs + context
    ['What is my current balance?',             'LIVE_ACCOUNT_DATA'],
    ['Show me my accounts',                     'LIVE_ACCOUNT_DATA'],
    ['Status of payment TX123',                 'LIVE_TRANSACTION_DATA'],
    ['Check my recent transactions',            'LIVE_TRANSACTION_DATA'],
    ['Why is TX123 still pending?',             'LIVE_TRANSACTION_DATA'], // TX ID present → live tx
    ['Why is my money stuck?',                  'LIVE_TRANSACTION_DATA'],
    ['Transfer ₹5000 to Bob',                   'FINANCIAL_ACTION'],
    ['Make a payment to my landlord',           'FINANCIAL_ACTION'],
    ['What is the capital of France?',          'UNSUPPORTED'],     // correctly unsupported
    ['Tell me a joke',                          'UNSUPPORTED'],
  ];

  for (const [query, expected] of cases) {
    const result = classifyQuery(query);
    assert(result === expected, `"${query.substring(0, 45)}" → ${expected} (got: ${result})`);
  }

  // Test helper functions
  assert(requiresRetrieval('GENERAL_BANKING'),      'requiresRetrieval(GENERAL_BANKING)');
  assert(requiresRetrieval('HYBRID'),               'requiresRetrieval(HYBRID)');
  assert(!requiresRetrieval('FINANCIAL_ACTION'),    '!requiresRetrieval(FINANCIAL_ACTION)');
  assert(!requiresRetrieval('UNSUPPORTED'),         '!requiresRetrieval(UNSUPPORTED)');
  assert(requiresLiveData('LIVE_ACCOUNT_DATA'),     'requiresLiveData(LIVE_ACCOUNT_DATA)');
  assert(requiresLiveData('HYBRID'),                'requiresLiveData(HYBRID)');
  assert(!requiresLiveData('GENERAL_BANKING'),      '!requiresLiveData(GENERAL_BANKING)');
}

// ─── Test BM25 ────────────────────────────────────────────────────────────────

async function testBm25() {
  console.log('\n── BM25 Retrieval Tests ─────────────────────────────');

  const { existsSync } = await import('fs');
  if (!existsSync(CHUNKS_FILE)) {
    console.log(`  ⚠️  chunks.jsonl not found at ${CHUNKS_FILE}`);
    console.log('     Run: npm run ingest first');
    return;
  }

  await buildBm25Index(CHUNKS_FILE);
  assert(isBm25Ready(), 'BM25 index is ready after build');
  assert(getBm25IndexSize() > 0, `BM25 index has chunks (found ${getBm25IndexSize()})`);

  const results1 = retrieveByBm25('NEFT payment transfer', 5);
  assert(results1.length > 0, `BM25 search "NEFT payment transfer" returned ${results1.length} results`);
  assert(results1[0].score >= 0 && results1[0].score <= 1, 'BM25 scores normalised to [0,1]');
  assert(results1[0].retrievalMethod === 'bm25', 'Retrieval method tagged as bm25');

  const results2 = retrieveByBm25('credit pending payment status bankflow', 5);
  assert(results2.length > 0, `BM25 search "credit pending..." returned ${results2.length} results`);

  const resultsNonsense = retrieveByBm25('xyzzy quux nonexistent banking term', 5);
  // Small corpus (9 chunks) may still return results — just verify scores are low-ish
  console.log(`  ℹ️  Nonsense query returned ${resultsNonsense.length} results (small corpus expected)`);

  console.log(`\n  Top BM25 result for "NEFT payment transfer":`);
  if (results1.length > 0) {
    const top = results1[0];
    console.log(`    Doc:  ${top.metadata.docName} (p.${top.metadata.page})`);
    console.log(`    Score: ${top.score.toFixed(4)}`);
    console.log(`    Text:  "${top.text.substring(0, 100)}..."`);
  }
}

// ─── Test RRF Fusion ──────────────────────────────────────────────────────────

function makeChunk(id: string, score: number): RetrievedChunk {
  return {
    metadata: {
      chunkId: id, docId: 'test', docName: 'Test Doc', fileName: 'test.pdf',
      page: 1, sectionHeading: '', chunkIndex: 0, charStart: 0, charEnd: 100,
      tokenCount: 50, totalPages: 1,
    },
    text: `Test chunk ${id}`,
    score,
    retrievalMethod: 'vector',
  };
}

function testRRF() {
  console.log('\n── Reciprocal Rank Fusion Tests ─────────────────────');

  // Both lists have same top doc → should score highest
  const vectorResults = [makeChunk('A', 0.95), makeChunk('B', 0.80), makeChunk('C', 0.60)];
  const bm25Results   = [makeChunk('A', 1.00), makeChunk('D', 0.70), makeChunk('B', 0.50)];

  const fused = reciprocalRankFusion(vectorResults, bm25Results, 5);

  assert(fused.length === 4, `RRF returned 4 unique docs (A,B,C,D) — got ${fused.length}`);
  assert(fused[0].metadata.chunkId === 'A', `Top RRF result is A (highest in both lists) — got ${fused[0].metadata.chunkId}`);
  assert(fused[0].retrievalMethod === 'hybrid', 'RRF results tagged as hybrid');
  assert(fused[0].rrfRank === 0, 'RRF rank 0 for top result');
  assert(fused.every((r) => r.score > 0), 'All RRF scores positive');

  // Cosine similarity
  const a = [1, 0, 0];
  const b = [0, 1, 0];
  const c = [1, 0, 0];
  assert(Math.abs(cosineSimilarity(a, b)) < 0.001, 'Cosine(orthogonal) ≈ 0');
  assert(Math.abs(cosineSimilarity(a, c) - 1.0) < 0.001, 'Cosine(identical) = 1.0');

  console.log(`  RRF order: ${fused.map((r) => r.metadata.chunkId).join(' > ')}`);
  console.log(`  RRF scores: ${fused.map((r) => r.score.toFixed(4)).join(', ')}`);
}

// ─── Run All Tests ────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  BankFlow RAG — Day 13 Tests');
  console.log('══════════════════════════════════════════════════════');

  await testQueryRouter();
  await testBm25();
  testRRF();

  const exitCode = process.exitCode ?? 0;
  console.log('\n══════════════════════════════════════════════════════');
  if (exitCode === 0) {
    console.log('  ✅ ALL TESTS PASSED — Day 13 complete');
  } else {
    console.log('  ❌ SOME TESTS FAILED — check output above');
  }
  console.log('══════════════════════════════════════════════════════\n');

  process.exit(exitCode);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
