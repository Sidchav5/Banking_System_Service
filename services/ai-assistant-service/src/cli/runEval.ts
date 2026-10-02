#!/usr/bin/env ts-node
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createLogger } from '@bankflow/shared';
import { config } from '../config';
import { rewriteQuery } from '../queryProcessing/queryRewriter';
import { buildBm25Index, retrieveByBm25 } from '../retrieval/bm25Retrieval';
import { retrieveByVector } from '../retrieval/vectorRetrieval';
import { reciprocalRankFusion } from '../retrieval/hybridFusion';
import { rerank } from '../retrieval/reranker';
import { retrievalConfig } from '../config/retrievalConfig';
import { RetrievedChunk } from '../schema/chunk';

const logger = createLogger('rag-eval');

interface EvalQuery {
  id: string;
  query: string;
  queryType: string;
  expectedDoc: string;
  expectedSection: string;
}

interface EvalResult {
  queryId: string;
  query: string;
  top1Hit: boolean;
  top5Hit: boolean;
  mrr: number; // Mean Reciprocal Rank
  highestHitRank: number | null;
}

function calculateHit(chunks: RetrievedChunk[], expectedDoc: string, expectedSection: string): number | null {
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    // Check if docName matches (or partially matches) and section matches
    const docMatch = chunk.metadata.docName.toLowerCase().includes(expectedDoc.toLowerCase());
    const secMatch = chunk.metadata.sectionHeading.toLowerCase().includes(expectedSection.toLowerCase());
    if (docMatch && secMatch) {
      return i + 1; // 1-based rank
    }
  }
  return null;
}

async function runEval() {
  logger.info('Initializing RAG Evaluation...');
  
  // 1. Build BM25 index
  try {
    await buildBm25Index(config.chunksFile);
  } catch (err: any) {
    logger.error('Failed to build BM25 index. Run ingestion first.', { error: err.message });
    process.exit(1);
  }

  // 2. Load Evaluation Queries
  const evalFile = path.resolve(__dirname, '../../data/eval_queries.json');
  if (!fs.existsSync(evalFile)) {
    logger.error('Evaluation dataset not found', { path: evalFile });
    process.exit(1);
  }
  const evalQueries: EvalQuery[] = JSON.parse(fs.readFileSync(evalFile, 'utf-8'));

  logger.info(`Loaded ${evalQueries.length} evaluation queries.`);

  const results: EvalResult[] = [];
  let totalMrr = 0;
  let top1Hits = 0;
  let top5Hits = 0;

  for (const item of evalQueries) {
    logger.info(`Evaluating query [${item.id}]: "${item.query}"`);
    
    // a. Rewrite Query
    const rewrittenQueries = await rewriteQuery(item.query, item.queryType as any);
    const searchQueries = [item.query, ...rewrittenQueries];

    // b. Retrieve using first two queries
    const searchQuery = rewrittenQueries[0] ?? item.query;
    const altQuery    = rewrittenQueries[1] ?? searchQuery;

    const [vectorResults, bm25Results] = await Promise.all([
      retrieveByVector(searchQuery, retrievalConfig.vectorTopK).catch(() => []),
      Promise.resolve(retrieveByBm25(altQuery, retrievalConfig.bm25TopK))
    ]);

    // c. Fuse
    const fused = reciprocalRankFusion(vectorResults, bm25Results, retrievalConfig.fusionTopK);

    // d. Deduplicate & Rerank
    const { deduplicateChunks } = await import('../context/sourceTracker');
    const uniqueFused = deduplicateChunks(fused);
    const rerankedResult = await rerank(item.query, uniqueFused, retrievalConfig.rerankTopN);
    const reranked = rerankedResult.map(r => r.chunk);
    
    // Evaluate hits against ground truth
    const rank = calculateHit(reranked, item.expectedDoc, item.expectedSection);
    
    let mrr = 0;
    let top1 = false;
    let top5 = false;

    if (rank !== null) {
      mrr = 1 / rank;
      if (rank === 1) top1 = true;
      if (rank <= 5) top5 = true;
    }

    results.push({
      queryId: item.id,
      query: item.query,
      top1Hit: top1,
      top5Hit: top5,
      mrr: mrr,
      highestHitRank: rank
    });

    totalMrr += mrr;
    if (top1) top1Hits++;
    if (top5) top5Hits++;
  }

  const avgMrr = totalMrr / evalQueries.length;
  const top1HitRate = top1Hits / evalQueries.length;
  const top5HitRate = top5Hits / evalQueries.length;

  logger.info('=============================================');
  logger.info('🏆 RAG EVALUATION METRICS REPORT');
  logger.info('=============================================');
  logger.info(`Total Queries: ${evalQueries.length}`);
  logger.info(`Mean Reciprocal Rank (MRR): ${avgMrr.toFixed(3)}`);
  logger.info(`Recall@1 (Top 1 Hit Rate):  ${(top1HitRate * 100).toFixed(1)}%`);
  logger.info(`Recall@5 (Top 5 Hit Rate):  ${(top5HitRate * 100).toFixed(1)}%`);
  logger.info('=============================================');
  
  if (avgMrr > 0.7) {
    logger.info('✅ EXCELLENT PERFORMANCE (MRR > 0.7)');
  } else if (avgMrr > 0.5) {
    logger.info('⚠️ MODERATE PERFORMANCE (MRR 0.5 - 0.7)');
  } else {
    logger.info('❌ POOR PERFORMANCE (MRR < 0.5)');
  }
}

runEval().catch(err => {
  logger.error('Fatal evaluation error', { error: err.message });
  process.exit(1);
});
