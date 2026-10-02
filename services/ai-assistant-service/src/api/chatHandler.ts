import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { classifyQuery, requiresRetrieval } from '../queryProcessing/queryRouter';
import { rewriteQuery } from '../queryProcessing/queryRewriter';
import { retrieveByVector } from '../retrieval/vectorRetrieval';
import { retrieveByBm25 } from '../retrieval/bm25Retrieval';
import { reciprocalRankFusion } from '../retrieval/hybridFusion';
import { rerank } from '../retrieval/reranker';
import { buildContext, buildLiveDataContext } from '../context/contextBuilder';
import { deduplicateChunks, maxRelevanceScore, extractCitations } from '../context/sourceTracker';
import { shouldAbstain, buildAbstentionResponse } from '../grounding/abstentionGuard';
import { buildPrompt, formatConversationHistory, ABSTENTION_RESPONSE } from '../llm/promptBuilder';
import { generateResponse } from '../llm/geminiClient';
import { getRecentMessages, appendMessages } from './conversationManager';
import { retrievalConfig } from '../config/retrievalConfig';
import { ChatResponse, Citation } from '../schema/chunk';
import { createLogger } from '@bankflow/shared';

const logger = createLogger('ai-assistant:chat-handler');

// ─── Request / Response Types ─────────────────────────────────────────────────

interface ChatRequest {
  query:           string;
  conversationId?: string;
  userId:          string;
}

interface ChatApiResponse {
  conversationId: string;
  queryId:        string;
  queryType:      string;
  answer:         string;
  citations:      Citation[];
  abstained:      boolean;
  abstentionReason?: string;
  debug?: {
    rewrittenQueries: string[];
    chunksRetrieved:  number;
    chunksAfterRerank: number;
    topScore:         number;
    promptTokens:     number;
    latencyMs:        number;
  };
}

// ─── Main Chat Handler ────────────────────────────────────────────────────────

