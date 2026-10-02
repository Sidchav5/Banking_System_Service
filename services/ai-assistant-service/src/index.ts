import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { config } from './config';
import { createLogger } from '@bankflow/shared';
import { buildBm25Index, isBm25Ready, getBm25IndexSize } from './retrieval/bm25Retrieval';
import { getQdrantClient } from './vectordb/qdrantClient';
import { handleChat, handleClearConversation } from './api/chatHandler';

const logger = createLogger('ai-assistant-service');
const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ── Health Check ──────────────────────────────────────────────────────────────

app.get('/health', async (_req, res) => {
  let qdrantStatus = 'disconnected';
  try {
    const client = getQdrantClient();
    const collections = await client.getCollections();
    qdrantStatus = `connected (${collections.collections.length} collections)`;
  } catch {
    qdrantStatus = 'unavailable';
  }

  res.json({
    status:    'ok',
    service:   config.serviceName,
    version:   '1.0.0',
    phase:     'Day 15 — LLM Generation + /chat endpoint',
    timestamp: new Date().toISOString(),
    bm25: {
      ready:  isBm25Ready(),
      chunks: getBm25IndexSize(),
    },
    qdrant: qdrantStatus,
    geminiKeySet:  !!config.geminiApiKey && config.geminiApiKey !== 'your_gemini_api_key_here',
    cohereKeySet:  !!config.cohereApiKey,
  });
});

// ── Chat Endpoint ─────────────────────────────────────────────────────────────

/**
 * POST /chat
 * Body: { query: string, userId: string, conversationId?: string }
 *
 * Returns:
 * {
 *   conversationId: string,
 *   queryId:        string,
 *   queryType:      string,
 *   answer:         string,
 *   citations:      Citation[],
 *   abstained:      boolean,
 *   debug:          { ... }
 * }
 */
app.post('/chat', handleChat);

/**
 * DELETE /conversations/:conversationId
 * Clears conversation history (new chat).
 */
app.delete('/conversations/:conversationId', handleClearConversation);

/**
 * GET /conversations/:conversationId
 * Return recent conversation messages.
 */
app.get('/conversations/:conversationId', async (req, res) => {
  try {
    const { getConversation } = await import('./api/conversationManager');
    const conv = await getConversation(req.params.conversationId, req.query.userId as string ?? '');
    res.json(conv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Startup ───────────────────────────────────────────────────────────────────

async function start() {
  // Pre-build BM25 index at startup (synchronous after file read)
  try {
    await buildBm25Index(config.chunksFile);
    logger.info('BM25 index ready', { chunks: getBm25IndexSize() });
  } catch (err: any) {
    logger.warn('BM25 index not built at startup', { error: err.message });
    logger.warn('Run: npm run ingest first, then restart');
  }

  app.listen(config.port, () => {
    logger.info(`${config.serviceName} listening on port ${config.port}`, {
      port:          config.port,
      phase:         'Day 15',
      geminiKeySet:  !!config.geminiApiKey && config.geminiApiKey !== 'your_gemini_api_key_here',
      bm25Chunks:    getBm25IndexSize(),
    });
  });
}

start().catch((err) => {
  logger.error('Fatal startup error', { error: err.message });
  process.exit(1);
});