export async function handleChat(req: Request, res: Response): Promise<void> {
  const start = Date.now();
  const { query, conversationId: reqConvId, userId } = req.body as ChatRequest;
  const queryId        = uuidv4();
  const conversationId = reqConvId ?? uuidv4();

  if (!query?.trim()) {
    res.status(400).json({ error: 'query is required' });
    return;
  }

  if (!userId?.trim()) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  logger.info('Chat request received', {
    queryId, conversationId, userId,
    query: query.substring(0, 100),
  });

  try {
    // ── 1. Route + Rewrite ───────────────────────────────────────────────────
    const queryType = classifyQuery(query);
    logger.debug('Query classified', { queryId, queryType });

    // Hard blocks: skip retrieval entirely
    if (queryType === 'FINANCIAL_ACTION') {
      const response = buildHardBlockResponse(
        conversationId, queryId, queryType,
        "I'm an AI assistant and cannot execute financial transactions. " +
        "To make a transfer or payment, please use the BankFlow app directly via the Transfers or Payments section. " +
        "I'm happy to explain how the process works if that would help.",
        Date.now() - start,
      );
      await appendMessages(conversationId, userId, query, response.answer);
      res.json(response);
      return;
    }

    if (queryType === 'UNSUPPORTED') {
      const response = buildHardBlockResponse(
        conversationId, queryId, queryType,
        "I specialise in banking and BankFlow-related questions. I'm not able to help with that topic, " +
        "but I'm happy to answer any questions about your accounts, payments, or banking concepts!",
        Date.now() - start,
      );
      await appendMessages(conversationId, userId, query, response.answer);
      res.json(response);
      return;
    }

    const rewrittenQueries = await rewriteQuery(query, queryType);
    logger.debug('Query rewritten', { queryId, rewrittenQueries });

    // ── 2. Retrieve (if needed) ──────────────────────────────────────────────
    let allChunks: import('../schema/chunk').RetrievedChunk[] = [];
    let topScore  = 0;

    if (requiresRetrieval(queryType)) {
      // Use primary query + first rewrite for retrieval
      const searchQuery = rewrittenQueries[0];
      const altQuery    = rewrittenQueries[1] ?? searchQuery;

      // Vector + BM25 in parallel
      const [vectorResults, bm25Results] = await Promise.all([
        retrieveByVector(searchQuery, retrievalConfig.vectorTopK).catch((e) => {
          logger.warn('Vector retrieval failed', { error: e.message });
          return [];
        }),
        Promise.resolve(retrieveByBm25(altQuery, retrievalConfig.bm25TopK)),
      ]);

      logger.debug('Retrieved candidates', {
        queryId, vector: vectorResults.length, bm25: bm25Results.length,
      });

      // RRF Fusion
      const fused = reciprocalRankFusion(
        vectorResults, bm25Results, retrievalConfig.fusionTopK,
      );

      // Rerank
      const reranked = await rerank(query, deduplicateChunks(fused), retrievalConfig.rerankTopN);
      allChunks  = reranked.map((r) => r.chunk);
      topScore   = maxRelevanceScore(allChunks);
    }

    // ── 3. Abstention Guard ──────────────────────────────────────────────────
    if (requiresRetrieval(queryType)) {
      const decision = shouldAbstain(topScore, allChunks.length, queryType);
      if (decision.shouldAbstain) {
        const response = {
          conversationId,
          queryId,
          queryType,
          answer:           ABSTENTION_RESPONSE,
          citations:        [] as Citation[],
          abstained:        true,
          abstentionReason: decision.reason,
          debug: {
            rewrittenQueries,
            chunksRetrieved:   allChunks.length,
            chunksAfterRerank: 0,
            topScore,
            promptTokens:      0,
            latencyMs:         Date.now() - start,
          },
        };
        await appendMessages(conversationId, userId, query, ABSTENTION_RESPONSE);
        res.json(response);
        return;
      }
    }

    // ── 4. Build Context ─────────────────────────────────────────────────────
    const ctx = buildContext(allChunks);

    // ── 5. Load Conversation History ─────────────────────────────────────────
    const historyMessages = await getRecentMessages(conversationId, userId, 5);
    const historyText     = formatConversationHistory(historyMessages);

    // ── 6. Assemble Prompt ───────────────────────────────────────────────────
    const { systemPrompt, userMessage, estimatedTokens } = buildPrompt(
      query,
      queryType,
      ctx.contextBlock,
      undefined,    // Live data injected in Day 16 (tool calls)
      historyText,
    );

    // ── 7. Generate Response ─────────────────────────────────────────────────
    let answer: string;
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      // No valid key — return a demo response for testing
      answer = buildDemoAnswer(query, allChunks.length, ctx.sources);
    } else {
      answer = await generateResponse(systemPrompt, userMessage);
    }

    // ── 8. Extract Citations & Save ──────────────────────────────────────────
    const citations = extractCitations(ctx.sources);
    await appendMessages(conversationId, userId, query, answer);

    const latencyMs = Date.now() - start;
    logger.info('Chat response ready', {
      queryId, queryType, latencyMs,
      citations: citations.length,
      chunks:    allChunks.length,
    });

    const response: ChatApiResponse = {
      conversationId,
      queryId,
      queryType,
      answer,
      citations,
      abstained: false,
      debug: {
        rewrittenQueries,
        chunksRetrieved:   allChunks.length,
        chunksAfterRerank: allChunks.length,
        topScore,
        promptTokens:      estimatedTokens,
        latencyMs,
      },
    };

    res.json(response);
  } catch (err: any) {
    logger.error('Chat handler error', { queryId, error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal error processing your question. Please try again.' });
  }
}

// ─── Clear Conversation Handler ───────────────────────────────────────────────

export async function handleClearConversation(req: Request, res: Response): Promise<void> {
  const { conversationId } = req.params;
  if (!conversationId) { res.status(400).json({ error: 'conversationId required' }); return; }

  const { clearConversation } = await import('./conversationManager');
  await clearConversation(conversationId);
  res.json({ success: true, conversationId });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildHardBlockResponse(
  conversationId: string, queryId: string, queryType: string,
  answer: string, latencyMs: number,
): ChatApiResponse {
  return {
    conversationId, queryId, queryType, answer,
    citations: [], abstained: false,
    debug: { rewrittenQueries: [], chunksRetrieved: 0, chunksAfterRerank: 0,
             topScore: 0, promptTokens: 0, latencyMs },
  };
}

function buildDemoAnswer(query: string, chunkCount: number, sources: any[]): string {
  const sourceList = sources.map((s, i) =>
    `  [SOURCE ${i + 1}] ${s.citation.docName} — Page ${s.citation.page}`,
  ).join('\n');

  return [
    `**[Demo Mode — Set GEMINI_API_KEY to enable live responses]**`,
    '',
    `Your question: "${query}"`,
    '',
    `I found ${chunkCount} relevant passage(s) in the BankFlow knowledge base:`,
    sourceList || '  (No matching context found)',
    '',
    'To get real AI-powered answers, set your GEMINI_API_KEY in the .env file and restart the service.',
  ].join('\n');
}
